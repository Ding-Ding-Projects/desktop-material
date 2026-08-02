import { appendFile, mkdir, readdir, readFile, stat, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { git } from '../git/core'
import { getDefaultBranch } from '../helpers/default-branch'
import { initGitRepository } from '../git/init'
import { setConfigValue } from '../git/config'
import { getChangedFiles, getCommits } from '../git/log'
import { getCommitDiff } from '../git/diff'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { DiffType, IDiff } from '../../models/diff/diff-data'
import {
  clearCrashSafeFile,
  CrashSafePersistenceGitIgnorePattern,
} from '../crash-safe-file'
import {
  composeProfileCommitMessage,
  IProfileHistoryEntry,
  IProfileHistoryPage,
  ProfileHistoryPageSize,
} from '../../models/profile'
import * as ipcRenderer from '../ipc-renderer'

const commitAuthorName = 'Desktop Material'
const commitAuthorEmail = 'desktop-material@localhost'

export const ProfileUndoTrailer = 'Desktop-Material-Undo-Of'
export const ProfileRedoTrailer = 'Desktop-Material-Redo-Of'
export const ProfileRestoreTrailer = 'Desktop-Material-Restore-Of'
/** Records the diverged tip whose tree a repair commit folded back in. */
export const ProfileFoldTrailer = 'Desktop-Material-Fold-Of'
/** Records the tip whose tree a repair commit restored after a fold. */
export const ProfileFoldRestoreTrailer = 'Desktop-Material-Fold-Restore-Of'

const profileStateFiles = ['settings.json', 'tabs.json'] as const
const fullSHA = /^[0-9a-f]{40}$/i
const ProfileHistoryScanBatchSize = 100
const ProfileTabsPath = 'tabs.json'
const processProfileRepositoryLockTails = new Map<string, Promise<void>>()

export interface IProfileRepositoryNavigationTarget {
  addEventListener(
    type: 'beforeunload',
    listener: (event: BeforeUnloadEvent) => void
  ): void
  removeEventListener(
    type: 'beforeunload',
    listener: (event: BeforeUnloadEvent) => void
  ): void
}

interface IProfileRepositoryNavigationGuard {
  count: number
  readonly listener: (event: BeforeUnloadEvent) => void
}

const profileRepositoryNavigationGuards = new WeakMap<
  IProfileRepositoryNavigationTarget,
  IProfileRepositoryNavigationGuard
>()

function holdProfileRepositoryDocument(
  target: IProfileRepositoryNavigationTarget
): () => void {
  const existing = profileRepositoryNavigationGuards.get(target)
  if (existing !== undefined) {
    existing.count++
    return () => releaseProfileRepositoryDocument(target, existing)
  }

  const guard: IProfileRepositoryNavigationGuard = {
    count: 1,
    listener: event => {
      event.preventDefault()
      // Electron consistently honors an explicitly assigned returnValue for
      // both renderer- and BrowserWindow-initiated reloads.
      event.returnValue = false
    },
  }
  profileRepositoryNavigationGuards.set(target, guard)
  target.addEventListener('beforeunload', guard.listener)
  return () => releaseProfileRepositoryDocument(target, guard)
}

function releaseProfileRepositoryDocument(
  target: IProfileRepositoryNavigationTarget,
  guard: IProfileRepositoryNavigationGuard
): void {
  if (profileRepositoryNavigationGuards.get(target) !== guard) {
    return
  }
  guard.count--
  if (guard.count === 0) {
    profileRepositoryNavigationGuards.delete(target)
    target.removeEventListener('beforeunload', guard.listener)
  }
}

/** Construct a lightweight Repository model pointing at a profile directory. */
export function profileRepository(path: string): Repository {
  return new Repository(path, -1, null, false)
}

/**
 * Ensure a git repository exists at the given path, creating the directory and
 * initializing git on first use. Any stale `index.lock` left behind by a
 * crashed session is removed (safe because Desktop is single-instance).
 */
export async function ensureProfileRepository(
  path: string
): Promise<Repository> {
  await mkdir(path, { recursive: true })

  const repository = profileRepository(path)
  await withProfileRepositoryLock(repository, async () => {
    // Versions before the main-process lease broker used a sibling filesystem
    // lock. The application is single-instance and this broker already owns the
    // repository, so an orphan from an interrupted renderer is safe to remove.
    await rm(`${path}.desktop-material.lock`, { force: true })

    let initialized = false
    try {
      await stat(join(path, '.git'))
      initialized = true
    } catch {
      initialized = false
    }

    if (!initialized) {
      await initGitRepository(path)
    } else {
      await clearStaleLock(path)
    }

    await ensureCrashSafePersistenceIgnored(path)

    // Git config writes take an exclusive lock, so keep these sequential.
    await setConfigValue(repository, 'user.name', commitAuthorName)
    await setConfigValue(repository, 'user.email', commitAuthorEmail)
    await setConfigValue(repository, 'commit.gpgsign', 'false')

    // A repository that a previous build (or an interrupted mutation) left with
    // more than one head is folded back into one linear timeline before any
    // caller can append to it.
    await repairProfileHistoryLinearityLocked(repository)
  })

  return repository
}

async function ensureCrashSafePersistenceIgnored(path: string): Promise<void> {
  const infoPath = join(path, '.git', 'info')
  const excludePath = join(infoPath, 'exclude')
  await mkdir(infoPath, { recursive: true })
  const existing = await readFile(excludePath, 'utf8').catch(error => {
    if (isFileSystemError(error, 'ENOENT')) {
      return ''
    }
    throw error
  })
  if (
    existing
      .split(/\r?\n/g)
      .some(line => line.trim() === CrashSafePersistenceGitIgnorePattern)
  ) {
    return
  }
  const prefix = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  await appendFile(
    excludePath,
    `${prefix}${CrashSafePersistenceGitIgnorePattern}\n`,
    'utf8'
  )
}

/**
 * Serialize profile file and Git mutations. Renderer documents lease the path
 * from the main process. An active lease blocks document replacement until its
 * action and release finish; navigation cancels only work which has not
 * started. Node-based tools and tests use an equivalent in-process queue.
 */
export async function withProfileRepositoryLock<T>(
  repository: Repository,
  action: () => Promise<T>
): Promise<T> {
  if (
    (process as NodeJS.Process & { readonly type?: string }).type === 'renderer'
  ) {
    const leaseId = await ipcRenderer.invoke(
      'acquire-profile-repository-lock',
      repository.path
    )
    return runProfileRepositoryActionWithLease(
      action,
      () => ipcRenderer.invoke('release-profile-repository-lock', leaseId),
      window
    )
  }

  const repositoryKey = resolve(repository.path).toLowerCase()
  const predecessor =
    processProfileRepositoryLockTails.get(repositoryKey) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>(resolveGate => {
    release = resolveGate
  })
  const tail = predecessor.catch(() => undefined).then(() => gate)
  processProfileRepositoryLockTails.set(repositoryKey, tail)
  await predecessor.catch(() => undefined)

  try {
    return await action()
  } finally {
    release()
    if (processProfileRepositoryLockTails.get(repositoryKey) === tail) {
      processProfileRepositoryLockTails.delete(repositoryKey)
    }
  }
}

/**
 * Run one leased action without allowing cleanup to replace its primary error.
 *
 * A successful action still fails closed when the main process cannot prove
 * that this renderer released the exact lease it acquired.
 */
export async function runProfileRepositoryActionWithLease<T>(
  action: () => Promise<T>,
  releaseLease: () => Promise<boolean>,
  navigationTarget?: IProfileRepositoryNavigationTarget
): Promise<T> {
  const releaseDocumentHold =
    navigationTarget === undefined
      ? null
      : holdProfileRepositoryDocument(navigationTarget)
  let actionFailed = false
  try {
    return await action()
  } catch (error) {
    actionFailed = true
    throw error
  } finally {
    try {
      try {
        const released = await releaseLease()
        if (!released) {
          throw new Error(
            'The profile repository lease was no longer owned by this renderer.'
          )
        }
      } catch (releaseError) {
        if (!actionFailed) {
          throw releaseError
        }
      }
    } finally {
      releaseDocumentHold?.()
    }
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  )
}

/**
 * The append-only invariant every owned repository holds: exactly one branch
 * ref, HEAD attached to it, and every commit reachable from exactly one parent.
 *
 * `strayTips` are commits that were reachable from some other ref (or from a
 * detached HEAD) and therefore formed a second head.
 */
export interface IProfileLinearityRepair {
  /** True when the repository already satisfied the invariant. */
  readonly linear: boolean
  /** Tips folded forward as ordinary audit commits, newest last. */
  readonly foldedTips: ReadonlyArray<string>
  /** Redundant refs removed because they were already reachable from HEAD. */
  readonly removedRefs: ReadonlyArray<string>
  /** True when a detached HEAD was reattached to the canonical branch. */
  readonly reattachedHead: boolean
  /**
   * Merge commits found in the surviving timeline. These predate the invariant
   * and cannot be removed without rewriting published local history, so they
   * are reported rather than repaired.
   */
  readonly mergeCommits: ReadonlyArray<string>
}

interface IRepositoryRefState {
  /** `refs/heads/x` when HEAD is attached, otherwise null. */
  readonly headRef: string | null
  /** The commit a detached HEAD points at, otherwise null. */
  readonly detachedAt: string | null
  /** Every ref in the repository, keyed by full refname. */
  readonly refs: ReadonlyMap<string, string>
}

/**
 * Read HEAD and every ref straight off disk.
 *
 * The overwhelmingly common case is one branch and an attached HEAD, and this
 * runs for every element repository on startup, so the check must not pay for a
 * Git subprocess before it knows there is anything to repair.
 */
async function readRepositoryRefState(
  path: string
): Promise<IRepositoryRefState> {
  const gitDir = join(path, '.git')
  const refs = new Map<string, string>()

  const collectLooseRefs = async (
    directory: string,
    prefix: string
  ): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      error => {
        if (isFileSystemError(error, 'ENOENT')) {
          return []
        }
        throw error
      }
    )

    for (const entry of entries) {
      const child = join(directory, entry.name)
      if (entry.isDirectory()) {
        await collectLooseRefs(child, `${prefix}${entry.name}/`)
        continue
      }
      const contents = (await readFile(child, 'utf8').catch(error => {
        if (isFileSystemError(error, 'ENOENT')) {
          return ''
        }
        throw error
      })) as string
      const sha = contents.trim()
      if (fullSHA.test(sha)) {
        refs.set(`${prefix}${entry.name}`, sha)
      }
    }
  }

  await collectLooseRefs(join(gitDir, 'refs'), 'refs/')

  const packed = await readFile(join(gitDir, 'packed-refs'), 'utf8').catch(
    error => {
      if (isFileSystemError(error, 'ENOENT')) {
        return ''
      }
      throw error
    }
  )
  for (const line of packed.split(/\r?\n/g)) {
    const match = /^([0-9a-f]{40}) (refs\/.+)$/.exec(line.trim())
    if (match !== null && !refs.has(match[2])) {
      refs.set(match[2], match[1])
    }
  }

  const head = (
    await readFile(join(gitDir, 'HEAD'), 'utf8').catch(error => {
      if (isFileSystemError(error, 'ENOENT')) {
        return ''
      }
      throw error
    })
  ).trim()

  if (head.startsWith('ref: ')) {
    return { headRef: head.slice(5).trim(), detachedAt: null, refs }
  }

  return {
    headRef: null,
    detachedAt: fullSHA.test(head) ? head : null,
    refs,
  }
}

