import { ICheapLfsCloneSelection } from './cheap-lfs-clone-selection'
import { SelfHostedRunnerPlatform } from '../lib/self-hosted-runner/types'

/**
 * Explicit, one-shot intent to create a repository-scoped Actions runner after
 * a successful interactive clone. This carries no credential; the main
 * process resolves the selected account and mints the short-lived runner token.
 */
export type PostCloneRunnerProvisioning = {
  readonly accountKey: string
  readonly githubApiEndpoint: string
  readonly owner: string
  readonly repository: string
  readonly platform: SelfHostedRunnerPlatform
  /** The existing WSL distribution cloned into a dedicated runner distro. */
  readonly wslBaseDistribution?: string
}

/** Additional arguments to provide when cloning a repository */
export type CloneOptions = {
  /** Stable account identity to use for the first credential attempt. */
  readonly accountKey?: string
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
  /** The default branch name in case we're cloning an empty repository. */
  readonly defaultBranch?: string
  /** Limit fetched history to this many commits. */
  readonly depth?: number
  /** Fetch only the selected/default branch when cloning shallow history. */
  readonly singleBranch?: boolean
  /** Apply the shallow-history limit to recursively cloned submodules. */
  readonly shallowSubmodules?: boolean
  /**
   * Check every branch of the fresh clone out into its own linked worktree,
   * all of them under one container directory inside the repository. The
   * branches are chosen in a dialog once the clone has landed.
   */
  readonly checkoutAllBranchesAsWorktrees?: boolean
  /**
   * Optional manifest-bound Cheap LFS allowlist captured before clone.
   * Post-clone materialization must validate it against committed pointers.
   */
  readonly cheapLfsSelection?: ICheapLfsCloneSelection
  /**
   * Optional, explicit post-clone runner setup for a private GitHub repository.
   * Batch and background clone paths deliberately never set this intent.
   */
  readonly postCloneRunnerProvisioning?: PostCloneRunnerProvisioning
}

export const MaximumCloneDepth = 2_147_483_647

/** Parse the guided depth field without accepting signs, decimals, or flags. */
export function normalizeCloneDepth(value: string): number {
  const input = value.trim()
  if (!/^\d+$/.test(input)) {
    throw new Error('Clone depth must be a whole number of commits.')
  }
  const depth = Number(input)
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > MaximumCloneDepth) {
    throw new Error(`Clone depth must be between 1 and ${MaximumCloneDepth}.`)
  }
  return depth
}

/** Build only the fixed shallow-history arguments supported by the clone UI. */
export function getShallowCloneArgs(
  options: CloneOptions
): ReadonlyArray<string> {
  if (options.depth === undefined) {
    return []
  }

  const depth = normalizeCloneDepth(String(options.depth))
  const args = [`--depth=${depth}`]
  if (options.singleBranch === true) {
    args.push('--single-branch')
  }
  if (options.shallowSubmodules === true) {
    args.push('--shallow-submodules')
  }
  return args
}
