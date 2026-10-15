import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import * as fs from 'fs/promises'
import { tmpdir } from 'os'
import * as Path from 'path'
import { IBatchCloneItem } from '../../src/models/batch-clone'
import {
  FileBatchCloneStagingManager,
  getBatchCloneStagingPaths,
} from '../../src/lib/stores/batch-clone-staging'

// Mock the actual fs object used by the transpiled named imports, not a copy.
const operations: typeof fs = require('fs/promises')

async function fixture() {
  const root = await fs.mkdtemp(
    Path.join(await fs.realpath(tmpdir()), 'dm-container-')
  )
  const item: IBatchCloneItem = {
    url: 'https://github.com/example/recovery.git',
    name: 'recovery',
    path: Path.join(root, 'clone'),
    recoveryId: 'a'.repeat(48),
  }
  return {
    root,
    item,
    paths: getBatchCloneStagingPaths(item),
    manager: new FileBatchCloneStagingManager(),
  }
}

const validMarker = JSON.stringify({
  version: 1,
  kind: 'desktop-material-batch-clone-staging-container',
})

describe('staging container ownership boundaries', () => {
  for (const contents of [
    '{}',
    'not json',
    JSON.stringify({
      version: 2,
      kind: 'desktop-material-batch-clone-staging-container',
    }),
  ]) {
    it(`retains an invalid container marker ${contents}`, async () => {
      const { root, item, paths, manager } = await fixture()
      try {
        await fs.mkdir(paths.containerPath)
        await fs.writeFile(paths.containerMarkerPath, contents)
        assert.equal(await manager.canClearStaleDirectCloneJournal(item), false)
        assert.equal((await manager.prepare(item)).kind, 'review')
        assert.equal(
          await fs.readFile(paths.containerMarkerPath, 'utf8'),
          contents
        )
      } finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    })
  }

  it('keeps concurrent owned recovery roots usable but never stale', async () => {
    const { root, item, manager } = await fixture()
    try {
      assert.equal((await manager.prepare(item)).kind, 'clone')
      const sibling = {
        ...item,
        path: Path.join(root, 'second'),
        recoveryId: 'b'.repeat(48),
      }
      assert.equal((await manager.prepare(sibling)).kind, 'clone')
      assert.equal(
        await manager.canClearStaleDirectCloneJournal({
          ...item,
          recoveryId: 'c'.repeat(48),
        }),
        false
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('retains unknown data even beside a valid marker', async () => {
    const { root, item, paths, manager } = await fixture()
    try {
      await fs.mkdir(paths.containerPath)
      await fs.writeFile(paths.containerMarkerPath, validMarker)
      await fs.writeFile(Path.join(paths.containerPath, 'sentinel'), 'keep')
      assert.equal(await manager.canClearStaleDirectCloneJournal(item), false)
      assert.equal((await manager.prepare(item)).kind, 'review')
      assert.equal(
        await fs.readFile(Path.join(paths.containerPath, 'sentinel'), 'utf8'),
        'keep'
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  for (const valid of [true, false]) {
    it(`revalidates an exclusive marker EEXIST race with ${
      valid ? 'valid' : 'invalid'
    } contents`, async () => {
      const { root, item, paths, manager } = await fixture()
      const writeFile = operations.writeFile
      const intercepted = mock.method(
        operations,
        'writeFile',
        async (...args: Parameters<typeof fs.writeFile>) => {
          if (args[0] === paths.containerMarkerPath) {
            await writeFile(
              paths.containerMarkerPath,
              valid ? validMarker : '{}'
            )
          }
          return writeFile(...args)
        }
      )
      try {
        assert.equal(
          (await manager.prepare(item)).kind,
          valid ? 'clone' : 'review'
        )
        assert.equal(
          await fs.readFile(paths.containerMarkerPath, 'utf8'),
          valid ? validMarker : '{}'
        )
      } finally {
        intercepted.mock.restore()
        await fs.rm(root, { recursive: true, force: true })
      }
    })
  }

  it('detects data arriving during exclusive marker creation before creating a root', async () => {
    const { root, item, paths, manager } = await fixture()
    const writeFile = operations.writeFile
    const intercepted = mock.method(
      operations,
      'writeFile',
      async (...args: Parameters<typeof fs.writeFile>) => {
        if (args[0] === paths.containerMarkerPath) {
          await writeFile(Path.join(paths.containerPath, 'sentinel'), 'keep')
        }
        return writeFile(...args)
      }
    )
    try {
      assert.equal((await manager.prepare(item)).kind, 'review')
      assert.equal(
        await fs.readFile(Path.join(paths.containerPath, 'sentinel'), 'utf8'),
        'keep'
      )
      await assert.rejects(fs.lstat(paths.recoveryRootPath), { code: 'ENOENT' })
    } finally {
      intercepted.mock.restore()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
