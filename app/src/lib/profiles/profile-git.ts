import { mkdir, stat, rm } from 'fs/promises'
import { join } from 'path'
import { git } from '../git/core'
import { initGitRepository } from '../git/init'
import { Repository } from '../../models/repository'
import { composeProfileCommitMessage } from '../../models/profile'

const commitAuthorName = 'Desktop Material'
const commitAuthorEmail = 'desktop-material@localhost'

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

  return profileRepository(path)
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
  message: string
): Promise<boolean> {
  const { path } = repository

  await git(['add', '-A'], path, 'profileStage')

  const status = await git(['status', '--porcelain'], path, 'profileStatus')
  if (status.stdout.trim().length === 0) {
    return false
  }

  await git(
    [
      '-c',
      `user.name=${commitAuthorName}`,
      '-c',
      `user.email=${commitAuthorEmail}`,
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      message,
    ],
    path,
    'profileCommit'
  )

  return true
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
    private readonly delayMs: number = 1000
  ) {}

  /** Record a change and (re)start the debounce timer. */
  public schedule(description: string): void {
    this.pending.push(description)

    if (this.timer !== null) {
      clearTimeout(this.timer)
    }

    this.timer = setTimeout(() => {
      this.flush().catch(err =>
        log.error('Failed to commit profile changes', err)
      )
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

    const descriptions = this.pending.splice(0)
    if (descriptions.length === 0) {
      return this.chain
    }

    const message = this.composeMessage(descriptions)
    this.chain = this.chain
      .then(() => commitAllChanges(this.repository, message))
      .then(() => undefined)
      .catch(err => log.error('Failed to commit profile changes', err))

    return this.chain
  }
}
