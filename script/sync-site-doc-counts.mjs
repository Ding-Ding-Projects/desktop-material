#!/usr/bin/env node
//
// Rewrites the article counts the site's Docs hub prints so they match what
// `docs/` actually contains.
//
//   node script/sync-site-doc-counts.mjs [--check]
//
// The hub advertises "36 articles" on the Repository management card and
// "Open all 248 articles" above them. Those are claims about the published
// tree, and a claim nobody recomputes is a claim that goes quietly wrong the
// first time somebody adds a feature doc. This script recounts and rewrites
// them; `script/site-dc-pages-test.mjs` runs the same comparison and fails the
// Pages build when they have drifted, so the fix is always one command.
//
// `--check` reports without writing, which is what the test harness uses.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DOC_CATEGORIES, countDocs } from './site-dc-assets.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const listMarkdown = relative => {
  const walk = directory => {
    let found = []
    for (const entry of readdirSync(join(repositoryRoot, directory), {
      withFileTypes: true,
    })) {
      const child = `${directory}/${entry.name}`
      if (entry.isDirectory()) found = found.concat(walk(child))
      else found.push(child)
    }
    return found
  }
  return walk(relative)
}

/** The exact strings the hub should be printing, given what is on disk. */
export function expectedCounts() {
  const counts = countDocs(listMarkdown)
  const cards = {}
  for (const category of DOC_CATEGORIES) {
    const n = counts.perCategory[category.dir]
    cards[category.id] = `${n} article${n === 1 ? '' : 's'}`
  }
  return { cards, total: counts.total }
}

/** Applies the counts to the page source, returning the rewritten text. */
export function applyCounts(html, expected) {
  let next = html
  for (const [id, articles] of Object.entries(expected.cards)) {
    const pattern = new RegExp(
      `(\\{ id: '${id}',[^}]*?articles: ')[^']*(')`,
      'g'
    )
    if (!pattern.test(next)) {
      throw new Error(`no docCategories entry for ${id} in site/index.html`)
    }
    next = next.replace(pattern, `$1${articles}$2`)
  }
  // Both language labels quote the same site-wide total.
  next = next
    .replace(
      /docsOpenAll: 'Open all \d+ articles'/,
      `docsOpenAll: 'Open all ${expected.total} articles'`
    )
    .replace(
      /docsOpenAll: '打開全部 \d+ 篇文'/,
      `docsOpenAll: '打開全部 ${expected.total} 篇文'`
    )
  return next
}

// Importable without side effects: site-dc-pages-test.mjs reuses the two
// functions above, and only a direct invocation touches the file.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const pagePath = join(repositoryRoot, 'site', 'index.html')
  const before = readFileSync(pagePath, 'utf8')
  const expected = expectedCounts()
  const after = applyCounts(before, expected)
  const checkOnly = process.argv.includes('--check')

  if (before === after) {
    process.stdout.write(
      `site/index.html already matches docs/: ${expected.total} articles ` +
        `total, ${Object.values(expected.cards).join(', ')}.\n`
    )
  } else if (checkOnly) {
    process.stderr.write(
      'site/index.html advertises article counts that docs/ no longer ' +
        'matches.\nRun: node script/sync-site-doc-counts.mjs\n'
    )
    process.exitCode = 1
  } else {
    writeFileSync(pagePath, after)
    process.stdout.write(
      `Updated site/index.html: ${expected.total} articles total, ` +
        `${Object.values(expected.cards).join(', ')}.\n`
    )
  }
}
