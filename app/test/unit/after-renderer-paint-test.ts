import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  afterRendererPaint,
  IAfterRendererPaintDependencies,
} from '../../src/lib/after-renderer-paint'

interface IScheduledCallback {
  readonly handle: number
  readonly callback: () => void
  cancelled: boolean
  ran: boolean
}

interface IRendererPaintHarness {
  readonly dependencies: IAfterRendererPaintDependencies
  readonly frames: ReadonlyArray<IScheduledCallback>
  readonly fallbacks: ReadonlyArray<IScheduledCallback>
  readonly fallbackDelays: ReadonlyArray<number>
  readonly cancelFrameHandles: ReadonlyArray<number>
  readonly cancelFallbackHandles: ReadonlyArray<number>
  readonly hiddenSubscriberCount: number
  runNextFrame(): IScheduledCallback
  runFallback(): IScheduledCallback
  setHidden(hidden: boolean, notify?: boolean): void
  notifyHidden(): void
}

function createHarness(
  initiallyHidden: boolean = false
): IRendererPaintHarness {
  let hidden = initiallyHidden
  let nextHandle = 1
  const frames = new Array<IScheduledCallback>()
  const fallbacks = new Array<IScheduledCallback>()
  const fallbackDelays = new Array<number>()
  const cancelFrameHandles = new Array<number>()
  const cancelFallbackHandles = new Array<number>()
  const hiddenSubscribers = new Set<() => void>()

  const schedule = (
    callbacks: IScheduledCallback[],
    callback: () => void
  ): number => {
    const scheduled = {
      handle: nextHandle++,
      callback,
      cancelled: false,
      ran: false,
    }
    callbacks.push(scheduled)
    return scheduled.handle
  }

  const runNext = (
    callbacks: IScheduledCallback[],
    name: string
  ): IScheduledCallback => {
    const scheduled = callbacks.find(
      callback => !callback.cancelled && !callback.ran
    )
    if (scheduled === undefined) {
      assert.fail(`expected a pending ${name}`)
    }
    scheduled.ran = true
    scheduled.callback()
    return scheduled
  }

  const dependencies: IAfterRendererPaintDependencies = {
    scheduleFrame: callback => schedule(frames, () => callback(0)),
    cancelFrame: handle => {
      cancelFrameHandles.push(handle)
      const scheduled = frames.find(frame => frame.handle === handle)
      if (scheduled === undefined) {
        assert.fail(`unknown animation frame handle ${handle}`)
      }
      scheduled.cancelled = true
    },
    scheduleFallback: (callback, delay) => {
      fallbackDelays.push(delay)
      return schedule(fallbacks, callback)
    },
    cancelFallback: handle => {
      cancelFallbackHandles.push(handle)
      const scheduled = fallbacks.find(fallback => fallback.handle === handle)
      if (scheduled === undefined) {
        assert.fail(`unknown fallback handle ${handle}`)
      }
      scheduled.cancelled = true
    },
    isHidden: () => hidden,
    subscribeToHidden: callback => {
      hiddenSubscribers.add(callback)
      return () => hiddenSubscribers.delete(callback)
    },
  }

  return {
    dependencies,
    frames,
    fallbacks,
    fallbackDelays,
    cancelFrameHandles,
    cancelFallbackHandles,
    get hiddenSubscriberCount() {
      return hiddenSubscribers.size
    },
    runNextFrame: () => runNext(frames, 'animation frame'),
    runFallback: () => runNext(fallbacks, 'fallback'),
    setHidden: (value, notify = true) => {
      hidden = value
      if (value && notify) {
        for (const subscriber of [...hiddenSubscribers]) {
          subscriber()
        }
      }
    },
    notifyHidden: () => {
      for (const subscriber of [...hiddenSubscribers]) {
        subscriber()
      }
    },
  }
}

