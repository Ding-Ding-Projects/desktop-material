import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  md3ActionsJobs,
  md3ActionsRuns,
} from '../../src/ui/md3/md3-destination-adapters'
import {
  formatMd3RunDetail,
  formatMd3RunMeta,
} from '../../src/ui/md3/md3-actions-view'
import { IAPIWorkflowRun } from '../../src/lib/api'
import { IActionsJob, IActionsJobStep } from '../../src/lib/actions-jobs'

/**
 * The adapter that turns real workflow runs and jobs into the Actions rows.
 *
 * It had no test at all, and it is the layer that produced every defect this
 * file now guards. None of them was visible to the type checker — a hard-coded
 * `0` is a `number` and an empty login is a `string` — and none of them was
 * reachable from the view's own tests, because the contract fixtures already
 * carry real values for everything the adapter was inventing. A defect only
 * the adapter can produce needs a test on the adapter.
 *
 * The assertions below are written against the shapes the contract's
 * `renderVals()` computes: `#1482 · development · push · 2m 14s` for the meta
 * line and `failed · triggered by alice · 4f1c9ae · 6 jobs · … · attempt 2`
 * for the detail line.
 */

const Now = Date.parse('2026-08-10T09:45:00Z')

function apiRun(overrides: Partial<IAPIWorkflowRun> = {}): IAPIWorkflowRun {
  return {
    id: 90210,
    workflow_id: 12,
    cancel_url: 'https://api.github.com/cancel',
    logs_url: 'https://api.github.com/logs',
    rerun_url: 'https://api.github.com/rerun',
    check_suite_id: 5,
    name: 'Build and test',
    event: 'push',
    created_at: '2026-08-10T09:42:46Z',
    run_started_at: '2026-08-10T09:42:46Z',
    updated_at: '2026-08-10T09:45:00Z',
    run_number: 1482,
    run_attempt: 1,
    head_branch: 'development',
    head_sha: '4f1c9ae2b7d1c0a95f3e6d84b2c1a0f7e9d8c6b5',
    status: 'completed',
    conclusion: 'success',
    actor: {
      id: 1,
      login: 'alice',
      avatar_url: '',
      html_url: '',
      type: 'User',
    },
    ...overrides,
  }
}

const rowFor = (
  overrides: Partial<IAPIWorkflowRun> = {},
  source: {
    readonly jobCounts?: ReadonlyMap<number, number>
    readonly failed?: ReadonlySet<number>
  } = {}
) =>
  md3ActionsRuns({
    runs: [apiRun(overrides)],
    busyRunId: null,
    failedJobRunIds: source.failed ?? new Set<number>(),
    jobCounts: source.jobCounts,
    now: Now,
  })[0]

function step(overrides: Partial<IActionsJobStep> = {}): IActionsJobStep {
  return {
    name: 'Set up job',
    number: 1,
    status: 'completed',
    conclusion: 'success',
    startedAt: new Date('2026-08-10T09:42:46Z'),
    completedAt: new Date('2026-08-10T09:42:48Z'),
    ...overrides,
  }
}

function job(id: number, steps: ReadonlyArray<IActionsJobStep>): IActionsJob {
  return {
    id,
    runId: 90210,
    name: `job-${id}`,
    status: 'completed',
    conclusion: 'success',
    startedAt: new Date('2026-08-10T09:42:46Z'),
    completedAt: new Date('2026-08-10T09:44:00Z'),
    steps,
    htmlUrl: 'https://github.com/example/example/actions/runs/90210',
  }
}

