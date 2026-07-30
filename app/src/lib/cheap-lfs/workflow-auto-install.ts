import { TranslationKey } from '../i18n-resources'
import { CheapLfsStorageProvider } from '../../models/build-run-preferences'
import { CheapLfsEncryptedBuilderBlocker } from './encrypted-builder'
import {
  CheapLfsCloudCompressionPolicy,
  CHEAP_LFS_MANAGED_WORKFLOW_MARKER,
  getCheapLfsCloudCompressionRoute,
  renderCheapLfsCloudCompressionWorkflow,
} from './cloud-compression'

/**
 * Message of the one commit that installs the managed cloud-compression
 * caller. Bilingual, matching this app's commit-note convention, and plain
 * about what it adds — it is a real commit in the user's history that the app
 * authored on their behalf, so it says exactly what it is.
 */
export const CheapLfsWorkflowInstallCommitMessage =
  'Add Cheap LFS cloud compression workflow / 加入雲端壓縮工作流'

/**
 * Everything needed to decide whether the repository is missing its managed
 * cloud-compression caller.
 *
 * "Has the workflow" is deliberately read from the *committed* tree, not the
 * working tree. Settings, the Cheap LFS panel, and clone repair all write the
 * caller into the working tree as an uncommitted change, and GitHub Actions
 * never sees an uncommitted file — a repository holding only that change is
 * still a repository where cloud compression does not run.
 */
export interface ICheapLfsWorkflowObservation {
  readonly policy: CheapLfsCloudCompressionPolicy
  readonly provider: CheapLfsStorageProvider
  /** Exact bytes committed at HEAD for the workflow path; `null` when absent. */
  readonly committedContents: string | null
  /** Exact bytes in the working tree; `null` when absent. */
  readonly workingTreeContents: string | null
  /** The canonical caller rendered for the repository's current policy. */
  readonly canonicalContents: string
}

/**
 * What the background installer is allowed to do about the observation.
 *
 * - `disabled`         — compression is off, or the storage provider has no
 *                        Release caller at all. Do nothing.
 * - `install`          — the committed tree carries no caller. Write the
 *                        canonical file, commit it, and push it.
 * - `installed`        — the committed caller is already canonical. Do nothing;
 *                        a local edit on top of it is the user's business.
 * - `offer-update`     — a caller exists but differs from canonical. Never
 *                        replaced silently; surface a one-click confirm.
 * - `blocked-unowned`  — something the app does not own occupies the path.
 *                        Leave it completely untouched and say so once.
 * - `external-builder` — reserved for an externally provisioned route. No
 *                        current repository policy selects it.
 * - `blocked-visibility-unknown`
 *                      — GitHub has not confirmed whether this repository is
 *                        public or private. Neither route may run, and the
 *                        blocker is reported rather than guessed past.
 */
export type CheapLfsWorkflowInstallDecision =
  | 'disabled'
  | 'install'
  | 'installed'
  | 'offer-update'
  | 'blocked-unowned'
  | 'external-builder'
  | 'blocked-visibility-unknown'

/**
 * Decide, fail-closed and without ever proposing an overwrite, what the
 * background installer may do.
 *
 * The route is settled before anything else. A caller is written only when
 * GitHub has confirmed the repository public or when a confirmed-private
 * repository carries the explicit opt-in. Every other answer either does
 * nothing or reports why. After that the unowned check runs, because a file at
 * this path that does not carry the managed marker was written by somebody
 * else, and no later branch may reach a state that writes over it.
 */
export function decideCheapLfsWorkflowInstall(
  observation: ICheapLfsWorkflowObservation
): CheapLfsWorkflowInstallDecision {
  if (observation.provider !== 'release') {
    return 'disabled'
  }
  const route = getCheapLfsCloudCompressionRoute(observation.policy)
  if (route === 'none') {
    return 'disabled'
  }
  if (route === 'blocked-visibility-unknown') {
    return 'blocked-visibility-unknown'
  }
  if (route === 'encrypted-public-builder') {
    return 'external-builder'
  }

  const committed = observation.committedContents
  const workingTree = observation.workingTreeContents
  const canonical = observation.canonicalContents
  const unowned = (contents: string | null): boolean =>
    contents !== null && !contents.startsWith(CHEAP_LFS_MANAGED_WORKFLOW_MARKER)
  if (unowned(committed) || unowned(workingTree)) {
    return 'blocked-unowned'
  }

  // A private opt-in changes the exact disabled managed caller into its armed
  // counterpart. Publishing that reviewed transition is the user's explicit
  // choice, not an unsolicited update to a divergent workflow, so let the
  // background publisher commit it instead of stopping at "offer update".
  const oppositePrivateGuard =
    observation.policy === 'enabled-private'
      ? renderCheapLfsCloudCompressionWorkflow(false)
      : null
  if (
    oppositePrivateGuard !== null &&
    committed === oppositePrivateGuard &&
    (workingTree === oppositePrivateGuard || workingTree === canonical)
  ) {
    return 'install'
  }

  if (committed === null) {
    // Nothing is committed, so this is the install case — but only when the
    // bytes that would be committed are exactly the canonical ones. A managed
    // file the user has since edited is their content, not the app's.
    return workingTree === null || workingTree === canonical
      ? 'install'
      : 'offer-update'
  }

  if (committed === canonical) {
    return 'installed'
  }

  return 'offer-update'
}

/**
 * Observable facts about how far the current branch has been published, read
 * before the installed workflow commit is allowed to leave this machine.
 */
