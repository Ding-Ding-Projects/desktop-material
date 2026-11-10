/**
 * Live charts: a bounded window of real samples, drawn as a line.
 *
 * Pure rules for the chart component: what is kept, how it scales, which state
 * the chart is in and how it is described to a screen reader. A chart never
 * invents a value: when samples stop arriving it says so instead of
 * extrapolating.
 */

export interface ILiveSample {
  /** Milliseconds since the epoch. */
  readonly time: number
  readonly value: number
}

/** Two minutes at one sample a second. */
export const MaxLiveSamples = 120

/** A chart whose newest sample is older than this is stale. */
export const DefaultStaleAfterMs = 5000

export type LiveChartStatus = 'loading' | 'live' | 'paused' | 'stale'

export type LiveChartTrend = 'rising' | 'falling' | 'steady'

/** Append a sample, dropping the oldest beyond the window and any non-number. */
export function pushLiveSample(
  samples: ReadonlyArray<ILiveSample>,
  sample: ILiveSample,
  max: number = MaxLiveSamples
): ReadonlyArray<ILiveSample> {
  if (!Number.isFinite(sample.value) || !Number.isFinite(sample.time)) {
    return samples
  }
  const next = [...samples, sample]
  return next.length > max ? next.slice(next.length - max) : next
}

export function liveChartStatus(
  samples: ReadonlyArray<ILiveSample>,
  now: number,
  paused: boolean,
  staleAfterMs: number = DefaultStaleAfterMs
): LiveChartStatus {
  if (paused) {
    return 'paused'
  }
  if (samples.length === 0) {
    return 'loading'
  }
  return now - samples[samples.length - 1].time > staleAfterMs
    ? 'stale'
    : 'live'
}

export interface ILiveChartPoint {
  readonly x: number
  readonly y: number
}

/**
 * Place the samples in a box. The vertical range is the window's own minimum
 * and maximum with a little headroom; a flat line sits in the middle.
 */
export function liveChartPoints(
  samples: ReadonlyArray<ILiveSample>,
  width: number,
  height: number,
  padding: number = 6
): ReadonlyArray<ILiveChartPoint> {
  if (samples.length === 0) {
    return []
  }
  const values = samples.map(s => s.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low
  const innerHeight = Math.max(1, height - padding * 2)
  const innerWidth = Math.max(1, width - padding * 2)
  return samples.map((sample, index) => ({
    x:
      samples.length === 1
        ? width / 2
        : padding + (index / (samples.length - 1)) * innerWidth,
    y:
      span === 0
        ? height / 2
        : padding + (1 - (sample.value - low) / span) * innerHeight,
  }))
}

/** Which sample a horizontal position points at. */
export function liveSampleIndexAt(
  count: number,
  x: number,
  width: number
): number | null {
  if (count === 0 || width <= 0) {
    return null
  }
  const ratio = Math.min(1, Math.max(0, x / width))
  return Math.round(ratio * (count - 1))
}

/** Compare the newest sample with the oldest in the window. */
export function liveChartTrend(
  samples: ReadonlyArray<ILiveSample>
): LiveChartTrend {
  if (samples.length < 2) {
    return 'steady'
  }
  const first = samples[0].value
  const last = samples[samples.length - 1].value
  const tolerance = Math.max(Math.abs(first), Math.abs(last)) * 0.02
  if (last - first > tolerance) {
    return 'rising'
  }
  return first - last > tolerance ? 'falling' : 'steady'
}

/** One sentence a screen reader can read instead of the picture. */
export function describeLiveChart(
  title: string,
  samples: ReadonlyArray<ILiveSample>,
  status: LiveChartStatus,
  formatValue: (value: number) => string
): string {
  if (samples.length === 0) {
    return status === 'paused'
      ? `${title}: paused before any sample arrived.`
      : `${title}: waiting for the first sample.`
  }
  const values = samples.map(s => s.value)
  const seconds = Math.max(
    1,
    Math.round((samples[samples.length - 1].time - samples[0].time) / 1000)
  )
  const state =
    status === 'paused'
      ? ' Paused.'
      : status === 'stale'
        ? ' No new sample has arrived recently.'
        : ''
  return (
    `${title}: latest ${formatValue(values[values.length - 1])}, ` +
    `lowest ${formatValue(Math.min(...values))}, ` +
    `highest ${formatValue(Math.max(...values))} over ${seconds} ` +
    `${seconds === 1 ? 'second' : 'seconds'}, ${liveChartTrend(samples)}.` +
    state
  )
}
