import * as React from 'react'
import { LanguageMode } from '../../models/language-mode'
import {
  hasSchoolModeCredential,
  DefaultSchoolModeName,
  isValidSchoolModeCredential,
  readSchoolMode,
  setSchoolModeCredential,
  verifySchoolModeCredential,
  writeSchoolMode,
  ISchoolModeState as SchoolModeState,
  SchoolModeChangedEvent,
  SchoolModeStorageKey,
} from '../../lib/school-mode'
import { translate } from '../../lib/i18n'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { PasswordTextBox } from '../lib/password-text-box'
import { TextBox } from '../lib/text-box'
import { teleportAnchor } from '../../lib/teleport-targets'
import { Md3SupportTicketEntry } from '../md3/md3-support-ticket-entry'
import { readSupportTickets } from '../../lib/support-tickets'
import {
  readFunnyLevels,
  translateWithFunnyLevel,
} from '../../lib/funny-level-text'
import type { TranslationVariables } from '../../lib/i18n'
import {
  BooleanSettingExplanation,
  SelectionSettingExplanation,
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface ISchoolModeProps {
  readonly languageMode: LanguageMode
}

interface ISchoolModePreferencesState {
  readonly schoolMode: SchoolModeState
  readonly name: string
  readonly setupCredential: string
  readonly setupConfirmation: string
  readonly unlockCredential: string
  readonly requestedEnable: boolean
  readonly requestedDisable: boolean
  readonly busy: boolean
  readonly error: string | null
}

export class SchoolModePreferences extends React.Component<
  ISchoolModeProps,
  ISchoolModePreferencesState
> {
  public constructor(props: ISchoolModeProps) {
    super(props)
    const schoolMode = readSchoolMode()
    this.state = {
      schoolMode,
      name: schoolMode.name,
      setupCredential: '',
      setupConfirmation: '',
      unlockCredential: '',
      requestedEnable: false,
      requestedDisable: false,
      busy: false,
      error: null,
    }
  }

  public componentDidMount() {
    window.addEventListener(SchoolModeChangedEvent, this.onSchoolModeChanged)
  }

  public componentWillUnmount() {
    window.removeEventListener(SchoolModeChangedEvent, this.onSchoolModeChanged)
  }

  private onSchoolModeChanged = () => {
    const schoolMode = readSchoolMode()
    this.setState({
      schoolMode,
      name: schoolMode.name,
      requestedEnable: false,
      requestedDisable: false,
    })
  }

  private localize = (
    key: Parameters<typeof translate>[0],
    variables: TranslationVariables = {}
  ) => translate(key, this.props.languageMode, variables)

  private localizeText(english: string, cantonese: string): string {
    switch (this.props.languageMode) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  private onToggle = (event: React.FormEvent<HTMLInputElement>) => {
    const checked = event.currentTarget.checked
    this.setState({
      requestedEnable: checked && !this.state.schoolMode.enabled,
      requestedDisable: !checked && this.state.schoolMode.enabled,
      error: null,
    })
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private onNameBlur = () => {
    const schoolMode = writeSchoolMode({
      ...this.state.schoolMode,
      name: this.state.name,
    })
    this.setState({ schoolMode, name: schoolMode.name })
  }

  private onSetupCredentialChanged = (setupCredential: string) => {
    this.setState({ setupCredential, error: null })
  }

  private onSetupConfirmationChanged = (setupConfirmation: string) => {
    this.setState({ setupConfirmation, error: null })
  }

  private onUnlockCredentialChanged = (unlockCredential: string) => {
    this.setState({ unlockCredential, error: null })
  }

  private onEnable = async () => {
    const { name, setupCredential, setupConfirmation } = this.state
    if (!isValidSchoolModeCredential(setupCredential)) {
      this.setState({
        error: this.localize('appearance.schoolModeCredentialInvalid'),
      })
      return
    }
    if (setupCredential !== setupConfirmation) {
      this.setState({
        error: this.localize('appearance.schoolModeCredentialMismatch'),
      })
      return
    }

    this.setState({ busy: true, error: null })
    try {
      await setSchoolModeCredential(setupCredential)
      const schoolMode = writeSchoolMode({ enabled: true, name })
      this.setState({
        schoolMode,
        name: schoolMode.name,
        setupCredential: '',
        setupConfirmation: '',
        requestedEnable: false,
        busy: false,
      })
    } catch {
      this.setState({
        busy: false,
        error: this.localize('appearance.schoolModeCredentialError'),
      })
    }
  }

  private onDisable = async () => {
    this.setState({ busy: true, error: null })
    try {
      const valid = await verifySchoolModeCredential(
        this.state.unlockCredential
      )
      if (!valid) {
        this.setState({
          busy: false,
          error: this.localize('appearance.schoolModeCredentialError'),
        })
        return
      }
      const schoolMode = writeSchoolMode({
        enabled: false,
        name: this.state.name,
      })
      this.setState({
        schoolMode,
        name: schoolMode.name,
        unlockCredential: '',
        requestedDisable: false,
        busy: false,
      })
    } catch {
      this.setState({
        busy: false,
        error: this.localize('appearance.schoolModeCredentialError'),
      })
    }
  }

  /**
   * What is actually on this computer, rather than the word "default".
   *
   * The desk has no shipped value to fall back to, so the honest provenance
   * line is the ticket count itself — and it is read on every render because
   * a ticket filed from the desk a moment ago must not leave this line stale.
   */
  private renderTicketProvenance(): string {
    const count = readSupportTickets().length
    if (count === 0) {
      return this.localize('supportTicketsSetting.provenanceNone')
    }
    if (count === 1) {
      return this.localize('supportTicketsSetting.provenanceOne')
    }
    return this.localize('supportTicketsSetting.provenanceMany', {
      count: String(count),
    })
  }

  private renderSetup() {
    if (!this.state.requestedEnable || this.state.schoolMode.enabled) {
      return null
    }
    const nameVariables = { name: this.state.schoolMode.name }
    return (
      <div className="school-mode-credential-form">
        <PasswordTextBox
          label={this.localize('appearance.schoolModeCredential')}
          value={this.state.setupCredential}
          onValueChanged={this.onSetupCredentialChanged}
          ariaDescribedBy={`school-mode-credential-description ${
            settingExplanationDescriptionIds('school-mode-setup-credential')
              .ariaDescribedBy
          }`}
        />
        <SettingExplanation
          settingId="school-mode-setup-credential"
          summary={this.localize('dialogEmoji.explanationSummary')}
          explanation={this.localizeText(
            'Supplies the new local unlock credential while enabling this presentation lock.',
            '開啟呢個呈現鎖時提供新本地解鎖憑證。'
          )}
          provenance={this.localizeText(
            'Source: runtime-only setup input. Current and shipped credential values and characteristics are intentionally unavailable.',
            '來源：只限執行期嘅設定輸入。目前同出廠憑證內容及特徵刻意不可用。'
          )}
          source="runtime-only"
        />
        <PasswordTextBox
          label={this.localize('appearance.schoolModeCredentialConfirm')}
          value={this.state.setupConfirmation}
          onValueChanged={this.onSetupConfirmationChanged}
          ariaDescribedBy={`school-mode-credential-description ${
            settingExplanationDescriptionIds('school-mode-setup-confirmation')
              .ariaDescribedBy
          }`}
        />
        <SettingExplanation
          settingId="school-mode-setup-confirmation"
          summary={this.localize('dialogEmoji.explanationSummary')}
          explanation={this.localizeText(
            'Confirms the new local unlock credential before the presentation lock is enabled.',
            '呈現鎖開啟之前確認新本地解鎖憑證。'
          )}
          provenance={this.localizeText(
            'Source: runtime-only confirmation input. Current and shipped credential values and characteristics are intentionally unavailable.',
            '來源：只限執行期嘅確認輸入。目前同出廠憑證內容及特徵刻意不可用。'
          )}
          source="runtime-only"
        />
        <Button disabled={this.state.busy} onClick={this.onEnable}>
          {this.localize('appearance.schoolModeEnable', nameVariables)}
        </Button>
      </div>
    )
  }

  private renderDisable() {
    if (!this.state.schoolMode.enabled && !this.state.requestedDisable) {
      return null
    }
    const nameVariables = { name: this.state.schoolMode.name }
    return (
      <div className="school-mode-credential-form">
        <PasswordTextBox
          label={this.localize('appearance.schoolModeCredential')}
          value={this.state.unlockCredential}
          onValueChanged={this.onUnlockCredentialChanged}
          ariaDescribedBy={`school-mode-unlock-description ${
            settingExplanationDescriptionIds('school-mode-unlock-credential')
              .ariaDescribedBy
          }`}
        />
        <SettingExplanation
          settingId="school-mode-unlock-credential"
          summary={this.localize('dialogEmoji.explanationSummary')}
          explanation={this.localizeText(
            'Verifies the local unlock credential before turning the presentation lock off.',
            '關閉呈現鎖之前驗證本地解鎖憑證。'
          )}
          provenance={this.localizeText(
            'Source: operating-system credential vault plus runtime-only input. Current and shipped credential values and characteristics are intentionally unavailable.',
            '來源：作業系統憑證庫加只限執行期輸入。目前同出廠憑證內容及特徵刻意不可用。'
          )}
          source="credential-vault"
        />
        <Button disabled={this.state.busy} onClick={this.onDisable}>
          {this.localize('appearance.schoolModeDisable', nameVariables)}
        </Button>
        {/*
          The unlock prompt's own route to the recovery desk. Somebody who
          cannot remember this credential is looking at this field, so this is
          where "Forgotten your password?" belongs — not in a menu elsewhere.
        */}
        <Md3SupportTicketEntry entryPoint="unlockPrompt" />
      </div>
    )
  }

  public render() {
    const { schoolMode } = this.state
    const enabled = schoolMode.enabled || this.state.requestedEnable
    const credentialReady = hasSchoolModeCredential()
    const name = schoolMode.name
    const nameVariables = { name }

    return (
      <section
        className="appearance-section school-mode-section"
        {...teleportAnchor('settings-school-mode')}
        aria-labelledby="school-mode-heading"
      >
        <h2 id="school-mode-heading">
          {this.localize('appearance.schoolModeHeading', nameVariables)}
        </h2>
        <p id="school-mode-description" className="settings-description">
          {this.localize('appearance.schoolModeDescription', nameVariables)}
        </p>
        <TextBox
          label={this.localize('appearance.schoolModeName', nameVariables)}
          value={this.state.name}
          onValueChanged={this.onNameChanged}
          onBlur={this.onNameBlur}
          ariaDescribedBy={`school-mode-name-description ${
            settingExplanationDescriptionIds('school-mode-name').ariaDescribedBy
          }`}
        />
        <p id="school-mode-name-description" className="settings-description">
          {this.localize('appearance.schoolModeNameDescription', nameVariables)}
        </p>
        <SelectionSettingExplanation
          settingId="school-mode-name"
          explanationEnglish="Sets the user-visible name used for this shared presentation lock across every surface. Stable application identity is unchanged."
          explanationCantonese="設定呢個共用呈現鎖喺所有畫面使用嘅用戶可見名稱；穩定應用程式身份唔會改。"
          currentEnglish={this.state.name}
          currentCantonese={this.state.name}
          shippedEnglish={DefaultSchoolModeName}
          shippedCantonese={DefaultSchoolModeName}
          storageKey={SchoolModeStorageKey}
        />
        <Checkbox
          label={this.localize('appearance.schoolModeEnabled', nameVariables)}
          value={enabled ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onToggle}
          ariaDescribedBy={`school-mode-description ${
            settingExplanationDescriptionIds('school-mode-enabled')
              .ariaDescribedBy
          }`}
        />
        <BooleanSettingExplanation
          settingId="school-mode-enabled"
          explanationEnglish="Controls whether the shared presentation lock forces English and suppresses Cantonese, bilingual, playfulness, personal-vocabulary, and dim-sum features."
          explanationCantonese="控制共用呈現鎖係咪強制英文，並抑制廣東話、雙語、搞笑程度、個人詞彙同點心功能。"
          value={schoolMode.enabled}
          shippedValue={false}
          storageKey={SchoolModeStorageKey}
        />
        {this.renderSetup()}
        {schoolMode.enabled && credentialReady ? (
          <>
            <p
              id="school-mode-unlock-description"
              className="settings-description"
            >
              {this.localize('appearance.schoolModeUnlockDescription', {
                name,
              })}
            </p>
            {this.renderDisable()}
          </>
        ) : null}
        {this.state.error !== null ? (
          <p className="settings-error" role="alert">
            {this.state.error}
          </p>
        ) : null}
        <p className="settings-description">
          {this.localize(
            'appearance.schoolModeResetDescription',
            nameVariables
          )}
        </p>
        {/*
          The lock setting's own route to the recovery desk, available whether
          or not the lock is currently on — the setting is where a user looks
          for what to do when they can no longer get past it.

          It carries the teleport anchor because it is the desk's home: the
          command palette's "Open Support Tickets" row and the settings search
          both land on this link rather than on the top of the tab.
        */}
        <div
          className="support-tickets-setting"
          {...teleportAnchor('settings-support-tickets')}
        >
          <Md3SupportTicketEntry entryPoint="lockSetting" />
          <details className="support-tickets-setting-explanation">
            <summary>
              {this.localize('supportTicketsSetting.explanationSummary')}
            </summary>
            <p className="settings-description">
              {translateWithFunnyLevel(
                'supportTicketsSetting.explanation',
                this.props.languageMode,
                readFunnyLevels()
              )}
            </p>
            <p className="settings-description">
              {this.localize('supportTicketsSetting.boundaryNote')}
            </p>
          </details>
          <p className="settings-description support-tickets-setting-provenance">
            {this.renderTicketProvenance()}
          </p>
        </div>
      </section>
    )
  }
}
