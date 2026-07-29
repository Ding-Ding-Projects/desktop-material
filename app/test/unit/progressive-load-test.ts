import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
  asError,
  LatestLoadGate,
  ProgressiveLoad,
} from '../../src/lib/progressive-load'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../src/lib/i18n-resources'

interface IDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

function deferred<T>(): IDeferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('asError', () => {
  it('passes an Error through untouched', () => {
    const error = new Error('boom')
    assert.equal(asError(error), error)
  })

  it('preserves arbitrary rejection reasons as messages', () => {
    assert.equal(asError('offline').message, 'offline')
    assert.equal(asError(404).message, '404')
    assert.equal(asError(null).message, 'null')
  })

  it('keeps chunk failures actionable without exposing a local app path', () => {
    const error = new Error(
      'Loading chunk repository-tools failed.\n' +
        '(error: file:///C:/Users/example/AppData/Local/DesktopMaterial/out/repository-tools.js)'
    )
    error.name = 'ChunkLoadError'

    const normalized = asError(error)

    assert.equal(normalized.name, 'ChunkLoadError')
    assert.equal(
      normalized.message,
      'Loading chunk repository-tools failed.\n' +
        '(error: <local app asset>/repository-tools.js)'
    )
    assert.doesNotMatch(normalized.message, /C:|Users|AppData/)
  })

  it('redacts a raw Windows module path but leaves network errors intact', () => {
    assert.equal(
      asError(
        'Unable to load C:\\Users\\example\\Desktop Material\\out\\repository-issues.js'
      ).message,
      'Unable to load <local app asset>/repository-issues.js'
    )
    const remote = new Error(
      'Unable to load https://example.invalid/repository-tools.js'
    )
    assert.equal(asError(remote), remote)
  })

  it('redacts paths with parenthesized profile names and UNC roots', () => {
    const parenthesized = asError(
      new Error(
        'Loading failed (error: file:///C:/Users/Alice (Work)/AppData/Local/DesktopMaterial/out/repository-tools.js)'
      )
    )
    assert.equal(
      parenthesized.message,
      'Loading failed (error: <local app asset>/repository-tools.js)'
    )
    assert.doesNotMatch(parenthesized.message, /Alice|AppData/)

    for (const [input, expected] of [
      [
        'Loading failed (error: file://build-server/share/private/repository-tools.js)',
        'Loading failed (error: <local app asset>/repository-tools.js)',
      ],
      [
        'Loading failed from \\\\build-server\\share\\private\\repository-tools.js',
        'Loading failed from <local app asset>/repository-tools.js',
      ],
    ] as const) {
      const normalized = asError(input).message
      assert.equal(normalized, expected)
      assert.doesNotMatch(normalized, /build-server|share|private/)
    }
  })

  it('redacts quoted paths and preserves their sentence punctuation', () => {
    for (const [input, expected] of [
      [
        'Loading "C:\\Users\\Alice\\AppData\\chunk.js"',
        'Loading "<local app asset>/chunk.js"',
      ],
      [
        "Cannot load 'file:///C:/Users/Alice/AppData/chunk.js'",
        "Cannot load '<local app asset>/chunk.js'",
      ],
      [
        'Unable to load `C:\\Users\\Alice\\AppData\\chunk.js`!',
        'Unable to load `<local app asset>/chunk.js`!',
      ],
      [
        'Unable to load \\\\server\\share\\private\\chunk.js.',
        'Unable to load <local app asset>/chunk.js.',
      ],
    ] as const) {
      const normalized = asError(input).message
      assert.equal(normalized, expected)
      assert.doesNotMatch(normalized, /Alice|AppData|server|share|private/)
    }
  })

  it('redacts paths beside localized Unicode punctuation', () => {
    for (const [input, expected] of [
      [
        'Cannot load “C:\\Users\\Alice\\AppData\\chunk.js”',
        'Cannot load “<local app asset>/chunk.js”',
      ],
      [
        'Cannot load ‘file:///C:/Users/Alice/AppData/chunk.js’',
        'Cannot load ‘<local app asset>/chunk.js’',
      ],
      [
        'Cannot load C:\\Users\\Alice\\AppData\\chunk.js…',
        'Cannot load <local app asset>/chunk.js…',
      ],
      [
        'Cannot load C:\\Users\\Alice\\AppData\\chunk.js—retry available',
        'Cannot load <local app asset>/chunk.js—retry available',
      ],
      [
        'Cannot load \\\\server\\share\\private\\chunk.js–try again',
        'Cannot load <local app asset>/chunk.js–try again',
      ],
      [
        'Cannot load 「C:\\Users\\Alice\\AppData\\chunk.js」',
        'Cannot load 「<local app asset>/chunk.js」',
      ],
      [
        'Cannot load 『file:///C:/Users/Alice/AppData/chunk.js』',
        'Cannot load 『<local app asset>/chunk.js』',
      ],
      [
        'Cannot load 《C:\\Users\\Alice\\AppData\\chunk.js》',
        'Cannot load 《<local app asset>/chunk.js》',
      ],
      [
        'Cannot load «C:\\Users\\Alice\\AppData\\chunk.js»',
        'Cannot load «<local app asset>/chunk.js»',
      ],
      [
        'Cannot load <C:\\Users\\Alice\\AppData\\chunk.js>',
        'Cannot load <<local app asset>/chunk.js>',
      ],
      [
        'Cannot load C:\\Users\\Alice\\AppData\\chunk.js→retry available',
        'Cannot load <local app asset>/chunk.js→retry available',
      ],
    ] as const) {
      const normalized = asError(input).message
      assert.equal(normalized, expected)
      assert.doesNotMatch(normalized, /Alice|AppData|server|share|private/)
    }
  })

  it('does not redact a provider URL containing a drive-shaped route', () => {
    const remote =
      'Unable to load https://example.invalid/assets/C:/repository-tools.js'
    assert.equal(asError(remote).message, remote)
  })
})

