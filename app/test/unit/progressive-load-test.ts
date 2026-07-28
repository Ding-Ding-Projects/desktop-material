import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  IProgressiveLoadState,
  LatestLoadGate,
  ProgressiveLoad,
  asError,
  initialProgressiveLoadState,
} from '../../src/lib/progressive-load'

/** A promise whose settlement this test controls explicitly. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Let every already-settled microtask run. */
const flush = () => new Promise<void>(resolve => setImmediate(resolve))

describe('asError', () => {
  it('passes an Error through untouched', () => {
    const error = new Error('boom')
    assert.strictEqual(asError(error), error)
  })

  it('preserves a thrown string as the message', () => {
    assert.strictEqual(asError('not an error').message, 'not an error')
  })

  it('never loses a non-string rejection reason', () => {
    assert.strictEqual(asError(404).message, '404')
    assert.strictEqual(asError(null).message, 'null')
  })
})

describe('initialProgressiveLoadState', () => {
  it('starts idle with nothing cached', () => {
    const state = initialProgressiveLoadState<string>()
    assert.strictEqual(state.status, 'idle')
    assert.strictEqual(state.value, null)
    assert.strictEqual(state.error, null)
  })

  it('starts ready when seeded from a cache', () => {
    const state = initialProgressiveLoadState('cached')
    assert.strictEqual(state.status, 'ready')
    assert.strictEqual(state.value, 'cached')
  })
})

describe('LatestLoadGate', () => {
  it('issues strictly increasing tokens', () => {
    const gate = new LatestLoadGate()
    assert.strictEqual(gate.begin(), 1)
    assert.strictEqual(gate.begin(), 2)
    assert.strictEqual(gate.begin(), 3)
  })

  it('reports only the newest started load as latest', () => {
    const gate = new LatestLoadGate()
    const first = gate.begin()
    const second = gate.begin()
    assert.strictEqual(gate.isLatest(first), false)
    assert.strictEqual(gate.isLatest(second), true)
  })

  it('refuses a slow first result once a fast second has landed', () => {
    const gate = new LatestLoadGate()
    const slow = gate.begin()
    const fast = gate.begin()

    assert.strictEqual(gate.accept(fast), true)
    // The slow request now returns. It must not be allowed to overwrite the
    // newer answer that is already on screen.
    assert.strictEqual(gate.accept(slow), false)
  })

  it('accepts an older result when nothing newer has landed yet', () => {
    const gate = new LatestLoadGate()
    const first = gate.begin()
    gate.begin()

    // Painting the first answer is fine while the second is still in flight;
    // the second will simply replace it when it arrives.
    assert.strictEqual(gate.accept(first), true)
  })

  it('refuses the same token twice', () => {
    const gate = new LatestLoadGate()
    const token = gate.begin()
    assert.strictEqual(gate.accept(token), true)
    assert.strictEqual(gate.accept(token), false)
  })

  it('refuses every load that was in flight when cancelled', () => {
    const gate = new LatestLoadGate()
    const first = gate.begin()
    const second = gate.begin()
    gate.cancelInFlight()

    assert.strictEqual(gate.accept(first), false)
    assert.strictEqual(gate.accept(second), false)

    const afterCancel = gate.begin()
    assert.strictEqual(gate.accept(afterCancel), true)
  })
})

