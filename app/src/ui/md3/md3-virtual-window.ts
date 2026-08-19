import * as React from 'react'

/**
 * A minimal fixed-height windowing hook for the MD3 shell's two long lists:
 * the changed-file list and the diff line list.
 *
 * `react-virtualized` is already a dependency of this repository, but every
 * existing use of it drives a list whose rows are laid out by the library. Both
 * lists here are plain flow content that has to keep its own horizontal
 * intrinsic width — a diff line is `white-space: pre` and the pane scrolls
 * sideways to reach the end of it — and an absolutely positioned row cannot
 * contribute that width to the scroller. So the rows stay in normal flow and
 * the rows above and below the viewport are replaced by padding, which is the
 * one windowing technique that leaves layout untouched.
 *
 * Windowing is opt-in per call through `enabled`. Below the caller's threshold
 * every row renders, which keeps small lists — and every test fixture — free of
 * measurement entirely: `jsdom` reports a zero-height viewport, so a hook that
 * always windowed would render nothing at all under test.
 */

export interface IMd3VirtualWindow {
  /** Index of the first rendered item. */
  readonly start: number

  /** Index one past the last rendered item. */
  readonly end: number

  /** Height standing in for the items before `start`, in pixels. */
  readonly topPad: number

  /** Height standing in for the items after `end`, in pixels. */
  readonly bottomPad: number

  /** Attach to the scrolling container's `onScroll`. */
  readonly onScroll: (event: React.UIEvent<HTMLElement>) => void
}

/** Rows kept rendered beyond each edge of the viewport. */
const DefaultOverscan = 10

/**
 * The viewport height assumed before the container has been measured — a
 * first paint that renders slightly too much is invisible, whereas one that
 * renders nothing is a blank list.
 */
const AssumedViewportHeight = 720

export function useMd3VirtualWindow(
  containerRef: React.RefObject<HTMLElement>,
  itemCount: number,
  itemHeight: number,
  enabled: boolean,
  overscan: number = DefaultOverscan
): IMd3VirtualWindow {
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportHeight, setViewportHeight] = React.useState(
    AssumedViewportHeight
  )

  const onScroll = React.useCallback((event: React.UIEvent<HTMLElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  React.useEffect(() => {
    const container = containerRef.current
    if (container === null || !enabled) {
      return
    }

    const measure = () => {
      const height = container.clientHeight
      if (height > 0) {
        setViewportHeight(height)
      }
    }

    measure()

    // `ResizeObserver` is absent from the test environment, where the list is
    // never windowed anyway. Guarding rather than polyfilling keeps the hook
    // usable in both places.
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, enabled])

  if (!enabled || itemCount === 0 || itemHeight <= 0) {
    return { start: 0, end: itemCount, topPad: 0, bottomPad: 0, onScroll }
  }

  const firstVisible = Math.floor(scrollTop / itemHeight)
  const visibleCount = Math.ceil(viewportHeight / itemHeight)

  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(itemCount, firstVisible + visibleCount + overscan)

  return {
    start,
    end,
    topPad: start * itemHeight,
    bottomPad: Math.max(0, (itemCount - end) * itemHeight),
    onScroll,
  }
}

/**
 * Learn a list's real row height from the first rendered row rather than
 * assuming the design's value.
 *
 * The windowing arithmetic above needs one number, and hard-coding it would
 * make the list scroll to the wrong place the moment the user raises the
 * display scale or picks a larger UI font — both of which this application
 * lets them do. Measuring costs one layout read per resize and cannot drift.
 */
export function useMd3MeasuredRowHeight(
  rowRef: React.RefObject<HTMLElement>,
  fallback: number,
  dependency: unknown
): number {
  const [height, setHeight] = React.useState(fallback)

  React.useLayoutEffect(() => {
    const row = rowRef.current
    if (row === null) {
      return
    }

    const measured = row.getBoundingClientRect().height
    if (measured > 0 && Math.abs(measured - height) > 0.5) {
      setHeight(measured)
    }
  }, [rowRef, height, dependency])

  return height
}
