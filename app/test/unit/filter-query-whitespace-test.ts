/**
 * Whitespace in a search query belongs to the query, not to the trimmer.
 *
 * Both shared filters used to trim before matching, which turned the regex
 * ` +` into the uncompilable `+` and quietly widened a substring search that
 * ended in a deliberate space. Trimming still decides whether the field is
 * empty; it no longer decides what the matcher sees.
 */

import assert from 'node:assert'
import { describe, it } from 'node:test'

import { FilterMode } from '../../src/lib/fuzzy-find'
import { filterByMode } from '../../src/ui/lib/filter-string-list'
import {
  DefaultChangelogFilter,
  filterChangelog,
} from '../../src/lib/changelog/changelog-filter'
import {
  IChangelogEntry,
  IChangelogRelease,
} from '../../src/lib/changelog/changelog-catalog'

const identity = (value: string): ReadonlyArray<string> => [value]

describe('filterByMode with leading or trailing whitespace', () => {
  const lines = [
    'error: disk full',
    'error:disk full',
    'indented    continuation',
    'nospaceshere',
  ]

  it('compiles a regex of a space and a repetition operator', () => {
    const result = filterByMode(lines, identity, ' +', FilterMode.Regex, false)

    assert.strictEqual(
      result.regexError,
      null,
      'a space followed by + is a valid pattern'
    )
    assert.strictEqual(result.filtered, true)
    assert.deepStrictEqual(result.items, [
      'error: disk full',
      'error:disk full',
      'indented    continuation',
    ])
  })

  it('keeps a trailing space out of a substring match', () => {
    const result = filterByMode(
      lines,
      identity,
      'error: ',
      FilterMode.Substring,
      false
    )

    assert.strictEqual(result.filtered, true)
    assert.deepStrictEqual(result.items, ['error: disk full'])
  })

  it('still treats a whitespace-only query as no query at all', () => {
    for (const mode of [
      FilterMode.Fuzzy,
      FilterMode.Substring,
      FilterMode.Regex,
    ]) {
      const result = filterByMode(lines, identity, '   ', mode, false)
      assert.strictEqual(result.filtered, false, mode)
      assert.strictEqual(result.regexError, null, mode)
      assert.deepStrictEqual(result.items, lines, mode)
    }
  })
})

describe('filterChangelog with leading or trailing whitespace', () => {
  const entry = (text: string): IChangelogEntry => ({
    category: 'Fixed',
    text,
    commit: null,
  })

  const releases: ReadonlyArray<IChangelogRelease> = [
    {
      version: '1.0.0',
      date: '2026-01-01',
      time: null,
      entries: [entry('error: disk full')],
    },
    {
      version: '1.0.1',
      date: '2026-02-01',
      time: null,
      entries: [entry('error:disk full')],
    },
    {
      version: '1.0.2',
      date: '2026-03-01',
      time: null,
      entries: [entry('nospaceshere')],
    },
  ]

  it('compiles a regex of a space and a repetition operator', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: ' +',
      mode: FilterMode.Regex,
    })

    assert.strictEqual(result.regexError, null)
    assert.deepStrictEqual(
      result.releases.map(release => release.version),
      ['1.0.0', '1.0.1']
    )
    assert.strictEqual(result.matchedEntryCount, 2)
  })

  it('keeps a trailing space out of a substring match', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: 'error: ',
      mode: FilterMode.Substring,
    })

    assert.deepStrictEqual(
      result.releases.map(release => release.version),
      ['1.0.0']
    )
    assert.strictEqual(result.matchedEntryCount, 1)
  })

  it('still treats a whitespace-only query as no query at all', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: '   ',
      mode: FilterMode.Substring,
    })

    assert.strictEqual(result.regexError, null)
    assert.deepStrictEqual(
      result.releases.map(release => release.version),
      ['1.0.0', '1.0.1', '1.0.2']
    )
    assert.strictEqual(result.matchedEntryCount, 3)
  })
})
