import assert from 'node:assert'
import { describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require_ = createRequire(import.meta.url)

interface IChangelogFile {
  readonly releases: { readonly [version: string]: ReadonlyArray<string> }
}

/** One release as the generated browser catalog stores it. */
interface ICatalogRelease {
  readonly v: string
  /** `null` means no `release-<version>` tag exists, so the date is unrecorded. */
  readonly d: string | null
  readonly e: ReadonlyArray<[string | null, string]>
}

interface ICatalog {
  readonly versionCount: number
  readonly datedCount: number
  readonly unrecordedCount: number
  readonly emptyCount: number
  readonly entryCount: number
  readonly releases: ReadonlyArray<ICatalogRelease>
}

interface ITypedDate {
  readonly status:
    | 'ok'
    | 'empty'
    | 'incomplete'
    | 'short-year'
    | 'unreadable'
    | 'impossible'
  readonly iso: string | null
  readonly raw: string
  readonly order: string
  readonly messageKey: string | null
}

interface IFilterState {
  readonly from?: string | null
  readonly to?: string | null
  readonly query?: string
  readonly mode?: 'plain' | 'regex'
  readonly flags?: string
  readonly includeUndated?: boolean
}

interface IViewRelease {
  readonly version: string
  readonly date: string | null
  readonly entries: ReadonlyArray<{
    readonly category: string | null
    readonly text: string
  }>
  readonly versionMatch: boolean
  readonly hasRecordedChanges: boolean
}

interface IView {
  readonly releases: ReadonlyArray<IViewRelease>
  readonly releaseCount: number
  readonly entryCount: number
  readonly totalReleaseCount: number
  readonly totalEntryCount: number
  readonly undatedCount: number
  readonly undatedHiddenCount: number
  readonly earliest: string | null
  readonly latest: string | null
  readonly patternValid: boolean
  readonly patternError: string | null
  readonly patternDetail: string
}

interface ILabels {
  fixed(key: string, values?: object): string
  tone(key: string): string
}

interface IChangelogApi {
  readonly presetIds: ReadonlyArray<string>
  parseTypedDate(raw: unknown, options?: { order?: string }): ITypedDate
  orderForLocale(locale: string | undefined): string
  presetRange(
    id: string,
    todayIso: string
  ): { from: string | null; to: string | null } | null
  monthMatrix(
    year: number,
    month: number,
    weekStart?: number
  ): ReadonlyArray<
    ReadonlyArray<{ iso: string; day: number; inMonth: boolean }>
  >
  compilePattern(
    query: string,
    mode: string,
    flags?: string
  ): {
    ok: boolean
    empty: boolean
    error: string | null
    detail: string
    matcher: ((subject: string) => boolean) | null
  }
  filterReleases(catalog: ICatalog, state: IFilterState): IView
  labelsFor(lang: string, level: number): ILabels
  exportText(
    view: IView,
    options: { format?: string; labels?: ILabels; exportedAt?: string }
  ): string
  exportFileName(view: IView, extension?: string): string
  describeView(view: IView, labels: ILabels): ReadonlyArray<string>
  escapeRegex(text: string): string
}

const repositoryRoot = process.cwd()

const changelog: IChangelogFile = require_(
  join(repositoryRoot, 'changelog.json')
)

const catalog: ICatalog = require_(
  join(repositoryRoot, 'docs', 'assets', 'site', 'docs-changelog-catalog.js')
)

const Changelog: IChangelogApi = require_(
  join(repositoryRoot, 'docs', 'assets', 'site', 'docs-changelog.js')
)

/**
 * The release dates Git actually holds, read the same way the generator does.
 *
 * An empty map means this checkout carries no `release-*` tags at all — which is
 * what a shallow CI checkout looks like, because `actions/checkout` fetches with
 * `--no-tags` unless asked otherwise. That is a fact about the environment, not
 * about the catalog, so the caller skips rather than reporting 644 failures.
 */
function tagDates(): Map<string, string> {
  let output: string
  try {
    output = execFileSync(
      'git',
      [
        'for-each-ref',
        '--format=%(refname:short)|%(creatordate:short)',
        'refs/tags/release-*',
      ],
      { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 1 << 28 }
    )
  } catch (error) {
    // No Git, or not a repository: the same "this environment holds no tags"
    // situation, reported the same way rather than as a catalog defect.
    return new Map<string, string>()
  }
  const dates = new Map<string, string>()
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    const separator = trimmed.indexOf('|')
    if (trimmed === '' || separator < 0) {
      continue
    }
    const ref = trimmed.slice(0, separator)
    const date = trimmed.slice(separator + 1).trim()
    if (!ref.startsWith('release-') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue
    }
    dates.set(ref.slice('release-'.length), date)
  }
  return dates
}

