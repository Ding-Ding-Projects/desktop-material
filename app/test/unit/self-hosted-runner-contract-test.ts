import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readBoundedActionsJSON } from '../../src/lib/actions-response'
import { SelfHostedRunnerAccountCredentials } from '../../src/lib/self-hosted-runner/account-credentials'
import {
  buildLinuxRunnerConfigurationScript,
  buildWindowsRunnerConfigurationInvocation,
  buildWindowsRunnerRemovalInvocation,
} from '../../src/lib/self-hosted-runner/registration-command'
import { assessSelfHostedWorkflowRisk } from '../../src/lib/self-hosted-runner/workflow-trust'
import {
  SelfHostedRunnerManagerError,
  WindowsSelfHostedRunnerManager,
} from '../../src/main-process/self-hosted-runner/manager'
import {
  runSelfHostedRunnerProcess,
  waitForSelfHostedRunnerProcessStop,
} from '../../src/main-process/self-hosted-runner/process-runner'
import {
  assertNoQueuedJobsForRunner,
  QueuedJobAuditError,
} from '../../src/main-process/self-hosted-runner/queued-job-audit'
import {
  fetchRepositoryRunnerInventory,
  IRepositoryRunnerInventoryEntry,
  RunnerReadinessError,
  runnerMeetsReadiness,
  waitForRunnerReadiness,
} from '../../src/main-process/self-hosted-runner/runner-readiness'
import { beginTimedFetch } from '../../src/main-process/self-hosted-runner/timed-fetch'
import {
  auditRepositoryWorkflowsForSelfHostedRunner,
  RepositoryWorkflowAuditError,
} from '../../src/main-process/self-hosted-runner/workflow-audit'
import { killTreeAndWait } from '../../src/main-process/build-run/kill-tree'
import { parseManageableWslDistributions } from '../../src/main-process/self-hosted-runner/wsl-distributions'

interface IRecordedFetchRequest {
  readonly url: string
  readonly init: RequestInit | undefined
}

function jsonResponse(value: unknown, status: number = 200): Response {
  const body = JSON.stringify(value)
  return new Response(body, {
    status,
    headers: {
      'content-length': String(Buffer.byteLength(body)),
      'content-type': 'application/json',
    },
  })
}

function sequencedFetch(
  responses: ReadonlyArray<Response>,
  requests: IRecordedFetchRequest[] = []
): typeof fetch {
  let index = 0
  return (async (input, init) => {
    requests.push({ url: String(input), init })
    const response = responses[index++]
    if (response === undefined) {
      throw new Error('unexpected-fetch')
    }
    return response
  }) as typeof fetch
}

const workflowAuditRequest = {
  endpoint: 'https://api.github.com/',
  owner: 'owner',
  repository: 'repository',
  token: 'test-token',
  runnerLabels: ['desktop-material-windows-local', 'Windows', 'X64'],
}

const queuedJobAuditRequest = {
  endpoint: 'https://api.github.com/',
  owner: 'owner',
  repository: 'repository',
  token: 'test-token',
  runnerLabels: [
    'self-hosted',
    'Windows',
    'X64',
    'desktop-material-windows-local',
  ],
}

