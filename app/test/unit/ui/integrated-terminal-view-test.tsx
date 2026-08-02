import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'

import { fireEvent, render, screen, within } from '../../helpers/ui/render'

type DataListener = (data: string) => void
type ResizeListener = (size: {
  readonly cols: number
  readonly rows: number
}) => void

class FakeXTerm {
  public readonly writes = new Array<unknown>()
  public readonly dataListeners = new Set<DataListener>()
  public readonly resizeListeners = new Set<ResizeListener>()
  public keyEventHandler: ((event: KeyboardEvent) => boolean) | null = null
  public openedElement: HTMLElement | null = null
  public dataDisposeCalls = 0
  public resizeDisposeCalls = 0
  public disposeCalls = 0
  public focusCalls = 0
  public resetCalls = 0

  public constructor(public options: Record<string, unknown>) {
    xtermInstances.push(this)
  }

  public open(element: HTMLElement): void {
    this.openedElement = element
  }

  public write(data: unknown): void {
    this.writes.push(data)
  }

  public reset(): void {
    this.resetCalls++
  }

  public focus(): void {
    this.focusCalls++
  }

  public dispose(): void {
    this.disposeCalls++
    this.dataListeners.clear()
    this.resizeListeners.clear()
  }

  public onData(listener: DataListener): { readonly dispose: () => void } {
    this.dataListeners.add(listener)
    let disposed = false

    return {
      dispose: () => {
        if (disposed) {
          return
        }

        disposed = true
        this.dataDisposeCalls++
        this.dataListeners.delete(listener)
      },
    }
  }

  public onResize(listener: ResizeListener): { readonly dispose: () => void } {
    this.resizeListeners.add(listener)
    let disposed = false

    return {
      dispose: () => {
        if (disposed) {
          return
        }

        disposed = true
        this.resizeDisposeCalls++
        this.resizeListeners.delete(listener)
      },
    }
  }

  public attachCustomKeyEventHandler(
    handler: (event: KeyboardEvent) => boolean
  ): void {
    this.keyEventHandler = handler
  }

  public emitData(data: string): void {
    for (const listener of [...this.dataListeners]) {
      listener(data)
    }
  }

  public emitResize(size: {
    readonly cols: number
    readonly rows: number
  }): void {
    for (const listener of [...this.resizeListeners]) {
      listener(size)
    }
  }
}

const xtermInstances = new Array<FakeXTerm>()

mock.module('@xterm/xterm', {
  namedExports: {
    Terminal: FakeXTerm,
  },
})

beforeEach(() => {
  xtermInstances.length = 0
})

type TestSessionStatus = 'connecting' | 'ready' | 'exited' | 'error'

interface ITestSession {
  readonly id: string
  readonly title: string
  readonly status: TestSessionStatus
  readonly output: ReadonlyArray<string>
}

interface ITestLabels {
  readonly view: string
  readonly tabList: string
  readonly create: string
  readonly closeActive: (title: string) => string
  readonly restart: (title: string) => string
  readonly terminal: (title: string) => string
  readonly empty: string
  readonly status: Readonly<Record<TestSessionStatus, string>>
}

interface ITestViewProps {
  readonly sessions: ReadonlyArray<ITestSession>
  readonly activeSessionId: string | null
  readonly labels: ITestLabels
  readonly onSelectSession: (id: string) => void
  readonly onCreateSession?: () => void
  readonly onCloseSession?: (id: string) => void
  readonly onInput: (id: string, data: string) => void
  readonly onResize: (
    id: string,
    size: { readonly cols: number; readonly rows: number }
  ) => void
  readonly onRestartSession?: (id: string) => void
}

const labels: ITestLabels = {
  view: 'Exact terminal workspace',
  tabList: 'Exact terminal session tabs',
  create: 'Create an exact terminal',
  closeActive: title => `Close exact ${title}`,
  restart: title => `Restart exact ${title}`,
  terminal: title => `Interactive exact ${title}`,
  empty: 'There are exactly no terminal sessions.',
  status: {
    connecting: 'Precisely connecting',
    ready: 'Precisely ready',
    exited: 'Precisely exited',
    error: 'Precisely failed',
  },
}

