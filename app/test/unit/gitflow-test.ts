import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  getGitflowBranchName,
  getGitflowTargetBranches,
  parseGitflowBranch,
} from '../../src/lib/git/gitflow-branch'

describe('Gitflow branch naming', () => {
  it('creates the standard feature, release, and hotfix refs', () => {
    assert.equal(
      getGitflowBranchName('feature', 'checkout-redesign'),
      'feature/checkout-redesign'
    )
    assert.equal(getGitflowBranchName('release', '3.7.0'), 'release/3.7.0')
    assert.equal(
      getGitflowBranchName('hotfix', 'security-patch'),
      'hotfix/security-patch'
    )
  })

  it('round-trips valid flow refs and leaves ordinary branches alone', () => {
    assert.deepEqual(parseGitflowBranch('feature/api-v2'), {
      kind: 'feature',
      name: 'api-v2',
    })
    assert.deepEqual(parseGitflowBranch('release/3.7.0'), {
      kind: 'release',
      name: '3.7.0',
    })
    assert.equal(parseGitflowBranch('main'), null)
    assert.equal(parseGitflowBranch('feature/'), null)
  })

  it('rejects names that could escape a Git ref component', () => {
    assert.throws(() => getGitflowBranchName('feature', '../outside'))
    assert.throws(() => getGitflowBranchName('feature', 'name@{1}'))
    assert.throws(() => getGitflowBranchName('feature', ''))
  })

  it('chooses Gitflow targets by branch kind', () => {
    assert.deepEqual(
      getGitflowTargetBranches(['main', 'develop', 'master'], 'feature'),
      ['develop', 'main', 'master']
    )
    assert.deepEqual(getGitflowTargetBranches(['main', 'develop'], 'release'), [
      'main',
      'develop',
    ])
  })
})
