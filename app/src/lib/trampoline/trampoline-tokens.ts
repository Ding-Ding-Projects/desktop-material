import { ChildProcess } from 'child_process'

/**
 * The lifecycle state of a single trampoline token.
 *
 * A token authorizes one Git operation to ask Desktop for credentials, so it
 * has to remain valid for exactly as long as that operation can still ask.
 * That is *not* the same as the lifetime of the promise which started it: Git
 * routinely outlives the promise which spawned it. An operation can time out
 * (see `updateRemoteHEAD`), be cancelled, exceed its output buffer, or - as
 * with `spawnGit` - resolve as soon as the process has been spawned while the
 * process itself runs for minutes or hours.
 *
 * Revoking on promise settlement alone therefore left a very much alive Git
 * process holding a token the app had already thrown away. When that process
 * later invoked the askpass or credential trampoline the server rejected it,
 * which both broke that operation and, because the reply never arrived, left
 * Git wedged on a socket that was never closed while still holding its lock
 * files.
 */
interface ITrampolineTokenState {
  /**
   * The number of live child processes which may still present this token.
   * The token survives revocation while this is greater than zero.
   */
  leaseCount: number

  /** Whether the operation which requested this token has finished. */
  revoked: boolean

  /** Callbacks to run once the token has been disposed of for good. */
  readonly disposalCallbacks: Array<() => void>
}

const trampolineTokens = new Map<string, ITrampolineTokenState>()

/**
 * Tokens which were disposed of recently.
 *
 * This exists purely so a refusal can be logged accurately - an expired token
 * from one of our own operations is an ordinary race, whereas a token this app
 * never issued is worth noticing. Membership here never makes a token usable
 * again.
 */
const recentlyDisposedTokens = new Set<string>()
const MaxRememberedDisposedTokens = 100

function rememberDisposedToken(token: string) {
  recentlyDisposedTokens.add(token)

  while (recentlyDisposedTokens.size > MaxRememberedDisposedTokens) {
    const oldest = recentlyDisposedTokens.values().next()
    if (oldest.done === true) {
      break
    }
    recentlyDisposedTokens.delete(oldest.value)
  }
}

function requestTrampolineToken() {
  const token = crypto.randomUUID()
  trampolineTokens.set(token, {
    leaseCount: 0,
    revoked: false,
    disposalCallbacks: [],
  })
  return token
}

function disposeTrampolineTokenIfUnused(
  token: string,
  state: ITrampolineTokenState
) {
  if (!state.revoked || state.leaseCount > 0) {
    return
  }

  trampolineTokens.delete(token)
  rememberDisposedToken(token)

  // Splice so a callback which (directly or indirectly) disposes again cannot
  // run the same cleanup twice.
  for (const callback of state.disposalCallbacks.splice(0)) {
    try {
      callback()
    } catch (error) {
      log.error('Error while disposing of trampoline token state', error)
    }
  }
}

function revokeTrampolineToken(token: string) {
  const state = trampolineTokens.get(token)

  if (state === undefined) {
    return
  }

  state.revoked = true
  disposeTrampolineTokenIfUnused(token, state)
}

/** Checks if a given trampoline token is valid. */
export function isValidTrampolineToken(token: string) {
  return trampolineTokens.has(token)
}

/**
 * Whether a token was issued by this app and has since been disposed of.
 *
 * Only used to add context to a refusal; a disposed token is never accepted.
 */
export function wasTrampolineTokenRecentlyDisposed(token: string) {
  return recentlyDisposedTokens.has(token)
}

/**
 * Register a callback to run when the token is disposed of, i.e. once the
 * operation which requested it has finished *and* every child process holding
 * it has exited.
 *
 * Per-token state which the trampoline handlers read (the working directory,
 * the forced account, whether this is a background task) has to live exactly
 * this long, otherwise a late-but-valid credential request would be served
 * with the wrong context.
 *
 * If the token has already been disposed of the callback runs immediately.
 */
export function onTrampolineTokenDisposed(token: string, callback: () => void) {
  const state = trampolineTokens.get(token)

  if (state === undefined) {
    callback()
    return
  }

  state.disposalCallbacks.push(callback)
}

/**
 * Keep a token valid beyond the lifetime of the promise which requested it.
 *
 * Returns a release function which is safe to call more than once. The token
 * is disposed of once it has been revoked and every lease has been released.
 * Retaining an unknown (already disposed) token is a no-op which never
 * resurrects it.
 */
export function retainTrampolineToken(token: string): () => void {
  const state = trampolineTokens.get(token)

  if (state === undefined) {
    return () => {}
  }

  state.leaseCount++
  let released = false

  return () => {
    if (released) {
      return
    }
    released = true
    state.leaseCount--
    disposeTrampolineTokenIfUnused(token, state)
  }
}

const processIsRunning = (child: ChildProcess) =>
  child.exitCode === null && child.signalCode === null

/**
 * Tie a token's lifetime to a Git child process so it stays valid until that
 * process has actually exited, even if the operation which spawned it has
 * already timed out, been cancelled, or otherwise settled.
 *
 * There is deliberately no additional time limit here. A legitimate operation
 * (a multi-gigabyte push, a Cheap LFS upload) can run for hours, and expiring
 * its token mid-transfer is the exact failure this is fixing. The lease is
 * bounded by the process itself: it is released on `close`, on `error`, and
 * immediately if the process has already exited.
 */
export function keepTrampolineTokenAliveUntilExit(
  token: string,
  child: ChildProcess
) {
  if (!processIsRunning(child)) {
    return
  }

  const release = retainTrampolineToken(token)

  child.once('close', release)
  child.once('error', release)
}

/**
 * Allows invoking a function with a short-lived trampoline token that will be
 * revoked right after the function finishes.
 *
 * Revocation is not necessarily disposal: a child process which is still
 * running can hold the token alive until it exits, see
 * `keepTrampolineTokenAliveUntilExit`.
 *
 * @param fn Function to invoke with the trampoline token.
 */
export async function withTrampolineToken<T>(
  fn: (token: string) => Promise<T>
): Promise<T> {
  const token = requestTrampolineToken()
  let result

  try {
    result = await fn(token)
  } finally {
    revokeTrampolineToken(token)
  }

  return result
}
