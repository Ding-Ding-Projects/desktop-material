/* eslint-disable react/jsx-no-bind */
import * as React from 'react'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { MaterialSwitch } from '../lib/material-switch'
import { Select } from '../lib/select'
import { LocalizedText } from '../lib/localized-text'
import {
  bilingualVariable,
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  translatedVariable,
} from '../../lib/i18n'
import { TranslationKey } from '../../lib/i18n-resources'
import type { TranslationVariables } from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { Repository } from '../../models/repository'
import { showOpenDialog } from '../main-process-proxy'
import { AudioCueStore } from '../../lib/audio/audio-cue-store'
import {
  AudioCueCategory,
  IAudioSystemSettings,
  MaxTtsPitch,
  MaxTtsRate,
  MinTtsPitch,
  MinTtsRate,
  RepoMusicOverride,
} from '../../lib/audio/audio-settings'
import { repositoryThemeName } from '../../lib/audio/repo-theme-name'
import { teleportAnchor } from '../../lib/teleport-targets'
import {
  ISearchableSelectOption,
  SearchableSelect,
} from '../lib/searchable-select'
import { RangeSlider } from '../lib/range-slider'
import { TextBox } from '../lib/text-box'
import {
  INarratorVoice,
  NarratorVoiceLanguage,
  describeVoiceChoice,
  onVoicesChanged,
  readInstalledVoices,
  voicesForLanguage,
} from '../../lib/audio/narrator-voices'

/**
 * The auditionable sound-effect cues, grouped by their motif family so the
 * preview grid reads as a coherent set. Labels reuse pane-scoped translation
 * keys; each button plays that category's synthesized cue.
 */
const CueFamilies: ReadonlyArray<{
  readonly headingKey: TranslationKey
  readonly categories: ReadonlyArray<{
    readonly category: AudioCueCategory
    readonly labelKey: TranslationKey
  }>
}> = [
  {
    headingKey: 'settings.soundFamilySuccess',
    categories: [
      { category: 'commit', labelKey: 'settings.soundCueCommit' },
      { category: 'push', labelKey: 'settings.soundCuePush' },
      { category: 'pull', labelKey: 'settings.soundCuePull' },
      { category: 'fetch', labelKey: 'settings.soundCueFetch' },
      { category: 'succeeded', labelKey: 'settings.soundCueSucceeded' },
      { category: 'success', labelKey: 'settings.soundCueSuccess' },
    ],
  },
  {
    headingKey: 'settings.soundFamilyProgress',
    categories: [
      { category: 'detecting', labelKey: 'settings.soundCueDetecting' },
      { category: 'installing', labelKey: 'settings.soundCueInstalling' },
      { category: 'building', labelKey: 'settings.soundCueBuilding' },
      { category: 'running', labelKey: 'settings.soundCueRunning' },
    ],
  },
  {
    headingKey: 'settings.soundFamilyWarning',
    categories: [
      { category: 'cancelled', labelKey: 'settings.soundCueCancelled' },
    ],
  },
  {
    headingKey: 'settings.soundFamilyError',
    categories: [
      { category: 'failed', labelKey: 'settings.soundCueFailed' },
      { category: 'error', labelKey: 'settings.soundCueError' },
    ],
  },
  {
    headingKey: 'settings.soundFamilyNeutral',
    categories: [{ category: 'info', labelKey: 'settings.soundCueInfo' }],
  },
]

interface ISoundPreferencesProps {
  readonly audioCueStore: AudioCueStore
  readonly repository: Repository | null
}

interface ISoundPreferencesState {
  readonly languageMode: LanguageMode
  readonly settings: IAudioSystemSettings
  readonly repositoryOverride: RepoMusicOverride | null
  /** The platform voice list is commonly empty until `voiceschanged`. */
  readonly voices: ReadonlyArray<INarratorVoice>
}

/** Settings pane for the optional audio system: SFX, narrator, and music. */
export class SoundPreferences extends React.Component<
  ISoundPreferencesProps,
  ISoundPreferencesState
