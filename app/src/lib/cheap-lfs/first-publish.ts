import { TranslationKey } from '../i18n-resources'

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
 * - `blocked-no-github-repository` — no GitHub repository backs this checkout,
 *                                    so the Releases API is unreachable.
 * - `blocked-no-remote`            — no push remote is configured.
 * - `blocked-detached-head`        — HEAD is detached, so there is no branch to
 *                                    publish.
 * - `blocked-unborn-branch`        — the branch has no commit to publish.
 */
export type CheapLfsFirstPublishDecision =
  | 'ready'
  | 'publish-branch'
  | 'blocked-no-github-repository'
  | 'blocked-no-remote'
  | 'blocked-detached-head'
  | 'blocked-unborn-branch'

/**
 * Decide, fail-closed, whether a Cheap LFS release upload may proceed.
 *
 * The Releases API is checked first: without a GitHub repository no release can
 * exist regardless of local state. A proven remote branch then makes the route
 * immediately usable. Everything else is either a publishable local branch or a
 * blocking condition which is reported per file instead of being retried into
 * another `422`.
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
    return 'blocked-unborn-branch'
  }
  return 'publish-branch'
}

/** True while the decision forbids uploading any asset. */
export function cheapLfsFirstPublishBlocksUpload(
  decision: CheapLfsFirstPublishDecision
): boolean {
  return decision !== 'ready' && decision !== 'publish-branch'
}

/** True only when a bootstrap push must happen before the first upload. */
export function cheapLfsFirstPublishNeedsBootstrap(
  decision: CheapLfsFirstPublishDecision
): boolean {
  return decision === 'publish-branch'
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
