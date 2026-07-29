import assert from 'node:assert'
import { describe, it } from 'node:test'

import { normalizeLineEndings } from '../tui/tools/normalize-line-endings.mjs'

describe('parity contract line endings', () => {
  it('normalizes Windows and legacy carriage returns to LF', () => {
    assert.equal(
      normalizeLineEndings('first\r\nsecond\rthird\n'),
      'first\nsecond\nthird\n'
    )
  })

  it('leaves an LF-only generated contract byte-stable', () => {
    const contract = '{\n  "generated": true\n}\n'
    assert.equal(normalizeLineEndings(contract), contract)
  })
})
