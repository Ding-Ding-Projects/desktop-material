import { Branch, BranchType } from '../../models/branch'
import { WorktreeEntry } from '../../models/worktree'

export type MergeAllMode = 'branches' | 'worktrees'
export interface IMergeAllOptions {
  /**
   * Checkpoint, synchronize, and publish a linked worktree before merging its
   * branch. This remains opt-in because it creates a real commit.
   */
  readonly checkpointDirtyWorktrees: boolean
  /** Preserve recoverable work and automate the complete Mat Day sequence. */
  readonly forceMatDay: boolean
}

export const DefaultMergeAllOptions: IMergeAllOptions = {
  checkpointDirtyWorktrees: false,
  forceMatDay: false,
}

export type MergeAllPhase =
  | 'preparing'
  | 'committing'
  | 'pulling'
  | 'merging'
  | 'resolving'
  | 'cleaning'
  | 'pushing'
  | 'complete'
  | 'cancelled'

export type MergeAllResultStatus =
  | 'merged'
  | 'up-to-date'
  | 'skipped'
  | 'failed'

export interface IMergeAllResult {
  readonly branch: string
  readonly path?: string
  readonly status: MergeAllResultStatus
  readonly detail: string
}

export interface IMergeAllState {
  readonly phase: MergeAllPhase
  readonly mode: MergeAllMode
  readonly currentBranch: string | null
  readonly copilotProgress: string | null
  readonly results: ReadonlyArray<IMergeAllResult>
  readonly pushed: boolean
}

export interface IMergeAllCandidate {
  readonly branch: Branch
  readonly worktree?: WorktreeEntry
}

export function selectBranchCandidates(
  branches: ReadonlyArray<Branch>,
  defaultBranchName: string,
  checkedOutRefs: ReadonlySet<string>
): ReadonlyArray<IMergeAllCandidate> {
  return branches
    .filter(
      branch =>
        branch.type === BranchType.Local &&
        branch.name !== defaultBranchName &&
        !checkedOutRefs.has(branch.ref)
    )
    .map(branch => ({ branch }))
}

export function selectWorktreeCandidates(
  worktrees: ReadonlyArray<WorktreeEntry>,
  branches: ReadonlyArray<Branch>,
  defaultBranchRef?: string
): {
  readonly candidates: ReadonlyArray<IMergeAllCandidate>
  readonly skipped: ReadonlyArray<IMergeAllResult>
} {
  const candidates: IMergeAllCandidate[] = []
  const skipped: IMergeAllResult[] = []

  for (const worktree of worktrees.filter(w => w.type === 'linked')) {
    const branch = branches.find(
      candidate =>
        candidate.type === BranchType.Local && candidate.ref === worktree.branch
    )
    const name = branch?.name ?? worktree.branch ?? worktree.path
    if (worktree.branch === defaultBranchRef) {
      continue
    } else if (worktree.isLocked) {
      skipped.push({
        branch: name,
        path: worktree.path,
        status: 'skipped',
        detail: 'Worktree is locked.',
      })
    } else if (worktree.isDetached || worktree.branch === null) {
      skipped.push({
        branch: name,
        path: worktree.path,
        status: 'skipped',
        detail: 'Worktree has a detached HEAD.',
      })
    } else if (branch === undefined) {
      skipped.push({
        branch: name,
        path: worktree.path,
        status: 'skipped',
        detail: 'The worktree branch is not available locally.',
      })
    } else {
      candidates.push({ branch, worktree })
    }
  }

  return { candidates, skipped }
}
