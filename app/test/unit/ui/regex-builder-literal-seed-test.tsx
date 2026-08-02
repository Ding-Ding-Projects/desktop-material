import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { FilterMode } from '../../../src/lib/fuzzy-find'
import { compileSafeRegex } from '../../../src/lib/safe-regex'
import {
  FilterModeControl,
  seedRegexBuilderPattern,
} from '../../../src/ui/lib/filter-mode-control'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const Items: ReadonlyArray<string> = [
  'feature (WIP) rebuild',
  'WIP without brackets',
  'c++ interop notes',
]

interface IApplied {
  readonly pattern: string
  readonly caseSensitive: boolean
}

function openBuilder(mode: FilterMode, filterText: string) {
  const applied = new Array<IApplied>()
  const modes = new Array<FilterMode>()

  render(
    <FilterModeControl
      searchSurfaceId="test.surface"
      mode={mode}
      caseSensitive={true}
      onModeChange={m => modes.push(m)}
      onCaseSensitiveChange={() => {}}
      regexBuilderTarget="Items"
      getSampleItems={() => Items}
      filterText={filterText}
      onRegexPatternApply={(pattern, caseSensitive) =>
        applied.push({ pattern, caseSensitive })
      }
    />
  )

  fireEvent.click(screen.getByLabelText('Open regex builder'))

  return {
    applied,
    modes,
    patternInput: screen.getByLabelText(
      'Regular expression pattern'
    ) as HTMLInputElement,
    applyButton: screen.getByLabelText('Apply to Items') as HTMLButtonElement,
  }
}

/** The items a plain substring query would have selected. */
function substringMatches(query: string) {
  return Items.filter(item => item.includes(query))
}

/** The items the applied regex pattern selects once the surface switches. */
function regexMatches(pattern: string) {
  const { regex, error } = compileSafeRegex(pattern, true)
  assert.equal(error, null, `pattern ${pattern} must compile`)
  return Items.filter(item => regex!.test(item))
}

describe('seeding the regex builder from a filter query', () => {
  it('escapes a query written for a non-regex mode', () => {
    assert.equal(
      seedRegexBuilderPattern(FilterMode.Substring, '(WIP)'),
      '\\(WIP\\)'
    )
    assert.equal(seedRegexBuilderPattern(FilterMode.Fuzzy, 'c++'), 'c\\+\\+')
  })

  it('leaves a query already written as a pattern alone', () => {
    const pattern = '^feature/.*\\d+$'
    assert.equal(
      seedRegexBuilderPattern(FilterMode.Regex, pattern),
      pattern,
      'a regex-mode query must not be escaped a second time'
    )
  })

  it('keeps a metacharacter query matching the same items end to end', () => {
    const { applied, patternInput, applyButton } = openBuilder(
      FilterMode.Substring,
      '(WIP)'
    )

    assert.equal(patternInput.value, '\\(WIP\\)')
    assert.equal(applyButton.disabled, false)

    fireEvent.click(applyButton)
    assert.equal(applied.length, 1)
    assert.equal(applied[0].pattern, '\\(WIP\\)')

    // The whole point: switching to regex mode must not quietly redefine the
    // search. Seeded raw, `(WIP)` is a capture group that also selects the item
    // with no brackets at all.
    assert.deepEqual(
      regexMatches(applied[0].pattern),
      substringMatches('(WIP)')
    )
    assert.deepEqual(regexMatches('(WIP)'), [
      'feature (WIP) rebuild',
      'WIP without brackets',
    ])
  })

  it('does not present a working plain-text query as broken', () => {
    const { patternInput, applyButton } = openBuilder(
      FilterMode.Substring,
      'c++'
    )

    assert.equal(patternInput.value, 'c\\+\\+')
    assert.equal(applyButton.disabled, false)
    assert.equal(screen.queryByRole('alert'), null)
    assert.deepEqual(regexMatches(patternInput.value), substringMatches('c++'))
  })

  it('seeds a regex-mode query verbatim', () => {
    const { patternInput } = openBuilder(FilterMode.Regex, '^feature/.*')

    assert.equal(patternInput.value, '^feature/.*')
  })
})

describe('the palette literal-text composer', () => {
  it('inserts typed text escaped so it matches itself', () => {
    const { patternInput } = openBuilder(FilterMode.Substring, '')

    fireEvent.click(screen.getByLabelText('Literal text'))
    fireEvent.change(screen.getByLabelText('Text to match exactly'), {
      target: { value: 'a.b (x)' },
    })
    fireEvent.click(screen.getByLabelText('Insert as literal'))

    assert.equal(patternInput.value, 'a\\.b \\(x\\)')

    const { regex, error } = compileSafeRegex(patternInput.value, true)
    assert.equal(error, null)
    assert.equal(regex!.test('a.b (x)'), true)
    assert.equal(regex!.test('axb (x)'), false)
  })
})
