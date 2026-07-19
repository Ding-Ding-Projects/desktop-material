import { LogLevel } from '../log-level'

/** Receives every renderer log line that passes the verbosity gate. */
export type LogSink = (level: LogLevel, message: string) => void

let sink: LogSink | null = null
let verboseEnabled = false
let suppressionDepth = 0

/**
 * Profile repositories use Git to version settings, notifications, and the
 * log-history file itself. Git performance messages from those internal
 * operations must not be mirrored into log history: recording the log-history
 * commit would schedule another commit, whose performance log would schedule
 * another commit indefinitely.
 */
function isProfileRepositoryBookkeeping(message: string): boolean {
  return /\bExecuting profile[A-Z][A-Za-z]*:/.test(message)
}

/** Wire (or clear) the store that mirrors renderer log lines. */
export function registerLogSink(nextSink: LogSink | null): void {
  sink = nextSink
}

/** Gate whether debug-level lines are forwarded to the registered sink. */
export function setLogSinkVerbose(enabled: boolean): void {
  verboseEnabled = enabled
}

/**
 * Keep renderer logging active while temporarily preventing its history mirror
 * from observing messages produced by the mirror's own persistence work.
 * Nesting is supported so overlapping flushes cannot resume the sink early.
 */
export async function runWithLogSinkSuppressed<T>(
  operation: () => Promise<T>
): Promise<T> {
  suppressionDepth++
  try {
    return await operation()
  } finally {
    suppressionDepth--
  }
}

/**
 * Forward one formatted log line to the registered sink. Debug lines are
 * dropped unless verbose logging is enabled, and a sink failure must never
 * break logging itself.
 */
export function forwardToLogSink(level: LogLevel, message: string): void {
  if (
    sink === null ||
    suppressionDepth > 0 ||
    (level === 'debug' && !verboseEnabled) ||
    isProfileRepositoryBookkeeping(message)
  ) {
    return
  }

  try {
    sink(level, message)
  } catch {
    // Logging must never fail because the log mirror did.
  }
}