const sessions: ReadonlyArray<ITestSession> = [
  {
    id: 'powershell-main',
    title: 'PowerShell',
    status: 'ready',
    output: ['PS> '],
  },
  {
    id: 'command-prompt',
    title: 'Command Prompt',
    status: 'connecting',
    output: ['Starting shell'],
  },
  {
    id: 'completed-build',
    title: 'Completed build',
    status: 'exited',
    output: ['Build complete'],
  },
]

function viewProps(overrides: Partial<ITestViewProps> = {}): ITestViewProps {
  return {
    sessions,
    activeSessionId: 'powershell-main',
    labels,
    onSelectSession: () => undefined,
    onInput: () => undefined,
    onResize: () => undefined,
    ...overrides,
  }
}

describe('Terminal interactive boundary', () => {
  it('stays read-only by default, preserves browser Tab, and exposes focus/write', async () => {
    const { Terminal } = await import('../../../src/ui/terminal')
    const terminalRef = React.createRef<InstanceType<typeof Terminal>>()
    const receivedData = new Array<string>()
    const receivedSizes = new Array<{
      readonly cols: number
      readonly rows: number
    }>()
    const view = render(
      <Terminal
        ref={terminalRef}
        accessibleName="Build output"
        className="test-terminal"
        terminalOutput="initial output"
        onData={data => receivedData.push(data)}
        onResize={size => receivedSizes.push(size)}
      />
    )

    assert.equal(xtermInstances.length, 1)
    const xterm = xtermInstances[0]
    assert.equal(xterm.options.disableStdin, true)
    assert.equal(xterm.dataListeners.size, 0)
    assert.equal(xterm.resizeListeners.size, 1)
    assert.deepEqual(xterm.writes, ['\x1b[?25l', 'initial output'])

    const host = view.container.querySelector<HTMLElement>('.test-terminal')
    assert.ok(host !== null)
    assert.equal(host.classList.contains('test-terminal'), true)
    assert.equal(xterm.openedElement, host)
    assert.ok(xterm.keyEventHandler !== null)
    assert.equal(
      xterm.keyEventHandler(new KeyboardEvent('keydown', { key: 'Tab' })),
      false
    )
    assert.equal(
      xterm.keyEventHandler(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })
      ),
      false
    )
    assert.equal(
      xterm.keyEventHandler(new KeyboardEvent('keydown', { key: 'Enter' })),
      true
    )

    xterm.emitData('must stay local')
    xterm.emitResize({ cols: 132, rows: 41 })
    assert.deepEqual(receivedData, [])
    assert.deepEqual(receivedSizes, [{ cols: 132, rows: 41 }])

    terminalRef.current?.write('later output')
    terminalRef.current?.focus()
    assert.deepEqual(xterm.writes, [
      '\x1b[?25l',
      'initial output',
      'later output',
    ])
    assert.equal(xterm.focusCalls, 1)

    view.unmount()
    assert.equal(xterm.resizeDisposeCalls, 1)
    assert.equal(xterm.dataDisposeCalls, 0)
    assert.equal(xterm.disposeCalls, 1)
  })

  it('forwards exact interactive payloads and disposes every subscription', async () => {
    const { Terminal } = await import('../../../src/ui/terminal')
    const receivedData = new Array<string>()
    const receivedSizes = new Array<{
      readonly cols: number
      readonly rows: number
    }>()
    let focusCalls = 0
    let blurCalls = 0
    const view = render(
      <Terminal
        mode="interactive"
        accessibleName="Interactive shell"
        onData={data => receivedData.push(data)}
        onResize={size => receivedSizes.push(size)}
        onFocus={() => focusCalls++}
        onBlur={() => blurCalls++}
      />
    )

    const xterm = xtermInstances[0]
    assert.ok(xterm !== undefined)
    assert.equal(xterm.options.disableStdin, false)
    assert.equal(xterm.dataListeners.size, 1)
    assert.equal(xterm.resizeListeners.size, 1)

    xterm.emitData('git status\r')
    xterm.emitResize({ cols: 101, rows: 37 })
    assert.deepEqual(receivedData, ['git status\r'])
    assert.deepEqual(receivedSizes, [{ cols: 101, rows: 37 }])

    const host = screen.getByLabelText('Interactive shell')
    fireEvent.focus(host)
    fireEvent.blur(host)
    assert.equal(focusCalls, 1)
    assert.equal(blurCalls, 1)

    view.unmount()
    assert.equal(xterm.dataDisposeCalls, 1)
    assert.equal(xterm.resizeDisposeCalls, 1)
    assert.equal(xterm.disposeCalls, 1)

    xterm.emitData('late input')
    xterm.emitResize({ cols: 80, rows: 24 })
    assert.deepEqual(receivedData, ['git status\r'])
    assert.deepEqual(receivedSizes, [{ cols: 101, rows: 37 }])
  })
})

