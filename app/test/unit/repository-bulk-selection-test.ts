import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  clearBulkSelection,
  dedupeRepositoryIds,
  emptyRepositoryBulkSelection,
  enterBulkSelection,
  exitBulkSelection,
  isAllVisibleSelected,
  isSomeVisibleSelected,
  pruneBulkSelection,
  selectedRepositoryIds,
  setVisibleSelection,
  toggleRepositorySelection,
} from '../../src/ui/repositories-list/repository-bulk-selection'

function selectionOf(...ids: ReadonlyArray<number>) {
  return { active: true, selectedIds: new Set(ids) }
}

describe('repository bulk selection', () => {
  it('starts inactive with nothing selected', () => {
    assert.strictEqual(emptyRepositoryBulkSelection.active, false)
    assert.strictEqual(emptyRepositoryBulkSelection.selectedIds.size, 0)
  })

  it('enters multi-select mode with an empty selection', () => {
    const state = enterBulkSelection()
    assert.strictEqual(state.active, true)
    assert.deepStrictEqual(selectedRepositoryIds(state), [])
  })

  it('ignores toggles while multi-select is inactive', () => {
    const state = toggleRepositorySelection(
      emptyRepositoryBulkSelection,
      7,
      true
    )
    assert.strictEqual(state, emptyRepositoryBulkSelection)
  })

  it('ignores unsafe repository ids', () => {
    const state = enterBulkSelection()
    assert.strictEqual(
      toggleRepositorySelection(state, Number.NaN, true),
      state
    )
    assert.strictEqual(toggleRepositorySelection(state, 1.5, true), state)
  })

  it('toggles a single repository on and off', () => {
    const selected = toggleRepositorySelection(enterBulkSelection(), 3, true)
    assert.deepStrictEqual(selectedRepositoryIds(selected), [3])

    const cleared = toggleRepositorySelection(selected, 3, false)
    assert.deepStrictEqual(selectedRepositoryIds(cleared), [])
  })

  it('returns the same state when a toggle changes nothing', () => {
    const state = selectionOf(4)
    assert.strictEqual(toggleRepositorySelection(state, 4, true), state)
    assert.strictEqual(toggleRepositorySelection(state, 9, false), state)
  })

  it('reports selected ids in a stable ascending order', () => {
    const state = selectionOf(11, 2, 7)
    assert.deepStrictEqual(selectedRepositoryIds(state), [2, 7, 11])
  })

  it('deduplicates repository ids repeated by the pinned and recent groups', () => {
    assert.deepStrictEqual(dedupeRepositoryIds([5, 1, 5, 2, 1]), [5, 1, 2])
  })

  describe('select all visible', () => {
    it('selects only the rows the active filter is showing', () => {
      const state = setVisibleSelection(enterBulkSelection(), [1, 2], true)
      assert.deepStrictEqual(selectedRepositoryIds(state), [1, 2])
    })

    it('leaves filtered-out selections untouched when selecting', () => {
      // 9 was selected before the filter narrowed the list to 1 and 2.
      const state = setVisibleSelection(selectionOf(9), [1, 2], true)
      assert.deepStrictEqual(selectedRepositoryIds(state), [1, 2, 9])
    })

    it('leaves filtered-out selections untouched when deselecting', () => {
      const state = setVisibleSelection(selectionOf(1, 2, 9), [1, 2], false)
      assert.deepStrictEqual(selectedRepositoryIds(state), [9])
    })

    it('does nothing while multi-select is inactive', () => {
      const state = setVisibleSelection(
        emptyRepositoryBulkSelection,
        [1, 2],
        true
      )
      assert.strictEqual(state, emptyRepositoryBulkSelection)
    })

    it('returns the same state when the visible set is already selected', () => {
      const state = selectionOf(1, 2)
      assert.strictEqual(setVisibleSelection(state, [1, 2], true), state)
    })
  })

  describe('visible selection predicates', () => {
    it('treats an empty visible set as not fully selected', () => {
      assert.strictEqual(isAllVisibleSelected(selectionOf(1), []), false)
      assert.strictEqual(isSomeVisibleSelected(selectionOf(1), []), false)
    })

    it('is indeterminate when only part of the visible set is selected', () => {
      const state = selectionOf(1)
      assert.strictEqual(isAllVisibleSelected(state, [1, 2]), false)
      assert.strictEqual(isSomeVisibleSelected(state, [1, 2]), true)
    })

    it('ignores selections that the filter is hiding', () => {
      // 9 is selected but not visible, so the visible rows are still unselected.
      const state = selectionOf(9)
      assert.strictEqual(isAllVisibleSelected(state, [1, 2]), false)
      assert.strictEqual(isSomeVisibleSelected(state, [1, 2]), false)
    })
  })

  describe('exit and clear', () => {
    it('exits the mode and drops the selection on Escape or Clear', () => {
      const state = exitBulkSelection()
      assert.strictEqual(state.active, false)
      assert.deepStrictEqual(selectedRepositoryIds(state), [])
    })

    it('clears the selection but stays in multi-select mode', () => {
      const state = clearBulkSelection(selectionOf(1, 2))
      assert.strictEqual(state.active, true)
      assert.deepStrictEqual(selectedRepositoryIds(state), [])
    })

    it('returns the same state when there is nothing to clear', () => {
      const state = enterBulkSelection()
      assert.strictEqual(clearBulkSelection(state), state)
    })
  })

  describe('pruning', () => {
    it('forgets repositories that are no longer saved', () => {
      const state = pruneBulkSelection(selectionOf(1, 2, 3), [1, 3])
      assert.deepStrictEqual(selectedRepositoryIds(state), [1, 3])
    })

    it('returns the same state when every selection still exists', () => {
      const state = selectionOf(1, 2)
      assert.strictEqual(pruneBulkSelection(state, [1, 2, 3]), state)
    })
  })
})
