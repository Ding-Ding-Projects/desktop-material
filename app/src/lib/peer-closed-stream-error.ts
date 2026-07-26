/**
 * Recognizing the one failure family that must never be fatal: a write which
 * completed *after* the peer on the other end of the socket, pipe, or stream
 * already went away.
 *
 * Node reports these through the write request's completion callback **and**
 * through an `'error'` event on the stream. A stream with no `'error'`
 * listener at that moment turns the event into a process-fatal uncaught
 * exception:
 *
 * ```text
 * Error: write EOF
 *     at WriteWrap.onWriteComplete (node:internal/stream_base_commons:87:19)
 * ```
 *
 * Nothing about that is unrecoverable — the transfer, the credential reply, or
 * the HTTP response simply has nobody left to deliver to. The guards in the
 * subsystems that own those streams keep the event handled; this module is the
 * shared vocabulary they and the process-level backstop use to tell the benign
 * case apart from a genuine defect.
 *
 * The classifier is deliberately narrow. It matches only errors that carry the
 * shape Node gives a peer-closed stream write, so an unknown exception keeps
 * crashing the app exactly as it does today.
 */

/**
 * `errno`-style codes libuv reports when the write reaches the handle but the
 * peer is already gone. Windows named pipes (child process stdio) surface
 * `EOF`; sockets surface `EPIPE`/`ECONNRESET`/`ECONNABORTED`.
 */
const peerClosedErrnoCodes: ReadonlySet<string> = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'EOF',
  'EPIPE',
])

/**
 * Codes Node's own stream state machine raises when the local stream was torn
 * down (usually *because* the peer closed) before a queued write ran.
 */
const peerClosedStreamStateCodes: ReadonlySet<string> = new Set([
  'ERR_STREAM_ALREADY_FINISHED',
  'ERR_STREAM_DESTROYED',
  'ERR_STREAM_WRITE_AFTER_END',
])

/** Only I/O verbs. A peer-closed `connect`/`open` is a different failure. */
const peerClosedSyscalls: ReadonlySet<string> = new Set([
  'read',
  'shutdown',
  'write',
])

/**
 * Errors crossing IPC are flattened to `{ name, message, stack }`, so the
 * renderer's report of a main-process-shaped failure arrives without `code`,
 * `errno`, or `syscall`. These anchored patterns recover the classification
 * from the message alone without matching prose that merely mentions a code.
 */
const peerClosedMessagePatterns: ReadonlyArray<RegExp> = [
  /^(?:read|shutdown|write) (?:ECONNABORTED|ECONNRESET|EOF|EPIPE)$/,
  /^Cannot call write after a stream was destroyed$/,
  /^write after end$/,
  /^Cannot call end after a stream was destroyed$/,
  /^This socket has been ended by the other party$/,
  /^premature close$/,
]

function readStringProperty(value: object, key: string): string | null {
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' ? candidate : null
}

/**
 * Return the code that identifies `error` as a peer-closed write, or `null`
 * when the error is anything else.
 *
 * Exposed separately from the boolean so logs and reports can name the exact
 * condition without re-deriving it.
 */
export function classifyPeerClosedStreamError(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const code = readStringProperty(error, 'code')
  const syscall = readStringProperty(error, 'syscall')

  if (code !== null && peerClosedStreamStateCodes.has(code)) {
    return code
  }

  if (code !== null && peerClosedErrnoCodes.has(code)) {
    // A bare `ECONNRESET` with no syscall still reaches us from a few
    // transports, so accept the code when the syscall is absent — but reject
    // it when the syscall names an operation other than the I/O verbs, which
    // would be a connect/listen failure wearing a familiar code.
    if (syscall === null || peerClosedSyscalls.has(syscall)) {
      return code
    }
    return null
  }

  const message = readStringProperty(error, 'message')
  if (message === null) {
    return null
  }
  for (const pattern of peerClosedMessagePatterns) {
    if (pattern.test(message)) {
      return code ?? message
    }
  }

  return null
}

/**
 * Is this the benign "nobody left to write to" failure?
 *
 * Everything else — including every error this module has no positive evidence
 * about — is left alone so it stays as fatal as it is today.
 */
export function isPeerClosedStreamError(error: unknown): boolean {
  return classifyPeerClosedStreamError(error) !== null
}

/** The minimum surface of a writable stream these guards need. */
export interface IGuardableStream {
  readonly destroyed?: boolean
  readonly writableEnded?: boolean
  readonly writable?: boolean
  on(event: 'error', listener: (error: Error) => void): unknown
}

/**
 * Can a reply still be written to `stream`?
 *
 * Checked before every "always reply" write so the guarantee to answer a
 * waiting client never turns into a write against a socket the client already
 * dropped.
 */
export function canStillWriteTo(stream: IGuardableStream | null): boolean {
  if (stream === null || stream === undefined) {
    return false
  }
  if (stream.destroyed === true || stream.writableEnded === true) {
    return false
  }
  // `writable` is false once `end()` has been called even before the stream
  // finishes flushing, which is exactly when a second write would throw.
  return stream.writable !== false
}

/**
 * Attach a permanent `'error'` listener so a peer-closed write can never
 * become an uncaught exception.
 *
 * *Permanent* is the whole point. The crash this exists to prevent came from a
 * per-write `once('error')` listener that the write's own completion callback
 * removed — Node then emitted `'error'` on a stream with no listener left.
 * Attach this once for the lifetime of the stream instead.
 *
 * This guard keeps the *event* from being fatal; it never decides the fate of
 * the operation. Every caller already learns about the failure through its own
 * write callback, response handler, or abort path, and fails there.
 *
 * @param stream    The stream to guard.
 * @param subsystem Short name used in the log line, e.g. `cheap-lfs upload`.
 * @param onOtherError Invoked for errors that are *not* peer-closed writes. The
 *                     default logs them at error level so an unexpected stream
 *                     failure stays visible rather than disappearing.
 */
/**
 * The ambient `log` global is installed by both app processes, but this module
 * is also compiled by the script project (via with-hooks-env), which does not
 * load the app's global declarations. Declare the shape locally; the try/catch
 * in the guard keeps a genuinely absent global from ever breaking containment.
 */
declare const log: {
  warn(message: string, error?: Error): void
  error(message: string, error?: Error): void
}

export function guardStreamAgainstPeerClose(
  stream: IGuardableStream,
  subsystem: string,
  onOtherError?: (error: Error) => void
): void {
  stream.on('error', error => {
    const code = classifyPeerClosedStreamError(error)
    try {
      if (code !== null) {
        log.warn(
          `[${subsystem}] Ignoring a write to a closed peer (${code}). The operation fails through its own error path.`
        )
      } else if (onOtherError === undefined) {
        log.error(`[${subsystem}] Stream error`, error)
      }
    } catch {
      // Diagnostics must never be the reason containment fails.
    }
    if (code === null) {
      onOtherError?.(error)
    }
  })
}
