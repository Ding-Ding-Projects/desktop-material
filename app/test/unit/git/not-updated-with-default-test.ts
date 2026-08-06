import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  getBranches,
  getBranchesNotUpdatedWithDefault,
} from '../../../src/lib/git'
import { BranchType } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'
import { setupFixtureRepository } from '../../helpers/repositories'

describe('getBranchesNotUpdatedWithDefault', () => {
  it('keeps branches whose tips do not contain the default tip', async t => {
    const testRepoPath = await setupFixtureRepository(
      t,
      'repo-with-non-updated-branches'
    )
    const repository = new Repository(testRepoPath, -1, null, false)
    const branches = await getBranches(repository)
    const defaultBranch = branches.find(
      branch => branch.type === BranchType.Local && branch.name === 'main'
    )

    assert.ok(defaultBranch)
    const notUpdated = await getBranchesNotUpdatedWithDefault(
      repository,
      defaultBranch,
      branches
    )

    assert.deepEqual([...notUpdated], ['branch-behind'])
  })

  it('fails closed when no default branch is available', async () => {
    const repository = new Repository('C:\\missing-repository', -1, null, false)
    const notUpdated = await getBranchesNotUpdatedWithDefault(
      repository,
      null,
      []
    )

    assert.deepEqual([...notUpdated], [])
  })
})
