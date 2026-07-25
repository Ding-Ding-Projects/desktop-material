/**
 * A fresh `index.lock` may still belong to a Git process that has not touched
 * it yet, so a lock younger than this is never treated as stale. Kept in
 * lockstep with `MinimumStaleRepositoryLockAgeMs` in `git/remove-lock.ts`.
 */
export const DefaultMinimumStaleIndexLockAgeMs = 30_000

/** Filesystem facts about `.git/index.lock` needed to reason about removal. */
export interface IIndexLockObservation {
  /** Whether the lock path exists at all. */
  readonly exists: boolean
  /** Whether the lock is a plain regular file (not a directory/socket/etc.). */
  readonly isRegularFile: boolean
  /** Whether the lock path is a symbolic link. */
  readonly isSymbolicLink: boolean
  /** Age of the lock in milliseconds (`now - mtime`); ignored when absent. */
  readonly ageMs: number
  /**
   * Ownership verdict from an OS probe:
   * - `true`  — a live process still holds the lock.
   * - `false` — no process holds it.
   * - `null`  — ownership could not be determined.
   */
  readonly ownerActive: boolean | null
}

export interface IStaleIndexLockThresholds {
  readonly minimumAgeMs: number
}

export const DefaultStaleIndexLockThresholds: IStaleIndexLockThresholds = {
  minimumAgeMs: DefaultMinimumStaleIndexLockAgeMs,
}

/**
 * The pre-operation gate's verdict for `.git/index.lock`.
 *
 * - `absent`       — no lock; proceed.
 * - `not-regular`  — symlink or non-file; refuse to touch (fail closed).
 * - `too-fresh`    — younger than the staleness age; wait, do not remove.
 * - `owner-active` — a live process owns it; wait, do not remove.
 * - `owner-unknown`— ownership indeterminate; fail closed, do not remove.
 * - `remove`       — old, regular, and provably unowned; safe to remove.
 */
export type StaleIndexLockDecision =
  | 'absent'
  | 'not-regular'
  | 'too-fresh'
  | 'owner-active'
  | 'owner-unknown'
  | 'remove'

/**
 * Pure decision for whether the stale-lock gate should remove `index.lock`
 * before a mutating operation on a large repository. It fails closed: anything
 * unusual (symlink, non-file, recent, owned, or indeterminate ownership) keeps
 * the lock in place. Only an old, regular, provably-unowned lock is removable.
 */
export function decideStaleIndexLockRemoval(
  observation: IIndexLockObservation,
  thresholds: IStaleIndexLockThresholds = DefaultStaleIndexLockThresholds
): StaleIndexLockDecision {
  if (!observation.exists) {
    return 'absent'
  }
  if (observation.isSymbolicLink || !observation.isRegularFile) {
    return 'not-regular'
  }
  if (observation.ageMs < thresholds.minimumAgeMs) {
    return 'too-fresh'
  }
  if (observation.ownerActive === true) {
    return 'owner-active'
  }
  if (observation.ownerActive === null) {
    return 'owner-unknown'
  }
  return 'remove'
}

/** True only for the verdict that authorises removing the lock. */
export function shouldRemoveStaleIndexLock(
  decision: StaleIndexLockDecision
): boolean {
  return decision === 'remove'
}

/**
 * What a cleanup pass may do with the `index.lock` of a *temporary* Git index
 * this process created for itself (for example the working-tree fingerprint
 * index under `desktop-material-commit-batch-*`).
 *
 * - `remove-directory` — no live owner is possible; the directory may go.
 * - `wait`             — a Git process may still hold the lock; await release.
 * - `abandon`          — never touch it. The directory is left for the OS
 *                        temporary-file reaper instead.
 */
export type TemporaryIndexLockAction = 'remove-directory' | 'wait' | 'abandon'

/**
 * Fail-closed cleanup plan for a temporary index directory.
 *
 * This deliberately replaces an unconditional recursive unlink. At 200k files a
 * `git add -A` holds `index.lock` for ~14 seconds; deleting that lock out from
 * under a live Git process corrupts the index it is writing, and on Windows the
 * unlink instead fails with `EBUSY` — which, thrown from a `finally`, masked
 * the real error and aborted the push before any network I/O.
 *
 * A lock which is not a plain regular file is never touched. A lock whose owner
 * is live, or whose ownership cannot be established, is awaited rather than
 * removed; only an absent lock, or one provably unowned, authorizes removal.
 * Once the wait budget is spent the directory is abandoned rather than forced.
 */
export function decideTemporaryIndexLockCleanup(
  observation: IIndexLockObservation,
  waitedMs: number,
  budgetMs: number
): TemporaryIndexLockAction {
  if (!observation.exists) {
    return 'remove-directory'
  }
  if (observation.isSymbolicLink || !observation.isRegularFile) {
    return 'abandon'
  }
  if (observation.ownerActive === false) {
    return 'remove-directory'
  }
  // `true` (a live owner) and `null` (indeterminate) both mean the lock may
  // still be in use, so both wait instead of removing.
  return waitedMs < budgetMs ? 'wait' : 'abandon'
}

/** Default budget for awaiting a temporary index lock: 60s of ~14s writes. */
export const DefaultTemporaryIndexLockWaitBudgetMs = 60_000

/** Poll interval while awaiting a temporary index lock release. */
export const DefaultTemporaryIndexLockPollMs = 250

/**
 * Bounded retry state for the lock-contention loop. The gate removes a stale
 * lock and retries the operation at most `maxAttempts` times so a genuinely
 * live lock (re-created by another process) can never spin forever.
 */
export interface ILockRetryState {
  readonly attempts: number
  readonly maxAttempts: number
}

/** Default: one removal + retry, matching the "bounded retry once" requirement. */
export const DefaultLockRetryState: ILockRetryState = {
  attempts: 0,
  maxAttempts: 1,
}

/** True while another removal-and-retry is still permitted. */
export function canRetryAfterLockContention(state: ILockRetryState): boolean {
  return state.attempts < state.maxAttempts
}

/**
 * Advance the retry counter after one removal-and-retry. Throws if called past
 * the bound so a caller can never silently exceed it.
 */
export function advanceLockRetry(state: ILockRetryState): ILockRetryState {
  if (!canRetryAfterLockContention(state)) {
    throw new Error('Stale index.lock retry budget exhausted.')
  }
  return { ...state, attempts: state.attempts + 1 }
}
