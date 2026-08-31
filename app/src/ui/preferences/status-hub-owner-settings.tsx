import * as React from 'react'

import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
} from '../../lib/i18n'
import { IStatusHubOwnerConfiguration } from '../../models/status-hub'
import { teleportAnchor } from '../../lib/teleport-targets'
import {
  clearStatusHubAuthorization,
  getStatusHubConfiguration,
  getStatusHubStatus,
  setStatusHubConfiguration,
} from '../main-process-proxy'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import {
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface IStatusHubOwnerSettingsState {
  readonly endpoint: string
  readonly authorizationDraft: string
  readonly authorizationPresent: boolean
  readonly endpointStored: boolean
  readonly busy: boolean
  readonly message: string | null
  readonly error: string | null
}

function localize(english: string, cantonese: string): string {
  switch (getPersistedLanguageMode()) {
    case 'cantonese':
      return cantonese
    case 'bilingual':
      return `${english} · ${cantonese}`
    default:
      return english
  }
}

/** Owner-only endpoint and credential-vault controls for Status Hub. */
export class StatusHubOwnerSettings extends React.Component<
  Record<string, never>,
  IStatusHubOwnerSettingsState
> {
  public constructor(props: Record<string, never>) {
    super(props)
    this.state = {
      endpoint: '',
      authorizationDraft: '',
      authorizationPresent: false,
      endpointStored: false,
      busy: true,
      message: null,
      error: null,
    }
  }

  public componentDidMount(): void {
    document.addEventListener(LanguageModeChangedEvent, this.onLanguageChanged)
    void this.load()
  }

  public componentWillUnmount(): void {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageChanged
    )
  }

  public render() {
    const status = this.state.authorizationPresent
      ? localize(
          'An authorization value is stored in the operating-system credential vault.',
          '授權資料已經存喺作業系統憑證保險箱。'
        )
      : localize(
          'No authorization value is stored on this computer.',
          '呢部電腦未有儲存授權資料。'
        )

    return (
      <fieldset
        className="status-hub-owner-settings"
        {...teleportAnchor('settingsStatusHub')}
      >
        <legend>
          <h2>{localize('Status Hub', 'Status Hub')}</h2>
        </legend>
        <p className="settings-description">
          {localize(
            'Configure the owner-operated status service. The endpoint is stored in application data; authorization stays in the operating-system credential vault and is never shown again.',
            '設定由擁有人管理嘅狀態服務。Endpoint 會存喺程式資料，授權資料只留喺作業系統憑證保險箱，之後唔會再顯示。'
          )}
        </p>
        <TextBox
          label={localize('HTTPS endpoint', 'HTTPS endpoint')}
          value={this.state.endpoint}
          disabled={this.state.busy}
          ariaDescribedBy={
            settingExplanationDescriptionIds('status-hub-endpoint')
              .ariaDescribedBy
          }
          onValueChanged={endpoint => this.setState({ endpoint })}
        />
        <SettingExplanation
          settingId="status-hub-endpoint"
          summary={localize('What this setting changes', '呢個設定會改咩')}
          explanation={localize(
            'Selects the owner-operated Status Hub endpoint. Use HTTPS; an explicit 127.0.0.1 address is accepted for local development.',
            '揀由擁有人管理嘅 Status Hub endpoint。請用 HTTPS；本機開發可以用明確嘅 127.0.0.1 地址。'
          )}
          source={
            this.state.endpointStored ? 'stored-choice' : 'compiled-default'
          }
          provenance={localize(
            this.state.endpointStored
              ? `A choice is stored in application data. Current value: ${this.state.endpoint}. Shipped value: not configured.`
              : 'No choice is stored in application data. Current and shipped value: not configured.',
            this.state.endpointStored
              ? `程式資料記錄咗選擇。目前值：${this.state.endpoint}。出廠值：未設定。`
              : '程式資料未記錄選擇。目前值同出廠值：未設定。'
          )}
        />
        <TextBox
          type="password"
          label={localize('Replace authorization', '更換授權資料')}
          value={this.state.authorizationDraft}
          disabled={this.state.busy}
          ariaDescribedBy={
            settingExplanationDescriptionIds(
              'status-hub-authorization-replacement'
            ).ariaDescribedBy
          }
          onValueChanged={authorizationDraft =>
            this.setState({ authorizationDraft })
          }
        />
        <SettingExplanation
          settingId="status-hub-authorization-replacement"
          summary={localize('What this setting changes', '呢個設定會改咩')}
          explanation={localize(
            'Replaces the write-only authorization value in the operating-system credential vault. Leaving this field empty keeps the stored value unchanged.',
            '更換作業系統憑證保險箱入面只寫不讀嘅授權資料。欄位留空會保留現有資料。'
          )}
          source={
            this.state.authorizationPresent
              ? 'credential-vault'
              : 'compiled-default'
          }
          provenance={localize(
            this.state.authorizationPresent
              ? 'A value is stored in the operating-system credential vault. The value is never read back into this field. Shipped value: none.'
              : 'No value is stored in the operating-system credential vault. Current and shipped value: none.',
            this.state.authorizationPresent
              ? '作業系統憑證保險箱已經有儲存值；個值永遠唔會讀返入呢個欄位。出廠值：冇。'
              : '作業系統憑證保險箱未有儲存值。目前值同出廠值：冇。'
          )}
        />
        <p className="settings-description" role="status" aria-live="polite">
          {status}
          {this.state.busy && <> {localize('Working…', '處理中…')}</>}
          {!this.state.busy && this.state.message && <> {this.state.message}</>}
        </p>
        {this.state.error !== null && (
          <p className="settings-error" role="alert">
            {this.state.error}
          </p>
        )}
        <div className="status-hub-owner-actions">
          <Button type="button" disabled={this.state.busy} onClick={this.save}>
            {localize('Save Status Hub settings', '儲存 Status Hub 設定')}
          </Button>
          <Button type="button" disabled={this.state.busy} onClick={this.test}>
            {localize('Check connection', '檢查連線')}
          </Button>
          <Button
            type="button"
            disabled={this.state.busy || !this.state.authorizationPresent}
            onClick={this.clearAuthorization}
          >
            {localize('Clear stored authorization', '清除已儲存授權資料')}
          </Button>
        </div>
      </fieldset>
    )
  }

  private load = async () => {
    try {
      this.applyConfiguration(await getStatusHubConfiguration())
    } catch (error) {
      this.setState({
        busy: false,
        error: failureMessage(error),
      })
    }
  }

  private applyConfiguration(configuration: IStatusHubOwnerConfiguration) {
    this.setState({
      endpoint: configuration.endpoint ?? '',
      authorizationDraft: '',
      authorizationPresent: configuration.authorizationPresent,
      endpointStored: configuration.endpoint !== null,
      busy: false,
      error: null,
    })
  }

  private save = async () => {
    this.setState({ busy: true, error: null, message: null })
    try {
      const draft = this.state.authorizationDraft.trim()
      const configuration = await setStatusHubConfiguration({
        endpoint: this.state.endpoint,
        authorization: draft.length === 0 ? undefined : draft,
      })
      this.applyConfiguration(configuration)
      this.setState({
        message: localize(
          'Status Hub settings saved.',
          'Status Hub 設定已儲存。'
        ),
      })
    } catch (error) {
      this.setState({ busy: false, error: failureMessage(error) })
    }
  }

  private test = async () => {
    this.setState({ busy: true, error: null, message: null })
    try {
      const status = await getStatusHubStatus()
      this.setState({
        busy: false,
        message: status.message,
      })
    } catch (error) {
      this.setState({ busy: false, error: failureMessage(error) })
    }
  }

  private clearAuthorization = async () => {
    this.setState({ busy: true, error: null, message: null })
    try {
      this.applyConfiguration(await clearStatusHubAuthorization())
      this.setState({
        message: localize(
          'Stored Status Hub authorization cleared.',
          '已清除 Status Hub 授權資料。'
        ),
      })
    } catch (error) {
      this.setState({ busy: false, error: failureMessage(error) })
    }
  }

  private onLanguageChanged = () => this.forceUpdate()
}

function failureMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : localize(
        'Status Hub settings could not be updated.',
        'Status Hub 設定更新唔到。'
      )
}
