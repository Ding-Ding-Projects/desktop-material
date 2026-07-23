import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mkdir, truncate, writeFile } from 'fs/promises'
import { join } from 'path'

import {
  CheapLfsPinThresholdBytes,
  getWorkingDirectoryFileSizes,
} from '../../src/lib/large-files'
import { Repository } from '../../src/models/repository'
import { createTempDirectory } from '../helpers/temp'

describe('working-directory file sizes', () => {
  it('classifies known, missing, non-file, and escaping paths safely', async t => {
    const root = await createTempDirectory(t)
    await writeFile(join(root, 'known.bin'), 'hello')
    await mkdir(join(root, 'folder'))
    const sizes = await getWorkingDirectoryFileSizes(
      new Repository(root, 1, null, false),
      [
        { path: 'known.bin' },
        { path: 'missing.bin' },
        { path: 'folder' },
        { path: '../outside.bin' },
      ],
      undefined,
      2
    )

    assert.deepEqual(sizes.get('known.bin'), {
      kind: 'known',
      sizeInBytes: 5,
    })
    assert.deepEqual(sizes.get('missing.bin'), {
      kind: 'missing',
      sizeInBytes: 0,
    })
    assert.deepEqual(sizes.get('folder'), {
      kind: 'non-file',
      sizeInBytes: 0,
    })
    assert.deepEqual(sizes.get('../outside.bin'), {
      kind: 'unknown',
      sizeInBytes: null,
    })
  })

  it('preserves the strict Cheap LFS threshold boundary', async t => {
    const root = await createTempDirectory(t)
    await writeFile(join(root, 'boundary.bin'), '')
    await writeFile(join(root, 'candidate.bin'), '')
    await truncate(join(root, 'boundary.bin'), CheapLfsPinThresholdBytes)
    await truncate(join(root, 'candidate.bin'), CheapLfsPinThresholdBytes + 1)

    const sizes = await getWorkingDirectoryFileSizes(
      new Repository(root, 1, null, false),
      [{ path: 'boundary.bin' }, { path: 'candidate.bin' }]
    )
    assert.equal(
      sizes.get('boundary.bin')?.sizeInBytes,
      CheapLfsPinThresholdBytes
    )
    assert.equal(
      sizes.get('candidate.bin')?.sizeInBytes,
      CheapLfsPinThresholdBytes + 1
    )
  })

  it('rejects an already-canceled scan', async t => {
    const root = await createTempDirectory(t)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      getWorkingDirectoryFileSizes(
        new Repository(root, 1, null, false),
        [{ path: 'anything.bin' }],
        controller.signal
      ),
      (error: Error) => error.name === 'AbortError'
    )
  })
})
