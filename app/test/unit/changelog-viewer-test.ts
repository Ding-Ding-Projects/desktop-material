/**
 * The in-app changelog viewer's data, filtering, dates and export.
 *
 * The catalog is asserted against `changelog.json` itself rather than against a
 * fixture, because the whole point of reading that file directly is that the
 * app and the documentation site cannot disagree about what a release said. A
 * fixture would pass while the real thing drifted.
 */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'

import {
  ChangelogCategories,
  ChangelogReleases,
  ChangelogSummary,
  splitChangelogEntry,
} from '../../src/lib/changelog/changelog-catalog'
import {
  DefaultChangelogFilter,
  filterChangelog,
  isEmptyChangelogFilter,
} from '../../src/lib/changelog/changelog-filter'
import {
  formatIsoDate,
  matchDateRangePreset,
  normalizeDateRange,
  parseTypedDate,
  resolveDateRangePreset,
} from '../../src/lib/changelog/changelog-dates'
import {
  exportChangelogAsMarkdown,
  exportChangelogAsText,
  formatExportStamp,
  getChangelogExportFileName,
  IChangelogExportContext,
} from '../../src/lib/changelog/changelog-export'
import { FilterMode } from '../../src/lib/fuzzy-find'

const require_ = createRequire(import.meta.url)
const changelog = require_('../../../changelog.json') as {
  readonly releases: Record<string, ReadonlyArray<string>>
}

describe('changelog catalog', () => {
  it('covers every release in changelog.json, in the authored order', () => {
    const authored = Object.keys(changelog.releases)
    assert.equal(ChangelogReleases.length, authored.length)
    assert.deepEqual(
      ChangelogReleases.map(release => release.version),
      authored,
      'the viewer must not reorder the history'
    )
    assert.ok(authored.length > 600, 'sanity: this history is large')
  })

  it('keeps every entry, with its category split off', () => {
    let counted = 0
    for (const release of ChangelogReleases) {
      const source = changelog.releases[release.version]
      assert.equal(release.entries.length, source.length, release.version)
      counted += release.entries.length
    }
    assert.equal(counted, ChangelogSummary.entryCount)
  })

  it('never invents a date', () => {
    for (const release of ChangelogReleases) {
      if (release.date === null) {
        // A release with no tag has no time either; a time beside an unknown
        // date would be a fact from nowhere.
        assert.equal(release.time, null, release.version)
        continue
      }
      assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, release.version)
    }
    assert.equal(
      ChangelogSummary.datedCount + ChangelogSummary.unrecordedCount,
      ChangelogSummary.versionCount
    )
    assert.ok(
      ChangelogSummary.unrecordedCount > 0,
      'this repository genuinely has untagged releases; the test should see them'
    )
  })

  it('states every time in 24-hour form', () => {
    for (const release of ChangelogReleases) {
      if (release.time === null) {
        continue
      }
      assert.match(release.time, /^([01]\d|2[0-3]):[0-5]\d$/, release.version)
      // No locale AM/PM form may survive anywhere in the stamp.
      assert.doesNotMatch(release.time, /[APM]/i, release.version)
    }
  })

  it('splits a category prefix without eating the text', () => {
    // `#1` is an issue reference, not a commit, so the trailing text stays put
    // and `commit` reports null rather than a made-up SHA.
    assert.deepEqual(splitChangelogEntry('[Fixed] A thing broke - #1'), {
      category: 'Fixed',
      text: 'A thing broke - #1',
      commit: null,
    })
    // Entries with no prefix keep a null category rather than a made-up one.
    assert.deepEqual(splitChangelogEntry('Plain entry'), {
      category: null,
      text: 'Plain entry',
      commit: null,
    })
    // A bracket later in the line is not a category.
    assert.deepEqual(splitChangelogEntry('Fixed [maybe] later'), {
      category: null,
      text: 'Fixed [maybe] later',
      commit: null,
    })
  })

  it('derives its categories from the entries, commonest first', () => {
    assert.ok(ChangelogCategories.length > 1)
    for (let index = 1; index < ChangelogCategories.length; index++) {
      assert.ok(
        ChangelogCategories[index - 1].count >= ChangelogCategories[index].count
      )
    }
    const total = ChangelogCategories.reduce(
      (sum, entry) => sum + entry.count,
      0
    )
    assert.equal(total, ChangelogSummary.entryCount)
  })
})

