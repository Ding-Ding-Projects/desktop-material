import { readBoundedActionsJSON } from './actions-response'

const GitHubHost = 'github.com'
const GitHubAPIHost = 'api.github.com'
const BuildJobName = 'Windows x64'
const MaximumProbeBytes = 256 * 1024
const ProbeTimeoutMilliseconds = 10_000
const MaximumRunsPerWorkflow = 10
const ObjectIDPattern = /^[0-9a-f]{40}$/
const RepositoryPartPattern = /^[A-Za-z0-9_.-]{1,100}$/

type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>

export interface IDesktopMaterialUpdateBuildProbe {
  readonly updatesURL: string
  readonly installedSHA: string
  readonly fetcher?: Fetcher
  readonly signal?: AbortSignal
}

interface IUpdateRepository {
  readonly owner: string
  readonly name: string
}

interface IWorkflowBuild {
  readonly file: string
  readonly path: string
  readonly events: ReadonlySet<string>
}

interface IActiveBuildRun {
  readonly id: number
  readonly sha: string
}

const WorkflowBuilds: ReadonlyArray<IWorkflowBuild> = [
  {
    file: 'ci.yml',
    path: '.github/workflows/ci.yml',
    events: new Set(['push']),
  },
  {
    file: 'build-installers.yml',
    path: '.github/workflows/build-installers.yml',
    events: new Set(['workflow_run', 'workflow_dispatch']),
  },
]

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null
}

function normalizeObjectID(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.toLowerCase()
  return ObjectIDPattern.test(normalized) ? normalized : null
}

function normalizeRunID(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

/** Resolve only the GitHub repository which owns the configured update feed. */
export function getUpdateFeedRepository(
  updatesURL: string
): IUpdateRepository | null {
  let url: URL
  try {
    url = new URL(updatesURL)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== GitHubHost) {
    return null
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (
    parts.length < 5 ||
    parts[2] !== 'releases' ||
    parts[3] !== 'latest' ||
    parts[4] !== 'download' ||
    !RepositoryPartPattern.test(parts[0]) ||
    !RepositoryPartPattern.test(parts[1])
  ) {
    return null
  }

  return { owner: parts[0], name: parts[1] }
}

function activeBuildRuns(
  value: unknown,
  workflow: IWorkflowBuild
): ReadonlyArray<IActiveBuildRun> {
  const input = record(value)
  if (input === null || !Array.isArray(input.workflow_runs)) {
    return []
  }

  const runs = new Array<IActiveBuildRun>()
  for (const value of input.workflow_runs.slice(0, MaximumRunsPerWorkflow)) {
    const run = record(value)
    if (
      run === null ||
      run.status !== 'in_progress' ||
      run.head_branch !== 'main' ||
      run.path !== workflow.path ||
      typeof run.event !== 'string' ||
      !workflow.events.has(run.event)
    ) {
      continue
    }
    const sha = normalizeObjectID(run.head_sha)
    const id = normalizeRunID(run.id)
    if (
      sha !== null &&
      id !== null &&
      !runs.some(candidate => candidate.id === id)
    ) {
      runs.push({ id, sha })
    }
  }
  return runs
}

function buildJobIsInProgress(
  value: unknown,
  expectedRun: IActiveBuildRun
): boolean {
  const input = record(value)
  if (input === null || !Array.isArray(input.jobs)) {
    return false
  }
  return input.jobs.slice(0, MaximumRunsPerWorkflow).some(value => {
    const job = record(value)
    return (
      job !== null &&
      job.name === BuildJobName &&
      job.status === 'in_progress' &&
      normalizeRunID(job.run_id) === expectedRun.id &&
      normalizeObjectID(job.head_sha) === expectedRun.sha
    )
  })
}

function compareStatus(value: unknown): string | null {
  const input = record(value)
  return typeof input?.status === 'string' ? input.status : null
}

async function boundedGitHubJSON(
  response: Response,
  signal: AbortSignal
): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`GitHub update-build probe failed with ${response.status}.`)
  }
  return await readBoundedActionsJSON(response, signal, MaximumProbeBytes)
}

function combineAbortSignals(
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal
): AbortSignal {
  if (callerSignal === undefined) {
    return timeoutSignal
  }
  return AbortSignal.any([callerSignal, timeoutSignal])
}

/**
 * Check GitHub's existing Actions data for an exact newer commit whose Windows
 * x64 job is active in either prerequisite CI or installer packaging. This
 * state is deliberately remote and transient; callers must not persist it
 * between update checks.
 */
export async function isNewerDesktopMaterialBuildInProgress({
  updatesURL,
  installedSHA,
  fetcher = fetch,
  signal: callerSignal,
}: IDesktopMaterialUpdateBuildProbe): Promise<boolean> {
  const repository = getUpdateFeedRepository(updatesURL)
  const installed = normalizeObjectID(installedSHA)
  if (repository === null || installed === null) {
    return false
  }

  const timeout = AbortSignal.timeout(ProbeTimeoutMilliseconds)
  const signal = combineAbortSignals(callerSignal, timeout)
  const repositoryPath = `${encodeURIComponent(
    repository.owner
  )}/${encodeURIComponent(repository.name)}`
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const comparedSHAs = new Map<string, boolean>()
  for (const workflow of WorkflowBuilds) {
    const workflowURL = new URL(
      `https://${GitHubAPIHost}/repos/${repositoryPath}/actions/workflows/${workflow.file}/runs`
    )
    workflowURL.searchParams.set('branch', 'main')
    workflowURL.searchParams.set('status', 'in_progress')
    workflowURL.searchParams.set('per_page', MaximumRunsPerWorkflow.toString())

    const workflowResponse = await fetcher(workflowURL.toString(), {
      headers,
      signal,
    })
    const runs = activeBuildRuns(
      await boundedGitHubJSON(workflowResponse, signal),
      workflow
    )

    for (const run of runs) {
      if (run.sha === installed) {
        continue
      }
      const jobsURL = new URL(
        `https://${GitHubAPIHost}/repos/${repositoryPath}/actions/runs/${run.id}/jobs`
      )
      jobsURL.searchParams.set('filter', 'latest')
      jobsURL.searchParams.set('per_page', MaximumRunsPerWorkflow.toString())
      const jobsResponse = await fetcher(jobsURL.toString(), {
        headers,
        signal,
      })
      if (
        !buildJobIsInProgress(
          await boundedGitHubJSON(jobsResponse, signal),
          run
        )
      ) {
        continue
      }

      let isAhead = comparedSHAs.get(run.sha)
      if (isAhead === undefined) {
        const compareURL = `https://${GitHubAPIHost}/repos/${repositoryPath}/compare/${installed}...${run.sha}`
        const compareResponse = await fetcher(compareURL, { headers, signal })
        isAhead =
          compareStatus(await boundedGitHubJSON(compareResponse, signal)) ===
          'ahead'
        comparedSHAs.set(run.sha, isAhead)
      }
      if (isAhead) {
        return true
      }
    }
  }

  return false
}
