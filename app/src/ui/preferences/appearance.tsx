import * as React from 'react'
import {
  ApplicationTheme,
  applicationThemeKey,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
} from '../lib/application-theme'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { RadioGroup } from '../lib/radio-group'
import { RangeSlider } from '../lib/range-slider'
import { Select } from '../lib/select'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  autoFitZoomEnabledKey,
  branchSortOrderKey,
  showBranchNameInRepoListKey,
  showRecentRepositoriesKey,
  tabSizeDefault,
  tabSizeKey,
  zoomFactorKey,
} from '../../lib/stores/app-store'
import { enableFormattingPreferences } from '../../lib/feature-flag'
import {
  DateFormat,
  TimeFormat,
  INumberFormat,
  dateFormats,
  timeFormats,
  numberFormats,
  numberFormatToKey,
  dateFormatKey,
  defaultDateFormat,
  defaultNumberFormat,
  defaultTimeFormat,
  numberFormatKey,
  preferAbsoluteDatesKey,
  timeFormatKey,
} from '../../models/formatting-preferences'
import { formatNumber } from '../../lib/format-number'
import { assertNever } from '../../lib/fatal-error'
import { BranchSortOrder } from '../../models/branch-sort-order'
import { ShowBranchNameInRepoListSetting } from '../../models/show-branch-name-in-repo-list'
import { IAppearanceCustomization } from '../../models/appearance-customization'
import { translate, translatedVariable } from '../../lib/i18n'
import {
  IFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import {
  clampFunnyLevel,
  AudioSettingsStorageKey,
  IAudioSystemSettings,
} from '../../lib/audio/audio-settings'
import {
  AudioCueStore,
  getAudioCueStore,
} from '../../lib/audio/audio-cue-store'
import { teleportAnchor } from '../../lib/teleport-targets'
import { PersonalVocabularyControl } from './personal-vocabulary-control'
import { SchoolModePreferences } from './school-mode'
import { SurfaceLocksPreferences } from './surface-locks'
import {
  DialogEmojiProvenance,
  getShowDialogEmoji,
  getShowDialogEmojiProvenance,
  ShowDialogEmojiDefault,
  ShowDialogEmojiKey,
  setShowDialogEmoji,
} from '../../lib/dialog-emoji'
import {
  IScheduledSettingsProps,
  ScheduledSettings,
} from './scheduled-settings'
import {
  isSchoolModeEnabled,
  SchoolModeChangedEvent,
} from '../../lib/school-mode'
import { MaterialSymbol } from '../lib/material-symbol'

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
  readonly scheduledSettings?: IScheduledSettingsProps['scheduledSettings']
  readonly onScheduledSettingsChanged?: IScheduledSettingsProps['onScheduledSettingsChanged']
  readonly onHomeAssistantTokenChanged?: IScheduledSettingsProps['onHomeAssistantTokenChanged']
  readonly onHomeAssistantStateRequested?: IScheduledSettingsProps['onHomeAssistantStateRequested']
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
  /** Live value of "Show emojis in dialogs and message boxes". */
  readonly showDialogEmoji: boolean
  /** Whether that value was chosen here or is the shipped fallback. */
  readonly showDialogEmojiProvenance: DialogEmojiProvenance
  readonly schoolModeEnabled: boolean
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
      showDialogEmoji: getShowDialogEmoji(),
      showDialogEmojiProvenance: getShowDialogEmojiProvenance(),
      schoolModeEnabled: isSchoolModeEnabled(),
    }

    if (!usePropTheme) {
      this.initializeSelectedTheme()
    }
  }

  public componentDidMount() {
    window.addEventListener(SchoolModeChangedEvent, this.onSchoolModeChanged)
  }

  public componentWillUnmount() {
    window.removeEventListener(SchoolModeChangedEvent, this.onSchoolModeChanged)
  }

  private onSchoolModeChanged = () => {
    this.setState({ schoolModeEnabled: isSchoolModeEnabled() })
  }

  /**
   * The personal-vocabulary upload.
   *
   * It lives in Appearance because that is where the rest of "how this app
   * reads to me" lives, and it is present whether or not a file has ever been
   * supplied — a control that only appears once it is in use is a control
   * nobody finds.
   */
  private renderPersonalVocabulary() {
    const languageMode = this.props.appearanceCustomization.languageMode

    return (
      <div
        className="appearance-section appearance-customization-section"
        {...teleportAnchor('settings-personal-vocabulary')}
      >
        <h2>{translate('settings.personalVocabularyTitle', languageMode)}</h2>
        <PersonalVocabularyControl />
      </div>
    )
  }

  /**
   * "Show emojis in dialogs and message boxes".
   *
   * The switch is not hidden by School mode: a decorative glyph beside a
   * dialog title is not one of the presentation features that mode suppresses,
   * and removing the control would leave a user unable to turn off something
   * they can plainly see.
   *
   * The explanation sits behind progressive disclosure so the row stays a row,
   * and the provenance line underneath states whether the live value was
   * actually chosen on this computer or is the shipped fallback — naming the
   * real value rather than the opaque word "default".
   */
  private renderDialogEmoji() {
    const languageMode = this.props.appearanceCustomization.languageMode
    const localize = (key: Parameters<typeof translate>[0]) =>
      translate(key, languageMode)
    const levels: IFunnyLevels = {
      english: this.state.funnyLevelEnglish,
      cantonese: this.state.funnyLevelCantonese,
    }

    const enabled = this.state.showDialogEmoji
    const settingId = 'appearance-dialog-emoji'
    return (
      <div
        className="appearance-section appearance-customization-section appearance-dialog-emoji"
        {...teleportAnchor('settings-dialog-emoji')}
      >
        <h2>{localize('dialogEmoji.heading')}</h2>
        <Checkbox
          label={localize('dialogEmoji.toggleLabel')}
          value={enabled ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onShowDialogEmojiChanged}
          ariaDescribedBy={
            settingExplanationDescriptionIds(settingId).ariaDescribedBy
          }
        />
        <BooleanSettingExplanation
          settingId={settingId}
          explanationEnglish={`${translateWithFunnyLevel(
            'dialogEmoji.explanation',
            'english',
            levels
          )} ${translate('dialogEmoji.boundaryNote', 'english')}`}
          explanationCantonese={`${translateWithFunnyLevel(
            'dialogEmoji.explanation',
            'cantonese',
            levels
          )} ${translate('dialogEmoji.boundaryNote', 'cantonese')}`}
          value={enabled}
          shippedValue={ShowDialogEmojiDefault}
          storageKey={ShowDialogEmojiKey}
        />
      </div>
    )
  }

  private onShowDialogEmojiChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const enabled = event.currentTarget.checked
    setShowDialogEmoji(enabled)
    this.setState({
      showDialogEmoji: enabled,
      showDialogEmojiProvenance: getShowDialogEmojiProvenance(),
    })
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
    const settingId = 'appearance-language-mode'
    const current = this.props.appearanceCustomization[key]
    const shipped = DefaultAppearanceCustomization[key]
    return (
      <>
        <Select
          name={key}
          label={label}
          value={this.props.appearanceCustomization[key]}
          onChange={this.onCustomizationChanged}
          ariaDescribedBy={
            settingExplanationDescriptionIds(settingId).ariaDescribedBy
          }
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <SelectionSettingExplanation
          settingId={settingId}
          explanationEnglish="Chooses English, playful Hong Kong Cantonese, or compact bilingual copy across the interface."
          explanationCantonese="揀成個介面使用英文、玩味香港廣東話，定係緊湊雙語文案。"
          currentEnglish={current}
          currentCantonese={current}
          shippedEnglish={shipped}
          shippedCantonese={shipped}
          storageKey={LanguageModeStorageKey}
        />
      </>
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
    onChange: (value: number) => void
  ) {
    const languageMode = this.props.appearanceCustomization.languageMode
    const id = `appearance-playfulness-${language}`
    const outputId = `${id}-value`
    const settingId = `appearance-funny-${language}`
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
        <RangeSlider
          id={id}
          className="appearance-playfulness-slider"
          label={label}
          min={1}
          max={5}
          step={1}
          value={value}
          valueText={value.toString()}
          ariaValueText={valueText}
          ariaDescribedBy={`appearance-playfulness-description ${outputId} ${
            settingExplanationDescriptionIds(settingId).ariaDescribedBy
          }`}
          onChange={onChange}
        />
        <div className="appearance-playfulness-scale" aria-hidden={true}>
          <span>
            {translate('appearance.playfulnessSerious', languageMode)}
          </span>
          <span>
            {translate('appearance.playfulnessMaximum', languageMode)}
          </span>
        </div>
        <SelectionSettingExplanation
          settingId={settingId}
          explanationEnglish={`Sets the ${language} playfulness level used to style every message category without changing its facts.`}
          explanationCantonese={`設定${
            language === 'english' ? '英文' : '廣東話'
          }搞笑程度，用嚟調整所有訊息類別嘅語氣，但唔會改事實。`}
          currentEnglish={value.toString()}
          currentCantonese={value.toString()}
          shippedEnglish="5"
          shippedCantonese="5"
          storageKey={AudioSettingsStorageKey}
        />
      </div>
    )
  }

  private onEnglishFunnyLevelChanged = (value: number) => {
    this.updateFunnyLevel('funnyLevelEnglish', value)
  }

  private onCantoneseFunnyLevelChanged = (value: number) => {
    this.updateFunnyLevel('funnyLevelCantonese', value)
  }

  private updateFunnyLevel(
    key: 'funnyLevelEnglish' | 'funnyLevelCantonese',
    rawValue: number
  ) {
    const value = clampFunnyLevel(rawValue, 3)
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
            <MaterialSymbol
              name="zoom_out"
              className="scaling-zoom-icon scaling-zoom-out"
              size={18}
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
              aria-describedby={
                settingExplanationDescriptionIds('appearance-ui-scale')
                  .ariaDescribedBy
              }
              onChange={this.onZoomSliderChanged}
            />
            <MaterialSymbol
              name="zoom_in"
              className="scaling-zoom-icon scaling-zoom-in"
              size={20}
            />
            <span className="scaling-value" aria-hidden={true}>
              {percent}%
            </span>
          </div>
          <SelectionSettingExplanation
            settingId="appearance-ui-scale"
            explanationEnglish="Sets the preferred base interface scale from 50% to 200%. Auto-fit may temporarily reduce the effective scale without changing this value."
            explanationCantonese="設定 50% 至 200% 嘅偏好基礎介面比例；自動配合可以暫時降低有效比例，但唔會改呢個值。"
            currentEnglish={`${percent}%`}
            currentCantonese={`${percent}%`}
            shippedEnglish="100%"
            shippedCantonese="100%"
            storageKey={zoomFactorKey}
          />

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
              ariaDescribedBy={
                settingExplanationDescriptionIds('appearance-auto-fit-zoom')
                  .ariaDescribedBy
              }
            />
            <BooleanSettingExplanation
              settingId="appearance-auto-fit-zoom"
              explanationEnglish="Automatically reduces the effective interface scale when the selected base scale would not fit the current window. It never enlarges beyond the selected base."
              explanationCantonese="當所選基礎介面比例放唔落目前視窗時，自動降低有效比例；永遠唔會放大過所選基礎值。"
              value={this.props.autoFitZoomEnabled}
              shippedValue={true}
              storageKey={autoFitZoomEnabledKey}
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
          ariaDescribedBy={
            settingExplanationDescriptionIds('appearance-theme').ariaDescribedBy
          }
          className="theme-selector"
          selectedKey={selectedTheme}
          radioButtonKeys={themes}
          onSelectionChanged={this.onSelectedThemeChanged}
          renderRadioButtonLabelContents={this.renderThemeSwatch}
        />
        <SelectionSettingExplanation
          settingId="appearance-theme"
          explanationEnglish="Chooses a light theme, a dark theme, or automatic matching to the operating-system theme."
          explanationCantonese="揀淺色、深色，或者自動跟隨作業系統主題。"
          currentEnglish={selectedTheme}
          currentCantonese={selectedTheme}
          shippedEnglish={ApplicationTheme.System}
          shippedCantonese={ApplicationTheme.System}
          storageKey={applicationThemeKey}
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
              label={translate(
                'palette.setDateFormat',
                this.props.appearanceCustomization.languageMode
              )}
              value={this.props.selectedDateFormat}
              onChange={this.onDateFormatChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('appearance-date-format')
                  .ariaDescribedBy
              }
            >
              {dateFormats.map(({ pattern, example }) => (
                <option key={pattern} value={pattern}>
                  {example} ({pattern})
                </option>
              ))}
            </Select>
            <SelectionSettingExplanation
              settingId="appearance-date-format"
              explanationEnglish="Chooses the date pattern used for absolute dates in the interface."
              explanationCantonese="揀介面絕對日期使用嘅日期格式。"
              currentEnglish={this.props.selectedDateFormat}
              currentCantonese={this.props.selectedDateFormat}
              shippedEnglish={defaultDateFormat}
              shippedCantonese={defaultDateFormat}
              storageKey={dateFormatKey}
            />
          </div>

          <div
            style={{ display: 'flex', flexGrow: 1, minWidth: 0 }}
            {...teleportAnchor('settings-time-format')}
          >
            <Select
              label={translate(
                'palette.setTimeFormat',
                this.props.appearanceCustomization.languageMode
              )}
              value={this.props.selectedTimeFormat}
              onChange={this.onTimeFormatChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('appearance-time-format')
                  .ariaDescribedBy
              }
            >
              {timeFormats.map(({ pattern, example }) => (
                <option key={pattern} value={pattern}>
                  {example} ({pattern})
                </option>
              ))}
            </Select>
            <SelectionSettingExplanation
              settingId="appearance-time-format"
              explanationEnglish="Chooses the clock pattern used for absolute times in the interface."
              explanationCantonese="揀介面絕對時間使用嘅時鐘格式。"
              currentEnglish={this.props.selectedTimeFormat}
              currentCantonese={this.props.selectedTimeFormat}
              shippedEnglish={defaultTimeFormat}
              shippedCantonese={defaultTimeFormat}
              storageKey={timeFormatKey}
            />
          </div>
        </Row>

        <div {...teleportAnchor('settings-number-format')}>
          <Select
            label={translate(
              'palette.setNumberFormat',
              this.props.appearanceCustomization.languageMode
            )}
            value={numberFormatToKey(this.props.selectedNumberFormat)}
            onChange={this.onNumberFormatChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('appearance-number-format')
                .ariaDescribedBy
            }
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
          <SelectionSettingExplanation
            settingId="appearance-number-format"
            explanationEnglish="Chooses the thousands and decimal separators used when the interface formats numbers."
            explanationCantonese="揀介面格式化數字時使用嘅千位同小數分隔符。"
            currentEnglish={numberFormatToKey(this.props.selectedNumberFormat)}
            currentCantonese={numberFormatToKey(
              this.props.selectedNumberFormat
            )}
            shippedEnglish={numberFormatToKey(defaultNumberFormat)}
            shippedCantonese={numberFormatToKey(defaultNumberFormat)}
            storageKey={numberFormatKey}
          />
        </div>

        <div {...teleportAnchor('settings-prefer-absolute-dates')}>
          <Checkbox
            className="prefer-absolute-dates"
            label={translate(
              'palette.setPreferAbsoluteDates',
              this.props.appearanceCustomization.languageMode
            )}
            value={
              this.props.preferAbsoluteDates
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onPreferAbsoluteDatesChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds(
                'appearance-prefer-absolute-dates'
              ).ariaDescribedBy
            }
          />
          <BooleanSettingExplanation
            settingId="appearance-prefer-absolute-dates"
            explanationEnglish="Uses full absolute dates in lists instead of relative phrases such as two hours ago."
            explanationCantonese="清單使用完整絕對日期，而唔係「兩個鐘前」之類相對時間。"
            value={this.props.preferAbsoluteDates}
            shippedValue={false}
            storageKey={preferAbsoluteDatesKey}
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
          label={translate(
            'palette.tabSize',
            this.props.appearanceCustomization.languageMode
          )}
          onChange={this.onSelectedTabSizeChanged}
          ariaDescribedBy={
            settingExplanationDescriptionIds('appearance-tab-size')
              .ariaDescribedBy
          }
        >
          {availableTabSizes.map(n => (
            <option key={n} value={n}>
              {n === tabSizeDefault ? `${n} (default)` : n}
            </option>
          ))}
        </Select>
        <SelectionSettingExplanation
          settingId="appearance-tab-size"
          explanationEnglish="Chooses how many spaces a tab represents in diff and text views."
          explanationCantonese="揀 diff 同文字檢視入面一個 tab 代表幾多個空格。"
          currentEnglish={this.state.selectedTabSize.toString()}
          currentCantonese={this.state.selectedTabSize.toString()}
          shippedEnglish={tabSizeDefault.toString()}
          shippedCantonese={tabSizeDefault.toString()}
          storageKey={tabSizeKey}
        />
      </div>
    )
  }

  private renderRepositoryList() {
    return (
      <div className="appearance-section">
        <h2 id="repository-list-heading">Repository list</h2>
        <div {...teleportAnchor('settings-show-recent-repositories')}>
          <Checkbox
            label={translate(
              'palette.setShowRecentRepositories',
              this.props.appearanceCustomization.languageMode
            )}
            value={
              this.props.showRecentRepositories
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onShowRecentRepositoriesChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds(
                'appearance-show-recent-repositories'
              ).ariaDescribedBy
            }
          />
          <BooleanSettingExplanation
            settingId="appearance-show-recent-repositories"
            explanationEnglish="Shows the Recent group in the repository list so recently opened repositories remain easy to reach."
            explanationCantonese="喺儲存庫清單顯示「最近使用」群組，方便再開最近用過嘅儲存庫。"
            value={this.props.showRecentRepositories}
            shippedValue={true}
            storageKey={showRecentRepositoriesKey}
          />
        </div>
        <div {...teleportAnchor('settings-branch-name-in-repo-list')}>
          <Select
            label={translate(
              'palette.setBranchNameInRepoList',
              this.props.appearanceCustomization.languageMode
            )}
            value={this.props.showBranchNameInRepoList}
            onChange={this.onShowBranchNameInRepoListChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('appearance-show-branch-name')
                .ariaDescribedBy
            }
          >
            <option value={ShowBranchNameInRepoListSetting.Always}>
              Always
            </option>
            <option value={ShowBranchNameInRepoListSetting.WhenNotDefault}>
              When not default
            </option>
            <option value={ShowBranchNameInRepoListSetting.Never}>Never</option>
          </Select>
          <SelectionSettingExplanation
            settingId="appearance-show-branch-name"
            explanationEnglish="Chooses whether repository rows always show the current branch name, show it only away from the default branch, or never show it."
            explanationCantonese="揀儲存庫列一律顯示目前分支名、只喺離開預設分支時顯示，定係永遠唔顯示。"
            currentEnglish={this.props.showBranchNameInRepoList}
            currentCantonese={this.props.showBranchNameInRepoList}
            shippedEnglish={defaultShowBranchNameInRepoListSetting}
            shippedCantonese={defaultShowBranchNameInRepoListSetting}
            storageKey={showBranchNameInRepoListKey}
          />
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
          ariaDescribedBy={
            settingExplanationDescriptionIds('appearance-branch-sort')
              .ariaDescribedBy
          }
          selectedKey={this.props.branchSortOrder}
          radioButtonKeys={[
            BranchSortOrder.LastModified,
            BranchSortOrder.Alphabetical,
          ]}
          onSelectionChanged={this.onBranchSortOrderChanged}
          renderRadioButtonLabelContents={this.renderBranchSortOptionLabel}
        />
        <SelectionSettingExplanation
          settingId="appearance-branch-sort"
          explanationEnglish="Chooses whether branch lists are ordered by recent activity or alphabetically."
          explanationCantonese="揀分支清單按最近活動定係字母次序排列。"
          currentEnglish={this.props.branchSortOrder}
          currentCantonese={this.props.branchSortOrder}
          shippedEnglish={DefaultBranchSortOrder}
          shippedCantonese={DefaultBranchSortOrder}
          storageKey={branchSortOrderKey}
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
          <MaterialSymbol name="brush" size={20} />
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

  private renderScheduledSettings() {
    if (
      this.props.scheduledSettings === undefined ||
      this.props.onScheduledSettingsChanged === undefined ||
      this.props.onHomeAssistantTokenChanged === undefined ||
      this.props.onHomeAssistantStateRequested === undefined
    ) {
      return null
    }

    return (
      <ScheduledSettings
        languageMode={this.props.appearanceCustomization.languageMode}
        scheduledSettings={this.props.scheduledSettings}
        onScheduledSettingsChanged={this.props.onScheduledSettingsChanged}
        onHomeAssistantTokenChanged={this.props.onHomeAssistantTokenChanged}
        onHomeAssistantStateRequested={this.props.onHomeAssistantStateRequested}
      />
    )
  }

  public render() {
    return (
      <DialogContent>
        {this.renderElementGestureNote()}
        {!this.state.schoolModeEnabled && this.renderLanguageAndNavigation()}
        {this.renderDialogEmoji()}
        {!this.state.schoolModeEnabled && this.renderPersonalVocabulary()}
        <SchoolModePreferences
          languageMode={this.props.appearanceCustomization.languageMode}
        />
        <SurfaceLocksPreferences
          languageMode={this.props.appearanceCustomization.languageMode}
        />
        {this.renderScheduledSettings()}
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
