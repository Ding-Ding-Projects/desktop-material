import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { promises as Fs } from 'fs'
import * as Http from 'http'
import { networkInterfaces } from 'os'
import * as Path from 'path'
import {
  AgentCommandResult,
  AgentCommandVersion,
  AgentServerMode,
  AgentToolDefinitions,
  DefaultAgentRemoteSiteURL,
  IAgentCommandEnvelope,
  IAgentPairRequest,
  IAgentPairResult,
  IAgentPairingStatus,
  IAgentPairedDevice,
  IAgentServerConfiguration,
  IAgentServerStatus,
  agentCommandError,
  assertSafeAgentArgs,
  isAgentCommandName,
  redactAgentValue,
} from '../../lib/agent-commands'
import { AgentCommandExecutor, handleMCPRequest } from './mcp-handler'
import {
  namedAPIFunctionNameFromTool,
  namedAPIFunctionToolName,
} from '../../lib/named-api-functions'
import {
  IAgentDeviceCredentialStore,
  PairedDeviceStore,
} from './paired-device-store'

const MaxBodyBytes = 64 * 1024
const MaxActiveCommands = 8
const MaxQueuedCommands = 64
const PairingLifetimeMs = 5 * 60 * 1000

const unavailableCredentialStore: IAgentDeviceCredentialStore = {
  setItem: async () => {
    throw new Error('The OS credential vault is unavailable')
  },
  getItem: async () => null,
  deleteItem: async () => false,
}

export interface IAgentServerDependencies {
  readonly credentialStore?: IAgentDeviceCredentialStore
  readonly deviceMetadataPath?: string
  readonly now?: () => number
  readonly remoteSiteURL?: string
  readonly gatewayURL?: string
  readonly resolveLANAddresses?: () => ReadonlyArray<string>
  readonly onStatusChanged?: (status: IAgentServerStatus) => void
}

class HTTPError extends Error {
  public constructor(public readonly status: number, message: string) {
    super(message)
  }
}

function isLoopbackAddress(address: string | undefined): boolean {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  )
}

function normalizedIPv4(address: string | undefined): string | null {
  if (address === undefined) {
    return null
  }
  return address.startsWith('::ffff:')
    ? address.slice('::ffff:'.length)
    : address
}

function isPrivateIPv4(address: string | undefined): boolean {
  const normalized = normalizedIPv4(address)
  if (normalized === null) {
    return false
  }
  const octets = normalized.split('.').map(value => Number(value))
  if (
    octets.length !== 4 ||
    octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false
  }
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254)
  )
}

export function getLANIPv4Addresses(): ReadonlyArray<string> {
  const addresses = new Set<string>()
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (
        entry.family === 'IPv4' &&
        !entry.internal &&
        isPrivateIPv4(entry.address)
      ) {
        addresses.add(entry.address)
      }
    }
  }
  return [...addresses].sort((left, right) => {
    const priority = (value: string) =>
      value.startsWith('192.168.') ? 0 : value.startsWith('10.') ? 1 : 2
    return priority(left) - priority(right) || left.localeCompare(right)
  })
}

function secretMatches(supplied: string, expected: string): boolean {
  const suppliedDigest = createHash('sha256').update(supplied).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(suppliedDigest, expectedDigest)
}

function bearerToken(header: string | undefined): string | null {
  return header !== undefined && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length)
    : null
}

function normalizeRemoteSiteURL(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Agent remote site URL is invalid')
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new Error(
      'Agent remote site URL must be an HTTP(S) URL without credentials'
    )
  }
  parsed.hash = ''
  return parsed
}

function normalizeGatewayURL(value: string): string {
  const parsed = normalizeRemoteSiteURL(value)
  if (parsed.protocol !== 'https:') {
    throw new Error('Agent gateway URL must use HTTPS')
  }
  parsed.search = ''
  return parsed.toString().replace(/\/$/, '')
}

function pairingURL(
  siteURL: string,
  code: string,
  agentBaseURL: string
): string {
  return `${siteURL}#pair=${encodeURIComponent(
    code
  )}&agent=${encodeURIComponent(agentBaseURL)}`
}

async function readJSONBody(request: Http.IncomingMessage): Promise<unknown> {
  const declared = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MaxBodyBytes) {
    request.resume()
    throw new HTTPError(413, 'Request body exceeds 64 KiB')
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MaxBodyBytes) {
      throw new HTTPError(413, 'Request body exceeds 64 KiB')
    }
    chunks.push(buffer)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HTTPError(400, 'Request body must be valid JSON')
  }
}

