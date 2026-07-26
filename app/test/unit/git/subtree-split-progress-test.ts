import assert from 'node:assert'
import { describe, it } from 'node:test'

import { parseSubtreeSplitProgress } from '../../../src/lib/git/subtree'

describe('parseSubtreeSplitProgress', () => {
  it('parses git-subtree’s processed/total (created) counter', () => {
    assert.deepStrictEqual(parseSubtreeSplitProgress('1234/5678 (91)'), {
      processed: 1234,
      total: 5678,
      created: 91,
    })
  })

  it('tolerates the surrounding whitespace and elapsed-time suffix', () => {
    assert.deepStrictEqual(parseSubtreeSplitProgress('  12/40 (3) 1:23.45  '), {
      processed: 12,
      total: 40,
      created: 3,
    })
  })

  it('caps processed at the total so a bar cannot overrun its track', () => {
    assert.deepStrictEqual(parseSubtreeSplitProgress('60/40 (5)'), {
      processed: 40,
      total: 40,
      created: 5,
    })
  })

  it('rejects a zero or missing total, which would make a percentage meaningless', () => {
    assert.equal(parseSubtreeSplitProgress('0/0 (0)'), null)
    assert.equal(parseSubtreeSplitProgress('12 (3)'), null)
  })

  it('rejects lines that are not a progress record', () => {
    assert.equal(parseSubtreeSplitProgress(''), null)
    assert.equal(parseSubtreeSplitProgress('Created branch stage'), null)
    assert.equal(
      parseSubtreeSplitProgress('fatal: could not read prefix'),
      null
    )
  })
})
