/**
 * Typed dates and range presets for the changelog's date filter.
 *
 * The picker accepts what a person actually types, not only what a calendar
 * emits: a plain ISO date always, plus the locale's own order. A partial or
 * impossible entry is reported inline and the typed text is kept — clearing the
 * field under someone mid-keystroke is the fastest way to make a date filter
 * feel broken.
 */

import { SupportedLocale } from '../i18n'

/** What a typed date turned out to be. */
export type ParsedDate =
  | { readonly kind: 'empty' }
  | { readonly kind: 'valid'; readonly iso: string }
  /**
   * `reason` names which way it failed so the field can say something better
   * than "invalid": still being typed, ordered wrongly, or a day that does not
   * exist in that month.
   */
  | { readonly kind: 'invalid'; readonly reason: DateParseFailure }

export type DateParseFailure =
  /** Too short to be a date yet — usually mid-typing, so worth saying gently. */
  | 'incomplete'
  /** Recognisable shape, impossible value: 2026-02-30, month 13, day 0. */
  | 'outOfRange'
  /** Nothing date-shaped at all. */
  | 'unrecognized'

const IsoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
/** `1/2/2026`, `01-02-2026`, `1.2.2026` — order depends on the locale. */
const NumericPattern = /^(\d{1,4})[/\-. ](\d{1,2})[/\-. ](\d{1,4})$/
/** `2026年7月31日`, the form a Hong Kong reader is most likely to type. */
const HanPattern = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/**
 * True when the calendar really has that day.
 *
 * `new Date(2026, 1, 30)` silently rolls forward to 2 March rather than
 * failing, so the round trip is checked instead of trusted.
 */
function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function toIso(year: number, month: number, day: number): ParsedDate {
  if (!isRealDate(year, month, day)) {
    return { kind: 'invalid', reason: 'outOfRange' }
  }
  return { kind: 'valid', iso: `${year}-${pad(month)}-${pad(day)}` }
}

/**
 * Parses a typed date.
 *
 * ISO is accepted in every locale, because it is unambiguous and it is what the
 * app itself displays. The locale then decides how a bare `3/4/2026` is read —
 * month-first for `en`, day-first for `zh-HK` — which is exactly the ambiguity
 * ISO exists to avoid, so the field also states the order it is using.
 */
export function parseTypedDate(
  value: string,
  locale: SupportedLocale = 'en'
): ParsedDate {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { kind: 'empty' }
  }

  const iso = IsoPattern.exec(trimmed)
  if (iso !== null) {
    return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }

  const han = HanPattern.exec(trimmed)
  if (han !== null) {
    return toIso(Number(han[1]), Number(han[2]), Number(han[3]))
  }

  const numeric = NumericPattern.exec(trimmed)
  if (numeric !== null) {
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    const third = Number(numeric[3])

    // A four-digit leading field is a year in any locale: nobody means day 2026.
    if (numeric[1].length === 4) {
      return toIso(first, second, third)
    }
    if (numeric[3].length !== 4) {
      // A two-digit year is genuinely ambiguous (26 → 1926 or 2026?), so it is
      // refused rather than guessed.
      return { kind: 'invalid', reason: 'unrecognized' }
    }
    return locale === 'zh-HK'
      ? toIso(third, second, first)
      : toIso(third, first, second)
  }

  // Digits and separators but not enough of them yet: still being typed.
  if (/^[\d\s/\-.年月日]+$/.test(trimmed)) {
    return { kind: 'invalid', reason: 'incomplete' }
  }
  return { kind: 'invalid', reason: 'unrecognized' }
}

/** Formats an ISO date the way the given locale writes it. */
export function formatIsoDate(
  iso: string,
  locale: SupportedLocale = 'en'
): string {
  const match = IsoPattern.exec(iso)
  if (match === null) {
    return iso
  }
  const [, year, month, day] = match
  return locale === 'zh-HK'
    ? `${year}年${Number(month)}月${Number(day)}日`
    : `${Number(month)}/${Number(day)}/${year}`
}

/** The date-entry hint a field shows, in the order that field will read. */
export function getTypedDateHint(locale: SupportedLocale = 'en'): string {
  return locale === 'zh-HK'
    ? 'YYYY-MM-DD 或 日/月/年'
    : 'YYYY-MM-DD or M/D/YYYY'
}

/** An inclusive `YYYY-MM-DD` range; either side may be open. */
export interface IDateRange {
  readonly from: string | null
  readonly to: string | null
}

/** The named ranges the picker offers. */
export type DateRangePresetId =
  | 'all'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisYear'
  | 'lastYear'

export const DateRangePresetIds: ReadonlyArray<DateRangePresetId> = [
  'all',
  'last7',
  'last30',
  'last90',
  'thisYear',
  'lastYear',
]

/** Formats a `Date` as `YYYY-MM-DD` in local time, never UTC. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`
}

/**
 * Resolves a preset against a clock.
 *
 * `today` is a parameter rather than a `new Date()` inside, so the presets are
 * testable and so a range cannot shift under a viewer left open past midnight.
 */
export function resolveDateRangePreset(
  preset: DateRangePresetId,
  today: Date
): IDateRange {
  const start = (daysBack: number): string => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    )
    // Inclusive of today, so "last 7 days" spans 7 days rather than 8.
    date.setDate(date.getDate() - (daysBack - 1))
    return toIsoDate(date)
  }

  switch (preset) {
    case 'last7':
      return { from: start(7), to: toIsoDate(today) }
    case 'last30':
      return { from: start(30), to: toIsoDate(today) }
    case 'last90':
      return { from: start(90), to: toIsoDate(today) }
    case 'thisYear':
      return {
        from: `${today.getFullYear()}-01-01`,
        to: toIsoDate(today),
      }
    case 'lastYear':
      return {
        from: `${today.getFullYear() - 1}-01-01`,
        to: `${today.getFullYear() - 1}-12-31`,
      }
    case 'all':
    default:
      return { from: null, to: null }
  }
}

/** The preset a range corresponds to, or null when it matches none of them. */
export function matchDateRangePreset(
  range: IDateRange,
  today: Date
): DateRangePresetId | null {
  for (const preset of DateRangePresetIds) {
    const resolved = resolveDateRangePreset(preset, today)
    if (resolved.from === range.from && resolved.to === range.to) {
      return preset
    }
  }
  return null
}

/**
 * Puts a range the right way round.
 *
 * Range pickers are clicked end-first often enough that refusing the input
 * would be pedantry; swapping is what the person meant.
 */
export function normalizeDateRange(range: IDateRange): IDateRange {
  if (range.from !== null && range.to !== null && range.from > range.to) {
    return { from: range.to, to: range.from }
  }
  return range
}
