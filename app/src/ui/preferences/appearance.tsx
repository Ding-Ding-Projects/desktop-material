import * as React from 'react'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
} from '../lib/application-theme'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { RadioGroup } from '../lib/radio-group'
import { Select } from '../lib/select'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { tabSizeDefault } from '../../lib/stores/app-store'
import { enableFormattingPreferences } from '../../lib/feature-flag'
import {
  DateFormat,
  TimeFormat,
  INumberFormat,
  dateFormats,
  timeFormats,
  numberFormats,
  numberFormatToKey,
} from '../../models/formatting-preferences'
import { formatNumber } from '../../lib/format-number'
import { assertNever } from '../../lib/fatal-error'
import { BranchSortOrder } from '../../models/branch-sort-order'
import { ShowBranchNameInRepoListSetting } from '../../models/show-branch-name-in-repo-list'
import { IAppearanceCustomization } from '../../models/appearance-customization'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { translate } from '../../lib/i18n'
import { translateWithFunnyLevel } from '../../lib/funny-level-text'
import {
  clampFunnyLevel,
  IAudioSystemSettings,
} from '../../lib/audio/audio-settings'
import {
  AudioCueStore,
  getAudioCueStore,
} from '../../lib/audio/audio-cue-store'
import { teleportAnchor } from '../../lib/teleport-targets'

type AppearanceSelectKey = 'languageMode'

export type FunnyLevelSettingsStore = Pick<
  AudioCueStore,
  'getSettings' | 'setSettings'
>

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly appearanceCustomization: IAppearanceCustomization
  readonly onAppearanceCustomizationChanged: (
    customization: IAppearanceCustomization
  ) => void
  readonly zoomBaseFactor: number
  readonly onZoomBaseFactorChanged: (factor: number) => void
  readonly autoFitZoomEnabled: boolean
  readonly onAutoFitZoomEnabledChanged: (enabled: boolean) => void
  readonly windowZoomFactor: number
  readonly selectedTabSize: number
  readonly onSelectedTabSizeChanged: (tabSize: number) => void
  readonly selectedDateFormat: DateFormat
  readonly onSelectedDateFormatChanged: (format: DateFormat) => void
  readonly selectedTimeFormat: TimeFormat
  readonly onSelectedTimeFormatChanged: (format: TimeFormat) => void
  readonly selectedNumberFormat: INumberFormat
  readonly onSelectedNumberFormatChanged: (format: INumberFormat) => void
  readonly preferAbsoluteDates: boolean
  readonly onPreferAbsoluteDatesChanged: (value: boolean) => void
  readonly showRecentRepositories: boolean
  readonly onShowRecentRepositoriesChanged: (show: boolean) => void
  readonly showBranchNameInRepoList: ShowBranchNameInRepoListSetting
  readonly onShowBranchNameInRepoListChanged: (
    setting: ShowBranchNameInRepoListSetting
  ) => void
  readonly branchSortOrder: BranchSortOrder
  readonly onBranchSortOrderChanged: (sortOrder: BranchSortOrder) => void
  /**
   * Persists the two app-wide playfulness levels. Injectable so this pane can
   * be exercised without constructing the audio runtime in focused UI tests.
   */
  readonly funnyLevelSettingsStore?: FunnyLevelSettingsStore
}

interface IAppearanceState {
  readonly selectedTheme: ApplicationTheme | null
  readonly selectedTabSize: number
  readonly funnyLevelEnglish: number
  readonly funnyLevelCantonese: number
}

export class Appearance extends React.Component<
  IAppearanceProps,
  IAppearanceState