describe('md3 actions adapter', () => {
  it('abbreviates the head SHA to the seven characters the row is drawn for', () => {
    const row = rowFor()

    assert.equal(row.sha, '4f1c9ae')
    assert.equal(
      row.sha?.length,
      7,
      'the detail line gives the SHA one ellipsing line beside the branch, ' +
        'the job count and the attempt; a full identifier pushes them out'
    )
  })

  it('reports no job count until the job page has been read', () => {
    // A run summary carries no job count. `0` there is not "unknown", it is
    // "this run has no jobs" — a claim no real run makes, and one the reader
    // cannot tell from a true one.
    assert.equal(rowFor().jobCount, null)
    assert.doesNotMatch(formatMd3RunDetail(rowFor()), /jobs/)
  })

  it('reports the real job count once the job page has arrived', () => {
    const row = rowFor({}, { jobCounts: new Map([[90210, 6]]) })

    assert.equal(row.jobCount, 6)
    assert.match(formatMd3RunDetail(row), / 6 jobs /)
  })

  it('omits an unreported run number rather than rendering #0', () => {
    const row = rowFor({ run_number: undefined })

    assert.equal(row.number, null)
    assert.equal(formatMd3RunMeta(row), 'development · push · 2m 14s')
    assert.doesNotMatch(formatMd3RunMeta(row), /#/)
  })

  it('omits an unreported actor rather than leaving the sentence dangling', () => {
    const row = rowFor({ actor: undefined })

    assert.equal(row.actor, null)
    assert.doesNotMatch(formatMd3RunDetail(row), /triggered by/)
    assert.doesNotMatch(
      formatMd3RunDetail(row),
      / · · /,
      'an absent segment takes its separator with it'
    )
  })

  it('omits an unreported branch rather than leaving a gap in the meta line', () => {
    const row = rowFor({ head_branch: null })

    assert.equal(row.branch, null)
    assert.equal(formatMd3RunMeta(row), '#1482 · push · 2m 14s')
  })

  it('renders the whole contract meta line from a fully reported run', () => {
    assert.equal(
      formatMd3RunMeta(rowFor()),
      '#1482 · development · push · 2m 14s'
    )
  })

  it('measures a running run against now, not against its last update', () => {
    // `updated_at` is whenever the provider last touched the record. A run in
    // its third minute whose record was written after two would keep reporting
    // two minutes for as long as it kept running.
    const row = rowFor({
      status: 'in_progress',
      conclusion: null,
      updated_at: '2026-08-10T09:43:00Z',
    })

    assert.equal(row.status, 'running')
    assert.equal(row.duration, '2m 14s')
  })

  it('keeps a completed run measured from start to finish', () => {
    const row = rowFor({ updated_at: '2026-08-10T09:44:00Z' })

    assert.equal(row.duration, '1m 14s')
  })

  it('says nothing about duration for a run that has not started', () => {
    const row = rowFor({
      status: 'queued',
      conclusion: null,
      created_at: '',
      run_started_at: undefined,
      updated_at: undefined,
    })

    assert.equal(row.duration, null)
    assert.equal(row.time, null)
    assert.doesNotMatch(formatMd3RunMeta(row), / · $/)
  })

  it('does not report a pending or requested run as running', () => {
    // Both are a run waiting on a gate. Spinning the progress glyph over one
    // says work is happening and time is being spent, and neither is true.
    assert.equal(
      rowFor({ status: 'pending', conclusion: null }).status,
      'queued'
    )
    assert.equal(
      rowFor({ status: 'requested', conclusion: null }).status,
      'queued'
    )
    assert.equal(
      rowFor({ status: 'in_progress', conclusion: null }).status,
      'running'
    )
  })

  it('opens the detail line with the contract vocabulary, not the API spelling', () => {
    // The provider writes `in_progress` and `failure`; the glyph, the tone and
    // the sentence all come from the five states the contract names.
    assert.match(
      formatMd3RunDetail(rowFor({ status: 'in_progress', conclusion: null })),
      /^running · /
    )
    assert.match(
      formatMd3RunDetail(rowFor({ conclusion: 'failure' })),
      /^failed · /
    )
    assert.equal(rowFor({ conclusion: 'failure' }).statusLabel, undefined)
  })

  it('keeps a conclusion that says more than the mapped status', () => {
    const row = rowFor({ conclusion: 'timed_out' })

    assert.equal(row.status, 'failed')
    assert.equal(row.statusLabel, 'timed out')
    assert.match(formatMd3RunDetail(row), /^timed out · /)
  })

  it('gives every step an id unique across the whole run', () => {
    // A step number is unique within its job and nowhere else: every job has a
    // step 1. The view compares the selected step id against every step of
    // every job, so a bare number selects the same-numbered step in all of
    // them at once.
    const jobs = md3ActionsJobs(
      [
        job(11, [step(), step({ name: 'Unit tests', number: 2 })]),
        job(22, [step(), step({ name: 'Build installer', number: 2 })]),
      ],
      null
    )

    const ids = jobs.flatMap(each => each.steps.map(x => x.id))
    assert.equal(new Set(ids).size, ids.length, `step ids collide: ${ids}`)
    assert.deepStrictEqual(ids, ['11:1', '11:2', '22:1', '22:2'])
  })

  it('times a running step and job against now, not against nothing', () => {
    // The one row whose elapsed time the reader is actually watching is the
    // unfinished one, and it is the only one with no `completedAt` to measure
    // against — so it was the only row in the list showing no time at all.
    const running: IActionsJob = {
      ...job(11, [
        step({ name: 'Set up job', number: 1 }),
        step({
          name: 'Build installer',
          number: 2,
          status: 'in_progress',
          conclusion: null,
          startedAt: new Date('2026-08-10T09:42:46Z'),
          completedAt: null,
        }),
        step({
          name: 'Upload artifacts',
          number: 3,
          status: 'queued',
          conclusion: null,
          startedAt: null,
          completedAt: null,
        }),
      ]),
      status: 'in_progress',
      conclusion: null,
      completedAt: null,
    }

    const [mapped] = md3ActionsJobs([running], null, Now)

    assert.equal(mapped.duration, '2m 14s')
    assert.equal(mapped.steps[0].duration, '2s')
    assert.equal(mapped.steps[1].duration, '2m 14s')
    assert.equal(
      mapped.steps[2].duration,
      '',
      'a step that has not started has no elapsed time, and 0s would claim ' +
        'it ran instantly'
    )
  })
})
