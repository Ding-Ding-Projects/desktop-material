import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  DocumentScopedNativeClosePreparationController,
  INativeClosePreparationClock,
  INativeClosePreparationResult,
  NativeClosePreparationController,
} from '../../../src/main-process/native-close-preparation'

interface IFakeTimer {
  readonly callback: () => void
  readonly milliseconds: number
  cleared: boolean
}

class FakeClock implements INativeClosePreparationClock {
  private nextHandle = 1
  private readonly timers = new Map<number, IFakeTimer>()

  public constructor(private readonly events = new Array<string>()) {}

  public setTimeout(callback: () => void, milliseconds: number): number {
    const handle = this.nextHandle++
    this.events.push(`timer:${milliseconds}`)
    this.timers.set(handle, { callback, milliseconds, cleared: false })
    return handle
  }

  public clearTimeout(handle: unknown): void {
    const timer = this.timers.get(handle as number)
    if (timer !== undefined) {
      timer.cleared = true
    }
  }

  public fire(milliseconds: number, includingCleared = false): void {
    const match = [...this.timers.values()].find(
      timer =>
        timer.milliseconds === milliseconds &&
        (includingCleared || !timer.cleared)
    )
    assert.notEqual(match, undefined)
    match!.callback()
  }

  public activeDelays(): ReadonlyArray<number> {
    return [...this.timers.values()]
      .filter(timer => !timer.cleared)
      .map(timer => timer.milliseconds)
  }
}

const createSequentialIds = () => {
  let nextId = 1
  return () => `close-request-${nextId++}`
}

const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve))