describe('changelog filtering', () => {
  const releases = [
    {
      version: '2.0.0',
      date: '2026-03-10',
      time: '09:30',
      entries: [
        { category: 'Fixed', text: 'Stop the crash on launch', commit: null },
        { category: 'Added', text: 'A regex builder', commit: null },
      ],
    },
    {
      version: '1.9.0',
      date: '2026-01-05',
      time: '17:45',
      entries: [
        { category: 'Fixed', text: 'Repair the date picker', commit: null },
      ],
    },
    {
      version: '1.8.0-beta1',
      date: null,
      time: null,
      entries: [
        { category: null, text: 'An uncategorized change', commit: null },
      ],
    },
  ]

  it('returns everything when nothing is set', () => {
    const result = filterChangelog(releases, DefaultChangelogFilter)
    assert.equal(result.releases.length, 3)
    assert.equal(result.matchedEntryCount, 4)
    assert.ok(isEmptyChangelogFilter(DefaultChangelogFilter))
  })

  it('shows only the entries that matched, not the whole release', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: 'crash',
    })
    assert.equal(result.releases.length, 1)
    assert.equal(result.releases[0].version, '2.0.0')
    assert.equal(result.releases[0].entries.length, 1)
  })

  it('keeps a whole release when the version itself matched', () => {
    // "1.9.0" is a request for that release, not for a line inside it.
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: '1.9.0',
    })
    assert.equal(result.releases.length, 1)
    assert.equal(result.releases[0].entries.length, 1)
  })

  it('composes search with category rather than overriding it', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: 'the',
      categories: ['Added'],
    })
    assert.equal(result.matchedEntryCount, 0, 'no Added entry says "the"')

    const both = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: 'the',
      categories: ['Fixed'],
    })
    assert.equal(both.matchedEntryCount, 2)
  })

  it('filters the real uncategorized bucket', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      categories: [null],
    })
    assert.equal(result.releases.length, 1)
    assert.equal(result.releases[0].version, '1.8.0-beta1')
  })

  it('excludes undated releases from a range and says how many', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      from: '2026-01-01',
      to: '2026-12-31',
    })
    assert.deepEqual(
      result.releases.map(release => release.version),
      ['2.0.0', '1.9.0']
    )
    // The count is the whole point: an unexplained disappearance reads as a bug.
    assert.equal(result.hiddenUndatedCount, 1)
  })

  it('keeps undated releases when asked to', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      from: '2026-01-01',
      to: '2026-12-31',
      includeUndated: true,
    })
    assert.equal(result.releases.length, 3)
    assert.equal(result.hiddenUndatedCount, 0)
  })

  it('treats both bounds as inclusive', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      from: '2026-01-05',
      to: '2026-03-10',
    })
    assert.equal(result.releases.length, 2)
  })

  it('stays usable while a regex is still being typed', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      mode: FilterMode.Regex,
      query: '(unclosed',
    })
    assert.ok(result.regexError !== null, 'the error must be reported')
    // matchWithMode passes everything through on an invalid pattern, so the
    // list does not empty out under the user mid-keystroke.
    assert.ok(result.releases.length > 0)
  })

  it('applies a valid regex', () => {
    const result = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      mode: FilterMode.Regex,
      query: '^Repair',
    })
    assert.equal(result.matchedEntryCount, 1)
    assert.equal(result.regexError, null)
  })

  it('honours case sensitivity', () => {
    const sensitive = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: 'STOP',
      caseSensitive: true,
    })
    assert.equal(sensitive.matchedEntryCount, 0)

    const insensitive = filterChangelog(releases, {
      ...DefaultChangelogFilter,
      query: 'STOP',
      caseSensitive: false,
    })
    assert.equal(insensitive.matchedEntryCount, 1)
  })

  it('runs over the real history without falling over', () => {
    const result = filterChangelog(ChangelogReleases, {
      ...DefaultChangelogFilter,
      query: 'regex',
    })
    assert.ok(result.releases.length > 0)
    assert.ok(result.matchedEntryCount > 0)
  })
})

