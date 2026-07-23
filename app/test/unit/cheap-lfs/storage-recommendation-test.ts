import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { CheapLfsPinThresholdBytes } from '../../../src/lib/large-files'
import { CHEAP_LFS_PART_SIZE_BYTES } from '../../../src/lib/cheap-lfs/pointer'
import { recommendCheapLfsStorage } from '../../../src/lib/cheap-lfs/storage-recommendation'

describe('Cheap LFS storage recommendation', () => {
  it('keeps files at the ordinary Git threshold in Git', () => {
    const result = recommendCheapLfsStorage({
      fileSizesInBytes: [CheapLfsPinThresholdBytes],
      isGitHubRepository: true,
      ghcrAvailable: true,
      dockerHubAvailable: true,
    })
    assert.equal(result.provider, 'git')
    assert.equal(result.reason, 'ordinary-git')
  })

  it('recommends a published prerelease for one initial layer', () => {
    const result = recommendCheapLfsStorage({
      fileSizesInBytes: [CheapLfsPinThresholdBytes + 1],
      isGitHubRepository: true,
      ghcrAvailable: true,
      dockerHubAvailable: true,
    })
    assert.equal(result.provider, 'release')
    assert.equal(result.reason, 'single-release-transfer')
  })

  it('does not recommend ordinary Git for a large aggregate of small files', () => {
    const result = recommendCheapLfsStorage({
      fileSizesInBytes: Array.from(
        { length: 20 },
        () => CheapLfsPinThresholdBytes
      ),
      isGitHubRepository: true,
      ghcrAvailable: true,
      dockerHubAvailable: true,
    })
    assert.equal(result.provider, 'ghcr')
    assert.equal(result.reason, 'github-registry-large-batch')
  })

  it('recommends GHCR for a larger GitHub batch and counts split layers', () => {
    const result = recommendCheapLfsStorage({
      fileSizesInBytes: [CHEAP_LFS_PART_SIZE_BYTES + 1, 1],
      isGitHubRepository: true,
      ghcrAvailable: true,
      dockerHubAvailable: true,
    })
    assert.equal(result.provider, 'ghcr')
    assert.equal(result.reason, 'github-registry-large-batch')
    assert.equal(result.estimatedRegistryLayers, 3)
  })

  it('recommends Docker Hub when GHCR is unavailable', () => {
    const result = recommendCheapLfsStorage({
      fileSizesInBytes: [CHEAP_LFS_PART_SIZE_BYTES + 1],
      isGitHubRepository: true,
      ghcrAvailable: false,
      dockerHubAvailable: true,
    })
    assert.equal(result.provider, 'docker-hub')
    assert.equal(result.reason, 'docker-hub-large-batch')
  })

  it('falls back to multipart Releases when no registry is configured', () => {
    const result = recommendCheapLfsStorage({
      fileSizesInBytes: [CHEAP_LFS_PART_SIZE_BYTES * 2],
      isGitHubRepository: true,
      ghcrAvailable: false,
      dockerHubAvailable: false,
    })
    assert.equal(result.provider, 'release')
    assert.equal(result.reason, 'release-registry-unavailable')
    assert.equal(result.estimatedRegistryLayers, 2)
  })

  it('rejects unsafe sizes', () => {
    assert.throws(() =>
      recommendCheapLfsStorage({
        fileSizesInBytes: [-1],
        isGitHubRepository: false,
        ghcrAvailable: false,
        dockerHubAvailable: false,
      })
    )
  })
})
