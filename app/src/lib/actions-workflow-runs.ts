/** Provider workflow-run states accepted by the bounded Actions UI. */
export type ActionsWorkflowRunStatus =
  | 'queued'
  | 'in_progress'
  | 'waiting'
  | 'pending'
  | 'requested'
  | 'completed'

export type ActionsWorkflowRunConclusion =
  | 'action_required'
  | 'cancelled'
  | 'timed_out'
  | 'failure'
  | 'neutral'
  | 'success'
  | 'skipped'
  | 'stale'
  | 'startup_failure'

export interface IActionsWorkflowRunCancellationState {
  readonly id: number
  readonly status: ActionsWorkflowRunStatus
  readonly conclusion: ActionsWorkflowRunConclusion | null
  readonly updatedAt: string | null
}

const statuses = new Set<string>([
  'queued',
  'in_progress',
  'waiting',
  'pending',
  'requested',
  'completed',
])

const cancellableStatuses = new Set<ActionsWorkflowRunStatus>([
  'queued',
  'in_progress',
  'waiting',
  'pending',
])

const conclusions = new Set<string>([
  'action_required',
  'cancelled',
  'timed_out',
  'failure',
  'neutral',
  'success',
  'skipped',
  'stale',
  'startup_failure',
])

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('GitHub returned an invalid workflow run.')
  }
  return value as Readonly<Record<string, unknown>>
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return value
}

function workflowRunStatus(value: unknown): ActionsWorkflowRunStatus {
  if (typeof value !== 'string' || !statuses.has(value)) {
    throw new Error('GitHub returned an invalid workflow run status.')
  }
  return value as ActionsWorkflowRunStatus
}

function workflowRunConclusion(
  value: unknown
): ActionsWorkflowRunConclusion | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string' || !conclusions.has(value)) {
    throw new Error('GitHub returned an invalid workflow run conclusion.')
  }
  return value as ActionsWorkflowRunConclusion
}

function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string' || value.length > 64) {
    throw new Error('GitHub returned an invalid workflow run update time.')
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf())) {
    throw new Error('GitHub returned an invalid workflow run update time.')
  }
  return value
}

/** Only states accepted by GitHub's normal workflow-run cancellation path. */
export function isWorkflowRunCancellableStatus(
  status: unknown
): status is ActionsWorkflowRunStatus {
  return (
    typeof status === 'string' &&
    cancellableStatuses.has(status as ActionsWorkflowRunStatus)
  )
}

export function isWorkflowRunTerminalStatus(status: unknown): boolean {
  return status === 'completed'
}

/** Validate the exact run identity and bounded state returned before or after cancellation. */
export function parseActionsWorkflowRunCancellationState(
  value: unknown,
  expectedRunId: number
): IActionsWorkflowRunCancellationState {
  const safeExpectedRunId = positiveInteger(
    expectedRunId,
    'expected workflow run id'
  )
  const input = record(value)
  const id = positiveInteger(input.id, 'workflow run id')
  if (id !== safeExpectedRunId) {
    throw new Error('GitHub returned a different workflow run.')
  }
  return {
    id,
    status: workflowRunStatus(input.status),
    conclusion: workflowRunConclusion(input.conclusion),
    updatedAt: optionalDate(input.updated_at),
  }
}
