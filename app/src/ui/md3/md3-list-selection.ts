/**
 * The selection algebra every MD3 list shares.
 *
 * The project's contract asks the same four things of every list, table and
 * collection: multi-select by click and shift-click plus a keyboard
 * equivalent, a select-all that says out loud whether it means the filtered
 * set or everything, an inverse selection, and the full action set in bulk
 * with nothing silently skipped.
 *
 * Only the first of those is really about a mouse. The rest are arithmetic
 * over an id set, and arithmetic written eight times is arithmetic that
 * disagrees with itself eight ways — the usual disagreement being what
 * "select all" means when a filter is on. Here it is written once, and every
 * function is pure, so a list's selection behaviour can be proven without
 * rendering anything.
 *
 * The one rule worth stating plainly: **a select-all never reaches past the
 * filter**. It selects exactly the rows the user can see, and the label says
 * so. Selecting rows a filter is hiding is how a bulk delete removes
 * something nobody looked at.
 */

import { t } from '../../lib/i18n'

/**
 * How a pointer or keyboard event asked the selection to change.
 *
 * `replace` is a plain click: the row becomes the whole selection. `toggle`
 * is Ctrl/Cmd-click: the row joins or leaves without disturbing the rest.
 * `range` is Shift-click and Shift+Arrow: everything from the anchor to here.
 */
export type Md3SelectionIntent = 'replace' | 'toggle' | 'range'

/** Read the intent out of a mouse or keyboard event's modifier keys. */
export function md3SelectionIntent(modifiers: {
  readonly shiftKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
}): Md3SelectionIntent {
  if (modifiers.shiftKey) {
    return 'range'
  }
  if (modifiers.ctrlKey || modifiers.metaKey) {
    return 'toggle'
  }
  return 'replace'
}

/** The result of applying an intent: the new selection and the new anchor. */
export interface IMd3SelectionResult {
  /** The selected ids, in the visible list's own order. */
  readonly ids: ReadonlyArray<string>

  /**
   * The index a subsequent range extends from, or `null` when there is none.
   *
   * A range does not move the anchor — that is what makes Shift-click,
   * Shift-click grow and shrink one range rather than walking away from where
   * it started.
   */
  readonly anchor: number | null
}

/**
 * What a Shift gesture does to whatever was already selected.
 *
 * `replace` is how a list of selectable rows behaves — Shift-click draws one
 * range and that range is the selection. `extend` is how a list of checkboxes
 * behaves — Shift-click adds the range to the ticks already there, because a
 * user who has ticked four boxes and then Shift-clicks a fifth is asking for
 * more, not for those four to disappear.
 *
 * Getting this backwards on a checkbox list is a silent data-loss bug: the
 * selection shrinks, the bulk verb runs over fewer rows than the user chose,
 * and the count beside the button is the only clue.
 */
export type Md3RangeMode = 'replace' | 'extend'

/**
 * Apply one selection gesture over `visibleIds`.
 *
 * `index` is the position within `visibleIds`, not within the unfiltered
 * collection: a range drawn across a filtered list covers the rows between
 * the two the user actually clicked, never the rows the filter is hiding
 * between them.
 */
