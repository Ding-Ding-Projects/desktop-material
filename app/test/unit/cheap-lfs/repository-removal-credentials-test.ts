import assert from 'node:assert'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, it, mock } from 'node:test'

import {
  cheapLfsPayloadPasswordAccount,
  CheapLfsPayloadPasswordService,
  LegacyCheapLfsPayloadPasswordService,
  saveCheapLfsPayloadPassword,
} from '../../../src/lib/cheap-lfs/payload-encryption-credentials'
import { shell } from '../../../src/lib/app-shell'
import { AppStore } from '../../../src/lib/stores/app-store'
import { RepositoriesStore } from '../../../src/lib/stores/repositories-store'
import { TokenStore } from '../../../src/lib/stores/token-store'
import { Repository } from '../../../src/models/repository'
import { TestRepositoriesDatabase } from '../../helpers/databases'

const repository = new Repository(
  'C:\\work\\repository-removal',
  17,
  null,
  false
)

type RemovalFlowStore = {
  repositoriesStore: {
    removeRepository(repository: Repository): Promise<void>
    getAll(): Promise<ReadonlyArray<Repository>>
  }
  _removeRepository(
    repository: Repository,
    moveToTrash: boolean
  ): Promise<string>
  postPersistentErrorNotice(...args: ReadonlyArray<unknown>): void
  emitError(error: unknown): void
  _closeFoldout(foldout: unknown): void
  _showFoldout(foldout: unknown): void
}

function removalStore(
  onRemove: (repository: Repository) => void | Promise<void>,
  repositoriesStore?: RemovalFlowStore['repositoriesStore']
) {
  const store = Object.create(AppStore.prototype) as RemovalFlowStore
  store.repositoriesStore = repositoriesStore ?? {
    removeRepository: async candidate => onRemove(candidate),
    getAll: async () => [],
  }
  store.postPersistentErrorNotice = () => undefined
  store.emitError = () => undefined
  store._closeFoldout = () => undefined
  store._showFoldout = () => undefined
  return store
}

afterEach(() => mock.restoreAll())

describe('repository removal Cheap LFS credential cleanup', () => {
  it('deletes app-owned vault entries only after repository removal succeeds', async () => {
    const events = new Array<string>()
    mock.method(
      TokenStore,
      'deleteItem',
      async (service: string, _account: string) => {
        events.push(`vault:${service}`)
        return true
      }
    )
    const store = removalStore(() => {
      events.push('repository-store')
    })

    const result = await store._removeRepository(repository, false)

    assert.equal(result, 'removed')
    assert.equal(events[0], 'repository-store')
    assert.ok(events.includes(`vault:${CheapLfsPayloadPasswordService}`))
    assert.ok(events.includes(`vault:${LegacyCheapLfsPayloadPasswordService}`))
  })

  it('keeps the key when repository-store removal fails', async () => {
    let credentialDeletes = 0
    mock.method(TokenStore, 'deleteItem', async () => {
      credentialDeletes++
      return true
    })
    const errors = new Array<unknown>()
    const store = removalStore(() => {
      throw new Error('repository store unavailable')
    })
    store.emitError = error => errors.push(error)

    const result = await store._removeRepository(repository, false)

    assert.equal(result, 'error')
    assert.equal(credentialDeletes, 0)
    assert.equal(errors.length, 1)
  })

  it('keeps the key when moving the checkout to trash fails', async () => {
    let credentialDeletes = 0
    let repositoryRemovals = 0
    mock.method(TokenStore, 'deleteItem', async () => {
      credentialDeletes++
      return true
    })
    mock.method(shell, 'moveItemToTrash', async () => {
      throw new Error('trash unavailable')
    })
    const store = removalStore(() => {
      repositoryRemovals++
    })

    const result = await store._removeRepository(repository, true)

    assert.equal(result, 'trash-failed')
    assert.equal(repositoryRemovals, 0)
    assert.equal(credentialDeletes, 0)
  })

  it('finishes removal and posts a non-secret retry notice when vault cleanup fails', async () => {
    const sentinel = randomBytes(32).toString('base64url')
    mock.method(TokenStore, 'deleteItem', async () => {
      throw new Error(sentinel)
    })
    const removed = new Array<Repository>()
    const notices = new Array<ReadonlyArray<unknown>>()
    const errors = new Array<unknown>()
    const store = removalStore(candidate => {
      removed.push(candidate)
    })
    store.postPersistentErrorNotice = (...args) => notices.push(args)
    store.emitError = error => errors.push(error)

    const result = await store._removeRepository(repository, false)

    assert.equal(result, 'removed')
    assert.deepEqual(removed, [repository])
    assert.equal(notices.length, 1)
    assert.equal(errors.length, 0)
    assert.equal(JSON.stringify(notices).includes(sentinel), false)
  })

  it('uses the same canonical account through an actual store remove/re-add lifecycle', async t => {
    const database = new TestRepositoriesDatabase()
    await database.reset()
    t.after(() => database.close())
    const repositories = new RepositoriesStore(database)
    const path = 'C:\\work\\actual-readd-lifecycle'
    const first = await repositories.addRepository(path, join(path, '.git'))
    const values = new Map<string, string>()
    const key = (service: string, account: string) => `${service}\0${account}`
    mock.method(
      TokenStore,
      'getItem',
      async (service: string, account: string) =>
        values.get(key(service, account)) ?? null
    )
    mock.method(
      TokenStore,
      'setItem',
      async (service: string, account: string, value: string) => {
        values.set(key(service, account), value)
      }
    )
    mock.method(
      TokenStore,
      'deleteItem',
      async (service: string, account: string) =>
        values.delete(key(service, account))
    )
    const sentinel = Buffer.from(randomBytes(32).toString('base64url'))
    assert.equal(await saveCheapLfsPayloadPassword(first, sentinel), true)
    sentinel.fill(0)

    const store = removalStore(
      () => undefined,
      repositories as RemovalFlowStore['repositoriesStore']
    )
    assert.equal(await store._removeRepository(first, false), 'removed')
    const readded = await repositories.addRepository(path, join(path, '.git'))

    assert.notEqual(readded.id, first.id)
    assert.equal(
      cheapLfsPayloadPasswordAccount(readded),
      cheapLfsPayloadPasswordAccount(first)
    )
    assert.equal(values.size, 0)
  })
})
