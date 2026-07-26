/**
 * The observable evidence that a newer Desktop Material build is on its way,
 * and the honest arrival estimate derived from it.
 *
 * Nothing in this module talks to the network, and nothing in it predicts a
 * release. It turns signals the fork already publishes — an Actions run that is
 * running right now, a commit whose build already went green, the gaps between
 * the last few published releases — into a bounded, clearly-labelled *estimate*
 * plus the exact basis that estimate was computed from. Every consumer is
 * expected to present it as an estimate; there is deliberately no code path
 * here that produces a promise, a deadline, or a countdown to a fixed time.
 *
 * When no basis exists the answer is `null`, not a guess.
 */

/** How a coming update was noticed. */
export type UpdateComingSoonSignalKind =
  /** A Windows build job for a newer commit is running right now. */
  | 'build-running'
  /** A newer commit already built successfully; no release carries it yet. */
  | 'awaiting-release'
  /** Only the commit is newer; nothing has been built from it yet. */
  | 'newer-commit'

/** Everything observed about the update that is on its way. */
export interface IUpdateComingSoonSignal {
  readonly kind: UpdateComingSoonSignalKind
  /** The exact commit the coming build is made from. */
  readonly headSHA: string
  /** Web URL comparing the running build to that commit, when known. */
  readonly commitURL: string | null
  /** Web URL of the driving workflow run, when one is running. */
  readonly runURL: string | null
  /** When the driving run started, in epoch milliseconds, when known. */
  readonly runStartedAt: number | null
  /**
   * How long each of the most recent *finished* successful runs of the same
   * workflow took, in milliseconds. This is the only thing a "~X minutes"
   * estimate is ever derived from.
   */
  readonly recentRunDurations: ReadonlyArray<number>
  /** Publication times of the most recent releases, in epoch milliseconds. */
  readonly recentReleaseTimes: ReadonlyArray<number>
  /** The tag the pending release will carry, when the fork advertises it. */
  readonly targetTag: string | null
  /** The tag of the newest published release, for context in the details. */
  readonly latestReleaseTag: string | null
}

/** Which observable data an arrival estimate was computed from. */
export type UpdateArrivalBasis =
  /** Median duration of recent successful runs of the workflow now running. */
  | 'running-workflow'
  /** The commit is built and green; only the release step is outstanding. */
  | 'green-ci-no-release'
  /** Median gap between the last few published releases. */
  | 'release-cadence'

export interface IUpdateArrivalEstimate {
  readonly basis: UpdateArrivalBasis
  /**
   * Milliseconds from "now" until the update is *estimated* to arrive, or null
   * when the basis supports no number at all (nothing comparable to measure
   * against, or the typical time has already been exceeded).
   */
  readonly etaMilliseconds: number | null
  /** The typical time has already passed, so it should land at any moment. */
  readonly isOverdue: boolean
  /** How many observations the median was taken over. Zero means "none". */
  readonly sampleSize: number
  /** The median the estimate was computed from, when there was one. */
  readonly medianMilliseconds: number | null
}

/** Keep only usable positive, finite measurements. */
function usableSamples(values: ReadonlyArray<number>): ReadonlyArray<number> {
  return values.filter(value => Number.isFinite(value) && value > 0)
}

