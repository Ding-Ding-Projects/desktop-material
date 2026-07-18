import * as React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { CopyButton } from '../copy-button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  AgentServerGatewayURLStorageKey,
  AgentServerLANPortStorageKey,
  AgentServerMode,
  AgentServerModeStorageKey,
  AgentServerSiteURLStorageKey,
  DefaultAgentRemoteSiteURL,
  IAgentPairedDevice,
  IAgentServerStatus,
} from '../../lib/agent-commands'
import { setBoolean, setNumber } from '../../lib/local-storage'
import * as ipcRenderer from '../../lib/ipc-renderer'

interface IAgentAccessState {
  readonly status: IAgentServerStatus | null
  readonly revealToken: boolean
  readonly busy: boolean
  readonly error: string | null
  readonly siteURLInput: string
  readonly gatewayURLInput: string
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function modeDescription(mode: AgentServerMode): string {
  switch (mode) {
    case 'local':
      return 'Loopback-only access with a random bearer token.'
    case 'paired-lan':
      return 'Private-LAN access with one-time pairing and per-device tokens.'
    case 'yolo-lan':
      return 'Authentication is disabled. Every existing command is exposed to the private LAN.'
  }
}

interface IAgentDeviceRowProps {
  readonly device: IAgentPairedDevice
  readonly busy: boolean
  readonly onRevoke: (device: IAgentPairedDevice) => void
}

class AgentDeviceRow extends React.Component<IAgentDeviceRowProps> {
  public render() {
    const { device, busy } = this.props
    return (
      <li>
        <span className="agent-device-icon" aria-hidden="true">
          <Octicon symbol={octicons.deviceMobile} />
        </span>
        <span className="agent-device-copy">
          <strong>{device.name}</strong>
          <span>Paired {new Date(device.createdAt).toLocaleString()}</span>
        </span>
        <button
          type="button"
          className="agent-revoke-button"
          onClick={this.onRevoke}
          disabled={busy}
          aria-label={`Revoke ${device.name}`}
        >
          <Octicon symbol={octicons.trash} />
          Revoke
        </button>
      </li>
    )
  }

  private onRevoke = () => {
    this.props.onRevoke(this.props.device)
  }
}

/** Opt-in controls for the local and explicitly enabled LAN agent bridge. */
export class AgentAccess extends React.Component<{}, IAgentAccessState> {
  public constructor(props: {}) {
    super(props)
    this.state = {
      status: null,
      revealToken: false,
      busy: false,
      error: null,
      siteURLInput: DefaultAgentRemoteSiteURL,
      gatewayURLInput: '',
    }
  }

  public componentDidMount() {
    ipcRenderer.on('agent-server-status', this.onStatusChanged)
    this.refreshStatus()
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('agent-server-status', this.onStatusChanged)
  }

