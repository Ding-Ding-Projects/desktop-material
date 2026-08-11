import { IMd3AgentConversation, IMd3AgentSession } from './md3-agents-view'

/**
 * TEST AND PREVIEW DATA ONLY — never rendered by the shipping application.
 *
 * `Md3AgentsView` takes every session and every turn as props, so a test or a
 * component preview needs something to hand it. These rows exist for that and
 * nothing else: the real view is fed from the repository's own worktrees and
 * the live runner transcript.
 */

const Minute = 60_000

/** A fixed clock, so a snapshot of these rows never depends on the wall time. */
export const Md3AgentsFixtureNow = 1_800_000_000_000

export const md3AgentsFixtureSessions: ReadonlyArray<IMd3AgentSession> = [
  {
    id: '/tmp/worktrees/tonal-surfaces',
    name: 'tonal-surfaces',
    path: '/tmp/worktrees/tonal-surfaces',
    agentName: 'Codex CLI',
    state: 'running',
    branch: 'agents/tonal-surfaces',
    startedAt: Md3AgentsFixtureNow - 3 * Minute,
    model: 'gpt-5',
    turnCount: 12,
    elapsedMs: 161_000,
    permissionsSummary: 'read + stage permissions',
    isMainWorktree: false,
    isLocked: false,
    isMissing: false,
    errorMessage: null,
    canPause: true,
    canResume: false,
    canSendInstruction: true,
    sendUnavailableReason: null,
  },
  {
    id: '/tmp/worktrees/release-notes',
    name: 'release-notes',
    path: '/tmp/worktrees/release-notes',
    agentName: 'OpenCode',
    state: 'done',
    branch: 'agents/release-notes',
    startedAt: Md3AgentsFixtureNow - 12 * Minute,
    model: 'gpt-5-mini',
    turnCount: 8,
    elapsedMs: 48_000,
    permissionsSummary: 'read-only permissions',
    isMainWorktree: false,
    isLocked: false,
    isMissing: false,
    errorMessage: null,
    canPause: false,
    canResume: true,
    canSendInstruction: true,
    sendUnavailableReason: null,
  },
  {
    id: '/tmp/worktrees/flaky-suite',
    name: 'flaky-suite',
    path: '/tmp/worktrees/flaky-suite',
    agentName: 'Codex CLI',
    state: 'error',
    branch: null,
    startedAt: Md3AgentsFixtureNow - 61 * Minute,
    model: null,
    turnCount: 1,
    elapsedMs: 4_000,
    permissionsSummary: 'read + stage permissions',
    isMainWorktree: false,
    isLocked: true,
    isMissing: false,
    errorMessage: 'The runner exited with code 1 before producing any output.',
    canPause: false,
    canResume: true,
    canSendInstruction: false,
    sendUnavailableReason:
      'This session stopped with an error. Resume it before sending an instruction.',
  },
  {
    id: '/tmp/repo',
    name: 'repo',
    path: '/tmp/repo',
    agentName: 'No agent',
    state: 'idle',
    branch: 'main',
    startedAt: null,
    model: null,
    turnCount: 0,
    elapsedMs: null,
    permissionsSummary: 'no agent permissions granted',
    isMainWorktree: true,
    isLocked: false,
    isMissing: false,
    errorMessage: null,
    canPause: false,
    canResume: false,
    canSendInstruction: false,
    sendUnavailableReason: 'No agent is attached to this worktree.',
  },
]

export const md3AgentsFixtureConversation: IMd3AgentConversation = {
  sessionId: '/tmp/worktrees/tonal-surfaces',
  statusLabel: 'running',
  turns: [
    {
      id: '1',
      role: 'user',
      text: 'Resolve the conflicts in the shell stylesheet, keeping the tonal surfaces.',
    },
    {
      id: '2',
      role: 'agent',
      text: 'Found 3 conflict hunks. Two are whitespace-only; the third keeps both the tonal background and the new radius token.',
    },
    {
      id: '3',
      role: 'agent',
      text: 'Applied the resolution and ran the style lint — 0 problems in 216 files.',
    },
    {
      id: '4',
      role: 'user',
      text: 'Stage the result but do not commit.',
    },
    {
      id: '5',
      role: 'meta',
      text: 'Staged 1 file. Waiting for review before committing.',
    },
  ],
}
