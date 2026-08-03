import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  parseIndicatorCache,
  serializeIndicatorCache,
} from '../../src/lib/stores/helpers/repository-indicator-cache'
import { ILocalRepositoryState } from '../../src/models/repository'

const entry: ILocalRepositoryState = {
  aheadBehind: { ahead: 2, behind: 1 },
  upstreamState: 'tracking',
  changedFilesCount: 7,
  branchName: 'main',
  defaultBranchName: 'main',
}

describe('repository indicator cache', () => {
  it('round-trips an indicator so the next launch paints something true', () => {
    const restored = parseIndicatorCache(
      serializeIndicatorCache(new Map([[42, entry]]))
    )

    assert.deepEqual(restored.get(42), entry)
  })

  it('survives a corrupt payload instead of taking the list down with it', () => {
    // Storage is not a trusted source: it outlives upgrades, it can be edited
    // by hand, and a half-written value can outlive a crash.
    assert.equal(parseIndicatorCache('not json at all').size, 0)
    assert.equal(parseIndicatorCache('[1,2,3]').size, 0)
    assert.equal(parseIndicatorCache(null).size, 0)
    assert.equal(parseIndicatorCache('').size, 0)
  })

  it('drops a malformed entry rather than coercing it into the list', () => {
    const restored = parseIndicatorCache(
      JSON.stringify({
        1: { ...entry, changedFilesCount: -4 },
        2: { ...entry, changedFilesCount: 1.5 },
        3: { ...entry, upstreamState: 'not-a-state' },
        4: { ...entry, branchName: 12 },
        5: { ...entry, aheadBehind: { ahead: -1, behind: 0 } },
        6: entry,
      })
    )

    // Only the sound one survives; a negative or fractional change count would
    // render an impossible row.
    assert.deepEqual([...restored.keys()], [6])
  })

  it('ignores keys that are not real repository ids', () => {
    const restored = parseIndicatorCache(
      JSON.stringify({ '0': entry, '-3': entry, abc: entry, '9': entry })
    )

    assert.deepEqual([...restored.keys()], [9])
  })

  it('keeps a null ahead/behind, which is a real state and not missing data', () => {
    const withoutTracking: ILocalRepositoryState = {
      ...entry,
      aheadBehind: null,
      upstreamState: 'no-upstream',
      branchName: null,
      defaultBranchName: null,
    }

    const restored = parseIndicatorCache(
      serializeIndicatorCache(new Map([[3, withoutTracking]]))
    )

    assert.deepEqual(restored.get(3), withoutTracking)
  })

  it('bounds how much a cache can grow', () => {
    const big = new Map<number, ILocalRepositoryState>()
    for (let id = 1; id <= 600; id++) {
      big.set(id, entry)
    }

    const restored = parseIndicatorCache(serializeIndicatorCache(big))
    assert.equal(restored.size, 500)
  })
})
