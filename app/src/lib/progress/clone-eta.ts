import { formatBytes } from '../../ui/lib/bytes'

/**
 * Smooths clone progress into a best-effort estimate of the time remaining.
 *
 * Git's stderr progress is stateless and jittery, so rather than differentiate
 * a single pair of samples we keep a short rolling window of overall-progress
 * observations and derive the rate across it. The estimate is intentionally
 * absent until there's enough signal to trust it.
 */
export class CloneProgressEtaEstimator {
  private readonly samples = new Array<{
    readonly time: number
    readonly value: number
  }>()

  /**
   * @param windowMs      The rolling window over which the rate is averaged.
   * @param minElapsedMs  The minimum span the window must cover before an
   *                      estimate is produced (guards against wild early rates).
   */
  public constructor(
    private readonly windowMs = 8000,
    private readonly minElapsedMs = 1500
  ) {}

  /**
   * Record an overall-progress sample (a fraction between 0 and 1) and return
   * the smoothed estimate of the seconds remaining, or undefined when the rate
   * can't yet be determined.
   */
  public record(value: number, now: number = Date.now()): number | undefined {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value

    // Progress can only move forward; ignore stale or out-of-order samples so a
    // brief regression doesn't poison the rate.
    const latest = this.samples[this.samples.length - 1]
    if (latest === undefined || clamped >= latest.value || now > latest.time) {
      this.samples.push({ time: now, value: clamped })
    }

    // Drop everything older than the window (keep at least one prior sample).
    const cutoff = now - this.windowMs
    while (this.samples.length > 2 && this.samples[0].time < cutoff) {
      this.samples.shift()
    }

    if (clamped >= 1) {
      return 0
    }

    const oldest = this.samples[0]
    const elapsedMs = now - oldest.time
    if (elapsedMs < this.minElapsedMs) {
      return undefined
    }

    const progressed = clamped - oldest.value
    if (progressed <= 0) {
      return undefined
    }

    const ratePerSecond = progressed / (elapsedMs / 1000)
    if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) {
      return undefined
    }

    const remaining = 1 - clamped
    const etaSeconds = remaining / ratePerSecond
    return Number.isFinite(etaSeconds) ? Math.max(0, etaSeconds) : undefined
  }
}

/**
 * Format a transfer rate for display, matching Git's IEC units, e.g.
 * '2.4 MiB/s'. Returns an empty string for a missing or non-positive rate.
 */
export function formatCloneSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return ''
  }
  return `${formatBytes(bytesPerSecond, 1)}/s`
}

/**
 * Format an estimate of the time remaining for display, e.g. '~2m 30s left'.
 * Returns an empty string for a missing or negative estimate.
 */
export function formatCloneEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return ''
  }

  const total = Math.round(seconds)
  if (total < 60) {
    return `~${total}s left`
  }

  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainderSeconds = total % 60

  if (hours > 0) {
    return minutes > 0 ? `~${hours}h ${minutes}m left` : `~${hours}h left`
  }

  return remainderSeconds > 0
    ? `~${minutes}m ${remainderSeconds}s left`
    : `~${minutes}m left`
}
