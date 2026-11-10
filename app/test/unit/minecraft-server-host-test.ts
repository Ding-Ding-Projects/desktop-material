import assert from 'node:assert'
import { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
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

    run.java.stdout.emit('data', '[INFO]: Steve joined the game\n')
    assert.deepEqual(host.players(id), ['Steve'])

    const first = host.console(id, 0)
    assert.equal(first.lines.length, 4)
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
    assert.deepEqual(host.players(id), [])
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

  it('changes only listed settings and keeps the rest of the file', async () => {
    const { directory, host, draft } = await setup()
    await host.saveServer(draft, null)
    const id = (await host.list())[0].server.id
    assert.equal(
      (await host.settings(id)).find(s => s.spec.key === 'pvp')?.value,
      'true'
    )
    await writeFile(
      Path.join(directory, 'server.properties'),
      '#header\nonline-mode=true\npvp=true\n'
    )
    assert.equal(await host.setSetting(id, 'pvp', 'false'), null)
    assert.match(
      (await host.setSetting(id, 'online-mode', 'false')) ?? '',
      /cannot be changed/
    )
    assert.match((await host.setSetting(id, 'max-players', '0')) ?? '', /1 to/)
    assert.equal(
      await readFile(Path.join(directory, 'server.properties'), 'utf8'),
      '#header\nonline-mode=true\npvp=false\n'
    )
  })

  it('backs up the world only while the server is stopped', async () => {
    const { directory, host, draft } = await setup()
    await host.saveServer(draft, null)
    const id = (await host.list())[0].server.id
    assert.match((await host.backup(id)) ?? '', /no world folder/)

    await mkdir(Path.join(directory, 'world', 'region'), { recursive: true })
    await writeFile(Path.join(directory, 'world', 'region', 'r.0.0.mca'), 'x')
    assert.equal(await host.backup(id), null)
    const backups = await host.backups(id)
    assert.deepEqual(
      backups.map(b => b.name),
      ['world-2026-11-09T200000Z']
    )
    assert.equal(
      await readFile(
        Path.join(directory, 'backups', backups[0].name, 'region', 'r.0.0.mca'),
        'utf8'
      ),
      'x'
    )
    assert.match((await host.backup(id)) ?? '', /already exists/)

    await writeFile(
      Path.join(directory, 'server.properties'),
      'level-name=..\n'
    )
    assert.match((await host.backup(id)) ?? '', /cannot be backed up/)

    await writeFile(Path.join(directory, 'server.properties'), '')
    await writeFile(Path.join(directory, 'server.jar'), 'jar')
    await host.acceptEula(id)
    await host.start(id)
    assert.match((await host.backup(id)) ?? '', /Stop the server/)
  })

  it('lists plugin and mod jars', async () => {
    const { directory, host, draft } = await setup()
    await host.saveServer(draft, null)
    const id = (await host.list())[0].server.id
    assert.deepEqual(await host.addOns(id), [])
    await mkdir(Path.join(directory, 'plugins'))
    await writeFile(Path.join(directory, 'plugins', 'Essentials.jar'), 'abc')
    await writeFile(Path.join(directory, 'plugins', 'notes.txt'), 'x')
    assert.deepEqual(await host.addOns(id), [
      { name: 'Essentials.jar', kind: 'plugin', bytes: 3 },
    ])
  })

  it('browses and reads text files inside the server folder only', async () => {
    const { root, directory, host, draft } = await setup()
    await host.saveServer(draft, null)
    const id = (await host.list())[0].server.id
    await mkdir(Path.join(directory, 'logs'))
    await writeFile(Path.join(directory, 'logs', 'latest.log'), 'line one\n')
    await writeFile(Path.join(directory, 'server.jar'), 'jar')
    await writeFile(
      Path.join(directory, 'server.properties'),
      'motd=Hi\nrcon.password=hunter2\n'
    )
    await writeFile(Path.join(root, 'outside.txt'), 'secret')
    await symlink(root, Path.join(directory, 'escape'))

    assert.deepEqual(
      (await host.files(id, ''))?.map(e => `${e.kind}:${e.name}:${e.viewable}`),
      [
        'folder:logs:false',
        'file:server.jar:false',
        'file:server.properties:true',
      ]
    )
    assert.deepEqual(
      (await host.files(id, 'logs'))?.map(e => e.name),
      ['latest.log']
    )
    assert.equal(await host.files(id, '..'), null)
    assert.equal(await host.files(id, 'escape'), null)
    assert.equal(await host.files(id, 'missing'), null)

    assert.deepEqual(await host.readTextFile(id, 'logs/latest.log'), {
      text: 'line one\n',
      truncated: false,
    })
    assert.equal(
      (await host.readTextFile(id, 'server.properties'))?.text,
      'motd=Hi\nrcon.password=(hidden)\n'
    )
    assert.equal(await host.readTextFile(id, 'server.jar'), null)
    assert.equal(await host.readTextFile(id, 'escape/outside.txt'), null)
    assert.equal(await host.readTextFile(id, '../outside.txt'), null)

    await writeFile(
      Path.join(directory, 'logs', 'big.log'),
      'x'.repeat(300 * 1024) + '\nlast line\n'
    )
    const big = await host.readTextFile(id, 'logs/big.log')
    assert.equal(big?.truncated, true)
    assert.equal(big?.text.endsWith('last line\n'), true)
  })
})
