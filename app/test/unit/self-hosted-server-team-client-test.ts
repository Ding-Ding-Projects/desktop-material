import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import {
  createSharedWorkspace,
  fetchSharedWorkspace,
  fetchTeamMembers,
  sendTeamHeartbeat,
  TeamClientError,
} from '../../src/lib/self-hosted-server/team-client'

// This suite drives the real Node HTTP server from
// `services/desktop-material-server/server.mjs` in-process, so it exercises
// the same code path that runs in the Docker container the user hosts. There
// is no mock server and no fabricated team data — every assertion reflects an
// actual HTTP round trip to real server logic.
const serverModulePromise: Promise<{
  createDesktopMaterialServer: (options: {
    configPath: string
    statePath: string
    host: string
    port: number
  }) => Promise<{ origin: string; close: () => Promise<void> }>
  hashSecret: (secret: string) => string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}> = import('../../../services/desktop-material-server/server.mjs' as any)

const InitialJoinToken = 'initial-join-token-with-more-than-thirty-two-chars'

const runningServers = new Array<{ close: () => Promise<void> }>()

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map(server => server.close()))
})

async function startServer() {
  const { createDesktopMaterialServer, hashSecret } = await serverModulePromise
  const root = await mkdtemp(join(tmpdir(), 'desktop-material-team-client-'))
  const configPath = join(root, 'config.json')
  const statePath = join(root, 'state.json')
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        serverId: 'team-client-fixture',
        publicOrigin: 'https://desktop-material.example',
        adminTokenHash: hashSecret(
          'admin-token-with-more-than-thirty-two-characters'
        ),
        initialJoinTokenHash: hashSecret(InitialJoinToken),
        initialJoinExpiresAt: new Date(Date.now() + 60_000).toISOString(),
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
  })
  runningServers.push(instance)
  return instance
}

async function joinDevice(
  origin: string,
  deviceName: string,
  token = InitialJoinToken
) {
  const response = await fetch(`${origin}/v1/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, deviceName }),
  })
  return response.json() as Promise<{
    deviceId: string
    deviceName: string
    deviceToken: string
  }>
}

describe('self-hosted team client (against a real server instance)', () => {
  it('sends heartbeats and reads them back through fetchTeamMembers', async () => {
    const instance = await startServer()
    const alice = await joinDevice(instance.origin, 'Alice laptop')

    await sendTeamHeartbeat(
      { publicOrigin: instance.origin, deviceToken: alice.deviceToken },
      'online',
      'committing'
    )

    const members = await fetchTeamMembers({
      publicOrigin: instance.origin,
      deviceToken: alice.deviceToken,
    })

    assert.equal(members.length, 1)
    assert.equal(members[0].deviceId, alice.deviceId)
    assert.equal(members[0].status, 'online')
    assert.equal(members[0].activity, 'committing')
  })

  it('rejects an unauthenticated caller with a typed error', async () => {
    const instance = await startServer()

    await assert.rejects(
      fetchTeamMembers({
        publicOrigin: instance.origin,
        deviceToken: 'not-a-real-token-not-a-real-token-not-a-real',
      }),
      (error: unknown) => {
        assert.ok(error instanceof TeamClientError)
        assert.equal(error.status, 401)
        return true
      }
    )
  })

  it('round-trips a shared workspace deep link through the real endpoints', async () => {
    const instance = await startServer()
    const alice = await joinDevice(instance.origin, 'Alice laptop')
    const bob = await joinDevice(
      instance.origin,
      'Bob desktop',
      // second device needs a fresh join link; reuse admin rotation directly
      await (async () => {
        const rotated = await fetch(
          `${instance.origin}/v1/admin/join-links`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization:
                'Bearer admin-token-with-more-than-thirty-two-characters',
            },
            body: '{}',
          }
        ).then(response => response.json() as Promise<{ joinUrl: string }>)
        const url = new URL(rotated.joinUrl)
        return decodeURIComponent(url.hash.slice('#token='.length))
      })()
    )

    const created = await createSharedWorkspace(
      { publicOrigin: instance.origin, deviceToken: alice.deviceToken },
      {
        name: 'Payments backend',
        repositoryUrl: 'https://example.com/org/payments.git',
        branch: 'main',
      }
    )
    assert.match(created.shareUrl, /^x-github-client:\/\/openteamworkspace\//)

    const resolved = await fetchSharedWorkspace(
      { publicOrigin: instance.origin, deviceToken: bob.deviceToken },
      created.shareToken
    )
    assert.equal(resolved.name, 'Payments backend')
    assert.equal(resolved.repositoryUrl, 'https://example.com/org/payments.git')
    assert.equal(resolved.branch, 'main')
  })
})
