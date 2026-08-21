import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'

import {
  AgentSessionsPanel,
  IAgentSessionsPanelProps,
} from '../../src/ui/agent-sessions/agent-sessions-panel'
import { CodingAgentPicker } from '../../src/ui/agent-sessions/coding-agent-picker'
import {
  IAgentSession,
  INewAgentSessionRequest,
} from '../../src/models/agent-session'
import { fireEvent, render, within } from '../helpers/ui/render'
import { LanguageModeChangedEvent } from '../../src/lib/i18n'
import { LocalStatusHubFallback } from '../../src/models/status-hub'
import {
  appendAgentSessionConversationLog,
  beginAgentSessionConversation,
  clearAgentSessionConversations,
  finishAgentSessionConversation,
} from '../../src/ui/agent-sessions/agent-session-conversation'

// Dialog sends a renderer lifecycle event in the real app. Keep this focused
// component suite independent of Electron's main process while still mounting
// the production Dialog implementation.
ipcRenderer.send = () => undefined

// The panel's own controls do not mount the shared List, but the Select and
// TextBox it uses share the UI setup that constructs an observer from
// `window.ResizeObserver` while the shared setup only polyfills the global.
if (typeof window !== 'undefined') {
  Object.assign(window, { ResizeObserver: globalThis.ResizeObserver })
}

// jsdom does not implement the native dialog opening methods. Mark the
// element open so Testing Library exercises the same visible subtree the
// Chromium app presents.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.show = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
}

/**
 * Compare two DOM nodes by identity without letting a failure explode.
 *
 * `assert.strictEqual` builds its failure message by deep-inspecting both
 * operands, and a jsdom element drags in its parent chain, its document and its
 * window. When a focus assertion in this file failed, generating that message
 * allocated for over three minutes before dying with `RangeError: Array buffer
 * allocation failed` — an error that mentions neither focus nor the test, and
 * that masked the real assertion underneath it. `assert.ok` on a `===` check
 * reports the same fact in milliseconds.
 */
function assertSameNode(actual: unknown, expected: unknown, message?: string) {
  assert.ok(actual === expected, message ?? 'expected the same DOM node')
}

const bothInstalled = {
  codexInstalled: true,
  codexAuthenticated: true,
  opencodeInstalled: true,
  opencodeAuthenticated: true,
}

const setupProps: Pick<
  IAgentSessionsPanelProps,
  | 'setupCommands'
  | 'setupCommandsAvailable'
  | 'onSaveSetupCommands'
  | 'canCancelCreate'
  | 'onCancelCreate'
  | 'retryableSetups'
  | 'statusHubStatus'
> = {
  setupCommands: [],
  setupCommandsAvailable: true,
  onSaveSetupCommands: () => true,
  canCancelCreate: false,
  onCancelCreate: () => undefined,
  retryableSetups: [],
  statusHubStatus: LocalStatusHubFallback,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => {
    resolve = resolver
  })
  return { promise, resolve }
}

function session(overrides: Partial<IAgentSession> = {}): IAgentSession {
  return {
    path: `C:\\work\\${overrides.name ?? 'session'}`,
    name: 'session',
    branch: 'session',
    head: '0123456789abcdef',
    isMainWorktree: false,
    isLocked: false,
    isMissing: false,
    agent: 'none',
    runState: 'idle',
    errorMessage: null,
    diffStat: null,
    editedFileCount: null,
    lastActivityAt: null,
    ...overrides,
  }
}

function renderPanel(
  sessions: ReadonlyArray<IAgentSession>,
  onCreateSession: IAgentSessionsPanelProps['onCreateSession'] = () => true,
  setupOverrides: Partial<IAgentSessionsPanelProps> = {}
) {
  return render(
    <AgentSessionsPanel
      {...setupProps}
      sessions={sessions}
      availability={bothInstalled}
      baseBranches={['main', 'release']}
      defaultBaseBranch="main"
      existingBranchNames={['main', 'release']}
      selectedPath={null}
      onSelectSession={() => undefined}
      onCreateSession={onCreateSession}
      isCreating={false}
      {...setupOverrides}
    />
  )
}

