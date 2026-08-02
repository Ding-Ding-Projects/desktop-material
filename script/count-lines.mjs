#!/usr/bin/env node

/**
 * Counts the repository's lines of code and prints the table the README
 * publishes.
 *
 * The shared instructions require every README to state the project's line
 * count, broken down rather than reduced to one flattering number, with the
 * exclusions stated and the tool recorded so anyone can reproduce it. This is
 * that tool: run it, paste the table, and the figure in the README is a
 * measurement rather than an estimate.
 *
 * Only files Git tracks are counted, so dependency directories, build output
 * and anything ignored are excluded by construction rather than by a
 * hand-maintained deny list. Vendored third-party trees are tracked but are
 * not this project's code, so they are counted into their own row and left out
 * of the project total.
 *
 * Usage: node script/count-lines.mjs [--json]
 */

import { execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

/** Extensions counted as source. Binaries and assets are not code. */
const CountedExtensions = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'scss',
  'css',
  'html',
  'py',
  'sh',
  'ps1',
  'yml',
  'yaml',
  'json',
  'md',
])

/** A file bigger than this is data, not something a person maintains by hand. */
const MaximumFileBytes = 8 * 1024 * 1024

/**
 * Files that exist because a generator wrote them.
 *
 * Separated out because a reader wants to know how much of the project a
 * person actually wrote; folding a 288k-line catalog into "source" would
 * misrepresent that badly.
 */
const GeneratedPatterns = [
  /\.generated\.tsx?$/,
  /^app\/src\/lib\/changelog\/release-dates\.ts$/,
  /^docs\/assets\/site\/docs-[a-z-]*catalog\.js$/,
  /^changelog\.json$/,
  /^app\/static\/dim-sum\/manifest\.json$/,
  /^app\/static\/audio\/manifest\.json$/,
]

/**
 * Which row a tracked file belongs to. Ordered most specific first, because a
 * path under `app/test` is a test before it is anything else.
 */
const Areas = [
  { name: 'Vendored / third-party', test: /^(vendor|gemoji)\//, project: false },
  {
    name: 'Linux TUI prototype (historical)',
    test: /^tui\//,
    project: false,
  },
  { name: 'App tests', test: /^app\/test\//, project: true },
  { name: 'App source', test: /^app\/src\//, project: true },
  { name: 'App styles', test: /^app\/styles\//, project: true },
  { name: 'Build and tooling scripts', test: /^script\//, project: true },
  { name: 'Docs and documentation site', test: /^docs\//, project: true },
  { name: 'Remote-access site', test: /^remote-site\//, project: true },
  {
    name: 'Other subprojects',
    test: /^(site|design|services|shell-extension|eslint-rules)\//,
    project: true,
  },
  { name: 'App static assets', test: /^app\/static\//, project: true },
  // Agent run manifests, verification records and audits. Tracked evidence
  // about how the project was built, not the project — counted so the row is
  // visible, excluded from the total so it cannot inflate it.
  {
    name: 'Agent run and verification records',
    test: /^\.codex\//,
    project: false,
  },
  {
    name: 'CI workflows and editor config',
    test: /^\.(github|claude|vscode)\//,
    project: true,
  },
  { name: 'Repository root', test: /^[^/]+$/, project: true },
  // A catch-all rather than a silent drop: a counted file that matched no
  // pattern above must still appear somewhere, or the total quietly
  // misrepresents the project. If this row is ever large, it is a sign the
  // list above needs a new entry, not that the files do not count.
  { name: 'Unclassified', test: /.*/, project: true },
]

function areaFor(file) {
  // Every counted file lands somewhere: the last entry matches anything.
  return Areas.find(area => area.test.test(file)) ?? null
}

function isGenerated(file) {
  return GeneratedPatterns.some(pattern => pattern.test(file))
}

export function countRepository() {
  const files = execSync('git ls-files -z', { maxBuffer: 1 << 28 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)

  const rows = new Map()
  const generated = { files: 0, lines: 0, nonBlank: 0 }

  for (const file of files) {
    const extension = (file.split('.').pop() ?? '').toLowerCase()
    if (!CountedExtensions.has(extension)) {
      continue
    }

    let text
    try {
      if (statSync(file).size > MaximumFileBytes) {
        continue
      }
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\0')) {
      continue
    }

    const all = text.length === 0 ? [] : text.split('\n')
    const lines = all.length
    const nonBlank = all.filter(line => line.trim() !== '').length

    const area = areaFor(file)
    if (area === null) {
      continue
    }

    if (isGenerated(file)) {
      generated.files++
      generated.lines += lines
      generated.nonBlank += nonBlank
    }

    const row = rows.get(area.name) ?? {
      name: area.name,
      project: area.project,
      files: 0,
      lines: 0,
      nonBlank: 0,
    }
    row.files++
    row.lines += lines
    row.nonBlank += nonBlank
    rows.set(area.name, row)
  }

  const ordered = [...rows.values()].sort((a, b) => b.lines - a.lines)
  const project = ordered.filter(row => row.project)
  const total = key => project.reduce((sum, row) => sum + row[key], 0)

  return {
    rows: ordered,
    generated,
    project: {
      files: total('files'),
      lines: total('lines'),
      nonBlank: total('nonBlank'),
    },
    commit: execSync('git rev-parse --short HEAD').toString().trim(),
  }
}

function number(value) {
  return value.toLocaleString('en-US')
}

function markdown(result) {
  const lines = [
    '| Area | Files | Lines | Non-blank |',
    '| --- | ---: | ---: | ---: |',
  ]
  for (const row of result.rows) {
    const name = row.project ? row.name : `${row.name} *(excluded)*`
    lines.push(
      `| ${name} | ${number(row.files)} | ${number(row.lines)} | ${number(
        row.nonBlank
      )} |`
    )
  }
  lines.push(
    `| **Project total** | **${number(result.project.files)}** | **${number(
      result.project.lines
    )}** | **${number(result.project.nonBlank)}** |`
  )
  lines.push('')
  lines.push(
    `Of the project total, ${number(result.generated.lines)} lines across ` +
      `${number(result.generated.files)} files are generated by tooling ` +
      `rather than written by hand.`
  )
  return lines.join('\n')
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const result = countRepository()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(markdown(result))
    console.log(`\nMeasured at ${result.commit}.`)
  }
}
