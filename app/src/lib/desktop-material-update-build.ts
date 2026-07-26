import {
  ActionsMetadataJSONError,
  readBoundedActionsJSON,
} from './actions-response'
import {
  IUpdateComingSoonSignal,
  UpdateComingSoonSignalKind,
} from './update-coming-soon-estimate'

const GitHubHost = 'github.com'
const GitHubAPIHost = 'api.github.com'
const BuildJobName = 'Windows x64'
/**
 * A single `compare` or `workflow_runs` page is routinely far larger than the
 * few fields this probe reads, so the ceiling matches the shared Actions bound
 * rather than the old 256 KiB. An oversized response is still an expected,
 * handled condition — see `probeDegraded` — never an unhandled rejection.
 */
const MaximumProbeBytes = 2 * 1024 * 1024
const ProbeTimeoutMilliseconds = 10_000
const MaximumRunsPerWorkflow = 10
/** How many finished runs and published releases the estimate samples. */
const MaximumSamples = 5
/** A run longer than this is treated as an outlier, not a typical duration. */
const MaximumPlausibleRunMilliseconds = 12 * 60 * 60 * 1000
const ObjectIDPattern = /^[0-9a-f]{40}$/
const RepositoryPartPattern = /^[A-Za-z0-9_.-]{1,100}$/
const ReleaseTagPattern = /^[\w.+-]{1,80}$/

const ActionsHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>

/** Why one leg of the probe could not be read. Always handled, never thrown. */
export type UpdateBuildProbeDegradation = 'metadata-too-large' | 'invalid-json'

export interface IDesktopMaterialUpdateBuildProbe {
  readonly updatesURL: string
  readonly installedSHA: string
  readonly fetcher?: Fetcher
  readonly signal?: AbortSignal
  /**
   * Called once per skipped response so the caller can log it and, at most
   * once, tell the user. The probe continues with the remaining legs and only
   * ever answers "no newer build was proven".
   */
  readonly onDegraded?: (degradation: UpdateBuildProbeDegradation) => void
  /**
   * Called with the run that proved a newer build, immediately before the
   * probe answers "yes". Purely observational: it reports what was already
   * verified rather than adding a request or changing the verdict.
   */
  readonly onActiveBuild?: (build: IActiveBuildSignal) => void
}

/** The exact in-progress run which proved a newer build is being packaged. */
export interface IActiveBuildSignal {
  /** Which workflow file the run belongs to. */
  readonly workflowFile: string
  readonly runID: number
  readonly headSHA: string
  /** The run's page on github.com, when the API advertised a safe one. */
  readonly runURL: string | null
  /** When the run started, in epoch milliseconds, when known. */
  readonly runStartedAt: number | null
}

/**
 * Classify a bounded-read failure. Anything else (network, abort, a non-OK
 * status) stays exceptional and is reported to the caller unchanged.
 */
export function updateBuildProbeDegradation(
  error: unknown
): UpdateBuildProbeDegradation | null {
  if (!(error instanceof ActionsMetadataJSONError)) {
    return null
  }
  return error.kind === 'too-large' ? 'metadata-too-large' : 'invalid-json'
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
  readonly url: string | null
  readonly startedAt: number | null
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

/**
 * Keep only links that genuinely point at github.com over HTTPS. The payload
 * comes from api.github.com, but a URL that ends up in a clickable banner is
 * never trusted on provenance alone.
 */
function normalizeGitHubURL(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname.toLowerCase() === GitHubHost
      ? url.toString()
      : null
  } catch {
    return null
  }
}

