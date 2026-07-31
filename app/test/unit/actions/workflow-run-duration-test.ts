import assert from 'node:assert'
import { describe, it } from 'node:test'
import { IAPIWorkflow, IAPIWorkflowRun } from '../../../src/lib/api'
import {
  formatRunDuration,
  getLastRunDuration,
} from '../../../src/ui/actions/workflow-manager'

function workflow(id: number): IAPIWorkflow {
  return {
    id,
    name: `Workflow ${id}`,
    path: `.github/workflows/w${id}.yml`,
    state: 'active',
  } as IAPIWorkflow
}

function run(
  overrides: Partial<IAPIWorkflowRun> & { readonly workflow_id: number }
): IAPIWorkflowRun {
  return {
    id: 1,
    cancel_url: '',
    logs_url: '',
    rerun_url: '',
    check_suite_id: 1,
    event: 'push',
    name: 'run',
    status: 'completed',
    created_at: '2026-07-30T10:00:00Z',
    updated_at: '2026-07-30T10:01:00Z',
    ...overrides,
  } as IAPIWorkflowRun
}

describe('workflow run duration', () => {
  it('formats seconds, minutes and hours the way a glance reads them', () => {
    assert.equal(formatRunDuration(0), '1s')
    assert.equal(formatRunDuration(1_500), '2s')
    assert.equal(formatRunDuration(45_000), '45s')
    assert.equal(formatRunDuration(60_000), '1m')
    assert.equal(formatRunDuration(252_000), '4m 12s')
    assert.equal(formatRunDuration(3_600_000), '1h')
    assert.equal(formatRunDuration(4_500_000), '1h 15m')
  })

  it('reports the newest completed run of that workflow only', () => {
    const runs = [
      run({
        workflow_id: 7,
        created_at: '2026-07-30T10:00:00Z',
        updated_at: '2026-07-30T10:05:00Z',
      }),
      run({
        workflow_id: 7,
        created_at: '2026-07-30T12:00:00Z',
        updated_at: '2026-07-30T12:00:30Z',
      }),
      run({
        workflow_id: 8,
        created_at: '2026-07-30T13:00:00Z',
        updated_at: '2026-07-30T13:40:00Z',
      }),
    ]

    assert.equal(getLastRunDuration(workflow(7), runs), 30_000)
    assert.equal(getLastRunDuration(workflow(8), runs), 2_400_000)
  })

  it('reports nothing rather than a partial time for unfinished work', () => {
    const w = workflow(7)
    assert.equal(getLastRunDuration(w, []), null)
    assert.equal(
      getLastRunDuration(w, [run({ workflow_id: 7, status: 'in_progress' })]),
      null
    )
    assert.equal(
      getLastRunDuration(w, [run({ workflow_id: 7, updated_at: undefined })]),
      null
    )
    assert.equal(
      getLastRunDuration(w, [
        run({ workflow_id: 7, updated_at: 'not a date' }),
      ]),
      null
    )
    // A clock skew that ends the run before it started is discarded, not shown
    // as a negative duration.
    assert.equal(
      getLastRunDuration(w, [
        run({
          workflow_id: 7,
          created_at: '2026-07-30T10:05:00Z',
          updated_at: '2026-07-30T10:00:00Z',
        }),
      ]),
      null
    )
  })
})
