import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  calculateCheapLfsClonePointerSetSha256,
  CheapLfsCloneInventoryRemoteFile,
  ICheapLfsCloneInventoryAsset,
} from '../../../src/lib/cheap-lfs/clone-inventory'
import {
  CheapLfsCloneInventoryProbe,
  ICheapLfsProbeableRepository,
} from '../../../src/lib/cheap-lfs/clone-inventory-probe'

interface IDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): IDeferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

const asset: ICheapLfsCloneInventoryAsset = {
  path: 'assets/hero.psd',
  provider: 'release',
  size: 42,
  objectSha256: 'a'.repeat(64),
  pointerBlobSha256: 'b'.repeat(64),
}

function found(
  ref = 'main',
  assets: ReadonlyArray<ICheapLfsCloneInventoryAsset> = [asset]
): CheapLfsCloneInventoryRemoteFile {
  return {
    kind: 'found',
    ref,
    blobSha: 'c'.repeat(40),
    text: JSON.stringify({
      schemaVersion: 1,
      pointerSetSha256: calculateCheapLfsClonePointerSetSha256(assets),
      assets,
    }),
  }
}

function repository(
  name: string,
  defaultBranch = 'main'
): ICheapLfsProbeableRepository {
  return {
    cloneUrl: `https://github.com/example/${name}.git`,
    ownerLogin: 'example',
    name,
    defaultBranch,
  }
}

describe('CheapLfsCloneInventoryProbe', () => {
  it('deduplicates in-flight work and serves the completed result from cache', async () => {
    const request = deferred<CheapLfsCloneInventoryRemoteFile>()
    const updated = deferred<void>()
    let calls = 0
    const probe = new CheapLfsCloneInventoryProbe(
      'https://api.github.com#7',
      async () => {
        calls++
        return await request.promise
      },
      () => updated.resolve()
    )
    const repo = repository('game')

    probe.probe(repo)
    probe.probe(repo)
    assert.equal(calls, 1)

    request.resolve(found())
    await updated.promise
    assert.equal(probe.getCachedAssetCount(repo.cloneUrl, 'main'), 1)
    assert.equal(probe.getCachedResult(repo.cloneUrl, 'main')?.status, 'ready')

    probe.probe(repo)
    assert.equal(calls, 1)
  })

  it('bounds concurrent probes and starts queued work as capacity frees', async () => {
    const releases = new Map<string, () => void>()
    const thirdStarted = deferred<void>()
    const allUpdated = deferred<void>()
    let calls = 0
    let active = 0
    let maximumActive = 0
    let updates = 0

    const probe = new CheapLfsCloneInventoryProbe(
      'https://api.github.com#7',
      async (_owner, name) => {
        calls++
        active++
        maximumActive = Math.max(maximumActive, active)
        if (calls === 3) {
          thirdStarted.resolve()
        }
        return await new Promise<CheapLfsCloneInventoryRemoteFile>(resolve => {
          releases.set(name, () => {
            active--
            resolve({ kind: 'absent' })
          })
        })
      },
      () => {
        updates++
        if (updates === 3) {
          allUpdated.resolve()
        }
      },
      2
    )

    probe.probe(repository('one'))
    probe.probe(repository('two'))
    probe.probe(repository('three'))
    assert.equal(calls, 2)
    assert.equal(maximumActive, 2)

    releases.get('one')?.()
    await thirdStarted.promise
    assert.equal(calls, 3)
    assert.equal(maximumActive, 2)

    releases.get('two')?.()
    releases.get('three')?.()
    await allUpdated.promise
    assert.equal(updates, 3)
  })

  it('aborts a hung request at the configured timeout and caches the failure', async () => {
    const updated = deferred<void>()
    let aborted = false
    const probe = new CheapLfsCloneInventoryProbe(
      'https://api.github.com#7',
      async (_owner, _name, _branch, signal) =>
        await new Promise<CheapLfsCloneInventoryRemoteFile>(
          (_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                aborted = true
                const error = new Error('probe timed out')
                error.name = 'AbortError'
                reject(error)
              },
              { once: true }
            )
          }
        ),
      () => updated.resolve(),
      1,
      10,
      5
    )
    const repo = repository('hung')

    probe.probe(repo)
    await updated.promise
    assert.equal(aborted, true)
    assert.equal(
      probe.getCachedResult(repo.cloneUrl, 'main')?.status,
      'network'
    )
  })

  it('rejects a found manifest returned for a stale default-branch ref', async () => {
    const updated = deferred<void>()
    const probe = new CheapLfsCloneInventoryProbe(
      'https://api.github.com#7',
      async () => found('old-default'),
      () => updated.resolve()
    )
    const repo = repository('moved-default')

    probe.probe(repo)
    await updated.promise
    assert.equal(
      probe.getCachedResult(repo.cloneUrl, 'main')?.status,
      'invalid'
    )
    assert.equal(probe.getCachedAssetCount(repo.cloneUrl, 'main'), null)
  })

  it('hides a managed helper whose current pointer inventory is empty', async () => {
    const updated = deferred<void>()
    const probe = new CheapLfsCloneInventoryProbe(
      'https://api.github.com#7',
      async () => found('main', []),
      () => updated.resolve()
    )
    const repo = repository('no-large-files')

    probe.probe(repo)
    await updated.promise
    assert.equal(probe.getCachedResult(repo.cloneUrl, 'main')?.status, 'absent')
    assert.equal(probe.getCachedAssetCount(repo.cloneUrl, 'main'), null)
  })
})
