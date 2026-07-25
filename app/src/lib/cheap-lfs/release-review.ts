import { getGitHubReleaseFingerprint, IGitHubRelease } from '../github-releases'

/**
 * The exact release inventory a Cheap LFS batch was reviewed against.
 *
 * GitHub answers `GET /repos/{owner}/{repo}/releases` with `[]` for a repository
 * that has no commits — even when releases genuinely exist on it. A review taken
 * while the remote is commit-less therefore records an inventory that is not
 * merely stale but *wrong*: the anchor push publishes a commit, GitHub un-hides
 * every previously invisible release, and the per-mutation review guard then
 * correctly aborts uploads that were reviewed against the empty view.
 *
 * The review is consequently taken only after the anchor has guaranteed the
 * remote holds at least one commit, and `takenAfterAnchor` records that fact so
 * the ordering is observable rather than assumed.
 */
export interface ICheapLfsReleaseReview {
  /** Exact fingerprint of every reviewed release, order-independent. */
  readonly fingerprint: string
  /** Sorted tags this review proved to exist, used to fail closed on drift. */
  readonly tags: ReadonlyArray<string>
  /** Whether an anchor bootstrap ran immediately before this review was taken. */
  readonly takenAfterAnchor: boolean
}

/**
 * Fingerprint a complete release inventory.
 *
 * Releases are sorted by id so two reads of the same inventory in different
 * provider page orders compare equal, while any added, removed, or mutated
 * release — including one that only becomes visible — changes the value.
 */
export function cheapLfsReleaseInventoryFingerprint(
  releases: ReadonlyArray<IGitHubRelease>
): string {
  return JSON.stringify(
    [...releases]
      .sort((left, right) => left.id - right.id)
      .map(getGitHubReleaseFingerprint)
  )
}

/** Record the reviewed inventory a Cheap LFS batch is allowed to act on. */
export function takeCheapLfsReleaseReview(
  releases: ReadonlyArray<IGitHubRelease>,
  takenAfterAnchor: boolean
): ICheapLfsReleaseReview {
  return {
    fingerprint: cheapLfsReleaseInventoryFingerprint(releases),
    tags: [...new Set(releases.map(release => release.tagName))].sort(),
    takenAfterAnchor,
  }
}

/** Does a later read of the inventory still match what was reviewed? */
export function isCheapLfsReleaseReviewCurrent(
  review: ICheapLfsReleaseReview,
  releases: ReadonlyArray<IGitHubRelease>
): boolean {
  return review.fingerprint === cheapLfsReleaseInventoryFingerprint(releases)
}

/**
 * Fail closed when the inventory changed after it was reviewed. Any change is
 * refused: a release appearing mid-batch is exactly the condition that made the
 * commit-less repository abort, and acting on it would risk uploading into, or
 * duplicating, a bucket nobody reviewed.
 */
export function requireCheapLfsReleaseReviewCurrent(
  review: ICheapLfsReleaseReview,
  releases: ReadonlyArray<IGitHubRelease>
): void {
  if (!isCheapLfsReleaseReviewCurrent(review, releases)) {
    throw new Error(
      'The GitHub release inventory changed after Cheap LFS reviewed it. Retry the commit so the new inventory is reviewed before any upload.'
    )
  }
}

/** Did the review prove a release with this exact tag already exists? */
export function cheapLfsReleaseReviewHasTag(
  review: ICheapLfsReleaseReview,
  tag: string
): boolean {
  return review.tags.includes(tag)
}
