import * as React from 'react'
import classNames from 'classnames'
import { TabGroupColor, TabGroupColors } from '../../models/repository-tab'
import { LanguageMode } from '../../models/language-mode'
import {
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'

/** The accessible colour name for each curated group colour. */
export const TabGroupColorTranslationKeys: Readonly<
  Record<TabGroupColor, TranslationKey>
> = {
  blue: 'tabs.groupColorBlue',
  green: 'tabs.groupColorGreen',
  yellow: 'tabs.groupColorYellow',
  red: 'tabs.groupColorRed',
  purple: 'tabs.groupColorPurple',
  grey: 'tabs.groupColorGrey',
}

interface ITabGroupColorPickerProps {
  readonly color: TabGroupColor
  readonly languageMode: LanguageMode
  readonly onColorChange: (color: TabGroupColor) => void
}

/**
 * The curated group-colour chooser shared by the create and edit dialogs.
 *
 * Every swatch is a real toggle button with its own accessible colour name and
 * `aria-pressed`, so the chooser is operable from the keyboard and announces
 * which colour is active rather than relying on the painted ring. The colour
 * set is closed (see {@link TabGroupColors}), which is what keeps a persisted
 * value from ever reaching an inline style as arbitrary CSS.
 */
export class TabGroupColorPicker extends React.Component<ITabGroupColorPickerProps> {
  private accessibleText(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translateForAccessibleName(key, variables, this.props.languageMode)
  }

  private onColorClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const color = event.currentTarget.dataset.color as TabGroupColor | undefined
    if (color !== undefined) {
      this.props.onColorChange(color)
    }
  }

  private renderColor(color: TabGroupColor) {
    const selected = this.props.color === color
    const colorLabel = this.accessibleText(TabGroupColorTranslationKeys[color])
    return (
      <button
        key={color}
        type="button"
        className={classNames('tab-group-color', `tab-group-color--${color}`, {
          selected,
        })}
        aria-label={this.accessibleText('tabs.groupColorChoice', {
          color: colorLabel,
        })}
        aria-pressed={selected}
        data-color={color}
        onClick={this.onColorClick}
      />
    )
  }

  public render() {
    return (
      <div
        className="tab-group-colors"
        role="group"
        aria-label={this.accessibleText('tabs.groupColorLabel')}
      >
        {TabGroupColors.map(color => this.renderColor(color))}
      </div>
    )
  }
}
