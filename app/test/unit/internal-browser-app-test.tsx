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
