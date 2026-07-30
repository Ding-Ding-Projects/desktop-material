import { Repository } from '../../models/repository'
import { IOpencodeLogEvent } from '../build-run/opencode'

export type RepositorySyncOperation = 'pull' | 'fetch' | 'merge-cleanup'

export interface IRepositorySyncRequest {
  readonly operation: RepositorySyncOperation
  readonly repositoryIds: ReadonlyArray<number>
  /**
   * Required only for merge-cleanup. The reviewed dialog sets this after the
   * user explicitly accepts the destructive cleanup decision.
   */
  readonly confirmedDestructiveCleanup?: boolean
}

export type PullAllResultStatus =
  | 'pulled'
  | 'fetched'
  | 'merged-cleaned'
  | 'skipped'
  | 'failed'

export interface IPullAllCandidate {
  readonly id: number
  readonly name: string
}

export interface IPullAllResult extends IPullAllCandidate {
  readonly status: PullAllResultStatus
  readonly detail: string
}

export type PullAllProgressStatus =
  | 'queued'
  | 'pulling'
  | 'fetching'
  | 'merging-cleanup'
  | PullAllResultStatus

export interface IPullAllProgress extends IPullAllCandidate {
  readonly status: PullAllProgressStatus
  readonly detail: string
}

export interface IPullAllProgressUpdate {
  readonly completed: number
  readonly total: number
  readonly active: number
  readonly item: IPullAllProgress
}

export type PullAllProgressListener = (update: IPullAllProgressUpdate) => void

export interface IRepositorySyncAgentResult {
  readonly provider: 'Codex' | 'OpenCode'
  readonly ok: boolean
}

/**
 * `prompt: null` probes the configured provider without launching it. A real
 * prompt uses the existing repository-scoped Codex/OpenCode task path.
 */
export type RepositorySyncAgentRunner = (
  repository: Repository,
  prompt: string | null,
  onLog: (line: IOpencodeLogEvent) => void
) => Promise<IRepositorySyncAgentResult>

type PullAllOperationResult = Pick<IPullAllResult, 'status' | 'detail'>
type PullAllOperationProgressListener = (detail: string) => void

/** Run repository pulls with a fixed upper bound while preserving list order. */
export async function runBoundedPullAll(
  candidates: ReadonlyArray<IPullAllCandidate>,
  operation: (
    candidate: IPullAllCandidate,
    onProgress: PullAllOperationProgressListener
  ) => Promise<PullAllOperationResult>,
  concurrency = 3,
  onProgress?: PullAllProgressListener,
  activeStatus: 'pulling' | 'fetching' | 'merging-cleanup' = 'pulling'
): Promise<ReadonlyArray<IPullAllResult>> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Pull-all concurrency must be a positive integer.')
  }

  const results = new Array<IPullAllResult>(candidates.length)
  let nextIndex = 0
  let active = 0
  let completed = 0

  for (const candidate of candidates) {
    onProgress?.({
      completed,
      total: candidates.length,
      active,
      item: {
        ...candidate,
        status: 'queued',
        detail: 'Waiting for an available repository worker.',
      },
    })
  }

  const worker = async () => {
    while (true) {
      const index = nextIndex++
      if (index >= candidates.length) {
        return
      }

      const candidate = candidates[index]
      active++
      const reportProgress: PullAllOperationProgressListener = detail =>
        onProgress?.({
          completed,
          total: candidates.length,
          active,
          item: {
            ...candidate,
            status: activeStatus,
            detail,
          },
        })
      reportProgress('Refreshing repository state.')

      try {
        const result = await operation(candidate, reportProgress)
        results[index] = { ...candidate, ...result }
      } catch (error) {
        results[index] = {
          ...candidate,
          status: 'failed',
          detail: error instanceof Error ? error.message : String(error),
        }
      } finally {
        active--
        completed++
        const result = results[index]
        onProgress?.({
          completed,
          total: candidates.length,
          active,
          item: {
            ...result,
            status: result.status,
            detail: result.detail,
          },
        })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker)
  )
  return results
}
