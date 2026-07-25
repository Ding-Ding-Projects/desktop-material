import assert from 'node:assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  CheapLfsCommitKeyError,
  isOversizedForOciPointer,
  regularFileProbeSize,
  resolveCheapLfsCommitKeyRequirement,
} from '../../../src/lib/cheap-lfs/commit-key'
import {
  CHEAP_LFS_GHCR_POINTER_VERSION,
  CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES,
  serializeCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'

function privatePointerText(): string {
  return serializeCheapLfsGhcrPointer({
    version: CHEAP_LFS_GHCR_POINTER_VERSION,
    image: `ghcr.io/owner/repository-cheap-lfs@sha256:${'a'.repeat(64)}`,
    object: `sha256:${'b'.repeat(64)}`,
    sizeInBytes: 7,
    layers: [`sha256:${'0'.repeat(64)}`],
    keyId: `sha256:${'d'.repeat(64)}`,
  })
}

describe('isOversizedForOciPointer', () => {
  it('is false at and below the bounded pointer size', () => {
    assert.strictEqual(isOversizedForOciPointer(0), false)
    assert.strictEqual(isOversizedForOciPointer(1), false)
    assert.strictEqual(
      isOversizedForOciPointer(CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES),
      false
    )
  })

  it('is true only strictly above the bound', () => {
    assert.strictEqual(
      isOversizedForOciPointer(CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES + 1),
      true
    )
    assert.strictEqual(isOversizedForOciPointer(4 * 1024 * 1024 * 1024), true)
  })
})

describe('regularFileProbeSize', () => {
  it('returns the size for a regular file', () => {
    assert.strictEqual(
      regularFileProbeSize({ isFile: () => true, size: 42 }),
      42
    )
  })

  it('returns null for a symlink/dir/non-file so the full prover still runs', () => {
    assert.strictEqual(
      regularFileProbeSize({ isFile: () => false, size: 42 }),
      null
    )
  })
})

describe('resolveCheapLfsCommitKeyRequirement size guard', () => {
  async function withTempDir(
    run: (dir: string) => Promise<void>
  ): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'cheap-lfs-size-guard-'))
    try {
      await run(dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  it('bails to "no key" for a file larger than the bounded pointer text', async () => {
    await withTempDir(async dir => {
      // A raw file over the pointer bound cannot be an OCI pointer. The cheap
      // size probe must return null here WITHOUT hashing the whole file.
      await writeFile(
        join(dir, 'data.bin'),
        Buffer.alloc(CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES + 1024, 1)
      )
      const requirement = await resolveCheapLfsCommitKeyRequirement(
        dir,
        ['data.bin'],
        'verified-public'
      )
      assert.strictEqual(requirement, null)
    })
  })

  it('does NOT skip a small valid private pointer (fail-closed preserved)', async () => {
    await withTempDir(async dir => {
      await writeFile(join(dir, 'data.bin'), privatePointerText())
      // If the size probe wrongly skipped this small pointer the function would
      // return null; instead a public repo must refuse the private pointer.
      await assert.rejects(
        resolveCheapLfsCommitKeyRequirement(
          dir,
          ['data.bin'],
          'verified-public'
        ),
        CheapLfsCommitKeyError
      )
    })
  })
})
