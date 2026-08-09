import assert from 'node:assert'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import {
  AudioSettingsStorageKey,
  DefaultAudioSystemSettings,
  serializeAudioSettings,
} from '../../../src/lib/audio/audio-settings'
import { Popup, PopupType } from '../../../src/models/popup'
import { Repository } from '../../../src/models/repository'
import { App } from '../../../src/ui/app'
import { CheapLfsPayloadPassword } from '../../../src/ui/dialog/cheap-lfs-payload-password'
import { fireEvent, render, screen } from '../../helpers/ui/render'

let restoreIpcSend: (() => void) | null = null
let restoreDialog: (() => void) | null = null
let showCalls = 0
let showModalCalls = 0

beforeEach(async () => {
  localStorage.removeItem('language-mode-v1')
  localStorage.removeItem(AudioSettingsStorageKey)
  showCalls = 0
  showModalCalls = 0
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
    showCalls++
    this.setAttribute('open', '')
  }
  prototype.showModal = function () {
    showModalCalls++
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
  localStorage.removeItem(AudioSettingsStorageKey)
})

describe('Cheap LFS payload password dialog', () => {
  it('routes the App popup through native showModal instead of show', () => {
    const repository = new Repository(
      'C:\\work\\modal-password',
      1,
      null,
      false
    )
    const popup: Popup = {
      id: 1,
      type: PopupType.CheapLfsPayloadPassword,
      repository,
      purpose: 'encrypt',
      context: 'commit-auto-pin',
      onSubmit: () => undefined,
    }
    type AppPopupRenderSeam = {
      state: {
        allPopups: ReadonlyArray<Popup>
        currentPopup: Popup | null
      }
      getOnPopupDismissedFn(id: number): () => void
      getOnPopupRequestFrontFn(id: number): () => void
      renderPopups(): JSX.Element
    }
    const app = Object.create(App.prototype) as AppPopupRenderSeam
    app.state = { allPopups: [popup], currentPopup: popup }
    app.getOnPopupDismissedFn = () => () => undefined
    app.getOnPopupRequestFrontFn = () => () => undefined

    const view = render(app.renderPopups())

    assert.equal(showModalCalls, 1)
    assert.equal(showCalls, 0)
    view.unmount()
  })

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

    const runtimePassword = randomBytes(32).toString('base64url')
    const mismatchedPassword = randomBytes(32).toString('base64url')
    fireEvent.change(password, { target: { value: runtimePassword } })
    fireEvent.change(confirmation, {
      target: { value: mismatchedPassword },
    })
    assert.ok(screen.getByRole('alert'))
    assert.equal(continueButton.getAttribute('aria-disabled'), 'true')

    fireEvent.change(confirmation, { target: { value: runtimePassword } })
    fireEvent.click(acknowledgement)
    assert.equal(continueButton.getAttribute('aria-disabled'), null)
    fireEvent.click(continueButton)

    assert.equal(submitted?.toString('utf8'), runtimePassword)
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

  it('states the commit-time encrypted outcome in every language and tone without changing its facts', () => {
    const cases = [
      {
        languageMode: 'english',
        funnyLevelEnglish: 1,
        funnyLevelCantonese: 5,
        expected:
          'This commit is waiting for a password so its large files can be pinned and uploaded only as encrypted ciphertext. Cancel stops the commit before any upload starts. Desktop Material cannot recover a lost password.',
      },
      {
        languageMode: 'cantonese',
        funnyLevelEnglish: 1,
        funnyLevelCantonese: 3,
        expected:
          '呢個 commit 暫停咗等密碼；大檔 pin 好之後只會以加密 ciphertext 上載。撳「取消」會喺任何上載開始前停止 commit。Desktop Material 無法復原遺失嘅密碼。',
      },
      {
        languageMode: 'bilingual',
        funnyLevelEnglish: 5,
        funnyLevelCantonese: 1,
        expected:
          'This commit is at the encryption gate doing the secret handshake, and the gate still wants the password first. Its large files will be pinned and uploaded only as encrypted ciphertext; Cancel stops the commit before a single byte is uploaded. One part is said with a straight face: Desktop Material cannot recover a lost password — there is no locksmith. · 呢個 commit 正等緊密碼，之後先會將大檔 pin 好，而且只會以加密 ciphertext 上載。撳「取消」會喺任何上載開始前停止 commit。Desktop Material 無法復原遺失嘅密碼。',
      },
    ] as const

    for (const candidate of cases) {
      localStorage.setItem('language-mode-v1', candidate.languageMode)
      localStorage.setItem(
        AudioSettingsStorageKey,
        serializeAudioSettings({
          ...DefaultAudioSystemSettings,
          funnyLevelEnglish: candidate.funnyLevelEnglish,
          funnyLevelCantonese: candidate.funnyLevelCantonese,
        })
      )
      const view = render(
        <CheapLfsPayloadPassword
          purpose="encrypt"
          context="commit-auto-pin"
          onSubmit={() => undefined}
          onDismissed={() => undefined}
        />
      )

      assert.ok(screen.getByText(candidate.expected))
      assert.match(candidate.expected, /commit/)
      assert.match(candidate.expected, /encrypt|加密/)
      assert.match(candidate.expected, /upload|上載/)
      assert.match(candidate.expected, /Cancel|取消/)
      view.unmount()
    }
  })

  it('keeps the blocking commit prompt masked, screen-reader named, and keyboard-submittable', () => {
    let submitted: Buffer | undefined
    let dismissed = 0
    const view = render(
      <CheapLfsPayloadPassword
        purpose="encrypt"
        context="commit-auto-pin"
        onSubmit={password => {
          submitted = password
        }}
        onDismissed={() => dismissed++}
      />
    )

    const dialog = screen.getByRole('alertdialog', {
      name: 'Password required before encrypted commit',
    })
    assert.equal(
      dialog.getAttribute('aria-describedby'),
      'cheap-lfs-payload-password-description'
    )
    const password = screen.getByLabelText('Password') as HTMLInputElement
    const confirmation = screen.getByLabelText(
      'Confirm password'
    ) as HTMLInputElement
    assert.equal(password.type, 'password')
    assert.equal(confirmation.type, 'password')
    const runtimePassword = randomBytes(32).toString('base64url')
    fireEvent.change(password, { target: { value: runtimePassword } })
    fireEvent.change(confirmation, { target: { value: runtimePassword } })

    const continueButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Continue',
    })
    assert.equal(continueButton.type, 'submit')
    const form = dialog.querySelector('form')
    assert.notEqual(form, null)
    fireEvent.submit(form!)

    assert.equal(submitted?.toString('utf8'), runtimePassword)
    assert.equal(dismissed, 1)
    submitted?.fill(0)
    view.unmount()

    let canceled = false
    render(
      <CheapLfsPayloadPassword
        purpose="encrypt"
        context="commit-auto-pin"
        onSubmit={candidate => {
          canceled = candidate === undefined
        }}
        onDismissed={() => undefined}
      />
    )
    const cancelButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Cancel',
    })
    assert.equal(cancelButton.type, 'reset')
    fireEvent.click(cancelButton)
    assert.equal(canceled, true)
  })
})
