import { createWriteStream } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable, Transform, Writable } from 'stream'
import { pipeline } from 'stream/promises'

/**
 * Largest hook payload spooled to disk before a hook is refused.
 *
 * Every client-side hook Desktop Material intercepts receives a small,
 * line-oriented payload (one line per pushed ref for `pre-push`, one line per
 * ref update for `reference-transaction`). 64 MiB is orders of magnitude above
 * any realistic payload while still refusing an unbounded producer instead of
 * filling the temporary volume.
 */
export const MaximumHookStdinBytes = 64 * 1024 * 1024

/** A hook whose standard input exceeded the spooling budget. */
export class HookStdinTooLargeError extends Error {
  public constructor(public readonly maximumBytes: number) {
    super(
      `The Git hook produced more than ${maximumBytes} bytes of standard input.`
    )
    this.name = 'HookStdinTooLargeError'
  }
}

/** A spooled hook payload plus the cleanup its caller owes. */
export interface ISpooledHookStdin {
  /** Absolute path handed to `git hook run --to-stdin=`. */
  readonly path: string
  readonly byteLength: number
  /** Idempotent, never-throwing removal of the spool directory. */
  readonly dispose: () => Promise<void>
}

/** Injectable seams; production uses a private OS temporary directory. */
export interface ISpoolHookStdinDependencies {
  readonly makeDirectory: () => Promise<string>
  readonly createSink: (path: string) => Writable
  readonly removeDirectory: (path: string) => Promise<void>
}

const defaultDependencies: ISpoolHookStdinDependencies = {
  makeDirectory: () => mkdtemp(join(tmpdir(), 'desktop-hook-stdin-')),
  createSink: path => createWriteStream(path),
  removeDirectory: path => rm(path, { recursive: true, force: true }),
}

/**
 * Copy a hook's proxied standard input into a real file and return its path.
 *
 * `git hook run --to-stdin=<path>` opens `<path>` itself, so the path has to be
 * something the Git binary can open. The app used to pass the literal string
 * `/dev/stdin`, which only resolves on a platform where Git links a POSIX
 * runtime. Git for Windows is a native Win32 program whose `open()` special
 * cases only `/dev/null`, so `/dev/stdin` was resolved as an ordinary
 * filesystem path and every hook run died before the hook was even spawned
 * (`fatal: could not open '/dev/stdin' for reading`, exit 128). Spooling to a
 * real file fixes that for every hook, and additionally makes the hook's own
 * `< /dev/stdin` redirections work under the bundled MSYS shell: the MSYS
 * runtime can re-open a disk-file handle through `/proc/self/fd/0`, but cannot
 * re-open an anonymous Windows pipe inherited from a non-MSYS parent.
 *
 * The payload is streamed to disk, never buffered in memory, and refused once
 * it crosses `maximumBytes`. The trade-off is that the hook starts after its
 * input has been received in full rather than incrementally; every hook this
 * app intercepts is written-then-closed by Git before it waits for the hook, so
 * no interception loses interactivity.
 */
export async function spoolHookStdinToFile(
  stdin: Readable,
  maximumBytes: number = MaximumHookStdinBytes,
  dependencies: Partial<ISpoolHookStdinDependencies> = {}
): Promise<ISpooledHookStdin> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new RangeError('A hook stdin spool needs a positive byte budget.')
  }

  const { makeDirectory, createSink, removeDirectory } = {
    ...defaultDependencies,
    ...dependencies,
  }

  const directory = await makeDirectory()
  const path = join(directory, 'stdin')
  const dispose = async () => {
    await removeDirectory(directory).catch(() => {})
  }

  let byteLength = 0
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      byteLength += Buffer.byteLength(chunk)
      if (byteLength > maximumBytes) {
        callback(new HookStdinTooLargeError(maximumBytes))
        return
      }
      callback(null, chunk)
    },
  })

  try {
    await pipeline(stdin, meter, createSink(path))
  } catch (error) {
    await dispose()
    throw error
  }

  return { path, byteLength, dispose }
}
