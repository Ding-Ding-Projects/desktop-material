import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { connect } from 'net'

import {
  isValidTrampolineToken,
  keepTrampolineTokenAliveUntilExit,
  onTrampolineTokenDisposed,
  retainTrampolineToken,
  wasTrampolineTokenRecentlyDisposed,
  withTrampolineToken,
} from '../../src/lib/trampoline/trampoline-tokens'
import {
  describeTrampolineCommand,
  TrampolineServer,
} from '../../src/lib/trampoline/trampoline-server'
import {
  ITrampolineCommand,
  TrampolineCommandIdentifier,
} from '../../src/lib/trampoline/trampoline-command'
import {
  getForcedAccountKey,
  getIsBackgroundTaskEnvironment,
  getTrampolineEnvironmentPath,
  withTrampolineEnv,
} from '../../src/lib/trampoline/trampoline-environment'

/**
 * A stand-in for a Git child process which is still running. Only the members
 * the token lifecycle relies on are needed.
 */
function createRunningChildProcess() {
  const emitter = new EventEmitter()
  const child = Object.assign(emitter, {
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
  })

  return {
    emitter,
    child: child as unknown as ChildProcess,
    exit(event: 'close' | 'error' = 'close') {
      child.exitCode = 0
      emitter.emit(event, event === 'close' ? 0 : new Error('spawn failed'))
    },
  }
}

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

/**
 * Send one command to a trampoline server and resolve with whatever it replied
 * before closing the connection. Rejects if the server never replies, which is
 * what a thrown (rather than handled) error used to look like to Git.
 */
async function sendTrampolineCommand(port: number, payload: string) {
  return new Promise<string>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(payload))
    const chunks: Array<Buffer> = []
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error('The trampoline server never replied.'))
    }, 5_000)

    socket.on('data', chunk => chunks.push(chunk))
    socket.on('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    socket.on('close', () => {
      clearTimeout(timeout)
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
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
    // `close` is intentionally private; the server is unref'ed so a lingering
    // listener could not hang the runner, but leaving one open across tests is
    // untidy.
    await (server as unknown as { close(): Promise<void> }).close()
  }
}

describe('trampoline token lifecycle', () => {
  it('keeps a revoked token valid until its child process exits', async () => {
    const gitProcess = createRunningChildProcess()
    let issued = ''

    await withTrampolineToken(async token => {
      issued = token
      keepTrampolineTokenAliveUntilExit(token, gitProcess.child)
      assert.equal(isValidTrampolineToken(token), true)
    })

    // The promise which requested the token has settled, but Git has not.
    assert.equal(isValidTrampolineToken(issued), true)
    assert.equal(wasTrampolineTokenRecentlyDisposed(issued), false)

    gitProcess.exit()

    assert.equal(isValidTrampolineToken(issued), false)
    assert.equal(wasTrampolineTokenRecentlyDisposed(issued), true)
  })

  it('releases the token when the child fails to spawn', async () => {
    const gitProcess = createRunningChildProcess()
    let issued = ''

    await withTrampolineToken(async token => {
      issued = token
      keepTrampolineTokenAliveUntilExit(token, gitProcess.child)
    })

    assert.equal(isValidTrampolineToken(issued), true)
    gitProcess.exit('error')
    assert.equal(isValidTrampolineToken(issued), false)
  })

  it('does not extend a token for a process which has already exited', async () => {
    const gitProcess = createRunningChildProcess()
    gitProcess.exit()

    let issued = ''
    await withTrampolineToken(async token => {
      issued = token
      keepTrampolineTokenAliveUntilExit(token, gitProcess.child)
    })

    assert.equal(isValidTrampolineToken(issued), false)
  })

  it('survives every lease and disposes exactly once', async () => {
    let issued = ''
    let releaseFirst: () => void = () => {}
    let releaseSecond: () => void = () => {}
    let disposals = 0

    await withTrampolineToken(async token => {
      issued = token
      onTrampolineTokenDisposed(token, () => {
        disposals++
      })
      releaseFirst = retainTrampolineToken(token)
      releaseSecond = retainTrampolineToken(token)
    })

    assert.equal(isValidTrampolineToken(issued), true)
    releaseFirst()
    releaseFirst()
    assert.equal(isValidTrampolineToken(issued), true)
    assert.equal(disposals, 0)

    releaseSecond()
    assert.equal(isValidTrampolineToken(issued), false)
    assert.equal(disposals, 1)

    // Retaining a disposed token must never resurrect it.
    retainTrampolineToken(issued)()
    assert.equal(isValidTrampolineToken(issued), false)
    assert.equal(disposals, 1)
  })

  it('runs a disposal callback immediately for an unknown token', () => {
    let ran = false
    onTrampolineTokenDisposed('not-a-token', () => {
      ran = true
    })
    assert.equal(ran, true)
  })

  it('keeps the operation context readable while the child is alive', async () => {
    const gitProcess = createRunningChildProcess()
    let issued = ''

    await withTrampolineEnv(
      async (_env, token) => {
        issued = token
        keepTrampolineTokenAliveUntilExit(token, gitProcess.child)
      },
      'C:\\repository',
      true,
      undefined,
      'https://api.github.com/|octocat'
    )

    // A late credential request must still be answered with the context of the
    // operation which issued the token, not with a default working directory
    // or an unforced account.
    assert.equal(isValidTrampolineToken(issued), true)
    assert.equal(getTrampolineEnvironmentPath(issued), 'C:\\repository')
    assert.equal(getIsBackgroundTaskEnvironment(issued), true)
    assert.equal(getForcedAccountKey(issued), 'https://api.github.com/|octocat')

    gitProcess.exit()

    assert.equal(isValidTrampolineToken(issued), false)
    assert.notEqual(getTrampolineEnvironmentPath(issued), 'C:\\repository')
    assert.equal(getIsBackgroundTaskEnvironment(issued), false)
    assert.equal(getForcedAccountKey(issued), undefined)
  })
})

