import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Dialog, DialogStackContext } from '../../../src/ui/dialog/dialog'
import { render, screen } from '../../helpers/ui/render'

const showDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'show'
)
const closeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close'
)
let restoreIpcSend: (() => void) | null = null

describe('Dialog focus', () => {
  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
      restoreIpcSend = null
    }

    HTMLDialogElement.prototype.show = function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
  })

  afterEach(() => {
    restoreIpcSend?.()

    if (showDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'show')
    } else {
      Object.defineProperty(HTMLDialogElement.prototype, 'show', showDescriptor)
    }

    if (closeDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    } else {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'close',
        closeDescriptor
      )
    }
  })

  it('restores the focused descendant after a nested dialog is dismissed', () => {
    const renderDialog = (isTopMost: boolean) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Configure provider">
          <button>First action</button>
          <button>Open nested dialog</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog(true))
    try {
      const dialog = screen.getByRole('dialog')
      const trigger = screen.getByRole('button', {
        name: 'Open nested dialog',
      })

      trigger.focus()
      dialog.focus()

      view.rerender(renderDialog(false))
      view.rerender(renderDialog(true))

      assert.strictEqual(document.activeElement, trigger)
    } finally {
      view.unmount()
    }
  })

  it('focuses the first suitable control on initial open', () => {
    const view = render(
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        <Dialog title="Configure provider">
          <button>First action</button>
          <button>Second action</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    try {
      assert.strictEqual(
        document.activeElement,
        screen.getByRole('button', { name: 'First action' })
      )
    } finally {
      view.unmount()
    }
  })

  it('falls back when a preferred control is absent or disabled', () => {
    const renderDialog = (
      preferred: 'absent' | 'disabled' | 'enabled',
      isTopMost = true
    ) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Configure provider">
          <button
            className={
              preferred === 'absent' ? undefined : 'dialog-preferred-focus'
            }
            disabled={preferred === 'disabled'}
          >
            Preferred action
          </button>
          <button>Fallback action</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog('enabled'))
    try {
      assert.strictEqual(
        document.activeElement,
        screen.getByRole('button', { name: 'Preferred action' })
      )

      view.rerender(renderDialog('disabled', false))
      view.rerender(renderDialog('disabled'))
      assert.strictEqual(
        document.activeElement,
        screen.getByRole('button', { name: 'Fallback action' })
      )

      view.rerender(renderDialog('absent', false))
      view.rerender(renderDialog('absent'))
      assert.strictEqual(
        document.activeElement,
        screen.getByRole('button', { name: 'Preferred action' })
      )
    } finally {
      view.unmount()
    }
  })

  it('falls back when the previously focused descendant is disabled', () => {
    const renderDialog = (isTopMost: boolean, triggerDisabled: boolean) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Configure provider">
          <button>First action</button>
          <button disabled={triggerDisabled}>Open nested dialog</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog(true, false))
    try {
      const firstAction = screen.getByRole('button', { name: 'First action' })
      const dialog = screen.getByRole('dialog')
      const trigger = screen.getByRole('button', {
        name: 'Open nested dialog',
      })

      trigger.focus()
      dialog.focus()

      view.rerender(renderDialog(false, true))
      view.rerender(renderDialog(true, true))

      assert.strictEqual(document.activeElement, firstAction)
    } finally {
      view.unmount()
    }
  })

  it('keeps the original descendant when contents change while nested', () => {
    const renderDialog = (isTopMost: boolean, showNewFirstAction: boolean) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Configure provider">
          {showNewFirstAction ? <button>New first action</button> : null}
          <button>Open nested dialog</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog(true, false))
    try {
      const dialog = screen.getByRole('dialog')
      const trigger = screen.getByRole('button', {
        name: 'Open nested dialog',
      })

      trigger.focus()
      dialog.focus()

      view.rerender(renderDialog(false, true))
      view.rerender(renderDialog(true, true))

      assert.strictEqual(document.activeElement, trigger)
    } finally {
      view.unmount()
    }
  })
})
