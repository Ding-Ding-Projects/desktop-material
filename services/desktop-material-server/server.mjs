import {
  createHash,
  createPrivateKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  SelfHostedOAuthAuthority,
  SelfHostedOAuthError,
  SelfHostedSsoSessionStore,
  signIdToken,
} from './oauth.mjs'
import {
  CloudPatchMaximumArtifactBytes,
  CloudPatchStoreError,
  createCloudPatchStore,
} from './cloud-patch-store.mjs'

const ApiVersion = 1
const MaximumBodyBytes = 16 * 1024
const MaximumPatchBodyBytes = CloudPatchMaximumArtifactBytes + 8 * 1024
const MaximumDevices = 500
const DefaultJoinLifetimeMs = 15 * 60 * 1000
const MaximumJoinLifetimeMs = 24 * 60 * 60 * 1000
const FailedJoinWindowMs = 60 * 1000
const MaximumFailedJoinsPerWindow = 10
const DefaultPatchShareLifetimeMs = 24 * 60 * 60 * 1000
const MaximumPatchShareLifetimeMs = 7 * 24 * 60 * 60 * 1000
const PatchShareIdPattern = /^cp_[a-f0-9]{64}$/
const CloudPatchStoreErrorStatus = {
  'invalid-configuration': 500,
  'invalid-input': 400,
  'invalid-expiry': 400,
  'digest-mismatch': 400,
  'capacity-exceeded': 507,
  'access-denied': 404,
  'revoke-denied': 404,
  'corrupt-store': 500,
  'integrity-failure': 500,
  'storage-failure': 500,
  'randomness-failure': 500,
}

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

const RequiredConfigurationKeys = [
  'version',
  'serverId',
  'publicOrigin',
  'adminTokenHash',
  'initialJoinTokenHash',
  'initialJoinExpiresAt',
  'allowInsecureHttp',
  'transport',
]
// OAuth key material is optional: an older bootstrap, or one written before
// the wizard grew OAuth provisioning, simply runs without the identity
// capability. All four fields must be present together or not at all.
const OptionalOAuthConfigurationKeys = [
  'oauthClientsJson',
  'oauthSigningKeyPem',
  'oauthSigningPublicJwkJson',
  'oauthKeyId',
]
// Cloud Patch storage is optional too: a server bootstrapped before this
// capability existed simply runs without patch storage/sharing endpoints.
const OptionalCloudPatchConfigurationKeys = ['cloudPatchEncryptionKeyBase64']

function hasValidConfigurationKeys(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const keys = Object.keys(value)
  if (!RequiredConfigurationKeys.every(key => keys.includes(key))) {
    return false
  }
  const oauthKeysPresent = OptionalOAuthConfigurationKeys.filter(key =>
    keys.includes(key)
  )
  if (
    oauthKeysPresent.length !== 0 &&
    oauthKeysPresent.length !== OptionalOAuthConfigurationKeys.length
  ) {
    return false
  }
  const allowedKeys = [
    ...RequiredConfigurationKeys,
    ...OptionalOAuthConfigurationKeys,
    ...OptionalCloudPatchConfigurationKeys,
  ]
  return keys.every(key => allowedKeys.includes(key))
}

function parseCloudPatchEncryptionKey(parsed) {
  if (
    !Object.prototype.hasOwnProperty.call(
      parsed,
      'cloudPatchEncryptionKeyBase64'
    )
  ) {
    return null
  }
  const encoded = requiredString(
    parsed.cloudPatchEncryptionKeyBase64,
    'cloudPatchEncryptionKeyBase64',
    64
  )
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error('Invalid Cloud Patch encryption key')
  }
  const key = Buffer.from(encoded, 'base64url')
  if (key.byteLength !== 32) {
    throw new Error('Invalid Cloud Patch encryption key')
  }
  return key
}

