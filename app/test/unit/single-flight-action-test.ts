import assert from 'node:assert'
import { describe, it } from 'node:test'

import { SingleFlightActionRegistry } from '../../src/lib/single-flight-action'

describe('SingleFlightActionRegistry', () => {
  it('refuses the same target until asynchronous work settles', async () => {
    const registry = new SingleFlightActionRegistry()
    const calls = new Array<string>()
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })

    const first = registry.run('save:one', () => {
      calls.push('first')
      return pending
    })
    const second = registry.run('save:one', () => {
      calls.push('second')
      return Promise.resolve()
    })

    assert.deepEqual(calls, ['first'])
    assert.equal(await second, undefined)
    assert.equal(registry.isActive('save:one'), true)

    finish()
    await first
    assert.equal(registry.isActive('save:one'), false)
  })

  it('keeps different targets independent', async () => {
    const registry = new SingleFlightActionRegistry()
    const calls = new Array<string>()

    await Promise.all([
      registry.run('save:one', async () => calls.push('one')),
      registry.run('save:two', async () => calls.push('two')),
    ])

    assert.deepEqual(calls.sort(), ['one', 'two'])
  })

  it('releases synchronous handlers before returning', () => {
    const registry = new SingleFlightActionRegistry()
    let calls = 0

    registry.run('toggle', () => {
      calls++
    })
    registry.run('toggle', () => {
      calls++
    })

    assert.equal(calls, 2)
    assert.equal(registry.isActive('toggle'), false)
  })

  it('releases after rejection and synchronous throw', async () => {
    const registry = new SingleFlightActionRegistry()

    await assert.rejects(
      registry.run('reject', () => Promise.reject(new Error('rejected'))),
      /rejected/
    )
    assert.equal(registry.isActive('reject'), false)

    assert.throws(
      () =>
        registry.run('throw', () => {
          throw new Error('thrown')
        }),
      /thrown/
    )
    assert.equal(registry.isActive('throw'), false)
  })

  it('notifies only subscribers for the changed target', async () => {
    const registry = new SingleFlightActionRegistry()
    let one = 0
    let two = 0
    registry.subscribe('one', () => one++)
    registry.subscribe('two', () => two++)

    await registry.run('one', () => Promise.resolve())

    assert.equal(one, 2)
    assert.equal(two, 0)
  })
})
