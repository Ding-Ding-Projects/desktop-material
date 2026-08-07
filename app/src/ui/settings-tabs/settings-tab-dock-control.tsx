import * as React from 'react'

import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
} from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'
import {
  isSettingsTabDockPosition,
  SettingsTabDockPosition,
  SettingsTabStripId,
} from './settings-tab-model'

interface ISettingsTabDockControlProps {
  readonly strip: SettingsTabStripId
  readonly position: SettingsTabDockPosition
  readonly onChange: (position: SettingsTabDockPosition) => void
  readonly disabled?: boolean
}

interface ISettingsTabDockControlState {
  readonly languageMode: LanguageMode
}

/**
 * A small, explicit placement control shared by Preferences and Repository
 * Settings. It is deliberately a native select rather than a context menu: the
 * four choices remain visible, keyboard reachable, and discoverable when a
 * strip has moved away from the left rail.
 */
export class SettingsTabDockControl extends React.Component<
  ISettingsTabDockControlProps,
  ISettingsTabDockControlState
> {
  public state: ISettingsTabDockControlState = {
    languageMode: getPersistedLanguageMode(),
  }

  public componentDidMount() {
    window.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount() {
    window.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = () => {
    this.setState({ languageMode: getPersistedLanguageMode() })
  }

  private onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const position = event.currentTarget.value
    if (isSettingsTabDockPosition(position)) {
      this.props.onChange(position)
    }
  }

  public render() {
    const { languageMode } = this.state
    const controlId = `settings-tab-dock-${this.props.strip}`
    const descriptionId = `${controlId}-description`

    return (
      <div
        className="settings-tab-dock-control"
        data-settings-tab-dock-position={this.props.position}
      >
        <label htmlFor={controlId}>
          {translate('settings.tabsDockPosition', languageMode)}
        </label>
        <select
          id={controlId}
          value={this.props.position}
          onChange={this.onChange}
          disabled={this.props.disabled}
          aria-label={translateForAccessibleName(
            'settings.tabsDockPosition',
            {},
            languageMode
          )}
          aria-describedby={descriptionId}
        >
          <option value="left">
            {translate('settings.tabsDockLeft', languageMode)}
          </option>
          <option value="top">
            {translate('settings.tabsDockTop', languageMode)}
          </option>
          <option value="bottom">
            {translate('settings.tabsDockBottom', languageMode)}
          </option>
          <option value="right">
            {translate('settings.tabsDockRight', languageMode)}
          </option>
        </select>
        <p id={descriptionId}>
          {translate('settings.tabsDockDescription', languageMode)}
        </p>
      </div>
    )
  }
}
