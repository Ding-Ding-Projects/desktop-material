import assert from 'node:assert'
import { describe, it } from 'node:test'
import { IAPIWorkflow, IAPIWorkflowRun } from '../../../src/lib/api'
import {
  formatWorkflowRunElapsed,
  getLatestWorkflowRunElapsed,
  getWorkflowRunElapsed,
  hasRunningLatestWorkflowRun,
  hasRunningWorkflowRun,
} from '../../../src/lib/actions-workflow-run-elapsed'

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
    created_at: '2026-07-30T09:59:00Z',
    run_started_at: '2026-07-30T10:00:00Z',
    updated_at: '2026-07-30T10:01:00Z',
    ...overrides,
  } as IAPIWorkflowRun
}

const now = Date.parse('2026-07-30T10:02:00Z')

describe('workflow run elapsed time', () => {
  it('formats bounded glanceable durations without inventing a full second', () => {
    assert.equal(formatWorkflowRunElapsed(0), '<1s')
    assert.equal(formatWorkflowRunElapsed(999), '<1s')
    assert.equal(formatWorkflowRunElapsed(1_500), '2s')
    assert.equal(formatWorkflowRunElapsed(45_000), '45s')
    assert.equal(formatWorkflowRunElapsed(60_000), '1m')
    assert.equal(formatWorkflowRunElapsed(252_000), '4m 12s')
    assert.equal(formatWorkflowRunElapsed(3_600_000), '1h')
    assert.equal(formatWorkflowRunElapsed(4_500_000), '1h 15m')
    assert.equal(formatWorkflowRunElapsed(90_061_000), '1d 1h 1m 1s')
    assert.throws(() => formatWorkflowRunElapsed(Number.NaN), /finite/)
    assert.throws(() => formatWorkflowRunElapsed(-1), /finite/)
  })

  it('uses the execution start before the queued creation fallback', () => {
    assert.deepEqual(getWorkflowRunElapsed(run({ workflow_id: 7 }), now), {
      kind: 'completed',
      milliseconds: 60_000,
    })
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({ workflow_id: 7, run_started_at: undefined }),
        now
      ),
      { kind: 'completed', milliseconds: 120_000 }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({ workflow_id: 7, run_started_at: 'not-a-date' }),
        now
      ),
      { kind: 'unavailable' }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(run({ workflow_id: 7, run_started_at: '0' }), now),
      { kind: 'unavailable' }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({
          workflow_id: 7,
          run_started_at: '2026-02-30T10:00:00Z',
        }),
        now
      ),
      { kind: 'unavailable' }
    )
  })

  it('measures a running workflow against the injected wall clock', () => {
    const running = run({ workflow_id: 7, status: 'in_progress' })
    assert.deepEqual(getWorkflowRunElapsed(running, now), {
      kind: 'running',
      milliseconds: 120_000,
    })
    assert.equal(hasRunningWorkflowRun([running], now), true)
    assert.equal(
      hasRunningWorkflowRun(
        [run({ workflow_id: 7, status: 'completed' })],
        now
      ),
      false
    )
    assert.equal(
      hasRunningWorkflowRun(
        [
          run({
            workflow_id: 7,
            status: 'in_progress',
            run_started_at: undefined,
            created_at: 'not-a-date',
          }),
        ],
        now
      ),
      false
    )
  })

  it('distinguishes not-started states from unavailable provider timing', () => {
    for (const status of [
      'queued',
      'waiting',
      'pending',
      'requested',
    ] as const) {
      assert.deepEqual(
        getWorkflowRunElapsed(run({ workflow_id: 7, status }), now),
        { kind: 'pending' },
        status
      )
    }

    assert.deepEqual(
      getWorkflowRunElapsed(
        run({
          workflow_id: 7,
          status: 'in_progress',
          run_started_at: undefined,
          created_at: 'not-a-date',
        }),
        now
      ),
      { kind: 'unavailable' }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({
          workflow_id: 7,
          run_started_at: '2026-07-30T11:00:00Z',
          updated_at: '2026-07-30T11:01:00Z',
        }),
        now
      ),
      { kind: 'unavailable' }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({
          workflow_id: 7,
          updated_at: '2026-07-30T11:00:00Z',
        }),
        now
      ),
      { kind: 'unavailable' }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({ workflow_id: 7, updated_at: undefined }),
        now
      ),
      { kind: 'unavailable' }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({ workflow_id: 7, updated_at: 'not-a-date' }),
        now
      ),
      { kind: 'unavailable' }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({
          workflow_id: 7,
          updated_at: '2026-07-30T09:00:00Z',
        }),
        now
      ),
      { kind: 'unavailable' }
    )
    assert.deepEqual(
      getWorkflowRunElapsed(
        run({
          workflow_id: 7,
          status: 'in_progress',
          run_started_at: '2026-07-30T11:00:00Z',
        }),
        now
      ),
      { kind: 'unavailable' }
    )
  })

  it('reports the newest loaded run of the requested workflow', () => {
    const runs = [
      run({
        id: 1,
        workflow_id: 7,
        created_at: '2026-07-30T10:00:00Z',
        run_started_at: '2026-07-30T10:01:00Z',
        updated_at: '2026-07-30T10:06:00Z',
      }),
      run({
        id: 2,
        workflow_id: 7,
        status: 'in_progress',
        created_at: '2026-07-30T11:00:00Z',
        run_started_at: '2026-07-30T11:01:00Z',
      }),
      run({ id: 3, workflow_id: 8 }),
    ]

    assert.deepEqual(
      getLatestWorkflowRunElapsed(
        workflow(7),
        runs,
        Date.parse('2026-07-30T11:03:00Z')
      ),
      { kind: 'running', milliseconds: 120_000 }
    )
    assert.deepEqual(getLatestWorkflowRunElapsed(workflow(9), runs, now), {
      kind: 'none',
    })
  })

  it('does not promote a malformed matching run to a false duration', () => {
    assert.deepEqual(
      getLatestWorkflowRunElapsed(
        workflow(7),
        [
          run({
            id: 1,
            workflow_id: 7,
            created_at: '2026-07-30T09:00:00Z',
            run_started_at: '2026-07-30T09:01:00Z',
            updated_at: '2026-07-30T09:02:00Z',
          }),
          run({
            id: 2,
            workflow_id: 7,
            created_at: 'not-a-date',
            run_started_at: '2026-07-30T10:00:00Z',
          }),
        ],
        now
      ),
      { kind: 'unavailable' }
    )
  })

  it('ticks only when the latest rendered workflow run is running', () => {
    const w = workflow(7)
    const running = run({
      id: 1,
      workflow_id: 7,
      status: 'in_progress',
      created_at: '2026-07-30T09:59:00Z',
      run_started_at: '2026-07-30T10:00:00Z',
    })
    assert.equal(hasRunningLatestWorkflowRun([w], [running], now), true)

    const newerCompleted = run({
      id: 2,
      workflow_id: 7,
      created_at: '2026-07-30T10:01:00Z',
      run_started_at: '2026-07-30T10:01:00Z',
      updated_at: '2026-07-30T10:02:00Z',
    })
    assert.equal(
      hasRunningLatestWorkflowRun([w], [running, newerCompleted], now),
      false
    )
    assert.equal(
      hasRunningLatestWorkflowRun([], [running, newerCompleted], now),
      false
    )
  })
})
