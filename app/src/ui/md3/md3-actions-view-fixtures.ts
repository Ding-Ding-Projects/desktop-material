import {
  IMd3ActionsAttempts,
  IMd3ActionsFilterOption,
  IMd3ActionsJob,
  IMd3ActionsPagination,
  IMd3ActionsRun,
  Md3ActionsFilterName,
} from './md3-actions-view'

/**
 * TEST AND PREVIEW DATA ONLY. Nothing here ships to a user.
 *
 * `Md3ActionsView` renders whatever the shell hands it; these fixtures exist so
 * a unit test, a screenshot harness or a local preview can mount the view
 * without an authenticated repository and a live Actions API behind it.
 *
 * The shapes and the sample values follow `design/History MD3.dc.html`'s
 * `runData()` and `jobSteps` so a capture of the view can be compared against
 * the drawn contract. Never import this module from application code.
 */

export const md3ActionsRunFixtures: ReadonlyArray<IMd3ActionsRun> = [
  {
    id: 'run-1482',
    name: 'Release',
    number: 1482,
    branch: 'development',
    event: 'push',
    duration: '2m 14s',
    status: 'running',
    actor: 'alice',
    sha: '4f1c9ae',
    jobCount: 6,
    time: '2m 14s',
    attempt: 1,
    cancellable: true,
    hasFailedJobs: false,
  },
  {
    id: 'run-1481',
    name: 'CI',
    number: 1481,
    branch: 'development',
    event: 'push',
    duration: '4m 02s',
    status: 'failed',
    actor: 'alice',
    sha: '9b2e740',
    jobCount: 6,
    time: '4m 02s',
    attempt: 2,
    cancellable: false,
    hasFailedJobs: true,
  },
  {
    id: 'run-1480',
    name: 'CI',
    number: 1480,
    branch: 'main',
    event: 'pull_request',
    duration: '3m 51s',
    status: 'success',
    actor: 'bjorn',
    sha: 'c07d115',
    jobCount: 6,
    time: '3m 51s',
    attempt: 1,
    cancellable: false,
    hasFailedJobs: false,
  },
  {
    id: 'run-1479',
    name: 'Nightly',
    number: 1479,
    branch: 'main',
    event: 'schedule',
    duration: '0m 09s',
    status: 'cancelled',
    actor: 'github-actions',
    sha: '5a3f6dd',
    jobCount: 2,
    time: '0m 09s',
    attempt: 1,
    cancellable: false,
    hasFailedJobs: false,
  },
]

export const md3ActionsJobFixtures: ReadonlyArray<IMd3ActionsJob> = [
  {
    id: 'job-build',
    name: 'build (windows-latest)',
    status: 'failed',
    duration: '2m 41s',
    canRerun: true,
    steps: [
      { id: 'step-1', name: 'Set up job', status: 'success', duration: '2s' },
      {
        id: 'step-2',
        name: 'Checkout repository',
        status: 'success',
        duration: '6s',
      },
      {
        id: 'step-3',
        name: 'Install dependencies',
        status: 'success',
        duration: '48s',
      },
      {
        id: 'step-4',
        name: 'Lint and typecheck',
        status: 'success',
        duration: '31s',
      },
      {
        id: 'step-5',
        name: 'Unit tests',
        status: 'failed',
        duration: '1m 04s',
      },
      {
        id: 'step-6',
        name: 'Upload artifacts',
        status: 'cancelled',
        duration: '0s',
      },
    ],
  },
  {
    id: 'job-package',
    name: 'package (windows-latest)',
    status: 'running',
    duration: '1m 12s',
    canRerun: false,
    steps: [
      { id: 'step-7', name: 'Set up job', status: 'success', duration: '2s' },
      {
        id: 'step-8',
        name: 'Build installer',
        status: 'running',
        duration: '1m 10s',
      },
    ],
  },
]

export const md3ActionsFilterOptionFixtures: Readonly<
  Record<Md3ActionsFilterName, ReadonlyArray<IMd3ActionsFilterOption>>
> = {
  workflow: [
    { value: 'all', label: 'All workflows' },
    { value: '1', label: 'CI' },
    { value: '2', label: 'Release' },
  ],
  branch: [
    { value: 'all', label: 'All branches' },
    { value: 'main', label: 'main' },
    { value: 'development', label: 'development' },
  ],
  event: [
    { value: 'all', label: 'All events' },
    { value: 'push', label: 'push' },
    { value: 'pull_request', label: 'pull_request' },
  ],
  status: [
    { value: 'all', label: 'Any status' },
    { value: 'queued', label: 'Queued' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'success', label: 'Success' },
    { value: 'failure', label: 'Failure' },
  ],
}

export const md3ActionsFilterValueFixtures: Readonly<
  Record<Md3ActionsFilterName, string>
> = {
  workflow: 'all',
  branch: 'all',
  event: 'all',
  status: 'all',
}

export const md3ActionsAttemptFixture: IMd3ActionsAttempts = {
  selected: 2,
  latest: 2,
  options: [1, 2],
}

export const md3ActionsPaginationFixture: IMd3ActionsPagination = {
  loadedCount: 4,
  totalCount: 670,
  hasMore: true,
  loadingMore: false,
  loadingAll: false,
}

/** A log exercising both contract rules: `$` commands and `FAIL` / `●` lines. */
export const md3ActionsLogFixture = [
  '$ npm run test:unit',
  '',
  'PASS  app/test/unit/md3-style-contract-test.ts',
  'FAIL  app/test/unit/md3-actions-view-test.tsx',
  '  ● renders the run detail line',
  '',
  '    Expected: "failed · triggered by alice · 4f1c9ae · 6 jobs"',
  '    Received: "failed · alice · 4f1c9ae"',
  '',
  'Error: 1 test failed.',
  '$ exit 1',
].join('\n')
