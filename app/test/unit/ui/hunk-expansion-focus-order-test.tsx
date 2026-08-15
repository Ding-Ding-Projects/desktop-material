import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  getHunkExpansionKeyIndex,
  sortHunkExpansionKeys,
} from '../../../src/ui/diff/diff-helpers'

describe('hunk expansion focus order', () => {
  it('orders keys by hunk number rather than as text', () => {
    // A lexicographic sort puts '10-up' before '2-up', which sent focus to a
    // distant hunk on any diff with ten or more expandable hunks.
    const keys = ['10-up', '2-down', '1-up', '11-down', '3-up', '2-up']

    assert.deepEqual(sortHunkExpansionKeys(keys), [
      '1-up',
      '2-down',
      '2-up',
      '3-up',
      '10-up',
      '11-down',
    ])
  })

  it('keeps both buttons of one hunk in the order they rendered', () => {
    assert.deepEqual(sortHunkExpansionKeys(['4-up', '4-down']), [
      '4-up',
      '4-down',
    ])
  })

  it('finds the nearest hunk forward and backward', () => {
    const sorted = sortHunkExpansionKeys([
      '1-up',
      '2-up',
      '10-up',
      '11-up',
      '20-up',
    ])

    assert.equal(
      sorted.find(key => getHunkExpansionKeyIndex(key) >= 3),
      '10-up'
    )
    assert.equal(
      [...sorted].reverse().find(key => getHunkExpansionKeyIndex(key) <= 3),
      '2-up'
    )
  })

  it('reads the hunk index out of a key', () => {
    assert.equal(getHunkExpansionKeyIndex('12-down'), 12)
    assert.equal(getHunkExpansionKeyIndex('0-up'), 0)
  })

  it('accepts an iterator, which is what the component holds', () => {
    const refs = new Map<string, unknown>([
      ['10-up', null],
      ['2-up', null],
    ])
    assert.deepEqual(sortHunkExpansionKeys(refs.keys()), ['2-up', '10-up'])
  })
})
