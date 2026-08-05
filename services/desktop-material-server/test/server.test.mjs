import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { createDesktopMaterialServer, hashSecret } from '../server.mjs'

const InitialJoinToken =
  'initial-join-token-with-more-than-thirty-two-characters'
const AdminToken = 'admin-token-with-more-than-thirty-two-characters'
const CloudPatchEncryptionKeyBase64 = randomBytes(32).toString('base64url')

const runningServers = new Set()

afterEach(async () => {
  await Promise.all([...runningServers].map(server => server.close()))
  runningServers.clear()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'desktop-material-server-'))
  const configPath = join(root, 'config.json')
  const statePath = join(root, 'state.json')
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
        cloudPatchEncryptionKeyBase64: CloudPatchEncryptionKeyBase64,
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

async function jsonRequest(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
      ...(options.token === undefined
        ? {}
        : { authorization: `Bearer ${options.token}` }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  return { response, body: await response.json() }
}

describe('Desktop Material self-hosted server', () => {
  it('reports bounded health without disclosing bootstrap secrets', async () => {
    const paths = await fixture()
    const instance = await startFixture(paths)
    const { response, body } = await jsonRequest(instance.origin, '/healthz')

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      status: 'ok',
      version: 1,
      serverId: 'server-fixture',
      joinAvailable: true,
    })
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.doesNotMatch(JSON.stringify(body), /initial-join-token|admin-token/)
  })

  it('exchanges a one-time join token and persists device authentication', async () => {
    const paths = await fixture()
    const instance = await startFixture(paths)
    const joined = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: InitialJoinToken, deviceName: '  Review laptop  ' },
    })

    assert.equal(joined.response.status, 201)
    assert.equal(joined.body.serverId, 'server-fixture')
    assert.equal(joined.body.deviceName, 'Review laptop')
    assert.match(joined.body.deviceId, /^[0-9a-f-]{36}$/)
    assert.match(joined.body.deviceToken, /^[A-Za-z0-9_-]{43}$/)

    const replay = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: InitialJoinToken, deviceName: 'Replay' },
    })
    assert.equal(replay.response.status, 401)
    assert.deepEqual(replay.body, { error: 'join-denied' })

    const who = await jsonRequest(instance.origin, '/v1/whoami', {
      token: joined.body.deviceToken,
    })
    assert.equal(who.response.status, 200)
    assert.deepEqual(who.body, {
      serverId: 'server-fixture',
      deviceId: joined.body.deviceId,
      deviceName: 'Review laptop',
    })

    const persisted = await readFile(paths.statePath, 'utf8')
    assert.doesNotMatch(persisted, new RegExp(joined.body.deviceToken))
    assert.doesNotMatch(persisted, new RegExp(InitialJoinToken))

    await instance.close()
    runningServers.delete(instance)
    const restarted = await startFixture(paths)
    const afterRestart = await jsonRequest(restarted.origin, '/v1/whoami', {
      token: joined.body.deviceToken,
    })
    assert.equal(afterRestart.response.status, 200)
    assert.equal(afterRestart.body.deviceId, joined.body.deviceId)
  })

  it('rotates a fragment-only join link through authenticated administration', async () => {
    const paths = await fixture()
    let now = paths.now
    const instance = await startFixture(paths, () => now)

    const denied = await jsonRequest(instance.origin, '/v1/admin/join-links', {
      method: 'POST',
      token: 'wrong-admin-token-with-more-than-thirty-two-characters',
      body: {},
    })
    assert.equal(denied.response.status, 401)

    const rotated = await jsonRequest(instance.origin, '/v1/admin/join-links', {
      method: 'POST',
      token: AdminToken,
      body: { lifetimeMs: 120_000 },
    })
    assert.equal(rotated.response.status, 201)
    const link = new URL(rotated.body.joinUrl)
    assert.equal(link.origin, 'https://desktop-material.example')
    assert.equal(link.pathname, '/join')
    assert.equal(link.search, '')
    assert.match(link.hash, /^#token=/)
    const joinToken = decodeURIComponent(link.hash.slice('#token='.length))
    assert.ok(joinToken.length >= 43)

    now += 1_000
    const joined = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: joinToken, deviceName: 'Second machine' },
    })
    assert.equal(joined.response.status, 201)
    assert.equal(joined.body.deviceName, 'Second machine')
  })

  it('fails closed on malformed, oversized, expired, and unauthenticated input', async () => {
    const paths = await fixture()
    const instance = await startFixture(paths, () => paths.now + 120_000)

    const expired = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: InitialJoinToken, deviceName: 'Late device' },
    })
    assert.equal(expired.response.status, 401)

    const malformed = await fetch(`${instance.origin}/v1/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    assert.equal(malformed.status, 400)

    const oversized = await fetch(`${instance.origin}/v1/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'x'.repeat(20_000), deviceName: 'Huge' }),
    })
    assert.equal(oversized.status, 413)

    const capabilities = await jsonRequest(instance.origin, '/v1/capabilities')
    assert.equal(capabilities.response.status, 401)
    assert.deepEqual(capabilities.body, { error: 'device-auth-required' })
  })

  it('tracks team presence and lists team members', async () => {
    const paths = await fixture()
    let now = paths.now
    const instance = await startFixture(paths, () => now)

    const first = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: InitialJoinToken, deviceName: 'Alice laptop' },
    })
    assert.equal(first.response.status, 201)

    const rotated = await jsonRequest(instance.origin, '/v1/admin/join-links', {
      method: 'POST',
      token: AdminToken,
      body: {},
    })
    const joinToken = decodeURIComponent(
      new URL(rotated.body.joinUrl).hash.slice('#token='.length)
    )
    const second = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: joinToken, deviceName: 'Bob desktop' },
    })
    assert.equal(second.response.status, 201)

    const badHeartbeat = await jsonRequest(
      instance.origin,
      '/v1/team/heartbeat',
      {
        method: 'POST',
        token: first.body.deviceToken,
        body: { status: 'not-a-status' },
      }
    )
    assert.equal(badHeartbeat.response.status, 400)

    const heartbeat = await jsonRequest(instance.origin, '/v1/team/heartbeat', {
      method: 'POST',
      token: first.body.deviceToken,
      body: { status: 'online', activity: 'reviewing' },
    })
    assert.equal(heartbeat.response.status, 200)
    assert.equal(heartbeat.body.ok, true)

    const members = await jsonRequest(instance.origin, '/v1/team/members', {
      token: second.body.deviceToken,
    })
    assert.equal(members.response.status, 200)
    assert.equal(members.body.members.length, 2)
    const alice = members.body.members.find(
      member => member.deviceId === first.body.deviceId
    )
    assert.equal(alice.status, 'online')
    assert.equal(alice.activity, 'reviewing')
    const bob = members.body.members.find(
      member => member.deviceId === second.body.deviceId
    )
    assert.equal(bob.status, 'offline')
    assert.equal(bob.activity, null)

    now += 3 * 60 * 1000
    const staleMembers = await jsonRequest(instance.origin, '/v1/team/members', {
      token: second.body.deviceToken,
    })
    const staleAlice = staleMembers.body.members.find(
      member => member.deviceId === first.body.deviceId
    )
    assert.equal(staleAlice.status, 'offline')

    const noAuth = await jsonRequest(instance.origin, '/v1/team/members')
    assert.equal(noAuth.response.status, 401)
  })

  it('registers and resolves a shared workspace by deep-link token', async () => {
    const paths = await fixture()
    const instance = await startFixture(paths)

    const joined = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: InitialJoinToken, deviceName: 'Alice laptop' },
    })

    const invalid = await jsonRequest(instance.origin, '/v1/workspaces', {
      method: 'POST',
      token: joined.body.deviceToken,
      body: { name: 'Payments', repositoryUrl: 'not-a-url' },
    })
    assert.equal(invalid.response.status, 400)

    const created = await jsonRequest(instance.origin, '/v1/workspaces', {
      method: 'POST',
      token: joined.body.deviceToken,
      body: {
        name: 'Payments backend',
        repositoryUrl: 'https://example.com/org/payments.git',
        branch: 'main',
      },
    })
    assert.equal(created.response.status, 201)
    assert.match(created.body.shareUrl, /^x-github-client:\/\/openteamworkspace\//)
    assert.match(created.body.shareToken, /^[A-Za-z0-9_-]{43}$/)

    const fetched = await jsonRequest(
      instance.origin,
      `/v1/workspaces/${encodeURIComponent(created.body.shareToken)}`,
      { token: joined.body.deviceToken }
    )
    assert.equal(fetched.response.status, 200)
    assert.deepEqual(fetched.body, {
      name: 'Payments backend',
      repositoryUrl: 'https://example.com/org/payments.git',
      branch: 'main',
      createdAt: fetched.body.createdAt,
    })

    const missing = await jsonRequest(
      instance.origin,
      `/v1/workspaces/${'x'.repeat(43)}`,
      { token: joined.body.deviceToken }
    )
    assert.equal(missing.response.status, 404)
  })

  it('refuses a non-loopback clear-text listener without a trusted proxy', async () => {
    const paths = await fixture()
    await assert.rejects(
      createDesktopMaterialServer({
        configPath: paths.configPath,
        statePath: paths.statePath,
        host: '0.0.0.0',
        port: 0,
      }),
      /requires TLS or a declared reverse proxy/
    )
  })

  it('stores, shares, and revokes a Cloud Patch between two joined devices', async () => {
    const paths = await fixture()
    const instance = await startFixture(paths)

    const capabilities0 = await jsonRequest(
      instance.origin,
      '/v1/capabilities',
      { token: undefined }
    )
    assert.equal(capabilities0.response.status, 401)

    const owner = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: InitialJoinToken, deviceName: 'Owner laptop' },
    })
    assert.equal(owner.response.status, 201)

    const rotated = await jsonRequest(instance.origin, '/v1/admin/join-links', {
      method: 'POST',
      token: AdminToken,
      body: {},
    })
    assert.equal(rotated.response.status, 201)
    const secondToken = decodeURIComponent(
      new URL(rotated.body.joinUrl).hash.slice('#token='.length)
    )
    const teammate = await jsonRequest(instance.origin, '/v1/join', {
      method: 'POST',
      body: { token: secondToken, deviceName: 'Teammate desktop' },
    })
    assert.equal(teammate.response.status, 201)

    const capabilities = await jsonRequest(
      instance.origin,
      '/v1/capabilities',
      { token: owner.body.deviceToken }
    )
    assert.equal(capabilities.response.status, 200)
    assert.equal(capabilities.body.capabilities.patches, true)
    assert.equal(capabilities.body.capabilities.storage, true)

    const artifact = Buffer.from(
      'diff --git a/file.txt b/file.txt\nnew file mode 100644\n'
    )
    const artifactBase64 = artifact.toString('base64url')
    const expectedArtifactSha256 = `sha256:${createHash('sha256')
      .update(artifact)
      .digest('hex')}`

    const denied = await jsonRequest(instance.origin, '/v1/patches', {
      method: 'POST',
      body: {
        recipientDeviceIds: [teammate.body.deviceId],
        expectedArtifactSha256,
        artifactBase64,
      },
    })
    assert.equal(denied.response.status, 401)

    const created = await jsonRequest(instance.origin, '/v1/patches', {
      method: 'POST',
      token: owner.body.deviceToken,
      body: {
        recipientDeviceIds: [teammate.body.deviceId],
        expectedArtifactSha256,
        artifactBase64,
      },
    })
    assert.equal(created.response.status, 201)
    assert.match(created.body.shareId, /^cp_[a-f0-9]{64}$/)
    assert.match(created.body.shareSecret, /^cps_[A-Za-z0-9_-]{43}$/)
    assert.equal(
      created.body.shareUrl,
      `https://desktop-material.example/patches/${created.body.shareId}#${created.body.shareSecret}`
    )

    const wrongSecret = await jsonRequest(
      instance.origin,
      `/v1/patches/${created.body.shareId}?shareSecret=wrong`,
      { token: teammate.body.deviceToken }
    )
    assert.equal(wrongSecret.response.status, 404)
    assert.deepEqual(wrongSecret.body, { error: 'access-denied' })

    const fetched = await jsonRequest(
      instance.origin,
      `/v1/patches/${created.body.shareId}?shareSecret=${created.body.shareSecret}`,
      { token: teammate.body.deviceToken }
    )
    assert.equal(fetched.response.status, 200)
    assert.equal(fetched.body.artifactBase64, artifactBase64)

    const otherDeviceDenied = await jsonRequest(
      instance.origin,
      `/v1/patches/${created.body.shareId}?shareSecret=${created.body.shareSecret}`,
      { token: owner.body.deviceToken }
    )
    assert.equal(otherDeviceDenied.response.status, 200)

    const revoked = await jsonRequest(
      instance.origin,
      `/v1/patches/${created.body.shareId}/revoke`,
      { method: 'POST', token: owner.body.deviceToken, body: {} }
    )
    assert.equal(revoked.response.status, 200)
    assert.deepEqual(revoked.body, { revoked: true })

    const afterRevoke = await jsonRequest(
      instance.origin,
      `/v1/patches/${created.body.shareId}?shareSecret=${created.body.shareSecret}`,
      { token: teammate.body.deviceToken }
    )
    assert.equal(afterRevoke.response.status, 404)
  })
})