describe('integrated terminal session descriptors', () => {
  it('accepts only exact bounded descriptors and returns a frozen clone', async () => {
    const {
      IntegratedTerminalSessionIdMaximumLength,
      IntegratedTerminalSessionTitleMaximumLength,
      createIntegratedTerminalSessionDescriptor,
      isIntegratedTerminalSessionDescriptor,
    } = await import(
      '../../../src/ui/integrated-terminal/integrated-terminal-view'
    )

    assert.equal(IntegratedTerminalSessionIdMaximumLength, 128)
    assert.equal(IntegratedTerminalSessionTitleMaximumLength, 256)

    const output = ['first', '\x1b[31mterminal content\x1b[0m']
    const value = {
      id: `a${'._:-0'.repeat(25)}xy`,
      title: '😀'.repeat(128),
      status: 'ready',
      output,
    }
    assert.equal(value.id.length, 128)
    assert.equal(value.title.length, 256)
    assert.equal(isIntegratedTerminalSessionDescriptor(value), true)

    const descriptor = createIntegratedTerminalSessionDescriptor(value)
    assert.deepEqual(descriptor, value)
    assert.notEqual(descriptor, value)
    assert.notEqual(descriptor.output, output)
    assert.equal(Object.isFrozen(descriptor), true)
    assert.equal(Object.isFrozen(descriptor.output), true)

    output.push('caller mutation')
    assert.deepEqual(descriptor.output, [
      'first',
      '\x1b[31mterminal content\x1b[0m',
    ])
  })

  it('rejects hostile, extra, unsafe, and malformed descriptor values', async () => {
    const {
      createIntegratedTerminalSessionDescriptor,
      isIntegratedTerminalSessionDescriptor,
    } = await import(
      '../../../src/ui/integrated-terminal/integrated-terminal-view'
    )
    const valid = {
      id: 'safe.id:1_test-value',
      title: 'Safe title',
      status: 'connecting',
      output: ['content'],
    }
    const hostile = new Proxy<Record<string, unknown>>(
      {},
      {
        ownKeys: () => {
          throw new Error('hostile ownKeys')
        },
      }
    )
    const invalid = [
      null,
      [],
      hostile,
      { ...valid, extra: true },
      { ...valid, id: '' },
      { ...valid, id: '_leading' },
      { ...valid, id: 'space is unsafe' },
      { ...valid, id: 'slash/is/unsafe' },
      { ...valid, id: 'a'.repeat(129) },
      { ...valid, title: '' },
      { ...valid, title: ' padded' },
      { ...valid, title: 'padded ' },
      { ...valid, title: 'control\u0000title' },
      { ...valid, title: 'control\u0085title' },
      { ...valid, title: `${'😀'.repeat(128)}a` },
      { ...valid, status: 'running' },
      { ...valid, output: 'not-an-array' },
      { ...valid, output: ['valid', 2] },
      { ...valid, output: new Array<string>(1) },
    ]

    for (const value of invalid) {
      assert.doesNotThrow(() => isIntegratedTerminalSessionDescriptor(value))
      assert.equal(isIntegratedTerminalSessionDescriptor(value), false)
    }

    const changingOutput = () => {
      const output = new Array<unknown>(1)
      let reads = 0
      Object.defineProperty(output, 0, {
        configurable: true,
        enumerable: true,
        get: () => (++reads === 1 ? 'first read' : 2),
      })
      return { output, reads: () => reads }
    }
    const changing = changingOutput()
    const clonedOnce = createIntegratedTerminalSessionDescriptor({
      ...valid,
      output: changing.output,
    })
    assert.deepEqual(clonedOnce.output, ['first read'])
    assert.equal(changing.reads(), 1)
    assert.equal(Object.isFrozen(clonedOnce.output), true)
    assert.throws(
      () =>
        createIntegratedTerminalSessionDescriptor({
          ...valid,
          output: new Array<string>(1),
        }),
      TypeError
    )

    assert.throws(
      () =>
        createIntegratedTerminalSessionDescriptor({
          ...valid,
          status: 'running',
        }),
      TypeError
    )
    assert.throws(
      () =>
        createIntegratedTerminalSessionDescriptor({
          ...valid,
          id: 'a'.repeat(129),
        }),
      RangeError
    )
    assert.throws(
      () =>
        createIntegratedTerminalSessionDescriptor({
          ...valid,
          title: ' padded',
        }),
      RangeError
    )
  })

  it('validates every runtime descriptor and rejects duplicate canonical ids', async () => {
    const { IntegratedTerminalView } = await import(
      '../../../src/ui/integrated-terminal/integrated-terminal-view'
    )
    const originalConsoleError = console.error
    console.error = () => undefined

    try {
      assert.throws(
        () =>
          render(
            <IntegratedTerminalView
              {...viewProps({
                sessions: [{ ...sessions[0], id: 'unsafe duplicate bait' }],
              })}
            />
          ),
        TypeError
      )
      assert.throws(
        () =>
          render(
            <IntegratedTerminalView
              {...viewProps({
                sessions: [sessions[0], { ...sessions[0] }],
              })}
            />
          ),
        TypeError
      )
    } finally {
      console.error = originalConsoleError
    }
  })
})

