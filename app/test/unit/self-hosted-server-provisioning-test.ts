import assert from 'node:assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'

import {
  createSelfHostedServerBootstrap,
  validateSamlMetadataXml,
  IDockerProvisioningProbe,
  IExistingSelfHostedServerBootstrap,
  ISelfHostedServerBootstrap,
  ISelfHostedServerProvisioningDriver,
  SelfHostedServerProvisioner,
  SelfHostedServerProvisioningError,
  SelfHostedServerProvisioningPhase,
} from '../../src/lib/self-hosted-server/provisioning'

const PublicOrigin = 'https://desktop-material.example'
const JoinToken = 'a'.repeat(43)
const JoinUrl = `${PublicOrigin}/join#token=${JoinToken}`

class FakeProvisioningDriver implements ISelfHostedServerProvisioningDriver {
  public probe: IDockerProvisioningProbe = {
    cliAvailable: true,
    composeAvailable: true,
    daemonAvailable: true,
    desktopInstalled: true,
  }
  public existing: IExistingSelfHostedServerBootstrap | null = null
  public readonly calls = new Array<string>()
  public written: ISelfHostedServerBootstrap | null = null
  public failAt: string | null = null
  public joinUrl = JoinUrl
  public afterRead: (() => void) | null = null

  public probeDocker = async () => {
    this.calls.push('probe')
    return this.probe
  }
  public installDockerDesktop = async () => {
    this.calls.push('install')
    this.maybeFail('install')
    this.probe = {
      cliAvailable: true,
      composeAvailable: true,
      daemonAvailable: false,
      desktopInstalled: true,
    }
  }
  public startDockerDesktop = async () => {
    this.calls.push('start-docker')
    this.maybeFail('start-docker')
  }
  public waitForDockerDaemon = async () => {
    this.calls.push('wait-docker')
    this.maybeFail('wait-docker')
    this.probe = { ...this.probe, daemonAvailable: true }
  }
  public readExistingBootstrap = async () => {
    this.calls.push('read-bootstrap')
    this.afterRead?.()
    return this.existing
  }
  public writeBootstrap = async (
    bootstrap: Omit<ISelfHostedServerBootstrap, 'adminToken'>
  ) => {
    this.calls.push('write-bootstrap')
    this.maybeFail('write-bootstrap')
    this.written = { ...bootstrap, adminToken: '' }
  }
  public storeAdminToken = async () => {
    this.calls.push('store-admin')
    this.maybeFail('store-admin')
  }
  public removeAdminToken = async () => {
    this.calls.push('remove-admin')
  }
  public startServer = async () => {
    this.calls.push('start-server')
    this.maybeFail('start-server')
  }
  public verifyServer = async () => {
    this.calls.push('verify-server')
    this.maybeFail('verify-server')
  }
  public createJoinLink = async () => {
    this.calls.push('join-link')
    this.maybeFail('join-link')
    return this.joinUrl
  }

  private maybeFail(call: string) {
    if (this.failAt === call) {
      throw new Error(`${call} failed`)
    }
  }
}

async function provision(
  driver: FakeProvisioningDriver,
  options: { readonly install?: boolean; readonly signal?: AbortSignal } = {}
) {
  const phases = new Array<SelfHostedServerProvisioningPhase>()
  const result = await new SelfHostedServerProvisioner(driver).provision(
    {
      publicOrigin: PublicOrigin,
      installDockerIfMissing: options.install ?? true,
    },
    options.signal ?? new AbortController().signal,
    progress => phases.push(progress.phase)
  )
  return { result, phases }
}

