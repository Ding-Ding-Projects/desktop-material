import * as React from 'react'

import {
  ILiveSample,
  LiveChartStatus,
  describeLiveChart,
  liveChartPoints,
  liveSampleIndexAt,
} from '../../lib/live-chart'
import { Button } from './button'

const ChartWidth = 600
const ChartHeight = 140

interface ILiveChartProps {
  readonly id: string
  readonly title: string
  readonly samples: ReadonlyArray<ILiveSample>
  readonly status: LiveChartStatus
  readonly formatValue: (value: number) => string
  readonly formatTime: (time: number) => string
  readonly onTogglePause: () => void
}

interface ILiveChartState {
  /** The sample being inspected, or null to follow the newest one. */
  readonly scrubIndex: number | null
}

const statusLabels: Readonly<Record<LiveChartStatus, string>> = {
  loading: 'Loading',
  live: 'Live',
  paused: 'Paused',
  stale: 'Stale',
}

/**
 * A line chart of live samples. The newest value is always shown as text, any
 * sample can be inspected with the pointer or the keyboard, and the picture
 * has a one-sentence description for screen readers.
 */
export class LiveChart extends React.Component<
  ILiveChartProps,
  ILiveChartState
> {
  public constructor(props: ILiveChartProps) {
    super(props)
    this.state = { scrubIndex: null }
  }

  private get inspected(): { index: number; sample: ILiveSample } | null {
    const { samples } = this.props
    if (samples.length === 0) {
      return null
    }
    const index = Math.min(
      this.state.scrubIndex ?? samples.length - 1,
      samples.length - 1
    )
    return { index, sample: samples[index] }
  }

  private onPointerMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    this.setState({
      scrubIndex: liveSampleIndexAt(
        this.props.samples.length,
        event.clientX - box.left,
        box.width
      ),
    })
  }

  private onPointerLeave = () => {
    this.setState({ scrubIndex: null })
  }

  private onScrub = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ scrubIndex: Number(event.currentTarget.value) })
  }

  private onFollowLatest = () => {
    this.setState({ scrubIndex: null })
  }

  private renderMessage() {
    const { status, samples, formatTime } = this.props
    if (status === 'loading') {
      return 'Waiting for the first sample.'
    }
    if (samples.length === 0) {
      return 'Paused before any sample arrived.'
    }
    const last = samples[samples.length - 1]
    if (status === 'paused') {
      return `Paused at ${formatTime(
        last.time
      )}. The line holds its last real value.`
    }
    if (status === 'stale') {
      return `No new sample since ${formatTime(
        last.time
      )}. Nothing is estimated.`
    }
    return 'Move over the chart, or use the slider, to inspect a sample.'
  }

  public render() {
    const { id, title, samples, status, formatValue, formatTime } = this.props
    const points = liveChartPoints(samples, ChartWidth, ChartHeight)
    const inspected = this.inspected
    const dot = inspected === null ? null : points[inspected.index]
    const following = this.state.scrubIndex === null
    const valueText =
      inspected === null
        ? 'No value yet'
        : `${formatValue(inspected.sample.value)} at ${formatTime(
            inspected.sample.time
          )}`

    return (
      <section
        className="live-chart"
        data-dm-motion-surface="charts"
        data-status={status}
        aria-labelledby={`${id}-title`}
      >
        <div className="live-chart-header">
          <h3 id={`${id}-title`}>{title}</h3>
          <span className="live-chart-status" role="status">
            {statusLabels[status]}
          </span>
          <Button onClick={this.props.onTogglePause}>
            {status === 'paused' ? 'Resume' : 'Pause'}
          </Button>
        </div>
        <p className="live-chart-value">{valueText}</p>
        <svg
          className="live-chart-plot"
          viewBox={`0 0 ${ChartWidth} ${ChartHeight}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={describeLiveChart(title, samples, status, formatValue)}
          onMouseMove={this.onPointerMove}
          onMouseLeave={this.onPointerLeave}
        >
          {points.length > 1 && (
            <polyline
              className="live-chart-line"
              points={points.map(p => `${p.x},${p.y}`).join(' ')}
            />
          )}
          {dot !== null && (
            <circle
              className={
                following && status === 'live'
                  ? 'live-chart-dot live-chart-dot-live'
                  : 'live-chart-dot'
              }
              cx={dot.x}
              cy={dot.y}
              r={5}
            />
          )}
        </svg>
        <div className="live-chart-scrub">
          <label htmlFor={`${id}-scrub`}>Inspect a sample</label>
          <input
            id={`${id}-scrub`}
            type="range"
            min={0}
            max={Math.max(0, samples.length - 1)}
            step={1}
            value={inspected?.index ?? 0}
            disabled={samples.length < 2}
            aria-valuetext={valueText}
            onChange={this.onScrub}
          />
          <Button onClick={this.onFollowLatest} disabled={following}>
            Latest
          </Button>
        </div>
        <p className="live-chart-message">{this.renderMessage()}</p>
      </section>
    )
  }
}
