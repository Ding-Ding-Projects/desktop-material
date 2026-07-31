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

/**
 * Splits `[Fixed] text` into its category and text. An entry with no bracketed
 * category keeps a null category — 29 real entries look like that, and giving
 * them a made-up one would be a fabricated fact.
 */
export function splitEntry(entry) {
  const text = String(entry)
  const match = /^\s*\[([^\]]+)\]\s*([\s\S]*)$/.exec(text)
  if (match === null) {
    return { category: null, text: text.trim() }
  }
  return { category: match[1].trim(), text: match[2].trim() }
}

/**
 * Projects changelog.json plus the tag dates into the records the viewer reads.
 * Release order follows changelog.json itself, which is authored newest first.
 */
export function collectReleases({ changelog, tagDates }) {
  const releases = []
  for (const version of Object.keys(changelog.releases)) {
    const list = changelog.releases[version]
    const entries = (Array.isArray(list) ? list : []).map(splitEntry)
    const stamp = tagDates.get(version)
    releases.push({
      version,
      date: stamp === undefined ? null : stamp.date,
      // 24-hour, display only. Null whenever the date is null, so a release
      // can never show a time it has no tag to source it from.
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
  lines.push(
    ' * Built from two real sources and nothing else: the entry text in'
  )
  lines.push(
    ' * `changelog.json`, and the release dates carried by the repository’s own'
  )
  lines.push(' * `release-<version>` Git tags.')
  lines.push(' *')
  lines.push(
    ' * Each release is `{ v: version, d: date | null, t: 24-hour time | null,'
  )
  lines.push(
    ' *   e: [[category, text], …] }`. `t` is display-only and always 24-hour.'
  )
  lines.push(
    ' * `d: null` means no `release-<version>` tag exists, so the release date is'
  )
  lines.push(
    ' * genuinely unrecorded — it is never a placeholder for a guessed date. A null'
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
        lines.push(
          '          [' +
            (entry.category === null ? 'null' : quote(entry.category)) +
            ', ' +
            quote(entry.text) +
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
  const categories = [...counts.categories]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .map(([category, count]) => `  ${category}: ${count}`)
    .join('\n')
  console.log(
    `Generated ${counts.versionCount} releases (${counts.entryCount} entries) in ${outputPath}\n` +
      `  dated from a release-* Git tag: ${counts.datedCount}\n` +
      `  date unrecorded (no matching tag): ${counts.unrecordedCount}\n` +
      `  versions with no recorded changes: ${counts.emptyCount}\n` +
      `entries by category:\n${categories}`
  )
}
