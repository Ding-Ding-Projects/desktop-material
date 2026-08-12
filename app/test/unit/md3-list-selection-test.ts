import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  md3AllVisibleSelected,
  md3ApplySelection,
  md3BulkPartitionSummary,
  md3BulkScope,
  md3BulkScopeLabel,
  md3InvertSelection,
  md3PartitionBulk,
  md3SelectAllLabel,
  md3SelectionIntent,
  md3SomeVisibleSelected,
  md3ToggleSelectAll,
} from '../../src/ui/md3/md3-list-selection'

/**
 * The selection algebra every MD3 list shares.
 *
 * These assertions are about the arithmetic rather than the pixels, which is
 * deliberate: the defect this module exists to prevent is eight lists quietly
 * disagreeing about what "select all" means while every one of them renders a
 * perfectly convincing checkbox.
 */

const visible = ['a', 'b', 'c', 'd', 'e']
const set = (...ids: ReadonlyArray<string>) => new Set(ids)

describe('md3 list selection', () => {
  it('reads an intent out of the modifier keys', () => {
    assert.equal(
      md3SelectionIntent({ shiftKey: false, ctrlKey: false, metaKey: false }),
      'replace'
    )
    assert.equal(
      md3SelectionIntent({ shiftKey: false, ctrlKey: true, metaKey: false }),
      'toggle'
    )
    assert.equal(
      md3SelectionIntent({ shiftKey: false, ctrlKey: false, metaKey: true }),
      'toggle'
    )
    // Shift wins over Ctrl, because Ctrl+Shift-click is a range everywhere.
    assert.equal(
      md3SelectionIntent({ shiftKey: true, ctrlKey: true, metaKey: false }),
      'range'
    )
  })

  it('replaces the selection on a plain click', () => {
    const result = md3ApplySelection(visible, set('a', 'b'), 3, 'replace', 0)
    assert.deepEqual(result.ids, ['d'])
    assert.equal(result.anchor, 3)
  })

  it('adds and removes one row on a toggle', () => {
    const added = md3ApplySelection(visible, set('a'), 2, 'toggle', 0)
    assert.deepEqual(added.ids, ['a', 'c'])

    const removed = md3ApplySelection(visible, set('a', 'c'), 2, 'toggle', 0)
    assert.deepEqual(removed.ids, ['a'])
  })

  it('keeps a selection in the visible list order', () => {
    // Ticked last-to-first, read first-to-last: an export must not come out
    // in the order the user happened to click.
    const first = md3ApplySelection(visible, set(), 4, 'toggle', null)
    const second = md3ApplySelection(visible, set(...first.ids), 1, 'toggle', 4)
    assert.deepEqual(second.ids, ['b', 'e'])
  })

  it('draws a range in either direction without moving the anchor', () => {
    const downward = md3ApplySelection(visible, set('a'), 3, 'range', 1)
    assert.deepEqual(downward.ids, ['b', 'c', 'd'])
    assert.equal(
      downward.anchor,
      1,
      'a range must not move the anchor, or Shift-click twice walks away ' +
        'from where the range started'
    )

    const upward = md3ApplySelection(visible, set(), 0, 'range', 3)
    assert.deepEqual(upward.ids, ['a', 'b', 'c', 'd'])
  })

  it('extends rather than replaces when the caller asks for it', () => {
    // The checkbox-list case. Replacing here is silent data loss: the four
    // boxes the user already ticked simply vanish.
    const extended = md3ApplySelection(
      visible,
      set('a', 'e'),
      3,
      'range',
      2,
      'extend'
    )
    assert.deepEqual(extended.ids, ['a', 'c', 'd', 'e'])

    const replaced = md3ApplySelection(
      visible,
      set('a', 'e'),
      3,
      'range',
      2,
      'replace'
    )
    assert.deepEqual(replaced.ids, ['c', 'd'])
  })

  it('falls back to a plain toggle when there is no anchor', () => {
    const result = md3ApplySelection(visible, set(), 2, 'range', null)
    assert.deepEqual(result.ids, ['c'])
    assert.equal(result.anchor, 2)
  })

  it('never selects a row the filter is hiding', () => {
    // The whole point of passing the VISIBLE ids: `x` and `y` exist in the
    // collection and are filtered out, and a range drawn across the filtered
    // list must not reach them.
    const filtered = ['a', 'd']
    const result = md3ApplySelection(filtered, set(), 1, 'range', 0)
    assert.deepEqual(result.ids, ['a', 'd'])
  })

  it('selects every visible row and clears them again', () => {
    const all = md3ToggleSelectAll(visible, set())
    assert.deepEqual([...all].sort(), ['a', 'b', 'c', 'd', 'e'])

    const cleared = md3ToggleSelectAll(visible, set(...all))
    assert.deepEqual(cleared, [])
  })

  it('leaves rows outside the filter alone when selecting all', () => {
    // `z` was selected before the filter narrowed the list. The user selected
    // it; a checkbox they cannot see did not unselect it.
    const filtered = ['a', 'b']
    const next = md3ToggleSelectAll(filtered, set('z'))
    assert.deepEqual([...next].sort(), ['a', 'b', 'z'])

    const cleared = md3ToggleSelectAll(filtered, set('a', 'b', 'z'))
    assert.deepEqual([...cleared], ['z'])
  })

  it('reports all-visible and some-visible as different states', () => {
    assert.equal(md3AllVisibleSelected(visible, set(...visible)), true)
    assert.equal(md3AllVisibleSelected(visible, set('a')), false)
    assert.equal(md3SomeVisibleSelected(visible, set('a')), true)
    assert.equal(md3SomeVisibleSelected(visible, set(...visible)), false)

    // An empty list is neither: a checkbox that reports "all selected" over
    // nothing invites a bulk action against nothing.
    assert.equal(md3AllVisibleSelected([], set()), false)
    assert.equal(md3SomeVisibleSelected([], set()), false)
  })

  it('inverts across the visible rows only', () => {
    const inverted = md3InvertSelection(['a', 'b'], set('a', 'z'))
    assert.deepEqual([...inverted].sort(), ['b', 'z'])
  })

  it('states which set a select-all means', () => {
    const filtered = md3SelectAllLabel(12, true)
    const everything = md3SelectAllLabel(12, false)
    assert.notEqual(
      filtered,
      everything,
      'the filtered and unfiltered labels must differ — an identical label ' +
        'is how a user deletes rows a filter was hiding'
    )
    assert.match(filtered, /12/)
    assert.match(everything, /12/)
  })

  it('describes the scope a bulk verb will actually run over', () => {
    const selected = md3BulkScopeLabel(3, 12, true)
    const filtered = md3BulkScopeLabel(0, 12, true)
    const all = md3BulkScopeLabel(0, 12, false)
    assert.match(selected, /3/)
    assert.match(filtered, /12/)
    assert.notEqual(filtered, all)
  })

  it('falls back from the selection to the filtered set', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const identify = (row: { id: string }) => row.id

    assert.deepEqual(
      md3BulkScope(rows, set('b'), identify).map(identify),
      ['b']
    )
    assert.deepEqual(
      md3BulkScope(rows, set(), identify).map(identify),
      ['a', 'b', 'c']
    )
  })

  it('partitions a bulk action and names what it skipped', () => {
    const rows = [
      { id: 'a', current: false },
      { id: 'b', current: true },
      { id: 'c', current: false },
    ]
    const partition = md3PartitionBulk(
      rows,
      row => !row.current,
      'it is checked out'
    )
    assert.deepEqual(
      partition.applied.map(row => row.id),
      ['a', 'c']
    )
    assert.deepEqual(
      partition.excluded.map(row => row.id),
      ['b']
    )
    const summary = md3BulkPartitionSummary(partition)
    assert.ok(summary !== null)
    assert.match(summary, /1/)
    assert.match(summary, /checked out/)
  })

  it('says nothing when a bulk action skipped nothing', () => {
    const partition = md3PartitionBulk([{ id: 'a' }], () => true, 'never')
    assert.equal(partition.reason, null)
    assert.equal(md3BulkPartitionSummary(partition), null)
  })
})