/** Resolve the commit HEAD points at, or null when HEAD is unborn. */
async function resolveHead(repository: Repository): Promise<string | null> {
  const result = await git(
    ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'],
    repository.path,
    'profileResolveHead',
    { successExitCodes: new Set([0, 1, 128]) }
  )
  const sha = result.stdout.trim()
  return fullSHA.test(sha) ? sha : null
}

/** Whether `candidate` is already reachable from `tip`. */
async function isAncestorCommit(
  repository: Repository,
  candidate: string,
  tip: string
): Promise<boolean> {
  const result = await git(
    ['merge-base', '--is-ancestor', candidate, tip],
    repository.path,
    'profileIsAncestor',
    { successExitCodes: new Set([0, 1, 128]) }
  )
  return result.exitCode === 0
}

/** Parent SHAs of one commit, oldest-listed first. */
async function commitParents(
  repository: Repository,
  sha: string
): Promise<ReadonlyArray<string>> {
  const result = await git(
    ['rev-list', '--no-walk', '--parents', sha],
    repository.path,
    'profileCommitParents'
  )
  return result.stdout.trim().split(/\s+/g).slice(1).filter(Boolean)
}

/**
 * Refuse to append to a parent other than the one the caller reserved.
 *
 * Every audited mutation samples HEAD, mutates the working tree, and then
 * commits. Without this compare-and-swap a writer that lost the race would
 * quietly build on a tip it never inspected, and its rollback would rewind past
 * the winner's commit.
 */
