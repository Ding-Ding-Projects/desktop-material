import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { FocusContainer } from '../../../src/ui/lib/focus-container'
import { fireEvent, render, screen } from '../../helpers/ui/render'

interface IFrameHarness {
  readonly cancelled: ReadonlyArray<number>
  flush(): void
  restore(): void
}

function installFrameHarness(): IFrameHarness {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  const callbacks = new Map<number, FrameRequestCallback>()
  const cancelled = new Array<number>()
  let nextId = 1

  globalThis.requestAnimationFrame = callback => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = id => {
    cancelled.push(id)
    callbacks.delete(id)
  }

  return {
    cancelled,
    flush() {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      for (const [id, callback] of pending) {
        callback(id)
      }
    },
    restore() {
      globalThis.requestAnimationFrame = originalRequest
      globalThis.cancelAnimationFrame = originalCancel
    },
  }
}

describe('FocusContainer lifecycle', () => {
  it('keeps focus-within stable while focus moves between descendants', () => {
    const frames = installFrameHarness()
    const changes = new Array<boolean>()

    try {
      render(
        <FocusContainer onFocusWithinChanged={value => changes.push(value)}>
          <button type="button">First</button>
          <button type="button">Second</button>
        </FocusContainer>
      )

      const first = screen.getByRole('button', { name: 'First' })
      const second = screen.getByRole('button', { name: 'Second' })
      const container = first.closest('.focus-container')
      assert.ok(container)

      fireEvent.focus(first)
      assert.equal(container.classList.contains('focus-within'), true)
      frames.flush()
      assert.deepEqual(changes, [true])

      fireEvent.blur(first, { relatedTarget: second })
      fireEvent.focus(second, { relatedTarget: first })
      assert.equal(container.classList.contains('focus-within'), true)
      frames.flush()
      assert.deepEqual(changes, [true])

      fireEvent.blur(second, { relatedTarget: null })
      assert.equal(container.classList.contains('focus-within'), false)
      frames.flush()
      assert.deepEqual(changes, [true, false])
    } finally {
      frames.restore()
    }
  })

  it('cancels a pending focus callback when unmounted', () => {
    const frames = installFrameHarness()

    try {
      const view = render(
        <FocusContainer onFocusWithinChanged={() => undefined}>
          <button type="button">Focus me</button>
        </FocusContainer>
      )

      fireEvent.focus(screen.getByRole('button', { name: 'Focus me' }))
      view.unmount()
      assert.deepEqual(frames.cancelled, [1])
    } finally {
      frames.restore()
    }
  })
})