> {
  private trackRequest = 0
  private stopWatchingVoices: (() => void) | null = null

  public constructor(props: ISoundPreferencesProps) {
    super(props)
    this.state = {
      languageMode: getPersistedLanguageMode(),
      settings: props.audioCueStore.getSettings(),
      repositoryOverride: props.audioCueStore.getRepositoryOverride(
        props.repository
      ),
      voices: readInstalledVoices(),
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.stopWatchingVoices = onVoicesChanged(this.onVoicesChanged)
    // The event may have fired between construction and mounting.
    this.onVoicesChanged()
  }

  private onVoicesChanged = () =>
    this.setState({ voices: readInstalledVoices() })

  public componentWillUnmount() {
    this.trackRequest++
    this.stopWatchingVoices?.()
    this.stopWatchingVoices = null
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    this.setState({
      languageMode: normalizeLanguageMode(
        (event as CustomEvent<unknown>).detail
      ),
    })
  }

  /**
   * Render one independently persisted narrator voice choice.
   *
   * A missing choice remains in the select so a temporarily uninstalled voice
   * is not silently replaced. The status underneath states what will actually
   * be heard, including network-backed and no-voice cases.
   */
  private renderVoicePicker(
    language: NarratorVoiceLanguage,
    labelKey: TranslationKey,
    chosen: string,
    onChange: (uri: string) => void
  ) {
    const { languageMode, voices } = this.state
    const available = voicesForLanguage(voices, language)
    const status = describeVoiceChoice(chosen, available)
    const id = `sound-tts-voice-${language}`
    const statusId = `${id}-status`
    const statusKey: TranslationKey =
      status.kind === 'automatic'
        ? 'settings.soundNarratorVoiceAutomaticStatus'
        : status.kind === 'chosen'
        ? status.voice.localService
          ? 'settings.soundNarratorVoiceInstalledStatus'
          : 'settings.soundNarratorVoiceNetworkStatus'
        : status.kind === 'missing'
        ? 'settings.soundNarratorVoiceMissingStatus'
        : 'settings.soundNarratorVoiceNoneStatus'
    const variables: TranslationVariables =
      status.kind === 'chosen'
        ? { voice: status.voice.name, lang: status.voice.lang }
        : status.kind === 'missing'
        ? { uri: status.uri }
        : {}
    const label = translate(labelKey, languageMode)
    const options: ReadonlyArray<ISearchableSelectOption> = [
      {
        value: '',
        label: translate(
          'settings.soundNarratorChooseAutomatically',
          languageMode
        ),
      },
      ...(status.kind === 'missing'
        ? [
            {
              value: status.uri,
              label: translate(
                'settings.soundNarratorVoiceMissingOption',
                languageMode,
                { uri: status.uri }
              ),
            },
          ]
        : []),
      ...available.map(voice => ({
        value: voice.uri,
        label: `${voice.name} (${voice.lang})${
          voice.localService
            ? ''
            : ` — ${translate(
                'settings.soundNarratorNetworkVoiceOption',
                languageMode
              )}`
        }`,
      })),
    ]

    return (
      <div className="sound-voice-picker">
        <SearchableSelect
          label={label}
          value={chosen}
          options={options}
          searchSurfaceId={`settings-sound-narrator-voice-${language}`}
          regexBuilderTarget={label}
          placeholder={label}
          ariaDescribedBy={statusId}
          disabled={available.length === 0}
          onChange={onChange}
        />
        <p className="settings-description" id={statusId} role="status">
          {translate(statusKey, languageMode, variables)}
        </p>
      </div>
    )
  }

  private update(change: Partial<IAudioSystemSettings>) {
    const settings = { ...this.state.settings, ...change }
    this.props.audioCueStore.setSettings(settings)
    this.setState({ settings })
  }

  public render() {
    const { languageMode, settings } = this.state
    const disabled = !settings.masterEnabled
    return (
      <DialogContent className="sound-preferences">
        <div className="advanced-section">
          <h2>
            <LocalizedText
              translationKey="settings.soundHeading"
              languageMode={languageMode}
            />
          </h2>
          <p className="settings-description">
            <LocalizedText
              translationKey="settings.soundDescription"
              languageMode={languageMode}
            />
          </p>
          <div {...teleportAnchor('settings-sound-master')}>
            {this.renderToggle(
              'settings.soundMasterEnableTitle',
              'settings.soundMasterEnableDescription',
              settings.masterEnabled,
              masterEnabled => this.update({ masterEnabled }),
              'sound-master'
            )}
          </div>
        </div>

        <fieldset
          className="advanced-section sound-group"
          disabled={disabled}
          aria-disabled={disabled}
        >
          <h2>
            <LocalizedText
              translationKey="settings.soundSfxHeading"
              languageMode={languageMode}
            />
          </h2>
          <div {...teleportAnchor('settings-sound-effects')}>
            {this.renderToggle(
              'settings.soundSfxEnableTitle',
              'settings.soundSfxEnableDescription',
              settings.sfxEnabled,
              sfxEnabled => this.update({ sfxEnabled }),
              'sound-sfx'
            )}
          </div>
          <div {...teleportAnchor('settings-sound-effect-volume')}>
            {this.renderVolume(
              'settings.soundSfxVolumeLabel',
              'sound-sfx-volume',
              settings.sfxVolume,
              sfxVolume => this.update({ sfxVolume })
            )}
          </div>
          <Button
            type="button"
            className="sound-preview-button"
            onClick={() => this.props.audioCueStore.previewCue('success')}
          >
            <LocalizedText
              translationKey="settings.soundPreviewCue"
              languageMode={languageMode}
            />
          </Button>
          {this.renderCueAudition()}
        </fieldset>

        <fieldset
          className="advanced-section sound-group"
          disabled={disabled}
          aria-disabled={disabled}
        >
          <h2>
            <LocalizedText
              translationKey="settings.soundTtsHeading"
              languageMode={languageMode}
            />
          </h2>
          <div {...teleportAnchor('settings-sound-narrator')}>
            {this.renderToggle(
              'settings.soundTtsEnableTitle',
              'settings.soundTtsEnableDescription',
              settings.ttsEnabled,
              ttsEnabled => this.update({ ttsEnabled }),
              'sound-tts'
            )}
          </div>
          <div {...teleportAnchor('settings-sound-recorded-narration')}>
            {this.renderToggle(
              'settings.soundRecordedNarrationTitle',
              'settings.soundRecordedNarrationDescription',
              settings.useRecordedNarration,
              useRecordedNarration => this.update({ useRecordedNarration }),
              'sound-recorded-narration'
            )}
          </div>
          <div {...teleportAnchor('settings-sound-narrator-voice')}>
            {this.renderVoicePicker(
              'english',
              'settings.soundNarratorEnglishVoiceLabel',
              settings.ttsVoiceEnglish,
              ttsVoiceEnglish => this.update({ ttsVoiceEnglish })
            )}
            {this.renderVoicePicker(
              'cantonese',
              'settings.soundNarratorCantoneseVoiceLabel',
              settings.ttsVoiceCantonese,
              ttsVoiceCantonese => this.update({ ttsVoiceCantonese })
            )}
            {this.renderTtsRate()}
            {this.renderTtsPitch()}
          </div>
          <div {...teleportAnchor('settings-sound-narrator-volume')}>
            {this.renderVolume(
              'settings.soundTtsVolumeLabel',
              'sound-tts-volume',
              settings.ttsVolume,
              ttsVolume => this.update({ ttsVolume })
            )}
          </div>
          <div {...teleportAnchor('settings-sound-narrator-cooldown')}>
            {this.renderCooldown()}
          </div>
          <p className="settings-description">
            <LocalizedText
              translationKey="settings.soundFunnyHint"
              languageMode={languageMode}
            />
          </p>
          <Button
            type="button"
            className="sound-preview-button"
            onClick={() => this.props.audioCueStore.previewNarration('commit')}
          >
            <LocalizedText
              translationKey="settings.soundPreviewNarration"
              languageMode={languageMode}
            />
          </Button>
        </fieldset>

        <fieldset
          className="advanced-section sound-group"
          disabled={disabled}
          aria-disabled={disabled}
        >
          <h2>
            <LocalizedText
              translationKey="settings.soundMusicHeading"
              languageMode={languageMode}
            />
          </h2>
          <div {...teleportAnchor('settings-sound-music')}>
            {this.renderToggle(
              'settings.soundMusicEnableTitle',
              'settings.soundMusicEnableDescription',
              settings.musicEnabled,
              musicEnabled => this.update({ musicEnabled }),
              'sound-music'
            )}
          </div>
          <div {...teleportAnchor('settings-sound-music-volume')}>
            {this.renderVolume(
              'settings.soundMusicVolumeLabel',
              'sound-music-volume',
              settings.musicVolume,
              musicVolume => this.update({ musicVolume })
            )}
          </div>
          {this.renderMusicChooser()}
        </fieldset>

        <fieldset
          className="advanced-section sound-group"
          disabled={disabled}
          aria-disabled={disabled}
        >
          <h2>
            <LocalizedText
              translationKey="settings.soundQuietHoursHeading"
              languageMode={languageMode}
            />
          </h2>
          <div {...teleportAnchor('settings-sound-quiet-hours')}>
            {this.renderToggle(
              'settings.soundQuietHoursEnableTitle',
              'settings.soundQuietHoursEnableDescription',
              settings.quietHours.enabled,
              enabled =>
                this.update({
                  quietHours: { ...settings.quietHours, enabled },
                }),
              'sound-quiet'
            )}
          </div>
          <div className="sound-quiet-row">
            <div {...teleportAnchor('settings-sound-quiet-hours-start')}>
              {this.renderHour(
                'settings.soundQuietHoursStartLabel',
                'sound-quiet-start',
                settings.quietHours.startHour,
                startHour =>
                  this.update({
                    quietHours: { ...settings.quietHours, startHour },
                  })
              )}
            </div>
            <div {...teleportAnchor('settings-sound-quiet-hours-end')}>
              {this.renderHour(
                'settings.soundQuietHoursEndLabel',
                'sound-quiet-end',
                settings.quietHours.endHour,
                endHour =>
                  this.update({
                    quietHours: { ...settings.quietHours, endHour },
                  })
              )}
            </div>
          </div>
          <div {...teleportAnchor('settings-sound-reduced-motion')}>
            {this.renderToggle(
              'settings.soundReducedMotionTitle',
              'settings.soundReducedMotionDescription',
              settings.respectReducedMotion,
              respectReducedMotion => this.update({ respectReducedMotion }),
              'sound-reduced-motion'
            )}
          </div>
        </fieldset>
      </DialogContent>
    )
  }

  /**
   * A grid of buttons that audition every sound-effect cue, grouped by motif
   * family. Each button plays the synthesized cue for its category regardless of
   * throttling, and carries a localized "Play the X cue" accessible name.
   */
  private renderCueAudition() {
    const { languageMode } = this.state
    return (
      <div
        className="sound-cue-audition"
        {...teleportAnchor('settings-sound-audition')}
      >
        <h3 className="sound-subheading">
          <LocalizedText
            translationKey="settings.soundSfxAuditionHeading"
            languageMode={languageMode}
          />
        </h3>
        <p className="settings-description">
          <LocalizedText
            translationKey="settings.soundSfxAuditionHint"
            languageMode={languageMode}
          />
        </p>
        {CueFamilies.map(family => (
          <div className="sound-cue-family" key={family.headingKey}>
            <h4 className="sound-cue-family-heading">
              <LocalizedText
                translationKey={family.headingKey}
                languageMode={languageMode}
              />
            </h4>
            <div
              className="sound-cue-grid"
              role="group"
              aria-label={translate(family.headingKey, languageMode)}
            >
              {family.categories.map(({ category, labelKey }) => (
                <Button
                  key={category}
                  type="button"
                  className="sound-cue-button"
                  onClick={() => this.props.audioCueStore.previewCue(category)}
                  ariaLabel={translate(
                    'settings.soundCuePlayLabel',
                    languageMode,
                    { cue: translatedVariable(labelKey) }
                  )}
                >
                  <LocalizedText
                    translationKey={labelKey}
                    languageMode={languageMode}
                  />
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  private renderToggle(
    titleKey: Parameters<typeof translate>[0],
    descriptionKey: Parameters<typeof translate>[0],
    checked: boolean,
    onChange: (checked: boolean) => void,
    id: string
  ) {
    const { languageMode } = this.state
    return (
      <div className="preference-toggle-card">
        <div className="preference-toggle-row">
          <div className="preference-toggle-text">
            <span className="preference-toggle-title" id={`${id}-title`}>
              <LocalizedText
                translationKey={titleKey}
                languageMode={languageMode}
              />
            </span>
            <p className="settings-description" id={`${id}-description`}>
              <LocalizedText
                translationKey={descriptionKey}
                languageMode={languageMode}
              />
            </p>
          </div>
          <MaterialSwitch
            checked={checked}
            onChange={onChange}
            ariaLabelledBy={`${id}-title`}
            ariaDescribedBy={`${id}-description`}
          />
        </div>
      </div>
    )
  }

  private renderVolume(
    labelKey: Parameters<typeof translate>[0],
    id: string,
    value: number,
    onChange: (value: number) => void
  ) {
    const label = translate(labelKey, this.state.languageMode)
    const percent = Math.round(value * 100)
    return (
      <RangeSlider
        id={id}
        className="sound-range-slider"
        label={label}
        min={0}
        max={100}
        step={1}
        value={percent}
        valueText={`${percent}%`}
        ariaValueText={`${percent}%`}
        onChange={percent => onChange(percent / 100)}
      />
    )
  }

  private renderCooldown() {
    const { languageMode, settings } = this.state
    const label = translate('settings.soundTtsCooldownLabel', languageMode)
    const seconds = Math.round(settings.ttsCooldownMs / 1000)
    return (
      <RangeSlider
        id="sound-tts-cooldown"
        className="sound-range-slider"
        label={label}
        min={2}
        max={60}
        step={1}
        value={seconds}
        valueText={`${seconds}s`}
        ariaValueText={`${seconds}s`}
        onChange={nextSeconds =>
          this.update({ ttsCooldownMs: nextSeconds * 1000 })
        }
      />
    )
  }

  private renderTtsRate() {
    const { settings } = this.state
    return this.renderTtsRange(
      'settings.soundNarratorRateLabel',
      'sound-tts-rate',
      settings.ttsRate,
      MinTtsRate,
      MaxTtsRate,
      value => this.update({ ttsRate: value })
    )
  }

  private renderTtsPitch() {
    const { settings } = this.state
    return this.renderTtsRange(
      'settings.soundNarratorPitchLabel',
      'sound-tts-pitch',
      settings.ttsPitch,
      MinTtsPitch,
      MaxTtsPitch,
      value => this.update({ ttsPitch: value })
    )
  }

  private renderTtsRange(
    labelKey: TranslationKey,
    id: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void
  ) {
    const label = translate(labelKey, this.state.languageMode)
    const valueText = value.toFixed(1)
    return (
      <RangeSlider
        id={id}
        className="sound-range-slider"
        label={label}
        min={min}
        max={max}
        step={0.1}
        value={value}
        valueText={valueText}
        ariaValueText={valueText}
        onChange={onChange}
      />
    )
  }

  private renderHour(
    labelKey: Parameters<typeof translate>[0],
    id: string,
    value: number,
    onChange: (value: number) => void
  ) {
    const label = translate(labelKey, this.state.languageMode)
    const hours = Array.from({ length: 24 }, (_, hour) => hour)
    return (
      <div className="sound-field-group">
        <Select
          id={id}
          label={label}
          value={value.toString()}
          onChange={event => onChange(Number(event.currentTarget.value))}
        >
          {hours.map(hour => (
            <option key={hour} value={hour}>
              {hour.toString().padStart(2, '0')}:00
            </option>
          ))}
        </Select>
      </div>
    )
  }

  private renderMusicChooser() {
    const { languageMode, repositoryOverride } = this.state
    const { repository } = this.props
    if (repository === null) {
      return (
        <p className="settings-description" role="note">
          <LocalizedText
            translationKey="settings.soundMusicNoRepo"
            languageMode={languageMode}
          />
        </p>
      )
    }

    const theme = this.props.audioCueStore.getRepositoryTheme(repository)
    const themeName =
      theme === null ? '' : repositoryThemeName(theme, languageMode)
    const customTrack =
      repositoryOverride !== null && repositoryOverride.kind === 'custom'
        ? repositoryOverride.track
        : ''
    const isTheme = repositoryOverride === null
    const isCustom =
      repositoryOverride !== null && repositoryOverride.kind === 'custom'
    const isOff =
      repositoryOverride !== null && repositoryOverride.kind === 'off'

    const themeLabel = translate(
      'settings.soundThemeCurrentLabel',
      languageMode,
      { repository: bilingualVariable(repository.name, repository.name) }
    )
    const stateKey = isOff
      ? 'settings.soundThemeStateOff'
      : isCustom
      ? 'settings.soundThemeStateCustom'
      : 'settings.soundThemeStateTheme'
    const trackLabel = translate('settings.soundMusicRepoLabel', languageMode, {
      repository: bilingualVariable(repository.name, repository.name),
    })

    return (
      <div className="sound-theme">
        <h3 className="sound-subheading">
          <LocalizedText
            translationKey="settings.soundThemeSubheading"
            languageMode={languageMode}
          />
        </h3>
        <p className="settings-description">
          <LocalizedText
            translationKey="settings.soundThemeExplanation"
            languageMode={languageMode}
          />
        </p>

        <div className="sound-field-group">
          <span className="sound-theme-name-label" id="sound-theme-name-label">
            {themeLabel}
          </span>
          <output
            className="sound-theme-name"
            aria-labelledby="sound-theme-name-label"
          >
            {themeName}
          </output>
          <p className="settings-description" role="status">
            <LocalizedText
              translationKey={stateKey}
              languageMode={languageMode}
            />
          </p>
        </div>

        <div
          className="sound-field-group"
          {...teleportAnchor('settings-sound-music-track')}
        >
          <span className="sound-music-label" id="sound-music-track-label">
            {trackLabel}
          </span>
          <div className="sound-music-row">
            <TextBox
              ariaLabelledBy="sound-music-track-label"
              value={customTrack}
              readOnly={true}
              placeholder={translate(
                'settings.soundMusicNoTrack',
                languageMode
              )}
            />
            <Button
              type="button"
              className="sound-tonal-button"
              onClick={this.chooseTrack}
            >
              <LocalizedText
                translationKey="settings.soundMusicChoose"
                languageMode={languageMode}
              />
            </Button>
          </div>
        </div>

        <div className="sound-theme-actions">
          <Button
            type="button"
            className="sound-text-button"
            onClick={this.previewTheme}
          >
            <LocalizedText
              translationKey="settings.soundThemePreview"
              languageMode={languageMode}
            />
          </Button>
          <Button
            type="button"
            className="sound-text-button"
            onClick={this.muteHere}
            disabled={isOff}
          >
            <LocalizedText
              translationKey="settings.soundThemeMute"
              languageMode={languageMode}
            />
          </Button>
          <Button
            type="button"
            className="sound-text-button"
            onClick={this.useTheme}
            disabled={isTheme}
          >
            <LocalizedText
              translationKey="settings.soundThemeUseTheme"
              languageMode={languageMode}
            />
          </Button>
        </div>
      </div>
    )
  }

  private chooseTrack = async () => {
    const { repository } = this.props
    if (repository === null) {
      return
    }
    const request = ++this.trackRequest
    const track = await showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio',
          extensions: ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'aac'],
        },
      ],
    })
    if (track === null || request !== this.trackRequest) {
      return
    }
    this.props.audioCueStore.setRepositoryCustomTrack(repository, track)
    this.setState({ repositoryOverride: { kind: 'custom', track } })
  }

  private muteHere = () => {
    const { repository } = this.props
    if (repository === null) {
      return
    }
    this.props.audioCueStore.muteRepository(repository)
    this.setState({ repositoryOverride: { kind: 'off' } })
  }

  private useTheme = () => {
    const { repository } = this.props
    if (repository === null) {
      return
    }
    this.props.audioCueStore.useRepositoryTheme(repository)
    this.setState({ repositoryOverride: null })
  }

  private previewTheme = () => {
    this.props.audioCueStore.previewRepositoryTheme(this.props.repository)
  }
}
