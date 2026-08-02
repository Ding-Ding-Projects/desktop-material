import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import {
  APICheckConclusion,
  APICheckStatus,
  IAPIWorkflow,
  IAPIWorkflowRun,
} from '../../../src/lib/api'
import { IActionsJob } from '../../../src/lib/actions-jobs'
import { RunList } from '../../../src/ui/actions/run-list'
import { WorkflowManager } from '../../../src/ui/actions/workflow-manager'
import { WorkflowRunReviewList } from '../../../src/ui/actions/workflow-run-review-list'
import { RunDetails } from '../../../src/ui/actions/run-details'
import { ActionsConfirmationDialog } from '../../../src/ui/actions/actions-confirmation-dialog'
import {
  getWorkflowStateAction,
  WorkflowStateControl,
} from '../../../src/ui/actions/workflow-state-control'
import { fireEvent, render, screen } from '../../helpers/ui/render'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { ActionsStore } from '../../../src/lib/stores/actions-store'
import { Repository } from '../../../src/models/repository'
import {
  IWorkflowRunElapsedClock,
  WorkflowRunElapsedRefreshIntervalMs,
} from '../../../src/lib/actions-workflow-run-elapsed'
import { LanguageModeChangedEvent } from '../../../src/lib/i18n'

const actionsStyles = readFileSync(
  join(process.cwd(), 'app/styles/ui/_actions-view.scss'),
  'utf8'
)

const gitHubRepository = new GitHubRepository(
  'repo',
  new Owner('owner', 'https://api.github.com', 1),
  1
)
const repository = new Repository('C:/repo', 1, gitHubRepository, false)
const actionsStore = {
  fetchArtifacts: async () => ({
    totalCount: 0,
    artifacts: [],
    page: 1,
    nextPage: null,
    truncated: false,
  }),
  fetchPendingDeployments: async () => [],
  fetchRunReviewHistory: async () => [],
} as unknown as ActionsStore

const createRun = (
  status: APICheckStatus,
  conclusion: APICheckConclusion | null,
  overrides: Partial<IAPIWorkflowRun> = {}
): IAPIWorkflowRun => ({
  id: 7,
  workflow_id: 3,
  cancel_url: 'https://api.github.com/cancel',
  created_at: '2026-07-12T12:00:00Z',
  logs_url: 'https://api.github.com/logs',
  name: 'CI',
  rerun_url: 'https://api.github.com/rerun',
  check_suite_id: 9,
  event: 'push',
  display_title: 'A very long workflow run title that must remain responsive',
  run_number: 42,
  head_branch: 'feature/actions-parity',
  status,
  conclusion,
  html_url: 'https://github.com/owner/repo/actions/runs/7',
  ...overrides,
})

class FakeElapsedClock implements IWorkflowRunElapsedClock {
  private nextIntervalId = 1
  private readonly intervals = new Map<
    number,
    { readonly callback: () => void; readonly milliseconds: number }
  >()

  public constructor(private currentTime: number) {}

  public readonly now = () => this.currentTime

  public readonly setInterval = (
    callback: () => void,
    milliseconds: number
  ) => {
    const intervalId = this.nextIntervalId++
    this.intervals.set(intervalId, { callback, milliseconds })
    return intervalId
  }

  public readonly clearInterval = (intervalId: number) => {
    this.intervals.delete(intervalId)
  }

  public advance(milliseconds: number) {
    this.currentTime += milliseconds
    for (const interval of this.intervals.values()) {
      interval.callback()
    }
  }

  public get activeIntervalCount(): number {
    return this.intervals.size
  }

  public get intervalDurations(): ReadonlyArray<number> {
    return [...this.intervals.values()].map(interval => interval.milliseconds)
  }
}

const createJob = (
  id: number,
  name: string,
  conclusion: APICheckConclusion
): IActionsJob => ({
  id,
  runId: 7,
  name,
  status: APICheckStatus.Completed,
  conclusion,
  completedAt: new Date('2026-07-12T12:01:00Z'),
  startedAt: new Date('2026-07-12T12:00:00Z'),
  steps: [],
  htmlUrl: `https://github.com/owner/repo/actions/runs/7/job/${id}`,
})