function labels(): ILabels {
  return Changelog.labelsFor('en', 1)
}

describe('documentation-site changelog catalog', () => {
  it('carries every version in changelog.json, with its entries intact', () => {
    const versions = Object.keys(changelog.releases)
    assert.equal(
      catalog.releases.length,
      versions.length,
      'the catalog must hold one record per changelog.json version'
    )
    assert.equal(catalog.versionCount, versions.length)

    const byVersion = new Map(catalog.releases.map(r => [r.v, r]))
    let entryCount = 0
    for (const version of versions) {
      const release = byVersion.get(version)
      assert.notEqual(
        release,
        undefined,
        `${version} is missing from the catalog`
      )
      const source = changelog.releases[version]
      const record = release as ICatalogRelease
      assert.equal(
        record.e.length,
        source.length,
        `${version} should keep all ${source.length} entries`
      )
      entryCount += source.length
      for (let index = 0; index < source.length; index++) {
        const [category, text] = record.e[index]
        // Round-tripping the split must reproduce the shipped line exactly, so
        // no entry text can be lost or reworded by the generator.
        const rebuilt = category === null ? text : '[' + category + '] ' + text
        assert.equal(rebuilt, source[index].trim(), `${version} entry ${index}`)
      }
    }
    assert.equal(catalog.entryCount, entryCount)
  })

  it('dates a release only from its own release-<version> tag', t => {
    const dates = tagDates()
    if (dates.size === 0) {
      // Nothing here can be proved either way without the tags themselves, and
      // a checkout that fetched none is not evidence that the catalog is wrong.
      // Add `fetch-tags: true` to the workflow's checkout step to restore this
      // check in CI; it runs in full in any checkout that carries the tags.
      t.skip(
        'this checkout carries no release-* tags, so the dates it should be ' +
          'compared against are not present'
      )
      return
    }
    let unrecorded = 0
    for (const release of catalog.releases) {
      const tagged = dates.get(release.v)
      if (release.d === null) {
        unrecorded++
        assert.equal(
          tagged,
          undefined,
          `${release.v} is marked unrecorded but a release tag exists`
        )
        continue
      }
      assert.equal(
        release.d,
        tagged,
        `${release.v} must carry the date from its own tag`
      )
    }
    assert.equal(catalog.unrecordedCount, unrecorded)
    assert.equal(catalog.datedCount, catalog.releases.length - unrecorded)
    assert.ok(
      unrecorded > 0,
      'this repository really does have untagged versions; if that changes, ' +
        'the assertion below about them is what needs revisiting'
    )
  })

  it('says a version has no recorded changes instead of inventing one', () => {
    const emptyVersions = Object.keys(changelog.releases).filter(
      version => changelog.releases[version].length === 0
    )
    assert.equal(catalog.emptyCount, emptyVersions.length)
    for (const version of emptyVersions) {
      const record = catalog.releases.find(r => r.v === version)
      assert.deepEqual(record?.e, [])
    }

    const view = Changelog.filterReleases(catalog, {})
    const empty = view.releases.find(r => r.version === emptyVersions[0])
    assert.equal(empty?.hasRecordedChanges, false)
    const text = Changelog.exportText(view, { labels: labels() })
    assert.ok(
      text.indexOf(labels().fixed('noChanges')) !== -1,
      'the export must state that a version records no changes'
    )
  })
})

