import assert from 'node:assert'
import { before, describe, it, mock, TestContext } from 'node:test'
import { access, mkdtemp, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable, Writable } from 'stream'
import { EventEmitter } from 'events'

import type { HookProgress } from '../../../src/lib/git'
import type { ProcessProxyConnection } from 'process-proxy'

mock.module('dugite', {
  namedExports: {
    resolveGitBinary: () => process.execPath,
  },
})

let nextChild: FakeChild | undefined
let nextSpawnError: Error | undefined
let lastSpawnArgs: string[] | undefined

mock.module('child_process', {
  namedExports: {
    execFile: mock.fn(),
    spawn: mock.fn((_file: string, args: string[]) => {
      if (nextSpawnError !== undefined) {
        const error = nextSpawnError
        nextSpawnError = undefined
        throw error
      }
      if (nextChild === undefined) {
        throw new Error('No fake child was queued')
      }
      const child = nextChild
      nextChild = undefined
      lastSpawnArgs = args
      child.onSpawn?.()
      return child
    }),
  },
})

let createHooksProxy: typeof import('../../../src/lib/hooks/hooks-proxy').createHooksProxy

before(async () => {
  createHooksProxy = (await import('../../../src/lib/hooks/hooks-proxy'))
    .createHooksProxy
})

class FakeChild extends EventEmitter {
  public readonly stdin = new Writable({
    write: (_chunk, _encoding, callback) => callback(),
  })
  public readonly stdout = new Readable({ read() {} })
  public readonly stderr = new Readable({ read() {} })
  public killCalls = 0
  public onSpawn: (() => void) | undefined

  public kill() {
    this.killCalls += 1
    this.close(null, 'SIGTERM')
  }

  public close(code: number | null, signal: NodeJS.Signals | null) {
    this.stdout.push(null)
    this.stderr.push(null)
    this.emit('close', code, signal)
  }
}

