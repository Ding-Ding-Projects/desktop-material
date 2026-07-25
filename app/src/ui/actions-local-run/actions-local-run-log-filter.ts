import { FilterMode } from '../../lib/fuzzy-find'
import { filterByMode } from '../lib/filter-string-list'

/** The minimum shape the live log filter needs from a streamed line. */
export interface ILogLineLike {
  readonly text: string
}

/** The result of narrowing the streamed local-run output to matching lines. */
export interface IActionsLocalRunLogFilterResult<T extends ILogLineLike> {
  /**
   * The lines to render, in stream order. Every line is preserved on an empty
   * query and on an invalid pattern.
   */
  readonly lines: ReadonlyArray<T>

  /** The number of lines currently shown. */
  readonly matchCount: number

  /** The number of lines before filtering. */
  readonly totalCount: number

  /** The regex-engine error when the pattern will not compile, else `null`. */
  readonly regexError: string | null

  /** Whether the output is currently narrowed by a valid, non-empty query. */
  readonly active: boolean
}

/**
 * Filter a streamed local-run log live.
 *
 * The work is bounded by the caller's retained line buffer and is fully
 * non-throwing: an invalid regular expression preserves every line (and reports
 * the error) rather than emptying the view, and zero-width patterns are handled
 * safely by the shared matcher. Stream order is always preserved so the log
 * stays chronological while filtered.
 */
export function filterActionsLocalRunLog<T extends ILogLineLike>(
  lines: ReadonlyArray<T>,
  query: string,
  mode: FilterMode,
  caseSensitive: boolean
): IActionsLocalRunLogFilterResult<T> {
  const { items, regexError, filtered } = filterByMode(
    lines,
    line => [line.text],
    query,
    mode,
    caseSensitive
  )

  return {
    lines: items,
    matchCount: items.length,
    totalCount: lines.length,
    regexError,
    active: filtered,
  }
}
