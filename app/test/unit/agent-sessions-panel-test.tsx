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

const bothInstalled = { codexInstalled: true, opencodeInstalled: true }

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
  onCreateSession: (request: INewAgentSessionRequest) => void = () => undefined
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
        onCreateSession={() => undefined}
        isCreating={false}
      />
    )

    fireEvent.click(view.getByRole('button', { name: /feature-x/ }))
    assert.deepStrictEqual(picked, ['feature-x'])
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
    const view = renderPanel([], request => requests.push(request))
    openCreator(view)

    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    assert.deepStrictEqual(requests, [])
  })

  it('hands the caller the request instead of creating anything itself', () => {
    const requests: Array<INewAgentSessionRequest> = []
    const view = renderPanel([], request => requests.push(request))
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
        availability={{ codexInstalled: false, opencodeInstalled: true }}
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
