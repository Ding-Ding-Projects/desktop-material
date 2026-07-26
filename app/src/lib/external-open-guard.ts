/**
 * A process-wide, state-driven guard around the actions that hand a path to
 * something outside Desktop Material: an external editor, a shell, the file
 * manager, or the system default application.
 *
 * Every one of those actions spawns a process (or asks the OS to spawn one),
 * and none of them is idempotent — clicking "Open in editor" twice in quick
 * succession genuinely opens two editor windows, and double-clicking a changes
 * row while the first launch is still resolving does the same. A `disabled`
 * prop cannot prevent it: React state updates are asynchronous, so both clicks
 * are dispatched before the re-render that would disable the control happens.
 *
 * The guard therefore claims the target *synchronously*, before any `await`,
 * and only starts the work when the claim is accepted. It is deliberately
 * state-driven rather than time-driven: a timer-based debounce would either
 * swallow a deliberate second open after the first one finished, or re-open the
 * control while a slow launch is still in flight. A claim released when the
 * spawn settles — successfully or not — tracks the real work instead.
 *
 * Targets are namespaced by the kind of open, so revealing a file in the file
 * manager and opening the same file in an editor never block each other.
 *
 * The claim/release bookkeeping itself is the pure reducer used by the Cheap
 * LFS upload guard; this module only adds the mutable, observable registry that
 * lets controls in unrelated parts of the tree report `aria-busy`.
 */

import {
  claimInFlight,
  EmptyInFlightGuard,
  InFlightGuardState,
  isInFlight,
  releaseInFlight,
} from './cheap-lfs/in-flight-guard'

/** The kinds of "hand this path to something outside the app" action. */
export type ExternalOpenKind =
  /** Launching the configured (or a specifically chosen) external editor. */
  | 'editor'
  /** Launching a terminal in a repository. */
  | 'shell'
  /** Asking the OS to open a file with its default application. */
  | 'default-app'
  /** Revealing a file or folder in the native file manager. */
  | 'file-manager'
  /** Opening a file Desktop Material just downloaded. */
  | 'download'

/**
 * Build the guard key for one open.
 *
 * Keys are namespaced by kind and joined with NUL so no path, editor id, or
 * argument can be crafted to collide with a different target.
 */
export function externalOpenTarget(
  kind: ExternalOpenKind,
  ...parts: ReadonlyArray<string | null | undefined>
): string {
  return [kind, ...parts.map(part => part ?? '')].join('\0')
}

/** An observable registry of the external opens currently in flight. */
export class ExternalOpenGuard {
  private state: InFlightGuardState = EmptyInFlightGuard
  private readonly listeners = new Set<() => void>()

  /** Is an open for this exact target still starting? */
  public isOpening(target: string): boolean {
    return isInFlight(this.state, target)
  }

  /**
   * Observe claim and release so a control can render `aria-busy` while its own
   * target is opening. Returns the unsubscribe function.
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Claim `target` and run `work`.
   *
   * The claim is taken synchronously, so a second call for the same target made
   * before the first one settles does nothing at all and resolves to
   * `undefined` — one gesture, one process. Calls for different targets are
   * independent. A synchronous throw from `work` propagates unchanged (and
   * releases the claim) so guarding a call cannot alter its error handling.
   */
  public run<T>(
    target: string,
    work: () => T | PromiseLike<T>
  ): Promise<T | undefined> {
    const claim = claimInFlight(this.state, target)
    if (!claim.accepted) {
      return Promise.resolve(undefined)
    }
    this.setState(claim.state)

    let started: T | PromiseLike<T>
    try {
      started = work()
    } catch (error) {
      this.release(target)
      throw error
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
    this.setState(releaseInFlight(this.state, target))
  }

  private setState(next: InFlightGuardState) {
    // `claimInFlight`/`releaseInFlight` return the guard they were given when
    // nothing changed, so identity is enough to skip a pointless notification.
    if (next === this.state) {
      return
    }
    this.state = next
    // Copy first: a listener is allowed to unsubscribe while being notified.
    for (const listener of Array.from(this.listeners)) {
      try {
        listener()
      } catch (error) {
        log.error('External open guard listener failed', error)
      }
    }
  }
}

/**
 * The renderer-wide guard. External opens are OS-level side effects, so every
 * trigger has to share one registry for the duplicate to be caught no matter
 * which control started it.
 */
export const externalOpenGuard = new ExternalOpenGuard()
