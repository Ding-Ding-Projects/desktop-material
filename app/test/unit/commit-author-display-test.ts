import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  getShowCommitAuthorInfo,
  setShowCommitAuthorInfo,
  ShowCommitAuthorInfoChangedEvent,
} from '../../src/models/commit-author-display'

const StorageKey = 'show-commit-author-info'

describe('commit author display preference', () => {
  beforeEach(() => localStorage.removeItem(StorageKey))
  afterEach(() => localStorage.removeItem(StorageKey))

  it('defaults off and publishes same-window changes', () => {
    const values: boolean[] = []
    const listener = (event: Event) =>
      values.push((event as CustomEvent<boolean>).detail)
    document.addEventListener(ShowCommitAuthorInfoChangedEvent, listener)

    try {
      assert.equal(getShowCommitAuthorInfo(), false)
      setShowCommitAuthorInfo(true)
      setShowCommitAuthorInfo(true)
      assert.equal(getShowCommitAuthorInfo(), true)
      setShowCommitAuthorInfo(false)
      setShowCommitAuthorInfo(false)
      assert.equal(getShowCommitAuthorInfo(), false)
      assert.deepEqual(values, [true, false])
    } finally {
      document.removeEventListener(ShowCommitAuthorInfoChangedEvent, listener)
    }
  })
})
