/**
 * A synchronous, state-driven guard that stops one action per target from
 * being started twice.
 *
 * A `disabled` prop alone cannot stop a rapid double-click: React state
 * updates are asynchronous, so both clicks are dispatched before the re-render
 * that would disable the control ever happens. Callers therefore claim the
 * target through this pure reducer *first* and run the side effect only when
 * the claim is accepted, then disable the control from the same state so the
 * user also sees why nothing more will happen.
 *
 * The guard is deliberately state-driven rather than time-driven. A timer-based
 * debounce would either re-open the control while a multi-gigabyte upload is
 * still running or keep it shut after a fast failure; a claim released on
 * completion or failure tracks the real work instead.
 */

/** The set of targets whose action is currently running. */
export type InFlightGuardState = ReadonlySet<string>

/** A guard holding no claims. */
export const EmptyInFlightGuard: InFlightGuardState = new Set<string>()

export interface IInFlightClaim {
  /** The guard to store, unchanged when the claim was refused. */
  readonly state: InFlightGuardState
  /**
   * `true` when the caller now owns the target and must start the work, and
   * `false` when the target was already claimed and the caller must do nothing.
   */
  readonly accepted: boolean
}

/** Is the target's action already running? */
export function isInFlight(state: InFlightGuardState, target: string): boolean {
  return state.has(target)
}

/**
 * Claim a target so its action can start. A second claim for the same target
 * is refused until the first one is released, which is what turns a stuttered
 * double-click into a single upload.
 */
export function claimInFlight(
  state: InFlightGuardState,
  target: string
): IInFlightClaim {
  if (state.has(target)) {
    return { state, accepted: false }
  }
  const next = new Set(state)
  next.add(target)
  return { state: next, accepted: true }
}

/**
 * Release a target once its action completed or failed. Releasing a target
 * that was never claimed is a no-op so an out-of-order completion cannot
 * resurrect a stale guard.
 */
export function releaseInFlight(
  state: InFlightGuardState,
  target: string
): InFlightGuardState {
  if (!state.has(target)) {
    return state
  }
  const next = new Set(state)
  next.delete(target)
  return next
}
