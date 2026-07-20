import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { RegexTestArea } from '../../../src/ui/lib/regex-builder/regex-test-area'
import { render, screen } from '../../helpers/ui/render'

describe('RegexTestArea', () => {
  it('allocates complete rows for the first summary, body, and hash', () => {
    const sha = '5f4cc173b208d67b282cd870130c54892359d27f'
    const sample = `Add deterministic initialized and dormant submodules\n\n${sha} ${sha.slice(
      0,
      7
    )}`
    const view = render(
      <RegexTestArea
        pattern=""
        flags="i"
        sample={sample}
        onSampleChanged={() => undefined}
      />
    )

    const input = screen.getByRole('textbox', {
      name: 'Sample text for testing the regular expression',
    }) as HTMLTextAreaElement
    assert.equal(input.rows, 3)
    assert.deepStrictEqual(input.value.split(/\r?\n/).slice(0, 3), [
      'Add deterministic initialized and dormant submodules',
      '',
      `${sha} ${sha.slice(0, 7)}`,
    ])
    assert.equal(
      view.container.querySelector('.regex-test-preview')?.textContent,
      sample
    )
  })
})
