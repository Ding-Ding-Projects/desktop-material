import assert from 'node:assert'
import { describe, it } from 'node:test'

import { supportsServerSideFork } from '../../../src/ui/forks/create-fork-dialog'
import { Account } from '../../../src/models/account'

function accountFor(
  provider: 'github' | 'gitlab' | 'bitbucket',
  endpoint: string
): Account {
  return new Account(
    'octocat',
    endpoint,
    'token',
    [],
    '',
    1,
    'Octo Cat',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    provider
  )
}

describe('fork strategy availability', () => {
  it('offers a server-side fork only for GitHub accounts', () => {
    assert.equal(
      supportsServerSideFork(accountFor('github', 'https://api.github.com')),
      true
    )
    assert.equal(
      supportsServerSideFork(
        accountFor('github', 'https://ghe.example.com/api/v3')
      ),
      true
    )
  })

  it('refuses a server-side fork for providers whose endpoint does not exist', () => {
    // GitLabAPI inherits forkRepository from the GitHub API class, so calling
    // it would POST to /repos/... on a GitLab host and always fail. Offering
    // the button there would be offering a guaranteed error.
    assert.equal(
      supportsServerSideFork(
        accountFor('gitlab', 'https://gitlab.example.com')
      ),
      false
    )
    assert.equal(
      supportsServerSideFork(
        accountFor('bitbucket', 'https://bitbucket.example.com')
      ),
      false
    )
  })
})
