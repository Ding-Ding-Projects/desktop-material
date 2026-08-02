import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { AgentSessionsPanel } from '../../src/ui/agent-sessions/agent-sessions-panel'
import { CodingAgentPicker } from '../../src/ui/agent-sessions/coding-agent-picker'
import {
  IAgentSession,
  INewAgentSessionRequest,
} from '../../src/models/agent-session'
import { fireEvent, render, within } from '../helpers/ui/render'

// The panel's own controls do not mount the shared List, but the Select and
// TextBox it uses share the UI setup that constructs an observer from
// `window.ResizeObserver` while the shared setup only polyfills the global.
if (typeof window !== 'undefined') {
  Object.assign(window, { ResizeObserver: globalThis.ResizeObserver })
}

const bothInstalled = {
  codexInstalled: true,
  codexAuthenticated: true,
  opencodeInstalled: true,
  opencodeAuthenticated: true,
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
  onCreateSession: (
    request: INewAgentSessionRequest
  ) => boolean | Promise<boolean> = () => true
) {
  return render(
    <AgentSessionsPanel
      sessions={sessions}
      availability={bothInstalled}
      baseBranches={['main', 'release']}
      defaultBaseBranch="main"
      existingBranchNames={['main', 'release']}
      selectedPath={null}
      onSelectSession={() => undefined}
      onCreateSession={onCreateSession}
      isCreating={false}
    />
  )
}

describe('AgentSessionsPanel fleet', () => {
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
    assert.strictEqual(document.activeElement, second)
  })

  it('reports the selected session rather than acting on its own', () => {
    const picked: Array<string> = []
    const view = render(
      <AgentSessionsPanel
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
    assert.strictEqual(document.activeElement, last)
    assert.strictEqual(last.getAttribute('tabindex'), '0')
    assert.strictEqual(missing.getAttribute('tabindex'), '-1')
  })

  it('renders Stop as a named sibling control and reports its exact session', () => {
    const cancelled: Array<string> = []
    const busy = session({ name: 'busy', runState: 'running' })
    const view = render(
      <AgentSessionsPanel
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
    assert.strictEqual(card.parentElement, stop.parentElement)

    fireEvent.click(stop)
    assert.deepStrictEqual(cancelled, [busy.path])
  })

  it('says the fleet is empty instead of rendering a bare list', () => {
    const view = renderPanel([])

    assert.ok(view.getByText(/No worktrees yet/))
    assert.strictEqual(view.queryByRole('list', { name: 'Worktrees' }), null)
  })
})

describe('AgentSessionsPanel creator', () => {
  function openCreator(view: ReturnType<typeof renderPanel>) {
    fireEvent.click(view.getByRole('button', { name: /New Agent Session/ }))
  }

  it('keeps Start disabled until the name is legal and unused', () => {
    const view = renderPanel([session({ name: 'feature-x' })])
    openCreator(view)

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

  it('hands the caller the request instead of creating anything itself', () => {
    const requests: Array<INewAgentSessionRequest> = []
    const view = renderPanel([], request => {
      requests.push(request)
      return true
    })
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
        .getByRole('button', { name: 'Cancel' })
        .getAttribute('aria-disabled'),
      'true'
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
    assert.strictEqual(view.queryByLabelText('Worktree name'), null)
    assert.strictEqual(document.activeElement, trigger)
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

  it('renders its controls and validation in Cantonese', () => {
    const previousLanguageMode = localStorage.getItem('language-mode-v1')
    localStorage.setItem('language-mode-v1', 'cantonese')

    try {
      const view = renderPanel([])

      assert.ok(view.getByRole('heading', { name: /工作樹/ }))
      fireEvent.click(view.getByRole('button', { name: /新增代理工作階段/ }))
      const name = view.getByLabelText('工作樹名稱')
      assert.ok(view.getByRole('button', { name: '開始' }))
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
