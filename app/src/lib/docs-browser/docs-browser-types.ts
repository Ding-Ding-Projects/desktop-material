/**
 * The shapes the offline documentation bundle is written in.
 *
 * `script/generate-docs-browser-bundle.mjs` emits two generated modules
 * against these interfaces — the full articles and a titles-only index — so
 * the generator and the browser share one definition of what an article is
 * rather than agreeing by coincidence.
 */

/** One bundled feature article, without its body. */
export interface IDocsBrowserArticleSummary {
  /**
   * The article's stable id: its path under `docs/features` without the
   * extension, e.g. `design-system/audio-system`.
   *
   * Stable across renames of the *title*; a renamed file is a new article, and
   * the command palette's row event carries this id verbatim.
   */
  readonly id: string

  /** The first path segment of the article's `id`, e.g. `design-system`. */
  readonly category: string

  /** The article's first level-one heading. */
  readonly title: string

  /** The article's first prose paragraph, cut on a word boundary. */
  readonly description: string

  /** Repository-relative source path, e.g. `docs/features/x/y.md`. */
  readonly sourcePath: string
}

/** One bundled feature article, body included. */
export interface IDocsBrowserArticle extends IDocsBrowserArticleSummary {
  /**
   * The article body, ready for the app's shared Markdown renderer.
   *
   * This is the file's own Markdown with three build-time transforms applied:
   * the level-one heading removed (the browser renders the title itself),
   * images replaced with a note naming what they showed, and every relative
   * link rewritten onto {@link DocsBrowserLinkOrigin}. It is never edited at
   * runtime.
   */
  readonly markdown: string
}

/** A category directory under `docs/features`. */
export interface IDocsBrowserCategory {
  /** The directory name, e.g. `review-and-diff`. */
  readonly name: string

  /** A title-cased fallback label for a category with no translation. */
  readonly label: string

  /** How many articles the category holds. */
  readonly count: number
}

/**
 * The origin every in-bundle link is rewritten onto at build time.
 *
 * The app's shared Markdown renderer reports a clicked link only when its
 * protocol is http(s), so a relative `../other.md` link reaches nothing at
 * all: the click is cancelled and no callback fires, which is a dead end that
 * cannot even announce itself. Rewriting to an absolute URL on a host reserved
 * by RFC 2606 makes the click reportable while guaranteeing that a link which
 * somehow escaped interception could never reach a real server.
 *
 * Kept in step with `DocsBrowserLinkOrigin` in
 * `script/generate-docs-browser-bundle.mjs` by the bundle test.
 */
export const DocsBrowserLinkOrigin = 'https://docs.desktop-material.invalid'

/** Where a clicked documentation link actually points. */
export type DocsBrowserLinkTarget =
  | {
      /** A bundled article. The browser navigates to it in place. */
      readonly kind: 'article'
      readonly article: IDocsBrowserArticleSummary
      /** The `#section` the link named, without the `#`, or null. */
      readonly fragment: string | null
    }
  | {
      /**
       * A repository path that is not a bundled article — a verification
       * record, an asset, a page outside `docs/features`. The browser says so
       * and names the path rather than doing nothing.
       */
      readonly kind: 'unbundled'
      readonly path: string
    }
  | {
      /** An ordinary web link, opened in the user's browser on request. */
      readonly kind: 'external'
      readonly href: string
    }
  | {
      /** Not a URL at all. Reported rather than silently ignored. */
      readonly kind: 'unreadable'
      readonly href: string
    }