/** Read an ISO timestamp as epoch milliseconds, or null when unusable. */
function normalizeTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeReleaseTag(value: unknown): string | null {
  return typeof value === 'string' && ReleaseTagPattern.test(value)
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
      runs.push({
        id,
        sha,
        url: normalizeGitHubURL(run.html_url),
        startedAt:
          normalizeTimestamp(run.run_started_at) ??
          normalizeTimestamp(run.created_at),
      })
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
  onDegraded,
  onActiveBuild,
}: IDesktopMaterialUpdateBuildProbe): Promise<boolean> {
  const repository = getUpdateFeedRepository(updatesURL)
  const installed = normalizeObjectID(installedSHA)
  if (repository === null || installed === null) {
    return false
  }

  /**
   * Read one leg, or report `null` when its body was unreadable within the
   * bound. A single oversized page must not abort the whole probe — that is
   * what turned an expected GitHub response size into a floating rejection and
   * a generic "background action stopped unexpectedly" toast.
   */
  const readLeg = async (
    response: Response,
    legSignal: AbortSignal
  ): Promise<unknown | null> => {
    try {
      return await boundedGitHubJSON(response, legSignal)
    } catch (error) {
      const degradation = updateBuildProbeDegradation(error)
      if (degradation === null) {
        throw error
      }
      onDegraded?.(degradation)
      return null
    }
  }

  const timeout = AbortSignal.timeout(ProbeTimeoutMilliseconds)
  const signal = combineAbortSignals(callerSignal, timeout)
  const repositoryPath = repositoryAPIPath(repository)
  const headers = ActionsHeaders
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
    const workflowBody = await readLeg(workflowResponse, signal)
    if (workflowBody === null) {
      continue
    }
    const runs = activeBuildRuns(workflowBody, workflow)

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
      const jobsBody = await readLeg(jobsResponse, signal)
      if (jobsBody === null || !buildJobIsInProgress(jobsBody, run)) {
        continue
      }

      let isAhead = comparedSHAs.get(run.sha)
      if (isAhead === undefined) {
        const compareURL = `https://${GitHubAPIHost}/repos/${repositoryPath}/compare/${installed}...${run.sha}`
        const compareResponse = await fetcher(compareURL, { headers, signal })
        const compareBody = await readLeg(compareResponse, signal)
        if (compareBody === null) {
          // Unproven is not "ahead": skip this run rather than guess.
          continue
        }
        isAhead = compareStatus(compareBody) === 'ahead'
        comparedSHAs.set(run.sha, isAhead)
      }
      if (isAhead) {
        onActiveBuild?.({
          workflowFile: workflow.file,
          runID: run.id,
          headSHA: run.sha,
          runURL: run.url,
          runStartedAt: run.startedAt,
        })
        return true
      }
    }
  }

  return false
}

function repositoryAPIPath(repository: IUpdateRepository): string {
  return `${encodeURIComponent(repository.owner)}/${encodeURIComponent(
    repository.name
  )}`
}

/**
 * Read one supplementary leg without ever failing the probe.
 *
 * The legs below only enrich an estimate that is already labelled as an
 * estimate, so an unavailable, oversized, or malformed response means "this
 * detail is unknown" rather than an error. The load-bearing verdict — is a
 * newer build actually coming — is decided before any of them run.
 */
async function readOptionalActionsJSON(
  fetcher: Fetcher,
  url: string,
  signal: AbortSignal
): Promise<unknown | null> {
  try {
    const response = await fetcher(url, { headers: ActionsHeaders, signal })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return null
    }
    return await readBoundedActionsJSON(response, signal, MaximumProbeBytes)
  } catch {
    return null
  }
}

/** The head commit of a `compare` result, which is its final commit. */
function compareHeadSHA(value: unknown): string | null {
  const input = record(value)
  if (input === null || !Array.isArray(input.commits)) {
    return null
  }
  const head = record(input.commits[input.commits.length - 1])
  return head === null ? null : normalizeObjectID(head.sha)
}

interface IFinishedRunSample {
  readonly headSHA: string | null
  readonly durationMilliseconds: number | null
}

function finishedRunSamples(value: unknown): ReadonlyArray<IFinishedRunSample> {
  const input = record(value)
  if (input === null || !Array.isArray(input.workflow_runs)) {
    return []
  }

  const samples = new Array<IFinishedRunSample>()
  for (const value of input.workflow_runs.slice(0, MaximumSamples)) {
    const run = record(value)
    if (
      run === null ||
      run.head_branch !== 'main' ||
      run.conclusion !== 'success'
    ) {
      continue
    }
    const started =
      normalizeTimestamp(run.run_started_at) ??
      normalizeTimestamp(run.created_at)
    const finished = normalizeTimestamp(run.updated_at)
    const duration =
      started !== null && finished !== null ? finished - started : null
    samples.push({
      headSHA: normalizeObjectID(run.head_sha),
      durationMilliseconds:
        duration !== null &&
        duration > 0 &&
        duration <= MaximumPlausibleRunMilliseconds
          ? duration
          : null,
    })
  }
  return samples
}

interface IReleaseSamples {
  readonly publishedTimes: ReadonlyArray<number>
  readonly latestTag: string | null
  readonly draftTag: string | null
}

