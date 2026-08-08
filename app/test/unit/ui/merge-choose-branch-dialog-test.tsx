import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { ComputedAction } from '../../../src/models/computed-action'
import { MultiCommitOperationKind } from '../../../src/models/multi-commit-operation'
import { PopupType } from '../../../src/models/popup'
import { Repository } from '../../../src/models/repository'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

let commitsBehind: number | null = 0

mock.module('../../../src/lib/git', {
  namedExports: {
    getAheadBehind: async () =>
      commitsBehind === null ? null : { ahead: 0, behind: commitsBehind },

    revSymmetricDifference: () => 'current...selected',
  },
})

mock.module('../../../src/lib/git/merge-tree', {
  namedExports: {
    determineMergeability: async () => ({ kind: ComputedAction.Clean }),
  },
})

mock.module('../../../src/ui/branches', {
  namedExports: {
    BranchList: () => <div aria-label="Mock branch list" role="listbox" />,
  },
})

async function loadDialog() {
  return (
    await import(
      '../../../src/ui/multi-commit-operation/choose-branch/merge-choose-branch-dialog'
    )
  ).MergeChooseBranchDialog
}

function branch(
  name: string,
  type: BranchType,
  upstream: string | null = null
): Branch {
  return new Branch(
    name,
    upstream,
    { sha: name === 'main' ? 'a'.repeat(40) : 'b'.repeat(40) },
    type,
    type === BranchType.Local ? `refs/heads/${name}` : `refs/remotes/${name}`
  )
}

afterEach(() => {
  commitsBehind = 0
})

describe('MergeChooseBranchDialog branch cleanup action', () => {
  it('offers remote branch deletion when the comparison is already up to date', async () => {
    commitsBehind = 0
    const MergeChooseBranchDialog = await loadDialog()
    const repository = new Repository('C:\\merge-dialog-test', 1, null, false)
    const currentBranch = branch('main', BranchType.Local, 'origin/main')
    const selectedBranch = branch('origin/feature', BranchType.Remote)
    const popups: Array<{
      type: PopupType
      branch: Branch
      expectedSha?: string
    }> = []

    let dismissed = 0

    render(
      <MergeChooseBranchDialog
        dispatcher={
          {
            showPopup: (popup: { type: PopupType; branch: Branch }) => {
              popups.push(popup)
              return Promise.resolve()
            },
          } as never
        }
        repository={repository}
        defaultBranch={currentBranch}
        currentBranch={currentBranch}
        allBranches={[currentBranch, selectedBranch]}
        recentBranches={[]}
        initialBranch={selectedBranch}
        operation={MultiCommitOperationKind.Merge}
        onDismissed={() => dismissed++}
      />
    )

    await waitFor(() => assert.ok(screen.getByText('Delete branch')))
    const deleteButton = screen.getByText('Delete branch').closest('button')
    assert.ok(deleteButton)
    assert.equal(deleteButton.getAttribute('aria-label'), 'Delete branch')
    fireEvent.click(deleteButton)

    assert.equal(dismissed, 1)
    assert.equal(popups.length, 1)
    assert.equal(popups[0].type, PopupType.DeleteRemoteBranch)
    assert.strictEqual(popups[0].branch, selectedBranch)
    assert.equal(popups[0].expectedSha, selectedBranch.tip.sha)
  })

  it('does not offer deletion when the selected branch has commits to merge', async () => {
    commitsBehind = 1
    const MergeChooseBranchDialog = await loadDialog()
    const repository = new Repository('C:\\merge-dialog-test', 1, null, false)
    const currentBranch = branch('main', BranchType.Local, 'origin/main')
    const selectedBranch = branch('origin/feature', BranchType.Remote)

    render(
      <MergeChooseBranchDialog
        dispatcher={{} as never}
        repository={repository}
        defaultBranch={currentBranch}
        currentBranch={currentBranch}
        allBranches={[currentBranch, selectedBranch]}
        recentBranches={[]}
        initialBranch={selectedBranch}
        operation={MultiCommitOperationKind.Merge}
        onDismissed={() => undefined}
      />
    )

    await waitFor(() => assert.ok(screen.getByText(/This will merge/)))
    assert.equal(
      document.querySelector('[data-verification="merge-delete-branch"]'),
      null
    )
  })
  it('keeps deletion hidden when the ahead/behind result is unknown', async () => {
    commitsBehind = null
    const MergeChooseBranchDialog = await loadDialog()
    const repository = new Repository('C:\\merge-dialog-test', 1, null, false)
    const currentBranch = branch('main', BranchType.Local, 'origin/main')
    const selectedBranch = branch('origin/feature', BranchType.Remote)

    render(
      <MergeChooseBranchDialog
        dispatcher={{} as never}
        repository={repository}
        defaultBranch={currentBranch}
        currentBranch={currentBranch}
        allBranches={[currentBranch, selectedBranch]}
        recentBranches={[]}
        initialBranch={selectedBranch}
        operation={MultiCommitOperationKind.Merge}
        onDismissed={() => undefined}
      />
    )

    await waitFor(() => assert.ok(screen.getByText(/Unable to verify whether/)))
    assert.equal(
      document.querySelector('[data-verification="merge-delete-branch"]'),
      null
    )
  })

  it('carries the reviewed local tip into local deletion', async () => {
    commitsBehind = 0
    const MergeChooseBranchDialog = await loadDialog()
    const repository = new Repository('C:\\merge-dialog-test', 1, null, false)
    const currentBranch = branch('main', BranchType.Local, 'origin/main')
    const selectedBranch = branch('feature', BranchType.Local)
    const popups: Array<{
      type: PopupType
      branch: Branch
      expectedSha?: string
    }> = []

    render(
      <MergeChooseBranchDialog
        dispatcher={
          {
            showPopup: (popup: {
              type: PopupType
              branch: Branch
              expectedSha?: string
            }) => {
              popups.push(popup)
              return Promise.resolve()
            },
          } as never
        }
        repository={repository}
        defaultBranch={currentBranch}
        currentBranch={currentBranch}
        allBranches={[currentBranch, selectedBranch]}
        recentBranches={[]}
        initialBranch={selectedBranch}
        operation={MultiCommitOperationKind.Merge}
        onDismissed={() => undefined}
      />
    )

    await waitFor(() => assert.ok(screen.getByText('Delete branch')))
    fireEvent.click(screen.getByText('Delete branch').closest('button')!)

    assert.equal(popups[0].type, PopupType.DeleteBranch)
    assert.strictEqual(popups[0].branch, selectedBranch)
    assert.equal(popups[0].expectedSha, selectedBranch.tip.sha)
  })
})
