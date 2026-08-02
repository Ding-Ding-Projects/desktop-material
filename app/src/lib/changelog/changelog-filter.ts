/**
 * Narrowing the release history: text search, category, and date range.
 *
 * Kept out of the view so the awkward parts are testable on their own — the
 * three filters composing rather than overriding one another, an invalid
 * pattern leaving the list usable, and undated releases being *reported*
 * excluded rather than silently vanishing when a date range is applied.
 */

import { FilterMode, matchWithMode } from '../fuzzy-find'
import { IChangelogEntry, IChangelogRelease } from './changelog-catalog'

/** Everything the viewer narrows by. */
export interface IChangelogFilter {
  /** Free text over entry text, category, and version. */
  readonly query: string
  readonly mode: FilterMode
  readonly caseSensitive: boolean
  /**
   * Categories to keep. Empty means every category — not "none", which is why
   * this is not modelled as a set the UI has to pre-fill.
   *
   * `null` is a real member: it is the bucket for entries that ship with no
   * `[Category]` prefix.
   */
  readonly categories: ReadonlyArray<string | null>
  /** Inclusive `YYYY-MM-DD` bounds; null means unbounded on that side. */
  readonly from: string | null
  readonly to: string | null
  /**
   * Whether releases with no recorded date survive a date range.
   *
   * Off by default: asking for "releases in March" and being handed releases
   * whose date is unknown answers a different question. The count of what this
   * removed is reported so the exclusion is visible rather than mysterious.
   */
  readonly includeUndated: boolean
}

/** No narrowing at all: the whole history, newest first. */
export const DefaultChangelogFilter: IChangelogFilter = {
  query: '',
  mode: FilterMode.Substring,
  caseSensitive: false,
  categories: [],
  from: null,
  to: null,
  includeUndated: false,
}

/** True when the filter would narrow nothing. */
export function isEmptyChangelogFilter(filter: IChangelogFilter): boolean {
  return (
    filter.query.trim().length === 0 &&
    filter.categories.length === 0 &&
    filter.from === null &&
    filter.to === null
  )
}

export interface IChangelogFilterResult {
  /** Matching releases in the original order, each holding its kept entries. */
  readonly releases: ReadonlyArray<IChangelogRelease>
  /** How many entries survived, across every kept release. */
  readonly matchedEntryCount: number
  /**
   * How many releases a date range removed purely because their date is
   * unrecorded. Surfaced so an empty-looking result is explainable.
   */
  readonly hiddenUndatedCount: number
  /** The regex error, when the mode is Regex and the pattern will not compile. */
  readonly regexError: string | null
}

function withinRange(date: string, filter: IChangelogFilter): boolean {
  // ISO dates compare correctly as strings, which is the whole reason the
  // catalog stores them that way rather than as Date objects.
  if (filter.from !== null && date < filter.from) {
    return false
  }
  if (filter.to !== null && date > filter.to) {
    return false
  }
  return true
}

function matchesCategory(
  entry: IChangelogEntry,
  filter: IChangelogFilter
): boolean {
  return (
    filter.categories.length === 0 || filter.categories.includes(entry.category)
  )
}

/**
 * Applies every filter at once.
 *
 * Text search runs over the entries rather than the releases, so a hit shows
 * only the lines that matched — a release matching on its *version* keeps all
 * of its entries instead, because "3.6.2" is a request for that release, not
 * for a line inside it.
 */
export function filterChangelog(
  releases: ReadonlyArray<IChangelogRelease>,
  filter: IChangelogFilter
): IChangelogFilterResult {
  // Trimming answers "has the user typed anything", and nothing else: the raw
  // query is what gets matched. A regex of ` +` searching for runs of spaces
  // trims to the uncompilable `+`, and a substring of `error: ` is asking for
  // the space that `error:` does not have.
  const query = filter.query
  const hasQuery = query.trim().length > 0
  const hasDateRange = filter.from !== null || filter.to !== null

  let hiddenUndatedCount = 0
  const dateKept = new Array<IChangelogRelease>()
  for (const release of releases) {
    if (!hasDateRange) {
      dateKept.push(release)
      continue
    }
    if (release.date === null) {
      if (filter.includeUndated) {
        dateKept.push(release)
      } else {
        hiddenUndatedCount++
      }
      continue
    }
    if (withinRange(release.date, filter)) {
      dateKept.push(release)
    }
  }

  // Category first: it is a cheap exact test, and shrinking the candidate set
  // before the text match keeps an expensive regex off entries already excluded.
  const categoryKept = dateKept.map(release => ({
    release,
    entries: release.entries.filter(entry => matchesCategory(entry, filter)),
  }))

  if (!hasQuery) {
    const kept = categoryKept
      .filter(
        candidate =>
          candidate.entries.length > 0 ||
          // A release that genuinely shipped no changes is still part of the
          // history; hiding it would misreport the record. It only disappears
          // when a category filter is actively asking for something else.
          (filter.categories.length === 0 &&
            candidate.release.entries.length === 0)
      )
      .map(candidate => ({ ...candidate.release, entries: candidate.entries }))
    return {
      releases: kept,
      matchedEntryCount: kept.reduce(
        (total, release) => total + release.entries.length,
        0
      ),
      hiddenUndatedCount,
      regexError: null,
    }
  }

  // One match pass over every candidate entry, so a regex is compiled once
  // rather than per release.
  interface ICandidate {
    readonly releaseIndex: number
    readonly entry: IChangelogEntry
  }
  const candidates = new Array<ICandidate>()
  categoryKept.forEach((candidate, releaseIndex) => {
    for (const entry of candidate.entries) {
      candidates.push({ releaseIndex, entry })
    }
  })

  const { results, regexError } = matchWithMode(
    query,
    candidates,
    candidate => [candidate.entry.text, candidate.entry.category ?? ''],
    { mode: filter.mode, caseSensitive: filter.caseSensitive }
  )

  // Fuzzy mode returns results in score order; the viewer shows release
  // history, so the original order is restored and only membership is taken
  // from the match.
  const matched = new Set(results.map(result => result.item.entry))

  const versionMatch = matchWithMode(
    query,
    categoryKept.map((candidate, index) => ({
      index,
      release: candidate.release,
    })),
    candidate => [candidate.release.version],
    { mode: filter.mode, caseSensitive: filter.caseSensitive }
  )
  const matchedVersions = new Set(
    versionMatch.results.map(result => result.item.index)
  )

  const kept = new Array<IChangelogRelease>()
  let matchedEntryCount = 0
  categoryKept.forEach((candidate, index) => {
    // A version hit keeps the release whole, including a release with no
    // entries at all — searching "3.6.2" should find 3.6.2 even if it shipped
    // with nothing recorded.
    if (matchedVersions.has(index)) {
      kept.push({ ...candidate.release, entries: candidate.entries })
      matchedEntryCount += candidate.entries.length
      return
    }
    const entries = candidate.entries.filter(entry => matched.has(entry))
    if (entries.length > 0) {
      kept.push({ ...candidate.release, entries })
      matchedEntryCount += entries.length
    }
  })

  return {
    releases: kept,
    matchedEntryCount,
    hiddenUndatedCount,
    regexError,
  }
}
