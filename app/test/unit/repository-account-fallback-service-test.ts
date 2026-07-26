import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import { Account, getAccountKey } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import {
  getRepositoryAccountFallbackAttempts,
  IRepositoryAccountTarget,
} from '../../src/lib/repository-account-fallback'
import {
  runSurfaceWithRepositoryAccountFallback,
  runWithRepositoryAccountFallback,
} from '../../src/lib/repository-account-fallback-service'
import {
  approveRepositoryAccountFallback,
  clearAllRepositoryAccountFallbackOffers,
  clearRepositoryAccountFallbackOffersForAccount,
  getApprovedRepositoryAccountKey,
  getRepositoryAccountFallbackOffer,
  getRepositoryAccountFallbackOfferCount,
  onRepositoryAccountFallbackOffersChanged,
} from '../../src/lib/repository-account-fallback-ask'
import {
  getRepositoryAccountAskNotice,
  getRepositoryAccountExhaustedNotice,
  getRepositoryAccountSwitchedNotice,
  getRepositoryAccountUsedLabel,
} from '../../src/lib/repository-account-fallback-copy'

const account = (
  id: number,
  endpoint = getDotComAPIEndpoint(),
  token = `token-${id}`
) => new Account(`user-${id}`, endpoint, token, [], '', id, '', 'free')

const target: IRepositoryAccountTarget = {
  endpoint: getDotComAPIEndpoint(),
  owner: 'owner',
  name: 'repository',
}

class NotFoundError extends Error {}

const notFound = () => new NotFoundError('not found')
const isNotFound = (error: unknown) => error instanceof NotFoundError

describe('runWithRepositoryAccountFallback', () => {
  beforeEach(() => clearAllRepositoryAccountFallbackOffers())

  it('keeps a successful first attempt unforced and never probes', async () => {
    let probes = 0
    const first = account(1)

    const run = await runWithRepositoryAccountFallback({
      target,
      accounts: [first, account(2)],
      initialAccount: first,
      isNotFound,
      autoSwitchEnabled: true,
      probe: async () => {
        probes += 1
        return true
      },
      work: async () => 'ok',
    })

    assert.equal(run.kind, 'succeeded')
    assert.equal(run.kind === 'succeeded' ? run.usedFallback : true, false)
    assert.equal(probes, 0)
  })

  it('retries under the identity that can see the repository', async () => {
    const first = account(1)
    const second = account(2)
    const used: Array<string> = []

    const run = await runWithRepositoryAccountFallback({
      target,
      accounts: [first, second],
      initialAccount: first,
      isNotFound,
      autoSwitchEnabled: true,
      probe: async a => a.login === 'user-2',
      work: async a => {
        used.push(a.login)
        if (a.login !== 'user-2') {
          throw notFound()
        }
        return 'ok'
      },
    })

    assert.equal(run.kind, 'succeeded')
    assert.deepStrictEqual(used, ['user-1', 'user-2'])
    assert.equal(run.kind === 'succeeded' ? run.usedFallback : false, true)
  })

  it('does not retry a failure which is not a not-found result', async () => {
    let probes = 0
    const boom = new Error('server exploded')

    await assert.rejects(
      runWithRepositoryAccountFallback({
        target,
        accounts: [account(1), account(2)],
        initialAccount: account(1),
        isNotFound,
        autoSwitchEnabled: true,
        probe: async () => {
          probes += 1
          return true
        },
        work: async () => {
          throw boom
        },
      }),
      /server exploded/
    )

    assert.equal(probes, 0)
  })

  it('never probes an identity on another host', async () => {
    const probed: Array<string> = []
    const first = account(1, 'https://ghe.example.com/api/v3')

    await assert.rejects(
      runWithRepositoryAccountFallback({
        target: { ...target, endpoint: 'https://ghe.example.com/api/v3' },
        accounts: [first, account(2), account(3)],
        initialAccount: first,
        isNotFound,
        autoSwitchEnabled: true,
        probe: async a => {
          probed.push(a.login)
          return true
        },
        work: async () => {
          throw notFound()
        },
      })
    )

    assert.deepStrictEqual(probed, [])
  })

  it('rethrows the original error with every identity tried attached', async () => {
    const error = notFound()
    const first = account(1)

    await assert.rejects(
      runWithRepositoryAccountFallback({
        target,
        accounts: [first, account(2), account(3)],
        initialAccount: first,
        isNotFound,
        autoSwitchEnabled: true,
        probe: async () => false,
        work: async () => {
          throw error
        },
      }),
      (thrown: unknown) => {
        assert.equal(thrown, error)
        assert.deepStrictEqual(
          getRepositoryAccountFallbackAttempts(thrown)?.map(a => a.login),
          ['user-1', 'user-2', 'user-3']
        )
        return true
      }
    )
  })

  it('asks instead of switching when auto-switching is off', async () => {
    const first = account(1)
    const second = account(2)
    const used: Array<string> = []

    const run = await runWithRepositoryAccountFallback({
      target,
      accounts: [first, second],
      initialAccount: first,
      isNotFound,
      autoSwitchEnabled: false,
      probe: async a => a.login === 'user-2',
      work: async a => {
        used.push(a.login)
        throw notFound()
      },
    })

    assert.equal(run.kind, 'needs-confirmation')
    assert.equal(
      run.kind === 'needs-confirmation' ? run.account.login : null,
      'user-2'
    )
    // The point of asking is that nothing was done under the other identity.
    assert.deepStrictEqual(used, ['user-1'])
  })
})

