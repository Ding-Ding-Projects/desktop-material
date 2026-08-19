import { clipboard } from 'electron'
import * as Path from 'path'

// Type-only wherever the value is never needed at run time. The dispatcher in
// particular pulls the whole application store in behind it, and this module is
// deliberately importable from a node-only test that has neither.
import type { Dispatcher } from '../dispatcher'
import type { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { PreferencesTab } from '../../models/preferences'
import { FetchType } from '../../models/fetch'
import type { CommitOneLine } from '../../models/commit'
import type { WorkingDirectoryFileChange } from '../../models/status'
import { ChangesSelectionKind, RepositorySectionTab } from '../../lib/app-state'
import type { IRepositoryState } from '../../lib/app-state'
import type { MenuEvent } from '../../main-process/menu/menu-event'
import { revealInFileManager } from '../../lib/app-shell'
import {
  getMd3ViewPreferences,
  setMd3CommitSortOrder,
  setMd3GroupChangesByFolder,
  setMd3GroupCommitsByDay,
  stepMd3DiffContextLines,
} from '../../lib/md3-view-preferences'
import { Md3MenuCommand } from './md3-menu-specs'

/**
 * What every command in the MD3 menu contract actually does.
 *
 * The design prototype's menu items call `toast()` and stop, because there was
 * no application behind the prototype. There is one behind this, so each of the
 * contract's commands is bound here to the surface the app already owns — the
 * same dialog the classic chrome opened, the same dispatcher call the old
 * toolbar made, the same main-menu event the menu bar fires.
 *
 * The map is a `Record` over the `Md3MenuCommand` union rather than a `switch`
 * with a `default`. That is the whole point of its shape: adding a command to
 * the union and forgetting to bind it is a compile error, where a `switch` with
 * a fallthrough would simply do nothing at run time and nothing would go red.
 *
 * Three routes appear below, and `Md3MenuCommandRoutes` records which one each
 * command takes so the choice is auditable rather than buried in a closure:
 *
 * - `menu` — the app's existing main-menu event, which is what opens the real
 *   Create branch, Create tag, Rename branch, Clone, Add local repository and
 *   Repository settings dialogs. A second dialog is never built for a command
 *   that already has one.
 * - `direct` — a dispatcher call or a popup this module makes itself.
 * - `reveal` — the command acts on a row (a notification, an agent session, a
 *   terminal buffer) that only the destination view owning that list can
 *   identify. Until that view is wired there is no row to act on, so the
 *   command takes the user to the surface that owns those rows. Each one
 *   carries the reason in `Md3MenuCommandRoutes`, and the row context below is
 *   where the wiring agent supplies the missing identity.
 */

/**
 * The row a row-scoped command acts on, as far as the host can identify it.
 *
 * Everything here is optional and everything here is honest: `App` fills in
 * what the app store genuinely knows (the selected commit, the selected
 * working-directory files) and leaves the rest undefined, because the
 * notification centre and the agent-session panel own their selections
 * privately. A destination view supplies its own row when it is wired, and the
 * commands below start acting on rows instead of revealing the list.
 */
export interface IMd3MenuRowContext {
  /** The notification an inbox row menu was opened for. */
  readonly notificationId?: string

  /** That notification's link, when it has one. */
  readonly notificationUrl?: string

  /** The agent session an agent row menu was opened for. */
  readonly agentSessionId?: string

  /** The workflow run a run menu was opened for. */
  readonly workflowRunId?: number
}

/** Everything a bound command needs from the application. */
export interface IMd3MenuCommandEnvironment {
  readonly dispatcher: Dispatcher

  /** The selected repository, or `null` when the selection is not one. */
  readonly repository: Repository | null

  /** That repository's state, or `null`. */
  readonly state: IRepositoryState | null

  /**
   * The app-wide "hide whitespace in the changes diff" setting.
   *
   * It lives on the application state rather than the repository's, so the
   * toggle below cannot read it out of `state` and has to be handed the live
   * value — flipping a value read from the wrong place is how a toggle starts
   * disagreeing with the hint printed beside it.
   */
  readonly hideWhitespaceInChangesDiff: boolean

  /**
   * Runs one of the application's existing main-menu events.
   *
   * This is the route that opens the dialogs the classic chrome opened —
   * create branch, create tag, rename branch, clone, add local repository,
   * repository settings — rather than a second implementation of each.
   */
  readonly runMenuEvent: (event: MenuEvent) => void

  /** Opens the app-wide Settings on an exact tab. */
  readonly showPreferences: (tab: PreferencesTab) => void

  /** Reveals one of the Repository Tools hub's tools. */
  readonly showRepositoryTool: (tool: 'terminal' | 'line-authorship') => void

  /** Opens the notification centre panel. */
  readonly openNotificationCentre: () => void

  /** Reveals the agent-sessions list in the repository sidebar. */
  readonly showAgentSessions: () => void

  /** Starts a cherry-pick of the given commits, exactly as the history list does. */
  readonly cherryPick: (
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) => void

  /** The row a row-scoped command was opened for, as far as it is known. */
  readonly rows?: IMd3MenuRowContext
}

/** How a command reaches real behaviour. */
export type Md3MenuCommandRouteKind = 'menu' | 'direct' | 'reveal'

export interface IMd3MenuCommandRoute {
  readonly kind: Md3MenuCommandRouteKind

  /**
   * Why this route, in one line. Required for `reveal`, where the reason is the
   * whole justification for not acting; kept for the others because a reader
   * auditing the table should not have to open the action to learn where a
   * command goes.
   */
  readonly note: string
}

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

/** The files the changes list currently has selected, or none. */
function selectedFiles(
  env: IMd3MenuCommandEnvironment
): ReadonlyArray<WorkingDirectoryFileChange> {
  const changes = env.state?.changesState
  if (changes === undefined) {
    return []
  }
  if (changes.selection.kind !== ChangesSelectionKind.WorkingDirectory) {
    return []
  }
  const ids = new Set(changes.selection.selectedFileIDs)
  return changes.workingDirectory.files.filter(file => ids.has(file.id))
}

/** The first selected file, which is what a single-file command acts on. */
function selectedFile(
  env: IMd3MenuCommandEnvironment
): WorkingDirectoryFileChange | null {
  const files = selectedFiles(env)
  return files.length > 0 ? files[0] : null
}

/** The commits the history list currently has selected, newest first. */
function selectedCommits(env: IMd3MenuCommandEnvironment) {
  const state = env.state
  if (state === null) {
    return []
  }
  return state.commitSelection.shas
    .map(sha => state.commitLookup.get(sha))
    .filter((commit): commit is NonNullable<typeof commit> => commit != null)
}

/** The file extension of a path, including the dot, or null when it has none. */
function fileExtension(path: string): string | null {
  const name = path.split(/[\\/]/).pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot > 0 && dot < name.length - 1 ? name.slice(dot) : null
}

/** The absolute path of a repository-relative file. */
function absolutePath(repository: Repository, path: string): string {
  return Path.join(repository.path, path)
}

/** Run `action` only when a repository is selected. */
function withRepository(
  env: IMd3MenuCommandEnvironment,
  action: (repository: Repository) => void
) {
  if (env.repository !== null) {
    action(env.repository)
  }
}

// ---------------------------------------------------------------------------
// The bindings
// ---------------------------------------------------------------------------

/**
 * Every command's real action.
 *
 * A `Record` over the union, so a new command with no binding cannot compile.
 */
export const Md3MenuCommandActions: Readonly<
  Record<Md3MenuCommand, (env: IMd3MenuCommandEnvironment) => void>
> = {
  // -- Repository and remote ------------------------------------------------

  commitAndPushAllChanges: env =>
    withRepository(env, repository =>
      env.dispatcher.oneClickCommitAndPush(repository)
    ),

  commitAndPush: env =>
    withRepository(env, repository =>
      env.dispatcher.oneClickCommitAndPush(repository)
    ),

  commitAndPushWithCopilotMessage: env =>
    withRepository(env, repository => {
      // The message is generated from what is actually staged, then the user
      // reviews it in the commit box — generating and committing in one blind
      // step would commit a message nobody read.
      env.dispatcher.generateCommitMessage(repository, selectedFiles(env))
      env.dispatcher.setCommitMessageFocus(true)
    }),

  fetchOrigin: env =>
    withRepository(env, repository =>
      env.dispatcher.fetch(repository, FetchType.UserInitiatedTask)
    ),

  fetchRepository: env =>
    withRepository(env, repository =>
      env.dispatcher.fetch(repository, FetchType.UserInitiatedTask)
    ),

  pullOrigin: env =>
    withRepository(env, repository => env.dispatcher.pull(repository)),

  pullRepository: env =>
    withRepository(env, repository => env.dispatcher.pull(repository)),

  forcePush: env => env.runMenuEvent('force-push'),

  buildAndRun: env => env.runMenuEvent('build-and-run'),

  pullAllRepositories: env =>
    env.dispatcher.showPopup({ type: PopupType.PullAllRepositories }),

  // "Merge all branches" is per repository and names its mode, so it opens the
  // branches variant of the existing dialog rather than the worktrees one.
  mergeAllBranches: env =>
    withRepository(env, repository =>
      env.dispatcher.showPopup({
        type: PopupType.MergeAll,
        repository,
        mode: 'branches',
      })
    ),

  // -- Settings -------------------------------------------------------------

  openAutomationSettings: env => env.showPreferences(PreferencesTab.Automation),

  openCopilotPreferences: env => env.showPreferences(PreferencesTab.Copilot),

  openGitSettings: env => env.showPreferences(PreferencesTab.Git),

  openIntegrationSettings: env =>
    env.showPreferences(PreferencesTab.Integrations),

  openNotificationSettings: env =>
    env.showPreferences(PreferencesTab.Notifications),

  openUndoHistoryManager: env =>
    env.dispatcher.showPopup({ type: PopupType.SettingsHistory }),

  // -- Accounts -------------------------------------------------------------

  addGitHubAccount: env => env.dispatcher.showDotComSignInDialog(),

  // The self-hosted sign-in is the same dialog the enterprise route opens: it
  // asks for the host first, which is exactly what a self-hosted GitLab needs.
  addGitLabSelfHostedAccount: env =>
    env.dispatcher.showEnterpriseSignInDialog(),

  // -- History presentation -------------------------------------------------

  sortCommitsNewestFirst: () => setMd3CommitSortOrder('newest'),

  sortCommitsOldestFirst: () => setMd3CommitSortOrder('oldest'),

  groupCommitsByDay: () =>
    setMd3GroupCommitsByDay(!getMd3ViewPreferences().groupCommitsByDay),

  // The contract's row is instructional — its hint is "⇧click" — so it takes
  // the reader to the list where the gesture works rather than inventing a
  // selection nobody asked for.
  selectMultipleCommits: env =>
    withRepository(env, repository =>
      env.dispatcher.changeRepositorySection(
        repository,
        RepositorySectionTab.History
      )
    ),

  // -- Diff presentation ----------------------------------------------------

  showUnifiedDiff: env => env.dispatcher.onShowSideBySideDiffChanged(false),

  showSplitDiff: env => env.dispatcher.onShowSideBySideDiffChanged(true),

  hideWhitespaceChanges: env =>
    withRepository(env, repository =>
      env.dispatcher.onHideWhitespaceInChangesDiffChanged(
        !env.hideWhitespaceInChangesDiff,
        repository
      )
    ),

  increaseDiffContextLines: () =>
    stepMd3DiffContextLines(getMd3ViewPreferences().diffContextLines),

  // -- File actions ---------------------------------------------------------

  openFileInExternalEditor: env =>
    withRepository(env, repository => {
      const file = selectedFile(env)
      if (file === null) {
        // With no file picked, the editor opens on the repository itself,
        // which is what the classic "Open in external editor" command does.
        env.runMenuEvent('open-external-editor')
        return
      }
      env.dispatcher.openInExternalEditor(
        absolutePath(repository, file.path),
        repository
      )
    }),

  copyFilePath: env =>
    withRepository(env, repository => {
      const file = selectedFile(env)
      clipboard.writeText(
        file === null ? repository.path : absolutePath(repository, file.path)
      )
    }),

  openFileHistory: env =>
    withRepository(env, repository => {
      const file = selectedFile(env)
      if (file === null) {
        return
      }
      env.dispatcher.showPopup({
        type: PopupType.FileHistory,
        repository,
        path: file.path,
      })
    }),

  openBlame: env =>
    withRepository(env, repository => {
      const file = selectedFile(env)
      if (file === null) {
        // Blame is per file; with none selected the hub's line-authorship tool
        // is the surface that lets one be chosen.
        env.showRepositoryTool('line-authorship')
        return
      }
      env.dispatcher.showPopup({
        type: PopupType.FileHistory,
        repository,
        path: file.path,
        initialView: 'blame',
      })
    }),

  discardFileChanges: env =>
    withRepository(env, repository => {
      const files = selectedFiles(env)
      if (files.length === 0) {
        return
      }
      env.dispatcher.showPopup({
        type: PopupType.ConfirmDiscardChanges,
        repository,
        files,
      })
    }),

  ignoreFile: env =>
    withRepository(env, repository => {
      const file = selectedFile(env)
      if (file !== null) {
        env.dispatcher.appendIgnoreRule(repository, file.path)
      }
    }),

  ignoreFileType: env =>
    withRepository(env, repository => {
      const file = selectedFile(env)
      const extension = file === null ? null : fileExtension(file.path)
      if (extension !== null) {
        env.dispatcher.appendIgnoreRule(repository, `*${extension}`)
      } else if (file !== null) {
        // A file with no extension has no type to ignore, so the file itself is
        // the only honest rule to write.
        env.dispatcher.appendIgnoreRule(repository, file.path)
      }
    }),

  revealInFileManager: env =>
    withRepository(env, repository => {
      const file = selectedFile(env)
      revealInFileManager(repository, file === null ? '' : file.path)
    }),

  // -- Commit actions -------------------------------------------------------

  revertCommit: env =>
    withRepository(env, repository => {
      const [commit] = selectedCommits(env)
      if (commit !== undefined) {
        env.dispatcher.revertCommit(repository, commit)
      }
    }),

  cherryPickCommit: env =>
    withRepository(env, repository => {
      const commits = selectedCommits(env)
      if (commits.length > 0) {
        env.cherryPick(repository, commits)
      }
    }),

  createTagAtCommit: env =>
    withRepository(env, repository => {
      const [commit] = selectedCommits(env)
      if (commit === undefined) {
        return
      }
      env.dispatcher.showCreateTagDialog(
        repository,
        commit.sha,
        env.state?.localTags ?? null
      )
    }),

  resetToCommit: env =>
    withRepository(env, repository => {
      const [commit] = selectedCommits(env)
      if (commit !== undefined) {
        // The dispatcher's own reset gate decides whether the warning dialog is
        // shown, so this cannot reset past a pushed commit unannounced.
        env.dispatcher.resetToCommit(repository, commit)
      }
    }),

  copyCommitSha: env => {
    const [commit] = selectedCommits(env)
    if (commit !== undefined) {
      clipboard.writeText(commit.sha)
    }
  },

  viewCommitOnGitHub: env => {
    const htmlURL = env.repository?.gitHubRepository?.htmlURL ?? null
    const [commit] = selectedCommits(env)
    if (htmlURL !== null && commit !== undefined) {
      env.dispatcher.openInBrowser(`${htmlURL}/commit/${commit.sha}`)
    }
  },

  // -- Changes list ---------------------------------------------------------

  includeAllFiles: env =>
    withRepository(env, repository =>
      env.dispatcher.changeIncludeAllFiles(repository, true)
    ),

  excludeAllFiles: env =>
    withRepository(env, repository =>
      env.dispatcher.changeIncludeAllFiles(repository, false)
    ),

  stashAllChanges: env => env.runMenuEvent('stash-all-changes'),

  discardAllChanges: env => env.runMenuEvent('discard-all-changes'),

  groupChangesByFolder: () =>
    setMd3GroupChangesByFolder(!getMd3ViewPreferences().groupChangesByFolder),

  // -- Branch actions -------------------------------------------------------

  mergeBranchIntoCurrent: env => env.runMenuEvent('merge-branch'),

  rebaseBranchOntoCurrent: env => env.runMenuEvent('rebase-branch'),

  openPullRequest: env => env.runMenuEvent('open-pull-request'),

  renameBranch: env => env.runMenuEvent('rename-branch'),

  deleteBranch: env => env.runMenuEvent('delete-branch'),

  // -- Actions --------------------------------------------------------------

  rerunAllJobs: env =>
    withRepository(env, repository =>
      env.dispatcher.changeRepositorySection(
        repository,
        RepositorySectionTab.Actions
      )
    ),

  rerunFailedJobs: env =>
    withRepository(env, repository =>
      env.dispatcher.changeRepositorySection(
        repository,
        RepositorySectionTab.Actions
      )
    ),

  cancelRun: env =>
    withRepository(env, repository =>
      env.dispatcher.changeRepositorySection(
        repository,
        RepositorySectionTab.Actions
      )
    ),

  dispatchWorkflow: env =>
    withRepository(env, repository =>
      env.dispatcher.changeRepositorySection(
        repository,
        RepositorySectionTab.Actions
      )
    ),

  viewRawLogs: env => env.dispatcher.showPopup({ type: PopupType.LogHistory }),

  // -- Repository list ------------------------------------------------------

  changeRepositoryAlias: env =>
    withRepository(env, repository =>
      env.dispatcher.showPopup({
        type: PopupType.ChangeRepositoryAlias,
        repository,
      })
    ),

  moveRepositoryToGroup: env =>
    withRepository(env, repository =>
      env.dispatcher.showPopup({
        type: PopupType.ChangeRepositoryGroupName,
        repository,
      })
    ),

  removeRepositoryFromList: env => env.runMenuEvent('remove-repository'),

  // -- Compose --------------------------------------------------------------

  writeCommitMessageWithCopilot: env =>
    withRepository(env, repository => {
      env.dispatcher.generateCommitMessage(repository, selectedFiles(env))
      env.dispatcher.setCommitMessageFocus(true)
    }),

  addCoAuthors: env =>
    withRepository(env, repository => {
      env.dispatcher.setShowCoAuthoredBy(repository, true)
      env.dispatcher.setCommitMessageFocus(true)
    }),

  // -- Agent access ---------------------------------------------------------

  configureAgentReadAccess: env =>
    env.showPreferences(PreferencesTab.AgentAccess),

  configureAgentCommitAccess: env =>
    env.showPreferences(PreferencesTab.AgentAccess),

  configureAgentPushAccess: env =>
    env.showPreferences(PreferencesTab.AgentAccess),

  openAgentSessionLog: env => env.showAgentSessions(),

  // -- Inbox ----------------------------------------------------------------

  markNotificationRead: env => {
    const id = env.rows?.notificationId
    if (id === undefined) {
      env.openNotificationCentre()
      return
    }
    env.dispatcher.markNotificationRead(id)
  },

  markNotificationUnread: env => {
    const id = env.rows?.notificationId
    if (id === undefined) {
      env.openNotificationCentre()
      return
    }
    env.dispatcher.markNotificationUnread(id)
  },

  openNotificationInBrowser: env => {
    const url = env.rows?.notificationUrl
    if (url === undefined) {
      env.openNotificationCentre()
      return
    }
    env.dispatcher.openInBrowser(url)
  },

  // Muting a thread is a delivery rule rather than an act on one row, and the
  // rules live in the notification automations dialog.
  muteNotificationThread: env =>
    env.dispatcher.showPopup({ type: PopupType.NotificationAutomations }),

  deleteNotification: env => {
    const id = env.rows?.notificationId
    if (id === undefined) {
      env.openNotificationCentre()
      return
    }
    env.dispatcher.deleteNotification(id)
  },

  // -- Agents ---------------------------------------------------------------

  resumeAgentSession: env => env.showAgentSessions(),

  pauseAgentSession: env => env.showAgentSessions(),

  duplicateAgentSession: env => env.showAgentSessions(),

  deleteAgentSession: env => env.showAgentSessions(),

  // -- Terminal -------------------------------------------------------------

  copyTerminalSelection: env => {
    const selection = document.getSelection()?.toString() ?? ''
    if (selection.length > 0) {
      clipboard.writeText(selection)
      return
    }
    env.showRepositoryTool('terminal')
  },

  pasteIntoTerminal: env => env.showRepositoryTool('terminal'),

  clearTerminalOutput: env => env.showRepositoryTool('terminal'),

  splitShell: env => env.showRepositoryTool('terminal'),

  openSystemTerminal: env =>
    withRepository(env, repository =>
      env.dispatcher.openShell(repository.path)
    ),

  newShellSession: env =>
    withRepository(env, repository =>
      env.dispatcher.openShell(repository.path)
    ),

  // -- Search ---------------------------------------------------------------
  //
  // These three act on the shell's own search state, which no host can reach.
  // `Md3Shell` intercepts them before the host's handler runs and performs the
  // state change itself; the bindings here are what happens for a caller that
  // renders a menu spec outside the shell — the guide entry, at least, is the
  // same surface either way.

  toggleSearchRegexMode: () => {},

  clearSearchField: () => {},

  showRegexGuideEntry: () => {},
}

/**
 * How each command is bound, as a hand-written record.
 *
 * The actions above say what happens; this says why, and is what a reviewer
 * reads to find the commands that reveal a surface instead of acting on a row.
 * It is a separate `Record` over the same union, so a command can no more
 * escape being documented than it can escape being bound.
 */
export const Md3MenuCommandRoutes: Readonly<
  Record<Md3MenuCommand, IMd3MenuCommandRoute>
> = {
  commitAndPushAllChanges: {
    kind: 'direct',
    note: 'One-click commit and push on the selected repository.',
  },
  commitAndPush: {
    kind: 'direct',
    note: 'One-click commit and push on the selected repository.',
  },
  commitAndPushWithCopilotMessage: {
    kind: 'direct',
    note: 'Generates the message, then focuses the commit box for review.',
  },
  fetchOrigin: {
    kind: 'direct',
    note: 'User-initiated fetch of the selected repository.',
  },
  fetchRepository: {
    kind: 'direct',
    note: 'User-initiated fetch of the selected repository.',
  },
  pullOrigin: {
    kind: 'direct',
    note: 'Pulls the selected repository from its remote.',
  },
  pullRepository: {
    kind: 'direct',
    note: 'Pulls the selected repository from its remote.',
  },
  forcePush: {
    kind: 'menu',
    note: 'The existing force-push route, which keeps its confirmation gate.',
  },
  buildAndRun: { kind: 'menu', note: 'The existing build-and-run command.' },
  pullAllRepositories: {
    kind: 'direct',
    note: 'The existing Pull all repositories dialog.',
  },
  mergeAllBranches: {
    kind: 'direct',
    note: 'Opens the existing Merge all dialog on its branches mode.',
  },
  openAutomationSettings: {
    kind: 'direct',
    note: 'Opens Settings on its Automation tab.',
  },
  openCopilotPreferences: {
    kind: 'direct',
    note: 'Opens Settings on its Copilot tab.',
  },
  openGitSettings: { kind: 'direct', note: 'Opens Settings on its Git tab.' },
  openIntegrationSettings: {
    kind: 'direct',
    note: 'Settings, Integrations tab.',
  },
  openNotificationSettings: {
    kind: 'direct',
    note: 'Settings, Notifications tab.',
  },
  openUndoHistoryManager: {
    kind: 'direct',
    note: 'The existing settings history dialog.',
  },
  addGitHubAccount: { kind: 'direct', note: 'The dot-com sign-in dialog.' },
  addGitLabSelfHostedAccount: {
    kind: 'direct',
    note: 'The enterprise/self-hosted sign-in dialog, which asks for the host.',
  },
  sortCommitsNewestFirst: {
    kind: 'direct',
    note: 'Persisted MD3 view preference, read back by the menu hint.',
  },
  sortCommitsOldestFirst: {
    kind: 'direct',
    note: 'Persisted MD3 view preference, read back by the menu hint.',
  },
  groupCommitsByDay: {
    kind: 'direct',
    note: 'Persisted MD3 view preference, read back by the menu hint.',
  },
  selectMultipleCommits: {
    kind: 'reveal',
    note: 'Instructional row (its hint is ⇧click): reveals the commit list.',
  },
  showUnifiedDiff: {
    kind: 'direct',
    note: 'The app-wide side-by-side setting.',
  },
  showSplitDiff: { kind: 'direct', note: 'The app-wide side-by-side setting.' },
  hideWhitespaceChanges: {
    kind: 'direct',
    note: 'The app-wide hide-whitespace setting for the changes diff.',
  },
  increaseDiffContextLines: {
    kind: 'direct',
    note: 'Persisted MD3 view preference, wrapping at its maximum.',
  },
  openFileInExternalEditor: {
    kind: 'direct',
    note: 'Opens the selected file, or the repository when none is selected.',
  },
  copyFilePath: {
    kind: 'direct',
    note: 'Copies the selected file path to the clipboard.',
  },
  openFileHistory: {
    kind: 'direct',
    note: 'The existing file history dialog for the selected file.',
  },
  openBlame: {
    kind: 'direct',
    note: 'The file history dialog opened on its blame tab.',
  },
  discardFileChanges: {
    kind: 'direct',
    note: 'The existing discard confirmation for the selected files.',
  },
  ignoreFile: {
    kind: 'direct',
    note: 'Appends the selected path to .gitignore.',
  },
  ignoreFileType: {
    kind: 'direct',
    note: 'Appends *.ext to .gitignore, or the path when there is no extension.',
  },
  revealInFileManager: {
    kind: 'direct',
    note: 'Reveals the selected file, or the repository root.',
  },
  revertCommit: {
    kind: 'direct',
    note: 'Reverts the commit the history list has selected.',
  },
  cherryPickCommit: {
    kind: 'direct',
    note: 'Starts the existing cherry-pick flow with the selected commits.',
  },
  createTagAtCommit: {
    kind: 'direct',
    note: 'The existing Create tag dialog at the selected commit.',
  },
  resetToCommit: {
    kind: 'direct',
    note: 'The existing reset route, which keeps its own warning gate.',
  },
  copyCommitSha: {
    kind: 'direct',
    note: 'Copies the selected commit SHA to the clipboard.',
  },
  viewCommitOnGitHub: {
    kind: 'direct',
    note: 'Opens the commit on the forge in the browser.',
  },
  includeAllFiles: {
    kind: 'direct',
    note: 'Includes every changed file in the next commit.',
  },
  excludeAllFiles: {
    kind: 'direct',
    note: 'Excludes every changed file from the next commit.',
  },
  stashAllChanges: { kind: 'menu', note: 'The existing stash-all command.' },
  discardAllChanges: {
    kind: 'menu',
    note: 'The existing discard-all command and its confirmation.',
  },
  groupChangesByFolder: {
    kind: 'direct',
    note: 'Persisted MD3 view preference, read back by the menu hint.',
  },
  mergeBranchIntoCurrent: {
    kind: 'menu',
    note: 'The existing Merge branch dialog.',
  },
  rebaseBranchOntoCurrent: {
    kind: 'menu',
    note: 'The existing Rebase branch dialog.',
  },
  openPullRequest: { kind: 'menu', note: 'The existing pull request flow.' },
  renameBranch: { kind: 'menu', note: 'The existing Rename branch dialog.' },
  deleteBranch: { kind: 'menu', note: 'The existing Delete branch dialog.' },
  rerunAllJobs: {
    kind: 'reveal',
    note: 'Needs the run the menu was opened for; reveals the Actions pane, which reruns from its own row controls.',
  },
  rerunFailedJobs: {
    kind: 'reveal',
    note: 'Needs the run the menu was opened for; reveals the Actions pane, which reruns from its own row controls.',
  },
  cancelRun: {
    kind: 'reveal',
    note: 'Needs the run the menu was opened for; reveals the Actions pane, which cancels from its own row controls.',
  },
  dispatchWorkflow: {
    kind: 'reveal',
    note: 'Needs the workflow the menu was opened for; reveals the Actions pane and its dispatch dialog.',
  },
  viewRawLogs: {
    kind: 'direct',
    note: 'The existing log history dialog.',
  },
  changeRepositoryAlias: {
    kind: 'direct',
    note: 'The existing Change repository alias dialog.',
  },
  moveRepositoryToGroup: {
    kind: 'direct',
    note: 'The existing repository group dialog.',
  },
  removeRepositoryFromList: {
    kind: 'menu',
    note: 'The existing Remove repository command and its confirmation.',
  },
  writeCommitMessageWithCopilot: {
    kind: 'direct',
    note: 'Generates a commit message from the included files.',
  },
  addCoAuthors: {
    kind: 'direct',
    note: 'Shows the co-authors field and focuses the commit box.',
  },
  configureAgentReadAccess: {
    kind: 'direct',
    note: 'Opens Settings on its Agent access tab.',
  },
  configureAgentCommitAccess: {
    kind: 'direct',
    note: 'Opens Settings on its Agent access tab.',
  },
  configureAgentPushAccess: {
    kind: 'direct',
    note: 'Opens Settings on its Agent access tab.',
  },
  openAgentSessionLog: {
    kind: 'reveal',
    note: 'Needs the session the menu was opened for; reveals the agent-sessions list.',
  },
  markNotificationRead: {
    kind: 'direct',
    note: 'Marks the supplied notification read, or opens the centre when no row is known.',
  },
  markNotificationUnread: {
    kind: 'direct',
    note: 'Marks the supplied notification unread, or opens the centre when no row is known.',
  },
  openNotificationInBrowser: {
    kind: 'direct',
    note: "Opens the supplied notification's link, or the centre when no row is known.",
  },
  muteNotificationThread: {
    kind: 'direct',
    note: 'Muting is a delivery rule: the notification automations dialog owns it.',
  },
  deleteNotification: {
    kind: 'direct',
    note: 'Deletes the supplied notification, or opens the centre when no row is known.',
  },
  resumeAgentSession: {
    kind: 'reveal',
    note: 'Needs the session the menu was opened for; reveals the agent-sessions list.',
  },
  pauseAgentSession: {
    kind: 'reveal',
    note: 'Needs the session the menu was opened for; reveals the agent-sessions list.',
  },
  duplicateAgentSession: {
    kind: 'reveal',
    note: 'Needs the session the menu was opened for; reveals the agent-sessions list.',
  },
  deleteAgentSession: {
    kind: 'reveal',
    note: 'Needs the session the menu was opened for; reveals the agent-sessions list.',
  },
  copyTerminalSelection: {
    kind: 'direct',
    note: 'Copies the current selection to the clipboard, or reveals the terminal when nothing is selected.',
  },
  pasteIntoTerminal: {
    kind: 'reveal',
    note: 'The terminal owns its input buffer; reveals the terminal tool.',
  },
  clearTerminalOutput: {
    kind: 'reveal',
    note: 'The terminal owns its output buffer; reveals the terminal tool.',
  },
  splitShell: {
    kind: 'reveal',
    note: 'The terminal owns its panes; reveals the terminal tool.',
  },
  openSystemTerminal: {
    kind: 'direct',
    note: "Opens the configured shell at the repository's path.",
  },
  newShellSession: {
    kind: 'direct',
    note: "Opens another session of the configured shell at the repository's path.",
  },
  toggleSearchRegexMode: {
    kind: 'direct',
    note: "Shell state: Md3Shell flips the global search's own regex mode.",
  },
  clearSearchField: {
    kind: 'direct',
    note: 'Shell state: Md3Shell clears the global search field.',
  },
  showRegexGuideEntry: {
    kind: 'direct',
    note: "Shell state: Md3Shell opens the contract's regex guide menu.",
  },
}

/** Run a menu command against the application. */
export function runMd3MenuCommand(
  command: Md3MenuCommand,
  env: IMd3MenuCommandEnvironment
): void {
  Md3MenuCommandActions[command](env)
}

/**
 * The commands `Md3Shell` performs itself, before the host sees them.
 *
 * They act on the shell's own search state, which is not reachable from a
 * host: a search field's value, its regex mode, and which overlay is open.
 */
export const Md3ShellOwnedCommands: ReadonlyArray<Md3MenuCommand> = [
  'toggleSearchRegexMode',
  'clearSearchField',
  'showRegexGuideEntry',
]

/** Whether `Md3Shell` handles this command itself. */
export function isMd3ShellOwnedCommand(command: Md3MenuCommand): boolean {
  return Md3ShellOwnedCommands.includes(command)
}