const createWorkflow = (
  state: IAPIWorkflow['state'],
  name: string = 'CI'
): IAPIWorkflow => ({
  id: 3,
  name,
  path: '.github/workflows/ci.yml',
  state,
  html_url: 'https://github.com/owner/repo/actions/workflows/ci.yml',
  created_at: '2026-07-12T12:00:00Z',
  updated_at: '2026-07-12T12:00:00Z',
})

describe('Actions parity controls', () => {
  it('keeps compact elapsed copy opaque on tinted interaction surfaces', () => {
    const runMeta = actionsStyles.match(/\.actions-run-meta\s*\{([\s\S]*?)\n\}/)
    assert.ok(runMeta)
    assert.doesNotMatch(runMeta[1], /\bopacity\s*:/)
    assert.match(
      actionsStyles,
      /\.actions-run-card\s*\{[\s\S]*?&:hover\s*\{[\s\S]*?\.actions-run-elapsed\s*\{[\s\S]*?color: var\(--md-sys-color-on-surface\);[\s\S]*?&\.selected\s*\{[\s\S]*?\.actions-run-elapsed\s*\{[\s\S]*?color: var\(--md-sys-color-on-secondary-container\);/
    )
    assert.match(
      actionsStyles,
      /\.workflow-dispatch-option\s*\{[\s\S]*?&:hover\s*\{[\s\S]*?\.workflow-dispatch-option-elapsed\s*\{[\s\S]*?color: var\(--md-sys-color-on-surface\);[\s\S]*?&\.selected\s*\{[\s\S]*?\.workflow-dispatch-option-elapsed\s*\{[\s\S]*?color: var\(--md-sys-color-on-primary-container\);/
    )
  })

  it('shows and advances truthful elapsed time with one mounted-list timer', () => {
    const start = Date.parse('2026-07-12T12:00:00Z')
    const elapsedClock = new FakeElapsedClock(start + 120_000)
    const running = createRun(APICheckStatus.InProgress, null, {
      run_started_at: new Date(start).toISOString(),
    })
    const view = render(
      <RunList
        runs={[running]}
        selectedRunId={null}
        busyRunId={null}
        elapsedClock={elapsedClock}
        onSelect={() => {}}
        onRerun={() => {}}
        onRerunFailed={() => {}}
        onRequestCancel={() => {}}
      />
    )

    act(() => {
      document.dispatchEvent(
        new CustomEvent(LanguageModeChangedEvent, { detail: 'english' })
      )
    })
    assert.equal(screen.getAllByText('Elapsed 2m').length, 2)
    assert.equal(elapsedClock.activeIntervalCount, 1)
    assert.deepEqual(elapsedClock.intervalDurations, [
      WorkflowRunElapsedRefreshIntervalMs,
    ])

    act(() => elapsedClock.advance(1_000))
    assert.equal(screen.getAllByText('Elapsed 2m 1s').length, 2)

    act(() => {
      document.dispatchEvent(
        new CustomEvent(LanguageModeChangedEvent, { detail: 'bilingual' })
      )
    })
    const bilingualElapsed = screen.getByText('Elapsed 2m 1s · 行咗 2m 1s')
    assert.equal(bilingualElapsed.getAttribute('aria-hidden'), 'true')
    assert.equal(
      bilingualElapsed.nextElementSibling?.textContent,
      'Elapsed 2m 1s'
    )

    view.rerender(
      <RunList
        runs={[createRun(APICheckStatus.Queued, null)]}
        selectedRunId={null}
        busyRunId={null}
        elapsedClock={elapsedClock}
        onSelect={() => {}}
        onRerun={() => {}}
        onRerunFailed={() => {}}
        onRequestCancel={() => {}}
      />
    )
    assert.ok(
      screen.getByText('Elapsed: waiting to start · 已用時間：等緊開跑')
    )
    assert.equal(elapsedClock.activeIntervalCount, 0)
    view.unmount()
    assert.equal(elapsedClock.activeIntervalCount, 0)
  })

  it('labels every workflow row with running, completed, pending, unavailable, or no-run timing', () => {
    const start = Date.parse('2026-07-12T12:00:00Z')
    const elapsedClock = new FakeElapsedClock(start + 120_000)
    const workflows = [
      createWorkflow('active', 'Completed CI'),
      { ...createWorkflow('active', 'Queued CI'), id: 4 },
      { ...createWorkflow('active', 'Unknown CI'), id: 5 },
      { ...createWorkflow('active', 'Never run CI'), id: 6 },
      { ...createWorkflow('active', 'Running CI'), id: 7 },
    ]
    const view = render(
      <WorkflowManager
        workflows={workflows}
        runs={[
          createRun(APICheckStatus.Completed, APICheckConclusion.Success, {
            workflow_id: 3,
            created_at: '2026-07-12T11:59:00Z',
            run_started_at: '2026-07-12T12:00:00Z',
            updated_at: '2026-07-12T12:01:00Z',
          }),
          createRun(APICheckStatus.Queued, null, {
            id: 8,
            workflow_id: 4,
          }),
          createRun(APICheckStatus.Completed, APICheckConclusion.Success, {
            id: 9,
            workflow_id: 5,
            created_at: 'not-a-date',
            updated_at: undefined,
          }),
          createRun(APICheckStatus.InProgress, null, {
            id: 10,
            workflow_id: 7,
            run_started_at: new Date(start).toISOString(),
          }),
        ]}
        busyWorkflowId={null}
        elapsedClock={elapsedClock}
        onRequestChange={() => {}}
        onNewWorkflow={() => {}}
      />
    )

    act(() => {
      document.dispatchEvent(
        new CustomEvent(LanguageModeChangedEvent, { detail: 'english' })
      )
    })
    assert.equal(screen.getAllByText('Last run 1m').length, 2)
    assert.equal(screen.getAllByText('Latest run: waiting to start').length, 2)
    assert.equal(screen.getAllByText('Latest run time unavailable').length, 2)
    assert.equal(screen.getAllByText('No loaded run time').length, 2)
    assert.equal(screen.getAllByText('Current run 2m').length, 2)
    assert.equal(elapsedClock.activeIntervalCount, 1)
    act(() => elapsedClock.advance(1_000))
    assert.equal(screen.getAllByText('Current run 2m 1s').length, 2)
    view.unmount()
    assert.equal(elapsedClock.activeIntervalCount, 0)
  })

  it('ticks only for visible workflows whose latest run is running', () => {
    const start = Date.parse('2026-07-12T12:00:00Z')
    const elapsedClock = new FakeElapsedClock(start + 300_000)
    const completedWorkflow = createWorkflow('active', 'Completed CI')
    const runningWorkflow = {
      ...createWorkflow('active', 'Running CI'),
      id: 4,
    }
    const view = render(
      <WorkflowManager
        workflows={[completedWorkflow, runningWorkflow]}
        runs={[
          createRun(APICheckStatus.InProgress, null, {
            id: 20,
            workflow_id: completedWorkflow.id,
            created_at: '2026-07-12T12:00:00Z',
            run_started_at: '2026-07-12T12:00:00Z',
          }),
          createRun(APICheckStatus.Completed, APICheckConclusion.Success, {
            id: 21,
            workflow_id: completedWorkflow.id,
            created_at: '2026-07-12T12:02:00Z',
            run_started_at: '2026-07-12T12:02:00Z',
            updated_at: '2026-07-12T12:03:00Z',
          }),
          createRun(APICheckStatus.InProgress, null, {
            id: 22,
            workflow_id: runningWorkflow.id,
            created_at: '2026-07-12T12:01:00Z',
            run_started_at: '2026-07-12T12:01:00Z',
          }),
        ]}
        busyWorkflowId={null}
        elapsedClock={elapsedClock}
        onRequestChange={() => {}}
        onNewWorkflow={() => {}}
      />
    )

    assert.equal(elapsedClock.activeIntervalCount, 1)
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Filter workflows' }),
      {
        target: { value: 'Completed CI' },
      }
    )
    assert.equal(screen.queryByText('Running CI'), null)
    assert.equal(elapsedClock.activeIntervalCount, 0)

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Filter workflows' }),
      {
        target: { value: 'Running CI' },
      }
    )
    assert.equal(screen.queryByText('Completed CI'), null)
    assert.equal(elapsedClock.activeIntervalCount, 1)
    view.unmount()
    assert.equal(elapsedClock.activeIntervalCount, 0)
  })

  it('shows completed and malformed timing explicitly on run rows', () => {
    const elapsedClock = new FakeElapsedClock(
      Date.parse('2026-07-12T12:02:00Z')
    )
    render(
      <RunList
        runs={[
          createRun(APICheckStatus.Completed, APICheckConclusion.Success, {
            id: 70,
            run_started_at: '2026-07-12T12:00:00Z',
            updated_at: '2026-07-12T12:01:00Z',
          }),
          createRun(APICheckStatus.Completed, APICheckConclusion.Failure, {
            id: 71,
            run_number: 43,
            run_started_at: 'malformed',
            updated_at: '2026-07-12T12:01:00Z',
          }),
        ]}
        selectedRunId={null}
        busyRunId={null}
        elapsedClock={elapsedClock}
        onSelect={() => {}}
        onRerun={() => {}}
        onRerunFailed={() => {}}
        onRequestCancel={() => {}}
      />
    )

    assert.equal(screen.getAllByText('Elapsed 1m').length, 2)
    assert.equal(screen.getAllByText('Elapsed: unavailable').length, 2)
    assert.equal(elapsedClock.activeIntervalCount, 0)
  })

  it('keeps elapsed timing in the reviewed bulk-run list', () => {
    const start = Date.parse('2026-07-12T12:00:00Z')
    const elapsedClock = new FakeElapsedClock(start + 120_000)
    const view = render(
      <WorkflowRunReviewList
        runs={[
          createRun(APICheckStatus.InProgress, null, {
            run_started_at: new Date(start).toISOString(),
          }),
          createRun(APICheckStatus.Queued, null, {
            id: 8,
            run_number: 43,
          }),
        ]}
        elapsedClock={elapsedClock}
      />
    )

    assert.equal(screen.getAllByText('Elapsed 2m').length, 2)
    assert.equal(screen.getAllByText('Elapsed: waiting to start').length, 2)
    assert.equal(elapsedClock.activeIntervalCount, 1)

    act(() => elapsedClock.advance(1_000))
    assert.equal(screen.getAllByText('Elapsed 2m 1s').length, 2)
    view.unmount()
    assert.equal(elapsedClock.activeIntervalCount, 0)
  })

  it('pauses live elapsed updates while the workflow list is hidden', () => {
    const start = Date.parse('2026-07-12T12:00:00Z')
    const elapsedClock = new FakeElapsedClock(start + 120_000)
    let visibilityState: DocumentVisibilityState = 'hidden'
    const previousVisibilityDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'visibilityState'
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    })

    try {
      const view = render(
        <RunList
          runs={[
            createRun(APICheckStatus.InProgress, null, {
              run_started_at: new Date(start).toISOString(),
            }),
          ]}
          selectedRunId={null}
          busyRunId={null}
          elapsedClock={elapsedClock}
          onSelect={() => {}}
          onRerun={() => {}}
          onRerunFailed={() => {}}
          onRequestCancel={() => {}}
        />
      )
      assert.equal(elapsedClock.activeIntervalCount, 0)

      visibilityState = 'visible'
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      assert.equal(elapsedClock.activeIntervalCount, 1)

      visibilityState = 'hidden'
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      assert.equal(elapsedClock.activeIntervalCount, 0)
      view.unmount()
    } finally {
      if (previousVisibilityDescriptor === undefined) {
        delete (document as { visibilityState?: DocumentVisibilityState })
          .visibilityState
      } else {
        Object.defineProperty(
          document,
          'visibilityState',
          previousVisibilityDescriptor
        )
      }
    }
  })

  it('offers cancellation only while a run is active', () => {
    let requested: IAPIWorkflowRun | null = null
    const run = createRun(APICheckStatus.InProgress, null)
    const view = render(
      <RunList
        runs={[run]}
        selectedRunId={null}
        busyRunId={null}
        onSelect={() => {}}
        onRerun={() => {}}
        onRerunFailed={() => {}}
        onRequestCancel={value => (requested = value)}
      />
    )

    assert.equal(screen.queryByRole('button', { name: 'Re-run' }), null)
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel workflow run 42' })
    )
    assert.equal(requested, run)

    view.rerender(
      <RunList
        runs={[createRun(APICheckStatus.Completed, APICheckConclusion.Failure)]}
        selectedRunId={null}
        busyRunId={null}
        onSelect={() => {}}
        onRerun={() => {}}
        onRerunFailed={() => {}}
        onRequestCancel={() => {}}
      />
    )
    assert.equal(
      screen.queryByRole('button', { name: 'Cancel workflow run 42' }),
      null
    )
    assert.ok(screen.getByRole('button', { name: 'Re-run' }))
  })

  it('re-runs only an individual failed job', () => {
    const failed = createJob(
      11,
      'Build Windows package with an intentionally long descriptive name',
      APICheckConclusion.Failure
    )
    const succeeded = createJob(12, 'Lint', APICheckConclusion.Success)
    let requested: IActionsJob | null = null
    render(
      <RunDetails
        repository={repository}
        actionsStore={actionsStore}
        run={createRun(APICheckStatus.Completed, APICheckConclusion.Failure)}
        jobs={[failed, succeeded]}
        jobsTotalCount={2}
        jobsNextPage={null}
        jobsPage={1}
        jobsTruncated={false}
        loading={false}
        loadingMore={false}
        error={null}
        selectedAttempt={null}
        onClose={() => {}}
        onAttemptChange={() => {}}
        onLoadMoreJobs={() => {}}
        onReloadJobs={() => {}}
        busyJobId={null}
        onRerunJob={job => (requested = job)}
      />
    )

    const button = screen.getByRole('button', {
      name: `Re-run job: ${failed.name}`,
    })
    fireEvent.click(button)
    assert.equal(requested, failed)
    assert.equal(
      screen.queryByRole('button', {
        name: `Re-run job: ${succeeded.name}`,
      }),
      null
    )
  })

  it('requires confirmation and keeps force cancellation out of the primary action', () => {
    let confirmed = 0
    render(
      <ActionsConfirmationDialog
        eyebrow="Destructive action"
        title="Cancel workflow run?"
        description={<p>Cancel this run?</p>}
        confirmLabel="Cancel run"
        submitting={false}
        onConfirm={() => confirmed++}
        onDismissed={() => {}}
      />
    )

    assert.ok(screen.getByRole('alertdialog'))
    assert.equal(screen.queryByText(/Force cancellation/), null)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    assert.equal(confirmed, 1)
  })

  it('maps active and disabled workflow states to confirmed mutations', () => {
    assert.deepEqual(getWorkflowStateAction(createWorkflow('active')), {
      enabled: false,
      label: 'Disable workflow',
    })
    assert.deepEqual(
      getWorkflowStateAction(createWorkflow('disabled_manually')),
      { enabled: true, label: 'Enable workflow' }
    )
    assert.equal(getWorkflowStateAction(createWorkflow('deleted')), null)

    const longName =
      'A workflow name long enough to exercise responsive wrapping without overlapping adjacent controls'
    const workflow = createWorkflow('disabled_inactivity', longName)
    let requested: { workflow: IAPIWorkflow; enabled: boolean } | null = null
    render(
      <WorkflowStateControl
        workflow={workflow}
        busyWorkflowId={null}
        onRequestChange={(value, enabled) =>
          (requested = { workflow: value, enabled })
        }
      />
    )

    assert.ok(screen.getByText(longName))
    fireEvent.click(
      screen.getByRole('button', { name: `Enable workflow: ${longName}` })
    )
    assert.deepEqual(requested, { workflow, enabled: true })
  })
})
