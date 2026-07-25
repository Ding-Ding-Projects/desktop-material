import { t } from '../i18n'
import { TranslationKey } from '../i18n-resources'
import { cheapLfsFailureReasonText } from './failure-reason'
import type {
  ICheapLfsAutoPinFailure,
  ICheapLfsAutoPinProgress,
  ICheapLfsFailedFileProgress,
} from './operations'

/**
 * Observable facts about how far this repository has been published, gathered
 * before the Cheap LFS release route is allowed to create a release.
 *
 * A GitHub Release tag can only be created against a commitish GitHub already
 * has. On a repository which has never been published the local branch name
 * that `resolveReleaseTargetCommitish` returns does not exist on the remote, so
 * `POST /repos/{owner}/{repo}/releases` answers `422 Validation Failed`. That
 * failure is structural, not transient: retrying the upload can never fix it.
 */
export interface ICheapLfsPublicationState {
  /** Whether the repository is associated with a GitHub API repository. */
  readonly hasGitHubRepository: boolean
  /** Name of the push remote, or `null` when none is configured. */
  readonly remoteName: string | null
  /** Current local branch name; `null` when HEAD is detached. */
  readonly branchName: string | null
  /** Current local branch tip; `null` on an unborn branch (no commits yet). */
  readonly localTipSha: string | null
  /**
   * Proven remote tip of `branchName` read from `ls-remote`, or `null` when the
   * branch has no remote counterpart yet. Never inferred from a remote-tracking
   * ref, which can survive after the remote branch is deleted.
   */
  readonly remoteBranchSha: string | null
}

/**
 * What the release route must do before it may upload a Cheap LFS asset.
 *
 * - `ready`                        — the branch exists remotely; a release can
 *                                    anchor its tag to it.
 * - `publish-branch`               — everything needed exists locally, but the
 *                                    branch has never been pushed. Publish the
 *                                    branch tip first, then upload.
 * - `bootstrap-commit`             — the repository, remote, and branch exist
 *                                    but the branch is unborn, so there is not
 *                                    yet a commit to publish. Create one empty
 *                                    bootstrap commit, then publish it.
 * - `blocked-no-github-repository` — no GitHub repository backs this checkout,
 *                                    so the Releases API is unreachable.
 * - `blocked-no-remote`            — no push remote is configured.
 * - `blocked-detached-head`        — HEAD is detached, so there is no branch to
 *                                    publish.
 * - `blocked-unborn-branch`        — the branch had no commit to publish and the
 *                                    bootstrap commit could not be created. Only
 *                                    reachable as a bootstrap failure reason.
 */
export type CheapLfsFirstPublishDecision =
  | 'ready'
  | 'publish-branch'
  | 'bootstrap-commit'
  | 'blocked-no-github-repository'
  | 'blocked-no-remote'
  | 'blocked-detached-head'
  | 'blocked-unborn-branch'

/**
 * Message of the one empty commit created to make a truly empty repository
 * anchorable. Bilingual, matching this app's commit-note convention, and
 * authored with the app's ordinary identity — it is a real commit in the user's
 * history, so it says plainly why it exists.
 */
export const CheapLfsBootstrapCommitMessage =
  'Initialize repository for Cheap LFS / 開荒留名'

/**
 * Decide, fail-closed, whether a Cheap LFS release upload may proceed.
 *
 * The Releases API is checked first: without a GitHub repository no release can
 * exist regardless of local state. A proven remote branch then makes the route
 * immediately usable. Everything else is either a publishable local branch, an
 * empty repository that one bootstrap commit makes publishable, or a blocking
 * condition which is reported per file instead of being retried into another
 * `422`.
 *
 * An unborn branch is deliberately *not* blocking. GitHub hides the entire
 * release inventory of a commit-less repository, so refusing there left the only
 * route that could reveal it — publishing a commit — permanently out of reach.
 */
export function decideCheapLfsFirstPublish(
  state: ICheapLfsPublicationState
): CheapLfsFirstPublishDecision {
  if (!state.hasGitHubRepository) {
    return 'blocked-no-github-repository'
  }
  if (state.remoteBranchSha !== null) {
    return 'ready'
  }
  if (state.remoteName === null) {
    return 'blocked-no-remote'
  }
  if (state.branchName === null) {
    return 'blocked-detached-head'
  }
  if (state.localTipSha === null) {
    return 'bootstrap-commit'
  }
  return 'publish-branch'
}

/** True while the decision forbids uploading any asset. */
export function cheapLfsFirstPublishBlocksUpload(
  decision: CheapLfsFirstPublishDecision
): boolean {
  return (
    decision !== 'ready' &&
    decision !== 'publish-branch' &&
    decision !== 'bootstrap-commit'
  )
}

/** True only when a bootstrap push must happen before the first upload. */
export function cheapLfsFirstPublishNeedsBootstrap(
  decision: CheapLfsFirstPublishDecision
): boolean {
  return decision === 'publish-branch' || decision === 'bootstrap-commit'
}

