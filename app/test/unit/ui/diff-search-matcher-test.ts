import assert from 'node:assert'
import { describe, it } from 'node:test'

import { FilterMode, IFilterOptions } from '../../../src/lib/fuzzy-find'
import { MaxRegexPatternLength } from '../../../src/lib/safe-regex'
import { DiffSearchMatcher } from '../../../src/ui/diff/diff-search-matcher'

function compile(
  query: string,
  options: IFilterOptions,
  maximumMatches: number = 5000
) {
  const compilation = DiffSearchMatcher.compile(query, options, maximumMatches)
  if (compilation.kind === 'error') {
    assert.fail(compilation.message)
  }
  return compilation.matcher
}

describe('DiffSearchMatcher', () => {
  it('matches literal queries beyond the regex pattern cap in both modes', () => {
    const lowerQuery = 'a'.repeat(MaxRegexPatternLength + 1)
    const upperQuery = lowerQuery.toUpperCase()

    const fuzzy = compile(upperQuery, {
      mode: FilterMode.Fuzzy,
      caseSensitive: true,
    }).find(`prefix-${lowerQuery}-suffix`)
    assert.deepStrictEqual(fuzzy, {
      kind: 'success',
      matches: [{ index: 7, length: lowerQuery.length }],
      truncated: false,
    })

    const substring = compile(lowerQuery, {
      mode: FilterMode.Substring,
      caseSensitive: true,
    }).find(`prefix-${lowerQuery}-suffix`)
    assert.deepStrictEqual(substring, {
      kind: 'success',
      matches: [{ index: 7, length: lowerQuery.length }],
      truncated: false,
    })
  })

  it('keeps the regex pattern-length guard', () => {
    const compilation = DiffSearchMatcher.compile(
      'a'.repeat(MaxRegexPatternLength + 1),
      { mode: FilterMode.Regex, caseSensitive: true },
      5000
    )
    assert.equal(compilation.kind, 'error')
  })

  it('shares the allowance across lines and counts discarded zero-width matches', () => {
    const matcher = compile(
      '^',
      { mode: FilterMode.Regex, caseSensitive: true },
      2
    )

    assert.deepStrictEqual(matcher.find('first line'), {
      kind: 'success',
      matches: [],
      truncated: false,
    })
    assert.deepStrictEqual(matcher.find('second line'), {
      kind: 'success',
      matches: [],
      truncated: false,
    })
    assert.deepStrictEqual(matcher.find('third line'), {
      kind: 'success',
      matches: [],
      truncated: true,
    })
  })

  it('shares one capture-work allowance across diff columns', () => {
    const captureHeavyPattern = '(a)'.repeat(100)
    const matcher = compile(captureHeavyPattern, {
      mode: FilterMode.Regex,
      caseSensitive: true,
    })

    const before = matcher.find('a'.repeat(30_000))
    if (before.kind === 'error') {
      assert.fail(before.message)
    }
    assert.equal(before.matches.length, 300)
    assert.equal(before.truncated, false)

    const after = matcher.find('a'.repeat(20_100))
    if (after.kind === 'error') {
      assert.fail(after.message)
    }
    assert.equal(after.matches.length, 200)
    assert.equal(after.truncated, true)
  })
})