function releaseSamples(body: unknown): IReleaseSamples {
  if (!Array.isArray(body)) {
    return { publishedTimes: [], latestTag: null, draftTag: null }
  }

  const publishedTimes = new Array<number>()
  let latestTag: string | null = null
  let draftTag: string | null = null
  for (const value of body.slice(0, MaximumSamples)) {
    const release = record(value)
    if (release === null) {
      continue
    }
    const tag = normalizeReleaseTag(release.tag_name)
    if (release.draft === true) {
      // A visible draft is the one place the fork names the coming version
      // before it exists. Anonymous callers rarely see one, hence "if known".
      draftTag ??= tag
      continue
    }
    const published = normalizeTimestamp(release.published_at)
    if (published !== null) {
      publishedTimes.push(published)
      latestTag ??= tag
    }
  }
  return { publishedTimes, latestTag, draftTag }
}

/**
 * Gather everything observable about an update that is on its way, so the UI
 * can say *when* as well as *that* — always as an estimate.
 *
 * The verdict itself is still decided by `isNewerDesktopMaterialBuildInProgress`
 * and, failing that, by a single `compare` against `main`. Only once a newer
 * commit is proven does this spend requests on the samples an estimate needs,
 * so the ordinary "you are up to date" check costs one extra request.
 */
export async function probeUpdateComingSoon({
  updatesURL,
  installedSHA,
  fetcher = fetch,
  signal: callerSignal,
  onDegraded,
}: IDesktopMaterialUpdateBuildProbe): Promise<IUpdateComingSoonSignal | null> {
  const repository = getUpdateFeedRepository(updatesURL)
  const installed = normalizeObjectID(installedSHA)
  if (repository === null || installed === null) {
    return null
  }

  // Assigned from a callback, so it is read through an object the compiler
  // cannot narrow away across the await.
  const observed: { build: IActiveBuildSignal | null } = { build: null }
  const isBuilding = await isNewerDesktopMaterialBuildInProgress({
    updatesURL,
    installedSHA,
    fetcher,
    signal: callerSignal,
    onDegraded,
    onActiveBuild: build => {
      observed.build ??= build
    },
  })

  const timeout = AbortSignal.timeout(ProbeTimeoutMilliseconds)
  const signal = combineAbortSignals(callerSignal, timeout)
  const repositoryPath = repositoryAPIPath(repository)
  const active = isBuilding ? observed.build : null

  let kind: UpdateComingSoonSignalKind = 'build-running'
  let headSHA: string
  let commitURL: string | null = null
  let workflowFile = WorkflowBuilds[0].file

  if (active !== null) {
    headSHA = active.headSHA
    workflowFile = active.workflowFile
  } else {
    const compare = await readOptionalActionsJSON(
      fetcher,
      `https://${GitHubAPIHost}/repos/${repositoryPath}/compare/${installed}...main`,
      signal
    )
    if (compare === null || compareStatus(compare) !== 'ahead') {
      return null
    }
    const head = compareHeadSHA(compare)
    if (head === null) {
      return null
    }
    kind = 'newer-commit'
    headSHA = head
    commitURL = normalizeGitHubURL(record(compare)?.html_url)
  }

  const runsURL = new URL(
    `https://${GitHubAPIHost}/repos/${repositoryPath}/actions/workflows/${workflowFile}/runs`
  )
  runsURL.searchParams.set('branch', 'main')
  runsURL.searchParams.set('status', 'success')
  runsURL.searchParams.set('per_page', MaximumSamples.toString())
  const samples = finishedRunSamples(
    await readOptionalActionsJSON(fetcher, runsURL.toString(), signal)
  )
  if (kind === 'newer-commit' && samples.some(s => s.headSHA === headSHA)) {
    // The commit is already built and green, so only publishing is left.
    kind = 'awaiting-release'
  }

  const releasesURL = new URL(
    `https://${GitHubAPIHost}/repos/${repositoryPath}/releases`
  )
  releasesURL.searchParams.set('per_page', MaximumSamples.toString())
  const releases = releaseSamples(
    await readOptionalActionsJSON(fetcher, releasesURL.toString(), signal)
  )

  return {
    kind,
    headSHA,
    commitURL,
    runURL: active?.runURL ?? null,
    runStartedAt: active?.runStartedAt ?? null,
    recentRunDurations: samples
      .map(sample => sample.durationMilliseconds)
      .filter((duration): duration is number => duration !== null),
    recentReleaseTimes: releases.publishedTimes,
    targetTag: releases.draftTag,
    latestReleaseTag: releases.latestTag,
  }
}