describe('IntegratedTerminalView behavior', () => {
  it('owns only tabs in the tablist and keeps actions as named siblings', async () => {
    const { IntegratedTerminalView } = await import(
      '../../../src/ui/integrated-terminal/integrated-terminal-view'
    )
    const selected = new Array<string>()
    const closed = new Array<string>()
    const createPayloads = new Array<ReadonlyArray<unknown>>()
    const props = viewProps({
      onSelectSession: id => selected.push(id),
      onCreateSession: (...args: ReadonlyArray<unknown>) =>
        createPayloads.push(args),
      onCloseSession: id => closed.push(id),
    })

    render(
      <div>
        <IntegratedTerminalView {...props} />
        <IntegratedTerminalView {...props} />
      </div>
    )

    const workspaces = screen.getAllByRole('region', { name: labels.view })
    assert.equal(workspaces.length, 2)
    const tabIds = new Set<string>()
    const panelIds = new Set<string>()

    for (const workspace of workspaces) {
      const tablist = within(workspace).getByRole('tablist', {
        name: labels.tabList,
      })
      const tabs = within(tablist).getAllByRole('tab')
      assert.equal(tabs.length, sessions.length)
      assert.equal(tablist.children.length, tabs.length)
      for (const child of Array.from(tablist.children)) {
        assert.equal(child.getAttribute('role'), 'tab')
        assert.equal(child.querySelector('button'), null)
      }

      const activeTab = within(tablist).getByRole('tab', {
        name: /PowerShell/,
      })
      const panel = within(workspace).getByRole('tabpanel')
      const create = within(workspace).getByRole('button', {
        name: labels.create,
      })
      const close = within(workspace).getByRole('button', {
        name: labels.closeActive('PowerShell'),
      })

      assert.equal(tablist.contains(create), false)
      assert.equal(tablist.contains(close), false)
      assert.equal(create.parentElement, close.parentElement)
      assert.equal(activeTab.getAttribute('aria-controls'), panel.id)
      assert.equal(panel.getAttribute('aria-labelledby'), activeTab.id)
      assert.equal(activeTab.getAttribute('aria-selected'), 'true')
      assert.equal(activeTab.tabIndex, 0)
      assert.equal(
        within(activeTab)
          .getByText(labels.status.ready)
          .getAttribute('data-status'),
        'ready'
      )
      assert.ok(
        within(panel).getByRole('region', {
          name: labels.terminal('PowerShell'),
        })
      )
      assert.equal(
        panel.querySelector('.integrated-terminal-view__status-overlay'),
        null
      )

      tabIds.add(activeTab.id)
      panelIds.add(panel.id)
    }

    assert.equal(tabIds.size, 2, 'tab ids are unique across view instances')
    assert.equal(panelIds.size, 2, 'panel ids are unique across view instances')

    const first = workspaces[0]
    fireEvent.click(within(first).getByRole('tab', { name: /Command Prompt/ }))
    fireEvent.click(
      within(first).getByRole('button', {
        name: labels.closeActive('PowerShell'),
      })
    )
    fireEvent.click(within(first).getByRole('button', { name: labels.create }))
    assert.deepEqual(selected, ['command-prompt'])
    assert.deepEqual(closed, ['powershell-main'])
    assert.deepEqual(createPayloads, [[]])
  })

  it('switches with roving Arrow, Home, and End keys without trapping Tab', async () => {
    const { IntegratedTerminalView } = await import(
      '../../../src/ui/integrated-terminal/integrated-terminal-view'
    )
    const selected = new Array<string>()
    render(
      <IntegratedTerminalView
        {...viewProps({ onSelectSession: id => selected.push(id) })}
      />
    )

    const powershell = screen.getByRole('tab', { name: /PowerShell/ })
    const commandPrompt = screen.getByRole('tab', { name: /Command Prompt/ })
    const completed = screen.getByRole('tab', { name: /Completed build/ })
    powershell.focus()

    fireEvent.keyDown(powershell, { key: 'ArrowRight' })
    assert.equal(document.activeElement, commandPrompt)
    fireEvent.keyDown(commandPrompt, { key: 'ArrowLeft' })
    assert.equal(document.activeElement, powershell)
    fireEvent.keyDown(powershell, { key: 'End' })
    assert.equal(document.activeElement, completed)
    fireEvent.keyDown(completed, { key: 'Home' })
    assert.equal(document.activeElement, powershell)
    fireEvent.keyDown(powershell, { key: 'ArrowLeft' })
    assert.equal(document.activeElement, completed)
    assert.equal(fireEvent.keyDown(completed, { key: 'Tab' }), true)

    assert.deepEqual(selected, [
      'command-prompt',
      'powershell-main',
      'completed-build',
      'powershell-main',
      'completed-build',
    ])
  })

  it('forwards input only for active ready sessions and resize only for active sessions', async () => {
    const { IntegratedTerminalView } = await import(
      '../../../src/ui/integrated-terminal/integrated-terminal-view'
    )
    const inputs = new Array<readonly [string, string]>()
    const sizes = new Array<
      readonly [string, { readonly cols: number; readonly rows: number }]
    >()
    const props = viewProps({
      onInput: (id, data) => inputs.push([id, data]),
      onResize: (id, size) => sizes.push([id, { ...size }]),
    })
    const view = render(<IntegratedTerminalView {...props} />)

    const powershell = xtermInstances[0]
    assert.ok(powershell !== undefined)
    const latePowershellData = [...powershell.dataListeners][0]
    const latePowershellResize = [...powershell.resizeListeners][0]
    assert.ok(latePowershellData !== undefined)
    assert.ok(latePowershellResize !== undefined)
    powershell.emitData('Get-Status\r')
    powershell.emitResize({ cols: 121, rows: 42 })
    assert.deepEqual(inputs, [['powershell-main', 'Get-Status\r']])
    assert.deepEqual(sizes, [['powershell-main', { cols: 121, rows: 42 }]])

    view.rerender(
      <IntegratedTerminalView {...props} activeSessionId="command-prompt" />
    )
    assert.equal(powershell.disposeCalls, 1)
    const connecting = xtermInstances[1]
    assert.ok(connecting !== undefined)

    powershell.emitData('late inactive input')
    powershell.emitResize({ cols: 1, rows: 1 })
    connecting.emitData('input while connecting')
    connecting.emitResize({ cols: 88, rows: 28 })
    assert.deepEqual(inputs, [['powershell-main', 'Get-Status\r']])
    assert.deepEqual(sizes, [
      ['powershell-main', { cols: 121, rows: 42 }],
      ['command-prompt', { cols: 88, rows: 28 }],
    ])

    const readySessions = sessions.map(session =>
      session.id === 'command-prompt'
        ? { ...session, status: 'ready' as const }
        : session
    )
    view.rerender(
      <IntegratedTerminalView
        {...props}
        sessions={readySessions}
        activeSessionId="command-prompt"
      />
    )
    latePowershellData('queued stale input')
    latePowershellResize({ cols: 199, rows: 99 })
    assert.deepEqual(inputs, [['powershell-main', 'Get-Status\r']])
    assert.deepEqual(sizes, [
      ['powershell-main', { cols: 121, rows: 42 }],
      ['command-prompt', { cols: 88, rows: 28 }],
    ])

    connecting.emitData('echo ready\r')
    assert.deepEqual(inputs, [
      ['powershell-main', 'Get-Status\r'],
      ['command-prompt', 'echo ready\r'],
    ])
  })

  it('shows truthful status overlays and retries only available failed sessions', async () => {
    const { IntegratedTerminalView } = await import(
      '../../../src/ui/integrated-terminal/integrated-terminal-view'
    )
    const restarted = new Array<string>()
    const oneSession = (
      status: TestSessionStatus
    ): ReadonlyArray<ITestSession> => [
      {
        id: 'status-shell',
        title: 'Status shell',
        status,
        output: [`${status} output`],
      },
    ]
    const props = viewProps({
      sessions: oneSession('connecting'),
      activeSessionId: 'status-shell',
      onRestartSession: id => restarted.push(id),
    })
    const view = render(<IntegratedTerminalView {...props} />)

    const connectingPanel = screen.getByRole('tabpanel')
    const connectingOverlay = connectingPanel.querySelector<HTMLElement>(
      '.integrated-terminal-view__status-overlay'
    )
    assert.ok(connectingOverlay !== null)
    assert.equal(connectingOverlay.getAttribute('data-status'), 'connecting')
    assert.ok(within(connectingOverlay).getByText(labels.status.connecting))
    assert.equal(
      screen.queryByRole('button', {
        name: labels.restart('Status shell'),
      }),
      null
    )

    view.rerender(
      <IntegratedTerminalView {...props} sessions={oneSession('exited')} />
    )
    const exitedOverlay = document.querySelector<HTMLElement>(
      '.integrated-terminal-view__status-overlay'
    )
    assert.ok(exitedOverlay !== null)
    assert.equal(exitedOverlay.getAttribute('data-status'), 'exited')
    assert.ok(within(exitedOverlay).getByText(labels.status.exited))
    fireEvent.click(
      screen.getByRole('button', {
        name: labels.restart('Status shell'),
      })
    )
    assert.deepEqual(restarted, ['status-shell'])

    view.rerender(
      <IntegratedTerminalView {...props} sessions={oneSession('error')} />
    )
    const errorOverlay = document.querySelector<HTMLElement>(
      '.integrated-terminal-view__status-overlay'
    )
    assert.ok(errorOverlay !== null)
    assert.equal(errorOverlay.getAttribute('data-status'), 'error')
    assert.ok(within(errorOverlay).getByText(labels.status.error))
    fireEvent.click(
      screen.getByRole('button', {
        name: labels.restart('Status shell'),
      })
    )
    assert.deepEqual(restarted, ['status-shell', 'status-shell'])

    view.rerender(
      <IntegratedTerminalView
        {...viewProps({
          sessions: oneSession('error'),
          activeSessionId: 'status-shell',
        })}
      />
    )
    assert.equal(
      screen.queryByRole('button', {
        name: labels.restart('Status shell'),
      }),
      null
    )
  })

  it('uses the supplied empty copy and omits unavailable or unowned actions', async () => {
    const { IntegratedTerminalView } = await import(
      '../../../src/ui/integrated-terminal/integrated-terminal-view'
    )
    const view = render(
      <IntegratedTerminalView
        {...viewProps({ sessions: [], activeSessionId: null })}
      />
    )

    assert.ok(screen.getByText(labels.empty))
    assert.equal(screen.queryByRole('tablist'), null)
    assert.equal(screen.queryByRole('button'), null)

    view.rerender(
      <IntegratedTerminalView
        {...viewProps({
          activeSessionId: 'not-owned-by-this-view',
          onCreateSession: () => undefined,
          onCloseSession: () =>
            assert.fail('must not close an unknown session'),
        })}
      />
    )
    assert.ok(screen.getByRole('button', { name: labels.create }))
    assert.equal(screen.queryByRole('button', { name: /Close exact/ }), null)
    assert.equal(screen.queryByRole('tabpanel'), null)
    const unselectedTabs = screen.getAllByRole('tab')
    assert.equal(unselectedTabs[0].tabIndex, 0)
    for (const tab of unselectedTabs) {
      assert.equal(tab.getAttribute('aria-selected'), 'false')
    }
    for (const tab of unselectedTabs.slice(1)) {
      assert.equal(tab.tabIndex, -1)
    }

    const createPayloads = new Array<ReadonlyArray<unknown>>()
    view.rerender(
      <IntegratedTerminalView
        {...viewProps({
          sessions: [],
          activeSessionId: null,
          onCreateSession: (...args: ReadonlyArray<unknown>) =>
            createPayloads.push(args),
        })}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: labels.create }))
    assert.deepEqual(createPayloads, [[]])
  })
})

