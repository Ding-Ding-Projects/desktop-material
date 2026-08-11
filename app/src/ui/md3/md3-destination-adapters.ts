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

import { t } from '../../lib/i18n'
import { formatRelative } from '../../lib/format-relative'

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
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { INotificationEntry } from '../../models/notification-centre'
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

import { IMd3DiffFileTab, IMd3DiffLine } from './md3-diff-pane'
import { IMd3HistoryCommit, Md3CommitKind } from './md3-history-view'
import { IMd3ChangedFile, Md3ChangeStatus } from './md3-changes-view'
import { IMd3BranchRow, Md3BranchGroup } from './md3-branches-view'
import { IMd3InboxNotification, Md3InboxTone } from './md3-inbox-view'
import { IMd3RepositoryRow } from './md3-repositories-view'
import {
  IMd3AgentConversation,
  IMd3AgentSession,
  IMd3AgentTurn,
  Md3AgentSessionState,
  Md3AgentTurnRole,
} from './md3-agents-view'
import {
  IMd3ActionsJob,
  IMd3ActionsRun,
  IMd3ActionsStep,
  Md3ActionsStatus,
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

/** The day heading a commit row groups under. */
export function md3DayLabel(date: Date): string {
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
    // Per-file line totals are a `--numstat` read the changeset does not carry,
    // so the strip reports none rather than a number nobody counted.
    addedLineCount: 0,
    deletedLineCount: 0,
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
  // store does not run, so a commit is reported unverified rather than
  // claiming a signature nobody checked.
  return 'unverified'
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
  /** The selected commit's changeset totals, keyed by sha, when one is loaded. */
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
      day: md3DayLabel(date),
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

/** Map the working directory onto the Changes list's rows. */
export function md3ChangedFiles(
  files: ReadonlyArray<WorkingDirectoryFileChange>
): ReadonlyArray<IMd3ChangedFile> {
  return files.map(file => {
    const selection = file.selection.getSelectionType()
    return {
      path: file.path,
      status: changeStatus(file.status.kind),
      included: selection !== DiffSelectionType.None,
      partiallyIncluded: selection === DiffSelectionType.Partial,
      // `git status` gives no per-file line totals; the numbers arrive only
      // with the file's diff, which the list does not load per row.
      addedLineCount: 0,
      deletedLineCount: 0,
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
    const aheadBehind = source.aheadBehind.get(branch.name) ?? null
    const pullRequest = source.pullRequests.get(branch.name)

    // `IBranchTip` carries the tip's sha and — only when the ref was read with
    // its committer date — that date. It carries no author name, so the meta
    // line reports the date when Git gave one and the short sha when it did
    // not, rather than an author nobody read.
    const tipDate = branch.tip.author?.date
    rows.push({
      name: branch.name,
      group,
      meta:
        tipDate === undefined
          ? t('md3.adapters.branch.metaSha', {
              sha: branch.tip.sha.slice(0, 7),
            })
          : t('md3.adapters.branch.metaUpdated', {
              when: md3RelativeTime(tipDate, now),
            }),
      tipSha: branch.tip.sha,
      tracking: branch.upstream,
      ahead: aheadBehind?.ahead ?? 0,
      behind: aheadBehind?.behind ?? 0,
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

export interface IMd3InboxSource {
  readonly notifications: ReadonlyArray<INotificationEntry>
  /** Repository names keyed by id, so a row can name where it came from. */
  readonly repositoryNames: ReadonlyMap<number, string>
  readonly now?: number
}

/** Map the notification centre's entries onto the Inbox rows. */
export function md3InboxNotifications(
  source: IMd3InboxSource
): ReadonlyArray<IMd3InboxNotification> {
  const now = source.now ?? Date.now()

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
      time: valid ? md3RelativeTime(created, now) : entry.createdAt,
      createdAt: entry.createdAt,
      read: entry.read,
      mention: entry.kind === 'pr-comment',
      externalUrl:
        entry.action !== undefined &&
        (entry.action.kind === 'open-pull-request' ||
          entry.action.kind === 'open-url')
          ? entry.action.url
          : undefined,
      kindLabel: entry.kind,
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
   * The repository inventory records no fetch time — it lives in the
   * per-repository Git state, which exists only for repositories that have
   * been opened. A row with no entry says its fetch time is unknown rather
   * than reporting "never", which is a different and false claim.
   */
  readonly lastFetchedById: ReadonlyMap<number, Date>
  readonly now?: number
}

function repositoryGroup(repository: Repository | CloningRepository): {
  readonly key: string
  readonly label: string
} {
  if (repository instanceof CloningRepository) {
    return { key: 'cloning', label: t('md3.adapters.repository.cloning') }
  }
  const custom = repository.groupName
  if (custom !== null && custom.length > 0) {
    return { key: `group:${custom}`, label: custom }
  }
  const gitHubRepository = repository.gitHubRepository
  if (gitHubRepository !== null) {
    const owner = gitHubRepository.owner.login
    return { key: `owner:${owner}`, label: owner }
  }
  return { key: 'local', label: t('md3.adapters.repository.local') }
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
    const lastFetched = source.lastFetchedById.get(repository.id)

    rows.push({
      id: repository.id,
      name: repository.name,
      groupKey: group.key,
      groupLabel: group.label,
      path: repository.path,
      lastFetched:
        lastFetched === undefined
          ? t('md3.adapters.repository.fetchUnknown')
          : md3RelativeTime(lastFetched, now),
      // The language and on-disk size are a workspace scan the repository
      // inventory does not perform, so the row reports neither rather than
      // guessing from the repository's name.
      language: '',
      sizeInMegabytes: null,
      branchName: local?.branchName ?? null,
      sync: { kind: sync.kind, ahead: sync.ahead, behind: sync.behind },
      remoteCount:
        repository instanceof Repository && repository.gitHubRepository !== null
          ? 1
          : 0,
      changedFilesCount: local?.changedFilesCount ?? null,
      isCurrent: repository.id === source.selectedRepositoryId,
      isPinned: source.pinnedRepositoryIds.has(repository.id),
      isHidden: source.hiddenRepositoryIds.has(repository.id),
      isMissing: repository instanceof Repository && repository.missing,
    })
  }

  return rows
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

export interface IMd3AgentSource {
  readonly sessions: ReadonlyArray<IAgentSession>
  /** Whether a runner exists for the session's agent on this host. */
  readonly runnerAvailable: (session: IAgentSession) => boolean
  readonly now?: number
}

/** Map the worktree fleet onto the Agents list's sessions. */
export function md3AgentSessions(
  source: IMd3AgentSource
): ReadonlyArray<IMd3AgentSession> {
  const now = source.now ?? Date.now()

  return source.sessions.map(session => {
    const state = agentState(session)
    const running = state === 'running'
    const available = source.runnerAvailable(session)

    return {
      id: session.path,
      name: session.name,
      path: session.path,
      agentName: getCodingAgent(session.agent)?.name ?? session.agent,
      state,
      branch: session.branch,
      startedAt: session.lastActivityAt,
      // The model a runner chose is not reported back to the renderer, so the
      // card omits it rather than naming one nobody selected.
      model: null,
      turnCount: 0,
      elapsedMs:
        session.lastActivityAt === null ? null : now - session.lastActivityAt,
      permissionsSummary: t('md3.adapters.agent.permissions', {
        path: session.path,
      }),
      isMainWorktree: session.isMainWorktree,
      isLocked: session.isLocked,
      isMissing: session.isMissing,
      errorMessage: session.errorMessage,
      canPause: running,
      canResume: !running && !session.isMissing && available,
      canSendInstruction: running,
      sendUnavailableReason: running
        ? null
        : session.isMissing
        ? t('md3.adapters.agent.missing')
        : t('md3.adapters.agent.notRunning'),
    }
  })
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

/** How many turns a session's transcript holds, for the card's counter. */
export function md3AgentTurnCount(
  conversation: IAgentSessionConversation | null
): number {
  return conversation === null ? 0 : conversation.turns.length
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function runStatus(run: IAPIWorkflowRun): Md3ActionsStatus {
  if (run.status !== 'completed') {
    return run.status === 'queued' || run.status === 'waiting'
      ? 'queued'
      : 'running'
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

export interface IMd3ActionsRunSource {
  readonly runs: ReadonlyArray<IAPIWorkflowRun>
  /** The run whose mutation is in flight, so its row can report itself busy. */
  readonly busyRunId: number | null
  /** Run ids known to have at least one failed job. */
  readonly failedJobRunIds: ReadonlySet<number>
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

    return {
      id: `${run.id}`,
      name: run.display_title ?? run.name,
      number: run.run_number ?? 0,
      branch: run.head_branch ?? '',
      event: run.event,
      duration: md3Duration(
        run.run_started_at ?? run.created_at,
        run.updated_at
      ),
      status,
      statusLabel: run.conclusion ?? run.status ?? undefined,
      actor: run.actor?.login ?? '',
      sha: (run.head_sha ?? '').slice(0, 7),
      // The run summary carries no job count; the number arrives with the job
      // page, so the row reports none until that page has been read.
      jobCount: 0,
      time: created === null ? '' : md3RelativeTime(created, now),
      attempt: run.run_attempt ?? 1,
      cancellable: status === 'running' || status === 'queued',
      hasFailedJobs: source.failedJobRunIds.has(run.id),
      busy: source.busyRunId === run.id,
    }
  })
}

function md3ActionsSteps(
  steps: ReadonlyArray<IActionsJobStep>
): ReadonlyArray<IMd3ActionsStep> {
  return steps.map(step => ({
    id: `${step.number}`,
    name: step.name,
    status: jobStatus(step.status, step.conclusion),
    duration: md3Duration(step.startedAt, step.completedAt),
  }))
}

/** Map one run's loaded jobs onto the jobs pane. */
export function md3ActionsJobs(
  jobs: ReadonlyArray<IActionsJob>,
  busyJobId: number | null
): ReadonlyArray<IMd3ActionsJob> {
  return jobs.map(job => ({
    id: `${job.id}`,
    name: job.name,
    status: jobStatus(job.status, job.conclusion),
    duration: md3Duration(job.startedAt, job.completedAt),
    steps: md3ActionsSteps(job.steps),
    canRerun: job.status === 'completed',
    busy: busyJobId === job.id,
  }))
}