describe('NativeClosePreparationController', () => {
  it('arms delivery before one send and shares the request across close races', async () => {
    const events = new Array<string>()
    const clock = new FakeClock(events)
    const controller = new NativeClosePreparationController({
      clock,
      createRequestId: createSequentialIds(),
      deliveryTimeoutMilliseconds: 20,
      drainTimeoutMilliseconds: 100,
      sendPrepare: requestId => events.push(`send:${requestId}`),
    })

    const first = controller.requestPreparation()
    const duplicate = controller.requestPreparation()

    assert.strictEqual(duplicate, first)
    assert.deepEqual(events, ['timer:20', 'send:close-request-1'])
    assert.equal(controller.isPreparationPending, true)
    assert.deepEqual(clock.activeDelays(), [20])

    assert.equal(controller.started('close-request-1'), true)
    assert.deepEqual(clock.activeDelays(), [100])
    assert.equal(controller.started('close-request-1'), true)
    assert.deepEqual(clock.activeDelays(), [100])
    assert.equal(controller.prepared('close-request-1'), true)

    assert.deepEqual(await first, {
      requestId: 'close-request-1',
      reason: 'prepared',
    })
    assert.equal(controller.isPreparationPending, false)
    assert.equal(controller.isReadyToClose, true)
    assert.deepEqual(clock.activeDelays(), [])
    assert.strictEqual(controller.requestPreparation(), first)
  })

  it('contains a synchronous send failure and continues without wedging', async () => {
    const clock = new FakeClock()
    const controller = new NativeClosePreparationController({
      clock,
      createRequestId: () => 'send-failure-id',
      deliveryTimeoutMilliseconds: 20,
      sendPrepare: () => {
        throw new Error('web contents disappeared')
      },
    })

    assert.deepEqual(await controller.requestPreparation(), {
      requestId: 'send-failure-id',
      reason: 'send-failed',
    })
    assert.equal(controller.isPreparationPending, false)
    assert.equal(controller.isReadyToClose, true)
    assert.deepEqual(clock.activeDelays(), [])
  })

  it('ignores mismatched acknowledgements and uses a full drain deadline only after started', async () => {
    const clock = new FakeClock()
    const completions = new Array<INativeClosePreparationResult>()
    const controller = new NativeClosePreparationController({
      clock,
      createRequestId: () => 'current-id',
      deliveryTimeoutMilliseconds: 20,
      drainTimeoutMilliseconds: 100,
      sendPrepare: () => {},
    })

    const preparation = controller.requestPreparation()
    void preparation.then(result => completions.push(result))
    assert.equal(controller.started('stale-id'), false)
    assert.equal(controller.prepared('stale-id'), false)
    assert.equal(controller.prepared('current-id'), false)
    assert.deepEqual(clock.activeDelays(), [20])

    assert.equal(controller.started('current-id'), true)
    assert.deepEqual(clock.activeDelays(), [100])

    // Even a queued callback from the cleared delivery timer cannot shorten
    // the full drain allowance after a matching started acknowledgement.
    clock.fire(20, true)
    assert.equal(controller.isPreparationPending, true)
    assert.equal(completions.length, 0)

    clock.fire(100)
    assert.deepEqual(await preparation, {
      requestId: 'current-id',
      reason: 'drain-timed-out',
    })
    assert.equal(completions.length, 1)
    assert.equal(controller.prepared('current-id'), false)
    assert.equal(completions.length, 1)
  })

  it('continues boundedly on delivery timeout or renderer destruction', async () => {
    const timeoutClock = new FakeClock()
    const timeoutController = new NativeClosePreparationController({
      clock: timeoutClock,
      createRequestId: () => 'delivery-timeout-id',
      deliveryTimeoutMilliseconds: 20,
      sendPrepare: () => {},
    })
    const timedOut = timeoutController.requestPreparation()
    timeoutClock.fire(20)
    assert.deepEqual(await timedOut, {
      requestId: 'delivery-timeout-id',
      reason: 'delivery-timed-out',
    })
    assert.equal(timeoutController.started('delivery-timeout-id'), false)

    const destroyedClock = new FakeClock()
    const destroyedController = new NativeClosePreparationController({
      clock: destroyedClock,
      createRequestId: () => 'destroyed-id',
      sendPrepare: () => {},
    })
    const destroyed = destroyedController.requestPreparation()
    assert.equal(destroyedController.rendererDestroyed(), true)
    assert.deepEqual(await destroyed, {
      requestId: 'destroyed-id',
      reason: 'renderer-destroyed',
    })
    assert.equal(destroyedController.rendererDestroyed(), false)
  })

  it('rejects started when it cannot arm the full drain deadline', async () => {
    let schedules = 0
    let clears = 0
    const clock: INativeClosePreparationClock = {
      setTimeout: callback => {
        schedules++
        if (schedules === 2) {
          throw new Error('timer service unavailable')
        }
        return callback
      },
      clearTimeout: () => {
        clears++
      },
    }
    const controller = new NativeClosePreparationController({
      clock,
      createRequestId: () => 'timer-failure-id',
      sendPrepare: () => {},
    })

    const preparation = controller.requestPreparation()
    assert.equal(controller.started('timer-failure-id'), false)
    assert.deepEqual(await preparation, {
      requestId: 'timer-failure-id',
      reason: 'timer-failed',
    })
    assert.equal(controller.isPreparationPending, false)
    assert.equal(controller.isReadyToClose, true)
    assert.equal(clears, 1)
  })

  it('reset clears and invalidates the old generation without closing', async () => {
    const clock = new FakeClock()
    const sent = new Array<string>()
    const controller = new NativeClosePreparationController({
      clock,
      createRequestId: createSequentialIds(),
      deliveryTimeoutMilliseconds: 20,
      sendPrepare: requestId => sent.push(requestId),
    })

    const oldPreparation = controller.requestPreparation()
    assert.equal(controller.reset(), true)
    assert.deepEqual(await oldPreparation, {
      requestId: 'close-request-1',
      reason: 'reset',
    })
    assert.equal(controller.isReadyToClose, false)

    const newPreparation = controller.requestPreparation()
    assert.deepEqual(sent, ['close-request-1', 'close-request-2'])

    // A timeout already queued for the reset generation and its renderer
    // acknowledgement cannot affect the new request.
    clock.fire(20, true)
    assert.equal(controller.isPreparationPending, true)
    assert.equal(controller.prepared('close-request-1'), false)

    assert.equal(controller.started('close-request-2'), true)
    assert.equal(controller.prepared('close-request-2'), true)
    assert.deepEqual(await newPreparation, {
      requestId: 'close-request-2',
      reason: 'prepared',
    })
  })

  it('settles once when late terminal signals race with preparation', async () => {
    const clock = new FakeClock()
    const completions = new Array<INativeClosePreparationResult>()
    const controller = new NativeClosePreparationController({
      clock,
      createRequestId: () => 'failure-id',
      sendPrepare: () => {},
    })

    const preparation = controller.requestPreparation()
    void preparation.then(result => completions.push(result))
    assert.equal(controller.started('failure-id'), true)
    assert.equal(controller.prepared('failure-id'), true)
    assert.deepEqual(await preparation, {
      requestId: 'failure-id',
      reason: 'prepared',
    })
    assert.equal(controller.prepared('failure-id'), false)
    assert.equal(controller.rendererDestroyed(), false)
    assert.deepEqual(completions, [
      { requestId: 'failure-id', reason: 'prepared' },
    ])
  })
})

