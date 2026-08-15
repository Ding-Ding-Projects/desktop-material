/**
 * Reading, searching and linking the offline documentation bundle.
 *
 * Everything here is pure and free of React and of the DOM, so the node-only
 * unit tests exercise the same functions the browser surface calls rather than
 * a paraphrase of them.
 *
 * The bundle itself is generated: `script/generate-docs-browser-bundle.mjs`
 * walks `docs/features` at build time and writes
 * `docs-browser-bundle.ts` (every article) and `docs-browser-index.ts` (their
 * titles alone). No article is ever fetched, so the browser works with the
 * network unplugged, which is the whole point of it.
 */

import { compileSafeRegex } from '../safe-regex'
import { DocsBrowserArticles } from './docs-browser-bundle'
import {
  DocsBrowserArticleSummaries,
  DocsBrowserCategories,
} from './docs-browser-index'
import {
  DocsBrowserLinkOrigin,
  DocsBrowserLinkTarget,
  IDocsBrowserArticle,
  IDocsBrowserArticleSummary,
  IDocsBrowserCategory,
} from './docs-browser-types'

export {
  DocsBrowserArticles,
  DocsBrowserArticleSummaries,
  DocsBrowserCategories,
  DocsBrowserLinkOrigin,
}
export {
  DocsArticlePaletteCommands,
  DocsArticlePaletteEventPrefix,
  docsArticlePaletteEvent,
  parseDocsArticlePaletteEvent,
} from './docs-browser-palette'
export type {
  DocsBrowserLinkTarget,
  IDocsBrowserArticle,
  IDocsBrowserArticleSummary,
  IDocsBrowserCategory,
}

const articlesById = new Map<string, IDocsBrowserArticle>(
  DocsBrowserArticles.map(article => [article.id, article])
)

const articlesBySourcePath = new Map<string, IDocsBrowserArticle>(
  DocsBrowserArticles.map(article => [article.sourcePath, article])
)

/** The bundled article with this id, or null when there is none. */
export function getDocsArticle(id: string): IDocsBrowserArticle | null {
  return articlesById.get(id) ?? null
}

/** The bundled article at this repository-relative path, or null. */
export function getDocsArticleBySourcePath(
  sourcePath: string
): IDocsBrowserArticle | null {
  return articlesBySourcePath.get(sourcePath) ?? null
}

/**
 * The first bundled article, used as the landing article when the browser is
 * opened without one named. Null only if the bundle were empty, which the
 * completeness guard makes impossible.
 */
export function getFirstDocsArticle(): IDocsBrowserArticle | null {
  return DocsBrowserArticles.length === 0 ? null : DocsBrowserArticles[0]
}

