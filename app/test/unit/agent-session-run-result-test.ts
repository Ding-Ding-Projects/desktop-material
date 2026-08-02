import assert from 'node:assert'
import { describe, it } from 'node:test'

import { classifyAgentSessionRunnerExit } from '../../src/lib/agent-sessions'

describe('classifyAgentSessionRunnerExit', () => {
  it('keeps clean process exit separate from task completion', () => {
    assert.deepStrictEqual(
      classifyAgentSessionRunnerExit({ ok: true, code: 0, cancelled: false }),
      { status: 'exited', exitCode: 0 }
    )
  })

  it('reports non-zero, spawn, and cancellation outcomes distinctly', () => {
    assert.deepStrictEqual(
      classifyAgentSessionRunnerExit({ ok: true, code: 12, cancelled: false }),
      { status: 'failed', exitCode: 12 }
    )
    assert.deepStrictEqual(classifyAgentSessionRunnerExit({ ok: false }), {
      status: 'failed',
      exitCode: null,
    })
    assert.deepStrictEqual(
      classifyAgentSessionRunnerExit({ ok: true, code: -1, cancelled: true }),
      { status: 'cancelled' }
    )
  })
})