describe('documentation-site changelog typed dates', () => {
  it('reads a plain ISO date', () => {
    const parsed = Changelog.parseTypedDate('2026-07-31')
    assert.equal(parsed.status, 'ok')
    assert.equal(parsed.iso, '2026-07-31')
    assert.equal(parsed.raw, '2026-07-31')
    // A year-first date is unambiguous, so slashes are accepted too.
    assert.equal(Changelog.parseTypedDate('2026/07/31').iso, '2026-07-31')
  })

  it('reads the locale order in either direction', () => {
    assert.equal(
      Changelog.parseTypedDate('7/31/2026', { order: 'mdy' }).iso,
      '2026-07-31'
    )
    assert.equal(
      Changelog.parseTypedDate('31/7/2026', { order: 'dmy' }).iso,
      '2026-07-31'
    )
    // The same characters mean different days in the two orders, and each order
    // is honoured rather than sniffed at from the values.
    assert.equal(
      Changelog.parseTypedDate('4/7/2026', { order: 'mdy' }).iso,
      '2026-04-07'
    )
    assert.equal(
      Changelog.parseTypedDate('4/7/2026', { order: 'dmy' }).iso,
      '2026-07-04'
    )
    assert.equal(Changelog.orderForLocale('en-US'), 'mdy')
    assert.equal(Changelog.orderForLocale('en-GB'), 'dmy')
    assert.equal(Changelog.orderForLocale('ja-JP'), 'ymd')
  })

  it('reports partial and unreadable input while keeping the typed text', () => {
    const cases: ReadonlyArray<[string, string, string]> = [
      ['2026', 'incomplete', 'dateIncomplete'],
      ['2026-', 'incomplete', 'dateIncomplete'],
      ['2026-07', 'incomplete', 'dateIncomplete'],
      ['2026-07-', 'incomplete', 'dateIncomplete'],
      ['7/31', 'incomplete', 'dateIncomplete'],
      ['31/7/26', 'short-year', 'dateShortYear'],
      ['last tuesday', 'unreadable', 'dateUnreadable'],
      ['2026-02-30', 'impossible', 'dateImpossible'],
      ['2026-13-01', 'impossible', 'dateImpossible'],
    ]
    for (const [raw, status, messageKey] of cases) {
      const parsed = Changelog.parseTypedDate(raw)
      assert.equal(parsed.status, status, raw)
      assert.equal(parsed.messageKey, messageKey, raw)
      assert.equal(parsed.iso, null, raw)
      // Whatever the reader typed survives the rejection verbatim.
      assert.equal(parsed.raw, raw, raw)
      assert.notEqual(labels().fixed(messageKey), messageKey)
    }
    const blank = Changelog.parseTypedDate('   ')
    assert.equal(blank.status, 'empty')
    assert.equal(blank.messageKey, null)
    assert.equal(blank.raw, '   ')
  })

  it('resolves calendar presets against a supplied today', () => {
    assert.deepEqual(Changelog.presetRange('last30', '2026-07-31'), {
      from: '2026-07-02',
      to: '2026-07-31',
    })
    assert.deepEqual(Changelog.presetRange('thisYear', '2026-07-31'), {
      from: '2026-01-01',
      to: '2026-07-31',
    })
    assert.deepEqual(Changelog.presetRange('lastYear', '2026-07-31'), {
      from: '2025-01-01',
      to: '2025-12-31',
    })
    assert.deepEqual(Changelog.presetRange('all', '2026-07-31'), {
      from: null,
      to: null,
    })
    for (const id of Changelog.presetIds) {
      assert.notEqual(Changelog.presetRange(id, '2026-07-31'), null, id)
    }
  })

  it('builds a rectangular month grid for the calendar', () => {
    const weeks = Changelog.monthMatrix(2026, 2, 1)
    for (const week of weeks) {
      assert.equal(week.length, 7)
    }
    const days = weeks.flat().filter(cell => cell.inMonth)
    assert.equal(days.length, 28)
    assert.equal(days[0].iso, '2026-02-01')
    assert.equal(days[27].iso, '2026-02-28')
    // A leap February is 29 days; nothing here hard-codes month lengths.
    assert.equal(
      Changelog.monthMatrix(2024, 2, 1)
        .flat()
        .filter(cell => cell.inMonth).length,
      29
    )
  })
})

