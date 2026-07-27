import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { InternalBrowserApp } from '../../../src/internal-browser/internal-browser-app'
import { IInternalBrowserState } from '../../../src/lib/internal-browser'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const browserState: IInternalBrowserState = {
  activeTabId: 'browser-tab-1',
  tabs: [
    {
      id: 'browser-tab-1',
      title: 'First\u0000 docs',
      url: 'https://example.com/one',
      intent: 'default',
      isLoading: false,
      canGoBack: false,
      canGoForward: true,
      canBookmark: true,
      error: null,
    },
    {
      id: 'browser-tab-2',
      title: 'Sign in',
      url: 'https://github.com/login',
      intent: 'authentication',
      isLoading: false,
      canGoBack: true,
      canGoForward: false,
      canBookmark: false,
      error: null,
    },
    {
      id: 'browser-tab-3',
      title: '',
      url: null,
      intent: 'default',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      canBookmark: false,
      error: null,
    },
  ],
}

class BrowserWithTabs extends InternalBrowserApp {
  public constructor(props: {}) {
    super(props)
    this.state = {
      ...this.state,
      browser: browserState,
      address: browserState.tabs[0].url ?? '',
    }
  }
}

class BrowserWithAuthTab extends BrowserWithTabs {
  public constructor(props: {}) {
    super(props)
    this.state = {
      ...this.state,
      browser: { ...browserState, activeTabId: 'browser-tab-2' },
      address: browserState.tabs[1].url ?? '',
    }
  }
}

describe('internal browser chrome', () => {
  let rawIpcRenderer: Electron.IpcRenderer
  let previousSend: Electron.IpcRenderer['send']
  let previousRemoveListener: Electron.IpcRenderer['removeListener']
  let sends: Array<{ channel: string; args: ReadonlyArray<unknown> }>

  beforeEach(async () => {
    localStorage.clear()
    sends = []
    rawIpcRenderer = (await import('electron')).ipcRenderer
    previousSend = rawIpcRenderer.send
    previousRemoveListener = rawIpcRenderer.removeListener
    rawIpcRenderer.send = (channel: string, ...args: unknown[]) => {
      sends.push({ channel, args })
    }
    rawIpcRenderer.removeListener = () => rawIpcRenderer
  })

  afterEach(() => {
    rawIpcRenderer.send = previousSend
    rawIpcRenderer.removeListener = previousRemoveListener
  })

  it('implements roving tab focus and activation keys', () => {
    const view = render(<BrowserWithTabs />)
    const tabs = screen.getAllByRole('tab')

    assert.equal(tabs[0].tabIndex, 0)
    assert.equal(tabs[1].tabIndex, -1)
    assert.equal(tabs[2].tabIndex, -1)

    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    assert.equal(document.activeElement, tabs[1])
    assert.deepEqual(sends[sends.length - 1], {
      channel: 'internal-browser-command',
      args: [{ type: 'activate-tab', tabId: 'browser-tab-2' }],
    })

    fireEvent.keyDown(tabs[1], { key: 'End' })
    assert.equal(document.activeElement, tabs[2])
    assert.deepEqual(sends[sends.length - 1], {
      channel: 'internal-browser-command',
      args: [{ type: 'activate-tab', tabId: 'browser-tab-3' }],
    })
    view.unmount()
  })

  it('renders Material Symbols and a prominent auth escape action', () => {
    const view = render(<BrowserWithAuthTab />)

    const authAction = screen.getByRole('button', {
      name: /Continue in system browser/i,
    })
    assert.ok(authAction.querySelector('.material-symbol'))
    assert.ok(
      document.querySelectorAll(
        '.internal-browser-icon-button .material-symbol'
      ).length >= 5
    )
    view.unmount()
  })

  it('identifies every close action by sanitized title and auth context', () => {
    const view = render(<BrowserWithTabs />)

    assert.ok(screen.getByRole('button', { name: 'Close tab: First docs' }))
    assert.ok(
      screen.getByRole('button', {
        name: 'Close authentication tab: Sign in',
      })
    )
    assert.ok(screen.getByRole('button', { name: 'Close tab: New tab' }))
    view.unmount()
  })
})
