import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { IMatches } from '../../../src/lib/fuzzy-find'
import { WorktreeEntry } from '../../../src/models/worktree'
import { WorktreeListItem } from '../../../src/ui/worktrees/worktree-list-item'
import { getMergeBranchForWorktree } from '../../../src/ui/worktrees/worktree-list'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const noMatches: IMatches = { title: [], subtitle: [] }

function linkedWorktree(
  options: Partial<WorktreeEntry> = {}
): WorktreeEntry {
  return {
    path: 'C:/worktrees/feature',
    head: '1234567890abcdef',
    branch: 'refs/heads/feature',
    isDetached: false,
    type: 'linked',
    isLocked: false,
    isPrunable: false,
    dirtyFileCount: 0,
    ...options,
  }
}

describe('WorktreeListItem', () => {
  it('merges an eligible linked worktree without selecting it', () => {
    const branch = new Branch(
      'feature',
      null,
      { sha: '1234567890abcdef' },
      BranchType.Local,
      'refs/heads/feature'
    )
    const merged = new Array<Branch>()
    let selected = 0
    render(
      <div onClick={() => selected++}>
        <WorktreeListItem
          worktree={linkedWorktree()}
          isCurrentWorktree={false}
          matches={noMatches}
          mergeBranch={branch}
          onMergeWorktree={mergeBranch => merged.push(mergeBranch)}
        />
      </div>
    )

    const button = screen.getByRole('button', { name: 'Merge worktree' })
    assert.match(
      button.getAttribute('aria-describedby') ?? '',
      /.+/,
      'the merge action should expose its descriptive tooltip to assistive technology'
    )
    fireEvent.click(button)

    assert.deepEqual(merged, [branch])
    assert.equal(selected, 0)
  })

  it('does not render a merge action without an eligible branch', () => {
    render(
      <WorktreeListItem
        worktree={linkedWorktree({ isLocked: true })}
        isCurrentWorktree={false}
        matches={noMatches}
      />
    )

    assert.equal(screen.queryByRole('button', { name: 'Merge worktree' }), null)
  })

  it('only resolves merge branches for eligible linked worktrees', () => {
    const ineligible = [
      linkedWorktree({ type: 'main' }),
      linkedWorktree({ branch: null, isDetached: true }),
      linkedWorktree({ isLocked: true }),
      linkedWorktree({ isPrunable: true }),
      linkedWorktree({ dirtyFileCount: null }),
      linkedWorktree({ branch: 'refs/remotes/origin/feature' }),
    ]

    assert.equal(getMergeBranchForWorktree(linkedWorktree(), true), undefined)
    for (const worktree of ineligible) {
      assert.equal(getMergeBranchForWorktree(worktree, false), undefined)
    }

    const branch = getMergeBranchForWorktree(linkedWorktree(), false)
    assert.equal(branch?.type, BranchType.Local)
    assert.equal(branch?.name, 'feature')
    assert.equal(branch?.ref, 'refs/heads/feature')
    assert.equal(branch?.tip.sha, '1234567890abcdef')
  })
})