describe('AgentSessionsPanel fleet', () => {
  it('pairs the fleet with the selected session real runner transcript', () => {
    const selected = session({ name: 'feature-x', agent: 'codex' })
    beginAgentSessionConversation({
      operationId: 'agent-feature-x',
      worktreePath: selected.path,
      agent: 'codex',
      prompt: 'Implement the repository navigation.',
    })
    appendAgentSessionConversationLog({
      operationId: 'agent-feature-x',
      stream: 'stdout',
      text: 'Repository navigation implemented.',
    })
    finishAgentSessionConversation('agent-feature-x', 'exited')

    const view = renderPanel([selected], () => true, {
      selectedPath: selected.path,
    })
    const conversation = view.getByRole('region', { name: 'feature-x' })
    const log = within(conversation).getByRole('log')

    assert.ok(within(log).getByText('Implement the repository navigation.'))
    assert.ok(within(log).getByText('Repository navigation implemented.'))
    assert.ok(
      within(conversation).queryByRole('textbox') === null,
      'the transcript must not expose a follow-up textbox'
    )
    clearAgentSessionConversations()
  })

  it('renders one card per worktree under a counted Worktrees header', () => {
    const view = renderPanel([
      session({ name: 'root', isMainWorktree: true }),
      session({ name: 'feature-x' }),
      session({ name: 'feature-y' }),
    ])

    const heading = view.getByRole('heading', { name: /Worktrees/ })
    assert.ok(heading.textContent?.includes('3'), heading.textContent ?? '')

    const list = view.getByRole('list', { name: 'Worktrees' })
    assert.strictEqual(within(list).getAllByRole('button').length, 3)
  })

  it('gives each card a chip whose meaning is in its accessible name', () => {
    const view = renderPanel([
      session({
        name: 'changed',
        diffStat: { filesChanged: 2, linesAdded: 97, linesDeleted: 0 },
      }),
      session({ name: 'broken', runState: 'error', errorMessage: 'boom' }),
      session({ name: 'busy', runState: 'running', editedFileCount: 91 }),
    ])

    // The terse label is what a sighted user reads…
    assert.ok(view.getByText('+97'))
    assert.ok(view.getByText('Error'))
    assert.ok(view.getByText('91'))

    // …while the status reaches assistive technology as words, never colour.
    assert.ok(
      view.getByRole('button', { name: /broken failed: boom/ }),
      'the error card must announce why it failed'
    )
    assert.ok(
      view.getByRole('button', { name: /busy is working, 91 files edited/ })
    )
    assert.ok(
      view.getByRole('button', {
        name: /changed has 97 lines added and 0 lines deleted across 2 files/,
      })
    )
  })

  it('orders the fleet so the sessions wanting attention come first', () => {
    const view = renderPanel([
      session({ name: 'quiet' }),
      session({ name: 'busy', runState: 'running' }),
      session({ name: 'root', isMainWorktree: true }),
      session({ name: 'broken', runState: 'error' }),
    ])

    const list = view.getByRole('list', { name: 'Worktrees' })
    const names = within(list)
      .getAllByRole('button')
      .filter(button => button.classList.contains('agent-session-card'))
      .map(
        button => button.querySelector('.agent-session-card-name')?.textContent
      )

    assert.deepStrictEqual(names, ['root', 'broken', 'busy', 'quiet'])
  })

  it('keeps the fleet to a single tab stop and moves focus with the arrows', () => {
    const view = renderPanel([
      session({ name: 'root', isMainWorktree: true }),
      session({ name: 'feature-x' }),
    ])

    const list = view.getByRole('list', { name: 'Worktrees' })
    const [first, second] = within(list).getAllByRole('button')
    assert.strictEqual(first.getAttribute('tabindex'), '0')
    assert.strictEqual(second.getAttribute('tabindex'), '-1')

    fireEvent.keyDown(first, { key: 'ArrowDown' })
    assert.strictEqual(second.getAttribute('tabindex'), '0')
    assert.strictEqual(first.getAttribute('tabindex'), '-1')
    assertSameNode(document.activeElement, second)
  })

  it('reports the selected session rather than acting on its own', () => {
    const picked: Array<string> = []
    const view = render(
      <AgentSessionsPanel
        {...setupProps}
        sessions={[session({ name: 'feature-x' })]}
        availability={bothInstalled}
        baseBranches={['main']}
        defaultBaseBranch="main"
        existingBranchNames={['main']}
        selectedPath={null}
        onSelectSession={s => picked.push(s.name)}
        onCreateSession={() => true}
        isCreating={false}
      />
    )

    fireEvent.click(view.getByRole('button', { name: /feature-x/ }))
    assert.deepStrictEqual(picked, ['feature-x'])
  })

  it('exposes selection with aria-current and makes missing worktrees unavailable', () => {
    const picked: Array<string> = []
    const missing = session({
      name: 'missing',
      isMainWorktree: true,
      isMissing: true,
    })
    const available = session({ name: 'available' })
    const view = render(
      <AgentSessionsPanel
        {...setupProps}
        sessions={[missing, available]}
        availability={bothInstalled}
        baseBranches={['main']}
        defaultBaseBranch="main"
        existingBranchNames={['main']}
        selectedPath="c:/WORK/AVAILABLE/"
        onSelectSession={selected => picked.push(selected.name)}
        onCreateSession={() => true}
        isCreating={false}
      />
    )

    const missingButton = view.getByRole('button', { name: /missing/i })
    const availableButton = view.getByRole('button', { name: /available/i })
    assert.strictEqual((missingButton as HTMLButtonElement).disabled, true)
    assert.strictEqual(missingButton.getAttribute('tabindex'), '-1')
    assert.strictEqual(missingButton.getAttribute('aria-current'), null)
    assert.strictEqual(availableButton.getAttribute('tabindex'), '0')
    assert.strictEqual(availableButton.getAttribute('aria-current'), 'true')

    fireEvent.click(missingButton)
    assert.deepStrictEqual(picked, [])
  })

  it('skips missing worktrees during roving keyboard navigation', () => {
    const view = renderPanel([
      session({ name: 'a-available' }),
      session({ name: 'b-missing', isMissing: true }),
      session({ name: 'c-available' }),
    ])
    const first = view.getByRole('button', { name: /a-available/i })
    const missing = view.getByRole('button', { name: /b-missing/i })
    const last = view.getByRole('button', { name: /c-available/i })

    fireEvent.keyDown(first, { key: 'ArrowDown' })
    assertSameNode(document.activeElement, last)
    assert.strictEqual(last.getAttribute('tabindex'), '0')
    assert.strictEqual(missing.getAttribute('tabindex'), '-1')
  })

  it('renders Stop as a named sibling control and reports its exact session', () => {
    const cancelled: Array<string> = []
    const busy = session({ name: 'busy', runState: 'running' })
    const view = render(
      <AgentSessionsPanel
        {...setupProps}
        sessions={[busy]}
        availability={bothInstalled}
        baseBranches={['main']}
        defaultBaseBranch="main"
        existingBranchNames={['main']}
        selectedPath={busy.path}
        onSelectSession={() => undefined}
        onCancelSession={selected => cancelled.push(selected.path)}
        onCreateSession={() => true}
        isCreating={false}
      />
    )

    const card = view.getByRole('button', { name: /busy is working/i })
    const stop = view.getByRole('button', { name: /Stop — busy/i })
    assert.strictEqual(card.contains(stop), false)
    assertSameNode(
      card.parentElement,
      stop.parentElement,
      'the Stop control must be a sibling of the session card'
    )

    fireEvent.click(stop)
    assert.deepStrictEqual(cancelled, [busy.path])
  })

  it('says the fleet is empty instead of rendering a bare list', () => {
    const view = renderPanel([])

    assert.ok(view.getByText(/No worktrees yet/))
    assert.ok(
      view.queryByRole('list', { name: 'Worktrees' }) === null,
      'the fleet list should be absent'
    )
  })
})

