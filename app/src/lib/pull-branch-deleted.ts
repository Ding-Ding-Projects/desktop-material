/**
 * Deleted-upstream pull recovery.
 *
 * When a pull fails because the branch's remote-tracking branch no longer
 * exists — someone deleted or renamed it on the remote — Desktop Material can
 * offer to switch the repository to its default branch and pull that instead.
 * This module owns the two decisions that make the offer safe:
 *
 * 1. Is this particular failure really a deleted upstream, and not an
 *    authentication, network, conflict, or dirty-worktree failure that merely
 *    happened during a pull?
 * 2. If it is, can the switch actually be performed without mutating anything
 *    the user did not agree to?
 *
 * It deliberately imports nothing — not dugite, not React, not the stores — so
 * both decisions can be exercised directly by unit tests, and so the callers
 * are forced to hand it facts rather than letting it reach for global state.
 */

/**
 * What a remote said when asked whether it still advertises a branch.
 *
 * `indeterminate` is not a soft `absent`. A remote that refused the connection,
 * timed out, or rejected our credentials never answered the question, and
 * treating silence as "deleted" is exactly how an unrelated network blip would
 * turn into an offer to change the user's branch.
 */
export type RemoteBranchPresence =
  | { readonly kind: 'present'; readonly sha: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'indeterminate'; readonly reason: string }

/**
 * Why recovery was not offered. Every value is a deliberate exclusion, and the
 * failing pull keeps its ordinary Git error surface in each of them.
 */
export type PullBranchDeletedDeclineReason =
  /** The failing Git operation was a push, merge, checkout, or clone. */
  | 'not-a-pull'
  /**
   * The pull failed for some other reason entirely: authentication, network,
   * merge or rebase conflicts, a dirty worktree, a hook, a lock file. Only the
   * one structured "no such ref was fetched" failure is a candidate.
   */
  | 'unrelated-failure'
  /** No local repository was attached to the error. */
  | 'no-repository'
  /** Detached HEAD, an unborn branch, or no configured pull remote. */
  | 'no-current-branch'
  /**
   * The default branch is already checked out. Offering to switch to the
   * branch you are standing on would recover nothing, and would also let a
   * failing retry re-open the same dialog forever.
   */
  | 'already-on-default-branch'
  /** The remote still advertises the branch, so switching would fix nothing. */
  | 'upstream-still-advertised'
  /** The remote never answered. Fail closed rather than guess. */
  | 'upstream-unverified'

/** The result of judging one failed pull. */
export type PullBranchDeletedDecision =
  | {
      readonly kind: 'offer'
      /** The local branch whose upstream is gone. */
      readonly branchName: string
      /** The remote the missing branch was expected on. */
      readonly remoteName: string
      /** The branch name as it was expected to exist on the remote. */
      readonly remoteBranchName: string
    }
  | {
      readonly kind: 'decline'
      readonly reason: PullBranchDeletedDeclineReason
    }

/**
 * What the error surface can tell about a failed operation on its own, before
 * anyone looks at repository state.
 */
export interface IFailedPullSignals {
  /**
   * Whether Git reported the one structured failure that means the configured
   * upstream ref was not fetched, as classified by dugite's own error table
   * rather than by us re-parsing stderr.
   */
  readonly reportedMissingRemoteRef: boolean
  /** Whether the failing operation was a pull rather than push/merge/etc. */
  readonly isPullOperation: boolean
}

/** Everything the decision needs to know about a failed pull. */
export interface IFailedPullFacts extends IFailedPullSignals {
  /** Whether a real local repository was attached to the failure. */
  readonly hasRepository: boolean
  /** The checked-out branch at the time of the failure, if there was one. */
  readonly currentBranchName: string | null
  /** Whether that branch is already the repository's default branch. */
  readonly isOnDefaultBranch: boolean
  /** The remote the pull ran against, if one was resolved. */
  readonly remoteName: string | null
  /** The branch name expected on that remote, if one was configured. */
  readonly remoteBranchName: string | null
}

