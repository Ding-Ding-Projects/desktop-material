#!/usr/bin/env node

/**
 * Regenerates the changelog catalog consumed by the documentation site's
 * changelog viewer.
 *
 * The site runs with no bundler and no network fetch, so the release history
 * has to be baked into a static browser module. Two real sources feed it and
 * nothing else:
 *
 *   changelog.json          the shipped entry text, keyed by version
 *   refs/tags/release-<v>   the only record of when a version was released
 *
 * A version with no `release-<version>` tag therefore has **no known date**.
 * This script writes `d: null` for it and the viewer says so out loud. Dates
 * are never guessed, interpolated from a neighbouring release, or taken from
 * the version number, because a plausible-looking wrong date is worse for a
 * reader than an honest gap.
 *
 * Usage: node script/generate-changelog-catalog.mjs [changelogPath] [outputPath]
 *
 * app/test/unit/docs-site-changelog-test.ts fails when the committed catalog
 * has drifted from changelog.json, so an added or edited release that was not
 * regenerated is caught before it ships.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import prettier from 'prettier'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

export const DefaultChangelogPath = resolve(repositoryRoot, 'changelog.json')
export const DefaultOutputPath = resolve(
  repositoryRoot,
  'docs/assets/site/docs-changelog-catalog.js'
)

/**
 * Where the desktop app's release dates land.
 *
 * The app's own changelog viewer reads the entry text straight out of
 * `changelog.json`, so only the dates need generating — they live in Git tags
 * and nowhere else. Emitting dates alone rather than a second full catalog
 * means the app and the site cannot disagree about what a release said, only
 * about when it shipped, and that one fact comes from the same tag read.
 */
export const DefaultAppDatesPath = resolve(
  repositoryRoot,
  'app/src/lib/changelog/release-dates.ts'
)

/** Prefix of the tags that record a real release date. */
const TagPrefix = 'release-'

/**
 * Reads the release dates Git actually holds.
 *
 * `creatordate` is the tag's own date for an annotated tag and the tagged
 * commit's date for a lightweight one — in both cases the closest thing the
 * repository knows to "when this version was cut". Tags with no matching
 * changelog entry are kept out of the result rather than inventing a release.
 */
export function readTagDates({ cwd = repositoryRoot } = {}) {
  const output = execFileSync(
    'git',
    [
      'for-each-ref',
      // `iso8601` carries the wall-clock time and offset the tag was actually
      // written with. `short` discarded it, so no release could ever show a
      // time — and a time is not something that can be recovered later.
      '--format=%(refname:short)|%(creatordate:iso8601)',
      'refs/tags/' + TagPrefix + '*',
    ],
    { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }
  )

  const dates = new Map()
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') {
      continue
    }
    const separator = trimmed.indexOf('|')
    if (separator < 0) {
      continue
    }
    const ref = trimmed.slice(0, separator)
    const stamp = trimmed.slice(separator + 1).trim()
    // iso8601 from Git looks like `2026-07-14 09:32:11 -0400`. Keep the date
    // and the 24-hour time separately: the date is what filtering sorts on,
    // and the time is display-only.
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}):\d{2}/.exec(stamp)
    if (!ref.startsWith(TagPrefix) || match === null) {
      continue
    }
    // 24-hour throughout, with no locale AM/PM form anywhere.
    dates.set(ref.slice(TagPrefix.length), {
      date: match[1],
      time: match[2],
    })
  }
  return dates
}

/** A full 40-character SHA at the end of an entry, after a dash. */
const CommitReference = /[-\u2013\u2014]\s*([0-9a-f]{40})\s*$/

/**
 * Reads the commit dates for every SHA a changelog entry references.
 *
 * A release with no `release-<version>` tag used to be simply undated. Desktop
 * Material's own entries have no such tag and never will - the fork publishes
 * per push, not per named version - but every one of them carries the commit
 * that made the change, and that commit's date is a *better* source than a
 * tag: it is the same commit the reader clicks through to, so the date and the
 * link cannot disagree.
 *
 * A SHA Git does not have is left out rather than guessed at, which surfaces a
 * dead reference as an undated release instead of hiding it behind a
 * plausible date.
 */
