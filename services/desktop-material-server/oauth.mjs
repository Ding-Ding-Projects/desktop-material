import {
  createHash,
  createPrivateKey,
  randomBytes,
  sign as cryptoSign,
  timingSafeEqual,
} from 'node:crypto'

export const OAuthAuthorizationRequestLifetimeMs = 5 * 60 * 1000
export const OAuthIdTokenLifetimeMs = 15 * 60 * 1000
export const OAuthSsoSessionLifetimeMs = 8 * 60 * 60 * 1000
export const OAuthAuthorizationCodeLifetimeMs = 60 * 1000
export const OAuthAccessTokenLifetimeMs = 15 * 60 * 1000
export const OAuthRefreshTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000
export const OAuthMaximumPendingRequests = 256
export const OAuthMaximumAuthorizationCodes = 256
export const OAuthMaximumLiveGrants = 1_000
export const OAuthMaximumRefreshReplayTombstones = 4_096
export const OAuthMaximumRefreshRotationsPerFamily = 128

const MaximumOAuthClockValueMs =
  8_640_000_000_000_000 - OAuthRefreshTokenLifetimeMs

const PkceValue = /^[A-Za-z0-9_-]{43}$/
const CodeVerifier = /^[A-Za-z0-9._~-]{43,128}$/
const OpaqueIdentifier = /^[A-Za-z0-9._:@/-]{1,128}$/
const StateValue = /^[\x21-\x7e]{16,256}$/

export class SelfHostedOAuthError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

function fail(code) {
  throw new SelfHostedOAuthError(code)
}

function exactObject(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every(key => keys.includes(key))
  )
}

function objectWithKeys(value, allowedKeys, requiredKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const keys = Object.keys(value)
  return (
    keys.every(key => allowedKeys.includes(key)) &&
    requiredKeys.every(key => keys.includes(key))
  )
}

function normalizeIssuer(value) {
  if (typeof value !== 'string' || value.length > 2_048) {
    return fail('invalid-issuer')
  }
  let url
  try {
    url = new URL(value)
  } catch {
    return fail('invalid-issuer')
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    return fail('invalid-issuer')
  }
  return url.origin
}

function normalizeClient(value) {
  if (
    !exactObject(value, ['id', 'redirectUris', 'scopes']) ||
    typeof value.id !== 'string' ||
    !OpaqueIdentifier.test(value.id) ||
    !Array.isArray(value.redirectUris) ||
    value.redirectUris.length < 1 ||
    value.redirectUris.length > 8 ||
    !Array.isArray(value.scopes) ||
    value.scopes.length < 1 ||
    value.scopes.length > 16
  ) {
    return fail('invalid-client-configuration')
  }

  const redirectUris = new Set()
  for (const candidate of value.redirectUris) {
    if (typeof candidate !== 'string' || candidate.length > 2_048) {
      return fail('invalid-client-configuration')
    }
    let redirect
    try {
      redirect = new URL(candidate)
    } catch {
      return fail('invalid-client-configuration')
    }
    if (
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash ||
      (redirect.protocol !== 'https:' &&
        redirect.protocol !== 'x-github-desktop-auth:')
    ) {
      return fail('invalid-client-configuration')
    }
    // Preserve the registered bytes. OAuth redirect matching is exact, not
    // URL-equivalence matching (for example an explicit default port must not
    // be accepted when it was not registered).
    redirectUris.add(candidate)
  }

  const scopes = new Set()
  for (const scope of value.scopes) {
    if (typeof scope !== 'string' || !/^[a-z][a-z0-9:_-]{0,63}$/.test(scope)) {
      return fail('invalid-client-configuration')
    }
    scopes.add(scope)
  }

  return { id: value.id, redirectUris, scopes }
}

function normalizeRequestedScopes(value, client) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    return fail('invalid-scope')
  }
  const unique = new Set()
  for (const scope of value) {
    if (typeof scope !== 'string' || !client.scopes.has(scope)) {
      return fail('invalid-scope')
    }
    unique.add(scope)
  }
  return [...unique].sort()
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('base64url')
}

