import assert from 'node:assert'
import { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as Path from 'node:path'
import { describe, it } from 'node:test'

import { MinecraftServerHost } from '../../src/main-process/minecraft-server-host'

class FakeJava extends EventEmitter {
  public readonly stdout = new EventEmitter()
  public readonly stderr = new EventEmitter()
  public readonly written = new Array<string>()
  public readonly stdin = {
    write: (text: string) => {
      this.written.push(text)
      if (text === 'stop\n') {
        setImmediate(() => this.emit('exit', 0, null))
      }
      return true
    },
  }
  public kill() {
    this.emit('exit', null, 'SIGTERM')
    return true
  }
}

async function setup() {
  const root = await mkdtemp(Path.join(tmpdir(), 'mc-host-'))
  const directory = await mkdtemp(Path.join(tmpdir(), 'mc-server-'))
  const spawned = new Array<{
    java: FakeJava
    command: string
    args: ReadonlyArray<string>
    cwd: string
    env: Record<string, string>
  }>()
  const host = new MinecraftServerHost(
    root,
    (command, args, options) => {
      const java = new FakeJava()
      spawned.push({ java, command, args, ...options })
      return java as unknown as ChildProcess
    },
    () => new Date('2026-11-09T20:00:00Z')
  )
  const draft = {
    name: 'Survival',
    directory,
    jar: 'server.jar',
    javaPath: 'java',
    memoryMegabytes: 2048,
    port: 25565,
  }
  return { root, directory, spawned, host, draft }
}

const tick = () => new Promise(resolve => setImmediate(resolve))

describe('MinecraftServerHost', () => {
  it('saves servers, rejects bad entries and survives a reload', async () => {
    const { root, host, draft } = await setup()
    assert.equal(
      (await host.saveServer({ ...draft, port: 80 }, null)).length,
      1
    )
    assert.deepEqual(await host.saveServer(draft, null), [])
    const [state] = await host.list()
    assert.equal(state.server.name, 'Survival')
    assert.equal(state.status, 'stopped')
    assert.equal(state.eulaAccepted, false)

    const reloaded = await new MinecraftServerHost(root).list()
    assert.equal(reloaded[0].server.id, state.server.id)
  })

  it('never starts a server before the EULA is accepted', async () => {
    const { directory, spawned, host, draft } = await setup()
    await host.saveServer(draft, null)
    const id = (await host.list())[0].server.id
    await writeFile(Path.join(directory, 'server.jar'), 'jar')

    assert.match((await host.start(id)) ?? '', /EULA/)
    assert.equal(spawned.length, 0)

    await host.acceptEula(id)
    assert.match(
      await readFile(Path.join(directory, 'eula.txt'), 'utf8'),
      /eula=true/
    )
    assert.equal(await host.start(id), null)
    assert.equal(spawned.length, 1)
  })

  it('reports a missing jar instead of starting', async () => {
    const { spawned, host, draft } = await setup()
    await host.saveServer(draft, null)
    const id = (await host.list())[0].server.id
    await host.acceptEula(id)
    assert.match((await host.start(id)) ?? '', /server\.jar was not found/)
    assert.equal(spawned.length, 0)
  })

  it('runs Java without a shell or secrets, and follows the console', async () => {
    const { directory, spawned, host, draft } = await setup()
    process.env.DESKTOP_MATERIAL_TEST_TOKEN = 'secret'
    await host.saveServer(draft, null)
    const id = (await host.list())[0].server.id
    await writeFile(Path.join(directory, 'server.jar'), 'jar')
    await host.acceptEula(id)
    await host.start(id)
    delete process.env.DESKTOP_MATERIAL_TEST_TOKEN

    const run = spawned[0]
    assert.equal(run.command, 'java')
    assert.deepEqual(run.args, ['-Xmx2048M', '-jar', 'server.jar', 'nogui'])
    assert.equal(run.cwd, directory)
    assert.equal('DESKTOP_MATERIAL_TEST_TOKEN' in run.env, false)

    assert.equal((await host.list())[0].status, 'starting')
    run.java.stdout.emit(
      'data',
      '[INFO]: Preparing level\n[INFO]: Done (3.2s)! For help\n'
    )
    assert.equal((await host.list())[0].status, 'running')

    const first = host.console(id, 0)
    assert.equal(first.lines.length, 3)
    assert.equal(first.status, 'running')
    assert.deepEqual(host.console(id, first.next).lines, [])

    assert.equal(await host.command(id, '/say hello'), true)
    assert.equal(await host.command(id, 'say a\nstop'), false)
    assert.deepEqual(run.java.written, ['say hello\n'])
    assert.deepEqual(host.console(id, first.next).lines, ['> say hello'])

    assert.deepEqual(await host.saveServer(draft, id), [
      'Stop the server before changing it.',
    ])
    await assert.rejects(host.remove(id))

    await host.stop(id)
    assert.equal((await host.list())[0].status, 'stopping')
    await tick()
    const after = (await host.list())[0]
    assert.equal(after.status, 'stopped')
    assert.equal(after.message, null)
    await host.remove(id)
    assert.deepEqual(await host.list(), [])
  })

  it('marks a server that dies by itself as crashed', async () => {
    const { directory, spawned, host, draft } = await setup()
    await host.saveServer(draft, null)
    const id = (await host.list())[0].server.id
    await writeFile(Path.join(directory, 'server.jar'), 'jar')
    await host.acceptEula(id)
    await host.start(id)
    spawned[0].java.emit('exit', 1, null)
    const state = (await host.list())[0]
    assert.equal(state.status, 'crashed')
    assert.match(state.message ?? '', /exit code 1/)
    assert.equal(await host.command(id, 'list'), false)
  })
})
