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
import { DragType } from '../../models/drag-drop'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
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
import {
  IMd3ChangesViewProps,
  md3VisibleChangedFiles,
} from './md3-changes-view'
import {
  IMd3BranchesViewProps,
  IMd3BranchRow,
  IMd3BranchRowHandlers,
  IMd3BranchListHandlers,
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
  md3ChangesFilterActive,
  Md3ChangesFilterId,
  Md3ChangesFilterIds,
  md3FilterChangedFiles,
  md3HistoryCommits,
  md3InboxNotifications,
  md3IncludedFileCount,
  md3MergeAllStatus,
  md3NotificationThreadKey,
} from './md3-destination-adapters'
import {
  getMutedNotificationThreads,
  setNotificationThreadMuted,
} from './md3-inbox-controller'
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
  // The Terminal destination's own context menu, per the contract's
  // `onContextTerminal: this.ctx('terminalMenu')`.
  | 'terminalMenu'

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

/** The shape `md3HistoryCommits` reads its per-commit totals from. */
export interface IMd3HistoryChangeset {
  readonly sha: string | null
  readonly linesAdded: number
  readonly linesDeleted: number
  readonly fileCount: number
}

/**
 * Which commit — if any — the loaded changeset actually describes.
 *
 * The store resets `changesetData` to `{ files: [], linesAdded: 0,
 * linesDeleted: 0 }` the instant a selection changes and fills it in only when
 * `git log --numstat` comes back, so for the whole of that round trip the
 * selected commit's totals are all zero and mean "not read yet". Naming the
 * selected SHA unconditionally handed those zeroes to the row as fact, and the
 * row believed them: the freshly selected commit read "+0 −0 · 0 files" — and
 * kept reading it for good if the read failed, because nothing ever clears the
 * claim. The type checker had nothing to say; both spellings are a string.
 *
 * Two things have to hold before the numbers describe one commit:
 *
 *  - exactly one commit is selected. Select a range and the store loads the
 *    range's combined totals, which attributed to `shas[0]` would report one
 *    commit as having made every change in the span;
 *  - the files have arrived. An empty file list is the only signal the store
 *    offers that the read has not landed — it keeps no loading flag — so a
 *    genuinely empty commit is reported as unknown rather than as zero. That
 *    direction is the safe one: it withholds a number instead of asserting one.
 */
export function md3HistoryChangeset(selection: {
  readonly shas: ReadonlyArray<string>
  readonly changesetData: {
    readonly files: ReadonlyArray<CommittedFileChange>
    readonly linesAdded: number
    readonly linesDeleted: number
  }
}): IMd3HistoryChangeset {
  const { files, linesAdded, linesDeleted } = selection.changesetData
  const describesOneCommit = selection.shas.length === 1 && files.length > 0

  return {
    sha: describesOneCommit ? selection.shas[0] : null,
    linesAdded,
    linesDeleted,
    fileCount: files.length,
  }
}

/**
 * Every address that counts as "me" for the History `Mine` chip.
 *
 * The signed-in accounts' addresses are not the whole answer: commits are
 * authored under `user.email` from the repository's own Git config, which is
 * routinely a different address from the one on the forge account — a work
 * address, a `users.noreply` alias, a per-repository override. With the
 * account list alone the chip filtered a repository's history down to nothing
 * and looked, from the outside, exactly like a repository the user had never
 * committed to.
 */
function historyAuthorEmails(
  state: IRepositoryState,
  accountEmails: ReadonlySet<string>
): ReadonlySet<string> {
  const emails = new Set<string>(accountEmails)
  const author = state.commitAuthor

  if (author !== null && author.email.length > 0) {
    emails.add(author.email.toLowerCase())
  }

  return emails
}

