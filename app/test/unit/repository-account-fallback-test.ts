import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account, getAccountKey } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import {
  accountMatchesRemoteOrigin,
  describeProbedAccounts,
  describeRepositoryAccountTarget,
  getRepositoryAccountAdoption,
  getRepositoryAccountProbeOrder,
  getRepositoryAccountTargetFromURL,
  getRepositoryAccountTargetKey,
  IRepositoryAccountTarget,
  MaxRepositoryAccountProbes,
  normalizeAccountEndpoint,
  repositoryAccountTargetEquals,
  RepositoryAccountAssociationCache,
  resolveRepositoryAccountFallback,
} from '../../src/lib/repository-account-fallback'

const account = (
  id: number,
  endpoint = getDotComAPIEndpoint(),
  token = `token-${id}`
) => new Account(`user-${id}`, endpoint, token, [], '', id, '', 'free')

const EnterpriseEndpoint = 'https://ghe.example.com/api/v3'
const OtherEnterpriseEndpoint = 'https://ghe.other.com/api/v3'

const dotComTarget: IRepositoryAccountTarget = {
  endpoint: getDotComAPIEndpoint(),
  owner: 'owner',
  name: 'repository',
}

const enterpriseTarget: IRepositoryAccountTarget = {
  endpoint: EnterpriseEndpoint,
  owner: 'owner',
  name: 'repository',
}

const logins = (accounts: ReadonlyArray<Account>) => accounts.map(a => a.login)

describe('repository account fallback target', () => {
  it('normalizes endpoints case-insensitively and without trailing slashes', () => {
    assert.equal(
      normalizeAccountEndpoint('https://API.GitHub.com//'),
      'https://api.github.com'
    )
  })

  it('keys the same repository identically regardless of case', () => {
    assert.equal(
      getRepositoryAccountTargetKey({
        endpoint: getDotComAPIEndpoint(),
        owner: 'Owner',
        name: 'Repository',
      }),
      getRepositoryAccountTargetKey(dotComTarget)
    )
    assert.ok(
      repositoryAccountTargetEquals(dotComTarget, {
        endpoint: `${getDotComAPIEndpoint()}/`,
        owner: 'OWNER',
        name: 'REPOSITORY',
      })
    )
  })

  it('keeps the same owner/name on different hosts apart', () => {
    assert.notEqual(
      getRepositoryAccountTargetKey(dotComTarget),
      getRepositoryAccountTargetKey(enterpriseTarget)
    )
  })

  it('derives a target from HTTPS and SSH remotes alike', () => {
    assert.deepStrictEqual(
      getRepositoryAccountTargetFromURL(
        'https://github.com/owner/repository.git'
      ),
      {
        endpoint: getDotComAPIEndpoint(),
        owner: 'owner',
        name: 'repository',
      }
    )

    assert.deepStrictEqual(
      getRepositoryAccountTargetFromURL('git@ghe.example.com:owner/repository'),
      {
        endpoint: 'https://ghe.example.com/api',
        owner: 'owner',
        name: 'repository',
      }
    )
  })

  it('returns null for a URL with no repository coordinate', () => {
    assert.equal(getRepositoryAccountTargetFromURL('https://github.com/'), null)
    assert.equal(getRepositoryAccountTargetFromURL('not a url'), null)
  })

  it('describes a target and probed identities without leaking tokens', () => {
    assert.equal(
      describeRepositoryAccountTarget(dotComTarget),
      'owner/repository'
    )

    const described = describeProbedAccounts([
      account(1),
      account(2, EnterpriseEndpoint),
    ])
    assert.equal(described, 'user-1 (GitHub.com), user-2 (ghe.example.com)')
    assert.doesNotMatch(described, /token-/)
  })
})

