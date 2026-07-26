import assert from 'node:assert'
import { promises as Fs } from 'node:fs'
import * as Http from 'node:http'
import { connect } from 'node:net'
import * as Os from 'node:os'
import * as Path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { AgentServer } from '../../src/main-process/agent-server/agent-server'
import { AgentCommandResult } from '../../src/lib/agent-commands'

async function withAgentServer(
  execute: () => Promise<AgentCommandResult>,
  callback: (port: number, token: string) => Promise<void>
) {
  const directory = await Fs.mkdtemp(
    Path.join(Os.tmpdir(), 'dm-agent-peer-close-')
  )
  const server = new AgentServer(
    Path.join(directory, 'agent-server.json'),
    async () => await execute()
  )
  try {
    const status = await server.start()
    assert.notEqual(status.port, null)
    assert.notEqual(status.token, null)
    await callback(status.port!, status.token!)
  } finally {
    await server.stop()
    await Fs.rm(directory, { recursive: true, force: true })
  }
}

function get(port: number, path: string, token: string) {
  return new Promise<number>((resolve, reject) => {
    const request = Http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: {
          Host: `127.0.0.1:${port}`,
          Authorization: `Bearer ${token}`,
          Connection: 'close',
        },
      },
      response => {
        response.resume()
        response.on('end', () => resolve(response.statusCode ?? 0))
      }
    )
    request.on('error', reject)
    request.end()
  })
}

describe('agent server clients that disconnect mid-request', () => {
  it('survives a client that vanishes before the response is written', async () => {
    let releaseCommand!: () => void
    const commandGate = new Promise<void>(resolve => (releaseCommand = resolve))
    let commandStarted!: () => void
    const started = new Promise<void>(resolve => (commandStarted = resolve))

    await withAgentServer(
      async () => {
        commandStarted()
        await commandGate
        return { ok: true, data: { command: 'push' } }
      },
      async (port, token) => {
        const body = JSON.stringify({ name: 'push', args: { repositoryId: 7 } })
        const socket = connect(port, '127.0.0.1', () => {
          socket.write(
            `POST /api/v1/commands HTTP/1.1\r\n` +
              `Host: 127.0.0.1:${port}\r\n` +
              `Authorization: Bearer ${token}\r\n` +
              `Content-Type: application/json\r\n` +
              `Content-Length: ${Buffer.byteLength(body)}\r\n` +
              `Connection: close\r\n\r\n${body}`
          )
        })
        socket.on('error', () => {
          // The test destroys this end on purpose.
        })

        await started
        // The browser tab closes (or the paired device drops off the LAN)
        // while the command is still running.
        socket.destroy()
        await delay(50)
        releaseCommand()
        await delay(100)

        // Unguarded, the response write would have emitted an unlistened
        // 'error' and taken the process down. The server is still serving.
        assert.equal(await get(port, '/api/v1/info', token), 200)
      }
    )
  })

  it('answers a malformed request without crashing the server', async () => {
    await withAgentServer(
      async () => ({ ok: true, data: { command: 'push' } }),
      async (port, token) => {
        await new Promise<void>(resolve => {
          const socket = connect(port, '127.0.0.1', () => {
            socket.write('this is not a request line\r\n\r\n')
            // Leave before the 400 can be delivered.
            setTimeout(() => {
              socket.destroy()
              resolve()
            }, 25)
          })
          socket.on('error', () => resolve())
        })
        await delay(50)

        assert.equal(await get(port, '/api/v1/info', token), 200)
      }
    )
  })
})
