#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeLineEndings } from './normalize-line-endings.mjs'

const toolsDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolsDirectory, '..', '..')
const sourcePath = resolve(
  repositoryRoot,
  'docs',
  'readme-tabs',
  'complete-feature-list.md'
)
const overridesPath = resolve(
  repositoryRoot,
  'tui',
  'contracts',
  'parity-overrides.json'
)
const outputPath = resolve(repositoryRoot, 'tui', 'contracts', 'parity.yaml')

// Git may check Markdown out as CRLF on Windows and LF on Linux. Normalize
// before hashing so the generated contract is byte-identical on every runner.
const source = normalizeLineEndings(await readFile(sourcePath, 'utf8'))
const overrides = JSON.parse(await readFile(overridesPath, 'utf8'))

function slugify(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function markdownLinkTarget(value) {
  const match = value.match(/\]\(([^)]+)\)/)
  return match?.[1] ?? null
}

const features = []
let section = null

for (const line of source.split(/\r?\n/u)) {
  const heading = line.match(/^## (\d+)\. (.+?) \/ (.+)$/u)
  if (heading) {
    section = {
      number: Number.parseInt(heading[1], 10),
      title: heading[2],
      title_cantonese: heading[3],
    }
    continue
  }

  if (section === null || !line.startsWith('| **')) {
    continue
  }

  const cells = line
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim())
  if (
    cells.length !== 3 ||
    !/^(?:\*\*)?(?:Added|Extended|Inherited)/u.test(cells[1])
  ) {
    continue
  }

  const title = cells[0].match(/^\*\*(.+?)\*\*/u)?.[1]
  const upstreamRelation = cells[1].replaceAll('**', '').toLowerCase()
  if (title === undefined) {
    throw new Error(`Unable to parse feature title: ${line}`)
  }

  const mapped =
    overrides.features[title] === undefined
      ? overrides.default
      : overrides.features[title]
  features.push({
    id: `${section.number}-${slugify(title)}`,
    section: section.number,
    section_title: section.title,
    title,
    upstream_relation: upstreamRelation,
    desktop_documentation: markdownLinkTarget(cells[2]),
    tui_status: mapped.status,
    reason: mapped.reason,
    evidence: mapped.evidence,
  })
}

const DeclaredDesktopFeatureCount = 203

if (features.length !== DeclaredDesktopFeatureCount) {
  throw new Error(
    `Expected ${DeclaredDesktopFeatureCount} desktop feature rows, parsed ${features.length}. ` +
      'Update the inventory parser and declared source count together.'
  )
}

const titles = new Set(features.map(feature => feature.title))
const unknownOverrides = Object.keys(overrides.features).filter(
  title => !titles.has(title)
)
if (unknownOverrides.length > 0) {
  throw new Error(`Unknown parity overrides: ${unknownOverrides.join(', ')}`)
}

const identifiers = new Set(features.map(feature => feature.id))
if (identifiers.size !== features.length) {
  throw new Error('Generated parity identifiers are not unique')
}

const allowedStatuses = new Set([
  'adapted',
  'partial',
  'not_yet_available',
  'terminal_owned',
])
for (const feature of features) {
  if (!allowedStatuses.has(feature.tui_status)) {
    throw new Error(
      `Unsupported status ${feature.tui_status} for ${feature.title}`
    )
  }
  if (
    !Array.isArray(feature.evidence) ||
    feature.evidence.some(item => typeof item !== 'string')
  ) {
    throw new Error(`Invalid evidence list for ${feature.title}`)
  }
  if (
    feature.tui_status === 'not_yet_available' &&
    feature.evidence.length !== 0
  ) {
    throw new Error(
      `Unavailable parity row must not map implementation evidence: ${feature.title}`
    )
  }
  if (
    feature.tui_status !== 'not_yet_available' &&
    feature.evidence.length === 0
  ) {
    throw new Error(
      `Mapped parity row must include implementation evidence: ${feature.title}`
    )
  }
  for (const evidencePath of feature.evidence) {
    const absoluteEvidencePath = resolve(repositoryRoot, evidencePath)
    if (
      absoluteEvidencePath !== repositoryRoot &&
      !absoluteEvidencePath.startsWith(`${repositoryRoot}\\`) &&
      !absoluteEvidencePath.startsWith(`${repositoryRoot}/`)
    ) {
      throw new Error(`Evidence escapes the repository: ${evidencePath}`)
    }
    await access(absoluteEvidencePath).catch(() => {
      throw new Error(
        `Missing parity evidence ${evidencePath} for ${feature.title}`
      )
    })
  }
}

const statusSummary = Object.fromEntries(
  [...allowedStatuses]
    .sort()
    .map(status => [
      status,
      features.filter(feature => feature.tui_status === status).length,
    ])
)

const contract = {
  schema_version: overrides.schema_version,
  generated: true,
  generator: 'tui/tools/generate-parity-contract.mjs',
  source: {
    path: 'docs/readme-tabs/complete-feature-list.md',
    sha256: createHash('sha256').update(source).digest('hex'),
    declared_feature_count: DeclaredDesktopFeatureCount,
    parsed_feature_count: features.length,
    section_count: new Set(features.map(feature => feature.section)).size,
  },
  semantics: {
    adapted:
      'A terminal-native implementation covers the named user outcome, with documented terminal constraints.',
    partial:
      'A meaningful subset exists, but one or more behaviors named by the desktop row are absent.',
    not_yet_available:
      'No implementation evidence is mapped; this is backlog, not a parity claim.',
    terminal_owned:
      'The terminal emulator or operating environment owns this behavior; the TUI documents the boundary.',
  },
  status_summary: statusSummary,
  features,
}

// JSON is a strict YAML 1.2 subset. Keeping deterministic two-space JSON here
// makes the contract readable without adding a generator-only dependency.
const rendered = `${JSON.stringify(contract, null, 2)}\n`
const checkOnly = process.argv.includes('--check')

if (checkOnly) {
  const current = normalizeLineEndings(
    await readFile(outputPath, 'utf8').catch(() => '')
  )
  if (current !== rendered) {
    console.error(
      'tui/contracts/parity.yaml is stale; run ' +
        'node tui/tools/generate-parity-contract.mjs'
    )
    process.exitCode = 1
  }
} else {
  await writeFile(outputPath, rendered, 'utf8')
  console.log(
    `Wrote ${features.length} parity rows to ` + 'tui/contracts/parity.yaml'
  )
}
