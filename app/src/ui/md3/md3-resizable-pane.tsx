import * as React from 'react'

import { clamp } from '../../lib/clamp'

/**
 * A pane whose width the user chooses, and the app remembers.
 *
 * WHY THIS EXISTS
 *
 * Every MD3 destination that shows a list beside a detail view hard-coded the
 * list at 356 pixels. That is a reasonable default and a bad fixed value: a
 * commit list at 356px truncates most branch names, and the same 356px on a
 * wide monitor leaves the diff crushed against a third of the window while
 * two-thirds sits empty. The classic workspace has had a draggable sidebar for
 * years; the new shell shipped without one.
 *
 * One component rather than a change per view, for the reason the shared
 * chrome exists at all: a resize behaviour implemented five times is five
 * behaviours, and four of them will be subtly wrong about the keyboard.
 *
 * WHAT MAKES THIS ACCESSIBLE RATHER THAN JUST DRAGGABLE
 *
 * A drag handle that only responds to a pointer is not a control, it is a
 * decoration with a cursor. The handle here is a real `separator` with a value,
 * a range and a full keyboard path — arrows to nudge, Page keys for a coarse
 * step, Home and End for the extremes, and Enter or a double-click to go back
 * to the default. Screen readers get the width as a percentage of its allowed
 * range, because "356" is a number without a scale attached and tells a
 * listener nothing about how much room is left.
 */

/** How the stored width is namespaced. One entry per named surface. */
const storageKeyPrefix = 'md3-pane-width:'

/** Nudge, in pixels, for an arrow key. Page keys move five times as far. */
const KeyboardStep = 16
const CoarseStep = KeyboardStep * 5

export interface IMd3ResizablePaneProps {
  /**
   * The surface this pane belongs to, e.g. `history` or `changes`.
   *
   * It is the persistence key, so it must be stable across releases: renaming
   * it silently resets every user's chosen width rather than failing.
   */
  readonly surface: string

  /** Human-readable name, used in the handle's accessible name. */
  readonly label: string

  readonly defaultWidth: number
  readonly minimumWidth: number
  readonly maximumWidth: number

  /**
   * Which side of the handle this pane sits on.
   *
   * Dragging right widens a pane on the left and narrows one on the right, so
   * the sign of the delta depends on this and getting it wrong produces a
   * handle that fights the pointer.
   */
  readonly side?: 'leading' | 'trailing'

  readonly className?: string
  readonly children?: React.ReactNode
}

interface IMd3ResizablePaneState {
  readonly width: number
  /** True while a pointer drag is in flight, so the handle can show it. */
  readonly dragging: boolean
}

/**
 * Read a stored width, defaulting rather than throwing.
 *
 * Storage can hold anything: a value written by an older release, a hand-edited
 * profile, a half-written entry. It is clamped on the way in as well as on the
 * way out, so a stored 9000 cannot render a pane wider than the window and
 * leave the user with no visible handle to drag it back with.
 */
export function readStoredPaneWidth(
  surface: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  try {
    const raw = localStorage.getItem(`${storageKeyPrefix}${surface}`)
    if (raw === null) {
      return fallback
    }
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed)) {
      return fallback
    }
    return clamp(parsed, minimum, maximum)
  } catch {
    // Storage can be unavailable entirely. A pane that cannot remember its
    // width is a minor loss; a pane that refuses to render is not.
    return fallback
  }
}

export function writeStoredPaneWidth(surface: string, width: number) {
  try {
    localStorage.setItem(
      `${storageKeyPrefix}${surface}`,
      String(Math.round(width))
    )
  } catch {
    // Same reasoning: failing to persist must never fail the resize itself.
  }
}

export function clearStoredPaneWidth(surface: string) {
  try {
    localStorage.removeItem(`${storageKeyPrefix}${surface}`)
  } catch {
    // As above.
  }
}

export class Md3ResizablePane extends React.Component<
  IMd3ResizablePaneProps,
  IMd3ResizablePaneState
