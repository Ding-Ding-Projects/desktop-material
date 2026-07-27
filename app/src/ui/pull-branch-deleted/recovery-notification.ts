import { TranslationKey, TranslationVariables } from '../../lib/i18n'
import { FunnyLevelTextBase } from '../../lib/funny-level-text'
import {
  PullBranchDeletedBlocker,
  PullBranchDeletedRecoveryOutcome,
} from '../../lib/pull-branch-deleted'
import { INotificationInput } from '../../models/notification-centre'

/** Translate one resource key. */
export type PullBranchDeletedLocalize = (
  key: TranslationKey,
  variables?: TranslationVariables
) => string

/** Translate one funny-level key family, picking each language's own band. */
export type PullBranchDeletedLocalizeWithFunnyLevel = (
  base: FunnyLevelTextBase,
  variables?: TranslationVariables
) => string

/** Everything the result notification needs that is not in the outcome. */
export interface IPullBranchDeletedNotificationContext {
  readonly repositoryId: number
  readonly repositoryName: string
  /** The branch the recovery moved away from. */
  readonly staleBranchName: string
  readonly localize: PullBranchDeletedLocalize
  readonly localizeWithFunnyLevel: PullBranchDeletedLocalizeWithFunnyLevel
}

/**
 * The resource key that states one refusal.
 *
 * Every blocker maps to a message that names the repository and what the user
 * has to do about it. There is no generic "could not switch" fallback, because
 * a refusal the user cannot act on is not worth showing.
 */
export function pullBranchDeletedBlockerKey(
  blocker: PullBranchDeletedBlocker
): TranslationKey {
  switch (blocker) {
    case 'no-default-branch':
      return 'pullBranchDeleted.blockedNoDefaultBranch'
    case 'no-current-branch':
      return 'pullBranchDeleted.blockedNoCurrentBranch'
    case 'already-on-default-branch':
      return 'pullBranchDeleted.blockedAlreadyOnDefaultBranch'
    case 'dirty-worktree':
      return 'pullBranchDeleted.blockedDirtyWorktree'
    case 'conflicted-worktree':
      return 'pullBranchDeleted.blockedConflictedWorktree'
    case 'operation-in-progress':
      return 'pullBranchDeleted.blockedOperationInProgress'
  }
}

/**
 * Turn a finished recovery into the non-blocking notification that reports it.
 *
 * The retried pull is reported as it actually ended: a failure keeps its Git
 * message, a refused switch keeps its reason, and a stale branch that was kept
 * says why it was kept. Nothing here predicts a success.
 */
export function buildPullBranchDeletedNotification(
  outcome: PullBranchDeletedRecoveryOutcome,
  context: IPullBranchDeletedNotificationContext
): INotificationInput {
  const { localize, repositoryId, repositoryName, staleBranchName } = context
  const repository = repositoryName
  const branch = staleBranchName

  const notification = (title: string, body: string): INotificationInput => ({
    kind: 'auto-pull',
    title,
    body,
    repositoryId,
    action: { kind: 'open-repository', repositoryId },
  })

  if (outcome.kind === 'blocked') {
    return notification(
      localize('pullBranchDeleted.blockedTitle'),
      localize(pullBranchDeletedBlockerKey(outcome.blocker), {
        repository,
        branch,
      })
    )
  }

  if (outcome.kind === 'checkout-failed') {
    return notification(
      localize('pullBranchDeleted.checkoutFailedTitle'),
      localize('pullBranchDeleted.checkoutFailedBody', {
        repository,
        default: outcome.defaultBranchName,
      })
    )
  }

  const deletionClause = outcome.deletedStaleBranch
    ? localize('pullBranchDeleted.deletionDone', { branch })
    : outcome.deletionSkippedReason === null
    ? null
    : localize('pullBranchDeleted.deletionSkipped', {
        branch,
        reason: outcome.deletionSkippedReason,
      })

  const withDeletion = (body: string) =>
    deletionClause === null ? body : `${body} ${deletionClause}`

  if (outcome.pull === 'failed') {
    return notification(
      localize('pullBranchDeleted.retryFailedTitle'),
      withDeletion(
        localize('pullBranchDeleted.retryFailedBody', {
          repository,
          default: outcome.defaultBranchName,
          error: outcome.pullError ?? '',
        })
      )
    )
  }

  return notification(
    localize('pullBranchDeleted.recoveredTitle'),
    withDeletion(
      context.localizeWithFunnyLevel('pullBranchDeleted.recovered', {
        repository,
        default: outcome.defaultBranchName,
      })
    )
  )
}
