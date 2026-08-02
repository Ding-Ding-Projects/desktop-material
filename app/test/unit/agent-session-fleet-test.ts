import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  buildAgentSessionFleet,
  getShortBranchName,
  getWorktreeDisplayName,
  toAgentSession,
} from '../../src/lib/agent-sessions'
import { IAgentSession } from '../../src/models/agent-session'
import { WorktreeEntry } from '../../src/models/worktree'

function session(overrides: Partial<IAgentSession> = {}): IAgentSession {
  return {
    path: `C:\\work\\${overrides.name ?? 'session'}`,
    name: 'session',
    branch: 'session',
    head: 'abc123',
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

function order(sessions: ReadonlyArray<IAgentSession>) {
  return buildAgentSessionFleet(sessions).map(row => row.session.name)
}

describe('getWorktreeDisplayName', () => {
  it('reads the last segment of either separator style', () => {
    assert.strictEqual(
      getWorktreeDisplayName('C:\\work\\feature-x'),
      'feature-x'
    )
    assert.strictEqual(
      getWorktreeDisplayName('/home/me/work/feature-x'),
      'feature-x'
    )
    assert.strictEqual(
      getWorktreeDisplayName('C:/work/feature-x/'),
      'feature-x'
    )
  })

  it('falls back to the whole value rather than an empty label', () => {
    assert.strictEqual(getWorktreeDisplayName('/'), '/')
  })
})

describe('getShortBranchName', () => {
  it('strips the porcelain ref prefix and passes a detached HEAD through', () => {
    assert.strictEqual(getShortBranchName('refs/heads/feature-x'), 'feature-x')
    assert.strictEqual(getShortBranchName(null), null)
  })
})

describe('toAgentSession', () => {
  const entry: WorktreeEntry = {
    path: 'C:\\work\\feature-x',
    head: 'abc123',
    branch: 'refs/heads/feature-x',
    isDetached: false,
    type: 'linked',
    isLocked: true,
    isPrunable: true,
  }

  it('projects a worktree with no observed agent state into a real session', () => {
    // The panel exists so every worktree is visible, not only the ones an
    // agent happens to be running in.
    assert.deepStrictEqual(toAgentSession(entry), {
      path: 'C:\\work\\feature-x',
      name: 'feature-x',
      branch: 'feature-x',
      head: 'abc123',
      isMainWorktree: false,
      isLocked: true,
      isMissing: true,
      agent: 'none',
      runState: 'idle',
      errorMessage: null,
      diffStat: null,
      editedFileCount: null,
      lastActivityAt: null,
    })
  })

  it('carries observed agent state through', () => {
    const result = toAgentSession(
      { ...entry, type: 'main' },
      { agent: 'codex', runState: 'running', editedFileCount: 12 }
    )

    assert.strictEqual(result.isMainWorktree, true)
    assert.strictEqual(result.agent, 'codex')
    assert.strictEqual(result.runState, 'running')
    assert.strictEqual(result.editedFileCount, 12)
  })
})

describe('buildAgentSessionFleet', () => {
  it('pairs every session with its derived chip', () => {
    const [row] = buildAgentSessionFleet([
      session({ name: 'a', runState: 'error', errorMessage: 'boom' }),
    ])

    assert.strictEqual(row.chip.kind, 'error')
    assert.strictEqual(row.chip.label, 'Error')
  })

  it('keeps the main worktree at the top whatever its chip says', () => {
    assert.deepStrictEqual(
      order([
        session({ name: 'broken', runState: 'error' }),
        session({ name: 'root', isMainWorktree: true }),
      ]),
      ['root', 'broken']
    )
  })

  it('orders the rest by how much attention they want', () => {
    assert.deepStrictEqual(
      order([
        session({ name: 'quiet' }),
        session({
          name: 'changed',
          diffStat: { filesChanged: 1, linesAdded: 5, linesDeleted: 0 },
        }),
        session({ name: 'busy', runState: 'running' }),
        session({ name: 'broken', runState: 'error' }),
      ]),
      ['broken', 'busy', 'changed', 'quiet']
    )
  })

  it('breaks a tie with the most recent activity, then the name', () => {
    assert.deepStrictEqual(
      order([
        session({ name: 'older', runState: 'running', lastActivityAt: 100 }),
        session({ name: 'newer', runState: 'running', lastActivityAt: 900 }),
        session({ name: 'never', runState: 'running' }),
      ]),
      ['newer', 'older', 'never']
    )

    assert.deepStrictEqual(
      order([
        session({ name: 'beta', lastActivityAt: 5 }),
        session({ name: 'alpha', lastActivityAt: 5 }),
      ]),
      ['alpha', 'beta']
    )
  })

  it('does not mutate the array it was given', () => {
    const sessions = [
      session({ name: 'quiet' }),
      session({ name: 'broken', runState: 'error' }),
    ]
    buildAgentSessionFleet(sessions)

    assert.deepStrictEqual(
      sessions.map(s => s.name),
      ['quiet', 'broken']
    )
  })

  it('handles an empty fleet', () => {
    assert.deepStrictEqual(buildAgentSessionFleet([]), [])
  })
})
