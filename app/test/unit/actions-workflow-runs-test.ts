import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  isWorkflowRunCancellableStatus,
  isWorkflowRunTerminalStatus,
  parseActionsWorkflowRunCancellationState,
} from '../../src/lib/actions-workflow-runs'

describe('Actions workflow-run cancellation state', () => {
  it('allows cancellation only for the four provider states in the product contract', () => {
    for (const status of ['queued', 'in_progress', 'waiting', 'pending']) {
      assert.equal(isWorkflowRunCancellableStatus(status), true, status)
    }
    for (const status of ['requested', 'completed', 'success', '', null]) {
      assert.equal(
        isWorkflowRunCancellableStatus(status),
        false,
        String(status)
      )
    }
    assert.equal(isWorkflowRunTerminalStatus('completed'), true)
    assert.equal(isWorkflowRunTerminalStatus('in_progress'), false)
  })

  it('parses one exact bounded run identity and terminal result', () => {
    assert.deepEqual(
      parseActionsWorkflowRunCancellationState(
        {
          id: 42,
          status: 'completed',
          conclusion: 'cancelled',
          updated_at: '2026-07-16T12:30:00Z',
        },
        42
      ),
      {
        id: 42,
        status: 'completed',
        conclusion: 'cancelled',
        updatedAt: '2026-07-16T12:30:00Z',
      }
    )
  })

  it('rejects mismatched ids, unknown states, and oversized metadata', () => {
    assert.throws(
      () =>
        parseActionsWorkflowRunCancellationState(
          { id: 43, status: 'in_progress', conclusion: null },
          42
        ),
      /different workflow run/
    )
    assert.throws(
      () =>
        parseActionsWorkflowRunCancellationState(
          { id: 42, status: 'mystery', conclusion: null },
          42
        ),
      /invalid workflow run status/
    )
    assert.throws(
      () =>
        parseActionsWorkflowRunCancellationState(
          {
            id: 42,
            status: 'completed',
            conclusion: 'secret-provider-state',
          },
          42
        ),
      /invalid workflow run conclusion/
    )
    assert.throws(
      () =>
        parseActionsWorkflowRunCancellationState(
          {
            id: 42,
            status: 'completed',
            conclusion: null,
            updated_at: 'x'.repeat(65),
          },
          42
        ),
      /invalid workflow run update time/
    )
  })
})
