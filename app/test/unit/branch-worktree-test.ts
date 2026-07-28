import assert from 'node:assert'
import { describe, it } from 'node:test'

import { Branch, BranchType } from '../../src/models/branch'
import { WorktreeEntry } from '../../src/models/worktree'
import { findLinkedWorktreeForBranch } from '../../src/ui/branches/branch-worktree'

const branch = new Branch(
  'feature/assets',
  null,
  { sha: '1234567' },
  BranchType.Local,
  'refs/heads/feature/assets'
)

function worktree(path: string, ref: string | null): WorktreeEntry {
  return {
    path,
    head: '1234567',
    branch: ref,
    isDetached: ref === null,
    type: 'linked',
    isLocked: false,
    isPrunable: false,
  }
}

describe('branch worktree discovery', () => {
  it('finds a matching branch in another worktree', () => {
    const match = findLinkedWorktreeForBranch('C:\\repo', branch, [
      worktree('C:\\repo', branch.ref),
      worktree('C:\\worktrees\\assets', branch.ref),
    ])

    assert.equal(match?.path, 'C:\\worktrees\\assets')
  })

  it('does not mistake the active path or a remote ref for another worktree', () => {
    const samePath = findLinkedWorktreeForBranch('C:\\REPO\\', branch, [
      worktree('c:/repo', branch.ref),
    ])
    const remoteBranch = new Branch(
      'origin/feature/assets',
      null,
      { sha: '1234567' },
      BranchType.Remote,
      'refs/remotes/origin/feature/assets'
    )
    const remoteMatch = findLinkedWorktreeForBranch('C:\\repo', remoteBranch, [
      worktree('C:\\worktrees\\assets', remoteBranch.ref),
    ])

    assert.equal(samePath, undefined)
    assert.equal(remoteMatch, undefined)
  })
})
