import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  computeTabOverflowLayout,
  hasTabOverflow,
  ITabWidthMeasurement,
} from '../../src/ui/repository-tabs/tab-overflow'

/** Build a list of uniform-width tab measurements with ids t0, t1, … */
function uniform(count: number, width: number): ITabWidthMeasurement[] {
  return Array.from({ length: count }, (_, i) => ({ id: `t${i}`, width }))
}

const gap = 6
const overflowButtonWidth = 40

describe('computeTabOverflowLayout', () => {
  it('returns nothing for an empty strip', () => {
    const layout = computeTabOverflowLayout([], {
      availableWidth: 400,
      gap,
      overflowButtonWidth,
    })
    assert.deepEqual(layout.visibleIds, [])
    assert.deepEqual(layout.overflowIds, [])
    assert.equal(hasTabOverflow(layout), false)
  })

  it('keeps every tab visible when they all fit', () => {
    // 3 × 100 + 2 gaps = 312 <= 400.
    const layout = computeTabOverflowLayout(uniform(3, 100), {
      availableWidth: 400,
      gap,
      overflowButtonWidth,
    })
    assert.deepEqual(layout.visibleIds, ['t0', 't1', 't2'])
    assert.deepEqual(layout.overflowIds, [])
    assert.equal(hasTabOverflow(layout), false)
  })

  it('does not force overflow on an exact fit despite rounding', () => {
    // 2 × 100 + 1 gap = 206; availableWidth just under by a rounding hair.
    const layout = computeTabOverflowLayout(uniform(2, 100), {
      availableWidth: 205.7,
      gap,
      overflowButtonWidth,
    })
    assert.deepEqual(layout.overflowIds, [])
  })

  it('moves trailing tabs into overflow when the strip is too narrow', () => {
    // 5 × 100 + 4 gaps = 524 > 300. budget = 300 - 40 = 260.
    // Leading fit: t0 (100), t1 (206); t2 would be 312 > 260 -> stop.
    const layout = computeTabOverflowLayout(uniform(5, 100), {
      availableWidth: 300,
      gap,
      overflowButtonWidth,
    })
    assert.deepEqual(layout.visibleIds, ['t0', 't1'])
    assert.deepEqual(layout.overflowIds, ['t2', 't3', 't4'])
    assert.equal(hasTabOverflow(layout), true)
  })

  it('reserves room for the overflow button', () => {
    // 4 × 100 + 3 gaps = 418 > 415 so overflow is needed; the reserved button
    // width pushes the last tab out even though the raw tabs nearly fit.
    const layout = computeTabOverflowLayout(uniform(4, 100), {
      availableWidth: 415,
      gap,
      overflowButtonWidth,
    })
    assert.deepEqual(layout.visibleIds, ['t0', 't1', 't2'])
    assert.deepEqual(layout.overflowIds, ['t3'])
  })

  it('keeps the active tab visible by sliding the window', () => {
    // Same geometry as the trailing-overflow case, but the active tab is the
    // last one; the visible window slides right to keep it on screen.
    const layout = computeTabOverflowLayout(uniform(5, 100), {
      availableWidth: 300,
      gap,
      overflowButtonWidth,
      activeTabId: 't4',
    })
    assert.deepEqual(layout.visibleIds, ['t3', 't4'])
    assert.deepEqual(layout.overflowIds, ['t0', 't1', 't2'])
    assert.ok(layout.visibleIds.includes('t4'))
  })

  it('keeps pinned tabs in the strip when the window slides to the active tab', () => {
    // 2 pinned + 5 ordinary, all 100 wide. The active tab is the last one, so
    // the window slides right; the pinned run must not be carried off with it.
    const layout = computeTabOverflowLayout(uniform(7, 100), {
      availableWidth: 500,
      gap,
      overflowButtonWidth,
      activeTabId: 't6',
      pinnedCount: 2,
    })
    assert.ok(layout.visibleIds.includes('t0'))
    assert.ok(layout.visibleIds.includes('t1'))
    assert.ok(layout.visibleIds.includes('t6'))
    assert.equal(layout.overflowIds.includes('t0'), false)
    assert.equal(layout.overflowIds.includes('t1'), false)
  })

  it('never overflows a pinned tab, however narrow the strip', () => {
    const layout = computeTabOverflowLayout(uniform(6, 100), {
      availableWidth: 260,
      gap,
      overflowButtonWidth,
      activeTabId: 't5',
      pinnedCount: 3,
    })
    assert.deepEqual(layout.visibleIds.slice(0, 3), ['t0', 't1', 't2'])
    for (const pinned of ['t0', 't1', 't2']) {
      assert.equal(layout.overflowIds.includes(pinned), false)
    }
    // The active ordinary tab still earns its place beside them.
    assert.ok(layout.visibleIds.includes('t5'))
  })

  it('reserves the pinned run out of the budget the ordinary tabs share', () => {
    // budget = 400 - 40 = 360. One pinned tab (100) plus its gap leaves 254,
    // which fits exactly two more 100-wide tabs (206) and not a third (312).
    const layout = computeTabOverflowLayout(uniform(5, 100), {
      availableWidth: 400,
      gap,
      overflowButtonWidth,
      pinnedCount: 1,
    })
    assert.deepEqual(layout.visibleIds, ['t0', 't1', 't2'])
    assert.deepEqual(layout.overflowIds, ['t3', 't4'])
  })

  it('keeps every pinned tab when they are the only tabs', () => {
    const layout = computeTabOverflowLayout(uniform(4, 100), {
      availableWidth: 120,
      gap,
      overflowButtonWidth,
      pinnedCount: 4,
    })
    assert.deepEqual(layout.visibleIds, ['t0', 't1', 't2', 't3'])
    assert.deepEqual(layout.overflowIds, [])
  })

  it('does not slide when the active tab already fits', () => {
    const layout = computeTabOverflowLayout(uniform(5, 100), {
      availableWidth: 300,
      gap,
      overflowButtonWidth,
      activeTabId: 't0',
    })
    assert.deepEqual(layout.visibleIds, ['t0', 't1'])
    assert.deepEqual(layout.overflowIds, ['t2', 't3', 't4'])
  })

  it('preserves original order in both partitions', () => {
    const layout = computeTabOverflowLayout(uniform(6, 90), {
      availableWidth: 220,
      gap,
      overflowButtonWidth,
      activeTabId: 't5',
    })
    const recombined = [...layout.visibleIds, ...layout.overflowIds].sort()
    assert.equal(recombined.length, 6)
    // The visible window is contiguous and ends at the active tab.
    assert.equal(layout.visibleIds[layout.visibleIds.length - 1], 't5')
  })

  it('always shows at least one tab even if it is wider than the budget', () => {
    const layout = computeTabOverflowLayout(
      [
        { id: 't0', width: 500 },
        { id: 't1', width: 500 },
      ],
      { availableWidth: 100, gap, overflowButtonWidth }
    )
    assert.deepEqual(layout.visibleIds, ['t0'])
    assert.deepEqual(layout.overflowIds, ['t1'])
  })

  it('never overflows a lone oversized tab (nothing to move)', () => {
    const layout = computeTabOverflowLayout([{ id: 't0', width: 500 }], {
      availableWidth: 100,
      gap,
      overflowButtonWidth,
    })
    assert.deepEqual(layout.visibleIds, ['t0'])
    assert.deepEqual(layout.overflowIds, [])
    assert.equal(hasTabOverflow(layout), false)
  })

  it('handles variable-width tabs', () => {
    const measurements: ITabWidthMeasurement[] = [
      { id: 'a', width: 80 },
      { id: 'b', width: 200 },
      { id: 'c', width: 80 },
      { id: 'd', width: 80 },
    ]
    // total = 80+200+80+80 + 3*6 = 458 > 260. budget = 260 - 40 = 220.
    // a (80), b (80+6+200 = 286 > 220) -> stop after a.
    const layout = computeTabOverflowLayout(measurements, {
      availableWidth: 260,
      gap,
      overflowButtonWidth,
    })
    assert.deepEqual(layout.visibleIds, ['a'])
    assert.deepEqual(layout.overflowIds, ['b', 'c', 'd'])
  })
})