describe('ProgressiveLoad', () => {
  it('reports loading then ready for a first load', async () => {
    const seen: Array<IProgressiveLoadState<string>> = []
    const load = new ProgressiveLoad<string>(state => seen.push(state))

    const applied = await load.run(() => Promise.resolve('value'))

    assert.strictEqual(applied, true)
    assert.deepStrictEqual(
      seen.map(s => s.status),
      ['loading', 'ready']
    )
    assert.strictEqual(load.getState().value, 'value')
    assert.strictEqual(load.getState().error, null)
  })

  it('keeps the cached value visible while refreshing', async () => {
    const seen: Array<IProgressiveLoadState<string>> = []
    const load = new ProgressiveLoad<string>(state => seen.push(state), 'stale')

    const gate = deferred<string>()
    const run = load.run(() => gate.promise)
    await flush()

    const refreshing = load.getState()
    assert.strictEqual(refreshing.status, 'refreshing')
    assert.strictEqual(
      refreshing.value,
      'stale',
      'the previous value must stay on screen rather than flashing to a spinner'
    )

    gate.resolve('fresh')
    await run
    assert.strictEqual(load.getState().status, 'ready')
    assert.strictEqual(load.getState().value, 'fresh')
  })

  it('surfaces a rejection as a failure carrying the real error', async () => {
    const load = new ProgressiveLoad<string>(() => undefined)
    const failure = new Error('the network said no')

    const applied = await load.run(() => Promise.reject(failure))

    assert.strictEqual(applied, true)
    assert.strictEqual(load.getState().status, 'failed')
    assert.strictEqual(load.getState().error, failure)
  })

  it('does not reject, so a failure cannot become an unhandled rejection', async () => {
    const load = new ProgressiveLoad<string>(() => undefined)
    await assert.doesNotReject(() =>
      load.run(() => {
        throw new Error('thrown synchronously')
      })
    )
    assert.strictEqual(load.getState().error?.message, 'thrown synchronously')
  })

  it('retains the cached value across a failure', async () => {
    const load = new ProgressiveLoad<string>(() => undefined, 'cached')
    await load.run(() => Promise.reject(new Error('refresh failed')))

    const state = load.getState()
    assert.strictEqual(state.status, 'failed')
    assert.strictEqual(state.value, 'cached')
    assert.strictEqual(state.error?.message, 'refresh failed')
  })

  it('does not let a slow first load clobber a fast second one', async () => {
    const load = new ProgressiveLoad<string>(() => undefined)
    const slow = deferred<string>()
    const fast = deferred<string>()

    const slowRun = load.run(() => slow.promise)
    const fastRun = load.run(() => fast.promise)

    fast.resolve('second')
    assert.strictEqual(await fastRun, true)
    assert.strictEqual(load.getState().value, 'second')

    slow.resolve('first')
    assert.strictEqual(await slowRun, false)
    assert.strictEqual(
      load.getState().value,
      'second',
      'the out-of-order response must be dropped, not painted'
    )
  })

  it('drops a slow failure that would replace a newer success', async () => {
    const load = new ProgressiveLoad<string>(() => undefined)
    const slow = deferred<string>()
    const fast = deferred<string>()

    const slowRun = load.run(() => slow.promise)
    const fastRun = load.run(() => fast.promise)

    fast.resolve('second')
    await fastRun

    slow.reject(new Error('stale failure'))
    assert.strictEqual(await slowRun, false)
    assert.strictEqual(load.getState().status, 'ready')
    assert.strictEqual(load.getState().error, null)
  })

  it('refuses an in-flight result after reset', async () => {
    const seen: Array<IProgressiveLoadState<string>> = []
    const load = new ProgressiveLoad<string>(state => seen.push(state), 'old')
    const pending = deferred<string>()

    const run = load.run(() => pending.promise)
    load.reset()
    assert.strictEqual(load.getState().value, null)

    pending.resolve('belongs to the previous subject')
    assert.strictEqual(await run, false)
    assert.strictEqual(load.getState().value, null)
  })

  it('emits nothing once disposed', async () => {
    let changes = 0
    const load = new ProgressiveLoad<string>(() => {
      changes += 1
    })
    const pending = deferred<string>()
    const run = load.run(() => pending.promise)
    const afterStart = changes

    load.dispose()
    pending.resolve('late')

    assert.strictEqual(await run, false)
    assert.strictEqual(changes, afterStart)
    assert.strictEqual(
      await load.run(() => Promise.resolve('ignored')),
      false,
      'a disposed loader must not start new work'
    )
  })

  it('never schedules a timer of its own', async () => {
    // A progressive surface has to be driven by work actually settling. If
    // this module ever grows a fake delay to make loading "look" progressive,
    // this test is where it should be caught.
    const source = await import('node:fs/promises').then(fs =>
      fs.readFile(
        new URL('../../src/lib/progressive-load.ts', import.meta.url),
        'utf8'
      )
    )
    assert.doesNotMatch(source, /setTimeout|setInterval|requestAnimationFrame/)
  })
})
