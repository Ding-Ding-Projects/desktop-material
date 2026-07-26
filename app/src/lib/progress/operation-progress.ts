/**
 * Shared, pure helpers backing the determinate/indeterminate progress rows the
 * app mounts on every long-running operation.
 *
 * These live in `lib` rather than next to the React component so the state
 * machines can be unit tested without a DOM, and so main-process/store code can
 * build the same shape the renderer consumes.
 */

/**
 * A single progress reading for an operation the user can wait on.
 *
 * `value === null` means "we know work is happening but not how much of it is
 * done" — the row renders as an indeterminate bar and omits `aria-valuenow`,
 * which is what the ARIA spec asks for on an indeterminate progressbar.
 */
export interface IOperationProgress {
  /** Units completed so far, or null when the operation is indeterminate. */
  readonly value: number | null
  /** Total units of work, or null when the total is not known yet. */
  readonly max: number | null
}

/**
 * Clamp a progress reading into a usable shape.
 *
 * Anything that isn't a finite, non-negative number collapses to
 * indeterminate rather than producing `NaN%` widths or bogus ARIA values, and
 * `value` never exceeds `max` so a bar cannot render past its own track.
 */
export function normalizeOperationProgress(
  value: number | null | undefined,
  max: number | null | undefined
): IOperationProgress {
  const safeMax =
    typeof max === 'number' && Number.isFinite(max) && max > 0
      ? Math.floor(max)
      : null

  if (safeMax === null) {
    return { value: null, max: null }
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { value: null, max: safeMax }
  }

  return { value: Math.min(Math.floor(value), safeMax), max: safeMax }
}

/**
 * The width, in percent, of the filled portion of a determinate bar. Returns
 * null when the reading is indeterminate so callers can pick the sweeping
 * indicator instead of a zero-width fill.
 */
export function operationProgressPercent(
  value: number | null | undefined,
  max: number | null | undefined
): number | null {
  const normalized = normalizeOperationProgress(value, max)
  if (normalized.value === null || normalized.max === null) {
    return null
  }

  return Math.round((normalized.value / normalized.max) * 100)
}

/**
 * Fractional progress (0..1) for callers that feed an existing
 * percentage-based progress surface such as the toolbar push/pull button.
 */
export function operationProgressFraction(
  value: number | null | undefined,
  max: number | null | undefined
): number | null {
  const normalized = normalizeOperationProgress(value, max)
  if (normalized.value === null || normalized.max === null) {
    return null
  }

  return normalized.value / normalized.max
}

/**
 * A step counter driving "X of Y" copy. Steps are reported one-based to the
 * user — the first item in flight reads "1 of 5", not "0 of 5" — while the
 * progressbar keeps reporting completed units so the bar only fills when work
 * actually settles.
 */
export interface IOperationStepCounter {
  /** Units finished. Drives the bar. */
  readonly completed: number
  /** One-based index of the item currently in flight, capped at `total`. */
  readonly current: number
  /** Total units. */
  readonly total: number
}

export function operationStepCounter(
  completed: number,
  total: number
): IOperationStepCounter {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  const safeCompleted =
    Number.isFinite(completed) && completed > 0
      ? Math.min(Math.floor(completed), safeTotal)
      : 0

  return {
    completed: safeCompleted,
    current: safeTotal === 0 ? 0 : Math.min(safeCompleted + 1, safeTotal),
    total: safeTotal,
  }
}
