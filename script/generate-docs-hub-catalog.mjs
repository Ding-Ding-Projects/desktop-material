#!/usr/bin/env node

/**
 * Regenerates the documentation-hub catalog consumed by docs/index.html.
 *
 * The hub's search runs entirely in the reader's browser, so the list of
 * documentation pages has to be baked into a static module. This script walks
 * the real Markdown tree under docs/, projects one record per page, and writes
 * docs/assets/site/docs-hub-catalog.js formatted with the repository's own
 * Prettier configuration.
 *
 * Usage: yarn generate-docs-hub-catalog [docsDirectory] [outputPath]
 *
 * script/generate-docs-hub-catalog-test.mjs fails when the committed catalog
 * has drifted from the tree, so CI catches a page that was added, renamed,
 * retitled or reworded without a regeneration.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import prettier from 'prettier'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

export const DefaultDocsDirectory = resolve(repositoryRoot, 'docs')
export const DefaultOutputPath = resolve(
  repositoryRoot,
  'docs/assets/site/docs-hub-catalog.js'
)

/** Directories under docs/ that hold no documentation pages. */
const IgnoredDirectories = new Set(['assets'])

/** Descriptions longer than this are cut on a word boundary. */
const MaximumDescriptionLength = 180
const DescriptionCutLength = 177
const MinimumCutBoundary = 120
/** Stop collecting a description once the raw text passes this length. */
const DescriptionCollectionLimit = 200

/** Yields every Markdown file under `directory`, depth first. */
export function* walkMarkdown(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (IgnoredDirectories.has(entry.name)) {
        continue
      }
      yield* walkMarkdown(full)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      yield full
    }
  }
}

/** Reduces inline Markdown to the plain text a search index should hold. */
export function stripInline(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Locates the document's first level-one heading. Returns the heading index so
 * the description can start immediately after it, and -1 when there is none.
 */
export function findHeadingIndex(lines) {
  return lines.findIndex(line => /^#\s+\S/.test(line))
}

/** The page title: its first heading, or a name derived from the file name. */
export function titleFor(lines, relativePath) {
  const headingIndex = findHeadingIndex(lines)
  if (headingIndex >= 0) {
    return stripInline(lines[headingIndex].replace(/^#\s+/, ''))
  }
  return basename(relativePath, '.md')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

/**
 * The document's first prose paragraph, or its first list item when the
 * heading is followed straight by a list. Fenced code, block quotes, tables,
 * raw HTML and images are skipped rather than summarised.
 */
export function describeDocument(lines, headingIndex) {
  const collected = []
  for (let i = headingIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') {
      if (collected.length > 0) {
        break
      }
      continue
    }
    if (/^#{1,6}\s/.test(line)) {
      if (collected.length > 0) {
        break
      }
      continue
    }
    if (/^(```|>|\||<|!\[)/.test(line)) {
      if (collected.length > 0) {
        break
      }
      continue
    }
    if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) {
      collected.push(line.replace(/^[-*+]\s/, '').replace(/^\d+\.\s/, ''))
      break
    }
    collected.push(line)
    if (collected.join(' ').length > DescriptionCollectionLimit) {
      break
    }
  }

  const text = stripInline(collected.join(' '))
  if (text.length <= MaximumDescriptionLength) {
    return text
  }
  const cut = text.slice(0, DescriptionCutLength)
  const boundary = cut.lastIndexOf(' ')
  return `${boundary > MinimumCutBoundary ? cut.slice(0, boundary) : cut}…`
}

/**
 * The URL the Pages build publishes for a documentation source path.
 *
 * The build renders docs/<x>.md to <x>.html and docs/<dir>/README.md to
 * <dir>/index.html, so a directory README is addressed by its directory. Both
 * mappings hold under the pandoc pipeline and under a plain Jekyll /docs
 * source, which is why the hub links this way rather than at .md or github.com.
 */
export function renderedHref(relativePath) {
  const directory = dirname(relativePath)
  if (basename(relativePath) === 'README.md') {
    return directory === '.' ? 'README.html' : `${directory}/`
  }
  return relativePath.replace(/\.md$/, '.html')
}

/** The top-level docs/ folder a page belongs to; root-level pages are 'root'. */
export function sectionOf(relativePath) {
  const directory = dirname(relativePath)
  return directory === '.' ? 'root' : directory.split('/')[0]
}

/** Projects one catalog record per Markdown page, ordered by source path. */
export function collectCatalog(docsDirectory = DefaultDocsDirectory) {
  const entries = []
  for (const file of walkMarkdown(docsDirectory)) {
    const relativePath = relative(docsDirectory, file).split(sep).join('/')
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    entries.push({
      t: titleFor(lines, relativePath),
      h: renderedHref(relativePath),
      s: relativePath,
      c: sectionOf(relativePath),
      d: describeDocument(lines, findHeadingIndex(lines)),
    })
  }
  return entries.sort((left, right) => left.s.localeCompare(right.s))
}

/** Renders the catalog module source, before Prettier formatting. */
export function renderCatalogModule(entries) {
  const body = entries.map(entry => `  ${JSON.stringify(entry)}`).join(',\n')

  return `/**
 * Desktop Material documentation catalog.
 *
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: yarn generate-docs-hub-catalog
 *
 * Built from the real Markdown tree under \`docs\`. Each record is
 * \`{ t: title, h: rendered href, s: source path, c: category, d: description }\`.
 * script/generate-docs-hub-catalog-test.mjs fails when this file drifts from
 * the tree, so a page added, renamed, retitled or reworded without a
 * regeneration is caught in CI.
 */
;(function (global) {
  'use strict'
  global.DesktopMaterialDocsCatalog = [
${body}
  ]
})(typeof window === 'undefined' ? globalThis : window)
`
}

/**
 * Builds the catalog module text exactly as it should appear on disk, using
 * the repository's Prettier configuration so a regeneration never breaks lint.
 */
export async function buildCatalogModule({
  docsDirectory = DefaultDocsDirectory,
  outputPath = DefaultOutputPath,
} = {}) {
  const entries = collectCatalog(docsDirectory)
  const options = (await prettier.resolveConfig(outputPath)) ?? {}
  const source = prettier.format(renderCatalogModule(entries), {
    ...options,
    filepath: outputPath,
    // The generator always emits LF; Git applies the checkout's own endings.
    endOfLine: 'lf',
  })
  return { entries, source }
}

export async function generateDocsHubCatalog({
  docsDirectory = DefaultDocsDirectory,
  outputPath = DefaultOutputPath,
} = {}) {
  const { entries, source } = await buildCatalogModule({
    docsDirectory,
    outputPath,
  })
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, source)
  return { entries, source, outputPath }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { entries, outputPath } = await generateDocsHubCatalog({
    docsDirectory:
      process.argv[2] === undefined
        ? DefaultDocsDirectory
        : resolve(process.argv[2]),
    outputPath:
      process.argv[3] === undefined
        ? DefaultOutputPath
        : resolve(process.argv[3]),
  })
  const sections = new Map()
  for (const entry of entries) {
    sections.set(entry.c, (sections.get(entry.c) ?? 0) + 1)
  }
  console.log(
    `Generated ${entries.length} documentation catalog entries in ${outputPath}\n` +
      [...sections]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([section, count]) => `  ${section}: ${count}`)
        .join('\n')
  )
}
