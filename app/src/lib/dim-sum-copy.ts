/**
 * Composes everything the dim sum card renders: the dish's name, the picture's
 * description, and the framing copy in whichever languages the user reads, at
 * whichever playfulness each of those languages is set to.
 *
 * Pure and DOM-free, so a test can assert that the facts survive every one of
 * the fifteen language-mode × funny-level combinations without a renderer.
 */

import { LanguageMode } from '../models/language-mode'
import {
  IDimSumDish,
  IDimSumNamePart,
  dimSumAltText,
  dimSumDisplayName,
  dimSumNameParts,
} from '../models/dim-sum'
import { DefaultFunnyLevels, IFunnyLevels, funnyBand } from './funny-level-text'
import { getPrimaryLanguageMode, translate } from './i18n'

/** One language's block of framing copy on the card. */
export interface IDimSumCopyBlock {
  /** BCP-47 tag for the block, so a screen reader picks the right voice. */
  readonly htmlLang: 'en' | 'zh-HK'
  readonly title: string
  readonly lead: string
}

/** Everything the card renders, already resolved for this user's settings. */
export interface IDimSumCardContent {
  /** Accessible name of the card's region. */
  readonly region: string
  /** Accessible name of the dismiss button. */
  readonly dismiss: string
  /** The dish's visible name, both languages, primary first. */
  readonly name: string
  /** The same name split into language-tagged runs for rendering. */
  readonly nameParts: ReadonlyArray<IDimSumNamePart>
  /** Jyutping line, or null when the catalog records no romanization. */
  readonly romanization: string | null
  /** Alt text describing the photograph and naming the dish. */
  readonly alt: string
  /** The card's own `lang`, matching the mode's primary language. */
  readonly htmlLang: 'en' | 'zh-HK'
  /** The framing copy: one block per language the mode shows. */
  readonly blocks: ReadonlyArray<IDimSumCopyBlock>
}

function blockFor(
  language: 'english' | 'cantonese',
  levels: IFunnyLevels
): IDimSumCopyBlock {
  const band = funnyBand(
    language === 'cantonese' ? levels.cantonese : levels.english
  )
  return {
    htmlLang: language === 'cantonese' ? 'zh-HK' : 'en',
    title: translate(`dimSum.title.${band}`, language),
    lead: translate(`dimSum.lead.${band}`, language),
  }
}

/**
 * Build the card's content for one dish.
 *
 * Bilingual mode renders both framing blocks — each at its own language's
 * funny level, so English can read plainly while Cantonese reads playfully —
 * but only one name, because the name already carries both languages and
 * printing it twice would be noise rather than translation.
 */
export function composeDimSumCard(
  dish: IDimSumDish,
  languageMode: LanguageMode,
  levels: IFunnyLevels = DefaultFunnyLevels
): IDimSumCardContent {
  const primary = getPrimaryLanguageMode(languageMode)
  const blocks =
    languageMode === 'bilingual'
      ? [blockFor('english', levels), blockFor('cantonese', levels)]
      : [blockFor(primary, levels)]

  return {
    region: translate('dimSum.region', languageMode),
    dismiss: translate('dimSum.dismiss', languageMode),
    name: dimSumDisplayName(dish, primary),
    nameParts: dimSumNameParts(dish, primary),
    romanization:
      dish.jyutping.length > 0
        ? translate('dimSum.romanization', languageMode, {
            jyutping: dish.jyutping,
          })
        : null,
    alt: dimSumAltText(dish, primary),
    htmlLang: primary === 'cantonese' ? 'zh-HK' : 'en',
    blocks,
  }
}
