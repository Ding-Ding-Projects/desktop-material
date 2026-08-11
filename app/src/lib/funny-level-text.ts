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
export type FunnyBand = 'plain' | 'light' | 'playful' | 'maximum'

/**
 * Key families which carry a `.plain` / `.light` / `.playful` / `.maximum`
 * variant.
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
  // Only the documentation browser's framing carries bands. Every article
  // title, category, source path and the prose itself is the documentation's
  // own words, and the counts inside these two are interpolated facts rather
  // than voice.
  | 'docsBrowser.summary'
  | 'docsBrowser.empty'
  // Only the dim sum card's framing is banded. The dish's name, its
  // romanization and the picture's description are the facts the card exists
  // to state, so they are single fixed strings in both languages.
  | 'dimSum.title'
  | 'dimSum.lead'
  // Only the framing of the surface-lock surfaces is banded. Which surface is
  // locked, which folder deletes every lock, how many wrong answers have been
  // taken and how long the next attempt has to wait are facts the user acts on,
  // so they are stated identically in every band — and the honesty line saying
  // this is not security is a single fixed string that no band may soften.
  | 'md3.locks.setupLead'
  | 'md3.locks.unlockLead'
  | 'md3.locks.wrongAttempt'
  | 'md3.locks.managerLead'
  // Only the destructive-action gate's framing sentence is banded. What is
  // about to be destroyed, what cannot be undone, the exact target and the
  // exact effect are supplied by the calling surface and rendered verbatim at
  // every level — a gate whose joke leaves the user unsure what the button
  // does is a broken gate, not a funny one.
  | 'md3.destructiveGate.lead'
  // The support desk is a joke, and these three are where the joke lives: the
  // desk's own framing, its canned first response, and the framing above the
  // resolution. Everything the user acts on is deliberately NOT banded — the
  // disclosure that nothing is sent anywhere, the folder path, the fact that
  // the app never deletes it for you, the failure message the file manager
  // reported. A funny level may make the desk pompous; it may never make the
  // recovery route ambiguous.
  | 'supportTickets.deskLead'
  | 'supportTickets.response.acknowledged'
  | 'supportTickets.resolution.lead'
  // Only the dialog-decoration setting's explanation is banded. The toggle's
  // own label, the boundary note, and the default-provenance line are single
  // fixed strings: what the switch is called, where emoji are forbidden, and
  // whether the current value was actually chosen are facts a reader acts on.
  | 'dialogEmoji.explanation'
  // Only the authenticator's two framing sentences are banded: the empty list,
  // and the sentence asking for a code back during pairing. Everything a user
  // acts on stays fixed — the digits themselves, the countdown, the algorithm,
  // the digit count, the period, which clock is wrong and by how many seconds,
  // and every message about a secret. A playful authenticator is fine; one
  // whose joke leaves the reader unsure whether a code is still valid is not.
  | 'md3.auth.empty.none'
  | 'md3.auth.register.confirmHint'

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

/**
 * 1-2 reads plain, 3 reads lightly playful, 4 reads playful, and 5 gets its
 * own maximum band — the slider's top stop must be audibly funnier than the
 * stop below it, or "maximum playfulness" is a label with nothing behind it.
 */
export function funnyBand(level: number): FunnyBand {
  const clamped = clampFunnyLevel(
    level,
    DefaultAudioSystemSettings.funnyLevelEnglish
  )
  if (clamped <= 2) {
    return 'plain'
  }
  if (clamped === 3) {
    return 'light'
  }
  return clamped === 4 ? 'playful' : 'maximum'
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
