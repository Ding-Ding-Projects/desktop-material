import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import {
  clearBranchVisibilityState,
  DefaultBranchVisibilityState,
  loadRepositoryBranchVisibilityState,
  loadBranchVisibilityState,
  saveRepositoryBranchVisibilityState,
  saveBranchVisibilityState,
} from '../../src/lib/branch-visibility'
import { Repository, SubmoduleRepository } from '../../src/models/repository'

describe('branch visibility persistence', () => {
  beforeEach(() => localStorage.clear())

  it('starts with a stable empty view', () => {
    assert.deepEqual(loadBranchVisibilityState(7), DefaultBranchVisibilityState)
  })

  it('deduplicates names and prevents a pinned branch from remaining hidden', () => {
    const saved = saveBranchVisibilityState(7, {
      pinned: ['feature/a', 'feature/a'],
      hidden: ['feature/a', 'feature/b', 'feature/b'],
      solo: 'feature/b',
    })

    assert.deepEqual(saved, {
      pinned: ['feature/a'],
      hidden: ['feature/b'],
      solo: 'feature/b',
    })
    assert.deepEqual(loadBranchVisibilityState(7), saved)
  })

  it('fails closed on malformed persisted values and clears every override', () => {
    localStorage.setItem(
      'branch-visibility:7',
      JSON.stringify({
        pinned: ['valid', 'invalid\nbranch'],
        hidden: 'not-an-array',
        solo: 42,
      })
    )

    assert.deepEqual(loadBranchVisibilityState(7), {
      pinned: [],
      hidden: [],
      solo: null,
    })
    assert.deepEqual(clearBranchVisibilityState(7), {
      pinned: [],
      hidden: [],
      solo: null,
    })
  })

  it('rejects an invalid repository identity without writing storage', () => {
    assert.throws(() => loadBranchVisibilityState(-1))
    assert.equal(localStorage.length, 0)
  })

  it('keeps temporary submodule visibility in memory only', () => {
    const parent = new Repository('C:/work/main', 7, null, false)
    const temporary = new SubmoduleRepository(
      'C:/work/main/modules/widget',
      'C:/work/main/.git/modules/modules/widget',
      parent,
      {
        name: 'modules/widget',
        path: 'modules/widget',
        url: '../widget.git',
        branch: null,
        update: null,
        ignore: null,
        shallow: null,
        fetchRecurseSubmodules: null,
        sha: '0123456789012345678901234567890123456789',
        describe: null,
        topology: 'valid',
        status: 'up-to-date',
      }
    )

    assert.deepEqual(
      loadRepositoryBranchVisibilityState(temporary),
      DefaultBranchVisibilityState
    )
    assert.deepEqual(
      saveRepositoryBranchVisibilityState(temporary, {
        pinned: ['feature/a'],
        hidden: [],
        solo: null,
      }),
      { pinned: ['feature/a'], hidden: [], solo: null }
    )
    assert.equal(localStorage.length, 0)
  })
})
