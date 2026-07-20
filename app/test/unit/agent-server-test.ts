import { describe, it } from 'node:test'
import assert from 'node:assert'
import { promises as Fs } from 'fs'
import * as Http from 'http'
import * as Os from 'os'
import * as Path from 'path'
import { execFile as execFileCallback, spawn } from 'child_process'
import { once } from 'events'
import { promisify } from 'util'
import {
  AgentServer,
  IAgentServerDependencies,
} from '../../src/main-process/agent-server/agent-server'
import { IAgentDeviceCredentialStore } from '../../src/main-process/agent-server/paired-device-store'
import {
  AgentCommandResult,
  IAgentCommandEnvelope,
} from '../../src/lib/agent-commands'

const execFile = promisify(execFileCallback)

interface IResponse {
  readonly status: number
  readonly body: any
  readonly headers: Http.IncomingHttpHeaders
}

function request(
  port: number,
  path: string,
  token: string,
  options: {
    readonly method?: string
    readonly body?: unknown
    readonly origin?: string
    readonly host?: string
    readonly tokenOverride?: string
    readonly omitAuthorization?: boolean
  } = {}
): Promise<IResponse> {
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body)
  return new Promise((resolve, reject) => {
    const req = Http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method ?? (body === undefined ? 'GET' : 'POST'),
        headers: {
          Host: options.host ?? `127.0.0.1:${port}`,
          ...(options.omitAuthorization
            ? {}
            : { Authorization: `Bearer ${options.tokenOverride ?? token}` }),
          Connection: 'close',
          ...(body === undefined
            ? {}
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }),
          ...(options.origin === undefined ? {} : { Origin: options.origin }),
        },
      },
      response => {
        const chunks: Buffer[] = []
        response.on('data', chunk => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({
            status: response.statusCode ?? 0,
            body: text.length === 0 ? undefined : JSON.parse(text),
            headers: response.headers,
          })
        })
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

async function withServer(
  callback: (
    server: AgentServer,
    connection: { port: number; token: string; configPath: string },
    commands: IAgentCommandEnvelope[]
  ) => Promise<void>,
  executeOverride?: (
    command: IAgentCommandEnvelope
  ) => Promise<AgentCommandResult>,
  dependencies: IAgentServerDependencies = {}
) {
  const directory = await Fs.mkdtemp(
    Path.join(Os.tmpdir(), 'desktop-agent-test-')
  )
  const configPath = Path.join(directory, 'agent-server.json')
  const commands: IAgentCommandEnvelope[] = []
  const server = new AgentServer(
    configPath,
    async command => {
      commands.push(command)
      if (executeOverride !== undefined) {
        return executeOverride(command)
      }
      if (command.name === 'list-api-functions') {
        return {
          ok: true,
          data: [
            {
              name: 'fixture_read',
              description: 'Read fixture data.',
              operationId: 'fixture/read',
              risk: 'read',
              inputSchema: {
                type: 'object',
                additionalProperties: false,
                properties: { page: { type: 'integer' } },
              },
            },
          ],
        }
      }
      return { ok: true, data: { command: command.name } }
    },
    dependencies
  )
  try {
    const status = await server.start()
    assert.notEqual(status.port, null)
    assert.notEqual(status.token, null)
    await callback(
      server,
      { port: status.port!, token: status.token!, configPath },
      commands
    )
  } finally {
    await server.stop()
    await Fs.rm(directory, { recursive: true, force: true })
  }
}

function credentialVault(options: { readonly failWrites?: boolean } = {}) {
  const credentials = new Map<string, string>()
  const store: IAgentDeviceCredentialStore = {
    setItem: async (_service, account, value) => {
      if (options.failWrites) {
        throw new Error(`vault failure must not expose ${value}`)
      }
      credentials.set(account, value)
    },
    getItem: async (_service, account) => credentials.get(account) ?? null,
    deleteItem: async (_service, account) => credentials.delete(account),
  }
  return { credentials, store }
}