describe('AgentSessionsPanel creator', () => {
  function openCreator(view: ReturnType<typeof renderPanel>) {
    fireEvent.click(view.getByRole('button', { name: /New Agent Session/ }))
  }

  it('keeps Start disabled until the name is legal and unused', () => {
    const view = renderPanel([session({ name: 'feature-x' })])
    openCreator(view)

    const dialog = view.getByRole('dialog', { name: 'New Agent Session' })
    assert.strictEqual(dialog.querySelectorAll('form').length, 1)
    assert.strictEqual(
      dialog.querySelector('.new-agent-session-form')?.tagName,
      'DIV'
    )
    assert.strictEqual(dialog.getAttribute('data-modal'), 'true')

    const start = view.getByRole('button', { name: 'Start' })
    const name = view.getByLabelText('Worktree name')
    assert.strictEqual(start.getAttribute('aria-disabled'), 'true')

    fireEvent.change(name, { target: { value: 'has a space' } })
    assert.strictEqual(start.getAttribute('aria-disabled'), 'true')
    assert.ok(view.getByText(/Git will not accept this name/))

    fireEvent.change(name, { target: { value: 'feature-x' } })
    assert.strictEqual(start.getAttribute('aria-disabled'), 'true')
    assert.ok(view.getByText(/A worktree named feature-x already exists/))

    fireEvent.change(name, { target: { value: 'feature-z' } })
    assert.strictEqual(start.getAttribute('aria-disabled'), null)
  })

  it('does nothing when a disabled Start is clicked anyway', () => {
    // Start is a submit button, so a `disabled` that only sets `aria-disabled`
    // would still submit the form on click.
    const requests: Array<INewAgentSessionRequest> = []
    const view = renderPanel([], request => {
      requests.push(request)
      return true
    })
    openCreator(view)

    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    assert.deepStrictEqual(requests, [])
  })

  it('hands the caller the request and a detached reviewed setup snapshot', () => {
    const requests: Array<INewAgentSessionRequest> = []
    const configured: IAgentSessionsPanelProps['setupCommands'] = [
      {
        enabled: true,
        executable: 'node' as const,
        args: ['scripts/setup.js'],
      },
    ]
    const snapshots = new Array<typeof configured>()
    const restartModes = new Array<boolean>()
    const view = renderPanel(
      [],
      (request, setupCommands, restartSetup) => {
        requests.push(request)
        snapshots.push(setupCommands)
        restartModes.push(restartSetup)
        return true
      },
      {
        setupCommands: configured,
      }
    )
    openCreator(view)

    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-z' },
    })
    fireEvent.click(view.getByRole('button', { name: /^Options$/ }))
    fireEvent.change(view.getByLabelText('Base branch'), {
      target: { value: 'release' },
    })
    fireEvent.click(view.getByRole('button', { name: 'Start' }))

    assert.deepStrictEqual(requests, [
      {
        name: 'feature-z',
        baseBranch: 'release',
        agent: 'none',
        prompt: '',
      },
    ])
    assert.deepStrictEqual(snapshots, [configured])
    assert.notStrictEqual(snapshots[0], configured)
    assert.notStrictEqual(snapshots[0][0], configured[0])
    assert.notStrictEqual(snapshots[0][0].args, configured[0].args)
    assert.deepStrictEqual(restartModes, [false])
  })

  it('keeps the form and its values when creation is rejected', async () => {
    const result = deferred<boolean>()
    const view = renderPanel([], () => result.promise)
    openCreator(view)
    const name = view.getByLabelText('Worktree name') as HTMLInputElement
    fireEvent.change(name, { target: { value: 'feature-z' } })
    fireEvent.click(view.getByRole('button', { name: 'Start' }))

    assert.strictEqual(name.value, 'feature-z')
    assert.strictEqual(
      view
        .getByRole('button', { name: 'Cancel setup' })
        .getAttribute('aria-disabled'),
      'true'
    )
    assert.strictEqual(
      view.getByRole('button', { name: /^Options$/ }).getAttribute('disabled'),
      ''
    )

    result.resolve(false)
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.strictEqual(
      view
        .getByRole('button', { name: 'Cancel' })
        .getAttribute('aria-disabled'),
      null
    )
    assert.strictEqual(
      (view.getByLabelText('Worktree name') as HTMLInputElement).value,
      'feature-z'
    )
  })

  it('closes only after acceptance and restores focus to New Agent Session', async () => {
    const result = deferred<boolean>()
    const view = renderPanel([], () => result.promise)
    const trigger = view.getByRole('button', { name: /New Agent Session/ })
    fireEvent.click(trigger)
    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-z' },
    })
    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    assert.ok(view.getByLabelText('Worktree name'))

    result.resolve(true)
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(
      view.queryByLabelText('Worktree name') === null,
      'the creator must close after acceptance'
    )
    assertSameNode(document.activeElement, trigger)
  })

  it('refuses to start a real agent with nothing to do', () => {
    const view = renderPanel([])
    openCreator(view)

    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-z' },
    })
    fireEvent.click(view.getByRole('button', { name: /^Options$/ }))
    fireEvent.change(view.getByLabelText('Coding agent'), {
      target: { value: 'codex' },
    })

    const start = view.getByRole('button', { name: 'Start' })
    assert.strictEqual(start.getAttribute('aria-disabled'), 'true')
    assert.ok(view.getByText(/Describe the task for the agent/))

    fireEvent.change(view.getByLabelText('Task for the agent'), {
      target: { value: 'fix the build' },
    })
    assert.strictEqual(start.getAttribute('aria-disabled'), null)
  })

  it('collapses its options until the user asks for them', () => {
    const view = renderPanel([])
    openCreator(view)

    const toggle = view.getByRole('button', { name: /^Options$/ })
    assert.strictEqual(toggle.getAttribute('aria-expanded'), 'false')
    const panel = document.getElementById('new-agent-session-options-panel')!
    assert.strictEqual(panel.hasAttribute('hidden'), true)

    fireEvent.click(toggle)
    assert.strictEqual(toggle.getAttribute('aria-expanded'), 'true')
    assert.strictEqual(panel.hasAttribute('hidden'), false)
  })

  it('opens a real setup editor and restores focus after Escape', () => {
    const view = renderPanel([])
    openCreator(view)
    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-setup' },
    })
    const start = view.getByRole('button', { name: 'Start' })
    assert.strictEqual(start.getAttribute('aria-disabled'), null)
    fireEvent.click(view.getByRole('button', { name: /^Options$/ }))

    const configure = view.getByRole('button', {
      name: /Configure setup commands No setup commands configured/,
    })
    assert.strictEqual(configure.getAttribute('aria-disabled'), null)
    fireEvent.click(configure)
    assert.strictEqual(start.getAttribute('aria-disabled'), 'true')

    const editor = view.getByRole('dialog', { name: 'Setup commands' })
    assert.strictEqual(editor.getAttribute('aria-modal'), 'false')
    assert.strictEqual(
      document.activeElement,
      within(editor).getByRole('button', { name: /Add command/ })
    )

    fireEvent.keyDown(editor, { key: 'Escape' })
    assert.ok(
      view.queryByRole('dialog', { name: 'Setup commands' }) === null,
      'the dialog should be closed'
    )
    assertSameNode(document.activeElement, configure)
    assert.strictEqual(start.getAttribute('aria-disabled'), null)
  })

  it('switches the setup editor live through English, Cantonese, and bilingual modes', () => {
    const previousLanguageMode = localStorage.getItem('language-mode-v1')
    localStorage.setItem('language-mode-v1', 'english')
    const view = renderPanel([])

    try {
      openCreator(view)
      fireEvent.click(view.getByRole('button', { name: /^Options$/ }))
      assert.ok(
        view.getByText(
          '<None> runs configured setup commands but starts no coding agent.'
        )
      )
      fireEvent.click(
        view.getByRole('button', { name: /Configure setup commands/ })
      )
      assert.ok(view.getByRole('heading', { name: 'Setup commands' }))

      localStorage.setItem('language-mode-v1', 'cantonese')
      fireEvent(
        document,
        new CustomEvent(LanguageModeChangedEvent, { detail: 'cantonese' })
      )
      assert.ok(view.getByRole('heading', { name: '準備指令' }))

      localStorage.setItem('language-mode-v1', 'bilingual')
      fireEvent(
        document,
        new CustomEvent(LanguageModeChangedEvent, { detail: 'bilingual' })
      )
      const bilingual = view.getByRole('heading', { name: /Setup commands/ })
      assert.match(bilingual.textContent ?? '', /準備指令/)
    } finally {
      if (previousLanguageMode === null) {
        localStorage.removeItem('language-mode-v1')
      } else {
        localStorage.setItem('language-mode-v1', previousLanguageMode)
      }
      fireEvent(
        document,
        new CustomEvent(LanguageModeChangedEvent, {
          detail: previousLanguageMode ?? 'english',
        })
      )
    }
  })

  it('adds, removes, reorders, toggles, validates, and saves structured argv', () => {
    const saved: Array<
      ReadonlyArray<{
        readonly enabled: boolean
        readonly executable: string
        readonly args: ReadonlyArray<string>
      }>
    > = []
    const view = renderPanel([], () => true, {
      setupCommands: [
        { enabled: true, executable: 'git', args: ['status'] },
        { enabled: true, executable: 'node', args: ['scripts/setup.js'] },
      ],
      onSaveSetupCommands: commands => {
        saved.push(commands)
        return true
      },
    })
    openCreator(view)
    fireEvent.click(view.getByRole('button', { name: /^Options$/ }))
    const configure = view.getByRole('button', {
      name: /Configure setup commands 2 setup commands configured/,
    })
    fireEvent.click(configure)

    fireEvent.click(view.getByRole('button', { name: 'Add command' }))
    let groups = view.getAllByRole('group', { name: /Command \d/ })
    assert.strictEqual(groups.length, 3)
    fireEvent.click(
      within(groups[2]).getByRole('button', { name: 'Remove command 3' })
    )
    groups = view.getAllByRole('group', { name: /Command \d/ })
    assert.strictEqual(groups.length, 2)
    assert.ok(groups[1].contains(document.activeElement))

    fireEvent.click(
      within(groups[1]).getByRole('button', { name: 'Move command 2 up' })
    )
    groups = view.getAllByRole('group', { name: /Command \d/ })
    fireEvent.click(within(groups[0]).getByLabelText('Run this command'))
    fireEvent.click(
      within(groups[0]).getByRole('button', { name: 'Add argument' })
    )
    assert.ok(view.getByText('Command 1, argument 2 cannot be empty.'))
    assert.strictEqual(
      within(groups[0])
        .getByLabelText('Argument 2')
        .getAttribute('aria-invalid'),
      'true'
    )
    fireEvent.change(within(groups[0]).getByLabelText('Argument 2'), {
      target: { value: '--check' },
    })
    fireEvent.click(
      within(groups[0]).getByRole('button', { name: 'Remove argument 2' })
    )
    const addArgument = within(groups[0]).getByRole('button', {
      name: 'Add argument',
    })
    assertSameNode(
      document.activeElement,
      within(groups[0]).getByLabelText('Argument 1'),
      'focus should move to the remaining argument'
    )
    fireEvent.click(addArgument)
    fireEvent.change(within(groups[0]).getByLabelText('Argument 2'), {
      target: { value: '--check' },
    })

    fireEvent.click(view.getByRole('button', { name: 'Save setup commands' }))
    assert.deepStrictEqual(saved, [
      [
        {
          enabled: false,
          executable: 'node',
          args: ['scripts/setup.js', '--check'],
        },
        { enabled: true, executable: 'git', args: ['status'] },
      ],
    ])
    assert.ok(
      view.queryByRole('dialog', { name: 'Setup commands' }) === null,
      'the dialog should be closed'
    )
    assertSameNode(document.activeElement, configure)
  })

  it('blocks credential-shaped argv and Cancel keeps the saved list unchanged', () => {
    let saves = 0
    const view = renderPanel([], () => true, {
      onSaveSetupCommands: () => {
        saves++
        return true
      },
    })
    openCreator(view)
    fireEvent.click(view.getByRole('button', { name: /^Options$/ }))
    const configure = view.getByRole('button', {
      name: /Configure setup commands/,
    })
    fireEvent.click(configure)
    fireEvent.click(view.getByRole('button', { name: 'Add command' }))
    fireEvent.change(view.getByLabelText('Argument 1'), {
      target: { value: '--token=ghp_abcdefghijklmnopqrstuvwxyz012345' },
    })

    assert.ok(view.getByText(/looks like a credential/))
    assert.strictEqual(
      view
        .getByRole('button', { name: 'Save setup commands' })
        .getAttribute('aria-disabled'),
      'true'
    )
    fireEvent.click(
      within(view.getByRole('dialog', { name: 'Setup commands' })).getByRole(
        'button',
        { name: 'Cancel' }
      )
    )
    assert.strictEqual(saves, 0)
    assert.ok(
      view.queryByRole('dialog', { name: 'Setup commands' }) === null,
      'the dialog should be closed'
    )
    assertSameNode(document.activeElement, configure)
  })

  it('offers an enabled Cancel setup action while setup is in flight', async () => {
    const result = deferred<boolean>()
    let cancels = 0
    const view = renderPanel([], () => result.promise, {
      canCancelCreate: true,
      onCancelCreate: () => cancels++,
    })
    openCreator(view)
    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-z' },
    })
    fireEvent.click(view.getByRole('button', { name: 'Start' }))

    const cancelSetup = view.getByRole('button', { name: 'Cancel setup' })
    assert.strictEqual(cancelSetup.getAttribute('aria-disabled'), null)
    fireEvent.click(cancelSetup)
    assert.strictEqual(cancels, 1)

    result.resolve(false)
    await new Promise<void>(resolve => setImmediate(resolve))
  })

  it('fails closed visibly when repository setup storage is unavailable', () => {
    let creates = 0
    const view = renderPanel(
      [],
      () => {
        creates++
        return true
      },
      {
        setupCommandsAvailable: false,
      }
    )
    openCreator(view)
    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-z' },
    })

    assert.ok(view.getByText(/could not be read safely/))
    assert.strictEqual(
      view.getByRole('button', { name: 'Start' }).getAttribute('aria-disabled'),
      'true'
    )
    fireEvent.click(view.getByRole('button', { name: /^Options$/ }))
    assert.strictEqual(
      view
        .getByRole('button', { name: /Configure setup commands/ })
        .getAttribute('aria-disabled'),
      'true'
    )
    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    assert.strictEqual(creates, 0)
  })

  it('keeps independent retries and offers their deleted historical bases', () => {
    const view = renderPanel(
      [session({ name: 'feature-z' }), session({ name: 'feature-y' })],
      () => true,
      {
        baseBranches: ['release'],
        defaultBaseBranch: 'release',
        existingBranchNames: ['release', 'feature-z', 'feature-y'],
        retryableSetups: [
          { name: 'feature-z', baseBranch: 'main', skippedCommandCount: 1 },
          {
            name: 'feature-y',
            baseBranch: 'legacy',
            skippedCommandCount: 2,
          },
        ],
      }
    )
    openCreator(view)
    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-z' },
    })
    const start = view.getByRole('button', { name: 'Start' })
    assert.strictEqual(start.getAttribute('aria-disabled'), null)
    assert.ok(
      view.queryByText(/already exists/) === null,
      'a retryable setup should not be treated as an existing worktree'
    )
    assert.ok(view.getByText(/1 unchanged completed/))

    fireEvent.click(view.getByRole('button', { name: /^Options$/ }))
    const base = view.getByLabelText('Base branch') as HTMLSelectElement
    assert.strictEqual(base.value, 'main')
    assert.ok([...base.options].some(option => option.value === 'main'))
    fireEvent.change(view.getByLabelText('Base branch'), {
      target: { value: 'release' },
    })
    assert.strictEqual(start.getAttribute('aria-disabled'), 'true')
    assert.ok(view.getAllByText(/already exists/).length > 0)

    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-y' },
    })
    assert.strictEqual(base.value, 'legacy')
    assert.ok([...base.options].some(option => option.value === 'legacy'))
    assert.strictEqual(start.getAttribute('aria-disabled'), null)
    assert.ok(view.getByText(/2 unchanged completed/))
  })

  it('discloses the resume plan and lets the user restart setup', async () => {
    const restartModes = new Array<boolean>()
    const view = renderPanel(
      [session({ name: 'feature-z' })],
      (_request, _commands, restartSetup) => {
        restartModes.push(restartSetup)
        return false
      },
      {
        existingBranchNames: ['main', 'release', 'feature-z'],
        retryableSetups: [
          { name: 'feature-z', baseBranch: 'main', skippedCommandCount: 1 },
        ],
      }
    )
    openCreator(view)
    fireEvent.change(view.getByLabelText('Worktree name'), {
      target: { value: 'feature-z' },
    })
    assert.ok(view.getByText(/will be skipped/))

    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.deepStrictEqual(restartModes, [false])

    fireEvent.click(view.getByLabelText('Run setup again from command 1'))
    assert.ok(view.getByText(/will run again/))
    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.deepStrictEqual(restartModes, [false, true])
  })

  it('switches the retry plan live through all three language modes', () => {
    const previousLanguageMode = localStorage.getItem('language-mode-v1')
    localStorage.setItem('language-mode-v1', 'english')
    const view = renderPanel([session({ name: 'feature-z' })], () => false, {
      existingBranchNames: ['main', 'feature-z'],
      retryableSetups: [
        { name: 'feature-z', baseBranch: 'main', skippedCommandCount: 1 },
      ],
    })

    try {
      openCreator(view)
      fireEvent.change(view.getByLabelText('Worktree name'), {
        target: { value: 'feature-z' },
      })
      assert.ok(view.getByText(/1 unchanged completed command/))

      localStorage.setItem('language-mode-v1', 'cantonese')
      fireEvent(
        document,
        new CustomEvent(LanguageModeChangedEvent, { detail: 'cantonese' })
      )
      assert.ok(view.getByText(/略過 1 條內容無變/))
      assert.ok(view.getByLabelText('由第一條重新執行準備指令'))

      localStorage.setItem('language-mode-v1', 'bilingual')
      fireEvent(
        document,
        new CustomEvent(LanguageModeChangedEvent, { detail: 'bilingual' })
      )
      const bilingual = view.getByText(/1 unchanged completed command/)
      assert.match(bilingual.textContent ?? '', /略過 1 條內容無變/)
    } finally {
      if (previousLanguageMode === null) {
        localStorage.removeItem('language-mode-v1')
      } else {
        localStorage.setItem('language-mode-v1', previousLanguageMode)
      }
      fireEvent(
        document,
        new CustomEvent(LanguageModeChangedEvent, {
          detail: previousLanguageMode ?? 'english',
        })
      )
    }
  })

  it('renders its controls and validation in Cantonese', () => {
    const previousLanguageMode = localStorage.getItem('language-mode-v1')
    localStorage.setItem('language-mode-v1', 'cantonese')

    try {
      const view = renderPanel([])

      assert.ok(view.getByRole('heading', { name: /工作樹/ }))
      fireEvent.click(view.getByRole('button', { name: /新增代理工作階段/ }))
      const name = view.getByLabelText('工作樹名稱')
      assert.ok(view.getByRole('button', { name: '開始' }))
      fireEvent.click(view.getByRole('button', { name: /^選項$/ }))
      assert.ok(view.getByText(/會先跑已設定嘅準備指令/))
      fireEvent.change(name, { target: { value: 'has a space' } })
      assert.ok(view.getByText(/Git.*名稱/))
    } finally {
      if (previousLanguageMode === null) {
        localStorage.removeItem('language-mode-v1')
      } else {
        localStorage.setItem('language-mode-v1', previousLanguageMode)
      }
    }
  })
})