async function assertProfileHeadUnchanged(
  repository: Repository,
  expectedHead: string | null
): Promise<void> {
  const head = await resolveHead(repository)
  if (head !== expectedHead) {
    throw new Error(
      'Profile history moved while this change was being prepared; nothing was committed'
    )
  }
}

/** Whether an interrupted merge would turn the next commit into a merge commit. */
async function hasPendingMerge(repository: Repository): Promise<boolean> {
  return stat(join(repository.path, '.git', 'MERGE_HEAD')).then(
    () => true,
    error => {
      if (isFileSystemError(error, 'ENOENT')) {
        return false
      }
      throw error
    }
  )
}

/** Remove a leftover `.git/index.lock` from a previous crashed session. */
export async function clearStaleLock(path: string): Promise<void> {
  try {
    await rm(join(path, '.git', 'index.lock'), { force: true })
  } catch {
    // Best effort — nothing to do if it can't be removed.
  }
}

/**
 * Stage everything under the profile repository and create a commit when there
 * is something to record. Returns true if a commit was created, false when the
 * working tree was already clean.
 *
 * Author identity and signing are forced on the command line so the commit
 * never depends on (or triggers) the user's global git configuration.
 */
export async function commitAllChanges(
  repository: Repository,
  message: string,
  options: {
    readonly allowEmpty?: boolean
    /**
     * The commit this write reserved as its parent, or null for the first
     * commit in an unborn repository. When supplied, the append is verified
     * before and after `git commit` so a raced or merge-shaped write is
     * rejected instead of silently forking the timeline.
     */
    readonly expectedParent?: string | null
  } = {}
): Promise<boolean> {
  const { path } = repository
  const { expectedParent } = options

  // Cheap enough (one `stat`) to guard every append: an interrupted merge left
  // in the repository is the only way a plain `git commit` here can produce a
  // second-parent commit and fork the timeline.
  if (await hasPendingMerge(repository)) {
    throw new Error(
      'Profile repository has an unfinished merge; refusing to append a merge commit'
    )
  }

  if (expectedParent !== undefined) {
    await assertProfileHeadUnchanged(repository, expectedParent)
  }

  await git(['add', '-A'], path, 'profileStage')

  const status = await git(['status', '--porcelain'], path, 'profileStatus')
  if (status.stdout.trim().length === 0 && options.allowEmpty !== true) {
    return false
  }

  const commitArgs = [
    '-c',
    `user.name=${commitAuthorName}`,
    '-c',
    `user.email=${commitAuthorEmail}`,
    '-c',
    'commit.gpgsign=false',
    'commit',
  ]
  if (options.allowEmpty === true) {
    commitArgs.push('--allow-empty')
  }
  commitArgs.push('-m', message)

  await git(commitArgs, path, 'profileCommit')

  if (expectedParent !== undefined) {
    await assertAppendedExactlyOneChild(repository, expectedParent)
  }

  return true
}

/** Verify the commit just written is the single linear child it claimed to be. */
async function assertAppendedExactlyOneChild(
  repository: Repository,
  expectedParent: string | null
): Promise<void> {
  const head = await resolveHead(repository)
  if (head === null) {
    throw new Error('Profile commit did not advance HEAD')
  }

  const parents = await commitParents(repository, head)
  const expected = expectedParent === null ? [] : [expectedParent]
  if (
    parents.length !== expected.length ||
    parents.some((parent, index) => parent !== expected[index])
  ) {
    throw new Error(
      `Profile commit ${head.slice(
        0,
        7
      )} is not a linear child of the reserved parent`
    )
  }
}

/**
 * Serializes settings and tab writes into a single debounced commit. Rapid
 * changes within the debounce window collapse into one commit whose message is
 * composed at flush time from the accumulated change descriptions.
 */
export class ProfileCommitQueue {
  private timer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> = Promise.resolve()
  private readonly pending: Array<string> = []

  public constructor(
    private readonly repository: Repository,
    private readonly composeMessage: (
      descriptions: ReadonlyArray<string>
    ) => string = composeProfileCommitMessage,
    private readonly delayMs: number = 1000,
    private readonly enqueueFlush?: (
      flush: () => Promise<void>
    ) => Promise<void>
  ) {}