  public render() {
    const { status, busy, error } = this.state
    const enabled = status?.enabled ?? false
    const running = status?.running ?? false
    const mode = status?.mode ?? 'local'
    const token = status?.token ?? ''
    const address = status?.baseURL ?? 'Not running'
    const unsafe = mode === 'yolo-lan'

    return (
      <DialogContent className="agent-access-preferences">
        <div className="agent-access-heading">
          <div>
            <h2>Agent access</h2>
            <p>
              Let trusted tools control Desktop Material through MCP or the REST
              compatibility API.
            </p>
          </div>
          <span
            className={`agent-status-chip ${running ? 'running' : ''} ${
              unsafe ? 'unsafe' : ''
            }`}
            role="status"
            aria-live="polite"
          >
            <span className="agent-status-dot" aria-hidden="true" />
            {running
              ? unsafe
                ? 'Unsafe LAN'
                : 'Listening'
              : enabled
              ? 'Starting'
              : 'Off'}
          </span>
        </div>

        <section className="agent-access-card agent-mode-card">
          <label htmlFor="agent-server-mode">Access mode</label>
          <select
            id="agent-server-mode"
            value={mode}
            onChange={this.onModeChanged}
            disabled={busy}
          >
            <option value="local">Local only (recommended)</option>
            <option value="paired-lan">Paired LAN devices</option>
            <option value="yolo-lan">YOLO LAN — no authentication</option>
          </select>
          <p>{modeDescription(mode)}</p>

          <div className="agent-toggle-row">
            <div>
              <strong id="agent-server-enabled-label">
                Enable agent server
              </strong>
              <p>
                {mode === 'local'
                  ? 'Off by default. Listens only on 127.0.0.1 with a random port.'
                  : 'LAN modes bind a random port on private IPv4 interfaces.'}
              </p>
            </div>
            <Checkbox
              ariaLabelledBy="agent-server-enabled-label"
              value={enabled ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onEnabledChanged}
              disabled={busy}
            />
          </div>
        </section>

        {unsafe && (
          <section className="agent-unsafe-warning" role="alert">
            <Octicon symbol={octicons.alertFill} />
            <div>
              <strong>Authentication is completely disabled</strong>
              <p>
                Anyone who can reach this private-LAN port can run the full
                command surface, including write operations. YOLO mode returns
                to local/off when the app restarts.
              </p>
            </div>
          </section>
        )}

        <section className="agent-access-card connection-card">
          <div className="agent-access-card-title">
            <Octicon symbol={octicons.server} />
            <h3>Connection</h3>
          </div>
          <span className="agent-field-label" id="agent-server-address-label">
            {mode === 'local' ? 'Local address' : 'Client address'}
          </span>
          <div
            className="agent-readonly-field"
            role="textbox"
            aria-readonly="true"
            aria-labelledby="agent-server-address-label"
          >
            <code>{address}</code>
          </div>

          {!unsafe && (
            <>
              <label htmlFor="agent-server-token">Desktop bearer token</label>
              <div className="agent-token-row">
                <input
                  id="agent-server-token"
                  type={this.state.revealToken ? 'text' : 'password'}
                  value={token}
                  readOnly={true}
                  autoComplete="off"
                  aria-describedby="agent-token-help"
                />
                <button
                  type="button"
                  className="agent-icon-button"
                  onClick={this.toggleTokenVisibility}
                  disabled={!running}
                  aria-pressed={this.state.revealToken}
                  aria-label={
                    this.state.revealToken ? 'Hide token' : 'Reveal token'
                  }
                >
                  <Octicon
                    symbol={
                      this.state.revealToken ? octicons.eyeClosed : octicons.eye
                    }
                  />
                </button>
                {token.length > 0 && (
                  <CopyButton
                    ariaLabel="Copy agent token"
                    copyContent={token}
                  />
                )}
              </div>
              <p id="agent-token-help" className="agent-security-note">
                <Octicon symbol={octicons.shieldLock} />
                Keep this desktop token private. Paired-device tokens are stored
                separately in the OS credential vault.
              </p>
              <button
                type="button"
                className="agent-tonal-button"
                onClick={this.regenerateToken}
                disabled={!running || busy}
              >
                <Octicon symbol={octicons.sync} />
                Regenerate desktop token
              </button>
            </>
          )}
        </section>

        {mode !== 'local' && this.renderRemoteConfiguration(status)}
        {mode === 'paired-lan' && this.renderPairing(status)}
        {mode === 'paired-lan' && this.renderPairedDevices(status)}

        <section className="agent-access-card agent-connect-card">
          <div className="agent-access-card-title">
            <Octicon symbol={octicons.terminal} />
            <h3>Connect an agent</h3>
          </div>
          <p>
            The command endpoint is <code>{address}/api/v1/commands</code>. MCP
            clients use <code>{address}/mcp</code>.
          </p>
          {!unsafe && (
            <p>
              Send <code>Authorization: Bearer …</code> with the desktop token
              or a paired-device token.
            </p>
          )}
          <p>
            Local stdio clients can run{' '}
            <code>node script/agent/mcp-stdio-proxy.js</code>.
          </p>
        </section>

        {error !== null && (
          <p className="agent-access-error" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    )
  }

  private renderRemoteConfiguration(status: IAgentServerStatus | null) {
    const transport = status?.transport ?? 'lan-http'
    return (
      <section className="agent-access-card agent-remote-config-card">
        <div className="agent-access-card-title">
          <Octicon symbol={octicons.link} />
          <h3>Mobile site and transport</h3>
        </div>

        <label htmlFor="agent-remote-site-url">Mobile site base URL</label>
        <input
          id="agent-remote-site-url"
          type="url"
          value={this.state.siteURLInput}
          onChange={this.onSiteURLChanged}
          disabled={this.state.busy}
          spellCheck={false}
        />
        <p className="agent-field-help">
          The Docker default is port 3000. A localhost host is replaced with the
          selected LAN IPv4 address in the QR code. A deployed HTTPS site can be
          entered instead.
        </p>

        <label htmlFor="agent-gateway-url">
          HTTPS agent gateway <span>Optional</span>
        </label>
        <input
          id="agent-gateway-url"
          type="url"
          value={this.state.gatewayURLInput}
          onChange={this.onGatewayURLChanged}
          disabled={this.state.busy}
          placeholder="https://agent.example.test"
          spellCheck={false}
        />
        <p className="agent-field-help">
          A reverse proxy must forward the gateway Host header, or rewrite it to
          the displayed LAN host. The gateway is used as the QR agent URL;
          Desktop Material still listens on the private LAN address below.
        </p>

        <button
          type="button"
          className="agent-tonal-button"
          onClick={this.saveRemoteConfiguration}
          disabled={this.state.busy}
        >
          Save connection URLs
        </button>

        <span className="agent-field-label">Direct LAN address</span>
        <div className="agent-readonly-field">
          <code>{status?.lanBaseURL ?? 'Not running'}</code>
        </div>

        <span className="agent-field-label">Resolved mobile site</span>
        <div className="agent-readonly-field">
          <code>{status?.siteURL ?? this.state.siteURLInput}</code>
        </div>

        {transport === 'lan-http' ? (
          <div className="agent-transport-warning" role="note">
            <Octicon symbol={octicons.alert} />
            <p>
              Pairing authenticates devices, but direct LAN HTTP does not
              encrypt traffic. Use only on a trusted network, or configure an
              HTTPS gateway.
            </p>
          </div>
        ) : (
          <div className="agent-secure-transport" role="note">
            <Octicon symbol={octicons.shieldCheck} />
            The QR code uses the configured HTTPS gateway.
          </div>
        )}
      </section>
    )
  }

  private renderPairing(status: IAgentServerStatus | null) {
    const pairing = status?.pairing ?? null
    return (
      <section className="agent-access-card agent-pairing-card">
        <div className="agent-access-card-title">
          <Octicon symbol={octicons.deviceMobile} />
          <h3>Pair a device</h3>
        </div>
        {pairing === null ? (
          <p className="agent-empty-state">
            {status?.running
              ? 'No active pairing code. Create one when the mobile site is ready.'
              : 'Start paired LAN mode to create a one-time pairing code.'}
          </p>
        ) : (
          <div className="agent-pairing-layout">
            <div className="agent-qr-surface">
              <QRCodeSVG
                value={pairing.qrURL}
                size={176}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
                marginSize={4}
                title="Desktop Material one-time pairing QR code"
              />
            </div>
            <div className="agent-pairing-copy">
              <strong>Scan with the mobile site</strong>
              <p>
                This code expires at{' '}
                <time dateTime={pairing.expiresAt}>
                  {new Date(pairing.expiresAt).toLocaleTimeString()}
                </time>{' '}
                and is consumed by the first successful exchange.
              </p>
              <div className="agent-code-row">
                <code>{pairing.code}</code>
                <CopyButton
                  ariaLabel="Copy one-time pairing code"
                  copyContent={pairing.code}
                />
              </div>
              <CopyButton
                ariaLabel="Copy mobile pairing link"
                copyContent={pairing.qrURL}
              />
              <p className="agent-field-help">
                The secret is in the URL fragment, so it is not sent in normal
                site-server request logs. The mobile page can still read it, so
                use the bundled Docker site or another trusted deployment. “Stay
                logged in” controls browser storage only; Desktop Material never
                stores that preference.
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          className="agent-tonal-button"
          onClick={this.regeneratePairing}
          disabled={!status?.running || this.state.busy}
        >
          <Octicon symbol={octicons.sync} />
          {pairing === null ? 'Create pairing code' : 'Replace pairing code'}
        </button>
      </section>
    )
  }

  private renderPairedDevices(status: IAgentServerStatus | null) {
    const devices = status?.pairedDevices ?? []
    return (
      <section className="agent-access-card agent-devices-card">
        <div className="agent-access-card-title">
          <Octicon symbol={octicons.devices} />
          <h3>Paired devices</h3>
        </div>
        {devices.length === 0 ? (
          <p className="agent-empty-state">No devices are paired.</p>
        ) : (
          <ul className="agent-device-list">
            {devices.map(device => this.renderPairedDevice(device))}
          </ul>
        )}
      </section>
    )
  }

  private renderPairedDevice(device: IAgentPairedDevice) {
    return (
      <AgentDeviceRow
        key={device.id}
        device={device}
        busy={this.state.busy}
        onRevoke={this.revokeDevice}
      />
    )
  }

  private onStatusChanged = (_event: unknown, status: IAgentServerStatus) => {
    this.applyStatus(status)
  }

  private applyStatus = (status: IAgentServerStatus) => {
    localStorage.setItem(AgentServerModeStorageKey, status.mode)
    if (status.mode !== 'local' && status.port !== null) {
      setNumber(AgentServerLANPortStorageKey, status.port)
    }
    this.setState({
      status,
      busy: false,
      error: null,
      siteURLInput: status.siteURLSetting,
      gatewayURLInput: status.gatewayURL ?? '',
    })
  }

  private refreshStatus = () => {
    ipcRenderer
      .invoke('get-agent-server-status')
      .then(this.applyStatus)
      .catch(error =>
        this.setState({
          busy: false,
          error: errorMessage(error, 'Unable to read agent server status'),
        })
      )
  }

  private onEnabledChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const enabled = event.currentTarget.checked
    setBoolean('agent-server-enabled', enabled)
    this.setState(state => ({
      busy: true,
      error: null,
      status:
        state.status === null ? null : { ...state.status, enabled: enabled },
    }))
    ipcRenderer.send('set-agent-server-enabled', enabled)
    window.setTimeout(this.refreshStatus, 350)
  }

  private onModeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const mode = event.currentTarget.value as AgentServerMode
    const yoloConfirmed =
      mode !== 'yolo-lan' ||
      window.confirm(
        'YOLO LAN mode disables all authentication and gives anyone on your private network full command rights. Enable it anyway?'
      )
    if (!yoloConfirmed) {
      return
    }

    this.setState({ busy: true, error: null, revealToken: false })
    ipcRenderer
      .invoke('configure-agent-server', {
        mode,
        yoloConfirmed: mode === 'yolo-lan',
      })
      .then(status => {
        // Persist YOLO only as a startup sentinel. index.tsx clears it and
        // forces local/off before initializing the next app process.
        localStorage.setItem(AgentServerModeStorageKey, mode)
        this.applyStatus(status)
      })
      .catch(error =>
        this.setState({
          busy: false,
          error: errorMessage(error, 'Unable to change agent access mode'),
        })
      )
  }

  private onSiteURLChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ siteURLInput: event.currentTarget.value })
  }