export interface ICheapLfsWorkflowPublicationState {
  readonly hasGitHubRepository: boolean
  readonly remoteName: string | null
  readonly branchName: string | null
  /** The branch tip as it stood *before* the workflow commit was created. */
  readonly localTipShaBeforeCommit: string | null
  /**
   * Proven remote tip of `branchName` read from `ls-remote`, or `null` when the
   * branch has no remote counterpart yet. Never inferred from a remote-tracking
   * ref, which can survive after the remote branch is deleted.
   */
  readonly remoteBranchSha: string | null
}

/**
 * How the workflow commit may reach the remote.
 *
 * - `push`                   — the remote tip is exactly the commit this
 *                              install was built on, so the push publishes the
 *                              workflow commit and nothing else.
 * - `anchor`                 — the branch has never been published. Reuse the
 *                              Cheap LFS first-publish anchor, which is already
 *                              the reviewed route for creating this branch.
 * - `defer-unpushed-commits` — the branch has diverged from its remote. The
 *                              workflow is committed locally and rides out with
 *                              the user's own next push; a background push here
 *                              would publish work they have not reviewed.
 */
export type CheapLfsWorkflowPublishDecision =
  | 'push'
  | 'anchor'
  | 'defer-unpushed-commits'
  | 'blocked-no-github-repository'
  | 'blocked-no-remote'
  | 'blocked-detached-head'

/** Decide, fail-closed, how far the workflow commit may be published. */
export function decideCheapLfsWorkflowPublish(
  state: ICheapLfsWorkflowPublicationState
): CheapLfsWorkflowPublishDecision {
  if (!state.hasGitHubRepository) {
    return 'blocked-no-github-repository'
  }
  if (state.remoteName === null) {
    return 'blocked-no-remote'
  }
  if (state.branchName === null) {
    return 'blocked-detached-head'
  }
  if (state.remoteBranchSha === null) {
    return 'anchor'
  }
  return state.remoteBranchSha === state.localTipShaBeforeCommit
    ? 'push'
    : 'defer-unpushed-commits'
}

/** True while the decision forbids publishing the workflow commit at all. */
export function cheapLfsWorkflowPublishIsBlocked(
  decision: CheapLfsWorkflowPublishDecision
): boolean {
  return (
    decision === 'blocked-no-github-repository' ||
    decision === 'blocked-no-remote' ||
    decision === 'blocked-detached-head'
  )
}

/**
 * Why a background workflow push did not land, in terms the user can act on.
 *
 * `workflow-scope` is called out by name because it is the one failure this
 * feature provokes that nothing else does: GitHub refuses any push that adds
 * or edits a file under `.github/workflows` when the credential in use lacks
 * the `workflow` scope, and the raw refusal reads like a permissions bug.
 */
export type CheapLfsWorkflowPushFailure =
  | 'workflow-scope'
  | 'rejected'
  | 'unknown'

/**
 * GitHub's refusal names the actor and the missing grant. OAuth apps and
 * personal access tokens are told they need the `workflow` scope; GitHub Apps
 * are told they need the `workflows` permission. Match the shape both share so
 * a reworded variant is still recognized.
 */
const WorkflowScopeRefusal =
  /refusing to allow[\s\S]*?workflow|without\s+[`'"]?workflows?[`'"]?\s+(?:scope|permission)/i

/** Classify a push failure into one bounded, sanitizable reason. */
export function classifyCheapLfsWorkflowPushFailure(
  detail: string
): CheapLfsWorkflowPushFailure {
  if (WorkflowScopeRefusal.test(detail)) {
    return 'workflow-scope'
  }
  if (/\brejected\b|non-fast-forward|fetch first/i.test(detail)) {
    return 'rejected'
  }
  return 'unknown'
}

/** The localized, plain-language explanation shown for a push failure. */
export function cheapLfsWorkflowPushFailureKey(
  failure: CheapLfsWorkflowPushFailure
): TranslationKey {
  switch (failure) {
    case 'workflow-scope':
      return 'cheapLfs.cloud.autoInstall.failedWorkflowScope'
    case 'rejected':
      return 'cheapLfs.cloud.autoInstall.failedRejected'
    case 'unknown':
    default:
      return 'cheapLfs.cloud.autoInstall.failedUnknown'
  }
}

/** The localized reason for a decision that stopped before any push. */
export function cheapLfsWorkflowPublishReasonKey(
  decision: CheapLfsWorkflowPublishDecision
): TranslationKey | null {
  switch (decision) {
    case 'blocked-no-github-repository':
      return 'cheapLfs.cloud.autoInstall.failedNoRepository'
    case 'blocked-no-remote':
      return 'cheapLfs.cloud.autoInstall.failedNoRemote'
    case 'blocked-detached-head':
      return 'cheapLfs.cloud.autoInstall.failedDetachedHead'
    default:
      return null
  }
}

/** Collapses repeated background installs for one repository into one card. */
export function cheapLfsWorkflowNoticeDedupeKey(
  repositoryId: number,
  scope:
    | 'install'
    | 'update'
    | 'unowned'
    | 'external-builder'
    | 'visibility-unknown'
    | 'leak-refused'
): string {
  return `cheap-lfs-cloud-compression-workflow:${scope}:${repositoryId}`
}

/**
 * The localized explanation for a route that stops before any install.
 *
 * Every one of these is a fail-closed stop, not a retryable error: nothing was
 * installed in the private repository and nothing was published publicly.
 */
export function cheapLfsEncryptedBuilderBlockerKey(
  blocker: CheapLfsEncryptedBuilderBlocker
): TranslationKey {
  switch (blocker) {
    case 'leak-refused':
      return 'cheapLfs.cloud.autoInstall.builderLeakRefusedBody'
    case 'no-identity':
      return 'cheapLfs.cloud.autoInstall.builderNoIdentityBody'
    case 'builder-unavailable':
    default:
      return 'cheapLfs.cloud.autoInstall.builderUnavailableBody'
  }
}
