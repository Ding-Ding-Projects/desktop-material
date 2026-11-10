import { ChildProcess, spawn as nodeSpawn } from 'child_process'
import { mkdir, readFile, writeFile } from 'fs/promises'
import * as Path from 'path'

import {
  EmptyPanelAnnouncerState,
  IPanelAnnouncerState,
  WebhookFetch,
  announcePanel,
  isDiscordWebhookUrl,
} from '../lib/web-panel/discord-webhook'
import { formatPairingCode } from '../lib/web-panel/pairing'
import {
  QuickTunnelEvent,
  QuickTunnelState,
  quickTunnelArguments,
  quickTunnelUrl,
  reduceQuickTunnel,
} from '../lib/web-panel/quick-tunnel'
import {
  DefaultWebPanelOptions,
  DefaultWebPanelPort,
  IWebPanelOptions,
  IWebPanelStatus,
  cleanWebPanelOptions,
} from '../lib/web-panel/status'
import { WebPanelServer } from './web-panel-server'

const SettingsFileName = 'panel-settings.json'
export const WebPanelCredentialService = 'Desktop Material - Web panel'
export const WebPanelWebhookAccount = 'discord-webhook'
const VaultUnavailableMessage =
  'The system vault could not be used, so no Discord webhook is available.'

export interface IWebPanelVault {
  readonly getPassword: (
    service: string,
    account: string
  ) => Promise<string | null>
  readonly setPassword: (
    service: string,
    account: string,
    password: string
  ) => Promise<void>
  readonly deletePassword: (
    service: string,
    account: string
  ) => Promise<boolean>
}

export type TunnelSpawn = (
  command: string,
  args: ReadonlyArray<string>
) => ChildProcess

const defaultSpawn: TunnelSpawn = (command, args) =>
  nodeSpawn(command, [...args], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH ?? '',
      Path: process.env.Path ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      TEMP: process.env.TEMP ?? '',
      TMP: process.env.TMP ?? '',
      HOME: process.env.HOME ?? '',
      USERPROFILE: process.env.USERPROFILE ?? '',
    },
  })

/**
 * The web panel as the app sees it: the loopback server, the optional free
 * Cloudflare quick tunnel, and the Discord webhook that is told the link.
 *
 * The webhook address lives only in the system vault. It is read when a
 * message is sent and is never returned, logged or put in an error.
 */
export class WebPanelController {
  private tunnel: QuickTunnelState = { kind: 'stopped' }
  private child: ChildProcess | null = null
  private options: IWebPanelOptions = DefaultWebPanelOptions
  private announcer: IPanelAnnouncerState = EmptyPanelAnnouncerState
  private webhookError: string | null = null
  private webhookSentAt: number | null = null
  private loaded = false
  private vaultUnavailable = false
  /** Announcements run one after another so edits never race. */
  private queue: Promise<void> = Promise.resolve()

  public constructor(
    private readonly panel: WebPanelServer,
    private readonly root: string,
    private readonly vault: IWebPanelVault,
    private readonly fetch: WebhookFetch,
    private readonly spawn: TunnelSpawn = defaultSpawn,
    private readonly now: () => number = () => Date.now()
  ) {}

  private async load() {
    if (this.loaded) {
      return
    }
    this.loaded = true
    try {
      const parsed = JSON.parse(
        await readFile(Path.join(this.root, SettingsFileName), 'utf8')
      )
      this.options = cleanWebPanelOptions(parsed?.options)
      if (
        typeof parsed?.messageId === 'string' &&
        /^\d{5,30}$/.test(parsed.messageId)
      ) {
        this.announcer = { last: null, messageId: parsed.messageId }
      }
    } catch {
      // Defaults.
    }
  }

  private async save() {
    await mkdir(this.root, { recursive: true })
    await writeFile(
      Path.join(this.root, SettingsFileName),
      JSON.stringify(
        {
          version: 1,
          options: this.options,
          messageId: this.announcer.messageId,
        },
        null,
        2
      )
    )
  }

  /**
   * The stored address, or null. A vault that cannot be read is treated as
   * holding nothing, so the panel itself keeps working without Discord.
   */
  private async webhook(): Promise<string | null> {
    try {
      const value = await this.vault.getPassword(
        WebPanelCredentialService,
        WebPanelWebhookAccount
      )
      this.vaultUnavailable = false
      return value !== null && isDiscordWebhookUrl(value) ? value : null
    } catch {
      this.vaultUnavailable = true
      return null
    }
  }

  public async status(): Promise<IWebPanelStatus> {
    await this.load()
    const webhookSet = (await this.webhook()) !== null
    return {
      port: this.panel.port,
      tunnel: this.tunnel,
      webhookSet,
      options: this.options,
      webhookError: this.vaultUnavailable
        ? VaultUnavailableMessage
        : this.webhookError,
      webhookSentAt: this.webhookSentAt,
      devices: await this.panel.devices(),
      activity: this.panel.activity.slice(0, 50),
    }
  }