describe('CodingAgentPicker', () => {
  it('lists only the agents that can actually be launched', () => {
    const view = render(
      <CodingAgentPicker
        value="none"
        availability={bothInstalled}
        onChange={() => undefined}
      />
    )

    assert.deepStrictEqual(
      view.getAllByRole('option').map(option => option.textContent),
      ['<None>', 'Codex CLI', 'OpenCode']
    )
  })

  it('disables an undetected CLI and says why in its visible label', () => {
    const view = render(
      <CodingAgentPicker
        value="none"
        availability={{
          codexInstalled: false,
          codexAuthenticated: false,
          opencodeInstalled: true,
          opencodeAuthenticated: true,
        }}
        onChange={() => undefined}
      />
    )

    const options = view.getAllByRole('option') as Array<HTMLOptionElement>
    const codex = options.find(o => o.value === 'codex')!
    const opencode = options.find(o => o.value === 'opencode')!

    assert.strictEqual(codex.disabled, true)
    assert.strictEqual(codex.textContent, 'Codex CLI — not detected')
    assert.strictEqual(opencode.disabled, false)
    assert.strictEqual(opencode.textContent, 'OpenCode')
  })

  it('disables an installed CLI when authentication is not configured', () => {
    const view = render(
      <CodingAgentPicker
        value="none"
        availability={{
          codexInstalled: true,
          codexAuthenticated: false,
          opencodeInstalled: true,
          opencodeAuthenticated: true,
        }}
        onChange={() => undefined}
      />
    )

    const codex = (
      view.getAllByRole('option') as Array<HTMLOptionElement>
    ).find(option => option.value === 'codex')!
    assert.strictEqual(codex.disabled, true)
    assert.strictEqual(codex.textContent, 'Codex CLI — authentication required')
  })

  it('reports the chosen agent', () => {
    const chosen: Array<string> = []
    const view = render(
      <CodingAgentPicker
        value="none"
        availability={bothInstalled}
        onChange={agent => chosen.push(agent)}
      />
    )

    fireEvent.change(view.getByLabelText('Coding agent'), {
      target: { value: 'opencode' },
    })
    assert.deepStrictEqual(chosen, ['opencode'])
  })
})