/** The median of a sample set, or null when the set is empty. */
export function medianOf(values: ReadonlyArray<number>): number | null {
  const sorted = usableSamples(values)
    .slice()
    .sort((left, right) => left - right)
  if (sorted.length === 0) {
    return null
  }
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * The gaps between consecutive release publications, newest gap first. A single
 * release produces no gap, which is exactly why one release can never support a
 * cadence estimate.
 */
export function releaseCadenceGaps(
  releaseTimes: ReadonlyArray<number>
): ReadonlyArray<number> {
  const sorted = usableSamples(releaseTimes)
    .slice()
    .sort((left, right) => right - left)
  const gaps = new Array<number>()
  for (let index = 0; index + 1 < sorted.length; index++) {
    const gap = sorted[index] - sorted[index + 1]
    if (gap > 0) {
      gaps.push(gap)
    }
  }
  return gaps
}

function estimate(
  basis: UpdateArrivalBasis,
  remaining: number | null,
  samples: ReadonlyArray<number>,
  median: number | null
): IUpdateArrivalEstimate {
  return {
    basis,
    etaMilliseconds: remaining !== null && remaining > 0 ? remaining : null,
    isOverdue: median !== null && remaining !== null && remaining <= 0,
    sampleSize: samples.length,
    medianMilliseconds: median,
  }
}

/**
 * Turn an observed signal into an arrival estimate.
 *
 * Returns null only when there is no signal at all — every real signal yields
 * an estimate, even if that estimate honestly carries no number.
 */
export function deriveUpdateArrivalEstimate(
  signal: IUpdateComingSoonSignal | null,
  now: number
): IUpdateArrivalEstimate | null {
  if (signal === null) {
    return null
  }

  switch (signal.kind) {
    case 'build-running': {
      // A run is genuinely in flight, so the only honest number is "how much
      // longer runs like this one usually take".
      const samples = usableSamples(signal.recentRunDurations)
      const median = medianOf(samples)
      if (median === null) {
        return estimate('running-workflow', null, samples, null)
      }
      const elapsed =
        signal.runStartedAt === null
          ? 0
          : Math.max(0, now - signal.runStartedAt)
      return estimate('running-workflow', median - elapsed, samples, median)
    }
    case 'awaiting-release':
      // The build already succeeded; what remains is the publish step, which
      // has no measurable duration of its own. "Shortly" is as precise as the
      // evidence allows, so no number is invented for it.
      return estimate('green-ci-no-release', null, [], null)
    case 'newer-commit': {
      const gaps = releaseCadenceGaps(signal.recentReleaseTimes)
      const median = medianOf(gaps)
      if (median === null) {
        return estimate('release-cadence', null, gaps, null)
      }
      const latest = Math.max(...usableSamples(signal.recentReleaseTimes))
      return estimate('release-cadence', latest + median - now, gaps, median)
    }
  }
}

/** A coarse, human-sized duration. Estimates are never shown to the second. */
export type EstimateDurationUnit = 'minute' | 'hour' | 'day'

export interface IEstimateDuration {
  readonly unit: EstimateDurationUnit
  readonly count: number
}

const Minute = 60 * 1000
const Hour = 60 * Minute
const Day = 24 * Hour

/**
 * Round a duration to the coarsest unit that still says something useful. A
 * positive duration always rounds to at least one of its unit, so an estimate
 * never collapses into a misleading "in 0 minutes".
 */
export function describeEstimateDuration(
  milliseconds: number
): IEstimateDuration | null {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return null
  }
  if (milliseconds < 90 * Minute) {
    return {
      unit: 'minute',
      count: Math.max(1, Math.round(milliseconds / Minute)),
    }
  }
  if (milliseconds < 36 * Hour) {
    return { unit: 'hour', count: Math.max(1, Math.round(milliseconds / Hour)) }
  }
  return { unit: 'day', count: Math.max(1, Math.round(milliseconds / Day)) }
}

/** The measured release cadence, for the details panel. */
export interface IReleaseCadence {
  readonly medianGapMilliseconds: number
  readonly sampleSize: number
}

/** Measure how often the fork has been publishing releases, or null. */
export function describeReleaseCadence(
  releaseTimes: ReadonlyArray<number>
): IReleaseCadence | null {
  const gaps = releaseCadenceGaps(releaseTimes)
  const median = medianOf(gaps)
  return median === null
    ? null
    : { medianGapMilliseconds: median, sampleSize: gaps.length }
}

/** Where a per-target dismissal is remembered. */
export const UpdateComingSoonDismissalKey = 'update-coming-soon-dismissed-v1'

/** The subset of `Storage` the dismissal helpers need. */
export interface IDismissalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): IDismissalStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

/**
 * The identity a dismissal is remembered against.
 *
 * This is the head commit rather than a tag: one commit is exactly one coming
 * build, it is known for every signal, and it does not change underneath the
 * user when the pending release finally acquires a tag. Dismissing therefore
 * silences *this* coming update through all of its stages, and a genuinely new
 * commit brings the banner back.
 */
export function updateComingSoonTargetKey(
  signal: IUpdateComingSoonSignal
): string {
  return signal.headSHA.toLowerCase()
}

/** Has the user already dismissed the banner for this exact coming build? */
export function isUpdateComingSoonDismissed(
  signal: IUpdateComingSoonSignal,
  storage: IDismissalStorage | null = defaultStorage()
): boolean {
  try {
    return (
      storage?.getItem(UpdateComingSoonDismissalKey) ===
      updateComingSoonTargetKey(signal)
    )
  } catch {
    // A storage failure must never keep the banner from rendering.
    return false
  }
}

/** Remember that this exact coming build was dismissed. */
export function dismissUpdateComingSoon(
  signal: IUpdateComingSoonSignal,
  storage: IDismissalStorage | null = defaultStorage()
): void {
  try {
    storage?.setItem(
      UpdateComingSoonDismissalKey,
      updateComingSoonTargetKey(signal)
    )
  } catch {
    // Dismissal is a convenience; losing it is not worth an error.
  }
}
