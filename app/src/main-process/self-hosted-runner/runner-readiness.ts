import { readBoundedActionsJSON } from '../../lib/actions-response'
import { beginTimedFetch } from './timed-fetch'

const InventoryPageSize = 100
const MaximumInventoryPages = 10
const InventoryRequestTimeoutMilliseconds = 10_000

export interface IRepositoryRunnerInventoryDependencies {
  readonly fetch: typeof fetch
  readonly timeoutMilliseconds?: number
}

const DefaultInventoryDependencies: IRepositoryRunnerInventoryDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
}

export interface IRepositoryRunnerInventoryEntry {
  readonly id: number
  readonly name: string
  readonly status: 'online' | 'offline'
  readonly busy: boolean
  readonly os: string
  readonly labels: ReadonlyArray<string>
}

export interface IRepositoryRunnerInventoryRequest {
  readonly endpoint: string
  readonly owner: string
  readonly repository: string
  readonly token: string
  readonly signal?: AbortSignal
}

export interface IRunnerReadinessExpectation {
  readonly existingRunnerIds: ReadonlySet<number>
  readonly expectedRunnerId?: number
  readonly name: string
  readonly requiredLabels: ReadonlyArray<string>
  readonly os: 'Windows' | 'Linux'
  readonly architecture: 'X64' | 'ARM64'
}

export class RunnerReadinessError extends Error {
  public constructor(
    public readonly code: 'local-process-exited' | 'runner-never-online'
  ) {
    super(code)
  }
}

function parseInventoryPage(value: unknown): {
  readonly totalCount: number
  readonly runners: ReadonlyArray<IRepositoryRunnerInventoryEntry>
} {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !Number.isSafeInteger((value as { total_count?: unknown }).total_count) ||
    Number((value as { total_count: number }).total_count) < 0 ||
    !Array.isArray((value as { runners?: unknown }).runners)
  ) {
    throw new Error('runner-inventory-invalid')
  }
  const totalCount = (value as { total_count: number }).total_count
  const rawRunners = (value as { runners: unknown[] }).runners
  if (rawRunners.length > InventoryPageSize) {
    throw new Error('runner-inventory-invalid')
  }
  const runners = rawRunners.map(candidate => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      throw new Error('runner-inventory-invalid')
    }
    const runner = candidate as Record<string, unknown>
    if (
      !Number.isSafeInteger(runner.id) ||
      Number(runner.id) <= 0 ||
      typeof runner.name !== 'string' ||
      runner.name.length === 0 ||
      runner.name.length > 256 ||
      (runner.status !== 'online' && runner.status !== 'offline') ||
      typeof runner.busy !== 'boolean' ||
      typeof runner.os !== 'string' ||
      runner.os.length > 64 ||
      !Array.isArray(runner.labels)
    ) {
      throw new Error('runner-inventory-invalid')
    }
    const labels = runner.labels.map(label => {
      if (
        typeof label !== 'object' ||
        label === null ||
        Array.isArray(label) ||
        typeof (label as { name?: unknown }).name !== 'string' ||
        (label as { name: string }).name.length > 256
      ) {
        throw new Error('runner-inventory-invalid')
      }
      return (label as { name: string }).name
    })
    return {
      id: Number(runner.id),
      name: runner.name,
      status: runner.status as 'online' | 'offline',
      busy: runner.busy,
      os: runner.os,
      labels,
    }
  })
  return { totalCount, runners }
}

