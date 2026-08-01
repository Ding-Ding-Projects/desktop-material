export interface IGitLaunchResult {
  readonly exitCode: number
  readonly stderr: string | Buffer
}

export interface IGitLaunchRetryOptions {
  readonly args: ReadonlyArray<string>
  readonly signal?: AbortSignal
  readonly delay?: (milliseconds: number) => Promise<void>
}

const WindowsLauncherFailure = /^error launching git: .+\s*$/i

/**
 * Only the startup history probe is known to be both hook-free and read-only.
 * Restricting retries to it means a command or hook that already caused side
 * effects can never be repeated based on text alone. The launcher prefix is
 * stable while the Windows system message after it may be localized.
 */
export function isTransientGitLaunchFailure(
  result: IGitLaunchResult,
  args: ReadonlyArray<string>
): boolean {
  return (
    __WIN32__ &&
    result.exitCode !== 0 &&
    args.length === 3 &&
    args[0] === 'rev-parse' &&
    args[1] === '--verify' &&
    args[2] === 'HEAD' &&
    WindowsLauncherFailure.test(result.stderr.toString())
  )
}

const RetryDelaysMs = [75, 250] as const

export async function withTransientGitLaunchRetry<T extends IGitLaunchResult>(
  operation: () => Promise<T>,
  options: IGitLaunchRetryOptions
): Promise<T> {
  let result = await operation()

  for (const milliseconds of RetryDelaysMs) {
    if (!isTransientGitLaunchFailure(result, options.args)) {
      return result
    }

    throwIfAborted(options.signal)
    if (options.delay === undefined) {
      await wait(milliseconds, options.signal)
    } else {
      await options.delay(milliseconds)
    }
    throwIfAborted(options.signal)
    result = await operation()
  }

  return result
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException('The operation was aborted', 'AbortError')
    )
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal)
    const timer = setTimeout(finish, milliseconds)
    signal?.addEventListener('abort', abort, { once: true })

    function finish() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    function abort() {
      clearTimeout(timer)
      reject(
        signal?.reason ??
          new DOMException('The operation was aborted', 'AbortError')
      )
    }
  })
}
