import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'

/**
 * The MD3 shell's toast, from `design/History MD3.dc.html`.
 *
 * The contract renders exactly one toast at a time from a single piece of
 * state, dismissed by a 3000ms timer that `notify()` resets on every call:
 *
 *     notify(msg) {
 *       clearTimeout(this._toast)
 *       this.setState({ toast: msg })
 *       this._toast = setTimeout(() => this.setState({ toast: null }), 3000)
 *     }
 *
 * Its geometry is reproduced verbatim in `app/styles/ui/_md3-toast.scss`. Four
 * behaviours a real application needs are added on top of the prototype, and
 * none of them changes how the contract's own toast looks or moves:
 *
 *  - **It stacks.** A second notification arriving while the first is still on
 *    screen queues beneath it rather than replacing it, so a message can never
 *    be destroyed before it has been read.
 *  - **Warnings and errors persist.** They stay until dismissed and carry a
 *    dismiss button, because a failure that vanishes after three seconds is a
 *    failure the user never saw.
 *  - **The timer pauses on hover and on keyboard focus**, so a toast cannot
 *    disappear from under a pointer or out of a focused Undo button.
 *  - **Undo is only rendered when there is something to undo.** The contract's
 *    prototype paints the action unconditionally; a permanently visible Undo
 *    that does nothing is worse than no Undo at all.
 *
 * The toast never takes focus. It is announced instead: each one is its own
 * live region — polite for information and success, assertive for a warning or
 * an error — so a screen-reader user hears it without being interrupted mid
 * task.
 */

/**
 * The severity of a notification.
 *
 * `info` is the contract's own toast and renders exactly the prototype's
 * markup. The other three add a leading glyph so severity is never carried by
 * colour alone — the glyph inherits the toast's own foreground colour, so it
 * reads as a shape rather than as a hue.
 */
export type Md3ToastKind = 'info' | 'success' | 'warning' | 'error'

/** The contract's `setTimeout(..., 3000)`. */
export const Md3ToastDefaultDuration = 3000

/**
 * How many toasts are on screen at once.
 *
 * Beyond this the oldest is dropped: a stack tall enough to cover the window
 * has stopped being a notification and become an obstruction.
 */
const MaxVisibleToasts = 4

export interface IMd3ToastOptions {
  /** Defaults to `info`. */
  readonly kind?: Md3ToastKind

  /**
   * How long the toast stays on screen, in milliseconds, or `null` to keep it
   * until the user dismisses it.
   *
   * Defaults to `null` for `warning` and `error` and to
   * `Md3ToastDefaultDuration` for everything else. A value of zero or less is
   * treated as `null`, since a toast that expires immediately is one nobody
   * can read.
   */
  readonly duration?: number | null

  /**
   * Called when the user activates Undo. The Undo action is rendered only when
   * this is supplied, and dismisses the toast after running.
   */
  readonly onUndo?: () => void

  /** Overrides the default "Undo" wording for a differently-named reversal. */
  readonly undoLabel?: string

  /**
   * An optional identity. A new toast with the same key replaces the one that
   * is already showing instead of stacking beneath it, so a repeated action —
   * pressing Commit four times with no summary — produces one message rather
   * than four.
   */
  readonly key?: string
}

/** A notification currently on screen. */
export interface IMd3Toast {
  /** Monotonic, unique for the lifetime of the process. */
  readonly id: number
  readonly message: string
  readonly kind: Md3ToastKind
  /** Milliseconds, or `null` when the toast waits to be dismissed. */
  readonly duration: number | null
  readonly onUndo?: () => void
  readonly undoLabel?: string
  readonly key?: string
}

function resolveDuration(
  kind: Md3ToastKind,
  duration: number | null | undefined
): number | null {
  if (duration === undefined) {
    return kind === 'warning' || kind === 'error'
      ? null
      : Md3ToastDefaultDuration
  }

  if (duration === null || duration <= 0) {
    return null
  }

  return duration
}

/**
 * The toast queue.
 *
 * A plain store rather than a React context so that code which is not a
 * component — an IPC reply, a dispatcher, an error handler — can raise a
 * notification without one, which is most of the code that actually needs to.
 */
class Md3ToastStore {
  private current: ReadonlyArray<IMd3Toast> = []
  private readonly listeners = new Set<() => void>()
  private nextId = 1

  /** The toasts currently on screen, oldest first. */
  public get toasts(): ReadonlyArray<IMd3Toast> {
    return this.current
  }

  /** Subscribe to changes. Returns the unsubscribe function. */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Raise a notification. Returns its id, for dismissing it early. */
  public notify(message: string, options: IMd3ToastOptions = {}): number {
    const kind = options.kind ?? 'info'
    const id = this.nextId++

    const toast: IMd3Toast = {
      id,
      message,
      kind,
      duration: resolveDuration(kind, options.duration),
      onUndo: options.onUndo,
      undoLabel: options.undoLabel,
      key: options.key,
    }

    const key = options.key
    const retained =
      key === undefined
        ? this.current
        : this.current.filter(existing => existing.key !== key)

    const next = [...retained, toast]

    this.current =
      next.length > MaxVisibleToasts
        ? next.slice(next.length - MaxVisibleToasts)
        : next

    this.emit()
    return id
  }

