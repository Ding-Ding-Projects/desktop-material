import { readBoundedActionsJSON } from '../../lib/actions-response'
import {
  assessSelfHostedWorkflowRisk,
  ISelfHostedWorkflowRisk,
} from '../../lib/self-hosted-runner/workflow-trust'
import { beginTimedFetch } from './timed-fetch'

const AuditRequestTimeoutMilliseconds = 10_000
const AuditDeadlineMilliseconds = 45_000
const MaximumWorkflowBytes = 1024 * 1024
const MaximumWorkflowFiles = 250

export interface IRepositoryWorkflowAuditRequest {
  readonly endpoint: string
  readonly owner: string
  readonly repository: string
  readonly token: string
  readonly runnerLabels: ReadonlyArray<string>
  readonly signal?: AbortSignal
}

export interface IRepositoryWorkflowAuditResult {
  readonly commitSHA: string
  readonly workflowCount: number
}

export class RepositoryWorkflowAuditError extends Error {
  public constructor(
    public readonly kind: 'unavailable' | 'unsafe' | 'public-repository',
    public readonly findings: ReadonlyArray<
      ISelfHostedWorkflowRisk & { readonly path: string }
    > = []
  ) {
    super(`repository-workflow-audit-${kind}`)
  }
}

export interface IWorkflowAuditDependencies {
  readonly fetch: typeof fetch
  readonly timeoutMilliseconds?: number
}

const DefaultWorkflowAuditDependencies: IWorkflowAuditDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
}

function requestTimeout(dependencies: IWorkflowAuditDependencies): number {
  return dependencies.timeoutMilliseconds ?? AuditRequestTimeoutMilliseconds
}

function headers(token: string, accept: string): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'User-Agent': 'Desktop-Material-self-hosted-runner-manager',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function fetchBoundedJSON(
  url: URL,
  token: string,
  dependencies: IWorkflowAuditDependencies,
  allowNotFound: boolean = false,
  signal?: AbortSignal
): Promise<{ readonly status: number; readonly value: unknown }> {
  let request: Awaited<ReturnType<typeof beginTimedFetch>>
  try {
    request = await beginTimedFetch(
      url,
      {
        headers: headers(token, 'application/vnd.github+json'),
        redirect: 'error',
        signal,
      },
      requestTimeout(dependencies),
      dependencies
    )
  } catch {
    throw new RepositoryWorkflowAuditError('unavailable')
  }
  try {
    const value = await readBoundedActionsJSON(request.response, request.signal)
    if (!request.response.ok) {
      if (allowNotFound && request.response.status === 404) {
        return { status: 404, value }
      }
      throw new RepositoryWorkflowAuditError('unavailable')
    }
    return { status: request.response.status, value }
  } catch (error) {
    if (error instanceof RepositoryWorkflowAuditError) {
      throw error
    }
    throw new RepositoryWorkflowAuditError('unavailable')
  } finally {
    request.dispose()
  }
}