  /** Record a change and (re)start the debounce timer. */
  public schedule(description: string): void {
    this.pending.push(description)

    if (this.timer !== null) {
      clearTimeout(this.timer)
    }

    this.timer = setTimeout(() => {
      this.timer = null
      const flush = () => this.flush()
      const operation =
        this.enqueueFlush === undefined ? flush() : this.enqueueFlush(flush)
      operation.catch(err => log.error('Failed to commit profile changes', err))
    }, this.delayMs)
  }

  /**
   * Commit any pending changes immediately. Safe to call at any time (e.g. on
   * profile switch or before quit); resolves once the in-flight commit settles.
   */
  public flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.chain = this.chain
      // A failed batch must not permanently poison the serialization chain.
      // Its descriptions are restored by drainPendingChanges for the retry.
      .catch(() => undefined)
      .then(() => this.drainPendingChanges())

    return this.chain
  }

  private async drainPendingChanges(): Promise<void> {
    while (this.pending.length > 0) {
      if (this.timer !== null) {
        clearTimeout(this.timer)
        this.timer = null
      }

      const descriptions = this.pending.splice(0)
      const message = this.composeMessage(descriptions)

      try {
        await commitAllChanges(this.repository, message)
      } catch (err) {
        this.pending.unshift(...descriptions)
        throw err
      }
    }
  }
}

/** Restricts a history read to commits relevant to one profile subject. */
export interface IProfileHistoryFilter {
  /**
   * Show only commits where this tab's serialized object or presence differs
   * from its first parent. The id is always compared as a literal string.
   */
  readonly tabId: string
}

/** Return one bounded, newest-first page of the profile repository's history. */
export function getProfileHistory(
  repository: Repository,
  skip: number = 0,
  limit: number = ProfileHistoryPageSize,
  filter?: IProfileHistoryFilter
): Promise<IProfileHistoryPage> {
  return getProfileHistoryInternal(repository, skip, limit, filter)
}

/** Exercise a deterministic cross-window write between scan batches in tests. */
export function getProfileHistoryWithBatchObserverForTesting(
  repository: Repository,
  skip: number,
  limit: number,
  filter: IProfileHistoryFilter | undefined,
  onHistoryBatch: (batchIndex: number) => Promise<void>
): Promise<IProfileHistoryPage> {
  return getProfileHistoryInternal(
    repository,
    skip,
    limit,
    filter,
    onHistoryBatch
  )
}

async function getProfileHistoryInternal(
  repository: Repository,
  skip: number,
  limit: number,
  filter?: IProfileHistoryFilter,
  onTabHistoryBatch?: (batchIndex: number) => Promise<void>
): Promise<IProfileHistoryPage> {
  const normalizedSkip = normalizeNonNegativeInteger(skip)
  const normalizedLimit = Math.min(
    ProfileHistoryPageSize,
    Math.max(1, normalizeNonNegativeInteger(limit))
  )
  const revision = await resolveProfileHistoryRevision(repository)
  if (revision === null) {
    return emptyProfileHistoryPage()
  }

  if (filter !== undefined) {
    return getTabProfileHistory(
      repository,
      revision,
      normalizedSkip,
      normalizedLimit,
      filter.tabId,
      onTabHistoryBatch
    )
  }

  const [commits, total] = await Promise.all([
    getCommits(repository, revision, normalizedLimit, normalizedSkip),
    countProfileHistoryCommits(repository, revision),
  ])
  if (total === 0) {
    return emptyProfileHistoryPage()
  }

  const availability = await getProfileHistoryAvailability(
    repository,
    revision,
    normalizedSkip === 0 ? commits : [],
    onTabHistoryBatch
  )

  return {
    entries: commits.map(toProfileHistoryEntry),
    total,
    hasMore: normalizedSkip + commits.length < total,
    ...availability,
  }
}

/** Count history without materializing each commit and its message metadata. */
async function countProfileHistoryCommits(
  repository: Repository,
  revision: string
): Promise<number> {
  const result = await git(
    ['rev-list', '--count', revision, '--'],
    repository.path,
    'profileHistoryCount',
    { successExitCodes: new Set([0, 128]) }
  )
  if (result.exitCode === 128) {
    return 0
  }

  const output = result.stdout.trim()
  if (!/^\d+$/.test(output)) {
    throw new Error(`Git returned an invalid profile history count: ${output}`)
  }

  const total = Number(output)
  if (!Number.isSafeInteger(total)) {
    throw new Error(`Git returned an unsafe profile history count: ${output}`)
  }
  return total
}

interface IProfileHistoryAvailability {
  readonly canUndo: boolean
  readonly canRedo: boolean
}

/**
 * Resolve action availability from bounded newest-first batches.
 *
 * An ordinary commit clears the redo stack and contributes a known undo
 * target. Once one such target survives replay, older history cannot change
 * either boolean. A fully-undone timeline may require older batches, but no
 * individual Git log request is unbounded.
 */
