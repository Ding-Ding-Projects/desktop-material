import {
  claimInFlight,
  EmptyInFlightGuard,
  InFlightGuardState,
  isInFlight,
  releaseInFlight,
} from './cheap-lfs/in-flight-guard'

type Listener = () => void

/** Return true only for a value whose completion defines the action lifetime. */
function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  )
}

/**
 * Coordinates consequential actions across every renderer entry point.
 * Claims happen synchronously before caller code runs, which closes the
 * rapid-click and mixed pointer/keyboard activation window that React state
 * alone cannot close. A thenable owns the claim until it settles; synchronous
 * handlers release immediately so repeatable controls keep their semantics.
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

    if (listener === undefined) {
      throw new Error('A target subscription requires a listener')
    }
    const listeners =
      this.targetListeners.get(targetOrListener) ?? new Set<Listener>()
    listeners.add(listener)
    this.targetListeners.set(targetOrListener, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.targetListeners.delete(targetOrListener)
      }
    }
  }

  /**
   * Starts work only when the exact target is not active. Duplicate attempts
   * resolve to undefined. Synchronous throws are rethrown after releasing the
   * claim, and thenable fulfillment or rejection releases in both paths.
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

/** Shared by renderer controls and alternate action entry paths. */
export const singleFlightActions = new SingleFlightActionRegistry()
