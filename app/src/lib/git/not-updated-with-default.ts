import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { getBranchRefsContainingCommit } from './for-each-ref'

/**
 * Find branches whose tips do not contain the default branch tip.
 *
 * A branch is considered updated with the default branch when the default tip
 * is an ancestor of that branch. This includes branches that have diverged
 * after incorporating the default branch, while excluding branches that still
 * need the default branch's latest commits.
 */
export async function getBranchesNotUpdatedWithDefault(
  repository: Repository,
  defaultBranch: Branch | null,
  branches: ReadonlyArray<Branch>
): Promise<ReadonlySet<string>> {
  if (defaultBranch === null) {
    return new Set()
  }

  const containingRefs = await getBranchRefsContainingCommit(
    repository,
    defaultBranch.tip.sha
  )

  // If Git could not resolve the default tip, fail closed. Showing every
  // branch as stale would turn a repository-read failure into a misleading
  // destructive-looking filter result.
  if (containingRefs === null || !containingRefs.has(defaultBranch.ref)) {
    return new Set()
  }

  return new Set(
    branches
      .filter(
        branch =>
          branch.name !== defaultBranch.name && !containingRefs.has(branch.ref)
      )
      .map(branch => branch.name)
  )
}
