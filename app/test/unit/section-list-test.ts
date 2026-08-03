import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

import { getRowOffsetInSection } from '../../src/ui/lib/list/section-list'

describe('section-list', () => {
  describe('getRowOffsetInSection', () => {
    it('sums the height of each preceding variable-height row', () => {
      const rowHeights = [30, 46, 30]
      const offset = getRowOffsetInSection(
        ({ index }) => rowHeights[index.row],
        { section: 0, row: 2 }
      )

      assert.strictEqual(offset, 76)
    })
  })
})

describe('SectionList resize-observer capability check', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/src/ui/lib/list/section-list.tsx'),
    'utf8'
  )

  it('guards on the same value it constructs', () => {
    // The defect this guards: the guard tested the global `ResizeObserver`
    // while the constructor used `window.ResizeObserver`. When those two
    // disagreed the guard passed and `new` threw — and a throw in a component
    // constructor takes the whole subtree down, so the list rendered nothing
    // at all rather than degrading to an unobserved list. A user with
    // repositories saw an empty panel.
    const constructorBody = source.match(
      /const ResizeObserverClass[\s\S]*?\n\s+if \(([^)]*)\) \{/
    )

    assert.ok(constructorBody, 'could not find the capability check')
    const condition = constructorBody[1]

    assert.match(
      condition,
      /ResizeObserverClass/,
      'the guard must test the value that is actually constructed'
    )
    assert.doesNotMatch(
      condition,
      /\|\|\s*false/,
      'a capability check should not be padded with a constant'
    )
  })
})
