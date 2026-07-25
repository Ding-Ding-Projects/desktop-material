import assert from 'node:assert'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  isOversizedForOciPointer,
  unsafeSelectedPathIsProvablyNotPointer,
} from '../../../src/lib/cheap-lfs/commit-key'
import { CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES } from '../../../src/lib/cheap-lfs/ghcr-pointer'

describe('unsafe selected path sniff', () => {
  it('proves a small non-pointer raw file is not a pointer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-sniff-'))
    await writeFile(join(root, 'oddly-named.bin'), 'just some raw bytes')
    assert.equal(
      await unsafeSelectedPathIsProvablyNotPointer(root, 'oddly-named.bin'),
      true
    )
  })

  it('proves an oversized raw file is not a pointer without reading it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-sniff-'))
    const oversized = Buffer.alloc(CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES + 1)
    await writeFile(join(root, 'big.bin'), oversized)
    assert.equal(isOversizedForOciPointer(oversized.byteLength), true)
    assert.equal(
      await unsafeSelectedPathIsProvablyNotPointer(root, 'big.bin'),
      true
    )
  })

  it('stays fail-closed for a missing path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-sniff-'))
    assert.equal(
      await unsafeSelectedPathIsProvablyNotPointer(root, 'not-there.bin'),
      false
    )
  })

  it('stays fail-closed for a directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cheap-lfs-sniff-'))
    assert.equal(await unsafeSelectedPathIsProvablyNotPointer(root, '.'), false)
  })
})
