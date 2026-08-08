import { readBoundedActionsJSON } from '../../lib/actions-response'
import { beginTimedFetch } from './timed-fetch'

const AuditRequestTimeoutMilliseconds = 10_000
const AuditDeadlineMilliseconds = 30_000
const MaximumRunsPerStatus = 250
const MaximumJobsPerRun = 250
const PageSize = 100

const PendingRunStatuses = [
  'action_required',
  'in_progress',
  'queued',
  'requested',
  'waiting',
  'pending',
] as const

export interface IQueuedJobAuditRequest {
  readonly endpoint: string
  readonly owner: string
  readonly repository: string
  readonly token: string
  readonly runnerLabels: ReadonlyArray<string>
  readonly signal?: AbortSignal
}

export interface IQueuedJobMatch {
  readonly runId: number
  readonly jobId: number
  readonly jobName: string
  readonly labels: ReadonlyArray<string>
  readonly status: string
}

export interface IQueuedJobAuditSnapshot {
  readonly fingerprint: string
}

interface IPendingRun {
  readonly id: number
  readonly status: string
  readonly attempt: number
  readonly updatedAt: string
}

export class QueuedJobAuditError extends Error {
  public constructor(
    public readonly kind: 'unavailable' | 'matching-job',
    public readonly match?: IQueuedJobMatch
  ) {
    super(`queued-job-audit-${kind}`)
  }
}

export interface IQueuedJobAuditDependencies {
  readonly fetch: typeof fetch
  readonly timeoutMilliseconds?: number
}

const DefaultDependencies: IQueuedJobAuditDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new QueuedJobAuditError('unavailable')
  }
  return value as Record<string, unknown>
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new QueuedJobAuditError('unavailable')
  }
  return Number(value)
}

function boundedCount(value: unknown, maximum: number): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > maximum
  ) {
    throw new QueuedJobAuditError('unavailable')
  }
  return Number(value)
}

function requestHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'Desktop-Material-self-hosted-runner-manager',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function fetchPage(
  url: URL,
  request: IQueuedJobAuditRequest,
  dependencies: IQueuedJobAuditDependencies
): Promise<Record<string, unknown>> {
  let timed: Awaited<ReturnType<typeof beginTimedFetch>>
  try {
    timed = await beginTimedFetch(
      url,
      {
        headers: requestHeaders(request.token),
        redirect: 'error',
        signal: request.signal,
      },
      dependencies.timeoutMilliseconds ?? AuditRequestTimeoutMilliseconds,
      dependencies
    )
  } catch {
    throw new QueuedJobAuditError('unavailable')
  }
  try {
    const value = await readBoundedActionsJSON(timed.response, timed.signal)
    if (!timed.response.ok) {
      throw new QueuedJobAuditError('unavailable')
    }
    return objectRecord(value)
  } catch (error) {
    if (error instanceof QueuedJobAuditError) {
      throw error
    }
    throw new QueuedJobAuditError('unavailable')
  } finally {
    timed.dispose()
  }
}

async function listRunsForStatus(
  status: typeof PendingRunStatuses[number],
  request: IQueuedJobAuditRequest,
  dependencies: IQueuedJobAuditDependencies
): Promise<ReadonlyArray<IPendingRun>> {
  const runs: IPendingRun[] = []
  const seenRunIds = new Set<number>()
  let expectedTotal: number | null = null
  for (let page = 1; ; page++) {
    const url = new URL(
      `repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(
        request.repository
      )}/actions/runs`,
      request.endpoint
    )
    url.searchParams.set('status', status)
    url.searchParams.set('per_page', String(PageSize))
    url.searchParams.set('page', String(page))
    const response = await fetchPage(url, request, dependencies)
    const total = boundedCount(response.total_count, MaximumRunsPerStatus)
    if (expectedTotal === null) {
      expectedTotal = total
    } else if (total !== expectedTotal) {
      throw new QueuedJobAuditError('unavailable')
    }
    if (!Array.isArray(response.workflow_runs)) {
      throw new QueuedJobAuditError('unavailable')
    }
    if (response.workflow_runs.length > PageSize) {
      throw new QueuedJobAuditError('unavailable')
    }
    for (const value of response.workflow_runs) {
      const run = objectRecord(value)
      if (
        run.status !== status ||
        typeof run.updated_at !== 'string' ||
        run.updated_at.length === 0 ||
        run.updated_at.length > 64 ||
        !Number.isFinite(Date.parse(run.updated_at))
      ) {
        throw new QueuedJobAuditError('unavailable')
      }
      const id = positiveInteger(run.id)
      if (seenRunIds.has(id)) {
        throw new QueuedJobAuditError('unavailable')
      }
      seenRunIds.add(id)
      runs.push({
        id,
        status,
        attempt: positiveInteger(run.run_attempt),
        updatedAt: run.updated_at,
      })
      if (runs.length > MaximumRunsPerStatus) {
        throw new QueuedJobAuditError('unavailable')
      }
    }
    if (
      response.workflow_runs.length === 0 ||
      seenRunIds.size >= expectedTotal
    ) {
      if (seenRunIds.size !== expectedTotal) {
        throw new QueuedJobAuditError('unavailable')
      }
      return runs
    }
  }
}

