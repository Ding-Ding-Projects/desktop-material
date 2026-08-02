import * as React from 'react'
import { IAPIWorkflowRun } from '../../lib/api'
import {
  DefaultWorkflowRunElapsedClock,
  formatWorkflowRunElapsed,
  getWorkflowRunElapsed,
  hasRunningWorkflowRun,
  IWorkflowRunElapsedClock,
  WorkflowRunElapsedRefreshIntervalMs,
} from '../../lib/actions-workflow-run-elapsed'
import {
  getPersistedLanguageMode,
  getPrimaryLanguageMode,
  LanguageModeChangedEvent,
  translate,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'

interface IWorkflowRunReviewListProps {
  readonly runs: ReadonlyArray<IAPIWorkflowRun>
  readonly elapsedClock?: IWorkflowRunElapsedClock
}

interface IWorkflowRunReviewListState {
  readonly now: number
  readonly languageMode: LanguageMode
}

/** Compact reviewed-run list shared by bulk Actions confirmations. */
export class WorkflowRunReviewList extends React.PureComponent<
  IWorkflowRunReviewListProps,
  IWorkflowRunReviewListState
> {
  private elapsedInterval: number | null = null

  public constructor(props: IWorkflowRunReviewListProps) {
    super(props)
    this.state = {
      now: this.clock.now(),
      languageMode: getPersistedLanguageMode(),
    }
  }

  private get clock(): IWorkflowRunElapsedClock {
    return this.props.elapsedClock ?? DefaultWorkflowRunElapsedClock
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    document.addEventListener('visibilitychange', this.onVisibilityChanged)
    this.syncElapsedInterval()
  }

  public componentDidUpdate(prevProps: IWorkflowRunReviewListProps) {
    if (prevProps.elapsedClock !== this.props.elapsedClock) {
      this.clearElapsedInterval(prevProps.elapsedClock)
      this.setState({ now: this.clock.now() })
    }
    if (
      prevProps.runs !== this.props.runs ||
      prevProps.elapsedClock !== this.props.elapsedClock
    ) {
      this.syncElapsedInterval()
    }
  }

  public componentWillUnmount() {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    document.removeEventListener('visibilitychange', this.onVisibilityChanged)
    this.clearElapsedInterval()
  }

  private onLanguageModeChanged = (event: Event) => {
    this.setState({
      languageMode: normalizeLanguageMode(
        (event as CustomEvent<unknown>).detail
      ),
    })
  }

  private onVisibilityChanged = () => {
    if (document.visibilityState !== 'hidden') {
      this.setState({ now: this.clock.now() })
    }
    this.syncElapsedInterval()
  }

  private onElapsedInterval = () => this.setState({ now: this.clock.now() })

  private syncElapsedInterval() {
    const shouldRun =
      document.visibilityState !== 'hidden' &&
      hasRunningWorkflowRun(this.props.runs, this.state.now)
    if (shouldRun && this.elapsedInterval === null) {
      this.elapsedInterval = this.clock.setInterval(
        this.onElapsedInterval,
        WorkflowRunElapsedRefreshIntervalMs
      )
    } else if (!shouldRun) {
      this.clearElapsedInterval()
    }
  }

  private clearElapsedInterval(clock = this.props.elapsedClock) {
    if (this.elapsedInterval !== null) {
      const elapsedClock = clock ?? DefaultWorkflowRunElapsedClock
      elapsedClock.clearInterval(this.elapsedInterval)
      this.elapsedInterval = null
    }
  }

  private renderRun = (run: IAPIWorkflowRun) => {
    const elapsed = getWorkflowRunElapsed(run, this.state.now)
    const elapsedKey =
      elapsed.kind === 'pending'
        ? 'actions.elapsed.pending'
        : elapsed.kind === 'unavailable'
        ? 'actions.elapsed.unavailable'
        : 'actions.elapsed.run'
    const elapsedVariables =
      elapsed.kind === 'completed' || elapsed.kind === 'running'
        ? { duration: formatWorkflowRunElapsed(elapsed.milliseconds) }
        : undefined
    const elapsedLabel = translate(
      elapsedKey,
      this.state.languageMode,
      elapsedVariables
    )
    const elapsedAccessibleLabel = translate(
      elapsedKey,
      getPrimaryLanguageMode(this.state.languageMode),
      elapsedVariables
    )

    return (
      <li key={run.id}>
        <strong>{run.display_title || run.name}</strong>{' '}
        <span>#{run.run_number ?? run.id}</span>{' '}
        <code>{run.head_branch ?? 'detached'}</code>{' '}
        <span className="actions-run-elapsed" aria-hidden="true">
          {elapsedLabel}
        </span>
        <span className="sr-only">{elapsedAccessibleLabel}</span>
      </li>
    )
  }

  public render() {
    return (
      <ul className="actions-bulk-run-review-list">
        {this.props.runs.map(this.renderRun)}
      </ul>
    )
  }
}
