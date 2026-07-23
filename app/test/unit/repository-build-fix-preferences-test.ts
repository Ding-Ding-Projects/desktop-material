import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  defaultBuildRunPreferences,
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

  it('changes the repository hash when parallel Cheap LFS uploads change', () => {
    const sequential = repositoryWith({
      ...defaultBuildRunPreferences,
      parallelCheapLfsUploads: false,
    })
    const parallel = repositoryWith({
      ...defaultBuildRunPreferences,
      parallelCheapLfsUploads: true,
    })
    const legacyMissing = repositoryWith({
      ...defaultBuildRunPreferences,
      parallelCheapLfsUploads: undefined,
    })

    assert.notEqual(sequential.hash, parallel.hash)
    assert.equal(legacyMissing.hash, parallel.hash)
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
