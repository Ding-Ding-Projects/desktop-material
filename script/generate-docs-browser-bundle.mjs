#!/usr/bin/env node

/**
 * Regenerates the offline documentation bundle the in-app documentation
 * browser reads.
 *
 * The app ships a full feature-documentation browser inside itself. It must
 * work with the network unplugged, so every article under `docs/features` is
 * baked into the build rather than fetched, and the browser imports the two
 * modules this script writes:
 *
 *   app/src/lib/docs-browser/docs-browser-bundle.ts   every article, in full
 *   app/src/lib/docs-browser/docs-browser-index.ts    titles only, for the
 *                                                     command palette
 *
 * The index exists so the command palette can offer one row per article
 * without pulling a megabyte of prose into every module that imports the
 * palette catalog. Both files come out of a single walk of the tree, so they
 * cannot disagree with each other, and `app/test/unit/docs-browser-bundle-test.ts`
 * re-walks `docs/features` and fails when either has drifted from the files on
 * disk — bundling drops a file exactly as easily as it includes one, and the
 * file it drops is whichever was added most recently.
 *
 * The Markdown parsing helpers are imported from
 * `script/generate-docs-hub-catalog.mjs` rather than reimplemented, so the
 * title and description of an article read identically in the app and on the
 * documentation site.
 *
 * Three deterministic transforms are applied to each article body:
 *
 *  1. Images are replaced with a bracketed note naming the alt text and the
 *     source. Ten of the images in the tree are absolute
 *     `raw.githubusercontent.com` URLs, and an offline browser that quietly
 *     fetches ten pictures off the internet is not an offline browser.
 *  2. Every relative link is rewritten to an absolute URL on a reserved
 *     `.invalid` host. The app's shared Markdown renderer only reports a
 *     clicked link when its protocol is http(s), so without this an
 *     article-to-article link is a dead end that reports nothing; with it the
 *     browser resolves the target itself and says so when nothing matches.
 *  3. Hard-wrapped prose is unwrapped into one line per paragraph. The shared
 *     renderer runs marked with `breaks: true`, which turns every source line
 *     ending into a `<br>`; without this the documentation renders ragged at
 *     the exact 80-column boundary the files are authored to.
 *
 * Nothing here reads a clock, the network, or anything outside the docs tree,
 * so a regeneration on any machine produces byte-identical output.
 *
 * Usage: node script/generate-docs-browser-bundle.mjs [featuresDirectory]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import prettier from 'prettier'

import {
  describeDocument,
  findHeadingIndex,
  titleFor,
  walkMarkdown,
} from './generate-docs-hub-catalog.mjs'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

export const DefaultFeaturesDirectory = resolve(
  repositoryRoot,
  'docs/features'
)

export const DefaultBundlePath = resolve(
  repositoryRoot,
  'app/src/lib/docs-browser/docs-browser-bundle.ts'
)

export const DefaultIndexPath = resolve(
  repositoryRoot,
  'app/src/lib/docs-browser/docs-browser-index.ts'
)

/**
 * The host every in-bundle link is rewritten onto.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so a link that
 * somehow escaped the browser's own interception would fail closed rather
 * than reach a real server. The renderer intercepts and cancels every click
 * regardless; this is the belt to that pair of braces.
 *
 * Kept in step with `DocsBrowserLinkOrigin` in
 * `app/src/lib/docs-browser/docs-browser-types.ts` by the bundle test.
 */
export const DocsBrowserLinkOrigin = 'https://docs.desktop-material.invalid'

/** Where the articles live, relative to the repository root. */
export const FeaturesRoot = 'docs/features'

/** Opens or closes a fenced code block. */
const FenceExpression = /^\s{0,3}(?:```|~~~)/

/**
 * A line that begins a block of its own, and so may never be folded into the
 * line above it: a heading, a list item, a block quote, a table row, raw HTML,
 * a thematic break or a code fence.
 */
const BlockStartExpression =
  /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||<|```|~~~|(?:-{3,}|\*{3,}|_{3,})\s*$)/

/**
 * A line that owns its own line entirely, and so may never have the line below
 * folded into it. Headings, table rows and raw HTML all change meaning when a
 * following sentence is appended to them.
 */
