import { describe, it } from 'node:test'
import assert from 'node:assert'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { exec } from 'dugite'

import {
  chunkPathArguments,
  parseCatFileBatchBodies,
  parseCatFileBatchCheck,
  parseNulTerminatedIndexEntries,
  parseNulTerminatedTreeEntries,
  readBlobTextsByObjectName,
  readCommitTreeEntries,
  readIndexStageEntries,
} from '../../../src/lib/git/batched-object-reads'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'

const oid = (fill: string) => fill.repeat(40)

function batchRecord(objectId: string, type: string, body: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${objectId} ${type} ${body.length}\n`, 'utf8'),
    body,
    Buffer.from('\n', 'utf8'),
  ])
}

describe('batched-object-reads', () => {
  describe('chunkPathArguments', () => {
    it('returns no chunks for no paths', () => {
      assert.deepEqual(chunkPathArguments([]), [])
    })

    it('keeps a small set of paths in one ordered chunk', () => {
      const paths = ['a.txt', 'b c.txt', 'naïve-путь.txt']
      assert.deepEqual(chunkPathArguments(paths), [paths])
    })

    it('splits over-budget path sets without reordering or dropping', () => {
      const paths = Array.from({ length: 40 }, (_, i) => `file-${i}.bin`)
      const chunks = chunkPathArguments(paths, 100)
      assert.ok(chunks.length > 1)
      assert.deepEqual(
        chunks.flatMap(chunk => [...chunk]),
        paths
      )
      for (const chunk of chunks) {
        const chars = chunk.reduce((sum, path) => sum + path.length + 16, 0)
        assert.ok(chunk.length === 1 || chars <= 100)
      }
    })

    it('gives an individually oversized path its own chunk', () => {
      const chunks = chunkPathArguments(['x'.repeat(64), 'y.txt'], 32)
      assert.deepEqual(chunks, [['x'.repeat(64)], ['y.txt']])
    })
  })

  describe('parseCatFileBatchCheck', () => {
    it('maps info and missing lines per request, in order', () => {
      const stdout =
        `${oid('a')} blob 12\n` +
        `:quote"na ïve.bin missing\n` +
        `${'b'.repeat(64)} tree 0\n`
      assert.deepEqual(parseCatFileBatchCheck(stdout, 3), [
        { objectId: oid('a'), objectType: 'blob', sizeInBytes: 12 },
        null,
        { objectId: 'b'.repeat(64), objectType: 'tree', sizeInBytes: 0 },
      ])
    })

    it('tolerates CRLF line endings', () => {
      const stdout = `${oid('c')} blob 5\r\n:gone.bin missing\r\n`
      assert.deepEqual(parseCatFileBatchCheck(stdout, 2), [
        { objectId: oid('c'), objectType: 'blob', sizeInBytes: 5 },
        null,
      ])
    })

    it('rejects an inventory that does not answer every request', () => {
      assert.throws(
        () => parseCatFileBatchCheck(`${oid('a')} blob 1\n`, 2),
        /truncated object inventory/
      )
    })
  })

  describe('parseCatFileBatchBodies', () => {
    it('aligns bodies with requests across missing entries and hostile bytes', () => {
      const hostile = Buffer.concat([
        Buffer.from('line one\n\0binary\0', 'utf8'),
        Buffer.from('naïve-путь é\n', 'utf8'),
      ])
      const stream = Buffer.concat([
        batchRecord(oid('a'), 'blob', Buffer.from('hello world!', 'utf8')),
        Buffer.from(`:sp ace "quote" ünï.bin missing\n`, 'utf8'),
        batchRecord(oid('b'), 'blob', hostile),
      ])
      const bodies = parseCatFileBatchBodies(stream, 3, 1024)
      assert.equal(bodies.length, 3)
      assert.equal(bodies[0]?.toString('utf8'), 'hello world!')
      assert.equal(bodies[1], null)
      assert.ok(bodies[2] !== null && hostile.equals(bodies[2]))
    })

    it('nulls an over-limit body without changing its neighbors', () => {
      const stream = Buffer.concat([
        batchRecord(oid('a'), 'blob', Buffer.from('x'.repeat(100), 'utf8')),
        batchRecord(oid('b'), 'blob', Buffer.from('ok', 'utf8')),
      ])
      const bodies = parseCatFileBatchBodies(stream, 2, 10)
      assert.equal(bodies[0], null)
      assert.equal(bodies[1]?.toString('utf8'), 'ok')
    })

    it('nulls a non-blob record while consuming its body exactly', () => {
      const stream = Buffer.concat([
        batchRecord(oid('a'), 'tree', Buffer.from('tree-bytes', 'utf8')),
        batchRecord(oid('b'), 'blob', Buffer.from('after', 'utf8')),
      ])
      const bodies = parseCatFileBatchBodies(stream, 2, 1024)
      assert.equal(bodies[0], null)
      assert.equal(bodies[1]?.toString('utf8'), 'after')
    })

    it('rejects a truncated body', () => {
      const stream = Buffer.from(`${oid('a')} blob 10\nshort\n`, 'utf8')
      assert.throws(
        () => parseCatFileBatchBodies(stream, 1, 1024),
        /truncated batched object body/
      )
    })

    it('rejects a body without its terminating newline', () => {
      const stream = Buffer.from(`${oid('a')} blob 4\nfour`, 'utf8')
      assert.throws(
        () => parseCatFileBatchBodies(stream, 1, 1024),
        /truncated batched object body/
      )
    })

    it('rejects a stream with unexpected trailing data', () => {
      const stream = Buffer.concat([
        batchRecord(oid('a'), 'blob', Buffer.from('ok', 'utf8')),
        Buffer.from('junk\n', 'utf8'),
      ])
      assert.throws(
        () => parseCatFileBatchBodies(stream, 1, 1024),
        /unexpected trailing data/
      )
    })

    it('rejects a stream missing a whole record', () => {
      assert.throws(
        () => parseCatFileBatchBodies(Buffer.alloc(0), 1, 1024),
        /truncated batched object stream/
      )
    })
  })

  describe('parseNulTerminatedIndexEntries', () => {
    it('parses records whose paths contain spaces, quotes, and non-ASCII', () => {
      const stdout =
        `100644 ${oid('a')} 0\tsub dir/with space.txt\0` +
        `100755 ${'b'.repeat(64)} 0\tquote"na'ïve-путь.sh\0` +
        `100644 ${oid('c')} 2\tconflicted.txt\0`
      assert.deepEqual(parseNulTerminatedIndexEntries(stdout), [
        {
          mode: '100644',
          objectId: oid('a'),
          stage: '0',
          path: 'sub dir/with space.txt',
        },
        {
          mode: '100755',
          objectId: 'b'.repeat(64),
          stage: '0',
          path: `quote"na'ïve-путь.sh`,
        },
        {
          mode: '100644',
          objectId: oid('c'),
          stage: '2',
          path: 'conflicted.txt',
        },
      ])
    })

    it('returns no entries for empty output', () => {
      assert.deepEqual(parseNulTerminatedIndexEntries(''), [])
    })

    it('rejects a malformed record', () => {
      assert.throws(
        () => parseNulTerminatedIndexEntries('garbage\0'),
        /invalid staged-entry record/
      )
    })
  })

  describe('parseNulTerminatedTreeEntries', () => {
    it('parses blob, tree, and commit records with hostile paths', () => {
      const stdout =
        `100644 blob ${oid('a')}\tsub dir/quote"file é.txt\0` +
        `040000 tree ${oid('b')}\tsub dir\0` +
        `160000 commit ${oid('c')}\tsub module\0`
      assert.deepEqual(parseNulTerminatedTreeEntries(stdout), [
        {
          mode: '100644',
          objectType: 'blob',
          objectId: oid('a'),
          path: 'sub dir/quote"file é.txt',
        },
        {
          mode: '040000',
          objectType: 'tree',
          objectId: oid('b'),
          path: 'sub dir',
        },
        {
          mode: '160000',
          objectType: 'commit',
          objectId: oid('c'),
          path: 'sub module',
        },
      ])
    })

    it('rejects a malformed record', () => {
      assert.throws(
        () => parseNulTerminatedTreeEntries('100644 blob nothex\tx\0'),
        /invalid tree-entry record/
      )
    })
  })

  describe('against a real repository', () => {
    async function setupBatchedRepository(
      t: Parameters<typeof setupEmptyRepository>[0]
    ): Promise<{
      repository: Repository
      files: ReadonlyArray<{ path: string; text: string }>
    }> {
      const repository = await setupEmptyRepository(t)
      const files = [
        { path: 'with space.txt', text: 'spacey\n' },
        { path: `quote'name.txt`, text: 'quoted\n' },
        { path: 'naïve-путь.txt', text: 'unicode é\n' },
        { path: 'sub dir/nested ütf.txt', text: 'nested\n' },
      ]
      await mkdir(join(repository.path, 'sub dir'), { recursive: true })
      for (const file of files) {
        await writeFile(join(repository.path, file.path), file.text)
      }
      const added = await exec(['add', '-A'], repository.path)
      assert.equal(added.exitCode, 0, added.stderr)
      return { repository, files }
    }

    it('reads staged texts for many object names in one aligned pass', async t => {
      const { repository, files } = await setupBatchedRepository(t)
      const texts = await readBlobTextsByObjectName(
        repository,
        [...files.map(file => `:${file.path}`), ':absent.bin'],
        1024,
        'testBatchedBlobTexts'
      )
      assert.deepEqual(texts, [...files.map(file => file.text), null])
    })

    it('nulls only the over-limit blob in a mixed batch', async t => {
      const { repository } = await setupBatchedRepository(t)
      await writeFile(join(repository.path, 'big.bin'), 'x'.repeat(100))
      const added = await exec(['add', '--', 'big.bin'], repository.path)
      assert.equal(added.exitCode, 0, added.stderr)
      const texts = await readBlobTextsByObjectName(
        repository,
        [':big.bin', ':with space.txt'],
        10,
        'testBatchedBlobLimit'
      )
      assert.deepEqual(texts, [null, 'spacey\n'])
    })

    it('reads exact staged records per path, literally', async t => {
      const { repository, files } = await setupBatchedRepository(t)
      const entries = await readIndexStageEntries(
        repository,
        [...files.map(file => file.path), 'absent.bin', '*.txt'],
        'testBatchedIndexEntries'
      )
      for (const file of files) {
        const forPath = entries.get(file.path)
        assert.equal(forPath?.length, 1, file.path)
        assert.equal(forPath?.[0].mode, '100644')
        assert.equal(forPath?.[0].stage, '0')
      }
      assert.equal(entries.get('absent.bin'), undefined)
      // `:(literal)` pathspec magic keeps glob characters inert: the `*.txt`
      // request matches nothing instead of pulling other files' records in.
      assert.equal(entries.get('*.txt'), undefined)
      assert.equal(entries.size, files.length)
    })

    it('reads committed tree records for nested and hostile paths', async t => {
      const { repository, files } = await setupBatchedRepository(t)
      const committed = await exec(['commit', '-m', 'batched'], repository.path)
      assert.equal(committed.exitCode, 0, committed.stderr)
      const headResult = await exec(['rev-parse', 'HEAD'], repository.path)
      const head = headResult.stdout.trim()

      const entries = await readCommitTreeEntries(
        repository,
        head,
        [...files.map(file => file.path), 'absent.bin'],
        'testBatchedTreeEntries'
      )
      for (const file of files) {
        const forPath = entries.get(file.path)
        assert.equal(forPath?.length, 1, file.path)
        assert.equal(forPath?.[0].mode, '100644')
        assert.equal(forPath?.[0].objectType, 'blob')
      }
      assert.equal(entries.get('absent.bin'), undefined)
    })

    it('rejects an unsafe object name before spawning Git', async t => {
      const { repository } = await setupBatchedRepository(t)
      await assert.rejects(
        readBlobTextsByObjectName(
          repository,
          [':evil\nname'],
          1024,
          'testBatchedUnsafeName'
        ),
        /unsafe object name/
      )
    })

    it('rejects an invalid commit id before spawning Git', async t => {
      const { repository } = await setupBatchedRepository(t)
      await assert.rejects(
        readCommitTreeEntries(
          repository,
          'HEAD',
          ['with space.txt'],
          'testBatchedInvalidCommit'
        ),
        /invalid commit id/
      )
    })
  })
})
