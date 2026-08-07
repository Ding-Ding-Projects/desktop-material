import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'

import { Branch, BranchType } from '../../../src/models/branch'
import { IBranchListItem } from '../../../src/ui/branches'
import { createNotUpdatedWithDefaultBranchFilter } from '../../../src/ui/multi-commit-operation/choose-branch/merge-branch-filters'

function branch(name: string): Branch {
  return new Branch(
    name,
    null,
    { sha: `${name}-sha` },
    BranchType.Local,
    `refs/heads/${name}`
  )
}

function branchItem(branchValue: Branch): IBranchListItem {
  return {
    id: branchValue.name,
    text: [branchValue.name],
    branch: branchValue,
    isPinned: false,
  }
}

afterEach(() => {
  localStorage.removeItem('language-mode-v1')
})

describe('Merge branch ancestry filter', () => {
  it('matches only branches whose names were marked as not updated', () => {
    const stale = branch('stale')
    const current = branch('main')
    const filter = createNotUpdatedWithDefaultBranchFilter(
      current,
      new Set(['stale'])
    )

    assert.ok(filter)
    assert.equal(filter.label, 'Not updated with main')
    assert.equal(filter.predicate(branchItem(stale)), true)
    assert.equal(filter.predicate(branchItem(current)), false)
  })

  it('localizes the chip label in bilingual mode', () => {
    localStorage.setItem('language-mode-v1', 'bilingual')
    const filter = createNotUpdatedWithDefaultBranchFilter(
      branch('main'),
      new Set()
    )

    assert.ok(filter)
    assert.equal(filter.label, 'Not updated with main · 未追齊 main')
  })
})
