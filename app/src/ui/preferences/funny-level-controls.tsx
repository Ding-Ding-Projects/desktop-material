import * as React from 'react'

import { translate, TranslationKey } from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'
import { clampFunnyLevel } from '../../lib/audio/audio-settings'
import {
  funnyLevelNameKey,
  funnyLevelValueText,
  IFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'

/** The two independently-adjustable tone tracks. */
type ToneLanguage = 'english' | 'cantonese'

/** The `data-` attribute carrying a slider's track through the DOM event. */
const ToneLanguageAttribute = 'data-tone-language'

interface IFunnyLevelControlsProps {
  /** The viewer's display language, used for every label and caption. */
  readonly languageMode: LanguageMode

  /** The current per-language playfulness, 1 (serious) .. 5 (maximum). */
  readonly levels: IFunnyLevels

  /** Called with the whole pair whenever either slider moves. */
  readonly onLevelsChanged: (levels: IFunnyLevels) => void
}

/**
 * The per-language funny-level sliders, rendered next to the language-mode
 * selector on the Appearance pane.
 *
 * These live here rather than under the narrator's own settings because the
 * level styles *every* message the app writes or speaks — errors, warnings and
 * destructive prompts included — so a user looking for a tone control has no
 * reason to open a Sound tab, and a slider sitting under a text-to-speech
 * heading falsely implies it only affects the spoken voice.
 *
 * English and Cantonese are fully independent: English can read plainly while
 * Cantonese reads playfully, or the other way round. In every combination the
 * level moves the voice and never the facts, which the live preview
 * demonstrates with a destructive warning whose irreversibility sentence is
 * word-for-word identical at all five levels.
 */
export class FunnyLevelControls extends React.Component<IFunnyLevelControlsProps> {
  private onLevelChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const language = input.getAttribute(ToneLanguageAttribute)
    const level = clampFunnyLevel(
      Number(input.value),
      language === 'cantonese'
        ? this.props.levels.cantonese
        : this.props.levels.english
    )

    this.props.onLevelsChanged(
      language === 'cantonese'
        ? { ...this.props.levels, cantonese: level }
        : { ...this.props.levels, english: level }
    )
  }

  public render() {
    const localize = (key: TranslationKey) =>
      translate(key, this.props.languageMode)

    return (
      <div
        className="appearance-tone-section"
        role="group"
        aria-labelledby="appearance-tone-heading"
      >
        <h3 id="appearance-tone-heading" className="appearance-tone-heading">
          {localize('appearance.toneHeading')}
        </h3>
        <p className="appearance-customization-caption">
          {localize('appearance.toneDescription')}
        </p>
        <div className="appearance-tone-sliders">
          {this.renderSlider(
            'english',
            'appearance-funny-level-english',
            'appearance.toneEnglishLabel',
            this.props.levels.english
          )}
          {this.renderSlider(
            'cantonese',
            'appearance-funny-level-cantonese',
            'appearance.toneCantoneseLabel',
            this.props.levels.cantonese
          )}
        </div>
        {this.renderPreview()}
        <p className="appearance-customization-caption">
          {localize('appearance.toneNarratorNote')}
        </p>
      </div>
    )
  }

  /**
   * One track's slider. The accessible value text names the level rather than
   * announcing a bare number, because "3" on its own tells a screen-reader user
   * nothing about how the app will read.
   */
  private renderSlider(
    language: ToneLanguage,
    id: string,
    labelKey: TranslationKey,
    value: number
  ) {
    const { languageMode } = this.props
    const languageAttribute = { [ToneLanguageAttribute]: language }

    return (
      <div className="appearance-tone-field">
        <label className="appearance-tone-label" htmlFor={id}>
          {translate(labelKey, languageMode)}
        </label>
        <div className="appearance-tone-slider-row">
          <input
            {...languageAttribute}
            id={id}
            className="appearance-tone-slider"
            type="range"
            min={1}
            max={5}
            step={1}
            value={value}
            aria-valuetext={funnyLevelValueText(value, languageMode)}
            onChange={this.onLevelChanged}
          />
          <span className="appearance-tone-value" aria-hidden={true}>
            {value}
          </span>
        </div>
        <div className="appearance-tone-scale">
          <span aria-hidden={true}>
            {translate('appearance.toneScaleMin', languageMode)}
          </span>
          <strong className="appearance-tone-level-name" aria-hidden={true}>
            {translate(funnyLevelNameKey(value), languageMode)}
          </strong>
          <span aria-hidden={true}>
            {translate('appearance.toneScaleMax', languageMode)}
          </span>
        </div>
      </div>
    )
  }

  private renderPreview() {
    return (
      <div
        className="appearance-tone-preview"
        role="group"
        aria-labelledby="appearance-tone-preview-heading"
      >
        <h4
          id="appearance-tone-preview-heading"
          className="appearance-tone-preview-heading"
        >
          {translate('appearance.tonePreviewHeading', this.props.languageMode)}
        </h4>
        {this.renderPreviewCard('english', this.props.levels.english)}
        {this.renderPreviewCard('cantonese', this.props.levels.cantonese)}
      </div>
    )
  }

  /**
   * A live sample of one track at its current level: an ordinary status line
   * and a destructive warning. Each card is rendered in its own language
   * regardless of the viewer's display mode, so both sliders can be judged at
   * once. The warning's closing sentence comes from a single fixed resource
   * with no per-level variants, so an irreversible action can never read as a
   * maybe.
   */
  private renderPreviewCard(language: ToneLanguage, level: number) {
    const { languageMode, levels } = this.props
    const labelKey: TranslationKey =
      language === 'english'
        ? 'appearance.tonePreviewEnglishLabel'
        : 'appearance.tonePreviewCantoneseLabel'

    return (
      <div
        className="appearance-tone-preview-card"
        data-tone-preview={language}
      >
        <span className="appearance-tone-preview-label">
          {translate(labelKey, languageMode, { level: String(level) })}
        </span>
        <p className="appearance-tone-preview-sample" data-tone-sample="status">
          {translateWithFunnyLevel('appearance.tonePreview', language, levels)}
        </p>
        <span className="appearance-tone-preview-label">
          {translate('appearance.tonePreviewWarningLabel', languageMode)}
        </span>
        <p
          className="appearance-tone-preview-sample"
          data-tone-sample="warning"
        >
          {translateWithFunnyLevel(
            'appearance.toneWarningPreview',
            language,
            levels
          )}{' '}
          {translate('appearance.toneWarningFixed', language)}
        </p>
      </div>
    )
  }
}
