import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { createDesktopMaterialServer, hashSecret } from '../server.mjs'

const InitialJoinToken =
  'initial-join-token-with-more-than-thirty-two-characters'
const AdminToken = 'admin-token-with-more-than-thirty-two-characters'

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
})