const AtomicLineExpression =
  /^\s{0,3}(?:#{1,6}\s|\||<|(?:-{3,}|\*{3,}|_{3,})\s*$)/

/**
 * A line opening with an *inline* HTML element rather than a block one.
 *
 * The documentation uses `<kbd>` heavily for key names, and hard wrapping puts
 * one at the start of a line often enough to matter. Markdown treats these as
 * part of the surrounding paragraph, so refusing to fold them leaves a
 * sentence broken in half at exactly the place a reader is trying to read a
 * shortcut.
 */
const InlineHtmlExpression =
  /^\s{0,3}<\/?(?:kbd|code|b|i|em|strong|sub|sup|a|span|small|br)\b/i

/** Whether a line begins a block that must keep its own line. */
function startsBlock(line) {
  return BlockStartExpression.test(line) && !InlineHtmlExpression.test(line)
}

/** Whether a line refuses to have the following line folded into it. */
function isAtomicLine(line) {
  return AtomicLineExpression.test(line) && !InlineHtmlExpression.test(line)
}

/** `![alt](src)` or `![alt](src "title")`, with alt text that may wrap. */
const ImageExpression = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g

/** `](target)` — matched without the label so a wrapped label still resolves. */
const LinkTargetExpression = /\]\(\s*([^)\s]+)(?:(\s+"[^"]*")?)\s*\)/g

/** A URL that already names its own scheme, and is therefore left alone. */
const AbsoluteUrlExpression = /^[a-z][a-z0-9+.-]*:/i

/**
 * Splits a document into alternating prose and fenced-code segments.
 *
 * Rewriting runs on the prose segments only: an image or a link inside a
 * fenced block is a code sample being shown to the reader, and editing it
 * would be editing the documentation rather than presenting it.
 */
export function splitFencedSegments(markdown) {
  const segments = []
  let current = { fenced: false, lines: [] }
  let inFence = false

  for (const line of markdown.split(/\r?\n/)) {
    const isFence = FenceExpression.test(line)
    if (isFence && !inFence) {
      segments.push(current)
      current = { fenced: true, lines: [line] }
      inFence = true
      continue
    }
    if (isFence && inFence) {
      current.lines.push(line)
      segments.push(current)
      current = { fenced: false, lines: [] }
      inFence = false
      continue
    }
    current.lines.push(line)
  }

  segments.push(current)
  return segments.filter(segment => segment.lines.length > 0)
}

/** Rejoins the segments produced by {@link splitFencedSegments}. */
export function joinFencedSegments(segments) {
  return segments.map(segment => segment.lines.join('\n')).join('\n')
}

/**
 * Normalises a POSIX-style relative path, resolving `.` and `..` without ever
 * escaping above the repository root.
 */
export function normalizeDocPath(base, target) {
  const parts = target.startsWith('/')
    ? target.slice(1).split('/')
    : [...base.split('/'), ...target.split('/')]
  const stack = []
  for (const part of parts) {
    if (part === '' || part === '.') {
      continue
    }
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

/**
 * Rewrites one link target onto the bundle's own origin, or leaves it exactly
 * as it was when it already names a scheme of its own.
 *
 * `sourcePath` is the article's repository-relative path, so a link is
 * resolved against the directory that actually contains it.
 */
export function rewriteLinkTarget(target, sourcePath) {
  if (AbsoluteUrlExpression.test(target)) {
    return target
  }

  const hashIndex = target.indexOf('#')
  const path = hashIndex === -1 ? target : target.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? '' : target.slice(hashIndex)

  const resolved =
    path === ''
      ? sourcePath
      : normalizeDocPath(dirname(sourcePath).split(sep).join('/'), path)

  return `${DocsBrowserLinkOrigin}/${encodeURI(resolved)}${fragment}`
}

/**
 * Replaces an image with a bracketed note naming what it showed.
 *
 * The note keeps the alt text and the source so a reader can still find the
 * picture in the repository or on the documentation site, and states plainly
 * that it is not part of the offline bundle rather than rendering a broken
 * image frame and leaving them to guess why.
 */
export function neutralizeImages(markdown) {
  return markdown.replace(ImageExpression, (_match, alt, source) => {
    const described = alt.replace(/\s+/g, ' ').trim()
    const label = described === '' ? source : `${described} — ${source}`
    return `\`[image not bundled offline: ${label}]\``
  })
}

/** Rewrites every relative link in one prose segment. */
export function rewriteLinks(markdown, sourcePath) {
  return markdown.replace(LinkTargetExpression, (match, target, title) => {
    const rewritten = rewriteLinkTarget(target, sourcePath)
    if (rewritten === target) {
      return match
    }
    return `](${rewritten}${title ?? ''})`
  })
}

/**
 * Folds hard-wrapped prose back into one line per paragraph.
 *
 * Only a plain continuation line is folded: never a heading, list item, block
 * quote, table row, raw HTML, thematic break or anything inside a fence, and
 * never into a line whose meaning would change by having a sentence appended
 * to it.
 */
export function unwrapProse(markdown) {
  const lines = markdown.split(/\r?\n/)
  const output = []
  let inFence = false

  for (const line of lines) {
    if (FenceExpression.test(line)) {
      inFence = !inFence
      output.push(line)
      continue
    }

    if (inFence) {
      output.push(line)
      continue
    }

    const previous = output.length === 0 ? null : output[output.length - 1]
    const foldable =
      previous !== null &&
      previous.trim() !== '' &&
      line.trim() !== '' &&
      !startsBlock(line) &&
      !isAtomicLine(previous) &&
      !FenceExpression.test(previous)

    if (foldable) {
      output[output.length - 1] = `${previous.replace(
        /\s+$/,
        ''
      )} ${line.trim()}`
      continue
    }

    output.push(line)
  }

  return output.join('\n')
}

/**
 * Drops the article's own level-one heading.
 *
 * The browser renders the title in its own header, and a document that opens
 * with the same words twice reads like a rendering fault.
 */
export function stripLeadingHeading(lines, headingIndex) {
  if (headingIndex < 0) {
    return lines
  }
  const remaining = [...lines]
  remaining.splice(headingIndex, 1)
  while (remaining.length > 0 && remaining[0].trim() === '') {
    remaining.shift()
  }
  return remaining
}

/** Applies every body transform, in the one order that composes correctly. */
export function transformBody(body, sourcePath) {
  const segments = splitFencedSegments(body).map(segment =>
    segment.fenced
      ? segment
      : {
          fenced: false,
          lines: rewriteLinks(
            neutralizeImages(segment.lines.join('\n')),
            sourcePath
          ).split('\n'),
        }
  )

  return unwrapProse(joinFencedSegments(segments)).trim()
}

/** The category a feature article belongs to: its first directory segment. */
export function categoryOf(articleId) {
  const slash = articleId.indexOf('/')
  return slash === -1 ? 'root' : articleId.slice(0, slash)
}

/** Title-cases a directory name for display when no translation is offered. */
export function categoryLabel(name) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Projects one bundle record per feature article, ordered by article id. */
export function collectArticles(featuresDirectory = DefaultFeaturesDirectory) {
  const articles = []

  for (const file of walkMarkdown(featuresDirectory)) {
    const relativePath = relative(featuresDirectory, file)
      .split(sep)
      .join('/')
    const id = relativePath.replace(/\.md$/, '')
    const sourcePath = `${FeaturesRoot}/${relativePath}`
    const raw = readFileSync(file, 'utf8')
    const lines = raw.split(/\r?\n/)
    const headingIndex = findHeadingIndex(lines)

    articles.push({
      id,
      category: categoryOf(id),
      title: titleFor(lines, relativePath),
      description: describeDocument(lines, headingIndex),
      sourcePath,
      markdown: transformBody(
        stripLeadingHeading(lines, headingIndex).join('\n'),
        sourcePath
      ),
    })
  }

  return articles.sort((left, right) => left.id.localeCompare(right.id))
}

/** Every category present, with a display label, ordered by name. */
export function collectCategories(articles) {
  const names = [...new Set(articles.map(article => article.category))]
  return names.sort().map(name => ({
    name,
    label: categoryLabel(name),
    count: articles.filter(article => article.category === name).length,
  }))
}

const GeneratedHeader = (name, command) => `/**
 * ${name}
 *
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: ${command}
 *
 * Built from the real Markdown tree under \`docs/features\`.
 * \`app/test/unit/docs-browser-bundle-test.ts\` fails when this file has
 * drifted from the files on disk, so an article added, renamed, retitled or
 * reworded without a regeneration is caught before it ships.
 */`

/** Renders the full-article bundle module, before Prettier formatting. */
export function renderBundleModule(articles) {
  const body = articles
    .map(
      article => `  {
    id: ${JSON.stringify(article.id)},
    category: ${JSON.stringify(article.category)},
    title: ${JSON.stringify(article.title)},
    description: ${JSON.stringify(article.description)},
    sourcePath: ${JSON.stringify(article.sourcePath)},
    markdown: ${JSON.stringify(article.markdown)},
  }`
    )
    .join(',\n')

  return `${GeneratedHeader(
    'Every feature article, bundled for the in-app documentation browser.',
    'yarn generate-docs-browser-bundle'
  )}

import { IDocsBrowserArticle } from './docs-browser-types'

/** Every article under \`docs/features\`, ordered by article id. */
export const DocsBrowserArticles: ReadonlyArray<IDocsBrowserArticle> = [
${body},
]
`
}

/** Renders the metadata-only index module, before Prettier formatting. */
export function renderIndexModule(articles, categories) {
  const entries = articles
    .map(
      article => `  {
    id: ${JSON.stringify(article.id)},
    category: ${JSON.stringify(article.category)},
    title: ${JSON.stringify(article.title)},
    description: ${JSON.stringify(article.description)},
    sourcePath: ${JSON.stringify(article.sourcePath)},
  }`
    )
    .join(',\n')

  const categoryEntries = categories
    .map(
      category => `  {
    name: ${JSON.stringify(category.name)},
    label: ${JSON.stringify(category.label)},
    count: ${category.count},
  }`
    )
    .join(',\n')

  return `${GeneratedHeader(
    'Feature-article titles, without their bodies.',
    'yarn generate-docs-browser-bundle'
  )}

import {
  IDocsBrowserArticleSummary,
  IDocsBrowserCategory,
} from './docs-browser-types'

/**
 * One summary per bundled article, ordered by article id.
 *
 * The command palette offers a row per article and must not drag a megabyte
 * of prose into every module that imports the palette catalog, so it reads
 * this rather than the bundle itself.
 */
export const DocsBrowserArticleSummaries: ReadonlyArray<IDocsBrowserArticleSummary> =
  [
${entries},
  ]

/** Every category directory present under \`docs/features\`. */
export const DocsBrowserCategories: ReadonlyArray<IDocsBrowserCategory> = [
${categoryEntries},
]

/** How many articles the bundle carries. Asserted against the tree in CI. */
export const DocsBrowserArticleCount = ${articles.length}
`
}

/** Builds both modules exactly as they should appear on disk. */
export async function buildDocsBrowserBundle({
  featuresDirectory = DefaultFeaturesDirectory,
  bundlePath = DefaultBundlePath,
  indexPath = DefaultIndexPath,
} = {}) {
  const articles = collectArticles(featuresDirectory)
  const categories = collectCategories(articles)

  const bundleOptions = (await prettier.resolveConfig(bundlePath)) ?? {}
  const indexOptions = (await prettier.resolveConfig(indexPath)) ?? {}

  return {
    articles,
    categories,
    bundleSource: prettier.format(renderBundleModule(articles), {
      ...bundleOptions,
      filepath: bundlePath,
      // The generator always emits LF; Git applies the checkout's own endings.
      endOfLine: 'lf',
    }),
    indexSource: prettier.format(renderIndexModule(articles, categories), {
      ...indexOptions,
      filepath: indexPath,
      endOfLine: 'lf',
    }),
  }
}

export async function generateDocsBrowserBundle({
  featuresDirectory = DefaultFeaturesDirectory,
  bundlePath = DefaultBundlePath,
  indexPath = DefaultIndexPath,
} = {}) {
  const { articles, categories, bundleSource, indexSource } =
    await buildDocsBrowserBundle({ featuresDirectory, bundlePath, indexPath })

  mkdirSync(dirname(bundlePath), { recursive: true })
  writeFileSync(bundlePath, bundleSource)
  mkdirSync(dirname(indexPath), { recursive: true })
  writeFileSync(indexPath, indexSource)

  return { articles, categories, bundlePath, indexPath }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { articles, categories, bundlePath, indexPath } =
    await generateDocsBrowserBundle({
      featuresDirectory:
        process.argv[2] === undefined
          ? DefaultFeaturesDirectory
          : resolve(process.argv[2]),
    })

  console.log(
    `Bundled ${articles.length} feature articles into ${bundlePath}\n` +
      categories
        .map(category => `  ${category.name}: ${category.count}`)
        .join('\n') +
      `\nWrote ${articles.length} article summaries to ${indexPath}`
  )
}
