/**
 * The release history the in-app changelog viewer reads.
 *
 * Two sources, both real, neither guessed:
 *
 *   `changelog.json`   the shipped entry text, authored newest release first
 *   `release-dates.ts` the `release-<version>` tag dates, generated from Git
 *
 * The entry text is imported straight from `changelog.json` rather than copied
 * into a generated module, so the app and the documentation site cannot drift
 * about what a release actually said. Only the dates need generating, because a
 * Git tag cannot be read from a packaged app.
 *
 * A release with no tag has **no known date**. It is reported as unrecorded and
 * never given a plausible-looking substitute derived from its version number or
 * from a neighbouring release — a wrong date a reader cannot detect is worse
 * than an honest gap.
 */

import changelogSource from '../../../../changelog.json'
import { ReleaseStamps } from './release-dates'

/** One line of a release's notes, with its `[Category]` prefix split off. */
export interface IChangelogEntry {
  /** `Fixed`, `Added`, `Improved`, … or null when the line carries no prefix. */
  readonly category: string | null
  /** The entry text with the category prefix and any commit reference removed. */
  readonly text: string
  /**
   * The full commit SHA this entry describes, or null when the entry records
   * no commit.
   *
   * An entry that says what changed but not where cannot be checked: a reader
   * who doubts it, or who wants the surrounding context, has no route from the
   * sentence to the code. Upstream's own entries reference an issue number
   * instead and keep a null here rather than being given a made-up SHA.
   */
  readonly commit: string | null
}

/** A released version and everything recorded about it. */
export interface IChangelogRelease {
  /** The version as `changelog.json` keys it, e.g. `3.6.3-beta3`. */
  readonly version: string
  /** `YYYY-MM-DD`, or null when no release tag records one. */
  readonly date: string | null
  /** 24-hour `HH:MM`, or null whenever the date is. Display only. */
  readonly time: string | null
  readonly entries: ReadonlyArray<IChangelogEntry>
}

interface IChangelogSource {
  readonly releases: Record<string, ReadonlyArray<string>>
}

/**
 * Splits `[Fixed] text` into its category and text.
 *
 * A line with no bracketed prefix keeps a null category. Twenty-nine shipped
 * entries genuinely look like that, and inventing a category for them would put
 * a fact in the viewer that the changelog never stated.
 */
export function splitChangelogEntry(entry: string): IChangelogEntry {
  const match = /^\s*\[([^\]]+)\]\s*([\s\S]*)$/.exec(entry)
  const category = match === null ? null : match[1].trim()
  const body = match === null ? entry.trim() : match[2].trim()
  const { text, commit } = splitCommitReference(body)
  return { category, text, commit }
}

/**
 * Lifts a trailing ` - <40-hex>` commit reference off an entry.
 *
 * The SHA is stored in the entry text because `changelog.json` is a map of
 * version to plain strings and has been for the project's whole history;
 * changing that shape would rewrite every release rather than add to the
 * newest ones. Only a full 40-character SHA counts — an abbreviated one is
 * ambiguous, and an issue reference like `#22509` is deliberately not a match.
 */
function splitCommitReference(body: string): {
  text: string
  commit: string | null
} {
  const match = /^([\s\S]*?)\s*[-–—]\s*([0-9a-f]{40})\s*$/.exec(body)
  if (match === null) {
    return { text: body, commit: null }
  }
  return { text: match[1].trim(), commit: match[2] }
}

function buildReleases(): ReadonlyArray<IChangelogRelease> {
  const source = changelogSource as IChangelogSource
  const releases = new Array<IChangelogRelease>()

  for (const version of Object.keys(source.releases)) {
    const stamp = ReleaseStamps[version]
    const [date, time] = stamp === undefined ? [null, null] : stamp.split(' ')
    releases.push({
      version,
      date: date ?? null,
      time: time ?? null,
      entries: (source.releases[version] ?? []).map(splitChangelogEntry),
    })
  }

  return releases
}

/**
 * Every release, newest first — the order `changelog.json` is authored in.
 *
 * Deliberately not sorted by date: 39 releases have no date, and any sort that
 * has to place them would be inventing an order the repository does not record.
 */
export const ChangelogReleases: ReadonlyArray<IChangelogRelease> =
  buildReleases()

/** The version this build reports as its own, for marking "you are here". */
export const CurrentChangelogVersion = __APP_VERSION__

/** Counts a reader can check the viewer's own claims against. */
export interface IChangelogSummary {
  readonly versionCount: number
  /** Releases carrying a real tag date. */
  readonly datedCount: number
  /** Releases whose date is genuinely unrecorded. */
  readonly unrecordedCount: number
  /** Releases that shipped with no recorded changes at all. */
  readonly emptyCount: number
  readonly entryCount: number
  /** Newest and oldest recorded dates, or null when nothing is dated. */
  readonly newestDate: string | null
  readonly oldestDate: string | null
}

function buildSummary(): IChangelogSummary {
  let datedCount = 0
  let emptyCount = 0
  let entryCount = 0
  let newestDate: string | null = null
  let oldestDate: string | null = null

  for (const release of ChangelogReleases) {
    entryCount += release.entries.length
    if (release.entries.length === 0) {
      emptyCount++
    }
    if (release.date === null) {
      continue
    }
    datedCount++
    if (newestDate === null || release.date > newestDate) {
      newestDate = release.date
    }
    if (oldestDate === null || release.date < oldestDate) {
      oldestDate = release.date
    }
  }

  return {
    versionCount: ChangelogReleases.length,
    datedCount,
    unrecordedCount: ChangelogReleases.length - datedCount,
    emptyCount,
    entryCount,
    newestDate,
    oldestDate,
  }
}

/** Summary counts for the whole history. */
export const ChangelogSummary: IChangelogSummary = buildSummary()

/** One category with how many entries carry it. */
export interface IChangelogCategoryCount {
  /** Null is the real "no `[Category]` prefix" bucket, not a missing value. */
  readonly category: string | null
  readonly count: number
}

/**
 * Every category the history actually uses, commonest first.
 *
 * Derived from the entries rather than hard-coded, so a category introduced by
 * a future release appears in the filter without anyone remembering to add it —
 * and one that falls out of use stops being offered as an empty choice.
 */
export const ChangelogCategories: ReadonlyArray<IChangelogCategoryCount> =
  (() => {
    const counts = new Map<string | null, number>()
    for (const release of ChangelogReleases) {
      for (const entry of release.entries) {
        counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1)
      }
    }
    return [...counts]
      .map(([category, count]) => ({ category, count }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          (left.category ?? '').localeCompare(right.category ?? '')
      )
  })()
