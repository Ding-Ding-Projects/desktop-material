import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Account, getAccountKey } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { Repository } from '../../src/models/repository'
import { getForkRepositoryEligibility } from '../../src/lib/fork-repository'

const endpoint = 'https://api.github.com'

function createAccount(
  login = 'contributor',
  token = 'token',
  provider: 'github' | 'gitlab' | 'bitbucket' = 'github'
) {
  return new Account(
    login,
    endpoint,
    token,
    [],
    '',
    42,
    login,
    'free',
    undefined,
    undefined,
    undefined,
    undefined,
    provider
  )
}

function createRepository({
  owner = 'upstream',
  missing = false,
  parent = null as GitHubRepository | null,
  accountKey = null as string | null,
} = {}) {
  const gitHubRepository = new GitHubRepository(
    'material',
    new Owner(owner, endpoint, 7),
    9,
    false,
    `https://github.com/${owner}/material`,
    `https://github.com/${owner}/material.git`,
    true,
    false,
    'read',
    parent
  )
  return new Repository(
    'C:\\repos\\material',
    11,
    gitHubRepository,
    missing,
    null,
    {},
    false,
    undefined,
    accountKey
  )
}

describe('fork repository eligibility', () => {
  it('binds an eligible source to the exact selected account', () => {
    const other = createAccount('other')
    const selected = new Account(
      'contributor',
      endpoint,
      'selected-token',
      [],
      '',
      99,
      'Contributor'
    )
    const repository = createRepository({ accountKey: getAccountKey(selected) })

    const result = getForkRepositoryEligibility([other, selected], repository)

    assert.equal(result.canFork, true)
    if (result.canFork) {
      assert.equal(result.repository, repository)
      assert.equal(result.account, selected)
    }
  })

  it('rejects missing and local-only repositories', () => {
    assert.deepEqual(
      getForkRepositoryEligibility(
        [createAccount()],
        createRepository({ missing: true })
      ),
      { canFork: false, reason: 'missing' }
    )
    assert.deepEqual(
      getForkRepositoryEligibility(
        [createAccount()],
        new Repository('C:\\repos\\local', 12, null, false)
      ),
      { canFork: false, reason: 'not-github' }
    )
  })

  it('rejects an existing fork and a repository already owned by the account', () => {
    const parent = createRepository().gitHubRepository
    const fork = createRepository({ owner: 'contributor', parent })

    assert.deepEqual(getForkRepositoryEligibility([createAccount()], fork), {
      canFork: false,
      reason: 'already-forked',
    })
    assert.deepEqual(
      getForkRepositoryEligibility(
        [createAccount('Contributor')],
        createRepository({ owner: 'contributor' })
      ),
      { canFork: false, reason: 'already-owned' }
    )
  })

  it('requires an authenticated GitHub account', () => {
    const repository = createRepository()

    assert.deepEqual(getForkRepositoryEligibility([], repository), {
      canFork: false,
      reason: 'no-account',
    })
    assert.deepEqual(
      getForkRepositoryEligibility(
        [createAccount('contributor', '')],
        repository
      ),
      { canFork: false, reason: 'no-account' }
    )
    assert.deepEqual(
      getForkRepositoryEligibility(
        [createAccount('contributor', 'token', 'gitlab')],
        repository
      ),
      { canFork: false, reason: 'unsupported-provider' }
    )
  })
})
