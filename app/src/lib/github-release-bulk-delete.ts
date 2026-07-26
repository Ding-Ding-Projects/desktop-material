/**
 * The progress state machine for deleting a reviewed batch of GitHub releases.
 *
 * Bulk deletion used to stop at the first failure, which left the operator with
 * no way to tell an unlucky release apart from a broken batch and no record of
 * what had already gone. The batch now walks every reviewed release, records a
 * bounded reason for each one it could not delete, and reports the exact split
 * between deleted, failed, and never-attempted work.
 *
 * The reducer is deliberately pure so the determinate progress bar, the stop
 * request, and the partial-failure summary can be verified without a provider,
 * a component, or a timer. The view owns the requests; this module only owns
 * what the operator is told.
 */

/** One release the batch could not delete, with a bounded, safe reason. */
export interface IBulkReleaseDeleteFailure {
  readonly releaseId: number
  readonly tagName: string
  readonly reason: string
}

export interface IBulkReleaseDeleteState {
  /** Reviewed releases the batch set out to delete. */
  readonly total: number
  /** Releases the provider confirmed deleted. */
  readonly deleted: number
  readonly failures: ReadonlyArray<IBulkReleaseDeleteFailure>
  /** A stop was requested; the release already in flight still finishes. */
  readonly stopRequested: boolean
  readonly running: boolean
}

/** Keep a long failure list readable without hiding that it was truncated. */
export const BulkReleaseDeleteMaximumReportedFailures = 5

/** Provider text is already bounded upstream; clamp again before display. */
const MaximumFailureReasonLength = 240

/**
 * Provider text is bounded upstream, but a control character would still let
 * one message forge extra lines in the failure list. Every control character
 * becomes a space, then every run of whitespace collapses into one.
 */
function sanitizeFailureReason(reason: string): string {
  const printable = Array.from(reason, character => {
    const code = character.codePointAt(0) ?? 0
    return code < 0x20 || code === 0x7f ? ' ' : character
  }).join('')
  const collapsed = printable.replace(/\s+/g, ' ').trim()
  return collapsed.length > MaximumFailureReasonLength
    ? `${collapsed.slice(0, MaximumFailureReasonLength - 1)}…`
    : collapsed
}

/** Begin one batch over `total` reviewed releases. */
export function startBulkReleaseDelete(total: number): IBulkReleaseDeleteState {
  return {
    total: Number.isSafeInteger(total) && total > 0 ? total : 0,
    deleted: 0,
    failures: [],
    stopRequested: false,
    running: true,
  }
}

/**
 * Record one confirmed deletion. A completion that arrives after the batch
 * finished is ignored so an out-of-order response cannot resurrect the run or
 * push the counter past the reviewed total.
 */
export function recordBulkReleaseDeleteSuccess(
  state: IBulkReleaseDeleteState
): IBulkReleaseDeleteState {
  if (!state.running || bulkReleaseDeleteAttempted(state) >= state.total) {
    return state
  }
  return { ...state, deleted: state.deleted + 1 }
}

/**
 * Record one release the batch could not delete. The batch keeps running: a
 * single stale or denied release must not silently cancel the rest of the
 * reviewed work.
 */
export function recordBulkReleaseDeleteFailure(
  state: IBulkReleaseDeleteState,
  failure: IBulkReleaseDeleteFailure
): IBulkReleaseDeleteState {
  if (!state.running || bulkReleaseDeleteAttempted(state) >= state.total) {
    return state
  }
  return {
    ...state,
    failures: [
      ...state.failures,
      { ...failure, reason: sanitizeFailureReason(failure.reason) },
    ],
  }
}

/**
 * Ask the batch to stop. The release already in flight is allowed to finish so
 * the operator is never told a deletion was skipped while it was in fact sent.
 */
export function requestBulkReleaseDeleteStop(
  state: IBulkReleaseDeleteState
): IBulkReleaseDeleteState {
  return !state.running || state.stopRequested
    ? state
    : { ...state, stopRequested: true }
}

/** Close the batch so the summary replaces the live progress. */
export function finishBulkReleaseDelete(
  state: IBulkReleaseDeleteState
): IBulkReleaseDeleteState {
  return state.running ? { ...state, running: false } : state
}

/** Releases the batch has already tried, whether or not they succeeded. */
export function bulkReleaseDeleteAttempted(
  state: IBulkReleaseDeleteState
): number {
  return state.deleted + state.failures.length
}

/** Reviewed releases the batch never reached, after a stop or a hard cancel. */
export function bulkReleaseDeleteRemaining(
  state: IBulkReleaseDeleteState
): number {
  return Math.max(0, state.total - bulkReleaseDeleteAttempted(state))
}

/** The failures shown in full, and the count the display had to omit. */
export function bulkReleaseDeleteReportedFailures(
  state: IBulkReleaseDeleteState
): {
  readonly shown: ReadonlyArray<IBulkReleaseDeleteFailure>
  readonly omitted: number
} {
  const shown = state.failures.slice(
    0,
    BulkReleaseDeleteMaximumReportedFailures
  )
  return { shown, omitted: state.failures.length - shown.length }
}
