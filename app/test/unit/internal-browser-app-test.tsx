import assert from 'node:assert'
import * as React from 'react'
import { describe, it, mock } from 'node:test'
import { Disposable } from 'event-kit'
import { render, fireEvent } from '../helpers/ui/render'
import {
  IInternalBrowserState,
  IInternalBrowserTabState,
} from '../../src/lib/internal-browser'

type StateListener = (event: unknown, state: IInternalBrowserState) => void

const listeners = new Map<string, StateListener>()
const sent = new Array<{
  readonly channel: string
  readonly payload: unknown
}>()

interface IAnimationFrameHarness {
  readonly pending: number
  flush(): void
  restore(): void
}

function installAnimationFrameHarness(): IAnimationFrameHarness {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextFrameId = 0

  globalThis.requestAnimationFrame = callback => {
    const frameId = ++nextFrameId
    callbacks.set(frameId, callback)
    return frameId
  }
  globalThis.cancelAnimationFrame = frameId => {
    callbacks.delete(frameId)
  }

  return {
    get pending() {
      return callbacks.size
    },
    flush() {
      const pending = Array.from(callbacks.entries())
      callbacks.clear()
      for (const [frameId, callback] of pending) {
        callback(frameId)
      }
    },
    restore() {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    },
  }
}

mock.module('../../src/lib/ipc-renderer', {
  namedExports: {
    on: (channel: string, listener: StateListener) => {
      listeners.set(channel, listener)
      return new Disposable(() => listeners.delete(channel))
    },
    send: (channel: string, payload: unknown) => {
      sent.push({ channel, payload })
    },
    removeListener: (channel: string) => {
      listeners.delete(channel)
    },
  },
})

mock.module('../../src/internal-browser/internal-browser-appearance', {
  namedExports: {
    applyPersistedInternalBrowserAppearance: () => {
      let customization: Record<string, unknown> = {}
      try {
        customization = JSON.parse(
          localStorage.getItem('appearance-customization-v1') ?? '{}'
        ) as Record<string, unknown>
      } catch {
        // Invalid persisted appearance values fall back to comfortable density.
      }
      document.body.setAttribute(
        'data-dm-toolbar-density',
        customization.toolbarDensity === 'compact' ? 'compact' : 'comfortable'
      )
      document.body.setAttribute(
        'data-dm-tab-density',
        customization.tabDensity === 'compact' ? 'compact' : 'comfortable'
      )
    },
  },
})

const baseTab: IInternalBrowserTabState = {
  id: 'browser-tab-1',
  title: 'Old page',
  url: 'https://old.example/',
  intent: 'default',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  canBookmark: true,
  error: null,
}

async function mountBrowserChrome() {
  listeners.clear()
  sent.length = 0
  const { InternalBrowserApp } = await import(
    '../../src/internal-browser/internal-browser-app'
  )
  const view = render(<InternalBrowserApp />)

  const push = (overrides: Partial<IInternalBrowserTabState> = {}) =>
    listeners.get('internal-browser-state')?.(null, {
      tabs: [{ ...baseTab, ...overrides }],
      activeTabId: baseTab.id,
    })

  const addressInput = () => {
    const input = view.container.querySelector<HTMLInputElement>(
      '.internal-browser-address input'
    )
    assert.notEqual(input, null)
    return input as HTMLInputElement
  }

  return { view, push, addressInput }
}

describe('the internal browser chrome', () => {
  it('reports compact content bounds before announcing renderer readiness', async () => {
    const appearanceStorageKey = 'appearance-customization-v1'
    const previousAppearance = localStorage.getItem(appearanceStorageKey)
    const originalBounds = HTMLElement.prototype.getBoundingClientRect
    const frames = installAnimationFrameHarness()
    let viewportY = 93
    let view: ReturnType<typeof render> | null = null

    localStorage.setItem(
      appearanceStorageKey,
      JSON.stringify({
        version: 1,
        toolbarDensity: 'compact',
        tabDensity: 'compact',
      })
    )
    HTMLElement.prototype.getBoundingClientRect = () => {
      const compact =
        document.body.getAttribute('data-dm-toolbar-density') === 'compact' &&
        document.body.getAttribute('data-dm-tab-density') === 'compact'
      const y = compact ? viewportY : 107
      return new DOMRect(0, y, 1280, 720 - y)
    }

    try {
      ;({ view } = await mountBrowserChrome())

      assert.deepEqual(sent.slice(0, 2), [
        {
          channel: 'internal-browser-content-bounds',
          payload: { x: 0, y: 93, width: 1280, height: 627 },
        },
        { channel: 'internal-browser-ready', payload: undefined },
      ])

      // The synchronous first report supplements rather than replaces the
      // queued observer/resize path used for later layout changes.
      assert.equal(frames.pending, 1)
      viewportY = 96
      frames.flush()
      assert.deepEqual(sent.at(-1), {
        channel: 'internal-browser-content-bounds',
        payload: { x: 0, y: 96, width: 1280, height: 624 },
      })
    } finally {
      view?.unmount()
      frames.restore()
      HTMLElement.prototype.getBoundingClientRect = originalBounds
      if (previousAppearance === null) {
        localStorage.removeItem(appearanceStorageKey)
      } else {
        localStorage.setItem(appearanceStorageKey, previousAppearance)
      }
    }
  })

  it('holds a submitted address until the navigation actually commits', async () => {
    const { view, push, addressInput } = await mountBrowserChrome()
    push()
    assert.equal(addressInput().value, 'https://old.example/')

    fireEvent.change(addressInput(), { target: { value: 'new.example' } })
    const form = view.container.querySelector('form')
    assert.notEqual(form, null)
    fireEvent.submit(form as HTMLFormElement)

    assert.deepEqual(sent.at(-1), {
      channel: 'internal-browser-command',
      payload: {
        type: 'navigate',
        tabId: baseTab.id,
        url: 'new.example',
      },
    })

    // Main reports the load starting while the tab still holds the address it
    // is leaving. The bar used to snap back to it the instant Enter was hit.
    push({ isLoading: true })
    assert.equal(addressInput().value, 'new.example')

    // A failed load never commits a URL, so the address the user typed has to
    // survive beside the failure notice rather than being lost to the old one.
    push({ error: 'load-failed' })
    assert.equal(addressInput().value, 'new.example')

    push({ url: 'https://new.example/', title: 'New page' })
    assert.equal(addressInput().value, 'https://new.example/')
  })

  it('reports an error on a sign-in tab as well as the private-session banner', async () => {
    const { view, push } = await mountBrowserChrome()
    push({ intent: 'authentication', error: 'certificate-error' })

    // The banner is standing information; the certificate failure is the thing
    // the user has to know about, and sign-in is where it matters most.
    assert.notEqual(
      view.container.querySelector('.internal-browser-auth-notice'),
      null
    )
    const error = view.container.querySelector('.internal-browser-error-notice')
    assert.notEqual(error, null)
    assert.equal(error?.getAttribute('role'), 'alert')
  })

  it('shows no notice on an ordinary healthy tab', async () => {
    const { view, push } = await mountBrowserChrome()
    push()
    assert.equal(
      view.container.querySelector('.internal-browser-auth-notice'),
      null
    )
    assert.equal(
      view.container.querySelector('.internal-browser-error-notice'),
      null
    )
  })
})
