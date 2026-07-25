import { lstat, rm } from 'fs/promises'
import { join } from 'path'

import {
  DefaultTemporaryIndexLockPollMs,
  DefaultTemporaryIndexLockWaitBudgetMs,
  IIndexLockObservation,
  TemporaryIndexLockAction,
  decideTemporaryIndexLockCleanup,
} from '../large-repository/stale-index-lock'

/** How a temporary index directory cleanup pass ended. */
export type TemporaryIndexCleanupOutcome =
  /** The directory was removed. */
  | 'removed'
  /** The lock was still held (or unsafe to touch); the directory was left. */
  | 'abandoned'

export interface ITemporaryIndexCleanupDependencies {
  /** Observe `<directory>/index.lock`. Never throws for a missing lock. */
  readonly observe: (lockPath: string) => Promise<IIndexLockObservation>
  /** Remove the temporary directory and its contents. */
  readonly removeDirectory: (directoryPath: string) => Promise<void>
  /** Sleep between polls. */
  readonly delay: (milliseconds: number) => Promise<void>
  /** Report an abandoned directory or an unexpected removal failure. */
  readonly onAbandoned: (directoryPath: string, reason: string) => void
  readonly waitBudgetMs: number
  readonly pollIntervalMs: number
}

/** `EBUSY`/`EPERM` from an unlink is the OS proving a live owner holds it. */
export function isLockHeldError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
}

async function observeIndexLock(
  lockPath: string
): Promise<IIndexLockObservation> {
  try {
    const stats = await lstat(lockPath)
    return {
      exists: true,
      isRegularFile: stats.isFile(),
      isSymbolicLink: stats.isSymbolicLink(),
      ageMs: Math.max(0, Date.now() - stats.mtimeMs),
      // A cheap `lstat` cannot prove who owns the lock, and the Restart Manager
      // probe is far too expensive for this hot path. Reporting `null` keeps
      // the decision fail-closed: an existing lock is awaited, never unlinked.
      ownerActive: null,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      return {
        exists: false,
        isRegularFile: false,
        isSymbolicLink: false,
        ageMs: 0,
        ownerActive: null,
      }
    }
    // An unreadable lock path is not provably absent, so treat it as present
    // and indeterminate rather than deleting the directory around it.
    return {
      exists: true,
      isRegularFile: false,
      isSymbolicLink: false,
      ageMs: 0,
      ownerActive: null,
    }
  }
}

const defaultDependencies: ITemporaryIndexCleanupDependencies = {
  observe: observeIndexLock,
  removeDirectory: path => rm(path, { recursive: true, force: true }),
  delay: milliseconds =>
    new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
  onAbandoned: (directoryPath, reason) =>
    log.warn(
      `Left the temporary Git index directory ${directoryPath} in place: ${reason}`
    ),
  waitBudgetMs: DefaultTemporaryIndexLockWaitBudgetMs,
  pollIntervalMs: DefaultTemporaryIndexLockPollMs,
}

/**
 * Remove a temporary Git index directory without ever unlinking a live
 * `index.lock`, and without ever throwing.
 *
 * The previous behavior — an unconditional `rm(dir, { recursive: true })` in a
 * `finally` — raced the `git add -A` that fills the fingerprint index. At 200k
 * files that staging pass holds `index.lock` for ~14 seconds, so on Windows the
 * unlink failed with `EBUSY`; because it was thrown from a `finally` it both
 * replaced the real underlying error and aborted the push before any network
 * I/O. Cleanup of a scratch directory is never a reason to fail an operation:
 * this waits for the lock to be released, and abandons the directory to the OS
 * temporary-file reaper if it is not.
 */
export async function removeTemporaryGitIndexDirectory(
  directoryPath: string,
  overrides: Partial<ITemporaryIndexCleanupDependencies> = {}
): Promise<TemporaryIndexCleanupOutcome> {
  const dependencies = { ...defaultDependencies, ...overrides }
  const pollIntervalMs = Math.max(1, Math.floor(dependencies.pollIntervalMs))
  const waitBudgetMs = Math.max(0, Math.floor(dependencies.waitBudgetMs))
  const lockPath = join(directoryPath, 'index.lock')
  let waitedMs = 0

  while (true) {
    let action: TemporaryIndexLockAction
    try {
      action = decideTemporaryIndexLockCleanup(
        await dependencies.observe(lockPath),
        waitedMs,
        waitBudgetMs
      )
    } catch (error) {
      dependencies.onAbandoned(
        directoryPath,
        `its lock could not be inspected (${String(error)})`
      )
      return 'abandoned'
    }

    if (action === 'abandon') {
      dependencies.onAbandoned(
        directoryPath,
        'its Git index lock is still held or is not a plain file'
      )
      return 'abandoned'
    }

    if (action === 'wait') {
      await dependencies.delay(pollIntervalMs)
      waitedMs += pollIntervalMs
      continue
    }

    try {
      await dependencies.removeDirectory(directoryPath)
      return 'removed'
    } catch (error) {
      // The OS just proved an owner is live even though the lock looked gone.
      // Treat that exactly like `wait` rather than escalating to a forced
      // delete, and never let it escape as an operation failure.
      if (isLockHeldError(error) && waitedMs < waitBudgetMs) {
        await dependencies.delay(pollIntervalMs)
        waitedMs += pollIntervalMs
        continue
      }
      dependencies.onAbandoned(
        directoryPath,
        `it could not be removed (${String(error)})`
      )
      return 'abandoned'
    }
  }
}
