import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  ActionsCachePageSize,
  mergeActionsCachePage,
  parseActionsCacheList,
  parseActionsCacheUsage,
} from '../../src/lib/actions-caches'

function cache(id: number) {
  return {
    id,
    key: `windows-node-${id}`,
    ref: 'refs/heads/main',
    size_in_bytes: id * 1024,
    last_accessed_at: '2026-07-14T12:00:00Z',
    created_at: '2026-07-13T12:00:00Z',
    version: 'v1',
  }
}

describe('Actions cache contracts', () => {
  it('parses one bounded page and exposes a safe continuation', () => {
    const page = parseActionsCacheList(
      {
        total_count: 31,
        actions_caches: [cache(1), cache(2)],
      },
      1
    )

    assert.equal(page.caches.length, 2)
    assert.equal(page.nextPage, 2)
    assert.equal(page.truncated, true)
    assert.equal(page.caches[0].lastAccessedAt instanceof Date, true)
    assert.equal(ActionsCachePageSize, 30)
  })

  it('merges shifted pages without duplicating cache ids', () => {
    const first = parseActionsCacheList(
      { total_count: 3, actions_caches: [cache(1), cache(2)] },
      1
    )
    const second = parseActionsCacheList(
      { total_count: 3, actions_caches: [cache(2), cache(3)] },
      2
    )

    const merged = mergeActionsCachePage(first, second)
    assert.deepEqual(
      merged.caches.map(value => value.id),
      [1, 2, 3]
    )
    assert.equal(merged.nextPage, null)
    assert.equal(merged.truncated, false)
  })

  it('rejects duplicate ids and malformed usage receipts', () => {
    assert.throws(() =>
      parseActionsCacheList({
        total_count: 2,
        actions_caches: [cache(1), cache(1)],
      })
    )
    assert.throws(() =>
      parseActionsCacheList({
        total_count: 1,
        actions_caches: [{ ...cache(1), key: 'bad\u0000key' }],
      })
    )
    assert.throws(() =>
      parseActionsCacheUsage({
        active_caches_count: -1,
        active_caches_size_in_bytes: 0,
      })
    )
  })
})
