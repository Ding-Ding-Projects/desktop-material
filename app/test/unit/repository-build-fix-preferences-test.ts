import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  defaultBuildRunPreferences,
  getCheapLfsUploadConcurrency,
  IBuildRunPreferences,
} from '../../src/models/build-run-preferences'
import { Repository } from '../../src/models/repository'

function repositoryWith(preferences: IBuildRunPreferences): Repository {
  return new Repository(
    'C:\\build-fix-repository',
    1,
    null,
    false,
    null,
    {},
    false,
    undefined,
    null,
    preferences
  )
}

describe('Repository build-fix preference identity', () => {
  it('changes the repository hash when the selected provider changes', () => {
    const opencode = repositoryWith({
      ...defaultBuildRunPreferences,
      buildFixProvider: 'opencode',
    })
    const codex = repositoryWith({
      ...defaultBuildRunPreferences,
      buildFixProvider: 'codex',
    })

    assert.notEqual(opencode.hash, codex.hash)
  })

  it('changes the repository hash when provider auto-approve changes', () => {
    const guarded = repositoryWith({
      ...defaultBuildRunPreferences,
      buildFixAutoApprove: false,
    })
    const unattended = repositoryWith({
      ...defaultBuildRunPreferences,
      buildFixAutoApprove: true,
    })

    assert.notEqual(guarded.hash, unattended.hash)
  })

  it('changes the repository hash for each Cheap LFS upload lane count', () => {
    const sequential = repositoryWith({
      ...defaultBuildRunPreferences,
      cheapLfsUploadConcurrency: 1,
      parallelCheapLfsUploads: false,
    })
    const twoLanes = repositoryWith({
      ...defaultBuildRunPreferences,
      cheapLfsUploadConcurrency: 2,
      parallelCheapLfsUploads: true,
    })
    const threeLanes = repositoryWith({
      ...defaultBuildRunPreferences,
      cheapLfsUploadConcurrency: 3,
      parallelCheapLfsUploads: true,
    })
    const legacySequential = repositoryWith({
      ...defaultBuildRunPreferences,
      cheapLfsUploadConcurrency: undefined,
      parallelCheapLfsUploads: false,
    })
    const legacyMissing = repositoryWith({
      ...defaultBuildRunPreferences,
      cheapLfsUploadConcurrency: undefined,
      parallelCheapLfsUploads: undefined,
    })

    assert.notEqual(sequential.hash, twoLanes.hash)
    assert.notEqual(twoLanes.hash, threeLanes.hash)
    assert.equal(legacySequential.hash, sequential.hash)
    assert.equal(legacyMissing.hash, threeLanes.hash)
  })

  it('normalizes persisted Cheap LFS upload concurrency compatibly', () => {
    const preferences = (cheapLfsUploadConcurrency?: number) => ({
      ...defaultBuildRunPreferences,
      cheapLfsUploadConcurrency,
      parallelCheapLfsUploads: undefined,
    })

    assert.equal(getCheapLfsUploadConcurrency(preferences(undefined)), 3)
    assert.equal(
      getCheapLfsUploadConcurrency({
        ...preferences(undefined),
        parallelCheapLfsUploads: false,
      }),
      1
    )
    assert.equal(getCheapLfsUploadConcurrency(preferences(-4)), 1)
    assert.equal(getCheapLfsUploadConcurrency(preferences(2.9)), 2)
    assert.equal(getCheapLfsUploadConcurrency(preferences(99)), 3)
    assert.equal(getCheapLfsUploadConcurrency(preferences(Number.NaN)), 3)
  })

  it('changes the repository hash when Cheap LFS storage changes', () => {
    const releases = repositoryWith({
      ...defaultBuildRunPreferences,
      cheapLfsStorageProvider: 'release',
    })
    const ghcr = repositoryWith({
      ...defaultBuildRunPreferences,
      cheapLfsStorageProvider: 'ghcr',
    })
    const dockerHub = repositoryWith({
      ...defaultBuildRunPreferences,
      cheapLfsStorageProvider: 'docker-hub',
    })

    assert.notEqual(releases.hash, ghcr.hash)
    assert.notEqual(ghcr.hash, dockerHub.hash)
    assert.notEqual(dockerHub.hash, releases.hash)
  })
})
