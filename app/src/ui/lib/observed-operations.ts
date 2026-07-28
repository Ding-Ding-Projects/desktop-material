/**
 * Helpers for promises that a user interface event handler starts.
 *
 * React throws away whatever a click handler returns, so a dispatcher call left
 * unobserved is a rejection waiting to escape. When it does it reaches the
 * renderer's global `unhandledrejection` containment in `ui/index.tsx`, which
 * cannot tell a failed push from a failed background refresh and therefore can
 * only show the deliberately generic "a background action stopped unexpectedly"
 * notice — no cause, no remedy, and deduplicated into a "Reported 2 times"
 * count when two calls fail together.
 *
 * Everything the store already reports for itself resolves rather than rejects:
 * `GitStore.performFailableOperation` catches, calls `emitError`, and returns
 * `undefined`, and `AppStore`'s error emitter is wired to `Dispatcher.postError`
 * in `App`'s constructor. A promise from `Dispatcher.push` (and its pull, fetch
 * and force-push siblings) therefore only rejects for failures that nothing has
 * reported yet — chiefly the pre-Git canonical-remote preflight, which throws
 * before a single Git command runs. Reporting such a rejection here presents it
 * exactly once; it never duplicates a failure the store already emitted.
 */

/**
 * The slice of `Dispatcher` these helpers need in order to present a failure
 * through the app's normal error machinery. Kept structural so the helpers
 * stay independent of the dispatcher module (and trivially fakeable in tests).
 */
export interface IOperationErrorPresenter {
  postError(error: Error): Promise<void>
}

/**
 * Coerce an arbitrary rejection reason into something reportable. A promise can
 * reject with any value at all, and the error machinery expects an `Error`.
 */
export function asReportableError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason
  }

  try {
    return new Error(String(reason))
  } catch {
    return new Error('The operation rejected with an unreadable reason.')
  }
}

/**
 * Observe a background operation so that a rejection becomes a log entry rather
 * than a generic user-facing notice. Use this for work the user did not ask for
 * and is not waiting on — periodic or incidental refreshes whose failure is
 * already represented in the surface's own state.
 *
 * The description completes the sentence "Contained a background failure while
 * ..." (e.g. `'refreshing provider triage'`).
 */
export function containBackgroundOperation(
  operation: Promise<unknown>,
  description: string
): void {
  operation.catch(reason => {
    try {
      log.warn(
        `Contained a background failure while ${description}.`,
        asReportableError(reason)
      )
    } catch {
      // Containment must not depend on logging succeeding.
    }
  })
}

/**
 * Observe a user-initiated operation so that a rejection is presented once
 * through the normal error machinery instead of escaping to the global
 * `unhandledrejection` containment.
 *
 * Only failures nothing has reported yet reach here — see the note at the top
 * of this module — so this presents the real error exactly once. A failure of
 * the presentation itself is contained as a diagnostic so it cannot become the
 * very unhandled rejection this helper exists to prevent.
 *
 * The description completes the sentence "presenting the failure of ..."
 * (e.g. `'the push started from the toolbar'`).
 */
export function observeUserInitiatedOperation(
  operation: Promise<unknown>,
  presenter: IOperationErrorPresenter,
  description: string
): void {
  containBackgroundOperation(
    operation.catch(reason => presenter.postError(asReportableError(reason))),
    `presenting the failure of ${description}`
  )
}