function writeJSON(
  response: Http.ServerResponse,
  status: number,
  value: unknown,
  redact = true
): void {
  const body = JSON.stringify(redact ? redactAgentValue(value) : value)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  })
  response.end(body)
}

/**
 * Mode-aware HTTP transport for MCP and the REST compatibility surface.
 * Authentication, network boundaries, and queue bounds live here so every
 * protocol skin has the same security behavior.
 */
export class AgentServer {
  private server: Http.Server | null = null
  private token: string | null = null
  private port: number | null = null
  private preferredLANPort: number | null = null
  private enabled = false
  private stopping = false
  private mode: AgentServerMode = 'local'
  private lanAddresses: ReadonlyArray<string> = []
  private pairingSecret: {
    readonly code: string
    readonly expiresAt: number
  } | null = null
  private activeCommands = 0
  private readonly devices: PairedDeviceStore
  private readonly now: () => number
  private remoteSiteURLSetting: string
  private gatewayURL: string | null
  private readonly resolveLANAddresses: () => ReadonlyArray<string>
  private readonly onStatusChanged?: (status: IAgentServerStatus) => void
  private readonly pairingAttempts = new Map<
    string,
    { attempts: number; windowStartedAt: number; nextAllowedAt: number }
  >()
  private readonly commandQueue: Array<{
    readonly command: IAgentCommandEnvelope
    readonly resolve: (result: AgentCommandResult) => void
  }> = []

  public constructor(
    private readonly configPath: string,
    private readonly executeCommand: AgentCommandExecutor,
    dependencies: IAgentServerDependencies = {}
  ) {
    const remoteSite = normalizeRemoteSiteURL(
      dependencies.remoteSiteURL ?? DefaultAgentRemoteSiteURL
    )
    this.remoteSiteURLSetting = remoteSite.toString()
    this.gatewayURL =
      dependencies.gatewayURL === undefined
        ? null
        : normalizeGatewayURL(dependencies.gatewayURL)
    this.now = dependencies.now ?? Date.now
    this.resolveLANAddresses =
      dependencies.resolveLANAddresses ?? getLANIPv4Addresses
    this.onStatusChanged = dependencies.onStatusChanged
    this.devices = new PairedDeviceStore(
      dependencies.deviceMetadataPath ??
        Path.join(Path.dirname(configPath), 'agent-server-devices.json'),
      dependencies.credentialStore ?? unavailableCredentialStore
    )
  }

  public getStatus(): IAgentServerStatus {
    const baseURL = this.getBaseURL()
    const lanBaseURL = this.getLANBaseURL()
    const siteURL = this.getRemoteSiteURL()
    const activePairing = this.getActivePairingSecret()
    const pairing: IAgentPairingStatus | null =
      this.mode === 'paired-lan' && baseURL !== null && activePairing !== null
        ? {
            code: activePairing.code,
            expiresAt: new Date(activePairing.expiresAt).toISOString(),
            qrURL: pairingURL(siteURL, activePairing.code, baseURL),
          }
        : null
    return {
      enabled: this.enabled,
      running: this.server !== null,
      port: this.port,
      preferredLANPort: this.preferredLANPort,
      mode: this.mode,
      baseURL,
      lanBaseURL,
      lanAddresses: this.lanAddresses,
      gatewayURL: this.gatewayURL,
      transport:
        this.mode === 'local'
          ? 'loopback-http'
          : this.gatewayURL === null
          ? 'lan-http'
          : 'https-gateway',
      siteURLSetting: this.remoteSiteURLSetting,
      siteURL,
      pairing,
      pairedDevices: this.devices.list(),
      token: this.token,
      configPath: this.configPath,
    }
  }

  public async loadPairedDevices(): Promise<IAgentServerStatus> {
    await this.devices.load()
    return this.getStatus()
  }

