import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { CheapLfsPayloadPassword } from '../../../src/ui/dialog/cheap-lfs-payload-password'
import { fireEvent, render, screen } from '../../helpers/ui/render'

let restoreIpcSend: (() => void) | null = null
let restoreDialog: (() => void) | null = null

beforeEach(async () => {
  localStorage.removeItem('language-mode-v1')
  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => undefined
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
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
  restoreDialog = () => {
    prototype.show = previousShow
    prototype.showModal = previousShowModal
    restoreDialog = null
  }
})

afterEach(() => {
  restoreIpcSend?.()
  restoreDialog?.()
  localStorage.removeItem('language-mode-v1')
})

describe('Cheap LFS payload password dialog', () => {
  it('keeps passwords masked, requires confirmation and the irreversible acknowledgement, and defaults saving off', () => {
    let submitted: Buffer | undefined
    let remembered = true
    let dismissed = 0

    render(
      <CheapLfsPayloadPassword
        purpose="encrypt"
        requireIrreversibleAcknowledgement={true}
        onSubmit={(password, rememberPassword) => {
          submitted = password
          remembered = rememberPassword
        }}
        onDismissed={() => dismissed++}
      />
    )

    const password = screen.getByLabelText('Password') as HTMLInputElement
    const confirmation = screen.getByLabelText(
      'Confirm password'
    ) as HTMLInputElement
    const remember = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /save in windows credential manager/i,
    })
    const acknowledgement = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /losing this password/i,
    })
    const continueButton = screen.getByRole('button', { name: 'Continue' })

    assert.equal(password.type, 'password')
    assert.equal(confirmation.type, 'password')
    assert.equal(remember.checked, false)
    assert.equal(continueButton.getAttribute('aria-disabled'), 'true')

    fireEvent.change(password, { target: { value: 'one-secret' } })
    fireEvent.change(confirmation, { target: { value: 'different' } })
    assert.ok(screen.getByRole('alert'))
    assert.equal(continueButton.getAttribute('aria-disabled'), 'true')

    fireEvent.change(confirmation, { target: { value: 'one-secret' } })
    fireEvent.click(acknowledgement)
    assert.equal(continueButton.getAttribute('aria-disabled'), null)
    fireEvent.click(continueButton)

    assert.equal(submitted?.toString('utf8'), 'one-secret')
    assert.equal(remembered, false)
    assert.equal(dismissed, 1)
    submitted?.fill(0)
  })

  it('confirms forgetting with a zero-length buffer and never asks for a password', () => {
    let submitted: Buffer | undefined
    render(
      <CheapLfsPayloadPassword
        purpose="forget-stale"
        onSubmit={password => {
          submitted = password
        }}
        onDismissed={() => {}}
      />
    )

    assert.equal(screen.queryByLabelText('Password'), null)
    const forgetButton = screen.getByRole('button', {
      name: 'Forget password',
    })
    assert.equal(forgetButton.getAttribute('aria-disabled'), 'true')
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /removes the password that failed/i,
      })
    )
    fireEvent.click(forgetButton)

    assert.ok(Buffer.isBuffer(submitted))
    assert.equal(submitted?.length, 0)
  })
})