> {
  private readonly funnyLevelSettingsStore: FunnyLevelSettingsStore

  public constructor(props: IAppearanceProps) {
    super(props)

    const usePropTheme =
      props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()
    this.funnyLevelSettingsStore =
      props.funnyLevelSettingsStore ?? getAudioCueStore()
    const audioSettings = this.funnyLevelSettingsStore.getSettings()

    this.state = {
      selectedTheme: usePropTheme ? props.selectedTheme : null,
      selectedTabSize: props.selectedTabSize,
      funnyLevelEnglish: audioSettings.funnyLevelEnglish,
      funnyLevelCantonese: audioSettings.funnyLevelCantonese,
    }

    if (!usePropTheme) {
      this.initializeSelectedTheme()
    }
  }

  private onCustomizationChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const key = event.currentTarget.name as AppearanceSelectKey
    this.props.onAppearanceCustomizationChanged({
      ...this.props.appearanceCustomization,
      [key]: event.currentTarget
        .value as IAppearanceCustomization[AppearanceSelectKey],
    })
  }

  private renderCustomizationSelect(
    key: AppearanceSelectKey,
    label: string,
    options: ReadonlyArray<{ readonly value: string; readonly label: string }>
  ) {
    return (
      <Select
        name={key}
        label={label}
        value={this.props.appearanceCustomization[key]}
        onChange={this.onCustomizationChanged}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    )
  }

  private renderLanguageAndNavigation() {
    const languageMode = this.props.appearanceCustomization.languageMode
    const localize = (key: Parameters<typeof translate>[0]) =>
      translate(key, languageMode)

    return (
      <div
        className="appearance-section appearance-customization-section appearance-language-navigation"
        {...teleportAnchor('settings-language-mode')}
      >
        <h2>{localize('appearance.languageAndNavigation')}</h2>
        <Row>
          {this.renderCustomizationSelect(
            'languageMode',
            localize('appearance.languageMode'),
            [
              { value: 'english', label: localize('language.english') },
              { value: 'cantonese', label: localize('language.cantonese') },
              { value: 'bilingual', label: localize('language.bilingual') },
            ]
          )}
        </Row>
        <p className="appearance-customization-caption">
          {localize('appearance.languageModeDescription')}
        </p>
        <div
          className="appearance-playfulness-card"
          role="group"
          aria-labelledby="appearance-playfulness-heading"
          aria-describedby="appearance-playfulness-description"
        >
          <div className="appearance-playfulness-copy">
            <h3 id="appearance-playfulness-heading">
              {localize('appearance.playfulnessHeading')}
            </h3>
            <p id="appearance-playfulness-description">
              {localize('appearance.playfulnessDescription')}
            </p>
          </div>
          <div className="appearance-playfulness-grid">
            {this.renderFunnyLevel(
              'english',
              'appearance.englishPlayfulness',
              this.state.funnyLevelEnglish,
              this.onEnglishFunnyLevelChanged
            )}
            {this.renderFunnyLevel(
              'cantonese',
              'appearance.cantonesePlayfulness',
              this.state.funnyLevelCantonese,
              this.onCantoneseFunnyLevelChanged
            )}
          </div>
        </div>
      </div>
    )
  }

  private renderFunnyLevel(
    language: 'english' | 'cantonese',
    labelKey:
      | 'appearance.englishPlayfulness'
      | 'appearance.cantonesePlayfulness',
    value: number,
    onChange: (event: React.FormEvent<HTMLInputElement>) => void
  ) {
    const languageMode = this.props.appearanceCustomization.languageMode
    const id = `appearance-playfulness-${language}`
    const outputId = `${id}-value`
    const label = translate(labelKey, languageMode)
    const valueText = translate('appearance.playfulnessValue', languageMode, {
      value: value.toString(),
    })

    return (
      <div
        className="appearance-playfulness-control"
        {...teleportAnchor(
          language === 'english'
            ? 'settings-funny-english'
            : 'settings-funny-cantonese'
        )}
      >
        <div className="appearance-playfulness-label-row">
          <label htmlFor={id}>{label}</label>
          <output id={outputId} htmlFor={id} aria-live="polite">
            {value}
          </output>
        </div>
        <input
          id={id}
          className="appearance-playfulness-slider"
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={onChange}
          aria-describedby={`appearance-playfulness-description ${outputId}`}
          aria-valuetext={valueText}
        />
        <div className="appearance-playfulness-scale" aria-hidden={true}>
          <span>
            {translate('appearance.playfulnessSerious', languageMode)}
          </span>
          <span>
            {translate('appearance.playfulnessMaximum', languageMode)}
          </span>
        </div>
      </div>
    )
  }

  private onEnglishFunnyLevelChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.updateFunnyLevel('funnyLevelEnglish', event.currentTarget.value)
  }

  private onCantoneseFunnyLevelChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.updateFunnyLevel('funnyLevelCantonese', event.currentTarget.value)
  }

  private updateFunnyLevel(
    key: 'funnyLevelEnglish' | 'funnyLevelCantonese',
    rawValue: string
  ) {
    const value = clampFunnyLevel(Number(rawValue), 3)
    const settings: IAudioSystemSettings = {
      ...this.funnyLevelSettingsStore.getSettings(),
      [key]: value,
    }
    this.funnyLevelSettingsStore.setSettings(settings)
    this.setState({ [key]: value } as Pick<IAppearanceState, typeof key>)
  }

  public async componentDidUpdate(prevProps: IAppearanceProps) {
    if (prevProps === this.props) {
      return
    }

    const usePropTheme =
      this.props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    const selectedTheme = usePropTheme
      ? this.props.selectedTheme
      : await getCurrentlyAppliedTheme()

    const selectedTabSize = this.props.selectedTabSize

    this.setState({ selectedTheme, selectedTabSize })
  }

  private initializeSelectedTheme = async () => {
    const selectedTheme = await getCurrentlyAppliedTheme()
    const selectedTabSize = this.props.selectedTabSize
    this.setState({ selectedTheme, selectedTabSize })
  }

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(theme)
  }

  private onZoomSliderChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const percent = parseInt(event.currentTarget.value, 10)
    if (!Number.isNaN(percent)) {
      this.props.onZoomBaseFactorChanged(percent / 100)
    }
  }

  private onAutoFitZoomEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onAutoFitZoomEnabledChanged(event.currentTarget.checked)
  }

  private onSelectedTabSizeChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onSelectedTabSizeChanged(parseInt(event.currentTarget.value))
  }

  private onDateFormatChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value
    const match = dateFormats.find(f => f.pattern === value)
    if (match !== undefined) {
      this.props.onSelectedDateFormatChanged(match.pattern)
    }
  }

  private onTimeFormatChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value
    const match = timeFormats.find(f => f.pattern === value)
    if (match !== undefined) {
      this.props.onSelectedTimeFormatChanged(match.pattern)
    }
  }

  private onNumberFormatChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const match = numberFormats.find(
      n => numberFormatToKey(n) === event.currentTarget.value
    )
    if (match) {
      this.props.onSelectedNumberFormatChanged(match)
    }
  }

  private onPreferAbsoluteDatesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onPreferAbsoluteDatesChanged(event.currentTarget.checked)
  }

  private onShowRecentRepositoriesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onShowRecentRepositoriesChanged(event.currentTarget.checked)
  }

  private onBranchSortOrderChanged = (branchSortOrder: BranchSortOrder) => {
    this.props.onBranchSortOrderChanged(branchSortOrder)
  }

  private renderBranchSortOptionLabel = (branchSortOrder: BranchSortOrder) => {
    switch (branchSortOrder) {
      case BranchSortOrder.Alphabetical:
        return 'Alphabetical'
      case BranchSortOrder.LastModified:
        return 'Last modified'
      default:
        return assertNever(
          branchSortOrder,
          `Unknown branch sort order: ${branchSortOrder}`
        )
    }
  }

  /**
   * A token-driven Material mini-window mockup depicting a theme. Built from
   * pure CSS (no raster screenshot) like the v2 prototype's Appearance cards.
   * The preview must always depict its target theme regardless of the active
   * one, so the light/dark surface, rail and line colors are fixed per variant
   * via the `theme-swatch-preview--{variant}` modifier in _preferences.scss.
   */
  private renderThemePreview(variant: 'light' | 'dark') {
    return (
      <span
        className={`theme-swatch-preview theme-swatch-preview--${variant}`}
        aria-hidden={true}
      >
        <span className="theme-swatch-bar" />
        <span className="theme-swatch-body">
          <span className="theme-swatch-rail" />
          <span className="theme-swatch-content">
            <span className="theme-swatch-line" />
            <span className="theme-swatch-line theme-swatch-line--short" />
          </span>
        </span>
      </span>
    )
  }

  public renderThemeSwatch = (theme: ApplicationTheme) => {
    switch (theme) {
      case ApplicationTheme.Light:
        return (
          <span>
            {this.renderThemePreview('light')}
            <span className="theme-value-label">Light</span>
          </span>
        )
      case ApplicationTheme.Dark:
        return (
          <span>
            {this.renderThemePreview('dark')}
            <span className="theme-value-label">Dark</span>
          </span>
        )
      case ApplicationTheme.System:
        /** The system swatch splits a light preview and a dark preview down the
         * diagonal (the second is clipped to its right half) to depict "follow
         * system". */
        return (
          <span>
            <span className="system-theme-swatch">
              {this.renderThemePreview('light')}
              {this.renderThemePreview('dark')}
            </span>
            <span className="theme-value-label">System</span>
          </span>
        )
    }
  }

  private renderAutoFitLabel() {
    // v2 prototype (settings appearance pane): the auto-fit row pairs a bold
    // title with a muted caption on the left of the 54x32 switch. Both live in
    // the checkbox label so the whole copy stays clickable and is announced as
    // the control's accessible name.
    return (
      <span className="auto-fit-zoom-copy">
        <span className="auto-fit-zoom-title">
          Automatically shrink the interface to fit small windows
        </span>
        <span className="auto-fit-zoom-caption">
          Recommended. Keeps the whole app visible on smaller screens.
        </span>
      </span>
    )
  }

  private renderScaling() {
    const percent = Math.round(this.props.zoomBaseFactor * 100)
    const effectivePercent = Math.round(this.props.windowZoomFactor * 100)
    const isTrimmed =
      this.props.autoFitZoomEnabled && effectivePercent !== percent

    return (
      <div className="appearance-section scaling-section">
        <h2 id="scaling-heading">Scale</h2>

        <div className="scaling-card">
          <div
            className="scaling-slider-row"
            role="group"
            aria-labelledby="scaling-heading"
            {...teleportAnchor('settings-ui-scale')}
          >
            <Octicon
              className="scaling-zoom-icon scaling-zoom-out"
              symbol={octicons.zoomOut}
              height={18}
            />
            <input
              type="range"
              className="scaling-slider"
              min={50}
              max={200}
              step={5}
              value={percent}
              aria-labelledby="scaling-heading"
              aria-valuetext={`${percent}%`}
              onChange={this.onZoomSliderChanged}
            />
            <Octicon
              className="scaling-zoom-icon scaling-zoom-in"
              symbol={octicons.zoomIn}
              height={20}
            />
            <span className="scaling-value" aria-hidden={true}>
              {percent}%
            </span>
          </div>

          <div {...teleportAnchor('settings-auto-fit-zoom')}>
            <Checkbox
              className="auto-fit-zoom"
              label={this.renderAutoFitLabel()}
              value={
                this.props.autoFitZoomEnabled
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onAutoFitZoomEnabledChanged}
            />
          </div>

          {isTrimmed && (
            <p className="scaling-effective">
              Auto-fit is currently showing the interface at {effectivePercent}%
              to fit this window.
            </p>
          )}
        </div>
      </div>
    )
  }

  private onShowBranchNameInRepoListChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onShowBranchNameInRepoListChanged(
      event.currentTarget.value as ShowBranchNameInRepoListSetting
    )
  }

  private renderSelectedTheme() {
    const selectedTheme = this.state.selectedTheme

    if (selectedTheme == null) {
      return <Row>Loading system theme</Row>
    }

    const themes = [
      ApplicationTheme.Light,
      ApplicationTheme.Dark,
      ...(supportsSystemThemeChanges() ? [ApplicationTheme.System] : []),
    ]

    return (
      <div className="appearance-section" {...teleportAnchor('settings-theme')}>
        <h2 id="theme-heading">Theme</h2>

        <RadioGroup<ApplicationTheme>
          ariaLabelledBy="theme-heading"
          className="theme-selector"
          selectedKey={selectedTheme}
          radioButtonKeys={themes}
          onSelectionChanged={this.onSelectedThemeChanged}
          renderRadioButtonLabelContents={this.renderThemeSwatch}
        />
      </div>
    )
  }

  private renderFormatting() {
    if (!enableFormattingPreferences()) {
      return null
    }

    return (
      <div className="appearance-section formatting-section">
        <h2 id="formatting-heading">Formatting</h2>

        <Row>
          <div
            style={{ display: 'flex', flexGrow: 1, minWidth: 0 }}
            {...teleportAnchor('settings-date-format')}
          >
            <Select
              label={__DARWIN__ ? 'Date Format' : 'Date format'}
              value={this.props.selectedDateFormat}
              onChange={this.onDateFormatChanged}
            >
              {dateFormats.map(({ pattern, example }) => (
                <option key={pattern} value={pattern}>
                  {example} ({pattern})
                </option>
              ))}
            </Select>
          </div>

          <div
            style={{ display: 'flex', flexGrow: 1, minWidth: 0 }}
            {...teleportAnchor('settings-time-format')}
          >
            <Select
              label={__DARWIN__ ? 'Time Format' : 'Time format'}
              value={this.props.selectedTimeFormat}
              onChange={this.onTimeFormatChanged}
            >
              {timeFormats.map(({ pattern, example }) => (
                <option key={pattern} value={pattern}>
                  {example} ({pattern})
                </option>
              ))}
            </Select>
          </div>
        </Row>

        <div {...teleportAnchor('settings-number-format')}>
          <Select
            label={__DARWIN__ ? 'Number Format' : 'Number format'}
            value={numberFormatToKey(this.props.selectedNumberFormat)}
            onChange={this.onNumberFormatChanged}
          >
            {numberFormats.map(format => (
              <option
                key={numberFormatToKey(format)}
                value={numberFormatToKey(format)}
              >
                {formatNumber(1234567.89, format)}
              </option>
            ))}
          </Select>
        </div>

        <div {...teleportAnchor('settings-prefer-absolute-dates')}>
          <Checkbox
            className="prefer-absolute-dates"
            label="Prefer absolute dates over relative"
            value={
              this.props.preferAbsoluteDates
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onPreferAbsoluteDatesChanged}
          />
        </div>
      </div>
    )
  }

  private renderSelectedTabSize() {
    const availableTabSizes: number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12]

    return (
      <div
        className="appearance-section"
        {...teleportAnchor('settings-tab-size')}
      >
        <h2 id="diff-heading">Diff</h2>

        <Select
          value={this.state.selectedTabSize.toString()}
          label={__DARWIN__ ? 'Tab Size' : 'Tab size'}
          onChange={this.onSelectedTabSizeChanged}
        >
          {availableTabSizes.map(n => (
            <option key={n} value={n}>
              {n === tabSizeDefault ? `${n} (default)` : n}
            </option>
          ))}
        </Select>
      </div>
    )
  }

  private renderRepositoryList() {
    return (
      <div className="appearance-section">
        <h2 id="repository-list-heading">Repository list</h2>
        <div {...teleportAnchor('settings-show-recent-repositories')}>
          <Checkbox
            label="Show recent repositories"
            value={
              this.props.showRecentRepositories
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onShowRecentRepositoriesChanged}
          />
        </div>
        <div {...teleportAnchor('settings-branch-name-in-repo-list')}>
          <Select
            label="Show branch name"
            value={this.props.showBranchNameInRepoList}
            onChange={this.onShowBranchNameInRepoListChanged}
          >
            <option value={ShowBranchNameInRepoListSetting.Always}>
              Always
            </option>
            <option value={ShowBranchNameInRepoListSetting.WhenNotDefault}>
              When not default
            </option>
            <option value={ShowBranchNameInRepoListSetting.Never}>Never</option>
          </Select>
        </div>
      </div>
    )
  }

  private renderBranchSorting() {
    return (
      <div
        className="appearance-section"
        {...teleportAnchor('settings-branch-sort')}
      >
        <h2 id="branch-sort-order-heading">Sort branches</h2>
        <RadioGroup<BranchSortOrder>
          ariaLabelledBy="branch-sort-order-heading"
          selectedKey={this.props.branchSortOrder}
          radioButtonKeys={[
            BranchSortOrder.LastModified,
            BranchSortOrder.Alphabetical,
          ]}
          onSelectionChanged={this.onBranchSortOrderChanged}
          renderRadioButtonLabelContents={this.renderBranchSortOptionLabel}
        />
      </div>
    )
  }

  /**
   * The one place the Shift+Right-click gesture is advertised in settings.
   *
   * A pointer gesture nobody can guess is a hidden feature, so this note names
   * the gesture, what a plain right-click does instead, and the keyboard route
   * that reaches the same editors. The playfulness levels restyle the voice;
   * all three facts survive every level.
   */
  private renderElementGestureNote() {
    const languageMode = this.props.appearanceCustomization.languageMode

    return (
      <aside
        className="appearance-scope-note"
        role="note"
        aria-labelledby="appearance-scope-note-title"
      >
        <span className="appearance-scope-note-icon">
          <Octicon symbol={octicons.paintbrush} height={20} />
        </span>
        <div>
          <h2 id="appearance-scope-note-title">
            {translate('appearance.elementGestureHeading', languageMode)}
          </h2>
          <p>
            {translateWithFunnyLevel(
              'appearance.elementGesture',
              languageMode,
              {
                english: this.state.funnyLevelEnglish,
                cantonese: this.state.funnyLevelCantonese,
              }
            )}
          </p>
        </div>
      </aside>
    )
  }

  public render() {
    return (
      <DialogContent>
        {this.renderElementGestureNote()}
        {this.renderLanguageAndNavigation()}
        {this.renderScaling()}
        {this.renderSelectedTheme()}
        {this.renderRepositoryList()}
        {this.renderBranchSorting()}
        {this.renderFormatting()}
        {this.renderSelectedTabSize()}
      </DialogContent>
    )
  }
}
