import { createHash, randomBytes } from 'crypto'
import {
  SelfHostedOAuthClientId,
  SelfHostedOAuthRedirectUri,
  SelfHostedOAuthScopes,
} from './provisioning'

/**
 * PKCE + state material for one self-hosted sign-in attempt. `codeVerifier`
 * is process-local, in-memory-only: it lives just long enough to complete
 * the round trip and must never be logged, persisted, or rendered.
 */
export interface ISelfHostedOAuthSignInRequest {
  readonly authorizeUrl: string
  readonly codeVerifier: string
  readonly state: string
}

/**
 * Tokens returned by the self-hosted server's `/oauth/token` endpoint.
 * Callers must hold this only in memory and never log, render, or persist
 * it verbatim — the access/refresh tokens are bearer secrets and `idToken`
 * is a signed but still sensitive identity assertion.
 */
export interface ISelfHostedOAuthTokens {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresIn: number
  readonly idToken: string | null
}

export interface ISelfHostedOAuthUserInfo {
  readonly sub: string
  readonly scope: string
}

export function normalizeSelfHostedOAuthOrigin(value: string): string {
  let origin: URL
  try {
    origin = new URL(value)
  } catch {
    throw new Error('self-hosted-oauth-origin-invalid')
  }
  const loopback =
    origin.hostname === 'localhost' ||
    origin.hostname === '127.0.0.1' ||
    origin.hostname === '[::1]'
  if (
    (origin.protocol !== 'https:' &&
      !(loopback && origin.protocol === 'http:')) ||
    origin.username.length > 0 ||
    origin.password.length > 0 ||
    origin.pathname !== '/' ||
    origin.search.length > 0 ||
    origin.hash.length > 0
  ) {
    throw new Error('self-hosted-oauth-origin-invalid')
  }
  return origin.origin
}

function base64url(value: Buffer): string {
  return value.toString('base64url')
}

/**
 * Builds the `/oauth/authorize` URL this app's internal-browser
 * authentication tab should navigate to, plus the PKCE verifier the caller
 * must hold onto (in memory only) until the matching callback arrives on
 * `x-github-desktop-auth://self-hosted/oauth`.
 *
 * This targets the self-hosted server's own OAuth authorization server
 * (services/desktop-material-server/oauth.mjs) rather than a loopback
 * listener: this app has none, and the internal browser's existing
 * partitioned, callback-correlated authentication path
 * (app/src/main-process/internal-browser-window.ts) is what already
 * receives that deep link for dotcom sign-in.
 */
export function createSelfHostedOAuthSignInRequest(
  publicOrigin: string
): ISelfHostedOAuthSignInRequest {
  const normalizedOrigin = normalizeSelfHostedOAuthOrigin(publicOrigin)
  const codeVerifier = base64url(randomBytes(64)).slice(0, 128)
  const codeChallenge = base64url(
    createHash('sha256').update(codeVerifier, 'utf8').digest()
  )
  const state = base64url(randomBytes(32))
  const url = new URL('/oauth/authorize', normalizedOrigin)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', SelfHostedOAuthClientId)
  url.searchParams.set('redirect_uri', SelfHostedOAuthRedirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('scope', SelfHostedOAuthScopes.join(' '))
  return { authorizeUrl: url.toString(), codeVerifier, state }
}

/**
 * Exchanges an authorization code for tokens at the self-hosted server's
 * `/oauth/token` endpoint. Callers must have already checked the callback's
 * `state` against the value `createSelfHostedOAuthSignInRequest` returned —
 * this function performs the code exchange only, not state correlation,
 * which the internal browser's authentication-flow tracking already owns.
 */
export async function exchangeSelfHostedOAuthCode(
  publicOrigin: string,
  code: string,
  codeVerifier: string,
  fetchImplementation: typeof fetch = fetch
): Promise<ISelfHostedOAuthTokens> {
  const normalizedOrigin = normalizeSelfHostedOAuthOrigin(publicOrigin)
  const response = await fetchImplementation(
    new URL('/oauth/token', normalizedOrigin),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: SelfHostedOAuthClientId,
        redirect_uri: SelfHostedOAuthRedirectUri,
        code,
        code_verifier: codeVerifier,
      }),
    }
  )
  if (!response.ok) {
    throw new Error('self-hosted-oauth-token-exchange-failed')
  }
  const body = (await response.json()) as {
    readonly access_token?: unknown
    readonly refresh_token?: unknown
    readonly expires_in?: unknown
    readonly id_token?: unknown
  }
  if (
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string' ||
    typeof body.expires_in !== 'number'
  ) {
    throw new Error('self-hosted-oauth-token-response-invalid')
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
    idToken: typeof body.id_token === 'string' ? body.id_token : null,
  }
}

/** Resolve the exchanged bearer token against the same tenant that issued it. */
export async function fetchSelfHostedOAuthUserInfo(
  publicOrigin: string,
  accessToken: string,
  fetchImplementation: typeof fetch = fetch
): Promise<ISelfHostedOAuthUserInfo> {
  const normalizedOrigin = normalizeSelfHostedOAuthOrigin(publicOrigin)
  if (!/^[A-Za-z0-9_-]{43}$/.test(accessToken)) {
    throw new Error('self-hosted-oauth-access-token-invalid')
  }
  const response = await fetchImplementation(
    new URL('/oauth/userinfo', normalizedOrigin),
    { headers: { authorization: `Bearer ${accessToken}` } }
  )
  if (!response.ok) {
    throw new Error('self-hosted-oauth-userinfo-failed')
  }
  const body = (await response.json()) as {
    readonly sub?: unknown
    readonly scope?: unknown
  }
  if (
    typeof body.sub !== 'string' ||
    !/^[A-Za-z0-9._:@/-]{1,128}$/.test(body.sub) ||
    typeof body.scope !== 'string' ||
    !body.scope.split(' ').includes('profile')
  ) {
    throw new Error('self-hosted-oauth-userinfo-invalid')
  }
  return { sub: body.sub, scope: body.scope }
}