export function readCommitDates(changelog, { cwd = repositoryRoot } = {}) {
  const shas = new Set()
  for (const list of Object.values(changelog.releases)) {
    for (const entry of Array.isArray(list) ? list : []) {
      const match = CommitReference.exec(entry)
      if (match !== null) {
        shas.add(match[1])
      }
    }
  }
  if (shas.size === 0) {
    return new Map()
  }

  const output = execFileSync(
    'git',
    ['log', '--no-walk', '--format=%H|%cd', '--date=iso8601', ...shas],
    { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }
  )

  const dates = new Map()
  for (const line of output.split('\n')) {
    const separator = line.indexOf('|')
    if (separator < 0) {
      continue
    }
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}):\d{2}/.exec(
      line.slice(separator + 1).trim()
    )
    if (match !== null) {
      dates.set(line.slice(0, separator).trim(), {
        date: match[1],
        time: match[2],
      })
    }
  }
  return dates
}

/**
 * The newest commit date among a release's entries, or undefined when none of
 * them reference a commit Git has.
 */
function dateFromEntries(entries, commitDates) {
  let newest
  for (const entry of entries) {
    const match = CommitReference.exec(entry)
    const stamp = match === null ? undefined : commitDates.get(match[1])
    if (stamp === undefined) {
      continue
    }
    const key = stamp.date + ' ' + stamp.time
    if (newest === undefined || key > newest.date + ' ' + newest.time) {
      newest = stamp
    }
  }
  return newest
}

/**
 * Splits `[Fixed] text` into its category and text. An entry with no bracketed
 * category keeps a null category — 29 real entries look like that, and giving
 * them a made-up one would be a fabricated fact.
 */
export function splitEntry(entry) {
  const raw = String(entry)
  const match = /^\s*\[([^\]]+)\]\s*([\s\S]*)$/.exec(raw)
  const category = match === null ? null : match[1].trim()
  const body = (match === null ? raw : match[2]).trim()
  // The commit reference is lifted out of the text so the site can render it
  // as a link rather than as a wall of hex at the end of a sentence.
  const commit = CommitReference.exec(body)
  return {
    category,
    text: commit === null ? body : body.replace(CommitReference, '').trim(),
    commit: commit === null ? null : commit[1],
  }
}

/**
 * Projects changelog.json plus recorded release and entry-commit dates into the
 * records the viewer reads.
 * Release order follows changelog.json itself, which is authored newest first.
 */
export function collectReleases({ changelog, tagDates, commitDates }) {
  const releases = []
  const commits = commitDates ?? new Map()
  for (const version of Object.keys(changelog.releases)) {
    const list = changelog.releases[version]
    const raw = Array.isArray(list) ? list : []
    const entries = raw.map(splitEntry)
    // The tag wins where there is one: it is what the project itself called
    // the release date. The entries' commits only fill a gap the tag left.
    const stamp = tagDates.get(version) ?? dateFromEntries(raw, commits)
    releases.push({
      version,
      date: stamp === undefined ? null : stamp.date,
      // 24-hour, display only. Null whenever the date is null, so a release
      // can never show a time with no tag or entry-commit source.
      time: stamp === undefined ? null : stamp.time,
      entries,
    })
  }
  return releases
}

export function summarize(releases) {
  const categories = new Map()
  let entryCount = 0
  let datedCount = 0
  let unrecordedCount = 0
  let emptyCount = 0
  for (const release of releases) {
    if (release.date === null) {
      unrecordedCount++
    } else {
      datedCount++
    }
    if (release.entries.length === 0) {
      emptyCount++
    }
    for (const entry of release.entries) {
      entryCount++
      const key = entry.category === null ? '(uncategorized)' : entry.category
      categories.set(key, (categories.get(key) ?? 0) + 1)
    }
  }
  return {
    versionCount: releases.length,
    datedCount,
    unrecordedCount,
    emptyCount,
    entryCount,
    categories,
  }
}

function quote(value) {
  return JSON.stringify(value)
}

