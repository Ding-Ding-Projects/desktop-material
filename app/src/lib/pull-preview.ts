import { PullPreviewResult } from './git/pull-preview'
import { IPullStrategyPlan } from './git/pull-strategy'

/** Worktree safety captured after the preview fetch and status refresh. */
export type PullPreviewWorktreeState = 'clean' | 'dirty' | 'conflicted'

export type PullPreviewErrorCode =
  | 'busy'
  | 'remote-unavailable'
  | 'fetch-failed'
  | 'no-incoming-commits'
  | 'dirty-worktree'
  | 'conflicted-worktree'
  | 'invalid-config'
  | 'stale-preview'
  | 'pull-failed'

/** A renderer-safe code for a pull-preview failure with localized UI copy. */
export class PullPreviewError extends Error {
  public constructor(public readonly code: PullPreviewErrorCode) {
    super(`Pull preview failed: ${code}`)
    this.name = 'PullPreviewError'
  }
}

/** Data needed by the renderer to present and confirm one reviewed pull. */
export interface IPreparedPullPreview {
  readonly result: PullPreviewResult
  readonly integrationPlan: IPullStrategyPlan | null
  readonly worktreeState: PullPreviewWorktreeState
}
