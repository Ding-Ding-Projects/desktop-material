import assert from 'node:assert'
import { describe, it } from 'node:test'
import { AppStore } from '../../src/lib/stores/app-store'

interface IDeferred {
  readonly promise: Promise<void>
  readonly resolve: () => void
}

const deferred = (): IDeferred => {
  let resolve!: () => void
  const promise = new Promise<void>(promiseResolve => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve))

interface IFakeBatchCloneState {
  isRunning: boolean
  isPaused: boolean
}

interface IShutdownStoreHarness {
  deferredStartupGeneration: number
  deferredStartupShutdown: boolean
  rendererShutdownFlush: Promise<void> | null
  rendererShutdownResume: {
    readonly generation: number
    readonly promise: Promise<void>
  } | null
  resumeBatchCloneAfterCancelledShutdown: boolean
  selectedExternalEditor: unknown
  externalEditorDiscoveryLoad: { reset(value: unknown): void }
  autoCloneStore: { start(): void; stop(): void }
  batchCloneStore: {
    getState(): IFakeBatchCloneState
    requestPause(): Promise<void>
    flush(): Promise<void>
    resume(): Promise<void>
  }
  flushForShutdown(): Promise<void>
  resumeAfterCancelledShutdown(): Promise<void>
}

interface IShutdownHarnessCounters {
  autoCloneStarts: number
  autoCloneStops: number
  batchFlushes: number
  batchPauseRequests: number
  batchResumes: number
  editorDiscoveryResets: number
}

const createShutdownHarness = (
  state: IFakeBatchCloneState,
  pause: Promise<void> = Promise.resolve(),
  resume: Promise<void> = Promise.resolve()
) => {
  const counters: IShutdownHarnessCounters = {
    autoCloneStarts: 0,
    autoCloneStops: 0,
    batchFlushes: 0,
    batchPauseRequests: 0,
    batchResumes: 0,
    editorDiscoveryResets: 0,
  }
  const store = Object.create(
    AppStore.prototype
  ) as unknown as IShutdownStoreHarness
  Object.assign(store, {
    deferredStartupGeneration: 0,
    deferredStartupShutdown: false,
    rendererShutdownFlush: null,
    rendererShutdownResume: null,
    resumeBatchCloneAfterCancelledShutdown: false,
    selectedExternalEditor: null,
    externalEditorDiscoveryLoad: {
      reset: () => {
        counters.editorDiscoveryResets++
      },
    },
    autoCloneStore: {
      start: () => {
        counters.autoCloneStarts++
      },
      stop: () => {
        counters.autoCloneStops++
      },
    },
    batchCloneStore: {
      getState: () => state,
      requestPause: async () => {
        counters.batchPauseRequests++
        await pause
        state.isPaused = true
      },
      flush: async () => {
        counters.batchFlushes++
      },
      resume: async () => {
        counters.batchResumes++
        await resume
        state.isRunning = true
        state.isPaused = false
      },
    },
  })
  return { store, counters }
}

