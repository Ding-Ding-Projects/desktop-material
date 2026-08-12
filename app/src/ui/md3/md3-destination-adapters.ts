/**
 * The adapter layer between the application's real state and the MD3
 * destination views.
 *
 * Every function here is a pure mapping from something the app store, the Git
 * stores or the API stores already hold onto the shape one of the eight
 * destination views asks for. Nothing in this module invents a value: where a
 * datum genuinely does not exist yet — a diff that has not loaded, an
 * ahead/behind count Git has not reported — the mapping produces the view's
 * own honest empty state rather than a plausible-looking number.
 *
 * Keeping the mapping pure is what makes it checkable. `app.tsx` supplies the
 * handlers, which reach the dispatcher; this module supplies the data, and a
 * test can hand it a hand-built `IRepositoryState` and assert the rows without
 * a running application.
 */

import { t, TranslationKey } from '../../lib/i18n'
import { formatRelative } from '../../lib/format-relative'
import { caseInsensitiveCompare, compare } from '../../lib/compare'

import { Commit } from '../../models/commit'
import { Branch, BranchType, IAheadBehind } from '../../models/branch'
import {
  AppFileStatusKind,
  CommittedFileChange,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { DiffType, IDiff, ITextDiffData } from '../../models/diff/diff-data'
import { DiffLineType } from '../../models/diff/diff-line'
import {
  ILocalRepositoryState,
  Repository,
  RepositoryUpstreamState,
  nameOf,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import {
  INotificationEntry,
  NotificationCentreKind,
} from '../../models/notification-centre'
import { IAgentSession } from '../../models/agent-session'
import { getCodingAgent } from '../../lib/agent-sessions'
import {
  IAgentSessionConversation,
  AgentSessionConversationRole,
} from '../agent-sessions/agent-session-conversation'
import {
  IActionsJob,
  IActionsJobStep,
  ActionsJobStatus,
  ActionsJobConclusion,
} from '../../lib/actions-jobs'
import { IAPIWorkflowRun } from '../../lib/api'
import { getRepositorySyncSummary } from '../repositories-list/repository-sync-summary'
import { IFileListFilterState } from '../../lib/app-state'
import { applyFilterOptions } from '../changes/filter-changes-logic'

import { IMd3DiffFileTab, IMd3DiffLine } from './md3-diff-pane'
import { IMd3HistoryCommit, Md3CommitKind } from './md3-history-view'
import { IMd3ChangedFile, Md3ChangeStatus } from './md3-changes-view'
import {
  IMd3BranchRow,
  IMd3MergeAllStatus,
  Md3BranchGroup,
} from './md3-branches-view'
import { IMd3InboxNotification, Md3InboxTone } from './md3-inbox-view'
import { IMd3RepositoryRow } from './md3-repositories-view'
import {
  IMd3AgentConversation,
  IMd3AgentSession,
  IMd3AgentTurn,
  Md3AgentSessionState,
  Md3AgentTurnRole,
} from './md3-agents-view'
import { Md3MenuPermission } from './md3-menu-specs'
import {
  IMd3ActionsJob,
  IMd3ActionsRun,
  IMd3ActionsStep,
  Md3ActionsStatus,
  md3ActionsConclusionLabel,
} from './md3-actions-view'
import { MaterialSymbolName } from '../lib/material-symbol'

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * "3 hours ago" for a real instant.
 *
 * `formatRelative` takes a signed millisecond offset, so a past commit is a
 * negative one. Passing the raw timestamp would render every commit as a date
 * fifty-six years in the future, which is the kind of wrong that reads as
 * plausible until somebody looks twice.
 */
export function md3RelativeTime(date: Date, now: number = Date.now()): string {
  return formatRelative(date.getTime() - now)
}

/** The absolute rendering the `absoluteDates` toggle switches rows to. */
export function md3AbsoluteTime(date: Date): string {
  return date.toLocaleString()
}

/** Midnight, in the viewer's own timezone, of the day `time` falls on. */
function startOfLocalDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * The day heading a commit row groups under.
 *
 * The contract's headings read `Today`, `Yesterday` and then a date, and the
 * two named ones are what a reader actually scans for. Rendering today's
 * commits under a bare `10 Aug 2026` is not wrong so much as useless: the whole
 * point of the heading is to say how recent the block below it is, and a date
 * makes the reader work that out from the calendar.
 *
 * `now` is threaded through rather than read here so a test can pin the day
 * boundary; the comparison is on local calendar days, so a commit at 23:50
 * yesterday and one at 00:10 today land under different headings even though
 * they are twenty minutes apart.
 */
export function md3DayLabel(date: Date, now: number = Date.now()): string {
  const today = startOfLocalDay(now)
  const day = startOfLocalDay(date.getTime())

  if (day === today) {
    return t('md3.adapters.day.today')
  }

  if (day === startOfLocalDay(today - 1)) {
    return t('md3.adapters.day.yesterday')
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * A duration in the `1m 04s` shape the Actions view renders.
 *
 * Returns an empty string when either end is missing, because a run that has
 * not started has no duration and "0s" would claim it finished instantly.
 */
export function md3Duration(
  startedAt: Date | string | null | undefined,
  completedAt: Date | string | null | undefined
): string {
  const start = toDate(startedAt)
  const end = toDate(completedAt)
  if (start === null || end === null) {
    return ''
  }
  const seconds = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 1000)
  )
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

// ---------------------------------------------------------------------------
// Diffs
// ---------------------------------------------------------------------------

function isTextual(diff: IDiff): diff is IDiff & ITextDiffData {
  return diff.kind === DiffType.Text || diff.kind === DiffType.LargeText
}

function lineKind(type: DiffLineType): IMd3DiffLine['kind'] {
  switch (type) {
    case DiffLineType.Add:
      return 'add'
    case DiffLineType.Delete:
      return 'delete'
    case DiffLineType.Hunk:
      return 'hunk'
    case DiffLineType.Context:
      return 'context'
  }
}

/**
 * Flatten a loaded diff into the pane's line rows.
 *
 * A diff the app cannot render as text — an image, a binary, a submodule
 * pointer, or one Git refused outright — produces no lines at all, and the
 * pane shows the empty message the caller supplies. Emitting a fabricated
 * "binary file changed" row would put a line in a grid whose line numbers mean
 * nothing.
 */
export function md3DiffLines(diff: IDiff | null): ReadonlyArray<IMd3DiffLine> {
  if (diff === null || !isTextual(diff)) {
    return []
  }

  const lines = new Array<IMd3DiffLine>()
  let index = 0
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      lines.push({
        id: `${index}`,
        kind: lineKind(line.type),
        // The stored text keeps git's leading +/-/space marker; the grid draws
        // its own gutter, so the marker would render twice.
        text: line.type === DiffLineType.Hunk ? line.text : line.text.slice(1),
        oldLineNumber: line.oldLineNumber ?? undefined,
        newLineNumber: line.newLineNumber ?? undefined,
      })
      index++
    }
  }
  return lines
}

/** The line the diff pane shows when there is nothing to render. */
export function md3DiffEmptyMessage(diff: IDiff | null): string {
  if (diff === null) {
    return t('md3.adapters.diff.none')
  }
  switch (diff.kind) {
    case DiffType.Text:
    case DiffType.LargeText:
      return diff.hunks.length === 0
        ? t('md3.adapters.diff.noChanges')
        : t('md3.adapters.diff.none')
    case DiffType.Image:
      return t('md3.adapters.diff.image')
    case DiffType.Binary:
      return t('md3.adapters.diff.binary')
    case DiffType.Submodule:
      return t('md3.adapters.diff.submodule')
    case DiffType.Unrenderable:
      return t('md3.adapters.diff.unrenderable')
  }
}

function basename(path: string): string {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return separator === -1 ? path : path.slice(separator + 1)
}

/** History's file strip, built from the selected commit's changeset. */
export function md3CommittedFileTabs(
  files: ReadonlyArray<CommittedFileChange>
): ReadonlyArray<IMd3DiffFileTab> {
  return files.map(file => ({
    path: file.path,
    name: basename(file.path),
    kind:
      file.status.kind === AppFileStatusKind.New ||
      file.status.kind === AppFileStatusKind.Untracked
        ? ('new' as const)
        : ('modified' as const),
    // `getChangedFiles` sums its `--numstat` output into the changeset's two
    // totals and keeps nothing per file, so no per-file count exists to report
    // here. Sending zeroes made the detail sheet draw "+0 −0" beside every
    // path and the chip strip announce the same to a screen reader, which
    // states that each of those files changed nothing — a claim about every
    // file in every commit, and one nobody can check from the surface. The
    // counts are omitted instead, and the sheet drops the pair of numbers
    // rather than printing a zero that means "not counted".
    addedLineCount: undefined,
    deletedLineCount: undefined,
  }))
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function commitKind(commit: Commit): Md3CommitKind {
  if (commit.isMergeCommit) {
    return 'merge'
  }
  // Signature verification is a per-commit `git verify-commit` the history
  // store does not run — `getCommits` even passes `--no-show-signature`. So
  // nothing here knows whether a signature checked out, and `unverified` is
  // not the safe answer it looks like: to a reader it says the signature was
  // examined and failed, which is a different and equally unfounded claim.
  // Report that it was never checked.
  return 'unchecked'
}

export interface IMd3HistoryCommitSource {
  /** The SHAs to render, newest first, exactly as the compare state ordered them. */
  readonly shas: ReadonlyArray<string>
  readonly commitLookup: Map<string, Commit>
  /** SHAs that exist locally and not on the tracking branch. */
  readonly localCommitSHAs: ReadonlyArray<string>
  /** The name of the branch the list is showing. */
  readonly branchName: string
  /** The signed-in user's addresses, used to mark a commit as the user's own. */
  readonly userEmails: ReadonlySet<string>
  /** Shas the user has pinned in this session. */
  readonly pinnedShas: ReadonlySet<string>
  /**
   * The selected commit's changeset totals, keyed by sha, when one is loaded.
   *
   * `sha` is the promise that these three numbers describe *that* commit and
   * have actually arrived. The caller must leave it null until both are true —
   * see `md3HistoryChangeset` in `md3-view-props.ts`, which is the only thing
   * that may decide it — because the row believes it: a non-null sha here is
   * what turns "+0 −0 · 0 files" from a placeholder into a statement.
   */
  readonly changeset: {
    readonly sha: string | null
    readonly linesAdded: number
    readonly linesDeleted: number
    readonly fileCount: number
  }
  readonly now?: number
}

/** Map the history store's SHA list onto the view's commit rows. */
export function md3HistoryCommits(
  source: IMd3HistoryCommitSource
): ReadonlyArray<IMd3HistoryCommit> {
  const unpushed = new Set(source.localCommitSHAs)
  const now = source.now ?? Date.now()
  const rows = new Array<IMd3HistoryCommit>()

  for (const sha of source.shas) {
    const commit = source.commitLookup.get(sha)
    if (commit === undefined) {
      // The SHA is in the list but its body has not been loaded yet. Rendering
      // a row with an empty summary would look like a commit with no message.
      continue
    }

    const date = commit.author.date
    const loaded = source.changeset.sha === sha

    rows.push({
      sha,
      shortSha: commit.shortSha,
      summary: commit.summary,
      body: commit.bodyNoCoAuthors,
      author: commit.author.name,
      relativeTime: md3RelativeTime(date, now),
      absoluteTime: md3AbsoluteTime(date),
      day: md3DayLabel(date, now),
      tag: commit.tags.length > 0 ? commit.tags[0] : null,
      unpushed: unpushed.has(sha),
      isMine: source.userEmails.has(commit.author.email.toLowerCase()),
      pinned: source.pinnedShas.has(sha),
      kind: commitKind(commit),
      statsLoaded: loaded,
      addedLineCount: loaded ? source.changeset.linesAdded : 0,
      deletedLineCount: loaded ? source.changeset.linesDeleted : 0,
      changedFileCount: loaded ? source.changeset.fileCount : 0,
      branchName: source.branchName,
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

function changeStatus(kind: AppFileStatusKind): Md3ChangeStatus {
  switch (kind) {
    case AppFileStatusKind.New:
    case AppFileStatusKind.Untracked:
    case AppFileStatusKind.Copied:
      return 'A'
    case AppFileStatusKind.Deleted:
      return 'D'
    case AppFileStatusKind.Modified:
    case AppFileStatusKind.Renamed:
    case AppFileStatusKind.Conflicted:
      return 'M'
  }
}

/** Added and deleted line totals across a loaded textual diff. */
export interface IMd3DiffLineCounts {
  readonly added: number
  readonly deleted: number
}

/**
 * Count a loaded diff's added and deleted lines.
 *
 * Answers `null` — never `{ added: 0, deleted: 0 }` — for a diff that has not
 * loaded or that has no text to count (an image, a binary, a submodule
 * pointer). Zero is a real answer meaning "this diff changed no lines", so it
 * must not double as "nobody counted".
 */
export function md3DiffLineCounts(
  diff: IDiff | null
): IMd3DiffLineCounts | null {
  if (diff === null || !isTextual(diff)) {
    return null
  }

  let added = 0
  let deleted = 0
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === DiffLineType.Add) {
        added++
      } else if (line.type === DiffLineType.Delete) {
        deleted++
      }
    }
  }
  return { added, deleted }
}

/** The one file whose diff the Changes selection has actually loaded. */
export interface IMd3LoadedChangeDiff {
  readonly path: string
  readonly diff: IDiff | null
}

/**
 * Map the working directory onto the Changes list's rows.
 *
 * `git status` reports which files changed and never by how much, so the line
 * totals exist only for the file whose diff the selection has loaded. Every
 * other row reports `statsLoaded: false` and the detail line omits the
 * `+a −d` segment rather than printing `+0 −0`, which would claim that a file
 * sitting in the changed-file list is identical to HEAD.
 */
export function md3ChangedFiles(
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  loaded?: IMd3LoadedChangeDiff | null
): ReadonlyArray<IMd3ChangedFile> {
  const counts =
    loaded === undefined || loaded === null
      ? null
      : md3DiffLineCounts(loaded.diff)

  return files.map(file => {
    const selection = file.selection.getSelectionType()
    const own = counts !== null && loaded?.path === file.path ? counts : null
    return {
      path: file.path,
      status: changeStatus(file.status.kind),
      included: selection !== DiffSelectionType.None,
      partiallyIncluded: selection === DiffSelectionType.Partial,
      statsLoaded: own !== null,
      addedLineCount: own?.added ?? 0,
      deletedLineCount: own?.deleted ?? 0,
    }
  })
}

/** How many of the working directory's files are staged for the commit. */
export function md3IncludedFileCount(
  files: ReadonlyArray<WorkingDirectoryFileChange>
): number {
  return files.filter(
    file => file.selection.getSelectionType() !== DiffSelectionType.None
  ).length
}

/**
 * The inclusion and status filters the changed-file list has always carried,
 * as chip ids.
 *
 * `isCheapLfsCandidate` is deliberately not among them. That filter matches on
 * a file's size on disk, which this list never reads, and
 * `applyFilterOptions` fails closed on an unknown size — so offering the chip
 * here would produce a control that empties the list every time it is pressed.
 * The legacy list, which does read sizes, keeps it.
 */
export const Md3ChangesFilterIds = [
  'included',
  'excluded',
  'new',
  'modified',
  'deleted',
] as const

export type Md3ChangesFilterId = typeof Md3ChangesFilterIds[number]

/** Whether a chip is lit, read from the repository's real filter state. */
export function md3ChangesFilterActive(
  filter: IFileListFilterState,
  id: Md3ChangesFilterId
): boolean {
  switch (id) {
    case 'included':
      return filter.isIncludedInCommit
    case 'excluded':
      return filter.isExcludedFromCommit
    case 'new':
      return filter.isNewFile
    case 'modified':
      return filter.isModifiedFile
    case 'deleted':
      return filter.isDeletedFile
  }
}

/**
 * Narrow the changed-file list by the lit chips.
 *
 * This defers to `applyFilterOptions`, the predicate the existing changed-file
 * list already uses, so the two surfaces cannot disagree about what "New
 * files" means — an untracked file counts as new there, and re-deriving that
 * here would have quietly dropped it.
 */
export function md3FilterChangedFiles(
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  filter: IFileListFilterState
): ReadonlyArray<WorkingDirectoryFileChange> {
  const options: IFileListFilterState = {
    ...filter,
    // The text half is applied by the view's own search field, which is a
    // separate control with its own regex builder; applying it twice from two
    // sources would let one of them silently win.
    filterText: '',
    // Matched on a file's size on disk, which this list never reads;
    // `applyFilterOptions` fails closed on an unknown size, so honouring it
    // here would empty the list with no chip on screen to unset.
    isCheapLfsCandidate: false,
  }

  return files.filter(file =>
    applyFilterOptions(
      { id: file.id, text: [file.path], change: file },
      options
    )
  )
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export interface IMd3BranchSource {
  readonly branches: ReadonlyArray<Branch>
  readonly currentBranchName: string
  /** Ahead/behind per branch name, as far as the ahead/behind store knows it. */
  readonly aheadBehind: ReadonlyMap<string, IAheadBehind>
  readonly pinnedBranches: ReadonlySet<string>
  readonly hiddenBranches: ReadonlySet<string>
  /** Worktree paths keyed by the branch checked out in them. */
  readonly worktreeBranches: ReadonlySet<string>
  /** Open pull requests keyed by their head branch's short name. */
  readonly pullRequests: ReadonlyMap<
    string,
    { readonly number: number; readonly state: string }
  >
  /** True when the repository has a forge the branch can be opened on. */
  readonly hasForge: boolean
  readonly now?: number
}

/**
 * The seven characters the contract's detail line opens with — `tip 4f1c9ae`.
 *
 * Git object names are forty characters and the row's field is a `string`, so
 * handing one straight through type-checks, renders, and quietly eats the whole
 * detail line at 10.5px. Abbreviating is the adapter's job because the view is
 * documented to receive the short form.
 */
const BranchTipShaLength = 7

/** Map the branches store onto the Branches list's rows. */
export function md3BranchRows(
  source: IMd3BranchSource
): ReadonlyArray<IMd3BranchRow> {
  const now = source.now ?? Date.now()
  const rows = new Array<IMd3BranchRow>()

  for (const branch of source.branches) {
    if (source.hiddenBranches.has(branch.name)) {
      continue
    }

    const isCurrent = branch.name === source.currentBranchName
    const group: Md3BranchGroup = isCurrent
      ? 'Current'
      : branch.type === BranchType.Local
      ? 'Local'
      : 'Remote'
    // The ahead/behind store measures the branch it is asked about and no
    // other, so a branch it has not reached is unmeasured rather than in sync.
    // `?? 0` here would print "in sync" beside every branch in the list and
    // hide both pills, which is a confident answer to a question nobody asked
    // yet and which the user has no way to tell from a real one.
    const aheadBehind = source.aheadBehind.get(branch.name) ?? null

    // A pull request is keyed by its head branch's short name, so the remote
    // ref that carries the same head — `origin/feature/x` — has to drop its
    // remote prefix before it can find its own pull request.
    const pullRequest = source.pullRequests.get(branch.nameWithoutRemote)

    // `IBranchTip` carries the tip's sha, and — only when the ref was read with
    // them — the tip author's date and name. The meta line reports whichever of
    // those Git actually gave, and falls back to the short sha rather than
    // inventing an author or a time.
    const tipDate = branch.tip.author?.date
    const tipAuthor = branch.tip.author?.name
    rows.push({
      name: branch.name,
      group,
      meta:
        tipDate === undefined
          ? t('md3.adapters.branch.metaSha', {
              sha: branch.tip.sha.slice(0, BranchTipShaLength),
            })
          : tipAuthor === undefined || tipAuthor.length === 0
          ? t('md3.adapters.branch.metaUpdated', {
              when: md3RelativeTime(tipDate, now),
            })
          : t('md3.adapters.branch.metaUpdatedBy', {
              when: md3RelativeTime(tipDate, now),
              author: tipAuthor,
            }),
      tipSha: branch.tip.sha.slice(0, BranchTipShaLength),
      tracking: branch.upstream,
      upstreamGone: branch.isGone === true,
      ahead: aheadBehind?.ahead ?? null,
      behind: aheadBehind?.behind ?? null,
      pullRequest:
        pullRequest === undefined
          ? undefined
          : { number: pullRequest.number, state: pullRequest.state },
      isCurrent,
      isPinned: source.pinnedBranches.has(branch.name),
      hasWorktree: source.worktreeBranches.has(branch.name),
      canHide: !isCurrent,
      isOnForge: source.hasForge,
    })
  }

  return rows
}

/** What the merge-all orchestrator publishes about a run in flight. */
export interface IMd3MergeAllSource {
  readonly phase: IMd3MergeAllStatus['phase']
  readonly currentBranch: string | null
  /** One entry per branch the run has finished with. */
  readonly results: ReadonlyArray<unknown>
}

/**
 * Map the merge-all orchestrator's state onto the Branches pane's progress.
 *
 * The orchestrator reports what it has finished and what it is working on, and
 * never how many branches the run will touch, so the total is genuinely
 * unknown while a run is in flight. Deriving one from those two — "finished
 * plus the one in hand" — reads as a real denominator: a queue of twelve
 * renders "3 of 4", and the bar sits near its end for the whole run. `null`
 * says the total is not known, which is what is actually true, and makes the
 * bar indeterminate instead of confidently wrong.
 */
export function md3MergeAllStatus(
  mergeAll: IMd3MergeAllSource | null
): IMd3MergeAllStatus | null {
  if (mergeAll === null) {
    return null
  }

  return {
    phase: mergeAll.phase,
    currentBranch: mergeAll.currentBranch,
    // One result per finished branch, so the list's length is the count.
    completed: mergeAll.results.length,
    total: null,
  }
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

const NotificationIcons: Readonly<
  Record<INotificationEntry['kind'], MaterialSymbolName>
> = {
  'pr-review-submit': 'rate_review',
  'pr-comment': 'alternate_email',
  'pr-checks-failed': 'error',
  'app-error': 'error',
  'clone-batch': 'cloud_download',
  'auto-commit': 'commit',
  'merge-all': 'merge',
  'auto-pull': 'sync',
  'cheap-lfs': 'database',
  'build-run': 'build',
  info: 'notifications',
}

const NotificationTones: Readonly<
  Record<INotificationEntry['kind'], Md3InboxTone>
> = {
  'pr-review-submit': 'info',
  'pr-comment': 'info',
  'pr-checks-failed': 'bad',
  'app-error': 'bad',
  'clone-batch': 'ok',
  'auto-commit': 'ok',
  'merge-all': 'ok',
  'auto-pull': 'ok',
  'cheap-lfs': 'info',
  'build-run': 'info',
  info: 'info',
}

/**
 * The human-readable kind the row's search and every export carry.
 *
 * `entry.kind` is a machine slug — `pr-checks-failed` — and the view documents
 * `kindLabel` as "the notification's human-readable kind". Handing the slug
 * through type-checks perfectly and writes `pr-checks-failed` into the "kind"
 * column of every exported file, which is a value the reader has to decode.
 */
const NotificationKindLabels: Readonly<
  Record<NotificationCentreKind, TranslationKey>
> = {
  'pr-review-submit': 'md3.inbox.kind.prReviewSubmit',
  'pr-comment': 'md3.inbox.kind.prComment',
  'pr-checks-failed': 'md3.inbox.kind.prChecksFailed',
  'app-error': 'md3.inbox.kind.appError',
  'clone-batch': 'md3.inbox.kind.cloneBatch',
  'auto-commit': 'md3.inbox.kind.autoCommit',
  'merge-all': 'md3.inbox.kind.mergeAll',
  'auto-pull': 'md3.inbox.kind.autoPull',
  'cheap-lfs': 'md3.inbox.kind.cheapLfs',
  'build-run': 'md3.inbox.kind.buildRun',
  info: 'md3.inbox.kind.info',
}

/** The localized label {@link md3InboxNotifications} puts on a row's kind. */
export function md3NotificationKindLabel(kind: NotificationCentreKind): string {
  return t(NotificationKindLabels[kind])
}

/**
 * What a notification row names as its source: `owner/repo` when the
 * repository is associated with a GitHub repository, the folder name when it
 * is not.
 *
 * The contract's detail line reads `material/desktop-material · unread ·
 * success`, and the view documents `source` as `owner/repo`. A bare folder
 * name is the same string type and renders without complaint, so it has to be
 * derived here rather than assumed by whoever builds the map.
 */
export function md3NotificationSourceName(
  repository: Repository | CloningRepository
): string {
  return repository instanceof Repository ? nameOf(repository) : repository.name
}

/**
 * The identity a mute applies to.
 *
 * A notification entry's own id is a per-event uuid, so muting by it would
 * silence one row and nothing that follows it. The thread is the subject the
 * events are about: the URL when one exists, and otherwise the kind, the
 * repository and the title together.
 */
export function md3NotificationThreadKey(entry: INotificationEntry): string {
  const action = entry.action
  if (
    action !== undefined &&
    (action.kind === 'open-pull-request' || action.kind === 'open-url')
  ) {
    return `url:${action.url}`
  }
  return `kind:${entry.kind}:${entry.repositoryId ?? ''}:${entry.title}`
}

export interface IMd3InboxSource {
  readonly notifications: ReadonlyArray<INotificationEntry>
  /**
   * Repository source labels keyed by id, so a row can name where it came
   * from. Build them with {@link md3NotificationSourceName} — the detail line
   * renders `owner/repo`, not a folder name.
   */
  readonly repositoryNames: ReadonlyMap<number, string>
  /** Thread keys the user has muted, from {@link md3NotificationThreadKey}. */
  readonly mutedThreads?: ReadonlySet<string>
  readonly now?: number
}

/** Map the notification centre's entries onto the Inbox rows. */
export function md3InboxNotifications(
  source: IMd3InboxSource
): ReadonlyArray<IMd3InboxNotification> {
  const now = source.now ?? Date.now()
  const muted = source.mutedThreads ?? new Set<string>()

  return source.notifications.map(entry => {
    const created = new Date(entry.createdAt)
    const valid = Number.isFinite(created.getTime())
    const repositoryName =
      entry.repositoryId === undefined
        ? undefined
        : source.repositoryNames.get(entry.repositoryId)

    return {
      id: entry.id,
      title: entry.title,
      meta: entry.body,
      source: repositoryName,
      icon: NotificationIcons[entry.kind],
      tone: NotificationTones[entry.kind],
      // An unparseable timestamp has no relative rendering, and the raw ISO
      // string is a 24-character value in a cell the contract sizes for "2m".
      // Say the time is not known rather than printing something that reads
      // like an answer.
      time: valid ? md3RelativeTime(created, now) : t('md3.inbox.time.unknown'),
      createdAt: entry.createdAt,
      read: entry.read,
      mention: entry.kind === 'pr-comment',
      externalUrl:
        entry.action !== undefined &&
        (entry.action.kind === 'open-pull-request' ||
          entry.action.kind === 'open-url')
          ? entry.action.url
          : undefined,
      muted: muted.has(md3NotificationThreadKey(entry)),
      kindLabel: md3NotificationKindLabel(entry.kind),
    }
  })
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

export interface IMd3RepositorySource {
  readonly repositories: ReadonlyArray<Repository | CloningRepository>
  readonly localState: ReadonlyMap<number, ILocalRepositoryState>
  readonly selectedRepositoryId: number | null
  readonly pinnedRepositoryIds: ReadonlySet<number>
  readonly hiddenRepositoryIds: ReadonlySet<number>
  /**
   * When each repository was last fetched, for the repositories whose Git
   * state has actually been read this session.
   *
   * Three states, and they are three different sentences:
   *
   * - no entry — nobody has read this repository's Git state, so the fetch
   *   time is *unknown*;
   * - an entry of `null` — the state was read and it has genuinely *never*
   *   been fetched;
   * - a date — it was fetched then.
   *
   * Collapsing the first two loses the distinction the user cares about, and
   * in whichever direction it collapses it states something false.
   */
  readonly lastFetchedById: ReadonlyMap<number, Date | null>

  /**
   * How many remotes each repository has, for the repositories whose Git
   * config has actually been read.
   *
   * A repository with no entry has not been counted, and the row says so. It
   * must never be flattened to zero: "no remotes" and "nobody looked" render
   * identically once a zero is printed, and only one of them is true.
   */
  readonly remoteCountById: ReadonlyMap<number, number>
  readonly now?: number
}

/**
 * A repository's group, with a key that sorts into the order the groups are
 * displayed in — the same numeric-prefix convention the classic repository
 * list's `getGroupKey` uses, so the two surfaces order groups alike.
 *
 * A clone in flight comes first because it is work the user just started and
 * is waiting on; then the groups they named themselves, then each forge owner,
 * then everything purely local.
 */
function repositoryGroup(repository: Repository | CloningRepository): {
  readonly key: string
  readonly label: string
} {
  if (repository instanceof CloningRepository) {
    return { key: '0:cloning', label: t('md3.adapters.repository.cloning') }
  }
  const custom = repository.groupName
  if (custom !== null && custom.length > 0) {
    return { key: `1:group:${custom.toLocaleLowerCase()}`, label: custom }
  }
  const gitHubRepository = repository.gitHubRepository
  if (gitHubRepository !== null) {
    const owner = gitHubRepository.owner.login
    return { key: `2:owner:${owner.toLocaleLowerCase()}`, label: owner }
  }
  return { key: '3:local', label: t('md3.adapters.repository.local') }
}

/** Map the repository inventory onto the Repositories list's rows. */
export function md3RepositoryRows(
  source: IMd3RepositorySource
): ReadonlyArray<IMd3RepositoryRow> {
  const now = source.now ?? Date.now()
  const rows = new Array<IMd3RepositoryRow>()

  for (const repository of source.repositories) {
    const group = repositoryGroup(repository)
    const local =
      repository instanceof Repository
        ? source.localState.get(repository.id) ?? null
        : null
    const upstreamState: RepositoryUpstreamState =
      local?.upstreamState ?? 'unknown'
    const sync = getRepositorySyncSummary(
      repository,
      upstreamState,
      local?.aheadBehind ?? null
    )
    const fetchInspected = source.lastFetchedById.has(repository.id)
    const lastFetched = source.lastFetchedById.get(repository.id) ?? null

    rows.push({
      id: repository.id,
      // The name the user chose. Every other repository surface in the app
      // renders `alias ?? name`, so a repository the user renamed must not go
      // back to its folder name here — two surfaces naming one repository two
      // different things is indistinguishable from two repositories.
      name:
        repository instanceof Repository
          ? repository.alias ?? repository.name
          : repository.name,
      groupKey: group.key,
      groupLabel: group.label,
      path: repository.path,
      lastFetched: !fetchInspected
        ? t('md3.adapters.repository.fetchUnknown')
        : lastFetched === null
        ? // The empty string is this row's "never", which the meta line then
          // says outright. It is a stronger claim than "unknown" and is only
          // earned once the repository's state has actually been read.
          ''
        : md3RelativeTime(lastFetched, now),
      // The language and on-disk size are a workspace scan the repository
      // inventory does not perform, so the row reports neither rather than
      // guessing from the repository's name.
      language: '',
      sizeInMegabytes: null,
      branchName: local?.branchName ?? null,
      sync: { kind: sync.kind, ahead: sync.ahead, behind: sync.behind },
      // Counted from the repository's own Git config where that has been read.
      // Having a GitHub association is not a remote count: a fork has `origin`
      // and `upstream`, and a purely local checkout can have several remotes
      // while having no forge at all.
      remoteCount: source.remoteCountById.get(repository.id) ?? null,
      changedFilesCount: local?.changedFilesCount ?? null,
      isCurrent: repository.id === source.selectedRepositoryId,
      isPinned: source.pinnedRepositoryIds.has(repository.id),
      isHidden: source.hiddenRepositoryIds.has(repository.id),
      isMissing: repository instanceof Repository && repository.missing,
    })
  }

  /*
   * The view's `repositories` prop documents itself as "already grouped and
   * ordered", and the list genuinely depends on that: it starts a new group
   * whenever a row's `groupKey` differs from the previous row's, and keys each
   * header by that group. The inventory arrives in the order the repositories
   * were added to the database, so without this sort a user who added two
   * `material` repositories either side of a local one would see the `material`
   * header twice with a `Local` header wedged between — and React would be
   * handed two sibling nodes with the same key, which it reconciles by reusing
   * whichever DOM node it saw first.
   *
   * Within a group, by the name the row actually displays, case-insensitively,
   * matching the classic repository list.
   */
  return rows
    .slice()
    .sort(
      (x, y) =>
        compare(x.groupKey, y.groupKey) ||
        caseInsensitiveCompare(x.name, y.name)
    )
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

function agentState(session: IAgentSession): Md3AgentSessionState {
  if (session.isMissing) {
    return 'error'
  }
  switch (session.runState) {
    case 'running':
      return 'running'
    case 'error':
      return 'error'
    case 'cancelled':
      return 'paused'
    case 'idle':
      return session.lastActivityAt === null ? 'idle' : 'done'
  }
}

function turnRole(role: AgentSessionConversationRole): Md3AgentTurnRole {
  switch (role) {
    case 'instruction':
      return 'user'
    case 'output':
      return 'agent'
    case 'error':
      return 'error'
    case 'meta':
      return 'meta'
  }
}

/** The agent-access values the row's permission summary is built from. */
export interface IMd3AgentAccess {
  readonly read: Md3MenuPermission
  readonly commit: Md3MenuPermission
  readonly push: Md3MenuPermission
}

/**
 * The contract's `read + stage permissions`, built from the same three values
 * the agent-access menu shows.
 *
 * The row and that menu must never disagree about what an agent may do, so
 * both read one source. A capability set to `ask` is named as asking rather
 * than folded in with the granted ones — "may commit" and "may commit once you
 * say yes" are different promises.
 */
export function md3AgentPermissionsSummary(access: IMd3AgentAccess): string {
  const parts: Array<string> = []
  const add = (value: Md3MenuPermission, name: string) => {
    if (value === 'off') {
      return
    }
    parts.push(
      value === 'ask'
        ? t('md3.adapters.agent.permissions.asks', { name })
        : name
    )
  }

  add(access.read, t('md3.adapters.agent.permissions.read'))
  add(access.commit, t('md3.adapters.agent.permissions.commit'))
  add(access.push, t('md3.adapters.agent.permissions.push'))

  return parts.length === 0
    ? t('md3.adapters.agent.permissions.none')
    : t('md3.adapters.agent.permissions.granted', { list: parts.join(' + ') })
}

/**
 * When a run began and how long it has taken, read from the transcript rather
 * than from the fleet's `lastActivityAt`.
 *
 * `lastActivityAt` is the newest thing that happened, so using it as the start
 * makes the row say "started 8s ago" about a run that has been going for an
 * hour, and makes a finished run's elapsed time grow for as long as the
 * application stays open. The first recorded turn is the real start; the last
 * one is the real end of a run that has stopped.
 */
function agentRunTimes(
  session: IAgentSession,
  conversation: IAgentSessionConversation | null,
  running: boolean,
  now: number
): { readonly startedAt: number | null; readonly elapsedMs: number | null } {
  if (conversation === null) {
    // No transcript was recorded for this worktree in this session of the
    // application, so neither the start nor the duration is known. Saying
    // "not started" is wrong too, but it is the only shape the row has for an
    // unknown start, and it never invents a duration to sit beside it.
    return { startedAt: null, elapsedMs: null }
  }

  const turns = conversation.turns
  const startedAt =
    turns.length === 0 ? session.lastActivityAt : turns[0].createdAt
  if (startedAt === null) {
    return { startedAt: null, elapsedMs: null }
  }

  const endedAt = running
    ? now
    : turns.length === 0
    ? session.lastActivityAt ?? now
    : turns[turns.length - 1].createdAt

  return { startedAt, elapsedMs: Math.max(0, endedAt - startedAt) }
}

/**
 * Why an instruction cannot be sent to this session right now, already
 * localized, or `null` when one can.
 *
 * The row's disabled composer and the controller that actually launches the
 * run both read this, so the reason a person is shown and the reason a send is
 * refused can never drift apart.
 */
export function md3AgentSendBlocker(
  session: IAgentSession,
  runnerAvailable: (session: IAgentSession) => boolean
): string | null {
  const agent = getCodingAgent(session.agent)
  const agentName = agent?.name ?? session.agent

  if (session.isMissing) {
    return t('md3.adapters.agent.missing')
  }
  if (session.runState === 'running') {
    return t('md3.adapters.agent.busy')
  }
  if (agent === undefined || agent.runner === null) {
    return t('md3.adapters.agent.noAgent')
  }
  if (!runnerAvailable(session)) {
    return t('md3.adapters.agent.noRunner', { agent: agentName })
  }
  return null
}

export interface IMd3AgentSource {
  readonly sessions: ReadonlyArray<IAgentSession>
  /** Whether a runner exists for the session's agent on this host. */
  readonly runnerAvailable: (session: IAgentSession) => boolean
  /**
   * The session's recorded transcript, or `null` when none was recorded. The
   * turn count, the start time and the elapsed time all come from it, so a row
   * built without it reports those as unknown rather than as zero.
   */
  readonly conversationFor: (
    session: IAgentSession
  ) => IAgentSessionConversation | null
  /** The agent-access values the detail line's permission summary states. */
  readonly access: IMd3AgentAccess
  readonly now?: number
}

/** Map the worktree fleet onto the Agents list's sessions. */
export function md3AgentSessions(
  source: IMd3AgentSource
): ReadonlyArray<IMd3AgentSession> {
  const now = source.now ?? Date.now()
  const permissionsSummary = md3AgentPermissionsSummary(source.access)

  return source.sessions.map(session => {
    const state = agentState(session)
    const running = state === 'running'
    const conversation = source.conversationFor(session)
    const { startedAt, elapsedMs } = agentRunTimes(
      session,
      conversation,
      running,
      now
    )

    // An instruction starts a run in this worktree, so it can be accepted
    // exactly when a run could start: not while one is already going, not into
    // a directory that is gone, and not without a runner to receive it. The
    // composer was previously live only while the agent was busy — the one
    // moment its stdin is already closed and nothing could be delivered.
    const blocker = md3AgentSendBlocker(session, source.runnerAvailable)

    return {
      id: session.path,
      name: session.name,
      path: session.path,
      agentName: getCodingAgent(session.agent)?.name ?? session.agent,
      state,
      branch: session.branch,
      startedAt,
      // The model a runner chose is not reported back to the renderer, so the
      // card omits it rather than naming one nobody selected.
      model: null,
      turnCount: conversation === null ? null : conversation.turns.length,
      elapsedMs,
      permissionsSummary,
      isMainWorktree: session.isMainWorktree,
      isLocked: session.isLocked,
      isMissing: session.isMissing,
      errorMessage: session.errorMessage,
      canPause: running,
      // Resuming re-runs the session's last recorded instruction, so it needs
      // both a runner that could take it and an instruction on record.
      canResume:
        blocker === null && md3AgentLastInstruction(conversation) !== null,
      canSendInstruction: blocker === null,
      sendUnavailableReason: blocker,
    }
  })
}

/**
 * The newest instruction a session was given, or `null` when its transcript
 * holds none. Resuming a session re-runs it, so a session without one has
 * nothing to resume and must say so rather than appearing to start.
 */
export function md3AgentLastInstruction(
  conversation: IAgentSessionConversation | null
): string | null {
  if (conversation === null) {
    return null
  }
  for (let index = conversation.turns.length - 1; index >= 0; index--) {
    const turn = conversation.turns[index]
    if (turn.role === 'instruction' && turn.text.trim().length > 0) {
      return turn.text
    }
  }
  return null
}

/** Map one session's recorded conversation onto the Agents transcript. */
export function md3AgentConversation(
  sessionId: string,
  conversation: IAgentSessionConversation | null
): IMd3AgentConversation | null {
  if (conversation === null) {
    return null
  }

  const turns = new Array<IMd3AgentTurn>()
  for (const turn of conversation.turns) {
    turns.push({
      id: `${turn.id}`,
      role: turnRole(turn.role),
      text: turn.text,
    })
  }

  return {
    sessionId,
    turns,
    statusLabel: agentStatusLabel(conversation.status),
  }
}

function agentStatusLabel(status: IAgentSessionConversation['status']): string {
  switch (status) {
    case 'running':
      return t('md3.adapters.agent.status.running')
    case 'exited':
      return t('md3.adapters.agent.status.exited')
    case 'failed':
      return t('md3.adapters.agent.status.failed')
    case 'cancelled':
      return t('md3.adapters.agent.status.cancelled')
  }
}

// The row's turn count is read straight from the transcript in
// `md3AgentSessions`, where a missing transcript produces `null`. A helper that
// answered `0` for "no transcript" used to live here and was never called by
// anything; it is gone rather than left as a ready-made way to reintroduce a
// zero that means "unknown".

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function runStatus(run: IAPIWorkflowRun): Md3ActionsStatus {
  if (run.status !== 'completed') {
    // Only `in_progress` is actually executing. `pending` and `requested` are a
    // run waiting on a deployment gate or an approval, and reporting either as
    // running spins the progress glyph over a run where nothing is happening
    // and no time is being spent.
    return run.status === 'in_progress' ? 'running' : 'queued'
  }
  switch (run.conclusion) {
    case 'success':
      return 'success'
    case 'cancelled':
      return 'cancelled'
    case 'skipped':
    case 'neutral':
      return 'cancelled'
    case null:
    case undefined:
      return 'queued'
    default:
      return 'failed'
  }
}

function jobStatus(
  status: ActionsJobStatus,
  conclusion: ActionsJobConclusion | null
): Md3ActionsStatus {
  if (status !== 'completed') {
    return status === 'in_progress' ? 'running' : 'queued'
  }
  switch (conclusion) {
    case 'success':
      return 'success'
    case 'cancelled':
    case 'skipped':
    case 'neutral':
      return 'cancelled'
    case null:
      return 'queued'
    default:
      return 'failed'
  }
}

/** The abbreviated SHA length the run row's detail line is measured for. */
const Md3ActionsShaLength = 7

/**
 * A value the provider reported, or `null` when it reported nothing.
 *
 * The run row leaves an absent segment out of its sentence, so every empty
 * string has to become a `null` here rather than at the view: `''` reaches the
 * view as a value, and the view has no way left to tell "no branch reported"
 * from "a branch whose name is nothing".
 */
function reported(value: string | null | undefined): string | null {
  const text = value ?? ''
  return text.length > 0 ? text : null
}

export interface IMd3ActionsRunSource {
  readonly runs: ReadonlyArray<IAPIWorkflowRun>
  /** The run whose mutation is in flight, so its row can report itself busy. */
  readonly busyRunId: number | null
  /** Run ids known to have at least one failed job. */
  readonly failedJobRunIds: ReadonlySet<number>

  /**
   * How many jobs a run has, for the runs whose job page has been read.
   *
   * A run summary carries no job count, so a run missing from this map has an
   * unknown one and its row says nothing about jobs. Reporting `0` there would
   * claim a run with no jobs at all, which no run has.
   */
  readonly jobCounts?: ReadonlyMap<number, number>
  readonly now?: number
}

/** Map the Actions store's runs onto the run list's rows. */
export function md3ActionsRuns(
  source: IMd3ActionsRunSource
): ReadonlyArray<IMd3ActionsRun> {
  const now = source.now ?? Date.now()

  return source.runs.map(run => {
    const status = runStatus(run)
    const created = toDate(run.created_at)
    const active = status === 'running' || status === 'queued'

    // A finished run's duration is start to finish. A run still going has no
    // finish, and `updated_at` is whenever the provider last touched the
    // record — so measuring to it freezes the row at however long the run had
    // taken by then, and a run in its fortieth minute keeps reporting the two
    // it had reached when the page was fetched.
    const duration = md3Duration(
      run.run_started_at ?? run.created_at,
      active ? new Date(now) : run.updated_at
    )

    return {
      id: `${run.id}`,
      name: run.display_title ?? run.name,
      number: run.run_number ?? null,
      branch: reported(run.head_branch),
      event: run.event,
      duration: reported(duration),
      status,
      // Only a conclusion that says more than the mapped status is passed on.
      // `run.status` here is the provider's spelling — `in_progress` — and
      // `run.conclusion` is `failure`; neither is the word the contract's own
      // vocabulary uses, and neither is localized.
      statusLabel: md3ActionsConclusionLabel(run.conclusion),
      actor: reported(run.actor?.login),
      // Abbreviated, because the row gives the SHA one ellipsing line beside
      // the branch and the event. A full 40-character identifier here is what
      // pushes the rest of the line out of the row.
      sha: reported((run.head_sha ?? '').slice(0, Md3ActionsShaLength)),
      jobCount: source.jobCounts?.get(run.id) ?? null,
      time: created === null ? null : md3RelativeTime(created, now),
      attempt: run.run_attempt ?? 1,
      cancellable: active,
      hasFailedJobs: source.failedJobRunIds.has(run.id),
      busy: source.busyRunId === run.id,
    }
  })
}

function md3ActionsSteps(
  jobId: number,
  steps: ReadonlyArray<IActionsJobStep>,
  now: number
): ReadonlyArray<IMd3ActionsStep> {
  return steps.map(step => ({
    // A step number is unique within its job and nowhere else: every job has a
    // step 1. The view compares the selected step id against every step of
    // every job, so a bare number selects the same-numbered step in all of
    // them at once — one click, five highlighted rows, and roving focus with
    // five tab stops where it promised one.
    id: `${jobId}:${step.number}`,
    name: step.name,
    status: jobStatus(step.status, step.conclusion),
    duration: md3RunningDuration(step.startedAt, step.completedAt, now),
  }))
}

/**
 * How long something took, or how long it has been going.
 *
 * A step or job that has started and not finished has no `completedAt`, and
 * `md3Duration` reports an empty string for it — so the one row in the list
 * whose elapsed time the reader is actually watching is the one that shows
 * nothing at all. Measuring an unfinished one against now says how long it has
 * been running; an unstarted one still shows nothing, because nothing has.
 */
function md3RunningDuration(
  startedAt: Date | null,
  completedAt: Date | null,
  now: number
): string {
  if (startedAt === null) {
    return ''
  }
  return md3Duration(startedAt, completedAt ?? new Date(now))
}

/** Map one run's loaded jobs onto the jobs pane. */
export function md3ActionsJobs(
  jobs: ReadonlyArray<IActionsJob>,
  busyJobId: number | null,
  now: number = Date.now()
): ReadonlyArray<IMd3ActionsJob> {
  return jobs.map(job => ({
    id: `${job.id}`,
    name: job.name,
    status: jobStatus(job.status, job.conclusion),
    duration: md3RunningDuration(job.startedAt, job.completedAt, now),
    steps: md3ActionsSteps(job.id, job.steps, now),
    canRerun: job.status === 'completed',
    busy: busyJobId === job.id,
  }))
}
