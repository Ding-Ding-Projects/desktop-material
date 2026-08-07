import assert from 'node:assert'
import { describe, it } from 'node:test'

import { getDotComAPIEndpoint } from '../../src/lib/api'
import { Account, getAccountKey } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { AppStore } from '../../src/lib/stores/app-store'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('AppStore active-account promotion', () => {
  const firstAccount = new Account(
    'first',
    getDotComAPIEndpoint(),
    'first-token',
    [],
    '',
    1,
    'First User',
    'free'
  )
  const secondAccount = new Account(
    'second',
    getDotComAPIEndpoint(),
    'second-token',
    [],
    '',
    2,
    'Second User',
    'free'
  )

  it('rebinds the selected same-host repository to the promoted account', async () => {
    const repository = new Repository(
      '/desktop',
      1,
      gitHubRepoFixture({ owner: 'desktop', name: 'desktop' }),
      false,
      null,
      {},
      false,
      undefined,
      getAccountKey(firstAccount)
    )
    const updateCalls: Array<{ repository: Repository; accountKey: string }> =
      []
    const store = Object.create(AppStore.prototype) as any
    store.accounts = [firstAccount, secondAccount]
    store.accountsStore = {
      promoteAccount: async (account: Account) => {
        store.accounts = [
          account,
          ...store.accounts.filter(
            (candidate: Account) =>
              getAccountKey(candidate) !== getAccountKey(account)
          ),
        ]
      },
    }
    store.selectedRepository = repository
    store._updateRepositoryAccount = async (
      selected: Repository,
      accountKey: string
    ) => {
      updateCalls.push({ repository: selected, accountKey })
    }

    await store._promoteAccount(secondAccount)

    assert.deepStrictEqual(updateCalls, [
      { repository, accountKey: getAccountKey(secondAccount) },
    ])
  })

  it('leaves a different-host repository binding untouched', async () => {
    const repository = new Repository(
      '/enterprise',
      2,
      gitHubRepoFixture({
        endpoint: 'https://ghe.example.com/api/v3',
        owner: 'desktop',
        name: 'desktop',
      }),
      false,
      null,
      {},
      false,
      undefined,
      getAccountKey(firstAccount)
    )
    let updateCount = 0
    const store = Object.create(AppStore.prototype) as any
    store.accounts = [firstAccount, secondAccount]
    store.accountsStore = {
      promoteAccount: async (account: Account) => {
        store.accounts = [account, firstAccount]
      },
    }
    store.selectedRepository = repository
    store._updateRepositoryAccount = async () => {
      updateCount++
    }

    await store._promoteAccount(secondAccount)

    assert.equal(updateCount, 0)
  })
})
