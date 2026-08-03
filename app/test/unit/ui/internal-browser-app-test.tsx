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
  let previousOn: Electron.IpcRenderer['on']
  let previousRemoveListener: Electron.IpcRenderer['removeListener']
  let sends: Array<{ channel: string; args: ReadonlyArray<unknown> }>
  let listeners: Map<string, Array<(...args: unknown[]) => void>>

  beforeEach(async () => {
    localStorage.clear()
    sends = []
    listeners = new Map()
    rawIpcRenderer = (await import('electron')).ipcRenderer
    previousSend = rawIpcRenderer.send
    previousOn = rawIpcRenderer.on
    previousRemoveListener = rawIpcRenderer.removeListener
    rawIpcRenderer.send = (channel: string, ...args: unknown[]) => {
      sends.push({ channel, args })
    }
    rawIpcRenderer.on = ((
      channel: string,
      listener: (...args: unknown[]) => void
    ) => {
      const existing = listeners.get(channel) ?? []
      existing.push(listener)
      listeners.set(channel, existing)
      return rawIpcRenderer
    }) as Electron.IpcRenderer['on']
    rawIpcRenderer.removeListener = () => rawIpcRenderer
  })

  afterEach(() => {
    rawIpcRenderer.send = previousSend
    rawIpcRenderer.on = previousOn
    rawIpcRenderer.removeListener =
      typeof previousRemoveListener === 'function'
        ? previousRemoveListener
        : () => rawIpcRenderer
  })

  const emit = (channel: string, ...args: unknown[]) => {
    for (const listener of listeners.get(channel) ?? []) {
      listener({}, ...args)
    }
  }

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

  it('opens the find bar from Ctrl+F and sends bounded plain searches', () => {
    const view = render(<BrowserWithTabs />)

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const find = screen.getByRole('search')
    const input = screen.getByRole('searchbox', {
      name: 'Find text or pattern',
    })
    assert.ok(find)

    fireEvent.change(input, { target: { value: 'release' } })
    const command = sends
      .map(entry => entry.args[0])
      .reverse()
      .find(
        value =>
          typeof value === 'object' &&
          value !== null &&
          (value as { type?: unknown }).type === 'find-in-page'
      ) as {
      type: string
      tabId: string
      query: string
      requestId: number
    }
    assert.deepEqual(
      {
        type: command.type,
        tabId: command.tabId,
        query: command.query,
      },
      { type: 'find-in-page', tabId: 'browser-tab-1', query: 'release' }
    )
    assert.equal(Number.isSafeInteger(command.requestId), true)

    fireEvent.click(screen.getByRole('button', { name: 'Close find bar' }))
    assert.deepEqual(sends[sends.length - 1], {
      channel: 'internal-browser-command',
      args: [{ type: 'stop-find-in-page', tabId: 'browser-tab-1' }],
    })
    view.unmount()
  })

  it('evaluates regex searches from page text and exposes match navigation', () => {
    const view = render(<BrowserWithTabs />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Find in page (Ctrl+F)' })
    )
    const input = screen.getByRole('searchbox', {
      name: 'Find text or pattern',
    })
    fireEvent.change(input, { target: { value: 'release' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle plain-text or regex mode' })
    )

    const command = sends
      .map(entry => entry.args[0])
      .reverse()
      .find(
        value =>
          typeof value === 'object' &&
          value !== null &&
          (value as { type?: unknown }).type === 'read-page-text'
      ) as { type: string; tabId: string; requestId: number }
    assert.equal(command.type, 'read-page-text')
    assert.equal(command.tabId, 'browser-tab-1')
    assert.equal(Number.isSafeInteger(command.requestId), true)

    emit('internal-browser-page-text', {
      tabId: command.tabId,
      requestId: command.requestId,
      text: 'release notes: release safely',
      truncated: false,
    })

    assert.ok(screen.getByText('1 of 2'))
    const matchButtons = screen.getAllByRole('button', {
      name: /Go to match/i,
    })
    assert.equal(matchButtons.length, 2)
    fireEvent.click(matchButtons[1])
    assert.equal(matchButtons[1].getAttribute('aria-current'), 'true')

    fireEvent.change(input, { target: { value: '(' } })
    const invalidCommand = sends
      .map(entry => entry.args[0])
      .reverse()
      .find(
        value =>
          typeof value === 'object' &&
          value !== null &&
          (value as { type?: unknown }).type === 'read-page-text'
      ) as { type: string; tabId: string; requestId: number }
    emit('internal-browser-page-text', {
      tabId: invalidCommand.tabId,
      requestId: invalidCommand.requestId,
      text: 'release',
      truncated: false,
    })
    assert.ok(screen.getByRole('status').textContent?.trim())
    view.unmount()
  })
})
