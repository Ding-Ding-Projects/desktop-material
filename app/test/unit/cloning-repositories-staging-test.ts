import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import * as Path from 'path'

import { CloningRepositoriesStore } from '../../src/lib/stores/cloning-repositories-store'
import { IBatchCloneItem } from '../../src/models/batch-clone'
import {
  FileBatchCloneStagingManager,
  IBatchCloneStagingManager,
} from '../../src/lib/stores/batch-clone-staging'
import { setupEmptyRepository } from '../helpers/repositories'
import { makeCommit } from '../helpers/repository-scaffolding'

class DirectStagingTestManager implements IBatchCloneStagingManager {
  private readonly stagedPaths = new Map<string, string>()
  private nextId = 0

  public constructor(
    private readonly root: string,
    private readonly swapTarget?: string
  ) {}

  public async prepare(item: IBatchCloneItem) {
    const clonePath = Path.join(this.root, `stage-${++this.nextId}`)
    await mkdir(clonePath)
    this.stagedPaths.set(item.recoveryId!, clonePath)
    return { kind: 'clone' as const, clonePath }
  }

  public async reinspect(_item: IBatchCloneItem, _clonePath: string) {
    return true
  }

  public async completeAndPromote(
    item: IBatchCloneItem,
    clonePath: string,
    successfulAccountKey: string | null
  ) {
    if (this.swapTarget !== undefined) {
      await symlink(
        this.swapTarget,
        item.path,
        process.platform === 'win32' ? 'junction' : 'dir'
      )
      return {
        kind: 'review' as const,
        error: new Error(
          'The staged clone or final destination changed before promotion and was left unchanged.'
        ),
      }
    }
    await rename(clonePath, item.path)
    return { kind: 'done' as const, accountKey: successfulAccountKey }
  }

  public async cleanupPromoted(item: IBatchCloneItem) {
    this.stagedPaths.delete(item.recoveryId!)
    return true
  }

  public async discard(item: IBatchCloneItem) {
    if (existsSync(item.path)) {
      return false
    }
    const clonePath = this.stagedPaths.get(item.recoveryId!)
    if (clonePath !== undefined) {
      await rm(clonePath, { recursive: true, force: true })
      this.stagedPaths.delete(item.recoveryId!)
    }
    return true
  }
}

describe('direct clone staging', () => {
  it('clones into an owned staging directory and promotes only after validation', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'staged clone' }],
      commitMessage: 'staged clone source',
    })
    const root = await mkdtemp(Path.join(tmpdir(), 'desktop-material-direct-'))
    const destination = Path.join(root, 'clone')
    try {
      const store = new CloningRepositoriesStore(
        async () => [],
        new DirectStagingTestManager(Path.join(root, 'staging'))
      )
      await mkdir(Path.join(root, 'staging'))
      let reported: Error | undefined
      const success = await store.clone(
        source.path,
        destination,
        {},
        { onError: error => (reported = error) }
      )

      assert.equal(success, true, reported?.message)
      assert.equal(existsSync(Path.join(destination, '.git')), true)
      assert.equal(
        existsSync(Path.join(root, '.desktop-material-clone-staging-v1')),
        false
      )
      assert.equal(
        await readFile(Path.join(destination, 'README.md'), 'utf8'),
        'staged clone'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a linked ancestor before Git can write through it', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'must stay out' }],
      commitMessage: 'linked ancestor source',
    })
    const root = await mkdtemp(Path.join(tmpdir(), 'desktop-material-linked-'))
    const realBase = Path.join(root, 'real-base')
    const linkedBase = Path.join(root, 'linked-base')
    const external = Path.join(root, 'external')
    const destination = Path.join(linkedBase, 'clone')
    try {
      await mkdir(realBase)
      await mkdir(external)
      await writeFile(Path.join(external, 'sentinel'), 'keep')
      try {
        await symlink(
          realBase,
          linkedBase,
          process.platform === 'win32' ? 'junction' : 'dir'
        )
      } catch (error) {
        if (
          process.platform === 'win32' &&
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EACCES')
        ) {
          t.skip('Creating directory links is not permitted on this host.')
          return
        }
        throw error
      }

      let reported: Error | undefined
      const store = new CloningRepositoriesStore(
        async () => [],
        new FileBatchCloneStagingManager()
      )
      const success = await store.clone(
        source.path,
        destination,
        {},
        { onError: error => (reported = error) }
      )

      assert.equal(success, false)
      assert(reported instanceof Error)
      assert.match(reported.message, /base directory.*linked|staging/i)
      assert.equal(
        await readFile(Path.join(external, 'sentinel'), 'utf8'),
        'keep'
      )
      assert.equal(existsSync(destination), false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not overwrite a destination swapped in before promotion', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'race source' }],
      commitMessage: 'race source',
    })
    const root = await mkdtemp(Path.join(tmpdir(), 'desktop-material-race-'))
    const external = Path.join(root, 'external')
    const destination = Path.join(root, 'clone')
    try {
      await mkdir(external)
      await writeFile(Path.join(external, 'sentinel'), 'keep')
      let reported: Error | undefined
      const store = new CloningRepositoriesStore(
        async () => [],
        new DirectStagingTestManager(Path.join(root, 'staging'), external)
      )
      await mkdir(Path.join(root, 'staging'))
      const success = await store.clone(
        source.path,
        destination,
        {},
        { onError: error => (reported = error) }
      )

      assert.equal(success, false)
      assert(reported instanceof Error)
      assert.match(reported.message, /changed before promotion|left unchanged/i)
      assert.equal(
        await readFile(Path.join(external, 'sentinel'), 'utf8'),
        'keep'
      )
      assert.equal(existsSync(Path.join(external, 'README.md')), false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
