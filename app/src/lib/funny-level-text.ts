import {
  AudioSettingsStorageKey,
  clampFunnyLevel,
  DefaultAudioSystemSettings,
  parseAudioSettings,
} from './audio/audio-settings'
import {
  translate,
  translatedVariable,
  TranslationKey,
  TranslationVariables,
} from './i18n'
import { LanguageMode } from '../models/language-mode'

/**
 * Per-language playfulness, 1 (fully serious) .. 5 (maximum playfulness).
 *
 * The level styles the voice and never the facts: every band of a key family
 * states the same paths, counts, and consequences in unambiguous words.
 */
export interface IFunnyLevels {
  readonly english: number
  readonly cantonese: number
}

/** The persisted defaults, used whenever the stored settings are unreadable. */
export const DefaultFunnyLevels: IFunnyLevels = {
  english: DefaultAudioSystemSettings.funnyLevelEnglish,
  cantonese: DefaultAudioSystemSettings.funnyLevelCantonese,
}

/** The voice band a funny level selects; the facts are identical in each. */
export type FunnyBand = 'plain' | 'light' | 'playful'

/**
 * Key families which carry a `.plain` / `.light` / `.playful` variant.
 *
 * Listing them keeps the composed key literal-checked against
 * `TranslationKey`, so a family that is missing a band fails to compile.
 */
export type FunnyLevelTextBase =
  | 'tabs.overflowDescription'
  // The Appearance › Tone live preview. The first family is an ordinary
  // status line; the second is a destructive warning whose irreversibility
  // sentence is the separate fixed `appearance.toneWarningFixed` string.
  | 'appearance.tonePreview'
  | 'appearance.toneWarningPreview'
  // Only the framing of a deferred surface's progress and failure copy carries
  // bands. The failure title, the reported error string and the retry label
  // are single fixed strings, because what failed and what to press are facts
  // the user acts on rather than voice.
  | 'lazyView.loading'
  | 'lazyView.failedBody'
  // Only the *framing* of the encryption gate carries bands. The sentence that
  // says a lost passphrase is unrecoverable is a single fixed string with no
  // variants at all, because there is no funny level at which that fact is
  // allowed to read as a maybe.
  | 'cheapLfs.encryptionGate.intro'
  | 'ignoredSubmodule.intro'
  | 'ignoredSubmodule.reviewLead'
  | 'pullBranchDeleted.intro'
  | 'pullBranchDeleted.recovered'

/** Every selectable funny level, in slider order (1 serious .. 5 max). */
export const FunnyLevelValues: ReadonlyArray<number> = [1, 2, 3, 4, 5]

/**
 * The resource key naming each level. Screen readers announce the name rather
 * than a bare number, because "3" alone tells the listener nothing about what
 * the app will sound like.
 */
const FunnyLevelNameKeys: ReadonlyArray<TranslationKey> = [
  'appearance.toneLevelName1',
  'appearance.toneLevelName2',
  'appearance.toneLevelName3',
  'appearance.toneLevelName4',
  'appearance.toneLevelName5',
]

/** The resource key naming a level, clamping anything outside 1..5. */
export function funnyLevelNameKey(level: number): TranslationKey {
  const clamped = clampFunnyLevel(
    level,
    DefaultAudioSystemSettings.funnyLevelEnglish
  )
  return FunnyLevelNameKeys[clamped - 1] ?? 'appearance.toneLevelName3'
}

/**
 * The slider's spoken value: the position *and* what that position means, so a
 * screen-reader user hears "Level 4 of 5, Playful" instead of "4".
 */
export function funnyLevelValueText(
  level: number,
  languageMode: LanguageMode
): string {
  const clamped = clampFunnyLevel(
    level,
    DefaultAudioSystemSettings.funnyLevelEnglish
  )
  return translate('appearance.toneValueText', languageMode, {
    level: String(clamped),
    name: translatedVariable(funnyLevelNameKey(clamped)),
  })
}

/** Read the persisted per-language funny levels, defaulting when unreadable. */
export function readFunnyLevels(): IFunnyLevels {
  if (typeof localStorage === 'undefined') {
    return DefaultFunnyLevels
  }

  try {
    const settings = parseAudioSettings(
      localStorage.getItem(AudioSettingsStorageKey)
    )
    return {
      english: settings.funnyLevelEnglish,
      cantonese: settings.funnyLevelCantonese,
    }
  } catch {
    return DefaultFunnyLevels
  }
}

/** 1-2 reads plain, 3 reads lightly playful, 4-5 reads maximally playful. */
export function funnyBand(level: number): FunnyBand {
  const clamped = clampFunnyLevel(
    level,
    DefaultAudioSystemSettings.funnyLevelEnglish
  )
  if (clamped <= 2) {
    return 'plain'
  }
  return clamped === 3 ? 'light' : 'playful'
}

/**
 * Translate a `<base>.plain` / `.light` / `.playful` key family, picking each
 * language's own band from its own funny level.
 *
 * Bilingual mode joins the two languages exactly the way the shared translate
 * helper does, so English can read plainly while Cantonese reads playfully (or
 * the other way round) without either side losing a fact.
 */
export function translateWithFunnyLevel(
  base: FunnyLevelTextBase,
  languageMode: LanguageMode,
  levels: IFunnyLevels = DefaultFunnyLevels,
  variables: TranslationVariables = {}
): string {
  const englishKey: TranslationKey = `${base}.${funnyBand(levels.english)}`
  const cantoneseKey: TranslationKey = `${base}.${funnyBand(levels.cantonese)}`

  if (languageMode === 'cantonese') {
    return translate(cantoneseKey, 'cantonese', variables)
  }
  if (languageMode === 'bilingual') {
    return `${translate(englishKey, 'english', variables)} · ${translate(
      cantoneseKey,
      'cantonese',
      variables
    )}`
  }
  return translate(englishKey, 'english', variables)
}
