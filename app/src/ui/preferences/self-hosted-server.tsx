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

interface ISelfHostedServerPreferencesState extends ISelfHostedServerWizardState {
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
              label="Public HTTPS address (or https://localhost:PORT for local-only)"
              value={this.state.publicOriginInput}
              disabled={running}
              onValueChanged={this.onPublicOriginChanged}
            />

            {!status.configured && (
              <TextArea
                label="Optional SAML identity-provider metadata XML"
                rows={6}
                value={this.state.samlMetadataXml}
                disabled={running}
                onValueChanged={this.onSamlMetadataChanged}
                ariaDescribedBy="self-hosted-saml-metadata-help"
              />
            )}
            <p id="self-hosted-saml-metadata-help">
              Metadata is validated and exposed for a future signed SAML
              adapter. This wizard does not claim to authenticate through an
              identity provider yet; OAuth remains the active sign-in path.
            </p>

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
                  <TextBox label="Join URL" value={joinUrl} readOnly={true} />
                  <CopyButton ariaLabel="Copy join URL" copyContent={joinUrl} />
                </div>
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
