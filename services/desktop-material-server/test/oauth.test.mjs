import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createPkceChallenge,
  OAuthAccessTokenLifetimeMs,
  OAuthMaximumAuthorizationCodes,
  SelfHostedOAuthAuthority,
  SelfHostedOAuthError,
  parseSamlMetadata,
} from '../oauth.mjs'

const Issuer = 'https://identity.example.test'
const ClientId = 'desktop-material-windows'
const RedirectUri = 'x-github-desktop-auth://self-hosted/oauth'
const Verifier = 'v'.repeat(64)
const State = 'state-value-with-entropy-1234567890'

function authority(options = {}) {
  let now = options.now ?? Date.parse('2026-08-02T12:00:00.000Z')
  let sequence = 0
  const instance = new SelfHostedOAuthAuthority({
    issuer: Issuer,
    clients: [
      {
        id: ClientId,
        redirectUris: [RedirectUri],
        scopes: ['openid', 'profile', 'collaboration'],
      },
    ],
    clock: () => now,
    secretSource: kind => {
      sequence++
      return `${kind.slice(0, 1)}${String(sequence).padStart(42, '0')}`
    },
  })
  return {
    instance,
    advance: milliseconds => {
      now += milliseconds
    },
  }
}

function begin(instance, overrides = {}) {
  return instance.beginAuthorization({
    subject: 'device:trusted-user',
    clientId: ClientId,
    redirectUri: RedirectUri,
    state: State,
    codeChallenge: createPkceChallenge(Verifier),
    scopes: ['profile', 'openid'],
    ...overrides,
  })
}

function approve(instance, requestId, subject = 'device:trusted-user') {
  const redirect = new URL(instance.approveAuthorization(requestId, subject))
  assert.equal(redirect.origin, 'null')
  assert.equal(redirect.protocol, 'x-github-desktop-auth:')
  assert.equal(redirect.host, 'self-hosted')
  assert.equal(redirect.pathname, '/oauth')
  assert.equal(redirect.searchParams.get('state'), State)
  const code = redirect.searchParams.get('code')
  assert.match(code, /^[A-Za-z0-9_-]{43}$/)
  return code
}

function exchange(instance, code, overrides = {}) {
  return instance.exchangeAuthorizationCode({
    clientId: ClientId,
    redirectUri: RedirectUri,
    code,
    codeVerifier: Verifier,
    ...overrides,
  })
}

