import { describe, it } from 'node:test'
import assert from 'node:assert'
import { resolve } from 'node:path'
import {
  AgentCommandQueue,
  executeAgentCommand,
  listAgentSSHHosts,
} from '../../src/lib/agent-command-executor'
import {
  AgentCommandName,
  AgentCommandVersion,
} from '../../src/lib/agent-commands'
import { Repository } from '../../src/models/repository'
import type { IAppState } from '../../src/lib/app-state'
import type { Dispatcher } from '../../src/ui/dispatcher'
import type { RepositoryTabsStore } from '../../src/lib/stores/repository-tabs-store'
import {
  ISSHWorkingCopyDefinition,
  ISSHWorkingCopyStorage,
  loadSSHWorkingCopies,
  saveSSHWorkingCopies,
} from '../../src/lib/ssh/ssh-working-copy'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => (resolve = done))
  return { promise, resolve }
}

describe('renderer agent command queue', () => {
  it('serializes commands for one repository', async () => {
    const queue = new AgentCommandQueue()
    const gate = deferred<void>()
    const order: string[] = []
    const first = queue.run('repo:1', async () => {
      order.push('first-start')
      await gate.promise
      order.push('first-end')
    })
    const second = queue.run('repo:1', async () => {
      order.push('second')
    })

    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(order, ['first-start'])
    gate.resolve()
    await Promise.all([first, second])
    assert.deepEqual(order, ['first-start', 'first-end', 'second'])
  })

  it('allows independent repositories to make progress concurrently', async () => {
    const queue = new AgentCommandQueue()
    const gate = deferred<void>()
    let secondRan = false
    const first = queue.run('repo:1', () => gate.promise)
    const second = queue.run('repo:2', async () => {
      secondRan = true
    })

    await second
    assert.equal(secondRan, true)
    gate.resolve()
    await first
  })

  it('continues a repository queue after a command failure', async () => {
    const queue = new AgentCommandQueue()
    await assert.rejects(
      queue.run('repo:1', async () => {
        throw new Error('expected')
      })
    )
    assert.equal(await queue.run('repo:1', async () => 42), 42)
  })
})

class MemoryStorage implements ISSHWorkingCopyStorage {
  private readonly values = new Map<string, string>()

