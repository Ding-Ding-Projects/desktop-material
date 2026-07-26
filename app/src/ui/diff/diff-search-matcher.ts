import escapeRegExp from 'lodash/escapeRegExp'

import { FilterMode, IFilterOptions } from '../../lib/fuzzy-find'
import {
  compileSafeRegex,
  getRegexInputLengthError,
  MaxRegexTotalInputLength,
  SafeRegex,
} from '../../lib/safe-regex'

export interface IDiffSearchMatch {
  readonly index: number
  readonly length: number
}

export type DiffSearchMatchResult =
  | {
      readonly kind: 'success'
      readonly matches: ReadonlyArray<IDiffSearchMatch>
      readonly truncated: boolean
    }
  | { readonly kind: 'error'; readonly message: string }

export type DiffSearchMatcherCompilation =
  | { readonly kind: 'success'; readonly matcher: DiffSearchMatcher }
  | { readonly kind: 'error'; readonly message: string }

/**
 * A stateful, operation-scoped matcher. Keeping the remaining allowance here
 * ensures that separate diff rows and side-by-side columns share one bound.
 */
export class DiffSearchMatcher {
  public static compile(
    searchQuery: string,
    options: IFilterOptions,
    maximumMatches: number
  ): DiffSearchMatcherCompilation {
    if (searchQuery.length === 0) {
      return { kind: 'error', message: 'Enter text to search.' }
    }

    if (options.mode === FilterMode.Regex) {
      const compilation = compileSafeRegex(searchQuery, options.caseSensitive)
      if (compilation.regex === null) {
        return {
          kind: 'error',
          message: compilation.error ?? 'The search pattern is invalid.',
        }
      }

      return {
        kind: 'success',
        matcher: new DiffSearchMatcher(
          null,
          compilation.regex,
          compilation.regex.getMaximumMatchCount(maximumMatches)
        ),
      }
    }

    // User text is fully escaped before reaching the native engine. This keeps
    // the historical literal-search case folding and indices without imposing
    // the RE2 pattern-size cap on non-regex queries.
    const caseSensitive =
      options.mode !== FilterMode.Fuzzy && options.caseSensitive
    try {
      return {
        kind: 'success',
        matcher: new DiffSearchMatcher(
          new RegExp(escapeRegExp(searchQuery), caseSensitive ? 'g' : 'gi'),
          null,
          maximumMatches
        ),
      }
    } catch {
      return {
        kind: 'error',
        message: 'The literal search query could not be evaluated.',
      }
    }
  }

  private totalRegexInputLength = 0

  private constructor(
    private readonly literalRegex: RegExp | null,
    private readonly safeRegex: SafeRegex | null,
    private remainingMatchAllowance: number
  ) {}

  public find(input: string): DiffSearchMatchResult {
    if (this.safeRegex !== null) {
      return this.findRegex(input, this.safeRegex)
    }

    return this.findLiteral(input, this.literalRegex!)
  }

  private findRegex(input: string, regex: SafeRegex): DiffSearchMatchResult {
    const inputError = getRegexInputLengthError(input.length)
    if (inputError !== null) {
      return { kind: 'error', message: inputError }
    }

    this.totalRegexInputLength += input.length
    const totalError = getRegexInputLengthError(
      this.totalRegexInputLength,
      MaxRegexTotalInputLength
    )
    if (totalError !== null) {
      return { kind: 'error', message: totalError }
    }

    const found = regex.findAll(input, this.remainingMatchAllowance)
    // Every enumerated regex match consumes the shared allowance, including a
    // zero-width match which cannot produce a visible highlight.
    this.remainingMatchAllowance -= found.matches.length

    return {
      kind: 'success',
      matches: found.matches
        .filter(match => match.text.length > 0)
        .map(match => ({ index: match.index, length: match.text.length })),
      truncated: found.truncated,
    }
  }

  private findLiteral(input: string, regex: RegExp): DiffSearchMatchResult {
    regex.lastIndex = 0
    const matches = new Array<IDiffSearchMatch>()

    while (true) {
      const match = regex.exec(input)
      if (match === null) {
        break
      }

      if (matches.length === this.remainingMatchAllowance) {
        return { kind: 'success', matches, truncated: true }
      }

      matches.push({ index: match.index, length: match[0].length })
    }

    this.remainingMatchAllowance -= matches.length
    return { kind: 'success', matches, truncated: false }
  }
}