describe('documentation-site changelog filtering', () => {
  const firstDated = catalog.releases.filter(r => r.d !== null)[0]

  it('lists every release when nothing is filtered', () => {
    const view = Changelog.filterReleases(catalog, {})
    assert.equal(view.releaseCount, catalog.versionCount)
    assert.equal(view.entryCount, catalog.entryCount)
    assert.equal(view.undatedCount, catalog.unrecordedCount)
    assert.equal(view.undatedHiddenCount, 0)
  })

  it('composes the date filter with the text search rather than replacing it', () => {
    const search = Changelog.filterReleases(catalog, { query: 'Copilot' })
    assert.ok(search.releaseCount > 0, 'the fixture text must exist to test on')

    const from = '2026-01-01'
    const dated = Changelog.filterReleases(catalog, { from })
    const both = Changelog.filterReleases(catalog, { from, query: 'Copilot' })

    assert.ok(both.releaseCount <= search.releaseCount)
    assert.ok(both.releaseCount <= dated.releaseCount)
    for (const release of both.releases) {
      assert.notEqual(release.date, null)
      assert.ok((release.date as string) >= from)
      const matched = release.entries.some(
        entry => entry.text.toLowerCase().indexOf('copilot') !== -1
      )
      assert.ok(
        matched || release.versionMatch,
        `${release.version} survived the search without a matching entry`
      )
    }
    // The composition is symmetric: adding the date bound to the search gives
    // the same set as adding the search to the date bound.
    assert.deepEqual(
      both.releases.map(r => r.version),
      dated.releases
        .filter(r =>
          r.entries.some(
            entry => entry.text.toLowerCase().indexOf('copilot') !== -1
          )
        )
        .map(r => r.version)
    )
  })

  it('hides releases with an unrecorded date only while a date filter is active, and counts them', () => {
    const filtered = Changelog.filterReleases(catalog, { from: '2020-01-01' })
    assert.equal(filtered.undatedCount, 0)
    assert.equal(filtered.undatedHiddenCount, catalog.unrecordedCount)
    for (const release of filtered.releases) {
      assert.notEqual(release.date, null)
    }

    const included = Changelog.filterReleases(catalog, {
      from: '2020-01-01',
      includeUndated: true,
    })
    assert.equal(included.undatedCount, catalog.unrecordedCount)
    assert.equal(included.undatedHiddenCount, 0)
  })

  it('keeps plain text as the default and treats a pattern as text until regex is switched on', () => {
    const plain = Changelog.filterReleases(catalog, { query: 'lfs.' })
    const regex = Changelog.filterReleases(catalog, {
      query: 'lfs.',
      mode: 'regex',
    })
    assert.ok(
      regex.entryCount > plain.entryCount,
      'in regex mode the dot must match any character, so it matches more'
    )

    // Plain mode never compiles the query, so regex metacharacters are literal.
    const literal = Changelog.filterReleases(catalog, { query: '(' })
    assert.ok(literal.patternValid)
    const compiled = Changelog.compilePattern('(', 'plain')
    assert.equal(compiled.ok, true)
  })

  it('is case-insensitive by default and case-sensitive when the i flag is dropped', () => {
    const insensitive = Changelog.filterReleases(catalog, { query: 'FIXED' })
    const sensitive = Changelog.filterReleases(catalog, {
      query: 'FIXED',
      flags: '',
    })
    assert.ok(insensitive.entryCount > sensitive.entryCount)
  })

  it('reports an invalid regular expression instead of searching for nothing', () => {
    const view = Changelog.filterReleases(catalog, {
      query: '(unclosed',
      mode: 'regex',
    })
    assert.equal(view.patternValid, false)
    assert.equal(view.patternError, 'syntax')
    assert.ok(view.patternDetail.length > 0)
    assert.equal(view.releaseCount, 0)
    // The totals still describe the whole catalog, so the status line can say
    // what was searched even when the pattern could not run.
    assert.equal(view.totalReleaseCount, catalog.versionCount)

    const tooLong = Changelog.filterReleases(catalog, {
      query: 'a'.repeat(500),
      mode: 'regex',
    })
    assert.equal(tooLong.patternValid, false)
    assert.equal(tooLong.patternError, 'too-long')
  })

  it('finds a version by number even when it records no changes', () => {
    const emptyVersion = catalog.releases.filter(r => r.e.length === 0)[0]
    const view = Changelog.filterReleases(catalog, { query: emptyVersion.v })
    const found = view.releases.find(r => r.version === emptyVersion.v)
    assert.notEqual(found, undefined, 'a version match must survive the search')
    assert.equal(found?.versionMatch, true)
    assert.equal(found?.hasRecordedChanges, false)
  })

  it('escapes literal text so the regex builder cannot change its meaning', () => {
    const escaped = Changelog.escapeRegex('lfs.exe (x64)')
    const view = Changelog.filterReleases(catalog, {
      query: escaped,
      mode: 'regex',
    })
    assert.equal(view.patternValid, true)
    assert.equal(view.releaseCount, 0)
  })

  it('has an honest empty state', () => {
    const view = Changelog.filterReleases(catalog, {
      query: 'no release ever said this sentence',
    })
    assert.equal(view.releaseCount, 0)
    assert.equal(view.entryCount, 0)
    assert.equal(view.earliest, null)
    assert.equal(view.latest, null)
    assert.equal(view.patternValid, true)

    const lines = Changelog.describeView(view, labels())
    assert.ok(lines[0].indexOf('Showing 0 of ' + catalog.versionCount) !== -1)
    assert.ok(
      lines.some(line => line === labels().fixed('summaryRangeNone')),
      'the status must say that no release in view has a recorded date'
    )

    const text = Changelog.exportText(view, { labels: labels() })
    assert.ok(text.indexOf(labels().fixed('emptyFacts')) !== -1)
    assert.ok(text.indexOf('## ') === -1, 'nothing may be listed')
  })

  it('narrows to a single release when the range is a single day', () => {
    const day = firstDated.d as string
    const view = Changelog.filterReleases(catalog, { from: day, to: day })
    assert.ok(view.releaseCount >= 1)
    assert.equal(view.earliest, day)
    assert.equal(view.latest, day)
    for (const release of view.releases) {
      assert.equal(release.date, day)
    }
  })
})

