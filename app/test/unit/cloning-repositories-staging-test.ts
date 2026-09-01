import { describe, it } from 'node:test'
import assert from 'node:assert'
import { GitError as DugiteError } from 'dugite'
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
import { GitError, IGitResult } from '../../src/lib/git/core'
import { Account, getAccountKey } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { BatchCloneMode, IBatchCloneItem } from '../../src/models/batch-clone'
import {
  FileBatchCloneStagingManager,
  getBatchCloneStagingPaths,
  IBatchCloneStagingManager,
} from '../../src/lib/stores/batch-clone-staging'
import { FileBatchCloneJournal } from '../../src/lib/stores/batch-clone-journal'
import { setupEmptyRepository } from '../helpers/repositories'
import { makeCommit } from '../helpers/repository-scaffolding'

const alwaysValidRepository = async () => true

async function initializeDirectRecovery(
  store: CloningRepositoriesStore,
  root: string
): Promise<void> {
  await store.initializeDirectCloneRecovery(root)
}

function directItem(root: string): IBatchCloneItem {
  return {
    url: 'https://github.com/desktop-material/direct-clone.git',
    name: 'clone',
    path: Path.join(root, 'clone'),
    recoveryId: 'a'.repeat(48),
  }
}

function journalSnapshot(item: IBatchCloneItem) {
  return {
    version: 2 as const,
    updatedAt: new Date().toISOString(),
    items: [item],
    statuses: [[item.path, { kind: 'cloning' as const }]] as const,
    mode: BatchCloneMode.Sequential,
    source: 'manual' as const,
    paused: false,
    generation: 1,
  }
}

function journalFor(root: string): FileBatchCloneJournal {
  return new FileBatchCloneJournal(root, 'clone-direct-v1.json')
}

function authFailure(message = 'authentication failed'): Error {
  return new GitError(
    {
      exitCode: 128,
      stdout: '',
      stderr: message,
      gitError: DugiteError.HTTPSAuthenticationFailed,
      gitErrorDescription: message,
      path: 'C:\\repository',
    } as IGitResult,
    ['clone'],
    message
  )
}

