import assert from 'node:assert'
import { describe, it } from 'node:test'
import { sortDiffLineNumbers } from '../../../src/ui/diff/diff-helpers'

describe('diff selectable group line numbers', () => {
  it('orders line numbers by value rather than as text', () => {
    // The group label is read as "Lines <first> to <last>", so a text sort
    // announced "Lines 10 to 9" for a group covering lines 8 to 12.
    const sorted = sortDiffLineNumbers(new Set([10, 11, 12, 8, 9]))

    assert.deepEqual(sorted, [8, 9, 10, 11, 12])
    assert.equal(sorted.at(0), 8)
    assert.equal(sorted.at(-1), 12)
  })

  it('handles a group that stays under ten lines', () => {
    assert.deepEqual(sortDiffLineNumbers(new Set([3, 1, 2])), [1, 2, 3])
  })

  it('handles a single-line group', () => {
    const sorted = sortDiffLineNumbers(new Set([7]))
    assert.equal(sorted.at(0), 7)
    assert.equal(sorted.at(-1), 7)
  })

  it('orders numbers across a hundred boundary', () => {
    assert.deepEqual(
      sortDiffLineNumbers(new Set([99, 100, 101, 9])),
      [9, 99, 100, 101]
    )
  })
})