/**
 * Ask the remote whether it still advertises a branch. Supplied by the caller
 * so the decision itself stays free of Git and of the network.
 */
export type RemoteBranchProbe = (
  remoteName: string,
  remoteBranchName: string
) => Promise<RemoteBranchPresence>

/**
 * Decide whether a failed pull earns the deleted-upstream recovery offer.
 *
 * The structured Git error is only a candidate signal; the offer is made only
 * after the remote is asked directly and answers that the branch is gone. A
 * remote that says the branch is still there, or that does not answer at all,
 * declines the offer and leaves the original error to the ordinary handler.
 */
export async function decidePullBranchDeletedRecovery(
  facts: IFailedPullFacts,
  probeRemoteBranch: RemoteBranchProbe
): Promise<PullBranchDeletedDecision> {
  if (!facts.isPullOperation) {
    return { kind: 'decline', reason: 'not-a-pull' }
  }

  if (!facts.reportedMissingRemoteRef) {
    return { kind: 'decline', reason: 'unrelated-failure' }
  }

  if (!facts.hasRepository) {
    return { kind: 'decline', reason: 'no-repository' }
  }

  const { currentBranchName, remoteName, remoteBranchName } = facts
  if (
    currentBranchName === null ||
    currentBranchName.length === 0 ||
    remoteName === null ||
    remoteName.length === 0 ||
    remoteBranchName === null ||
    remoteBranchName.length === 0
  ) {
    return { kind: 'decline', reason: 'no-current-branch' }
  }

  if (facts.isOnDefaultBranch) {
    return { kind: 'decline', reason: 'already-on-default-branch' }
  }

  let presence: RemoteBranchPresence
  try {
    presence = await probeRemoteBranch(remoteName, remoteBranchName)
  } catch {
    // A probe that threw proved nothing about the remote.
    return { kind: 'decline', reason: 'upstream-unverified' }
  }

  if (presence.kind === 'present') {
    return { kind: 'decline', reason: 'upstream-still-advertised' }
  }

  if (presence.kind === 'indeterminate') {
    return { kind: 'decline', reason: 'upstream-unverified' }
  }

  return {
    kind: 'offer',
    branchName: currentBranchName,
    remoteName,
    remoteBranchName,
  }
}

/** A reason the branch switch cannot be performed as things stand. */
export type PullBranchDeletedBlocker =
  /** The repository has no default branch we can honestly resolve. */
  | 'no-default-branch'
  /** Uncommitted changes are present. We refuse rather than stash or discard. */
  | 'dirty-worktree'
  /** An unresolved conflict is present. */
  | 'conflicted-worktree'
  /** Another push/pull/fetch is already running against this repository. */
  | 'operation-in-progress'
  /** The default branch is already checked out, so there is nothing to switch. */
  | 'already-on-default-branch'
  /** Detached HEAD or an unborn branch: no stale branch to move away from. */
  | 'no-current-branch'

/** The repository facts the recovery plan is built from. */
export interface IPullBranchDeletedPlanFacts {
  /** The checked-out branch whose upstream is gone, or null when there is none. */
  readonly staleBranchName: string | null
  /**
   * The repository's resolved default branch. `null` means none is configured
   * or discoverable — which is reported to the user, never guessed at.
   */
  readonly defaultBranchName: string | null
  /** Number of changed files in the working directory. */
  readonly changedFileCount: number
  /** Whether the working directory currently holds unresolved conflicts. */
  readonly hasConflicts: boolean
  /** Whether a push, pull, or fetch is already running here. */
  readonly isNetworkOperationInProgress: boolean
  /**
   * Commits reachable from the stale branch but not from the default branch —
   * work that deleting the branch would strand. `null` means the count could
   * not be established, which is surfaced as an unknown rather than as zero.
   */
  readonly unmergedCommitCount: number | null
}