describe('AppStore renderer shutdown cancellation', () => {
  it('shares one cancellation flight and ignores a redundant cancel', async () => {
    const pause = deferred()
    const { store, counters } = createShutdownHarness(
      { isRunning: true, isPaused: false },
      pause.promise
    )

    const shutdown = store.flushForShutdown()
    await Promise.resolve()
    const firstCancel = store.resumeAfterCancelledShutdown()
    const duplicateCancel = store.resumeAfterCancelledShutdown()

    assert.strictEqual(duplicateCancel, firstCancel)
    assert.equal(counters.autoCloneStarts, 0)
    assert.equal(counters.batchResumes, 0)

    pause.resolve()
    await shutdown
    await firstCancel
    assert.equal(counters.batchResumes, 1)
    assert.equal(counters.autoCloneStarts, 1)

    await store.resumeAfterCancelledShutdown()
    assert.equal(counters.batchResumes, 1)
    assert.equal(counters.autoCloneStarts, 1)
  })

  it('reasserts shutdown when cancel is followed immediately by another quit', async () => {
    const pause = deferred()
    const { store, counters } = createShutdownHarness(
      { isRunning: true, isPaused: false },
      pause.promise
    )

    const firstShutdown = store.flushForShutdown()
    await Promise.resolve()
    const cancelledGeneration = store.resumeAfterCancelledShutdown()
    const retryShutdown = store.flushForShutdown()

    assert.strictEqual(retryShutdown, firstShutdown)
    assert.equal(store.deferredStartupShutdown, true)
    assert.equal(counters.autoCloneStops, 2)

    pause.resolve()
    await retryShutdown
    await cancelledGeneration

    assert.equal(store.deferredStartupShutdown, true)
    assert.equal(counters.batchResumes, 0)
    assert.equal(counters.autoCloneStarts, 0)

    await store.resumeAfterCancelledShutdown()
    assert.equal(counters.batchResumes, 1)
    assert.equal(counters.autoCloneStarts, 1)
  })

  it('repauses after a cancellation resume was already in flight', async () => {
    const resume = deferred()
    const state = { isRunning: true, isPaused: false }
    const { store, counters } = createShutdownHarness(state)

    await store.flushForShutdown()
    const events = new Array<string>()
    store.batchCloneStore.resume = async () => {
      counters.batchResumes++
      events.push('resume-start')
      await resume.promise
      events.push('resume-settle')
      state.isRunning = true
      state.isPaused = false
    }
    store.batchCloneStore.requestPause = async () => {
      counters.batchPauseRequests++
      events.push('pause-request')
      resume.resolve()
      await resume.promise
      state.isPaused = true
    }
    store.batchCloneStore.flush = async () => {
      counters.batchFlushes++
      events.push('flush')
    }
    const cancelledGeneration = store.resumeAfterCancelledShutdown()
    await flushPromises()
    assert.equal(counters.batchResumes, 1)

    const retryShutdown = store.flushForShutdown()
    assert.equal(store.deferredStartupShutdown, true)
    assert.equal(counters.autoCloneStarts, 0)

    await cancelledGeneration
    await retryShutdown

    assert.equal(state.isPaused, true)
    assert.equal(counters.batchPauseRequests, 2)
    assert.equal(counters.autoCloneStarts, 0)
    assert.deepEqual(events, [
      'resume-start',
      'pause-request',
      'resume-settle',
      'flush',
    ])

    await store.resumeAfterCancelledShutdown()
    assert.equal(counters.batchResumes, 2)
    assert.equal(counters.autoCloneStarts, 1)
  })

  it('starts a new cancellation flight for a retried quit generation', async () => {
    const resume = deferred()
    const state = { isRunning: true, isPaused: false }
    const { store, counters } = createShutdownHarness(
      state,
      Promise.resolve(),
      resume.promise
    )

    await store.flushForShutdown()
    const firstCancel = store.resumeAfterCancelledShutdown()
    await flushPromises()
    assert.equal(counters.batchResumes, 1)

    const retryShutdown = store.flushForShutdown()
    const retryCancel = store.resumeAfterCancelledShutdown()
    const duplicateRetryCancel = store.resumeAfterCancelledShutdown()

    assert.notStrictEqual(retryCancel, firstCancel)
    assert.strictEqual(duplicateRetryCancel, retryCancel)
    assert.equal(store.deferredStartupShutdown, false)
    assert.equal(counters.autoCloneStarts, 0)

    resume.resolve()
    await firstCancel
    await retryShutdown
    await retryCancel

    assert.equal(state.isPaused, false)
    assert.equal(counters.batchPauseRequests, 2)
    assert.equal(counters.batchResumes, 2)
    assert.equal(counters.autoCloneStarts, 1)
  })

  it('does not claim or resume a batch which was manually paused', async () => {
    const { store, counters } = createShutdownHarness({
      isRunning: true,
      isPaused: true,
    })

    await store.flushForShutdown()
    await store.resumeAfterCancelledShutdown()

    assert.equal(counters.batchPauseRequests, 1)
    assert.equal(counters.batchFlushes, 1)
    assert.equal(counters.batchResumes, 0)
    assert.equal(counters.autoCloneStarts, 1)
  })
})
