import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  claimInFlight,
  EmptyInFlightGuard,
  isInFlight,
  releaseInFlight,
} from '../../../src/lib/cheap-lfs/in-flight-guard'
import {
  decideUploadStall,
  ReleaseUploadMaximumRuntimeMs,
  ReleaseUploadStallTimeoutMs,
  resolveReleaseUploadWatchdogBounds,
  UploadStallPollCeilingMs,
  uploadStallPollIntervalMs,
} from '../../../src/lib/cheap-lfs/upload-stall-detector'

describe('cheap LFS in-flight guard', () => {
  it('accepts the first claim for a target', () => {
    const claim = claimInFlight(EmptyInFlightGuard, 'manual-upload')

    assert.equal(claim.accepted, true)
    assert.equal(isInFlight(claim.state, 'manual-upload'), true)
    assert.equal(isInFlight(EmptyInFlightGuard, 'manual-upload'), false)
  })

  it('refuses a second claim so a double-click cannot start two uploads', () => {
    const first = claimInFlight(EmptyInFlightGuard, 'manual-upload')
    const second = claimInFlight(first.state, 'manual-upload')

    assert.equal(second.accepted, false)
    assert.equal(second.state, first.state)
  })

  it('keeps claims for different targets independent', () => {
    const first = claimInFlight(EmptyInFlightGuard, 'part-1')
    const second = claimInFlight(first.state, 'part-2')

    assert.equal(second.accepted, true)
    assert.equal(isInFlight(second.state, 'part-1'), true)
    assert.equal(isInFlight(second.state, 'part-2'), true)
  })

  it('re-accepts a target after the work completed or failed', () => {
    const first = claimInFlight(EmptyInFlightGuard, 'manual-upload')
    const released = releaseInFlight(first.state, 'manual-upload')
    const retry = claimInFlight(released, 'manual-upload')

    assert.equal(isInFlight(released, 'manual-upload'), false)
    assert.equal(retry.accepted, true)
  })

  it('returns the same guard when releasing an unclaimed target', () => {
    const released = releaseInFlight(EmptyInFlightGuard, 'manual-upload')

    // Identity is load-bearing: the UI uses it to skip a redundant setState
    // and so componentDidUpdate cannot loop.
    assert.equal(released, EmptyInFlightGuard)
  })

  it('never mutates the guard it was given', () => {
    const first = claimInFlight(EmptyInFlightGuard, 'manual-upload')
    claimInFlight(first.state, 'other')
    releaseInFlight(first.state, 'manual-upload')

    assert.equal(first.state.size, 1)
    assert.equal(isInFlight(first.state, 'manual-upload'), true)
  })
})

describe('cheap LFS release upload stall detector', () => {
  const stallTimeoutMs = 60_000

  it('continues while bytes are still moving', () => {
    assert.equal(
      decideUploadStall({
        lastActivityAtMs: 1_000,
        nowMs: 1_000 + stallTimeoutMs - 1,
        stallTimeoutMs,
      }),
      'continue'
    )
  })

  it('fails once nothing has moved for the whole stall window', () => {
    assert.equal(
      decideUploadStall({
        lastActivityAtMs: 1_000,
        nowMs: 1_000 + stallTimeoutMs,
        stallTimeoutMs,
      }),
      'stalled'
    )
  })

  it('never stalls an upload that is merely slow but progressing', () => {
    // Six hours of steady progress, each sample well inside the stall window:
    // elapsed time alone must never end a transfer.
    const sampleIntervalMs = 30_000
    let lastActivityAtMs = 0
    for (let sample = 1; sample <= 720; sample++) {
      const nowMs = sample * sampleIntervalMs
      assert.equal(
        decideUploadStall({ lastActivityAtMs, nowMs, stallTimeoutMs }),
        'continue',
        `progressing upload must survive ${nowMs / 3_600_000} hours`
      )
      lastActivityAtMs = nowMs
    }
    assert.equal(lastActivityAtMs, 6 * 60 * 60 * 1000)
  })

  it('continues when the watchdog is disabled', () => {
    assert.equal(
      decideUploadStall({
        lastActivityAtMs: 0,
        nowMs: 10 * 60 * 60 * 1000,
        stallTimeoutMs: null,
      }),
      'continue'
    )
  })

  it('continues on a nonsensical bound rather than killing the transfer', () => {
    for (const bound of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(
        decideUploadStall({
          lastActivityAtMs: 0,
          nowMs: 10 * 60 * 60 * 1000,
          stallTimeoutMs: bound,
        }),
        'continue',
        `bound ${bound} must not stall an upload`
      )
    }
  })

  it('continues when the clock ran backwards', () => {
    assert.equal(
      decideUploadStall({
        lastActivityAtMs: 5_000_000,
        nowMs: 1_000,
        stallTimeoutMs,
      }),
      'continue'
    )
  })

  it('continues on a non-finite sample', () => {
    assert.equal(
      decideUploadStall({
        lastActivityAtMs: Number.NaN,
        nowMs: 1_000,
        stallTimeoutMs,
      }),
      'continue'
    )
  })

  it('samples fast enough for tight bounds and caps slow ones', () => {
    assert.equal(uploadStallPollIntervalMs(10), 10)
    assert.equal(uploadStallPollIntervalMs(25), 25)
    assert.equal(
      uploadStallPollIntervalMs(ReleaseUploadStallTimeoutMs),
      UploadStallPollCeilingMs
    )
    assert.equal(uploadStallPollIntervalMs(0), UploadStallPollCeilingMs)
  })
})

describe('cheap LFS release upload watchdog bounds', () => {
  it('arms stall detection but no wall-clock ceiling by default', () => {
    const bounds = resolveReleaseUploadWatchdogBounds()

    assert.equal(bounds.stallTimeoutMs, ReleaseUploadStallTimeoutMs)
    assert.equal(bounds.maximumRuntimeMs, null)
    assert.equal(ReleaseUploadMaximumRuntimeMs, null)
  })

  it('keeps the stall bound from leaking into the runtime ceiling', () => {
    // The regression: one shared constant made a stall value double as a
    // deadline, so a healthy multi-hour upload died at the stall duration.
    const bounds = resolveReleaseUploadWatchdogBounds({ stallTimeoutMs: 25 })

    assert.equal(bounds.stallTimeoutMs, 25)
    assert.equal(bounds.maximumRuntimeMs, null)
  })

  it('lets tests tighten either bound independently', () => {
    const bounds = resolveReleaseUploadWatchdogBounds({
      stallTimeoutMs: 10,
      maximumRuntimeMs: 100,
    })

    assert.equal(bounds.stallTimeoutMs, 10)
    assert.equal(bounds.maximumRuntimeMs, 100)
  })

  it('ignores unusable overrides', () => {
    const bounds = resolveReleaseUploadWatchdogBounds({
      stallTimeoutMs: 0,
      maximumRuntimeMs: -5,
    })

    assert.equal(bounds.stallTimeoutMs, ReleaseUploadStallTimeoutMs)
    assert.equal(bounds.maximumRuntimeMs, null)
  })
})
