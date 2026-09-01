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
const addEventListenerDescriptor = Object.getOwnPropertyDescriptor(
  EventTarget.prototype,
  'addEventListener'
)
const removeEventListenerDescriptor = Object.getOwnPropertyDescriptor(
  EventTarget.prototype,
  'removeEventListener'
)
const focusInListeners = new Map<
  EventTarget,
  Set<EventListenerOrEventListenerObject>
>()
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

    const addEventListener = EventTarget.prototype.addEventListener
    const removeEventListener = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (
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
    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options
    ) {
      if (type === 'focusin' && listener !== null) {
        focusInListeners.get(this)?.delete(listener)
      }
      return removeEventListener.call(this, type, listener, options)
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

    focusInListeners.clear()
    if (addEventListenerDescriptor === undefined) {
      Reflect.deleteProperty(EventTarget.prototype, 'addEventListener')
    } else {
      Object.defineProperty(
        EventTarget.prototype,
        'addEventListener',
        addEventListenerDescriptor
      )
    }
    if (removeEventListenerDescriptor === undefined) {
      Reflect.deleteProperty(EventTarget.prototype, 'removeEventListener')
    } else {
      Object.defineProperty(
        EventTarget.prototype,
        'removeEventListener',
        removeEventListenerDescriptor
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
      assert.strictEqual(document.activeElement, middle)
      view.rerender(renderStack('outer'))
      assert.strictEqual(document.activeElement, outer)
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

      assert.strictEqual(document.activeElement, outer)
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

      assert.strictEqual(
        document.activeElement,
        screen.getByRole('button', { name: 'Fallback action' })
      )
    } finally {
      view.unmount()
    }
  })
})
