import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  CommitAuthorOriginLoader,
  CommitAuthorOriginsCache,
} from '../../src/lib/commit-author-origins'
import type { IConfigValueOrigin } from '../../src/lib/git/config'
import type { Repository } from '../../src/models/repository'

const origin = (value: string): IConfigValueOrigin => ({
  value,
  scope: 'global',
  origin: 'file:test-config',
})

const repository = (id: number): Repository =>
  ({ id, path: `C:\\repo-${id}` } as Repository)

describe('CommitAuthorOriginsCache', () => {
  it('coalesces both values across concurrent and adjacent view mounts', async () => {
    const calls: string[] = []
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const load: CommitAuthorOriginLoader = async (_repository, name) => {
      calls.push(name)
      await gate
      return origin(name)
    }
    const cache = new CommitAuthorOriginsCache(load)
    const repo = repository(1)

    const first = cache.load(repo)
    const second = cache.load(repo)
    release?.()

    const [firstResult, secondResult] = await Promise.all([first, second])
    assert.strictEqual(firstResult, secondResult)
    assert.deepEqual(calls, ['user.name', 'user.email'])
    assert.equal(firstResult.name?.value, 'user.name')
    assert.equal(firstResult.email?.value, 'user.email')

    assert.strictEqual(await cache.load(repo), firstResult)
    assert.equal(calls.length, 2)
  })

  it('expires stale values and rejects clock-regressed values', async () => {
    let now = 1_000
    let calls = 0
    const load: CommitAuthorOriginLoader = async (_repository, name) => {
      calls += 1
      return origin(`${name}-${calls}`)
    }
    const cache = new CommitAuthorOriginsCache(load, 16, 100, () => now)
    const repo = repository(1)

    const first = await cache.load(repo)
    now = 1_100
    assert.strictEqual(await cache.load(repo), first)
    assert.equal(calls, 2)

    now = 1_101
    assert.notStrictEqual(await cache.load(repo), first)
    assert.equal(calls, 4)

    now = 500
    await cache.load(repo)
    assert.equal(calls, 6)
  })

  it('invalidates one repository or all repositories explicitly', async () => {
    let calls = 0
    const load: CommitAuthorOriginLoader = async (_repository, name) => {
      calls += 1
      return origin(name)
    }
    const cache = new CommitAuthorOriginsCache(load)
    const first = repository(1)
    const second = repository(2)

    await Promise.all([cache.load(first), cache.load(second)])
    assert.equal(calls, 4)

    cache.invalidate(first)
    await Promise.all([cache.load(first), cache.load(second)])
    assert.equal(calls, 6)

    cache.invalidate()
    await Promise.all([cache.load(first), cache.load(second)])
    assert.equal(calls, 10)
  })

  it('drops rejected and least-recently-used entries instead of retaining them', async () => {
    let calls = 0
    let shouldReject = true
    const load: CommitAuthorOriginLoader = async (_repository, name) => {
      calls += 1
      if (shouldReject) {
        throw new Error('config lookup failed')
      }
      return origin(name)
    }
    const cache = new CommitAuthorOriginsCache(load, 2)
    const first = repository(1)

    await assert.rejects(() => cache.load(first), /config lookup failed/)
    shouldReject = false
    await cache.load(first)
    assert.equal(calls, 4)

    const second = repository(2)
    const third = repository(3)
    await cache.load(second)
    await cache.load(first) // Touch first so second becomes the LRU entry.
    await cache.load(third)
    await cache.load(second)

    assert.equal(calls, 10)
  })
})