/**
 * True only when the local branch carries no commit at all, so one empty
 * bootstrap commit must be created before anything can be published.
 */
export function cheapLfsFirstPublishNeedsBootstrapCommit(
  decision: CheapLfsFirstPublishDecision
): boolean {
  return decision === 'bootstrap-commit'
}

/**
 * The localized, plain-language reason shown on every affected file row and in
 * the failure notification. Non-blocking decisions have no reason.
 */
export function cheapLfsFirstPublishReasonKey(
  decision: CheapLfsFirstPublishDecision
): TranslationKey | null {
  switch (decision) {
    case 'blocked-no-github-repository':
      return 'cheapLfs.firstPublish.noRepository'
    case 'blocked-no-remote':
      return 'cheapLfs.firstPublish.noRemote'
    case 'blocked-detached-head':
      return 'cheapLfs.firstPublish.detachedHead'
    case 'blocked-unborn-branch':
      return 'cheapLfs.firstPublish.unbornBranch'
    default:
      return null
  }
}

/**
 * Why the Cheap LFS release route could not be made usable.
 *
 * The localized key explains what the user should do; `detail` carries the
 * underlying cause (typically Git's own message) so an abort is never reported
 * without the fact that produced it. `detail` is sanitized at display time.
 */
export interface ICheapLfsFirstPublishFailure {
  readonly reasonKey: TranslationKey
  readonly detail?: string
}

/**
 * What one attempt to make the release route usable achieved.
 *
 * `anchored` is deliberately separate from `failure === null`: an already
 * published repository is usable without this call having changed anything, and
 * only a call that actually published something entitles — and obliges — the
 * caller to re-review the release inventory GitHub was hiding until then.
 */
export interface ICheapLfsReleaseAnchorOutcome {
  readonly failure: ICheapLfsFirstPublishFailure | null
  readonly anchored: boolean
}

/** One file the aborted commit would have pinned. */
export interface ICheapLfsFirstPublishAbortTarget {
  readonly relativePath: string
  readonly sizeInBytes: number
}

/** A persistent, non-blocking notice describing why a commit stopped. */
export interface ICheapLfsFirstPublishAbortNotice {
  readonly title: string
  readonly message: string
  /** Collapses repeated aborts for the same repository into one card. */
  readonly dedupeKey: string
}

/**
 * Everything the aborted first publish must surface, built in one place.
 *
 * The abort used to reach the user as nothing at all: the underlying Git
 * failure went to `log.warn`, the commit button simply sprang back, and the
 * commit terminal reported no reason. This produces all three surfaces from the
 * same failure so none of them can drift apart or be forgotten — the per-file
 * rows, the terminal progress snapshot that states the counts and the reason,
 * and the persistent notice.
 */
export function buildCheapLfsFirstPublishAbort(
  failure: ICheapLfsFirstPublishFailure,
  targets: ReadonlyArray<ICheapLfsFirstPublishAbortTarget>,
  repositoryId: number
): {
  readonly failures: ReadonlyArray<ICheapLfsAutoPinFailure>
  readonly progress: ICheapLfsAutoPinProgress
  readonly notice: ICheapLfsFirstPublishAbortNotice
} {
  const detail =
    failure.detail === undefined ? {} : { reasonDetail: failure.detail }
  const failures = targets.map(
    (target): ICheapLfsAutoPinFailure => ({
      relativePath: target.relativePath,
      sizeInBytes: target.sizeInBytes,
      message: t(failure.reasonKey),
      reasonKey: failure.reasonKey,
      ...detail,
    })
  )
  const progress: ICheapLfsAutoPinProgress = {
    // Nothing was hashed or uploaded: the abort happened while preparing.
    phase: 'preparing',
    completedFiles: failures.length,
    totalFiles: failures.length,
    currentPath: null,
    transferredBytes: 0,
    totalBytes: failures.reduce((sum, entry) => sum + entry.sizeInBytes, 0),
    succeededFiles: 0,
    failedFiles: failures.length,
    failedFileDetails: failures.map(
      (entry): ICheapLfsFailedFileProgress => ({
        relativePath: entry.relativePath,
        // The localized key and its detail carry the reason; there is no
        // separate provider string for a failure this app diagnosed itself.
        reason: '',
        reasonKey: failure.reasonKey,
        ...detail,
      })
    ),
  }
  return {
    failures,
    progress,
    notice: {
      title: t('cheapLfs.firstPublish.abortTitle'),
      message: cheapLfsFailureReasonText({
        reasonKey: failure.reasonKey,
        ...detail,
      }),
      dedupeKey: `cheap-lfs-first-publish:${repositoryId}`,
    },
  }
}

/**
 * Verify the bootstrap push actually published the branch. The observation is
 * re-read from the remote rather than assumed from a successful `git push`, so
 * a push which silently landed elsewhere can never authorize an upload.
 */
export function isCheapLfsFirstPublishProven(
  state: ICheapLfsPublicationState,
  expectedTipSha: string
): boolean {
  return (
    state.remoteBranchSha !== null && state.remoteBranchSha === expectedTipSha
  )
}