/** Inline Markdown that carries no meaning once the text is plain. */
const InlineMarkupExpression =
  /(?:\*\*|__|[*_`~]|^\s{0,3}#{1,6}\s|^\s{0,3}>\s?|^\s{0,3}[-*+]\s|^\s{0,3}\d+[.)]\s)/gm

const plainTextCache = new Map<string, string>()

/**
 * The article body as plain text, for searching.
 *
 * Derived lazily and cached rather than bundled as a second copy of every
 * article: storing it would double the size of the shipped bundle to spare a
 * few milliseconds once per session.
 */
export function docsBrowserPlainText(article: IDocsBrowserArticle): string {
  const cached = plainTextCache.get(article.id)
  if (cached !== undefined) {
    return cached
  }

  const text = article.markdown
    // Link labels survive; their targets do not. A reader searching for
    // "audio" wants the sentence, not every href that mentions it.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(InlineMarkupExpression, '')
    .replace(/[ \t]+/g, ' ')

  plainTextCache.set(article.id, text)
  return text
}

/** One article that matched a search, with where and how often. */
export interface IDocsBrowserMatch {
  readonly article: IDocsBrowserArticle
  /** Matches in the title or the description. */
  readonly titleMatches: number
  /** Matches in the article body. */
  readonly bodyMatches: number
  /**
   * The first body line that matched, trimmed and capped, or the empty string
   * when only the title matched.
   */
  readonly snippet: string
}

/** The outcome of one search: what matched, or why nothing could be tried. */
export interface IDocsBrowserSearchResult {
  readonly matches: ReadonlyArray<IDocsBrowserMatch>
  /**
   * The compiler's own message when a regular expression could not be built.
   * The caller shows it verbatim; an unreadable pattern is reported, never
   * silently treated as "no results".
   */
  readonly error: string | null
}

/** Longest snippet shown beneath a result row. */
const SnippetLength = 160

/** Upper bound on counted matches, so one greedy pattern cannot stall a list. */
const MaxCountedMatches = 200

function countPlainOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0
  }

  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1 && count < MaxCountedMatches) {
    count++
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/**
 * The first body line that matched, as an excerpt centred on the match.
 *
 * `locate` returns the index the match starts at within the line, or -1. The
 * excerpt is windowed rather than truncated from the left, because a snippet
 * that cuts off before the words the reader searched for tells them nothing
 * about why the article was listed.
 */
function firstMatchingLine(
  text: string,
  locate: (line: string) => number
): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }

    const at = locate(trimmed)
    if (at < 0) {
      continue
    }

    if (trimmed.length <= SnippetLength) {
      return trimmed
    }

    const start = Math.max(0, Math.min(at - 40, trimmed.length - SnippetLength))
    const end = Math.min(trimmed.length, start + SnippetLength)
    return `${start > 0 ? '…' : ''}${trimmed.slice(start, end)}${
      end < trimmed.length ? '…' : ''
    }`
  }
  return ''
}

/**
 * Search titles, descriptions and bodies.
 *
 * Plain text is the default and is matched case-insensitively. A regular
 * expression is an explicit opt-in and is compiled through the repository's
 * RE2 adapter, which is linear-time by construction, so no pattern a reader
 * can type is able to freeze the renderer.
 *
 * An empty query matches everything; that is a cleared field, not a search
 * for nothing.
 */
export function searchDocsArticles(
  articles: ReadonlyArray<IDocsBrowserArticle>,
  query: string,
  regexEnabled: boolean,
  caseSensitive: boolean = false
): IDocsBrowserSearchResult {
  const trimmed = query.trim()

  if (trimmed.length === 0) {
    return {
      matches: articles.map(article => ({
        article,
        titleMatches: 0,
        bodyMatches: 0,
        snippet: '',
      })),
      error: null,
    }
  }

  if (regexEnabled) {
    const { regex, error } = compileSafeRegex(trimmed, caseSensitive)
    if (regex === null) {
      return { matches: [], error }
    }

    const matches = new Array<IDocsBrowserMatch>()
    for (const article of articles) {
      const heading = `${article.title}\n${article.description}`
      const body = docsBrowserPlainText(article)
      const titleMatches = regex.findAll(heading, MaxCountedMatches).matches
        .length
      const bodyMatches = regex.findAll(body, MaxCountedMatches).matches.length
      if (titleMatches + bodyMatches === 0) {
        continue
      }
      matches.push({
        article,
        titleMatches,
        bodyMatches,
        snippet:
          bodyMatches === 0
            ? ''
            : firstMatchingLine(body, line => {
                const found = regex.findAll(line, 1)
                return found.matches.length === 0 ? -1 : found.matches[0].index
              }),
      })
    }
    return { matches, error: null }
  }

  const needle = caseSensitive ? trimmed : trimmed.toLowerCase()
  const fold = (value: string) => (caseSensitive ? value : value.toLowerCase())

  const matches = new Array<IDocsBrowserMatch>()
  for (const article of articles) {
    const heading = fold(`${article.title}\n${article.description}`)
    const body = docsBrowserPlainText(article)
    const titleMatches = countPlainOccurrences(heading, needle)
    const bodyMatches = countPlainOccurrences(fold(body), needle)
    if (titleMatches + bodyMatches === 0) {
      continue
    }
    matches.push({
      article,
      titleMatches,
      bodyMatches,
      snippet:
        bodyMatches === 0
          ? ''
          : firstMatchingLine(body, line => fold(line).indexOf(needle)),
    })
  }
  return { matches, error: null }
}

/**
 * Where a link clicked inside a rendered article actually points.
 *
 * Every relative link in the bundle was rewritten onto
 * {@link DocsBrowserLinkOrigin} at build time, so a link to another article
 * arrives here as an absolute URL and resolves to that article. A link to a
 * repository path that is not a bundled article resolves to `unbundled` and
 * the browser says which path it was, rather than swallowing the click.
 */
export function resolveDocsBrowserLink(href: string): DocsBrowserLinkTarget {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { kind: 'unreadable', href }
  }

  if (url.origin !== DocsBrowserLinkOrigin) {
    return { kind: 'external', href }
  }

  const path = decodeURI(url.pathname).replace(/^\/+/, '')
  const article = getDocsArticleBySourcePath(path)
  if (article === null) {
    return { kind: 'unbundled', path }
  }

  return {
    kind: 'article',
    article,
    fragment: url.hash.length > 1 ? decodeURI(url.hash.slice(1)) : null,
  }
}

/** The file formats an export can be written in. */
export type DocsBrowserExportFormat = 'markdown' | 'text' | 'json'

/** The file extension each export format writes. */
export const DocsBrowserExportExtensions: Readonly<
  Record<DocsBrowserExportFormat, string>
> = {
  markdown: 'md',
  text: 'txt',
  json: 'json',
}

/**
 * Serialises the selected articles.
 *
 * Every format carries the whole article — id, title, source path and body —
 * so no format silently drops a field. Markdown is the articles' own
 * language and round-trips; plain text is the same content with the markup
 * removed, which is stated in its header rather than left for the reader to
 * discover; JSON is the structured form a script can consume.
 */
export function exportDocsArticles(
  articles: ReadonlyArray<IDocsBrowserArticle>,
  format: DocsBrowserExportFormat
): string {
  if (format === 'json') {
    return `${JSON.stringify(
      articles.map(article => ({
        id: article.id,
        category: article.category,
        title: article.title,
        description: article.description,
        sourcePath: article.sourcePath,
        markdown: article.markdown,
      })),
      null,
      2
    )}\n`
  }

  if (format === 'text') {
    return `${articles
      .map(article =>
        [
          article.title,
          '='.repeat(article.title.length),
          `Source: ${article.sourcePath}`,
          'Markup removed; the Markdown export keeps it.',
          '',
          docsBrowserPlainText(article).trim(),
        ].join('\n')
      )
      .join('\n\n\n')}\n`
  }

  return `${articles
    .map(article =>
      [
        `# ${article.title}`,
        '',
        `<!-- ${article.sourcePath} -->`,
        '',
        article.markdown,
      ].join('\n')
    )
    .join('\n\n---\n\n')}\n`
}

/** A stable, clock-free export file name for a selection. */
export function docsBrowserExportFileName(
  articles: ReadonlyArray<IDocsBrowserArticle>,
  format: DocsBrowserExportFormat
): string {
  const extension = DocsBrowserExportExtensions[format]
  if (articles.length === 1) {
    return `${articles[0].id.replace(/\//g, '-')}.${extension}`
  }
  return `desktop-material-documentation-${articles.length}-articles.${extension}`
}
