import { randomUUID } from 'crypto'

export const DefaultNativeCloseDeliveryTimeoutMilliseconds = 2_000
export const DefaultNativeCloseDrainTimeoutMilliseconds = 12_000

export interface INativeClosePreparationClock {
  readonly setTimeout: (callback: () => void, milliseconds: number) => unknown
  readonly clearTimeout: (handle: unknown) => void
}

export type NativeClosePreparationReason =
  | 'prepared'
  | 'delivery-timed-out'
  | 'drain-timed-out'
  | 'send-failed'
  | 'renderer-destroyed'
  | 'reset'
  | 'timer-failed'

export interface INativeClosePreparationResult {
  readonly requestId: string
  readonly reason: NativeClosePreparationReason
}

export interface INativeClosePreparationOptions {
  /**
   * Sends a preparation request to the renderer. The request identifier must
   * be returned with every acknowledgement.
   */
  readonly sendPrepare: (requestId: string) => void

  readonly createRequestId?: () => string
  readonly deliveryTimeoutMilliseconds?: number
  readonly drainTimeoutMilliseconds?: number
  readonly clock?: INativeClosePreparationClock
}

type NativeClosePreparationPhase = 'waiting-for-start' | 'draining'

interface IPendingNativeClosePreparation {
  readonly generation: number
  readonly requestId: string
  readonly promise: Promise<INativeClosePreparationResult>
  readonly resolve: (result: INativeClosePreparationResult) => void
  phase: NativeClosePreparationPhase
  timeoutHandle: unknown
}

const defaultClock: INativeClosePreparationClock = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * Coordinates one bounded native-window close handshake without depending on
 * Electron. The short deadline proves that the renderer received the request;
 * only a matching `started` acknowledgement grants it the full drain deadline.
 * Completion is promise-only so a native close and an app-wide quit can choose
 * different continuations without coupling either policy to this controller.
 */
export class NativeClosePreparationController {
  private generation = 0
  private pending: IPendingNativeClosePreparation | null = null
  private completedPromise: Promise<INativeClosePreparationResult> | null = null
  private closeMayContinue = false

  private readonly createRequestId: () => string
  private readonly deliveryTimeoutMilliseconds: number
  private readonly drainTimeoutMilliseconds: number
  private readonly clock: INativeClosePreparationClock

  public constructor(private readonly options: INativeClosePreparationOptions) {
    this.createRequestId = options.createRequestId ?? randomUUID
    this.deliveryTimeoutMilliseconds =
      options.deliveryTimeoutMilliseconds ??
      DefaultNativeCloseDeliveryTimeoutMilliseconds
    this.drainTimeoutMilliseconds =
      options.drainTimeoutMilliseconds ??
      DefaultNativeCloseDrainTimeoutMilliseconds
    this.clock = options.clock ?? defaultClock
  }

  public get isPreparationPending(): boolean {
    return this.pending !== null
  }

  public get isReadyToClose(): boolean {
    return this.closeMayContinue
  }

  /**
   * Starts one handshake. Duplicate close events share the same promise and do
   * not send duplicate renderer requests.
   */
  public requestPreparation(): Promise<INativeClosePreparationResult> {
    if (this.pending !== null) {
      return this.pending.promise
    }
    if (this.completedPromise !== null) {
      return this.completedPromise
    }

    const requestId = this.createRequestId()
    const generation = ++this.generation
    let resolve!: (result: INativeClosePreparationResult) => void
    const promise = new Promise<INativeClosePreparationResult>(
      promiseResolve => {
        resolve = promiseResolve
      }
    )
    const pending: IPendingNativeClosePreparation = {
      generation,
      requestId,
      promise,
      resolve,
      phase: 'waiting-for-start',
      timeoutHandle: null,
    }
    this.pending = pending

    // Arm the delivery deadline before calling into transport code. A
    // synchronous send failure therefore cannot leave an unbounded request.
    let deliveryTimeoutHandle: unknown
    try {
      deliveryTimeoutHandle = this.clock.setTimeout(
        () => this.finish(pending, 'delivery-timed-out', 'waiting-for-start'),
        this.deliveryTimeoutMilliseconds
      )
    } catch {
      this.finish(pending, 'timer-failed')
      return promise
    }
    if (this.pending !== pending) {
      this.clearTimeoutSafely(deliveryTimeoutHandle)
      return promise
    }
    pending.timeoutHandle = deliveryTimeoutHandle

    try {
      this.options.sendPrepare(requestId)
    } catch {
      this.finish(pending, 'send-failed')
    }

    return promise
  }

