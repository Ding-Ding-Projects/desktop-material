import { LanguageMode, normalizeLanguageMode } from '../models/language-mode'
import {
  applyPersonalVocabulary,
  getActivePersonalVocabulary,
} from './personal-vocabulary'
import {
  cantoneseTranslations,
  englishTranslations,
  TranslationKey,
} from './i18n-resources'
import { getLanguageModePreference } from './language-preference'
import { isSchoolModeEnabled } from './school-mode'

export type { TranslationKey } from './i18n-resources'

export type SupportedLocale = 'en' | 'zh-HK'
export const LanguageModeChangedEvent = 'desktop-material-language-mode-changed'

const BilingualSeparator = ' · '
const BilingualVariableMarker: unique symbol = Symbol(
  'desktop-material.bilingual-variable'
)
const LocalizedBilingualVariableMarker: unique symbol = Symbol(
  'desktop-material.localized-bilingual-variable'
)

/**
 * An explicitly localized interpolation value.
 *
 * The private symbol marker makes this distinct from user-controlled strings,
 * including strings which legitimately contain the bilingual separator.
 */
export interface IBilingualVariable {
  readonly [BilingualVariableMarker]: true
  readonly english: string
  readonly cantonese: string
  /** True only when the value is app-authored localized copy. */
  readonly [LocalizedBilingualVariableMarker]?: true
}

export type TranslationVariable = string | IBilingualVariable
export type TranslationVariables = Readonly<Record<string, TranslationVariable>>

/**
 * Create a protected two-locale interpolation value.
 *
 * Values passed through this boundary are treated as exact data. This is the
 * default for names, paths, URLs, refs, SHAs, errors and other interpolation
 * values whose bytes must not be rewritten by a vocabulary rule.
 */
export function bilingualVariable(
  english: string,
  cantonese: string
): IBilingualVariable {
  return {
    [BilingualVariableMarker]: true,
    english,
    cantonese,
  }
}

/** Create a two-locale value that is explicitly app-authored copy. */
export function localizedBilingualVariable(
  english: string,
  cantonese: string
): IBilingualVariable {
  return {
    [BilingualVariableMarker]: true,
    [LocalizedBilingualVariableMarker]: true,
    english,
    cantonese,
  }
}

export function normalizeLocale(locale: string | undefined): SupportedLocale {
  const normalized = locale?.replace('_', '-').toLowerCase()
  return normalized?.startsWith('zh') ? 'zh-HK' : 'en'
}

function modeFromLanguageOrLocale(value: string | undefined): LanguageMode {
  if (isSchoolModeEnabled()) {
    return 'english'
  }
  const normalizedMode = normalizeLanguageMode(value)
  if (normalizedMode !== 'english' || value === 'english') {
    return normalizedMode
  }
  return normalizeLocale(value) === 'zh-HK' ? 'cantonese' : 'english'
}

function isBilingualVariable(
  value: TranslationVariable
): value is IBilingualVariable {
  return (
    typeof value === 'object' &&
    value !== null &&
    value[BilingualVariableMarker] === true
  )
}

interface IResolvedInterpolationVariable {
  readonly value: string
  readonly personalize: boolean
}

/**
 * Resolve typed interpolation values for each catalog.
 *
 * Plain strings are always copied verbatim to both sides. They are never
 * parsed for visible punctuation, so repository names such as `A · B` remain
 * intact.
 */
function splitBilingualVariables(variables: TranslationVariables): {
  readonly english: Readonly<Record<string, IResolvedInterpolationVariable>>
  readonly cantonese: Readonly<Record<string, IResolvedInterpolationVariable>>
} {
  const englishVariables: Record<string, IResolvedInterpolationVariable> = {}
  const cantoneseVariables: Record<string, IResolvedInterpolationVariable> = {}

  for (const [name, value] of Object.entries(variables)) {
    if (isBilingualVariable(value)) {
      const personalize = value[LocalizedBilingualVariableMarker] === true
      englishVariables[name] = { value: value.english, personalize }
      cantoneseVariables[name] = { value: value.cantonese, personalize }
    } else {
      // Bare interpolation values are protected technical/user data. An
      // app-authored localized fragment must use localizedBilingualVariable
      // (translatedVariable already does so before returning its result).
      englishVariables[name] = { value, personalize: false }
      cantoneseVariables[name] = { value, personalize: false }
    }
  }

  return { english: englishVariables, cantonese: cantoneseVariables }
}