describe('typed dates', () => {
  it('accepts ISO in every locale', () => {
    assert.deepEqual(parseTypedDate('2026-07-31', 'en'), {
      kind: 'valid',
      iso: '2026-07-31',
    })
    assert.deepEqual(parseTypedDate('2026-7-1', 'zh-HK'), {
      kind: 'valid',
      iso: '2026-07-01',
    })
  })

  it('reads a bare numeric date in the locale order', () => {
    // The same eight characters mean different days in the two locales, which
    // is exactly why the field states the order it is using.
    assert.deepEqual(parseTypedDate('3/4/2026', 'en'), {
      kind: 'valid',
      iso: '2026-03-04',
    })
    assert.deepEqual(parseTypedDate('3/4/2026', 'zh-HK'), {
      kind: 'valid',
      iso: '2026-04-03',
    })
  })

  it('accepts the Han form a Hong Kong reader types', () => {
    assert.deepEqual(parseTypedDate('2026年7月31日', 'zh-HK'), {
      kind: 'valid',
      iso: '2026-07-31',
    })
  })

  it('rejects a day the calendar does not have', () => {
    // new Date(2026, 1, 30) silently becomes 2 March, so this must be checked
    // rather than trusted.
    assert.deepEqual(parseTypedDate('2026-02-30'), {
      kind: 'invalid',
      reason: 'outOfRange',
    })
    assert.deepEqual(parseTypedDate('2026-13-01'), {
      kind: 'invalid',
      reason: 'outOfRange',
    })
  })

  it('calls a half-typed date incomplete rather than wrong', () => {
    assert.deepEqual(parseTypedDate('2026-0'), {
      kind: 'invalid',
      reason: 'incomplete',
    })
    assert.deepEqual(parseTypedDate('not a date'), {
      kind: 'invalid',
      reason: 'unrecognized',
    })
  })

  it('refuses a two-digit year instead of guessing the century', () => {
    assert.deepEqual(parseTypedDate('3/4/26', 'en'), {
      kind: 'invalid',
      reason: 'unrecognized',
    })
  })

  it('treats an empty field as empty, not invalid', () => {
    assert.deepEqual(parseTypedDate('   '), { kind: 'empty' })
  })

  it('formats a date the way each locale writes it', () => {
    assert.equal(formatIsoDate('2026-07-31', 'en'), '7/31/2026')
    assert.equal(formatIsoDate('2026-07-31', 'zh-HK'), '2026年7月31日')
  })
})

describe('date range presets', () => {
  // A Tuesday, chosen so the week-spanning presets cross a month boundary.
  const today = new Date(2026, 6, 31)

  it('makes "last 7 days" span seven days including today', () => {
    assert.deepEqual(resolveDateRangePreset('last7', today), {
      from: '2026-07-25',
      to: '2026-07-31',
    })
  })

  it('resolves the year presets against the given clock only', () => {
    assert.deepEqual(resolveDateRangePreset('thisYear', today), {
      from: '2026-01-01',
      to: '2026-07-31',
    })
    assert.deepEqual(resolveDateRangePreset('lastYear', today), {
      from: '2025-01-01',
      to: '2025-12-31',
    })
  })

  it('recognises a range it produced, and only that', () => {
    assert.equal(
      matchDateRangePreset({ from: '2026-01-01', to: '2026-07-31' }, today),
      'thisYear'
    )
    assert.equal(
      matchDateRangePreset({ from: '2026-01-02', to: '2026-07-31' }, today),
      null
    )
    assert.equal(matchDateRangePreset({ from: null, to: null }, today), 'all')
  })

  it('puts a backwards range the right way round', () => {
    assert.deepEqual(
      normalizeDateRange({ from: '2026-07-31', to: '2026-01-01' }),
      { from: '2026-01-01', to: '2026-07-31' }
    )
    // An open-ended range is left exactly as it is.
    assert.deepEqual(normalizeDateRange({ from: '2026-07-31', to: null }), {
      from: '2026-07-31',
      to: null,
    })
  })
})

