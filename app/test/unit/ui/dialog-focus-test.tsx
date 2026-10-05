import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Dialog, DialogStackContext } from '../../../src/ui/dialog/dialog'
import { render, screen, waitFor } from '../../helpers/ui/render'

const showDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'show'
)
const showModalDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal'
)
const closeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close'
)
// DOM elements inherit jsdom's EventTarget, not Node's global EventTarget.
const addEventListenerDescriptor = Object.getOwnPropertyDescriptor(
  window.EventTarget.prototype,
  'addEventListener'
)
const removeEventListenerDescriptor = Object.getOwnPropertyDescriptor(
  window.EventTarget.prototype,
  'removeEventListener'
)
const focusDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'focus'
)
const focusInListeners = new Map<
  EventTarget,
  Set<EventListenerOrEventListenerObject>
>()
let restoreIpcSend: (() => void) | null = null

// Comparing the elements directly makes a failure inspect React's cyclic DOM
// properties. Compare their identity as a boolean so failures stay bounded.
function assertFocused(element: HTMLElement) {
  assert.ok(
    document.activeElement === element,
    `Expected ${element.outerHTML} to have focus`
  )
}

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
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }

    const addEventListener = window.EventTarget.prototype.addEventListener
    const removeEventListener = window.EventTarget.prototype.removeEventListener
    window.EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options
    ) {
      if (type === 'focusin' && listener !== null) {
        const listeners = focusInListeners.get(this) ?? new Set()
        listeners.add(listener)
        focusInListeners.set(this, listeners)
      }
      return addEventListener.call(this, type, listener, options)
    }
    window.EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options
    ) {
      if (type === 'focusin' && listener !== null) {
        focusInListeners.get(this)?.delete(listener)
      }
      return removeEventListener.call(this, type, listener, options)
    }

    const focus = HTMLElement.prototype.focus
    HTMLElement.prototype.focus = function (options) {
      const openModal = document.querySelector<HTMLDialogElement>(
        'dialog[open][data-modal="true"]'
      )
      if (openModal !== null && !openModal.contains(this)) {
        return
      }
      return focus.call(this, options)
    }
  })

  afterEach(() => {
    restoreIpcSend?.()

    if (showDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'show')
    } else {
      Object.defineProperty(HTMLDialogElement.prototype, 'show', showDescriptor)
    }

    if (showModalDescriptor === undefined) {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    } else {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'showModal',
        showModalDescriptor
      )
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

    focusInListeners.clear()
    if (addEventListenerDescriptor === undefined) {
      Reflect.deleteProperty(window.EventTarget.prototype, 'addEventListener')
    } else {
      Object.defineProperty(
        window.EventTarget.prototype,
        'addEventListener',
        addEventListenerDescriptor
      )
    }
    if (removeEventListenerDescriptor === undefined) {
      Reflect.deleteProperty(
        window.EventTarget.prototype,
        'removeEventListener'
      )
    } else {
      Object.defineProperty(
        window.EventTarget.prototype,
        'removeEventListener',
        removeEventListenerDescriptor
      )
    }
    if (focusDescriptor === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, 'focus')
    } else {
      Object.defineProperty(HTMLElement.prototype, 'focus', focusDescriptor)
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

      assertFocused(trigger)
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
      assertFocused(screen.getByRole('button', { name: 'First action' }))
    } finally {
      view.unmount()
    }
  })

  for (const preferred of ['absent', 'disabled', 'enabled'] as const) {
    it(`chooses the initial focus when the preferred control is ${preferred}`, () => {
      const view = render(
        <DialogStackContext.Provider value={{ isTopMost: true }}>
          <Dialog title="Configure provider">
            <button>Fallback action</button>
            <button
              className={
                preferred === 'absent' ? undefined : 'dialog-preferred-focus'
              }
              disabled={preferred === 'disabled'}
            >
              Preferred action
            </button>
          </Dialog>
        </DialogStackContext.Provider>
      )

      try {
        assertFocused(
          screen.getByRole('button', {
            name:
              preferred === 'enabled' ? 'Preferred action' : 'Fallback action',
          })
        )
      } finally {
        view.unmount()
      }
    })
  }

  for (const preferred of [false, true]) {
    it(`falls back when the remembered ${preferred ? 'preferred ' : ''}control is disabled`, () => {
      const renderDialog = (isTopMost: boolean, triggerDisabled: boolean) => (
        <DialogStackContext.Provider value={{ isTopMost }}>
          <Dialog title="Configure provider">
            <button>First action</button>
            <button
              className={preferred ? 'dialog-preferred-focus' : undefined}
              disabled={triggerDisabled}
            >
              Open nested dialog
            </button>
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

        assertFocused(firstAction)
      } finally {
        view.unmount()
      }
    })
  }

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

      assertFocused(trigger)
    } finally {
      view.unmount()
    }
  })

  it('restores focus in LIFO order across three mounted dialogs', () => {
    const renderStack = (topMost: 'outer' | 'middle' | 'inner') => (
      <>
        <DialogStackContext.Provider value={{ isTopMost: topMost === 'outer' }}>
          <Dialog title="Outer dialog">
            <button>Outer trigger</button>
          </Dialog>
        </DialogStackContext.Provider>
        <DialogStackContext.Provider
          value={{ isTopMost: topMost === 'middle' }}
        >
          <Dialog title="Middle dialog">
            <button>Middle trigger</button>
          </Dialog>
        </DialogStackContext.Provider>
        <DialogStackContext.Provider value={{ isTopMost: topMost === 'inner' }}>
          <Dialog title="Inner dialog">
            <button>Inner trigger</button>
          </Dialog>
        </DialogStackContext.Provider>
      </>
    )

    const view = render(renderStack('outer'))
    try {
      const outer = screen.getByRole('button', { name: 'Outer trigger' })
      const middle = screen.getByRole('button', { name: 'Middle trigger' })
      const inner = screen.getByRole('button', { name: 'Inner trigger' })

      outer.focus()
      view.rerender(renderStack('middle'))
      middle.focus()
      view.rerender(renderStack('inner'))
      inner.focus()

      view.rerender(renderStack('middle'))
      assertFocused(middle)
      view.rerender(renderStack('outer'))
      assertFocused(outer)
    } finally {
      view.unmount()
    }
  })

  it('does not replace an outer target with focus from a nested dialog', () => {
    const renderStack = (outerTopMost: boolean, innerTopMost: boolean) => (
      <>
        <DialogStackContext.Provider value={{ isTopMost: outerTopMost }}>
          <Dialog title="Outer dialog">
            <button>Outer trigger</button>
          </Dialog>
        </DialogStackContext.Provider>
        <DialogStackContext.Provider value={{ isTopMost: innerTopMost }}>
          <Dialog title="Inner dialog">
            <button>Inner action</button>
          </Dialog>
        </DialogStackContext.Provider>
      </>
    )

    const view = render(renderStack(true, false))
    try {
      const outer = screen.getByRole('button', { name: 'Outer trigger' })
      const inner = screen.getByRole('button', { name: 'Inner action' })
      outer.focus()

      view.rerender(renderStack(false, true))
      inner.focus()
      view.rerender(renderStack(true, false))

      assertFocused(outer)
    } finally {
      view.unmount()
    }
  })

  it('removes the exact focus handler when a dialog backgrounds and unmounts', () => {
    const renderDialog = (isTopMost: boolean) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Lifecycle dialog">
          <button>Action</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog(true))
    const dialog = screen.getByRole('dialog')
    const listeners = focusInListeners.get(dialog)
    assert.ok(listeners)
    assert.strictEqual(listeners.size, 1)
    const [handler] = [...listeners]

    view.rerender(renderDialog(false))
    assert.strictEqual(focusInListeners.get(dialog)?.size, 0)

    view.rerender(renderDialog(true))
    const reattached = focusInListeners.get(dialog)
    assert.ok(reattached)
    assert.strictEqual(reattached.size, 1)
    assert.strictEqual([...reattached][0], handler)

    view.unmount()
    assert.strictEqual(focusInListeners.get(dialog)?.size ?? 0, 0)
  })

  it('falls back after the remembered target is unmounted while backgrounded', () => {
    const renderDialog = (isTopMost: boolean, includeTrigger: boolean) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <Dialog title="Changing dialog">
          {includeTrigger ? <button>Remembered action</button> : null}
          <button>Fallback action</button>
        </Dialog>
      </DialogStackContext.Provider>
    )

    const view = render(renderDialog(true, true))
    try {
      const remembered = screen.getByRole('button', {
        name: 'Remembered action',
      })
      remembered.focus()
      view.rerender(renderDialog(false, false))
      view.rerender(renderDialog(true, false))

      assertFocused(screen.getByRole('button', { name: 'Fallback action' }))
    } finally {
      view.unmount()
    }
  })

  it('retries outer focus after an exiting native modal closes', async () => {
    const renderStack = (outerTopMost: boolean, innerTopMost: boolean) => (
      <>
        <DialogStackContext.Provider value={{ isTopMost: outerTopMost }}>
          <Dialog title="Outer dialog">
            <button>Outer trigger</button>
          </Dialog>
        </DialogStackContext.Provider>
        <DialogStackContext.Provider value={{ isTopMost: innerTopMost }}>
          <Dialog title="Inner modal" modal={true}>
            <button>Inner action</button>
          </Dialog>
        </DialogStackContext.Provider>
      </>
    )

    const view = render(renderStack(true, false))
    try {
      const outer = screen.getByRole('button', { name: 'Outer trigger' })
      const innerDialog = screen.getByRole('dialog', {
        name: 'Inner modal',
      }) as HTMLDialogElement
      outer.focus()

      view.rerender(renderStack(false, true))
      view.rerender(renderStack(true, false))
      assert.ok(
        document.activeElement !== outer,
        'The modal still blocks outer focus'
      )

      window.setTimeout(() => innerDialog.close(), 100)
      await waitFor(() => assertFocused(outer), { timeout: 1500 })
    } finally {
      view.unmount()
    }
  })
})
