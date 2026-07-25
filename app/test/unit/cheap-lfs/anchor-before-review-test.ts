import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it } from 'node:test'

const source = readFileSync(
  join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
  'utf8'
)

function methodBody(start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `missing ${start}`)
  assert.notEqual(endIndex, -1, `missing boundary ${end}`)
  return source.slice(startIndex, endIndex)
}

describe('cheap LFS anchor before release review', () => {
  it('anchors first, then re-reviews the inventory, then pins', () => {
    // GitHub answers the releases API with `[]` for a commit-less repository,
    // so an inventory read before the anchor is wrong rather than merely stale.
    // The anchor must therefore complete before the review fingerprint exists.
    const body = methodBody(
      'private async autoPinLargeFilesBeforeCommit(',
      'private async readCheapLfsPublicationState('
    )

    const anchor = body.indexOf('this.ensureCheapLfsReleaseAnchor(repository)')
    const review = body.indexOf(
      'this.reviewCheapLfsReleaseInventory(repository)'
    )
    const pin = body.indexOf('autoPinLargeFilesForCommit(')

    assert.ok(anchor >= 0)
    assert.ok(review > anchor)
    assert.ok(pin > review)

    // The re-review happens only when an anchor actually published something;
    // an already-published repository must not pay for, or be gated on, it.
    assert.match(
      body,
      /releaseReview = anchor\.anchored\s*\?\s*await this\.reviewCheapLfsReleaseInventory\(repository\)\s*:\s*null/
    )
    // The reviewed inventory reaches both pin routes.
    assert.strictEqual(
      body.split('...(releaseReview === null ? {} : { releaseReview })')
        .length - 1,
      2
    )
  })

  it('reports whether the anchor published anything at all', () => {
    const body = methodBody(
      'private async ensureCheapLfsReleaseAnchor(',
      'private async createCheapLfsBootstrapCommit('
    )

    // An already-published repository returns early and is never re-reviewed.
    assert.match(
      body,
      /if \(decision === 'ready'\) \{\s*return \{ failure: null, anchored: false \}/
    )
    // Only the proven publish path may claim an anchor ran.
    assert.strictEqual(body.split('anchored: true').length - 1, 1)
    assert.match(
      body,
      /isCheapLfsFirstPublishProven\(proven, localTipSha\)[\s\S]*anchored: false[\s\S]*trackAndRefreshAfterCheapLfsAnchor\([\s\S]*return \{ failure: null, anchored: true \}/
    )
    // Every blocking decision still refuses without publishing anything.
    assert.match(
      body,
      /cheapLfsFirstPublishBlocksUpload\(decision\)[\s\S]*anchored: false/
    )
  })

  it('bootstraps an empty local repository with one empty commit', () => {
    const anchorBody = methodBody(
      'private async ensureCheapLfsReleaseAnchor(',
      'private async createCheapLfsBootstrapCommit('
    )
    const bootstrap = anchorBody.indexOf(
      'cheapLfsFirstPublishNeedsBootstrapCommit(decision)'
    )
    const create = anchorBody.indexOf(
      'this.createCheapLfsBootstrapCommit(',
      bootstrap
    )
    const reread = anchorBody.indexOf(
      'await this.readCheapLfsPublicationState(repository)',
      create
    )
    assert.ok(bootstrap >= 0)
    assert.ok(create > bootstrap)
    // The publication state is re-read so the new tip drives the push.
    assert.ok(reread > create)

    const body = methodBody(
      'private async createCheapLfsBootstrapCommit(',
      'private async trackAndRefreshAfterCheapLfsAnchor('
    )
    // An empty commit, never invented file content, through the ordinary
    // commit machinery and the app's normal author identity.
    assert.match(
      body,
      /createCommit\(\s*repository,\s*CheapLfsBootstrapCommitMessage,\s*\[\],\s*\{\s*allowEmpty: true/
    )
    assert.doesNotMatch(body, /writeFile|readFile|content/)
    // A refusing hook aborts the bootstrap instead of hanging on a prompt.
    assert.match(body, /onHookFailure: this\.onHookFailure\(/)
    assert.match(body, /reasonKey: 'cheapLfs\.firstPublish\.unbornBranch'/)
    // Only the branch state is reloaded: a full refresh would rebuild the
    // working-directory selection this very commit is still using.
    assert.match(body, /\.loadBranches\(\)/)
    assert.doesNotMatch(body, /this\._refreshRepository\(/)
  })

  it('refreshes branch, remote, and upstream state right after the anchor', () => {
    const body = methodBody(
      'private async trackAndRefreshAfterCheapLfsAnchor(',
      'private async reviewCheapLfsReleaseInventory('
    )

    // The create-only anchor push publishes an exact refspec and sets no
    // tracking, which left the toolbar offering "Publish branch" for a branch
    // it had just published.
    const trackingRef = body.indexOf('update-ref')
    const upstream = body.indexOf('--set-upstream-to=', trackingRef)
    const remotes = body.indexOf('loadRemotes()', upstream)
    const branches = body.indexOf('loadBranches()', remotes)
    const status = body.indexOf('loadStatus()', branches)
    assert.ok(trackingRef >= 0)
    assert.ok(upstream > trackingRef)
    assert.ok(remotes > upstream)
    assert.ok(branches > remotes)
    // Ahead/behind comes from the status branch header, so it is read last.
    assert.ok(status > branches)
    assert.match(body, /this\.emitUpdate\(\)/)
    // Cosmetic state must never cost an upload that already succeeded.
    assert.match(body, /catch \(error\) \{\s*log\.warn\(/)
  })

  it('takes the review only from a complete post-anchor inventory', () => {
    const body = methodBody(
      'private async reviewCheapLfsReleaseInventory(',
      'private postPersistentErrorNotice('
    )

    assert.match(body, /this\.githubReleasesStore\.listAll\(repository\)/)
    // A truncated or capped walk is not proof the unseen buckets are absent.
    assert.match(
      body,
      /inventory\.complete\s*\?\s*takeCheapLfsReleaseReview\(inventory\.releases, true\)\s*:\s*null/
    )
    // An unreadable inventory degrades instead of failing a viable commit.
    assert.match(body, /catch \(error\) \{[\s\S]*return null/)
  })
})