describe('trampoline server invalid token handling', () => {
  it('replies and declines instead of throwing for an expired token', async () => {
    let issued = ''
    await withTrampolineToken(async token => {
      issued = token
    })

    const warnings: Array<string> = []
    const originalWarn = log.warn
    log.warn = (message: string) => {
      warnings.push(message)
    }

    try {
      await withServer(async (server, port) => {
        let handled = 0
        server.registerCommandHandler(
          TrampolineCommandIdentifier.CredentialHelper,
          async () => {
            handled++
            return 'password=should-never-be-sent\n'
          }
        )

        const reply = await sendTrampolineCommand(
          port,
          encodeTrampolineCommand(
            TrampolineCommandIdentifier.CredentialHelper,
            issued,
            ['get'],
            'protocol=https\nhost=github.com\n'
          )
        )

        assert.equal(reply, '')
        assert.equal(handled, 0)
      })
    } finally {
      log.warn = originalWarn
    }

    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Declining trampoline command CREDENTIALHELPER/)
    assert.match(warnings[0], /already finished/)
    assert.equal(warnings[0].includes(issued), false)
  })

  it('distinguishes a token this session never issued', async () => {
    const warnings: Array<string> = []
    const originalWarn = log.warn
    log.warn = (message: string) => {
      warnings.push(message)
    }

    try {
      await withServer(async (_server, port) => {
        const reply = await sendTrampolineCommand(
          port,
          encodeTrampolineCommand(
            TrampolineCommandIdentifier.AskPass,
            'a-token-from-somewhere-else',
            ["Enter passphrase for key '/home/user/.ssh/id_ed25519': "]
          )
        )

        assert.equal(reply, '')
      })
    } finally {
      log.warn = originalWarn
    }

    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /not issued by this session/)
    // The askpass prompt names a key path, which never belongs in a log line.
    assert.equal(warnings[0].includes('id_ed25519'), false)
  })

  it('still serves a command whose child process outlived its operation', async () => {
    const gitProcess = createRunningChildProcess()
    let issued = ''

    await withTrampolineToken(async token => {
      issued = token
      keepTrampolineTokenAliveUntilExit(token, gitProcess.child)
    })

    await withServer(async (server, port) => {
      server.registerCommandHandler(
        TrampolineCommandIdentifier.CredentialHelper,
        async command => {
          assert.equal(command.trampolineToken, issued)
          return 'username=octocat\n'
        }
      )

      const reply = await sendTrampolineCommand(
        port,
        encodeTrampolineCommand(
          TrampolineCommandIdentifier.CredentialHelper,
          issued,
          ['get'],
          'protocol=https\nhost=github.com\n'
        )
      )

      assert.equal(reply, 'username=octocat\n')
    })

    gitProcess.exit()
  })

  it('replies when a command handler rejects', async () => {
    await withServer(async (server, port) => {
      server.registerCommandHandler(
        TrampolineCommandIdentifier.CredentialHelper,
        async () => {
          throw new Error('handler exploded')
        }
      )

      await withTrampolineToken(async token => {
        const reply = await sendTrampolineCommand(
          port,
          encodeTrampolineCommand(
            TrampolineCommandIdentifier.CredentialHelper,
            token,
            ['get']
          )
        )

        assert.equal(reply, '')
      })
    })
  })

  it('describes a command without leaking its token, stdin, or prompt', () => {
    const command: ITrampolineCommand = {
      identifier: TrampolineCommandIdentifier.CredentialHelper,
      trampolineToken: 'super-secret-token',
      parameters: ['store'],
      environmentVariables: new Map(),
      stdin: 'protocol=https\nhost=github.com\npassword=hunter2\n',
    }

    const description = describeTrampolineCommand(command)

    assert.equal(description, 'CREDENTIALHELPER store (1 parameter(s))')
    assert.equal(description.includes('super-secret-token'), false)
    assert.equal(description.includes('hunter2'), false)

    assert.equal(
      describeTrampolineCommand({
        ...command,
        identifier: TrampolineCommandIdentifier.AskPass,
        parameters: ["Enter passphrase for key '/home/user/.ssh/id_ed25519': "],
      }),
      'ASKPASS (1 parameter(s))'
    )
  })
})
