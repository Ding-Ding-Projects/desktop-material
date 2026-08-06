import assert from 'node:assert'
import { describe, it } from 'node:test'

import { Branch, BranchType } from '../../../src/models/branch'
import { generateBranchContextMenuItems } from '../../../src/ui/branches/branch-list-item-context-menu'

function branch(name = 'feature/one'): Branch {
  return new Branch(
    name,
    null,
    { sha: 'a'.repeat(40) },
    BranchType.Local,
    `refs/heads/${name}`
  )
}

describe('branch context menu actions', () => {
  it('offers merge, merge-and-delete, and standalone delete actions', () => {
    const calls: string[] = []
    const items = generateBranchContextMenuItems({
      branch: branch(),
      onMergeBranch: selected => calls.push(`merge:${selected.name}`),
      onMergeAndDeleteBranch: selected =>
        calls.push(`merge-and-delete:${selected.name}`),
      onDeleteBranch: name => calls.push(`delete:${name}`),
    })

    assert.deepEqual(
      items
        .filter(item => item.label !== undefined)
        .map(item => item.label)
        .filter(
          label =>
            label === 'Merge…' ||
            label === 'Merge and delete…' ||
            label === 'Delete…'
        ),
      ['Merge…', 'Merge and delete…', 'Delete…']
    )

    for (const label of ['Merge…', 'Merge and delete…', 'Delete…']) {
      items.find(item => item.label === label)?.action?.()
    }

    assert.deepEqual(calls, [
      'merge:feature/one',
      'merge-and-delete:feature/one',
      'delete:feature/one',
    ])
  })
})
