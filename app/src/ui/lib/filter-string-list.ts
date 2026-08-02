import { FilterMode, KeyFunction, matchWithMode } from '../../lib/fuzzy-find'

/** The outcome of filtering a homogeneous list with the shared filter stack. */
export interface IStringListFilterResult<T> {
  /**
   * The surviving items in their original order. On an empty query, or when a
   * regular expression is invalid, this is the untouched input list so the
   * surface always stays usable.
   */
  readonly items: ReadonlyArray<T>

  /**
   * The regex-engine message when the mode is {@link FilterMode.Regex} and the
   * pattern will not compile (or is over the guard limit); otherwise `null`.
   */
  readonly regexError: string | null

  /**
   * Whether the list was actually narrowed. `false` for an empty query and for
   * an invalid pattern (both preserve every item).
   */
  readonly filtered: boolean
}

/**
 * Filter a list with the shared fuzzy/substring/regex matcher, preserving the
 * input order of the survivors.
 *
 * The evaluation is delegated to {@link matchWithMode}, so it is non-throwing on
 * an invalid pattern (every item is preserved and the error is reported),
 * zero-width safe, and bounded by the regex guard. Unlike a raw filter list this
 * keeps the original ordering instead of re-sorting fuzzy matches by score,
 * which matters for logs, queues, and structured reports where the row order is
 * meaningful.
 */
export function filterByMode<T>(
  items: ReadonlyArray<T>,
  getKeys: KeyFunction<T>,
  query: string,
  mode: FilterMode,
  caseSensitive: boolean
): IStringListFilterResult<T> {
  // Trimming decides whether the user has typed anything at all; it must not
  // decide what gets matched. A regex of ` +` is a valid search for runs of
  // spaces that trims to the uncompilable `+`, and a substring of `error: `
  // deliberately excludes `error:` written without the trailing space.
  if (query.trim().length === 0) {
    return { items, regexError: null, filtered: false }
  }

  const { results, regexError } = matchWithMode(query, items, getKeys, {
    mode,
    caseSensitive,
  })

  if (regexError !== null) {
    // An invalid pattern must never hide rows: keep the list intact and let the
    // caller surface the error while the user is still typing.
    return { items, regexError, filtered: false }
  }

  const matched = new Set(results.map(result => result.item))
  return {
    items: items.filter(item => matched.has(item)),
    regexError: null,
    filtered: true,
  }
}