describe('after renderer paint', () => {
  it('waits for a paint opportunity between two animation frames', async () => {
    const harness = createHarness()

    let resolutionCount = 0
    const completion = afterRendererPaint(harness.dependencies).then(() => {
      resolutionCount++
    })

    assert.equal(harness.frames.length, 1)
    assert.equal(harness.fallbacks.length, 1)
    assert.equal(harness.hiddenSubscriberCount, 1)

    harness.runNextFrame()
    await Promise.resolve()
    assert.equal(resolutionCount, 0)
    assert.equal(harness.frames.length, 2)

    harness.runNextFrame()
    await completion
    assert.equal(resolutionCount, 1)
    assert.deepEqual(harness.cancelFrameHandles, [])
    assert.deepEqual(harness.cancelFallbackHandles, [
      harness.fallbacks[0].handle,
    ])
    assert.equal(harness.hiddenSubscriberCount, 0)
  })

  it('resolves immediately without scheduling work when already hidden', async () => {
    const harness = createHarness(true)

    await afterRendererPaint(harness.dependencies)

    assert.equal(harness.frames.length, 0)
    assert.equal(harness.fallbacks.length, 0)
    assert.equal(harness.hiddenSubscriberCount, 0)
  })

  it('cancels pending work when the renderer becomes hidden', async () => {
    const harness = createHarness()
    let resolutionCount = 0
    const completion = afterRendererPaint(harness.dependencies).then(() => {
      resolutionCount++
    })
    const scheduledFrame = harness.frames[0]
    const scheduledFallback = harness.fallbacks[0]

    harness.setHidden(true)
    await completion

    assert.equal(resolutionCount, 1)
    assert.deepEqual(harness.cancelFrameHandles, [scheduledFrame.handle])
    assert.deepEqual(harness.cancelFallbackHandles, [scheduledFallback.handle])
    assert.equal(harness.hiddenSubscriberCount, 0)

    // Hosts may still deliver a callback which was already queued when it was
    // cancelled. It must not schedule a second frame or settle again.
    scheduledFrame.callback()
    scheduledFallback.callback()
    await Promise.resolve()
    assert.equal(harness.frames.length, 1)
    assert.equal(resolutionCount, 1)
  })

  it('uses the bounded fallback when animation frames stall', async () => {
    const harness = createHarness()
    let resolutionCount = 0
    const completion = afterRendererPaint(harness.dependencies, 50).then(() => {
      resolutionCount++
    })
    const scheduledFrame = harness.frames[0]
    const scheduledFallback = harness.fallbacks[0]

    harness.runFallback()
    await completion

    assert.equal(resolutionCount, 1)
    assert.deepEqual(harness.fallbackDelays, [50])
    assert.deepEqual(harness.cancelFrameHandles, [scheduledFrame.handle])
    assert.deepEqual(harness.cancelFallbackHandles, [])
    assert.equal(scheduledFallback.ran, true)
    assert.equal(harness.hiddenSubscriberCount, 0)

    scheduledFrame.callback()
    await Promise.resolve()
    assert.equal(harness.frames.length, 1)
    assert.equal(resolutionCount, 1)
  })

  it('cancels a stalled second frame when hidden', async () => {
    const harness = createHarness()
    const completion = afterRendererPaint(harness.dependencies)

    harness.runNextFrame()
    const secondFrame = harness.frames[1]
    harness.setHidden(true)
    await completion

    assert.deepEqual(harness.cancelFrameHandles, [secondFrame.handle])
    assert.deepEqual(harness.cancelFallbackHandles, [
      harness.fallbacks[0].handle,
    ])
    assert.equal(harness.hiddenSubscriberCount, 0)

    secondFrame.callback()
    await Promise.resolve()
    assert.equal(harness.frames.length, 2)
  })

  it('checks visibility in the frame callback when an event is missed', async () => {
    const harness = createHarness()
    const completion = afterRendererPaint(harness.dependencies)

    harness.setHidden(true, false)
    harness.runNextFrame()
    await completion

    assert.equal(harness.frames.length, 1)
    assert.deepEqual(harness.cancelFallbackHandles, [
      harness.fallbacks[0].handle,
    ])
    assert.equal(harness.hiddenSubscriberCount, 0)
  })

  it('treats a page-hide notification as terminal even before visibility updates', async () => {
    const harness = createHarness()
    const completion = afterRendererPaint(harness.dependencies)

    harness.notifyHidden()
    await completion

    assert.deepEqual(harness.cancelFrameHandles, [harness.frames[0].handle])
    assert.deepEqual(harness.cancelFallbackHandles, [
      harness.fallbacks[0].handle,
    ])
    assert.equal(harness.hiddenSubscriberCount, 0)
  })
})