async function getProfileHistoryAvailability(
  repository: Repository,
  revision: string,
  initialCommits: ReadonlyArray<Commit>,
  onBatch?: (batchIndex: number) => Promise<void>
): Promise<IProfileHistoryAvailability> {
  const newestFirst = [...initialCommits]
  let nextSkip = newestFirst.length
  let batchIndex = 0

  while (true) {
    if (newestFirst.length === 0) {
      await onBatch?.(batchIndex++)
      const batch = await getCommits(
        repository,
        revision,
        ProfileHistoryScanBatchSize,
        nextSkip
      )
      if (batch.length === 0) {
        return { canUndo: false, canRedo: false }
      }
      newestFirst.push(...batch)
      nextSkip += batch.length
    }

    const traversal = buildProfileHistoryTraversal(newestFirst)
    const oldest = newestFirst.at(-1)!
    const hasOrdinaryCommit = newestFirst.some(
      commit =>
        trailerValue(commit, ProfileUndoTrailer) === null &&
        trailerValue(commit, ProfileRedoTrailer) === null
    )

    if (
      oldest.parentSHAs.length === 0 ||
      (hasOrdinaryCommit &&
        !traversal.dependsOnEarlierCommits &&
        traversal.undoable.length > 0)
    ) {
      return {
        canUndo: traversal.undoable.length > 0,
        canRedo: traversal.redoable.length > 0,
      }
    }

    await onBatch?.(batchIndex++)
    const batch = await getCommits(
      repository,
      revision,
      ProfileHistoryScanBatchSize,
      nextSkip
    )
    if (batch.length === 0) {
      return {
        canUndo: traversal.undoable.length > 0,
        canRedo: traversal.redoable.length > 0,
      }
    }
    newestFirst.push(...batch)
    nextSkip += batch.length
  }
}

/** Pin a batched history read to one immutable repository boundary. */
async function resolveProfileHistoryRevision(
  repository: Repository
): Promise<string | null> {
  const [head] = await getCommits(repository, 'HEAD', 1)
  return head?.sha ?? null
}

function emptyProfileHistoryPage(): IProfileHistoryPage {
  return {
    entries: [],
    total: 0,
    hasMore: false,
    canUndo: false,
    canRedo: false,
  }
}

/**
 * Return an exact tab-scoped page without retaining the complete timeline.
 *
 * The pathspec first removes commits that cannot have changed a tab object.
 * Candidate commits are then processed in fixed-size batches. For each commit
 * we batch-read `tabs.json` at that commit and its first parent, find the tab by
 * literal id, and compare `JSON.stringify` output. This catches style and label
 * edits where the id line itself is unchanged while excluding changes to other
 * tabs, active-tab state, and array order.
 *
 * The complete candidate history still has to be scanned to produce the exact
 * `total`, but only one batch of commits/blobs and the requested page are held
 * at a time. Profile repositories are linear in normal operation; first-parent
 * comparison also gives merge commits an unambiguous commit boundary.
 */
async function getTabProfileHistory(
  repository: Repository,
  revision: string,
  skip: number,
  limit: number,
  tabId: string,
  onBatch?: (batchIndex: number) => Promise<void>
): Promise<IProfileHistoryPage> {
  const entries = new Array<IProfileHistoryEntry>()
  let candidateSkip = 0
  let total = 0

  while (true) {
    // getCommits appends its own trailing `--`; after this explicit separator
    // that becomes a harmless second literal pathspec.
    const candidates = await getCommits(
      repository,
      revision,
      ProfileHistoryScanBatchSize,
      candidateSkip,
      ['--full-history', '--', ProfileTabsPath]
    )
    if (candidates.length === 0) {
      break
    }

    const snapshots = await readProfileTabsSnapshots(repository, candidates)
    for (const commit of candidates) {
      const current = serializedTabAtSnapshot(snapshots.get(commit.sha), tabId)
      const parentSha = commit.parentSHAs[0]
      const parent =
        parentSha === undefined
          ? null
          : serializedTabAtSnapshot(snapshots.get(parentSha), tabId)

      if (current === parent) {
        continue
      }

      if (total >= skip && entries.length < limit) {
        entries.push(toProfileHistoryEntry(commit))
      }
      total++
    }

    await onBatch?.(candidateSkip / ProfileHistoryScanBatchSize)

    candidateSkip += candidates.length
    if (candidates.length < ProfileHistoryScanBatchSize) {
      break
    }
  }

  return {
    entries,
    total,
    hasMore: skip + entries.length < total,
    // Scoped history is intentionally read-only because mutations apply to
    // the whole profile rather than to a single tab.
    canUndo: false,
    canRedo: false,
  }
}

/** Read current and first-parent tabs.json blobs with one Git process. */
async function readProfileTabsSnapshots(
  repository: Repository,
  commits: ReadonlyArray<Commit>
): Promise<ReadonlyMap<string, string | null>> {
  const refs = new Set<string>()
  for (const commit of commits) {
    refs.add(commit.sha)
    const parentSha = commit.parentSHAs[0]
    if (parentSha !== undefined) {
      refs.add(parentSha)
    }
  }

  const orderedRefs = [...refs]
  const result = await git(
    ['cat-file', '--batch'],
    repository.path,
    'profileTabsHistorySnapshots',
    {
      encoding: 'buffer',
      stdin: `${orderedRefs
        .map(ref => `${ref}:${ProfileTabsPath}`)
        .join('\n')}\n`,
    }
  )

  return parseProfileTabsSnapshots(result.stdout, orderedRefs)
}

/** Parse `git cat-file --batch` output in request order. */
function parseProfileTabsSnapshots(
  output: Buffer,
  refs: ReadonlyArray<string>
): ReadonlyMap<string, string | null> {
  const snapshots = new Map<string, string | null>()
  let offset = 0

  for (const ref of refs) {
    const headerEnd = output.indexOf(0x0a, offset)
    if (headerEnd < 0) {
      throw new Error('Unexpected end of profile tabs history batch')
    }

    const header = output.toString('utf8', offset, headerEnd)
    offset = headerEnd + 1
    if (header.endsWith(' missing')) {
      snapshots.set(ref, null)
      continue
    }

    const match = /^[0-9a-f]+ blob ([0-9]+)$/.exec(header)
    if (match === null) {
      throw new Error(`Unexpected profile tabs history object: ${header}`)
    }

    const size = Number(match[1])
    const contentEnd = offset + size
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      contentEnd >= output.length ||
      output[contentEnd] !== 0x0a
    ) {
      throw new Error('Invalid profile tabs history object size')
    }

    snapshots.set(ref, output.toString('utf8', offset, contentEnd))
    offset = contentEnd + 1
  }

  return snapshots
}

