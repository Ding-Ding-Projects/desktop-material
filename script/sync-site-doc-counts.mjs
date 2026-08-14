#!/usr/bin/env node
//
// Rewrites the counts the site prints so they match what the repository
// actually contains: the Docs hub's article counts, and the Screenshots
// section's scene count.
//
//   node script/sync-site-doc-counts.mjs [--check]
//
// The hub advertises "36 articles" on the Repository management card and
// "Open all 248 articles" above them, and the Screenshots section says the
// refresh contract "targets 92 Windows scenes". Those are claims about the
// tree, and a claim nobody recomputes is a claim that goes quietly wrong the
// first time somebody adds a feature doc or a capture. This script recounts
// and rewrites them; `script/site-dc-pages-test.mjs` runs the same comparison
// and fails when they have drifted, so the fix is always one command.
//
// The scene count is here rather than only in the test for a reason: it
// appears FOUR times in `site/index.html` — the section's prose, the "Browse
// all N scenes" link, the search index entry and the command-palette entry —
// and the test only ever checked the first two. Fixing the two it checks would
// have left the other two quoting a stale number, visible to anyone who
// searched instead of scrolled.
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

/**
 * How many scenes the feature gallery documents.
 *
 * One row per capture in `docs/wiki/Feature-Gallery.md`. Exported so the Pages
 * test can assert against the same number this script writes — two independent
 * regexes over the same table is two chances for the check and the fix to
 * disagree about what "a scene" is.
 */
export function countGalleryScenes() {
  const gallery = readFileSync(
    join(repositoryRoot, 'docs/wiki/Feature-Gallery.md'),
    'utf8'
  )
  return [...gallery.matchAll(/^\| `([^`]+\.png)` \| ([^|]+?) \|$/gm)].length
}

/** The exact strings the hub should be printing, given what is on disk. */
export function expectedCounts() {
  const counts = countDocs(listMarkdown)
  const cards = {}
  for (const category of DOC_CATEGORIES) {
    const n = counts.perCategory[category.dir]
    cards[category.id] = `${n} article${n === 1 ? '' : 's'}`
  }
  return { cards, total: counts.total, scenes: countGalleryScenes() }
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

  // All four places the scene count is quoted, not just the two the Pages test
  // happens to assert: the section's prose and its link, plus the search-index
  // entry and the command-palette entry, which a reader reaches by searching
  // rather than scrolling and which would otherwise keep a stale number.
  next = next
    .replace(
      /targets \d+ Windows scenes/g,
      `targets ${expected.scenes} Windows scenes`
    )
    .replace(/Browse all \d+ scenes/g, `Browse all ${expected.scenes} scenes`)
    .replace(
      /\d+ Windows scenes under the current refresh contract/g,
      `${expected.scenes} Windows scenes under the current refresh contract`
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
      `site/index.html already matches the tree: ${expected.total} articles ` +
        `total, ${expected.scenes} gallery scenes, ` +
        `${Object.values(expected.cards).join(', ')}.\n`
    )
  } else if (checkOnly) {
    process.stderr.write(
      'site/index.html advertises counts the tree no longer matches ' +
        '(articles, gallery scenes, or both).\n' +
        'Run: node script/sync-site-doc-counts.mjs\n'
    )
    process.exitCode = 1
  } else {
    writeFileSync(pagePath, after)
    process.stdout.write(
      `Updated site/index.html: ${expected.total} articles total, ` +
        `${expected.scenes} gallery scenes, ` +
        `${Object.values(expected.cards).join(', ')}.\n`
    )
  }
}
