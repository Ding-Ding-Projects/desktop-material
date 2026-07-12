import assert from 'node:assert'
import { describe, it } from 'node:test'
import '../helpers/ui/setup'
import { Account } from '../../src/models/account'
import { CloneRepositoryTab } from '../../src/models/clone-repository-tab'
import { accountMatchesCloneTab } from '../../src/ui/clone-repository/clone-repository'

const account = (
  provider: 'github' | 'gitlab' | 'bitbucket',
  endpoint: string
) =>
  new Account(
    provider,
    endpoint,
    'token',
    [],
    '',
    provider === 'github' ? 1 : provider === 'gitlab' ? 2 : 3,
    provider,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    provider
  )

describe('clone provider account tabs', () => {
  it('keeps GitLab and Bitbucket accounts on the provider tab', () => {
    const gitLab = account('gitlab', 'https://gitlab.example.com/api/v4')
    const bitbucket = account('bitbucket', 'https://api.bitbucket.org/2.0')

    assert.equal(
      accountMatchesCloneTab(CloneRepositoryTab.Providers, gitLab),
      true
    )
    assert.equal(
      accountMatchesCloneTab(CloneRepositoryTab.Providers, bitbucket),
      true
    )
    assert.equal(
      accountMatchesCloneTab(CloneRepositoryTab.Enterprise, gitLab),
      false
    )
  })

  it('preserves the existing GitHub.com and Enterprise partition', () => {
    const dotCom = account('github', 'https://api.github.com')
    const enterprise = account('github', 'https://ghe.example.com/api/v3')

    assert.equal(
      accountMatchesCloneTab(CloneRepositoryTab.DotCom, dotCom),
      true
    )
    assert.equal(
      accountMatchesCloneTab(CloneRepositoryTab.Enterprise, enterprise),
      true
    )
    assert.equal(
      accountMatchesCloneTab(CloneRepositoryTab.Providers, enterprise),
      false
    )
  })
})
