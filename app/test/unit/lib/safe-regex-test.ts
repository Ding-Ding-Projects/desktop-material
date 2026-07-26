import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  compileSafeRegex,
  getRegexInputLengthError,
  MaxRegexInputLength,
  MaxRegexCapturePreviews,
  MaxRegexCaptureWork,
  MaxRegexMatchCount,
  MaxRegexPatternLength,
  MaxRegexTotalInputLength,
  SafeRegexDialect,
} from '../../../src/lib/safe-regex'

function compile(pattern: string, caseSensitive = true) {
  const result = compileSafeRegex(pattern, caseSensitive)
  assert.equal(result.error, null)
  assert.notEqual(result.regex, null)
  return result.regex!
}

describe('safe RE2 regex', () => {
  it('evaluates a catastrophic-backtracking shape within a bounded time', () => {
    const regex = compile('^(a+)+$')
    const input = `${'a'.repeat(26)}!`
    const startedAt = performance.now()

    assert.equal(regex.test(input), false)
    assert.ok(
      performance.now() - startedAt < 750,
      'the linear-time engine must not fall back to native backtracking'
    )
  })

  it('rejects malformed and unsupported constructs consistently', () => {
    for (const pattern of ['(', '(?=ahead)', '(a)\\1']) {
      const result = compileSafeRegex(pattern, true)
      assert.equal(
        result.regex,
        null,
        `${pattern} is outside ${SafeRegexDialect}`
      )
      assert.notEqual(result.error, null)
    }
  })

  it('matches Unicode and reports UTF-16 indices for renderer slicing', () => {
    const regex = compile('\\p{Greek}+')
    const result = regex.findAll('A😀Ωμέγα')

    assert.equal(result.truncated, false)
    assert.deepEqual(
      result.matches.map(match => match.text),
      ['Ωμέγα']
    )
    assert.deepEqual(
      result.matches.map(match => match.index),
      [3]
    )
  })

  it('uses whole-candidate anchors while accepting multiline input', () => {
    assert.equal(compile('^beta$').test('alpha\nbeta'), false)
    assert.equal(compile('alpha\\nbeta').test('alpha\nbeta'), true)
  })

  it('enumerates zero-width matches without looping', () => {
    const result = compile('a*').findAll('bb')

    assert.equal(result.truncated, false)
    assert.deepEqual(
      result.matches.map(match => match.index),
      [0, 1, 2]
    )
    assert.deepEqual(
      result.matches.map(match => match.text),
      ['', '', '']
    )
  })

  it('returns numbered and named capture groups', () => {
    const result = compile('(foo)-(?<word>bar)(baz)?').findAll(
      'foo-bar',
      MaxRegexMatchCount,
      true
    )

    assert.equal(result.matches.length, 1)
    assert.deepEqual(
      result.matches[0].groups.map(capture => capture.value),
      ['foo', 'bar', null]
    )
    assert.deepEqual(result.matches[0].namedGroups.word, {
      value: 'bar',
      originalLength: 3,
    })
  })

  it('honours case sensitivity', () => {
    assert.equal(compile('desktop', true).test('Desktop'), false)
    assert.equal(compile('desktop', false).test('Desktop'), true)
  })

  it('bounds patterns, individual inputs, and aggregate inputs', () => {
    assert.equal(
      compileSafeRegex('a'.repeat(MaxRegexPatternLength + 1), true).regex,
      null
    )
    assert.equal(getRegexInputLengthError(MaxRegexInputLength), null)
    assert.notEqual(getRegexInputLengthError(MaxRegexInputLength + 1), null)
    assert.equal(
      getRegexInputLengthError(
        MaxRegexTotalInputLength,
        MaxRegexTotalInputLength
      ),
      null
    )
    assert.notEqual(
      getRegexInputLengthError(
        MaxRegexTotalInputLength + 1,
        MaxRegexTotalInputLength
      ),
      null
    )
  })

  it('bounds match enumeration', () => {
    const result = compile('.').findAll('abcdef', 2)
    assert.deepEqual(
      result.matches.map(match => match.text),
      ['a', 'b']
    )
    assert.equal(result.truncated, true)
  })

  it('bounds aggregate capture work to the first match preview', () => {
    const pattern = '()'.repeat(500)
    const regex = compile(pattern)
    assert.equal(
      regex.getMaximumMatchCount(MaxRegexMatchCount),
      MaxRegexCaptureWork / 500
    )
    const result = regex.findAll(
      'x'.repeat(MaxRegexInputLength),
      MaxRegexMatchCount,
      true
    )

    assert.equal(result.matches.length, MaxRegexCaptureWork / 500)
    assert.equal(result.truncated, true)
    assert.equal(result.matches[0].groups.length, MaxRegexCapturePreviews)
    assert.equal(
      result.matches[0].capturesOmitted,
      500 - MaxRegexCapturePreviews
    )
    assert.equal(
      result.matches
        .slice(1)
        .reduce((sum, match) => sum + match.groups.length, 0),
      0
    )
  })

  it('keeps every audited user-authored path on the shared dialect', () => {
    const root = process.cwd()
    const actions = readFileSync(
      join(root, 'app/src/ui/actions/actions-view.tsx'),
      'utf8'
    )
    const automations = readFileSync(
      join(
        root,
        'app/src/lib/notifications/automation/notification-automation.ts'
      ),
      'utf8'
    )

    assert.match(actions, /matchWithMode/)
    assert.match(automations, /compileSafeRegex/)
    for (const source of [actions, automations]) {
      assert.doesNotMatch(source, /new RegExp\(/)
    }
  })
})
