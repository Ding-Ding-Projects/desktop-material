/**
 * The repository picker's multi-select state machine.
 *
 * Kept free of React and of the repository model so the filter-aware
 * select-all, the Escape/Clear exit, and pruning can be proven directly.
 */

export interface IRepositoryBulkSelection {
  /** Whether multi-select mode is showing checkboxes and the selection bar. */
  readonly active: boolean
  readonly selectedIds: ReadonlySet<number>
}

export const emptyRepositoryBulkSelection: IRepositoryBulkSelection =
  Object.freeze({
    active: false,
    selectedIds: new Set<number>(),
  })

/** Enter multi-select mode with nothing selected yet. */
export function enterBulkSelection(): IRepositoryBulkSelection {
  return { active: true, selectedIds: new Set<number>() }
}

/** Escape and the Clear control both leave the mode entirely. */
export function exitBulkSelection(): IRepositoryBulkSelection {
  return { active: false, selectedIds: new Set<number>() }
}

/** Drop every selected repository but stay in multi-select mode. */
export function clearBulkSelection(
  state: IRepositoryBulkSelection
): IRepositoryBulkSelection {
  return state.selectedIds.size === 0
    ? state
    : { ...state, selectedIds: new Set<number>() }
}

/** Pinned and recent rows repeat a repository, so visible ids are deduped. */
export function dedupeRepositoryIds(
  ids: ReadonlyArray<number>
): ReadonlyArray<number> {
  return [...new Set(ids)]
}

export function toggleRepositorySelection(
  state: IRepositoryBulkSelection,
  id: number,
  selected: boolean
): IRepositoryBulkSelection {
  if (!state.active || !Number.isSafeInteger(id)) {
    return state
  }

  if (selected === state.selectedIds.has(id)) {
    return state
  }

  const selectedIds = new Set(state.selectedIds)
  if (selected) {
    selectedIds.add(id)
  } else {
    selectedIds.delete(id)
  }
  return { ...state, selectedIds }
}

/**
 * Select or deselect exactly the rows the active filter is showing. Rows hidden
 * by the text filter, the scope selects, the status chips, or the hidden-row
 * toggle are never touched, so an existing selection survives a filter change.
 */
export function setVisibleSelection(
  state: IRepositoryBulkSelection,
  visibleIds: ReadonlyArray<number>,
  selected: boolean
): IRepositoryBulkSelection {
  if (!state.active) {
    return state
  }

  const selectedIds = new Set(state.selectedIds)
  for (const id of visibleIds) {
    if (selected) {
      selectedIds.add(id)
    } else {
      selectedIds.delete(id)
    }
  }

  return selectedIds.size === state.selectedIds.size &&
    [...selectedIds].every(id => state.selectedIds.has(id))
    ? state
    : { ...state, selectedIds }
}

/** Forget repositories that are no longer saved in the app. */
export function pruneBulkSelection(
  state: IRepositoryBulkSelection,
  availableIds: ReadonlyArray<number>
): IRepositoryBulkSelection {
  const available = new Set(availableIds)
  const selectedIds = new Set(
    [...state.selectedIds].filter(id => available.has(id))
  )
  return selectedIds.size === state.selectedIds.size
    ? state
    : { ...state, selectedIds }
}

export function isAllVisibleSelected(
  state: IRepositoryBulkSelection,
  visibleIds: ReadonlyArray<number>
): boolean {
  return (
    visibleIds.length > 0 && visibleIds.every(id => state.selectedIds.has(id))
  )
}

export function isSomeVisibleSelected(
  state: IRepositoryBulkSelection,
  visibleIds: ReadonlyArray<number>
): boolean {
  return visibleIds.some(id => state.selectedIds.has(id))
}

/** Stable ordering keeps reviewed requests and result rows deterministic. */
export function selectedRepositoryIds(
  state: IRepositoryBulkSelection
): ReadonlyArray<number> {
  return [...state.selectedIds].sort((a, b) => a - b)
}