describe('LatestLoadGate', () => {
  it('issues increasing tokens and identifies only the newest request', () => {
    const gate = new LatestLoadGate()
    const first = gate.begin()
    const second = gate.begin()

    assert.equal(first, 1)
    assert.equal(second, 2)
    assert.equal(gate.isLatest(first), false)
    assert.equal(gate.isLatest(second), true)
  })

  it('accepts only the newest issued request', () => {
    const gate = new LatestLoadGate()
    const first = gate.begin()
    const second = gate.begin()

    // The first result is stale even if it settles while the second is pending.
    assert.equal(gate.accept(first), false)
    assert.equal(gate.accept(second), true)
    assert.equal(gate.accept(second), false)
  })

  it('rejects every completion which was in flight at cancellation', () => {
    const gate = new LatestLoadGate()
    const first = gate.begin()
    const second = gate.begin()
    gate.cancelInFlight()

    assert.equal(gate.accept(first), false)
    assert.equal(gate.accept(second), false)
    assert.equal(gate.accept(gate.begin()), true)
  })
})

describe('ProgressiveLoad', () => {
  it('starts ready when seeded with a verified cached value', () => {
    const load = new ProgressiveLoad('cached')
    assert.deepEqual(load.getState(), { kind: 'ready', value: 'cached' })
  })

  it('exposes loading synchronously and ready after resolution', async () => {
    const request = deferred<string>()
    const load = new ProgressiveLoad<string>()
    const completion = load.run(() => request.promise)

    assert.deepEqual(load.state, { kind: 'loading', value: null })

    request.resolve('ready')
    const result = await completion

    assert.equal(result.accepted, true)
    assert.deepEqual(result.state, { kind: 'ready', value: 'ready' })
    assert.deepEqual(load.state, result.state)
  })

  it('turns a rejected source into an actionable fulfilled state', async () => {
    const load = new ProgressiveLoad<string>()
    const result = await load.run(() => Promise.reject('offline'))

    assert.equal(result.accepted, true)
    assert.equal(result.state.kind, 'failed')
    if (result.state.kind === 'failed') {
      assert.equal(result.state.error.message, 'offline')
    }
  })

  it('contains an Error whose message getter throws', async () => {
    const hostile = new Error()
    Object.defineProperty(hostile, 'message', {
      get: () => {
        throw new Error('message getter escaped')
      },
    })
    const load = new ProgressiveLoad<string>()

    const result = await load.run(() => Promise.reject(hostile))

    assert.equal(result.accepted, true)
    assert.equal(result.state.kind, 'failed')
    if (result.state.kind === 'failed') {
      assert.equal(
        result.state.error.message,
        'Unknown progressive loading failure'
      )
    }
  })

  it('retains a safe cached value while refreshing and on failure', async () => {
    const request = deferred<string>()
    const load = new ProgressiveLoad('cached')
    const completion = load.run(() => request.promise)

    assert.deepEqual(load.state, { kind: 'loading', value: 'cached' })
    request.reject(new Error('network unavailable'))

    const result = await completion
    assert.equal(result.state.kind, 'failed')
    assert.equal(result.state.value, 'cached')
  })

  it('does not let a slow first request overwrite a fast second request', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const load = new ProgressiveLoad<string>()

    const firstCompletion = load.run(() => first.promise)
    const secondCompletion = load.run(() => second.promise)
    second.resolve('new')

    assert.equal((await secondCompletion).accepted, true)
    assert.deepEqual(load.state, { kind: 'ready', value: 'new' })

    first.resolve('old')
    assert.equal((await firstCompletion).accepted, false)
    assert.deepEqual(load.state, { kind: 'ready', value: 'new' })
  })

  it('ignores an old completion even when it arrives before the newest one', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const load = new ProgressiveLoad<string>()

    const firstCompletion = load.run(() => first.promise)
    const secondCompletion = load.run(() => second.promise)
    first.resolve('old')

    assert.equal((await firstCompletion).accepted, false)
    assert.deepEqual(load.state, { kind: 'loading', value: null })

    second.resolve('new')
    assert.equal((await secondCompletion).accepted, true)
    assert.deepEqual(load.state, { kind: 'ready', value: 'new' })
  })

  it('drops a stale failure after a newer success', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const load = new ProgressiveLoad<string>()

    const firstCompletion = load.run(() => first.promise)
    const secondCompletion = load.run(() => second.promise)
    second.resolve('new')
    await secondCompletion

    first.reject(new Error('stale failure'))
    assert.equal((await firstCompletion).accepted, false)
    assert.deepEqual(load.state, { kind: 'ready', value: 'new' })
  })

  it('reset fences an in-flight request and clears its subject', async () => {
    const request = deferred<string>()
    const load = new ProgressiveLoad('previous')
    const completion = load.run(() => request.promise)

    assert.deepEqual(load.reset(), { kind: 'idle', value: null })
    request.resolve('stale')

    assert.equal((await completion).accepted, false)
    assert.deepEqual(load.state, { kind: 'idle', value: null })
  })

  it('dispose fences in-flight work and refuses to start new work', async () => {
    const request = deferred<string>()
    const load = new ProgressiveLoad<string>()
    const completion = load.run(() => request.promise)
    load.dispose()
    request.resolve('late')

    assert.equal((await completion).accepted, false)
    let invoked = false
    const afterDispose = await load.run(async () => {
      invoked = true
      return 'ignored'
    })
    assert.equal(afterDispose.accepted, false)
    assert.equal(invoked, false)
  })

  it('contains a synchronous source exception', async () => {
    const load = new ProgressiveLoad<string>()
    const result = await load.run(() => {
      throw new Error('module evaluation failed')
    })

    assert.equal(result.state.kind, 'failed')
    if (result.state.kind === 'failed') {
      assert.equal(result.state.error.message, 'module evaluation failed')
    }
  })

  it('still fulfills when a rejected value cannot be stringified', async () => {
    const load = new ProgressiveLoad<string>()
    const hostileReason = {
      toString: () => {
        throw new Error('stringification failed')
      },
    }
    const result = await load.run(() => Promise.reject(hostileReason))

    assert.equal(result.state.kind, 'failed')
    if (result.state.kind === 'failed') {
      assert.equal(
        result.state.error.message,
        'Unknown progressive loading failure'
      )
    }
  })

  it('never schedules an artificial timer', async () => {
    const source = await readFile(
      new URL('../../src/lib/progressive-load.ts', import.meta.url),
      'utf8'
    )
    assert.doesNotMatch(source, /setTimeout|setInterval|requestAnimationFrame/)
  })
})

