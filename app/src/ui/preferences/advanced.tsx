/* eslint-disable react/jsx-no-bind -- localized radio labels depend on the live language mode */
import * as React from 'react'
import { teleportAnchor } from '../../lib/teleport-targets'
import { ENABLE_TELEMETRY } from '../../lib/telemetry-flag'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { MaterialSymbol } from '../lib/material-symbol'
import { RadioGroup } from '../lib/radio-group'
import { SamplesURL } from '../../lib/stats'
import { isWindowsOpenSSHAvailable } from '../../lib/ssh/ssh'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import {
  getLargeRepositorySettings,
  DefaultLargeRepositorySettings,
  LargeRepositorySettingsStorageKey,
  setLargeRepositorySettings,
} from '../../lib/large-repository/large-repository-settings'
import { clearLargeRepositoryEvaluations } from '../../lib/large-repository/large-repository-controller'
import { AuthenticatorPreferences } from './authenticator-settings'
import {
  BrowserPreferencesChangedEvent,
  BrowserOpenMode,
  BrowserOpenModes,
  BrowserOpenModeStorageKey,
  getBrowserOpenModePreference,
  setBrowserOpenModePreference,
} from '../../lib/internal-browser'
import {
  autoSwitchAccountToRepositoryOwnerDefault,
  autoSwitchAccountToRepositoryOwnerKey,
} from '../../lib/auto-switch-account-preference'
import {
  repositoryIndicatorsEnabledKey,
  verboseLoggingKey,
} from '../../lib/stores/app-store'
import {
  useExternalCredentialHelperDefault,
  useExternalCredentialHelperKey,
} from '../../lib/trampoline/use-external-credential-helper'
import { UseWindowsOpenSSHKey } from '../../lib/ssh/ssh'
import { StatsOptOutKey } from '../../lib/stats/stats-store'
import {
  SettingExplanation,
  SettingValueProvenance,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface IAdvancedSettingExplanation {
  readonly id: string
  readonly explanationEnglish: string
  readonly explanationCantonese: string
  readonly currentEnglish: string
  readonly currentCantonese: string
  readonly shippedEnglish: string
  readonly shippedCantonese: string
  readonly stored: boolean
  readonly sourceWhenMissing?: SettingValueProvenance
  readonly missingEnglish?: string
  readonly missingCantonese?: string
}

interface IAdvancedPreferencesProps {
  readonly useWindowsOpenSSH: boolean
  readonly verboseLogging: boolean
  readonly optOutOfUsageTracking: boolean
  readonly useExternalCredentialHelper: boolean
  readonly repositoryIndicatorsEnabled: boolean
  readonly autoSwitchAccountToRepositoryOwner: boolean
  readonly onUseWindowsOpenSSHChanged: (checked: boolean) => void
  readonly onVerboseLoggingChanged: (checked: boolean) => void
  readonly onOptOutofReportingChanged: (checked: boolean) => void
  readonly onUseExternalCredentialHelperChanged: (checked: boolean) => void
  readonly onRepositoryIndicatorsEnabledChanged: (enabled: boolean) => void
  readonly onAutoSwitchAccountToRepositoryOwnerChanged: (
    enabled: boolean
  ) => void
}

interface IAdvancedPreferencesState {
  readonly languageMode: LanguageMode
  readonly optOutOfUsageTracking: boolean
  readonly canUseWindowsSSH: boolean
  readonly useExternalCredentialHelper: boolean
  readonly largeRepoAutoDetect: boolean
  readonly largeRepoAutoRepack: boolean
  readonly largeRepoFileThreshold: number
  readonly browserOpenMode: BrowserOpenMode
}

export class Advanced extends React.Component<
  IAdvancedPreferencesProps,
  IAdvancedPreferencesState
> {
  private mounted = false

  private localize(english: string, cantonese: string): string {
    switch (this.state.languageMode) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  private hasStoredChoice(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null
    } catch {
      return false
    }
  }

  private renderSettingExplanation(
    value: IAdvancedSettingExplanation
  ): JSX.Element {
    const source = value.stored
      ? 'stored-choice'
      : value.sourceWhenMissing ?? 'compiled-default'
    const provenanceEnglish = value.stored
      ? `A choice is recorded on this computer. Current value: ${value.currentEnglish}. Shipped value: ${value.shippedEnglish}.`
      : value.missingEnglish ??
        `No choice is recorded on this computer. Current and shipped value: ${value.shippedEnglish}.`
    const provenanceCantonese = value.stored
      ? `呢部電腦記錄咗選擇。目前值：${value.currentCantonese}。出廠值：${value.shippedCantonese}。`
      : value.missingCantonese ??
        `呢部電腦未記錄選擇。目前值同出廠值：${value.shippedCantonese}。`

    return (
      <SettingExplanation
        settingId={value.id}
        summary={this.localize('What this setting changes', '呢個設定會改咩')}
        explanation={this.localize(
          value.explanationEnglish,
          value.explanationCantonese
        )}
        source={source}
        provenance={this.localize(provenanceEnglish, provenanceCantonese)}
      />
    )
  }

  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    const largeRepo = getLargeRepositorySettings()

    this.state = {
      languageMode: getPersistedLanguageMode(),
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      canUseWindowsSSH: false,
      useExternalCredentialHelper: this.props.useExternalCredentialHelper,
      largeRepoAutoDetect: largeRepo.autoDetect,
      largeRepoAutoRepack: largeRepo.autoRepack,
      largeRepoFileThreshold: largeRepo.thresholds.fileCount,
      browserOpenMode: getBrowserOpenModePreference(),
    }
  }

  public componentDidMount() {
    this.mounted = true
    this.checkSSHAvailability()
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    document.addEventListener(
      BrowserPreferencesChangedEvent,
      this.onBrowserPreferencesChanged
    )
  }

  public componentWillUnmount() {
    this.mounted = false
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    document.removeEventListener(
      BrowserPreferencesChangedEvent,
      this.onBrowserPreferencesChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    this.setState({
      languageMode: normalizeLanguageMode(
        (event as CustomEvent<unknown>).detail
      ),
    })
  }

  private onBrowserPreferencesChanged = () => {
    this.setState({ browserOpenMode: getBrowserOpenModePreference() })
  }

  private async checkSSHAvailability() {
    const canUseWindowsSSH = await isWindowsOpenSSHAvailable()
    if (this.mounted) {
      this.setState({ canUseWindowsSSH })
    }
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ optOutOfUsageTracking: value })
    this.props.onOptOutofReportingChanged(value)
  }

  private onUseExternalCredentialHelperChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ useExternalCredentialHelper: value })
    this.props.onUseExternalCredentialHelperChanged(value)
  }

  private onRepositoryIndicatorsEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onRepositoryIndicatorsEnabledChanged(event.currentTarget.checked)
  }

  private onAutoSwitchAccountToRepositoryOwnerChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onAutoSwitchAccountToRepositoryOwnerChanged(
      event.currentTarget.checked
    )
  }

  private onUseWindowsOpenSSHChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onUseWindowsOpenSSHChanged(event.currentTarget.checked)
  }

  private onVerboseLoggingChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onVerboseLoggingChanged(event.currentTarget.checked)
  }

  private onLargeRepoAutoDetectChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked
    this.setState({ largeRepoAutoDetect: value })
    setLargeRepositorySettings({
      ...getLargeRepositorySettings(),
      autoDetect: value,
    })
    // The auto-detect switch changes how every repository is classified, so
    // drop cached verdicts and let the next refresh re-probe.
    clearLargeRepositoryEvaluations()
  }

  private onLargeRepoAutoRepackChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked
    this.setState({ largeRepoAutoRepack: value })
    setLargeRepositorySettings({
      ...getLargeRepositorySettings(),
      autoRepack: value,
    })
  }

  private onBrowserOpenModeChanged = (mode: BrowserOpenMode) => {
    const normalized = setBrowserOpenModePreference(mode)
    this.setState({ browserOpenMode: normalized })
  }

  private reportDesktopUsageLabel() {
    return (
      <span>
        {this.localize(
          'Help GitHub Desktop improve by submitting',
          '提交資料幫 GitHub Desktop 改善'
        )}{' '}
        <LinkButton uri={SamplesURL}>
          {this.localize('usage stats', '使用統計')}
        </LinkButton>
      </span>
    )
  }

  public render() {
    return (
      <DialogContent>
        <AuthenticatorPreferences languageMode={this.state.languageMode} />
        <div
          className="advanced-section"
          {...teleportAnchor('settings-auto-switch-account')}
        >
          <h2>{this.localize('Accounts', '帳戶')}</h2>
          <Checkbox
            label={this.localize(
              "Automatically switch the active account to the selected repository's owner",
              '自動將目前帳戶切換到所選儲存庫嘅擁有人'
            )}
            value={
              this.props.autoSwitchAccountToRepositoryOwner
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onAutoSwitchAccountToRepositoryOwnerChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('advanced-auto-switch-account')
                .ariaDescribedBy
            }
          />
          {this.renderSettingExplanation({
            id: 'advanced-auto-switch-account',
            explanationEnglish:
              'When you select a repository, its owning account becomes the active identity so account indicators and actions that are not bound to a specific account follow the repository.',
            explanationCantonese:
              '揀儲存庫嗰陣，擁有嗰個儲存庫嘅帳戶會變成目前身分，令帳戶指示同未綁定特定帳戶嘅動作跟返個儲存庫。',
            currentEnglish: this.props.autoSwitchAccountToRepositoryOwner
              ? 'on'
              : 'off',
            currentCantonese: this.props.autoSwitchAccountToRepositoryOwner
              ? '開'
              : '關',
            shippedEnglish: autoSwitchAccountToRepositoryOwnerDefault
              ? 'on'
              : 'off',
            shippedCantonese: autoSwitchAccountToRepositoryOwnerDefault
              ? '開'
              : '關',
            stored: this.hasStoredChoice(autoSwitchAccountToRepositoryOwnerKey),
          })}
        </div>
        <div
          className="advanced-section"
          {...teleportAnchor('settings-repository-indicators')}
        >
          <h2>{this.localize('Background updates', '背景更新')}</h2>
          <Checkbox
            label={this.localize(
              'Show status icons in the repository list',
              '喺儲存庫清單顯示狀態圖示'
            )}
            value={
              this.props.repositoryIndicatorsEnabled
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onRepositoryIndicatorsEnabledChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('advanced-repository-indicators')
                .ariaDescribedBy
            }
          />
          {this.renderSettingExplanation({
            id: 'advanced-repository-indicators',
            explanationEnglish:
              'Shows which repositories have local or remote changes. This periodically fetches repositories that are not selected; turning it off keeps fetching the selected repository.',
            explanationCantonese:
              '顯示邊啲儲存庫有本機或者遠端變更。呢個功能會定時 fetch 未揀中嘅儲存庫；閂咗都會繼續 fetch 目前揀中嗰個。',
            currentEnglish: this.props.repositoryIndicatorsEnabled
              ? 'on'
              : 'off',
            currentCantonese: this.props.repositoryIndicatorsEnabled
              ? '開'
              : '關',
            shippedEnglish: 'on',
            shippedCantonese: '開',
            stored: this.hasStoredChoice(repositoryIndicatorsEnabledKey),
          })}
        </div>
        {ENABLE_TELEMETRY && (
          <div className="advanced-section">
            <h2>{this.localize('Usage', '使用資料')}</h2>
            <Checkbox
              label={this.reportDesktopUsageLabel()}
              value={
                this.state.optOutOfUsageTracking
                  ? CheckboxValue.Off
                  : CheckboxValue.On
              }
              onChange={this.onReportingOptOutChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('advanced-usage-reporting')
                  .ariaDescribedBy
              }
            />
            {this.renderSettingExplanation({
              id: 'advanced-usage-reporting',
              explanationEnglish:
                'Controls optional product-usage reporting. Turning it off stops new usage statistics from being submitted.',
              explanationCantonese:
                '控制可選嘅產品使用資料回報。閂咗之後唔會再提交新嘅使用統計。',
              currentEnglish: this.state.optOutOfUsageTracking ? 'off' : 'on',
              currentCantonese: this.state.optOutOfUsageTracking ? '關' : '開',
              shippedEnglish: 'on',
              shippedCantonese: '開',
              stored: this.hasStoredChoice(StatsOptOutKey),
            })}
          </div>
        )}
        <div
          className="advanced-section"
          {...teleportAnchor('settings-verbose-logging')}
        >
          <h2>{this.localize('Logging', '日誌')}</h2>
          <Checkbox
            label={this.localize(
              'Verbose logging (debug level)',
              '詳細日誌（debug 級）'
            )}
            value={
              this.props.verboseLogging ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onVerboseLoggingChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('advanced-verbose-logging')
                .ariaDescribedBy
            }
          />
          {this.renderSettingExplanation({
            id: 'advanced-verbose-logging',
            explanationEnglish:
              'Writes debug-level messages to log files and log history. Use it when collecting diagnostics for a specific issue.',
            explanationCantonese:
              '將 debug 級訊息寫入日誌檔同日誌記錄。只喺要為指定問題收集診斷資料時開啟。',
            currentEnglish: this.props.verboseLogging ? 'on' : 'off',
            currentCantonese: this.props.verboseLogging ? '開' : '關',
            shippedEnglish: 'off',
            shippedCantonese: '關',
            stored: this.hasStoredChoice(verboseLoggingKey),
          })}
        </div>
        <h2>{this.localize('Network and credentials', '網絡同憑證')}</h2>
        {this.renderSSHSettings()}
        <div
          className="advanced-section"
          {...teleportAnchor('settings-external-credential-helper')}
        >
          <Checkbox
            label={this.localize(
              'Use Git Credential Manager',
              '使用 Git Credential Manager'
            )}
            value={
              this.state.useExternalCredentialHelper
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onUseExternalCredentialHelperChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds(
                'advanced-external-credential-helper'
              ).ariaDescribedBy
            }
          />
          {this.renderSettingExplanation({
            id: 'advanced-external-credential-helper',
            explanationEnglish:
              'Uses Git Credential Manager for private repositories outside GitHub.com. The integration remains experimental.',
            explanationCantonese:
              '為 GitHub.com 以外嘅私人儲存庫使用 Git Credential Manager。呢個整合仍然係實驗性。',
            currentEnglish: this.state.useExternalCredentialHelper
              ? 'on'
              : 'off',
            currentCantonese: this.state.useExternalCredentialHelper
              ? '開'
              : '關',
            shippedEnglish: useExternalCredentialHelperDefault ? 'on' : 'off',
            shippedCantonese: useExternalCredentialHelperDefault ? '開' : '關',
            stored: this.hasStoredChoice(useExternalCredentialHelperKey),
          })}
          <p className="settings-description">
            <LinkButton uri="https://gh.io/gcm">
              {this.localize(
                'Read about Git Credential Manager',
                '了解 Git Credential Manager'
              )}
            </LinkButton>
          </p>
        </div>
        {this.renderLargeRepositorySettings()}
        {this.renderBrowserSettings()}
        {this.renderDataDisclosures()}
      </DialogContent>
    )
  }

  private renderBrowserSettings() {
    const { languageMode, browserOpenMode } = this.state
    const settingId = 'advanced-browser-open-mode'
    return (
      <div
        className="advanced-section"
        {...teleportAnchor('settings-browser-open-mode')}
      >
        <h2 id="browser-open-mode-title">
          {translate('settings.browserOpenModeTitle', languageMode)}
        </h2>
        <p className="settings-description" id="browser-open-mode-description">
          {translate('settings.browserOpenModeDescription', languageMode)}
        </p>
        <RadioGroup<BrowserOpenMode>
          ariaLabelledBy="browser-open-mode-title"
          ariaDescribedBy={
            settingExplanationDescriptionIds(settingId).ariaDescribedBy
          }
          selectedKey={browserOpenMode}
          radioButtonKeys={BrowserOpenModes}
          onSelectionChanged={this.onBrowserOpenModeChanged}
          renderRadioButtonLabelContents={mode =>
            translate(
              mode === 'internal'
                ? 'settings.browserOpenModeInternal'
                : 'settings.browserOpenModeExternal',
              languageMode
            )
          }
        />
        {this.renderSettingExplanation({
          id: settingId,
          explanationEnglish:
            'Chooses whether web links open in the built-in browser surface or in the operating system default browser.',
          explanationCantonese:
            '揀網頁連結用內置瀏覽器介面開，定係交俾作業系統預設瀏覽器。',
          currentEnglish:
            browserOpenMode === 'internal'
              ? 'built-in browser'
              : 'external browser',
          currentCantonese:
            browserOpenMode === 'internal' ? '內置瀏覽器' : '外置瀏覽器',
          shippedEnglish: 'external browser',
          shippedCantonese: '外置瀏覽器',
          stored: this.hasStoredChoice(BrowserOpenModeStorageKey),
        })}
      </div>
    )
  }

  /**
   * Self-contained "Large repository handling" controls. These persist to a
   * dedicated localStorage blob (mirroring the audio system) so the toggles
   * don't need to thread through the app-store hot path. Error-free copy is
   * localized and scales with the active language mode.
   */
  private renderLargeRepositorySettings() {
    const { languageMode, largeRepoFileThreshold } = this.state
    return (
      <div className="advanced-section">
        <h2>{translate('largeRepo.settings.title', languageMode)}</h2>
        <div {...teleportAnchor('settings-large-repo-auto-detect')}>
          <Checkbox
            label={translate('largeRepo.settings.autoDetect', languageMode)}
            value={
              this.state.largeRepoAutoDetect
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onLargeRepoAutoDetectChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds(
                'advanced-large-repository-auto-detect'
              ).ariaDescribedBy
            }
          />
          {this.renderSettingExplanation({
            id: 'advanced-large-repository-auto-detect',
            explanationEnglish: translate(
              'largeRepo.settings.autoDetectDescription',
              'english',
              { files: largeRepoFileThreshold.toLocaleString() }
            ),
            explanationCantonese: translate(
              'largeRepo.settings.autoDetectDescription',
              'cantonese',
              { files: largeRepoFileThreshold.toLocaleString() }
            ),
            currentEnglish: this.state.largeRepoAutoDetect ? 'on' : 'off',
            currentCantonese: this.state.largeRepoAutoDetect ? '開' : '關',
            shippedEnglish: DefaultLargeRepositorySettings.autoDetect
              ? 'on'
              : 'off',
            shippedCantonese: DefaultLargeRepositorySettings.autoDetect
              ? '開'
              : '關',
            stored: this.hasStoredChoice(LargeRepositorySettingsStorageKey),
          })}
        </div>
        <div {...teleportAnchor('settings-large-repo-auto-repack')}>
          <Checkbox
            label={translate('largeRepo.settings.autoRepack', languageMode)}
            value={
              this.state.largeRepoAutoRepack
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onLargeRepoAutoRepackChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds(
                'advanced-large-repository-auto-repack'
              ).ariaDescribedBy
            }
          />
          {this.renderSettingExplanation({
            id: 'advanced-large-repository-auto-repack',
            explanationEnglish: translate(
              'largeRepo.settings.autoRepackDescription',
              'english'
            ),
            explanationCantonese: translate(
              'largeRepo.settings.autoRepackDescription',
              'cantonese'
            ),
            currentEnglish: this.state.largeRepoAutoRepack ? 'on' : 'off',
            currentCantonese: this.state.largeRepoAutoRepack ? '開' : '關',
            shippedEnglish: DefaultLargeRepositorySettings.autoRepack
              ? 'on'
              : 'off',
            shippedCantonese: DefaultLargeRepositorySettings.autoRepack
              ? '開'
              : '關',
            stored: this.hasStoredChoice(LargeRepositorySettingsStorageKey),
          })}
        </div>
      </div>
    )
  }

  /**
   * Informational disclosure rows shown unconditionally, mirroring the Desktop
   * Material v2 Advanced tab. The Usage stats card always describes telemetry
   * (the functional opt-out toggle above stays behind ENABLE_TELEMETRY), and
   * the Credential storage card documents that tokens live only in the OS
   * credential store, never in repository configuration.
   */
  private renderDataDisclosures() {
    const { languageMode } = this.state
    return (
      <div className="advanced-section">
        <h2>{this.localize('Privacy and data', '私隱同資料')}</h2>
        <div className="preference-surface-stack">
          <div className="preference-disclosure-card">
            <span className="preference-disclosure-icon">
              <MaterialSymbol name="monitoring" size={21} />
            </span>
            <span className="preference-disclosure-text">
              <span className="preference-disclosure-title">
                {translate('settings.advancedUsageStatsTitle', languageMode)}
              </span>
              <span className="preference-disclosure-subtitle">
                {translate(
                  'settings.advancedUsageStatsDescription',
                  languageMode
                )}
              </span>
            </span>
          </div>
          <div className="preference-disclosure-card">
            <span className="preference-disclosure-icon">
              <MaterialSymbol name="key" size={21} />
            </span>
            <span className="preference-disclosure-text">
              <span className="preference-disclosure-title">
                {translate(
                  'settings.advancedCredentialStorageTitle',
                  languageMode
                )}
              </span>
              <span className="preference-disclosure-subtitle">
                {translate(
                  'settings.advancedCredentialStorageDescription',
                  languageMode
                )}
              </span>
            </span>
          </div>
        </div>
      </div>
    )
  }

  private renderSSHSettings() {
    if (!this.state.canUseWindowsSSH) {
      return null
    }

    return (
      <div
        className="advanced-section"
        {...teleportAnchor('settings-windows-openssh')}
      >
        <Checkbox
          label={this.localize(
            'Use system OpenSSH (recommended)',
            '使用系統 OpenSSH（建議）'
          )}
          value={
            this.props.useWindowsOpenSSH ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onUseWindowsOpenSSHChanged}
          ariaDescribedBy={
            settingExplanationDescriptionIds('advanced-windows-openssh')
              .ariaDescribedBy
          }
        />
        {this.renderSettingExplanation({
          id: 'advanced-windows-openssh',
          explanationEnglish:
            'Uses the operating system OpenSSH client for Git SSH connections when it is available.',
          explanationCantonese:
            '系統 OpenSSH client 可用時，用佢處理 Git SSH 連線。',
          currentEnglish: this.props.useWindowsOpenSSH ? 'on' : 'off',
          currentCantonese: this.props.useWindowsOpenSSH ? '開' : '關',
          shippedEnglish: 'off outside first run; on during first run',
          shippedCantonese: '首次啟動以外係關；首次啟動期間係開',
          stored: this.hasStoredChoice(UseWindowsOpenSSHKey),
          sourceWhenMissing: 'runtime-only',
          missingEnglish:
            'No choice is recorded on this computer. The current value was selected by first-run availability. Shipped fallback: off outside first run, on during first run.',
          missingCantonese:
            '呢部電腦未記錄選擇。目前值由首次啟動可用性決定。出廠後備值：首次啟動以外係關；首次啟動期間係開。',
        })}
      </div>
    )
  }
}
