/**
 * Race-safe progressive loading for a single surface.
 *
 * Every request receives a monotonic token, rejections become explicit failed
 * state, and a previously verified value can remain visible while a refresh
 * runs. Nothing here introduces a timer or artificial delay.
 */

/** Observable state for an asynchronously loaded value. */
export type ProgressiveLoadState<T> =
  | {
      readonly kind: 'idle'
      readonly value: T | null
    }
  | {
      readonly kind: 'loading'
      readonly value: T | null
    }
  | {
      readonly kind: 'ready'
      readonly value: T
    }
  | {
      readonly kind: 'failed'
      readonly value: T | null
      readonly error: Error
    }

export interface IProgressiveLoadCompletion<T> {
  /**
   * Whether this request still owned the load when it completed. A false value
   * means that a newer request, reset, or disposal superseded it.
   */
  readonly accepted: boolean
  readonly state: ProgressiveLoadState<T>
}

/** Convert a rejected value into an actionable, renderable Error. */
export function normalizeProgressiveLoadError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  try {
    return new Error(String(error))
  } catch {
    return new Error('Unknown progressive loading failure')
  }
}

/** Compatibility name for callers which normalize arbitrary rejection values. */
export const asError = normalizeProgressiveLoadError

/**
 * Monotonic request ownership. Only the newest issued token may publish.
 *
 * Checking the newest issued token, rather than merely the newest completed
 * token, also rejects a slow first result that settles while a newer request
 * is still running.
 */
export class LatestLoadGate {
  private generation = 0
  private lastAccepted = 0

  public begin(): number {
    return ++this.generation
  }

  public isLatest(token: number): boolean {
    return token === this.generation && token > this.lastAccepted
  }

  public accept(token: number): boolean {
    if (!this.isLatest(token)) {
      return false
    }

    this.lastAccepted = token
    return true
  }

  /** Refuse every request currently in flight. */
  public cancel(): void {
    this.generation++
  }

  /** Descriptive alias retained for lifecycle-oriented callers. */
  public cancelInFlight(): void {
    this.cancel()
  }
}

/**
 * Drives one value through newest-request-wins progressive loading.
 *
 * `run` never rejects. A source rejection resolves to a failed state containing
 * the real Error, so launching it with `void` cannot create an unhandled
 * rejection. The last verified value remains available while a refresh runs
 * and after a failed refresh.
 */
export class ProgressiveLoad<T> {
  private readonly gate = new LatestLoadGate()
  private currentState: ProgressiveLoadState<T>
  private disposed = false

  public constructor(initialValue: T | null = null) {
    this.currentState =
      initialValue === null
        ? { kind: 'idle', value: null }
        : { kind: 'ready', value: initialValue }
  }

  public get state(): ProgressiveLoadState<T> {
    return this.currentState
  }

  /** Compatibility accessor for render paths which prefer a method. */
  public getState(): ProgressiveLoadState<T> {
    return this.currentState
  }

  public reset(value: T | null = null): ProgressiveLoadState<T> {
    this.gate.cancel()
    if (!this.disposed) {
      this.currentState =
        value === null ? { kind: 'idle', value: null } : { kind: 'idle', value }
    }
    return this.currentState
  }

  /** Permanently stop this loader from accepting or emitting later results. */
  public dispose(): void {
    this.gate.cancel()
    this.disposed = true
  }

  public async run(
    source: () => Promise<T>
  ): Promise<IProgressiveLoadCompletion<T>> {
    if (this.disposed) {
      return { accepted: false, state: this.currentState }
    }

    const token = this.gate.begin()
    const cachedValue = this.currentState.value
    this.currentState = { kind: 'loading', value: cachedValue }

    try {
      const value = await source()
      if (this.disposed || !this.gate.accept(token)) {
        return { accepted: false, state: this.currentState }
      }

      this.currentState = { kind: 'ready', value }
      return { accepted: true, state: this.currentState }
    } catch (error) {
      if (this.disposed || !this.gate.accept(token)) {
        return { accepted: false, state: this.currentState }
      }

      this.currentState = {
        kind: 'failed',
        value: cachedValue,
        error: normalizeProgressiveLoadError(error),
      }
      return { accepted: true, state: this.currentState }
    }
  }
}
