import { describe, it } from 'node:test'
import assert from 'node:assert'
import { GitHubOAuthScopes } from '../../src/lib/github-oauth-scopes'

describe('GitHub OAuth feature scopes', () => {
  it('requests every implemented non-destructive GitHub capability family', () => {
    assert.deepEqual(GitHubOAuthScopes, [
      'repo',
      'user',
      'workflow',
      'notifications',
      'read:org',
    ])
    assert.equal(new Set(GitHubOAuthScopes).size, GitHubOAuthScopes.length)
  })

  it('does not silently add unrelated destructive or administrator scopes', () => {
    const denied = [
      'delete_repo',
      'admin:org',
      'admin:public_key',
      'admin:gpg_key',
      'delete:packages',
      'codespace',
      'read:audit_log',
    ]
    for (const scope of denied) {
      assert.equal(
        (GitHubOAuthScopes as ReadonlyArray<string>).includes(scope),
        false
      )
    }
  })
})