describe('repository account probe order', () => {
  it('offers every token-bearing identity on the target endpoint in store order', () => {
    const first = account(1)
    const second = account(2)
    const third = account(3)

    assert.deepStrictEqual(
      logins(
        getRepositoryAccountProbeOrder(dotComTarget, [first, second, third])
      ),
      ['user-1', 'user-2', 'user-3']
    )
  })

  it('never offers an identity from another host', () => {
    const dotCom = account(1)
    const enterprise = account(2, EnterpriseEndpoint)
    const otherEnterprise = account(3, OtherEnterpriseEndpoint)

    assert.deepStrictEqual(
      logins(
        getRepositoryAccountProbeOrder(enterpriseTarget, [
          dotCom,
          enterprise,
          otherEnterprise,
        ])
      ),
      ['user-2']
    )

    assert.deepStrictEqual(
      logins(
        getRepositoryAccountProbeOrder(dotComTarget, [
          enterprise,
          otherEnterprise,
        ])
      ),
      []
    )
  })

  it('ignores tokenless and duplicate identities', () => {
    const signedIn = account(1)
    const tokenless = account(2, getDotComAPIEndpoint(), '')

    assert.deepStrictEqual(
      logins(
        getRepositoryAccountProbeOrder(dotComTarget, [
          signedIn,
          tokenless,
          signedIn,
        ])
      ),
      ['user-1']
    )
  })

  it('does not repeat an identity the failing operation already used', () => {
    const attempted = account(1)
    const other = account(2)

    assert.deepStrictEqual(
      logins(
        getRepositoryAccountProbeOrder(dotComTarget, [attempted, other], {
          attemptedAccountKeys: [getAccountKey(attempted)],
        })
      ),
      ['user-2']
    )
  })

  it('tries a cached association first without dropping the others', () => {
    const first = account(1)
    const second = account(2)
    const third = account(3)

    assert.deepStrictEqual(
      logins(
        getRepositoryAccountProbeOrder(dotComTarget, [first, second, third], {
          preferredAccountKey: getAccountKey(third),
        })
      ),
      ['user-3', 'user-1', 'user-2']
    )
  })

  it('ignores a preferred identity which is not eligible', () => {
    const signedIn = account(1)
    const enterprise = account(2, EnterpriseEndpoint)

    assert.deepStrictEqual(
      logins(
        getRepositoryAccountProbeOrder(dotComTarget, [signedIn], {
          preferredAccountKey: getAccountKey(enterprise),
        })
      ),
      ['user-1']
    )
  })

  it('bounds the number of identities probed', () => {
    const accounts = Array.from(
      { length: MaxRepositoryAccountProbes + 5 },
      (_, i) => account(i + 1)
    )

    assert.equal(
      getRepositoryAccountProbeOrder(dotComTarget, accounts).length,
      MaxRepositoryAccountProbes
    )
    assert.equal(
      getRepositoryAccountProbeOrder(dotComTarget, accounts, { limit: 2 })
        .length,
      2
    )
    assert.deepStrictEqual(
      getRepositoryAccountProbeOrder(dotComTarget, accounts, { limit: 0 }),
      []
    )
  })

  it('offers nothing for an empty endpoint', () => {
    assert.deepStrictEqual(
      getRepositoryAccountProbeOrder(
        { endpoint: '  ', owner: 'owner', name: 'repository' },
        [account(1)]
      ),
      []
    )
  })
})

describe('resolveRepositoryAccountFallback', () => {
  it('returns the first identity that can see the repository and stops probing', async () => {
    const probed: Array<string> = []
    const outcome = await resolveRepositoryAccountFallback(
      dotComTarget,
      [account(1), account(2), account(3)],
      async a => {
        probed.push(a.login)
        return a.login === 'user-2'
      }
    )

    assert.equal(outcome.kind, 'resolved')
    assert.equal(
      outcome.kind === 'resolved' ? outcome.account.login : null,
      'user-2'
    )
    assert.deepStrictEqual(probed, ['user-1', 'user-2'])
    assert.deepStrictEqual(logins(outcome.triedAccounts), ['user-1', 'user-2'])
  })

  it('probes strictly one identity at a time', async () => {
    let inFlight = 0
    let maxInFlight = 0

    await resolveRepositoryAccountFallback(
      dotComTarget,
      [account(1), account(2), account(3)],
      async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return false
      }
    )

    assert.equal(maxInFlight, 1)
  })

  it('reports every identity tried when all of them fail', async () => {
    const outcome = await resolveRepositoryAccountFallback(
      dotComTarget,
      [account(1), account(2)],
      async () => false
    )

    assert.equal(outcome.kind, 'exhausted')
    assert.deepStrictEqual(logins(outcome.triedAccounts), ['user-1', 'user-2'])
  })

  it('reports exhaustion without probing when no identity is eligible', async () => {
    let probes = 0
    const outcome = await resolveRepositoryAccountFallback(
      dotComTarget,
      [account(1, EnterpriseEndpoint)],
      async () => {
        probes += 1
        return true
      }
    )

    assert.equal(outcome.kind, 'exhausted')
    assert.equal(probes, 0)
    assert.deepStrictEqual(outcome.triedAccounts, [])
  })

  it('never probes an identity outside the target host', async () => {
    const probedEndpoints: Array<string> = []
    await resolveRepositoryAccountFallback(
      enterpriseTarget,
      [
        account(1),
        account(2, OtherEnterpriseEndpoint),
        account(3, EnterpriseEndpoint),
      ],
      async a => {
        probedEndpoints.push(a.endpoint)
        return false
      }
    )

    assert.deepStrictEqual(probedEndpoints, [EnterpriseEndpoint])
  })

  it('treats a throwing probe as "cannot see it" and keeps searching', async () => {
    const outcome = await resolveRepositoryAccountFallback(
      dotComTarget,
      [account(1), account(2)],
      async a => {
        if (a.login === 'user-1') {
          throw new Error('host unreachable')
        }
        return true
      }
    )

    assert.equal(outcome.kind, 'resolved')
    assert.equal(
      outcome.kind === 'resolved' ? outcome.account.login : null,
      'user-2'
    )
  })

  it('propagates cancellation instead of trying the next identity', async () => {
    const controller = new AbortController()
    const probed: Array<string> = []

    await assert.rejects(
      resolveRepositoryAccountFallback(
        dotComTarget,
        [account(1), account(2)],
        async a => {
          probed.push(a.login)
          controller.abort()
          return false
        },
        { signal: controller.signal }
      ),
      /cancelled/i
    )

    assert.deepStrictEqual(probed, ['user-1'])
  })

  it('does not probe at all when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      resolveRepositoryAccountFallback(
        dotComTarget,
        [account(1)],
        async () => true,
        { signal: controller.signal }
      ),
      /cancelled/i
    )
  })
})

