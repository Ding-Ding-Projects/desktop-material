import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  isRedundantCommitDrop,
  sortCommitRowIndexes,
} from '../../../src/ui/history/commit-list'

describe('commit drag-and-drop insertion', () => {
  it('orders rows by number rather than as text', () => {
    // A bare `.sort()` compares as text, so it produced [10, 11, 2] here.
    assert.deepEqual(sortCommitRowIndexes([10, 2, 11]), [2, 10, 11])
    assert.deepEqual(sortCommitRowIndexes([12, 11, 10, 9]), [9, 10, 11, 12])
  })

  it('does not mutate the array it was given', () => {
    const original = [10, 2, 11]
    sortCommitRowIndexes(original)
    assert.deepEqual(original, [10, 2, 11])
  })

  it('recognizes a contiguous selection that spans row ten', () => {
    // Rows 9-11 dropped immediately above themselves changes nothing, so the
    // drop has to be ignored. Under the text sort this selection read as
    // non-contiguous and the drop was carried out — rewriting history for a
    // drag that moved nothing.
    assert.equal(
      isRedundantCommitDrop(sortCommitRowIndexes([11, 9, 10]), 8),
      true
    )
  })

  it('recognizes a drop landing inside the dragged commits', () => {
    assert.equal(isRedundantCommitDrop([9, 10, 11], 10), true)
  })

  it('recognizes a drop at the very top of the list', () => {
    assert.equal(isRedundantCommitDrop([0, 1, 2], null), true)
    assert.equal(isRedundantCommitDrop([1, 2, 3], null), false)
  })

  it('still allows a real move', () => {
    // Rows 9-11 dropped well above themselves is a genuine reorder.
    assert.equal(isRedundantCommitDrop([9, 10, 11], 3), false)
    // A non-contiguous selection is never redundant.
    assert.equal(isRedundantCommitDrop([2, 10], 1), false)
  })
})