  public getItem(key: string) {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  public removeItem(key: string) {
    this.values.delete(key)
  }
}

const sshDefinition = (
  id: string = 'a'.repeat(32)
): ISSHWorkingCopyDefinition => ({
  id,
  label: 'Build host',
  host: 'build.example.test',
  port: 2222,
  user: 'deploy',
  authenticationReference: resolve('private', 'id_ed25519'),
  destinationPath: '/srv/existing/private-checkout',
  sourceRemoteName: 'upstream',
  deployOnPush: true,
})

const stateWithRepositories = (paths: ReadonlyArray<string>): IAppState =>
  ({
    accounts: [],
    repositories: paths.map(
      (path, index) => new Repository(path, index + 1, null, false)
    ),
    selectedState: null,
  } as unknown as IAppState)

async function runSSHCommand(
  name: AgentCommandName,
  args: Readonly<Record<string, unknown>>,
  state: IAppState,
  storage: ISSHWorkingCopyStorage,
  runAction?: NonNullable<
    Parameters<typeof executeAgentCommand>[4]
  >['runAction']
) {
  return executeAgentCommand(
    { id: 'ssh-test', version: AgentCommandVersion, name, args },
    {} as Dispatcher,
    () => state,
    {} as RepositoryTabsStore,
    { storage, runAction }
  )
}

describe('renderer SSH agent commands', () => {
  it('lists only bounded, display-safe host metadata', async () => {
    const storage = new MemoryStorage()
    const repositoryPath = resolve('repositories', 'source')
    saveSSHWorkingCopies(repositoryPath, [sshDefinition()], storage)

    const result = await runSSHCommand(
      'list-ssh-hosts',
      {},
      stateWithRepositories([repositoryPath]),
      storage
    )
    assert.deepEqual(result, {
      ok: true,
      data: [
        {
          id: 'a'.repeat(32),
          name: 'Build host',
          address: 'build.example.test:2222',
          available: true,
        },
      ],
    })
    const serialized = JSON.stringify(result)
    assert.doesNotMatch(
      serialized,
      /authenticationReference|id_ed25519|private-checkout|sourceRemoteName|deployOnPush|"user"|deploy/
    )

    const repositoryPaths = Array.from({ length: 9 }, (_, repositoryIndex) => {
      const path = resolve('repositories', `bounded-${repositoryIndex}`)
      const definitions = Array.from({ length: 16 }, (_, hostIndex) => {
        const value = repositoryIndex * 16 + hostIndex + 1
        return sshDefinition(value.toString(16).padStart(32, '0'))
      })
      saveSSHWorkingCopies(path, definitions, storage)
      return path
    })
    assert.equal(listAgentSSHHosts(repositoryPaths, storage).length, 128)

    const collisionStorage = new MemoryStorage()
    const firstPath = resolve('repositories', 'collision-one')
    const secondPath = resolve('repositories', 'collision-two')
    saveSSHWorkingCopies(firstPath, [sshDefinition()], collisionStorage)
    saveSSHWorkingCopies(secondPath, [sshDefinition()], collisionStorage)
    assert.deepEqual(
      listAgentSSHHosts([firstPath, secondPath], collisionStorage),
      []
    )
  })

  it('routes a clone through the saved host and credential-vault runner', async () => {
    const storage = new MemoryStorage()
    const repositoryPath = resolve('repositories', 'source')
    const original = sshDefinition()
    saveSSHWorkingCopies(repositoryPath, [original], storage)
    const calls: Array<ReadonlyArray<unknown>> = []

    const result = await runSSHCommand(
      'clone-to-ssh',
      {
        hostId: original.id,
        url: 'ssh://git@example.test/team/project.git',
        path: '/srv/sites/project',
        branch: 'feature/site',
      },
      stateWithRepositories([repositoryPath]),
      storage,
      async (...args) => {
        calls.push(args)
        return { stdout: 'cloned', stderr: '' }
      }
    )

    assert.equal(result.ok, true)
    assert.deepEqual(calls, [
      [
        repositoryPath,
        { ...original, destinationPath: '/srv/sites/project' },
        'clone',
        'ssh://git@example.test/team/project.git',
        undefined,
        'feature/site',
      ],
    ])
    assert.deepEqual(loadSSHWorkingCopies(repositoryPath, storage), [original])
    assert.deepEqual(result, {
      ok: true,
      data: {
        cloned: true,
        host: {
          id: original.id,
          name: original.label,
          address: 'build.example.test:2222',
          available: true,
        },
        path: '/srv/sites/project',
        branch: 'feature/site',
      },
    })
  })

  it('rejects unknown targets, unsafe clone values, and extra arguments', async () => {
    const storage = new MemoryStorage()
    const repositoryPath = resolve('repositories', 'source')
    const definition = sshDefinition()
    saveSSHWorkingCopies(repositoryPath, [definition], storage)
    const state = stateWithRepositories([repositoryPath])
    let calls = 0
    const runAction: NonNullable<
      Parameters<typeof executeAgentCommand>[4]
    >['runAction'] = async () => {
      calls++
      return { stdout: '', stderr: '' }
    }
    const base = {
      hostId: definition.id,
      url: 'https://example.test/team/project.git',
      path: '/srv/sites/project',
    }
    const cases: ReadonlyArray<
      readonly [Readonly<Record<string, unknown>>, RegExp]
    > = [
      [{ ...base, hostId: 'b'.repeat(32) }, /not available/],
      [
        { ...base, url: 'https://user:secret@example.test/project.git' },
        /without embedded credentials/,
      ],
      [{ ...base, path: '../project' }, /absolute POSIX path/],
      [{ ...base, branch: 'main\nmalicious' }, /branch is invalid/],
      [{ ...base, password: 'nope' }, /Credential-shaped argument/],
      [{ ...base, unexpected: true }, /Unexpected command argument/],
    ]

    for (const [args, message] of cases) {
      const result = await runSSHCommand(
        'clone-to-ssh',
        args,
        state,
        storage,
        runAction
      )
      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.match(result.error.message, message)
      }
    }
    const listWithExtra = await runSSHCommand(
      'list-ssh-hosts',
      { repositoryId: 1 },
      state,
      storage,
      runAction
    )
    assert.equal(listWithExtra.ok, false)
    assert.equal(calls, 0)

    const runnerFailure = await runSSHCommand(
      'clone-to-ssh',
      base,
      state,
      storage,
      async () => {
        throw new Error(
          `Identity ${definition.authenticationReference} password=hunter2`
        )
      }
    )
    assert.equal(runnerFailure.ok, false)
    if (!runnerFailure.ok) {
      assert.match(runnerFailure.error.message, /redacted identity file/)
      assert.doesNotMatch(runnerFailure.error.message, /id_ed25519|hunter2/)
    }
  })
})
