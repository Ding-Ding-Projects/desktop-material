import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'

import { Repository } from '../../../src/models/repository'
import { RetryActionType } from '../../../src/models/retry-actions'
import { PopupType } from '../../../src/models/popup'
import { DialogStackContext } from '../../../src/ui/dialog/dialog'
import { LocalChangesOverwrittenDialog } from '../../../src/ui/local-changes-overwritten/local-changes-overwritten-dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

const repository = new Repository('/tmp/rebase', 1, null, false)

type RetryActionTypeValue = RetryActionType

function action(type: RetryActionTypeValue): any {
  return { type, repository }
}

function renderDialog(
  retryAction: any,
  events: string[],
  createStashResult = true
) {
  const dispatcher = {
    closePopup: (type: PopupType) => events.push(`close:${type}`),
    createStashForCurrentBranch: async () => {
      events.push('stash')
      return createStashResult
    },
    performRetry: async () => events.push('retry'),
  }

  const view = render(
    <DialogStackContext.Provider value={{ isTopMost: true }}>
      <LocalChangesOverwrittenDialog
        repository={repository}
        dispatcher={dispatcher as any}
        retryAction={retryAction}
        onDismissed={() => events.push('dismiss')}
        files={['conflicted.txt']}
      />
    </DialogStackContext.Provider>
  )

  // Dialog intentionally ignores dismissal while its 250ms appearance grace
  // period is active. Advance it before every interaction in this suite.
  advanceTimersBy(250)

  return { view, dispatcher }
}

describe('local-changes rebase dismissal behavior', () => {
  let restoreIpcSend: (() => void) | null = null
  let restoreDialogShow: (() => void) | null = null

  beforeEach(async () => {
    enableTestTimers(['setTimeout'])
    const previousSend = ipcRenderer.send
    ipcRenderer.send = () => undefined
    restoreIpcSend = () => {
      ipcRenderer.send = previousSend
      restoreIpcSend = null
    }

    const prototype = window.HTMLDialogElement.prototype
    const previousShow = prototype.show
    const previousShowModal = prototype.showModal
    prototype.show = function () {
      this.setAttribute('open', '')
    }
    prototype.showModal = function () {
      this.setAttribute('open', '')
    }
    restoreDialogShow = () => {
      prototype.show = previousShow
      prototype.showModal = previousShowModal
      restoreDialogShow = null
    }
  })

  afterEach(() => {
    restoreIpcSend?.()
    restoreDialogShow?.()
    resetTestTimers()
  })

  it('dismisses rebase in order and closes the outer popup exactly once', () => {
    const events: string[] = []
    renderDialog(action(RetryActionType.Rebase), events)

    fireEvent.click(screen.getByLabelText('Close'))

    assert.deepEqual(events, [
      'dismiss',
      `close:${PopupType.MultiCommitOperation}`,
    ])
  })

  for (const type of [
    RetryActionType.Checkout,
    RetryActionType.Pull,
    RetryActionType.Merge,
    RetryActionType.Push,
  ]) {
    it(`only dismisses the local error for retry type ${type}`, () => {
      const events: string[] = []
      renderDialog(action(type), events)

      fireEvent.click(screen.getByLabelText('Close'))

      assert.deepEqual(events, ['dismiss'])
    })
  }

  it('stashes, dismisses, and retries without closing the outer popup', async () => {
    const events: string[] = []
    renderDialog(action(RetryActionType.Rebase), events)

    fireEvent.click(
      screen.getByRole('button', { name: /stash changes and continue/i })
    )

    await waitFor(() => assert.deepEqual(events, ['stash', 'dismiss', 'retry']))
    assert.equal(
      events.includes(`close:${PopupType.MultiCommitOperation}`),
      false
    )
  })

  it('uses the same route for Escape dismissal', () => {
    const events: string[] = []
    const { view } = renderDialog(action(RetryActionType.Rebase), events)

    fireEvent.keyDown(view.container.querySelector('[role="alertdialog"]')!, {
      key: 'Escape',
    })

    assert.deepEqual(events, [
      'dismiss',
      `close:${PopupType.MultiCommitOperation}`,
    ])
  })
})