/** Return the selected tab object's exact JSON serialization, or absence. */
function serializedTabAtSnapshot(
  contents: string | null | undefined,
  tabId: string
): string | null {
  if (contents === null || contents === undefined) {
    return null
  }

  let file: unknown
  try {
    file = JSON.parse(contents)
  } catch {
    return null
  }

  if (!isRecord(file)) {
    return null
  }

  const states = [
    file,
    ...(isRecord(file.windows) ? Object.values(file.windows) : []),
  ]
  for (const state of states) {
    if (!isRecord(state) || !Array.isArray(state.tabs)) {
      continue
    }
    const tab = state.tabs.find(value => isRecord(value) && value.id === tabId)
    if (tab !== undefined) {
      return JSON.stringify(tab)
    }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Load changed paths for a commit only when its row is expanded. */
export async function getProfileCommitFiles(
  repository: Repository,
  sha: string
): Promise<ReadonlyArray<string>> {
  await assertReachableProfileCommit(repository, sha)
  const { files } = await getChangedFiles(repository, sha)
  return files.map(file => file.path)
}

/** Load a unified text diff lazily for one path, or all paths in a commit. */
export async function getProfileCommitDiff(
  repository: Repository,
  sha: string,
  path?: string
): Promise<string> {
  await assertReachableProfileCommit(repository, sha)
  const { files } = await getChangedFiles(repository, sha)
  const selected =
    path === undefined ? files : files.filter(file => file.path === path)

  if (path !== undefined && selected.length === 0) {
    throw new Error(`Path ${path} was not changed by profile commit ${sha}`)
  }

  const rendered = await Promise.all(
    selected.map(async file =>
      renderProfileDiff(await getCommitDiff(repository, file, sha), file.path)
    )
  )
  return rendered.filter(diff => diff.length > 0).join('\n')
}

/** Revert the latest active logical change and append a linked audit commit. */
export async function undoLastProfileChange(
  repository: Repository
): Promise<void> {
  const traversal = await getProfileHistoryTraversal(repository)
  const head = traversal.head
  const target = traversal.undoable.at(-1)
  if (head === null || target === undefined) {
    throw new Error('There is no profile change to undo')
  }

  await runProfileHistoryMutation(
    repository,
    head.sha,
    () => revertWithoutCommitting(repository, target.sha),
    operationMessage(`Undo ${target.summary}`, ProfileUndoTrailer, target.sha)
  )
}

/** Reapply the latest logically undone change and append a linked audit commit. */
export async function redoLastProfileChange(
  repository: Repository
): Promise<void> {
  const traversal = await getProfileHistoryTraversal(repository)
  const head = traversal.head
  const target = traversal.redoable.at(-1)
  if (head === null || target === undefined) {
    throw new Error('The latest profile change cannot be redone')
  }

  await runProfileHistoryMutation(
    repository,
    head.sha,
    () => revertWithoutCommitting(repository, target.undo.sha),
    operationMessage(
      `Redo ${target.change.summary}`,
      ProfileRedoTrailer,
      target.undo.sha
    )
  )
}

/**
 * Restore Git-backed state files from a commit and append an audit commit.
 *
 * The set of files to restore defaults to the settings profile's own state
 * files, but callers backing other stores (e.g. the notification centre) pass
 * their own file list so the same non-destructive restore mechanism applies.
 */
export function restoreProfileTo(
  repository: Repository,
  sha: string,
  stateFiles: ReadonlyArray<string> = profileStateFiles
): Promise<void> {
  return restoreProfileToInternal(repository, sha, stateFiles)
}

/**
 * Run a deterministic competing write between the restore's worktree mutation
 * and its audit commit, so tests can prove the compare-and-swap refuses to
 * commit onto a parent another writer has already replaced.
 */
export function restoreProfileToWithRaceObserverForTesting(
  repository: Repository,
  sha: string,
  stateFiles: ReadonlyArray<string>,
  onMutated: () => Promise<void>
): Promise<void> {
  return restoreProfileToInternal(repository, sha, stateFiles, onMutated)
}

async function restoreProfileToInternal(
  repository: Repository,
  sha: string,
  stateFiles: ReadonlyArray<string>,
  onMutated?: () => Promise<void>
): Promise<void> {
  await assertReachableProfileCommit(repository, sha)
  const traversal = await getProfileHistoryTraversal(repository)
  const head = traversal.head
  if (head === null) {
    throw new Error('There is no profile history to restore')
  }

  await runProfileHistoryMutation(
    repository,
    head.sha,
    async () => {
      for (const file of stateFiles) {
        if (await profileFileExistsAtCommit(repository, sha, file)) {
          await git(
            ['checkout', sha, '--', file],
            repository.path,
            'profileRestoreFile'
          )
        } else {
          // Every state file is written crash-safely, so it owns an ignored
          // sibling backup that a plain unlink leaves behind. The next read
          // would recover from that backup and reinstall the primary, quietly
          // undoing the restore and letting the following commit record the
          // resurrected file as a fresh user change.
          await clearCrashSafeFile(join(repository.path, file))
        }
      }
      await onMutated?.()
    },
    operationMessage(
      `Restore profile to ${sha.slice(0, 7)}`,
      ProfileRestoreTrailer,
      sha
    )
  )
}

interface IProfileRedoTarget {
  readonly change: Commit
  readonly undo: Commit
}

interface IProfileHistoryTraversal {
  readonly head: Commit | null
  readonly undoable: ReadonlyArray<Commit>
  readonly redoable: ReadonlyArray<IProfileRedoTarget>
  /** Whether a bounded suffix needs older commits to classify an operation. */
  readonly dependsOnEarlierCommits: boolean
}

/**
 * Replay audit trailers from oldest to newest to derive the logical state.
 * Undo and redo commits remain in Git history, but are not themselves treated
 * as user changes. A new ordinary (or restore) commit starts a new branch of
 * logical history and therefore invalidates the redo stack.
 */
function buildProfileHistoryTraversal(
  newestFirst: ReadonlyArray<Commit>
): IProfileHistoryTraversal {
  const undoable = new Array<Commit>()
  const redoable = new Array<IProfileRedoTarget>()
  let dependsOnEarlierCommits = false
  let sawOrdinaryCommit = false

  for (const commit of [...newestFirst].reverse()) {
    const undoOf = trailerValue(commit, ProfileUndoTrailer)
    if (undoOf !== null) {
      const target = undoable.at(-1)
      if (target !== undefined && target.sha === undoOf) {
        undoable.pop()
        redoable.push({ change: target, undo: commit })
      } else if (target === undefined) {
        dependsOnEarlierCommits = true
      }
      continue
    }

    const redoOf = trailerValue(commit, ProfileRedoTrailer)
    if (redoOf !== null) {
      const target = redoable.at(-1)
      if (target !== undefined && target.undo.sha === redoOf) {
        redoable.pop()
        undoable.push(target.change)
      } else if (target === undefined && !sawOrdinaryCommit) {
        dependsOnEarlierCommits = true
      }
      continue
    }

    sawOrdinaryCommit = true
    dependsOnEarlierCommits = false
    redoable.length = 0
    if (commit.parentSHAs.length > 0) {
      undoable.push(commit)
    }
  }

  return {
    head: newestFirst[0] ?? null,
    undoable,
    redoable,
    dependsOnEarlierCommits,
  }
}

async function getProfileHistoryTraversal(
  repository: Repository
): Promise<IProfileHistoryTraversal> {
  return buildProfileHistoryTraversal(await getCommits(repository, 'HEAD'))
}

function toProfileHistoryEntry(commit: Commit): IProfileHistoryEntry {
  return {
    sha: commit.sha,
    shortSha: commit.shortSha,
    summary: commit.summary,
    body: commit.body,
    committedAt: commit.committer.date,
    undoOf: trailerValue(commit, ProfileUndoTrailer),
    redoOf: trailerValue(commit, ProfileRedoTrailer),
    restoreOf: trailerValue(commit, ProfileRestoreTrailer),
  }
}

function trailerValue(commit: Commit, token: string): string | null {
  return (
    commit.trailers.find(
      trailer => trailer.token.toLowerCase() === token.toLowerCase()
    )?.value ?? null
  )
}

function operationMessage(subject: string, trailer: string, sha: string) {
  return `${subject}\n\n${trailer}: ${sha}`
}

async function assertReachableProfileCommit(
  repository: Repository,
  sha: string
): Promise<void> {
  if (!fullSHA.test(sha)) {
    throw new Error('Profile history requires a full commit SHA')
  }

  const result = await git(
    ['merge-base', '--is-ancestor', sha, 'HEAD'],
    repository.path,
    'profileValidateCommit',
    { successExitCodes: new Set([0, 1, 128]) }
  )
  if (result.exitCode !== 0) {
    throw new Error(`Commit ${sha} is not in the active profile history`)
  }
}

async function revertWithoutCommitting(
  repository: Repository,
  sha: string
): Promise<void> {
  await git(['revert', '--no-commit', sha], repository.path, 'profileRevert')
}

/**
 * Keep an audited mutation atomic *and* append-only.
 *
 * The caller sampled `originalHead` before deciding what to undo, redo, or
 * restore, so that commit is reserved as the parent: the mutation is rejected
 * if anything moved HEAD in between, and the audit commit is verified to be its
 * single linear child.
 *
 * Recovery restores the index and working tree, but never moves the branch ref
 * backwards. Rewinding to `originalHead` used to be correct only while this was
 * the sole writer; once a concurrent window (or this store's own debounced
 * commit timer) had appended, the rewind abandoned that commit and left the
 * repository with unreachable history. Keeping the ref where it is preserves
 * every commit and leaves the next compare-and-swap a truthful tip to build on.
 */
async function runProfileHistoryMutation(
  repository: Repository,
  originalHead: string,
  mutate: () => Promise<void>,
  message: string
): Promise<void> {
  await assertProfileHeadUnchanged(repository, originalHead)

  try {
    await mutate()
    await commitAllChanges(repository, message, {
      allowEmpty: true,
      expectedParent: originalHead,
    })
  } catch (err) {
    await rollbackProfileHistoryMutation(repository)
    throw err
  }
}

/** Discard a partial mutation without discarding anybody's commits. */
async function rollbackProfileHistoryMutation(
  repository: Repository
): Promise<void> {
  try {
    // An interrupted revert leaves sequencer state behind that would otherwise
    // leak into the next commit this repository makes.
    await git(
      ['revert', '--quit'],
      repository.path,
      'profileHistoryQuitRevert',
      {
        successExitCodes: new Set([0, 1, 128]),
      }
    )
    await git(
      ['reset', '--hard', 'HEAD'],
      repository.path,
      'profileHistoryRollback'
    )
  } catch (rollbackError) {
    log.error('Failed to roll back profile history mutation', rollbackError)
  }
}

/**
 * Fold a repository that has more than one head back into one linear timeline.
 *
 * Nothing is ever discarded. A ref that is already reachable from HEAD is
 * simply dropped, because every commit it named survives on the canonical
 * branch. A genuinely diverged tip is replayed *forward* as two ordinary audit
 * commits — its tree, then the tree that was live before the fold — so both
 * states stay reachable, diffable, and restorable from the single timeline the
 * history panel renders, and the live setting is left exactly as it was.
 *
 * Callers must already hold the repository lock.
 */
async function repairProfileHistoryLinearityLocked(
  repository: Repository
): Promise<IProfileLinearityRepair> {
  const { path } = repository
  const state = await readRepositoryRefState(path)
  const branchRefs = [...state.refs.keys()].filter(ref =>
    ref.startsWith('refs/heads/')
  )
  const foreignRefs = [...state.refs.keys()].filter(
    ref => !ref.startsWith('refs/heads/')
  )

  const alreadyLinear =
    state.detachedAt === null &&
    foreignRefs.length === 0 &&
    branchRefs.length <= 1 &&
    (branchRefs.length === 0 || branchRefs[0] === state.headRef)

  if (alreadyLinear) {
    return {
      linear: true,
      foldedTips: [],
      removedRefs: [],
      reattachedHead: false,
      mergeCommits: [],
    }
  }

  const strayTips = new Map<string, string>()
  let reattachedHead = false

  // A detached HEAD is a head in its own right: commits made from it never
  // update a branch, so they vanish from `git log` the moment HEAD moves.
  if (state.detachedAt !== null) {
    const canonical = branchRefs[0] ?? `refs/heads/${await getDefaultBranch()}`
    if (!state.refs.has(canonical)) {
      await git(
        ['update-ref', canonical, state.detachedAt],
        path,
        'profileLinearityAdoptDetached'
      )
    } else {
      strayTips.set(canonical, state.detachedAt)
    }
    await git(
      ['symbolic-ref', 'HEAD', canonical],
      path,
      'profileLinearityReattach'
    )
    await git(
      ['reset', '--hard', 'HEAD'],
      path,
      'profileLinearityResetDetached'
    )
    reattachedHead = true
  }

  const headRef = state.headRef ?? branchRefs[0] ?? null
  for (const ref of [...branchRefs, ...foreignRefs]) {
    if (ref === headRef) {
      continue
    }
    const sha = state.refs.get(ref)
    if (sha !== undefined) {
      strayTips.set(ref, sha)
    }
  }

  const removedRefs = new Array<string>()
  const foldedTips = new Array<string>()

  for (const [ref, sha] of strayTips) {
    const head = await resolveHead(repository)
    if (head === null) {
      break
    }

    if (!(await isAncestorCommit(repository, sha, head))) {
      await foldDivergedTip(repository, sha, head)
      foldedTips.push(sha)
    }

    // Safe now: either the tip was already reachable, or its tree was just
    // replayed onto the canonical branch.
    if (state.refs.has(ref) && ref !== headRef) {
      await git(
        ['update-ref', '-d', ref, sha],
        path,
        'profileLinearityDropStrayRef',
        { successExitCodes: new Set([0, 1, 128]) }
      )
      removedRefs.push(ref)
    }
  }

  return {
    linear: false,
    foldedTips,
    removedRefs,
    reattachedHead,
    mergeCommits: await findMergeCommits(repository),
  }
}

/** Replay a diverged tip's tree forward, then restore the live tree. */
async function foldDivergedTip(
  repository: Repository,
  strayTip: string,
  headBeforeFold: string
): Promise<void> {
  const shortStray = strayTip.slice(0, 7)

  await git(
    ['read-tree', '-u', '--reset', strayTip],
    repository.path,
    'profileLinearityFoldTree'
  )
  await commitAllChanges(
    repository,
    operationMessage(
      `Fold diverged history ${shortStray}`,
      ProfileFoldTrailer,
      strayTip
    ),
    { allowEmpty: true, expectedParent: headBeforeFold }
  )

  const foldCommit = await resolveHead(repository)
  await git(
    ['read-tree', '-u', '--reset', headBeforeFold],
    repository.path,
    'profileLinearityRestoreTree'
  )
  await commitAllChanges(
    repository,
    operationMessage(
      `Restore state after folding ${shortStray}`,
      ProfileFoldRestoreTrailer,
      strayTip
    ),
    { allowEmpty: true, expectedParent: foldCommit }
  )
}

/** Merge commits left in the surviving timeline, newest first. */
async function findMergeCommits(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const result = await git(
    ['rev-list', '--merges', 'HEAD'],
    repository.path,
    'profileLinearityFindMerges',
    { successExitCodes: new Set([0, 128]) }
  )
  return result.stdout.trim().split(/\r?\n/g).filter(Boolean)
}

/**
 * Restore the append-only single-head invariant for one owned repository.
 *
 * Exposed for stores that adopt a repository they did not create, and for the
 * tests that prove a deliberately forked fixture is folded rather than pruned.
 */
export function repairProfileHistoryLinearity(
  repository: Repository
): Promise<IProfileLinearityRepair> {
  return withProfileRepositoryLock(repository, () =>
    repairProfileHistoryLinearityLocked(repository)
  )
}

async function profileFileExistsAtCommit(
  repository: Repository,
  sha: string,
  path: string
): Promise<boolean> {
  const result = await git(
    ['cat-file', '-e', `${sha}:${path}`],
    repository.path,
    'profileFileAtCommit',
    { successExitCodes: new Set([0, 1, 128]) }
  )
  return result.exitCode === 0
}

function renderProfileDiff(diff: IDiff, path: string): string {
  switch (diff.kind) {
    case DiffType.Text:
    case DiffType.LargeText:
      return diff.text
    case DiffType.Binary:
      return `Binary file ${path} changed.`
    case DiffType.Image:
      return `Image file ${path} changed.`
    case DiffType.Submodule:
      return `Submodule ${path} changed.`
    case DiffType.Unrenderable:
      return `Diff for ${path} cannot be rendered.`
  }
}

function normalizeNonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}
