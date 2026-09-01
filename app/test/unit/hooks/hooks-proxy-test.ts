import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import { Readable, Writable } from 'stream'
import { EventEmitter } from 'events'

import type { HookProgress } from '../../../src/lib/git'
import type { ProcessProxyConnection } from 'process-proxy'

mock.module('dugite', {
  namedExports: {
    resolveGitBinary: () => process.execPath,
  },
})

let createHooksProxy: typeof import('../../../src/lib/hooks/hooks-proxy').createHooksProxy

before(async () => {
  createHooksProxy = (await import('../../../src/lib/hooks/hooks-proxy'))
    .createHooksProxy
})

class FakeConnection extends EventEmitter {
  public readonly stdin: Readable
  public readonly stderr: Writable
  public readonly output: string[] = []
  public readonly exitCodes: number[] = []
  private readonly hasStdin: boolean

  public constructor(
    private readonly hookArgs: string[],
    private readonly cwd: string,
    hasStdin: boolean,
    stdin: Readable = Readable.from([]),
    failStderrAfterWrites?: number
  ) {
    super()
    this.hasStdin = hasStdin
    this.stdin = hasStdin ? stdin : Readable.from([])
    let writeCount = 0
    this.stderr = new Writable({
      write: (chunk, _encoding, callback) => {
        if (
          failStderrAfterWrites !== undefined &&
          writeCount++ >= failStderrAfterWrites
        ) {
          callback(new Error('proxy stderr stream exploded'))
          return
        }
        this.output.push(chunk.toString())
        callback()
      },
    })
  }

  public async getArgs() {
    return this.hookArgs
  }

  public async getEnv() {
    return { GIT_EXEC_PATH: 'configured' }
  }

  public async getCwd() {
    return this.cwd
  }

  public async isStdinConnected() {
    return this.hasStdin
  }

  public async exit(code: number) {
    this.exitCodes.push(code)
    this.emit('close')
  }
}

const successShell = async () => ({
  kind: 'success' as const,
  env: { GIT_EXEC_PATH: 'configured' },
})

function progressStatuses(progress: HookProgress[]) {
  return progress.map(({ status }) => status)
}

describe('hooks/hooks-proxy', () => {
  it('reports exactly one terminal failure when hook spawning errors', async () => {
    const progress: HookProgress[] = []
    const conn = new FakeConnection(
      ['pre-push'],
      'C:\\path-that-does-not-exist-for-hook-proxy-test',
      false
    )
    const proxy = createHooksProxy(successShell, event => progress.push(event))

    await proxy(conn as unknown as ProcessProxyConnection)

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.match(conn.output.join(''), /Failed to run pre-push hook:/)
  })

  it('reports exactly one terminal failure when shell setup fails', async () => {
    const progress: HookProgress[] = []
    const conn = new FakeConnection(['pre-commit'], 'C:\\repo', false)
    const proxy = createHooksProxy(
      async () => ({ kind: 'failure' as const }),
      event => progress.push(event)
    )

    await proxy(conn as unknown as ProcessProxyConnection)

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.match(conn.output.join(''), /Failed to load shell environment/)
  })

  it('reports exactly one terminal failure when proxy stderr errors', async () => {
    const progress: HookProgress[] = []
    const conn = new FakeConnection(
      ['pre-push'],
      'C:\\repo',
      false,
      Readable.from([]),
      1
    )
    const proxy = createHooksProxy(successShell, event => progress.push(event))

    await proxy(conn as unknown as ProcessProxyConnection)

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
  })

  it('reports exactly one terminal failure when stdin aborts', async () => {
    const progress: HookProgress[] = []
    const stdin = new Readable({ read() {} })
    const conn = new FakeConnection(['pre-push'], 'C:\\repo', true, stdin)
    const proxy = createHooksProxy(successShell, event => {
      progress.push(event)
      if (event.status === 'started') {
        setImmediate(() => conn.emit('close'))
      }
    })

    await proxy(conn as unknown as ProcessProxyConnection)

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.match(conn.output.join(''), /hook pre-push aborted/)
  })

  it('reports exactly one terminal result after the child closes', async () => {
    const progress: HookProgress[] = []
    const conn = new FakeConnection(['pre-commit'], 'C:\\repo', false)
    const proxy = createHooksProxy(successShell, event => progress.push(event))

    await proxy(conn as unknown as ProcessProxyConnection)

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
  })
})
