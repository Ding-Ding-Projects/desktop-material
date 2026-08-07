import * as React from 'react'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { ISelfHostedServerProvisioningProgress } from '../../lib/self-hosted-server/provisioning'
import { CopyButton } from '../copy-button'
import {
  ISelfHostedServerWizardState,
  SelfHostedServerProvisioningPhaseLabel,
  SelfHostedServerProvisioningPhaseOrder,
  initialSelfHostedServerWizardState,
  reduceSelfHostedServerWizardState,
  wizardStepState,
} from './self-hosted-server-wizard-state'

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
  {},
  ISelfHostedServerWizardState
> {
  public constructor(props: {}) {
    super(props)
    this.state = initialSelfHostedServerWizardState()
  }

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
      reduceSelfHostedServerWizardState(state, { type: 'progress', progress })
    )
  }

  private refreshStatus = () => {
    ipcRenderer
      .invoke('get-self-hosted-server-status')
      .then(status =>
        this.setState(state =>
          reduceSelfHostedServerWizardState(state, {
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
      reduceSelfHostedServerWizardState(state, {
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
      reduceSelfHostedServerWizardState(state, { type: 'run-started' })
    )
    ipcRenderer
      .invoke('provision-self-hosted-server', {
        publicOrigin: origin,
        installDockerIfMissing: true,
      })
      .then(reply => {
        if (reply.ok) {
          this.setState(state =>
            reduceSelfHostedServerWizardState(state, {
              type: 'completed',
              result: reply.result,
            })
          )
        } else {
          this.setState(state =>
            reduceSelfHostedServerWizardState(state, {
              type: 'failed',
              failure: reply,
            })
          )
        }
        this.refreshStatus()
      })
      .catch(error => {
        this.setState(state =>
          reduceSelfHostedServerWizardState(state, {
            type: 'failed',
            failure: {
              code: 'unknown',
              recovery: errorMessage(error, 'Run the wizard again.'),
            },
          })
        )
      })
  }

  private onCancel = () => {
    this.setState(state =>
      reduceSelfHostedServerWizardState(state, { type: 'cancel-requested' })
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