describe('DocumentScopedNativeClosePreparationController', () => {
  it('keeps close bounded while a replacement document never becomes ready', async () => {
    const clock = new FakeClock()
    const controller = new DocumentScopedNativeClosePreparationController({
      clock,
      createRequestId: createSequentialIds(),
      deliveryTimeoutMilliseconds: 20,
      sendPrepare: () => {},
    })

    const close = controller.requestPreparation()
    assert.deepEqual(clock.activeDelays(), [20])
    clock.fire(20)

    assert.deepEqual(await close, {
      requestId: 'renderer-document-lifecycle',
      reason: 'delivery-timed-out',
    })
    assert.equal(controller.isReadyToClose, true)

    controller.documentWillChange()
    assert.equal(controller.isReadyToClose, false)
  })

  it('invalidates a navigating document and prepares its replacement', async () => {
    const sent = new Array<string>()
    const controller = new DocumentScopedNativeClosePreparationController({
      clock: new FakeClock(),
      createRequestId: createSequentialIds(),
      sendPrepare: requestId => sent.push(requestId),
    })

    controller.documentDidBecomeReady()
    const close = controller.requestPreparation()
    let terminalActions = 0
    void close.then(() => {
      terminalActions++
    })
    await flushPromises()
    assert.deepEqual(sent, ['close-request-1'])
    assert.equal(controller.started('close-request-1'), true)

    controller.documentWillChange()
    assert.equal(controller.isReadyToClose, false)
    assert.equal(controller.prepared('close-request-1'), false)

    let settled = false
    void close.then(() => {
      settled = true
    })
    await flushPromises()
    assert.equal(settled, false)
    assert.equal(terminalActions, 0)

    controller.documentDidBecomeReady()
    await flushPromises()
    assert.deepEqual(sent, ['close-request-1', 'close-request-2'])
    assert.equal(controller.started('close-request-1'), false)
    assert.equal(controller.started('close-request-2'), true)
    assert.equal(controller.prepared('close-request-2'), true)

    assert.deepEqual(await close, {
      requestId: 'close-request-2',
      reason: 'prepared',
    })
    await flushPromises()
    assert.equal(terminalActions, 1)
    assert.equal(controller.prepared('close-request-1'), false)
    assert.equal(terminalActions, 1)
    assert.equal(controller.isReadyToClose, true)
  })

  it('does not carry an explicitly cancelled close into a replacement document', async () => {
    const sent = new Array<string>()
    const controller = new DocumentScopedNativeClosePreparationController({
      clock: new FakeClock(),
      createRequestId: createSequentialIds(),
      sendPrepare: requestId => sent.push(requestId),
    })

    controller.documentDidBecomeReady()
    const close = controller.requestPreparation()
    await flushPromises()
    controller.documentWillChange()
    assert.equal(controller.reset(), true)

    assert.deepEqual(await close, {
      requestId: 'renderer-document-lifecycle',
      reason: 'reset',
    })

    controller.documentDidBecomeReady()
    await flushPromises()
    assert.deepEqual(sent, ['close-request-1'])
    assert.equal(controller.isReadyToClose, false)
  })

  it('ignores readiness reported for a superseded document generation', async () => {
    const sent = new Array<string>()
    const controller = new DocumentScopedNativeClosePreparationController({
      clock: new FakeClock(),
      createRequestId: createSequentialIds(),
      sendPrepare: requestId => sent.push(requestId),
    })

    controller.documentDidBecomeReady()
    const close = controller.requestPreparation()
    await flushPromises()
    assert.deepEqual(sent, ['close-request-1'])

    const firstReplacement = controller.documentWillChange()
    const currentReplacement = controller.documentWillChange()
    controller.documentDidBecomeReady(firstReplacement)
    await flushPromises()
    assert.deepEqual(sent, ['close-request-1'])

    controller.documentDidBecomeReady(currentReplacement)
    await flushPromises()
    assert.deepEqual(sent, ['close-request-1', 'close-request-2'])
    assert.equal(controller.started('close-request-2'), true)
    assert.equal(controller.prepared('close-request-2'), true)
    await close
  })

  it('invalidates completed preparation when the renderer document changes', async () => {
    const sent = new Array<string>()
    const controller = new DocumentScopedNativeClosePreparationController({
      clock: new FakeClock(),
      createRequestId: createSequentialIds(),
      sendPrepare: requestId => sent.push(requestId),
    })

    controller.documentDidBecomeReady()
    const first = controller.requestPreparation()
    await flushPromises()
    assert.equal(controller.started('close-request-1'), true)
    assert.equal(controller.prepared('close-request-1'), true)
    await first
    assert.equal(controller.isReadyToClose, true)

    controller.documentWillChange()
    assert.equal(controller.isReadyToClose, false)
    const replacement = controller.requestPreparation()
    await flushPromises()
    assert.deepEqual(sent, ['close-request-1'])

    controller.documentDidBecomeReady()
    await flushPromises()
    assert.deepEqual(sent, ['close-request-1', 'close-request-2'])
    assert.equal(controller.started('close-request-2'), true)
    assert.equal(controller.prepared('close-request-2'), true)
    await replacement
    assert.equal(controller.isReadyToClose, true)
  })
})
