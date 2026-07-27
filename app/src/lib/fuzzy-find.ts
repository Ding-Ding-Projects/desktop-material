import * as fuzzAldrin from 'fuzzaldrin-plus'

import { compareDescending } from './compare'
import {
  compileSafeRegex,
  getRegexInputLengthError,
  MaxRegexTotalInputLength,
  SafeRegex,
} from './safe-regex'

export { MaxRegexPatternLength } from './safe-regex'

function score(str: string, query: string, maxScore: number) {
  return fuzzAldrin.score(str, query) / maxScore
}

export interface IMatches {
  readonly title: ReadonlyArray<number>
  readonly subtitle: ReadonlyArray<number>
}

export interface IMatch<T> {
  /** `0 <= score <= 1` */
  score: number
  item: T
  matches: IMatches
}

export type KeyFunction<T> = (item: T) => ReadonlyArray<string>

/**
 * The available strategies for matching a query against a set of items in a
 * filter list.
 */
export enum FilterMode {
  /** fuzzaldrin-plus fuzzy matching (the historical default). */
  Fuzzy = 'fuzzy',
  /** Contiguous, case-optional substring matching (preserves item order). */
  Substring = 'substring',
  /** JavaScript regular expression matching. */
  Regex = 'regex',
}

/** Options controlling how {@link matchWithMode} filters items. */
export interface IFilterOptions {
  /** The matching strategy to use. */
  readonly mode: FilterMode

  /**
   * Whether matching should be case sensitive. Only affects the Substring and
   * Regex modes; Fuzzy matching is always case insensitive.
   */
  readonly caseSensitive: boolean
}

/** The result of a {@link matchWithMode} invocation. */
export interface IMatchResult<T> {
  /** The matched items (already ordered for display). */
  readonly results: ReadonlyArray<IMatch<T>>

  /**
   * When the mode is {@link FilterMode.Regex} and the supplied pattern is
   * invalid (or exceeds the guard limit) this holds a human readable error
   * message. In that situation `results` contains every candidate item
   * unfiltered so the list stays usable while the user is still typing.
   */
  readonly regexError: string | null
}

function passthrough<T>(items: ReadonlyArray<T>): ReadonlyArray<IMatch<T>> {
  return items.map(item => ({
    score: 1,
    item,
    matches: { title: [], subtitle: [] },
  }))
}

function contiguousIndices(
  start: number,
  length: number
): ReadonlyArray<number> {
  const indices = new Array<number>(length)
  for (let i = 0; i < length; i++) {
    indices[i] = start + i
  }
  return indices
}

function substringIndices(
  text: string,
  query: string,
  caseSensitive: boolean
): ReadonlyArray<number> {
  if (query.length === 0) {
    return []
  }

  const haystack = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const idx = haystack.indexOf(needle)

  return idx === -1 ? [] : contiguousIndices(idx, needle.length)
}

function substringMatch<T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: KeyFunction<T>,
  caseSensitive: boolean
): ReadonlyArray<IMatch<T>> {
  const needle = caseSensitive ? query : query.toLowerCase()
  const result = new Array<IMatch<T>>()

  for (const item of items) {
    const keys = getKey(item)
    const anyMatch = keys.some(k =>
      (caseSensitive ? k : k.toLowerCase()).includes(needle)
    )

    if (!anyMatch) {
      continue
    }

    result.push({
      score: 1,
      item,
      matches: {
        title: substringIndices(keys[0] ?? '', query, caseSensitive),
        subtitle:
          keys.length > 1
            ? substringIndices(keys[1] ?? '', query, caseSensitive)
            : [],
      },
    })
  }

  // Substring matching intentionally preserves the incoming item order rather
  // than re-sorting by score.
  return result
}

interface IRegexIndicesResult {
  readonly indices: ReadonlyArray<number>
  /** Includes zero-width matches, which still consume matcher work. */
  readonly matchesConsumed: number
}

function regexIndices(
  text: string,
  regex: SafeRegex,
  maxMatches: number
): IRegexIndicesResult {
  const indices = new Array<number>()
  if (maxMatches <= 0) {
    return { indices, matchesConsumed: 0 }
  }

  const { matches } = regex.findAll(text, maxMatches)

  for (const match of matches) {
    const start = match.index
    const length = match.text.length

    for (let i = 0; i < length; i++) {
      indices.push(start + i)
    }
  }

  return { indices, matchesConsumed: matches.length }
}