/** What the recovery dialog shows and what the store is allowed to do. */
export interface IPullBranchDeletedPlan {
  readonly staleBranchName: string | null
  readonly defaultBranchName: string | null
  /** `null` when the switch can proceed. */
  readonly blocker: PullBranchDeletedBlocker | null
  readonly unmergedCommitCount: number | null
  /**
   * Whether deleting the stale branch would strand commits. True when the
   * count is positive; also true when the count is unknown, because an
   * unproven zero is not a licence to delete quietly.
   */
  readonly deletionWouldStrandCommits: boolean
}

/**
 * Build the recovery plan from repository facts.
 *
 * The order of the blockers is the order in which they matter to the user: a
 * missing default branch makes the whole offer meaningless, and a dirty or
 * conflicted worktree makes the switch a mutation we refuse to perform.
 */
export function buildPullBranchDeletedPlan(
  facts: IPullBranchDeletedPlanFacts
): IPullBranchDeletedPlan {
  const {
    staleBranchName,
    defaultBranchName,
    unmergedCommitCount: rawCount,
  } = facts
  const unmergedCommitCount =
    rawCount === null || !Number.isSafeInteger(rawCount) || rawCount < 0
      ? null
      : rawCount

  const base = {
    staleBranchName,
    defaultBranchName,
    unmergedCommitCount,
    deletionWouldStrandCommits:
      unmergedCommitCount === null || unmergedCommitCount > 0,
  }

  const blocker = ((): PullBranchDeletedBlocker | null => {
    if (defaultBranchName === null || defaultBranchName.length === 0) {
      return 'no-default-branch'
    }
    if (staleBranchName === null || staleBranchName.length === 0) {
      return 'no-current-branch'
    }
    if (staleBranchName === defaultBranchName) {
      return 'already-on-default-branch'
    }
    if (facts.hasConflicts) {
      return 'conflicted-worktree'
    }
    if (facts.changedFileCount > 0) {
      return 'dirty-worktree'
    }
    if (facts.isNetworkOperationInProgress) {
      return 'operation-in-progress'
    }
    return null
  })()

  return { ...base, blocker }
}

/** How a requested recovery actually ended. Reported, never predicted. */
export type PullBranchDeletedRecoveryOutcome =
  | { readonly kind: 'blocked'; readonly blocker: PullBranchDeletedBlocker }
  | {
      readonly kind: 'checkout-failed'
      readonly defaultBranchName: string
    }
  | {
      readonly kind: 'completed'
      readonly defaultBranchName: string
      /** Whether the stale branch was actually deleted. */
      readonly deletedStaleBranch: boolean
      /** Why the requested deletion did not happen, when it did not. */
      readonly deletionSkippedReason: string | null
      /** The retried pull's real result. */
      readonly pull: 'succeeded' | 'failed'
      /** The retried pull's error message when it failed. */
      readonly pullError: string | null
    }

/**
 * The most recovery offers one batch sync is allowed to raise.
 *
 * Reviewing repositories one at a time is this fork's pattern, but a batch
 * across hundreds of repositories must not answer a deleted upstream with
 * hundreds of stacked modal decisions. Affected repositories past the cap
 * still say so in their result row; they simply do not open a dialog.
 */
export const MaximumPullBranchDeletedRecoveryOffers = 10

/**
 * One batch's remaining allowance of recovery offers.
 *
 * Deliberately mutable and deliberately per batch: the workers run
 * concurrently, and two batches must not spend each other's budget.
 */
export interface IPullBranchDeletedOfferBudget {
  offersRemaining: number
}

/** Start a batch with a fresh allowance of deleted-upstream recovery offers. */
export function createPullBranchDeletedOfferBudget(
  offers: number = MaximumPullBranchDeletedRecoveryOffers
): IPullBranchDeletedOfferBudget {
  return {
    offersRemaining:
      Number.isSafeInteger(offers) && offers >= 0
        ? Math.min(offers, MaximumPullBranchDeletedRecoveryOffers)
        : MaximumPullBranchDeletedRecoveryOffers,
  }
}