describe('runSurfaceWithRepositoryAccountFallback', () => {
  beforeEach(() => clearAllRepositoryAccountFallbackOffers())

  it('records a one-click offer and rethrows when auto-switching is off', async () => {
    const first = account(1)
    const second = account(2)
    const error = notFound()
    let changes = 0
    const subscription = onRepositoryAccountFallbackOffersChanged(() => {
      changes += 1
    })

    try {
      await assert.rejects(
        runSurfaceWithRepositoryAccountFallback({
          target,
          accounts: [first, second],
          initialAccount: first,
          isNotFound,
          autoSwitchEnabled: false,
          probe: async a => a.login === 'user-2',
          work: async () => {
            throw error
          },
        }),
        (thrown: unknown) => thrown === error
      )
    } finally {
      subscription.dispose()
    }

    const offer = getRepositoryAccountFallbackOffer(target)
    assert.equal(offer?.account.login, 'user-2')
    assert.equal(changes, 1)
  })

  it('honours an approval for that repository while auto-switching stays off', async () => {
    const first = account(1)
    const second = account(2)

    approveRepositoryAccountFallback(target, getAccountKey(second))
    assert.equal(getApprovedRepositoryAccountKey(target), getAccountKey(second))

    const run = await runSurfaceWithRepositoryAccountFallback({
      target,
      accounts: [first, second],
      initialAccount: first,
      isNotFound,
      autoSwitchEnabled: false,
      probe: async a => a.login === 'user-2',
      work: async a => {
        if (a.login !== 'user-2') {
          throw notFound()
        }
        return 'ok'
      },
    })

    assert.equal(run.result, 'ok')
    assert.equal(run.account.login, 'user-2')
    assert.equal(run.usedFallback, true)
  })

  it('does not extend an approval to another repository', async () => {
    const first = account(1)
    const second = account(2)
    approveRepositoryAccountFallback(target, getAccountKey(second))

    const other = { ...target, name: 'another' }
    const run = await runSurfaceWithRepositoryAccountFallback({
      target: other,
      accounts: [first, second],
      initialAccount: first,
      isNotFound,
      autoSwitchEnabled: false,
      probe: async () => true,
      work: async a => {
        if (a.login !== 'user-2') {
          throw notFound()
        }
        return 'ok'
      },
    }).catch(() => null)

    assert.equal(run, null)
    assert.equal(
      getRepositoryAccountFallbackOffer(other)?.account.login,
      'user-2'
    )
  })

  it('withdraws the offer once the operation succeeds again', async () => {
    const first = account(1)
    const second = account(2)

    await runSurfaceWithRepositoryAccountFallback({
      target,
      accounts: [first, second],
      initialAccount: first,
      isNotFound,
      autoSwitchEnabled: false,
      probe: async a => a.login === 'user-2',
      work: async () => {
        throw notFound()
      },
    }).catch(() => undefined)
    assert.equal(getRepositoryAccountFallbackOfferCount(), 1)

    await runSurfaceWithRepositoryAccountFallback({
      target,
      accounts: [first, second],
      initialAccount: first,
      isNotFound,
      autoSwitchEnabled: false,
      probe: async () => false,
      work: async () => 'ok',
    })

    assert.equal(getRepositoryAccountFallbackOfferCount(), 0)
  })

  it('withdraws offers and approvals for an identity which signs out', async () => {
    const first = account(1)
    const second = account(2)

    await runSurfaceWithRepositoryAccountFallback({
      target,
      accounts: [first, second],
      initialAccount: first,
      isNotFound,
      autoSwitchEnabled: false,
      probe: async a => a.login === 'user-2',
      work: async () => {
        throw notFound()
      },
    }).catch(() => undefined)
    approveRepositoryAccountFallback(target, getAccountKey(second))

    clearRepositoryAccountFallbackOffersForAccount(getAccountKey(second))

    assert.equal(getRepositoryAccountFallbackOffer(target), undefined)
    assert.equal(getApprovedRepositoryAccountKey(target), undefined)
  })
})

