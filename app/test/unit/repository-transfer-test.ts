import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  RepositoryTransferRecoveryRefPrefix,
  RepositoryTransferSnapshotCommitMessage,
  describeRepositoryTransferMode,
  validateRepositoryTransferName,
} from '../../src/lib/repository-transfer'

describe('repository transfer policy', () => {
  it('accepts provider-safe repository names and trims surrounding whitespace', () => {
    assert.equal(validateRepositoryTransferName('  new-home  '), 'new-home')
    assert.equal(validateRepositoryTransferName('docs_v2.1'), 'docs_v2.1')
  })

  it('rejects blank, unsafe, and overlong destination names', () => {
    for (const name of [
      '',
      '   ',
      '.',
      '..',
      'name/with/slash',
      'name with spaces',
    ]) {
      assert.throws(
        () => validateRepositoryTransferName(name),
        /Repository names/
      )
    }
    assert.throws(
      () => validateRepositoryTransferName('a'.repeat(101)),
      /Repository names/
    )
  })

  it('describes both modes with their actual history behavior', () => {
    assert.match(
      describeRepositoryTransferMode('full-history'),
      /every local branch and tag.*existing commit history/
    )
    assert.match(
      describeRepositoryTransferMode('clean-state'),
      /one new root commit.*local recovery ref/
    )
    assert.match(
      RepositoryTransferRecoveryRefPrefix,
      /^refs\/desktop-material\//
    )
    assert.match(
      RepositoryTransferSnapshotCommitMessage,
      /clean repository transfer/i
    )
  })
})
