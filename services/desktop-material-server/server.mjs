import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const ApiVersion = 1
const MaximumBodyBytes = 16 * 1024
const MaximumDevices = 500
const DefaultJoinLifetimeMs = 15 * 60 * 1000
const MaximumJoinLifetimeMs = 24 * 60 * 60 * 1000
const FailedJoinWindowMs = 60 * 1000
const MaximumFailedJoinsPerWindow = 10
const PresenceStaleMs = 2 * 60 * 1000
const MaximumWorkspaces = 200
const ValidPresenceStatuses = ['online', 'away']
const ValidPresenceActivities = [
  'idle',
  'reviewing',
  'committing',
  'branching',
  'syncing',
]

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key))
  )
}

function requiredString(value, field, maximum = 512) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.includes('\0')
  ) {
    throw new Error(`Invalid server configuration field: ${field}`)
  }
  return value
}

function normalizeDeviceName(value) {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length >= 1 && normalized.length <= 80 ? normalized : null
}

function isLoopbackHost(host) {
  const normalized = host.toLowerCase()
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'localhost'
  )
}

export function hashSecret(secret) {
  return createHash('sha256').update(secret, 'utf8').digest('base64url')
}

function secretMatches(secret, expectedHash) {
  const actual = Buffer.from(hashSecret(secret), 'utf8')
  const expected = Buffer.from(expectedHash, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function randomSecret() {
  return randomBytes(32).toString('base64url')
}

async function loadConfiguration(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'))
  if (
    !hasExactKeys(parsed, [
      'version',
      'serverId',
      'publicOrigin',
      'adminTokenHash',
      'initialJoinTokenHash',
      'initialJoinExpiresAt',
      'allowInsecureHttp',
      'transport',
    ]) ||
    parsed.version !== ApiVersion
  ) {
    throw new Error('Unsupported self-hosted server configuration')
  }

  const publicOrigin = new URL(
    requiredString(parsed.publicOrigin, 'publicOrigin', 2_048)
  )
  if (publicOrigin.username || publicOrigin.password || publicOrigin.hash) {
    throw new Error(
      'The public server origin contains credentials or a fragment'
    )
  }
  if (publicOrigin.pathname !== '/' || publicOrigin.search.length > 0) {
    throw new Error('The public server origin must not contain a path or query')
  }
  if (
    publicOrigin.protocol !== 'https:' &&
    !(
      parsed.allowInsecureHttp === true &&
      publicOrigin.protocol === 'http:' &&
      isLoopbackHost(publicOrigin.hostname)
    )
  ) {
    throw new Error('The public server origin must use HTTPS')
  }
  if (parsed.transport !== 'direct' && parsed.transport !== 'reverse-proxy') {
    throw new Error('Invalid self-hosted server transport')
  }

  const initialJoinExpiresAt = Date.parse(
    requiredString(parsed.initialJoinExpiresAt, 'initialJoinExpiresAt', 64)
  )
  if (!Number.isFinite(initialJoinExpiresAt)) {
    throw new Error('Invalid initial join expiry')
  }

  return {
    version: ApiVersion,
    serverId: requiredString(parsed.serverId, 'serverId', 128),
    publicOrigin: publicOrigin.origin,
    adminTokenHash: requiredString(
      parsed.adminTokenHash,
      'adminTokenHash',
      128
    ),
    initialJoinTokenHash: requiredString(
      parsed.initialJoinTokenHash,
      'initialJoinTokenHash',
      128
    ),
    initialJoinExpiresAt: new Date(initialJoinExpiresAt).toISOString(),
    allowInsecureHttp: parsed.allowInsecureHttp === true,
    transport: parsed.transport,
  }
}

function initialState(configuration) {
  return {
    version: ApiVersion,
    joinTokenHash: configuration.initialJoinTokenHash,
    joinExpiresAt: configuration.initialJoinExpiresAt,
    joinConsumedAt: null,
    devices: [],
    presence: [],
    workspaces: [],
  }
}

function validateState(value) {
  if (
    !hasExactKeys(value, [
      'version',
      'joinTokenHash',
      'joinExpiresAt',
      'joinConsumedAt',
      'devices',
      'presence',
      'workspaces',
    ]) ||
    value.version !== ApiVersion ||
    typeof value.joinTokenHash !== 'string' ||
    typeof value.joinExpiresAt !== 'string' ||
    (value.joinConsumedAt !== null &&
      typeof value.joinConsumedAt !== 'string') ||
    !Array.isArray(value.devices) ||
    value.devices.length > MaximumDevices ||
    !Array.isArray(value.presence) ||
    value.presence.length > MaximumDevices ||
    !Array.isArray(value.workspaces) ||
    value.workspaces.length > MaximumWorkspaces
  ) {
    throw new Error('Invalid self-hosted server state')
  }
  for (const device of value.devices) {
    if (
      !hasExactKeys(device, ['id', 'name', 'tokenHash', 'createdAt']) ||
      typeof device.id !== 'string' ||
      normalizeDeviceName(device.name) !== device.name ||
      typeof device.tokenHash !== 'string' ||
      !Number.isFinite(Date.parse(device.createdAt))
    ) {
      throw new Error('Invalid self-hosted device state')
    }
  }
  for (const entry of value.presence) {
    if (
      !hasExactKeys(entry, ['deviceId', 'status', 'activity', 'updatedAt']) ||
      typeof entry.deviceId !== 'string' ||
      !ValidPresenceStatuses.includes(entry.status) ||
      (entry.activity !== null &&
        !ValidPresenceActivities.includes(entry.activity)) ||
      !Number.isFinite(Date.parse(entry.updatedAt))
    ) {
      throw new Error('Invalid self-hosted presence state')
    }
  }
  for (const workspace of value.workspaces) {
    if (
      !hasExactKeys(workspace, [
        'tokenHash',
        'name',
        'ownerDeviceId',
        'repositoryUrl',
        'branch',
        'createdAt',
      ]) ||
      typeof workspace.tokenHash !== 'string' ||
      normalizeDeviceName(workspace.name) !== workspace.name ||
      typeof workspace.ownerDeviceId !== 'string' ||
      typeof workspace.repositoryUrl !== 'string' ||
      (workspace.branch !== null && typeof workspace.branch !== 'string') ||
      !Number.isFinite(Date.parse(workspace.createdAt))
    ) {
      throw new Error('Invalid self-hosted workspace state')
    }
  }
  return value
}

class AtomicStateStore {
  constructor(path, configuration) {
    this.path = path
    this.configuration = configuration
    this.pending = Promise.resolve()
  }

  async read() {
    try {
      return validateState(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
      const state = initialState(this.configuration)
      await this.write(state)
      return state
    }
  }

  async write(state) {
    validateState(state)
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await rename(temporaryPath, this.path)
  }

  mutate(mutator) {
    const operation = this.pending.then(async () => {
      const state = await this.read()
      const result = await mutator(state)
      await this.write(state)
      return result
    })
    this.pending = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }
}

class FailedJoinLimiter {
  constructor(clock) {
    this.clock = clock
    this.attempts = new Map()
  }

  blocked(address) {
    const now = this.clock()
    const recent = (this.attempts.get(address) ?? []).filter(
      timestamp => now - timestamp < FailedJoinWindowMs
    )
    this.attempts.set(address, recent)
    return recent.length >= MaximumFailedJoinsPerWindow
  }

  record(address) {
    const attempts = this.attempts.get(address) ?? []
    attempts.push(this.clock())
    this.attempts.set(address, attempts.slice(-MaximumFailedJoinsPerWindow))
  }

  clear(address) {
    this.attempts.delete(address)
  }
}

function securityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', "default-src 'none'")
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
}

function sendJson(response, status, body) {
  const data = Buffer.from(JSON.stringify(body), 'utf8')
  securityHeaders(response)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', data.length)
  response.end(data)
}

async function readJson(request) {
  if (
    request.headers['content-type']?.split(';', 1)[0].trim() !==
    'application/json'
  ) {
    const error = new Error('JSON content type required')
    error.statusCode = 415
    throw error
  }
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (declaredLength > MaximumBodyBytes) {
    const error = new Error('Request body is too large')
    error.statusCode = 413
    throw error
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MaximumBodyBytes) {
      const error = new Error('Request body is too large')
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Malformed JSON')
    error.statusCode = 400
    throw error
  }
}

function bearerToken(request) {
  const authorization = request.headers.authorization
  if (typeof authorization !== 'string') {
    return null
  }
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization)
  return match?.[1] ?? null
}

function requestAddress(request) {
  return request.socket.remoteAddress ?? 'unknown'
}

function sanitizeLifetime(value) {
  if (value === undefined) {
    return DefaultJoinLifetimeMs
  }
  return Number.isSafeInteger(value) && value >= 60_000
    ? Math.min(value, MaximumJoinLifetimeMs)
    : null
}

function joinUrl(publicOrigin, token) {
  const url = new URL('/join', publicOrigin)
  url.hash = `token=${encodeURIComponent(token)}`
  return url.toString()
}

function normalizeWorkspaceName(value) {
  return normalizeDeviceName(value)
}

function normalizeRepositoryUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    return null
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'ssh:') {
      return null
    }
  } catch {
    return null
  }
  return value
}