export function md3ApplySelection(
  visibleIds: ReadonlyArray<string>,
  selected: ReadonlySet<string>,
  index: number,
  intent: Md3SelectionIntent,
  anchor: number | null,
  rangeMode: Md3RangeMode = 'replace'
): IMd3SelectionResult {
  const id = visibleIds[index]
  if (id === undefined) {
    return { ids: order(visibleIds, selected), anchor }
  }

  if (
    intent === 'range' &&
    anchor !== null &&
    visibleIds[anchor] !== undefined
  ) {
    const from = Math.min(anchor, index)
    const to = Math.max(anchor, index)
    const range = visibleIds.slice(from, to + 1)
    if (rangeMode === 'replace') {
      return { ids: range, anchor }
    }
    const next = new Set(selected)
    for (const member of range) {
      next.add(member)
    }
    return { ids: order(visibleIds, next), anchor }
  }

  if (intent === 'toggle') {
    const next = new Set(selected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    return { ids: order(visibleIds, next), anchor: index }
  }

  return { ids: [id], anchor: index }
}

/** Keep a selection in the visible list's order, so an export reads top-down. */
function order(
  visibleIds: ReadonlyArray<string>,
  selected: ReadonlySet<string>
): ReadonlyArray<string> {
  return visibleIds.filter(id => selected.has(id))
}

/**
 * Select every visible row, or clear the selection when they are all already
 * selected.
 *
 * Rows outside the filter are never touched: whatever was selected before the
 * filter narrowed the list stays selected, because the user did select it and
 * a checkbox they cannot see did not unselect it.
 */
export function md3ToggleSelectAll(
  visibleIds: ReadonlyArray<string>,
  selected: ReadonlySet<string>
): ReadonlyArray<string> {
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const next = new Set(selected)
  for (const id of visibleIds) {
    if (allVisibleSelected) {
      next.delete(id)
    } else {
      next.add(id)
    }
  }
  return [...next]
}

/** Whether every visible row is selected — the select-all checkbox's state. */
export function md3AllVisibleSelected(
  visibleIds: ReadonlyArray<string>,
  selected: ReadonlySet<string>
): boolean {
  return visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
}

/**
 * Whether some but not all visible rows are selected — the checkbox's
 * indeterminate state, which is the only honest rendering of a partial
 * selection.
 */
export function md3SomeVisibleSelected(
  visibleIds: ReadonlyArray<string>,
  selected: ReadonlySet<string>
): boolean {
  return (
    visibleIds.some(id => selected.has(id)) &&
    !md3AllVisibleSelected(visibleIds, selected)
  )
}

/** Invert the selection across the visible rows, leaving hidden rows alone. */
export function md3InvertSelection(
  visibleIds: ReadonlyArray<string>,
  selected: ReadonlySet<string>
): ReadonlyArray<string> {
  const next = new Set(selected)
  for (const id of visibleIds) {
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
  }
  return [...next]
}

/**
 * The select-all label, which states its own scope.
 *
 * "Select all 12" is the sentence that gets a user to delete rows a filter
 * was hiding. These two say which set they mean, every time, and the count is
 * the count of that set.
 */
export function md3SelectAllLabel(
  visibleCount: number,
  filtered: boolean
): string {
  return filtered
    ? t('md3.bulk.selectAllFiltered', { count: String(visibleCount) })
    : t('md3.bulk.selectAllEverything', { count: String(visibleCount) })
}

/**
 * The scope a bulk action will run over, in words.
 *
 * A selection wins when there is one; otherwise the action falls back to the
 * filtered set, and says so. Every bulk button's accessible name carries this
 * string, so a screen-reader user hears the scope with the verb rather than
 * having to go and read a checkbox somewhere else on the surface.
 */
export function md3BulkScopeLabel(
  selectedCount: number,
  visibleCount: number,
  filtered: boolean
): string {
  if (selectedCount > 0) {
    return t('md3.bulk.scopeSelected', { count: String(selectedCount) })
  }
  return filtered
    ? t('md3.bulk.scopeFiltered', { count: String(visibleCount) })
    : t('md3.bulk.scopeEverything', { count: String(visibleCount) })
}

/** The rows a bulk action runs over, resolved by the same rule as the label. */
export function md3BulkScope<T>(
  visible: ReadonlyArray<T>,
  selected: ReadonlySet<string>,
  identify: (row: T) => string
): ReadonlyArray<T> {
  const chosen = visible.filter(row => selected.has(identify(row)))
  return chosen.length > 0 ? chosen : visible
}

/**
 * A bulk action split into what it will actually do and what it will not.
 *
 * "Never let a bulk action silently skip items — report what was excluded and
 * why." A partition carries the reason with the excluded rows, so the
 * preview and the result report the same thing rather than the preview
 * promising more than the action delivers.
 */
export interface IMd3BulkPartition<T> {
  readonly applied: ReadonlyArray<T>
  readonly excluded: ReadonlyArray<T>

  /** Why the excluded rows were excluded, already localized. `null` if none. */
  readonly reason: string | null
}

/** Split `rows` by eligibility, carrying `reason` when anything is excluded. */
export function md3PartitionBulk<T>(
  rows: ReadonlyArray<T>,
  eligible: (row: T) => boolean,
  reason: string
): IMd3BulkPartition<T> {
  const applied: Array<T> = []
  const excluded: Array<T> = []
  for (const row of rows) {
    if (eligible(row)) {
      applied.push(row)
    } else {
      excluded.push(row)
    }
  }
  return {
    applied,
    excluded,
    reason: excluded.length === 0 ? null : reason,
  }
}

/**
 * The sentence a partition reports, or `null` when nothing was skipped.
 *
 * Rendered in the preview before the action and in the toast after it, so
 * "42 selected" and "38 will change" are never the same number by accident.
 */
export function md3BulkPartitionSummary<T>(
  partition: IMd3BulkPartition<T>
): string | null {
  if (partition.reason === null) {
    return null
  }
  return t('md3.bulk.excluded', {
    count: String(partition.excluded.length),
    reason: partition.reason,
  })
}
