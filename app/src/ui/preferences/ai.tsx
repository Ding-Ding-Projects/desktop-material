/* eslint-disable react/jsx-no-bind -- one toggle handler per provider row */
import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { RadioGroup } from '../lib/radio-group'
import { Row } from '../lib/row'
import {
  IAIAdminPolicySettings,
  getAIAdminPolicySettings,
  setAIAdminPolicySettings,
} from '../../lib/ai-admin-policy'
import { AIProviderKind } from '../../lib/ai-security-policy'
import { teleportAnchor } from '../../lib/teleport-targets'

interface IAIPreferencesState {
  readonly settings: IAIAdminPolicySettings
}

const providerLabels: Readonly<Record<AIProviderKind, string>> = {
  'github-copilot': 'GitHub Copilot',
  byok: 'Custom / bring-your-own-key providers',
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
            label={
              __DARWIN__
                ? 'Allow AI Features to Send Diffs and File Contents'
                : 'Allow AI features to send diffs and file contents'
            }
            value={
              settings.aiFeaturesEnabled ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onMasterSwitchChanged}
          />
        </div>
        <p className="settings-description">
          The master switch. When off, no AI feature may send a diff, file
          content, or path to any provider, regardless of any other setting here
          or in a repository's own settings.
        </p>

        <h2>Permitted AI providers</h2>
        <p className="settings-description">
          Only a provider checked here may receive a request. Unchecking a
          provider does not remove it from Preferences → Copilot — it only
          blocks it from being used until an administrator re-enables it here.
        </p>
        {(Object.keys(providerLabels) as ReadonlyArray<AIProviderKind>).map(
          provider => (
            <Checkbox
              key={provider}
              label={providerLabels[provider]}
              value={
                settings.allowedProviderKinds.includes(provider)
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onProviderToggled(provider)}
            />
          )
        )}

        <h2>Repository eligibility</h2>
        <p className="settings-description">
          The default applied to a repository with no explicit override. Set an
          override for an individual repository from that repository's own
          settings.
        </p>
        <RadioGroup<'allow' | 'deny'>
          selectedKey={settings.defaultRepositoryEligibility}
          radioButtonKeys={eligibilityOptions.map(o => o.key)}
          onSelectionChanged={this.onDefaultEligibilityChanged}
          renderRadioButtonLabelContents={key =>
            eligibilityOptions.find(o => o.key === key)?.label ?? key
          }
        />
      </DialogContent>
    )
  }
}
