import { rename } from 'fs/promises'

/**
 * Rename a file, retrying the transient failures Windows produces.
 *
 * Temp-then-rename is the standard way to publish a file atomically, and on
 * POSIX it is: `rename(2)` replaces the destination unconditionally. On Windows
 * it is not sufficient. `MoveFileEx` fails whenever the **destination** is open
 * by anyone at that instant — not held open for long, merely *opened* — which
 * surfaces through Node as `EPERM`, and sometimes `EACCES` or `EBUSY`.
 *
 * The processes that do this are not exotic:
 *
 *   - Microsoft Defender's real-time scanner opens each file just written, to scan it
 *   - the search indexer does the same
 *   - a backup or sync client holds a read handle (OneDrive over a user profile
 *     is nearly universal)
 *   - two concurrent writers race their renames onto one destination
 *
 * The failure mode is the expensive part: the save throws, the data is lost,
 * and it happens intermittently, unreproducibly, and *more often on
 * better-protected machines*. It also reads as a correct atomic write to any
 * reviewer, because on the platform most code is written on it is one.
 *
 * Retrying is safe. Each attempt is still one indivisible rename, so a retry
 * cannot tear a write; it only tries again once whoever held the destination
 * let go. The scanner windows are milliseconds.
 */

/** Codes worth retrying. Everything else is a real error and is rethrown. */
const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

/** Total attempts, including the first. */
export const RenameAttempts = 6

/** Backoff between attempts, in milliseconds. Totals roughly 310ms. */
export const RenameBackoffMs = [10, 20, 40, 80, 160]

export interface IRenameWithRetryOptions {
  /** Injected for tests. Defaults to `fs/promises.rename`. */
  readonly rename?: (source: string, destination: string) => Promise<void>
  /** Injected for tests. Defaults to a real timer. */
  readonly wait?: (milliseconds: number) => Promise<void>
}

function isTransient(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code !== undefined && TRANSIENT_CODES.has(code)
}

const realWait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds))

/**
 * Rename `source` over `destination`, retrying transient Windows failures.
 *
 * Rethrows anything that is not transient — `ENOENT` means the temp file is
 * gone, which is a caller bug that retrying would only delay reporting, and
 * `ENOSPC` will not improve. Rethrows the final failure rather than swallowing
 * it, because callers commonly have a did-it-persist contract and that contract
 * is worth more than a save which eventually lands.
 *
 * Deliberately not branched on platform: then the behaviour under test on a
 * developer's machine is the behaviour shipped to the user on Windows.
 */
export async function renameWithRetry(
  source: string,
  destination: string,
  options: IRenameWithRetryOptions = {}
): Promise<void> {
  const doRename = options.rename ?? rename
  const wait = options.wait ?? realWait

  for (let attempt = 0; attempt < RenameAttempts; attempt += 1) {
    try {
      await doRename(source, destination)
      return
    } catch (error) {
      const last = attempt === RenameAttempts - 1
      if (last || !isTransient(error)) {
        throw error
      }
      await wait(RenameBackoffMs[attempt])
    }
  }
}
