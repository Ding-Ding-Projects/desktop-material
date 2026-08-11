/**
 * Builders for the four store-backed destination views.
 *
 * History, Changes, Branches and Inbox all read from state the app store
 * already holds, so their props can be assembled synchronously during a render
 * of `App`. This module does that assembly: it takes the real repository
 * state, the real dispatcher and the shell's search bindings, and returns the
 * exact props interface each view exports.
 *
 * Every handler here reaches a real dispatcher operation. Where a view offers
 * a command the app genuinely has no operation for, the handler is omitted
 * rather than wired to something that silently does nothing — a dead control
 * is the decorative-UI failure this project forbids outright.
 */

import { t } from '../../lib/i18n'
import { clipboard, shell } from 'electron'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { Commit } from '../../models/commit'
import { IRepositoryState } from '../../lib/app-state'
import { TipState } from '../../models/tip'
import { CommittedFileChange } from '../../models/status'
import { WorkingDirectoryFileChange } from '../../models/status'
import { ChangesSelectionKind } from '../../lib/app-state'
import { IAheadBehind } from '../../models/branch'
import { INotificationEntry } from '../../models/notification-centre'
import { IAgentSession } from '../../models/agent-session'
import { IAgentSessionConversation } from '../agent-sessions/agent-session-conversation'
import { IBranchVisibilityState } from '../../lib/branch-visibility'

import { IMd3HistoryViewProps, Md3HistoryFilterId } from './md3-history-view'
import { IMd3ChangesViewProps } from './md3-changes-view'
import {
  IMd3BranchesViewProps,
  IMd3BranchRow,
  IMd3BranchRowHandlers,
  IMd3BranchListHandlers,
  IMd3MergeAllStatus,
  Md3BranchChip,
  Md3BranchSortOrder,
} from './md3-branches-view'
import { IMd3InboxViewProps, IMd3InboxExportRequest } from './md3-inbox-view'
import { IMd3AgentsViewProps, Md3AgentAccessTopic } from './md3-agents-view'
import { Md3MenuPermission } from './md3-menu-specs'
import {
  md3AgentConversation,
  md3AgentSessions,
  md3BranchRows,
  md3ChangedFiles,
  md3CommittedFileTabs,
  md3DiffEmptyMessage,
  md3DiffLines,
  md3HistoryCommits,
  md3InboxNotifications,
  md3IncludedFileCount,
} from './md3-destination-adapters'
import { IMd3SearchBinding } from './md3-shell'

// ---------------------------------------------------------------------------
// View-local state
// ---------------------------------------------------------------------------

/**
 * The toggles the destinations own themselves.
 *
 * These are real user-visible settings with no owner in the app store — the
 * commit-graph switch, the diff-wrap switch, which History chips are lit, which
 * branch chips are lit. `App` holds one of these and hands it down, so the
 * views stay controlled and a test can put any of them into any state.
 */
export interface IMd3LocalViewState {
  readonly historyFilters: ReadonlyArray<Md3HistoryFilterId>
  readonly historyDetailsOpen: boolean
  readonly historyPinnedShas: ReadonlySet<string>
  readonly showCommitGraph: boolean
  readonly wrapDiffLines: boolean
  readonly branchChips: ReadonlyArray<Md3BranchChip>
  readonly branchSortOrder: Md3BranchSortOrder
  readonly branchVisibility: IBranchVisibilityState
  readonly selectedBranchName: string | null
}

export const defaultMd3LocalViewState: IMd3LocalViewState = {
  historyFilters: [],
  historyDetailsOpen: false,
  historyPinnedShas: new Set<string>(),
  showCommitGraph: true,
  wrapDiffLines: false,
  branchChips: [],
  branchSortOrder: 'recent',
  branchVisibility: { pinned: [], hidden: [], solo: null },
  selectedBranchName: null,
}

/** Everything the builders need that is not a view's own concern. */
export interface IMd3ViewContext {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly state: IRepositoryState
  readonly local: IMd3LocalViewState
  readonly setLocal: (patch: Partial<IMd3LocalViewState>) => void
  /** Bind one of the shell's eleven search fields. */
  readonly bind: (
    field: 'history' | 'changes' | 'branches' | 'diffSearch'
  ) => IMd3SearchBinding
  /** Opens one of the shell's menu overlays with the host's own extensions. */
  readonly openMenu: (menu: Md3ViewMenu, payload?: string) => void
  /** The signed-in accounts' e-mail addresses, lower-cased. */
  readonly userEmails: ReadonlySet<string>
  /** Ahead/behind per branch, as far as the ahead/behind store knows it. */
  readonly aheadBehind: ReadonlyMap<string, IAheadBehind>
  /** The app-wide absolute-dates preference, which History's toggle writes. */
  readonly preferAbsoluteDates: boolean
}