function regexMatch<T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: KeyFunction<T>,
  caseSensitive: boolean
): IMatchResult<T> {
  const compilation = compileSafeRegex(query, caseSensitive)
  if (compilation.regex === null) {
    return {
      results: passthrough(items),
      regexError: compilation.error,
    }
  }

  const regex = compilation.regex
  const result = new Array<IMatch<T>>()
  let totalInputLength = 0
  let remainingHighlightMatches = regex.getMaximumMatchCount()

  for (const item of items) {
    try {
      const keys = getKey(item)
      for (const key of keys) {
        const lengthError = getRegexInputLengthError(key.length)
        if (lengthError !== null) {
          // Evaluation-limit failures fail closed. Many compact search surfaces
          // do not render regexError, and showing every item would silently
          // disable their filter while claiming the query was active.
          return { results: [], regexError: lengthError }
        }
        totalInputLength += key.length
      }
      const totalLengthError = getRegexInputLengthError(
        totalInputLength,
        MaxRegexTotalInputLength
      )
      if (totalLengthError !== null) {
        return { results: [], regexError: totalLengthError }
      }

      const anyMatch = keys.some(k => regex.test(k))

      if (!anyMatch) {
        continue
      }

      const title = regexIndices(
        keys[0] ?? '',
        regex,
        remainingHighlightMatches
      )
      remainingHighlightMatches -= title.matchesConsumed
      const subtitle =
        keys.length > 1
          ? regexIndices(keys[1] ?? '', regex, remainingHighlightMatches)
          : { indices: [], matchesConsumed: 0 }
      remainingHighlightMatches -= subtitle.matchesConsumed

      result.push({
        score: 1,
        item,
        matches: {
          title: title.indices,
          subtitle: subtitle.indices,
        },
      })
    } catch {
      // Ignore items that blow up during matching rather than failing the
      // whole list.
    }
  }

  return { results: result, regexError: null }
}

/**
 * Match a query against a set of items using the requested {@link FilterMode}.
 *
 * Fuzzy mode delegates to {@link match} so there is zero behavioural change
 * for existing callers. Substring and Regex modes are new.
 */
export function matchWithMode<T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: KeyFunction<T>,
  options: IFilterOptions
): IMatchResult<T> {
  switch (options.mode) {
    case FilterMode.Substring:
      return {
        results: substringMatch(query, items, getKey, options.caseSensitive),
        regexError: null,
      }
    case FilterMode.Regex:
      return regexMatch(query, items, getKey, options.caseSensitive)
    case FilterMode.Fuzzy:
    default:
      return {
        results: match(query.toLowerCase(), items, getKey),
        regexError: null,
      }
  }
}

/**
 * Merge two score-descending match lists into the exact array a single stable
 * descending sort over their concatenation would produce: an item from
 * `right` only precedes one from `left` when its score is strictly greater,
 * and each list keeps its internal order.
 *
 * Used by filter surfaces that append a freshly matched batch to an existing
 * fuzzy result (e.g. History search auto-deepening) without re-matching and
 * re-sorting the whole list.
 */
export function mergeMatchesByDescendingScore<T>(
  left: ReadonlyArray<IMatch<T>>,
  right: ReadonlyArray<IMatch<T>>
): ReadonlyArray<IMatch<T>> {
  const merged = new Array<IMatch<T>>(left.length + right.length)
  let leftIndex = 0
  let rightIndex = 0
  let mergedIndex = 0

  while (leftIndex < left.length && rightIndex < right.length) {
    merged[mergedIndex++] =
      right[rightIndex].score > left[leftIndex].score
        ? right[rightIndex++]
        : left[leftIndex++]
  }
  while (leftIndex < left.length) {
    merged[mergedIndex++] = left[leftIndex++]
  }
  while (rightIndex < right.length) {
    merged[mergedIndex++] = right[rightIndex++]
  }

  return merged
}

export function match<T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: KeyFunction<T>
): ReadonlyArray<IMatch<T>> {
  // matching `query` against itself is a perfect match.
  const maxScore = score(query, query, 1)
  const result = items
    .map((item): IMatch<T> => {
      const matches: Array<ReadonlyArray<number>> = []
      const itemTextArray = getKey(item)
      itemTextArray.forEach(text => {
        matches.push(fuzzAldrin.match(text, query))
      })

      return {
        score: score(itemTextArray.join(''), query, maxScore),
        item,
        matches: {
          title: matches[0],
          subtitle: matches.length > 1 ? matches[1] : [],
        },
      }
    })
    .filter(
      ({ matches }) => matches.title.length > 0 || matches.subtitle.length > 0
    )
    .sort(({ score: left }, { score: right }) => compareDescending(left, right))

  return result
}
