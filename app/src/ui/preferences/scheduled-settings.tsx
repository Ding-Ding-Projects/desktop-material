import * as React from 'react'
/* eslint-disable react/jsx-no-bind -- schedule controls capture their exact rule and field */

import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Row } from '../lib/row'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import {
  translate,
  translatedVariable,
  TranslationVariables,
} from '../../lib/i18n'
import {
  accentPalettes,
  densityPreferences,
  elevationPreferences,
  monospaceFontPreferences,
  motionPreferences,
  submoduleBackButtonLabels,
  submoduleBackButtonStyles,
  surfacePalettes,
  tabCloseButtonPreferences,
  tabWidthPreferences,
  toolbarLabelPreferences,
  uiFontPreferences,
  updateProgressPalettes,
} from '../../models/appearance-customization'
import {
  HomeAssistantBooleanState,
  IHomeAssistantSettingsRequest,
  ISetHomeAssistantTokenRequest,
  IScheduledSettingsConfig,
  IScheduledSettingsRule,
  IScheduledSettingsValue,
  ScheduledAppearanceKey,
  ScheduledSettingsSource,
  normalizeHomeAssistantBaseURL,
  normalizeHomeAssistantEntityId,
  normalizeScheduledSettings,
  normalizeScheduledSettingsAPIEndpoint,
  normalizeScheduledSettingsValue,
  scheduledWeekdays,
  scheduledThemes,
} from '../../models/scheduled-settings'
import { LanguageMode, languageModes } from '../../models/language-mode'
import { teleportAnchor } from '../../lib/teleport-targets'

export interface IScheduledSettingsProps {
  readonly languageMode: LanguageMode
  readonly scheduledSettings: IScheduledSettingsConfig
  readonly onScheduledSettingsChanged: (value: IScheduledSettingsConfig) => void
  readonly onHomeAssistantTokenChanged: (
    request: ISetHomeAssistantTokenRequest
  ) => Promise<void>
  readonly onHomeAssistantStateRequested: (
    request: IHomeAssistantSettingsRequest
  ) => Promise<HomeAssistantBooleanState>
}

interface IScheduledSettingsState {
  readonly config: IScheduledSettingsConfig
  readonly tokenDrafts: Readonly<Record<string, string>>
  readonly connectionMessages: Readonly<Record<string, string>>
  readonly connectionBusy: Readonly<Record<string, boolean>>
}

type ScheduledAppearanceValueKey =
  | 'accentPalette'
  | 'updateProgressPalette'
  | 'surfacePalette'
  | 'elevation'
  | 'uiFont'
  | 'monospaceFont'
  | 'motion'
  | 'toolbarLabels'
  | 'toolbarDensity'
  | 'repositoryListDensity'
  | 'tabDensity'
  | 'tabWidth'
  | 'tabCloseButtons'
  | 'submoduleBackButtonStyle'
  | 'submoduleBackButtonLabel'

