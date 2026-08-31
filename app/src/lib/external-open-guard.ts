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

import { SingleFlightActionRegistry } from './single-flight-action'

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
 * Keys encode the complete tuple so no path, editor id, or argument can be
 * crafted to collide with a different target or part boundary.
 */
export function externalOpenTarget(
  kind: ExternalOpenKind,
  ...parts: ReadonlyArray<string | null | undefined>
): string {
  return JSON.stringify([kind, ...parts.map(part => part ?? '')])
}

/** An observable registry of the external opens currently in flight. */
export class ExternalOpenGuard extends SingleFlightActionRegistry {
  /** Is an open for this exact target still starting? */
  public isOpening(target: string): boolean {
    return this.isActive(target)
  }
}

/**
 * The renderer-wide guard. External opens are OS-level side effects, so every
 * trigger has to share one registry for the duplicate to be caught no matter
 * which control started it.
 */
export const externalOpenGuard = new ExternalOpenGuard()