describe('IntegratedTerminalView static boundaries', () => {
  it('keeps the renderer isolated from process and filesystem modules', async () => {
    const sources = await Promise.all(
      [
        join(process.cwd(), 'app', 'src', 'ui', 'terminal.tsx'),
        join(
          process.cwd(),
          'app',
          'src',
          'ui',
          'integrated-terminal',
          'integrated-terminal-view.tsx'
        ),
      ].map(path => readFile(path, 'utf8'))
    )
    const forbiddenImport =
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"](?:node:)?(?:process|fs(?:\/promises)?|child_process)['"]/

    for (const source of sources) {
      assert.doesNotMatch(source, forbiddenImport)
    }
  })

  it('bounds long and narrow layouts without weakening focus or motion preferences', async () => {
    const styles = await readFile(
      join(process.cwd(), 'app', 'styles', 'ui', '_integrated-terminal.scss'),
      'utf8'
    )
    const suffixes = [
      'tab-strip',
      'tablist',
      'tab',
      'tab-title',
      'tab-status',
      'tab-actions',
      'action',
      'panels',
      'panel',
      'terminal',
      'status-overlay',
      'status',
      'restart',
      'empty',
    ]

    assert.match(styles, /\.integrated-terminal-view\s*\{/)
    assert.match(
      styles,
      /\.integrated-terminal-view\s*\{[\s\S]*?max-block-size:\s*min\([^;]+100dvh[^;]+\);[\s\S]*?min-width:\s*0;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/
    )
    for (const suffix of suffixes) {
      assert.match(styles, new RegExp(`&__${suffix}\\s*\\{`))
    }

    assert.match(
      styles,
      /&__tablist\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-x:\s*auto;/
    )
    assert.match(
      styles,
      /&__tab-title\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    )
    assert.match(
      styles,
      /&__action\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/
    )
    for (const status of ['connecting', 'ready', 'exited', 'error']) {
      assert.match(styles, new RegExp(`\\[data-status=['"]${status}['"]\\]`))
    }
    for (const suffix of ['panels', 'panel', 'terminal']) {
      assert.match(
        styles,
        new RegExp(
          `&__${suffix}\\s*\\{[\\s\\S]*?min-width:\\s*0;[\\s\\S]*?min-height:\\s*0;[\\s\\S]*?overflow:\\s*(?:hidden|auto);`
        )
      )
    }
    assert.match(styles, /&__tab[\s\S]*?&:focus-visible\s*\{/)
    assert.match(styles, /&__action[\s\S]*?&:focus-visible\s*\{/)
    assert.match(styles, /&__terminal[\s\S]*?&:focus-within\s*\{/)
    assert.match(
      styles,
      /&__terminal:has\(~ &__status-overlay\)\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/
    )
    assert.match(styles, /&__restart[\s\S]*?&:focus-visible\s*\{/)
    const overlayStart = styles.indexOf('&__status-overlay')
    const overlayEnd = styles.indexOf('&__status {', overlayStart)
    assert.notEqual(overlayStart, -1)
    assert.notEqual(overlayEnd, -1)
    assert.doesNotMatch(styles.slice(overlayStart, overlayEnd), /transparent/)
    assert.match(styles, /@media \(max-width:\s*600px\)/)
    assert.match(styles, /@media \(forced-colors:\s*active\)/)
    assert.match(
      styles,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none !important;[\s\S]*?transition:\s*none !important;/
    )
  })
})