describe('self-hosted server provisioning', () => {
  it('accepts bounded SAML metadata but rejects entity-expansion input', () => {
    const metadata = `<EntityDescriptor entityID="https://idp.example.test/metadata"><SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.test/sso"/><X509Certificate>${'A'.repeat(
      128
    )}</X509Certificate></EntityDescriptor>`
    const bootstrap = createSelfHostedServerBootstrap(
      PublicOrigin,
      Date.now(),
      {
        samlMetadataXml: metadata,
      }
    )
    assert.equal(
      JSON.parse(bootstrap.configurationJson).samlMetadataXml,
      metadata
    )
    assert.throws(
      () =>
        validateSamlMetadataXml(
          '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///x">]>'
        ),
      /Invalid SAML identity-provider metadata/
    )
  })

  it('generates hashes only and keeps join secrets out of URLs and config', () => {
    const bootstrap = createSelfHostedServerBootstrap(
      PublicOrigin,
      Date.parse('2026-08-02T12:00:00.000Z')
    )
    const configuration = JSON.parse(bootstrap.configurationJson)

    assert.equal(configuration.publicOrigin, PublicOrigin)
    assert.match(configuration.serverId, /^[0-9a-f-]{36}$/)
    assert.match(configuration.adminTokenHash, /^[A-Za-z0-9_-]{43}$/)
    assert.match(configuration.initialJoinTokenHash, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(configuration.transport, 'reverse-proxy')
    assert.doesNotMatch(bootstrap.configurationJson, /#token=|"adminToken"/)
    assert.doesNotMatch(
      bootstrap.configurationJson,
      new RegExp(bootstrap.adminToken)
    )
    assert.equal(new URL(configuration.publicOrigin).search, '')

    const clients = JSON.parse(configuration.oauthClientsJson)
    assert.equal(clients.length, 1)
    assert.equal(clients[0].id, 'desktop-material-windows')
    assert.deepEqual(clients[0].redirectUris, [
      'x-github-desktop-auth://self-hosted/oauth',
    ])
    assert.match(
      configuration.oauthSigningKeyPem,
      /^-----BEGIN PRIVATE KEY-----/
    )
    assert.doesNotMatch(bootstrap.configurationJson, /BEGIN EC PRIVATE KEY/)
    const publicJwk = JSON.parse(configuration.oauthSigningPublicJwkJson)
    assert.equal(publicJwk.kty, 'EC')
    assert.equal(publicJwk.crv, 'P-256')
    assert.equal(typeof publicJwk.d, 'undefined')
    assert.match(configuration.oauthKeyId, /^key-[a-f0-9]{16}$/)
  })

  it('generates a fresh, unlinkable signing key on every provisioning run', () => {
    const first = createSelfHostedServerBootstrap(PublicOrigin)
    const second = createSelfHostedServerBootstrap(PublicOrigin)
    const firstConfiguration = JSON.parse(first.configurationJson)
    const secondConfiguration = JSON.parse(second.configurationJson)
    assert.notEqual(
      firstConfiguration.oauthSigningKeyPem,
      secondConfiguration.oauthSigningKeyPem
    )
    assert.notEqual(
      firstConfiguration.oauthKeyId,
      secondConfiguration.oauthKeyId
    )
  })

  it('boots the committed server through the Compose listener contract', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'desktop-material-server-'))
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
      const response = await fetch(`http://127.0.0.1:${port}/healthz`)
      assert.equal(response.status, 200)
      const health = (await response.json()) as {
        readonly status: string
        readonly serverId: string
      }
      assert.equal(health.status, 'ok')
      assert.equal(health.serverId, bootstrap.serverId)

      // The wizard's OAuth key material actually boots a working
      // authorization server, not just a config file the server ignores.
      const discoveryResponse = await fetch(
        `http://127.0.0.1:${port}/.well-known/oauth-authorization-server`
      )
      assert.equal(discoveryResponse.status, 200)
      const discovery = (await discoveryResponse.json()) as {
        readonly issuer: string
        readonly authorization_endpoint: string
      }
      assert.equal(discovery.issuer, 'http://127.0.0.1:8787')
      assert.equal(
        discovery.authorization_endpoint,
        'http://127.0.0.1:8787/oauth/authorize'
      )
      const jwksResponse = await fetch(
        `http://127.0.0.1:${port}/oauth/jwks.json`
      )
      const jwks = (await jwksResponse.json()) as {
        readonly keys: ReadonlyArray<{ readonly kid: string }>
      }
      assert.equal(jwks.keys.length, 1)
      assert.equal(
        jwks.keys[0].kid,
        JSON.parse(bootstrap.configurationJson).oauthKeyId
      )
    } finally {
      await server?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('installs, starts, writes once, verifies, and returns one fragment link', async () => {
    const driver = new FakeProvisioningDriver()
    driver.probe = {
      cliAvailable: false,
      composeAvailable: false,
      daemonAvailable: false,
      desktopInstalled: false,
    }

    const { result, phases } = await provision(driver)

    assert.deepEqual(driver.calls, [
      'probe',
      'install',
      'probe',
      'start-docker',
      'wait-docker',
      'probe',
      'read-bootstrap',
      'store-admin',
      'write-bootstrap',
      'start-server',
      'verify-server',
      'join-link',
    ])
    assert.deepEqual(phases, [
      'detecting-docker',
      'installing-docker',
      'starting-docker',
      'waiting-for-docker',
      'preparing-server',
      'starting-server',
      'verifying-server',
      'creating-join-link',
      'complete',
    ])
    assert.equal(result.publicOrigin, PublicOrigin)
    assert.equal(result.joinUrl, JoinUrl)
    assert.ok(driver.written)
  })

  it('reuses an existing bootstrap without overwriting keys', async () => {
    const driver = new FakeProvisioningDriver()
    driver.existing = {
      serverId: 'existing-server',
      publicOrigin: PublicOrigin,
      adminToken: 'vault-admin-token',
    }

    const { result } = await provision(driver)

    assert.equal(result.serverId, 'existing-server')
    assert.equal(driver.calls.includes('write-bootstrap'), false)
    assert.equal(driver.calls.includes('store-admin'), false)
    assert.deepEqual(driver.calls.slice(-3), [
      'start-server',
      'verify-server',
      'join-link',
    ])
  })

  it('does not activate config when vault storage fails and retries cleanly', async () => {
    const driver = new FakeProvisioningDriver()
    driver.failAt = 'store-admin'

    await assert.rejects(provision(driver), (error: unknown) => {
      assert.ok(error instanceof SelfHostedServerProvisioningError)
      assert.equal(error.code, 'server-bootstrap-failed')
      return true
    })
    assert.equal(driver.calls.includes('write-bootstrap'), false)

    driver.failAt = null
    driver.calls.length = 0
    const { result } = await provision(driver)
    assert.equal(result.publicOrigin, PublicOrigin)
    assert.deepEqual(driver.calls.slice(1, 4), [
      'read-bootstrap',
      'store-admin',
      'write-bootstrap',
    ])
  })

  it('rolls back a vaulted token when the config write fails', async () => {
    const driver = new FakeProvisioningDriver()
    driver.failAt = 'write-bootstrap'

    await assert.rejects(provision(driver), (error: unknown) => {
      assert.ok(error instanceof SelfHostedServerProvisioningError)
      assert.equal(error.code, 'server-bootstrap-failed')
      return true
    })
    assert.deepEqual(driver.calls.slice(-3), [
      'store-admin',
      'write-bootstrap',
      'remove-admin',
    ])
  })

  it('requires explicit install consent and names the recovery', async () => {
    const driver = new FakeProvisioningDriver()
    driver.probe = {
      cliAvailable: false,
      composeAvailable: false,
      daemonAvailable: false,
      desktopInstalled: false,
    }

    await assert.rejects(
      provision(driver, { install: false }),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningError)
        assert.equal(error.code, 'docker-install-required')
        assert.match(error.recovery, /Allow the wizard to install/)
        return true
      }
    )
    assert.deepEqual(driver.calls, ['probe'])
  })

  it('fails safely on missing vault state and an origin conflict', async () => {
    for (const existing of [
      {
        serverId: 'existing-server',
        publicOrigin: PublicOrigin,
        adminToken: null,
      },
      {
        serverId: 'existing-server',
        publicOrigin: 'https://different.example',
        adminToken: 'admin',
      },
    ]) {
      const driver = new FakeProvisioningDriver()
      driver.existing = existing
      await assert.rejects(provision(driver), (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningError)
        assert.ok(
          error.code === 'admin-credential-missing' ||
            error.code === 'server-origin-conflict'
        )
        assert.equal(driver.calls.includes('start-server'), false)
        return true
      })
    }
  })

  it('wraps a failed step with an exact retry boundary and no secret', async () => {
    const driver = new FakeProvisioningDriver()
    driver.existing = {
      serverId: 'existing-server',
      publicOrigin: PublicOrigin,
      adminToken: 'private-admin-token',
    }
    driver.failAt = 'verify-server'

    await assert.rejects(provision(driver), (error: unknown) => {
      assert.ok(error instanceof SelfHostedServerProvisioningError)
      assert.equal(error.code, 'server-health-failed')
      assert.match(error.recovery, /retry verification/i)
      assert.doesNotMatch(`${error.message} ${error.recovery}`, /private-admin/)
      return true
    })
    assert.equal(driver.calls.includes('join-link'), false)
  })

  it('stops before the first mutation when already cancelled', async () => {
    const driver = new FakeProvisioningDriver()
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      provision(driver, { signal: controller.signal }),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningError)
        assert.equal(error.code, 'cancelled')
        return true
      }
    )
    assert.deepEqual(driver.calls, [])
  })

  it('stops after a non-cooperative read without beginning a write', async () => {
    const driver = new FakeProvisioningDriver()
    const controller = new AbortController()
    driver.afterRead = () => controller.abort()

    await assert.rejects(
      provision(driver, { signal: controller.signal }),
      (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningError)
        assert.equal(error.code, 'cancelled')
        return true
      }
    )
    assert.equal(driver.calls.includes('store-admin'), false)
    assert.equal(driver.calls.includes('write-bootstrap'), false)
  })

  it('rejects malformed, credential-bearing, and ambiguous join links', async () => {
    const invalidJoinUrls = [
      'not a url',
      `https://user:password@desktop-material.example/join#token=${JoinToken}`,
      `${PublicOrigin}/join#token=`,
      `${PublicOrigin}/join#token=${JoinToken}&extra=y`,
      `${PublicOrigin}/join#token=short`,
      `${PublicOrigin}/join#token=${'private-admin-token'}`,
    ]

    for (const joinUrl of invalidJoinUrls) {
      const driver = new FakeProvisioningDriver()
      driver.existing = {
        serverId: 'existing-server',
        publicOrigin: PublicOrigin,
        adminToken: 'private-admin-token',
      }
      driver.joinUrl = joinUrl

      await assert.rejects(provision(driver), (error: unknown) => {
        assert.ok(error instanceof SelfHostedServerProvisioningError)
        assert.equal(error.code, 'join-link-failed')
        return true
      })
    }
  })

  it('rejects credential-bearing and clear-text public origins', () => {
    for (const origin of [
      'https://user:password@example.test',
      'https://example.test/path',
      'https://example.test?token=nope',
      'https://example.test/#token=nope',
      'http://example.test',
    ]) {
      assert.throws(() => createSelfHostedServerBootstrap(origin))
    }
    assert.doesNotThrow(() =>
      createSelfHostedServerBootstrap('http://127.0.0.1:8787')
    )
  })
})