async function fetchInventoryPage(
  request: IRepositoryRunnerInventoryRequest,
  page: number,
  dependencies: IRepositoryRunnerInventoryDependencies
): Promise<ReturnType<typeof parseInventoryPage>> {
  const url = new URL(
    `repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(
      request.repository
    )}/actions/runners`,
    request.endpoint
  )
  url.searchParams.set('per_page', String(InventoryPageSize))
  url.searchParams.set('page', String(page))
  const timedFetch = await beginTimedFetch(
    url,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${request.token}`,
        'User-Agent': 'Desktop-Material-self-hosted-runner-manager',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'error',
      signal: request.signal,
    },
    dependencies.timeoutMilliseconds ?? InventoryRequestTimeoutMilliseconds,
    dependencies
  )
  try {
    const value = await readBoundedActionsJSON(
      timedFetch.response,
      timedFetch.signal
    )
    if (!timedFetch.response.ok) {
      throw new Error('runner-inventory-unavailable')
    }
    return parseInventoryPage(value)
  } finally {
    timedFetch.dispose()
  }
}

export async function fetchRepositoryRunnerInventory(
  request: IRepositoryRunnerInventoryRequest,
  dependencies: IRepositoryRunnerInventoryDependencies = DefaultInventoryDependencies
): Promise<ReadonlyArray<IRepositoryRunnerInventoryEntry>> {
  const first = await fetchInventoryPage(request, 1, dependencies)
  const pageCount = Math.max(1, Math.ceil(first.totalCount / InventoryPageSize))
  if (pageCount > MaximumInventoryPages) {
    throw new Error('runner-inventory-too-large')
  }
  const runners: IRepositoryRunnerInventoryEntry[] = []
  const seenRunnerIds = new Set<number>()
  const appendPage = (
    pageRunners: ReadonlyArray<IRepositoryRunnerInventoryEntry>
  ) => {
    for (const runner of pageRunners) {
      if (seenRunnerIds.has(runner.id)) {
        throw new Error('runner-inventory-invalid')
      }
      seenRunnerIds.add(runner.id)
      runners.push(runner)
    }
  }
  appendPage(first.runners)
  for (let page = 2; page <= pageCount; page++) {
    const next = await fetchInventoryPage(request, page, dependencies)
    if (next.totalCount !== first.totalCount) {
      throw new Error('runner-inventory-changed')
    }
    appendPage(next.runners)
  }
  if (
    runners.length !== first.totalCount ||
    seenRunnerIds.size !== first.totalCount
  ) {
    throw new Error('runner-inventory-invalid')
  }
  return runners
}

export function runnerMatchesExpectedIdentity(
  runner: IRepositoryRunnerInventoryEntry,
  expectation: IRunnerReadinessExpectation
): boolean {
  if (
    (expectation.expectedRunnerId !== undefined &&
      runner.id !== expectation.expectedRunnerId) ||
    runner.name.toLocaleLowerCase() !== expectation.name.toLocaleLowerCase() ||
    runner.os.toLocaleLowerCase() !== expectation.os.toLocaleLowerCase()
  ) {
    return false
  }
  const actualLabels = new Set(
    runner.labels.map(label => label.toLocaleLowerCase())
  )
  const expectedLabels = new Set(
    [
      'self-hosted',
      expectation.os,
      expectation.architecture,
      ...expectation.requiredLabels,
    ].map(label => label.toLocaleLowerCase())
  )
  return (
    actualLabels.size === expectedLabels.size &&
    [...expectedLabels].every(label => actualLabels.has(label))
  )
}

export function runnerMeetsReadiness(
  runner: IRepositoryRunnerInventoryEntry,
  expectation: IRunnerReadinessExpectation
): boolean {
  return (
    !expectation.existingRunnerIds.has(runner.id) &&
    runner.status === 'online' &&
    runnerMatchesExpectedIdentity(runner, expectation)
  )
}

export interface IRunnerReadinessDependencies {
  readonly fetchInventory: () => Promise<
    ReadonlyArray<IRepositoryRunnerInventoryEntry>
  >
  readonly isLocalProcessRunning: () => Promise<boolean>
  readonly now: () => number
  readonly delay: (milliseconds: number) => Promise<void>
  readonly signal?: AbortSignal
}

export async function waitForRunnerReadiness(
  expectation: IRunnerReadinessExpectation,
  dependencies: IRunnerReadinessDependencies,
  deadlineMilliseconds: number = 60_000,
  pollIntervalMilliseconds: number = 2_000
): Promise<IRepositoryRunnerInventoryEntry> {
  const deadline = dependencies.now() + deadlineMilliseconds
  while (true) {
    if (dependencies.signal?.aborted) {
      throw new Error('runner-operation-cancelled')
    }
    if (!(await dependencies.isLocalProcessRunning())) {
      throw new RunnerReadinessError('local-process-exited')
    }
    try {
      const ready = (await dependencies.fetchInventory()).find(runner =>
        runnerMeetsReadiness(runner, expectation)
      )
      if (ready !== undefined) {
        return ready
      }
    } catch {
      // A bounded transient API failure is retried until the outer deadline.
    }
    if (dependencies.now() >= deadline) {
      throw new RunnerReadinessError('runner-never-online')
    }
    await dependencies.delay(pollIntervalMilliseconds)
  }
}
