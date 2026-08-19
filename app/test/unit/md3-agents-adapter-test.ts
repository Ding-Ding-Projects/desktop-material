import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'

import { WorktreeEntry } from '../../src/models/worktree'
import { IAgentSession } from '../../src/models/agent-session'
import { toAgentSession } from '../../src/lib/agent-sessions'
import {
  appendAgentSessionConversationLog,
  beginAgentSessionConversation,
  clearAgentSessionConversations,
  finishAgentSessionConversation,
  readAgentSessionConversation,
} from '../../src/ui/agent-sessions/agent-session-conversation'
import {
  IMd3AgentAccess,
  md3AgentLastInstruction,
  md3AgentPermissionsSummary,
  md3AgentSendBlocker,
  md3AgentSessions,
} from '../../src/ui/md3/md3-destination-adapters'
import { formatMd3AgentDetail } from '../../src/ui/md3/md3-agents-view'
import { Md3AgentsController } from '../../src/ui/md3/md3-agents-controller'
import { buildMd3AgentsProps } from '../../src/ui/md3/md3-view-props'

/**
 * The seam between the real worktree fleet and the Agents view.
 *
 * The view's own tests are fed fixtures that are already correct by
 * construction, so they cannot see an adapter that supplies a value of the
 * right type and the wrong meaning — a zero standing in for "not loaded", a
 * last-activity stamp standing in for a start time, a filesystem path standing
 * in for a permission summary. Everything here starts from a real
 * `WorktreeEntry`, a real `IAgentSession` and a real recorded transcript, and
 * asserts what a person would actually read on the row.
 */

const Minute = 60_000
const Start = 1_800_000_000_000

function worktree(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    path: 'C:\\worktrees\\tonal-surfaces',
    head: '4f1c9ae2b6d0c7a5e8f3b1d9c0a7e6f5b4d3c2a1',
    branch: 'refs/heads/agents/tonal-surfaces',
    isDetached: false,
    type: 'linked',
    isLocked: false,
    isPrunable: false,
    ...overrides,
  }
}

/**
 * Record a real transcript through the conversation store the runner bridge
 * writes to, rather than hand-building one: the adapter reads turn timestamps,
 * and a literal invented here could agree with the adapter while disagreeing
 * with what the runner actually produces.
 */
function recordRun(options: {
  readonly path: string
  readonly prompt: string
  readonly startedAt: number
  readonly outputs: ReadonlyArray<{
    readonly text: string
    readonly at: number
  }>
  readonly finish?: 'exited' | 'failed' | 'cancelled'
}): void {
  const operationId = `op-${options.path}-${options.startedAt}`
  beginAgentSessionConversation({
    operationId,
    worktreePath: options.path,
    agent: 'codex',
    prompt: options.prompt,
    createdAt: options.startedAt,
  })
  for (const output of options.outputs) {
    appendAgentSessionConversationLog({
      operationId,
      stream: 'stdout',
      text: output.text,
      createdAt: output.at,
    })
  }
  if (options.finish !== undefined) {
    finishAgentSessionConversation(operationId, options.finish)
  }
}

const EveryAccess: IMd3AgentAccess = { read: 'on', commit: 'ask', push: 'off' }

function rowsFor(
  sessions: ReadonlyArray<IAgentSession>,
  options: {
    readonly available?: boolean
    readonly now?: number
    readonly access?: IMd3AgentAccess
  } = {}
) {
  return md3AgentSessions({
    sessions,
    runnerAvailable: () => options.available ?? true,
    conversationFor: session => readAgentSessionConversation(session.path),
    access: options.access ?? EveryAccess,
    now: options.now ?? Start + 10 * Minute,
  })
}