describe('agent server', () => {
  it('serves authenticated info, REST commands, and an MCP handshake', async () => {
    await withServer(async (_server, connection, commands) => {
      const { port, token, configPath } = connection
      const config = JSON.parse(await Fs.readFile(configPath, 'utf8'))
      assert.equal(config.port, port)
      assert.equal(config.token, token)

      const info = await request(port, '/api/v1/info', token)
      assert.equal(info.status, 200)
      assert.ok(info.body.commands.includes('list-repositories'))
      assert.ok(info.body.commands.includes('list-ssh-hosts'))
      assert.ok(info.body.commands.includes('clone-to-ssh'))
      assert.ok(info.body.commands.includes('github_api_fixture_read'))
      assert.equal(JSON.stringify(info.body).includes(token), false)

      const rest = await request(port, '/api/v1/command/push', token, {
        body: { repositoryId: 7 },
      })
      assert.equal(rest.status, 200)
      assert.equal(rest.body.data.command, 'push')

      const initialize = await request(port, '/mcp', token, {
        body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      })
      assert.equal(initialize.status, 200)
      assert.equal(initialize.body.result.protocolVersion, '2025-03-26')

      const tools = await request(port, '/mcp', token, {
        body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      })
      assert.ok(tools.body.result.tools.length >= 20)
      const namedTool = tools.body.result.tools.find(
        (tool: { name: string }) => tool.name === 'github_api_fixture_read'
      )
      assert.ok(namedTool)
      assert.equal(namedTool.annotations.readOnlyHint, true)

      const call = await request(port, '/mcp', token, {
        body: {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'list-tabs', arguments: {} },
        },
      })
      assert.equal(call.body.result.structuredContent.command, 'list-tabs')
      const customCall = await request(port, '/mcp', token, {
        body: {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'github_api_fixture_read',
            arguments: { page: 2 },
          },
        },
      })
      assert.equal(
        customCall.body.result.structuredContent.command,
        'invoke-api-function'
      )
      assert.deepEqual(
        commands.map(x => x.name),
        [
          'list-api-functions',
          'push',
          'list-api-functions',
          'list-tabs',
          'invoke-api-function',
        ]
      )
      assert.deepEqual(commands[4].args, {
        name: 'fixture_read',
        arguments: { page: 2 },
      })
    })
  })

  it('keeps the static MCP catalog available when profile functions are invalid', async () => {
    await withServer(
      async (_server, { port, token }) => {
        const info = await request(port, '/api/v1/info', token)
        assert.equal(info.status, 200)
        assert.ok(info.body.commands.includes('list-repositories'))
        assert.equal(
          info.body.commands.some((name: string) =>
            name.startsWith('github_api_')
          ),
          false
        )

        const tools = await request(port, '/mcp', token, {
          body: { jsonrpc: '2.0', id: 9, method: 'tools/list' },
        })
        assert.equal(tools.status, 200)
        assert.ok(
          tools.body.result.tools.some(
            (tool: { name: string }) => tool.name === 'list-repositories'
          )
        )
      },
      async command =>
        command.name === 'list-api-functions'
          ? {
              ok: false,
              error: {
                code: 'command_failed',
                message: 'Named API functions are not valid JSON.',
              },
            }
          : { ok: true, data: { command: command.name } }
    )
  })

  it('rejects bad tokens, browser origins, invalid hosts, and credentials', async () => {
    await withServer(async (_server, { port, token }) => {
      assert.equal(
        (await request(port, '/api/v1/info', token, { tokenOverride: 'wrong' }))
          .status,
        401
      )
      assert.equal(
        (
          await request(port, '/api/v1/info', token, {
            origin: 'https://attacker.invalid',
          })
        ).status,
        403
      )
      assert.equal(
        (
          await request(port, '/api/v1/info', token, {
            host: 'attacker.invalid',
          })
        ).status,
        403
      )
      const credential = await request(
        port,
        '/api/v1/command/list-repositories',
        token,
        { body: { token: 'must-not-cross' } }
      )
      assert.equal(credential.status, 400)
      assert.equal(
        JSON.stringify(credential.body).includes('must-not-cross'),
        false
      )
      const camelCaseCredential = await request(
        port,
        '/api/v1/command/list-repositories',
        token,
        { body: { accessToken: 'must-not-cross-either' } }
      )
      assert.equal(camelCaseCredential.status, 400)
      assert.equal(
        JSON.stringify(camelCaseCredential.body).includes(
          'must-not-cross-either'
        ),
        false
      )

      const oversized = await request(
        port,
        '/api/v1/command/list-repositories',
        token,
        { body: { value: 'x'.repeat(70 * 1024) } }
      )
      assert.equal(oversized.status, 413)
    })
  })

  it('pairs a LAN device once, persists its token in the vault, and revokes it', async () => {
    const vault = credentialVault()
    await withServer(
      async (server, connection) => {
        const paired = await server.configure({ mode: 'paired-lan' })
        assert.equal(paired.running, true)
        assert.equal(paired.transport, 'lan-http')
        assert.deepEqual(paired.lanAddresses, ['192.168.50.20'])
        assert.ok(paired.pairing)
        assert.ok(paired.baseURL)
        assert.ok(paired.lanBaseURL)
        assert.match(paired.siteURL, /^http:\/\/192\.168\.50\.20:3000\/connect/)
        assert.match(paired.pairing!.qrURL, /#pair=/)
        assert.match(paired.pairing!.qrURL, /&agent=http%3A%2F%2F192/)
        const discoveryConfig = await Fs.readFile(connection.configPath, 'utf8')
        assert.equal(discoveryConfig.includes(paired.pairing!.code), false)

        const origin = new URL(paired.siteURL).origin
        const host = `${paired.lanAddresses[0]}:${paired.port}`
        const publicStatus = await request(
          paired.port!,
          '/api/v1/remote/status',
          '',
          { origin, host, omitAuthorization: true }
        )
        assert.equal(publicStatus.status, 200)
        assert.equal(publicStatus.body.authenticationRequired, true)
        assert.equal(publicStatus.body.transportEncrypted, false)
        assert.equal(publicStatus.body.pairing.available, true)
        const publicText = JSON.stringify(publicStatus.body)
        assert.equal(publicText.includes(paired.pairing!.code), false)
        assert.equal(publicText.includes(paired.token!), false)
        assert.equal(
          publicStatus.headers['access-control-allow-origin'],
          origin
        )

        const pair = await request(paired.port!, '/api/v1/remote/pair', '', {
          origin,
          host,
          omitAuthorization: true,
          body: {
            code: paired.pairing!.code,
            deviceName: 'Kitchen tablet',
            stayLoggedIn: true,
          },
        })
        assert.equal(pair.status, 201)
        assert.equal(pair.body.tokenType, 'Bearer')
        assert.match(pair.body.token, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/)
        assert.equal(
          vault.credentials.get(pair.body.device.id),
          pair.body.token
        )
        assert.equal(server.getStatus().pairing, null)

        const metadataPath = Path.join(
          Path.dirname(connection.configPath),
          'agent-server-devices.json'
        )
        const metadata = await Fs.readFile(metadataPath, 'utf8')
        assert.match(metadata, /Kitchen tablet/)
        assert.doesNotMatch(
          metadata,
          new RegExp(pair.body.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        )
        assert.doesNotMatch(metadata, /stayLoggedIn/i)

        const command = await request(paired.port!, '/api/v1/commands', '', {
          origin,
          host,
          tokenOverride: pair.body.token,
          body: { name: 'push', args: { repositoryId: 7 } },
        })
        assert.equal(command.status, 200)
        assert.equal(command.body.data.command, 'push')

        const firstPort = paired.port!
        await server.stop()
        const restarted = await server.start()
        assert.equal(restarted.port, firstPort)
        assert.equal(restarted.preferredLANPort, firstPort)
        const restartedOrigin = new URL(restarted.siteURL).origin
        const restartedHost = `${restarted.lanAddresses[0]}:${restarted.port}`
        assert.equal(
          (
            await request(restarted.port!, '/api/v1/commands', '', {
              origin: restartedOrigin,
              host: restartedHost,
              tokenOverride: pair.body.token,
              body: { name: 'fetch', args: { repositoryId: 7 } },
            })
          ).status,
          200
        )

        const devices = await request(
          restarted.port!,
          '/api/v1/remote/devices',
          '',
          {
            origin: restartedOrigin,
            host: restartedHost,
            tokenOverride: pair.body.token,
          }
        )
        assert.deepEqual(devices.body.devices, [pair.body.device])

        const revoked = await request(
          restarted.port!,
          `/api/v1/remote/devices/${pair.body.device.id}`,
          restarted.token!,
          {
            method: 'DELETE',
            origin: restartedOrigin,
            host: restartedHost,
          }
        )
        assert.equal(revoked.status, 204)
        assert.equal(vault.credentials.has(pair.body.device.id), false)
        assert.equal(
          (
            await request(restarted.port!, '/api/v1/remote/devices', '', {
              origin: restartedOrigin,
              host: restartedHost,
              tokenOverride: pair.body.token,
            })
          ).status,
          401
        )
      },
      undefined,
      {
        credentialStore: vault.store,
        resolveLANAddresses: () => ['192.168.50.20'],
      }
    )
  })

  it('expires and rate-limits pairing codes without reflecting secrets', async () => {
    let now = Date.parse('2026-07-17T12:00:00.000Z')
    const vault = credentialVault()
    await withServer(
      async server => {
        const paired = await server.configure({ mode: 'paired-lan' })
        const origin = new URL(paired.siteURL).origin
        const host = `${paired.lanAddresses[0]}:${paired.port}`
        const wrongCode = 'wrong-code-must-never-be-reflected'
        const wrong = await request(paired.port!, '/api/v1/remote/pair', '', {
          origin,
          host,
          omitAuthorization: true,
          body: { code: wrongCode, deviceName: 'Phone' },
        })
        assert.equal(wrong.status, 401)
        assert.equal(JSON.stringify(wrong.body).includes(wrongCode), false)

        const limited = await request(paired.port!, '/api/v1/remote/pair', '', {
          origin,
          host,
          omitAuthorization: true,
          body: { code: wrongCode, deviceName: 'Phone' },
        })
        assert.equal(limited.status, 429)

        now += 5 * 60 * 1000 + 1
        const status = await request(
          paired.port!,
          '/api/v1/remote/status',
          '',
          { origin, host, omitAuthorization: true }
        )
        assert.equal(status.body.pairing.available, false)
        const expired = await request(paired.port!, '/api/v1/remote/pair', '', {
          origin,
          host,
          omitAuthorization: true,
          body: { code: paired.pairing!.code, deviceName: 'Phone' },
        })
        assert.equal(expired.status, 410)
      },
      undefined,
      {
        credentialStore: vault.store,
        now: () => now,
        resolveLANAddresses: () => ['192.168.50.20'],
      }
    )
  })

  it('consumes a code on vault failure and exposes only a generic error', async () => {
    const vault = credentialVault({ failWrites: true })
    await withServer(
      async server => {
        const paired = await server.configure({ mode: 'paired-lan' })
        const origin = new URL(paired.siteURL).origin
        const host = `${paired.lanAddresses[0]}:${paired.port}`
        const failed = await request(paired.port!, '/api/v1/remote/pair', '', {
          origin,
          host,
          omitAuthorization: true,
          body: {
            code: paired.pairing!.code,
            deviceName: 'Phone',
          },
        })
        assert.equal(failed.status, 500)
        assert.deepEqual(failed.body, {
          error: { code: 'http_500', message: 'Internal server error' },
        })
        assert.equal(server.getStatus().pairing, null)
        const regenerated = await server.regeneratePairing()
        assert.ok(regenerated.pairing)
        assert.notEqual(regenerated.pairing!.code, paired.pairing!.code)
      },
      undefined,
      {
        credentialStore: vault.store,
        resolveLANAddresses: () => ['192.168.50.20'],
      }
    )
  })

  it('requires explicit YOLO confirmation and still enforces Host and Origin', async () => {
    await withServer(
      async server => {
        await server.setGatewayURL('https://agent.example.test')
        await assert.rejects(
          server.configure({ mode: 'yolo-lan' }),
          /explicit confirmation/
        )
        const yolo = await server.configure({
          mode: 'yolo-lan',
          yoloConfirmed: true,
        })
        assert.equal(yolo.gatewayURL, null)
        assert.equal(yolo.transport, 'lan-http')
        await assert.rejects(
          server.setGatewayURL('https://agent.example.test'),
          /disabled in YOLO LAN mode/
        )
        const origin = new URL(yolo.siteURL).origin
        const host = `${yolo.lanAddresses[0]}:${yolo.port}`
        const command = await request(yolo.port!, '/api/v1/commands', '', {
          origin,
          host,
          omitAuthorization: true,
          body: { name: 'push', args: { repositoryId: 7 } },
        })
        assert.equal(command.status, 200)

        assert.equal(
          (
            await request(yolo.port!, '/api/v1/commands', '', {
              origin: 'https://attacker.invalid',
              host,
              omitAuthorization: true,
              body: { name: 'push', args: { repositoryId: 7 } },
            })
          ).status,
          403
        )
        assert.equal(
          (
            await request(yolo.port!, '/api/v1/commands', '', {
              origin,
              host: 'attacker.invalid',
              omitAuthorization: true,
              body: { name: 'push', args: { repositoryId: 7 } },
            })
          ).status,
          403
        )
        const publicStatus = await request(
          yolo.port!,
          '/api/v1/remote/status',
          '',
          { origin, host, omitAuthorization: true }
        )
        assert.equal(publicStatus.body.authenticationRequired, false)
        assert.equal(publicStatus.body.mode, 'yolo-lan')
      },
      undefined,
      { resolveLANAddresses: () => ['192.168.50.20'] }
    )
  })

  it('uses an HTTPS gateway in QR/status and falls back if a stable port is occupied', async () => {
    const blocker = Http.createServer()
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(0, '0.0.0.0', () => resolve())
    })
    const blockerAddress = blocker.address()
    assert.ok(blockerAddress && typeof blockerAddress !== 'string')
    const blockedPort = blockerAddress.port

    try {
      await withServer(
        async server => {
          server.setPreferredLANPort(blockedPort)
          await server.setGatewayURL('https://agent.example.test/desktop')
          const paired = await server.configure({ mode: 'paired-lan' })
          assert.notEqual(paired.port, blockedPort)
          assert.equal(paired.preferredLANPort, paired.port)
          assert.equal(paired.baseURL, 'https://agent.example.test/desktop')
          assert.equal(paired.transport, 'https-gateway')
          assert.match(
            paired.pairing!.qrURL,
            /agent=https%3A%2F%2Fagent\.example\.test%2Fdesktop/
          )

          const origin = new URL(paired.siteURL).origin
          const remoteStatus = await request(
            paired.port!,
            '/api/v1/remote/status',
            '',
            {
              origin,
              host: 'agent.example.test',
              omitAuthorization: true,
            }
          )
          assert.equal(remoteStatus.status, 200)
          assert.equal(remoteStatus.body.transportEncrypted, true)
          assert.equal(
            remoteStatus.body.gateway.expectedHost,
            'agent.example.test'
          )
          assert.match(remoteStatus.body.gateway.hostPolicy, /Host header/)
        },
        undefined,
        { resolveLANAddresses: () => ['192.168.50.20'] }
      )
    } finally {
      await new Promise<void>(resolve => blocker.close(() => resolve()))
    }
  })

  it('rotates tokens and removes discovery state on stop', async () => {
    await withServer(async (server, connection) => {
      const firstToken = connection.token
      const rotated = await server.regenerateToken()
      assert.notEqual(rotated.token, firstToken)
      assert.equal(
        (
          await request(connection.port, '/api/v1/info', firstToken, {
            tokenOverride: firstToken,
          })
        ).status,
        401
      )
      assert.equal(
        (await request(connection.port, '/api/v1/info', rotated.token!)).status,
        200
      )
      await server.stop()
      await assert.rejects(Fs.stat(connection.configPath))
      const restarted = await server.start()
      assert.notEqual(restarted.token, rotated.token)
      assert.equal(restarted.running, true)
    })
  })

  it('does not let an in-flight renderer command hold shutdown open', async () => {
    let commandStarted!: () => void
    const started = new Promise<void>(resolve => {
      commandStarted = resolve
    })
    await withServer(
      async (server, { port, token }) => {
        const pendingRequest = request(port, '/api/v1/command/push', token, {
          body: { repositoryId: 7 },
        }).catch(() => undefined)
        await started

        await Promise.race([
          server.stop(),
          new Promise<never>((_resolve, reject) =>
            setTimeout(
              () => reject(new Error('Agent server shutdown timed out')),
              1_000
            )
          ),
        ])
        await pendingRequest
        assert.equal(server.getStatus().running, false)
      },
      async () => {
        commandStarted()
        return new Promise<AgentCommandResult>(() => {})
      }
    )
  })

  it('supports the dependency-free CLI and stdio MCP proxy', async () => {
    await withServer(async (_server, connection) => {
      const root = process.cwd()
      const cli = Path.join(root, 'script', 'agent', 'desktop-agent.js')
      const proxy = Path.join(root, 'script', 'agent', 'mcp-stdio-proxy.js')
      const info = await execFile(
        process.execPath,
        [cli, '--config', connection.configPath, 'info'],
        { cwd: root }
      )
      const parsedInfo = JSON.parse(info.stdout)
      assert.equal(parsedInfo.name, 'desktop-material')
      assert.equal(info.stdout.includes(connection.token), false)

      const child = spawn(
        process.execPath,
        [proxy, '--config', connection.configPath],
        { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      let output = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', data => (output += data))
      child.stdin.end(
        `${JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'initialize' })}\n`
      )
      await once(child, 'close')
      const response = JSON.parse(output.trim())
      assert.equal(response.id, 9)
      assert.equal(response.result.protocolVersion, '2025-03-26')
      assert.equal(output.includes(connection.token), false)
    })
  })
})
