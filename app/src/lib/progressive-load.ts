/**
 * State for an asynchronous value which may retain a previously safe value
 * while a newer request is running.
 */
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
   * means that a newer request or reset superseded it.
   */
  readonly accepted: boolean
  readonly state: ProgressiveLoadState<T>
}

/** Convert rejected non-Error values into an actionable, renderable Error. */
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

/**
 * Monotonic request ownership. Only the newest issued token may publish.
 *
 * Cancellation advances the generation instead of trying to cancel arbitrary
 * promises. This makes the boundary useful for APIs which do not expose an
 * AbortSignal while still preventing late completions from mutating UI state.
 */
export class LatestLoadGate {
  private generation = 0
  private lastAccepted = 0

  public begin(): number {
    return ++this.generation
  }

  public accept(token: number): boolean {
    if (token !== this.generation || token <= this.lastAccepted) {
      return false
    }

    this.lastAccepted = token
    return true
  }

  public cancel(): void {
    this.generation++
  }
}

/**
 * A small newest-request-wins state machine for progressive asynchronous data.
 *
 * `run` always handles the source promise's rejection and resolves with a
 * failed state containing the real Error. Callers may safely launch it with
 * `void` without creating an unhandled rejection.
 */
export class ProgressiveLoad<T> {
  private readonly gate = new LatestLoadGate()
  private currentState: ProgressiveLoadState<T>

  public constructor(initialValue: T | null = null) {
    this.currentState = { kind: 'idle', value: initialValue }
  }

  public get state(): ProgressiveLoadState<T> {
    return this.currentState
  }

  public reset(value: T | null = null): ProgressiveLoadState<T> {
    this.gate.cancel()
    this.currentState = { kind: 'idle', value }
    return this.currentState
  }

  public async run(
    source: () => Promise<T>
  ): Promise<IProgressiveLoadCompletion<T>> {
    const token = this.gate.begin()
    const cachedValue = this.currentState.value
    this.currentState = { kind: 'loading', value: cachedValue }

    try {
      const value = await source()
      if (!this.gate.accept(token)) {
        return { accepted: false, state: this.currentState }
      }

      this.currentState = { kind: 'ready', value }
      return { accepted: true, state: this.currentState }
    } catch (error) {
      if (!this.gate.accept(token)) {
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
