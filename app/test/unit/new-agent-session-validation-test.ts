import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  AgentSessionNameCap,
  AgentSessionPromptCap,
  INewAgentSessionContext,
  NewAgentSessionProblemKind,
  canStartAgentSession,
  getAgentSessionBranchName,
  validateAgentSessionName,
  validateNewAgentSession,
} from '../../src/lib/agent-sessions'
import { INewAgentSessionRequest } from '../../src/models/agent-session'

const context: INewAgentSessionContext = {
  existingWorktreeNames: ['desktop-material', 'feature-x'],
  existingBranchNames: ['main', 'release'],
  availableBaseBranches: ['main', 'release'],
  selectableAgentIds: ['none', 'codex'],
}

function request(
  overrides: Partial<INewAgentSessionRequest> = {}
): INewAgentSessionRequest {
  return {
    name: 'brand-new',
    baseBranch: 'main',
    agent: 'none',
    prompt: '',
    ...overrides,
  }
}

function kinds(
  overrides: Partial<INewAgentSessionRequest> = {},
  ctx: INewAgentSessionContext = context
): ReadonlyArray<NewAgentSessionProblemKind> {
  return validateNewAgentSession(request(overrides), ctx).map(p => p.kind)
}

describe('validateAgentSessionName', () => {
  it('accepts an ordinary worktree name', () => {
    assert.strictEqual(validateAgentSessionName('fix-the-thing'), null)
    assert.strictEqual(validateAgentSessionName('v2.1-cleanup'), null)
  })

  it('treats an empty or whitespace-only name as unfinished, not illegal', () => {
    assert.strictEqual(validateAgentSessionName('')?.kind, 'name-empty')
    assert.strictEqual(validateAgentSessionName('   ')?.kind, 'name-empty')
  })

  it('refuses a path separator so the name cannot escape the worktree root', () => {
    assert.strictEqual(
      validateAgentSessionName('team/feature')?.kind,
      'name-separator'
    )
    assert.strictEqual(
      validateAgentSessionName('..\\..\\elsewhere')?.kind,
      'name-separator'
    )
  })

  it('refuses every name git itself would reject', () => {
    for (const name of [
      'has a space',
      'tilde~name',
      'caret^name',
      'colon:name',
      'question?name',
      'star*name',
      'bracket[name',
      'double..dot',
      '.leading',
      'trailing.',
      'branch.lock',
      'at@{brace',
      '-leading-dash',
    ]) {
      assert.strictEqual(
        validateAgentSessionName(name)?.kind,
        'name-illegal',
        `expected git to refuse ${JSON.stringify(name)}`
      )
    }
  })

  it('refuses a Windows reserved device name a directory cannot use', () => {
    assert.strictEqual(validateAgentSessionName('nul')?.kind, 'name-reserved')
    assert.strictEqual(validateAgentSessionName('COM1')?.kind, 'name-reserved')
    assert.strictEqual(
      validateAgentSessionName('aux.txt')?.kind,
      'name-reserved'
    )
    // Not reserved — only the exact device names are.
    assert.strictEqual(validateAgentSessionName('console'), null)
  })

  it('bounds the name length', () => {
    assert.strictEqual(
      validateAgentSessionName('a'.repeat(AgentSessionNameCap)),
      null
    )
    assert.strictEqual(
      validateAgentSessionName('a'.repeat(AgentSessionNameCap + 1))?.kind,
      'name-too-long'
    )
  })
})

describe('validateNewAgentSession', () => {
  it('enables Start for a legal, unique request', () => {
    assert.deepStrictEqual(kinds(), [])
    assert.strictEqual(canStartAgentSession(request(), context), true)
  })

  it('refuses a name that collides with an existing worktree or branch', () => {
    assert.deepStrictEqual(kinds({ name: 'feature-x' }), [
      'name-duplicate-worktree',
    ])
    assert.deepStrictEqual(kinds({ name: 'release' }), [
      'name-duplicate-branch',
    ])
  })

  it('folds case when detecting a collision', () => {
    // `Feature-X` and `feature-x` are the same directory on Windows and on the
    // default macOS volume, so accepting one because git refs are
    // case-sensitive would create a session that fails on most hosts.
    assert.deepStrictEqual(kinds({ name: 'Feature-X' }), [
      'name-duplicate-worktree',
    ])
    assert.deepStrictEqual(kinds({ name: 'MAIN' }), ['name-duplicate-branch'])
  })

  it('does not pile duplicate errors onto an already illegal name', () => {
    assert.deepStrictEqual(kinds({ name: 'has a space' }), ['name-illegal'])
  })

  it('refuses a base branch that is not offered', () => {
    assert.deepStrictEqual(kinds({ baseBranch: '' }), ['base-branch-empty'])
    assert.deepStrictEqual(kinds({ baseBranch: 'no-such-branch' }), [
      'base-branch-unknown',
    ])
  })

  it('refuses an agent this host cannot run', () => {
    assert.deepStrictEqual(kinds({ agent: 'opencode', prompt: 'do it' }), [
      'agent-unavailable',
    ])
  })

  it('requires a task once a real agent is chosen', () => {
    assert.deepStrictEqual(kinds({ agent: 'codex' }), ['prompt-empty'])
    assert.deepStrictEqual(kinds({ agent: 'codex', prompt: '   ' }), [
      'prompt-empty',
    ])
    assert.deepStrictEqual(
      kinds({ agent: 'codex', prompt: 'fix the build' }),
      []
    )
  })

  it('ignores the task when the session deliberately runs nothing', () => {
    assert.deepStrictEqual(kinds({ agent: 'none', prompt: '' }), [])
  })

  it('bounds the task at the cap the runners already enforce', () => {
    assert.deepStrictEqual(
      kinds({ agent: 'codex', prompt: 'x'.repeat(AgentSessionPromptCap + 1) }),
      ['prompt-too-long']
    )
  })

  it('reports every independent problem at once', () => {
    assert.deepStrictEqual(
      kinds({ name: 'feature-x', baseBranch: 'nope', agent: 'codex' }),
      ['name-duplicate-worktree', 'base-branch-unknown', 'prompt-empty']
    )
  })
})

describe('getAgentSessionBranchName', () => {
  it('uses an already-legal name verbatim', () => {
    assert.strictEqual(getAgentSessionBranchName('  fix-thing  '), 'fix-thing')
  })
})
