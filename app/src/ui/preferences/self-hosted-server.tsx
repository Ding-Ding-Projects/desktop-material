import * as React from 'react'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import * as ipcRenderer from '../../lib/ipc-renderer'
import {
  ISelfHostedServerControllerStatus,
  ISelfHostedServerProvisioningProgress,
  SelfHostedServerProvisioningPhase,
} from '../../lib/self-hosted-server/provisioning'
import { CopyButton } from '../copy-button'

interface ISelfHostedServerPreferencesState {
  readonly status: ISelfHostedServerControllerStatus | null
  readonly publicOriginInput: string
  readonly running: boolean
  readonly progress: ISelfHostedServerProvisioningProgress | null
  readonly joinUrl: string | null
  readonly error: { readonly code: string; readonly recovery: string } | null
}

const PhaseOrder: ReadonlyArray<SelfHostedServerProvisioningPhase> = [
  'detecting-docker',
  'installing-docker',
  'starting-docker',
  'waiting-for-docker',
  'preparing-server',
  'starting-server',
  'verifying-server',
  'creating-join-link',
  'complete',
]

const PhaseLabel: Record<SelfHostedServerProvisioningPhase, string> = {
  'detecting-docker': 'Detect Docker',
  'installing-docker': 'Install Docker Desktop',
  'starting-docker': 'Start Docker Desktop',
  'waiting-for-docker': 'Wait for the Docker engine',
  'preparing-server': 'Prepare server configuration',
  'starting-server': 'Start the server container',
  'verifying-server': 'Verify the server is reachable',
  'creating-join-link': 'Create a join link',
  complete: 'Done',
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
  {},
  ISelfHostedServerPreferencesState
> {
  public constructor(props: {}) {
    super(props)
    this.state = {
      status: null,
      publicOriginInput: 'https://localhost:8787',
      running: false,
      progress: null,
      joinUrl: null,
      error: null,
    }
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
    this.setState({ progress })
  }

  private refreshStatus = () => {
    ipcRenderer
      .invoke('get-self-hosted-server-status')
      .then(status =>
        this.setState({
          status,
          publicOriginInput:
            status.publicOrigin ?? this.state.publicOriginInput,
        })
      )
      .catch(() => {
        // The wizard still renders; the status card shows nothing configured.
      })
  }

  private onPublicOriginChanged = (value: string) => {
    this.setState({ publicOriginInput: value })
  }

  private onRunWizard = () => {
    this.setState({ running: true, error: null, progress: null, joinUrl: null })
    ipcRenderer
      .invoke('provision-self-hosted-server', {
        publicOrigin: this.state.publicOriginInput,
        installDockerIfMissing: true,
      })
      .then(reply => {
        if (reply.ok) {
          this.setState({ running: false, joinUrl: reply.result.joinUrl })
        } else {
          this.setState({ running: false, error: reply })
        }
        this.refreshStatus()
      })
      .catch(error => {
        this.setState({
          running: false,
          error: {
            code: 'unknown',
            recovery: errorMessage(error, 'Run the wizard again.'),
          },
        })
      })
  }

  private onCancel = () => {
    ipcRenderer.invoke('cancel-self-hosted-server-provisioning').catch(() => {
      // Cancellation is best-effort; the in-flight step will still surface
      // its own recoverable error.
    })
  }

  private renderSteps() {
    const { progress, running } = this.state
    const currentIndex =
      progress === null ? -1 : PhaseOrder.indexOf(progress.phase)
    return (
      <ol className="self-hosted-server-wizard-steps">
        {PhaseOrder.map((phase, index) => {
          const state =
            currentIndex < 0
              ? 'pending'
              : index < currentIndex
              ? 'done'
              : index === currentIndex
              ? running
                ? 'active'
                : phase === 'complete'
                ? 'done'
                : 'active'
              : 'pending'
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
              <span>{PhaseLabel[phase]}</span>
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
                <p>Re-running the wizard is always safe.</p>
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
                {status.configured ? 'Run wizard again' : 'Set up server'}
              </Button>
              {running && <Button onClick={this.onCancel}>Cancel</Button>}
            </div>
          </>
        )}
      </DialogContent>
    )
  }
}