  public async start(): Promise<IAgentServerStatus> {
    await this.devices.load()
    this.enabled = true
    this.stopping = false
    if (this.server !== null) {
      return this.getStatus()
    }
    this.lanAddresses =
      this.mode === 'local' ? [] : [...this.resolveLANAddresses()]
    if (this.mode !== 'local' && this.lanAddresses.length === 0) {
      this.enabled = false
      throw new Error('No private LAN IPv4 address is available')
    }
    this.pairingSecret =
      this.mode === 'paired-lan' ? this.createPairingSecret() : null
    this.token ??= randomBytes(32).toString('hex')

    const server = Http.createServer((request, response) => {
      this.handleRequest(request, response).catch(error => {
        const status = error instanceof HTTPError ? error.status : 500
        const message =
          error instanceof HTTPError ? error.message : 'Internal server error'
        if (!response.headersSent) {
          writeJSON(response, status, {
            error: { code: `http_${status}`, message },
          })
        } else {
          response.end()
        }
      })
    })
    server.requestTimeout = 70_000
    server.headersTimeout = 10_000
    server.keepAliveTimeout = 5_000

    const bindAddress = this.mode === 'local' ? '127.0.0.1' : '0.0.0.0'
    const listen = (port: number) =>
      new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.off('error', onError)
          resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, bindAddress)
      })
    try {
      const requestedPort =
        this.mode === 'local' ? 0 : this.preferredLANPort ?? 0
      try {
        await listen(requestedPort)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (
          requestedPort !== 0 &&
          (code === 'EADDRINUSE' || code === 'EACCES')
        ) {
          await listen(0)
        } else {
          throw error
        }
      }
    } catch (error) {
      this.clearRuntimeState()
      throw error
    }

    const address = server.address()
    if (address === null || typeof address === 'string') {
      server.close()
      this.clearRuntimeState()
      throw new Error('Agent server did not receive a TCP port')
    }
    this.server = server
    this.port = address.port
    if (this.mode !== 'local') {
      this.preferredLANPort = address.port
    }
    try {
      await this.writeConfig()
    } catch (error) {
      this.server = null
      this.port = null
      this.token = null
      this.enabled = false
      this.pairingSecret = null
      this.lanAddresses = []
      await new Promise<void>(resolve => server.close(() => resolve()))
      throw error
    }
    return this.getStatus()
  }

  public async stop(): Promise<IAgentServerStatus> {
    this.enabled = false
    this.stopping = true
    const server = this.server
    this.server = null
    this.port = null
    this.token = null
    this.pairingSecret = null
    this.lanAddresses = []
    const stopped = agentCommandError('server_stopped', 'Agent server stopped')
    for (const queued of this.commandQueue.splice(0)) {
      queued.resolve(stopped)
    }
    if (server !== null) {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
        // An active renderer command may otherwise keep its HTTP socket open
        // until the 65/70-second command timeout. Shutdown owns these loopback
        // connections, so drain them immediately after refusing new work.
        server.closeIdleConnections()
        server.closeAllConnections()
      })
    }
    await Fs.rm(this.configPath, { force: true })
    return this.getStatus()
  }

  public async regenerateToken(): Promise<IAgentServerStatus> {
    this.token = randomBytes(32).toString('hex')
    if (this.server !== null) {
      await this.writeConfig()
    }
    return this.getStatus()
  }

  public async configure(
    configuration: IAgentServerConfiguration
  ): Promise<IAgentServerStatus> {
    if (
      configuration.mode !== 'local' &&
      configuration.mode !== 'paired-lan' &&
      configuration.mode !== 'yolo-lan'
    ) {
      throw new Error('Unknown agent server mode')
    }
    if (
      configuration.mode === 'yolo-lan' &&
      this.mode !== 'yolo-lan' &&
      configuration.yoloConfirmed !== true
    ) {
      throw new Error('YOLO LAN mode requires explicit confirmation')
    }
    if (configuration.mode === this.mode) {
      return this.getStatus()
    }

    const shouldRestart = this.server !== null
    const wasEnabled = this.enabled
    if (shouldRestart) {
      await this.stop()
    }
    // YOLO is intentionally a private-LAN-only escape hatch. Never let a
    // previously configured public gateway turn its no-auth surface into an
    // internet-facing endpoint.
    if (configuration.mode === 'yolo-lan') {
      this.gatewayURL = null
    }
    this.mode = configuration.mode
    if (wasEnabled) {
      return this.start()
    }
    this.notifyStatusChanged()
    return this.getStatus()
  }

  public async regeneratePairing(): Promise<IAgentServerStatus> {
    if (this.mode !== 'paired-lan' || this.server === null) {
      throw new Error(
        'Pairing is available only while paired LAN mode is running'
      )
    }
    this.pairingSecret = this.createPairingSecret()
    this.notifyStatusChanged()
    return this.getStatus()
  }

  public async revokeDevice(id: string): Promise<IAgentServerStatus> {
    await this.devices.revoke(id)
    this.notifyStatusChanged()
    return this.getStatus()
  }

  public async setGatewayURL(
    value: string | null
  ): Promise<IAgentServerStatus> {
    if (this.mode === 'yolo-lan' && value !== null && value.trim().length > 0) {
      throw new Error('HTTPS gateways are disabled in YOLO LAN mode')
    }
    this.gatewayURL =
      value === null || value.trim().length === 0
        ? null
        : normalizeGatewayURL(value.trim())
    if (this.server !== null) {
      await this.writeConfig()
    }
    this.notifyStatusChanged()
    return this.getStatus()
  }

  public async setRemoteSiteURL(value: string): Promise<IAgentServerStatus> {
    this.remoteSiteURLSetting = normalizeRemoteSiteURL(value.trim()).toString()
    if (this.server !== null) {
      await this.writeConfig()
    }
    this.notifyStatusChanged()
    return this.getStatus()
  }

  public setPreferredLANPort(value: number | null): IAgentServerStatus {
    if (
      value !== null &&
      (!Number.isInteger(value) || value < 1024 || value > 65535)
    ) {
      throw new Error('Preferred LAN port is invalid')
    }
    this.preferredLANPort = value
    return this.getStatus()
  }

  private async writeConfig(): Promise<void> {
    const port = this.port
    const token = this.token
    if (port === null || token === null) {
      return
    }
    await Fs.mkdir(Path.dirname(this.configPath), { recursive: true })
    const temporaryPath = `${this.configPath}.${process.pid}.tmp`
    const baseURL = this.getBaseURL()
    const lanBaseURL = this.getLANBaseURL()
    if (baseURL === null) {
      return
    }
    const value = {
      version: 2,
      port,
      preferredLanPort: this.preferredLANPort,
      token,
      pid: process.pid,
      mode: this.mode,
      baseUrl: baseURL,
      lanBaseUrl: lanBaseURL,
      gatewayUrl: this.gatewayURL,
      remoteSiteUrl: this.getRemoteSiteURL(),
      authenticationRequired: this.mode !== 'yolo-lan',
      mcpUrl: `${baseURL}/mcp`,
      restBaseUrl: `${baseURL}/api/v1`,
    }
    await Fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    await Fs.chmod(temporaryPath, 0o600)
    await Fs.rename(temporaryPath, this.configPath)
  }

  private async handleRequest(
    request: Http.IncomingMessage,
    response: Http.ServerResponse
  ): Promise<void> {
    this.validateNetworkRequest(request)
    this.applyOriginPolicy(request, response)
    const url = new URL(request.url ?? '/', 'http://agent.invalid')

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      })
      response.end()
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/remote/status') {
      this.writePublicRemoteStatus(response)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/remote/pair') {
      await this.handlePairRequest(request, response)
      return
    }

    if (!(await this.isAuthorized(request.headers.authorization))) {
      response.setHeader('WWW-Authenticate', 'Bearer')
      throw new HTTPError(401, 'Invalid bearer token')
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/info') {
      const namedFunctions = await this.listNamedAPIFunctions()
      writeJSON(response, 200, {
        name: 'desktop-material',
        version: 1,
        mcp: '/mcp',
        rest: '/api/v1/commands',
        legacyRest: '/api/v1/command/<name>',
        commands: [...AgentToolDefinitions.map(x => x.name), ...namedFunctions],
        limits: {
          bodyBytes: MaxBodyBytes,
          activeCommands: MaxActiveCommands,
          queuedCommands: MaxQueuedCommands,
        },
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/remote/devices') {
      writeJSON(response, 200, { devices: this.devices.list() })
      return
    }

    const devicePrefix = '/api/v1/remote/devices/'
    if (request.method === 'DELETE' && url.pathname.startsWith(devicePrefix)) {
      const id = this.decodePathComponent(
        url.pathname.slice(devicePrefix.length)
      )
      if (!(await this.devices.revoke(id))) {
        throw new HTTPError(404, 'Paired device not found')
      }
      this.notifyStatusChanged()
      response.writeHead(204, { 'Cache-Control': 'no-store' })
      response.end()
      return
    }

    if (request.method !== 'POST') {
      throw new HTTPError(404, 'Endpoint not found')
    }
    this.assertJSONRequest(request)
    const body = await readJSONBody(request)
    if (url.pathname === '/mcp') {
      const result = await handleMCPRequest(body, command =>
        this.enqueue(command)
      )
      if (result === undefined) {
        response.writeHead(202, { 'Cache-Control': 'no-store' })
        response.end()
      } else {
        writeJSON(response, 200, result)
      }
      return
    }

    if (url.pathname === '/api/v1/commands') {
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HTTPError(400, 'Command request must be an object')
      }
      const command = body as {
        readonly name?: unknown
        readonly args?: unknown
      }
      if (
        !Object.keys(body).every(key => key === 'name' || key === 'args') ||
        typeof command.name !== 'string'
      ) {
        throw new HTTPError(400, 'Command name must be a string')
      }
      const args = command.args ?? {}
      await this.handleRESTCommand(command.name, args, response)
      return
    }

    const prefix = '/api/v1/command/'
    if (!url.pathname.startsWith(prefix)) {
      throw new HTTPError(404, 'Endpoint not found')
    }
    const name = this.decodePathComponent(url.pathname.slice(prefix.length))
    await this.handleRESTCommand(name, body, response)
  }

  private validateNetworkRequest(request: Http.IncomingMessage): void {
    const remoteAddress = request.socket.remoteAddress
    if (this.mode === 'local') {
      if (!isLoopbackAddress(remoteAddress)) {
        throw new HTTPError(403, 'Loopback clients only')
      }
    } else if (
      !isLoopbackAddress(remoteAddress) &&
      !isPrivateIPv4(remoteAddress)
    ) {
      throw new HTTPError(403, 'Private-network clients only')
    }

    const host = request.headers.host?.toLowerCase()
    const allowedHosts = new Set<string>()
    if (this.port !== null) {
      allowedHosts.add(`127.0.0.1:${this.port}`)
      allowedHosts.add(`localhost:${this.port}`)
      for (const address of this.lanAddresses) {
        allowedHosts.add(`${address}:${this.port}`)
      }
    }
    if (this.gatewayURL !== null) {
      allowedHosts.add(new URL(this.gatewayURL).host.toLowerCase())
    }
    if (host === undefined || !allowedHosts.has(host)) {
      throw new HTTPError(403, 'Invalid Host header')
    }
  }

  private applyOriginPolicy(
    request: Http.IncomingMessage,
    response: Http.ServerResponse
  ): void {
    const origin = request.headers.origin
    if (origin === undefined) {
      return
    }
    const allowedOrigin = new URL(this.getRemoteSiteURL()).origin
    if (this.mode === 'local' || origin !== allowedOrigin) {
      throw new HTTPError(403, 'Origin is not accepted')
    }
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    response.setHeader('Access-Control-Allow-Private-Network', 'true')
    response.setHeader('Vary', 'Origin')
  }

  private async isAuthorized(header: string | undefined): Promise<boolean> {
    if (this.mode === 'yolo-lan') {
      return true
    }
    const supplied = bearerToken(header)
    if (supplied === null) {
      return false
    }
    if (this.token !== null && secretMatches(supplied, this.token)) {
      return true
    }
    return (
      this.mode === 'paired-lan' &&
      (await this.devices.authenticate(supplied)) !== null
    )
  }

  private writePublicRemoteStatus(response: Http.ServerResponse): void {
    const pairing = this.getActivePairingSecret()
    const status = this.getStatus()
    writeJSON(response, 200, {
      name: 'desktop-material',
      version: 1,
      mode: status.mode,
      authenticationRequired: status.mode !== 'yolo-lan',
      agentBaseURL: status.baseURL,
      lanBaseURL: status.lanBaseURL,
      transport: status.transport,
      transportEncrypted: status.transport === 'https-gateway',
      gateway:
        status.gatewayURL === null
          ? null
          : {
              url: status.gatewayURL,
              expectedHost: new URL(status.gatewayURL).host,
              hostPolicy:
                'Forward the gateway Host header or rewrite it to the selected LAN host.',
            },
      pairing:
        status.mode === 'paired-lan'
          ? {
              available: pairing !== null,
              expiresAt:
                pairing === null
                  ? null
                  : new Date(pairing.expiresAt).toISOString(),
            }
          : null,
      endpoints: {
        pair: '/api/v1/remote/pair',
        devices: '/api/v1/remote/devices',
        commands: '/api/v1/commands',
      },
    })
  }

  private async handlePairRequest(
    request: Http.IncomingMessage,
    response: Http.ServerResponse
  ): Promise<void> {
    if (this.mode !== 'paired-lan') {
      throw new HTTPError(404, 'Pairing is not available')
    }
    this.assertJSONRequest(request)
    const body = await readJSONBody(request)
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HTTPError(400, 'Pairing request must be an object')
    }
    const candidate = body as Partial<IAgentPairRequest>
    if (
      !Object.keys(body).every(key =>
        ['code', 'deviceName', 'stayLoggedIn'].includes(key)
      ) ||
      typeof candidate.code !== 'string' ||
      candidate.code.length === 0 ||
      candidate.code.length > 128 ||
      typeof candidate.deviceName !== 'string' ||
      (candidate.stayLoggedIn !== undefined &&
        typeof candidate.stayLoggedIn !== 'boolean')
    ) {
      throw new HTTPError(400, 'Pairing request is invalid')
    }
    const deviceName = candidate.deviceName.trim()
    if (
      deviceName.length === 0 ||
      deviceName.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(deviceName)
    ) {
      throw new HTTPError(400, 'Device name is invalid')
    }

    const clientAddress =
      normalizedIPv4(request.socket.remoteAddress) ?? 'unknown'
    this.assertPairingAttemptAllowed(clientAddress)
    const pairing = this.getActivePairingSecret()
    if (pairing === null) {
      throw new HTTPError(410, 'Pairing code is expired or already used')
    }
    if (!secretMatches(candidate.code, pairing.code)) {
      this.recordFailedPairingAttempt(clientAddress)
      throw new HTTPError(401, 'Pairing code is invalid')
    }

    // Consume before touching the credential vault so two concurrent requests
    // can never exchange the same one-time code.
    this.pairingSecret = null
    this.pairingAttempts.delete(clientAddress)
    this.notifyStatusChanged()
    const device: IAgentPairedDevice = {
      id: randomUUID(),
      name: deviceName,
      createdAt: new Date(this.now()).toISOString(),
    }
    const token = `${device.id}.${randomBytes(32).toString('base64url')}`
    await this.devices.add(device, token)
    this.notifyStatusChanged()
    const result: IAgentPairResult = {
      device,
      tokenType: 'Bearer',
      token,
    }
    // This is the sole response permitted to cross the redaction boundary. It
    // is no-store, never logged, and returned exactly once to the paired client.
    writeJSON(response, 201, result, false)
  }

  private assertJSONRequest(request: Http.IncomingMessage): void {
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        String(request.headers['content-type'] ?? '')
      )
    ) {
      throw new HTTPError(415, 'Content-Type must be application/json')
    }
  }

  private decodePathComponent(value: string): string {
    try {
      return decodeURIComponent(value)
    } catch {
      throw new HTTPError(400, 'Path component is invalid')
    }
  }

  private async handleRESTCommand(
    name: string,
    body: unknown,
    response: Http.ServerResponse
  ): Promise<void> {
    const customFunctionName = namedAPIFunctionNameFromTool(name)
    const commandName = isAgentCommandName(name) ? name : null
    if (commandName === null && customFunctionName === null) {
      throw new HTTPError(404, 'Unknown command')
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HTTPError(400, 'Command arguments must be an object')
    }
    try {
      assertSafeAgentArgs(body)
    } catch (error) {
      throw new HTTPError(
        400,
        error instanceof Error ? error.message : 'Invalid command arguments'
      )
    }
    const result = await this.enqueue({
      id: `rest-${randomUUID()}`,
      version: AgentCommandVersion,
      name: customFunctionName === null ? commandName! : 'invoke-api-function',
      args:
        customFunctionName === null
          ? (body as Readonly<Record<string, unknown>>)
          : {
              name: customFunctionName,
              arguments: body as Readonly<Record<string, unknown>>,
            },
    })
    writeJSON(response, result.ok ? 200 : 422, result)
  }

  private getLANBaseURL(): string | null {
    return this.mode !== 'local' &&
      this.port !== null &&
      this.lanAddresses.length > 0
      ? `http://${this.lanAddresses[0]}:${this.port}`
      : null
  }

  private getBaseURL(): string | null {
    if (this.port === null) {
      return null
    }
    if (this.mode === 'local') {
      return `http://127.0.0.1:${this.port}`
    }
    return this.gatewayURL ?? this.getLANBaseURL()
  }

  private getRemoteSiteURL(): string {
    const site = new URL(this.remoteSiteURLSetting)
    if (
      this.mode !== 'local' &&
      this.lanAddresses.length > 0 &&
      (site.hostname === '127.0.0.1' || site.hostname === 'localhost')
    ) {
      site.hostname = this.lanAddresses[0]
    }
    return site.toString()
  }

  private createPairingSecret(): {
    readonly code: string
    readonly expiresAt: number
  } {
    return {
      // 192 bits: comfortably above the 128-bit pairing requirement while
      // remaining compact enough for QR transfer and manual recovery entry.
      code: randomBytes(24).toString('base64url'),
      expiresAt: this.now() + PairingLifetimeMs,
    }
  }

  private getActivePairingSecret(): {
    readonly code: string
    readonly expiresAt: number
  } | null {
    if (
      this.pairingSecret !== null &&
      this.pairingSecret.expiresAt <= this.now()
    ) {
      this.pairingSecret = null
    }
    return this.pairingSecret
  }

  private assertPairingAttemptAllowed(address: string): void {
    const attempt = this.pairingAttempts.get(address)
    if (attempt === undefined) {
      return
    }
    const now = this.now()
    if (now - attempt.windowStartedAt >= 60_000) {
      this.pairingAttempts.delete(address)
      return
    }
    if (attempt.nextAllowedAt > now) {
      throw new HTTPError(429, 'Pairing attempts are temporarily limited')
    }
  }

  private recordFailedPairingAttempt(address: string): void {
    const now = this.now()
    const previous = this.pairingAttempts.get(address)
    const attempts =
      previous === undefined || now - previous.windowStartedAt >= 60_000
        ? 1
        : previous.attempts + 1
    this.pairingAttempts.set(address, {
      attempts,
      windowStartedAt:
        previous === undefined || now - previous.windowStartedAt >= 60_000
          ? now
          : previous.windowStartedAt,
      nextAllowedAt: now + Math.min(500 * 2 ** (attempts - 1), 30_000),
    })
    if (this.pairingAttempts.size > 256) {
      const oldest = this.pairingAttempts.keys().next().value
      if (oldest !== undefined) {
        this.pairingAttempts.delete(oldest)
      }
    }
  }

  private clearRuntimeState(): void {
    this.server = null
    this.port = null
    this.token = null
    this.enabled = false
    this.pairingSecret = null
    this.lanAddresses = []
  }

  private notifyStatusChanged(): void {
    this.onStatusChanged?.(this.getStatus())
  }

  private async listNamedAPIFunctions(): Promise<ReadonlyArray<string>> {
    const result = await this.enqueue({
      id: `catalog-${randomUUID()}`,
      version: AgentCommandVersion,
      name: 'list-api-functions',
      args: {},
    })
    if (!result.ok || !Array.isArray(result.data)) {
      return []
    }
    const names: Array<string> = []
    for (const value of result.data) {
      if (
        value === null ||
        typeof value !== 'object' ||
        typeof (value as { name?: unknown }).name !== 'string'
      ) {
        continue
      }
      try {
        names.push(namedAPIFunctionToolName((value as { name: string }).name))
      } catch {
        // Ignore a malformed renderer catalog entry rather than advertising a
        // route that the strict command parser will reject.
      }
    }
    return names
  }

  private enqueue(command: IAgentCommandEnvelope): Promise<AgentCommandResult> {
    if (this.stopping) {
      return Promise.resolve(
        agentCommandError('server_stopped', 'Agent server stopped')
      )
    }
    if (
      this.activeCommands >= MaxActiveCommands &&
      this.commandQueue.length >= MaxQueuedCommands
    ) {
      return Promise.resolve(
        agentCommandError('queue_full', 'The agent command queue is full', true)
      )
    }
    return new Promise(resolve => {
      this.commandQueue.push({ command, resolve })
      this.drainQueue()
    })
  }

  private drainQueue(): void {
    while (
      this.activeCommands < MaxActiveCommands &&
      this.commandQueue.length > 0
    ) {
      const queued = this.commandQueue.shift()!
      this.activeCommands++
      this.executeCommand(queued.command)
        .then(result =>
          queued.resolve(redactAgentValue(result) as AgentCommandResult)
        )
        .catch(error =>
          queued.resolve(
            agentCommandError(
              'execution_failed',
              error instanceof Error
                ? error.message
                : 'Command execution failed'
            )
          )
        )
        .finally(() => {
          this.activeCommands--
          this.drainQueue()
        })
    }
  }
}
