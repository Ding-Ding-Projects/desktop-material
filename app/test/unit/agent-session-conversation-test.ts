import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'

import {
  appendAgentSessionConversationLog,
  beginAgentSessionConversation,
  clearAgentSessionConversations,
  finishAgentSessionConversation,
  readAgentSessionConversation,
} from '../../src/ui/agent-sessions/agent-session-conversation'

describe('agent session conversation store', () => {
  beforeEach(clearAgentSessionConversations)

  it('captures bounded sanitized instructions and real runner streams', () => {
    beginAgentSessionConversation({
      operationId: 'operation-1',
      worktreePath: 'C:\\work\\feature',
      agent: 'codex',
      prompt: '\u001b[32mImplement navigation\u001b[0m',
      createdAt: 1,
    })

    assert.strictEqual(
      appendAgentSessionConversationLog({
        operationId: 'operation-1',
        stream: 'stdout',
        text: 'first line\nsecond line',
        createdAt: 2,
      }),
      true
    )
    assert.strictEqual(
      appendAgentSessionConversationLog({
        operationId: 'operation-1',
        stream: 'stderr',
        text: 'failed line',
        createdAt: 3,
      }),
      true
    )
    assert.strictEqual(
      finishAgentSessionConversation('operation-1', 'exited'),
      true
    )

    const conversation = readAgentSessionConversation('c:/WORK/feature/')
    assert.ok(conversation)
    assert.strictEqual(conversation.status, 'exited')
    assert.deepStrictEqual(
      conversation.turns.map(turn => [turn.role, turn.text]),
      [
        ['instruction', 'Implement navigation'],
        ['output', 'first line'],
        ['output', 'second line'],
        ['error', 'failed line'],
      ]
    )
  })

  it('ignores unrelated runner output', () => {
    assert.strictEqual(
      appendAgentSessionConversationLog({
        operationId: 'unknown-operation',
        stream: 'stdout',
        text: 'must not appear',
      }),
      false
    )
    assert.strictEqual(readAgentSessionConversation('C:\\work\\feature'), null)
  })
})
