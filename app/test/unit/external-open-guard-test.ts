import assert from 'node:assert'
import * as childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import { before, beforeEach, describe, it, mock } from 'node:test'

import {
  ExternalOpenGuard,
  externalOpenTarget,
} from '../../src/lib/external-open-guard'
import type { FoundEditor } from '../../src/lib/editors/shared'
import type { Dispatcher } from '../../src/ui/dispatcher'

interface ISpawnCall {
  readonly exe: string
  readonly args: ReadonlyArray<string>
}

class FakeChild extends EventEmitter {
  public unref(): void {}
}

/** How the next mocked `spawn` should settle. */
let spawnOutcome: 'spawn' | 'error' = 'spawn'
const spawnCalls = new Array<ISpawnCall>()

// Only `spawn` is replaced; the rest of the module has to stay real because
// unrelated modules in the dispatcher's import graph destructure `execFile`
// and friends at load time.
mock.module('child_process', {
  namedExports: {
    ...childProcess,
    spawn: (exe: string, args: ReadonlyArray<string>) => {
      const child = new FakeChild()
      spawnCalls.push({ exe, args })
      // Settle on a later turn so the launcher has attached its listeners,
      // exactly like a real spawn.
      setImmediate(() => {
        if (spawnOutcome === 'spawn') {
          child.emit('spawn')
        } else {
          child.emit('error', new Error('spawn refused'))
        }
      })
      return child
    },
  },
})

describe('external open guard', () => {
  it('refuses a second claim for the same target', async () => {
    const guard = new ExternalOpenGuard()
    const started = new Array<string>()
    let releaseFirst = () => {}
    const blocked = new Promise<void>(resolve => {
      releaseFirst = resolve
    })

    const first = guard.run('editor\0a', () => {
      started.push('first')
      return blocked
    })
    const second = guard.run('editor\0a', () => {
      started.push('second')
      return Promise.resolve()
    })

    assert.deepEqual(started, ['first'])
    assert.equal(guard.isOpening('editor\0a'), true)
    assert.equal(await second, undefined)

    releaseFirst()
    await first
    assert.equal(guard.isOpening('editor\0a'), false)
  })

  it('keeps different targets independent', () => {
    const guard = new ExternalOpenGuard()
    const started = new Array<string>()
    const pending = new Promise<void>(() => {})

    guard.run('editor\0a', () => {
      started.push('a')
      return pending
    })
    guard.run('editor\0b', () => {
      started.push('b')
      return pending
    })

    assert.deepEqual(started, ['a', 'b'])
  })

  it('releases the claim when the work fails', async () => {
    const guard = new ExternalOpenGuard()

    await assert.rejects(
      guard.run('editor\0a', () => Promise.reject(new Error('nope'))),
      /nope/
    )
    assert.equal(guard.isOpening('editor\0a'), false)

    let ran = false
    await guard.run('editor\0a', () => {
      ran = true
      return Promise.resolve()
    })
    assert.equal(ran, true)
  })

  it('propagates a synchronous throw and still releases', () => {
    const guard = new ExternalOpenGuard()

    assert.throws(() => {
      guard.run('editor\0a', () => {
        throw new Error('boom')
      })
    }, /boom/)
    assert.equal(guard.isOpening('editor\0a'), false)
  })

  it('notifies subscribers on claim and release until they unsubscribe', async () => {
    const guard = new ExternalOpenGuard()
    let notifications = 0
    const unsubscribe = guard.subscribe(() => {
      notifications++
    })

    await guard.run('editor\0a', () => Promise.resolve())
    assert.equal(notifications, 2)

    // A refused claim changes nothing, so it must not notify.
    const pending = new Promise<void>(() => {})
    guard.run('editor\0a', () => pending)
    guard.run('editor\0a', () => pending)
    assert.equal(notifications, 3)

    unsubscribe()
    await guard.run('editor\0b', () => Promise.resolve())
    assert.equal(notifications, 3)
  })

  it('namespaces targets by kind so unrelated opens never collide', () => {
    const path = '/repo/README.md'

    assert.notEqual(
      externalOpenTarget('editor', path),
      externalOpenTarget('file-manager', path)
    )
    assert.notEqual(
      externalOpenTarget('editor', path),
      externalOpenTarget('default-app', path)
    )
    // A chosen editor is a different target than the default-editor open.
    assert.notEqual(
      externalOpenTarget('editor', path),
      externalOpenTarget('editor', path, 'code', undefined)
    )
    assert.equal(externalOpenTarget('editor', path), `editor\0${path}`)
  })
})

describe('guarded open in external editor', () => {
  const editor: FoundEditor = { editor: 'Fake Editor', path: process.execPath }
  const launchErrors = new Array<unknown>()
  let dispatcher: Dispatcher

  before(async () => {
    const { launchExternalEditor } = await import(
      '../../src/lib/editors/launch'
    )
    const { Dispatcher: DispatcherClass } = await import(
      '../../src/ui/dispatcher'
    )

    const appStore = {
      _openInExternalEditor: async (fullPath: string) => {
        try {
          await launchExternalEditor(fullPath, editor)
        } catch (error) {
          // Mirrors AppStore, which reports the failure instead of rethrowing.
          launchErrors.push(error)
        }
      },
    }

    dispatcher = Object.create(DispatcherClass.prototype) as Dispatcher
    Object.assign(dispatcher, { appStore })
  })

  beforeEach(() => {
    spawnCalls.length = 0
    launchErrors.length = 0
    spawnOutcome = 'spawn'
  })

  it('launches one editor for two rapid activations of the same file', async () => {
    const path = '/repo/one-open.txt'

    // No await between them: this is the stuttered double-click.
    const first = dispatcher.openInExternalEditor(path)
    const second = dispatcher.openInExternalEditor(path)
    await Promise.all([first, second])

    assert.equal(spawnCalls.length, 1)
    assert.deepEqual(spawnCalls[0].args, [path])
    assert.deepEqual(launchErrors, [])
  })

  it('still launches both when the two activations target different files', async () => {
    await Promise.all([
      dispatcher.openInExternalEditor('/repo/a.txt'),
      dispatcher.openInExternalEditor('/repo/b.txt'),
    ])

    assert.equal(spawnCalls.length, 2)
    assert.deepEqual(spawnCalls.map(call => call.args[0]).sort(), [
      '/repo/a.txt',
      '/repo/b.txt',
    ])
  })

  it('honours a deliberate second open once the launch settled', async () => {
    const path = '/repo/reopen.txt'

    await dispatcher.openInExternalEditor(path)
    await dispatcher.openInExternalEditor(path)

    assert.equal(spawnCalls.length, 2)
  })

  it('re-opens the control after a failed launch', async () => {
    const path = '/repo/broken.txt'

    spawnOutcome = 'error'
    await dispatcher.openInExternalEditor(path)
    assert.equal(spawnCalls.length, 1)
    assert.equal(launchErrors.length, 1)

    spawnOutcome = 'spawn'
    await dispatcher.openInExternalEditor(path)
    assert.equal(spawnCalls.length, 2)
  })
})
