import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  IOwnedShutdownClock,
  OwnedProcessShutdownBarrier,
  OwnedShutdownEvent,
} from '../../../src/main-process/owned-process-shutdown'

const flushPromises = () => new Promise(resolve => setImmediate(resolve))

describe('owned process shutdown barrier', () => {
  it('blocks only will-quit until one concurrent teardown and then permits final quit', async () => {
    let release!: () => void
    const teardown = new Promise<void>(resolve => {
      release = resolve
    })
    let shutdowns = 0
    let quits = 0
    const barrier = new OwnedProcessShutdownBarrier(
      [
        {
          name: 'fixture process',
          run: async () => {
            shutdowns++
            await teardown
          },
        },
      ],
      () => {
        quits++
      }
    )
    let prevented = 0
    const event = {
      preventDefault: () => {
        prevented++
      },
    }

    barrier.handle(event)
    barrier.handle(event)
    await Promise.resolve()
    assert.equal(prevented, 2)
    assert.equal(shutdowns, 1)
    assert.equal(quits, 0)
    release()
    await teardown
    await flushPromises()
    assert.equal(quits, 1)

    barrier.handle(event)
    assert.equal(prevented, 2)
    assert.equal(shutdowns, 1)
  })

  it('reports the exact pending task and quits after the hard deadline', async () => {
    let now = 1_000
    let fireTimeout: (() => void) | null = null
    let timeoutDelay = 0
    const clock: IOwnedShutdownClock = {
      now: () => now,
      setTimeout: (callback, milliseconds) => {
        fireTimeout = callback
        timeoutDelay = milliseconds
        return callback
      },
      clearTimeout: () => {},
    }
    const events = new Array<OwnedShutdownEvent>()
    let quits = 0
    const barrier = new OwnedProcessShutdownBarrier(
      [
        { name: 'fast process', run: async () => {} },
        {
          name: 'stuck process',
          run: () => new Promise<void>(() => {}),
        },
      ],
      () => {
        quits++
      },
      25,
      event => events.push(event),
      clock
    )
    let prevented = 0
    const event = { preventDefault: () => prevented++ }

    barrier.handle(event)
    await flushPromises()
    assert.equal(timeoutDelay, 25)
    assert.notEqual(fireTimeout, null)
    assert.equal(quits, 0)
    now += 25
    fireTimeout!()
    await flushPromises()

    assert.equal(quits, 1)
    assert.deepEqual(
      events
        .filter(value => value.kind === 'timed-out')
        .map(value => value.name),
      ['stuck process']
    )
    barrier.handle(event)
    assert.equal(prevented, 1)
  })

  it('contains task and reporter failures without blocking final quit', async () => {
    let quits = 0
    const barrier = new OwnedProcessShutdownBarrier(
      [
        {
          name: 'broken process',
          run: async () => {
            throw new Error('cleanup failed')
          },
        },
      ],
      () => {
        quits++
      },
      10_000,
      () => {
        throw new Error('logger failed')
      }
    )

    barrier.handle({ preventDefault: () => {} })
    await flushPromises()
    assert.equal(quits, 1)
  })
})
