import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  getShallowCloneArgs,
  MaximumCloneDepth,
  normalizeCloneDepth,
} from '../../src/models/clone-options'

describe('guided shallow clone options', () => {
  it('accepts a bounded positive whole-number depth', () => {
    assert.equal(normalizeCloneDepth(' 1 '), 1)
    assert.equal(
      normalizeCloneDepth(String(MaximumCloneDepth)),
      MaximumCloneDepth
    )
  })

  it('rejects empty, signed, decimal, option-looking, and oversized depths', () => {
    for (const value of [
      '',
      '0',
      '-1',
      '+1',
      '1.5',
      '--depth=1',
      String(MaximumCloneDepth + 1),
    ]) {
      assert.throws(() => normalizeCloneDepth(value))
    }
  })

  it('builds only the fixed shallow clone arguments selected by the UI', () => {
    assert.deepEqual(
      getShallowCloneArgs({
        depth: 25,
        singleBranch: true,
        shallowSubmodules: true,
      }),
      ['--depth=25', '--single-branch', '--shallow-submodules']
    )
    assert.deepEqual(
      getShallowCloneArgs({
        singleBranch: true,
        shallowSubmodules: true,
      }),
      []
    )
  })
})

describe('post-clone runner provisioning intent', () => {
  it('is opt-in and carries no credential material', () => {
    const options = {
      postCloneRunnerProvisioning: {
        accountKey: 'https://api.github.com/#1',
        githubApiEndpoint: 'https://api.github.com/',
        owner: 'octocat',
        repository: 'private-repository',
        platform: 'linux-wsl' as const,
        wslBaseDistribution: 'Ubuntu',
      },
    }
    assert.equal(options.postCloneRunnerProvisioning.platform, 'linux-wsl')
    assert.equal('token' in options.postCloneRunnerProvisioning, false)
  })
})