function parseOAuthConfiguration(parsed) {
  if (!Object.prototype.hasOwnProperty.call(parsed, 'oauthClientsJson')) {
    return null
  }
  const clientsJson = requiredString(
    parsed.oauthClientsJson,
    'oauthClientsJson',
    16_384
  )
  let clients
  try {
    clients = JSON.parse(clientsJson)
  } catch {
    throw new Error('Invalid OAuth client configuration')
  }
  if (!Array.isArray(clients) || clients.length < 1 || clients.length > 32) {
    throw new Error('Invalid OAuth client configuration')
  }
  const signingKeyPem = requiredString(
    parsed.oauthSigningKeyPem,
    'oauthSigningKeyPem',
    4_096
  )
  let privateKey
  try {
    privateKey = createPrivateKey(signingKeyPem)
  } catch {
    throw new Error('Invalid OAuth signing key')
  }
  if (privateKey.asymmetricKeyType !== 'ec') {
    throw new Error('Invalid OAuth signing key')
  }
  const publicJwkJson = requiredString(
    parsed.oauthSigningPublicJwkJson,
    'oauthSigningPublicJwkJson',
    2_048
  )
  let publicJwk
  try {
    publicJwk = JSON.parse(publicJwkJson)
  } catch {
    throw new Error('Invalid OAuth signing public key')
  }
  if (
    !hasExactKeys(publicJwk, ['kty', 'crv', 'x', 'y']) ||
    publicJwk.kty !== 'EC' ||
    publicJwk.crv !== 'P-256' ||
    typeof publicJwk.x !== 'string' ||
    typeof publicJwk.y !== 'string'
  ) {
    throw new Error('Invalid OAuth signing public key')
  }
  const keyId = requiredString(parsed.oauthKeyId, 'oauthKeyId', 128)
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(keyId)) {
    throw new Error('Invalid OAuth signing key id')
  }
  return {
    clients,
    signingKeyPem,
    publicJwk: { ...publicJwk, kid: keyId },
    keyId,
  }
}

async function loadConfiguration(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'))
  if (!hasValidConfigurationKeys(parsed) || parsed.version !== ApiVersion) {
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
    oauth: parseOAuthConfiguration(parsed),
    cloudPatchEncryptionKey: parseCloudPatchEncryptionKey(parsed),
  }
}

function initialState(configuration) {
  return {
    version: ApiVersion,
    joinTokenHash: configuration.initialJoinTokenHash,
    joinExpiresAt: configuration.initialJoinExpiresAt,
    joinConsumedAt: null,
    devices: [],
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
    ]) ||
    value.version !== ApiVersion ||
    typeof value.joinTokenHash !== 'string' ||
    typeof value.joinExpiresAt !== 'string' ||
    (value.joinConsumedAt !== null &&
      typeof value.joinConsumedAt !== 'string') ||
    !Array.isArray(value.devices) ||
    value.devices.length > MaximumDevices
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

