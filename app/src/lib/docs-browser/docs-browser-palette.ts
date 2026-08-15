/**
 * The command palette's documentation rows.
 *
 * The palette offers one row per bundled feature article so a reader reaches
 * the page they want rather than the browser's front door, which is what the
 * palette's teleport contract asks for.
 *
 * This module deliberately reads the titles-only index rather than the bundle:
 * the palette catalog is imported by a great many modules and by every
 * node-only palette test, and none of them has any use for a megabyte of
 * article prose.
 */

import type { IPaletteCommand } from '../command-palette-catalog'
import { DocsBrowserArticleSummaries } from './docs-browser-index'

/**
 * The event prefix for "open this article". The article id follows it
 * verbatim, so the handler can recover the id without a second lookup table.
 */
export const DocsArticlePaletteEventPrefix = 'palette:docs-article:'

/** The palette event that opens one article. */
export function docsArticlePaletteEvent(articleId: string): string {
  return `${DocsArticlePaletteEventPrefix}${articleId}`
}

/**
 * The article id inside a palette event, or null when the event is not one of
 * ours.
 *
 * Never guesses: an id the bundle no longer holds resolves to no article and
 * the browser opens its first page, rather than a neighbouring article that
 * happens to sort next to the missing one.
 */
export function parseDocsArticlePaletteEvent(event: string): string | null {
  if (!event.startsWith(DocsArticlePaletteEventPrefix)) {
    return null
  }
  const id = event.slice(DocsArticlePaletteEventPrefix.length)
  return id.length === 0 ? null : id
}

/**
 * One palette row per article.
 *
 * The visible title is the article's own heading, which is the documentation's
 * words rather than app chrome, so it carries no translation key: it reads the
 * same in every language mode, exactly as an article title does inside the
 * browser. The category and source path are folded into the row's search
 * keywords so "review", "diff" or the file name all find the page.
 */
export const DocsArticlePaletteCommands: ReadonlyArray<IPaletteCommand> =
  DocsBrowserArticleSummaries.map(article => ({
    event: docsArticlePaletteEvent(article.id),
    title: article.title,
    group: 'Documentation',
    materialSymbol: 'description' as const,
    keywords: `${article.category.replace(/-/g, ' ')} ${article.id.replace(
      /[-/]/g,
      ' '
    )} documentation article`,
  }))