  /** Turn the panel on. Returns why it could not start, or null. */
  public async startPanel(
    port: number = DefaultWebPanelPort
  ): Promise<string | null> {
    await this.load()
    try {
      await this.panel.start(port)
      return null
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
        ? `Port ${port} is already in use on this computer.`
        : 'The panel could not be started.'
    }
  }

  public async stopPanel(): Promise<void> {
    await this.stopTunnel()
    await this.panel.stop()
  }

  private apply(event: QuickTunnelEvent) {
    const before = quickTunnelUrl(this.tunnel)
    this.tunnel = reduceQuickTunnel(this.tunnel, event)
    const after = quickTunnelUrl(this.tunnel)
    if (before !== after) {
      void this.announce(false)
    }
  }

  /** Start the free public link. Needs `cloudflared` on this computer. */
  public async startTunnel(): Promise<string | null> {
    await this.load()
    const port = this.panel.port
    if (port === null) {
      return 'Turn the panel on first.'
    }
    if (this.child !== null) {
      return null
    }
    let child: ChildProcess
    try {
      child = this.spawn('cloudflared', quickTunnelArguments(port))
    } catch {
      this.tunnel = {
        kind: 'failed',
        reason: 'The tunnel helper could not be started.',
      }
      return 'cloudflared could not be started. Install it and try again.'
    }
    this.child = child
    this.apply({ kind: 'start' })
    const onOutput = (data: Buffer | string) => {
      if (this.child === child) {
        this.apply({ kind: 'output', text: data.toString() })
      }
    }
    child.stdout?.on('data', onOutput)
    child.stderr?.on('data', onOutput)
    const onEnd = (code: number | null) => {
      if (this.child === child) {
        this.child = null
        this.apply({ kind: 'exit', code })
      }
    }
    child.on('error', () => onEnd(null))
    child.on('exit', code => onEnd(code))
    return null
  }

  public async stopTunnel(): Promise<void> {
    const child = this.child
    this.child = null
    child?.kill()
    this.apply({ kind: 'stop' })
    await this.queue
  }

  /** Store the webhook address in the system vault, or remove it. */
  public async setWebhook(address: string): Promise<string | null> {
    const trimmed = address.trim()
    if (trimmed.length === 0) {
      try {
        await this.vault.deletePassword(
          WebPanelCredentialService,
          WebPanelWebhookAccount
        )
      } catch {
        return VaultUnavailableMessage
      }
      this.announcer = EmptyPanelAnnouncerState
      this.webhookError = null
      this.webhookSentAt = null
      await this.save()
      return null
    }
    if (!isDiscordWebhookUrl(trimmed)) {
      return 'That is not a Discord webhook address.'
    }
    try {
      await this.vault.setPassword(
        WebPanelCredentialService,
        WebPanelWebhookAccount,
        trimmed
      )
    } catch {
      return VaultUnavailableMessage
    }
    this.announcer = EmptyPanelAnnouncerState
    this.webhookError = null
    await this.save()
    return null
  }

  public async setOptions(options: unknown): Promise<void> {
    await this.load()
    this.options = cleanWebPanelOptions(options)
    await this.save()
  }

  /** A fresh one-time code to read out, shown in two groups. */
  public async newPairingCode(): Promise<string> {
    return formatPairingCode(await this.panel.issueCode())
  }

  public async revoke(id: string | null): Promise<void> {
    await this.panel.revoke(id)
  }

  /** The Send now button: always sends, with a fresh code when asked for. */
  public async sendNow(): Promise<string | null> {
    await this.load()
    if ((await this.webhook()) === null) {
      return 'Add a Discord webhook first.'
    }
    await this.announce(true)
    return this.webhookError
  }

  private announce(force: boolean): Promise<void> {
    this.queue = this.queue.then(() => this.announceNow(force)).catch(() => {})
    return this.queue
  }

  private async announceNow(force: boolean) {
    await this.load()
    const address = await this.webhook()
    if (address === null) {
      return
    }
    const url = quickTunnelUrl(this.tunnel)
    const pairingCode =
      url !== null && this.options.sendPairingCode
        ? formatPairingCode(await this.panel.issueCode())
        : null
    const result = await announcePanel(
      address,
      this.announcer,
      { url, pairingCode },
      this.options,
      this.fetch,
      force
    )
    this.announcer = result.state
    if (result.ok) {
      this.webhookError = null
      if (result.action !== 'none') {
        this.webhookSentAt = this.now()
        await this.save()
      }
    } else {
      this.webhookError = result.error
    }
  }
}