describe('lazy view localized voice', () => {
  it('names the affected surface in every funny-level band and locale', () => {
    for (const band of ['plain', 'light', 'playful'] as const) {
      const key = `lazyView.loading.${band}` as const
      const failureKey = `lazyView.failedBody.${band}` as const
      const cantoneseLoading = cantoneseTranslations[key]
      const cantoneseFailure = cantoneseTranslations[failureKey]

      assert.ok(englishTranslations[key].includes('{name}'))
      assert.ok(englishTranslations[failureKey].includes('{name}'))
      assert.ok(cantoneseLoading?.includes('{name}'))
      assert.ok(cantoneseFailure?.includes('{name}'))
    }
  })

  it('keeps actionable error, notification, and retry facts stable', () => {
    assert.ok(englishTranslations['lazyView.failedTitle'].includes('{name}'))
    assert.ok(englishTranslations['lazyView.failedDetail'].includes('{error}'))
    assert.ok(
      englishTranslations['lazyView.notificationTitle'].includes('{name}')
    )
    assert.ok(
      englishTranslations['lazyView.notificationBody'].includes('{error}')
    )
    assert.equal(englishTranslations['lazyView.retry'], 'Try again')
    assert.equal(cantoneseTranslations['lazyView.retry'], '再試一次')
  })
})
