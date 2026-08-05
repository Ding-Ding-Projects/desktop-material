import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { createDesktopMaterialServer, hashSecret } from '../server.mjs'
import { createPkceChallenge } from '../oauth.mjs'

const AdminToken = 'admin-token-with-more-than-thirty-two-characters'
const InitialJoinToken =
  'initial-join-token-with-more-than-thirty-two-characters'
const ClientId = 'desktop-material-windows'
const RedirectUri = 'x-github-desktop-auth://self-hosted/oauth'
const Verifier = 'v'.repeat(64)

const runningServers = new Set()

afterEach(async () => {
  await Promise.all([...runningServers].map(server => server.close()))
  runningServers.clear()
})

function generateSigningMaterial() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  })
  return {
    signingKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicJwk: publicKey.export({ format: 'jwk' }),
  }
}

async function fixture(clients, samlMetadataXml) {
  const root = await mkdtemp(join(tmpdir(), 'desktop-material-server-oauth-'))
  const configPath = join(root, 'config.json')
  const statePath = join(root, 'state.json')
  const now = Date.parse('2026-08-02T12:00:00.000Z')
  const { signingKeyPem, publicJwk } = generateSigningMaterial()
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        serverId: 'server-fixture',
        publicOrigin: 'https://desktop-material.example',
        adminTokenHash: hashSecret(AdminToken),
        initialJoinTokenHash: hashSecret(InitialJoinToken),
        initialJoinExpiresAt: new Date(now + 60_000).toISOString(),
        allowInsecureHttp: false,
        transport: 'direct',
        oauthClientsJson: JSON.stringify(
          clients ?? [
            {
              id: ClientId,
              redirectUris: [RedirectUri],
              scopes: ['openid', 'profile', 'collaboration'],
            },
          ]
        ),
        oauthSigningKeyPem: signingKeyPem,
        oauthSigningPublicJwkJson: JSON.stringify(publicJwk),
        oauthKeyId: 'key-1',
        ...(samlMetadataXml === undefined ? {} : { samlMetadataXml }),
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  return { root, configPath, statePath, now }
}

