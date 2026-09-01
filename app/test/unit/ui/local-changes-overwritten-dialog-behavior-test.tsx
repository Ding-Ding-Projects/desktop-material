import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { RetryActionType } from '../../../src/models/retry-actions'
import { PopupType } from '../../../src/models/popup'
import { LocalChangesOverwrittenDialog } from '../../../src/ui/local-changes-overwritten/local-changes-overwritten-dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

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
    <LocalChangesOverwrittenDialog
      repository={repository}
      dispatcher={dispatcher as any}
      retryAction={retryAction}
      onDismissed={() => events.push('dismiss')}
      files={['conflicted.txt']}
    />
  )

  return { view, dispatcher }
}

describe('local-changes rebase dismissal behavior', () => {
  let restoreIpcSend: (() => void) | null = null

  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => undefined
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
      restoreIpcSend = null
    }
  })

  afterEach(() => restoreIpcSend?.())

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