describe('self-hosted runner setup contracts', () => {
  it('keeps same-endpoint account credentials distinct by stable identity', () => {
    const credentials = new SelfHostedRunnerAccountCredentials()
    credentials.update([
      {
        accountKey: 'https://api.github.com/#101',
        endpoint: 'https://api.github.com/',
        token: 'account-one-token',
      },
      {
        accountKey: 'https://api.github.com/#202',
        endpoint: 'https://api.github.com/',
        token: 'account-two-token',
      },
    ])

    assert.equal(
      credentials.resolve(
        'https://api.github.com/#101',
        'https://api.github.com/'
      ),
      'account-one-token'
    )
    assert.equal(
      credentials.resolve(
        'https://api.github.com/#202',
        'https://api.github.com/'
      ),
      'account-two-token'
    )
    assert.equal(
      credentials.resolve(
        'https://api.github.com/#101',
        'https://enterprise.example/api/v3/'
      ),
      null
    )
  })

  it('ignores malformed and identity-free credential snapshots', () => {
    const credentials = new SelfHostedRunnerAccountCredentials()
    credentials.update([
      { endpoint: 'https://api.github.com/', token: 'missing-key' },
      {
        accountKey: 'invalid\nkey',
        endpoint: 'https://api.github.com/',
        token: 'invalid-key-token',
      },
      {
        accountKey: 'https://api.github.com/#303',
        endpoint: 'http://api.github.com/',
        token: 'insecure-endpoint-token',
      },
    ])

    assert.equal(
      credentials.resolve(
        'https://api.github.com/#303',
        'https://api.github.com/'
      ),
      null
    )
  })

  it('keeps Windows tokens out of argv and never replaces a runner', () => {
    const hostileToken = 'dummy&echo TOKEN_INTERPOLATION_EXECUTED'
    const configure = buildWindowsRunnerConfigurationInvocation(
      {
        configPath: 'C:\\runner\\config.cmd',
        repositoryURL: 'https://github.com/owner/repository',
        name: 'repository-windows-runner',
        labels: ['repository-windows-local'],
      },
      hostileToken
    )
    const remove = buildWindowsRunnerRemovalInvocation(
      'C:\\runner\\config.cmd',
      hostileToken
    )

    for (const invocation of [configure, remove]) {
      assert.equal(invocation.command.includes(hostileToken), false)
      assert.equal(invocation.command.includes('%RUNNER_'), false)
      assert.equal(invocation.command.includes('--token'), false)
      assert.equal(invocation.command.includes('--replace'), false)
      assert.deepEqual(invocation.environment, {
        ACTIONS_RUNNER_INPUT_TOKEN: hostileToken,
      })
    }
  })

  it('never replaces an existing Linux runner registration', () => {
    const script = buildLinuxRunnerConfigurationScript(
      '/opt/desktop-material-runners/runner-id',
      'https://github.com/owner/repository',
      'repository-linux-runner',
      ['repository-wsl-local']
    )

    assert.match(script, /IFS= read -r RUNNER_REGISTRATION_TOKEN/)
    assert.doesNotMatch(script, /--replace/)
  })

  it('keeps the network deadline active while a response body stalls', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'))
      },
    })
    let timedFetch: Awaited<ReturnType<typeof beginTimedFetch>> | null = null
    try {
      timedFetch = await beginTimedFetch(
        'https://api.github.test/stall',
        {},
        100,
        {
          fetch: async () => new Response(body),
        }
      )
      await assert.rejects(
        readBoundedActionsJSON(timedFetch.response, timedFetch.signal),
        error =>
          typeof error === 'object' &&
          error !== null &&
          (error as { name?: unknown }).name === 'AbortError'
      )
    } finally {
      timedFetch?.dispose()
    }
  })

  it('audits public repositories without the private-only fork policy endpoint', async () => {
    const commitSHA = 'a'.repeat(40)
    const requests: IRecordedFetchRequest[] = []
    const result = await auditRepositoryWorkflowsForSelfHostedRunner(
      workflowAuditRequest,
      {
        fetch: sequencedFetch(
          [
            jsonResponse({ private: false, default_branch: 'main' }),
            jsonResponse({ sha: commitSHA }),
            jsonResponse({}, 404),
          ],
          requests
        ),
      }
    )
    assert.deepEqual(result, { commitSHA, workflowCount: 0 })
    assert.equal(requests.length, 3)
    assert.doesNotMatch(requests[1].url, /fork-pr-workflows-private-repos/)
  })

  it('blocks unknown repository visibility before reading workflows', async () => {
    const requests: IRecordedFetchRequest[] = []
    await assert.rejects(
      auditRepositoryWorkflowsForSelfHostedRunner(workflowAuditRequest, {
        fetch: sequencedFetch(
          [jsonResponse({ default_branch: 'main' })],
          requests
        ),
      }),
      error =>
        error instanceof RepositoryWorkflowAuditError &&
        error.kind === 'unavailable'
    )
    assert.equal(requests.length, 1)
  })

  it('fails closed unless private fork pull-request workflows cannot run', async () => {
    const commitSHA = 'f'.repeat(40)
    const enabledRequests: IRecordedFetchRequest[] = []
    await assert.rejects(
      auditRepositoryWorkflowsForSelfHostedRunner(workflowAuditRequest, {
        fetch: sequencedFetch(
          [
            jsonResponse({
              private: true,
              allow_forking: false,
              default_branch: 'main',
            }),
            jsonResponse({ run_workflows_from_fork_pull_requests: true }),
          ],
          enabledRequests
        ),
      }),
      error => {
        assert.ok(error instanceof RepositoryWorkflowAuditError)
        assert.equal(error.kind, 'unsafe')
        assert.deepEqual(error.findings, [
          {
            path: '<repository-actions-policy>',
            job: '*',
            trigger: 'pull_request',
            reason: 'untrusted-workflow-source',
          },
        ])
        return true
      }
    )
    assert.equal(enabledRequests.length, 2)
    assert.equal(
      enabledRequests[1].url,
      'https://api.github.com/repos/owner/repository/actions/permissions/fork-pr-workflows-private-repos'
    )

    for (const policyResponse of [
      jsonResponse({}),
      jsonResponse({}, 403),
      jsonResponse({}, 404),
    ]) {
      await assert.rejects(
        auditRepositoryWorkflowsForSelfHostedRunner(workflowAuditRequest, {
          fetch: sequencedFetch([
            jsonResponse({
              private: true,
              allow_forking: true,
              default_branch: 'main',
            }),
            policyResponse,
          ]),
        }),
        error =>
          error instanceof RepositoryWorkflowAuditError &&
          error.kind === 'unavailable'
      )
    }

    const disabled = await auditRepositoryWorkflowsForSelfHostedRunner(
      workflowAuditRequest,
      {
        fetch: sequencedFetch([
          jsonResponse({
            private: true,
            allow_forking: true,
            default_branch: 'main',
          }),
          jsonResponse({ run_workflows_from_fork_pull_requests: false }),
          jsonResponse({ sha: commitSHA }),
          jsonResponse({}, 404),
        ]),
      }
    )
    assert.deepEqual(disabled, { commitSHA, workflowCount: 0 })
  })

  it('audits every workflow from one immutable default-branch commit', async () => {
    const commitSHA = 'a'.repeat(40)
    const requests: IRecordedFetchRequest[] = []
    const result = await auditRepositoryWorkflowsForSelfHostedRunner(
      workflowAuditRequest,
      {
        fetch: sequencedFetch(
          [
            jsonResponse({
              private: true,
              allow_forking: false,
              default_branch: 'main',
            }),
            jsonResponse({ run_workflows_from_fork_pull_requests: false }),
            jsonResponse({ sha: commitSHA }),
            jsonResponse([
              {
                type: 'file',
                path: '.github/workflows/build.yml',
                size: 92,
              },
            ]),
            new Response(
              `on: [workflow_dispatch]\njobs:\n  build:\n    runs-on: [self-hosted, Windows, X64]\n`
            ),
          ],
          requests
        ),
      }
    )

    assert.deepEqual(result, { commitSHA, workflowCount: 1 })
    assert.equal(requests.length, 5)
    assert.equal(
      requests[3].url,
      `https://api.github.com/repos/owner/repository/contents/.github/workflows?ref=${commitSHA}`
    )
    assert.equal(
      requests[4].url,
      `https://api.github.com/repos/owner/repository/contents/.github/workflows/build.yml?ref=${commitSHA}`
    )
    for (const request of requests) {
      assert.equal(request.url.includes(workflowAuditRequest.token), false)
      assert.equal(
        new Headers(request.init?.headers).get('authorization'),
        `Bearer ${workflowAuditRequest.token}`
      )
      assert.equal(request.init?.redirect, 'error')
    }
  })

  it('reports unsafe workflows with their immutable path and trigger', async () => {
    const commitSHA = 'b'.repeat(40)
    await assert.rejects(
      auditRepositoryWorkflowsForSelfHostedRunner(workflowAuditRequest, {
        fetch: sequencedFetch([
          jsonResponse({
            private: true,
            allow_forking: false,
            default_branch: 'main',
          }),
          jsonResponse({ run_workflows_from_fork_pull_requests: false }),
          jsonResponse({ sha: commitSHA }),
          jsonResponse([
            {
              type: 'file',
              path: '.github/workflows/pull-request.yml',
              size: 86,
            },
          ]),
          new Response(
            `on: [pull_request]\njobs:\n  build:\n    runs-on: [self-hosted, Windows, X64]\n`
          ),
        ]),
      }),
      error => {
        assert.ok(error instanceof RepositoryWorkflowAuditError)
        assert.equal(error.kind, 'unsafe')
        assert.deepEqual(error.findings, [
          {
            path: '.github/workflows/pull-request.yml',
            job: '*',
            trigger: 'pull_request',
            reason: 'untrusted-workflow-source',
          },
        ])
        return true
      }
    )
  })

  it('fails closed on malformed, oversized, or stalled audit responses', async () => {
    const malformed = new Response('{not-json')
    const oversized = new Response('{}', {
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    })
    const stalled = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"private":'))
        },
      })
    )

    for (const candidate of [malformed, oversized]) {
      await assert.rejects(
        auditRepositoryWorkflowsForSelfHostedRunner(workflowAuditRequest, {
          fetch: sequencedFetch([candidate]),
        }),
        error =>
          error instanceof RepositoryWorkflowAuditError &&
          error.kind === 'unavailable'
      )
    }
    await assert.rejects(
      auditRepositoryWorkflowsForSelfHostedRunner(workflowAuditRequest, {
        fetch: sequencedFetch([stalled]),
        timeoutMilliseconds: 50,
      }),
      error =>
        error instanceof RepositoryWorkflowAuditError &&
        error.kind === 'unavailable'
    )
  })

  it('blocks historical pending jobs whose labels can claim the runner', async () => {
    const requests: IRecordedFetchRequest[] = []
    await assert.rejects(
      assertNoQueuedJobsForRunner(queuedJobAuditRequest, {
        fetch: sequencedFetch(
          [
            jsonResponse({ total_count: 0, workflow_runs: [] }),
            jsonResponse({ total_count: 0, workflow_runs: [] }),
            jsonResponse({
              total_count: 1,
              workflow_runs: [
                {
                  id: 7001,
                  status: 'queued',
                  run_attempt: 1,
                  updated_at: '2026-08-08T01:00:00Z',
                },
              ],
            }),
            jsonResponse({ total_count: 0, workflow_runs: [] }),
            jsonResponse({ total_count: 0, workflow_runs: [] }),
            jsonResponse({ total_count: 0, workflow_runs: [] }),
            jsonResponse({
              total_count: 1,
              jobs: [
                {
                  id: 8001,
                  name: 'build',
                  status: 'queued',
                  labels: ['self-hosted'],
                },
              ],
            }),
          ],
          requests
        ),
      }),
      error => {
        assert.ok(error instanceof QueuedJobAuditError)
        assert.equal(error.kind, 'matching-job')
        assert.deepEqual(error.match, {
          runId: 7001,
          jobId: 8001,
          jobName: 'build',
          labels: ['self-hosted'],
          status: 'queued',
        })
        return true
      }
    )
    assert.equal(requests.length, 7)
    assert.match(requests[2].url, /status=queued/)
    assert.match(requests[6].url, /actions\/runs\/7001\/jobs/)
    for (const request of requests) {
      assert.equal(request.url.includes(queuedJobAuditRequest.token), false)
      assert.equal(
        new Headers(request.init?.headers).get('authorization'),
        `Bearer ${queuedJobAuditRequest.token}`
      )
    }
  })

  it('permits only complete queue snapshots with no matching pending job', async () => {
    const emptyRuns = Array.from({ length: 6 }, () =>
      jsonResponse({ total_count: 0, workflow_runs: [] })
    )
    await assertNoQueuedJobsForRunner(queuedJobAuditRequest, {
      fetch: sequencedFetch(emptyRuns),
    })

    const nonMatching = [
      jsonResponse({ total_count: 0, workflow_runs: [] }),
      jsonResponse({
        total_count: 1,
        workflow_runs: [
          {
            id: 7002,
            status: 'in_progress',
            run_attempt: 1,
            updated_at: '2026-08-08T01:00:00Z',
          },
        ],
      }),
      ...Array.from({ length: 4 }, () =>
        jsonResponse({ total_count: 0, workflow_runs: [] })
      ),
      jsonResponse({
        total_count: 1,
        jobs: [
          {
            id: 8002,
            name: 'linux-build',
            status: 'queued',
            labels: ['self-hosted', 'Linux'],
          },
        ],
      }),
    ]
    await assertNoQueuedJobsForRunner(queuedJobAuditRequest, {
      fetch: sequencedFetch(nonMatching),
    })

    for (const response of [
      jsonResponse({ total_count: 1, workflow_runs: [] }),
      jsonResponse({}, 403),
    ]) {
      await assert.rejects(
        assertNoQueuedJobsForRunner(queuedJobAuditRequest, {
          fetch: sequencedFetch([
            response,
            ...Array.from({ length: 5 }, () =>
              jsonResponse({ total_count: 0, workflow_runs: [] })
            ),
          ]),
        }),
        error =>
          error instanceof QueuedJobAuditError && error.kind === 'unavailable'
      )
    }
  })

  it('rejects duplicate run ids across paginated pending-run inventory', async () => {
    const firstPageRuns = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      status: 'queued',
      run_attempt: 1,
      updated_at: '2026-08-08T01:00:00Z',
    }))
    const fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input))
      const status = url.searchParams.get('status')
      if (!url.pathname.endsWith('/actions/runs')) {
        throw new Error('unexpected-fetch')
      }
      if (status !== 'queued') {
        return jsonResponse({ total_count: 0, workflow_runs: [] })
      }
      if (url.searchParams.get('page') === '1') {
        return jsonResponse({ total_count: 101, workflow_runs: firstPageRuns })
      }
      return jsonResponse({
        total_count: 101,
        workflow_runs: [firstPageRuns[99]],
      })
    }) as typeof globalThis.fetch

    await assert.rejects(
      assertNoQueuedJobsForRunner(queuedJobAuditRequest, { fetch }),
      error =>
        error instanceof QueuedJobAuditError && error.kind === 'unavailable'
    )
  })

  it('rejects duplicate job ids across paginated run-job inventory', async () => {
    const firstPageJobs = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `linux-build-${index + 1}`,
      status: 'queued',
      labels: ['self-hosted', 'Linux'],
    }))
    const fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/actions/runs')) {
        const status = url.searchParams.get('status')
        return status === 'queued'
          ? jsonResponse({
              total_count: 1,
              workflow_runs: [
                {
                  id: 7003,
                  status: 'queued',
                  run_attempt: 1,
                  updated_at: '2026-08-08T01:00:00Z',
                },
              ],
            })
          : jsonResponse({ total_count: 0, workflow_runs: [] })
      }
      if (url.pathname.endsWith('/actions/runs/7003/jobs')) {
        assert.equal(url.searchParams.get('filter'), 'all')
        if (url.searchParams.get('page') === '1') {
          return jsonResponse({ total_count: 101, jobs: firstPageJobs })
        }
        return jsonResponse({ total_count: 101, jobs: [firstPageJobs[99]] })
      }
      throw new Error('unexpected-fetch')
    }) as typeof globalThis.fetch

    await assert.rejects(
      assertNoQueuedJobsForRunner(queuedJobAuditRequest, { fetch }),
      error =>
        error instanceof QueuedJobAuditError && error.kind === 'unavailable'
    )
  })

  it('rejects duplicate runner ids across paginated repository inventory', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `runner-${index + 1}`,
      status: 'offline',
      busy: false,
      os: 'Windows',
      labels: [{ name: 'self-hosted' }, { name: 'Windows' }, { name: 'X64' }],
    }))
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      sequencedFetch([
        jsonResponse({ total_count: 101, runners: firstPage }),
        jsonResponse({ total_count: 101, runners: [firstPage[99]] }),
      ])
    )
    try {
      await assert.rejects(
        fetchRepositoryRunnerInventory({
          endpoint: 'https://api.github.com/',
          owner: 'owner',
          repository: 'repository',
          token: 'test-token',
        }),
        /runner-inventory-invalid/
      )
      assert.equal(fetchMock.mock.callCount(), 2)
    } finally {
      mock.restoreAll()
    }
  })

  it('rejects setup when public-repository metadata is incomplete before creating managed files', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-public-setup-'))
    const managedRoot = join(userData, 'self-hosted-runners')
    const fetchMock = mock.method(globalThis, 'fetch', (async () =>
      jsonResponse({ private: false })) as typeof fetch)
    try {
      const manager = new WindowsSelfHostedRunnerManager(
        userData,
        () => undefined
      )
      manager.updateAccountTokens([
        {
          accountKey: 'https://api.github.com/#101',
          endpoint: 'https://api.github.com/',
          token: 'account-token',
        },
      ])
      const reply = await manager.setup({
        id: 'runner-id',
        accountKey: 'https://api.github.com/#101',
        owner: 'owner',
        repository: 'repository',
        githubApiEndpoint: 'https://api.github.com/',
        name: 'repository-windows-runner',
        labels: ['repository-windows-local'],
        platform: 'windows',
        createDedicatedWsl: false,
        autoInstallDependencies: false,
      })

      assert.equal(reply.ok, false)
      if (!reply.ok) {
        assert.equal(reply.code, 'workflow-trust-unavailable')
      }
      assert.equal(fetchMock.mock.callCount(), 1)
      await assert.rejects(access(managedRoot), { code: 'ENOENT' })
    } finally {
      mock.restoreAll()
      await rm(userData, { recursive: true, force: true })
    }
  })

  it(
    'audits the built-in self-hosted label before creating managed runner files',
    { skip: process.platform !== 'win32' },
    async () => {
      const userData = await mkdtemp(join(tmpdir(), 'runner-complete-labels-'))
      const managedRoot = join(userData, 'self-hosted-runners')
      const manager = new WindowsSelfHostedRunnerManager(
        userData,
        () => undefined
      )
      const internal = manager as unknown as {
        assertRepositoryWorkflowTrust(): Promise<{
          readonly commitSHA: string
          readonly workflowCount: number
        }>
        assertStableRunnerQueue(
          endpoint: string,
          owner: string,
          repository: string,
          token: string,
          labels: ReadonlyArray<string>
        ): Promise<void>
      }
      let auditedLabels: ReadonlyArray<string> = []
      manager.updateAccountTokens([
        {
          accountKey: 'https://api.github.com/#101',
          endpoint: 'https://api.github.com/',
          token: 'account-token',
        },
      ])
      internal.assertRepositoryWorkflowTrust = async () => ({
        commitSHA: 'a'.repeat(40),
        workflowCount: 0,
      })
      internal.assertStableRunnerQueue = async (
        _endpoint,
        _owner,
        _repository,
        _token,
        labels
      ) => {
        auditedLabels = labels
        throw new SelfHostedRunnerManagerError(
          'runner-queued-job-blocked',
          'A queued job with only the self-hosted label can target this runner.',
          'queued-job-evidence'
        )
      }

      try {
        const reply = await manager.setup({
          id: 'runner-id',
          accountKey: 'https://api.github.com/#101',
          owner: 'owner',
          repository: 'repository',
          githubApiEndpoint: 'https://api.github.com/',
          name: 'repository-windows-runner',
          labels: ['repository-windows-local'],
          platform: 'windows',
          createDedicatedWsl: false,
          autoInstallDependencies: false,
        })
        assert.equal(reply.ok, false)
        if (!reply.ok) {
          assert.equal(reply.code, 'preflight-risk-not-accepted')
        }
        assert.deepEqual(auditedLabels, [
          'self-hosted',
          'repository-windows-local',
          'Windows',
          process.arch === 'arm64' ? 'ARM64' : 'X64',
        ])
        await assert.rejects(access(managedRoot), { code: 'ENOENT' })
      } finally {
        await manager.shutdown()
        await rm(userData, { recursive: true, force: true })
      }
    }
  )

  it('keeps native risk acceptance exact, evidence-bound, and limited to one setup operation', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-risk-receipt-'))
    const progress: string[] = []
    const confirmationCodes: string[] = []
    let confirm = true
    const manager = new WindowsSelfHostedRunnerManager(
      userData,
      event => {
        progress.push(event.detail)
      },
      async confirmation => {
        confirmationCodes.push(confirmation.code)
        return confirm
      }
    )
    const internal = manager as unknown as {
      assertRepositoryWorkflowTrust(): Promise<unknown>
      assertRepositoryWorkflowTrustWithConfirmedRisk(
        endpoint: string,
        accountKey: string,
        owner: string,
        repository: string,
        token: string,
        labels: ReadonlyArray<string>,
        signal: AbortSignal | undefined,
        receipts: Map<
          'workflow-trust-unsafe' | 'runner-queued-job-blocked',
          { readonly scope: string; readonly evidence: string }
        >,
        runnerId: string,
        auditName: string
      ): Promise<unknown>
    }
    const receipts = new Map<
      'workflow-trust-unsafe' | 'runner-queued-job-blocked',
      { readonly scope: string; readonly evidence: string }
    >()
    const invoke = () =>
      internal.assertRepositoryWorkflowTrustWithConfirmedRisk(
        'https://api.github.com/',
        'https://api.github.com/#101',
        'owner',
        'repository',
        'token',
        ['self-hosted', 'Windows', 'X64'],
        undefined,
        receipts,
        'runner-id',
        'test workflow'
      )

    try {
      internal.assertRepositoryWorkflowTrust = async () => {
        throw new SelfHostedRunnerManagerError(
          'workflow-trust-unsafe',
          'unsafe workflow',
          'workflow-evidence-one'
        )
      }
      assert.equal(await invoke(), null)
      assert.deepEqual(confirmationCodes, ['workflow-trust-unsafe'])

      // The same main-process evidence can pass a later audit in this one
      // setup operation without turning into a broad code-category bypass.
      assert.equal(await invoke(), null)
      assert.equal(confirmationCodes.length, 1)
      assert.match(progress.at(-1) ?? '', /exactly matches/)

      // A safe recheck erases the volatile receipt, so a later warning needs
      // a new native decision even if its code and evidence look identical.
      internal.assertRepositoryWorkflowTrust = async () => ({
        commitSHA: 'a'.repeat(40),
        workflowCount: 1,
      })
      await invoke()
      assert.equal(receipts.size, 0)

      confirm = false
      internal.assertRepositoryWorkflowTrust = async () => {
        throw new SelfHostedRunnerManagerError(
          'workflow-trust-unsafe',
          'unsafe workflow',
          'workflow-evidence-one'
        )
      }
      await assert.rejects(
        invoke(),
        error =>
          error instanceof SelfHostedRunnerManagerError &&
          error.code === 'preflight-risk-not-accepted'
      )
      assert.equal(confirmationCodes.length, 2)

      internal.assertRepositoryWorkflowTrust = async () => {
        throw new SelfHostedRunnerManagerError(
          'workflow-trust-unavailable',
          'workflow inventory unavailable'
        )
      }
      await assert.rejects(
        invoke(),
        error =>
          error instanceof SelfHostedRunnerManagerError &&
          error.code === 'workflow-trust-unavailable'
      )
      assert.equal(confirmationCodes.length, 2)
    } finally {
      await manager.shutdown()
      await rm(userData, { recursive: true, force: true })
    }
  })

  it(
    'rejects incomplete public-repository metadata before authoritative preflight',
    { skip: process.platform !== 'win32' },
    async () => {
      const userData = await mkdtemp(join(tmpdir(), 'runner-preflight-labels-'))
      const fetchMock = mock.method(globalThis, 'fetch', (async () =>
        jsonResponse({ private: false })) as typeof fetch)
      try {
        const manager = new WindowsSelfHostedRunnerManager(
          userData,
          () => undefined
        )
        manager.updateAccountTokens([
          {
            accountKey: 'https://api.github.com/#101',
            endpoint: 'https://api.github.com/',
            token: 'account-token',
          },
        ])
        const base = {
          accountKey: 'https://api.github.com/#101',
          owner: 'owner',
          repository: 'repository',
          githubApiEndpoint: 'https://api.github.com/',
        }
        const accepted = await manager.preflight({
          ...base,
          labels: Array.from({ length: 23 }, (_, index) => `label-${index}`),
        })
        assert.equal(accepted.ok, false)
        if (!accepted.ok) {
          assert.equal(accepted.code, 'workflow-trust-unavailable')
        }

        const refused = await manager.preflight({
          ...base,
          labels: Array.from({ length: 24 }, (_, index) => `label-${index}`),
        })
        assert.equal(refused.ok, false)
        if (!refused.ok) {
          assert.equal(refused.code, 'invalid-runner-configuration')
        }
        assert.equal(fetchMock.mock.callCount(), 1)
      } finally {
        mock.restoreAll()
        await rm(userData, { recursive: true, force: true })
      }
    }
  )

  it('recovers a label-edited runner by unique name and fails closed on invalid local identity metadata', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-recovery-name-'))
    const manager = new WindowsSelfHostedRunnerManager(
      userData,
      () => undefined
    )
    const record = {
      id: 'runner-id',
      accountKey: 'https://api.github.com/#101',
      owner: 'owner',
      repository: 'repository',
      githubApiEndpoint: 'https://api.github.com/',
      name: 'repository-windows-runner',
      labels: ['old-project-label'],
      platform: 'windows',
      wslDistribution: null,
      dedicatedWsl: false,
      createdAt: '2026-08-07T20:00:00.000Z',
      pid: null,
      status: 'stopped',
      lifecyclePhase: 'registered',
    }
    const candidate: IRepositoryRunnerInventoryEntry = {
      id: 901,
      name: 'REPOSITORY-WINDOWS-RUNNER',
      status: 'offline',
      busy: false,
      os: 'Windows',
      labels: [
        'self-hosted',
        'Windows',
        process.arch === 'arm64' ? 'ARM64' : 'X64',
        'new-project-label',
      ],
    }
    const internal = manager as unknown as {
      repositoryRunnerForRecovery(
        storedRecord: object,
        inventory: ReadonlyArray<IRepositoryRunnerInventoryEntry>
      ): Promise<IRepositoryRunnerInventoryEntry | null>
    }
    try {
      const recovered = await internal.repositoryRunnerForRecovery(record, [
        candidate,
      ])
      assert.equal(recovered?.id, candidate.id)

      const runnerDirectory = join(
        userData,
        'self-hosted-runners',
        record.id,
        'runner'
      )
      await mkdir(runnerDirectory, { recursive: true })
      await writeFile(join(runnerDirectory, '.runner'), '{not-json')
      await assert.rejects(
        internal.repositoryRunnerForRecovery(record, [candidate]),
        error =>
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: unknown }).code ===
            'runner-registration-metadata-invalid'
      )
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('waits for the active runner operation lease before shutdown state reconciliation', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-shutdown-lease-'))
    const manager = new WindowsSelfHostedRunnerManager(
      userData,
      () => undefined
    )
    const internal = manager as unknown as {
      beginActiveOperation(runnerId: string): AbortController
      finishActiveOperation(controller: AbortController): void
    }
    const controller = internal.beginActiveOperation('runner-id')
    let shutdownSettled = false
    try {
      const shutdown = manager.shutdown().then(() => {
        shutdownSettled = true
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.equal(controller.signal.aborted, true)
      assert.equal(shutdownSettled, false)

      internal.finishActiveOperation(controller)
      await shutdown
      assert.equal(shutdownSettled, true)
    } finally {
      internal.finishActiveOperation(controller)
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('does not let a stale operation finisher release a newer lease', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-stale-lease-'))
    const manager = new WindowsSelfHostedRunnerManager(
      userData,
      () => undefined
    )
    const internal = manager as unknown as {
      activeRunnerId: string | null
      activeOperationAbortController: AbortController | null
      beginActiveOperation(runnerId: string): AbortController
      finishActiveOperation(controller: AbortController): void
    }
    const staleController = internal.beginActiveOperation('stale-runner')
    const currentController = internal.beginActiveOperation('current-runner')
    try {
      internal.finishActiveOperation(staleController)

      assert.equal(internal.activeRunnerId, 'current-runner')
      assert.equal(internal.activeOperationAbortController, currentController)

      internal.finishActiveOperation(currentController)
      assert.equal(internal.activeRunnerId, null)
      assert.equal(internal.activeOperationAbortController, null)
    } finally {
      internal.finishActiveOperation(currentController)
      await manager.shutdown()
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('shares concurrent first state loads so shutdown cannot overwrite a newer array', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-load-single-flight-'))
    const manager = new WindowsSelfHostedRunnerManager(
      userData,
      () => undefined
    )
    const internal = manager as unknown as {
      loadRecords(): Promise<ReadonlyArray<unknown>>
    }
    try {
      const first = internal.loadRecords()
      const second = internal.loadRecords()
      const [firstRecords, secondRecords] = await Promise.all([first, second])
      assert.strictEqual(firstRecords, secondRecords)
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it(
    'holds the operation lease throughout a scheduled trust recheck',
    { skip: process.platform !== 'win32' },
    async () => {
      const userData = await mkdtemp(join(tmpdir(), 'runner-trust-lease-'))
      const managedRoot = join(userData, 'self-hosted-runners')
      await mkdir(managedRoot, { recursive: true })
      await writeFile(
        join(managedRoot, 'runners.json'),
        JSON.stringify({
          schemaVersion: 1,
          runners: [
            {
              id: 'runner-id',
              accountKey: 'https://api.github.com/#101',
              owner: 'owner',
              repository: 'repository',
              githubApiEndpoint: 'https://api.github.com/',
              name: 'repository-windows-runner',
              labels: ['repository-windows-local'],
              platform: 'windows',
              wslDistribution: null,
              dedicatedWsl: false,
              createdAt: '2026-08-07T20:00:00.000Z',
              pid: 424_242,
              status: 'running',
              lifecyclePhase: 'ready',
            },
          ],
        })
      )
      const manager = new WindowsSelfHostedRunnerManager(
        userData,
        () => undefined
      )
      let releaseState!: () => void
      let reportStateStarted!: () => void
      const stateStarted = new Promise<void>(resolve => {
        reportStateStarted = resolve
      })
      const stateReleased = new Promise<void>(resolve => {
        releaseState = resolve
      })
      const internal = manager as unknown as {
        activeRunnerId: string | null
        activeOperationAbortController: AbortController | null
        runTrustMonitor(signal: AbortSignal): Promise<void>
        runnerProcessState(record: object): Promise<'stopped'>
      }
      internal.runnerProcessState = async () => {
        reportStateStarted()
        await stateReleased
        return 'stopped'
      }
      const monitorController = new AbortController()
      const monitor = internal.runTrustMonitor(monitorController.signal)

      try {
        await stateStarted
        assert.equal(internal.activeRunnerId, ':trust-monitor:')
        assert.equal(manager.cancel(':trust-monitor:'), false)
        assert.equal(manager.cancel(':status-reconciliation:'), false)
        assert.equal(
          internal.activeOperationAbortController?.signal.aborted,
          false
        )

        const reply = await manager.start({
          id: 'runner-id',
          owner: 'owner',
          repository: 'repository',
        })
        assert.equal(reply.ok, false)
        if (!reply.ok) {
          assert.equal(reply.code, 'runner-operation-active')
        }
        assert.equal(internal.activeRunnerId, ':trust-monitor:')

        releaseState()
        await monitor
        assert.equal(internal.activeRunnerId, null)
      } finally {
        releaseState()
        monitorController.abort()
        await monitor.catch(() => undefined)
        await manager.shutdown()
        await rm(userData, { recursive: true, force: true })
      }
    }
  )

  it('drains an in-flight status reconciliation before shutdown saves stopped state', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-status-shutdown-'))
    const managedRoot = join(userData, 'self-hosted-runners')
    await mkdir(managedRoot, { recursive: true })
    await writeFile(
      join(managedRoot, 'runners.json'),
      JSON.stringify({
        schemaVersion: 1,
        runners: [
          {
            id: 'runner-id',
            accountKey: 'https://api.github.com/#101',
            owner: 'owner',
            repository: 'repository',
            githubApiEndpoint: 'https://api.github.com/',
            name: 'repository-windows-runner',
            labels: ['repository-windows-local'],
            platform: 'windows',
            wslDistribution: null,
            dedicatedWsl: false,
            createdAt: '2026-08-07T20:00:00.000Z',
            pid: null,
            status: 'stopped',
            lifecyclePhase: 'registered',
          },
        ],
      })
    )
    const manager = new WindowsSelfHostedRunnerManager(
      userData,
      () => undefined
    )
    let releaseRefresh!: () => void
    let reportRefreshStarted!: () => void
    const refreshStarted = new Promise<void>(resolve => {
      reportRefreshStarted = resolve
    })
    const refreshReleased = new Promise<void>(resolve => {
      releaseRefresh = resolve
    })
    const internal = manager as unknown as {
      refreshStatuses(records: Array<Record<string, unknown>>): Promise<void>
      stopProcess(record: Record<string, unknown>): Promise<void>
    }
    internal.refreshStatuses = async records => {
      records[0] = {
        ...records[0],
        pid: null,
        status: 'running',
        lifecyclePhase: 'ready',
      }
      reportRefreshStarted()
      await refreshReleased
    }
    internal.stopProcess = async () => undefined

    try {
      const status = manager.getStatus({
        owner: 'owner',
        repository: 'repository',
      })
      await refreshStarted
      let shutdownSettled = false
      const shutdown = manager.shutdown().then(() => {
        shutdownSettled = true
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.equal(shutdownSettled, false)

      releaseRefresh()
      await assert.rejects(status, /runner-operation-cancelled/)
      await shutdown
      const saved = JSON.parse(
        await readFile(join(managedRoot, 'runners.json'), 'utf8')
      ) as {
        runners: Array<{
          pid: number | null
          status: string
          lifecyclePhase: string
        }>
      }
      assert.equal(saved.runners[0].pid, null)
      assert.equal(saved.runners[0].status, 'stopped')
      assert.equal(saved.runners[0].lifecyclePhase, 'registered')
    } finally {
      releaseRefresh()
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('re-audits repository trust before restarting a managed runner', async () => {
    const cases = [
      {
        responses: () => [jsonResponse({ private: false })],
        expectedCode: 'workflow-trust-unavailable',
        expectedRequests: 1,
      },
      {
        responses: () => [
          jsonResponse({
            private: true,
            allow_forking: false,
            default_branch: 'main',
          }),
          jsonResponse({ run_workflows_from_fork_pull_requests: false }),
          jsonResponse({ sha: 'c'.repeat(40) }),
          jsonResponse([
            {
              type: 'file',
              path: '.github/workflows/unsafe.yml',
              size: 82,
            },
          ]),
          new Response(
            `on: [pull_request]\njobs:\n  build:\n    runs-on: self-hosted\n`
          ),
        ],
        expectedCode: 'workflow-trust-unsafe',
        expectedRequests: 5,
      },
    ]

    for (const candidate of cases) {
      const userData = await mkdtemp(join(tmpdir(), 'runner-restart-audit-'))
      const managedRoot = join(userData, 'self-hosted-runners')
      await mkdir(managedRoot, { recursive: true })
      await writeFile(
        join(managedRoot, 'runners.json'),
        JSON.stringify({
          schemaVersion: 1,
          runners: [
            {
              id: 'runner-id',
              accountKey: 'https://api.github.com/#101',
              owner: 'owner',
              repository: 'repository',
              githubApiEndpoint: 'https://api.github.com/',
              name: 'repository-windows-runner',
              labels: ['repository-windows-local'],
              platform: 'windows',
              wslDistribution: null,
              dedicatedWsl: false,
              createdAt: '2026-08-07T20:00:00.000Z',
              pid: null,
              status: 'stopped',
            },
          ],
        })
      )
      const fetchMock = mock.method(
        globalThis,
        'fetch',
        sequencedFetch(candidate.responses())
      )
      try {
        const manager = new WindowsSelfHostedRunnerManager(
          userData,
          () => undefined
        )
        manager.updateAccountTokens([
          {
            accountKey: 'https://api.github.com/#101',
            endpoint: 'https://api.github.com/',
            token: 'account-token',
          },
        ])
        const reply = await manager.start({
          id: 'runner-id',
          owner: 'owner',
          repository: 'repository',
        })

        assert.equal(reply.ok, false)
        if (!reply.ok) {
          assert.equal(reply.code, candidate.expectedCode)
        }
        assert.equal(fetchMock.mock.callCount(), candidate.expectedRequests)
        await assert.rejects(
          access(join(managedRoot, 'runner-id', 'runner', 'run.cmd')),
          { code: 'ENOENT' }
        )
      } finally {
        mock.restoreAll()
        await rm(userData, { recursive: true, force: true })
      }
    }
  })

  it(
    'does not launch after cancellation during the starting journal save',
    { skip: process.platform !== 'win32' },
    async () => {
      const userData = await mkdtemp(join(tmpdir(), 'runner-start-cancel-'))
      const record = {
        id: 'runner-id',
        accountKey: 'https://api.github.com/#101',
        owner: 'owner',
        repository: 'repository',
        githubApiEndpoint: 'https://api.github.com/',
        name: 'repository-windows-runner',
        labels: ['repository-windows-local'],
        platform: 'windows' as const,
        wslDistribution: null,
        dedicatedWsl: false,
        createdAt: '2026-08-07T20:00:00.000Z',
        pid: null,
        status: 'stopped' as const,
        lifecyclePhase: 'registered' as const,
      }
      const candidate: IRepositoryRunnerInventoryEntry = {
        id: 901,
        name: record.name,
        status: 'offline',
        busy: false,
        os: 'Windows',
        labels: [
          'self-hosted',
          'Windows',
          process.arch === 'arm64' ? 'ARM64' : 'X64',
          ...record.labels,
        ],
      }
      const records = [record]
      const manager = new WindowsSelfHostedRunnerManager(
        userData,
        () => undefined
      )
      manager.updateAccountTokens([
        {
          accountKey: record.accountKey,
          endpoint: record.githubApiEndpoint,
          token: 'account-token',
        },
      ])
      let releaseSave!: () => void
      let reportSaveStarted!: () => void
      const saveStarted = new Promise<void>(resolve => {
        reportSaveStarted = resolve
      })
      const saveReleased = new Promise<void>(resolve => {
        releaseSave = resolve
      })
      let saveCount = 0
      let launchCount = 0
      let stopCount = 0
      const internal = manager as unknown as {
        loadRecords(): Promise<Array<typeof record>>
        findRecord(): Promise<typeof record>
        refreshStatuses(): Promise<void>
        assertRepositoryWorkflowTrust(): Promise<void>
        assertStableRunnerQueue(): Promise<void>
        repositoryRunnerForRecovery(): Promise<IRepositoryRunnerInventoryEntry>
        saveRecords(): Promise<void>
        launchRunner(): Promise<unknown>
        stopProcess(): Promise<void>
      }
      internal.loadRecords = async () => records
      internal.findRecord = async () => record
      internal.refreshStatuses = async () => undefined
      internal.assertRepositoryWorkflowTrust = async () => undefined
      internal.assertStableRunnerQueue = async () => undefined
      internal.repositoryRunnerForRecovery = async () => candidate
      internal.saveRecords = async () => {
        saveCount++
        if (saveCount === 1) {
          reportSaveStarted()
          await saveReleased
        }
      }
      internal.launchRunner = async () => {
        launchCount++
        return { pid: 9_999 }
      }
      internal.stopProcess = async () => {
        stopCount++
      }
      const fetchMock = mock.method(
        globalThis,
        'fetch',
        sequencedFetch([
          jsonResponse({
            total_count: 1,
            runners: [
              {
                ...candidate,
                labels: candidate.labels.map(name => ({ name })),
              },
            ],
          }),
          jsonResponse({
            total_count: 1,
            runners: [
              {
                ...candidate,
                labels: candidate.labels.map(name => ({ name })),
              },
            ],
          }),
          jsonResponse({
            total_count: 1,
            runners: [
              {
                ...candidate,
                labels: candidate.labels.map(name => ({ name })),
              },
            ],
          }),
          jsonResponse({
            total_count: 1,
            runners: [
              {
                ...candidate,
                labels: candidate.labels.map(name => ({ name })),
              },
            ],
          }),
        ])
      )
      try {
        const starting = manager.start({
          id: record.id,
          owner: record.owner,
          repository: record.repository,
        })
        await saveStarted
        assert.equal(manager.cancel(record.id), true)
        releaseSave()
        const reply = await starting
        assert.equal(reply.ok, false)
        if (!reply.ok) {
          assert.equal(reply.code, 'runner-operation-cancelled')
        }
        assert.equal(launchCount, 0)
        assert.equal(fetchMock.mock.callCount(), 1)
        assert.equal(records[0].pid, null)
        assert.equal(records[0].status, 'stopped')
        assert.equal(records[0].lifecyclePhase, 'registered')

        saveCount = 0
        internal.launchRunner = async () => {
          launchCount++
          throw new Error('launch-failed')
        }
        const failedLaunch = await manager.start({
          id: record.id,
          owner: record.owner,
          repository: record.repository,
        })
        assert.equal(failedLaunch.ok, false)
        assert.equal(launchCount, 1)
        assert.equal(fetchMock.mock.callCount(), 2)
        assert.equal(records[0].pid, null)
        assert.equal(records[0].status, 'stopped')
        assert.equal(records[0].lifecyclePhase, 'registered')

        saveCount = 0
        stopCount = 0
        internal.launchRunner = async () => {
          launchCount++
          return { pid: 9_999 }
        }
        internal.saveRecords = async () => {
          saveCount++
          if (saveCount === 2) {
            throw new Error('state-save-failed')
          }
        }
        const failedStateSave = await manager.start({
          id: record.id,
          owner: record.owner,
          repository: record.repository,
        })
        assert.equal(failedStateSave.ok, false)
        assert.equal(launchCount, 2)
        assert.equal(stopCount, 1)
        assert.equal(fetchMock.mock.callCount(), 3)
        assert.equal(records[0].pid, null)
        assert.equal(records[0].status, 'stopped')
        assert.equal(records[0].lifecyclePhase, 'registered')
      } finally {
        releaseSave()
        mock.restoreAll()
        await rm(userData, { recursive: true, force: true })
      }
    }
  )

  it('never treats a reused or mismatched process id as stopped', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-process-identity-'))
    const managedRoot = join(userData, 'self-hosted-runners')
    await mkdir(managedRoot, { recursive: true })
    await writeFile(
      join(managedRoot, 'runners.json'),
      JSON.stringify({
        schemaVersion: 1,
        runners: [
          {
            id: 'runner-id',
            accountKey: 'https://api.github.com/#101',
            owner: 'owner',
            repository: 'repository',
            githubApiEndpoint: 'https://api.github.com/',
            name: 'repository-windows-runner',
            labels: ['repository-windows-local'],
            platform: 'windows',
            wslDistribution: null,
            dedicatedWsl: false,
            createdAt: '2026-08-07T20:00:00.000Z',
            pid: process.pid,
            status: 'running',
          },
        ],
      })
    )
    try {
      const manager = new WindowsSelfHostedRunnerManager(
        userData,
        () => undefined
      )
      await assert.rejects(
        manager.getStatus({ owner: 'owner', repository: 'repository' }),
        /runner-process-state-unavailable/
      )
      const saved = JSON.parse(
        await readFile(join(managedRoot, 'runners.json'), 'utf8')
      ) as { runners: Array<{ pid: number | null; status: string }> }
      assert.equal(saved.runners[0].pid, process.pid)
      assert.equal(saved.runners[0].status, 'running')
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('requires a proven stopped process postcondition after termination', async () => {
    let time = 0
    const states = ['running', 'running', 'stopped'] as const
    let index = 0
    await waitForSelfHostedRunnerProcessStop(
      {
        readState: async () => states[Math.min(index++, states.length - 1)],
        now: () => time,
        delay: async milliseconds => {
          time += milliseconds
        },
      },
      1_000,
      100
    )
    assert.equal(index, 3)

    time = 0
    await assert.rejects(
      waitForSelfHostedRunnerProcessStop(
        {
          readState: async () => 'running',
          now: () => time,
          delay: async milliseconds => {
            time += milliseconds
          },
        },
        200,
        100
      ),
      /runner-process-stop-timeout/
    )

    const identityFailure = new Error('runner-process-state-unavailable')
    await assert.rejects(
      waitForSelfHostedRunnerProcessStop({
        readState: async () => {
          throw identityFailure
        },
        now: () => 0,
        delay: async () => undefined,
      }),
      error => error === identityFailure
    )
  })

  it('terminates a timed-out helper process and its child process', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'runner-process-tree-'))
    const childPidPath = join(temporary, 'child.pid')
    let childPid: number | null = null
    const program = [
      "const { spawn } = require('node:child_process')",
      "const { writeFileSync } = require('node:fs')",
      `const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })`,
      `writeFileSync(${JSON.stringify(childPidPath)}, String(child.pid))`,
      'setInterval(() => {}, 1000)',
    ].join(';')
    try {
      await assert.rejects(
        runSelfHostedRunnerProcess({
          executable: process.execPath,
          args: ['-e', program],
          timeoutMilliseconds: 5_000,
        }),
        error => error instanceof Error && error.message === 'command-timeout'
      )
      const recordedChildPid = Number(await readFile(childPidPath, 'utf8'))
      childPid = recordedChildPid
      assert.ok(Number.isSafeInteger(recordedChildPid) && recordedChildPid > 0)
      assert.throws(() => process.kill(recordedChildPid, 0))
    } finally {
      if (childPid !== null) {
        try {
          process.kill(childPid, 0)
          await killTreeAndWait(childPid)
        } catch {
          // The intended passing path already terminated the exact child.
        }
      }
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it('excludes internal Docker WSL distributions from setup choices', () => {
    assert.deepEqual(
      parseManageableWslDistributions(
        'docker-desktop\r\nDebian\r\ndocker-desktop-data\r\nDEBIAN\r\nUbuntu-24.04\r\n'
      ),
      ['Debian', 'Ubuntu-24.04']
    )
  })

  it('requires a new exact runner with every expected readiness label', () => {
    const runner: IRepositoryRunnerInventoryEntry = {
      id: 202,
      name: 'repository-windows-runner',
      status: 'online',
      busy: false,
      os: 'Windows',
      labels: ['self-hosted', 'Windows', 'X64', 'repository-windows-local'],
    }
    const expectation = {
      existingRunnerIds: new Set([101]),
      name: 'repository-windows-runner',
      requiredLabels: ['repository-windows-local'],
      os: 'Windows' as const,
      architecture: 'X64' as const,
    }

    assert.equal(runnerMeetsReadiness(runner, expectation), true)
    assert.equal(
      runnerMeetsReadiness(
        { ...runner, id: 101 },
        { ...expectation, existingRunnerIds: new Set([101]) }
      ),
      false
    )
    assert.equal(
      runnerMeetsReadiness({ ...runner, status: 'offline' }, expectation),
      false
    )
    assert.equal(
      runnerMeetsReadiness(
        { ...runner, labels: runner.labels.slice(0, -1) },
        expectation
      ),
      false
    )
  })

  it('retries transient inventory failures until the exact runner is online', async () => {
    let time = 0
    let inventoryAttempt = 0
    const ready: IRepositoryRunnerInventoryEntry = {
      id: 202,
      name: 'repository-windows-runner',
      status: 'online',
      busy: false,
      os: 'Windows',
      labels: ['self-hosted', 'Windows', 'X64', 'repository-windows-local'],
    }
    const result = await waitForRunnerReadiness(
      {
        existingRunnerIds: new Set([101]),
        name: ready.name,
        requiredLabels: ['repository-windows-local'],
        os: 'Windows',
        architecture: 'X64',
      },
      {
        fetchInventory: async () => {
          inventoryAttempt++
          if (inventoryAttempt === 1) {
            throw new Error('transient')
          }
          return inventoryAttempt === 2
            ? [{ ...ready, status: 'offline' }]
            : [ready]
        },
        isLocalProcessRunning: async () => true,
        now: () => time,
        delay: async milliseconds => {
          time += milliseconds
        },
      },
      10_000,
      1_000
    )

    assert.equal(result.id, 202)
    assert.equal(inventoryAttempt, 3)
  })

  it('fails readiness when the local process exits or GitHub stays offline', async () => {
    const expectation = {
      existingRunnerIds: new Set<number>(),
      name: 'runner',
      requiredLabels: ['repository-windows-local'],
      os: 'Windows' as const,
      architecture: 'X64' as const,
    }
    await assert.rejects(
      waitForRunnerReadiness(expectation, {
        fetchInventory: async () => [],
        isLocalProcessRunning: async () => false,
        now: () => 0,
        delay: async () => undefined,
      }),
      error =>
        error instanceof RunnerReadinessError &&
        error.code === 'local-process-exited'
    )

    let time = 0
    await assert.rejects(
      waitForRunnerReadiness(
        expectation,
        {
          fetchInventory: async () => [],
          isLocalProcessRunning: async () => true,
          now: () => time,
          delay: async milliseconds => {
            time += milliseconds
          },
        },
        2_000,
        1_000
      ),
      error =>
        error instanceof RunnerReadinessError &&
        error.code === 'runner-never-online'
    )
  })

  it('blocks pull-request workflow definitions from proposed refs', () => {
    const repository = 'owner/repository'
    const literal = assessSelfHostedWorkflowRisk(
      `on:\n  pull_request:\njobs:\n  build:\n    runs-on: [self-hosted, Windows, X64]\n`,
      repository
    )
    const dynamic = assessSelfHostedWorkflowRisk(
      `on: [pull_request]\njobs:\n  build:\n    runs-on: \${{ matrix.runner }}\n`,
      repository
    )
    const reusable = assessSelfHostedWorkflowRisk(
      `on: [pull_request]\njobs:\n  build:\n    uses: ./.github/workflows/reusable.yml\n`,
      repository
    )
    const dynamicFallback = assessSelfHostedWorkflowRisk(
      `on: [pull_request]\njobs:\n  build:\n    runs-on: \${{ github.event_name == 'workflow_dispatch' && 'self-hosted' || matrix.runner }}\n`,
      repository
    )
    const hosted = assessSelfHostedWorkflowRisk(
      `on: [pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n`,
      repository
    )

    for (const risks of [literal, dynamic, reusable, dynamicFallback]) {
      assert.deepEqual(risks, [
        {
          job: '*',
          trigger: 'pull_request',
          reason: 'untrusted-workflow-source',
        },
      ])
    }
    assert.deepEqual(hosted, [])
  })

  it('accepts only repository-main reusable calls and blocks proposed refs', () => {
    const repository = 'owner/repository'
    const dispatchGated = assessSelfHostedWorkflowRisk(
      `on:\n  pull_request:\n  workflow_dispatch:\njobs:\n  build:\n    runs-on: \${{ github.event_name == 'workflow_dispatch' && fromJSON('["self-hosted","Windows","X64"]') || 'windows-2022' }}\n`,
      repository
    )
    const reusableGated = assessSelfHostedWorkflowRisk(
      `on:\n  workflow_call:\n  workflow_dispatch:\njobs:\n  build:\n    if: github.event_name == 'workflow_dispatch' || (github.event_name == 'workflow_call' && github.repository == 'owner/repository' && github.ref == 'refs/heads/main')\n    runs-on: [self-hosted, Windows, X64]\n`,
      repository
    )
    const reusableUnguarded = assessSelfHostedWorkflowRisk(
      `on:\n  workflow_call:\njobs:\n  build:\n    runs-on: [self-hosted, Windows, X64]\n`,
      repository
    )
    const reusableOrBypass = assessSelfHostedWorkflowRisk(
      `on:\n  workflow_call:\njobs:\n  build:\n    if: github.event_name == 'workflow_call' || github.repository == 'owner/repository' || github.ref == 'refs/heads/main'\n    runs-on: [self-hosted, Windows, X64]\n`,
      repository
    )
    const delegatedCall = assessSelfHostedWorkflowRisk(
      `on:\n  workflow_call:\njobs:\n  build:\n    uses: owner/repository/.github/workflows/build.yml@main\n`,
      repository
    )

    assert.deepEqual(dispatchGated, [
      {
        job: '*',
        trigger: 'pull_request',
        reason: 'untrusted-workflow-source',
      },
    ])
    assert.deepEqual(reusableGated, [])
    assert.deepEqual(reusableUnguarded, [
      { job: 'build', trigger: 'workflow_call', reason: 'self-hosted' },
    ])
    assert.deepEqual(reusableOrBypass, [
      { job: 'build', trigger: 'workflow_call', reason: 'self-hosted' },
    ])
    assert.deepEqual(delegatedCall, [
      {
        job: 'build',
        trigger: 'workflow_call',
        reason: 'reusable-workflow',
      },
    ])
    assert.throws(() =>
      assessSelfHostedWorkflowRisk('on: [pull_request\njobs:', repository)
    )
  })

  it('does not mistake quoted guard text or loose OR arms for safety', () => {
    const repository = 'owner/repository'
    const sources = [
      `on: [pull_request]\njobs:\n  build:\n    if: contains('github.event_name == "workflow_dispatch"', 'workflow_dispatch')\n    runs-on: self-hosted\n`,
      `on: [pull_request]\njobs:\n  build:\n    runs-on: \${{ contains('github.event_name == "workflow_dispatch"', 'workflow_dispatch') && 'self-hosted' || 'windows-2022' }}\n`,
      `on: [workflow_call]\njobs:\n  build:\n    if: true || (github.event_name == 'workflow_call' && github.repository == 'owner/repository' && github.ref == 'refs/heads/main')\n    runs-on: self-hosted\n`,
      `on: [workflow_call]\njobs:\n  build:\n    if: contains('github.event_name == "workflow_call" && github.repository == "owner/repository" && github.ref == "refs/heads/main"', 'workflow_call')\n    runs-on: self-hosted\n`,
    ]

    for (const source of sources) {
      assert.notEqual(
        assessSelfHostedWorkflowRisk(source, repository).length,
        0
      )
    }
  })

  it('fails closed on structured runner targets and public interaction triggers', () => {
    const repository = 'owner/repository'
    const proposedRefSources = [
      `on: [pull_request]\njobs:\n  build:\n    runs-on: ['\${{ matrix.runner }}']\n`,
      `on: [pull_request]\njobs:\n  build:\n    runs-on:\n      group: trusted\n      labels: self-hosted\n`,
      `on: [pull_request]\njobs:\n  build:\n    runs-on:\n      group: trusted\n      labels: \${{ vars.RUNNER_LABEL }}\n`,
    ]
    for (const source of proposedRefSources) {
      assert.deepEqual(assessSelfHostedWorkflowRisk(source, repository), [
        {
          job: '*',
          trigger: 'pull_request',
          reason: 'untrusted-workflow-source',
        },
      ])
    }

    const interactionCases = [
      {
        source: `on: [issue_comment]\njobs:\n  build:\n    runs-on: self-hosted\n`,
        trigger: 'issue_comment',
        reason: 'self-hosted',
      },
      {
        source: `on: [pull_request_review_comment]\njobs:\n  build:\n    runs-on: self-hosted\n`,
        trigger: 'pull_request_review_comment',
        reason: 'self-hosted',
      },
    ] as const

    for (const candidate of interactionCases) {
      assert.deepEqual(
        assessSelfHostedWorkflowRisk(candidate.source, repository),
        [
          {
            job: 'build',
            trigger: candidate.trigger,
            reason: candidate.reason,
          },
        ]
      )
    }
  })

  it('blocks untrusted jobs that target any exact managed runner label', () => {
    const repository = 'owner/repository'
    const runnerLabels = ['desktop-material-windows-local', 'Windows', 'X64']
    const candidates = [
      `on: [pull_request]\njobs:\n  build:\n    runs-on: desktop-material-windows-local\n`,
      `on: [pull_request]\njobs:\n  build:\n    runs-on: Windows\n`,
      `on: [pull_request]\njobs:\n  build:\n    runs-on: X64\n`,
      `on: [pull_request]\njobs:\n  build:\n    runs-on: [Windows, X64, desktop-material-windows-local]\n`,
    ]
    for (const source of candidates) {
      assert.deepEqual(
        assessSelfHostedWorkflowRisk(source, repository, runnerLabels),
        [
          {
            job: '*',
            trigger: 'pull_request',
            reason: 'untrusted-workflow-source',
          },
        ]
      )
    }

    assert.deepEqual(
      assessSelfHostedWorkflowRisk(
        `on: [merge_group]\njobs:\n  build:\n    runs-on: self-hosted\n`,
        repository,
        runnerLabels
      ),
      [
        {
          job: '*',
          trigger: 'merge_group',
          reason: 'untrusted-workflow-source',
        },
      ]
    )
    assert.deepEqual(
      assessSelfHostedWorkflowRisk(
        `on: [pull_request, workflow_dispatch]\njobs:\n  build:\n    runs-on: \${{ github.event_name == 'workflow_dispatch' && 'desktop-material-windows-local' || 'windows-2022' }}\n`,
        repository,
        runnerLabels
      ),
      [
        {
          job: '*',
          trigger: 'pull_request',
          reason: 'untrusted-workflow-source',
        },
      ]
    )
  })

  it(
    'rejects a forged setup request targeting an internal WSL distro',
    { skip: process.platform !== 'win32' },
    async () => {
      const userData = await mkdtemp(join(tmpdir(), 'runner-wsl-input-'))
      try {
        const manager = new WindowsSelfHostedRunnerManager(
          userData,
          () => undefined
        )
        const reply = await manager.setup({
          id: 'runner-id',
          accountKey: 'https://api.github.com/#101',
          owner: 'owner',
          repository: 'repository',
          githubApiEndpoint: 'https://api.github.com/',
          name: 'runner-name',
          labels: ['repository-wsl-local'],
          platform: 'linux-wsl',
          wslDistribution: 'docker-desktop',
          createDedicatedWsl: false,
          autoInstallDependencies: false,
        })
        assert.equal(reply.ok, false)
        if (!reply.ok) {
          assert.equal(reply.code, 'invalid-wsl-selection')
        }
      } finally {
        await rm(userData, { recursive: true, force: true })
      }
    }
  )

  it(
    'fails closed on WSL setup until in-distro cancellation is proven',
    { skip: process.platform !== 'win32' },
    async () => {
      const userData = await mkdtemp(join(tmpdir(), 'runner-wsl-disabled-'))
      try {
        const manager = new WindowsSelfHostedRunnerManager(
          userData,
          () => undefined
        )
        const reply = await manager.setup({
          id: 'runner-id',
          accountKey: 'https://api.github.com/#101',
          owner: 'owner',
          repository: 'repository',
          githubApiEndpoint: 'https://api.github.com/',
          name: 'runner-name',
          labels: ['repository-wsl-local'],
          platform: 'linux-wsl',
          wslDistribution: 'Debian',
          createDedicatedWsl: false,
          autoInstallDependencies: false,
        })
        assert.equal(reply.ok, false)
        if (!reply.ok) {
          assert.equal(reply.code, 'linux-wsl-runner-management-disabled')
        }
      } finally {
        await rm(userData, { recursive: true, force: true })
      }
    }
  )

  it('fails closed on a malformed persisted account identity', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-state-account-'))
    const managedRoot = join(userData, 'self-hosted-runners')
    await mkdir(managedRoot, { recursive: true })
    await writeFile(
      join(managedRoot, 'runners.json'),
      JSON.stringify({
        schemaVersion: 1,
        runners: [
          {
            id: 'runner-id',
            accountKey: 42,
            owner: 'owner',
            repository: 'repository',
            githubApiEndpoint: 'https://api.github.com/',
            name: 'runner-name',
            labels: ['repository-windows-local'],
            platform: 'windows',
            wslDistribution: null,
            dedicatedWsl: false,
            createdAt: '2026-08-07T20:00:00.000Z',
            pid: null,
            status: 'stopped',
          },
        ],
      })
    )
    try {
      const manager = new WindowsSelfHostedRunnerManager(
        userData,
        () => undefined
      )
      await assert.rejects(
        manager.getStatus({ owner: 'owner', repository: 'repository' }),
        /runner-state-corrupt/
      )
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })

  it('removes legacy renderer-provided risk acceptance from persisted state', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'runner-state-risk-'))
    const managedRoot = join(userData, 'self-hosted-runners')
    await mkdir(managedRoot, { recursive: true })
    await writeFile(
      join(managedRoot, 'runners.json'),
      JSON.stringify({
        schemaVersion: 1,
        runners: [
          {
            id: 'runner-id',
            accountKey: 'https://api.github.com/#41',
            owner: 'owner',
            repository: 'repository',
            githubApiEndpoint: 'https://api.github.com/',
            name: 'runner-name',
            labels: ['repository-windows-local'],
            platform: 'windows',
            wslDistribution: null,
            dedicatedWsl: false,
            acceptedPreflightRiskCode: 'workflow-trust-unavailable',
            createdAt: '2026-08-07T20:00:00.000Z',
            pid: null,
            status: 'stopped',
          },
        ],
      })
    )
    try {
      const manager = new WindowsSelfHostedRunnerManager(
        userData,
        () => undefined
      )
      const internal = manager as unknown as {
        loadRecords(): Promise<Array<Record<string, unknown>>>
        saveRecords(): Promise<void>
      }
      const records = await internal.loadRecords()
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          records[0],
          'acceptedPreflightRiskCode'
        ),
        false
      )
      await internal.saveRecords()
      const saved = JSON.parse(
        await readFile(join(managedRoot, 'runners.json'), 'utf8')
      ) as { readonly runners: ReadonlyArray<Record<string, unknown>> }
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          saved.runners[0],
          'acceptedPreflightRiskCode'
        ),
        false
      )
      await manager.shutdown()
    } finally {
      await rm(userData, { recursive: true, force: true })
    }
  })
})
