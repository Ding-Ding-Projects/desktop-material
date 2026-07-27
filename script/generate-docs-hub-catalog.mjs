#!/usr/bin/env node

/**
 * Regenerates the documentation-hub catalog consumed by docs/index.html, and
 * the static page inventories inside the hub's Features and Reference tabs.
 *
 * The hub's search runs entirely in the reader's browser, so the list of
 * documentation pages has to be baked into a static module. This script walks
 * the real Markdown tree under docs/, projects one record per page, and writes
 * docs/assets/site/docs-hub-catalog.js formatted with the repository's own
 * Prettier configuration.
 *
 * The same records are also rendered as plain HTML into managed blocks of
 * docs/index.html, so every documented feature is listed on the site itself
 * and stays readable with JavaScript switched off.
 *
 * Usage: yarn generate-docs-hub-catalog [docsDirectory] [outputPath]
 *
 * script/generate-docs-hub-catalog-test.mjs fails when the committed catalog
 * or the committed index has drifted from the tree, so CI catches a page that
 * was added, renamed, retitled or reworded without a regeneration.
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
export const DefaultIndexPath = resolve(repositoryRoot, 'docs/index.html')

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
 * Sub-tab labels. The key names a string in docs-hub-strings.js so the tab is
 * localized like the rest of the chrome; the label is the English fallback
 * that renders before the script runs and when JavaScript is unavailable.
 */
export const FeatureCategoryLabels = {
  'agent-api': { key: 'cFeatAgentTitle', label: 'Agent API' },
  collaboration: { key: 'cFeatCollabTitle', label: 'Collaboration' },
  'design-system': { key: 'cFeatDesignTitle', label: 'Design system' },
  'identity-and-workspace': {
    key: 'cFeatIdentityTitle',
    label: 'Identity and workspace',
  },
  integrations: { key: 'cFeatIntegrationsTitle', label: 'Integrations' },
  'quality-and-reliability': {
    key: 'cFeatQualityTitle',
    label: 'Quality and reliability',
  },
  'repository-management': {
    key: 'cFeatRepoTitle',
    label: 'Repository management',
  },
  'review-and-diff': { key: 'cFeatReviewTitle', label: 'Review and diff' },
}

export const ReferenceSectionLabels = {
  contributing: { key: 'secContributing', label: 'Contributing' },
  handoff: { key: 'secHandoff', label: 'Handoff records' },
  integrations: { key: 'secIntegrations', label: 'Provider integrations' },
  'learn-more': { key: 'secLearnMore', label: 'Learn more' },
  postman: { key: 'secPostman', label: 'Postman collections' },
  process: { key: 'secProcess', label: 'Process' },
  'readme-tabs': { key: 'secReadmeTabs', label: 'README tabs' },
  root: { key: 'secRoot', label: 'Top-level pages' },
  technical: { key: 'secTechnical', label: 'Technical notes' },
  verification: { key: 'secVerification', label: 'Verification records' },
  wiki: { key: 'secWiki', label: 'Wiki pages' },
}

/** Title-cases a directory name for a group the label map does not know. */
export function fallbackLabel(name) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Groups the feature documents by their category directory. The category's own
 * README is kept aside as the index page rather than listed as a feature.
 */