  /** Remove one toast. Removing an id that is already gone does nothing. */
  public dismiss(id: number): void {
    const next = this.current.filter(toast => toast.id !== id)

    if (next.length === this.current.length) {
      return
    }

    this.current = next
    this.emit()
  }

  /** Remove every toast — on sign-out, or when a whole view is torn down. */
  public clear(): void {
    if (this.current.length === 0) {
      return
    }

    this.current = []
    this.emit()
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      listener()
    }
  }
}

/** The process-wide toast queue. */
export const md3Toasts = new Md3ToastStore()

/**
 * Raise a notification — the contract's `notify(msg)`.
 *
 * Import it under a clearer name where the call site is not obviously about
 * toasts: `import { notify as notifyToast } from '../md3/md3-toast'`.
 */
export function notify(message: string, options?: IMd3ToastOptions): number {
  return md3Toasts.notify(message, options)
}

/** Dismiss a notification raised earlier by its id. */
export function dismissToast(id: number): void {
  md3Toasts.dismiss(id)
}

/** Subscribe a component to the toast queue. */
export function useMd3Toasts(): ReadonlyArray<IMd3Toast> {
  const [toasts, setToasts] = React.useState<ReadonlyArray<IMd3Toast>>(
    md3Toasts.toasts
  )

  React.useEffect(() => {
    // Re-read on subscribe: a toast raised between the initial render and this
    // effect would otherwise never reach the screen.
    setToasts(md3Toasts.toasts)
    return md3Toasts.subscribe(() => setToasts(md3Toasts.toasts))
  }, [])

  return toasts
}

const KindIcons: Readonly<Record<Md3ToastKind, MaterialSymbolName | null>> = {
  info: null,
  success: 'check_circle',
  warning: 'warning',
  error: 'error',
}

interface IMd3ToastItemProps {
  readonly toast: IMd3Toast
}

function Md3ToastItem(props: IMd3ToastItemProps) {
  const { id, message, kind, duration, onUndo, undoLabel } = props.toast

  // The timer is suspended whenever the pointer is over the toast or focus is
  // inside it, and resumes from where it stopped rather than restarting.
  const [paused, setPaused] = React.useState(false)
  const remainingRef = React.useRef(duration ?? 0)

  React.useEffect(() => {
    if (duration === null || paused) {
      return
    }

    const startedAt = Date.now()
    const remaining = remainingRef.current
    const handle = window.setTimeout(() => md3Toasts.dismiss(id), remaining)

    return () => {
      window.clearTimeout(handle)
      remainingRef.current = Math.max(0, remaining - (Date.now() - startedAt))
    }
  }, [id, duration, paused])

  const onPause = React.useCallback(() => setPaused(true), [])
  const onResume = React.useCallback(() => setPaused(false), [])

  const onUndoClick = React.useCallback(() => {
    onUndo?.()
    md3Toasts.dismiss(id)
  }, [onUndo, id])

  const onDismissClick = React.useCallback(() => {
    md3Toasts.dismiss(id)
  }, [id])

  const icon = KindIcons[kind]
  const assertive = kind === 'warning' || kind === 'error'

  return (
    <div
      className={classNames(
        'md3-toast',
        `md3-toast--${kind}`,
        'md3-anim-toast'
      )}
      role={assertive ? 'alert' : 'status'}
      aria-atomic={true}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
    >
      {icon === null ? null : (
        <MaterialSymbol className="md3-toast__icon" name={icon} size={16} />
      )}
      <span className="md3-toast__message">{message}</span>
      {onUndo === undefined ? null : (
        <button type="button" className="md3-toast__undo" onClick={onUndoClick}>
          {undoLabel ?? t('md3.toast.undo')}
        </button>
      )}
      {duration === null ? (
        <button
          type="button"
          className="md3-toast__dismiss"
          aria-label={t('md3.toast.dismiss')}
          onClick={onDismissClick}
        >
          <MaterialSymbol name="close" size={15} />
        </button>
      ) : null}
    </div>
  )
}

/**
 * Renders the toast stack. Mount it once, at the root of the shell.
 *
 * The container is always in the document, even while empty, so that a toast
 * arrives as content inserted into an existing region rather than as a region
 * that appeared from nowhere — assistive technology announces the first far
 * more reliably than the second.
 */
export function Md3ToastHost() {
  const toasts = useMd3Toasts()

  return (
    <div
      className="md3-toast-stack"
      role="region"
      aria-label={t('md3.toast.region')}
    >
      {toasts.map(toast => (
        <Md3ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
