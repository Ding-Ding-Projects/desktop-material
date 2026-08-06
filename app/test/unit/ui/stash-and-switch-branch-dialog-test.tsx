import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { Popup, PopupType } from '../../../src/models/popup'
import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { StashAndSwitchBranch } from '../../../src/ui/stash-changes/stash-and-switch-branch-dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

describe('dirty branch switch choices', () => {
  it('opens a prefilled worktree flow without touching the dirty worktree', async () => {
    const repository = new Repository('C:/projects/example', 1, null, false)
    const currentBranch = new Branch(
      'main',
      null,
      { sha: 'a'.repeat(40) },
      BranchType.Local,
      'refs/heads/main'
    )
    const branchToCheckout = new Branch(
      'feature/worktree-switch',
      null,
      { sha: 'b'.repeat(40) },
      BranchType.Local,
      'refs/heads/feature/worktree-switch'
    )
    const shownPopups = new Array<Popup>()
    let checkoutCalls = 0
    let dismissedCalls = 0

    const dispatcher = {
      checkoutBranch: async () => {
        checkoutCalls++
        return repository
      },
      showPopup: async (popup: Popup) => {
        shownPopups.push(popup)
      },
    } as unknown as Dispatcher

    render(
      <StashAndSwitchBranch
        repository={repository}
        dispatcher={dispatcher}
        currentBranch={currentBranch}
        branchToCheckout={branchToCheckout}
        onDismissed={() => {
          dismissedCalls++
        }}
      />
    )

    fireEvent.click(
      screen.getByRole('radio', {
        name: /Leave my changes here/,
        hidden: true,
      })
    )

    const createWorktreeButton = screen.getByRole('button', {
      name: __DARWIN__ ? 'Create Worktree…' : 'Create worktree…',
      hidden: true,
    })
    fireEvent.click(createWorktreeButton)

    await waitFor(() => assert.equal(shownPopups.length, 1))

    assert.equal(shownPopups[0].type, PopupType.AddWorktree)
    assert.equal(
      shownPopups[0].type === PopupType.AddWorktree
        ? shownPopups[0].initialBranchName
        : undefined,
      branchToCheckout.name
    )
    assert.equal(
      shownPopups[0].type === PopupType.AddWorktree
        ? shownPopups[0].initialWorktreeName
        : undefined,
      'example-feature/worktree-switch'
    )
    assert.equal(checkoutCalls, 0)
    assert.equal(dismissedCalls, 1)
  })
})