> {
  private dragStartX: number | null = null
  private dragStartWidth: number | null = null

  public constructor(props: IMd3ResizablePaneProps) {
    super(props)
    this.state = {
      width: readStoredPaneWidth(
        props.surface,
        props.defaultWidth,
        props.minimumWidth,
        props.maximumWidth
      ),
      dragging: false,
    }
  }

  public componentWillUnmount() {
    // A drag that was in flight when the view changed would otherwise leave
    // these listeners on the window, resizing a pane that no longer exists.
    this.detachDragListeners()
  }

  private clamp(width: number) {
    return clamp(width, this.props.minimumWidth, this.props.maximumWidth)
  }

  private setWidth(width: number, persist: boolean) {
    const next = this.clamp(width)
    this.setState({ width: next })
    if (persist) {
      writeStoredPaneWidth(this.props.surface, next)
    }
  }

  private attachDragListeners() {
    window.addEventListener('mousemove', this.onDragMove)
    window.addEventListener('mouseup', this.onDragEnd)
  }

  private detachDragListeners() {
    window.removeEventListener('mousemove', this.onDragMove)
    window.removeEventListener('mouseup', this.onDragEnd)
  }

  private onDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    // Only the primary button. A right-click on the handle should reach the
    // context menu, not begin a drag the user cannot see the end of.
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    this.dragStartX = event.clientX
    this.dragStartWidth = this.state.width
    this.setState({ dragging: true })
    this.attachDragListeners()
  }

  /**
   * Listeners live on the window rather than the handle.
   *
   * A pointer moving faster than the render loop leaves the handle behind, and
   * a handler bound to the handle then stops receiving moves mid-drag — the
   * pane sticks and the user has to let go and start again.
   */
  private onDragMove = (event: MouseEvent) => {
    if (this.dragStartX === null || this.dragStartWidth === null) {
      return
    }
    const travelled = event.clientX - this.dragStartX
    const delta = this.props.side === 'trailing' ? -travelled : travelled
    // Not persisted per move: a drag across the window would otherwise write to
    // storage on every frame.
    this.setWidth(this.dragStartWidth + delta, false)
  }

  private onDragEnd = () => {
    this.detachDragListeners()
    this.dragStartX = null
    this.dragStartWidth = null
    this.setState({ dragging: false })
    writeStoredPaneWidth(this.props.surface, this.state.width)
  }

  private onDoubleClick = () => {
    this.reset()
  }

  private reset() {
    this.setState({ width: this.props.defaultWidth })
    clearStoredPaneWidth(this.props.surface)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { minimumWidth, maximumWidth, side } = this.props
    // On a trailing pane the visual direction of "wider" is reversed, so the
    // key that grows the pane is the one pointing away from the content.
    const grow = side === 'trailing' ? -1 : 1

    let next: number | null = null
    switch (event.key) {
      case 'ArrowLeft':
        next = this.state.width - KeyboardStep * grow
        break
      case 'ArrowRight':
        next = this.state.width + KeyboardStep * grow
        break
      case 'PageUp':
        next = this.state.width + CoarseStep * grow
        break
      case 'PageDown':
        next = this.state.width - CoarseStep * grow
        break
      case 'Home':
        next = minimumWidth
        break
      case 'End':
        next = maximumWidth
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        this.reset()
        return
      default:
        return
    }

    event.preventDefault()
    this.setWidth(next, true)
  }

  public render() {
    const { label, minimumWidth, maximumWidth, className, side } = this.props
    const { width, dragging } = this.state

    // Announced as a percentage of the allowed range rather than as a pixel
    // count. A listener told "356" learns nothing; told "38 percent" they know
    // how much room is left in either direction.
    const percentage = Math.round(
      ((width - minimumWidth) / Math.max(1, maximumWidth - minimumWidth)) * 100
    )

    return (
      <>
        <div
          className={
            className === undefined
              ? 'md3-resizable-pane'
              : `md3-resizable-pane ${className}`
          }
          style={{ width, flex: 'none' }}
        >
          {this.props.children}
        </div>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={`Resize ${label}`}
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${percentage} percent`}
          className={
            dragging
              ? 'md3-resizable-handle is-dragging'
              : 'md3-resizable-handle'
          }
          data-side={side ?? 'leading'}
          onMouseDown={this.onDragStart}
          onDoubleClick={this.onDoubleClick}
          onKeyDown={this.onKeyDown}
          title={`Drag to resize ${label}. Double-click to reset.`}
        />
      </>
    )
  }
}