/**
 * Personalize catalog prose while preserving protected interpolation values.
 * The template is split around each placeholder, so a path/URL/ref cannot be
 * rewritten merely because it happens to contain a vocabulary key.
 */
function interpolate(
  template: string,
  variables: Readonly<Record<string, IResolvedInterpolationVariable>>
): string {
  const pattern = /\{([^}]+)\}/g
  let cursor = 0
  let output = ''
  let match: RegExpExecArray | null

  while ((match = pattern.exec(template)) !== null) {
    output += personalize(template.slice(cursor, match.index))
    const variable = variables[match[1]]
    output +=
      variable === undefined
        ? match[0]
        : variable.personalize
        ? personalize(variable.value)
        : variable.value
    cursor = match.index + match[0].length
  }

  return output + personalize(template.slice(cursor))
}

function templateFor(key: TranslationKey, locale: SupportedLocale): string {
  return locale === 'zh-HK'
    ? cantoneseTranslations[key] ?? englishTranslations[key]
    : englishTranslations[key]
}

export function translate(
  key: TranslationKey,
  languageOrLocale: string | undefined,
  variables: TranslationVariables = {}
): string {
  const mode = modeFromLanguageOrLocale(languageOrLocale)
  const split = splitBilingualVariables(variables)

  if (mode === 'cantonese') {
    return interpolate(templateFor(key, 'zh-HK'), split.cantonese)
  }
  if (mode === 'bilingual') {
    return `${interpolate(
      templateFor(key, 'en'),
      split.english
    )}${BilingualSeparator}${interpolate(
      templateFor(key, 'zh-HK'),
      split.cantonese
    )}`
  }
  return interpolate(templateFor(key, 'en'), split.english)
}

/**
 * Apply the user's own vocabulary, if they have supplied one.
 *
 * This is the single point where catalog prose is personalized. Doing it here
 * rather than at each call site is what makes the feature reach every surface
 * at once. The template prose is personalized after placeholders are
 * identified; exact interpolation values remain protected technical segments
 * unless a caller explicitly wraps app-authored copy in
 * `localizedBilingualVariable`.
 *
 * Suppressed entirely in School mode, which the contract requires to behave as
 * though the vocabulary feature were not installed at all rather than merely
 * disabled.
 */
export function personalizeText(text: string): string {
  return personalize(text)
}

function personalize(text: string): string {
  if (isSchoolModeEnabled()) {
    return text
  }
  return applyPersonalVocabulary(text, getActivePersonalVocabulary())
}

/** Build a typed interpolation value from a resource key. */
export function translatedVariable(
  key: TranslationKey,
  variables: TranslationVariables = {}
): IBilingualVariable {
  return bilingualVariable(
    translate(key, 'english', variables),
    translate(key, 'cantonese', variables)
  )
}

/** Bilingual controls use English as their concise primary accessible name. */
export function getPrimaryLanguageMode(
  mode: LanguageMode
): Exclude<LanguageMode, 'bilingual'> {
  return mode === 'cantonese' ? 'cantonese' : 'english'
}

/** Translate a deterministic single-language accessible name for this mode. */
export function translateForAccessibleName(
  key: TranslationKey,
  variables: TranslationVariables = {},
  mode: LanguageMode = getPersistedLanguageMode()
): string {
  return translate(key, getPrimaryLanguageMode(mode), variables)
}

/** Read the active profile's explicit mode; the OS locale never overrides it. */
export function getPersistedLanguageMode(): LanguageMode {
  if (typeof localStorage === 'undefined') {
    return 'english'
  }
  if (isSchoolModeEnabled()) {
    return 'english'
  }
  return getLanguageModePreference()
}

export function t(
  key: TranslationKey,
  variables?: TranslationVariables
): string {
  return translate(key, getPersistedLanguageMode(), variables)
}