describe('repository account fallback copy', () => {
  const first = account(1)
  const second = account(2, 'https://ghe.example.com/api/v3')

  it('names the account an operation used, in both languages', () => {
    assert.equal(
      getRepositoryAccountUsedLabel(first, 'english'),
      'Using user-1 (GitHub.com)'
    )
    assert.equal(
      getRepositoryAccountUsedLabel(first, 'cantonese'),
      '用緊 user-1 (GitHub.com)'
    )
  })

  it('offers a one-click action naming the account', () => {
    const notice = getRepositoryAccountAskNotice(target, second, 'english')
    assert.equal(notice.actionLabel, 'Use user-2 (ghe.example.com)')
    assert.match(notice.body, /owner\/repository/)
    assert.match(notice.body, /user-2/)

    const cantonese = getRepositoryAccountAskNotice(target, second, 'cantonese')
    assert.equal(cantonese.actionLabel, '用 user-2 (ghe.example.com)')
    assert.notEqual(cantonese.title, notice.title)
  })

  it('reports a silent switch without an action', () => {
    const notice = getRepositoryAccountSwitchedNotice(target, second, 'english')
    assert.equal(notice.actionLabel, undefined)
    assert.match(notice.body, /user-2/)
  })

  it('lists the identities tried only when some were', () => {
    const listed = getRepositoryAccountExhaustedNotice(
      target,
      [first, second],
      'english'
    )
    assert.match(listed.body, /Accounts tried: user-1 \(GitHub\.com\), user-2/)

    const none = getRepositoryAccountExhaustedNotice(target, [], 'english')
    assert.doesNotMatch(none.body, /Accounts tried/)
    assert.match(none.body, /no other account is signed in/)
  })

  it('never puts a token in user-facing copy', () => {
    const withToken = new Account(
      'user-9',
      getDotComAPIEndpoint(),
      'ghp_secret_value',
      [],
      '',
      9,
      '',
      'free'
    )

    for (const mode of ['english', 'cantonese', 'bilingual'] as const) {
      const text = [
        getRepositoryAccountUsedLabel(withToken, mode),
        getRepositoryAccountAskNotice(target, withToken, mode).body,
        getRepositoryAccountExhaustedNotice(target, [withToken], mode).body,
      ].join(' ')
      assert.doesNotMatch(text, /ghp_secret_value/)
    }
  })
})
