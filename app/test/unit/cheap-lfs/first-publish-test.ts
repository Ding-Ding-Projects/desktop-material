import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  buildCheapLfsFirstPublishAbort,
  cheapLfsFirstPublishBlocksUpload,
  cheapLfsFirstPublishNeedsBootstrap,
  cheapLfsFirstPublishReasonKey,
  decideCheapLfsFirstPublish,
  ICheapLfsPublicationState,
  isCheapLfsFirstPublishProven,
} from '../../../src/lib/cheap-lfs/first-publish'
import { cheapLfsFailedFileRowText } from '../../../src/lib/cheap-lfs/failure-reason'
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

describe('buildCheapLfsFirstPublishAbort', () => {
  const targets = [
    { relativePath: 'big/one.bin', sizeInBytes: 120 },
    { relativePath: 'big/two.bin', sizeInBytes: 80 },
  ]

  it('threads the reason onto every file row, the terminal, and the notice', () => {
    const abort = buildCheapLfsFirstPublishAbort(
      {
        reasonKey: 'cheapLfs.firstPublish.publishFailed',
        detail: '`git push` exited with an unexpected code: 128.',
      },
      targets,
      42
    )

    assert.strictEqual(abort.failures.length, 2)
    for (const failure of abort.failures) {
      assert.strictEqual(
        failure.reasonKey,
        'cheapLfs.firstPublish.publishFailed'
      )
      assert.strictEqual(
        failure.reasonDetail,
        '`git push` exited with an unexpected code: 128.'
      )
      assert.ok(failure.message.length > 0)
      // Every row must state the cause, not only the generic guidance.
      assert.match(
        cheapLfsFailedFileRowText(failure.relativePath, failure),
        /128/
      )
    }

    // The terminal summary must account for the aborted files and say why.
    assert.strictEqual(abort.progress.failedFiles, 2)
    assert.strictEqual(abort.progress.succeededFiles, 0)
    assert.strictEqual(abort.progress.completedFiles, 2)
    assert.strictEqual(abort.progress.totalFiles, 2)
    assert.strictEqual(abort.progress.totalBytes, 200)
    assert.strictEqual(abort.progress.transferredBytes, 0)
    assert.strictEqual(abort.progress.failedFileDetails?.length, 2)
    assert.deepStrictEqual(
      abort.progress.failedFileDetails?.map(detail => detail.relativePath),
      ['big/one.bin', 'big/two.bin']
    )
    for (const detail of abort.progress.failedFileDetails ?? []) {
      assert.strictEqual(
        detail.reasonKey,
        'cheapLfs.firstPublish.publishFailed'
      )
      assert.match(
        cheapLfsFailedFileRowText(detail.relativePath, detail),
        /128/
      )
    }

    // The persistent notice repeats both halves and dedupes per repository.
    assert.strictEqual(
      abort.notice.title,
      englishTranslations['cheapLfs.firstPublish.abortTitle']
    )
    assert.match(abort.notice.message, /128/)
    assert.ok(
      abort.notice.message.startsWith(
        englishTranslations['cheapLfs.firstPublish.publishFailed']
      )
    )
    assert.strictEqual(abort.notice.dedupeKey, 'cheap-lfs-first-publish:42')
  })

  it('omits the detail clause when there is no underlying cause', () => {
    const abort = buildCheapLfsFirstPublishAbort(
      { reasonKey: 'cheapLfs.firstPublish.noRemote' },
      targets,
      7
    )
    assert.strictEqual(abort.failures[0].reasonDetail, undefined)
    assert.strictEqual(
      abort.notice.message,
      englishTranslations['cheapLfs.firstPublish.noRemote']
    )
    assert.doesNotMatch(abort.notice.message, /Git reported/)
  })

  it('never leaks a credential-bearing detail into any surface', () => {
    const abort = buildCheapLfsFirstPublishAbort(
      {
        reasonKey: 'cheapLfs.firstPublish.publishFailed',
        detail:
          'fatal: unable to access https://x:ghp_abcdef0123456789@example.invalid/r.git/',
      },
      targets,
      3
    )
    assert.doesNotMatch(abort.notice.message, /ghp_/)
    assert.doesNotMatch(abort.notice.message, /https:/)
    for (const detail of abort.progress.failedFileDetails ?? []) {
      const row = cheapLfsFailedFileRowText(detail.relativePath, detail)
      assert.doesNotMatch(row, /ghp_/)
      assert.doesNotMatch(row, /https:/)
    }
  })

  it('keeps the abort copy present and plain in both languages', () => {
    for (const key of [
      'cheapLfs.firstPublish.abortTitle',
      'cheapLfs.firstPublish.reasonWithDetail',
    ] as const) {
      assert.ok((englishTranslations[key] ?? '').length > 0)
      assert.ok((cantoneseTranslations[key] ?? '').length > 0)
    }
    // Only the composition template may carry placeholders.
    for (const catalog of [englishTranslations, cantoneseTranslations]) {
      assert.doesNotMatch(
        catalog['cheapLfs.firstPublish.abortTitle'] ?? '',
        /\{/
      )
      assert.match(
        catalog['cheapLfs.firstPublish.reasonWithDetail'] ?? '',
        /\{reason\}/
      )
      assert.match(
        catalog['cheapLfs.firstPublish.reasonWithDetail'] ?? '',
        /\{detail\}/
      )
    }
  })
})
