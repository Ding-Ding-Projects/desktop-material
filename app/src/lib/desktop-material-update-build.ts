import { readBoundedActionsJSON } from './actions-response'

const GitHubHost = 'github.com'
const GitHubAPIHost = 'api.github.com'
const InstallerWorkflow = 'build-installers.yml'
const InstallerWorkflowPath = `.github/workflows/${InstallerWorkflow}`
const InstallerJobName = 'Windows x64'
const MaximumProbeBytes = 256 * 1024
const ProbeTimeoutMilliseconds = 10_000
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

interface IActiveInstallerRun {
  readonly id: number
  readonly sha: string
}

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

function activeInstallerRuns(
  value: unknown
): ReadonlyArray<IActiveInstallerRun> {
  const input = record(value)
  if (input === null || !Array.isArray(input.workflow_runs)) {
    return []
  }

  const runs = new Array<IActiveInstallerRun>()
  for (const value of input.workflow_runs.slice(0, 10)) {
    const run = record(value)
    if (
      run === null ||
      run.status !== 'in_progress' ||
      run.head_branch !== 'main' ||
      run.path !== InstallerWorkflowPath ||
      (run.event !== 'workflow_run' && run.event !== 'workflow_dispatch')
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

function installerJobIsInProgress(
  value: unknown,
  expectedRun: IActiveInstallerRun
): boolean {
  const input = record(value)
  if (input === null || !Array.isArray(input.jobs)) {
    return false
  }
  return input.jobs.slice(0, 10).some(value => {
    const job = record(value)
    return (
      job !== null &&
      job.name === InstallerJobName &&
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
 * Check GitHub's existing Actions run data for an exact newer commit which the
 * installer workflow is actively building. This state is deliberately remote
 * and transient; callers must not persist it between update checks.
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
  const workflowURL = new URL(
    `https://${GitHubAPIHost}/repos/${repositoryPath}/actions/workflows/${InstallerWorkflow}/runs`
  )
  workflowURL.searchParams.set('branch', 'main')
  workflowURL.searchParams.set('status', 'in_progress')
  workflowURL.searchParams.set('per_page', '10')

  const workflowResponse = await fetcher(workflowURL.toString(), {
    headers,
    signal,
  })
  const installerRuns = activeInstallerRuns(
    await boundedGitHubJSON(workflowResponse, signal)
  )

  for (const installerRun of installerRuns) {
    if (installerRun.sha === installed) {
      continue
    }
    const jobsURL = new URL(
      `https://${GitHubAPIHost}/repos/${repositoryPath}/actions/runs/${installerRun.id}/jobs`
    )
    jobsURL.searchParams.set('filter', 'latest')
    jobsURL.searchParams.set('per_page', '10')
    const jobsResponse = await fetcher(jobsURL.toString(), { headers, signal })
    if (
      !installerJobIsInProgress(
        await boundedGitHubJSON(jobsResponse, signal),
        installerRun
      )
    ) {
      continue
    }
    const compareURL = `https://${GitHubAPIHost}/repos/${repositoryPath}/compare/${installed}...${installerRun.sha}`
    const compareResponse = await fetcher(compareURL, { headers, signal })
    if (
      compareStatus(await boundedGitHubJSON(compareResponse, signal)) ===
      'ahead'
    ) {
      return true
    }
  }

  return false
}