describe('Md3 agents adapter', () => {
  beforeEach(() => clearAgentSessionConversations())

  describe('turn count', () => {
    it('reports the transcript’s real length rather than zero', () => {
      const session = toAgentSession(worktree(), {
        agent: 'codex',
        runState: 'running',
        lastActivityAt: Start + 3 * Minute,
      })
      recordRun({
        path: session.path,
        prompt: 'Resolve the conflicts in the shell stylesheet.',
        startedAt: Start,
        outputs: [
          { text: 'Found 3 conflict hunks.', at: Start + Minute },
          { text: 'Applied the resolution.', at: Start + 2 * Minute },
        ],
      })

      const [row] = rowsFor([session])
      assert.strictEqual(row.turnCount, 3)
      assert.ok(formatMd3AgentDetail(row).includes('3 turns'))
    })

    it('leaves the count out entirely when no transcript is on record', () => {
      const session = toAgentSession(worktree(), { agent: 'codex' })
      const [row] = rowsFor([session])

      assert.strictEqual(row.turnCount, null)
      const detail = formatMd3AgentDetail(row)
      assert.ok(
        !detail.includes('0 turns'),
        `an unknown transcript must not read as an empty one: ${detail}`
      )
      assert.ok(!detail.includes('turns'))
      assert.ok(!detail.includes('null'))
      assert.ok(!detail.includes('undefined'))
    })
  })

  describe('start and elapsed time', () => {
    it('starts the clock at the first turn, not at the last activity', () => {
      const session = toAgentSession(worktree(), {
        agent: 'codex',
        runState: 'running',
        lastActivityAt: Start + 58 * Minute,
      })
      recordRun({
        path: session.path,
        prompt: 'Rebuild the index.',
        startedAt: Start,
        outputs: [{ text: 'Working.', at: Start + 58 * Minute }],
      })

      const [row] = rowsFor([session], { now: Start + 60 * Minute })
      assert.strictEqual(row.startedAt, Start)
      assert.notStrictEqual(row.startedAt, session.lastActivityAt)
      assert.strictEqual(row.elapsedMs, 60 * Minute)
    })

    it('holds a finished run’s duration still as the clock runs on', () => {
      const session = toAgentSession(worktree(), {
        agent: 'codex',
        runState: 'idle',
        lastActivityAt: Start + 2 * Minute,
      })
      recordRun({
        path: session.path,
        prompt: 'Write the release notes.',
        startedAt: Start,
        outputs: [{ text: 'Done.', at: Start + 2 * Minute }],
        finish: 'exited',
      })

      const [soon] = rowsFor([session], { now: Start + 3 * Minute })
      const [muchLater] = rowsFor([session], { now: Start + 3 * 86_400_000 })

      assert.strictEqual(soon.elapsedMs, 2 * Minute)
      assert.strictEqual(
        muchLater.elapsedMs,
        soon.elapsedMs,
        'a run that has stopped cannot keep getting longer'
      )
    })

    it('claims neither a start nor a duration it cannot know', () => {
      const session = toAgentSession(worktree(), { agent: 'codex' })
      const [row] = rowsFor([session])

      assert.strictEqual(row.startedAt, null)
      assert.strictEqual(row.elapsedMs, null)
    })
  })

  describe('permission summary', () => {
    it('states the access rather than the worktree path', () => {
      const session = toAgentSession(worktree(), { agent: 'codex' })
      const [row] = rowsFor([session])

      assert.strictEqual(
        row.permissionsSummary,
        'read + commit on request permissions'
      )
      assert.ok(
        !row.permissionsSummary.includes(session.path),
        'the detail line ends with what the agent may do, not where it runs'
      )
      assert.ok(formatMd3AgentDetail(row).endsWith(row.permissionsSummary))
    })

    it('says plainly when nothing is granted', () => {
      assert.strictEqual(
        md3AgentPermissionsSummary({ read: 'off', commit: 'off', push: 'off' }),
        'no permissions granted'
      )
    })

    it('never folds an asking permission in with a granted one', () => {
      assert.strictEqual(
        md3AgentPermissionsSummary({ read: 'on', commit: 'on', push: 'ask' }),
        'read + commit + push on request permissions'
      )
    })
  })

  describe('what a session can be asked to do', () => {
    it('takes an instruction when a run could start', () => {
      const session = toAgentSession(worktree(), { agent: 'codex' })
      const [row] = rowsFor([session])

      assert.strictEqual(row.canSendInstruction, true)
      assert.strictEqual(row.sendUnavailableReason, null)
    })

    it('refuses one while the agent is still working, and says why', () => {
      const session = toAgentSession(worktree(), {
        agent: 'codex',
        runState: 'running',
      })
      const [row] = rowsFor([session])

      assert.strictEqual(row.canSendInstruction, false)
      assert.strictEqual(
        row.sendUnavailableReason,
        'The agent is still working. Pause it before sending another instruction.'
      )
    })

    it('names the runner that is not installed', () => {
      const session = toAgentSession(worktree(), { agent: 'codex' })
      const [row] = rowsFor([session], { available: false })

      assert.strictEqual(row.canSendInstruction, false)
      assert.strictEqual(
        row.sendUnavailableReason,
        'Codex CLI is not installed on this computer, so nothing can be sent to it.'
      )
    })

    it('refuses a worktree that is gone before it looks at anything else', () => {
      const session = toAgentSession(worktree({ isPrunable: true }), {
        agent: 'codex',
        runState: 'running',
      })
      const [row] = rowsFor([session])

      assert.strictEqual(row.canSendInstruction, false)
      assert.strictEqual(
        row.sendUnavailableReason,
        'This worktree is missing, so nothing can be sent to it.'
      )
    })

    it('offers no agent at all for a plain worktree', () => {
      const session = toAgentSession(worktree({ type: 'main' }))
      const [row] = rowsFor([session])

      assert.strictEqual(row.canSendInstruction, false)
      assert.strictEqual(
        row.sendUnavailableReason,
        'No agent is attached to this worktree.'
      )
    })

    it('only offers Resume when there is an instruction to resume', () => {
      const session = toAgentSession(worktree(), { agent: 'codex' })
      assert.strictEqual(rowsFor([session])[0].canResume, false)

      recordRun({
        path: session.path,
        prompt: 'Rerun the suite.',
        startedAt: Start,
        outputs: [],
        finish: 'exited',
      })
      assert.strictEqual(rowsFor([session])[0].canResume, true)
    })
  })

  describe('md3AgentLastInstruction', () => {
    it('finds the newest instruction, past the runner’s output', () => {
      const path = worktree().path
      recordRun({
        path,
        prompt: 'First task.',
        startedAt: Start,
        outputs: [{ text: 'Some output.', at: Start + Minute }],
        finish: 'exited',
      })
      recordRun({
        path,
        prompt: 'Second task.',
        startedAt: Start + 5 * Minute,
        outputs: [{ text: 'More output.', at: Start + 6 * Minute }],
        finish: 'exited',
      })

      assert.strictEqual(
        md3AgentLastInstruction(readAgentSessionConversation(path)),
        'Second task.'
      )
    })

    it('has nothing to resume without a transcript', () => {
      assert.strictEqual(md3AgentLastInstruction(null), null)
    })
  })
})

