import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  cheapLfsFirstPublishBlocksUpload,
  cheapLfsFirstPublishNeedsBootstrap,
  cheapLfsFirstPublishReasonKey,
  decideCheapLfsFirstPublish,
  ICheapLfsPublicationState,
  isCheapLfsFirstPublishProven,
} from '../../../src/lib/cheap-lfs/first-publish'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../../src/lib/i18n-resources'

const tipSha = 'a'.repeat(40)

function published(
  overrides: Partial<ICheapLfsPublicationState> = {}
): ICheapLfsPublicationState {
  return {
    hasGitHubRepository: true,
    remoteName: 'origin',
    branchName: 'main',
    localTipSha: tipSha,
    remoteBranchSha: tipSha,
    ...overrides,
  }
}

describe('decideCheapLfsFirstPublish', () => {
  it('is ready once the branch exists on the remote', () => {
    assert.strictEqual(decideCheapLfsFirstPublish(published()), 'ready')
  })

  it('publishes the branch when only the remote counterpart is missing', () => {
    const decision = decideCheapLfsFirstPublish(
      published({ remoteBranchSha: null })
    )
    assert.strictEqual(decision, 'publish-branch')
    assert.strictEqual(cheapLfsFirstPublishNeedsBootstrap(decision), true)
    assert.strictEqual(cheapLfsFirstPublishBlocksUpload(decision), false)
    assert.strictEqual(cheapLfsFirstPublishReasonKey(decision), null)
  })

  it('blocks before any upload when there is no GitHub repository', () => {
    // Checked ahead of every local fact: without a GitHub repository the
    // Releases API cannot be reached at all.
    const decision = decideCheapLfsFirstPublish(
      published({ hasGitHubRepository: false })
    )
    assert.strictEqual(decision, 'blocked-no-github-repository')
    assert.strictEqual(cheapLfsFirstPublishBlocksUpload(decision), true)
    assert.strictEqual(
      cheapLfsFirstPublishReasonKey(decision),
      'cheapLfs.firstPublish.noRepository'
    )
  })

  it('blocks when no push remote is configured', () => {
    assert.strictEqual(
      decideCheapLfsFirstPublish(
        published({ remoteBranchSha: null, remoteName: null })
      ),
      'blocked-no-remote'
    )
  })

  it('blocks on a detached HEAD', () => {
    assert.strictEqual(
      decideCheapLfsFirstPublish(
        published({ remoteBranchSha: null, branchName: null })
      ),
      'blocked-detached-head'
    )
  })

  it('blocks on an unborn branch with nothing to publish', () => {
    assert.strictEqual(
      decideCheapLfsFirstPublish(
        published({ remoteBranchSha: null, localTipSha: null })
      ),
      'blocked-unborn-branch'
    )
  })

  it('never authorizes an upload for any blocking decision', () => {
    for (const state of [
      published({ hasGitHubRepository: false }),
      published({ remoteBranchSha: null, remoteName: null }),
      published({ remoteBranchSha: null, branchName: null }),
      published({ remoteBranchSha: null, localTipSha: null }),
    ]) {
      const decision = decideCheapLfsFirstPublish(state)
      assert.strictEqual(cheapLfsFirstPublishBlocksUpload(decision), true)
      assert.strictEqual(cheapLfsFirstPublishNeedsBootstrap(decision), false)
      assert.notStrictEqual(cheapLfsFirstPublishReasonKey(decision), null)
    }
  })

  it('publishes every blocking reason in both languages', () => {
    for (const state of [
      published({ hasGitHubRepository: false }),
      published({ remoteBranchSha: null, remoteName: null }),
      published({ remoteBranchSha: null, branchName: null }),
      published({ remoteBranchSha: null, localTipSha: null }),
    ]) {
      const key = cheapLfsFirstPublishReasonKey(
        decideCheapLfsFirstPublish(state)
      )
      assert.notStrictEqual(key, null)
      if (key === null) {
        continue
      }
      // Plain, actionable copy in both catalogs at every funny level.
      assert.ok((englishTranslations[key] ?? '').length > 0)
      assert.ok((cantoneseTranslations[key] ?? '').length > 0)
      assert.doesNotMatch(englishTranslations[key], /\{/)
    }
    assert.ok(
      (englishTranslations['cheapLfs.firstPublish.publishFailed'] ?? '')
        .length > 0
    )
    assert.ok(
      (cantoneseTranslations['cheapLfs.firstPublish.publishFailed'] ?? '')
        .length > 0
    )
  })
})

describe('isCheapLfsFirstPublishProven', () => {
  it('requires the remote to actually report the published tip', () => {
    assert.strictEqual(isCheapLfsFirstPublishProven(published(), tipSha), true)
  })

  it('rejects an unpublished branch even after a reported push', () => {
    assert.strictEqual(
      isCheapLfsFirstPublishProven(
        published({ remoteBranchSha: null }),
        tipSha
      ),
      false
    )
  })

  it('rejects a remote tip that is not the commit that was pushed', () => {
    assert.strictEqual(
      isCheapLfsFirstPublishProven(
        published({ remoteBranchSha: 'b'.repeat(40) }),
        tipSha
      ),
      false
    )
  })
})
