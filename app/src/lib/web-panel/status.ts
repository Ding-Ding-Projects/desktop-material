import { QuickTunnelState } from './quick-tunnel'

/** How the Discord webhook behaves. The address itself is never in here. */
export interface IWebPanelOptions {
  /** Send again automatically when the link changes. */
  readonly resendOnChange: boolean
  /** Edit the earlier message instead of posting a new one. */
  readonly replacePrevious: boolean
  /** Say so when the panel goes offline. */
  readonly announceOffline: boolean
  /** Send a one-time pairing code with the link. */
  readonly sendPairingCode: boolean
}

export const DefaultWebPanelOptions: IWebPanelOptions = {
  resendOnChange: true,
  replacePrevious: true,
  announceOffline: true,
  sendPairingCode: false,
}

export const DefaultWebPanelPort = 25580

export interface IWebPanelDevice {
  readonly id: string
  readonly label: string
  readonly pairedAt: number
  readonly expiresAt: number
}

/** Everything the app's panel card shows. Contains no credential. */
export interface IWebPanelStatus {
  /** The loopback port, or null when the panel is off. */
  readonly port: number | null
  readonly tunnel: QuickTunnelState
  /** Whether a webhook address is stored in the system vault. */
  readonly webhookSet: boolean
  readonly options: IWebPanelOptions
  /** Why the last Discord message was not delivered, if it was not. */
  readonly webhookError: string | null
  /** When the last Discord message was delivered. */
  readonly webhookSentAt: number | null
  readonly devices: ReadonlyArray<IWebPanelDevice>
  readonly activity: ReadonlyArray<{
    readonly at: number
    readonly device: string
    readonly what: string
  }>
}

/** Keep only the known switches, as booleans. */
export function cleanWebPanelOptions(value: unknown): IWebPanelOptions {
  const source = (value ?? {}) as Record<string, unknown>
  const pick = (key: keyof IWebPanelOptions) =>
    typeof source[key] === 'boolean'
      ? (source[key] as boolean)
      : DefaultWebPanelOptions[key]
  return {
    resendOnChange: pick('resendOnChange'),
    replacePrevious: pick('replacePrevious'),
    announceOffline: pick('announceOffline'),
    sendPairingCode: pick('sendPairingCode'),
  }
}