const appearanceValueOptions: ReadonlyArray<{
  readonly key: ScheduledAppearanceValueKey
  readonly labelKey: Parameters<typeof translate>[0]
  readonly values: ReadonlyArray<string>
}> = [
  {
    key: 'accentPalette',
    labelKey: 'appearance.scheduledSettingsAccentPalette',
    values: accentPalettes,
  },
  {
    key: 'updateProgressPalette',
    labelKey: 'appearance.scheduledSettingsUpdateProgressPalette',
    values: updateProgressPalettes,
  },
  {
    key: 'surfacePalette',
    labelKey: 'appearance.scheduledSettingsSurfacePalette',
    values: surfacePalettes,
  },
  {
    key: 'elevation',
    labelKey: 'appearance.scheduledSettingsElevation',
    values: elevationPreferences,
  },
  {
    key: 'uiFont',
    labelKey: 'appearance.scheduledSettingsUIFont',
    values: uiFontPreferences,
  },
  {
    key: 'monospaceFont',
    labelKey: 'appearance.scheduledSettingsMonospaceFont',
    values: monospaceFontPreferences,
  },
  {
    key: 'motion',
    labelKey: 'appearance.scheduledSettingsMotion',
    values: motionPreferences,
  },
  {
    key: 'toolbarLabels',
    labelKey: 'appearance.scheduledSettingsToolbarLabels',
    values: toolbarLabelPreferences,
  },
  {
    key: 'toolbarDensity',
    labelKey: 'appearance.scheduledSettingsToolbarDensity',
    values: densityPreferences,
  },
  {
    key: 'repositoryListDensity',
    labelKey: 'appearance.scheduledSettingsRepositoryListDensity',
    values: densityPreferences,
  },
  {
    key: 'tabDensity',
    labelKey: 'appearance.scheduledSettingsTabDensity',
    values: densityPreferences,
  },
  {
    key: 'tabWidth',
    labelKey: 'appearance.scheduledSettingsTabWidth',
    values: tabWidthPreferences,
  },
  {
    key: 'tabCloseButtons',
    labelKey: 'appearance.scheduledSettingsTabCloseButtons',
    values: tabCloseButtonPreferences,
  },
  {
    key: 'submoduleBackButtonStyle',
    labelKey: 'appearance.scheduledSettingsSubmoduleBackStyle',
    values: submoduleBackButtonStyles,
  },
  {
    key: 'submoduleBackButtonLabel',
    labelKey: 'appearance.scheduledSettingsSubmoduleBackLabel',
    values: submoduleBackButtonLabels,
  },
]

const weekdayTranslationKeys: ReadonlyArray<Parameters<typeof translate>[0]> = [
  'appearance.scheduledSettingsDaySunday',
  'appearance.scheduledSettingsDayMonday',
  'appearance.scheduledSettingsDayTuesday',
  'appearance.scheduledSettingsDayWednesday',
  'appearance.scheduledSettingsDayThursday',
  'appearance.scheduledSettingsDayFriday',
  'appearance.scheduledSettingsDaySaturday',
]

function makeDefaultRule(index: number, label: string): IScheduledSettingsRule {
  return {
    id: `scheduled-${index + 1}`,
    label,
    enabled: true,
    allDays: false,
    daysOfWeek: [1, 2, 3, 4, 5],
    startDate: null,
    endDate: null,
    startTime: '09:00',
    endTime: '17:00',
    source: {
      kind: 'local',
      value: { languageMode: 'english', theme: 'system' },
    },
  }
}

function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
  } catch {
    return 'local time'
  }
}

function updateSourceValue(
  source: ScheduledSettingsSource,
  patch: IScheduledSettingsValue
): ScheduledSettingsSource {
  if (source.kind === 'api') {
    return source
  }
  return {
    ...source,
    value: normalizeScheduledSettingsValue({ ...source.value, ...patch }),
  }
}

function removeOptionalValue<T extends object>(value: T, key: keyof T): T {
  const next = { ...value }
  delete next[key]
  return next
}

export class ScheduledSettings extends React.Component<
  IScheduledSettingsProps,
  IScheduledSettingsState
