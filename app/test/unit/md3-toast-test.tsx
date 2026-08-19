import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { englishTranslations } from '../../src/lib/i18n-resources'
import {
  Md3ToastDefaultDuration,
  Md3ToastHost,
  md3Toasts,
  notify,
} from '../../src/ui/md3/md3-toast'
import { fireEvent, render, screen, waitFor } from '../helpers/ui/render'

/**
 * The MD3 toast, rendered.
 *
 * Everything asserted here is behaviour a screenshot cannot show: that a timer
 * ran out, that a timer *did not* run out because a pointer was resting on the
 * toast, that a control is absent because there is nothing behind it. The store
 * is the real process-wide `md3Toasts` rather than an injected one — a test
 * that swapped in its own queue would prove the item renders and nothing about
 * whether `notify()` reaches the host every other module calls it through.
 */

/**
 * Let real time pass with React updates still wrapped by `act`.
 *
 * `waitFor` runs its poll inside Testing Library's async wrapper, so a store
 * emit landing mid-wait is inside the act scope. A bare `setTimeout` await is
 * not, and produces "an update was not wrapped in act(...)" noise that hides
 * whatever the test was actually reporting.
 */
async function elapse(milliseconds: number): Promise<void> {
  const deadline = Date.now() + milliseconds
  await waitFor(
    () => {
      assert.ok(Date.now() >= deadline, 'waiting for real time to pass')
    },
    { timeout: milliseconds + 5_000, interval: 10 }
  )
}

function toastElements(): ReadonlyArray<HTMLElement> {
  return Array.from(document.querySelectorAll<HTMLElement>('.md3-toast'))
}

afterEach(() => md3Toasts.clear())

describe('md3 toast queue', () => {
  it('gives an informational toast the contract 3000ms timer', () => {
    notify('Fetched origin')
    assert.equal(md3Toasts.toasts.length, 1)
    assert.equal(md3Toasts.toasts[0].duration, Md3ToastDefaultDuration)
    assert.equal(Md3ToastDefaultDuration, 3000)
  })

  it('gives a warning and an error no timer at all', () => {
    notify('Slow network', { kind: 'warning' })
    notify('Push rejected', { kind: 'error' })
    assert.deepStrictEqual(
      md3Toasts.toasts.map(toast => toast.duration),
      [null, null]
    )
  })

  it('stacks rather than replacing, and replaces only on a repeated key', () => {
    notify('First')
    notify('Second')
    assert.equal(md3Toasts.toasts.length, 2)

    notify('Keyed once', { key: 'k' })
    notify('Keyed twice', { key: 'k' })
    assert.deepStrictEqual(
      md3Toasts.toasts.map(toast => toast.message),
      ['First', 'Second', 'Keyed twice']
    )
  })
})

describe('md3 toast host', () => {
  it('auto-dismisses a timed toast', async () => {
    notify('Fetched origin', { duration: 120 })
    render(<Md3ToastHost />)

    assert.equal(toastElements().length, 1)
    await waitFor(() => assert.equal(toastElements().length, 0))
  })

  it('keeps an error on screen until it is dismissed', async () => {
    notify('Push rejected: HTTP 403', { kind: 'error' })
    render(<Md3ToastHost />)

    // Comfortably longer than the contract's own 3000ms timer would have
    // needed, so "still there" cannot be a slow timer rather than no timer.
    await elapse(Md3ToastDefaultDuration + 250)
    assert.equal(toastElements().length, 1)

    const dismiss = screen.getByRole('button', {
      name: englishTranslations['md3.toast.dismiss'],
    })
    fireEvent.click(dismiss)
    assert.equal(toastElements().length, 0)
  })

  it('announces an error assertively and an update politely', () => {
    notify('Fetched origin')
    notify('Push rejected', { kind: 'error' })
    render(<Md3ToastHost />)

    const [info, error] = toastElements()
    assert.equal(info.getAttribute('role'), 'status')
    assert.equal(error.getAttribute('role'), 'alert')
  })

  it('pauses the timer while the pointer rests on the toast', async () => {
    notify('Fetched origin', { duration: 150 })
    const view = render(<Md3ToastHost />)

    // No await between the render and the hover: JavaScript is single
    // threaded, so a timer created during render cannot have fired before the
    // next synchronous statement. Any wait here would make the test's own
    // scheduling, rather than the pause, decide whether it passes.
    const toast = view.container.querySelector('.md3-toast')
    assert.ok(toast !== null)
    fireEvent.mouseEnter(toast as Element)

    await elapse(500)
    assert.equal(
      toastElements().length,
      1,
      'a hovered toast must not expire underneath the pointer'
    )

    fireEvent.mouseLeave(toast as Element)
    await waitFor(() => assert.equal(toastElements().length, 0))
  })

  it('pauses the timer while focus is inside the toast', async () => {
    let undone = 0
    notify('Deleted 3 notifications', {
      duration: 150,
      onUndo: () => undone++,
    })
    const view = render(<Md3ToastHost />)

    const toast = view.container.querySelector('.md3-toast')
    assert.ok(toast !== null)
    fireEvent.focus(toast as Element)

    await elapse(500)
    assert.equal(
      toastElements().length,
      1,
      'a toast holding focus must not expire out from under the keyboard'
    )

    // And the action it was holding focus for still works.
    fireEvent.click(
      screen.getByRole('button', {
        name: englishTranslations['md3.toast.undo'],
      })
    )
    assert.equal(undone, 1)
    assert.equal(toastElements().length, 0)
  })

  it('renders Undo only when there is something to undo', () => {
    notify('Nothing to reverse here')
    render(<Md3ToastHost />)

    assert.equal(
      screen.queryByRole('button', {
        name: englishTranslations['md3.toast.undo'],
      }),
      null,
      'an Undo that calls nothing is worse than no Undo at all'
    )
  })

  it('names a custom reversal with the caller word', () => {
    notify('Discarded 4 files', {
      onUndo: () => undefined,
      undoLabel: 'Restore',
    })
    render(<Md3ToastHost />)

    assert.ok(
      screen.getByRole('button', { name: 'Restore' }) instanceof HTMLElement
    )
    assert.equal(
      screen.queryByRole('button', {
        name: englishTranslations['md3.toast.undo'],
      }),
      null
    )
  })

  it('gives a timed toast no dismiss button and an untimed one both', () => {
    notify('Fetched origin', { duration: 5_000, onUndo: () => undefined })
    notify('Push rejected', { kind: 'error', onUndo: () => undefined })
    render(<Md3ToastHost />)

    const [timed, untimed] = toastElements()
    assert.equal(timed.querySelectorAll('.md3-toast__dismiss').length, 0)
    assert.equal(timed.querySelectorAll('.md3-toast__undo').length, 1)
    assert.equal(untimed.querySelectorAll('.md3-toast__dismiss').length, 1)
    assert.equal(untimed.querySelectorAll('.md3-toast__undo').length, 1)
  })

  it('keeps the region in the document while it is empty', () => {
    render(<Md3ToastHost />)
    const region = screen.getByRole('region', {
      name: englishTranslations['md3.toast.region'],
    })
    assert.equal(region.childElementCount, 0)
  })
})