class FakeConnection extends EventEmitter {
  public readonly stdin: Readable
  public readonly stderr: Writable
  public readonly output: string[] = []
  public readonly exitCodes: number[] = []
  public onExit: (() => void) | undefined
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
    this.onExit?.()
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

async function temporaryDirectory(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'hook-proxy-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

describe('hooks/hooks-proxy', () => {
  it('reports one terminal failure for a child spawn error', async t => {
    const progress: HookProgress[] = []
    const conn = new FakeConnection(
      ['pre-push'],
      await temporaryDirectory(t),
      false
    )
    nextSpawnError = new Error('child spawn exploded')
    const proxy = createHooksProxy(successShell, event => progress.push(event))

    await proxy(conn as unknown as ProcessProxyConnection)

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.match(conn.output.join(''), /child spawn exploded/)
  })

  it('reports one terminal failure for shell setup', async t => {
    const progress: HookProgress[] = []
    const conn = new FakeConnection(
      ['pre-commit'],
      await temporaryDirectory(t),
      false
    )
    const proxy = createHooksProxy(
      async () => ({ kind: 'failure' as const }),
      event => progress.push(event)
    )

    await proxy(conn as unknown as ProcessProxyConnection)

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.match(conn.output.join(''), /Failed to load shell environment/)
  })

  it('handles a child stdin error without a second settlement', async t => {
    const progress: HookProgress[] = []
    const child = new FakeChild()
    nextChild = child
    const conn = new FakeConnection(
      ['pre-commit'],
      await temporaryDirectory(t),
      false
    )
    const proxy = createHooksProxy(successShell, event => progress.push(event))
    const pending = proxy(conn as unknown as ProcessProxyConnection)

    setImmediate(() =>
      child.stdin.emit('error', new Error('child stdin exploded'))
    )
    await pending

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.equal(child.killCalls, 1)
    assert.match(conn.output.join(''), /child stdin exploded/)
  })

  it('handles a child stderr source error without a second settlement', async t => {
    const progress: HookProgress[] = []
    const child = new FakeChild()
    nextChild = child
    const conn = new FakeConnection(
      ['pre-commit'],
      await temporaryDirectory(t),
      false
    )
    const proxy = createHooksProxy(successShell, event => progress.push(event))
    const pending = proxy(conn as unknown as ProcessProxyConnection)

    setImmediate(() =>
      child.stderr.emit('error', new Error('child stderr exploded'))
    )
    await pending

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.equal(child.killCalls, 1)
    assert.match(conn.output.join(''), /child stderr exploded/)
  })

  it('handles stderr output failure while the child is live', async t => {
    const progress: HookProgress[] = []
    const child = new FakeChild()
    nextChild = child
    const conn = new FakeConnection(
      ['pre-commit'],
      await temporaryDirectory(t),
      false,
      Readable.from([]),
      1
    )
    const proxy = createHooksProxy(successShell, event => progress.push(event))
    const pending = proxy(conn as unknown as ProcessProxyConnection)

    setImmediate(() => child.stderr.push('live child output'))
    await pending

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.equal(child.killCalls, 1)
  })

  it('owns and drains child stdout, including stdout errors', async t => {
    const progress: HookProgress[] = []
    const child = new FakeChild()
    nextChild = child
    const conn = new FakeConnection(
      ['pre-commit'],
      await temporaryDirectory(t),
      false
    )
    const proxy = createHooksProxy(successShell, event => progress.push(event))
    const pending = proxy(conn as unknown as ProcessProxyConnection)

    setImmediate(() =>
      child.stdout.emit('error', new Error('child stdout exploded'))
    )
    await pending

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.equal(child.killCalls, 1)
  })

  it('reports one finished event after a normal child close', async t => {
    const progress: HookProgress[] = []
    const child = new FakeChild()
    nextChild = child
    const conn = new FakeConnection(
      ['pre-commit'],
      await temporaryDirectory(t),
      false
    )
    const proxy = createHooksProxy(successShell, event => progress.push(event))
    const pending = proxy(conn as unknown as ProcessProxyConnection)

    setImmediate(() => child.close(0, null))
    await pending

    assert.deepEqual(progressStatuses(progress), ['started', 'finished'])
    assert.deepEqual(conn.exitCodes, [0])
    assert.equal(child.killCalls, 0)
    assert.equal(child.stdout.readableFlowing, true)
  })

  it('does not double-settle after a child error followed by close', async t => {
    const progress: HookProgress[] = []
    const child = new FakeChild()
    nextChild = child
    const conn = new FakeConnection(
      ['pre-commit'],
      await temporaryDirectory(t),
      false
    )
    const proxy = createHooksProxy(successShell, event => progress.push(event))
    const pending = proxy(conn as unknown as ProcessProxyConnection)

    setImmediate(() => {
      child.emit('error', new Error('child process exploded'))
      child.emit('close', 1, null)
    })
    await pending

    assert.deepEqual(progressStatuses(progress), ['started', 'failed'])
    assert.deepEqual(conn.exitCodes, [1])
    assert.equal(child.killCalls, 1)
  })

  it('aborts during spooling and emits one terminal failure', async t => {
    const progress: HookProgress[] = []
    const stdin = new Readable({ read() {} })
    const conn = new FakeConnection(
      ['pre-push'],
      await temporaryDirectory(t),
      true,
      stdin
    )
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

  it('disposes the private spool before connection exit completes', async t => {
    const progress: HookProgress[] = []
    const child = new FakeChild()
    nextChild = child
    const conn = new FakeConnection(
      ['pre-push'],
      await temporaryDirectory(t),
      true,
      Readable.from(['payload'])
    )
    let spoolPath: string | undefined
    let spoolPresentAtExit: boolean | undefined
    conn.onExit = () => {
      spoolPath = lastSpawnArgs
        ?.find(argument => argument.startsWith('--to-stdin='))
        ?.slice('--to-stdin='.length)
      spoolPresentAtExit =
        spoolPath === undefined ? undefined : existsSync(spoolPath)
    }
    const proxy = createHooksProxy(successShell, event => progress.push(event))
    child.onSpawn = () => setImmediate(() => child.close(0, null))
    const pending = proxy(conn as unknown as ProcessProxyConnection)

    await pending

    assert.deepEqual(progressStatuses(progress), ['started', 'finished'])
    assert.deepEqual(conn.exitCodes, [0])
    assert.equal(spoolPath === undefined, false)
    assert.equal(spoolPresentAtExit, false)
    await assert.rejects(() => access(spoolPath as string))
  })
})
