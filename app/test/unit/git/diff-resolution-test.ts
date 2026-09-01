import { describe, it } from 'node:test'
import assert from 'node:assert'

import { DiffType, ITextDiff } from '../../../src/models/diff'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { getResolutionDiff } from '../../../src/lib/git'

describe('git/diff/getResolutionDiff', () => {
  it('diffs resolved content against the on-disk file', async t => {
    const repo = await setupEmptyRepository(t)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'original\n' }],
      commitMessage: 'init',
    })

    const resolved = 'modified\n'
    const diff = await getResolutionDiff(repo, 'file.txt', {
      content: resolved,
    })

    assert.equal(diff.diff.kind, DiffType.Text)
    const textDiff = diff.diff as ITextDiff
    assert(textDiff.text.includes('-original'))
    assert(textDiff.text.includes('+modified'))
    assert.equal(diff.oldContents, 'original\n')
    assert.equal(diff.newContents, resolved)
  })
})
