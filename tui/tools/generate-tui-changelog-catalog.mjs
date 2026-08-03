#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolsDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolsDirectory, '..', '..')
const changelogPath = resolve(repositoryRoot, 'changelog.json')
const releaseDatesPath = resolve(
  repositoryRoot,
  'app',
  'src',
  'lib',
  'changelog',
  'release-dates.ts'
)
const outputPath = resolve(
  repositoryRoot,
  'tui',
  'src',
  'desktop_material_tui',
  'assets',
  'changelog-catalog.json'
)

const changelogSource = await readFile(changelogPath, 'utf8')
const releaseDatesSource = await readFile(releaseDatesPath, 'utf8')
const changelog = JSON.parse(changelogSource)

if (
  changelog === null ||
  typeof changelog !== 'object' ||
  changelog.releases === null ||
  typeof changelog.releases !== 'object' ||
  Array.isArray(changelog.releases)
) {
  throw new Error('changelog.json must contain a releases object')
}

const releaseDates = new Map()
const stampPattern = /^\s*'([^']+)':\s*'(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})',?\s*$/gmu
for (const match of releaseDatesSource.matchAll(stampPattern)) {
  releaseDates.set(match[1], { date: match[2], time: match[3] })
}

const releaseCountMatch = releaseDatesSource.match(/export const ReleaseCount = (\d+)/u)
const datedCountMatch = releaseDatesSource.match(/export const DatedReleaseCount = (\d+)/u)
if (releaseCountMatch === null || datedCountMatch === null) {
  throw new Error('release-dates.ts is missing its generated count declarations')
}

function splitEntry(rawEntry) {
  if (typeof rawEntry !== 'string') {
    throw new Error('Every changelog entry must be a string')
  }
  const categoryMatch = /^\s*\[([^\]]+)\]\s*([\s\S]*)$/u.exec(rawEntry)
  const category = categoryMatch === null ? null : categoryMatch[1].trim()
  const body = (categoryMatch === null ? rawEntry : categoryMatch[2]).trim()
  const commitMatch = /^(.*) - ([0-9a-f]{40})$/u.exec(body)
  return [
    category,
    (commitMatch === null ? body : commitMatch[1]).trim(),
    commitMatch === null ? null : commitMatch[2],
  ]
}

let entryCount = 0
let emptyCount = 0
const releases = Object.entries(changelog.releases).map(([version, rawEntries]) => {
  if (!Array.isArray(rawEntries)) {
    throw new Error(`Release ${version} must contain an entry array`)
  }
  const stamp = releaseDates.get(version) ?? null
  const entries = rawEntries.map(splitEntry)
  entryCount += entries.length
  if (entries.length === 0) {
    emptyCount += 1
  }
  return {
    v: version,
    d: stamp?.date ?? null,
    t: stamp?.time ?? null,
    e: entries,
  }
})

const commits = [
  ...new Set(
    releases.flatMap(release =>
      release.e.flatMap(entry => (entry[2] === null ? [] : [entry[2]]))
    )
  ),
]
const commitInspection = execFileSync(
  'git',
  ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input: `${commits.join('\n')}\n`,
    maxBuffer: 8 * 1024 * 1024,
  }
).trim().split(/\r?\n/u)
if (commitInspection.length !== commits.length) {
  throw new Error('Git returned an incomplete changelog commit inspection')
}
for (const [index, line] of commitInspection.entries()) {
  const expected = commits[index]
  if (line !== `${expected} commit`) {
    throw new Error(`Changelog commit ${expected} is missing or is not a commit: ${line}`)
  }
}

if (releases.length !== Number.parseInt(releaseCountMatch[1], 10)) {
  throw new Error(
    `Release count drift: changelog has ${releases.length}, release-dates.ts records ${releaseCountMatch[1]}`
  )
}
const datedCount = releases.filter(release => release.d !== null).length
if (datedCount !== Number.parseInt(datedCountMatch[1], 10)) {
  throw new Error(
    `Dated release count drift: catalog has ${datedCount}, release-dates.ts records ${datedCountMatch[1]}`
  )
}

const metadata = {
  schema_version: 1,
  source: {
    changelog: 'changelog.json',
    release_dates: 'app/src/lib/changelog/release-dates.ts',
    changelog_sha256: createHash('sha256').update(changelogSource).digest('hex'),
    release_dates_sha256: createHash('sha256').update(releaseDatesSource).digest('hex'),
  },
  version_count: releases.length,
  dated_count: datedCount,
  unrecorded_count: releases.length - datedCount,
  empty_count: emptyCount,
  entry_count: entryCount,
}

const rendered = [
  '{',
  `  "schema_version": ${metadata.schema_version},`,
  `  "source": ${JSON.stringify(metadata.source)},`,
  `  "version_count": ${metadata.version_count},`,
  `  "dated_count": ${metadata.dated_count},`,
  `  "unrecorded_count": ${metadata.unrecorded_count},`,
  `  "empty_count": ${metadata.empty_count},`,
  `  "entry_count": ${metadata.entry_count},`,
  '  "releases": [',
  releases.map(release => `    ${JSON.stringify(release)}`).join(',\n'),
  '  ]',
  '}',
  '',
].join('\n')

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '')
  if (current !== rendered) {
    console.error(
      'The packaged TUI changelog catalog is stale; run ' +
        'node tui/tools/generate-tui-changelog-catalog.mjs'
    )
    process.exitCode = 1
  }
} else {
  await writeFile(outputPath, rendered, 'utf8')
  console.log(
    `Wrote ${metadata.version_count} releases and ${metadata.entry_count} entries to ` +
      'tui/src/desktop_material_tui/assets/changelog-catalog.json'
  )
}