function secretMatches(value, expectedHash) {
  const actual = Buffer.from(sha256(value), 'utf8')
  const expected = Buffer.from(expectedHash, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function randomSecret() {
  return randomBytes(32).toString('base64url')
}

function safeIdentifier(value, code) {
  return typeof value === 'string' && OpaqueIdentifier.test(value)
    ? value
    : fail(code)
}

/**
 * In-memory OAuth 2.0 authorization-code authority for the self-hosted server.
 * It deliberately implements no browser or federation UI. Callers must bind
 * `approveAuthorization` to an authenticated, reviewed identity ceremony.
 * Secrets are returned once and retained only as SHA-256 hashes.
 */
export class SelfHostedOAuthAuthority {
  constructor(options) {
    if (
      !objectWithKeys(
        options,
        ['issuer', 'clients', 'clock', 'secretSource'],
        ['issuer', 'clients']
      ) ||
      !Array.isArray(options.clients) ||
      options.clients.length < 1 ||
      options.clients.length > 32 ||
      (options.clock !== undefined && typeof options.clock !== 'function') ||
      (options.secretSource !== undefined &&
        typeof options.secretSource !== 'function')
    ) {
      fail('invalid-oauth-configuration')
    }
    this.issuer = normalizeIssuer(options.issuer)
    this.clock = options.clock ?? Date.now
    this.secretSource = options.secretSource ?? randomSecret
    this.clients = new Map()
    for (const value of options.clients) {
      const client = normalizeClient(value)
      if (this.clients.has(client.id)) {
        fail('invalid-client-configuration')
      }
      this.clients.set(client.id, client)
    }
    this.pending = new Map()
    this.codes = new Map()
    this.accessTokens = new Map()
    this.refreshTokens = new Map()
    this.refreshReplayTombstones = new Map()
  }

  metadata() {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/oauth/authorize`,
      token_endpoint: `${this.issuer}/oauth/token`,
      userinfo_endpoint: `${this.issuer}/oauth/userinfo`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    }
  }

  beginAuthorization(input) {
    if (
      !exactObject(input, [
        'subject',
        'clientId',
        'redirectUri',
        'state',
        'codeChallenge',
        'scopes',
      ])
    ) {
      fail('invalid-authorization-request')
    }
    this.prune()
    if (this.pending.size >= OAuthMaximumPendingRequests) {
      fail('authorization-capacity-reached')
    }
    const subject = safeIdentifier(input.subject, 'invalid-subject')
    const client = this.clients.get(input.clientId)
    if (!client) {
      fail('unknown-client')
    }
    if (
      typeof input.redirectUri !== 'string' ||
      !client.redirectUris.has(input.redirectUri)
    ) {
      fail('redirect-uri-mismatch')
    }
    const redirectUri = input.redirectUri
    if (typeof input.state !== 'string' || !StateValue.test(input.state)) {
      fail('invalid-state')
    }
    if (
      typeof input.codeChallenge !== 'string' ||
      !PkceValue.test(input.codeChallenge)
    ) {
      fail('invalid-code-challenge')
    }
    const scopes = normalizeRequestedScopes(input.scopes, client)
    const requestId = this.nextSecret('request')
    const expiresAt = this.now() + OAuthAuthorizationRequestLifetimeMs
    this.pending.set(sha256(requestId), {
      subject,
      clientId: client.id,
      redirectUri,
      state: input.state,
      codeChallenge: input.codeChallenge,
      scopes,
      expiresAt,
    })
    return { requestId, expiresAt: new Date(expiresAt).toISOString() }
  }

  approveAuthorization(requestId, authenticatedSubject) {
    this.prune()
    if (typeof requestId !== 'string' || requestId.length !== 43) {
      fail('authorization-request-denied')
    }
    const key = sha256(requestId)
    const request = this.pending.get(key)
    this.pending.delete(key)
    if (
      !request ||
      request.expiresAt <= this.now() ||
      authenticatedSubject !== request.subject
    ) {
      fail('authorization-request-denied')
    }
    if (this.codes.size >= OAuthMaximumAuthorizationCodes) {
      fail('authorization-capacity-reached')
    }
    const code = this.nextSecret('code')
    const expiresAt = this.now() + OAuthAuthorizationCodeLifetimeMs
    this.codes.set(sha256(code), { ...request, expiresAt })
    const redirect = new URL(request.redirectUri)
    redirect.searchParams.set('code', code)
    redirect.searchParams.set('state', request.state)
    return redirect.toString()
  }

  exchangeAuthorizationCode(input) {
    if (
      !exactObject(input, [
        'clientId',
        'redirectUri',
        'code',
        'codeVerifier',
      ]) ||
      typeof input.redirectUri !== 'string' ||
      typeof input.code !== 'string' ||
      input.code.length !== 43 ||
      typeof input.codeVerifier !== 'string' ||
      !CodeVerifier.test(input.codeVerifier)
    ) {
      fail('invalid-grant')
    }
    this.prune()
    const key = sha256(input.code)
    const grant = this.codes.get(key)
    // Consume before comparison so a captured code cannot be brute-forced.
    this.codes.delete(key)
    if (
      !grant ||
      grant.expiresAt <= this.now() ||
      grant.clientId !== input.clientId ||
      grant.redirectUri !== input.redirectUri ||
      !secretMatches(input.codeVerifier, grant.codeChallenge)
    ) {
      fail('invalid-grant')
    }
    return this.issueTokens(grant)
  }

  refresh(input) {
    if (
      !exactObject(input, ['clientId', 'refreshToken']) ||
      typeof input.refreshToken !== 'string' ||
      input.refreshToken.length !== 43
    ) {
      fail('invalid-grant')
    }
    this.prune()
    const key = sha256(input.refreshToken)
    const grant = this.refreshTokens.get(key)
    const replay = this.refreshReplayTombstones.get(key)
    this.refreshTokens.delete(key)
    if (!grant) {
      if (replay) {
        this.revokeRefreshFamily(replay.refreshFamilyId)
      }
      fail('invalid-grant')
    }
    if (
      this.refreshReplayTombstones.size >= OAuthMaximumRefreshReplayTombstones
    ) {
      this.revokeRefreshFamily(grant.refreshFamilyId)
      fail('token-capacity-reached')
    }
    this.refreshReplayTombstones.set(key, {
      refreshFamilyId: grant.refreshFamilyId,
      expiresAt: grant.refreshFamilyExpiresAt,
    })
    if (
      grant.expiresAt <= this.now() ||
      grant.clientId !== input.clientId ||
      grant.refreshRotation >= OAuthMaximumRefreshRotationsPerFamily
    ) {
      this.revokeRefreshFamily(grant.refreshFamilyId)
      fail('invalid-grant')
    }
    try {
      return this.issueTokens({
        ...grant,
        refreshRotation: grant.refreshRotation + 1,
      })
    } catch (error) {
      this.revokeRefreshFamily(grant.refreshFamilyId)
      throw error
    }
  }

  authenticate(accessToken) {
    this.prune()
    if (typeof accessToken !== 'string' || accessToken.length !== 43) {
      return null
    }
    const grant = this.accessTokens.get(sha256(accessToken))
    if (!grant || grant.expiresAt <= this.now()) {
      return null
    }
    return {
      subject: grant.subject,
      clientId: grant.clientId,
      scopes: [...grant.scopes],
    }
  }

  issueTokens(grant) {
    this.prune()
    if (
      this.accessTokens.size >= OAuthMaximumLiveGrants ||
      this.refreshTokens.size >= OAuthMaximumLiveGrants
    ) {
      fail('token-capacity-reached')
    }
    const now = this.now()
    let refreshFamilyId = grant.refreshFamilyId
    let refreshFamilyExpiresAt = grant.refreshFamilyExpiresAt
    let refreshRotation = grant.refreshRotation
    if (
      typeof refreshFamilyId !== 'string' ||
      !Number.isSafeInteger(refreshFamilyExpiresAt) ||
      !Number.isSafeInteger(refreshRotation)
    ) {
      refreshFamilyId = sha256(this.nextSecret('family'))
      if (this.hasRefreshFamily(refreshFamilyId)) {
        fail('secure-random-unavailable')
      }
      refreshFamilyExpiresAt = now + OAuthRefreshTokenLifetimeMs
      refreshRotation = 0
    }
    if (refreshFamilyExpiresAt <= now) {
      fail('invalid-grant')
    }
    const accessToken = this.nextSecret('access', [refreshFamilyId])
    const accessTokenHash = sha256(accessToken)
    const refreshToken = this.nextSecret('refresh', [
      refreshFamilyId,
      accessTokenHash,
    ])
    const accessExpiresAt = Math.min(
      now + OAuthAccessTokenLifetimeMs,
      refreshFamilyExpiresAt
    )
    this.accessTokens.set(accessTokenHash, {
      subject: grant.subject,
      clientId: grant.clientId,
      scopes: [...grant.scopes],
      refreshFamilyId,
      expiresAt: accessExpiresAt,
    })
    this.refreshTokens.set(sha256(refreshToken), {
      subject: grant.subject,
      clientId: grant.clientId,
      scopes: [...grant.scopes],
      refreshFamilyId,
      refreshFamilyExpiresAt,
      refreshRotation,
      expiresAt: refreshFamilyExpiresAt,
    })
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: (accessExpiresAt - now) / 1000,
      refreshToken,
      scope: grant.scopes.join(' '),
    }
  }

  nextSecret(kind, reservedHashes = []) {
    let value
    try {
      value = this.secretSource(kind)
    } catch {
      return fail('secure-random-unavailable')
    }
    if (typeof value !== 'string' || !PkceValue.test(value)) {
      fail('secure-random-unavailable')
    }
    const key = sha256(value)
    if (
      reservedHashes.includes(key) ||
      [
        this.pending,
        this.codes,
        this.accessTokens,
        this.refreshTokens,
        this.refreshReplayTombstones,
      ].some(collection => collection.has(key))
    ) {
      fail('secure-random-unavailable')
    }
    return value
  }

  now() {
    let value
    try {
      value = this.clock()
    } catch {
      return fail('oauth-clock-unavailable')
    }
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > MaximumOAuthClockValueMs
    ) {
      fail('oauth-clock-unavailable')
    }
    return value
  }

  prune() {
    const now = this.now()
    for (const collection of [
      this.pending,
      this.codes,
      this.accessTokens,
      this.refreshTokens,
      this.refreshReplayTombstones,
    ]) {
      for (const [key, value] of collection) {
        if (value.expiresAt <= now) {
          collection.delete(key)
        }
      }
    }
  }

  revokeRefreshFamily(refreshFamilyId) {
    for (const collection of [this.accessTokens, this.refreshTokens]) {
      for (const [key, grant] of collection) {
        if (grant.refreshFamilyId === refreshFamilyId) {
          collection.delete(key)
        }
      }
    }
  }

  hasRefreshFamily(refreshFamilyId) {
    return [
      this.accessTokens,
      this.refreshTokens,
      this.refreshReplayTombstones,
    ].some(collection =>
      [...collection.values()].some(
        grant => grant.refreshFamilyId === refreshFamilyId
      )
    )
  }
}

export function createPkceChallenge(verifier) {
  if (typeof verifier !== 'string' || !CodeVerifier.test(verifier)) {
    fail('invalid-code-verifier')
  }
  return sha256(verifier)
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

/**
 * Signs a compact ES256 JWT (an OIDC-style `id_token`) with the key material
 * the provisioning wizard generated. The private key never leaves this
 * process: callers pass the PEM in, get a token string out, and are expected
 * to discard the PEM reference once the server has loaded it once.
 */
export function signIdToken(options) {
  if (
    !objectWithKeys(
      options,
      ['privateKeyPem', 'keyId', 'issuer', 'subject', 'audience', 'now'],
      ['privateKeyPem', 'keyId', 'issuer', 'subject', 'audience', 'now']
    ) ||
    typeof options.privateKeyPem !== 'string' ||
    !safeIdentifierLike(options.keyId) ||
    !safeIdentifierLike(options.audience)
  ) {
    fail('invalid-signing-request')
  }
  const issuer = normalizeIssuer(options.issuer)
  const subject = safeIdentifier(options.subject, 'invalid-subject')
  const now = options.now
  if (!Number.isSafeInteger(now) || now < 0) {
    fail('oauth-clock-unavailable')
  }
  let privateKey
  try {
    privateKey = createPrivateKey(options.privateKeyPem)
  } catch {
    return fail('invalid-signing-key')
  }
  if (privateKey.asymmetricKeyType !== 'ec') {
    fail('invalid-signing-key')
  }
  const header = { alg: 'ES256', typ: 'JWT', kid: options.keyId }
  const payload = {
    iss: issuer,
    sub: subject,
    aud: options.audience,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + OAuthIdTokenLifetimeMs) / 1000),
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`
  let signature
  try {
    signature = cryptoSign(null, Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    })
  } catch {
    return fail('signing-failed')
  }
  return `${signingInput}.${signature.toString('base64url')}`
}

function safeIdentifierLike(value) {
  return typeof value === 'string' && OpaqueIdentifier.test(value)
}

/**
 * In-memory SSO session registry, shared by every client (domain) registered
 * with this authority. A session created while approving one client's
 * `/oauth/authorize` request lets a later request from a *different*
 * registered client skip re-authentication for the session lifetime — the
 * single-sign-on and multi-domain-SSO behavior this server provides. It is
 * intentionally process-local: a restart requires operators to sign in again.
 */
export class SelfHostedSsoSessionStore {
  constructor(clock = Date.now) {
    this.clock = clock
    this.sessions = new Map()
  }

  create(subject) {
    this.prune()
    const id = randomBytes(32).toString('base64url')
    this.sessions.set(sha256(id), {
      subject,
      expiresAt: this.clock() + OAuthSsoSessionLifetimeMs,
    })
    return id
  }

  subjectFor(id) {
    this.prune()
    if (typeof id !== 'string' || id.length === 0 || id.length > 256) {
      return null
    }
    const entry = this.sessions.get(sha256(id))
    return entry ? entry.subject : null
  }

  prune() {
    const now = this.clock()
    for (const [key, value] of this.sessions) {
      if (value.expiresAt <= now) {
        this.sessions.delete(key)
      }
    }
  }
}
