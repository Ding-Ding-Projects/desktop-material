import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createHash } from 'crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import * as Path from 'path'

import {
  IDroppedEntry,
  binaryEncodingDirection,
  binaryEncodingTargetName,
  nonClashingFileName,
  planDroppedEntries,
} from '../../src/lib/file-converter-drop'
import {
  convertBinaryEncodingBesideSource,
  expandDroppedPaths,
} from '../../src/main-process/file-converter-drop'

async function withFolder(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(Path.join(tmpdir(), 'dm-converter-drop-'))
  try {
    await run(folder)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

describe('file converter drop rules', () => {
  it('encodes ordinary files and decodes Base64 text files', () => {
    assert.equal(binaryEncodingDirection('photo.png'), 'encode')
    assert.equal(binaryEncodingDirection('photo.png.base64.txt'), 'decode')
    assert.equal(binaryEncodingDirection('PHOTO.PNG.BASE64.TXT'), 'decode')
    assert.equal(binaryEncodingDirection('.base64.txt'), 'encode')
    assert.equal(binaryEncodingTargetName('photo.png'), 'photo.png.base64.txt')
    assert.equal(binaryEncodingTargetName('photo.png.base64.txt'), 'photo.png')
  })

  it('adds a number before the extension instead of overwriting', () => {
    const taken = new Set(['a.png', 'a (1).png', 'b.png.base64.txt', 'c'])
    const isTaken = (name: string) => taken.has(name)
    assert.equal(nonClashingFileName('free.png', isTaken), 'free.png')
    assert.equal(nonClashingFileName('a.png', isTaken), 'a (2).png')
    assert.equal(
      nonClashingFileName('b.png.base64.txt', isTaken),
      'b.png (1).base64.txt'
    )
    assert.equal(nonClashingFileName('c', isTaken), 'c (1)')
  })

  it('opens a dropped folder but skips its subfolders unless asked', async () => {
    const tree: Record<string, ReadonlyArray<IDroppedEntry>> = {
      '/drop': [
        { path: '/drop/a.png', kind: 'file' },
        { path: '/drop/sub', kind: 'directory' },
        { path: '/drop/link', kind: 'other' },
        { path: '/drop/.a.png.123.partial', kind: 'file' },
      ],
      '/drop/sub': [{ path: '/drop/sub/b.png', kind: 'file' }],
    }
    const list = async (path: string) => tree[path] ?? []
    const dropped: ReadonlyArray<IDroppedEntry> = [
      { path: '/loose.txt', kind: 'file' },
      { path: '/drop', kind: 'directory' },
    ]

    const shallow = await planDroppedEntries(dropped, list, {
      includeSubfolders: false,
    })
    assert.deepEqual(shallow.files, ['/loose.txt', '/drop/a.png'])
    assert.deepEqual(
      shallow.skipped.map(s => s.path),
      ['/drop/link', '/drop/.a.png.123.partial', '/drop/sub']
    )
    assert.equal(shallow.truncated, false)

    const deep = await planDroppedEntries(dropped, list, {
      includeSubfolders: true,
    })
    assert.deepEqual(deep.files, [
      '/loose.txt',
      '/drop/a.png',
      '/drop/sub/b.png',
    ])
  })

  it('stops at the file limit and says so', async () => {
    const plan = await planDroppedEntries(
      [
        { path: '/1', kind: 'file' },
        { path: '/2', kind: 'file' },
        { path: '/3', kind: 'file' },
      ],
      async () => [],
      { includeSubfolders: true, limit: 2 }
    )
    assert.deepEqual(plan.files, ['/1', '/2'])
    assert.equal(plan.truncated, true)
  })
})

describe('file converter drop on disk', () => {
  it('writes the Base64 text beside the original and round-trips it', async () => {
    await withFolder(async folder => {
      const source = Path.join(folder, 'data.bin')
      const bytes = Buffer.from(
        Array.from({ length: 200_001 }, (_, index) => (index * 31) % 256)
      )
      await writeFile(source, bytes)

      const encoded = await convertBinaryEncodingBesideSource(source)
      assert.equal(encoded.direction, 'encode')
      assert.equal(
        encoded.destinationPath,
        Path.join(folder, 'data.bin.base64.txt')
      )
      assert.equal(
        encoded.sha256,
        createHash('sha256').update(bytes).digest('hex')
      )
      assert.equal(
        await readFile(encoded.destinationPath, 'utf8'),
        bytes.toString('base64')
      )
      assert.deepEqual(await readFile(source), bytes)

      // Decoding must not replace the original that is still there.
      const decoded = await convertBinaryEncodingBesideSource(
        encoded.destinationPath
      )
      assert.equal(decoded.direction, 'decode')
      assert.equal(decoded.destinationPath, Path.join(folder, 'data (1).bin'))
      assert.deepEqual(await readFile(decoded.destinationPath), bytes)
      assert.deepEqual(await readFile(source), bytes)
      assert.deepEqual((await readdir(folder)).sort(), [
        'data (1).bin',
        'data.bin',
        'data.bin.base64.txt',
      ])
    })
  })

  it('refuses invalid Base64 text, names the offset and leaves nothing behind', async () => {
    await withFolder(async folder => {
      const source = Path.join(folder, 'bad.bin.base64.txt')
      await writeFile(source, 'QUJD\nRE*G')
      await assert.rejects(
        convertBinaryEncodingBesideSource(source),
        /Character "\*" at offset 7 is not Base64/
      )
      await writeFile(source, 'QUJDR')
      await assert.rejects(
        convertBinaryEncodingBesideSource(source),
        /not a multiple of four/
      )
      assert.deepEqual(await readdir(folder), ['bad.bin.base64.txt'])
    })
  })

  it('expands a dropped folder from the real file system', async () => {
    await withFolder(async folder => {
      await mkdir(Path.join(folder, 'inner'))
      await writeFile(Path.join(folder, 'one.txt'), '1')
      await writeFile(Path.join(folder, 'inner', 'two.txt'), '2')

      const shallow = await expandDroppedPaths([folder], false)
      assert.deepEqual(shallow.files, [Path.join(folder, 'one.txt')])
      assert.deepEqual(
        shallow.skipped.map(s => s.path),
        [Path.join(folder, 'inner')]
      )

      const deep = await expandDroppedPaths([folder], true)
      assert.deepEqual(deep.files, [
        Path.join(folder, 'one.txt'),
        Path.join(folder, 'inner', 'two.txt'),
      ])
    })
  })
})