describe('documentation-site changelog export', () => {
  it('exports exactly the filtered view and states the range it covers', () => {
    const state: IFilterState = {
      from: '2026-01-01',
      to: '2026-07-31',
      query: 'Copilot',
    }
    const view = Changelog.filterReleases(catalog, state)
    assert.ok(view.releaseCount > 0)

    const text = Changelog.exportText(view, {
      format: 'markdown',
      labels: labels(),
      exportedAt: '2026-07-31T00:00:00.000Z',
    })

    // The header states the counts, the dates present, and both filters.
    assert.ok(
      text.indexOf(
        'Exported view: ' +
          view.releaseCount +
          ' of ' +
          catalog.versionCount +
          ' releases and ' +
          view.entryCount +
          ' of ' +
          catalog.entryCount +
          ' recorded entries.'
      ) !== -1,
      text.slice(0, 400)
    )
    assert.ok(
      text.indexOf(
        'Release dates in this export: ' +
          view.earliest +
          ' to ' +
          view.latest +
          '.'
      ) !== -1
    )
    assert.ok(text.indexOf('Date filter: 2026-01-01 to 2026-07-31.') !== -1)
    assert.ok(
      text.indexOf('Search: plain text “Copilot”, case-insensitive.') !== -1
    )
    assert.ok(text.indexOf('Exported: 2026-07-31T00:00:00.000Z') !== -1)

    // Every listed release, and only those, appear as headings.
    const headings = text.split('\n').filter(line => line.indexOf('## ') === 0)
    assert.equal(headings.length, view.releaseCount)
    for (let index = 0; index < view.releases.length; index++) {
      const release = view.releases[index]
      assert.equal(
        headings[index],
        '## ' + release.version + ' — ' + (release.date as string)
      )
      for (const entry of release.entries) {
        assert.ok(
          text.indexOf(entry.text) !== -1,
          `${release.version} entry text must appear verbatim`
        )
      }
    }
    // A release excluded by the filter must not leak into the file.
    const excluded = catalog.releases.find(
      r => r.d !== null && (r.d as string) < '2026-01-01' && r.e.length > 0
    )
    assert.ok(excluded !== undefined)
    assert.equal(
      text.indexOf('## ' + (excluded as ICatalogRelease).v + ' —'),
      -1
    )
  })

  it('names the unrecorded date rather than leaving a gap', () => {
    const view = Changelog.filterReleases(catalog, { query: '2.3.0-test2' })
    const release = view.releases.find(r => r.version === '2.3.0-test2')
    assert.notEqual(release, undefined)
    assert.equal(release?.date, null)
    const text = Changelog.exportText(view, { labels: labels() })
    assert.ok(
      text.indexOf('## 2.3.0-test2 — ' + labels().fixed('dateUnrecorded')) !==
        -1,
      text.slice(0, 400)
    )
  })

  it('describes a regular-expression search as a pattern, not as text', () => {
    const view = Changelog.filterReleases(catalog, {
      query: 'copilot|codespaces',
      mode: 'regex',
      flags: 'i',
    })
    const text = Changelog.exportText(view, { labels: labels() })
    assert.ok(
      text.indexOf('Search: regular expression /copilot|codespaces/i.') !== -1
    )
  })

  it('offers a plain-text form for the clipboard with the same header', () => {
    const view = Changelog.filterReleases(catalog, { query: 'Copilot' })
    const markdown = Changelog.exportText(view, {
      format: 'markdown',
      labels: labels(),
    })
    const plain = Changelog.exportText(view, {
      format: 'text',
      labels: labels(),
    })
    assert.ok(markdown.indexOf('# Desktop Material changelog') === 0)
    assert.ok(plain.indexOf('Desktop Material changelog') === 0)
    assert.ok(plain.indexOf('## ') === -1)
    assert.ok(plain.indexOf('- [Fixed] ') !== -1)

    // The copied text must claim the same facts the on-screen status claims:
    // the same counts, the same date span, and the same unrecorded-date note.
    const status = Changelog.describeView(view, labels()).join('\n')
    for (const fact of [
      String(view.releaseCount),
      String(view.entryCount),
      view.earliest as string,
      view.latest as string,
    ]) {
      assert.ok(status.indexOf(fact) !== -1, 'status must state ' + fact)
      assert.ok(plain.indexOf(fact) !== -1, 'copied text must state ' + fact)
    }
    if (view.undatedCount > 0) {
      const note = labels().fixed('summaryUndated', {
        count: view.undatedCount,
      })
      assert.ok(status.indexOf(note) !== -1)
      assert.ok(plain.indexOf(note) !== -1)
    }
  })

  it('names the exported file after the range inside it', () => {
    const view = Changelog.filterReleases(catalog, {
      from: '2026-01-01',
      to: '2026-07-31',
    })
    assert.equal(
      Changelog.exportFileName(view),
      'desktop-material-changelog-' + view.earliest + '_' + view.latest + '.md'
    )
    const undated = Changelog.filterReleases(catalog, {
      query: '2.3.0-test2',
    })
    assert.equal(
      Changelog.exportFileName(undated),
      'desktop-material-changelog-dates-unrecorded.md'
    )
  })
})

