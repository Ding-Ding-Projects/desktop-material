import { createHash, randomBytes, randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { IncomingMessage, Server, ServerResponse, createServer } from 'http'
import { AddressInfo } from 'net'
import * as Path from 'path'

import {
  IMinecraftServerState,
  MinecraftServerStatus,
  isMinecraftPlayerName,
  normalizeMinecraftCommand,
} from '../lib/minecraft/server'
import {
  EmptyPairingState,
  IPairedDevice,
  IPairingState,
  findPairedDevice,
  issuePairingCode,
  redeemPairingCode,
  revokePairedDevice,
} from '../lib/web-panel/pairing'
import { IMinecraftPropertySpec } from '../lib/minecraft/properties'
import { PanelCss, PanelHtml, PanelJs } from '../lib/web-panel/panel-page'

const CookieName = 'dm_panel'
const MaxBodyBytes = 4096
const MaxActivity = 200
const DevicesFileName = 'panel-devices.json'

const StatusLabels: Record<MinecraftServerStatus, string> = {
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  crashed: 'Stopped unexpectedly',
}

/** What the panel needs from the server manager. */
export interface IPanelServers {
  readonly list: () => Promise<ReadonlyArray<IMinecraftServerState>>
  readonly start: (id: string) => Promise<string | null>
  readonly stop: (id: string) => Promise<void>
  readonly command: (id: string, command: string) => Promise<boolean>
  readonly console: (
    id: string,
    after: number
  ) => {
    readonly next: number
    readonly lines: ReadonlyArray<string>
    readonly status: MinecraftServerStatus
  }
  readonly players: (id: string) => ReadonlyArray<string>
  readonly settings: (id: string) => Promise<
    ReadonlyArray<{
      readonly spec: IMinecraftPropertySpec
      readonly value: string
    }>
  >
  readonly setSetting: (
    id: string,
    key: string,
    value: string
  ) => Promise<string | null>
  readonly backups: (
    id: string
  ) => Promise<
    ReadonlyArray<{ readonly name: string; readonly createdAt: number }>
  >
  readonly backup: (id: string) => Promise<string | null>
  readonly addOns: (id: string) => Promise<
    ReadonlyArray<{
      readonly name: string
      readonly kind: 'plugin' | 'mod'
      readonly bytes: number
    }>
  >
}

export interface IPanelActivity {
  readonly at: number
  readonly device: string
  readonly what: string
}

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex')

/**
 * The web panel: a small HTTP server on this computer's loopback address.
 * Nothing answers without a paired session except the page itself and the
 * pairing request. It never listens on the network; a tunnel or the home
 * router is what makes it reachable, and that is the owner's choice.
 */
export class WebPanelServer {
  private server: Server | null = null
  private pairing: IPairingState = EmptyPairingState
  private loaded = false
  private readonly log = new Array<IPanelActivity>()

  public constructor(
    private readonly servers: IPanelServers,
    private readonly root: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** The loopback port in use, or null when the panel is off. */
  public get port(): number | null {
    const address = this.server?.address() as AddressInfo | null | undefined
    return address?.port ?? null
  }

  public get activity(): ReadonlyArray<IPanelActivity> {
    return [...this.log].reverse()
  }

  private async load() {
    if (this.loaded) {
      return
    }
    this.loaded = true
    try {
      const parsed = JSON.parse(
        await readFile(Path.join(this.root, DevicesFileName), 'utf8')
      )
      if (Array.isArray(parsed?.devices)) {
        this.pairing = {
          ...this.pairing,
          devices: parsed.devices.filter(
            (d: any) =>
              typeof d?.id === 'string' &&
              typeof d?.label === 'string' &&
              typeof d?.tokenDigest === 'string' &&
              /^[0-9a-f]{64}$/.test(d.tokenDigest) &&
              typeof d?.pairedAt === 'number' &&
              typeof d?.expiresAt === 'number'
          ),
        }
      }
    } catch {
      // No paired devices yet.
    }
  }

  private async saveDevices() {
    await mkdir(this.root, { recursive: true })
    await writeFile(
      Path.join(this.root, DevicesFileName),
      JSON.stringify({ version: 1, devices: this.pairing.devices }, null, 2)
    )
  }

  /** Start listening on loopback. Port 0 picks a free one. */
  public async start(port: number): Promise<number> {
    if (this.server !== null) {
      return this.port ?? port
    }
    await this.load()
    const server = createServer((request, response) => {
      this.handle(request, response).catch(() => {
        if (!response.headersSent) {
          this.json(response, 500, { error: 'Something went wrong.' })
        } else {
          response.end()
        }
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
    return this.port ?? port
  }

  public async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (server !== null) {
      server.closeAllConnections?.()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }

  /** A fresh one-time code for the owner to read out or send. */
  public async issueCode(): Promise<string> {
    await this.load()
    const issued = issuePairingCode(this.pairing, this.now(), count =>
      randomBytes(count)
    )
    this.pairing = issued.state
    return issued.code
  }

  public async devices(): Promise<
    ReadonlyArray<Omit<IPairedDevice, 'tokenDigest'>>
  > {
    await this.load()
    const now = this.now()
    return this.pairing.devices
      .filter(d => d.expiresAt > now)
      .map(({ tokenDigest, ...rest }) => rest)
  }

  /** Remove one paired device, or all of them. */
  public async revoke(id: string | null): Promise<void> {
    await this.load()
    this.pairing = revokePairedDevice(this.pairing, id)
    await this.saveDevices()
  }

  private record(device: string, what: string) {
    this.log.push({ at: this.now(), device, what })
    if (this.log.length > MaxActivity) {
      this.log.splice(0, this.log.length - MaxActivity)
    }
  }

  private headers(type: string): Record<string, string> {
    return {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow',
    }
  }

  private json(
    response: ServerResponse,
    status: number,
    body: unknown,
    extra: Record<string, string> = {}
  ) {
    response.writeHead(status, {
      ...this.headers('application/json; charset=utf-8'),
      ...extra,
    })
    response.end(JSON.stringify(body))
  }

  private text(response: ServerResponse, type: string, body: string) {
    response.writeHead(200, this.headers(type))
    response.end(body)
  }

  private session(request: IncomingMessage): IPairedDevice | null {
    const cookies = request.headers.cookie ?? ''
    for (const part of cookies.split(';')) {
      const [name, value] = part.trim().split('=')
      if (name === CookieName && /^[A-Za-z0-9_-]{20,100}$/.test(value ?? '')) {
        return findPairedDevice(this.pairing, digest(value), this.now())
      }
    }
    return null
  }

  private async body(request: IncomingMessage): Promise<any | null> {
    if (
      request.headers['x-panel-request'] !== '1' ||
      !/^application\/json\b/i.test(request.headers['content-type'] ?? '')
    ) {
      return null
    }
    const chunks = new Array<Buffer>()
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > MaxBodyBytes) {
        return null
      }
      chunks.push(chunk as Buffer)
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      return typeof parsed === 'object' && parsed !== null ? parsed : null
    } catch {
      return null
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://panel.invalid')
    const route = `${request.method} ${url.pathname}`

    switch (route) {
      case 'GET /':
        return this.text(response, 'text/html; charset=utf-8', PanelHtml)
      case 'GET /panel.css':
        return this.text(response, 'text/css; charset=utf-8', PanelCss)
      case 'GET /panel.js':
        return this.text(response, 'text/javascript; charset=utf-8', PanelJs)
    }

    if (!url.pathname.startsWith('/api/')) {
      return this.json(response, 404, { error: 'Not found.' })
    }

    if (route === 'POST /api/pair') {
      return this.pair(request, response)
    }

    const device = this.session(request)
    if (device === null) {
      return this.json(response, 401, { error: 'Pair this device first.' })
    }

    if (route === 'GET /api/state') {
      const servers = await this.servers.list()
      return this.json(response, 200, {
        servers: servers.map(({ server, status, eulaAccepted, message }) => ({
          id: server.id,
          name: server.name,
          port: server.port,
          memoryMegabytes: server.memoryMegabytes,
          status,
          statusLabel: StatusLabels[status],
          eulaAccepted,
          message,
          players: this.servers.players(server.id),
        })),
        activity: this.activity.slice(0, 50),
      })
    }

    if (route === 'GET /api/console') {
      const id = url.searchParams.get('id') ?? ''
      if (!(await this.known(id))) {
        return this.json(response, 404, { error: 'No such server.' })
      }
      return this.json(
        response,
        200,
        this.servers.console(id, Number(url.searchParams.get('after')) || 0)
      )
    }

    if (
      route === 'GET /api/config' ||
      route === 'GET /api/backups' ||
      route === 'GET /api/addons'
    ) {
      const id = url.searchParams.get('id') ?? ''
      if (!(await this.known(id))) {
        return this.json(response, 404, { error: 'No such server.' })
      }
      if (route === 'GET /api/config') {
        const settings = await this.servers.settings(id)
        return this.json(response, 200, {
          settings: settings.map(({ spec, value }) => ({
            key: spec.key,
            label: spec.label,
            type: spec.type,
            value,
          })),
        })
      }
      if (route === 'GET /api/backups') {
        return this.json(response, 200, {
          backups: await this.servers.backups(id),
        })
      }
      return this.json(response, 200, {
        addOns: await this.servers.addOns(id),
      })
    }

    if (request.method !== 'POST') {
      return this.json(response, 404, { error: 'Not found.' })
    }
    const body = await this.body(request)
    if (body === null) {
      return this.json(response, 400, { error: 'That request was not valid.' })
    }

    if (route === 'POST /api/signout') {
      this.pairing = revokePairedDevice(this.pairing, device.id)
      await this.saveDevices()
      this.record(device.label, 'Signed out')
      return this.json(
        response,
        200,
        {},
        { 'Set-Cookie': `${CookieName}=; Path=/; Max-Age=0; HttpOnly` }
      )
    }

    const id = typeof body.id === 'string' ? body.id : ''
    const name = await this.known(id)
    if (name === null) {
      return this.json(response, 404, { error: 'No such server.' })
    }

    switch (route) {
      case 'POST /api/start': {
        const problem = await this.servers.start(id)
        if (problem !== null) {
          return this.json(response, 409, { error: problem })
        }
        this.record(device.label, `Started ${name}`)
        return this.json(response, 200, {})
      }
      case 'POST /api/stop':
        await this.servers.stop(id)
        this.record(device.label, `Stopped ${name}`)
        return this.json(response, 200, {})
      case 'POST /api/command': {
        const command = normalizeMinecraftCommand(String(body.command ?? ''))
        if (command === null || !(await this.servers.command(id, command))) {
          return this.json(response, 409, {
            error: 'The command was not sent. Is the server running?',
          })
        }
        this.record(device.label, `Ran "${command}" on ${name}`)
        return this.json(response, 200, {})
      }
      case 'POST /api/config': {
        const key = String(body.key ?? '')
        const problem = await this.servers.setSetting(
          id,
          key,
          String(body.value ?? '')
        )
        if (problem !== null) {
          return this.json(response, 409, { error: problem })
        }
        this.record(device.label, `Changed ${key} on ${name}`)
        return this.json(response, 200, {})
      }
      case 'POST /api/backup': {
        const problem = await this.servers.backup(id)
        if (problem !== null) {
          return this.json(response, 409, { error: problem })
        }
        this.record(device.label, `Backed up ${name}`)
        return this.json(response, 200, {})
      }
      case 'POST /api/kick': {
        const player = String(body.player ?? '')
        if (
          !isMinecraftPlayerName(player) ||
          !(await this.servers.command(id, `kick ${player}`))
        ) {
          return this.json(response, 409, {
            error: 'That player could not be kicked.',
          })
        }
        this.record(device.label, `Kicked ${player} from ${name}`)
        return this.json(response, 200, {})
      }
    }
    return this.json(response, 404, { error: 'Not found.' })
  }

  private async known(id: string): Promise<string | null> {
    const match = (await this.servers.list()).find(s => s.server.id === id)
    return match?.server.name ?? null
  }

  private async pair(request: IncomingMessage, response: ServerResponse) {
    const body = await this.body(request)
    if (body === null) {
      return this.json(response, 400, { error: 'That request was not valid.' })
    }
    const token = randomBytes(32).toString('base64url')
    const result = redeemPairingCode(
      this.pairing,
      String(body.code ?? ''),
      {
        id: randomUUID(),
        label: String(body.label ?? ''),
        tokenDigest: digest(token),
      },
      this.now()
    )
    this.pairing = result.state
    if (!result.ok) {
      const error =
        result.reason === 'paused'
          ? 'Too many wrong codes. Pairing is paused for ten minutes.'
          : result.reason === 'full'
            ? 'Too many devices are paired. Remove one in Desktop Material.'
            : 'That code did not work. Ask for a new one.'
      return this.json(response, result.reason === 'paused' ? 429 : 403, {
        error,
      })
    }
    await this.saveDevices()
    const device = result.state.devices[result.state.devices.length - 1]
    this.record(device.label, 'Paired')
    const secure =
      request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
    return this.json(
      response,
      200,
      {},
      {
        'Set-Cookie': `${CookieName}=${token}; Path=/; Max-Age=${
          30 * 24 * 60 * 60
        }; HttpOnly; SameSite=Strict${secure}`,
      }
    )
  }
}
