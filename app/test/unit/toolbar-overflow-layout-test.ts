import assert from 'node:assert'
import { describe, it } from 'node:test'

import { calculateToolbarOverflow } from '../../src/ui/toolbar/toolbar-overflow-layout'

const items = [
  { id: 'repository', preferredWidth: 100 },
  {
    id: 'one-click-commit-push',
    preferredWidth: 80,
    overflowPriority: 2,
  },
  { id: 'build-run', preferredWidth: 90, overflowPriority: 1 },
]

describe('toolbar overflow layout', () => {
  it('keeps every item visible when the preferred row fits', () => {
    assert.deepEqual(calculateToolbarOverflow(290, 10, 40, items), {
      overflowedItemIds: [],
      exhausted: false,
    })
  })

  it('moves Build & run first and accounts for the More control', () => {
    assert.deepEqual(calculateToolbarOverflow(250, 10, 40, items), {
      overflowedItemIds: ['build-run'],
      exhausted: false,
    })
  })

  it('moves Commit & push only after Build & run', () => {
    assert.deepEqual(calculateToolbarOverflow(200, 10, 40, items), {
      overflowedItemIds: ['one-click-commit-push', 'build-run'],
      exhausted: false,
    })
  })

  it('restores Commit & push before Build & run while widening', () => {
    const narrow = calculateToolbarOverflow(200, 10, 40, items)
    const wider = calculateToolbarOverflow(250, 10, 40, items)
    const widest = calculateToolbarOverflow(290, 10, 40, items)

    assert.deepEqual(narrow.overflowedItemIds, [
      'one-click-commit-push',
      'build-run',
    ])
    assert.deepEqual(wider.overflowedItemIds, ['build-run'])
    assert.deepEqual(widest.overflowedItemIds, [])
  })

  it('reports when pinned controls alone cannot fit', () => {
    assert.deepEqual(
      calculateToolbarOverflow(99, 10, 40, [
        { id: 'repository', preferredWidth: 100 },
      ]),
      { overflowedItemIds: [], exhausted: true }
    )
  })

  it('uses reverse DOM order to break equal-priority ties', () => {
    const equalPriorityItems = [
      { id: 'repository', preferredWidth: 100 },
      { id: 'first', preferredWidth: 80, overflowPriority: 1 },
      { id: 'second', preferredWidth: 80, overflowPriority: 1 },
    ]

    assert.deepEqual(
      calculateToolbarOverflow(240, 10, 40, equalPriorityItems)
        .overflowedItemIds,
      ['second']
    )
  })
})
