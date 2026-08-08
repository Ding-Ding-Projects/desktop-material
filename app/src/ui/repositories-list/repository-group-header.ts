/**
 * Wording for the repository-list group disclosure control.
 *
 * The row `aria-label` in this list replaces its inner text for assistive
 * technology, so a header that only painted "OTHER" plus a chevron would be
 * announced as an unlabelled button. Everything a screen-reader user needs —
 * the group name, the exact member count, and whether the group is folded — is
 * composed here into one sentence.
 *
 * The funny level moves the voice only. The group name and the count are
 * interpolated identically into every band: a playful fold is still a fold, and
 * "4 repositories" is still four repositories.
 */

import {
  getPrimaryLanguageMode,
  SupportedLocale,
  translate,
  TranslationKey,
} from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'
import {
  bandForFunnyLevel,
  FunnyBand,
  IRepositorySyncFunnyLevels,
} from './repository-sync-summary'

const DisclosureKeys: Readonly<
  Record<'collapsed' | 'expanded', Readonly<Record<FunnyBand, TranslationKey>>>
> = {
  collapsed: {
    plain: 'repositoryPicker.groupCollapsed.plain',
    light: 'repositoryPicker.groupCollapsed.light',
    playful: 'repositoryPicker.groupCollapsed.playful',
    maximum: 'repositoryPicker.groupCollapsed.maximum',
  },
  expanded: {
    plain: 'repositoryPicker.groupExpanded.plain',
    light: 'repositoryPicker.groupExpanded.light',
    playful: 'repositoryPicker.groupExpanded.playful',
    maximum: 'repositoryPicker.groupExpanded.maximum',
  },
}

const AutoExpandedKeys: Readonly<
  Record<'one' | 'many', Readonly<Record<FunnyBand, TranslationKey>>>
> = {
  one: {
    plain: 'repositoryPicker.autoExpandedOne.plain',
    light: 'repositoryPicker.autoExpandedOne.light',
    playful: 'repositoryPicker.autoExpandedOne.playful',
    maximum: 'repositoryPicker.autoExpandedOne.maximum',
  },
  many: {
    plain: 'repositoryPicker.autoExpandedMany.plain',
    light: 'repositoryPicker.autoExpandedMany.light',
    playful: 'repositoryPicker.autoExpandedMany.playful',
    maximum: 'repositoryPicker.autoExpandedMany.maximum',
  },
}

type SingleLanguage = 'english' | 'cantonese'

/**
 * A DOM id for the rows one group discloses, derived injectively from its group
 * key.
 *
 * Group keys carry owner logins, Enterprise hosts, and user-chosen group names,
 * so they can hold spaces, dots, and anything else a person can type. An
 * `aria-controls` value is an IDREF and cannot, so every character outside
 * `[A-Za-z0-9-]` is escaped as `_<codepoint-in-hex>_`. Escaping `_` as well
 * keeps the mapping reversible: without that, a group literally named `a_3a_b`
 * and one named `a:b` would claim the same id.
 */
export function repositoryGroupRowsId(groupKey: string): string {
  const escaped = groupKey.replace(
    /[^a-zA-Z0-9-]/g,
    character => `_${character.codePointAt(0)?.toString(16) ?? '0'}_`
  )
  return `repository-group-rows-${escaped}`
}

function levelFor(
  language: SingleLanguage,
  funnyLevels: IRepositorySyncFunnyLevels
): number {
  return language === 'cantonese' ? funnyLevels.cantonese : funnyLevels.english
}

/** "4 repositories" / "1 repository", exact in either language. */
function repositoryCountPhrase(
  count: number,
  language: SingleLanguage
): string {
  const key: TranslationKey =
    count === 1
      ? 'repositoryPicker.groupRepositoryOne'
      : 'repositoryPicker.groupRepositoryMany'
  return translate(key, language, { count: `${count}` })
}

/**
 * The accessible name for one group header, e.g. "Other, 4 repositories,
 * collapsed".
 *
 * Resolved in the language mode's primary language rather than bilingually: an
 * accessible name is read aloud once, and stitching two locales into it makes
 * the count arrive twice.
 */
export function getRepositoryGroupAccessibleName(
  label: string,
  count: number,
  collapsed: boolean,
  languageMode: LanguageMode,
  funnyLevels: IRepositorySyncFunnyLevels
): string {
  const language: SingleLanguage =
    getPrimaryLanguageMode(languageMode) === 'cantonese'
      ? 'cantonese'
      : 'english'
  const band = bandForFunnyLevel(levelFor(language, funnyLevels))

  return translate(
    DisclosureKeys[collapsed ? 'collapsed' : 'expanded'][band],
    language,
    {
      group: label,
      repositories: repositoryCountPhrase(count, language),
    }
  )
}

/** One language's rendering of a notice, tagged so AT can switch voices. */
export interface IRepositoryGroupNoticeSegment {
  readonly locale: SupportedLocale
  readonly text: string
}

function autoExpandedText(
  count: number,
  language: SingleLanguage,
  funnyLevels: IRepositorySyncFunnyLevels
): string {
  const band = bandForFunnyLevel(levelFor(language, funnyLevels))
  return translate(
    AutoExpandedKeys[count === 1 ? 'one' : 'many'][band],
    language,
    { count: `${count}` }
  )
}

/**
 * The sentence explaining why folded groups opened themselves while a filter is
 * active, one segment per language the active mode paints.
 *
 * Empty when nothing was force-expanded, so the surface renders nothing rather
 * than an empty notice. Each language is banded by *its own* funny level, the
 * same way the row's sync line is: a bilingual reader who set English serious
 * and Cantonese maximum gets exactly that.
 */
export function getAutoExpandedGroupsSegments(
  count: number,
  languageMode: LanguageMode,
  funnyLevels: IRepositorySyncFunnyLevels
): ReadonlyArray<IRepositoryGroupNoticeSegment> {
  if (count <= 0) {
    return []
  }

  const english: IRepositoryGroupNoticeSegment = {
    locale: 'en',
    text: autoExpandedText(count, 'english', funnyLevels),
  }
  const cantonese: IRepositoryGroupNoticeSegment = {
    locale: 'zh-HK',
    text: autoExpandedText(count, 'cantonese', funnyLevels),
  }

  return languageMode === 'cantonese'
    ? [cantonese]
    : languageMode === 'bilingual'
    ? [english, cantonese]
    : [english]
}
