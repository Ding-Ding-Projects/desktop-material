import * as React from 'react'

import {
  DefaultWebPanelOptions,
  IWebPanelOptions,
  IWebPanelStatus,
} from '../../lib/web-panel/status'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TextBox } from '../lib/text-box'
import {
  getWebPanelStatus,
  newWebPanelPairingCode,
  revokeWebPanelDevice,
  sendWebPanelLinkNow,
  setWebPanelOptions,
  setWebPanelWebhook,
  startWebPanel,
  startWebPanelTunnel,
  stopWebPanel,
  stopWebPanelTunnel,
} from '../main-process-proxy'

/** The calls the card makes. Injectable for tests. */
export interface IWebPanelClient {
  readonly status: () => Promise<IWebPanelStatus>
  readonly start: () => Promise<string | null>
  readonly stop: () => Promise<void>
  readonly startTunnel: () => Promise<string | null>
  readonly stopTunnel: () => Promise<void>
  readonly setWebhook: (address: string) => Promise<string | null>
  readonly setOptions: (options: IWebPanelOptions) => Promise<void>
  readonly newCode: () => Promise<string>
  readonly revoke: (id: string | null) => Promise<void>
  readonly sendNow: () => Promise<string | null>
}

const defaultClient: IWebPanelClient = {
  status: getWebPanelStatus,
  start: startWebPanel,
  stop: stopWebPanel,
  startTunnel: startWebPanelTunnel,
  stopTunnel: stopWebPanelTunnel,
  setWebhook: setWebPanelWebhook,
  setOptions: setWebPanelOptions,
  newCode: newWebPanelPairingCode,
  revoke: revokeWebPanelDevice,
  sendNow: sendWebPanelLinkNow,
}

interface IWebPanelCardProps {
  readonly client?: IWebPanelClient
  /** Starts the status refresh; returns how to stop it. For tests. */
  readonly schedule?: (tick: () => void) => () => void
  readonly copyText?: (text: string) => void
}

interface IWebPanelCardState {
  readonly status: IWebPanelStatus | null
  readonly error: string | null
  readonly notice: string | null
  readonly webhookDraft: string
  readonly code: string | null
}

const defaultSchedule = (tick: () => void) => {
  const id = window.setInterval(tick, 2000)
  return () => window.clearInterval(id)
}

const defaultCopyText = (text: string) => {
  void navigator.clipboard.writeText(text)
}

const OptionLabels: ReadonlyArray<{
  readonly key: keyof IWebPanelOptions
  readonly label: string
}> = [
  { key: 'resendOnChange', label: 'Send again when the link changes' },
  {
    key: 'replacePrevious',
    label: 'Update the earlier message instead of posting a new one',
  },
  { key: 'announceOffline', label: 'Say when the panel goes offline' },
  {
    key: 'sendPairingCode',
    label: 'Send a one-time pairing code with the link',
  },
]

interface IValueButtonProps {
  readonly value: string
  readonly ariaLabel: string
  readonly onPress: (value: string) => void
  readonly children: React.ReactNode
}

/** A button that reports the value it stands for. */
class ValueButton extends React.Component<IValueButtonProps> {
  private onClick = () => this.props.onPress(this.props.value)

  public render() {
    return (
      <Button ariaLabel={this.props.ariaLabel} onClick={this.onClick}>
        {this.props.children}
      </Button>
    )
  }
}

interface IOptionCheckboxProps {
  readonly option: keyof IWebPanelOptions
  readonly label: string
  readonly checked: boolean
  readonly onChanged: (option: keyof IWebPanelOptions, on: boolean) => void
}

class OptionCheckbox extends React.Component<IOptionCheckboxProps> {
  private onChange = (event: React.FormEvent<HTMLInputElement>) =>
    this.props.onChanged(this.props.option, event.currentTarget.checked)

  public render() {
    return (
      <Checkbox
        label={this.props.label}
        value={this.props.checked ? CheckboxValue.On : CheckboxValue.Off}
        onChange={this.onChange}
      />
    )
  }
}

/**
 * Web panel card: turn the panel on, start the free public link with one
 * click, hand out pairing codes, manage paired devices, and tell a Discord
 * channel the link whenever it changes.
 */
export class WebPanelCard extends React.Component<
  IWebPanelCardProps,
  IWebPanelCardState