describe('Md3AgentsController', () => {
  beforeEach(() => clearAgentSessionConversations())

  interface ILaunch {
    readonly path: string
    readonly instruction: string
    readonly operationId: string
  }

  function controller(
    session: IAgentSession | null,
    available = true
  ): { controller: Md3AgentsController; launches: ReadonlyArray<ILaunch> } {
    const launches = new Array<ILaunch>()
    let next = 0
    return {
      launches,
      controller: new Md3AgentsController({
        sessionFor: path =>
          session !== null && session.path === path ? session : null,
        conversationFor: path => readAgentSessionConversation(path),
        runnerAvailable: () => available,
        newOperationId: () => `operation-${++next}`,
        startRun: (target, instruction, operationId) =>
          launches.push({ path: target.path, instruction, operationId }),
      }),
    }
  }

  it('launches a real run for the typed instruction', () => {
    const session = toAgentSession(worktree(), { agent: 'codex' })
    const { controller: subject, launches } = controller(session)

    const result = subject.sendInstruction(session.path, '  Stage the fix.  ')

    assert.strictEqual(result.kind, 'started')
    assert.deepStrictEqual(launches, [
      {
        path: session.path,
        instruction: 'Stage the fix.',
        operationId: 'operation-1',
      },
    ])
  })

  it('sends nothing for a blank instruction', () => {
    const session = toAgentSession(worktree(), { agent: 'codex' })
    const { controller: subject, launches } = controller(session)

    const result = subject.sendInstruction(session.path, '   ')

    assert.strictEqual(result.kind, 'refused')
    assert.strictEqual(launches.length, 0)
  })

  it('refuses with the very sentence the composer is showing', () => {
    const session = toAgentSession(worktree(), {
      agent: 'codex',
      runState: 'running',
    })
    const { controller: subject, launches } = controller(session)

    const result = subject.sendInstruction(session.path, 'Do it again.')
    const [row] = rowsFor([session])

    assert.strictEqual(result.kind, 'refused')
    assert.strictEqual(
      result.kind === 'refused' ? result.reason : null,
      row.sendUnavailableReason
    )
    assert.strictEqual(
      result.kind === 'refused' ? result.reason : null,
      md3AgentSendBlocker(session, () => true)
    )
    assert.strictEqual(launches.length, 0)
  })

  it('resumes by running the last instruction again', () => {
    const session = toAgentSession(worktree(), { agent: 'codex' })
    recordRun({
      path: session.path,
      prompt: 'Rebuild the docs bundle.',
      startedAt: Start,
      outputs: [{ text: 'Built.', at: Start + Minute }],
      finish: 'exited',
    })
    const { controller: subject, launches } = controller(session)

    const result = subject.resumeSession(session.path)

    assert.strictEqual(result.kind, 'started')
    assert.strictEqual(launches[0].instruction, 'Rebuild the docs bundle.')
  })

  it('never resumes a session that was never given anything to do', () => {
    const session = toAgentSession(worktree(), { agent: 'codex' })
    const { controller: subject, launches } = controller(session)

    const result = subject.resumeSession(session.path)

    assert.strictEqual(result.kind, 'refused')
    assert.strictEqual(
      result.kind === 'refused' ? result.reason : null,
      'This session has no recorded instruction to resume. Type one below and send it.'
    )
    assert.strictEqual(launches.length, 0)
  })

  it('reports a worktree that has gone away instead of launching into it', () => {
    const { controller: subject, launches } = controller(null)

    const result = subject.sendInstruction('C:\\worktrees\\gone', 'Anything.')

    assert.strictEqual(result.kind, 'refused')
    assert.strictEqual(launches.length, 0)
  })
})