/** The menus a destination view can raise. */
export type Md3ViewMenu =
  | 'listMenu'
  | 'rowMenu'
  | 'fileMenu'
  | 'changesMenu'
  | 'changeRowMenu'
  | 'branchRowMenu'
  | 'searchMenu'
  | 'diffOptions'
  | 'paneMenu'

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function currentBranchName(state: IRepositoryState): string {
  const tip = state.branchesState.tip
  return tip.kind === TipState.Valid ? tip.branch.name : ''
}

function commitFor(state: IRepositoryState, sha: string): Commit | undefined {
  return state.commitLookup.get(sha)
}

/** Build the History destination's props from the real commit store. */
export function buildMd3HistoryProps(
  context: IMd3ViewContext
): IMd3HistoryViewProps {
  const { dispatcher, repository, state, local } = context
  const selection = state.commitSelection
  const filter = context.bind('history')
  const diffSearch = context.bind('diffSearch')

  const primarySha = selection.shas.length > 0 ? selection.shas[0] : null
  const files = selection.changesetData.files

  const commits = md3HistoryCommits({
    shas: state.compareState.commitSHAs,
    commitLookup: state.commitLookup,
    localCommitSHAs: state.localCommitSHAs,
    branchName: currentBranchName(state),
    userEmails: context.userEmails,
    pinnedShas: local.historyPinnedShas,
    changeset: {
      sha: primarySha,
      linesAdded: selection.changesetData.linesAdded,
      linesDeleted: selection.changesetData.linesDeleted,
      fileCount: files.length,
    },
  })

  const selectFile = (path: string) => {
    const file = files.find(candidate => candidate.path === path)
    if (file !== undefined) {
      void dispatcher.changeFileSelection(repository, file)
    }
  }

  return {
    commits,
    selectedShas: selection.shas,
    onSelectionChanged: shas => {
      dispatcher.changeCommitSelection(repository, shas, true)
      void dispatcher.loadChangedFilesForCurrentSelection(repository)
    },
    filterText: filter.value,
    filterRegexEnabled: filter.regexEnabled,
    onFilterTextChanged: filter.onChange,
    onFilterRegexToggled: filter.onToggleRegex,
    onOpenFilterRegexBuilder: () => filter.onOpenBuilder(),
    onFilterContextMenu: () => context.openMenu('searchMenu'),
    activeFilters: local.historyFilters,
    onFiltersChanged: filters => context.setLocal({ historyFilters: filters }),
    showCommitGraph: local.showCommitGraph,
    onShowCommitGraphChanged: value =>
      context.setLocal({ showCommitGraph: value }),
    showAbsoluteDates: context.preferAbsoluteDates,
    onShowAbsoluteDatesChanged: value =>
      dispatcher.setPreferAbsoluteDates(value),
    diff: {
      filePath: selection.file?.path ?? '',
      wrapLines: local.wrapDiffLines,
      onToggleWrap: () =>
        context.setLocal({ wrapDiffLines: !local.wrapDiffLines }),
      onOpenDiffOptions: () => context.openMenu('diffOptions'),
      onOpenFileMenu: () => context.openMenu('fileMenu'),
      searchValue: diffSearch.value,
      searchRegexEnabled: diffSearch.regexEnabled,
      onSearchChange: diffSearch.onChange,
      onSearchClear: diffSearch.onClear,
      onToggleSearchRegex: diffSearch.onToggleRegex,
      onOpenSearchBuilder: diffSearch.onOpenBuilder,
      onSearchContextMenu: () => context.openMenu('searchMenu'),
      fileTabs: md3CommittedFileTabs(files),
      activeFileTabPath: selection.file?.path,
      onSelectFileTab: selectFile,
      lines: md3DiffLines(selection.diff),
      emptyMessage: md3DiffEmptyMessage(selection.diff),
    },
    detailsOpen: local.historyDetailsOpen,
    onDetailsOpenChanged: open =>
      context.setLocal({ historyDetailsOpen: open }),
    onOpenListMenu: () => context.openMenu('listMenu'),
    onOpenRowMenu: sha => context.openMenu('rowMenu', sha),
    onOpenFileMenu: path => {
      selectFile(path)
      context.openMenu('fileMenu', path)
    },
    onTogglePin: sha => {
      const pinned = new Set(local.historyPinnedShas)
      if (pinned.has(sha)) {
        pinned.delete(sha)
      } else {
        pinned.add(sha)
      }
      context.setLocal({ historyPinnedShas: pinned })
    },
    onCopySha: sha => clipboard.writeText(sha),
    onViewOnGitHub: sha => {
      const gitHubRepository = repository.gitHubRepository
      if (gitHubRepository !== null) {
        void shell.openExternal(
          `${gitHubRepository.htmlURL}/commit/${encodeURIComponent(sha)}`
        )
      }
    },
    onRevertCommit: sha => {
      const commit = commitFor(state, sha)
      if (commit !== undefined) {
        void dispatcher.revertCommit(repository, commit)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

/** Build the Changes destination's props from the real working directory. */
export function buildMd3ChangesProps(
  context: IMd3ViewContext,
  compose: {
    readonly authorInitials: string
    readonly authorName: string
    readonly onOpenComposer: (push: boolean) => void
    readonly onCommit: () => void
    readonly onCommitAndPush: () => void
    readonly onDraftWithCopilot: () => void
    readonly onAddCoAuthors: () => void
  },
  banners?: React.ReactNode
): IMd3ChangesViewProps {
  const { dispatcher, repository, state, local } = context
  const changes = state.changesState
  const workingDirectory = changes.workingDirectory
  const files = workingDirectory.files
  const search = context.bind('changes')
  const diffSearch = context.bind('diffSearch')

  const selectedPaths =
    changes.selection.kind === ChangesSelectionKind.WorkingDirectory
      ? changes.selection.selectedFileIDs.flatMap(id => {
          const file = files.find(candidate => candidate.id === id)
          return file === undefined ? [] : [file.path]
        })
      : []

  const diff =
    changes.selection.kind === ChangesSelectionKind.WorkingDirectory
      ? changes.selection.diff
      : changes.selection.selectedStashedFileDiff

  const filesByPath = new Map<string, WorkingDirectoryFileChange>(
    files.map(file => [file.path, file])
  )
  const selectedFile =
    selectedPaths.length > 0 ? filesByPath.get(selectedPaths[0]) : undefined

  return {
    files: md3ChangedFiles(files),
    totalFileCount: files.length,
    includedFileCount: md3IncludedFileCount(files),
    selectedPaths,
    onSelectionChanged: paths => {
      const selected = paths.flatMap(path => {
        const file = filesByPath.get(path)
        return file === undefined ? [] : [file]
      })
      void dispatcher.selectWorkingDirectoryFiles(repository, selected)
    },
    onIncludeChanged: (path, included) => {
      const file = filesByPath.get(path)
      if (file !== undefined) {
        void dispatcher.changeFileIncluded(repository, file, included)
      }
    },
    onIncludeAllChanged: included => {
      void dispatcher.changeIncludeAllFiles(repository, included)
    },
    onOpenRowMenu: path => context.openMenu('changeRowMenu', path),
    onFileContextMenu: path => context.openMenu('changeRowMenu', path),
    onOpenChangesMenu: () => context.openMenu('changesMenu'),
    onListContextMenu: () => context.openMenu('changesMenu'),
    searchValue: search.value,
    searchRegexEnabled: search.regexEnabled,
    onSearchChange: search.onChange,
    onSearchClear: search.onClear,
    onToggleSearchRegex: search.onToggleRegex,
    onOpenSearchBuilder: search.onOpenBuilder,
    onSearchContextMenu: () => context.openMenu('searchMenu'),
    authorInitials: compose.authorInitials,
    authorName: compose.authorName,
    commitSummary: changes.commitMessage.summary,
    commitDescription: changes.commitMessage.description ?? '',
    onCommitSummaryChanged: summary => {
      void dispatcher.setCommitMessage(repository, {
        ...changes.commitMessage,
        summary,
      })
    },
    onCommitDescriptionChanged: description => {
      void dispatcher.setCommitMessage(repository, {
        ...changes.commitMessage,
        description,
      })
    },
    branchName: currentBranchName(state),
    onCommit: compose.onCommit,
    onCommitAndPush: compose.onCommitAndPush,
    onOpenComposer: compose.onOpenComposer,
    onDraftWithCopilot: compose.onDraftWithCopilot,
    onAddCoAuthors: compose.onAddCoAuthors,
    commitDisabled:
      state.isCommitting ||
      md3IncludedFileCount(files) === 0 ||
      changes.commitMessage.summary.trim().length === 0,
    banners,
    diff: {
      filePath: selectedFile?.path ?? '',
      wrapLines: local.wrapDiffLines,
      onToggleWrap: () =>
        context.setLocal({ wrapDiffLines: !local.wrapDiffLines }),
      onOpenDiffOptions: () => context.openMenu('diffOptions'),
      onOpenFileMenu: () => context.openMenu('fileMenu'),
      searchValue: diffSearch.value,
      searchRegexEnabled: diffSearch.regexEnabled,
      onSearchChange: diffSearch.onChange,
      onSearchClear: diffSearch.onClear,
      onToggleSearchRegex: diffSearch.onToggleRegex,
      onOpenSearchBuilder: diffSearch.onOpenBuilder,
      onSearchContextMenu: () => context.openMenu('searchMenu'),
      lines: md3DiffLines(diff),
      emptyMessage: md3DiffEmptyMessage(diff),
    },
    onIncludeHunk: () => {
      // Including the selected file whole is the honest whole-file equivalent
      // of the contract's per-hunk control: the line-level selection the
      // dispatcher's `changeFileLineSelection` needs comes from the diff
      // gutter, which this pane does not yet expose.
      if (selectedFile !== undefined) {
        void dispatcher.changeFileIncluded(repository, selectedFile, true)
      }
    },
    includeHunkDisabled: selectedFile === undefined,
  }
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/** Build the Branches destination's props from the real branches store. */
export function buildMd3BranchesProps(
  context: IMd3ViewContext,
  onNewBranch: () => void,
  onDeleteBranch: (branch: Branch) => void,
  onRenameBranch: (branch: Branch) => void,
  onOpenPullRequest: (branch: Branch) => void
): IMd3BranchesViewProps {
  const { dispatcher, repository, state, local } = context
  const branchesState = state.branchesState
  const search = context.bind('branches')
  const current = currentBranchName(state)

  const byName = new Map<string, Branch>(
    branchesState.allBranches.map(branch => [branch.name, branch])
  )

  const pullRequests = new Map<
    string,
    { readonly number: number; readonly state: string }
  >(
    branchesState.openPullRequests.map(pullRequest => [
      pullRequest.head.ref,
      { number: pullRequest.pullRequestNumber, state: 'open' },
    ])
  )

  const worktreeBranches = new Set(
    state.worktrees.flatMap(worktree =>
      worktree.branch === undefined || worktree.branch === null
        ? []
        : [worktree.branch]
    )
  )

  const visibility = local.branchVisibility
  const solo = visibility.solo
  const hidden = new Set(
    solo === null
      ? visibility.hidden
      : branchesState.allBranches
          .map(branch => branch.name)
          .filter(name => name !== solo && name !== current)
  )

  const rows = md3BranchRows({
    branches: branchesState.allBranches,
    currentBranchName: current,
    aheadBehind: context.aheadBehind,
    pinnedBranches: new Set(visibility.pinned),
    hiddenBranches: hidden,
    worktreeBranches,
    pullRequests,
    hasForge: repository.gitHubRepository !== null,
  })

  const sorted = sortBranchRows(rows, local.branchSortOrder)

  const resolve = (row: IMd3BranchRow): Branch | undefined =>
    byName.get(row.name)

  const rowHandlers: IMd3BranchRowHandlers = {
    onMergeBranch: row => {
      const branch = resolve(row)
      if (branch !== undefined) {
        void dispatcher.mergeBranch(repository, branch, null)
      }
    },
    onOpenPullRequest: row => {
      const branch = resolve(row)
      if (branch !== undefined) {
        onOpenPullRequest(branch)
      }
    },
    onViewBranchOnForge: row => {
      const gitHubRepository = repository.gitHubRepository
      if (gitHubRepository !== null) {
        void shell.openExternal(
          `${gitHubRepository.htmlURL}/tree/${encodeURIComponent(row.name)}`
        )
      }
    },
    onViewPullRequestOnForge: row => {
      const gitHubRepository = repository.gitHubRepository
      if (gitHubRepository !== null && row.pullRequest !== undefined) {
        void shell.openExternal(
          `${gitHubRepository.htmlURL}/pull/${row.pullRequest.number}`
        )
      }
    },
    onCopyBranchName: row => clipboard.writeText(row.name),
    onRenameBranch: row => {
      const branch = resolve(row)
      if (branch !== undefined) {
        onRenameBranch(branch)
      }
    },
    onTogglePin: row => {
      const pinned = new Set(visibility.pinned)
      if (pinned.has(row.name)) {
        pinned.delete(row.name)
      } else {
        pinned.add(row.name)
      }
      context.setLocal({
        branchVisibility: { ...visibility, pinned: [...pinned] },
      })
    },
    onHideBranch: row => {
      const next = new Set(visibility.hidden)
      next.add(row.name)
      context.setLocal({
        branchVisibility: { ...visibility, hidden: [...next] },
      })
    },
    onSoloBranch: row => {
      context.setLocal({
        branchVisibility: {
          ...visibility,
          solo: visibility.solo === row.name ? null : row.name,
        },
      })
    },
    onRestoreVisibility: () => {
      context.setLocal({
        branchVisibility: { pinned: visibility.pinned, hidden: [], solo: null },
      })
    },
    onSwitchToWorktree: row => {
      const worktree = state.worktrees.find(
        candidate => candidate.branch === row.name
      )
      if (worktree !== undefined) {
        void dispatcher.switchWorktree(repository, worktree)
      }
    },
    onDeleteBranch: row => {
      const branch = resolve(row)
      if (branch !== undefined) {
        onDeleteBranch(branch)
      }
    },
  }

  const listHandlers: IMd3BranchListHandlers = {
    onSortByName: () => context.setLocal({ branchSortOrder: 'name' }),
    onSortByRecent: () => context.setLocal({ branchSortOrder: 'recent' }),
    onShowPullRequests: () => void dispatcher.refreshPullRequests(repository),
    onFetchRemoteBranches: () => void dispatcher.refreshRepository(repository),
    onRestoreVisibility: rowHandlers.onRestoreVisibility,
  }

  return {
    branches: sorted,
    filterText: search.value,
    onFilterTextChanged: search.onChange,
    regexEnabled: search.regexEnabled,
    onToggleRegex: search.onToggleRegex,
    onOpenRegexBuilder: search.onOpenBuilder,
    activeChips: local.branchChips,
    onToggleChip: chip =>
      context.setLocal({
        branchChips: local.branchChips.includes(chip)
          ? local.branchChips.filter(entry => entry !== chip)
          : [...local.branchChips, chip],
      }),
    onResetFilters: () => {
      context.setLocal({ branchChips: [] })
      search.onClear()
    },
    selectedBranchName: local.selectedBranchName,
    onSelectBranch: row => context.setLocal({ selectedBranchName: row.name }),
    onCheckoutBranch: row => {
      const branch = resolve(row)
      if (branch !== undefined) {
        void dispatcher.checkoutBranch(repository, branch)
      }
    },
    onNewBranch,
    onMergeAll: () => {
      void dispatcher.mergeAllIntoDefaultBranch(repository, 'branches')
    },
    mergeAll: mergeAllStatus(state),
    canMergeAll: branchesState.defaultBranch !== null,
    currentBranchName: current,
    onOpenRowMenu: row => context.openMenu('branchRowMenu', row.name),
    rowHandlers,
    onOpenListMenu: () => context.openMenu('listMenu'),
    listHandlers,
    sortOrder: local.branchSortOrder,
    hasHiddenBranches: hidden.size > 0,
  }
}

function sortBranchRows(
  rows: ReadonlyArray<IMd3BranchRow>,
  order: Md3BranchSortOrder
): ReadonlyArray<IMd3BranchRow> {
  if (order === 'name') {
    return [...rows].sort((left, right) => left.name.localeCompare(right.name))
  }
  // `recent` is the order the branches store already produced, which is the
  // reflog-derived recency Desktop computes; re-sorting it here would replace a
  // real ordering with an alphabetical one wearing its name.
  return rows
}

function mergeAllStatus(state: IRepositoryState): IMd3MergeAllStatus | null {
  const mergeAll = state.mergeAllState
  if (mergeAll === null) {
    return null
  }
  // The store reports one result per branch it has finished with, so the
  // completed count is that list's length rather than a separate counter.
  const completed = mergeAll.results.length
  return {
    phase: mergeAll.phase,
    currentBranch: mergeAll.currentBranch,
    completed,
    total: completed + (mergeAll.currentBranch === null ? 0 : 1),
  }
}

/** Branch types the Branches chips filter on, exported for the host's menus. */
export const Md3BranchTypes = BranchType

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export interface IMd3InboxContext {
  readonly dispatcher: Dispatcher
  readonly notifications: ReadonlyArray<INotificationEntry>
  readonly repositoryNames: ReadonlyMap<number, string>
  readonly onOpenHistory: () => void
  readonly onOpenAutomations: () => void
  readonly onExport: (request: IMd3InboxExportRequest) => void
}

/** Build the Inbox destination's props from the real notification centre. */
export function buildMd3InboxProps(
  context: IMd3InboxContext
): IMd3InboxViewProps {
  const { dispatcher } = context
  const byId = new Map(
    context.notifications.map(entry => [entry.id, entry] as const)
  )

  return {
    notifications: md3InboxNotifications({
      notifications: context.notifications,
      repositoryNames: context.repositoryNames,
    }),
    onOpen: notification => {
      const entry = byId.get(notification.id)
      if (entry === undefined) {
        return
      }
      void dispatcher.markNotificationRead(entry.id)
      const action = entry.action
      if (action === undefined) {
        return
      }
      if (action.kind === 'open-repository') {
        void dispatcher.openRepositoryRemoteManager(
          action.repositoryId,
          entry.id
        )
        return
      }
      void shell.openExternal(action.url)
    },
    onSetRead: (ids, read) => void dispatcher.setNotificationsRead(ids, read),
    onDelete: ids => void dispatcher.deleteNotifications(ids),
    onMarkAllRead: () => void dispatcher.markAllNotificationsRead(),
    onUndoLastChange: () => void dispatcher.undoLastNotificationChange(),
    onOpenExternal: notification => {
      if (notification.externalUrl !== undefined) {
        void shell.openExternal(notification.externalUrl)
      }
    },
    onOpenAutomations: () => context.onOpenAutomations(),
    onOpenHistory: context.onOpenHistory,
    onExport: context.onExport,
    onCopyDetails: text => clipboard.writeText(text),
  }
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export interface IMd3AgentsContext {
  readonly sessions: ReadonlyArray<IAgentSession>
  readonly selectedSessionId: string | null
  readonly conversationFor: (
    sessionId: string
  ) => IAgentSessionConversation | null
  readonly runnerAvailable: (session: IAgentSession) => boolean
  readonly readAccess: Md3MenuPermission
  readonly commitAccess: Md3MenuPermission
  readonly pushAccess: Md3MenuPermission
  readonly onSelectSession: (sessionId: string) => void
  readonly onNewSession: () => void
  readonly onPauseSession: (sessionId: string) => void
  readonly onResumeSession: (sessionId: string) => void
  readonly onSendInstruction: (sessionId: string, instruction: string) => void
  readonly onOpenSessionLog: (sessionId: string) => void
  readonly onDuplicateSession: (sessionId: string) => void
  readonly onDeleteSession: (sessionId: string) => void
  readonly onConfigureAgentAccess: (topic: Md3AgentAccessTopic) => void
}

/** Build the Agents destination's props from the real worktree fleet. */
export function buildMd3AgentsProps(
  context: IMd3AgentsContext
): IMd3AgentsViewProps {
  const sessions = md3AgentSessions({
    sessions: context.sessions,
    runnerAvailable: context.runnerAvailable,
  })

  const selectedSessionId = context.selectedSessionId
  const conversation =
    selectedSessionId === null
      ? null
      : md3AgentConversation(
          selectedSessionId,
          context.conversationFor(selectedSessionId)
        )

  return {
    sessions,
    selectedSessionId,
    conversation,
    agentReadAccess: context.readAccess,
    agentCommitAccess: context.commitAccess,
    agentPushAccess: context.pushAccess,
    onSelectSession: context.onSelectSession,
    onNewSession: context.onNewSession,
    onPauseSession: context.onPauseSession,
    onResumeSession: context.onResumeSession,
    onSendInstruction: context.onSendInstruction,
    onOpenSessionLog: context.onOpenSessionLog,
    onDuplicateSession: context.onDuplicateSession,
    onDeleteSession: context.onDeleteSession,
    onConfigureAgentAccess: context.onConfigureAgentAccess,
  }
}

/** The label the Inbox export uses when the host writes the file. */
export const Md3InboxExportName = () => t('md3.inbox.exportName')

/** Files a commit touched, for a host building the file menu. */
export function md3CommitFiles(
  state: IRepositoryState
): ReadonlyArray<CommittedFileChange> {
  return state.commitSelection.changesetData.files
}
