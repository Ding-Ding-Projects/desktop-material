import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Branch, BranchType } from '../../src/models/branch'
import { Repository } from '../../src/models/repository'
import { findDefaultBranch } from '../../src/lib/find-default-branch'

describe('findDefaultBranch', () => {
  it('prefers a repository-specific default branch override', async () => {
    const repository = new Repository(
      '/repo',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      null,
      undefined,
      null,
      'develop'
    )
    const main = new Branch(
      'main',
      'origin/main',
      { sha: 'main' },
      BranchType.Local,
      'refs/heads/main'
    )
    const develop = new Branch(
      'develop',
      'origin/develop',
      { sha: 'develop' },
      BranchType.Local,
      'refs/heads/develop'
    )

    const result = await findDefaultBranch(
      repository,
      [main, develop],
      'origin'
    )

    assert.equal(result, develop)
  })
})
