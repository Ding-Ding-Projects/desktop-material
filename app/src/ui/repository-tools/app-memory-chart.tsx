import * as React from 'react'

import {
  ILiveSample,
  liveChartStatus,
  pushLiveSample,
} from '../../lib/live-chart'
import { LiveChart } from '../lib/live-chart'

interface IAppMemoryChartProps {
  /** Bytes in use right now. Injectable for tests. */
  readonly readMemory?: () => number
  readonly now?: () => number
  /**
   * Call `sample` repeatedly and return a function that stops. Injectable so
   * tests can drive the clock themselves.
   */
  readonly schedule?: (sample: () => void) => () => void
}

interface IAppMemoryChartState {
  readonly samples: ReadonlyArray<ILiveSample>
  readonly paused: boolean
  readonly now: number
}

const readProcessMemory = () => process.memoryUsage().rss

const everySecond = (sample: () => void) => {
  const timer = window.setInterval(sample, 1000)
  return () => window.clearInterval(timer)
}

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`

const clockTime = (time: number) =>
  new Date(time).toLocaleTimeString(undefined, { hour12: false })

/**
 * Memory in use by this window, sampled once a second and drawn live. The
 * figure is read from the running process; nothing is sent anywhere.
 */
export class AppMemoryChart extends React.Component<
  IAppMemoryChartProps,
  IAppMemoryChartState
> {
  private stop: (() => void) | null = null

  public constructor(props: IAppMemoryChartProps) {
    super(props)
    this.state = { samples: [], paused: false, now: this.now() }
  }

  private now() {
    return (this.props.now ?? Date.now)()
  }

  public componentDidMount() {
    this.sample()
    this.stop = (this.props.schedule ?? everySecond)(this.sample)
  }

  public componentWillUnmount() {
    this.stop?.()
  }

  private sample = () => {
    const now = this.now()
    if (this.state.paused) {
      this.setState({ now })
      return
    }
    let value: number
    try {
      value = (this.props.readMemory ?? readProcessMemory)()
    } catch {
      // A failed reading is skipped; the chart turns stale by itself.
      this.setState({ now })
      return
    }
    this.setState(state => ({
      now,
      samples: pushLiveSample(state.samples, { time: now, value }),
    }))
  }

  private onTogglePause = () => {
    this.setState({ paused: !this.state.paused })
  }

  public render() {
    const { samples, paused, now } = this.state
    return (
      <div className="app-memory-chart">
        <LiveChart
          id="app-memory-chart"
          title="Memory used by this window"
          samples={samples}
          status={liveChartStatus(samples, now, paused)}
          formatValue={megabytes}
          formatTime={clockTime}
          onTogglePause={this.onTogglePause}
        />
        <p className="live-chart-note">
          Read from the running process once a second and kept for two minutes.
          Nothing is recorded to disk or sent anywhere.
        </p>
      </div>
    )
  }
}