/** Build the History destination's props from the real commit store. */
export function buildMd3HistoryProps(
  context: IMd3ViewContext
): IMd3HistoryViewProps {
  const { dispatcher, repository, state, local } = context
  const selection = state.commitSelection
  const filter = context.bind('history')
  const diffSearch = context.bind('diffSearch')

  const files = selection.changesetData.files

  const commits = md3HistoryCommits({
    shas: state.compareState.commitSHAs,
    commitLookup: state.commitLookup,
    localCommitSHAs: state.localCommitSHAs,
    branchName: currentBranchName(state),
    userEmails: historyAuthorEmails(state, context.userEmails),
    pinnedShas: local.historyPinnedShas,
    changeset: md3HistoryChangeset(selection),
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
    /**
     * Keep the drag-a-commit-onto-a-branch cherry-pick gesture alive.
     *
     * The view makes its rows draggable only when this exists, so without it
     * the gesture is not broken — it is absent, with nothing to notice. The
     * drop targets in the branch list are unchanged and still read
     * `DragType.Commit` off the shared manager, so supplying the same payload
     * the old commit row set is all that is needed.
     *
     * A SHA the lookup has not loaded is dropped rather than faked: cherry-pick
     * needs the commit itself, and a placeholder would fail later and further
     * away from the cause.
     */
    onCommitDragStart: shas => {
      // The old row blurred first so the selection did not stay highlighted
      // under the drag image.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      const dragged = shas
        .map(sha => state.commitLookup.get(sha))
        .filter((commit): commit is Commit => commit !== undefined)
      if (dragged.length > 0) {
        dragAndDropManager.setDragData({
          type: DragType.Commit,
          commits: dragged,
        })
      }
    },
    // The bulk bar's Copy SHAs verb writes the whole scope as one string.
    // Calling `onCopySha` in a loop would overwrite the clipboard once per
    // commit and leave only the last one, so the verb reads this instead — and
    // returns early when it is absent, which is why it silently did nothing.
    onCopyText: text => clipboard.writeText(text),
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

  /**
   * The one diff the Changes selection has actually loaded, which is the only
   * place per-file line totals exist — `git status` reports which files
   * changed, never by how much. A stash selection's diff belongs to a stashed
   * file rather than to a working-directory row, so it lends its counts to
   * nothing here.
   */
  const loadedDiff =
    selectedFile === undefined ||
    changes.selection.kind !== ChangesSelectionKind.WorkingDirectory
      ? null
      : { path: selectedFile.path, diff }

  /**
   * The contract's `visibleChanges`. The view's `files` prop is documented as
   * the rows that survive the query, so the filtering belongs here — handing
   * it the whole working directory left the filter field inert.
   */
  const queried = md3VisibleChangedFiles(
    files,
    search.value,
    search.regexEnabled
  )

  /**
   * The inclusion and status chips, restored to this list.
   *
   * `changesState.fileListFilter` is real repository state with real
   * dispatcher operations behind every one of its switches, and the MD3 list
   * was reading none of it — so a filter set from the existing changed-file
   * list simply did not apply here, and this list offered no way to set one.
   */
  const fileFilter = changes.fileListFilter
  const visibleFiles = md3FilterChangedFiles(queried, fileFilter)
  const filtered = visibleFiles.length !== files.length

  const setFilter = (id: Md3ChangesFilterId, active: boolean) => {
    switch (id) {
      case 'included':
        return dispatcher.setIncludedChangesInCommitFilter(repository, active)
      case 'excluded':
        return dispatcher.setFilterExcludedFiles(repository, active)
      case 'new':
        return dispatcher.setFilterNewFiles(repository, active)
      case 'modified':
        return dispatcher.setFilterModifiedFiles(repository, active)
      case 'deleted':
        return dispatcher.setFilterDeletedFiles(repository, active)
    }
  }

  const anyChipActive = Md3ChangesFilterIds.some(id =>
    md3ChangesFilterActive(fileFilter, id)
  )

  const resetFilters = () => {
    search.onClear()
    for (const id of Md3ChangesFilterIds) {
      if (md3ChangesFilterActive(fileFilter, id)) {
        setFilter(id, false)
      }
    }
  }

  return {
    files: md3ChangedFiles(visibleFiles, loadedDiff),
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
    filterChips: Md3ChangesFilterIds.map(id => ({
      id,
      label: t(`md3.changes.filter.${id}` as const),
      active: md3ChangesFilterActive(fileFilter, id),
      onToggle: () => setFilter(id, !md3ChangesFilterActive(fileFilter, id)),
    })),
    // Offered only while something is actually hiding rows. A clean working
    // tree has nothing to reset, and an empty state that offers to reset
    // filters that are not set sends the user to press a button that changes
    // nothing.
    onResetFilters: filtered || anyChipActive ? resetFilters : undefined,
    // The bulk bar's own verbs. Copy and discard are the row context menu's
    // existing commands reached for a whole scope; discard arrives here only
    // after the view's destructive gate has been completed.
    onCopyPaths: text => clipboard.writeText(text),
    onDiscardFiles: paths => {
      const targets = paths.flatMap(path => {
        const file = filesByPath.get(path)
        return file === undefined ? [] : [file]
      })
      if (targets.length > 0) {
        void dispatcher.discardChanges(repository, targets)
      }
    },
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
    // Not disabled for a missing summary. The view answers an empty summary by
    // opening the composer, where the requirement is explained and the field
    // takes focus; disabling the button here made that documented path
    // unreachable and left a keyboard user a dead control with no explanation.
    // What genuinely blocks a commit is a commit already running, or nothing
    // staged to commit.
    commitDisabled: state.isCommitting || md3IncludedFileCount(files) === 0,
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
/**
 * The row actions that need something only `App` can do — a dialog, a
 * multi-step operation, or moving the reader to another destination.
 *
 * They are parameters rather than dispatcher calls made here because each one
 * ends somewhere outside this list: Compare lands the reader on History,
 * Checkout in a new worktree opens a dialog, and Merge and delete runs a
 * multi-commit operation with its own progress surface.
 *
 * Every one of them is optional on the view, and the view draws no menu row for
 * an action it has no handler for. That is the right behaviour and it is also
 * why all five were absent from the running app without anything going red:
 * five row-menu items the branches test proves are *reachable* when handlers
 * exist, and which nothing was handing in.
 */
export interface IMd3BranchAppActions {
  readonly onRebaseBranch: (branch: Branch) => void
}

export function buildMd3BranchesProps(
  context: IMd3ViewContext,
  onNewBranch: () => void,
  onDeleteBranch: (branch: Branch) => void,
  onRenameBranch: (branch: Branch) => void,
  onOpenPullRequest: (branch: Branch) => void,
  appActions: IMd3BranchAppActions
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
      // The state word lands verbatim in the row's detail line, so it is copy
      // and has to come from the catalogue: a literal 'open' here renders an
      // English word inside a Cantonese sentence.
      {
        number: pullRequest.pullRequestNumber,
        state: t('md3.adapters.branch.pullRequestOpen'),
      },
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
    // Rebase, and only rebase.
    //
    // Compare, Checkout in a new worktree, Merge and delete and Bulk delete
    // look equally absent from this list, and are not: each is a carry-over
    // command already contributed to `branchRowMenu` by the shell's menu
    // extensions. Handling them here as well would draw every one of them
    // twice in the same menu. Rebase is the one the carry-over catalogue never
    // claimed, so the row menu has never offered it at all.
    onRebaseBranch: row => {
      const branch = resolve(row)
      if (branch !== undefined) {
        appActions.onRebaseBranch(branch)
      }
    },
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
    mergeAll: md3MergeAllStatus(state.mergeAllState),
    canMergeAll: branchesState.defaultBranch !== null,
    currentBranchName: current,
    onOpenRowMenu: row => context.openMenu('branchRowMenu', row.name),
    rowHandlers,
    onOpenListMenu: () => context.openMenu('listMenu'),
    listHandlers,
    sortOrder: local.branchSortOrder,
    hasHiddenBranches: hidden.size > 0,
    // The bulk bar's Copy names verb writes one string for the whole scope.
    // `onCopyBranchName` writes a single name, so using it in a loop would
    // leave the clipboard holding only whichever branch happened to be last.
    onCopyText: text => clipboard.writeText(text),
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

/** Branch types the Branches chips filter on, exported for the host's menus. */
export const Md3BranchTypes = BranchType

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export interface IMd3InboxContext {
  readonly dispatcher: Dispatcher
  readonly notifications: ReadonlyArray<INotificationEntry>
  /**
   * Repository source labels keyed by id. Build them with
   * {@link md3NotificationSourceName}: the row's detail line renders
   * `owner/repo`, and a bare folder name is the same type and silently wrong.
   */
  readonly repositoryNames: ReadonlyMap<number, string>
  readonly onOpenHistory: () => void
  readonly onOpenAutomations: () => void
  readonly onExport: (request: IMd3InboxExportRequest) => void
  /** Redraw after a mute, which is view state rather than store state. */
  readonly onMutedThreadsChanged?: () => void

  /**
   * The signed-in account's notification inbox on its own provider, or `null`
   * when nobody is signed in.
   *
   * It has to be derived from the account rather than hard-coded, because an
   * Enterprise account's inbox is on its own host and sending that user to
   * github.com would be both wrong and a small privacy leak. `null` is honest:
   * the list menu simply does not offer the row, rather than offering one that
   * opens the wrong site.
   */
  readonly gitHubInboxURL?: string | null
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
      mutedThreads: getMutedNotificationThreads(),
    }),
    onSetMuted: (notification, muted) => {
      const entry = byId.get(notification.id)
      if (entry === undefined) {
        return
      }
      setNotificationThreadMuted(md3NotificationThreadKey(entry), muted)
      context.onMutedThreadsChanged?.()
    },
    // Undefined rather than a no-op when there is no account: the list menu
    // draws the row only when a handler exists, which is exactly the behaviour
    // wanted here — no signed-in account, no inbox to open, no row.
    onOpenGitHubInbox:
      context.gitHubInboxURL == null
        ? undefined
        : () => void shell.openExternal(context.gitHubInboxURL as string),
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
    // Every row's turn count, start time and elapsed time comes from that
    // session's own transcript, so the list needs all of them — not only the
    // selected session's.
    conversationFor: session => context.conversationFor(session.path),
    access: {
      read: context.readAccess,
      commit: context.commitAccess,
      push: context.pushAccess,
    },
  })

  // The contract opens on the first session's conversation rather than on an
  // empty pane, and a remembered path whose worktree has since been deleted
  // must not leave the pane blank either — in both cases nothing is selected
  // through no choice of the reader's.
  const selectedSessionId =
    sessions.find(session => session.id === context.selectedSessionId)?.id ??
    (sessions.length === 0 ? null : sessions[0].id)

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