function parseLabels(value: unknown): ReadonlyArray<string> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 24 ||
    value.some(
      label =>
        typeof label !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(label)
    )
  ) {
    throw new QueuedJobAuditError('unavailable')
  }
  return value as ReadonlyArray<string>
}

function runnerCanAcceptJob(
  runnerLabels: ReadonlySet<string>,
  jobLabels: ReadonlyArray<string>
): boolean {
  return jobLabels.every(label => runnerLabels.has(label.toLocaleLowerCase()))
}

async function inspectRunJobs(
  run: IPendingRun,
  request: IQueuedJobAuditRequest,
  dependencies: IQueuedJobAuditDependencies,
  runnerLabels: ReadonlySet<string>
): Promise<ReadonlyArray<string>> {
  let inspected = 0
  let incomplete = 0
  let expectedTotal: number | null = null
  const seenJobIds = new Set<number>()
  const fingerprintRows: string[] = []
  for (let page = 1; ; page++) {
    const url = new URL(
      `repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(
        request.repository
      )}/actions/runs/${run.id}/jobs`,
      request.endpoint
    )
    url.searchParams.set('filter', 'all')
    url.searchParams.set('per_page', String(PageSize))
    url.searchParams.set('page', String(page))
    const response = await fetchPage(url, request, dependencies)
    const total = boundedCount(response.total_count, MaximumJobsPerRun)
    if (expectedTotal === null) {
      expectedTotal = total
    } else if (total !== expectedTotal) {
      throw new QueuedJobAuditError('unavailable')
    }
    if (!Array.isArray(response.jobs)) {
      throw new QueuedJobAuditError('unavailable')
    }
    if (response.jobs.length > PageSize) {
      throw new QueuedJobAuditError('unavailable')
    }
    for (const value of response.jobs) {
      const job = objectRecord(value)
      const id = positiveInteger(job.id)
      if (seenJobIds.has(id)) {
        throw new QueuedJobAuditError('unavailable')
      }
      seenJobIds.add(id)
      if (
        typeof job.name !== 'string' ||
        job.name.length === 0 ||
        job.name.length > 512 ||
        typeof job.status !== 'string' ||
        job.status.length === 0 ||
        job.status.length > 32
      ) {
        throw new QueuedJobAuditError('unavailable')
      }
      const labels = parseLabels(job.labels)
      inspected++
      if (inspected > MaximumJobsPerRun) {
        throw new QueuedJobAuditError('unavailable')
      }
      fingerprintRows.push(
        JSON.stringify({
          runId: run.id,
          jobId: id,
          status: job.status,
          labels: [...labels].map(label => label.toLocaleLowerCase()).sort(),
        })
      )
      if (job.status !== 'completed') {
        incomplete++
      }
      if (
        job.status !== 'completed' &&
        runnerCanAcceptJob(runnerLabels, labels)
      ) {
        throw new QueuedJobAuditError('matching-job', {
          runId: run.id,
          jobId: id,
          jobName: job.name,
          labels,
          status: job.status,
        })
      }
    }
    if (response.jobs.length === 0 || seenJobIds.size >= expectedTotal) {
      if (seenJobIds.size !== expectedTotal || expectedTotal === 0) {
        throw new QueuedJobAuditError('unavailable')
      }
      if (incomplete === 0) {
        throw new QueuedJobAuditError('unavailable')
      }
      return fingerprintRows
    }
  }
}

/** Refuse to connect a runner while a historical matching job can claim it. */
export async function assertNoQueuedJobsForRunner(
  request: IQueuedJobAuditRequest,
  dependencies: IQueuedJobAuditDependencies = DefaultDependencies
): Promise<IQueuedJobAuditSnapshot> {
  const deadlineSignal = AbortSignal.timeout(AuditDeadlineMilliseconds)
  const boundedRequest: IQueuedJobAuditRequest = {
    ...request,
    signal:
      request.signal === undefined
        ? deadlineSignal
        : AbortSignal.any([request.signal, deadlineSignal]),
  }
  const runnerLabels = new Set(
    boundedRequest.runnerLabels.map(label => label.toLocaleLowerCase())
  )
  if (
    runnerLabels.size === 0 ||
    runnerLabels.size > 24 ||
    [...runnerLabels].some(label => !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(label))
  ) {
    throw new QueuedJobAuditError('unavailable')
  }
  const runPages = await Promise.all(
    PendingRunStatuses.map(status =>
      listRunsForStatus(status, boundedRequest, dependencies)
    )
  )
  const runsById = new Map<number, IPendingRun>()
  for (const run of runPages.flat()) {
    const existing = runsById.get(run.id)
    if (
      existing !== undefined &&
      JSON.stringify(existing) !== JSON.stringify(run)
    ) {
      throw new QueuedJobAuditError('unavailable')
    }
    runsById.set(run.id, run)
  }
  if (runsById.size > MaximumRunsPerStatus) {
    throw new QueuedJobAuditError('unavailable')
  }
  const runs = [...runsById.values()].sort((left, right) => left.id - right.id)
  const fingerprintRows: string[] = runs.map(run => JSON.stringify(run))
  for (const run of runs) {
    fingerprintRows.push(
      ...(await inspectRunJobs(run, boundedRequest, dependencies, runnerLabels))
    )
  }
  return { fingerprint: fingerprintRows.sort().join('\n') }
}
