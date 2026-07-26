import { RE2JS } from 're2js'

import { t } from './i18n'

/**
 * Desktop Material's user-authored search-regex dialect is RE2. Unlike the
 * JavaScript RegExp engine, RE2 guarantees linear-time evaluation and cannot
 * freeze the renderer through catastrophic backtracking.
 */
export const SafeRegexDialect = 'RE2'

/** Keep compiled patterns small enough to validate synchronously. */
export const MaxRegexPatternLength = 1000

/** Bound any one candidate or live-tester sample evaluated in the renderer. */
export const MaxRegexInputLength = 100_000

/** Bound the aggregate candidate text evaluated by a single list filter. */
export const MaxRegexTotalInputLength = 1_000_000

/** Bound match enumeration used for highlights and the live-tester count. */
export const MaxRegexMatchCount = 5000

/** Bound matcher bookkeeping for patterns with many capturing groups. */
export const MaxRegexCaptureWork = 50_000

/** Bound capture previews independently from the match-enumeration budget. */
export const MaxRegexCapturePreviews = 24

/** Bound retained text for each capture preview. */
export const MaxRegexCapturePreviewLength = 120

export interface ISafeRegexCapturePreview {
  /** Bounded text; null means the optional group did not participate. */
  readonly value: string | null
  /** Original UTF-16 length; null means the group did not participate. */
  readonly originalLength: number | null
}

export interface ISafeRegexMatch {
  readonly index: number
  readonly text: string
  /** Bounded numbered captures, populated only for the first requested match. */
  readonly groups: ReadonlyArray<ISafeRegexCapturePreview>
  /** Bounded named captures, populated only for the first requested match. */
  readonly namedGroups: Readonly<Record<string, ISafeRegexCapturePreview>>
  /** Numbered/named capture entries omitted by the aggregate preview cap. */
  readonly capturesOmitted: number
}

export interface ISafeRegexMatches {
  readonly matches: ReadonlyArray<ISafeRegexMatch>
  readonly truncated: boolean
}

export interface ISafeRegexCompilation {
  readonly regex: SafeRegex | null
  readonly error: string | null
}

/** A small renderer-safe adapter around the vetted RE2JS engine. */
export class SafeRegex {
  private readonly captureGroupCount: number

  public constructor(private readonly compiled: RE2JS) {
    // Capture-group count is a property of the compiled pattern, not its input.
    // Cache it once so callers that evaluate several independent candidates can
    // share one aggregate work budget instead of resetting it for every line.
    this.captureGroupCount = compiled.matcher('').groupCount()
  }

  /** Test whether the pattern occurs anywhere in the input. */
  public test(input: string): boolean {
    return this.compiled.test(input)
  }

  /**
   * Clamp a requested enumeration count to this pattern's renderer-safe work
   * budget. Callers evaluating multiple independent inputs can use this once
   * and decrement the returned count across the whole operation.
   */
  public getMaximumMatchCount(maxMatches: number = MaxRegexMatchCount): number {
    const boundedMaxMatches = Number.isSafeInteger(maxMatches)
      ? Math.max(0, Math.min(maxMatches, MaxRegexMatchCount))
      : MaxRegexMatchCount
    const captureWorkMatchLimit =
      this.captureGroupCount === 0
        ? boundedMaxMatches
        : Math.max(1, Math.floor(MaxRegexCaptureWork / this.captureGroupCount))

    return Math.min(boundedMaxMatches, captureWorkMatchLimit)
  }

  /** Enumerate bounded, UTF-16 indexed matches for highlighting. */
  public findAll(
    input: string,
    maxMatches: number = MaxRegexMatchCount,
    captureFirstMatch: boolean = false
  ): ISafeRegexMatches {
    const matcher = this.compiled.matcher(input)
    const matches = new Array<ISafeRegexMatch>()
    const groupCount = this.captureGroupCount
    const matchLimit = this.getMaximumMatchCount(maxMatches)
    const namedGroupNames = captureFirstMatch
      ? Object.keys(this.compiled.namedGroups())
      : []

    while (matches.length < matchLimit && matcher.find()) {
      const groups = new Array<ISafeRegexCapturePreview>()
      const namedGroups: Record<string, ISafeRegexCapturePreview> = {}
      let capturesOmitted = 0

      if (captureFirstMatch && matches.length === 0) {
        const numberedCount = Math.min(groupCount, MaxRegexCapturePreviews)
        for (let group = 1; group <= numberedCount; group++) {
          groups.push(toCapturePreview(matcher.group(group)))
        }

        const namedLimit = Math.max(0, MaxRegexCapturePreviews - groups.length)
        for (const name of namedGroupNames.slice(0, namedLimit)) {
          namedGroups[name] = toCapturePreview(matcher.group(name))
        }

        capturesOmitted = Math.max(
          0,
          groupCount +
            namedGroupNames.length -
            groups.length -
            Object.keys(namedGroups).length
        )
      }

      matches.push({
        index: matcher.start(),
        text: matcher.group() ?? '',
        groups,
        namedGroups,
        capturesOmitted,
      })
    }

    return {
      matches,
      truncated: matches.length === matchLimit && matcher.find(),
    }
  }
}

function toCapturePreview(value: string | null): ISafeRegexCapturePreview {
  return value === null
    ? { value: null, originalLength: null }
    : {
        value: value.slice(0, MaxRegexCapturePreviewLength),
        originalLength: value.length,
      }
}

/** Compile a user-authored RE2 pattern without invoking native RegExp. */
export function compileSafeRegex(
  pattern: string,
  caseSensitive: boolean
): ISafeRegexCompilation {
  if (pattern.length > MaxRegexPatternLength) {
    return {
      regex: null,
      error: t('regex.error.patternTooLong', {
        max: String(MaxRegexPatternLength),
      }),
    }
  }

  const flags = caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE
  try {
    return { regex: new SafeRegex(RE2JS.compile(pattern, flags)), error: null }
  } catch (error) {
    return {
      regex: null,
      error: t('regex.error.invalidOrUnsupported', {
        detail:
          error instanceof Error ? error.message : t('regex.error.unknown'),
      }),
    }
  }
}

/** Return a localized error when renderer-owned regex input exceeds its cap. */
export function getRegexInputLengthError(
  length: number,
  maximum: number = MaxRegexInputLength
): string | null {
  return length <= maximum
    ? null
    : t('regex.error.inputTooLong', {
        max: String(maximum),
      })
}
