import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  buildCheapLfsInventoryKey,
  CheapLfsInventoryCache,
  ICheapLfsInventoryChangeSignal,
} from '../../../src/lib/cheap-lfs/inventory-cache'

function signal(
  id: string,
  mtimeMs: number | null,
  sizeInBytes: number | null
): ICheapLfsInventoryChangeSignal {
  return { id, mtimeMs, sizeInBytes }
}

describe('buildCheapLfsInventoryKey', () => {
  it('is deterministic and order-insensitive', () => {
    const a = buildCheapLfsInventoryKey('head1', 'idx1', [
      signal('Modified+a', 10, 1),
      signal('New+b', 20, 2),
    ])
    const b = buildCheapLfsInventoryKey('head1', 'idx1', [
      signal('New+b', 20, 2),
      signal('Modified+a', 10, 1),
    ])
    assert.strictEqual(a, b)
  })

  it('changes when HEAD changes', () => {
    const base = buildCheapLfsInventoryKey('head1', 'idx1', [])
    const moved = buildCheapLfsInventoryKey('head2', 'idx1', [])
    assert.notStrictEqual(base, moved)
  })

  it('changes when the index signature changes (staging without a worktree edit)', () => {
    const base = buildCheapLfsInventoryKey('head1', 'idx1', [
      signal('Modified+a', 10, 1),
    ])
    const staged = buildCheapLfsInventoryKey('head1', 'idx2', [
      signal('Modified+a', 10, 1),
    ])
    assert.notStrictEqual(base, staged)
  })

  it('changes when a changed file is edited but keeps its status id (mtime/size)', () => {
    // The exact regression the memo must not miss: an edited materialized file
    // stays `Modified` (same id) but its bytes changed.
    const before = buildCheapLfsInventoryKey('head1', 'idx1', [
      signal('Modified+big.bin', 100, 4096),
    ])
    const afterMtime = buildCheapLfsInventoryKey('head1', 'idx1', [
      signal('Modified+big.bin', 101, 4096),
    ])
    const afterSize = buildCheapLfsInventoryKey('head1', 'idx1', [
      signal('Modified+big.bin', 100, 8192),
    ])
    assert.notStrictEqual(before, afterMtime)
    assert.notStrictEqual(before, afterSize)
  })

  it('distinguishes a measurable file from an unmeasurable one', () => {
    const measured = buildCheapLfsInventoryKey('head1', 'idx1', [
      signal('Modified+a', 0, 0),
    ])
    const unmeasured = buildCheapLfsInventoryKey('head1', 'idx1', [
      signal('Modified+a', null, null),
    ])
    assert.notStrictEqual(measured, unmeasured)
  })

  it('does not confuse adjacent fields across paths', () => {
    // A path id ending in a digit followed by a stat must not alias another
    // path's id/stat once flattened.
    const a = buildCheapLfsInventoryKey('h', 'i', [signal('Modified+a', 1, 23)])
    const b = buildCheapLfsInventoryKey('h', 'i', [signal('Modified+a', 12, 3)])
    assert.notStrictEqual(a, b)
  })

  it('treats an undefined HEAD (unborn branch) as a stable distinct section', () => {
    const unborn = buildCheapLfsInventoryKey(undefined, null, [])
    assert.strictEqual(unborn, buildCheapLfsInventoryKey(undefined, null, []))
    assert.notStrictEqual(unborn, buildCheapLfsInventoryKey('head', null, []))
  })
})

describe('CheapLfsInventoryCache', () => {
  it('computes once for a key, then serves the memo', async () => {
    const cache = new CheapLfsInventoryCache<number>()
    let calls = 0
    const compute = async () => {
      calls += 1
      return calls
    }
    assert.strictEqual(await cache.getOrCompute('repo', 'k1', compute), 1)
    assert.strictEqual(await cache.getOrCompute('repo', 'k1', compute), 1)
    assert.strictEqual(calls, 1)
  })

  it('recomputes when the key changes', async () => {
    const cache = new CheapLfsInventoryCache<number>()
    let calls = 0
    const compute = async () => ++calls
    assert.strictEqual(await cache.getOrCompute('repo', 'k1', compute), 1)
    assert.strictEqual(await cache.getOrCompute('repo', 'k2', compute), 2)
    assert.strictEqual(calls, 2)
  })

  it('recomputes after invalidate even for the same key', async () => {
    const cache = new CheapLfsInventoryCache<number>()
    let calls = 0
    const compute = async () => ++calls
    assert.strictEqual(await cache.getOrCompute('repo', 'k1', compute), 1)
    cache.invalidate('repo')
    assert.strictEqual(await cache.getOrCompute('repo', 'k1', compute), 2)
  })

  it('keys the memo per repository', async () => {
    const cache = new CheapLfsInventoryCache<string>()
    let calls = 0
    const compute = async () => `v${++calls}`
    assert.strictEqual(await cache.getOrCompute('a', 'k', compute), 'v1')
    assert.strictEqual(await cache.getOrCompute('b', 'k', compute), 'v2')
    assert.strictEqual(await cache.getOrCompute('a', 'k', compute), 'v1')
  })

  it('coalesces concurrent scans for the same key into one compute', async () => {
    const cache = new CheapLfsInventoryCache<number>()
    let calls = 0
    let release: (value: number) => void = () => undefined
    const gate = new Promise<number>(resolve => (release = resolve))
    const compute = () => {
      calls += 1
      return gate
    }
    const first = cache.getOrCompute('repo', 'k', compute)
    const second = cache.getOrCompute('repo', 'k', compute)
    release(7)
    assert.deepStrictEqual(await Promise.all([first, second]), [7, 7])
    assert.strictEqual(calls, 1)
  })

  it('does not cache a rejected scan', async () => {
    const cache = new CheapLfsInventoryCache<number>()
    let calls = 0
    const compute = async () => {
      calls += 1
      if (calls === 1) {
        throw new Error('scan failed')
      }
      return calls
    }
    await assert.rejects(() => cache.getOrCompute('repo', 'k', compute))
    assert.strictEqual(await cache.getOrCompute('repo', 'k', compute), 2)
  })

  it('never publishes a scan superseded by a newer key', async () => {
    const cache = new CheapLfsInventoryCache<string>()
    let releaseFirst: (value: string) => void = () => undefined
    const firstGate = new Promise<string>(resolve => (releaseFirst = resolve))
    const first = cache.getOrCompute('repo', 'k1', () => firstGate)
    // A newer key supersedes the in-flight k1 scan before it resolves.
    const second = await cache.getOrCompute('repo', 'k2', async () => 'v2')
    releaseFirst('v1')
    await first
    // The memo must hold the newest key's value, not the stale k1 result.
    assert.strictEqual(second, 'v2')
    let recomputed = false
    const served = await cache.getOrCompute('repo', 'k2', async () => {
      recomputed = true
      return 'v2b'
    })
    assert.strictEqual(served, 'v2')
    assert.strictEqual(recomputed, false)
  })
})
