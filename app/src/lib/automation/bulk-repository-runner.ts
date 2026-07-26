/**
 * A determinate, sequential bulk runner for repository-list actions.
 *
 * The runner deliberately does not run work concurrently. Cancellation is
 * checked only *between* items so an in-flight repository always finishes its
 * Git work before the batch stops; the remaining repositories are then reported
 * as cancelled instead of being silently dropped.
 */

export type BulkRepositoryItemStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'cancelled'

/** A terminal outcome an operation can report for a single repository. */
export type BulkRepositoryOutcomeStatus = 'done' | 'failed' | 'skipped'

export interface IBulkRepositoryItem {
  readonly id: number
  readonly name: string
}

export interface IBulkRepositoryItemState extends IBulkRepositoryItem {
  readonly status: BulkRepositoryItemStatus
  readonly detail: string
}

export interface IBulkRepositoryOutcome {
  readonly status: BulkRepositoryOutcomeStatus
  readonly detail: string
}

export interface IBulkRepositoryProgress {
  /** Repositories that reached a terminal, non-cancelled state. */
  readonly completed: number
  readonly total: number
  readonly cancelled: boolean
  readonly finished: boolean
  readonly items: ReadonlyArray<IBulkRepositoryItemState>
}

export interface IBulkRepositorySummary extends IBulkRepositoryProgress {
  readonly done: number
  readonly failed: number
  readonly skipped: number
  /** Repositories that never ran because the batch was cancelled. */
  readonly remaining: number
}

export type BulkRepositoryProgressListener = (
  progress: IBulkRepositoryProgress
) => void

export type BulkRepositoryDetailReporter = (detail: string) => void

export interface IBulkRepositoryRunOptions {
  /**
   * Consulted immediately before each repository starts. Returning true stops
   * the batch without interrupting any repository that already began.
   */
  readonly isCancelled?: () => boolean
  readonly onProgress?: BulkRepositoryProgressListener
}

/** Longest failure reason kept for display; longer reasons are elided. */
export const MaximumBulkReasonLength = 200

const UnknownReason = 'Unknown failure.'

/**
 * Reduce an arbitrary thrown value to a short, display-safe reason.
 *
 * Git and network errors routinely embed absolute paths, remote URLs, and
 * occasionally credentials or tokens. None of that belongs in a batch summary
 * the user may screenshot or paste, so it is redacted before it is ever
 * rendered.
 */
export function sanitizeBulkFailureReason(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : error === undefined
      ? ''
      : `${error}`

  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) {
    return UnknownReason
  }

  const redacted = collapsed
    // Credentials embedded in a remote URL (https://user:token@host/…).
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1<redacted>@')
    // Recognizable provider tokens, with or without a surrounding URL.
    .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{8,}/g, '<redacted>')
    // Windows absolute paths, including UNC shares. The leading guard keeps
    // the drive-letter shape from eating the scheme of a URL ("https://…").
    .replace(/(^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s"']*/g, '$1<path>')
    .replace(/\\\\[^\s"']+/g, '<path>')
    // POSIX absolute paths.
    .replace(/(^|\s)\/[^\s"']*/g, '$1<path>')
    .trim()

  if (redacted.length === 0) {
    return UnknownReason
  }

  return redacted.length > MaximumBulkReasonLength
    ? `${redacted.slice(0, MaximumBulkReasonLength - 1).trimEnd()}…`
    : redacted
}

function summarize(
  items: ReadonlyArray<IBulkRepositoryItemState>,
  cancelled: boolean
): IBulkRepositorySummary {
  const count = (status: BulkRepositoryItemStatus) =>
    items.filter(item => item.status === status).length

  const done = count('done')
  const failed = count('failed')
  const skipped = count('skipped')
  const remaining = count('cancelled')

  return {
    items,
    total: items.length,
    completed: done + failed + skipped,
    cancelled,
    finished: true,
    done,
    failed,
    skipped,
    remaining,
  }
}

/** The progress snapshot shown before a batch performs any work. */
export function initialBulkRepositoryProgress(
  items: ReadonlyArray<IBulkRepositoryItem>
): IBulkRepositoryProgress {
  return {
    completed: 0,
    total: items.length,
    cancelled: false,
    finished: false,
    items: items.map(item => ({ ...item, status: 'queued', detail: '' })),
  }
}

/**
 * Run `operation` against each repository in order, reporting a determinate
 * N-of-M progress snapshot after every state change.
 */
export async function runSequentialRepositoryBulk(
  items: ReadonlyArray<IBulkRepositoryItem>,
  operation: (
    item: IBulkRepositoryItem,
    reportDetail: BulkRepositoryDetailReporter
  ) => Promise<IBulkRepositoryOutcome>,
  options: IBulkRepositoryRunOptions = {}
): Promise<IBulkRepositorySummary> {
  const { isCancelled, onProgress } = options
  const states = items.map<IBulkRepositoryItemState>(item => ({
    ...item,
    status: 'queued',
    detail: '',
  }))
  let completed = 0
  let cancelled = false

  const emit = () =>
    onProgress?.({
      completed,
      total: states.length,
      cancelled,
      finished: false,
      items: states.map(state => ({ ...state })),
    })

  emit()

  for (let index = 0; index < states.length; index++) {
    if (isCancelled?.() === true) {
      cancelled = true
      for (let rest = index; rest < states.length; rest++) {
        states[rest] = { ...states[rest], status: 'cancelled', detail: '' }
      }
      emit()
      break
    }

    const item = items[index]
    states[index] = { ...states[index], status: 'running', detail: '' }
    emit()

    const reportDetail: BulkRepositoryDetailReporter = detail => {
      if (states[index].status !== 'running') {
        return
      }
      states[index] = { ...states[index], detail: sanitizeBulkDetail(detail) }
      emit()
    }

    let outcome: IBulkRepositoryOutcome
    try {
      outcome = await operation(item, reportDetail)
    } catch (error) {
      outcome = { status: 'failed', detail: sanitizeBulkFailureReason(error) }
    }

    states[index] = {
      ...states[index],
      status: outcome.status,
      detail: sanitizeBulkDetail(outcome.detail),
    }
    completed++
    emit()
  }

  const summary = summarize(states, cancelled)
  onProgress?.(summary)
  return summary
}

/** Detail strings share the failure sanitizer but keep an empty value empty. */
function sanitizeBulkDetail(detail: string): string {
  return detail.trim().length === 0 ? '' : sanitizeBulkFailureReason(detail)
}
