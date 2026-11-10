import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  countToolCategories,
  describeToolStatistics,
} from '../../src/lib/repository-tools-statistics'

describe('Repository tools statistics', () => {
  it('counts All first and leaves out categories with no tools', () => {
    const entries = [
      { category: 'Search' },
      { category: 'Share' },
      { category: 'Search' },
    ]
    assert.deepEqual(
      countToolCategories(entries, ['Status', 'Search', 'Share']),
      [
        { category: 'All', count: 3 },
        { category: 'Search', count: 2 },
        { category: 'Share', count: 1 },
      ]
    )
    assert.deepEqual(countToolCategories([], ['Status']), [
      { category: 'All', count: 0 },
    ])
  })

  it('says how many tools are shown', () => {
    assert.equal(describeToolStatistics(31, 31), '31 tools')
    assert.equal(describeToolStatistics(1, 1), '1 tool')
    assert.equal(describeToolStatistics(4, 31), '4 of 31 tools shown')
    assert.equal(describeToolStatistics(0, 31), '0 of 31 tools shown')
  })
})
