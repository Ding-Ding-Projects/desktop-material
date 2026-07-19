import * as React from 'react'
import { LanguageMode } from '../../models/language-mode'
import {
  getPersistedLanguageMode,
  translate,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'

interface ILocalizedTextProps {
  readonly translationKey: TranslationKey
  readonly variables?: TranslationVariables
  readonly languageMode?: LanguageMode
  readonly className?: string
}

/**
 * Render feature copy with explicit language boundaries.
 *
 * Bilingual strings stay visually compact while assistive technologies can
 * switch pronunciation between the English and Hong Kong Cantonese spans.
 */
export function LocalizedText({
  translationKey,
  variables = {},
  languageMode = getPersistedLanguageMode(),
  className,
}: ILocalizedTextProps) {
  const wrapperClassName = ['localized-text', className]
    .filter(Boolean)
    .join(' ')

  if (languageMode === 'bilingual') {
    return (
      <span className={wrapperClassName} data-language-mode="bilingual">
        <span lang="en">{translate(translationKey, 'english', variables)}</span>
        <span className="localized-text-separator" aria-hidden={true}>
          {' · '}
        </span>
        <span lang="zh-HK">
          {translate(translationKey, 'cantonese', variables)}
        </span>
      </span>
    )
  }

  return (
    <span
      className={wrapperClassName}
      data-language-mode={languageMode}
      lang={languageMode === 'cantonese' ? 'zh-HK' : 'en'}
    >
      {translate(translationKey, languageMode, variables)}
    </span>
  )
}