describe('buildMd3AgentsProps', () => {
  beforeEach(() => clearAgentSessionConversations())

  const noop = () => {}

  function build(
    sessions: ReadonlyArray<IAgentSession>,
    selectedSessionId: string | null
  ) {
    return buildMd3AgentsProps({
      sessions,
      selectedSessionId,
      conversationFor: path => readAgentSessionConversation(path),
      runnerAvailable: () => true,
      readAccess: 'on',
      commitAccess: 'ask',
      pushAccess: 'off',
      onSelectSession: noop,
      onNewSession: noop,
      onPauseSession: noop,
      onResumeSession: noop,
      onSendInstruction: noop,
      onOpenSessionLog: noop,
      onDuplicateSession: noop,
      onDeleteSession: noop,
      onConfigureAgentAccess: noop,
    })
  }

  it('opens on the first session rather than on an empty pane', () => {
    const session = toAgentSession(worktree(), { agent: 'codex' })
    recordRun({
      path: session.path,
      prompt: 'Say something.',
      startedAt: Start,
      outputs: [{ text: 'Something.', at: Start + Minute }],
      finish: 'exited',
    })

    const props = build([session], null)

    assert.strictEqual(props.selectedSessionId, session.path)
    assert.strictEqual(props.conversation?.sessionId, session.path)
    assert.strictEqual(props.conversation?.turns.length, 2)
  })

  it('falls back when the remembered worktree is no longer there', () => {
    const session = toAgentSession(worktree(), { agent: 'codex' })

    const props = build([session], 'C:\\worktrees\\deleted-yesterday')

    assert.strictEqual(props.selectedSessionId, session.path)
  })

  it('selects nothing when there is nothing to select', () => {
    const props = build([], null)

    assert.strictEqual(props.selectedSessionId, null)
    assert.strictEqual(props.conversation, null)
  })

  it('gives every row its own transcript, not only the selected one', () => {
    const first = toAgentSession(worktree(), { agent: 'codex' })
    const second = toAgentSession(
      worktree({ path: 'C:\\worktrees\\release-notes' }),
      { agent: 'codex' }
    )
    recordRun({
      path: second.path,
      prompt: 'Draft the notes.',
      startedAt: Start,
      outputs: [
        { text: 'Drafted.', at: Start + Minute },
        { text: 'Reviewed.', at: Start + 2 * Minute },
      ],
      finish: 'exited',
    })

    const props = build([first, second], first.path)

    assert.strictEqual(props.sessions[0].turnCount, null)
    assert.strictEqual(
      props.sessions[1].turnCount,
      3,
      'an unselected row still reports its own real turn count'
    )
  })
})