> {
  private mounted = false
  private cancelSchedule: (() => void) | null = null

  public constructor(props: IWebPanelCardProps) {
    super(props)
    this.state = {
      status: null,
      error: null,
      notice: null,
      webhookDraft: '',
      code: null,
    }
  }

  private get client() {
    return this.props.client ?? defaultClient
  }

  public componentDidMount() {
    this.mounted = true
    void this.refresh()
    this.cancelSchedule = (this.props.schedule ?? defaultSchedule)(() => {
      void this.refresh()
    })
  }

  public componentWillUnmount() {
    this.mounted = false
    this.cancelSchedule?.()
  }

  private refresh = async () => {
    try {
      const status = await this.client.status()
      if (this.mounted) {
        this.setState({ status })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({ error: (error as Error).message })
      }
    }
  }

  private run = async (
    action: () => Promise<string | null | void>,
    notice: string | null = null
  ) => {
    this.setState({ error: null, notice: null })
    try {
      const problem = await action()
      if (this.mounted) {
        this.setState(
          typeof problem === 'string'
            ? { error: problem, notice: null }
            : { error: null, notice }
        )
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({ error: (error as Error).message })
      }
    }
    await this.refresh()
  }

  private onStart = () => this.run(() => this.client.start())
  private onStop = () => {
    this.setState({ code: null })
    return this.run(() => this.client.stop())
  }

  /** One click: the panel is turned on first when it is off. */
  private onStartTunnel = () =>
    this.run(async () => {
      if (this.state.status?.port == null) {
        const problem = await this.client.start()
        if (problem !== null) {
          return problem
        }
      }
      return this.client.startTunnel()
    })

  private onStopTunnel = () => this.run(() => this.client.stopTunnel())

  private onNewCode = () =>
    this.run(async () => {
      const code = await this.client.newCode()
      if (this.mounted) {
        this.setState({ code })
      }
    })

  private onWebhookChanged = (webhookDraft: string) =>
    this.setState({ webhookDraft })

  private onSaveWebhook = () =>
    this.run(async () => {
      const problem = await this.client.setWebhook(this.state.webhookDraft)
      if (problem === null && this.mounted) {
        this.setState({ webhookDraft: '' })
      }
      return problem
    }, 'The webhook is saved in the system vault.')

  private onRemoveWebhook = () =>
    this.run(() => this.client.setWebhook(''), 'The webhook was removed.')

  private onSendNow = () =>
    this.run(() => this.client.sendNow(), 'Sent to Discord.')

  private onOptionChanged = (key: keyof IWebPanelOptions, on: boolean) => {
    const options = {
      ...(this.state.status?.options ?? DefaultWebPanelOptions),
      [key]: on,
    }
    void this.run(() => this.client.setOptions(options))
  }

  private onRevoke = (id: string) => {
    void this.run(() => this.client.revoke(id))
  }

  private onRevokeAll = () => this.run(() => this.client.revoke(null))

  private onCopy = (text: string) => {
    ;(this.props.copyText ?? defaultCopyText)(text)
    this.setState({ notice: 'Copied.' })
  }

  private renderLink(label: string, url: string) {
    return (
      <p className="web-panel-link">
        <span>{label}</span>
        <code>{url}</code>
        <ValueButton
          value={url}
          ariaLabel={`Copy ${label.toLowerCase()}`}
          onPress={this.onCopy}
        >
          Copy
        </ValueButton>
      </p>
    )
  }

  private renderDiscord(status: IWebPanelStatus) {
    return (
      <div className="web-panel-group">
        <h5>Discord</h5>
        {status.webhookSet ? (
          <>
            <p>
              A webhook is saved in the system vault. The link is sent to its
              channel.
            </p>
            <div className="minecraft-servers-actions">
              <Button onClick={this.onSendNow}>Send now</Button>
              <Button onClick={this.onRemoveWebhook}>Remove webhook</Button>
            </div>
          </>
        ) : (
          <div className="minecraft-servers-command">
            <TextBox
              label="Discord webhook address"
              type="password"
              value={this.state.webhookDraft}
              onValueChanged={this.onWebhookChanged}
            />
            <Button onClick={this.onSaveWebhook}>Save webhook</Button>
          </div>
        )}
        {OptionLabels.map(({ key, label }) => (
          <OptionCheckbox
            key={key}
            option={key}
            label={label}
            checked={status.options[key]}
            onChanged={this.onOptionChanged}
          />
        ))}
        {status.options.sendPairingCode && (
          <p className="web-panel-caution">
            Anyone who can read that channel can pair a device. Each code works
            once, for 10 minutes, and paired devices can be removed here.
          </p>
        )}
        {status.webhookError !== null && (
          <p className="minecraft-servers-message" role="alert">
            {status.webhookError}
          </p>
        )}
        {status.webhookSentAt !== null && (
          <p className="minecraft-servers-meta">
            Last sent {new Date(status.webhookSentAt).toLocaleString()}
          </p>
        )}
      </div>
    )
  }

  public render() {
    const { status, error, notice, code } = this.state
    if (status === null) {
      return (
        <section className="web-panel-card" aria-label="Web panel">
          <p>{error ?? 'Loading the web panel…'}</p>
        </section>
      )
    }
    const { tunnel } = status
    const on = status.port !== null
    const linkActive = tunnel.kind === 'starting' || tunnel.kind === 'running'
    return (
      <section className="web-panel-card" aria-labelledby="web-panel-title">
        <div className="minecraft-servers-heading">
          <h4 id="web-panel-title">Web panel</h4>
          <span
            className={`minecraft-servers-status ${
              on ? 'minecraft-servers-status-running' : ''
            }`}
          >
            {on ? 'On' : 'Off'}
          </span>
        </div>
        <p>
          Manage your servers from a phone or another computer. Only paired
          devices get in.
        </p>
        {error !== null && (
          <p className="minecraft-servers-message" role="alert">
            {error}
          </p>
        )}
        {notice !== null && <p role="status">{notice}</p>}
        <div className="minecraft-servers-actions">
          {on ? (
            <Button onClick={this.onStop}>Turn off</Button>
          ) : (
            <Button onClick={this.onStart}>Turn on</Button>
          )}
          {linkActive ? (
            <Button onClick={this.onStopTunnel}>Stop public link</Button>
          ) : (
            <Button onClick={this.onStartTunnel}>Start free public link</Button>
          )}
        </div>
        {on &&
          this.renderLink(
            'On this computer',
            `http://127.0.0.1:${status.port}`
          )}
        {tunnel.kind === 'starting' && (
          <p role="status">Getting a public link from Cloudflare…</p>
        )}
        {tunnel.kind === 'running' &&
          this.renderLink('Public link', tunnel.url)}
        {tunnel.kind === 'failed' && (
          <p className="minecraft-servers-message" role="alert">
            {tunnel.reason}
          </p>
        )}
        <p className="minecraft-servers-meta">
          The free public link needs cloudflared installed on this computer. It
          is a new random address every time it starts, has no uptime guarantee,
          and serves at most 200 requests at once.
        </p>

        <div className="web-panel-group">
          <h5>Pairing</h5>
          <div className="minecraft-servers-actions">
            <Button disabled={!on} onClick={this.onNewCode}>
              New pairing code
            </Button>
            {status.devices.length > 0 && (
              <Button onClick={this.onRevokeAll}>Remove all devices</Button>
            )}
          </div>
          {code !== null && (
            <p className="web-panel-code">
              <code>{code}</code>
              <span>Works once, for 10 minutes.</span>
            </p>
          )}
          {status.devices.length === 0 ? (
            <p className="minecraft-servers-meta">No devices are paired.</p>
          ) : (
            <ul className="web-panel-list">
              {status.devices.map(device => (
                <li key={device.id}>
                  <span>
                    {device.label}
                    <small>
                      {' '}
                      paired {new Date(device.pairedAt).toLocaleString()}
                    </small>
                  </span>
                  <ValueButton
                    value={device.id}
                    ariaLabel={`Remove ${device.label}`}
                    onPress={this.onRevoke}
                  >
                    Remove
                  </ValueButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        {this.renderDiscord(status)}

        {status.activity.length > 0 && (
          <div className="web-panel-group">
            <h5>Activity</h5>
            <ol className="web-panel-list">
              {status.activity.slice(0, 10).map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <span>
                    {entry.device}: {entry.what}
                  </span>
                  <small>{new Date(entry.at).toLocaleTimeString()}</small>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    )
  }
}