function normalizeBranchName(value) {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    return null
  }
  return value
}

function presenceOf(state, deviceId) {
  return state.presence.find(entry => entry.deviceId === deviceId) ?? null
}

function teamMemberView(device, presenceEntry, now) {
  const stale =
    presenceEntry === null ||
    now - Date.parse(presenceEntry.updatedAt) > PresenceStaleMs
  return {
    deviceId: device.id,
    deviceName: device.name,
    status: stale ? 'offline' : presenceEntry.status,
    activity: stale ? null : presenceEntry.activity,
    updatedAt: presenceEntry?.updatedAt ?? null,
  }
}

export async function createDesktopMaterialServer(options) {
  const clock = options.clock ?? Date.now
  const logger = options.logger ?? { info: () => {}, error: () => {} }
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 8787
  const configuration = await loadConfiguration(options.configPath)
  if (
    options.tls === undefined &&
    !isLoopbackHost(host) &&
    configuration.transport !== 'reverse-proxy'
  ) {
    throw new Error(
      'A non-loopback server requires TLS or a declared reverse proxy'
    )
  }
  const store = new AtomicStateStore(options.statePath, configuration)
  await store.read()
  const limiter = new FailedJoinLimiter(clock)

  async function authenticatedDevice(request) {
    const token = bearerToken(request)
    if (token === null) {
      return null
    }
    const state = await store.read()
    return (
      state.devices.find(device => secretMatches(token, device.tokenHash)) ??
      null
    )
  }

  async function handle(request, response) {
    const requestId = randomUUID()
    const startedAt = clock()
    let status = 500
    let pathname = '/invalid'
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost')
      pathname = requestUrl.pathname

      if (request.method === 'GET' && pathname === '/healthz') {
        const state = await store.read()
        status = 200
        sendJson(response, status, {
          status: 'ok',
          version: ApiVersion,
          serverId: configuration.serverId,
          joinAvailable:
            state.joinConsumedAt === null &&
            Date.parse(state.joinExpiresAt) > clock(),
        })
        return
      }

      if (request.method === 'POST' && pathname === '/v1/join') {
        const address = requestAddress(request)
        if (limiter.blocked(address)) {
          status = 429
          sendJson(response, status, { error: 'join-rate-limited' })
          return
        }
        const body = await readJson(request)
        const token = typeof body?.token === 'string' ? body.token : ''
        const name = normalizeDeviceName(body?.deviceName)
        if (name === null || token.length < 32 || token.length > 256) {
          limiter.record(address)
          status = 400
          sendJson(response, status, { error: 'invalid-join-request' })
          return
        }

        const result = await store.mutate(state => {
          if (
            state.joinConsumedAt !== null ||
            Date.parse(state.joinExpiresAt) <= clock() ||
            !secretMatches(token, state.joinTokenHash)
          ) {
            return null
          }
          if (state.devices.length >= MaximumDevices) {
            return { error: 'device-limit-reached' }
          }
          const deviceToken = randomSecret()
          const device = {
            id: randomUUID(),
            name,
            tokenHash: hashSecret(deviceToken),
            createdAt: new Date(clock()).toISOString(),
          }
          state.joinConsumedAt = new Date(clock()).toISOString()
          state.devices.push(device)
          return { device, deviceToken }
        })
        if (result === null) {
          limiter.record(address)
          status = 401
          sendJson(response, status, { error: 'join-denied' })
          return
        }
        if (result.error !== undefined) {
          status = 409
          sendJson(response, status, { error: result.error })
          return
        }
        limiter.clear(address)
        status = 201
        sendJson(response, status, {
          serverId: configuration.serverId,
          deviceId: result.device.id,
          deviceName: result.device.name,
          deviceToken: result.deviceToken,
        })
        return
      }

      if (request.method === 'POST' && pathname === '/v1/admin/join-links') {
        const token = bearerToken(request)
        if (
          token === null ||
          !secretMatches(token, configuration.adminTokenHash)
        ) {
          status = 401
          sendJson(response, status, { error: 'admin-auth-required' })
          return
        }
        const body = await readJson(request)
        const lifetimeMs = sanitizeLifetime(body?.lifetimeMs)
        if (lifetimeMs === null) {
          status = 400
          sendJson(response, status, { error: 'invalid-join-lifetime' })
          return
        }
        const newToken = randomSecret()
        const expiresAt = new Date(clock() + lifetimeMs).toISOString()
        await store.mutate(state => {
          state.joinTokenHash = hashSecret(newToken)
          state.joinExpiresAt = expiresAt
          state.joinConsumedAt = null
        })
        status = 201
        sendJson(response, status, {
          joinUrl: joinUrl(configuration.publicOrigin, newToken),
          expiresAt,
        })
        return
      }

      if (request.method === 'GET' && pathname === '/v1/whoami') {
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        status = 200
        sendJson(response, status, {
          serverId: configuration.serverId,
          deviceId: device.id,
          deviceName: device.name,
        })
        return
      }

      if (request.method === 'GET' && pathname === '/v1/capabilities') {
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        status = 200
        sendJson(response, status, {
          version: ApiVersion,
          capabilities: {
            identity: false,
            collaboration: true,
            patches: false,
            storage: false,
          },
        })
        return
      }

      if (request.method === 'POST' && pathname === '/v1/team/heartbeat') {
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        const body = await readJson(request)
        const requestedStatus =
          typeof body?.status === 'string' ? body.status : 'online'
        const activity = body?.activity === undefined ? null : body.activity
        if (
          !ValidPresenceStatuses.includes(requestedStatus) ||
          (activity !== null && !ValidPresenceActivities.includes(activity))
        ) {
          status = 400
          sendJson(response, status, { error: 'invalid-heartbeat' })
          return
        }
        const updatedAt = new Date(clock()).toISOString()
        await store.mutate(state => {
          const existing = state.presence.find(
            entry => entry.deviceId === device.id
          )
          if (existing) {
            existing.status = requestedStatus
            existing.activity = activity
            existing.updatedAt = updatedAt
          } else {
            state.presence.push({
              deviceId: device.id,
              status: requestedStatus,
              activity,
              updatedAt,
            })
          }
        })
        status = 200
        sendJson(response, status, { ok: true, updatedAt })
        return
      }

      if (request.method === 'GET' && pathname === '/v1/team/members') {
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        const state = await store.read()
        const now = clock()
        status = 200
        sendJson(response, status, {
          members: state.devices.map(entry =>
            teamMemberView(entry, presenceOf(state, entry.id), now)
          ),
        })
        return
      }

      if (request.method === 'POST' && pathname === '/v1/workspaces') {
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        const body = await readJson(request)
        const name = normalizeWorkspaceName(body?.name)
        const repositoryUrl = normalizeRepositoryUrl(body?.repositoryUrl)
        const branch = normalizeBranchName(body?.branch)
        if (name === null || repositoryUrl === null) {
          status = 400
          sendJson(response, status, { error: 'invalid-workspace-request' })
          return
        }
        const result = await store.mutate(state => {
          if (state.workspaces.length >= MaximumWorkspaces) {
            return { error: 'workspace-limit-reached' }
          }
          const shareToken = randomSecret()
          const workspace = {
            tokenHash: hashSecret(shareToken),
            name,
            ownerDeviceId: device.id,
            repositoryUrl,
            branch,
            createdAt: new Date(clock()).toISOString(),
          }
          state.workspaces.push(workspace)
          return { workspace, shareToken }
        })
        if (result.error !== undefined) {
          status = 409
          sendJson(response, status, { error: result.error })
          return
        }
        status = 201
        sendJson(response, status, {
          name: result.workspace.name,
          repositoryUrl: result.workspace.repositoryUrl,
          branch: result.workspace.branch,
          shareToken: result.shareToken,
          shareUrl: `x-github-client://openteamworkspace/${encodeURIComponent(
            result.shareToken
          )}?server=${encodeURIComponent(configuration.publicOrigin)}`,
        })
        return
      }

      if (
        request.method === 'GET' &&
        pathname.startsWith('/v1/workspaces/')
      ) {
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        const shareToken = decodeURIComponent(
          pathname.slice('/v1/workspaces/'.length)
        )
        if (shareToken.length < 32 || shareToken.length > 256) {
          status = 404
          sendJson(response, status, { error: 'workspace-not-found' })
          return
        }
        const state = await store.read()
        const workspace = state.workspaces.find(entry =>
          secretMatches(shareToken, entry.tokenHash)
        )
        if (workspace === undefined) {
          status = 404
          sendJson(response, status, { error: 'workspace-not-found' })
          return
        }
        status = 200
        sendJson(response, status, {
          name: workspace.name,
          repositoryUrl: workspace.repositoryUrl,
          branch: workspace.branch,
          createdAt: workspace.createdAt,
        })
        return
      }

      status = 404
      sendJson(response, status, { error: 'not-found' })
    } catch (error) {
      status = Number.isSafeInteger(error?.statusCode) ? error.statusCode : 500
      if (status === 500) {
        logger.error({
          requestId,
          pathname,
          error: error?.message ?? 'unknown',
        })
      }
      if (!response.headersSent) {
        sendJson(response, status, {
          error: status === 500 ? 'internal-error' : error.message,
        })
      } else {
        response.destroy()
      }
    } finally {
      logger.info({
        requestId,
        method: request.method,
        pathname,
        status,
        durationMs: Math.max(0, clock() - startedAt),
      })
    }
  }

  const server = options.tls
    ? createHttpsServer(options.tls, (request, response) => {
        void handle(request, response)
      })
    : createHttpServer((request, response) => {
        void handle(request, response)
      })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  const actualPort =
    typeof address === 'object' && address ? address.port : port
  return {
    server,
    configuration,
    origin: `${options.tls ? 'https' : 'http'}://${
      host.includes(':') ? `[${host}]` : host
    }:${actualPort}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      ),
  }
}

async function main() {
  const configPath = process.env.DESKTOP_MATERIAL_SERVER_CONFIG
  const statePath = process.env.DESKTOP_MATERIAL_SERVER_STATE
  if (!configPath || !statePath) {
    throw new Error('Server configuration and state paths are required')
  }
  const host = process.env.DESKTOP_MATERIAL_SERVER_HOST ?? '127.0.0.1'
  const port = Number(process.env.DESKTOP_MATERIAL_SERVER_PORT ?? '8787')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid self-hosted server port')
  }
  await createDesktopMaterialServer({
    configPath,
    statePath,
    host,
    port,
    logger: {
      info: record => console.log(JSON.stringify(record)),
      error: record => console.error(JSON.stringify(record)),
    },
  })
  console.log(
    JSON.stringify({ event: 'desktop-material-server-ready', host, port })
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(
      JSON.stringify({
        event: 'desktop-material-server-failed',
        error: error instanceof Error ? error.message : 'unknown',
      })
    )
    process.exitCode = 1
  })
}
