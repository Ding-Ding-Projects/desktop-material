import * as React from 'react'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { TextArea } from '../lib/text-area'
import { Dispatcher } from '../dispatcher'
import { SignInResult } from '../../lib/stores/sign-in-store'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { ISelfHostedServerProvisioningProgress } from '../../lib/self-hosted-server/provisioning'
import { CopyButton } from '../copy-button'
import {
  ISelfHostedServerWizardState,
  SelfHostedServerProvisioningPhaseLabel,
  SelfHostedServerProvisioningPhaseOrder,
  SelfHostedServerWizardAction,
  initialSelfHostedServerWizardState,
  reduceSelfHostedServerWizardState,
  wizardStepState,
} from './self-hosted-server-wizard-state'
import { getPersistedLanguageMode } from '../../lib/i18n'
import {
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface ISelfHostedServerPreferencesState
  extends ISelfHostedServerWizardState {
  readonly samlMetadataXml: string
  readonly signedInAs: string | null
}

interface ISelfHostedServerPreferencesProps {
  readonly dispatcher: Dispatcher
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * The guided install wizard for R1: detects or installs Docker, generates
 * server config and key material, starts the container, verifies it is
 * reachable, and hands back a join URL. Every step is recoverable; running it
 * again after a failure is always safe.
 */
export class SelfHostedServerPreferences extends React.Component<
  ISelfHostedServerPreferencesProps,
  ISelfHostedServerPreferencesState
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

  private enteredState(value: string): {
    readonly english: string
    readonly cantonese: string
  } {
    return value.trim().length === 0
      ? { english: 'empty', cantonese: '空白' }
      : { english: 'entered', cantonese: '已輸入' }
  }

  public constructor(props: ISelfHostedServerPreferencesProps) {
    super(props)
    this.state = {
      ...initialSelfHostedServerWizardState(),
      samlMetadataXml: '',
      signedInAs: null,
    }
  }

  private reduceWizardState = (
    state: ISelfHostedServerPreferencesState,
    action: SelfHostedServerWizardAction
  ): ISelfHostedServerPreferencesState => ({
    ...reduceSelfHostedServerWizardState(state, action),
    samlMetadataXml: state.samlMetadataXml,
    signedInAs: state.signedInAs,
  })

  public componentDidMount() {
    ipcRenderer.on('self-hosted-server-provisioning-progress', this.onProgress)
    this.refreshStatus()
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener(
      'self-hosted-server-provisioning-progress',
      this.onProgress
    )
  }

  private onProgress = (
    _event: Electron.IpcRendererEvent,
    progress: ISelfHostedServerProvisioningProgress
  ) => {
    this.setState(state =>
      this.reduceWizardState(state, { type: 'progress', progress })
    )
  }

  private refreshStatus = () => {
    ipcRenderer
      .invoke('get-self-hosted-server-status')
      .then(status =>
        this.setState(state =>
          this.reduceWizardState(state, {
            type: 'status-loaded',
            status,
          })
        )
      )
      .catch(() => {
        // The wizard still renders; the status card shows nothing configured.
      })
  }

  private onPublicOriginChanged = (value: string) => {
    this.setState(state =>
      this.reduceWizardState(state, {
        type: 'origin-changed',
        value,
      })
    )
  }

  private onRunWizard = () => {
    if (this.state.running) {
      return
    }
    const origin = this.state.publicOriginInput
    this.setState(state =>
      this.reduceWizardState(state, { type: 'run-started' })
    )
    ipcRenderer
      .invoke('provision-self-hosted-server', {
        publicOrigin: origin,
        installDockerIfMissing: true,
        ...(this.state.samlMetadataXml.trim().length === 0
          ? {}
          : { samlMetadataXml: this.state.samlMetadataXml }),
      })
      .then(reply => {
        if (reply.ok) {
          this.setState(state =>
            this.reduceWizardState(state, {
              type: 'completed',
              result: reply.result,
            })
          )
        } else {
          this.setState(state =>
            this.reduceWizardState(state, {
              type: 'failed',
              failure: reply,
            })
          )
        }
        this.refreshStatus()
      })
      .catch(error => {
        this.setState(state =>
          this.reduceWizardState(state, {
            type: 'failed',
            failure: {
              code: 'unknown',
              recovery: errorMessage(error, 'Run the wizard again.'),
            },
          })
        )
      })
  }

  private onSamlMetadataChanged = (value: string) => {
    this.setState({ samlMetadataXml: value })
  }

  private onSelfHostedSignIn = () => {
    const origin = this.state.status?.publicOrigin
    if (origin === null || origin === undefined) {
      return
    }
    this.props.dispatcher.beginSelfHostedSignIn(
      origin,
      (result: SignInResult) => {
        if (result.kind === 'success') {
          this.setState({ signedInAs: result.account.friendlyName })
        }
      }
    )
  }

  private onCancel = () => {
    this.setState(state =>
      this.reduceWizardState(state, { type: 'cancel-requested' })
    )
    ipcRenderer.invoke('cancel-self-hosted-server-provisioning').catch(() => {
      // Cancellation is best-effort; the in-flight step will still surface
      // its own recoverable error.
    })
  }

  private renderSteps() {
    const { progress, running } = this.state
    return (
      <ol className="self-hosted-server-wizard-steps">
        {SelfHostedServerProvisioningPhaseOrder.map(phase => {
          const state = wizardStepState(phase, progress, running)
          return (
            <li key={phase} className={`wizard-step wizard-step-${state}`}>
              <Octicon
                symbol={
                  state === 'done'
                    ? octicons.check
                    : state === 'active'
                    ? octicons.sync
                    : octicons.circle
                }
              />
              <span>{SelfHostedServerProvisioningPhaseLabel[phase]}</span>
            </li>
          )
        })}
      </ol>
    )
  }

  public render() {
    const { status, error, joinUrl, running, progress } = this.state

    return (
      <DialogContent>
        <p>
          Runs entirely on your own machine, in a Docker container you host. No
          vendor backend. The wizard detects or installs Docker, generates the
          server's key material locally, starts the container, checks that it
          answers a real health request, and hands back a join link.
        </p>

        {status !== null && !status.supported && (
          <p className="self-hosted-server-unsupported">
            This wizard is available on Windows. Without a configured server,
            every feature that needs two machines to meet stays off and the app
            keeps working normally as a single-player app.
          </p>
        )}

        {status !== null && status.supported && (
          <>
            <div className="self-hosted-server-status">
              {status.configured ? (
                <span>
                  Configured server: <code>{status.publicOrigin}</code>
                </span>
              ) : (
                <span>No self-hosted server is configured yet.</span>
              )}
            </div>

            <TextBox
              label={this.localize(
                'Public HTTPS address (or https://localhost:PORT for local-only)',
                '公開 HTTPS 地址（或者本機專用 https://localhost:PORT）'
              )}
              value={this.state.publicOriginInput}
              disabled={running}
              onValueChanged={this.onPublicOriginChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds(
                  'self-hosted-server-public-origin'
                ).ariaDescribedBy
              }
            />
            <SettingExplanation
              settingId="self-hosted-server-public-origin"
              summary={this.localize(
                'What this setting changes',
                '呢個設定會改咩'
              )}
              explanation={this.localize(
                'Chooses the HTTPS origin used by the managed server, its health check, sign-in, and one-time join links.',
                '揀受管理伺服器、健康檢查、登入同一次性 join link 使用嘅 HTTPS origin。'
              )}
              source={
                status.configured ? 'main-process-config' : 'runtime-only'
              }
              provenance={this.localize(
                status.configured
                  ? `The current value comes from the managed main-process configuration: ${this.state.publicOriginInput}. Shipped value: https://localhost:8787.`
                  : `This value is the current wizard draft. Current value: ${this.state.publicOriginInput}. Shipped value: https://localhost:8787.`,
                status.configured
                  ? `目前值來自受管理主程序設定：${this.state.publicOriginInput}。出廠值：https://localhost:8787。`
                  : `呢個值係目前 wizard 草稿。目前值：${this.state.publicOriginInput}。出廠值：https://localhost:8787。`
              )}
            />

            {!status.configured && (
              <>
                <TextArea
                  label={this.localize(
                    'Optional SAML identity-provider metadata XML',
                    '可選 SAML 身分供應商 metadata XML'
                  )}
                  rows={6}
                  value={this.state.samlMetadataXml}
                  disabled={running}
                  onValueChanged={this.onSamlMetadataChanged}
                  ariaDescribedBy={
                    settingExplanationDescriptionIds(
                      'self-hosted-server-saml-metadata'
                    ).ariaDescribedBy
                  }
                />
                <SettingExplanation
                  settingId="self-hosted-server-saml-metadata"
                  summary={this.localize(
                    'What this setting changes',
                    '呢個設定會改咩'
                  )}
                  explanation={this.localize(
                    'Provides optional SAML identity-provider metadata for validation and a future signed adapter. OAuth remains the active sign-in path.',
                    '提供可選 SAML 身分供應商 metadata 作驗證同未來 signed adapter 使用；OAuth 仍然係目前登入路徑。'
                  )}
                  source="runtime-only"
                  provenance={this.localize(
                    `This value is temporary for the current wizard. Current value: ${
                      this.enteredState(this.state.samlMetadataXml).english
                    }. Shipped value: empty.`,
                    `呢個值只喺目前 wizard 暫時使用。目前值：${
                      this.enteredState(this.state.samlMetadataXml).cantonese
                    }。出廠值：空白。`
                  )}
                />
              </>
            )}

            {this.renderSteps()}

            {progress !== null && (
              <p className="self-hosted-server-progress-detail">
                {progress.detail}
              </p>
            )}

            {error !== null && (
              <div className="self-hosted-server-error" role="alert">
                <strong>{error.code}</strong>
                <p>{error.recovery}</p>
                <p>
                  {this.state.retryPhase === null
                    ? 'Run the wizard again from the beginning after the host or credential problem is resolved.'
                    : `Safe retry boundary: ${
                        SelfHostedServerProvisioningPhaseLabel[
                          this.state.retryPhase
                        ]
                      }. The current button reruns the guarded flow from the beginning.`}
                </p>
              </div>
            )}

            {joinUrl !== null && (
              <div className="self-hosted-server-join-url">
                <div className="self-hosted-server-join-url-row">
                  <TextBox
                    label={this.localize('Join URL', 'Join URL')}
                    value={joinUrl}
                    readOnly={true}
                    ariaDescribedBy={
                      settingExplanationDescriptionIds(
                        'self-hosted-server-join-url'
                      ).ariaDescribedBy
                    }
                  />
                  <CopyButton ariaLabel="Copy join URL" copyContent={joinUrl} />
                </div>
                <SettingExplanation
                  settingId="self-hosted-server-join-url"
                  summary={this.localize(
                    'What this value does',
                    '呢個值有咩用'
                  )}
                  explanation={this.localize(
                    'Shows the generated one-time join link for the second machine. It expires after one use or fifteen minutes.',
                    '顯示畀第二部機用嘅一次性 join link；使用一次或者十五分鐘後失效。'
                  )}
                  source="runtime-only"
                  provenance={this.localize(
                    'The current wizard generated a join link. Its value is shown only in the read-only field above. Shipped value: none.',
                    '目前 wizard 已產生 join link；個值只會顯示喺上面嘅唯讀欄位。出廠值：冇。'
                  )}
                />
                <p>
                  Give this link to the second machine. It expires after one use
                  or fifteen minutes, whichever comes first.
                </p>
              </div>
            )}

            {status.configured && (
              <div className="self-hosted-server-sign-in">
                <Button onClick={this.onSelfHostedSignIn} disabled={running}>
                  Sign in to self-hosted server
                </Button>
                {this.state.signedInAs !== null && (
                  <p role="status">Signed in as {this.state.signedInAs}.</p>
                )}
              </div>
            )}

            <div className="self-hosted-server-actions">
              <Button
                type="submit"
                onClick={this.onRunWizard}
                disabled={running}
              >
                {this.state.cancellationRequested
                  ? 'Cancelling…'
                  : status.configured
                  ? 'Run wizard again'
                  : 'Set up server'}
              </Button>
              {running && (
                <Button
                  onClick={this.onCancel}
                  disabled={this.state.cancellationRequested}
                >
                  {this.state.cancellationRequested ? 'Cancelling…' : 'Cancel'}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    )
  }
}
