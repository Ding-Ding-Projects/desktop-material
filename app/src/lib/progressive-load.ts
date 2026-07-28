/**
 * Race-safe progressive loading for a single surface.
 *
 * A surface that loads asynchronously has three hard requirements which are
 * easy to get subtly wrong by hand, so they live here once instead of being
 * re-derived at every call site:
 *
 * 1. **Out-of-order responses never win.** When a second load starts before the
 *    first has settled, the first result must be discarded even if it arrives
 *    last. Nothing here compares timestamps or races a timer; ordering is
 *    decided by a monotonic token issued when the load starts.
 * 2. **Rejections are never swallowed.** A failed load moves the surface into
 *    an explicit `failed` state carrying the real `Error`, so the UI can name
 *    what went wrong and offer a retry. It is never turned into "empty" or
 *    left as a permanent spinner.
 * 3. **Cached data stays visible while a refresh runs.** A reload of a surface
 *    that already has a value reports `refreshing`, keeping the previous value
 *    readable. This is only correct where a stale read cannot change what an
 *    action does, so the decision is the caller's, made by choosing whether to
 *    `reset()` before running.
 *
 * Nothing in this module introduces artificial delay. There are no timers at
 * all; every transition is driven by the work actually settling.
 */

/** The lifecycle of one progressively loaded surface. */
export type ProgressiveLoadStatus =
  /** Nothing has been requested yet. */
  | 'idle'
  /** A first load is running and there is nothing to show yet. */
  | 'loading'
  /** A load is running while a previously loaded value stays visible. */
  | 'refreshing'
  /** The most recent accepted load produced a value. */
  | 'ready'
  /** The most recent accepted load rejected; `error` says why. */
  | 'failed'

/** The observable state of a progressively loaded surface. */
export interface IProgressiveLoadState<T> {
  readonly status: ProgressiveLoadStatus
  /**
   * The most recent successfully loaded value, retained across a refresh and
   * across a failure so the surface can keep showing what it already had.
   */
  readonly value: T | null
  /** The error from the most recent accepted failure, never discarded. */
  readonly error: Error | null
}

/** The starting state of a surface, optionally seeded with a cached value. */
export function initialProgressiveLoadState<T>(
  value: T | null = null
): IProgressiveLoadState<T> {
  return {
    status: value === null ? 'idle' : 'ready',
    value,
    error: null,
  }
}

/** Coerce an unknown rejection reason into a real `Error`. */
export function asError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason
  }
  return new Error(typeof reason === 'string' ? reason : String(reason))
}

/**
 * A monotonic ordering gate for overlapping asynchronous loads.
 *
 * Every load takes a token from `begin()` before it starts and offers
 * that token to `accept()` when it settles. A token is accepted only
 * when it is strictly newer than the last accepted one and has not been
 * cancelled, which is what makes a slow first response unable to clobber a
 * fast second one.
 */
export class LatestLoadGate {
  private issued = 0
  private accepted = 0
  private cancelledThrough = 0

  /** Take the token identifying a load that is starting now. */
  public begin(): number {
    this.issued += 1
    return this.issued
  }

  /** True while `token` identifies the most recently started load. */
  public isLatest(token: number): boolean {
    return token === this.issued && token > this.cancelledThrough
  }

  /**
   * Claim the right to apply `token`'s result.
   *
   * Returns false when a newer result has already been applied or when the
   * load was cancelled, in which case the caller must drop its result.
   */
  public accept(token: number): boolean {
    if (token <= this.accepted || token <= this.cancelledThrough) {
      return false
    }
    this.accepted = token
    return true
  }

  /**
   * Abandon every load that is currently in flight.
   *
   * Their results will be refused by `accept()`. Loads started after
   * this call are unaffected.
   */
  public cancelInFlight(): void {
    this.cancelledThrough = this.issued
  }
}

/**
 * Drives one surface's {@linkcode IProgressiveLoadState} through overlapping
 * loads without races, fake delays, or lost errors.
 */
export class ProgressiveLoad<T> {
  private readonly gate = new LatestLoadGate()
  private readonly onChanged: (state: IProgressiveLoadState<T>) => void
  private state: IProgressiveLoadState<T>
  private disposed = false

  public constructor(
    onChanged: (state: IProgressiveLoadState<T>) => void,
    cachedValue: T | null = null
  ) {
    this.onChanged = onChanged
    this.state = initialProgressiveLoadState(cachedValue)
  }

  /** The current state. Cheap; safe to call from render. */
  public getState(): IProgressiveLoadState<T> {
    return this.state
  }

  /**
   * Run `work` as the newest load for this surface.
   *
   * Never rejects: a rejection becomes a `failed` state carrying the real
   * error, so `void load.run(...)` cannot produce an unhandled rejection and
   * cannot hide a failure either. Resolves to true when this load's result was
   * the one applied, and false when it was superseded, cancelled, or disposed.
   */
  public async run(work: () => Promise<T>): Promise<boolean> {
    if (this.disposed) {
      return false
    }

    const token = this.gate.begin()
    const cached = this.state.value

    this.setState({
      // A surface with nothing to show says so; one that already has a value
      // keeps showing it rather than flashing back to a spinner.
      status: cached === null ? 'loading' : 'refreshing',
      value: cached,
      error: null,
    })

    try {
      const value = await work()
      if (this.disposed || !this.gate.accept(token)) {
        return false
      }
      this.setState({ status: 'ready', value, error: null })
      return true
    } catch (e) {
      const error = asError(e)
      if (this.disposed || !this.gate.accept(token)) {
        return false
      }
      // The previously loaded value survives the failure so the surface can
      // show stale-but-real data next to an honest error and a retry.
      this.setState({ status: 'failed', value: this.state.value, error })
      return true
    }
  }

  /**
   * Discard the cached value and refuse every in-flight load's result.
   *
   * Use this when the surface's identity changes (a different repository, a
   * different module) so a response for the previous subject can never be
   * painted as if it belonged to the new one.
   */
  public reset(cachedValue: T | null = null): void {
    this.gate.cancelInFlight()
    if (this.disposed) {
      return
    }
    this.setState(initialProgressiveLoadState(cachedValue))
  }

  /** Stop emitting changes; in-flight results are dropped on arrival. */
  public dispose(): void {
    this.gate.cancelInFlight()
    this.disposed = true
  }

  private setState(state: IProgressiveLoadState<T>): void {
    this.state = state
    this.onChanged(state)
  }
}
