/**
 * Watchdog policy for Cheap LFS release-asset uploads.
 *
 * A release asset can be several gigabytes, so a legitimate upload may run for
 * hours on a slow link. Any wall-clock ceiling therefore kills real work, and
 * the only honest question is whether bytes are still moving: an upload that
 * has transferred nothing for `stallTimeoutMs` is dead and should fail so the
 * caller can retry, while one that is merely slow must be left alone forever.
 *
 * This module is the pure decision half of that watchdog. The transports own
 * the timers and the cancellation; they only ask this module what a given
 * observation means, which keeps the policy testable without real clocks.
 *
 * Note this is a *transport* bound and applies to GitHub Releases uploads.
 * Registry (GHCR/Docker Hub) routes answer to a separate provider-imposed
 * transfer bound that is not expressed here.
 */

/** Milliseconds without byte movement before a release upload is dead. */
export const ReleaseUploadStallTimeoutMs = 15 * 60 * 1000

/**
 * Release uploads get no wall-clock ceiling. `null` is the whole point: an
 * upload ends on completion, a transport failure, a stall, or the user
 * canceling — never because it took too long.
 */
export const ReleaseUploadMaximumRuntimeMs = null

/** Never sample the stall clock more slowly than this. */
export const UploadStallPollCeilingMs = 30 * 1000

export type UploadStallDecision = 'continue' | 'stalled'

export interface IUploadStallInput {
  /** When the transport last observed bytes move, from the same clock as `nowMs`. */
  readonly lastActivityAtMs: number
  readonly nowMs: number
  /** `null` disables the watchdog entirely. */
  readonly stallTimeoutMs: number | null
}

export interface IUploadWatchdogBounds {
  /** Milliseconds of zero byte movement that fail the transfer, or `null`. */
  readonly stallTimeoutMs: number | null
  /** Wall-clock ceiling, or `null` when the transfer may run indefinitely. */
  readonly maximumRuntimeMs: number | null
}

export interface IUploadWatchdogOverrides {
  readonly stallTimeoutMs?: number
  readonly maximumRuntimeMs?: number
}

function isUsableBound(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && value! > 0
}

/**
 * Decide whether an upload has stopped moving.
 *
 * Every uncertain observation resolves to `'continue'`. A disabled or
 * nonsensical bound, a non-finite sample, or a clock that ran backwards must
 * never be the reason a multi-hour upload is destroyed — the watchdog only
 * fails a transfer on positive evidence that nothing has moved.
 */
export function decideUploadStall(
  input: IUploadStallInput
): UploadStallDecision {
  const { lastActivityAtMs, nowMs, stallTimeoutMs } = input
  if (stallTimeoutMs === null || !isUsableBound(stallTimeoutMs)) {
    return 'continue'
  }
  if (!Number.isFinite(lastActivityAtMs) || !Number.isFinite(nowMs)) {
    return 'continue'
  }
  const idleMs = nowMs - lastActivityAtMs
  // A backwards clock (NTP correction, suspend/resume) reads as negative idle
  // time and must not be inflated into a stall.
  if (idleMs < 0) {
    return 'continue'
  }
  return idleMs >= stallTimeoutMs ? 'stalled' : 'continue'
}

/**
 * How often to sample the stall clock for a given bound. Sampling on one
 * interval rather than re-arming a timer for every chunk keeps a
 * multi-gigabyte upload from churning through tens of thousands of timers.
 */
export function uploadStallPollIntervalMs(stallTimeoutMs: number): number {
  if (!isUsableBound(stallTimeoutMs)) {
    return UploadStallPollCeilingMs
  }
  return Math.max(1, Math.min(stallTimeoutMs, UploadStallPollCeilingMs))
}

/**
 * Resolve the watchdog bounds for a release-asset upload.
 *
 * Callers (and tests) may tighten either bound, but the defaults are the
 * product decision: stall detection on, wall-clock ceiling off. The two are
 * resolved separately on purpose — sharing one constant is what previously let
 * a stall bound double as a runtime ceiling and kill healthy long uploads.
 */
export function resolveReleaseUploadWatchdogBounds(
  overrides: IUploadWatchdogOverrides = {}
): IUploadWatchdogBounds {
  return {
    stallTimeoutMs: isUsableBound(overrides.stallTimeoutMs)
      ? overrides.stallTimeoutMs
      : ReleaseUploadStallTimeoutMs,
    maximumRuntimeMs: isUsableBound(overrides.maximumRuntimeMs)
      ? overrides.maximumRuntimeMs
      : ReleaseUploadMaximumRuntimeMs,
  }
}
