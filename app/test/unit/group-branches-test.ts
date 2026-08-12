import { describe, it } from 'node:test'
import assert from 'node:assert'
import { groupBranches } from '../../src/ui/branches'
import { Branch, BranchType } from '../../src/models/branch'
import { CommitIdentity } from '../../src/models/commit-identity'
import { BranchSortOrder } from '../../src/models/branch-sort-order'

describe('Branches grouping', () => {
  const author = new CommitIdentity('Hubot', 'hubot@github.com', new Date())

  const branchTip = {
    sha: '300acef',
    author,
  }

  const currentBranch = new Branch(
    'master',
    null,
    branchTip,
    BranchType.Local,
    ''
  )
  const defaultBranch = new Branch(
    'master',
    null,
    branchTip,
    BranchType.Local,
    ''
  )
  const recentBranches = [
    new Branch('some-recent-branch', null, branchTip, BranchType.Local, ''),
  ]
  const otherBranch = new Branch(
    'other-branch',
    null,
    branchTip,
    BranchType.Local,
    ''
  )

  const allBranches = [currentBranch, ...recentBranches, otherBranch]

  it('should group branches', () => {
    const groups = groupBranches(
      defaultBranch,
      currentBranch,
      allBranches,
      recentBranches
    )
    assert.equal(groups.length, 3)

    assert.equal(groups[0].identifier, 'default')
    let items = groups[0].items
    assert.equal(items[0].branch, defaultBranch)

    assert.equal(groups[1].identifier, 'recent')
    items = groups[1].items
    assert.equal(items[0].branch, recentBranches[0])

    assert.equal(groups[2].identifier, 'other')
    items = groups[2].items
    assert.equal(items[0].branch, otherBranch)
  })

  it('sorts remaining branches by name or last activity', () => {
    const oldTip = {
      sha: 'old',
      author: new CommitIdentity(
        'Hubot',
        'hubot@github.com',
        new Date('2025-01-01T00:00:00Z')
      ),
    }
    const newTip = {
      sha: 'new',
      author: new CommitIdentity(
        'Hubot',
        'hubot@github.com',
        new Date('2026-01-01T00:00:00Z')
      ),
    }
    const alpha = new Branch('alpha', null, oldTip, BranchType.Local, '')
    const zulu = new Branch('zulu', null, newTip, BranchType.Local, '')

    const alphabetical = groupBranches(
      null,
      null,
      [zulu, alpha],
      [],
      BranchSortOrder.Alphabetical
    )
    assert.deepEqual(
      alphabetical[0].items.map(item => item.branch.name),
      ['alpha', 'zulu']
    )

    const recentFirst = groupBranches(
      null,
      null,
      [alpha, zulu],
      [],
      BranchSortOrder.LastModified
    )
    assert.deepEqual(
      recentFirst[0].items.map(item => item.branch.name),
      ['zulu', 'alpha']
    )
  })

  it('groups pinned branches first and hides only nonessential branches', () => {
    const groups = groupBranches(
      defaultBranch,
      currentBranch,
      allBranches,
      recentBranches,
      BranchSortOrder.Alphabetical,
      {
        pinned: ['other-branch'],
        hidden: ['some-recent-branch', 'master'],
        solo: null,
      }
    )

    // `other` is absent rather than present-and-empty, which is what this
    // asserted before. Every other group here is pushed only when it has
    // members; `other` alone was pushed unconditionally, so a repository with
    // nothing left over rendered an "Other branches" heading with no rows
    // beneath it. That reads as a list that failed to load rather than as a
    // list with nothing in it — it was reported, from a screenshot, as "the
    // branch list is empty", and this assertion was holding it in place.
    //
    // With the group omitted the filter list reaches its own empty state,
    // which says so in words instead of promising rows it does not have.
    assert.deepEqual(
      groups.map(group => group.identifier),
      ['default', 'pinned']
    )
    assert.equal(groups[0].items[0].branch.name, 'master')
    assert.equal(groups[1].items[0].branch.name, 'other-branch')
    assert.equal(groups[1].items[0].isPinned, true)
  })

  it('keeps the default and current branches available in solo view', () => {
    const feature = new Branch('feature', null, branchTip, BranchType.Local, '')
    const groups = groupBranches(
      defaultBranch,
      feature,
      [...allBranches, feature],
      recentBranches,
      BranchSortOrder.Alphabetical,
      { pinned: [], hidden: [], solo: 'other-branch' }
    )

    assert.deepEqual(
      groups.flatMap(group => group.items.map(item => item.branch.name)),
      ['master', 'feature', 'other-branch']
    )
  })
})

describe('an empty group is never rendered as a heading with no rows', () => {
  const tip = {
    sha: 'deadbeef',
    author: new CommitIdentity('n', 'n@example.com', new Date(0)),
  }
  const only = new Branch('main', null, tip, BranchType.Local, '')

  it('omits `other` when the default branch is the only branch', () => {
    // The commonest repository in the world at the moment somebody first opens
    // this sheet: a fresh clone, or one they just created.
    const groups = groupBranches(only, only, [only], [])
    assert.deepEqual(
      groups.map(group => group.identifier),
      ['default']
    )
  })

  it('still produces `other` when something is actually left over', () => {
    // The other half. A guard that removed the group unconditionally would
    // pass the test above and lose every branch that is not recent or pinned.
    const spare = new Branch('spare', null, tip, BranchType.Local, '')
    const groups = groupBranches(only, only, [only, spare], [])
    assert.ok(groups.some(group => group.identifier === 'other'))
    const other = groups.find(group => group.identifier === 'other')
    assert.equal(other?.items.length, 1)
    assert.equal(other?.items[0].branch.name, 'spare')
  })
})
