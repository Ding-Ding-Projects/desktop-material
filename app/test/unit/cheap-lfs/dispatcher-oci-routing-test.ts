import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Dispatcher } from '../../../src/ui/dispatcher/dispatcher'
import { Repository } from '../../../src/models/repository'
import type { IGitHubReleaseTransferProgressEvent } from '../../../src/lib/github-release-transfer'

describe('Dispatcher Cheap LFS OCI routing', () => {
  it('forwards remove cancellation and progress to the AppStore', async () => {
    const repository = new Repository('C:/cheap-lfs-oci', 41, null, false)
    const controller = new AbortController()
    const progress: IGitHubReleaseTransferProgressEvent = {
      operationId: 'oci-remove',
      direction: 'upload',
      transferredBytes: 2,
      totalBytes: 3,
    }
    let received: ReadonlyArray<unknown> | null = null
    let observedProgress: IGitHubReleaseTransferProgressEvent | null = null
    const dispatcher = Object.create(Dispatcher.prototype) as Dispatcher
    Object.assign(dispatcher, {
      appStore: {
        _removeCheapLfsPointer: async (...args: ReadonlyArray<unknown>) => {
          received = args
          ;(args[3] as (value: IGitHubReleaseTransferProgressEvent) => void)(
            progress
          )
        },
      },
    })

    await dispatcher.removeCheapLfsPointer(
      repository,
      'models/weights.bin',
      controller.signal,
      value => (observedProgress = value)
    )

    assert.equal(received?.[0], repository)
    assert.equal(received?.[1], 'models/weights.bin')
    assert.equal(received?.[2], controller.signal)
    assert.deepEqual(observedProgress, progress)
  })

  it('returns an OCI pin result without narrowing it to a Release asset', async () => {
    const repository = new Repository('C:/cheap-lfs-oci', 42, null, false)
    const expected = {
      provider: 'ghcr' as const,
      published: true,
      immutableReference: `ghcr.io/owner/repo-cheap-lfs@sha256:${'a'.repeat(
        64
      )}`,
      attempts: 1,
      maximumChunkBytes: 1024,
      files: [],
      failures: [],
      commitPaths: ['asset.bin'],
      keyCommitPath: null,
      keyCreated: false,
    }
    const dispatcher = Object.create(Dispatcher.prototype) as Dispatcher
    Object.assign(dispatcher, {
      appStore: {
        _pinFileToRelease: async () => expected,
      },
    })

    const result = await dispatcher.pinFileToRelease(repository, {
      absoluteFilePath: 'C:/cheap-lfs-oci/asset.bin',
      trackedRelativePath: 'asset.bin',
      releaseTag: '',
    })

    assert.equal('provider' in result ? result.provider : null, 'ghcr')
    assert.deepEqual('commitPaths' in result ? result.commitPaths : [], [
      'asset.bin',
    ])
  })
})
