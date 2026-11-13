import { RetryActionType } from '../models/retry-actions'

/**
 * Whether Git's output says the remote host could not be reached at all:
 * name lookup failed, the connection was refused or timed out, or there is no
 * network. Sign-in failures, rejected pushes and missing repositories are not
 * matched, because the host answered in those cases.
 */
const UnreachablePatterns: ReadonlyArray<RegExp> = [
  /fatal: unable to access '.+': Could not resolve host: /,
  /fatal: unable to access '.+': Failed to connect to .+/,
  /fatal: unable to access '.+': .*(?:Connection|Operation) timed out/,
  /fatal: unable to access '.+': .*Network is unreachable/,
  /fatal: unable to access '.+': Could not resolve proxy: /,
  /ssh: Could not resolve hostname /,
  /ssh: connect to host .+ port \d+: (?:Connection timed out|Connection refused|Network is unreachable|No route to host|Operation timed out)/,
]

export function isUnreachableRemoteOutput(output: string): boolean {
  return UnreachablePatterns.some(pattern => pattern.test(output))
}

/**
 * Which remote operation a failure may offer to run again: only a push, pull
 * or fetch whose output says the host could not be reached.
 */
export function retryableRemoteOperation(
  retryActionType: RetryActionType | undefined,
  gitOutput: string | null
): 'push' | 'pull' | 'fetch' | null {
  if (gitOutput === null || !isUnreachableRemoteOutput(gitOutput)) {
    return null
  }
  switch (retryActionType) {
    case RetryActionType.Push:
      return 'push'
    case RetryActionType.Pull:
      return 'pull'
    case RetryActionType.Fetch:
      return 'fetch'
    default:
      return null
  }
}
