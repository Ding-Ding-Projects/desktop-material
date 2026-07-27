/**
 * The secondary "how far from the remote is this row" line in the repository
 * list.
 *
 * Everything here is a pure derivation of state the app has already loaded
 * (`ILocalRepositoryState`, which the push/pull toolbar button reads from as
 * well). Nothing in this module talks to Git or the network: the repository
 * list is virtualized and filter-driven, so a per-row fetch would turn forty
 * repositories into forty network calls and typing in the filter box into a
 * request storm.
 */

import {
  AudioSettingsStorageKey,
  clampFunnyLevel,
  DefaultAudioSystemSettings,
  parseAudioSettings,
} from '../../lib/audio/audio-settings'
import { assertNever } from '../../lib/fatal-error'
import {
  getPrimaryLanguageMode,
  SupportedLocale,
  translate,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { IAheadBehind } from '../../models/branch'
import { CloningRepository } from '../../models/cloning-repository'
import { LanguageMode } from '../../models/language-mode'
import { Repository, RepositoryUpstreamState } from '../../models/repository'
import { Repositoryish } from './group-repositories'

/**
 * The distinct, honest states a row's sync line can be in.
 *
 * `unknown` is deliberately its own state rather than a zero count. A row we
 * have never inspected must not claim to be up to date.
 */
export type RepositorySyncSummaryKind =
  | 'cloning'
  | 'missing'
  | 'unknown'
  | 'empty'
  | 'detached'
  | 'no-upstream'
  | 'in-sync'
  | 'ahead'
  | 'behind'
  | 'diverged'

export interface IRepositorySyncSummary {
  readonly kind: RepositorySyncSummaryKind

  /**
   * Commits this row can push, or `null` when no count is known.
   *
   * `null` is never coerced to `0` anywhere in this module. A known zero (the
   * in-sync state) and an unknown count are different claims about the world.
   */
  readonly ahead: number | null

  /** Commits waiting at the remote to be pulled, or `null` when unknown. */
  readonly behind: number | null
}

/** Per-language playfulness, 1 (fully serious) .. 5 (maximum). */
export interface IRepositorySyncFunnyLevels {
  readonly english: number
  readonly cantonese: number
}

export const DefaultRepositorySyncFunnyLevels: IRepositorySyncFunnyLevels = {
  english: DefaultAudioSystemSettings.funnyLevelEnglish,
  cantonese: DefaultAudioSystemSettings.funnyLevelCantonese,
}

/** One language's rendering of the line, tagged so AT can switch voices. */
export interface IRepositorySyncSummarySegment {
  readonly locale: SupportedLocale
  readonly text: string
}

export interface IRepositorySyncSummaryText {
  /** What is painted, in the order the active language mode wants it. */
  readonly segments: ReadonlyArray<IRepositorySyncSummarySegment>

  /**
   * A single-language sentence for the row's accessible name. Always a
   * readable clause ("2 commits to push, nothing to pull"), never bare digits.
   */
  readonly accessibleName: string
}

/**
 * The funny-level voice a string is written in. Shared with the group-header
 * disclosure text so both repository-list surfaces band playfulness the same
 * way instead of drifting apart.
 */
export type FunnyBand = 'plain' | 'light' | 'playful'

const SummaryTranslationKeys: Readonly<
  Record<RepositorySyncSummaryKind, Readonly<Record<FunnyBand, TranslationKey>>>
> = {
  cloning: {
    plain: 'repositorySync.cloning.plain',
    light: 'repositorySync.cloning.light',
    playful: 'repositorySync.cloning.playful',
  },
  missing: {
    plain: 'repositorySync.missing.plain',
    light: 'repositorySync.missing.light',
    playful: 'repositorySync.missing.playful',
  },
  unknown: {
    plain: 'repositorySync.unknown.plain',
    light: 'repositorySync.unknown.light',
    playful: 'repositorySync.unknown.playful',
  },
  empty: {
    plain: 'repositorySync.empty.plain',
    light: 'repositorySync.empty.light',
    playful: 'repositorySync.empty.playful',
  },
  detached: {
    plain: 'repositorySync.detached.plain',
    light: 'repositorySync.detached.light',
    playful: 'repositorySync.detached.playful',
  },
  'no-upstream': {
    plain: 'repositorySync.noUpstream.plain',
    light: 'repositorySync.noUpstream.light',
    playful: 'repositorySync.noUpstream.playful',
  },
  'in-sync': {
    plain: 'repositorySync.inSync.plain',
    light: 'repositorySync.inSync.light',
    playful: 'repositorySync.inSync.playful',
  },
  ahead: {
    plain: 'repositorySync.ahead.plain',
    light: 'repositorySync.ahead.light',
    playful: 'repositorySync.ahead.playful',
  },
  behind: {
    plain: 'repositorySync.behind.plain',
    light: 'repositorySync.behind.light',
    playful: 'repositorySync.behind.playful',
  },
  diverged: {
    plain: 'repositorySync.diverged.plain',
    light: 'repositorySync.diverged.light',
    playful: 'repositorySync.diverged.playful',
  },
}

const withoutCounts = (
  kind: RepositorySyncSummaryKind
): IRepositorySyncSummary => ({ kind, ahead: null, behind: null })

/**
 * Derive the row's sync state from state already in memory.
 *
 * The only path to a rendered number runs through a `'tracking'` upstream with
 * a recorded `aheadBehind`. Every other combination lands on a state that says
 * what it does not know.
 */
export function getRepositorySyncSummary(
  repository: Repositoryish,
  upstreamState: RepositoryUpstreamState,
  aheadBehind: IAheadBehind | null
): IRepositorySyncSummary {
  if (repository instanceof CloningRepository) {
    return withoutCounts('cloning')
  }

  if (repository instanceof Repository && repository.missing) {
    return withoutCounts('missing')
  }

  switch (upstreamState) {
    case 'unknown':
      return withoutCounts('unknown')
    case 'unborn':
      return withoutCounts('empty')
    case 'detached':
      return withoutCounts('detached')
    case 'no-upstream':
      return withoutCounts('no-upstream')
    case 'tracking':
      break
    default:
      return assertNever(
        upstreamState,
        `Unknown repository upstream state ${upstreamState}`
      )
  }

  if (aheadBehind === null) {
    // We know there is a tracking branch but no counts have been recorded
    // against it. That is still "nobody has looked", not "nothing to do".
    return withoutCounts('unknown')
  }

  const { ahead, behind } = aheadBehind

  if (ahead > 0 && behind > 0) {
    return { kind: 'diverged', ahead, behind }
  }
  if (ahead > 0) {
    return { kind: 'ahead', ahead, behind }
  }
  if (behind > 0) {
    return { kind: 'behind', ahead, behind }
  }

  return { kind: 'in-sync', ahead, behind }
}

/** Map a 1..5 funny level onto the three bands the resources are written in. */
export function bandForFunnyLevel(level: number): FunnyBand {
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
  return 'playful'
}

function commitCountPhrase(
  count: number,
  language: 'english' | 'cantonese'
): string {
  const key: TranslationKey =
    count === 1 ? 'repositorySync.commitOne' : 'repositorySync.commitMany'
  return translate(key, language, { count: `${count}` })
}

function variablesFor(
  summary: IRepositorySyncSummary,
  language: 'english' | 'cantonese'
): TranslationVariables {
  const variables: Record<string, string> = {}

  if (summary.ahead !== null) {
    variables.ahead = commitCountPhrase(summary.ahead, language)
  }
  if (summary.behind !== null) {
    variables.behind = commitCountPhrase(summary.behind, language)
  }

  return variables
}

function textFor(
  summary: IRepositorySyncSummary,
  language: 'english' | 'cantonese',
  funnyLevel: number
): string {
  const key =
    SummaryTranslationKeys[summary.kind][bandForFunnyLevel(funnyLevel)]
  return translate(key, language, variablesFor(summary, language))
}

/**
 * Render the summary for a language mode, honouring each language's own funny
 * level. The playfulness moves the wording; the counts and the state never
 * move.
 */
export function getRepositorySyncSummaryText(
  summary: IRepositorySyncSummary,
  languageMode: LanguageMode,
  funnyLevels: IRepositorySyncFunnyLevels = DefaultRepositorySyncFunnyLevels
): IRepositorySyncSummaryText {
  const english: IRepositorySyncSummarySegment = {
    locale: 'en',
    text: textFor(summary, 'english', funnyLevels.english),
  }
  const cantonese: IRepositorySyncSummarySegment = {
    locale: 'zh-HK',
    text: textFor(summary, 'cantonese', funnyLevels.cantonese),
  }

  const segments =
    languageMode === 'cantonese'
      ? [cantonese]
      : languageMode === 'bilingual'
      ? [english, cantonese]
      : [english]

  return {
    segments,
    accessibleName:
      getPrimaryLanguageMode(languageMode) === 'cantonese'
        ? cantonese.text
        : english.text,
  }
}

/**
 * Read the persisted per-language funny levels.
 *
 * Deliberately called once by the list (not once per row): it touches
 * localStorage, and the list re-renders on every keystroke in the filter box.
 */
export function readRepositorySyncFunnyLevels(): IRepositorySyncFunnyLevels {
  if (typeof localStorage === 'undefined') {
    return DefaultRepositorySyncFunnyLevels
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
    return DefaultRepositorySyncFunnyLevels
  }
}