  /**
   * Accepts renderer delivery acknowledgement and replaces the short delivery
   * deadline with the full durable-state drain deadline. A false return tells
   * the renderer not to begin durable writes for an expired request.
   */
  public started(requestId: string): boolean {
    const pending = this.pending
    if (pending === null || pending.requestId !== requestId) {
      return false
    }
    if (pending.phase === 'draining') {
      return true
    }

    const deliveryTimeoutHandle = pending.timeoutHandle
    pending.phase = 'draining'
    let drainTimeoutHandle: unknown
    try {
      drainTimeoutHandle = this.clock.setTimeout(
        () => this.finish(pending, 'drain-timed-out', 'draining'),
        this.drainTimeoutMilliseconds
      )
    } catch {
      this.finish(pending, 'timer-failed')
      return false
    }

    if (this.pending !== pending) {
      this.clearTimeoutSafely(deliveryTimeoutHandle)
      this.clearTimeoutSafely(drainTimeoutHandle)
      return false
    }
    pending.timeoutHandle = drainTimeoutHandle
    this.clearTimeoutSafely(deliveryTimeoutHandle)
    return true
  }

  /** Accepts only the current renderer request and completes its promise once. */
  public prepared(requestId: string): boolean {
    const pending = this.pending
    if (
      pending === null ||
      pending.requestId !== requestId ||
      pending.phase !== 'draining'
    ) {
      return false
    }

    return this.finish(pending, 'prepared')
  }

  /**
   * Renderer loss is terminal for the handshake. There is nothing left to
   * drain, so the caller may continue immediately instead of waiting to time
   * out.
   */
  public rendererDestroyed(): boolean {
    const pending = this.pending
    return pending !== null && this.finish(pending, 'renderer-destroyed')
  }

  /**
   * Cancels any in-flight handshake, clears its deadline, and invalidates old
   * timeout callbacks and acknowledgements. Reset never marks close as ready.
   */
  public reset(): boolean {
    const pending = this.pending
    this.generation++
    this.pending = null
    this.completedPromise = null
    this.closeMayContinue = false

    if (pending === null) {
      return false
    }

    this.clearTimeoutSafely(pending.timeoutHandle)
    pending.resolve({ requestId: pending.requestId, reason: 'reset' })
    return true
  }

  private finish(
    pending: IPendingNativeClosePreparation,
    reason: Exclude<NativeClosePreparationReason, 'reset'>,
    expectedPhase?: NativeClosePreparationPhase
  ): boolean {
    if (
      this.pending !== pending ||
      pending.generation !== this.generation ||
      (expectedPhase !== undefined && pending.phase !== expectedPhase)
    ) {
      return false
    }

    this.pending = null
    this.clearTimeoutSafely(pending.timeoutHandle)
    const result = { requestId: pending.requestId, reason } as const
    this.completedPromise = pending.promise
    this.closeMayContinue = true
    pending.resolve(result)

    return true
  }

  private clearTimeoutSafely(handle: unknown): void {
    if (handle === null || handle === undefined) {
      return
    }

    try {
      this.clock.clearTimeout(handle)
    } catch {
      // An injected clock must not be able to block reset or close completion.
    }
  }
}
