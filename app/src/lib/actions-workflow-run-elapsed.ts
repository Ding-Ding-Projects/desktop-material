import { IAPIWorkflow, IAPIWorkflowRun } from './api'

/** Refresh cadence for visible, actively running workflow elapsed labels. */
export const WorkflowRunElapsedRefreshIntervalMs = 1_000

/** Injectable wall clock and scheduler used by mounted workflow lists. */
export interface IWorkflowRunElapsedClock {
  readonly now: () => number
  readonly setInterval: (callback: () => void, milliseconds: number) => number
  readonly clearInterval: (intervalId: number) => void
}

/** Browser clock used by production renderer lists. */
export const DefaultWorkflowRunElapsedClock: IWorkflowRunElapsedClock = {
  now: () => Date.now(),
  setInterval: (callback, milliseconds) =>
    window.setInterval(callback, milliseconds),
  clearInterval: intervalId => window.clearInterval(intervalId),
}

/**
 * A truthful workflow-run timing state. Missing or malformed provider data is
 * kept distinct from a run which GitHub says has not started yet.
 */
export type WorkflowRunElapsed =
  | { readonly kind: 'completed'; readonly milliseconds: number }
  | { readonly kind: 'running'; readonly milliseconds: number }
  | { readonly kind: 'pending' }
  | { readonly kind: 'unavailable' }

/** Timing state for the newest loaded run of one workflow. */
export type LatestWorkflowRunElapsed =
  | WorkflowRunElapsed
  | { readonly kind: 'none' }

const pendingStatuses = new Set(['queued', 'waiting', 'pending', 'requested'])

const rfc3339Timestamp =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    return null
  }

  const match = rfc3339Timestamp.exec(value)
  if (match === null) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offset = match[7]
  const maximumDay =
    year >= 1970 && month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0
  if (day < 1 || day > maximumDay || hour > 23 || minute > 59 || second > 59) {
    return null
  }
  if (offset !== 'Z') {
    const offsetHour = Number(offset.slice(1, 3))
    const offsetMinute = Number(offset.slice(4, 6))
    if (offsetHour > 23 || offsetMinute > 59) {
      return null
    }
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function startedAt(run: IAPIWorkflowRun): number | null {
  return run.run_started_at === undefined
    ? timestamp(run.created_at)
    : timestamp(run.run_started_at)
}

/**
 * Calculate one run's elapsed state without guessing from its status label.
 *
 * GitHub's workflow-run response has no completed_at field. `updated_at` is
 * therefore the most precise completion boundary available. For starts,
 * run_started_at wins and created_at is the documented fallback used by older
 * providers and fixtures.
 */
export function getWorkflowRunElapsed(
  run: IAPIWorkflowRun,
  now: number
): WorkflowRunElapsed {
  if (pendingStatuses.has(run.status ?? '')) {
    return { kind: 'pending' }
  }

  const start = startedAt(run)
  if (start === null || !Number.isFinite(now) || start > now) {
    return { kind: 'unavailable' }
  }

  if (run.status === 'in_progress') {
    return { kind: 'running', milliseconds: now - start }
  }

  if (run.status === 'completed') {
    const end = timestamp(run.updated_at)
    if (end === null || end < start || end > now) {
      return { kind: 'unavailable' }
    }
    return { kind: 'completed', milliseconds: end - start }
  }

  return { kind: 'unavailable' }
}

/** Whether a mounted list needs a live elapsed-time ticker. */
export function hasRunningWorkflowRun(
  runs: ReadonlyArray<IAPIWorkflowRun>,
  now: number
): boolean {
  return runs.some(run => getWorkflowRunElapsed(run, now).kind === 'running')
}

/**
 * Resolve the newest loaded run for a workflow, then calculate its state.
 * Invalid creation timestamps do not get silently ordered ahead of truthful
 * provider timestamps. If every matching timestamp is invalid, the result is
 * explicitly unavailable.
 */
export function getLatestWorkflowRunElapsed(
  workflow: IAPIWorkflow,
  runs: ReadonlyArray<IAPIWorkflowRun>,
  now: number
): LatestWorkflowRunElapsed {
  let latest: IAPIWorkflowRun | null = null
  let latestCreatedAt = Number.NEGATIVE_INFINITY
  let foundMatchingRun = false

  for (const run of runs) {
    if (run.workflow_id !== workflow.id) {
      continue
    }
    foundMatchingRun = true
    const createdAt = timestamp(run.created_at)
    if (createdAt === null) {
      // Without an orderable creation boundary, no older matching run can be
      // proven to be the latest. Fail closed instead of presenting stale time.
      return { kind: 'unavailable' }
    }
    if (createdAt > latestCreatedAt) {
      latest = run
      latestCreatedAt = createdAt
    }
  }

  if (latest === null) {
    return foundMatchingRun ? { kind: 'unavailable' } : { kind: 'none' }
  }
  return getWorkflowRunElapsed(latest, now)
}

/** Whether the rows actually rendered for workflows need a live ticker. */
export function hasRunningLatestWorkflowRun(
  workflows: ReadonlyArray<IAPIWorkflow>,
  runs: ReadonlyArray<IAPIWorkflowRun>,
  now: number
): boolean {
  return workflows.some(
    workflow =>
      getLatestWorkflowRunElapsed(workflow, runs, now).kind === 'running'
  )
}

/**
 * Format a compact elapsed duration. A sub-second run is labelled `<1s`
 * instead of a false zero or an invented full second.
 */
export function formatWorkflowRunElapsed(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error(
      'Workflow elapsed time must be a finite non-negative value.'
    )
  }
  if (milliseconds < 1_000) {
    return '<1s'
  }

  let totalSeconds = Math.round(milliseconds / 1_000)
  const days = Math.floor(totalSeconds / 86_400)
  totalSeconds -= days * 86_400
  const hours = Math.floor(totalSeconds / 3_600)
  totalSeconds -= hours * 3_600
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  const parts = new Array<string>()

  if (days > 0) {
    parts.push(`${days}d`)
  }
  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`)
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`)
  }

  return parts.join(' ')
}