describe('changelog export', () => {
  const linkedCommit = '0123456789abcdef0123456789abcdef01234567'
  const releases = [
    {
      version: '2.0.0',
      date: '2026-03-10',
      time: '09:30',
      entries: [
        { category: 'Fixed', text: 'Stop the crash', commit: linkedCommit },
      ],
    },
    {
      version: '1.8.0-beta1',
      date: null,
      time: null,
      entries: [
        { category: null, text: 'An older change', commit: null },
      ],
    },
  ]

  const context: IChangelogExportContext = {
    filter: {
      ...DefaultChangelogFilter,
      query: 'crash',
      categories: ['Fixed'],
      from: '2026-01-01',
      to: '2026-12-31',
    },
    totalReleaseCount: 683,
    hiddenUndatedCount: 4,
    appVersion: '3.6.3-beta3',
    exportedAt: '2026-07-31 14:22',
  }

  it('states the filter the export was taken under', () => {
    const markdown = exportChangelogAsMarkdown(releases, context)
    assert.match(markdown, /2 of 683 releases/)
    assert.match(markdown, /Search: "crash" \(substring, case insensitive\)/)
    assert.match(markdown, /Categories: Fixed/)
    assert.match(markdown, /Dates: 2026-01-01 to 2026-12-31/)
    // The exclusion is carried into the file, not left behind in the window.
    assert.match(markdown, /4 release\(s\) omitted/)
  })

  it('says so out loud when nothing was filtered', () => {
    const markdown = exportChangelogAsMarkdown(releases, {
      ...context,
      filter: DefaultChangelogFilter,
      hiddenUndatedCount: 0,
    })
    assert.match(markdown, /complete recorded history/)
  })

  it('exports what is shown, including the unrecorded date', () => {
    const markdown = exportChangelogAsMarkdown(releases, context)
    assert.match(markdown, /## 2\.0\.0 — 2026-03-10 09:30/)
    assert.match(markdown, /## 1\.8\.0-beta1 — date unrecorded/)
    assert.match(markdown, /- \*\*Fixed\*\* — Stop the crash/)
    assert.match(
      markdown,
      new RegExp(
        `Commit: \\[${linkedCommit}\\]\\(https://github\\.com/Ding-Ding-Projects/desktop-material/commit/${linkedCommit}\\)`
      )
    )
    assert.match(
      markdown,
      /Commit: not recorded \(no commit SHA is available for this changelog entry\)\./
    )
  })

  it('renders plain text with the same facts', () => {
    const text = exportChangelogAsText(releases, context)
    assert.match(text, /2\.0\.0 — 2026-03-10 09:30/)
    assert.match(text, /\[Fixed\] Stop the crash/)
    assert.match(
      text,
      new RegExp(
        `Commit: ${linkedCommit} \\(https://github\\.com/Ding-Ding-Projects/desktop-material/commit/${linkedCommit}\\)`
      )
    )
    assert.match(
      text,
      /Commit: not recorded \(no commit SHA is available for this changelog entry\)\./
    )
    assert.doesNotMatch(text, /\*\*/, 'plain text carries no Markdown emphasis')
  })

  it('is honest about an empty result', () => {
    const markdown = exportChangelogAsMarkdown([], context)
    assert.match(markdown, /Nothing matched the current filters/)
    assert.match(markdown, /0 of 683 releases/)
  })

  it('names the file after the moment it was taken', () => {
    assert.equal(
      getChangelogExportFileName(context, 'markdown'),
      'desktop-material-changelog-2026-07-31-14-22.md'
    )
    assert.equal(
      getChangelogExportFileName(context, 'text'),
      'desktop-material-changelog-2026-07-31-14-22.txt'
    )
  })

  it('stamps exports in 24-hour local time', () => {
    assert.equal(
      formatExportStamp(new Date(2026, 6, 31, 14, 22)),
      '2026-07-31 14:22'
    )
    // Afternoon must not come back as 02:22.
    assert.equal(
      formatExportStamp(new Date(2026, 0, 5, 23, 5)),
      '2026-01-05 23:05'
    )
  })
})
