import * as React from 'react'

import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translateForAccessibleName,
} from '../../lib/i18n'
import { LanguageMode } from '../../models/language-mode'
import {
  SearchableSelect,
  ISearchableSelectOption,
} from '../lib/searchable-select'
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
 * Settings. It uses the shared searchable picker so all four choices remain
 * keyboard reachable, discoverable, and attached to their own regex state.
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

  private onChange = (position: string) => {
    if (isSettingsTabDockPosition(position)) {
      this.props.onChange(position)
    }
  }

  public render() {
    const { languageMode } = this.state
    const controlId = `settings-tab-dock-${this.props.strip}`
    const descriptionId = `${controlId}-description`
    const options: ReadonlyArray<ISearchableSelectOption> = [
      {
        value: 'left',
        label: translate('settings.tabsDockLeft', languageMode),
      },
      {
        value: 'top',
        label: translate('settings.tabsDockTop', languageMode),
      },
      {
        value: 'bottom',
        label: translate('settings.tabsDockBottom', languageMode),
      },
      {
        value: 'right',
        label: translate('settings.tabsDockRight', languageMode),
      },
    ]

    return (
      <div
        className="settings-tab-dock-control"
        data-settings-tab-dock-position={this.props.position}
      >
        <SearchableSelect
          label={translate('settings.tabsDockPosition', languageMode)}
          value={this.props.position}
          options={options}
          onChange={this.onChange}
          searchSurfaceId={controlId}
          regexBuilderTarget={translateForAccessibleName(
            'settings.tabsDockPosition',
            {},
            languageMode
          )}
          disabled={this.props.disabled}
          ariaDescribedBy={descriptionId}
        />
        <p id={descriptionId}>
          {translate('settings.tabsDockDescription', languageMode)}
        </p>
      </div>
    )
  }
}