  private onGatewayURLChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ gatewayURLInput: event.currentTarget.value })
  }

  private saveRemoteConfiguration = async () => {
    this.setState({ busy: true, error: null })
    try {
      await ipcRenderer.invoke(
        'set-agent-server-remote-site-url',
        this.state.siteURLInput
      )
      localStorage.setItem(
        AgentServerSiteURLStorageKey,
        this.state.siteURLInput
      )
      const gatewayURL = this.state.gatewayURLInput.trim()
      const status = await ipcRenderer.invoke(
        'set-agent-server-gateway-url',
        gatewayURL.length === 0 ? null : gatewayURL
      )
      if (gatewayURL.length === 0) {
        localStorage.removeItem(AgentServerGatewayURLStorageKey)
      } else {
        localStorage.setItem(AgentServerGatewayURLStorageKey, gatewayURL)
      }
      this.applyStatus(status)
    } catch (error) {
      this.setState({
        busy: false,
        error: errorMessage(error, 'Unable to save remote connection URLs'),
      })
    }
  }

  private regenerateToken = () => {
    this.setState({ busy: true, revealToken: false, error: null })
    ipcRenderer
      .invoke('regenerate-agent-server-token')
      .then(this.applyStatus)
      .catch(error =>
        this.setState({
          busy: false,
          error: errorMessage(error, 'Unable to regenerate token'),
        })
      )
  }

  private regeneratePairing = () => {
    this.setState({ busy: true, error: null })
    ipcRenderer
      .invoke('regenerate-agent-server-pairing')
      .then(this.applyStatus)
      .catch(error =>
        this.setState({
          busy: false,
          error: errorMessage(error, 'Unable to create a pairing code'),
        })
      )
  }

  private revokeDevice = (device: IAgentPairedDevice) => {
    if (
      !window.confirm(
        `Revoke ${device.name}? Its bearer token will stop working immediately.`
      )
    ) {
      return
    }
    this.setState({ busy: true, error: null })
    ipcRenderer
      .invoke('revoke-agent-server-device', device.id)
      .then(this.applyStatus)
      .catch(error =>
        this.setState({
          busy: false,
          error: errorMessage(error, 'Unable to revoke paired device'),
        })
      )
  }

  private toggleTokenVisibility = () => {
    this.setState(state => ({ revealToken: !state.revealToken }))
  }
}