> {
  private readonly pendingConnectionRules = new Set<string>()

  public constructor(props: IScheduledSettingsProps) {
    super(props)
    this.state = {
      config: props.scheduledSettings,
      tokenDrafts: {},
      connectionMessages: {},
      connectionBusy: {},
    }
  }

  public componentDidUpdate(prevProps: IScheduledSettingsProps) {
    // Keep an external profile switch or another window's edit visible, while
    // not replacing a draft immediately after this component initiated it.
    if (
      prevProps.scheduledSettings !== this.props.scheduledSettings &&
      this.state.config === prevProps.scheduledSettings
    ) {
      this.setState({ config: this.props.scheduledSettings })
    }
  }

  private getLanguageMode(): LanguageMode {
    return this.props.languageMode
  }

  private text = (
    key: Parameters<typeof translate>[0],
    values?: TranslationVariables
  ) => translate(key, this.getLanguageMode(), values)

  private updateConfig = (
    update: (config: IScheduledSettingsConfig) => IScheduledSettingsConfig
  ) => {
    const config = normalizeScheduledSettings(update(this.state.config))
    this.setState({ config })
    this.props.onScheduledSettingsChanged(config)
  }

  private updateRule = (
    id: string,
    update: (rule: IScheduledSettingsRule) => IScheduledSettingsRule
  ) => {
    const previousRule = this.state.config.rules.find(rule => rule.id === id)
    const nextRule =
      previousRule === undefined ? undefined : update(previousRule)
    const shouldClearTokenDraft =
      previousRule?.source.kind === 'home-assistant' &&
      (nextRule?.source.kind !== 'home-assistant' ||
        previousRule.source.baseUrl !== nextRule.source.baseUrl ||
        previousRule.source.entityId !== nextRule.source.entityId)
    this.updateConfig(config => ({
      ...config,
      rules: config.rules.map(rule => (rule.id === id ? update(rule) : rule)),
    }))
    if (shouldClearTokenDraft) {
      this.clearTokenDraft(id)
    }
  }

  private addRule = () => {
    this.updateConfig(config => ({
      ...config,
      rules: [
        ...config.rules,
        makeDefaultRule(
          config.rules.length,
          this.text('appearance.scheduledSettingsRule', {
            number: (config.rules.length + 1).toString(),
          })
        ),
      ],
    }))
  }

  private removeRule = (id: string) => {
    this.updateConfig(config => ({
      ...config,
      rules: config.rules.filter(rule => rule.id !== id),
    }))
    this.clearTokenDraft(id)
    this.pendingConnectionRules.delete(id)
    this.setState(state => {
      const connectionBusy = { ...state.connectionBusy }
      delete connectionBusy[id]
      const connectionMessages = { ...state.connectionMessages }
      delete connectionMessages[id]
      return { connectionBusy, connectionMessages }
    })
  }

  private updateRuleValue = (
    rule: IScheduledSettingsRule,
    patch: IScheduledSettingsValue
  ) => {
    this.updateRule(rule.id, current => ({
      ...current,
      source: updateSourceValue(current.source, patch),
    }))
  }

  private updateLanguageValue = (
    rule: IScheduledSettingsRule,
    value: string
  ) => {
    if (rule.source.kind === 'api') {
      return
    }
    const sourceValue =
      value === ''
        ? removeOptionalValue(rule.source.value, 'languageMode')
        : { ...rule.source.value, languageMode: value as LanguageMode }
    this.updateRuleValue(rule, normalizeScheduledSettingsValue(sourceValue))
  }

  private updateThemeValue = (rule: IScheduledSettingsRule, value: string) => {
    if (rule.source.kind === 'api') {
      return
    }
    const sourceValue =
      value === ''
        ? removeOptionalValue(rule.source.value, 'theme')
        : { ...rule.source.value, theme: value }
    this.updateRuleValue(rule, normalizeScheduledSettingsValue(sourceValue))
  }

  private updateAppearanceValue = (
    rule: IScheduledSettingsRule,
    key: ScheduledAppearanceValueKey,
    value: string
  ) => {
    if (rule.source.kind === 'api') {
      return
    }
    const appearance = { ...(rule.source.value.appearance ?? {}) }
    if (value === '') {
      delete appearance[key]
    } else {
      ;(appearance as Record<string, unknown>)[key] = value
    }
    const sourceValue =
      Object.keys(appearance).length === 0
        ? removeOptionalValue(rule.source.value, 'appearance')
        : { ...rule.source.value, appearance }
    this.updateRuleValue(rule, normalizeScheduledSettingsValue(sourceValue))
  }

  private updateAppearanceBoolean = (
    rule: IScheduledSettingsRule,
    key: 'highlightDesktopMaterialFeatures',
    value: boolean | null
  ) => {
    if (rule.source.kind === 'api') {
      return
    }
    const appearance = { ...(rule.source.value.appearance ?? {}) }
    if (value === null) {
      delete appearance[key]
    } else {
      ;(appearance as Record<string, unknown>)[key] = value
    }
    const sourceValue =
      Object.keys(appearance).length === 0
        ? removeOptionalValue(rule.source.value, 'appearance')
        : { ...rule.source.value, appearance }
    this.updateRuleValue(rule, normalizeScheduledSettingsValue(sourceValue))
  }

  private onTokenChanged = (ruleId: string, token: string) => {
    this.setState(state => ({
      tokenDrafts: { ...state.tokenDrafts, [ruleId]: token },
    }))
  }

  private clearTokenDraft = (ruleId: string) => {
    this.setState(state => {
      if (!(ruleId in state.tokenDrafts)) {
        return null
      }
      const tokenDrafts = { ...state.tokenDrafts }
      delete tokenDrafts[ruleId]
      return { tokenDrafts }
    })
  }

  private beginConnectionAction = (ruleId: string): boolean => {
    if (this.pendingConnectionRules.has(ruleId)) {
      return false
    }
    this.pendingConnectionRules.add(ruleId)
    this.setState(state => ({
      connectionBusy: { ...state.connectionBusy, [ruleId]: true },
    }))
    return true
  }

  private endConnectionAction = (ruleId: string) => {
    this.pendingConnectionRules.delete(ruleId)
    this.setState(state => ({
      connectionBusy: { ...state.connectionBusy, [ruleId]: false },
    }))
  }

  private saveHomeAssistantToken = async (rule: IScheduledSettingsRule) => {
    if (rule.source.kind !== 'home-assistant') {
      return
    }
    if (!this.beginConnectionAction(rule.id)) {
      return
    }
    const request: ISetHomeAssistantTokenRequest = {
      baseUrl: rule.source.baseUrl,
      entityId: rule.source.entityId,
      token: this.state.tokenDrafts[rule.id] ?? null,
    }
    try {
      await this.props.onHomeAssistantTokenChanged(request)
      this.setState({
        tokenDrafts: { ...this.state.tokenDrafts, [rule.id]: '' },
      })
      this.setConnectionMessage(
        rule.id,
        this.text('appearance.scheduledSettingsTokenSaved')
      )
    } catch {
      this.setConnectionMessage(
        rule.id,
        this.text('appearance.scheduledSettingsSourceFailure')
      )
    } finally {
      this.endConnectionAction(rule.id)
    }
  }

  private testHomeAssistant = async (rule: IScheduledSettingsRule) => {
    if (rule.source.kind !== 'home-assistant') {
      return
    }
    if (!this.beginConnectionAction(rule.id)) {
      return
    }
    try {
      const state = await this.props.onHomeAssistantStateRequested({
        baseUrl: rule.source.baseUrl,
        entityId: rule.source.entityId,
      })
      this.setConnectionMessage(
        rule.id,
        this.text('appearance.scheduledSettingsSensorState', {
          state: translatedVariable(
            state === 'on'
              ? 'appearance.scheduledSettingsOn'
              : 'appearance.scheduledSettingsOff'
          ),
        })
      )
    } catch {
      this.setConnectionMessage(
        rule.id,
        this.text('appearance.scheduledSettingsSourceFailure')
      )
    } finally {
      this.endConnectionAction(rule.id)
    }
  }

  private setConnectionMessage = (ruleId: string, message: string) => {
    this.setState({
      connectionMessages: {
        ...this.state.connectionMessages,
        [ruleId]: message,
      },
    })
  }

  private renderValueSelect(
    label: string,
    value: string | undefined,
    values: ReadonlyArray<string>,
    onChange: (value: string) => void,
    formatOption: (value: string) => string = value => value,
    field?: string
  ) {
    return (
      <Select
        className={
          field === undefined ? undefined : `scheduled-settings-target-${field}`
        }
        label={label}
        value={value ?? ''}
        onChange={event => onChange(event.currentTarget.value)}
      >
        <option value="">
          {this.text('appearance.scheduledSettingsNoChange')}
        </option>
        {values.map(option => (
          <option key={option} value={option}>
            {formatOption(option)}
          </option>
        ))}
      </Select>
    )
  }

  private renderScheduledValue(rule: IScheduledSettingsRule) {
    if (rule.source.kind === 'api') {
      return (
        <div className="scheduled-settings-value-editor">
          <details className="scheduled-settings-details">
            <summary>
              {this.text('appearance.scheduledSettingsValueDetails')}
            </summary>
            <p className="appearance-customization-caption">
              {this.text('appearance.scheduledSettingsValueDescription')}
            </p>
            <p className="appearance-customization-caption scheduled-settings-provenance">
              {this.text('appearance.scheduledSettingsValueProvenance')}
            </p>
          </details>
        </div>
      )
    }

    const value = rule.source.value
    return (
      <div className="scheduled-settings-value-editor">
        <h4>{this.text('appearance.scheduledSettingsValue')}</h4>
        <details className="scheduled-settings-details">
          <summary>
            {this.text('appearance.scheduledSettingsValueDetails')}
          </summary>
          <p className="appearance-customization-caption">
            {this.text('appearance.scheduledSettingsValueDescription')}
          </p>
          <p className="appearance-customization-caption scheduled-settings-provenance">
            {this.text('appearance.scheduledSettingsValueProvenance')}
          </p>
        </details>
        <Row>
          {this.renderValueSelect(
            this.text('appearance.scheduledSettingsLanguage'),
            value.languageMode,
            languageModes,
            next => this.updateLanguageValue(rule, next),
            option =>
              this.text(
                option === 'english'
                  ? 'appearance.scheduledSettingsLanguageEnglish'
                  : option === 'cantonese'
                  ? 'appearance.scheduledSettingsLanguageCantonese'
                  : 'appearance.scheduledSettingsLanguageBilingual'
              ),
            'language'
          )}
          {this.renderValueSelect(
            this.text('appearance.scheduledSettingsTheme'),
            value.theme,
            scheduledThemes,
            next => this.updateThemeValue(rule, next),
            option =>
              this.text(
                option === 'light'
                  ? 'appearance.scheduledSettingsThemeLight'
                  : option === 'dark'
                  ? 'appearance.scheduledSettingsThemeDark'
                  : 'appearance.scheduledSettingsThemeSystem'
              ),
            'theme'
          )}
        </Row>
        <div className="scheduled-settings-appearance-values">
          <h5>{this.text('appearance.scheduledSettingsAppearance')}</h5>
          <Select
            className="scheduled-settings-target-highlight"
            label={this.text('appearance.scheduledSettingsHighlightFeatures')}
            value={
              value.appearance?.highlightDesktopMaterialFeatures === undefined
                ? ''
                : value.appearance.highlightDesktopMaterialFeatures
                ? 'on'
                : 'off'
            }
            onChange={event => {
              const selected = event.currentTarget.value
              this.updateAppearanceBoolean(
                rule,
                'highlightDesktopMaterialFeatures',
                selected === '' ? null : selected === 'on'
              )
            }}
          >
            <option value="">
              {this.text('appearance.scheduledSettingsNoChange')}
            </option>
            <option value="on">
              {this.text('appearance.scheduledSettingsOn')}
            </option>
            <option value="off">
              {this.text('appearance.scheduledSettingsOff')}
            </option>
          </Select>
          <Row>
            {appearanceValueOptions.map(option => (
              <React.Fragment key={option.key}>
                {this.renderValueSelect(
                  this.text(option.labelKey),
                  value.appearance?.[option.key as ScheduledAppearanceKey] as
                    | string
                    | undefined,
                  option.values,
                  next => this.updateAppearanceValue(rule, option.key, next),
                  value => value,
                  `appearance-${option.key}`
                )}
              </React.Fragment>
            ))}
          </Row>
        </div>
      </div>
    )
  }

  private renderSource(rule: IScheduledSettingsRule) {
    const languageMode = this.getLanguageMode()
    const source = rule.source
    const sourceHelpId = `${rule.id}-source-help`
    const sourceInvalidId = `${rule.id}-source-invalid`
    const sourceInvalid =
      source.kind === 'api'
        ? normalizeScheduledSettingsAPIEndpoint(source.endpoint) === null
        : source.kind === 'home-assistant'
        ? normalizeHomeAssistantBaseURL(source.baseUrl) === null ||
          normalizeHomeAssistantEntityId(source.entityId) === null
        : false
    const sourceLabel = this.text(
      source.kind === 'api'
        ? 'appearance.scheduledSettingsAPI'
        : source.kind === 'home-assistant'
        ? 'appearance.scheduledSettingsHomeAssistant'
        : 'appearance.scheduledSettingsLocal'
    )
    return (
      <>
        <details className="scheduled-settings-details">
          <summary>
            {this.text('appearance.scheduledSettingsSourceDetails')}
          </summary>
          <p className="appearance-customization-caption">
            {this.text('appearance.scheduledSettingsDescription')}
          </p>
          <p className="appearance-customization-caption scheduled-settings-provenance">
            {this.text('appearance.scheduledSettingsSourceProvenance', {
              source: sourceLabel,
            })}
          </p>
        </details>
        <Select
          className="scheduled-settings-target-source"
          label={translate('appearance.scheduledSettingsSource', languageMode)}
          value={source.kind}
          onChange={event => {
            const kind = event.currentTarget.value
            this.updateRule(rule.id, current => {
              const currentValue =
                current.source.kind === 'api' ? {} : current.source.value
              if (kind === 'api') {
                return {
                  ...current,
                  source: { kind: 'api', endpoint: '' },
                }
              }
              if (kind === 'home-assistant') {
                return {
                  ...current,
                  source: {
                    kind: 'home-assistant',
                    baseUrl: '',
                    entityId: 'binary_sensor.example',
                    value: normalizeScheduledSettingsValue(currentValue),
                  },
                }
              }
              return {
                ...current,
                source: {
                  kind: 'local',
                  value: normalizeScheduledSettingsValue(currentValue),
                },
              }
            })
          }}
        >
          <option value="local">
            {translate('appearance.scheduledSettingsLocal', languageMode)}
          </option>
          <option value="api">
            {translate('appearance.scheduledSettingsAPI', languageMode)}
          </option>
          <option value="home-assistant">
            {translate(
              'appearance.scheduledSettingsHomeAssistant',
              languageMode
            )}
          </option>
        </Select>
        {source.kind === 'api' && (
          <div className="scheduled-settings-external-fields">
            <TextBox
              className="scheduled-settings-target-api-endpoint"
              label={translate(
                'appearance.scheduledSettingsAPIEndpoint',
                languageMode
              )}
              value={source.endpoint}
              onValueChanged={endpoint =>
                this.updateRule(rule.id, current => ({
                  ...current,
                  source: { kind: 'api', endpoint },
                }))
              }
              ariaDescribedBy={`${sourceHelpId} ${sourceInvalidId}`}
              ariaInvalid={sourceInvalid}
            />
            <p id={sourceHelpId} className="appearance-customization-caption">
              {this.text('appearance.scheduledSettingsAPIHelp')}
            </p>
          </div>
        )}
        {source.kind === 'home-assistant' && (
          <div className="scheduled-settings-external-fields">
            <TextBox
              className="scheduled-settings-target-home-assistant-url"
              label={translate(
                'appearance.scheduledSettingsHomeAssistantBaseURL',
                languageMode
              )}
              value={source.baseUrl}
              onValueChanged={baseUrl =>
                this.updateRule(rule.id, current =>
                  current.source.kind === 'home-assistant'
                    ? { ...current, source: { ...current.source, baseUrl } }
                    : current
                )
              }
              ariaDescribedBy={`${sourceHelpId} ${sourceInvalidId}`}
              ariaInvalid={sourceInvalid}
            />
            <p id={sourceHelpId} className="appearance-customization-caption">
              {this.text('appearance.scheduledSettingsHomeAssistantHelp')}
            </p>
            <TextBox
              className="scheduled-settings-target-home-assistant-entity"
              label={translate(
                'appearance.scheduledSettingsHomeAssistantEntity',
                languageMode
              )}
              value={source.entityId}
              onValueChanged={entityId =>
                this.updateRule(rule.id, current =>
                  current.source.kind === 'home-assistant'
                    ? { ...current, source: { ...current.source, entityId } }
                    : current
                )
              }
              ariaDescribedBy={`${sourceHelpId} ${sourceInvalidId}`}
              ariaInvalid={sourceInvalid}
            />
            <TextBox
              className="scheduled-settings-target-home-assistant-token"
              type="password"
              label={translate(
                'appearance.scheduledSettingsHomeAssistantToken',
                languageMode
              )}
              value={this.state.tokenDrafts[rule.id] ?? ''}
              onValueChanged={token => this.onTokenChanged(rule.id, token)}
              ariaDescribedBy={sourceHelpId}
            />
            <div className="scheduled-settings-actions">
              <Button
                type="button"
                size="small"
                disabled={this.state.connectionBusy[rule.id] === true}
                ariaBusy={this.state.connectionBusy[rule.id] === true}
                onClick={() => void this.saveHomeAssistantToken(rule)}
              >
                {translate(
                  'appearance.scheduledSettingsSaveToken',
                  languageMode
                )}
              </Button>
              <Button
                type="button"
                size="small"
                disabled={this.state.connectionBusy[rule.id] === true}
                ariaBusy={this.state.connectionBusy[rule.id] === true}
                onClick={() => void this.testHomeAssistant(rule)}
              >
                {translate(
                  'appearance.scheduledSettingsTestSensor',
                  languageMode
                )}
              </Button>
            </div>
            <p className="appearance-customization-caption">
              {translate(
                'appearance.scheduledSettingsValueDescription',
                languageMode
              )}
            </p>
          </div>
        )}
        {sourceInvalid && (
          <p
            id={sourceInvalidId}
            className="appearance-customization-caption scheduled-settings-source-error"
            role="alert"
          >
            {this.text('appearance.scheduledSettingsSourceInvalid')}
          </p>
        )}
        {this.renderScheduledValue(rule)}
        {this.state.connectionMessages[rule.id] && (
          <p className="scheduled-settings-connection-message" role="status">
            {this.state.connectionMessages[rule.id]}
          </p>
        )}
      </>
    )
  }

  private renderRule(rule: IScheduledSettingsRule, index: number) {
    const languageMode = this.getLanguageMode()
    const selectedDays = new Set(rule.daysOfWeek)
    const dateRangeInvalid =
      rule.startDate !== null &&
      rule.endDate !== null &&
      rule.endDate < rule.startDate
    const dateRangeErrorId = `${rule.id}-date-range-error`
    return (
      <article
        key={rule.id}
        className="scheduled-settings-rule"
        {...teleportAnchor(`settings-schedule-${rule.id}`)}
      >
        <div className="scheduled-settings-rule-header">
          <TextBox
            className="scheduled-settings-target-label"
            label={translate('appearance.scheduledSettingsRule', languageMode, {
              number: (index + 1).toString(),
            })}
            value={rule.label}
            onValueChanged={label =>
              this.updateRule(rule.id, current => ({ ...current, label }))
            }
          />
          <Button
            className="scheduled-settings-target-remove"
            type="button"
            size="small"
            onClick={() => this.removeRule(rule.id)}
          >
            {translate('appearance.scheduledSettingsRemove', languageMode)}
          </Button>
        </div>
        <details className="scheduled-settings-details">
          <summary>
            {this.text('appearance.scheduledSettingsRuleDetails')}
          </summary>
          <p className="appearance-customization-caption">
            {this.text('appearance.scheduledSettingsRuleHelp')}
          </p>
          <p className="appearance-customization-caption scheduled-settings-provenance">
            {this.text('appearance.scheduledSettingsRuleProvenance', {
              startTime: rule.startTime,
              endTime: rule.endTime,
            })}
          </p>
        </details>
        <Checkbox
          className="scheduled-settings-target-enabled"
          label={translate('appearance.scheduledSettingsEnabled', languageMode)}
          value={rule.enabled ? CheckboxValue.On : CheckboxValue.Off}
          onChange={event =>
            this.updateRule(rule.id, current => ({
              ...current,
              enabled: event.currentTarget.checked,
            }))
          }
        />
        <div className="scheduled-settings-calendar-fields">
          <TextBox
            className="scheduled-settings-target-start-date"
            type="date"
            label={translate(
              'appearance.scheduledSettingsStartDate',
              languageMode
            )}
            value={rule.startDate ?? ''}
            onValueChanged={startDate =>
              this.updateRule(rule.id, current => ({
                ...current,
                startDate: startDate === '' ? null : startDate,
              }))
            }
          />
          <TextBox
            className="scheduled-settings-target-end-date"
            type="date"
            label={translate(
              'appearance.scheduledSettingsEndDate',
              languageMode
            )}
            value={rule.endDate ?? ''}
            ariaDescribedBy={dateRangeInvalid ? dateRangeErrorId : undefined}
            ariaInvalid={dateRangeInvalid}
            onValueChanged={endDate =>
              this.updateRule(rule.id, current => ({
                ...current,
                endDate: endDate === '' ? null : endDate,
              }))
            }
          />
          <TextBox
            className="scheduled-settings-target-start-time"
            type="time"
            label={translate(
              'appearance.scheduledSettingsStartTime',
              languageMode
            )}
            value={rule.startTime}
            onValueChanged={startTime =>
              this.updateRule(rule.id, current => ({ ...current, startTime }))
            }
          />
          <TextBox
            className="scheduled-settings-target-end-time"
            type="time"
            label={translate(
              'appearance.scheduledSettingsEndTime',
              languageMode
            )}
            value={rule.endTime}
            onValueChanged={endTime =>
              this.updateRule(rule.id, current => ({ ...current, endTime }))
            }
          />
        </div>
        {dateRangeInvalid && (
          <p
            id={dateRangeErrorId}
            className="appearance-customization-caption scheduled-settings-source-error"
            role="alert"
          >
            {this.text('appearance.scheduledSettingsDateRangeInvalid')}
          </p>
        )}
        <p className="appearance-customization-caption scheduled-settings-time-zone">
          {translate('appearance.scheduledSettingsTimeZone', languageMode, {
            timeZone: getLocalTimeZone(),
          })}
        </p>
        <Checkbox
          className="scheduled-settings-target-all-days"
          label={translate('appearance.scheduledSettingsAllDays', languageMode)}
          value={rule.allDays ? CheckboxValue.On : CheckboxValue.Off}
          onChange={event =>
            this.updateRule(rule.id, current => ({
              ...current,
              allDays: event.currentTarget.checked,
            }))
          }
        />
        <fieldset className="scheduled-settings-weekdays scheduled-settings-target-weekdays">
          <legend>
            {translate('appearance.scheduledSettingsWeekdays', languageMode)}
          </legend>
          {scheduledWeekdays.map((day, dayIndex) => (
            <Checkbox
              key={day}
              label={translate(weekdayTranslationKeys[dayIndex], languageMode)}
              value={
                selectedDays.has(day) ? CheckboxValue.On : CheckboxValue.Off
              }
              disabled={rule.allDays}
              onChange={event =>
                this.updateRule(rule.id, current => ({
                  ...current,
                  daysOfWeek: event.currentTarget.checked
                    ? [...new Set([...current.daysOfWeek, day])].sort(
                        (left, right) => left - right
                      )
                    : current.daysOfWeek.filter(
                        currentDay => currentDay !== day
                      ),
                }))
              }
            />
          ))}
        </fieldset>
        {this.renderSource(rule)}
      </article>
    )
  }

  public render() {
    const languageMode = this.getLanguageMode()
    return (
      <div
        className="appearance-section appearance-customization-section scheduled-settings-section"
        {...teleportAnchor('settings-scheduled-settings')}
      >
        <div className="scheduled-settings-heading-row">
          <div>
            <h2>
              {translate('appearance.scheduledSettingsHeading', languageMode)}
            </h2>
            <p className="appearance-customization-caption">
              {translate(
                'appearance.scheduledSettingsDescription',
                languageMode
              )}
            </p>
          </div>
          <Button type="button" onClick={this.addRule}>
            {translate('appearance.scheduledSettingsAdd', languageMode)}
          </Button>
        </div>
        {this.state.config.rules.length === 0 ? (
          <p className="scheduled-settings-empty">
            {translate('appearance.scheduledSettingsEmpty', languageMode)}
          </p>
        ) : (
          <div className="scheduled-settings-rules">
            {this.state.config.rules.map((rule, index) =>
              this.renderRule(rule, index)
            )}
          </div>
        )}
      </div>
    )
  }
}