async function fetchBoundedWorkflow(
  url: URL,
  token: string,
  dependencies: IWorkflowAuditDependencies,
  signal?: AbortSignal
): Promise<string> {
  let request: Awaited<ReturnType<typeof beginTimedFetch>>
  try {
    request = await beginTimedFetch(
      url,
      {
        headers: headers(token, 'application/vnd.github.raw+json'),
        redirect: 'error',
        signal,
      },
      requestTimeout(dependencies),
      dependencies
    )
  } catch {
    throw new RepositoryWorkflowAuditError('unavailable')
  }
  try {
    if (!request.response.ok) {
      await request.response.body?.cancel().catch(() => undefined)
      throw new RepositoryWorkflowAuditError('unavailable')
    }
    const reader = request.response.body?.getReader()
    if (reader === undefined) {
      throw new RepositoryWorkflowAuditError('unavailable')
    }
    let bytes = new Uint8Array(0)
    let length = 0
    while (true) {
      const next = await reader.read()
      if (next.done) {
        break
      }
      length += next.value.byteLength
      if (length > MaximumWorkflowBytes) {
        await reader.cancel().catch(() => undefined)
        throw new RepositoryWorkflowAuditError('unavailable')
      }
      const expanded = new Uint8Array(length)
      expanded.set(bytes)
      expanded.set(next.value, length - next.value.byteLength)
      bytes = expanded
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    if (error instanceof RepositoryWorkflowAuditError) {
      throw error
    }
    throw new RepositoryWorkflowAuditError('unavailable')
  } finally {
    request.dispose()
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RepositoryWorkflowAuditError('unavailable')
  }
  return value as Record<string, unknown>
}

/** Audit every workflow at one immutable default-branch commit. */
export async function auditRepositoryWorkflowsForSelfHostedRunner(
  request: IRepositoryWorkflowAuditRequest,
  dependencies: IWorkflowAuditDependencies = DefaultWorkflowAuditDependencies
): Promise<IRepositoryWorkflowAuditResult> {
  const deadlineSignal = AbortSignal.timeout(AuditDeadlineMilliseconds)
  const signal =
    request.signal === undefined
      ? deadlineSignal
      : AbortSignal.any([request.signal, deadlineSignal])
  if (
    !Array.isArray(request.runnerLabels) ||
    request.runnerLabels.length === 0 ||
    request.runnerLabels.length > 24 ||
    request.runnerLabels.some(
      label =>
        typeof label !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(label)
    )
  ) {
    throw new RepositoryWorkflowAuditError('unavailable')
  }
  const repositoryURL = new URL(
    `repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(
      request.repository
    )}`,
    request.endpoint
  )
  const repository = objectRecord(
    (
      await fetchBoundedJSON(
        repositoryURL,
        request.token,
        dependencies,
        false,
        signal
      )
    ).value
  )
  if (repository.private !== true) {
    throw new RepositoryWorkflowAuditError('public-repository')
  }
  const forkPolicyURL = new URL(
    `repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(
      request.repository
    )}/actions/permissions/fork-pr-workflows-private-repos`,
    request.endpoint
  )
  const forkPolicy = objectRecord(
    (
      await fetchBoundedJSON(
        forkPolicyURL,
        request.token,
        dependencies,
        false,
        signal
      )
    ).value
  )
  if (typeof forkPolicy.run_workflows_from_fork_pull_requests !== 'boolean') {
    throw new RepositoryWorkflowAuditError('unavailable')
  }
  if (forkPolicy.run_workflows_from_fork_pull_requests) {
    throw new RepositoryWorkflowAuditError('unsafe', [
      {
        path: '<repository-actions-policy>',
        job: '*',
        trigger: 'pull_request',
        reason: 'untrusted-workflow-source',
      },
    ])
  }
  if (
    typeof repository.default_branch !== 'string' ||
    repository.default_branch.length === 0 ||
    repository.default_branch.length > 255
  ) {
    throw new RepositoryWorkflowAuditError('unavailable')
  }

  const commitURL = new URL(
    `repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(
      request.repository
    )}/commits/${encodeURIComponent(repository.default_branch)}`,
    request.endpoint
  )
  const commit = objectRecord(
    (
      await fetchBoundedJSON(
        commitURL,
        request.token,
        dependencies,
        false,
        signal
      )
    ).value
  )
  if (
    typeof commit.sha !== 'string' ||
    !/^[a-f0-9]{40,64}$/i.test(commit.sha)
  ) {
    throw new RepositoryWorkflowAuditError('unavailable')
  }

  const directoryURL = new URL(
    `repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(
      request.repository
    )}/contents/.github/workflows`,
    request.endpoint
  )
  directoryURL.searchParams.set('ref', commit.sha)
  const directory = await fetchBoundedJSON(
    directoryURL,
    request.token,
    dependencies,
    true,
    signal
  )
  if (directory.status === 404) {
    return { commitSHA: commit.sha, workflowCount: 0 }
  }
  if (
    !Array.isArray(directory.value) ||
    directory.value.length > MaximumWorkflowFiles
  ) {
    throw new RepositoryWorkflowAuditError('unavailable')
  }
  const workflowPaths = directory.value.map(item => {
    const entry = objectRecord(item)
    if (
      entry.type !== 'file' ||
      typeof entry.path !== 'string' ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/i.test(entry.path) ||
      typeof entry.size !== 'number' ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > MaximumWorkflowBytes
    ) {
      throw new RepositoryWorkflowAuditError('unavailable')
    }
    return entry.path
  })

  const findings: Array<ISelfHostedWorkflowRisk & { readonly path: string }> =
    []
  for (const path of workflowPaths) {
    const workflowURL = new URL(
      `repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(
        request.repository
      )}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
      request.endpoint
    )
    workflowURL.searchParams.set('ref', commit.sha)
    let source: string
    try {
      source = await fetchBoundedWorkflow(
        workflowURL,
        request.token,
        dependencies,
        signal
      )
      for (const risk of assessSelfHostedWorkflowRisk(
        source,
        `${request.owner}/${request.repository}`,
        request.runnerLabels
      )) {
        findings.push({ path, ...risk })
      }
    } catch (error) {
      if (error instanceof RepositoryWorkflowAuditError) {
        throw error
      }
      throw new RepositoryWorkflowAuditError('unavailable')
    }
  }
  if (findings.length > 0) {
    throw new RepositoryWorkflowAuditError('unsafe', findings)
  }
  return { commitSHA: commit.sha, workflowCount: workflowPaths.length }
}
