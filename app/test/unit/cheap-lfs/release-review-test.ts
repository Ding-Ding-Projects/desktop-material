import assert from 'node:assert'
import { describe, it } from 'node:test'

import { IGitHubRelease } from '../../../src/lib/github-releases'
import {
  cheapLfsReleaseInventoryFingerprint,
  cheapLfsReleaseReviewHasTag,
  isCheapLfsReleaseReviewCurrent,
  requireCheapLfsReleaseReviewCurrent,
  takeCheapLfsReleaseReview,
} from '../../../src/lib/cheap-lfs/release-review'

function release(
  id: number,
  tagName: string,
  overrides: Partial<IGitHubRelease> = {}
): IGitHubRelease {
  return {
    id,
    tagName,
    targetCommitish: 'main',
    name: tagName,
    body: '',
    draft: false,
    prerelease: true,
    createdAt: new Date('2026-07-25T00:00:00.000Z'),
    publishedAt: new Date('2026-07-25T00:00:00.000Z'),
    authorLogin: 'octocat',
    htmlURL: null,
    assets: [],
    ...overrides,
  }
}

// Exactly what round 3 saw: a commit-less repository answers with an empty
// inventory even though these buckets exist, and the anchor push reveals them.
const preAnchorInventory: ReadonlyArray<IGitHubRelease> = []
const postAnchorInventory = [
  release(11, 'assets'),
  release(12, 'assets-parallel-2'),
  release(13, 'assets-parallel-3'),
]

describe('cheap LFS release review', () => {
  it('reflects the post-anchor inventory, not the hidden pre-anchor one', () => {
    const early = takeCheapLfsReleaseReview(preAnchorInventory, false)
    const reviewed = takeCheapLfsReleaseReview(postAnchorInventory, true)

    assert.strictEqual(early.takenAfterAnchor, false)
    assert.strictEqual(reviewed.takenAfterAnchor, true)
    assert.notStrictEqual(reviewed.fingerprint, early.fingerprint)
    assert.deepStrictEqual(reviewed.tags, [
      'assets',
      'assets-parallel-2',
      'assets-parallel-3',
    ])
    // The pre-anchor review is precisely the wrong answer: it proves nothing
    // about the buckets the anchor is about to reveal.
    assert.deepStrictEqual(early.tags, [])
    assert.strictEqual(
      isCheapLfsReleaseReviewCurrent(early, postAnchorInventory),
      false
    )
    assert.strictEqual(
      isCheapLfsReleaseReviewCurrent(reviewed, postAnchorInventory),
      true
    )
  })

  it('is order independent so two reads of one inventory compare equal', () => {
    assert.strictEqual(
      cheapLfsReleaseInventoryFingerprint(postAnchorInventory),
      cheapLfsReleaseInventoryFingerprint([...postAnchorInventory].reverse())
    )
  })

  it('still aborts for any change made after the review was taken', () => {
    const reviewed = takeCheapLfsReleaseReview(postAnchorInventory, true)

    for (const changed of [
      // A bucket appears after the review.
      [...postAnchorInventory, release(14, 'assets-parallel-4')],
      // A reviewed bucket disappears.
      postAnchorInventory.slice(1),
      // A reviewed bucket is mutated in place.
      [release(11, 'assets', { draft: true }), ...postAnchorInventory.slice(1)],
      // A reviewed bucket gains an asset.
      [
        release(11, 'assets', {
          assets: [
            {
              id: 5,
              name: 'one.bin',
              label: null,
              state: 'uploaded',
              contentType: 'application/octet-stream',
              sizeInBytes: 10,
              downloadCount: 0,
              createdAt: new Date('2026-07-25T00:00:00.000Z'),
              updatedAt: new Date('2026-07-25T00:00:00.000Z'),
              digest: null,
            },
          ],
        }),
        ...postAnchorInventory.slice(1),
      ],
    ]) {
      assert.strictEqual(
        isCheapLfsReleaseReviewCurrent(reviewed, changed),
        false
      )
      assert.throws(
        () => requireCheapLfsReleaseReviewCurrent(reviewed, changed),
        /changed after Cheap LFS reviewed it/
      )
    }

    // The unchanged inventory is never refused.
    assert.doesNotThrow(() =>
      requireCheapLfsReleaseReviewCurrent(reviewed, postAnchorInventory)
    )
  })

  it('knows exactly which bucket tags the review proved', () => {
    const reviewed = takeCheapLfsReleaseReview(postAnchorInventory, true)
    assert.strictEqual(cheapLfsReleaseReviewHasTag(reviewed, 'assets'), true)
    assert.strictEqual(
      cheapLfsReleaseReviewHasTag(reviewed, 'assets-parallel-3'),
      true
    )
    assert.strictEqual(
      cheapLfsReleaseReviewHasTag(reviewed, 'assets-parallel-9'),
      false
    )
  })
})
