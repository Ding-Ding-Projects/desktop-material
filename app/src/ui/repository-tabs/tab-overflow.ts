/**
 * Pure geometry for the repository tab-strip overflow menu.
 *
 * When the strip is too narrow to show every open tab, the trailing tabs are
 * moved into a "more tabs" dropdown instead of being clipped or reachable only
 * by horizontal scrolling. The functions here are deliberately DOM-free so the
 * split can be unit-tested without a layout engine; the component feeds them
 * measured widths and receives back the ids that stay in the strip versus the
 * ids that move into the dropdown.
 */

/** A single tab's measured outer width, keyed by its stable tab id. */
export interface ITabWidthMeasurement {
  readonly id: string
  /** The tab's laid-out outer width in CSS pixels. */
  readonly width: number
}

/** Inputs describing the space the tabs must fit inside. */
export interface ITabOverflowOptions {
  /**
   * The inner width, in px, available to lay the tabs out in. The caller has
   * already subtracted any always-visible chrome (e.g. collapsed-group chips)
   * from this value, so it is purely the room the tabs may occupy.
   */
  readonly availableWidth: number
  /** The flex gap, in px, rendered between adjacent tabs. */
  readonly gap: number
  /**
   * The width, in px, reserved for the "more tabs" button (including the gap
   * that precedes it). Only consumed when an overflow actually occurs.
   */
  readonly overflowButtonWidth: number
  /**
   * The active tab. When set and non-empty it is guaranteed to remain visible
   * in the strip, exactly as the old scroll-into-view behavior kept it on
   * screen. A contiguous window is chosen so tab order is never scrambled.
   */
  readonly activeTabId?: string | null
  /**
   * How many of the leading measurements are pinned tabs.
   *
   * The store keeps pinned tabs at the front of the array, and the pinning
   * contract is that they stay in the strip when ordinary tabs overflow. They
   * are therefore laid out first and only the remainder competes for what is
   * left, rather than being carried along by a leading run they merely happen
   * to sit in — a run the active-tab window slides straight off.
   */
  readonly pinnedCount?: number
}

/** The result of splitting the tabs between the strip and the dropdown. */
export interface ITabOverflowLayout {
  /** Ids that stay in the strip, in their original order. */
  readonly visibleIds: ReadonlyArray<string>
  /** Ids moved into the dropdown, in their original order. */
  readonly overflowIds: ReadonlyArray<string>
}

/**
 * Sub-pixel slack so a layout that fits "exactly" is never forced into overflow
 * by a rounding error in the measured widths.
 */
const FitEpsilon = 0.5

/** The cumulative width of a contiguous run of tabs, gaps included. */
function runWidth(
  measurements: ReadonlyArray<ITabWidthMeasurement>,
  start: number,
  end: number,
  gap: number
): number {
  let total = 0
  for (let i = start; i < end; i++) {
    total += measurements[i].width
    if (i > start) {
      total += gap
    }
  }
  return total
}

/**
 * Decide which tabs stay in the strip and which move into the overflow
 * dropdown.
 *
 * The rule mirrors a browser tab strip: keep a contiguous, in-order run of
 * leading tabs, and move the rest into the dropdown. When everything fits, no
 * dropdown is needed and every id is returned as visible. When the active tab
 * would fall outside the leading run, the visible window slides just far enough
 * to keep it on screen, preserving order without scrambling positions.
 */
export function computeTabOverflowLayout(
  measurements: ReadonlyArray<ITabWidthMeasurement>,
  options: ITabOverflowOptions
): ITabOverflowLayout {
  const n = measurements.length
  if (n === 0) {
    return { visibleIds: [], overflowIds: [] }
  }

  const { availableWidth, gap, overflowButtonWidth } = options
  const activeTabId = options.activeTabId ?? null

  // Everything fits: no dropdown, no reserved button width.
  if (runWidth(measurements, 0, n, gap) <= availableWidth + FitEpsilon) {
    return { visibleIds: measurements.map(m => m.id), overflowIds: [] }
  }

  // Overflow is unavoidable, so reserve room for the "more tabs" button.
  const budget = Math.max(0, availableWidth - overflowButtonWidth)

  // The pinned run is laid out first and never competes for space; only what is
  // left over is available to the ordinary tabs.
  const pinnedCount = Math.max(0, Math.min(options.pinnedCount ?? 0, n))
  const pinnedWidth = runWidth(measurements, 0, pinnedCount, gap)
  const remainderBudget = Math.max(
    0,
    budget - (pinnedCount > 0 && pinnedCount < n ? pinnedWidth + gap : 0)
  )

  const activeIndex =
    activeTabId === null
      ? -1
      : measurements.findIndex(m => m.id === activeTabId)

  // How many ordinary tabs fit after the pinned run.
  let fitCount = pinnedCount
  let used = 0
  for (let i = pinnedCount; i < n; i++) {
    const next =
      used + measurements[i].width + (fitCount > pinnedCount ? gap : 0)
    if (next <= remainderBudget + FitEpsilon) {
      used = next
      fitCount++
    } else {
      break
    }
  }

  // Choose the visible window over the ordinary tabs. Prefer the leading run;
  // only slide it when the active tab would otherwise be hidden. A pinned tab
  // is always visible, so an active pinned tab never moves the window.
  let windowStart = pinnedCount
  let windowEnd = fitCount

  if (activeIndex >= fitCount) {
    // Anchor the window on the active tab and grow leftward while it fits,
    // stopping at the pinned run rather than displacing it.
    let start = activeIndex
    let width = measurements[activeIndex].width
    while (start > pinnedCount) {
      const candidate = width + gap + measurements[start - 1].width
      if (candidate <= remainderBudget + FitEpsilon) {
        width = candidate
        start--
      } else {
        break
      }
    }
    windowStart = start
    windowEnd = activeIndex + 1
  }

  // Guarantee at least one ordinary tab stays visible even when a single tab is
  // wider than the whole budget, so the strip never collapses to just the
  // pinned run and the dropdown button.
  if (windowEnd <= windowStart && pinnedCount < n) {
    windowStart = activeIndex < pinnedCount ? pinnedCount : activeIndex
    windowEnd = windowStart + 1
  }

  const visibleIds: string[] = []
  const overflowIds: string[] = []
  for (let i = 0; i < n; i++) {
    if (i < pinnedCount || (i >= windowStart && i < windowEnd)) {
      visibleIds.push(measurements[i].id)
    } else {
      overflowIds.push(measurements[i].id)
    }
  }

  return { visibleIds, overflowIds }
}

/**
 * Whether a computed layout actually pushes any tab into the dropdown. Handy
 * for the component to decide whether to render the "more tabs" button at all.
 */
export function hasTabOverflow(layout: ITabOverflowLayout): boolean {
  return layout.overflowIds.length > 0
}