describe('documentation-site changelog localization', () => {
  it('styles the tone by level while every fact stays fixed', () => {
    for (const lang of ['en', 'yue']) {
      const serious = Changelog.labelsFor(lang, 1)
      const playful = Changelog.labelsFor(lang, 5)
      assert.notEqual(serious.tone('heading'), playful.tone('heading'))
      assert.notEqual(serious.tone('blurb'), playful.tone('blurb'))
      assert.notEqual(serious.tone('emptyLead'), playful.tone('emptyLead'))
      // Facts — dates, counts, categories, errors — never move with the level.
      for (const key of [
        'dateUnrecorded',
        'noChanges',
        'emptyFacts',
        'dateImpossible',
        'summary',
        'exportSource',
      ]) {
        assert.equal(serious.fixed(key), playful.fixed(key), lang + ' ' + key)
      }
    }
  })

  it('renders the same release facts in either language', () => {
    const view = Changelog.filterReleases(catalog, { query: '2.3.0-test2' })
    const release = view.releases[0]
    for (const lang of ['en', 'yue']) {
      for (const level of [1, 5]) {
        const text = Changelog.exportText(view, {
          labels: Changelog.labelsFor(lang, level),
        })
        assert.ok(text.indexOf(release.version) !== -1)
        assert.ok(
          text.indexOf(
            Changelog.labelsFor(lang, level).fixed('dateUnrecorded')
          ) !== -1
        )
      }
    }
  })
})