async function readJson(request, maximumBytes = MaximumBodyBytes) {
  if (
    request.headers['content-type']?.split(';', 1)[0].trim() !==
    'application/json'
  ) {
    const error = new Error('JSON content type required')
    error.statusCode = 415
    throw error
  }
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (declaredLength > maximumBytes) {
    const error = new Error('Request body is too large')
    error.statusCode = 413
    throw error
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maximumBytes) {
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

function statusForCloudPatchError(error) {
  if (error instanceof CloudPatchStoreError) {
    return CloudPatchStoreErrorStatus[error.code] ?? 500
  }
  return 500
}

function cloudPatchErrorCode(error) {
  return error instanceof CloudPatchStoreError ? error.code : 'storage-failure'
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
  const oauthAuthority =
    configuration.oauth === null
      ? null
      : new SelfHostedOAuthAuthority({
          issuer: configuration.publicOrigin,
          clients: configuration.oauth.clients,
          clock,
        })
  const ssoSessions =
    configuration.oauth === null ? null : new SelfHostedSsoSessionStore(clock)
  const cloudPatchDataDirectory =
    options.cloudPatchDataDirectory ??
    `${dirname(options.statePath)}/cloud-patches`
  const cloudPatchStore =
    configuration.cloudPatchEncryptionKey === null
      ? null
      : await createCloudPatchStore({
          dataDirectory: cloudPatchDataDirectory,
          encryptionKey: configuration.cloudPatchEncryptionKey,
          clock,
          randomBytes: length => randomBytes(length),
        })

  function requireAdmin(request) {
    const authorization = request.headers.authorization
    if (typeof authorization !== 'string') {
      return false
    }
    const match = /^Basic ([A-Za-z0-9+/]+=*)$/.exec(authorization)
    if (match === null) {
      return false
    }
    let decoded
    try {
      decoded = Buffer.from(match[1], 'base64').toString('utf8')
    } catch {
      return false
    }
    const separator = decoded.indexOf(':')
    if (separator === -1) {
      return false
    }
    const username = decoded.slice(0, separator)
    const password = decoded.slice(separator + 1)
    return (
      username === 'admin' &&
      password.length >= 32 &&
      password.length <= 256 &&
      secretMatches(password, configuration.adminTokenHash)
    )
  }

  /**
   * The only identity this server issues OAuth grants for today is its own
   * administrator — the operator who holds the vaulted admin credential. A
   * self-hosted single-tenant server has exactly one trusted human at
   * bootstrap; broader per-user accounts are not implemented.
   */
  const OAuthAdminSubject = 'admin'

  function parseCookies(request) {
    const header = request.headers.cookie
    const cookies = new Map()
    if (typeof header !== 'string') {
      return cookies
    }
    for (const part of header.split(';')) {
      const separator = part.indexOf('=')
      if (separator === -1) {
        continue
      }
      cookies.set(
        part.slice(0, separator).trim(),
        part.slice(separator + 1).trim()
      )
    }
    return cookies
  }

  function ssoCookieHeader(sessionId) {
    const attributes = [
      `dm_sso=${sessionId}`,
      'Path=/oauth',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${8 * 60 * 60}`,
    ]
    if (!configuration.allowInsecureHttp) {
      attributes.push('Secure')
    }
    return attributes.join('; ')
  }

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
            identity: oauthAuthority !== null,
            collaboration: false,
            patches: cloudPatchStore !== null,
            storage: cloudPatchStore !== null,
          },
        })
        return
      }

      if (request.method === 'POST' && pathname === '/v1/patches') {
        if (cloudPatchStore === null) {
          status = 404
          sendJson(response, status, { error: 'not-found' })
          return
        }
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        const body = await readJson(request, MaximumPatchBodyBytes)
        const allowedPatchUploadKeys = [
          'recipientDeviceIds',
          'expectedArtifactSha256',
          'artifactBase64',
          'lifetimeMs',
        ]
        if (
          body === null ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          !Object.keys(body).every(key => allowedPatchUploadKeys.includes(key)) ||
          !['recipientDeviceIds', 'expectedArtifactSha256', 'artifactBase64'].every(
            key => Object.prototype.hasOwnProperty.call(body, key)
          ) ||
          typeof body.artifactBase64 !== 'string'
        ) {
          status = 400
          sendJson(response, status, { error: 'invalid-patch-upload' })
          return
        }
        if (
          !/^[A-Za-z0-9_-]*$/.test(body.artifactBase64) ||
          body.artifactBase64.length > MaximumPatchBodyBytes
        ) {
          status = 400
          sendJson(response, status, { error: 'invalid-patch-encoding' })
          return
        }
        const artifact = Buffer.from(body.artifactBase64, 'base64url')
        const lifetimeMs =
          body.lifetimeMs === undefined
            ? DefaultPatchShareLifetimeMs
            : body.lifetimeMs
        if (
          !Number.isSafeInteger(lifetimeMs) ||
          lifetimeMs < 60_000 ||
          lifetimeMs > MaximumPatchShareLifetimeMs
        ) {
          status = 400
          sendJson(response, status, { error: 'invalid-patch-lifetime' })
          return
        }
        try {
          const share = await cloudPatchStore.createShare({
            ownerDeviceId: device.id,
            recipientDeviceIds: body.recipientDeviceIds,
            expectedArtifactSha256: body.expectedArtifactSha256,
            artifact: Uint8Array.from(artifact),
            expiresAtMs: clock() + lifetimeMs,
          })
          status = 201
          sendJson(response, status, {
            shareId: share.shareId,
            shareSecret: share.shareSecret,
            shareUrl: `${configuration.publicOrigin}/patches/${share.shareId}#${share.shareSecret}`,
            expiresAtMs: share.expiresAtMs,
          })
        } catch (error) {
          status = statusForCloudPatchError(error)
          sendJson(response, status, {
            error: cloudPatchErrorCode(error),
          })
        }
        return
      }

      if (
        request.method === 'GET' &&
        /^\/v1\/patches\/cp_[a-f0-9]{64}$/.test(pathname)
      ) {
        if (cloudPatchStore === null) {
          status = 404
          sendJson(response, status, { error: 'not-found' })
          return
        }
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        const shareId = pathname.slice('/v1/patches/'.length)
        const shareSecret = requestUrl.searchParams.get('shareSecret') ?? ''
        if (!PatchShareIdPattern.test(shareId)) {
          status = 400
          sendJson(response, status, { error: 'invalid-input' })
          return
        }
        try {
          const artifact = await cloudPatchStore.openShare({
            shareId,
            shareSecret,
            requestingDeviceId: device.id,
          })
          status = 200
          sendJson(response, status, {
            shareId,
            artifactBase64: Buffer.from(artifact).toString('base64url'),
          })
        } catch (error) {
          status = statusForCloudPatchError(error)
          sendJson(response, status, {
            error: cloudPatchErrorCode(error),
          })
        }
        return
      }

      if (
        request.method === 'POST' &&
        /^\/v1\/patches\/cp_[a-f0-9]{64}\/revoke$/.test(pathname)
      ) {
        if (cloudPatchStore === null) {
          status = 404
          sendJson(response, status, { error: 'not-found' })
          return
        }
        const device = await authenticatedDevice(request)
        if (device === null) {
          status = 401
          sendJson(response, status, { error: 'device-auth-required' })
          return
        }
        const shareId = pathname.slice(
          '/v1/patches/'.length,
          pathname.length - '/revoke'.length
        )
        if (!PatchShareIdPattern.test(shareId)) {
          status = 400
          sendJson(response, status, { error: 'invalid-input' })
          return
        }
        try {
          const result = await cloudPatchStore.revokeShare({
            shareId,
            requestingDeviceId: device.id,
          })
          status = 200
          sendJson(response, status, result)
        } catch (error) {
          status = statusForCloudPatchError(error)
          sendJson(response, status, {
            error: cloudPatchErrorCode(error),
          })
        }
        return
      }

      if (
        request.method === 'GET' &&
        (pathname === '/.well-known/oauth-authorization-server' ||
          pathname === '/.well-known/openid-configuration')
      ) {
        if (oauthAuthority === null) {
          status = 404
          sendJson(response, status, { error: 'not-found' })
          return
        }
        status = 200
        sendJson(response, status, {
          ...oauthAuthority.metadata(),
          jwks_uri: `${configuration.publicOrigin}/oauth/jwks.json`,
          id_token_signing_alg_values_supported: ['ES256'],
          subject_types_supported: ['public'],
        })
        return
      }

      if (request.method === 'GET' && pathname === '/oauth/jwks.json') {
        if (oauthAuthority === null) {
          status = 404
          sendJson(response, status, { error: 'not-found' })
          return
        }
        status = 200
        sendJson(response, status, {
          keys: [
            { use: 'sig', alg: 'ES256', ...configuration.oauth.publicJwk },
          ],
        })
        return
      }

      if (request.method === 'GET' && pathname === '/oauth/authorize') {
        if (oauthAuthority === null) {
          status = 404
          sendJson(response, status, { error: 'not-found' })
          return
        }
        // A self-hosted single-tenant identity: the operator authenticates
        // once (Basic auth against the vaulted admin credential, the same
        // identity `/v1/admin/join-links` trusts) and receives an SSO
        // session cookie. Any subsequently registered client (a different
        // domain, a different app) presenting that cookie is signed in
        // without re-authenticating — single sign-on across every client
        // this authority knows about.
        const cookies = parseCookies(request)
        let subject = ssoSessions.subjectFor(cookies.get('dm_sso') ?? null)
        let setCookie = null
        if (subject === null) {
          if (!requireAdmin(request)) {
            status = 401
            response.setHeader(
              'WWW-Authenticate',
              'Basic realm="Desktop Material self-hosted server"'
            )
            sendJson(response, status, { error: 'sso-auth-required' })
            return
          }
          subject = OAuthAdminSubject
          setCookie = ssoCookieHeader(ssoSessions.create(subject))
        }
        let beginResult
        try {
          beginResult = oauthAuthority.beginAuthorization({
            subject,
            clientId: requestUrl.searchParams.get('client_id') ?? '',
            redirectUri: requestUrl.searchParams.get('redirect_uri') ?? '',
            state: requestUrl.searchParams.get('state') ?? '',
            codeChallenge: requestUrl.searchParams.get('code_challenge') ?? '',
            scopes: (requestUrl.searchParams.get('scope') ?? '')
              .split(' ')
              .filter(value => value.length > 0),
          })
        } catch (error) {
          status = 400
          if (setCookie !== null) {
            response.setHeader('Set-Cookie', setCookie)
          }
          sendJson(response, status, {
            error:
              error instanceof SelfHostedOAuthError
                ? error.code
                : 'invalid-authorization-request',
          })
          return
        }
        const redirectLocation = oauthAuthority.approveAuthorization(
          beginResult.requestId,
          subject
        )
        status = 302
        if (setCookie !== null) {
          response.setHeader('Set-Cookie', setCookie)
        }
        response.setHeader('Location', redirectLocation)
        securityHeaders(response)
        response.statusCode = status
        response.end()
        return
      }

      if (request.method === 'POST' && pathname === '/oauth/token') {
        if (oauthAuthority === null) {
          status = 404
          sendJson(response, status, { error: 'not-found' })
          return
        }
        const body = await readJson(request)
        let grant
        try {
          if (body?.grant_type === 'authorization_code') {
            grant = oauthAuthority.exchangeAuthorizationCode({
              clientId:
                typeof body.client_id === 'string' ? body.client_id : '',
              redirectUri:
                typeof body.redirect_uri === 'string' ? body.redirect_uri : '',
              code: typeof body.code === 'string' ? body.code : '',
              codeVerifier:
                typeof body.code_verifier === 'string'
                  ? body.code_verifier
                  : '',
            })
          } else if (body?.grant_type === 'refresh_token') {
            grant = oauthAuthority.refresh({
              clientId:
                typeof body.client_id === 'string' ? body.client_id : '',
              refreshToken:
                typeof body.refresh_token === 'string'
                  ? body.refresh_token
                  : '',
            })
          } else {
            status = 400
            sendJson(response, status, { error: 'unsupported-grant-type' })
            return
          }
        } catch (error) {
          status = 400
          sendJson(response, status, {
            error:
              error instanceof SelfHostedOAuthError
                ? error.code
                : 'invalid-grant',
          })
          return
        }
        const authenticated = oauthAuthority.authenticate(grant.accessToken)
        const idToken = grant.scope.split(' ').includes('openid')
          ? signIdToken({
              privateKeyPem: configuration.oauth.signingKeyPem,
              keyId: configuration.oauth.keyId,
              issuer: configuration.publicOrigin,
              subject: authenticated.subject,
              audience: authenticated.clientId,
              now: clock(),
            })
          : undefined
        status = 200
        sendJson(response, status, {
          token_type: grant.tokenType,
          access_token: grant.accessToken,
          expires_in: grant.expiresIn,
          refresh_token: grant.refreshToken,
          scope: grant.scope,
          ...(idToken === undefined ? {} : { id_token: idToken }),
        })
        return
      }

      if (request.method === 'GET' && pathname === '/oauth/userinfo') {
        if (oauthAuthority === null) {
          status = 404
          sendJson(response, status, { error: 'not-found' })
          return
        }
        const token = bearerToken(request)
        const authenticated =
          token === null ? null : oauthAuthority.authenticate(token)
        if (authenticated === null) {
          status = 401
          response.setHeader('WWW-Authenticate', 'Bearer')
          sendJson(response, status, { error: 'invalid-token' })
          return
        }
        status = 200
        sendJson(response, status, {
          sub: authenticated.subject,
          scope: authenticated.scopes.join(' '),
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
