import assert from 'node:assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'

import { createSelfHostedServerBootstrap } from '../../src/lib/self-hosted-server/provisioning'
import {
  createSelfHostedOAuthSignInRequest,
  exchangeSelfHostedOAuthCode,
} from '../../src/lib/self-hosted-server/oauth-sign-in'

describe('self-hosted server OAuth sign-in', () => {
  it('builds an authorize URL keyed to the x-github-desktop-auth deep link', () => {
    const request = createSelfHostedOAuthSignInRequest(
      'https://desktop-material.example'
    )
    const url = new URL(request.authorizeUrl)
    assert.equal(url.origin, 'https://desktop-material.example')
    assert.equal(url.pathname, '/oauth/authorize')
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'x-github-desktop-auth://self-hosted/oauth'
    )
    assert.equal(url.searchParams.get('client_id'), 'desktop-material-windows')
    assert.equal(url.searchParams.get('state'), request.state)
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    assert.match(request.codeVerifier, /^[A-Za-z0-9_-]{43,128}$/)
  })

  it('completes a real code exchange against the server the wizard provisions', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'desktop-material-server-oauth-sign-in-')
    )
    const configPath = join(directory, 'config.json')
    const statePath = join(directory, 'state.json')
    const bootstrap = createSelfHostedServerBootstrap('http://127.0.0.1:8787')
    await writeFile(configPath, bootstrap.configurationJson, 'utf8')

    const moduleUrl = pathToFileURL(
      resolve('services/desktop-material-server/server.mjs')
    ).href
    const serverModule = (await import(moduleUrl)) as {
      readonly createDesktopMaterialServer: (options: {
        readonly configPath: string
        readonly statePath: string
        readonly host: string
        readonly port: number
      }) => Promise<{
        readonly origin: string
        readonly close: () => Promise<void>
      }>
    }
    let server: Awaited<
      ReturnType<typeof serverModule.createDesktopMaterialServer>
    > | null = null

    try {
      server = await serverModule.createDesktopMaterialServer({
        configPath,
        statePath,
        host: '0.0.0.0',
        port: 0,
      })
      const port = new URL(server.origin).port
      const origin = `http://127.0.0.1:${port}`

      // The app builds the authorize URL...
      const signInRequest = createSelfHostedOAuthSignInRequest(origin)

      // ...the internal browser's authentication tab would navigate there
      // as the signed-in operator (Basic auth against the vaulted admin
      // credential); simulate that one HTTP hop here.
      const authorizeResponse = await fetch(signInRequest.authorizeUrl, {
        redirect: 'manual',
        headers: {
          authorization: `Basic ${Buffer.from(
            `admin:${bootstrap.adminToken}`
          ).toString('base64')}`,
        },
      })
      assert.equal(authorizeResponse.status, 302)
      const redirect = new URL(authorizeResponse.headers.get('location') ?? '')
      assert.equal(redirect.protocol, 'x-github-desktop-auth:')
      assert.equal(redirect.hostname, 'self-hosted')
      assert.equal(redirect.pathname, '/oauth')
      assert.equal(redirect.searchParams.get('state'), signInRequest.state)
      const code = redirect.searchParams.get('code')
      assert.ok(code)

      // ...and the app exchanges that code exactly the way it would after
      // the internal browser correlates the callback.
      const tokens = await exchangeSelfHostedOAuthCode(
        origin,
        code,
        signInRequest.codeVerifier
      )
      assert.match(tokens.accessToken, /^[A-Za-z0-9_-]{43}$/)
      assert.match(tokens.refreshToken, /^[A-Za-z0-9_-]{43}$/)
      assert.ok(tokens.idToken)
      const idTokenPayload = JSON.parse(
        Buffer.from(tokens.idToken.split('.')[1] ?? '', 'base64url').toString(
          'utf8'
        )
      )
      assert.equal(idTokenPayload.iss, bootstrap.publicOrigin)
      assert.equal(idTokenPayload.sub, 'admin')
      assert.equal(idTokenPayload.aud, 'desktop-material-windows')

      const userinfoResponse = await fetch(`${origin}/oauth/userinfo`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      })
      assert.equal(userinfoResponse.status, 200)
      const userinfo = (await userinfoResponse.json()) as { sub: string }
      assert.equal(userinfo.sub, 'admin')
    } finally {
      await server?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
