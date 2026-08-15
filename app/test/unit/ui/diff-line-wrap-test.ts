import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'

import {
  DiffLineWrapChangedEvent,
  readDiffLineWrap,
  writeDiffLineWrap,
} from '../../../src/ui/diff/diff-line-wrap'

describe('diff line wrapping preference', () => {
  beforeEach(() => window.localStorage.clear())

  it('defaults to wrapping and persists either explicit choice', () => {
    assert.equal(readDiffLineWrap(), true)

    writeDiffLineWrap(false)
    assert.equal(readDiffLineWrap(), false)

    writeDiffLineWrap(true)
    assert.equal(readDiffLineWrap(), true)
  })

  it('broadcasts the selected value to mounted diff surfaces', () => {
    const values: boolean[] = []
    const listener = (event: Event) => {
      values.push((event as CustomEvent<boolean>).detail)
    }
    document.addEventListener(DiffLineWrapChangedEvent, listener)

    try {
      writeDiffLineWrap(false)
      writeDiffLineWrap(true)
    } finally {
      document.removeEventListener(DiffLineWrapChangedEvent, listener)
    }

    assert.deepStrictEqual(values, [false, true])
  })
})