export function groupFeatureCategories(entries) {
  const groups = new Map()
  for (const entry of entries) {
    if (entry.c !== 'features') {
      continue
    }
    const parts = entry.s.split('/')
    if (parts.length < 3) {
      continue
    }
    const category = parts[1]
    if (!groups.has(category)) {
      groups.set(category, { name: category, index: null, pages: [] })
    }
    const group = groups.get(category)
    if (parts[2] === 'README.md') {
      group.index = entry
    } else {
      group.pages.push(entry)
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  )
}

/** Groups every non-feature page by the docs/ folder that owns it. */
export function groupReferenceSections(entries) {
  const groups = new Map()
  for (const entry of entries) {
    if (entry.c === 'features') {
      continue
    }
    if (!groups.has(entry.c)) {
      groups.set(entry.c, { name: entry.c, index: null, pages: [] })
    }
    const group = groups.get(entry.c)
    if (basename(entry.s) === 'README.md' && entry.c !== 'root') {
      group.index = entry
    } else {
      group.pages.push(entry)
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  )
}

function labelFor(labels, name) {
  return labels[name] ?? { key: null, label: fallbackLabel(name) }
}

function renderSubTab(id, route, { key, label }) {
  const localized = key === null ? '' : ` data-i18n="${key}"`
  return (
    `<a class="subtab i18n-inline" id="${id}" href="#${route}" ` +
    `data-tab="${route}"${localized}>${escapeHtml(label)}</a>`
  )
}

function renderDocumentLink(entry) {
  const description =
    entry.d === ''
      ? ''
      : `<span class="doc-link__desc">${escapeHtml(entry.d)}</span>`
  return (
    `<li><a class="doc-link" href="${escapeHtml(entry.h)}">` +
    `<span class="doc-link__title">${escapeHtml(entry.t)}</span>` +
    description +
    `<span class="doc-link__path">${escapeHtml(entry.s)}</span>` +
    '</a></li>'
  )
}

function renderSubPanel(id, route, { key, label }, group) {
  const localized = key === null ? '' : ` data-i18n="${key}"`
  const count = group.pages.length
  const countKey = count === 1 ? 'docsCountOne' : 'docsCount'
  const index =
    group.index === null
      ? ''
      : ` · <a href="${escapeHtml(group.index.h)}">` +
        '<span class="i18n-inline" data-i18n="categoryIndex">Category index</span>' +
        '</a>'
  return (
    `<section class="subpanel" id="${route}" data-tab-panel="${route}" ` +
    `aria-labelledby="${id}">` +
    `<h3 class="md-title-lg i18n-inline"${localized}>${escapeHtml(
      label
    )}</h3>` +
    '<p class="md-body subpanel__meta">' +
    `<strong>${count}</strong> ` +
    `<span class="i18n-inline" data-i18n="${countKey}">` +
    `${count === 1 ? 'document' : 'documents'}</span>` +
    index +
    '</p>' +
    '<ul class="doc-list">' +
    group.pages.map(renderDocumentLink).join('') +
    '</ul>' +
    '</section>'
  )
}

/** Renders the four managed blocks of docs/index.html, keyed by block name. */
export function renderIndexBlocks(entries) {
  const features = groupFeatureCategories(entries)
  const sections = groupReferenceSections(entries)

  const block = (groups, prefix, labels) => {
    const tabs = []
    const panels = []
    for (const group of groups) {
      const route = `${prefix}/${group.name}`
      const id = `subtab-${prefix}-${group.name}`
      const label = labelFor(labels, group.name)
      tabs.push(renderSubTab(id, route, label))
      panels.push(renderSubPanel(id, route, label, group))
    }
    return { tabs: tabs.join('\n'), panels: panels.join('\n') }
  }

  const featureBlock = block(features, 'features', FeatureCategoryLabels)
  const referenceBlock = block(sections, 'reference', ReferenceSectionLabels)

  return {
    'features-tabs': featureBlock.tabs,
    'features-panels': featureBlock.panels,
    'reference-tabs': referenceBlock.tabs,
    'reference-panels': referenceBlock.panels,
  }
}

/** Replaces the body between one pair of managed-block markers. */
export function replaceManagedBlock(html, name, body) {
  const start = `<!-- docs-hub:${name}:start -->`
  const end = `<!-- docs-hub:${name}:end -->`
  const startIndex = html.indexOf(start)
  const endIndex = html.indexOf(end)
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`the ${name} managed block is missing from the hub page`)
  }
  return (
    html.slice(0, startIndex + start.length) +
    `\n${body}\n` +
    html.slice(endIndex)
  )
}

/**
 * Builds docs/index.html exactly as it should appear on disk: the committed
 * page with its four managed blocks refreshed from the tree, then formatted
 * with the repository's own Prettier configuration.
 */
export async function buildIndexDocument({
  docsDirectory = DefaultDocsDirectory,
  indexPath = DefaultIndexPath,
  entries,
} = {}) {
  const catalog = entries ?? collectCatalog(docsDirectory)
  const original = readFileSync(indexPath, 'utf8')
  let html = original
  for (const [name, body] of Object.entries(renderIndexBlocks(catalog))) {
    html = replaceManagedBlock(html, name, body)
  }
  const options = (await prettier.resolveConfig(indexPath)) ?? {}
  const source = prettier.format(html, {
    ...options,
    filepath: indexPath,
    endOfLine: 'lf',
  })
  return {
    entries: catalog,
    source,
    usesCarriageReturns: /\r\n/.test(original),
  }
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
  indexPath = DefaultIndexPath,
} = {}) {
  const { entries, source } = await buildCatalogModule({
    docsDirectory,
    outputPath,
  })
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, source)

  const index = await buildIndexDocument({ docsDirectory, indexPath, entries })
  // Prettier always emits LF; the page keeps whatever endings it was checked
  // out with, so a regeneration never shows up as a whole-file diff.
  writeFileSync(
    indexPath,
    index.usesCarriageReturns
      ? index.source.replace(/\n/g, '\r\n')
      : index.source
  )

  return { entries, source, outputPath, indexPath }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { entries, outputPath, indexPath } = await generateDocsHubCatalog({
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
  const featureCategories = groupFeatureCategories(entries)
  console.log(
    `Generated ${entries.length} documentation catalog entries in ${outputPath}\n` +
      [...sections]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([section, count]) => `  ${section}: ${count}`)
        .join('\n') +
      `\nRefreshed ${featureCategories.length} feature category pages and ` +
      `${groupReferenceSections(entries).length} reference section pages in ` +
      indexPath
  )
}
