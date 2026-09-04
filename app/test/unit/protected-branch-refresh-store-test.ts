import assert from 'node:assert'
import { describe, it } from 'node:test'

import { API, getDotComAPIEndpoint } from '../../src/lib/api'
import { getAccountKey, Account } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { AppStore } from '../../src/lib/stores/app-store'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('AppStore protected branch refresh', () => {
  function createStore(
    account: Account,
    fetchProtectedBranches: () => Promise<
      ReadonlyArray<{ name: string; protected: true }> | null
    >,
    onUpdate: (
      protectedBranches: ReadonlyArray<{ name: string; protected: true }>
    ) => void
  ) {
    const repository = new Repository(
      '/desktop',
      1,
      gitHubRepoFixture({ owner: 'desktop', name: 'desktop' }),
      false,
      null,
      {},
      false,
      undefined,
      getAccountKey(account)
    )
    const store = Object.create(AppStore.prototype) as any
    store.accounts = [account]
    store.repositoriesStore = {
      updateBranchProtections: async (
        _repository: unknown,
        protectedBranches: ReadonlyArray<{ name: string; protected: true }>
      ) => onUpdate(protectedBranches),
    }

    const originalFromAccount = API.fromAccount
    Reflect.set(API, 'fromAccount', () => ({ fetchProtectedBranches }))

    return { repository, store, originalFromAccount }
  }

  function createAccount() {
    return new Account(
      'desktop',
      getDotComAPIEndpoint(),
      'token',
      [],
      '',
      1,
      'Desktop'
    )
  }

  it('does not overwrite persisted protections when refresh is inconclusive', async () => {
    const account = createAccount()
    let persisted: Array<{ name: string; protected: true }> = [
      { name: 'main', protected: true },
    ]
    let updateCalls = 0
    const { repository, store, originalFromAccount } = createStore(
      account,
      async () => null,
      protectedBranches => {
        updateCalls++
        persisted = [...protectedBranches]
      }
    )

    try {
      const refresh = Reflect.get(
        AppStore.prototype,
        'updateBranchProtectionsFromAPI'
      ) as (repository: Repository) => Promise<void>
      await refresh.call(store, repository)
    } finally {
      Reflect.set(API, 'fromAccount', originalFromAccount)
    }

    assert.deepEqual(persisted, [{ name: 'main', protected: true }])
    assert.equal(updateCalls, 0)
  })

  it('applies a later successful empty refresh after preserving stale protections', async () => {
    const account = createAccount()
    let persisted: Array<{ name: string; protected: true }> = [
      { name: 'main', protected: true },
    ]
    let updateCalls = 0
    let refreshNumber = 0
    const { repository, store, originalFromAccount } = createStore(
      account,
      async () => {
        refreshNumber++
        return refreshNumber === 1 ? null : []
      },
      protectedBranches => {
        updateCalls++
        persisted = [...protectedBranches]
      }
    )

    try {
      const refresh = Reflect.get(
        AppStore.prototype,
        'updateBranchProtectionsFromAPI'
      ) as (repository: Repository) => Promise<void>
      await refresh.call(store, repository)
      assert.deepEqual(persisted, [{ name: 'main', protected: true }])
      assert.equal(updateCalls, 0)

      await refresh.call(store, repository)
    } finally {
      Reflect.set(API, 'fromAccount', originalFromAccount)
    }

    assert.deepEqual(persisted, [])
    assert.equal(updateCalls, 1)
  })

  it('ignores an older response when refreshes complete out of order', async () => {
    const account = createAccount()
    let persisted: Array<{ name: string; protected: true }> = []
    let updateCalls = 0
    let resolveOld: ((
      value: ReadonlyArray<{ name: string; protected: true }>
    ) => void) | undefined
    let resolveNew: ((
      value: ReadonlyArray<{ name: string; protected: true }>
    ) => void) | undefined
    let refreshNumber = 0
    const { repository, store, originalFromAccount } = createStore(
      account,
      () => {
        refreshNumber++
        return new Promise(resolve => {
          if (refreshNumber === 1) {
            resolveOld = resolve
          } else {
            resolveNew = resolve
          }
        })
      },
      protectedBranches => {
        updateCalls++
        persisted = [...protectedBranches]
      }
    )

    try {
      const refresh = Reflect.get(
        AppStore.prototype,
        'updateBranchProtectionsFromAPI'
      ) as (repository: Repository) => Promise<void>
      const oldRefresh = refresh.call(store, repository)
      const newRefresh = refresh.call(store, repository)

      resolveNew?.([{ name: 'release', protected: true }])
      await newRefresh
      resolveOld?.([{ name: 'main', protected: true }])
      await oldRefresh
    } finally {
      Reflect.set(API, 'fromAccount', originalFromAccount)
    }

    assert.deepEqual(persisted, [{ name: 'release', protected: true }])
    assert.equal(updateCalls, 1)
  })

  it('recovers after a malformed response is treated as inconclusive', async () => {
    const account = createAccount()
    let persisted: Array<{ name: string; protected: true }> = [
      { name: 'main', protected: true },
    ]
    let updateCalls = 0
    let refreshNumber = 0
    const { repository, store, originalFromAccount } = createStore(
      account,
      async () => {
        refreshNumber++
        return refreshNumber === 1 ? null : [{ name: 'release', protected: true }]
      },
      protectedBranches => {
        updateCalls++
        persisted = [...protectedBranches]
      }
    )

    try {
      const refresh = Reflect.get(
        AppStore.prototype,
        'updateBranchProtectionsFromAPI'
      ) as (repository: Repository) => Promise<void>
      await refresh.call(store, repository)
      await refresh.call(store, repository)
    } finally {
      Reflect.set(API, 'fromAccount', originalFromAccount)
    }

    assert.deepEqual(persisted, [{ name: 'release', protected: true }])
    assert.equal(updateCalls, 1)
  })
})