/** Renders the module text. Entries stay tuples so 3,694 of them stay small. */
export function renderCatalogModule(releases) {
  const counts = summarize(releases)
  const lines = []
  lines.push('/**')
  lines.push(
    ' * Desktop Material documentation site — release changelog catalog.'
  )
  lines.push(' *')
  lines.push(' * GENERATED FILE — do not edit by hand.')
  lines.push(' * Regenerate with: node script/generate-changelog-catalog.mjs')
  lines.push(' *')
  lines.push(' * Built from repository-owned facts: the entry text and commit')
  lines.push(' * references in `changelog.json`, plus `release-<version>` Git tag')
  lines.push(' * timestamps where they exist. A missing tag falls back to the newest')
  lines.push(' * referenced entry commit timestamp for that release.')
  lines.push(' *')
  lines.push(
    ' * Each release is `{ v: version, d: date | null, t: 24-hour time | null,'
  )
  lines.push(
    ' *   e: [[category, text] | [category, text, commit], …] }`. `t` is'
  )
  lines.push(
    ' * `d: null` means neither a release tag nor a referenced entry commit supplied'
  )
  lines.push(
    ' * a timestamp, so the date is genuinely unrecorded rather than guessed. A null'
  )
  lines.push(' * category means the entry ships with no `[Category]` prefix.')
  lines.push(' */')
  lines.push(';(function (global) {')
  lines.push("  'use strict'")
  lines.push('  var catalog = {')
  lines.push('    versionCount: ' + counts.versionCount + ',')
  lines.push('    datedCount: ' + counts.datedCount + ',')
  lines.push('    unrecordedCount: ' + counts.unrecordedCount + ',')
  lines.push('    emptyCount: ' + counts.emptyCount + ',')
  lines.push('    entryCount: ' + counts.entryCount + ',')
  lines.push('    releases: [')
  for (const release of releases) {
    lines.push('      {')
    lines.push('        v: ' + quote(release.version) + ',')
    lines.push(
      '        d: ' +
        (release.date === null ? 'null' : quote(release.date)) +
        ','
    )
    lines.push(
      '        t: ' +
        (release.time === null || release.time === undefined
          ? 'null'
          : quote(release.time)) +
        ','
    )
    if (release.entries.length === 0) {
      lines.push('        e: [],')
    } else {
      lines.push('        e: [')
      for (const entry of release.entries) {
        // The third slot is written only where a commit exists, so the
        // 3,694 upstream entries that reference an issue instead stay two
        // elements wide.
        lines.push(
          '          [' +
            (entry.category === null ? 'null' : quote(entry.category)) +
            ', ' +
            quote(entry.text) +
            (entry.commit === null ? '' : ', ' + quote(entry.commit)) +
            '],'
        )
      }
      lines.push('        ],')
    }
    lines.push('      },')
  }
  lines.push('    ],')
  lines.push('  }')
  lines.push('')
  lines.push(
    "  if (typeof module === 'object' && module !== null && module.exports) {"
  )
  lines.push('    module.exports = catalog')
  lines.push('  }')
  lines.push('  global.DesktopMaterialDocsChangelogCatalog = catalog')
  lines.push("})(typeof window === 'undefined' ? globalThis : window)")
  lines.push('')
  return lines.join('\n')
}

/**
 * Renders the desktop app's release-date module.
 *
 * Only dated releases appear. A version with neither a `release-<version>` tag
 * nor a referenced entry commit is absent from the map rather than present
 * with an empty value, so the app's "date unrecorded" state is derived from a
 * genuine absence instead of a sentinel that a future edit could mistake for
 * real data.
 *
 * The value is `YYYY-MM-DD HH:MM` — one string, always 24-hour, with no locale
 * AM/PM form anywhere in it.
 */