describe('repository account adoption', () => {
  it('adopts the resolved identity when auto-switching is on', () => {
    const resolved = account(2)
    assert.deepStrictEqual(
      getRepositoryAccountAdoption(
        { kind: 'resolved', account: resolved, triedAccounts: [resolved] },
        true
      ),
      { kind: 'adopt', account: resolved }
    )
  })

  it('asks first when auto-switching is off', () => {
    const resolved = account(2)
    assert.deepStrictEqual(
      getRepositoryAccountAdoption(
        { kind: 'resolved', account: resolved, triedAccounts: [resolved] },
        false
      ),
      { kind: 'ask', account: resolved }
    )
  })

  it('does nothing when no identity could see the repository', () => {
    for (const autoSwitch of [true, false]) {
      assert.deepStrictEqual(
        getRepositoryAccountAdoption(
          { kind: 'exhausted', triedAccounts: [account(1)] },
          autoSwitch
        ),
        { kind: 'none' }
      )
    }
  })
})

describe('RepositoryAccountAssociationCache', () => {
  it('remembers an association case-insensitively', () => {
    const cache = new RepositoryAccountAssociationCache()
    const key = getAccountKey(account(7))

    cache.set(dotComTarget, key)

    assert.equal(
      cache.get({
        endpoint: `${getDotComAPIEndpoint()}/`,
        owner: 'OWNER',
        name: 'Repository',
      }),
      key
    )
  })

  it('keeps the same repository on different hosts separate', () => {
    const cache = new RepositoryAccountAssociationCache()
    cache.set(dotComTarget, 'dotcom')
    cache.set(enterpriseTarget, 'enterprise')

    assert.equal(cache.get(dotComTarget), 'dotcom')
    assert.equal(cache.get(enterpriseTarget), 'enterprise')
  })

  it('forgets a single repository and every repository of a signed-out identity', () => {
    const cache = new RepositoryAccountAssociationCache()
    const other: IRepositoryAccountTarget = { ...dotComTarget, name: 'another' }

    cache.set(dotComTarget, 'a')
    cache.set(other, 'a')
    cache.set(enterpriseTarget, 'b')

    cache.forget(dotComTarget)
    assert.equal(cache.get(dotComTarget), undefined)
    assert.equal(cache.get(other), 'a')

    cache.forgetAccount('a')
    assert.equal(cache.get(other), undefined)
    assert.equal(cache.get(enterpriseTarget), 'b')

    cache.clear()
    assert.equal(cache.size, 0)
  })

  it('evicts the least recently confirmed association beyond its capacity', () => {
    const cache = new RepositoryAccountAssociationCache(2)
    const a: IRepositoryAccountTarget = { ...dotComTarget, name: 'a' }
    const b: IRepositoryAccountTarget = { ...dotComTarget, name: 'b' }
    const c: IRepositoryAccountTarget = { ...dotComTarget, name: 'c' }

    cache.set(a, '1')
    cache.set(b, '2')
    // Re-confirming `a` must move it ahead of `b` in the eviction order.
    cache.set(a, '1')
    cache.set(c, '3')

    assert.equal(cache.size, 2)
    assert.equal(cache.get(b), undefined)
    assert.equal(cache.get(a), '1')
    assert.equal(cache.get(c), '3')
  })
})

describe('accountMatchesRemoteOrigin', () => {
  it('accepts only the exact origin', () => {
    assert.ok(
      accountMatchesRemoteOrigin(
        account(1),
        'https://github.com/owner/repository.git'
      )
    )
    assert.equal(
      accountMatchesRemoteOrigin(
        account(1),
        'https://ghe.example.com/owner/repository.git'
      ),
      false
    )
    assert.equal(
      accountMatchesRemoteOrigin(account(1), 'git@github.com:owner/repo.git'),
      false
    )
  })
})
