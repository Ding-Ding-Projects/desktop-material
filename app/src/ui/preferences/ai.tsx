/* eslint-disable react/jsx-no-bind -- one toggle handler per provider row */
import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { RadioGroup } from '../lib/radio-group'
import { Row } from '../lib/row'
import {
  IAIAdminPolicySettings,
  AIAdminPolicySettingsStorageKey,
  DefaultAIAdminPolicySettings,
  getAIAdminPolicySettings,
  setAIAdminPolicySettings,
} from '../../lib/ai-admin-policy'
import { AIProviderKind } from '../../lib/ai-security-policy'
import { teleportAnchor } from '../../lib/teleport-targets'
import { getPersistedLanguageMode } from '../../lib/i18n'
import {
  BooleanSettingExplanation,
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface IAIPreferencesState {
  readonly settings: IAIAdminPolicySettings
}

const providerLabels: Readonly<
  Record<
    AIProviderKind,
    { readonly english: string; readonly cantonese: string }
  >
> = {
  'github-copilot': {
    english: 'GitHub Copilot',
    cantonese: 'GitHub Copilot',
  },
  byok: {
    english: 'Custom / bring-your-own-key providers',
    cantonese: '自訂／自備金鑰供應商',
  },
}

const eligibilityOptions: ReadonlyArray<{
  readonly key: 'allow' | 'deny'
  readonly label: string
}> = [
  { key: 'allow', label: 'Allowed unless a repository is denied below' },
  { key: 'deny', label: 'Denied unless a repository is allowed below' },
]

/**
 * Administrator controls for whether AI features may run at all, which
 * repositories are AI-eligible by default, and which AI provider is
 * permitted.
 *
 * This is the single settings surface AI features present to an
 * administrator; the actual enforcement lives in
 * `evaluateAIAdminGate`/`issueAISecurityPolicyAuthorization`
 * (`lib/ai-security-policy.ts`), which every AI feature must call before
 * sending anything to a model. Per-repository overrides live in Repository
 * settings → AI features, mirroring the existing per-repository settings
 * pattern (see `automation-overrides.tsx`).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IAIPreferencesProps {}

export class AIPreferences extends React.Component<
  IAIPreferencesProps,
  IAIPreferencesState
> {
  private localize(english: string, cantonese: string): string {
    switch (getPersistedLanguageMode()) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  private hasStoredPolicy(): boolean {
    try {
      return localStorage.getItem(AIAdminPolicySettingsStorageKey) !== null
    } catch {
      return false
    }
  }
  public constructor(props: IAIPreferencesProps) {
    super(props)
    this.state = { settings: getAIAdminPolicySettings() }
  }

  private update = (change: Partial<IAIAdminPolicySettings>) => {
    const settings = { ...this.state.settings, ...change }
    setAIAdminPolicySettings(settings)
    this.setState({ settings })
  }

  private onMasterSwitchChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.update({ aiFeaturesEnabled: event.currentTarget.checked })
  }

  private onProviderToggled =
    (provider: AIProviderKind) =>
    (event: React.FormEvent<HTMLInputElement>) => {
      const { allowedProviderKinds } = this.state.settings
      const allowedProviderKindsNext = event.currentTarget.checked
        ? [...allowedProviderKinds, provider]
        : allowedProviderKinds.filter(kind => kind !== provider)
      this.update({ allowedProviderKinds: allowedProviderKindsNext })
    }

  private onDefaultEligibilityChanged = (key: 'allow' | 'deny') => {
    this.update({ defaultRepositoryEligibility: key })
  }

  public render() {
    const { settings } = this.state
    const masterId = 'ai-master-switch'
    const eligibilityId = 'ai-default-repository-eligibility'

    return (
      <DialogContent className="ai-preferences-tab">
        <Row>
          <p>
            Controls what commit message generation, conflict resolution, and
            other AI features may send off this machine. Every AI feature checks
            these settings — and any per-repository override in Repository
            settings → AI features — before sending a diff, file content, or
            path to a model.
          </p>
        </Row>
        <div {...teleportAnchor('settings-ai-master-switch')}>
          <Checkbox
            label={this.localize(
              __DARWIN__
                ? 'Allow AI Features to Send Diffs and File Contents'
                : 'Allow AI features to send diffs and file contents',
              '允許 AI 功能傳送 diff 同檔案內容'
            )}
            value={
              settings.aiFeaturesEnabled ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onMasterSwitchChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds(masterId).ariaDescribedBy
            }
          />
          <BooleanSettingExplanation
            settingId={masterId}
            explanationEnglish="The master boundary. Turning it off prevents every AI feature from sending diffs, file contents, or paths to any provider, regardless of other settings."
            explanationCantonese="總開關。閂咗之後，無論其他設定係乜，所有 AI 功能都唔可以向任何供應商傳送 diff、檔案內容或者路徑。"
            value={settings.aiFeaturesEnabled}
            shippedValue={DefaultAIAdminPolicySettings.aiFeaturesEnabled}
            storageKey={AIAdminPolicySettingsStorageKey}
          />
        </div>

        <h2>{this.localize('Permitted AI providers', '獲准 AI 供應商')}</h2>
        <p className="settings-description">
          Only a provider checked here may receive a request. Unchecking a
          provider does not remove it from Preferences → Copilot — it only
          blocks it from being used until an administrator re-enables it here.
        </p>
        {(Object.keys(providerLabels) as ReadonlyArray<AIProviderKind>).map(
          provider => (
            <div key={provider}>
              <Checkbox
                label={this.localize(
                  providerLabels[provider].english,
                  providerLabels[provider].cantonese
                )}
                value={
                  settings.allowedProviderKinds.includes(provider)
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                onChange={this.onProviderToggled(provider)}
                ariaDescribedBy={
                  settingExplanationDescriptionIds(`ai-provider-${provider}`)
                    .ariaDescribedBy
                }
              />
              <BooleanSettingExplanation
                settingId={`ai-provider-${provider}`}
                explanationEnglish={`Allows ${providerLabels[provider].english} to receive AI requests only while the master boundary and repository eligibility also allow them.`}
                explanationCantonese={`只有總開關同儲存庫資格都允許時，先准 ${providerLabels[provider].cantonese} 接收 AI 請求。`}
                value={settings.allowedProviderKinds.includes(provider)}
                shippedValue={DefaultAIAdminPolicySettings.allowedProviderKinds.includes(
                  provider
                )}
                storageKey={AIAdminPolicySettingsStorageKey}
              />
            </div>
          )
        )}

        <h2 id="ai-repository-eligibility-title">
          {this.localize('Repository eligibility', '儲存庫資格')}
        </h2>
        <p className="settings-description">
          The default applied to a repository with no explicit override. Set an
          override for an individual repository from that repository's own
          settings.
        </p>
        <RadioGroup<'allow' | 'deny'>
          ariaLabelledBy="ai-repository-eligibility-title"
          ariaDescribedBy={
            settingExplanationDescriptionIds(eligibilityId).ariaDescribedBy
          }
          selectedKey={settings.defaultRepositoryEligibility}
          radioButtonKeys={eligibilityOptions.map(o => o.key)}
          onSelectionChanged={this.onDefaultEligibilityChanged}
          renderRadioButtonLabelContents={key =>
            key === 'allow'
              ? this.localize(
                  'Allowed unless a repository is denied below',
                  '除非下面拒絕某個儲存庫，否則允許'
                )
              : this.localize(
                  'Denied unless a repository is allowed below',
                  '除非下面允許某個儲存庫，否則拒絕'
                )
          }
        />
        <SettingExplanation
          settingId={eligibilityId}
          summary={this.localize('What this setting changes', '呢個設定會改咩')}
          explanation={this.localize(
            'Sets the default AI eligibility for repositories that have no explicit per-repository override.',
            '為冇逐儲存庫覆寫嘅儲存庫設定預設 AI 資格。'
          )}
          source={this.hasStoredPolicy() ? 'stored-choice' : 'compiled-default'}
          provenance={this.localize(
            this.hasStoredPolicy()
              ? `A choice is recorded on this computer. Current value: ${settings.defaultRepositoryEligibility}. Shipped value: ${DefaultAIAdminPolicySettings.defaultRepositoryEligibility}.`
              : `No choice is recorded on this computer. Current and shipped value: ${DefaultAIAdminPolicySettings.defaultRepositoryEligibility}.`,
            this.hasStoredPolicy()
              ? `呢部電腦記錄咗選擇。目前值：${
                  settings.defaultRepositoryEligibility === 'allow'
                    ? '允許'
                    : '拒絕'
                }。出廠值：允許。`
              : '呢部電腦未記錄選擇。目前值同出廠值：允許。'
          )}
        />
      </DialogContent>
    )
  }
}