async function startFixture(paths, clock = () => paths.now) {
  const instance = await createDesktopMaterialServer({
    configPath: paths.configPath,
    statePath: paths.statePath,
    host: '127.0.0.1',
    port: 0,
    clock,
  })
  runningServers.add(instance)
  return instance
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`admin:${AdminToken}`).toString('base64')}`
}

function decodeJwtPayload(token) {
  const [, payload] = token.split('.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

async function authorize(
  origin,
  { cookie, noAuth = false, scope = 'openid profile' } = {}
) {
  const url = new URL('/oauth/authorize', origin)
  url.searchParams.set('client_id', ClientId)
  url.searchParams.set('redirect_uri', RedirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', 'state-value-with-plenty-of-entropy-123')
  url.searchParams.set('code_challenge', createPkceChallenge(Verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('scope', scope)
  const headers = noAuth
    ? {}
    : cookie
    ? { cookie }
    : { authorization: basicAuthHeader() }
  return fetch(url, { redirect: 'manual', headers })
}

describe('Desktop Material self-hosted OAuth authorization server', () => {
  it('serves validated SAML metadata without pretending to perform SAML login', async () => {
    const metadata = `<EntityDescriptor entityID="https://idp.example.test/metadata"><IDPSSODescriptor><SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.test/sso"/><KeyDescriptor use="signing"><KeyInfo><X509Data><X509Certificate>${'A'.repeat(
      128
    )}</X509Certificate></X509Data></KeyInfo></KeyDescriptor></IDPSSODescriptor></EntityDescriptor>`
    const paths = await fixture(undefined, metadata)
    const instance = await startFixture(paths)
    const response = await fetch(`${instance.origin}/oauth/saml/metadata`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      entityId: 'https://idp.example.test/metadata',
      singleSignOnServices: [
        {
          binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
          location: 'https://idp.example.test/sso',
        },
      ],
      signingCertificates: ['A'.repeat(128)],
    })
  })

  it('advertises capabilities and discovery metadata once OAuth is provisioned', async () => {
    const paths = await fixture()
    const instance = await startFixture(paths)

    const joined = await fetch(`${instance.origin}/v1/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: InitialJoinToken,
        deviceName: 'Capability probe',
      }),
    }).then(response => response.json())

    const capabilities = await fetch(`${instance.origin}/v1/capabilities`, {
      headers: { authorization: `Bearer ${joined.deviceToken}` },
    }).then(response => response.json())
    assert.equal(capabilities.capabilities.identity, true)

    const metadata = await fetch(
      `${instance.origin}/.well-known/oauth-authorization-server`
    ).then(response => response.json())
    assert.equal(metadata.issuer, 'https://desktop-material.example')
    assert.equal(
      metadata.authorization_endpoint,
      'https://desktop-material.example/oauth/authorize'
    )
    assert.equal(
      metadata.jwks_uri,
      'https://desktop-material.example/oauth/jwks.json'
    )
    assert.deepEqual(metadata.code_challenge_methods_supported, ['S256'])

    const jwks = await fetch(`${instance.origin}/oauth/jwks.json`).then(
      response => response.json()
    )
    assert.equal(jwks.keys.length, 1)
    assert.equal(jwks.keys[0].kty, 'EC')
    assert.equal(jwks.keys[0].kid, 'key-1')
    assert.equal(jwks.keys[0].alg, 'ES256')
  })

  it('runs a full authorization-code + PKCE + refresh round trip and signs an id_token', async () => {
    const paths = await fixture()
    const instance = await startFixture(paths)

    const denied = await authorize(instance.origin, { noAuth: true })
    assert.equal(denied.status, 401)
    assert.equal(
      denied.headers.get('www-authenticate'),
      'Basic realm="Desktop Material self-hosted server"'
    )

    const approved = await authorize(instance.origin)
    assert.equal(approved.status, 302)
    const setCookie = approved.headers.get('set-cookie')
    assert.match(setCookie, /^dm_sso=/)
    assert.match(setCookie, /HttpOnly/)
    assert.match(setCookie, /Secure/)
    const redirect = new URL(approved.headers.get('location'))
    assert.equal(redirect.protocol, 'x-github-desktop-auth:')
    assert.equal(
      redirect.searchParams.get('state'),
      'state-value-with-plenty-of-entropy-123'
    )
    const code = redirect.searchParams.get('code')
    assert.ok(code)

    // Single sign-on: a second client's authorize call reuses the session
    // cookie instead of prompting for Basic auth again.
    const cookieValue = setCookie.split(';')[0]
    const ssoReplay = await authorize(instance.origin, { cookie: cookieValue })
    assert.equal(ssoReplay.status, 302)

    const tokenResponse = await fetch(`${instance.origin}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: ClientId,
        redirect_uri: RedirectUri,
        code,
        code_verifier: Verifier,
      }),
    })
    assert.equal(tokenResponse.status, 200)
    const tokens = await tokenResponse.json()
    assert.equal(tokens.token_type, 'Bearer')
    assert.match(tokens.access_token, /^[A-Za-z0-9_-]{43}$/)
    assert.match(tokens.refresh_token, /^[A-Za-z0-9_-]{43}$/)
    assert.ok(tokens.id_token)
    const idTokenPayload = decodeJwtPayload(tokens.id_token)
    assert.equal(idTokenPayload.iss, 'https://desktop-material.example')
    assert.equal(idTokenPayload.sub, 'admin')
    assert.equal(idTokenPayload.aud, ClientId)

    const userinfo = await fetch(`${instance.origin}/oauth/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    }).then(response => response.json())
    assert.equal(userinfo.sub, 'admin')

    const refreshed = await fetch(`${instance.origin}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: ClientId,
        refresh_token: tokens.refresh_token,
      }),
    })
    assert.equal(refreshed.status, 200)
    const refreshedTokens = await refreshed.json()
    assert.notEqual(refreshedTokens.access_token, tokens.access_token)

    const replayedRefresh = await fetch(`${instance.origin}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: ClientId,
        refresh_token: tokens.refresh_token,
      }),
    })
    assert.equal(replayedRefresh.status, 400)

    const revokedAccess = await fetch(`${instance.origin}/oauth/userinfo`, {
      headers: { authorization: `Bearer ${refreshedTokens.access_token}` },
    })
    assert.equal(revokedAccess.status, 401)
  })

  it('reports 404 for OAuth surfaces when the server has no OAuth key material', async () => {
    const paths = await mkdtemp(
      join(tmpdir(), 'desktop-material-server-nooauth-')
    )
    const configPath = join(paths, 'config.json')
    const statePath = join(paths, 'state.json')
    const now = Date.parse('2026-08-02T12:00:00.000Z')
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          version: 1,
          serverId: 'server-fixture',
          publicOrigin: 'https://desktop-material.example',
          adminTokenHash: hashSecret(AdminToken),
          initialJoinTokenHash: hashSecret(InitialJoinToken),
          initialJoinExpiresAt: new Date(now + 60_000).toISOString(),
          allowInsecureHttp: false,
          transport: 'direct',
        },
        null,
        2
      )}\n`,
      'utf8'
    )
    const instance = await createDesktopMaterialServer({
      configPath,
      statePath,
      host: '127.0.0.1',
      port: 0,
      clock: () => now,
    })
    runningServers.add(instance)
    const authorizeResponse = await fetch(
      `${instance.origin}/oauth/authorize?client_id=x&redirect_uri=y&state=z&code_challenge=q`
    )
    assert.equal(authorizeResponse.status, 404)
    const metadata = await fetch(
      `${instance.origin}/.well-known/oauth-authorization-server`
    )
    assert.equal(metadata.status, 404)
  })
})
