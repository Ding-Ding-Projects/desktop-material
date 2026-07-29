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

/**
 * Keep a renderer-local failure actionable without painting a developer's
 * absolute installation path into the repository surface or notification.
 *
 * Webpack's ChunkLoadError includes the complete `file:///C:/…/out/chunk.js`
 * URL. The chunk name and failure remain useful; the profile/worktree prefix
 * does not. HTTP(S) provider URLs are deliberately left alone.
 */
const LocalProgressiveLoadPathPattern =
  /(^|[^A-Za-z0-9_])(?:file:\/{2,4}(?:[A-Za-z]:[\\/]|[^/\\\s]+[\\/])|[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])(?:[^\r\n]*?[\\/])?([^\\/?#\r\n]+?\.[A-Za-z0-9]{1,16})(?:[?#][^\s)\]}]*)?(?=[\s\p{P}\p{S}]|$)/gimu

function sanitizeLocalProgressiveLoadPath(message: string): string {
  return message.replace(
    LocalProgressiveLoadPathPattern,
    (
      match: string,
      prefix: string,
      basename: string,
      offset: number,
      source: string
    ) => {
      // A provider URL is not a local path even if one of its route segments
      // happens to resemble `C:/…`.
      const candidateOffset = offset + prefix.length
      const tokenBoundary = Math.max(
        source.lastIndexOf(' ', candidateOffset - 1),
        source.lastIndexOf('\t', candidateOffset - 1),
        source.lastIndexOf('\r', candidateOffset - 1),
        source.lastIndexOf('\n', candidateOffset - 1)
      )
      if (
        /^https?:\/\/\S*$/i.test(
          source.slice(tokenBoundary + 1, candidateOffset)
        )
      ) {
        return match
      }

      return `${prefix}<local app asset>/${basename}`
    }
  )
}

/** Convert a rejected value into an actionable, renderable, privacy-safe Error. */
export function normalizeProgressiveLoadError(error: unknown): Error {
  try {
    if (error instanceof Error) {
      const originalMessage = error.message
      const message = sanitizeLocalProgressiveLoadPath(originalMessage)
      if (message === originalMessage) {
        return error
      }

      const sanitized = new Error(message)
      sanitized.name = error.name
      return sanitized
    }

    return new Error(sanitizeLocalProgressiveLoadPath(String(error)))
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
