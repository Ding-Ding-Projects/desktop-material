import {
  AudioSettingsStorageKey,
  clampFunnyLevel,
  DefaultAudioSystemSettings,
  parseAudioSettings,
} from './audio/audio-settings'
import {
  bilingualVariable,
  IBilingualVariable,
  translate,
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
  | 'appearance.elementGesture'
  | 'tabs.overflowDescription'
  // Only the framing of a deferred surface's progress and failure copy carries
  // bands. The failure title, the reported error string and the retry label
  // are single fixed strings, because what failed and what to press are facts
  // the user acts on rather than voice.
  | 'lazyView.loading'
  | 'lazyView.failedBody'
  | 'ignoredSubmodule.intro'
  | 'ignoredSubmodule.reviewLead'
  // Only the notice body is banded. The skipped paths, their count, and the
  // remedy are stated identically in every band, and the per-file failure rows
  // keep one fixed factual reason — which file was pinned is never a matter of
  // voice.
  | 'cheapLfs.unattendedEncryption.body'
  | 'pullBranchDeleted.intro'
  | 'pullBranchDeleted.recovered'
  | 'cheapLfs.restore.phase.decrypting'
  | 'cheapLfs.encryption.dialog.commitDescription'
  | 'lazyView.loading'
  | 'lazyView.failedBody'
  // Only the changelog viewer's framing carries bands. Every version number,
  // date, category and entry line stays exactly as the release recorded it —
  // the counts inside these two are interpolated facts, not voice.
  | 'changelog.summary'
  | 'changelog.empty'
  // Only the dim sum card's framing is banded. The dish's name, its
  // romanization and the picture's description are the facts the card exists
  // to state, so they are single fixed strings in both languages.
  | 'dimSum.title'
  | 'dimSum.lead'

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

/** Build one independently toned value for interpolation by both catalogs. */
export function funnyLevelBilingualVariable(
  base: FunnyLevelTextBase,
  levels: IFunnyLevels = DefaultFunnyLevels,
  variables: TranslationVariables = {}
): IBilingualVariable {
  const englishKey: TranslationKey = `${base}.${funnyBand(levels.english)}`
  const cantoneseKey: TranslationKey = `${base}.${funnyBand(levels.cantonese)}`
  return bilingualVariable(
    translate(englishKey, 'english', variables),
    translate(cantoneseKey, 'cantonese', variables)
  )
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
  const localized = funnyLevelBilingualVariable(base, levels, variables)

  if (languageMode === 'cantonese') {
    return localized.cantonese
  }
  if (languageMode === 'bilingual') {
    return `${localized.english} · ${localized.cantonese}`
  }
  return localized.english
}
