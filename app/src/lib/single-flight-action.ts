import {
  claimInFlight,
  EmptyInFlightGuard,
  InFlightGuardState,
  isInFlight,
  releaseInFlight,
} from './cheap-lfs/in-flight-guard'

type Listener = () => void

/** Return true only for a value whose completion can define an action lifetime. */
function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  )
}

/**
 * Renderer-wide synchronous single-flight coordination for consequential UI
 * actions. The target is claimed before caller code runs, and an asynchronous
 * claim stays active until the returned thenable settles. Synchronous handlers
 * release before returning, so toggles and other repeatable controls retain
 * their existing behavior without a timer-based debounce.
 */
export class SingleFlightActionRegistry {
  private state: InFlightGuardState = EmptyInFlightGuard
  private readonly listeners = new Set<Listener>()
  private readonly targetListeners = new Map<string, Set<Listener>>()

  public isActive(target: string): boolean {
    return isInFlight(this.state, target)
  }

  /** Observe every claim and release. */
  public subscribe(listener: Listener): () => void

  /** Observe only one semantic action target. */
  public subscribe(target: string, listener: Listener): () => void

  public subscribe(targetOrListener: string | Listener, listener?: Listener) {
    if (typeof targetOrListener === 'function') {
      this.listeners.add(targetOrListener)
      return () => this.listeners.delete(targetOrListener)
    }

    const target = targetOrListener
    const targetListener = listener
    if (targetListener === undefined) {
      throw new Error('A target subscription requires a listener')
    }

    const listeners = this.targetListeners.get(target) ?? new Set<Listener>()
    listeners.add(targetListener)
    this.targetListeners.set(target, listeners)
    return () => {
      listeners.delete(targetListener)
      if (listeners.size === 0) {
        this.targetListeners.delete(target)
      }
    }
  }

  /**
   * Start work only when the exact target is not already active.
   *
   * Duplicate attempts resolve to `undefined`. Synchronous work releases its
   * claim before this method returns. Thenable work releases in both settlement
   * paths, preserving the original result or rejection.
   */
  public run<T>(
    target: string,
    work: () => T | PromiseLike<T>
  ): Promise<T | undefined> {
    const claim = claimInFlight(this.state, target)
    if (!claim.accepted) {
      return Promise.resolve(undefined)
    }
    this.setState(claim.state, target)

    let started: T | PromiseLike<T>
    try {
      started = work()
    } catch (error) {
      this.release(target)
      throw error
    }

    if (!isPromiseLike(started)) {
      this.release(target)
      return Promise.resolve(started)
    }

    return Promise.resolve(started).then(
      value => {
        this.release(target)
        return value
      },
      error => {
        this.release(target)
        throw error
      }
    )
  }

  private release(target: string) {
    this.setState(releaseInFlight(this.state, target), target)
  }

  private setState(next: InFlightGuardState, target: string) {
    if (next === this.state) {
      return
    }
    this.state = next

    const notify = (listeners: Iterable<Listener>) => {
      for (const listener of Array.from(listeners)) {
        try {
          listener()
        } catch (error) {
          log.error('Single-flight action listener failed', error)
        }
      }
    }

    notify(this.targetListeners.get(target) ?? [])
    notify(this.listeners)
  }
}

/** Shared by every renderer control and alternate action entry path. */
export const singleFlightActions = new SingleFlightActionRegistry()