describe('direct clone staging', () => {
  it('retains an unowned staging container for review', async () => {
    const root = await mkdtemp(Path.join(tmpdir(), 'desktop-material-unowned-'))
    const item = directItem(root)
    const paths = getBatchCloneStagingPaths(item)
    try {
      await mkdir(paths.containerPath)
      const result = await new FileBatchCloneStagingManager().prepare(item)
      assert.equal(result.kind, 'review')
      assert.equal(existsSync(paths.containerPath), true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a sensitive final path before creating staging state', async () => {
    const root = await mkdtemp(
      Path.join(tmpdir(), 'desktop-material-sensitive-')
    )
    const destination = Path.join(
      (await import('os')).homedir(),
      '.ssh',
      'clone'
    )
    try {
      let prepares = 0
      const manager: IBatchCloneStagingManager = {
        prepare: async () => {
          prepares += 1
          return { kind: 'clone', clonePath: Path.join(root, 'stage') }
        },
        reinspect: async () => true,
        completeAndPromote: async () => ({ kind: 'done', accountKey: null }),
        cleanupPromoted: async () => true,
        discard: async () => true,
      }
      const store = new CloningRepositoriesStore(async () => [], manager)
      await initializeDirectRecovery(store, root)
      let reported: Error | undefined
      const success = await store.clone(
        'https://github.com/desktop-material/direct-clone.git',
        destination,
        {},
        { onError: error => (reported = error) }
      )

      assert.equal(success, false)
      assert(reported instanceof Error)
      assert.match(reported.message, /sensitive system location/i)
      assert.equal(prepares, 0)
      assert.equal(
        existsSync(Path.join(root, '.desktop-material-clone-staging-v1')),
        false
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

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
        new FileBatchCloneStagingManager(rename, alwaysValidRepository)
      )
      await store.initializeDirectCloneRecovery(root)
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
      await store.initializeDirectCloneRecovery(root)
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
    if (process.platform !== 'win32') {
      t.skip('The no-replace rename contract is scoped to Windows.')
      return
    }
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
      let renameCalled = false
      const renameThatSwapsDestination = async (
        from: string,
        to: string
      ): Promise<void> => {
        renameCalled = true
        await symlink(
          external,
          to,
          process.platform === 'win32' ? 'junction' : 'dir'
        )
        await rename(from, to)
      }
      const store = new CloningRepositoriesStore(
        async () => [],
        new FileBatchCloneStagingManager(
          renameThatSwapsDestination,
          alwaysValidRepository
        )
      )
      await store.initializeDirectCloneRecovery(root)
      const success = await store.clone(
        source.path,
        destination,
        {},
        { onError: error => (reported = error) }
      )

      assert.equal(success, false)
      assert(reported instanceof Error)
      assert.match(reported.message, /became occupied and was not replaced/i)
      assert.equal(renameCalled, true)
      assert.equal(
        await readFile(Path.join(external, 'sentinel'), 'utf8'),
        'keep'
      )
      assert.equal(existsSync(Path.join(external, 'README.md')), false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('removes owned staging after a Git failure', async t => {
    const root = await mkdtemp(
      Path.join(tmpdir(), 'desktop-material-git-failure-')
    )
    const destination = Path.join(root, 'clone')
    try {
      const store = new CloningRepositoriesStore(
        async () => [],
        new FileBatchCloneStagingManager(rename, alwaysValidRepository)
      )
      await initializeDirectRecovery(store, root)
      let reported: Error | undefined
      const success = await store.clone(
        Path.join(root, 'missing-source'),
        destination,
        {},
        { onError: error => (reported = error) }
      )

      assert.equal(success, false)
      assert(reported instanceof Error)
      assert.equal(existsSync(destination), false)
      assert.equal(
        existsSync(Path.join(root, '.desktop-material-clone-staging-v1')),
        false
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('removes owned staging on cancellation', async t => {
    const source = await setupEmptyRepository(t)
    const root = await mkdtemp(Path.join(tmpdir(), 'desktop-material-cancel-'))
    const destination = Path.join(root, 'clone')
    const controller = new AbortController()
    controller.abort()
    try {
      const store = new CloningRepositoriesStore(
        async () => [],
        new FileBatchCloneStagingManager(rename, alwaysValidRepository)
      )
      await initializeDirectRecovery(store, root)
      let aborted = 0
      const success = await store.clone(
        source.path,
        destination,
        {},
        { signal: controller.signal, onAbort: () => (aborted += 1) }
      )

      assert.equal(success, false)
      assert.equal(aborted, 1)
      assert.equal(existsSync(destination), false)
      assert.equal(
        existsSync(Path.join(root, '.desktop-material-clone-staging-v1')),
        false
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resets owned staging between account fallback attempts', async () => {
    const first = new Account(
      'first',
      getDotComAPIEndpoint(),
      'token-first',
      [],
      '',
      1,
      '',
      'free'
    )
    const second = new Account(
      'second',
      getDotComAPIEndpoint(),
      'token-second',
      [],
      '',
      2,
      '',
      'free'
    )
    const root = await mkdtemp(Path.join(tmpdir(), 'desktop-material-retry-'))
    const destination = Path.join(root, 'clone')
    const attempts: Array<string | undefined> = []
    try {
      const cloneOperation = async (
        _url: string,
        clonePath: string,
        _options: unknown,
        _progress: unknown,
        accountKey?: string
      ) => {
        attempts.push(accountKey)
        if (attempts.length === 1) {
          throw authFailure()
        }
        await mkdir(Path.join(clonePath, '.git'), { recursive: true })
      }
      const store = new CloningRepositoriesStore(
        async () => [first, second],
        new FileBatchCloneStagingManager(rename, alwaysValidRepository),
        cloneOperation as never
      )
      await initializeDirectRecovery(store, root)
      const success = await store.clone(
        'https://github.com/desktop-material/direct-clone.git',
        destination,
        { accountKey: getAccountKey(first) }
      )

      assert.equal(success, true)
      assert.deepEqual(attempts, [getAccountKey(first), getAccountKey(second)])
      assert.equal(existsSync(Path.join(destination, '.git')), true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('cleans owned staging after a post-Git promotion interruption', async () => {
    const root = await mkdtemp(
      Path.join(tmpdir(), 'desktop-material-interrupt-')
    )
    const destination = Path.join(root, 'clone')
    try {
      const cloneOperation = async (_url: string, clonePath: string) => {
        await mkdir(Path.join(clonePath, '.git'), { recursive: true })
      }
      const interruptedRename = async () => {
        throw new Error('simulated promotion interruption')
      }
      const store = new CloningRepositoriesStore(
        async () => [],
        new FileBatchCloneStagingManager(
          interruptedRename,
          alwaysValidRepository
        ),
        cloneOperation as never
      )
      await initializeDirectRecovery(store, root)
      let reported: Error | undefined
      const success = await store.clone(
        'https://github.com/desktop-material/direct-clone.git',
        destination,
        {},
        { onError: error => (reported = error) }
      )

      assert.equal(success, false)
      assert(reported instanceof Error)
      assert.equal(existsSync(destination), false)
      assert.equal(
        existsSync(Path.join(root, '.desktop-material-clone-staging-v1')),
        false
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports cleanup failure after real promotion instead of hiding it', async t => {
    const source = await setupEmptyRepository(t)
    const root = await mkdtemp(Path.join(tmpdir(), 'desktop-material-cleanup-'))
    const destination = Path.join(root, 'clone')
    try {
      await makeCommit(source, {
        entries: [{ path: 'README.md', contents: 'cleanup' }],
        commitMessage: 'cleanup source',
      })
      const addUnexpected = async (from: string, to: string) => {
        await rename(from, to)
        await writeFile(
          Path.join(Path.dirname(Path.dirname(from)), 'unexpected'),
          'keep'
        )
      }
      const store = new CloningRepositoriesStore(
        async () => [],
        new FileBatchCloneStagingManager(addUnexpected, alwaysValidRepository)
      )
      await initializeDirectRecovery(store, root)
      const errors: Error[] = []
      store.onDidError(error => errors.push(error))
      const success = await store.clone(source.path, destination, {})

      assert.equal(success, true)
      assert.equal(existsSync(Path.join(destination, '.git')), true)
      assert.match(errors[0]?.message ?? '', /cleanup could not be verified/i)
      assert.notEqual(await journalFor(root).load(), null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('discovers and safely removes an interrupted direct clone on restart', async () => {
    const root = await mkdtemp(Path.join(tmpdir(), 'desktop-material-restart-'))
    const item = directItem(root)
    const manager = new FileBatchCloneStagingManager(
      rename,
      alwaysValidRepository
    )
    const journal = new FileBatchCloneJournal(root, 'clone-direct-v1.json')
    try {
      const prepared = await manager.prepare(item)
      assert.equal(prepared.kind, 'clone')
      await journal.save(journalSnapshot(item))

      const store = new CloningRepositoriesStore(async () => [], manager)
      const errors: Error[] = []
      store.onDidError(error => errors.push(error))
      await initializeDirectRecovery(store, root)

      assert.equal(await journal.load(), null)
      assert.match(errors[0]?.message ?? '', /safely discarded/i)
      assert.equal(
        existsSync(Path.join(root, '.desktop-material-clone-staging-v1')),
        false
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