export function renderReleaseDatesModule(releases) {
  const dated = releases.filter(release => release.date !== null)
  const lines = []
  lines.push('/**')
  lines.push(
    " * Desktop Material — release dates for the app's changelog viewer."
  )
  lines.push(' *')
  lines.push(' * GENERATED FILE — do not edit by hand.')
  lines.push(' * Regenerate with: node script/generate-changelog-catalog.mjs')
  lines.push(' *')
  lines.push(' * Dates come from `release-<version>` Git tags where present; when a')
  lines.push(' * tag is absent, the newest referenced changelog-entry commit supplies')
  lines.push(' * the timestamp. Git cannot be read at runtime, so those dates are baked')
  lines.push(' * in here. The entry text is NOT duplicated: the viewer reads')
  lines.push(
    ' * `changelog.json` directly, so the app and the documentation site cannot'
  )
  lines.push(' * drift about what a release actually said.')
  lines.push(' *')
  lines.push(' * A version missing from this map has neither a release tag nor a')
  lines.push(
    ' * referenced entry commit timestamp. That is reported as unrecorded rather'
  )
  lines.push(' * from the version number or a neighbouring release.')
  lines.push(' */')
  lines.push('')
  lines.push('/** Total releases in `changelog.json` at generation time. */')
  lines.push('export const ReleaseCount = ' + releases.length)
  lines.push('')
  lines.push('/** How many have a tag or referenced entry-commit timestamp. */')
  lines.push('export const DatedReleaseCount = ' + dated.length)
  lines.push('')
  lines.push(
    '/** `version` to `YYYY-MM-DD HH:MM`, 24-hour, from a tag or entry commit. */'
  )
  lines.push('export const ReleaseStamps: Readonly<Record<string, string>> = {')
  for (const release of dated) {
    lines.push(
      '  ' +
        quote(release.version) +
        ': ' +
        quote(release.date + ' ' + (release.time ?? '00:00')) +
        ','
    )
  }
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

/** Builds the app release-date module text exactly as it belongs on disk. */
export async function buildReleaseDatesModule({
  changelogPath = DefaultChangelogPath,
  outputPath = DefaultAppDatesPath,
  cwd = repositoryRoot,
} = {}) {
  const changelog = JSON.parse(readFileSync(changelogPath, 'utf8'))
  const releases = collectReleases({
    changelog,
    tagDates: readTagDates({ cwd }),
    commitDates: readCommitDates(changelog, { cwd }),
  })
  const options = (await prettier.resolveConfig(outputPath)) ?? {}
  const source = await prettier.format(renderReleaseDatesModule(releases), {
    ...options,
    filepath: outputPath,
    endOfLine: 'lf',
  })
  return { releases, source }
}

/** Writes the app release-date module. */
export async function generateReleaseDates(settings = {}) {
  const outputPath = settings.outputPath ?? DefaultAppDatesPath
  const { source } = await buildReleaseDatesModule({ ...settings, outputPath })
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, source)
  return { outputPath }
}

/** Builds the module text exactly as it belongs on disk, Prettier included. */
export async function buildChangelogCatalog({
  changelogPath = DefaultChangelogPath,
  outputPath = DefaultOutputPath,
  cwd = repositoryRoot,
} = {}) {
  const changelog = JSON.parse(readFileSync(changelogPath, 'utf8'))
  const releases = collectReleases({
    changelog,
    tagDates: readTagDates({ cwd }),
    commitDates: readCommitDates(changelog, { cwd }),
  })
  const options = (await prettier.resolveConfig(outputPath)) ?? {}
  const source = await prettier.format(renderCatalogModule(releases), {
    ...options,
    filepath: outputPath,
    // The generator always emits LF; Git applies the checkout's own endings.
    endOfLine: 'lf',
  })
  return { releases, source, counts: summarize(releases) }
}

export async function generateChangelogCatalog(settings = {}) {
  const outputPath = settings.outputPath ?? DefaultOutputPath
  const { releases, source, counts } = await buildChangelogCatalog(settings)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, source)
  return { releases, counts, outputPath }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { counts, outputPath } = await generateChangelogCatalog({
    changelogPath:
      process.argv[2] === undefined
        ? DefaultChangelogPath
        : resolve(process.argv[2]),
    outputPath:
      process.argv[3] === undefined
        ? DefaultOutputPath
        : resolve(process.argv[3]),
  })
  // Both consumers are written from the one tag read, so the app can never end
  // up with dates the site does not have.
  const { outputPath: datesPath } = await generateReleaseDates({
    changelogPath:
      process.argv[2] === undefined
        ? DefaultChangelogPath
        : resolve(process.argv[2]),
  })
  const categories = [...counts.categories]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .map(([category, count]) => `  ${category}: ${count}`)
    .join('\n')
  console.log(
    `Generated ${counts.versionCount} releases (${counts.entryCount} entries) in ${outputPath}\n` +
      `  dated from a release-* tag or referenced entry commit: ${counts.datedCount}\n` +
      `  date unrecorded (neither source exists): ${counts.unrecordedCount}\n` +
      `  versions with no recorded changes: ${counts.emptyCount}\n` +
      `Generated ${counts.datedCount} release dates in ${datesPath}\n` +
      `entries by category:\n${categories}`
  )
}
