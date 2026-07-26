import assert from 'node:assert'
import { connect, createServer, Socket } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, it } from 'node:test'

import {
  replyToTrampolineClient,
  TrampolineServer,
} from '../../src/lib/trampoline/trampoline-server'
import {
  ITrampolineCommand,
  TrampolineCommandIdentifier,
} from '../../src/lib/trampoline/trampoline-command'
import { withTrampolineToken } from '../../src/lib/trampoline/trampoline-tokens'

/** Serialize a command the way the trampoline client writes it on the wire. */
function encodeTrampolineCommand(
  identifier: TrampolineCommandIdentifier,
  token: string,
  parameters: ReadonlyArray<string>,
  stdin = ''
) {
  const environmentVariables = [
    `DESKTOP_TRAMPOLINE_IDENTIFIER=${identifier}`,
    `DESKTOP_TRAMPOLINE_TOKEN=${token}`,
  ]

  return `${[
    parameters.length.toString(),
    ...parameters,
    environmentVariables.length.toString(),
    ...environmentVariables,
    stdin,
  ].join('\0')}\0`
}

async function withServer(
  fn: (server: TrampolineServer, port: number) => Promise<void>
) {
  const server = new TrampolineServer()
  const port = await server.getPort()
  assert.notEqual(port, null)

  try {
    await fn(server, port as number)
  } finally {
    await (server as unknown as { close(): Promise<void> }).close()
  }
}

/**
 * Hand back both ends of a real connection. The peer end is the one the test
 * destroys, which is the only way to produce the write-after-close race the
 * guards exist for.
 */
async function connectedPair(): Promise<{
  readonly server: Socket
  readonly client: Socket
  readonly dispose: () => void
}> {
  return await new Promise((resolve, reject) => {
    const listener = createServer(serverSocket => {
      serverSocket.on('error', () => {
        // The peer-close is the subject of the test, not a failure.
      })
      resolve({
        server: serverSocket,
        client,
        dispose: () => {
          serverSocket.destroy()
          client.destroy()
          listener.close()
        },
      })
    })
    listener.on('error', reject)
    let client!: Socket
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address() as { port: number }
      client = connect(port, '127.0.0.1')
      client.on('error', () => {
        // Same: the test destroys this end on purpose.
      })
    })
  })
}

describe('trampoline replies to a client that already disconnected', () => {
  it('writes the reply while the client is still there', async () => {
    const { server, client, dispose } = await connectedPair()
    try {
      const received = new Promise<string>(resolve => {
        const chunks: Array<Buffer> = []
        client.on('data', chunk => chunks.push(chunk))
        client.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      })

      assert.equal(replyToTrampolineClient(server, 'password=hunter2\n'), true)
      assert.equal(await received, 'password=hunter2\n')
    } finally {
      dispose()
    }
  })

  it('skips the write once the reader destroyed the connection', async () => {
    const { server, client, dispose } = await connectedPair()
    try {
      client.destroy()
      // Let the FIN/RST reach the server end.
      await delay(50)

      const warnings: Array<string> = []
      const originalWarn = log.warn
      log.warn = (message: string) => warnings.push(message)
      try {
        // Would throw or emit an unlistened 'error' without the guard; the
        // runner fails the file either way.
        assert.equal(
          replyToTrampolineClient(server, 'password=hunter2\n'),
          false
        )
      } finally {
        log.warn = originalWarn
      }

      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /disconnected before its reply/)
      // The reply carries a credential and must never reach a log line.
      assert.equal(warnings[0].includes('hunter2'), false)
    } finally {
      dispose()
    }
  })

  it('skips a bare close on a destroyed connection', async () => {
    const { server, client, dispose } = await connectedPair()
    try {
      client.destroy()
      await delay(50)

      const originalWarn = log.warn
      log.warn = () => {}
      try {
        assert.equal(replyToTrampolineClient(server), false)
      } finally {
        log.warn = originalWarn
      }
    } finally {
      dispose()
    }
  })

  it('survives a client that vanishes while a handler is still resolving', async () => {
    await withServer(async (server, port) => {
      let releaseHandler!: () => void
      let handlerEntered!: () => void
      const gate = new Promise<void>(resolve => (releaseHandler = resolve))
      const entered = new Promise<void>(resolve => (handlerEntered = resolve))

      const handled = new Array<ITrampolineCommand>()
      server.registerCommandHandler(
        TrampolineCommandIdentifier.AskPass,
        async command => {
          handled.push(command)
          handlerEntered()
          await gate
          return 'a-late-passphrase\n'
        }
      )

      await withTrampolineToken(async token => {
        const socket = connect(port, '127.0.0.1', () =>
          socket.write(
            encodeTrampolineCommand(
              TrampolineCommandIdentifier.AskPass,
              token,
              ['Username for https://github.com: ']
            )
          )
        )
        socket.on('error', () => {
          // Git being killed is the scenario, not a failure.
        })

        await entered
        // Git is killed (or times out) before the handler answers.
        socket.destroy()
        await delay(50)
        releaseHandler()
        await delay(100)
      })

      assert.equal(handled.length, 1)

      // The always-reply guarantee is intact for clients that are still there.
      await withTrampolineToken(async token => {
        // `gate` is already resolved, so this handler answers immediately.
        const reply = await new Promise<string>((resolve, reject) => {
          const chunks: Array<Buffer> = []
          const socket = connect(port, '127.0.0.1', () =>
            socket.write(
              encodeTrampolineCommand(
                TrampolineCommandIdentifier.AskPass,
                token,
                ['Username for https://github.com: ']
              )
            )
          )
          const timer = setTimeout(() => {
            socket.destroy()
            reject(new Error('The trampoline server never replied.'))
          }, 5_000)
          socket.on('data', chunk => chunks.push(chunk))
          socket.on('error', error => {
            clearTimeout(timer)
            reject(error)
          })
          socket.on('close', () => {
            clearTimeout(timer)
            resolve(Buffer.concat(chunks).toString('utf8'))
          })
        })

        assert.equal(reply, 'a-late-passphrase\n')
      })

      assert.equal(handled.length, 2)
    })
  })
})
