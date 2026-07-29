import assert from 'node:assert'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  CheapLfsOwnedArtifactExcludePatterns,
  cheapLfsOwnedArtifactKind,
  forgetCheapLfsOwnedArtifact,
  isCheapLfsOwnedArtifactName,
  isCheapLfsOwnedArtifactPath,
  isRegisteredCheapLfsOwnedArtifact,
  registerCheapLfsOwnedArtifact,
} from '../../../src/lib/cheap-lfs/owned-artifacts'

const uuid = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'

describe('Cheap LFS owned artifacts', () => {
  it('recognises every artifact shape this code writes', () => {
    assert.equal(
      cheapLfsOwnedArtifactKind('.cheeplfs-61dca085c3b02d74.tmp'),
      'temporary-file'
    )
    assert.equal(
      cheapLfsOwnedArtifactKind('.verify-f776493b3ff7f1df.tmp'),
      'verification-file'
    )
    assert.equal(
      cheapLfsOwnedArtifactKind(`.big.bin.cheap-lfs-recovery-4821-${uuid}`),
      'recovery-directory'
    )
    assert.equal(
      cheapLfsOwnedArtifactKind(`.entry.cheap-lfs-recovery-4821-${uuid}`),
      'recovery-directory'
    )
    assert.equal(
      cheapLfsOwnedArtifactKind(`.cheap-lfs-hydrate-4821-${uuid}`),
      'recovery-directory'
    )
    assert.equal(
      cheapLfsOwnedArtifactKind(`.model.bin.cheap-lfs-hydrate-${uuid}`),
      'recovery-directory'
    )
    for (const kind of ['ghcr', 'materialized', 'consumed']) {
      assert.equal(
        cheapLfsOwnedArtifactKind(`.cheap-lfs-${kind}-4821-${uuid}`),
        'temporary-file'
      )
      assert.equal(
        cheapLfsOwnedArtifactKind(`.model.bin.cheap-lfs-${kind}-4821-${uuid}`),
        'temporary-file'
      )
    }
  })

  it('leaves ordinary user files alone', () => {
    for (const name of [
      'big.bin',
      'cheeplfs.tmp',
      '.cheeplfs.tmp',
      // The hex run is the wrong length, so this is not a shape this code emits.
      '.cheeplfs-abc.tmp',
      '.cheeplfs-61dca085c3b02d74.tmp.bak',
      'notes.cheap-lfs-recovery-notes',
      '.verify-f776493b3ff7f1df.txt',
    ]) {
      assert.equal(isCheapLfsOwnedArtifactName(name), false, name)
    }
  })

  it('matches on any path segment, so recovery contents are covered too', () => {
    assert.equal(
      isCheapLfsOwnedArtifactPath('vm/.cheeplfs-61dca085c3b02d74.tmp'),
      true
    )
    assert.equal(
      isCheapLfsOwnedArtifactPath(
        `vm/.big.bin.cheap-lfs-recovery-4821-${uuid}/original`
      ),
      true
    )
    assert.equal(
      isCheapLfsOwnedArtifactPath(
        `vm\\.big.bin.cheap-lfs-recovery-4821-${uuid}\\replacement`
      ),
      true
    )
    assert.equal(isCheapLfsOwnedArtifactPath('vm/disk.qcow2'), false)
    assert.equal(isCheapLfsOwnedArtifactPath(''), false)
  })

  it('publishes exclude patterns covering each artifact family', () => {
    assert.deepEqual(CheapLfsOwnedArtifactExcludePatterns, [
      '.cheeplfs-*.tmp',
      '.verify-*.tmp',
      '.*.cheap-lfs-recovery-*/',
      '.cheap-lfs-hydrate-*/',
      '.*.cheap-lfs-hydrate-*/',
      '.cheap-lfs-ghcr-*',
      '.*.cheap-lfs-ghcr-*',
      '.cheap-lfs-materialized-*',
      '.*.cheap-lfs-materialized-*',
      '.cheap-lfs-consumed-*',
      '.*.cheap-lfs-consumed-*',
    ])
  })

  it('tracks provenance separately from shape', () => {
    const path = join(process.cwd(), 'vm', '.cheeplfs-61dca085c3b02d74.tmp')
    assert.equal(isRegisteredCheapLfsOwnedArtifact(path), false)
    assert.equal(registerCheapLfsOwnedArtifact(path), path)
    assert.equal(isRegisteredCheapLfsOwnedArtifact(path), true)
    forgetCheapLfsOwnedArtifact(path)
    assert.equal(isRegisteredCheapLfsOwnedArtifact(path), false)
  })
})