describe('self-hosted OAuth authority', () => {
  it('normalizes bounded SAML metadata and rejects unsafe XML inputs', () => {
    const metadata = `<EntityDescriptor entityID="https://idp.example.test/metadata"><IDPSSODescriptor><SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.test/sso"/><KeyDescriptor use="signing"><KeyInfo><X509Data><X509Certificate>${'A'.repeat(
      128
    )}</X509Certificate></X509Data></KeyInfo></KeyDescriptor></IDPSSODescriptor></EntityDescriptor>`
    assert.deepEqual(parseSamlMetadata(metadata), {
      entityId: 'https://idp.example.test/metadata',
      singleSignOnServices: [
        {
          binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
          location: 'https://idp.example.test/sso',
        },
      ],
      signingCertificates: ['A'.repeat(128)],
    })
    assert.throws(
      () =>
        parseSamlMetadata('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///x">]>'),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'invalid-saml-metadata'
    )
    assert.throws(
      () =>
        parseSamlMetadata(
          metadata.replace(
            'https://idp.example.test/sso',
            'http://idp.example.test/sso'
          )
        ),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'invalid-saml-metadata'
    )
  })

  it('publishes only the PKCE authorization-code contract', () => {
    const { instance } = authority()
    assert.deepEqual(instance.metadata(), {
      issuer: Issuer,
      authorization_endpoint: `${Issuer}/oauth/authorize`,
      token_endpoint: `${Issuer}/oauth/token`,
      userinfo_endpoint: `${Issuer}/oauth/userinfo`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    })
    assert.equal(
      createPkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    )
  })

  it('issues one exact deep-link code and authenticates a bounded grant', () => {
    const { instance } = authority()
    const request = begin(instance)
    const code = approve(instance, request.requestId)
    const tokens = exchange(instance, code)

    assert.equal(tokens.tokenType, 'Bearer')
    assert.equal(tokens.expiresIn, OAuthAccessTokenLifetimeMs / 1000)
    assert.equal(tokens.scope, 'openid profile')
    assert.match(tokens.accessToken, /^[A-Za-z0-9_-]{43}$/)
    assert.match(tokens.refreshToken, /^[A-Za-z0-9_-]{43}$/)
    assert.deepEqual(instance.authenticate(tokens.accessToken), {
      subject: 'device:trusted-user',
      clientId: ClientId,
      scopes: ['openid', 'profile'],
    })
  })

  it('rotates refresh tokens and rejects both code and token replay', () => {
    const { instance } = authority()
    const code = approve(instance, begin(instance).requestId)
    const first = exchange(instance, code)

    assert.throws(
      () => exchange(instance, code),
      error => {
        assert.ok(error instanceof SelfHostedOAuthError)
        assert.equal(error.code, 'invalid-grant')
        return true
      }
    )
    const second = instance.refresh({
      clientId: ClientId,
      refreshToken: first.refreshToken,
    })
    assert.notEqual(second.refreshToken, first.refreshToken)
    assert.throws(
      () =>
        instance.refresh({
          clientId: ClientId,
          refreshToken: first.refreshToken,
        }),
      error =>
        error instanceof SelfHostedOAuthError && error.code === 'invalid-grant'
    )
    assert.equal(instance.authenticate(second.accessToken), null)
    assert.throws(
      () =>
        instance.refresh({
          clientId: ClientId,
          refreshToken: second.refreshToken,
        }),
      error =>
        error instanceof SelfHostedOAuthError && error.code === 'invalid-grant'
    )
  })

  it('consumes a code after a wrong verifier attempt', () => {
    const { instance } = authority()
    const code = approve(instance, begin(instance).requestId)

    assert.throws(
      () => exchange(instance, code, { codeVerifier: 'x'.repeat(64) }),
      error =>
        error instanceof SelfHostedOAuthError && error.code === 'invalid-grant'
    )
    assert.throws(
      () => exchange(instance, code),
      error =>
        error instanceof SelfHostedOAuthError && error.code === 'invalid-grant'
    )
  })

  it('rejects a non-string verifier without throwing raw errors or consuming the code', () => {
    const { instance } = authority()
    const code = approve(instance, begin(instance).requestId)
    assert.throws(
      () => exchange(instance, code, { codeVerifier: [Verifier] }),
      error =>
        error instanceof SelfHostedOAuthError && error.code === 'invalid-grant'
    )
    assert.match(exchange(instance, code).accessToken, /^[A-Za-z0-9_-]{43}$/)
  })

  it('requires exact registered redirects, clients, scopes, state, and PKCE', () => {
    const { instance } = authority()
    for (const [overrides, code] of [
      [{ clientId: 'other-client' }, 'unknown-client'],
      [{ redirectUri: `${RedirectUri}/extra` }, 'redirect-uri-mismatch'],
      [{ redirectUri: `${RedirectUri}?token=nope` }, 'redirect-uri-mismatch'],
      [{ scopes: ['admin'] }, 'invalid-scope'],
      [{ state: 'short' }, 'invalid-state'],
      [{ codeChallenge: 'a'.repeat(42) }, 'invalid-code-challenge'],
    ]) {
      assert.throws(
        () => begin(instance, overrides),
        error => {
          assert.ok(error instanceof SelfHostedOAuthError)
          assert.equal(error.code, code)
          return true
        }
      )
    }

    const httpsAuthority = new SelfHostedOAuthAuthority({
      issuer: Issuer,
      clients: [
        {
          id: ClientId,
          redirectUris: ['https://desktop.example.test/oauth'],
          scopes: ['openid', 'profile'],
        },
      ],
      secretSource: () => 'a'.repeat(43),
    })
    assert.throws(
      () =>
        httpsAuthority.beginAuthorization({
          subject: 'device:trusted-user',
          clientId: ClientId,
          redirectUri: 'https://desktop.example.test:443/oauth',
          state: State,
          codeChallenge: createPkceChallenge(Verifier),
          scopes: ['profile'],
        }),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'redirect-uri-mismatch'
    )
  })

  it('supports secure defaults, rejects surplus configuration, and fails closed on collisions', () => {
    const defaults = new SelfHostedOAuthAuthority({
      issuer: Issuer,
      clients: [
        {
          id: ClientId,
          redirectUris: [RedirectUri],
          scopes: ['profile'],
        },
      ],
    })
    assert.equal(defaults.metadata().issuer, Issuer)

    assert.throws(
      () =>
        new SelfHostedOAuthAuthority({
          issuer: Issuer,
          clients: [
            {
              id: ClientId,
              redirectUris: [RedirectUri],
              scopes: ['profile'],
            },
          ],
          unexpected: true,
        }),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'invalid-oauth-configuration'
    )

    const colliding = new SelfHostedOAuthAuthority({
      issuer: Issuer,
      clients: [
        {
          id: ClientId,
          redirectUris: [RedirectUri],
          scopes: ['openid', 'profile'],
        },
      ],
      secretSource: () => 'r'.repeat(43),
    })
    begin(colliding)
    assert.throws(
      () => begin(colliding),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'secure-random-unavailable'
    )

    let sequence = 0
    const refreshCollision = new SelfHostedOAuthAuthority({
      issuer: Issuer,
      clients: [
        {
          id: ClientId,
          redirectUris: [RedirectUri],
          scopes: ['openid', 'profile'],
        },
      ],
      secretSource: kind => {
        sequence++
        return kind === 'refresh'
          ? 'z'.repeat(43)
          : `${kind.slice(0, 1)}${String(sequence).padStart(42, '0')}`
      },
    })
    const first = exchange(
      refreshCollision,
      approve(refreshCollision, begin(refreshCollision).requestId)
    )
    assert.throws(
      () =>
        refreshCollision.refresh({
          clientId: ClientId,
          refreshToken: first.refreshToken,
        }),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'secure-random-unavailable'
    )
    assert.equal(refreshCollision.authenticate(first.accessToken), null)
  })

  it('bounds outstanding codes and contains invalid clocks in typed errors', () => {
    const { instance } = authority()
    for (let index = 0; index < OAuthMaximumAuthorizationCodes; index++) {
      approve(instance, begin(instance).requestId)
    }
    const overflow = begin(instance)
    assert.throws(
      () =>
        instance.approveAuthorization(
          overflow.requestId,
          'device:trusted-user'
        ),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'authorization-capacity-reached'
    )

    const invalidClock = new SelfHostedOAuthAuthority({
      issuer: Issuer,
      clients: [
        {
          id: ClientId,
          redirectUris: [RedirectUri],
          scopes: ['openid', 'profile'],
        },
      ],
      clock: () => Number.NaN,
    })
    assert.throws(
      () => begin(invalidClock),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'oauth-clock-unavailable'
    )
  })

  it('binds approval to the authenticated subject and consumes denial', () => {
    const { instance } = authority()
    const request = begin(instance)
    assert.throws(
      () => instance.approveAuthorization(request.requestId, 'device:attacker'),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'authorization-request-denied'
    )
    assert.throws(
      () =>
        instance.approveAuthorization(request.requestId, 'device:trusted-user'),
      error =>
        error instanceof SelfHostedOAuthError &&
        error.code === 'authorization-request-denied'
    )
  })

  it('expires requests, codes, access grants, and refresh grants', () => {
    const { instance, advance } = authority()
    const request = begin(instance)
    advance(5 * 60 * 1000)
    assert.throws(
      () => approve(instance, request.requestId),
      error => error instanceof SelfHostedOAuthError
    )

    const code = approve(instance, begin(instance).requestId)
    advance(60 * 1000)
    assert.throws(
      () => exchange(instance, code),
      error => error instanceof SelfHostedOAuthError
    )

    const fresh = exchange(
      instance,
      approve(instance, begin(instance).requestId)
    )
    advance(OAuthAccessTokenLifetimeMs)
    assert.equal(instance.authenticate(fresh.accessToken), null)
    advance(30 * 24 * 60 * 60 * 1000)
    assert.throws(
      () =>
        instance.refresh({
          clientId: ClientId,
          refreshToken: fresh.refreshToken,
        }),
      error => error instanceof SelfHostedOAuthError
    )
  })

  it('rejects credential-bearing issuer and redirect configuration', () => {
    for (const badIssuer of [
      'http://identity.example.test',
      'https://user:password@identity.example.test',
      'https://identity.example.test/path',
    ]) {
      assert.throws(
        () =>
          new SelfHostedOAuthAuthority({
            issuer: badIssuer,
            clients: [
              {
                id: ClientId,
                redirectUris: [RedirectUri],
                scopes: ['openid'],
              },
            ],
            clock: Date.now,
            secretSource: () => 'a'.repeat(43),
          }),
        error => error instanceof SelfHostedOAuthError
      )
    }

    assert.throws(
      () =>
        new SelfHostedOAuthAuthority({
          issuer: Issuer,
          clients: [
            {
              id: ClientId,
              redirectUris: [
                'https://user:password@desktop.example.test/oauth',
              ],
              scopes: ['openid'],
            },
          ],
          clock: Date.now,
          secretSource: () => 'a'.repeat(43),
        }),
      error => error instanceof SelfHostedOAuthError
    )
  })

  it('never includes supplied secret material in typed errors', () => {
    const { instance } = authority()
    const marker = 'SUPER_SECRET_CODE_VERIFIER_MARKER'
    try {
      instance.exchangeAuthorizationCode({
        clientId: ClientId,
        redirectUri: RedirectUri,
        code: marker,
        codeVerifier: marker,
      })
      assert.fail('expected rejection')
    } catch (error) {
      assert.ok(error instanceof SelfHostedOAuthError)
      assert.doesNotMatch(`${error.message} ${error.code}`, /SUPER_SECRET/)
    }
  })
})
