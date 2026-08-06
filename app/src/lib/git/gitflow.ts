import { git } from './core'
import { getStatus } from './status'
import { getBranchNames } from './branch'
import { Repository } from '../../models/repository'
export {
  getGitflowBranchName,
  GitflowBranchKinds,
  getGitflowTargetBranches,
  parseGitflowBranch,
  GitflowBranchKind,
} from './gitflow-branch'
import {
  getGitflowBranchName,
  getGitflowTargetBranches,
  parseGitflowBranch,
  GitflowBranchKind,
} from './gitflow-branch'

/**
 * Start a Gitflow branch from the checked-out commit. Gitflow is implemented
 * with fixed Git argv rather than an optional third-party `git flow` binary.
 */
export async function startGitflowBranch(
  repository: Repository,
  kind: GitflowBranchKind,
  name: string
): Promise<string> {
  const branchName = getGitflowBranchName(kind, name)
  await git(['checkout', '-b', branchName], repository.path, 'gitflowStart')
  return branchName
}

export interface IGitflowFinishResult {
  readonly sourceBranch: string
  readonly targetBranch: string
}

/**
 * Finish the current Gitflow branch after a reviewable UI confirmation. The
 * branch is merged into a selected stable branch and deleted only after a
 * successful merge. Dirty or conflicted work is rejected before any mutation.
 */
export async function finishGitflowBranch(
  repository: Repository,
  targetBranch?: string
): Promise<IGitflowFinishResult> {
  const status = await getStatus(repository)
  if (status === null) {
    throw new Error(
      'Unable to inspect the repository before finishing Gitflow.'
    )
  }
  const currentBranch = status.currentBranch
  const parsed =
    currentBranch === undefined ? null : parseGitflowBranch(currentBranch)
  if (currentBranch === undefined || parsed === null) {
    throw new Error('Check out a feature, release, or hotfix branch first.')
  }
  if (
    status.workingDirectory.files.length > 0 ||
    status.mergeHeadFound ||
    status.rebaseInternalState !== null ||
    status.isCherryPickingHeadFound
  ) {
    throw new Error(
      'Commit or resolve the current work before finishing a Gitflow branch.'
    )
  }

  const branches = await getBranchNames(repository)
  const candidates = getGitflowTargetBranches(branches, parsed.kind)
  const target = targetBranch ?? candidates[0]
  if (target === undefined || !candidates.includes(target)) {
    throw new Error(
      'Create a develop, main, or master branch before finishing Gitflow.'
    )
  }
  if (target === currentBranch) {
    throw new Error('A Gitflow branch cannot finish into itself.')
  }

  await git(['checkout', target], repository.path, 'gitflowFinishCheckout')
  try {
    await git(
      ['merge', '--no-ff', currentBranch],
      repository.path,
      'gitflowFinishMerge'
    )
    await git(
      ['branch', '-d', currentBranch],
      repository.path,
      'gitflowFinishDelete'
    )
  } catch (error) {
    // Keep the source branch when merge conflicts or another failure occurs.
    throw error
  }
  return { sourceBranch: currentBranch, targetBranch: target }
}
