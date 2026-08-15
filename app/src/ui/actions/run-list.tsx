import * as React from 'react'
import classNames from 'classnames'
import {
  APICheckConclusion,
  APICheckStatus,
  IAPIWorkflowRun,
} from '../../lib/api'
import { RelativeTime } from '../relative-time'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { isWorkflowRunCancellableStatus } from '../../lib/actions-workflow-runs'
import { getWorkflowFileName } from './workflow-templates'
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

interface IRunListProps {
  readonly runs: ReadonlyArray<IAPIWorkflowRun>
  readonly selectedRunId: number | null
  readonly selectedRunIds?: ReadonlySet<number>
  readonly busyRunId: number | null
  readonly bulkBusy?: boolean
  readonly onSelect: (run: IAPIWorkflowRun) => void
  readonly onToggleSelection?: (run: IAPIWorkflowRun, selected: boolean) => void
  readonly onRerun: (run: IAPIWorkflowRun) => void
  readonly onRerunFailed: (run: IAPIWorkflowRun) => void
  readonly onRequestCancel: (
    run: IAPIWorkflowRun,
    trigger: HTMLButtonElement,
    fallback: HTMLButtonElement | null
  ) => void
  /** Deterministic clock/scheduler boundary for live elapsed labels. */
  readonly elapsedClock?: IWorkflowRunElapsedClock
}

interface IRunListState {
  readonly now: number
  readonly languageMode: LanguageMode
}

export const isWorkflowRunActive = (run: IAPIWorkflowRun) =>
  isWorkflowRunCancellableStatus(run.status)

export function getRunTone(run: IAPIWorkflowRun) {
  if (run.status !== APICheckStatus.Completed) {
    switch (run.status) {
      case APICheckStatus.Queued:
        return { label: 'Queued', tone: 'pending' }
      case APICheckStatus.InProgress:
        return { label: 'Running', tone: 'pending' }
      case 'waiting':
        return { label: 'Waiting', tone: 'pending' }
      case 'pending':
        return { label: 'Pending', tone: 'pending' }
      case 'requested':
        return { label: 'Requested', tone: 'pending' }
      default:
        return { label: 'Unknown', tone: 'neutral' }
    }
  }
  switch (run.conclusion) {
    case APICheckConclusion.Success:
      return { label: 'Success', tone: 'success' }
    case APICheckConclusion.Neutral:
    case APICheckConclusion.Skipped:
      return {
        label:
          run.conclusion === APICheckConclusion.Skipped ? 'Skipped' : 'Neutral',
        tone: 'neutral',
      }
    case APICheckConclusion.Canceled:
      return { label: 'Cancelled', tone: 'neutral' }
    case APICheckConclusion.TimedOut:
      return { label: 'Timed out', tone: 'failure' }
    default:
      return { label: 'Failed', tone: 'failure' }
  }
}

/** Leading status glyph for a run row, mirroring the prototype icon set. */
export function getRunStatusGlyph(run: IAPIWorkflowRun): {
  readonly symbol: OcticonSymbol
  readonly className: string
} {
  if (run.status !== APICheckStatus.Completed) {
    return run.status === APICheckStatus.InProgress
      ? { symbol: octicons.sync, className: 'running' }
      : { symbol: octicons.clock, className: 'pending' }
  }
  switch (run.conclusion) {
    case APICheckConclusion.Success:
      return { symbol: octicons.checkCircleFill, className: 'success' }
    case APICheckConclusion.Skipped:
      return { symbol: octicons.skip, className: 'neutral' }
    case APICheckConclusion.Canceled:
      return { symbol: octicons.circleSlash, className: 'neutral' }
    case APICheckConclusion.Neutral:
      return { symbol: octicons.dotFill, className: 'neutral' }
    default:
      return { symbol: octicons.xCircleFill, className: 'failure' }
  }
}

class RunListItem extends React.PureComponent<
  IRunListProps & {
    readonly run: IAPIWorkflowRun
    readonly now: number
    readonly languageMode: LanguageMode
  }
> {
  private selectButton: HTMLButtonElement | null = null
  private select = () => this.props.onSelect(this.props.run)
  private toggleSelection = (event: React.ChangeEvent<HTMLInputElement>) =>
    this.props.onToggleSelection?.(this.props.run, event.currentTarget.checked)
  private setSelectButtonRef = (button: HTMLButtonElement | null) => {
    this.selectButton = button
  }
  private rerun = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    this.props.onRerun(this.props.run)
  }
  private rerunFailed = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    this.props.onRerunFailed(this.props.run)
  }
  private requestCancel = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    this.props.onRequestCancel(
      this.props.run,
      event.currentTarget,
      this.selectButton
    )
  }

  public render() {
    const {
      run,
      selectedRunId,
      selectedRunIds = new Set<number>(),
      busyRunId,
      bulkBusy = false,
      now,
      languageMode,
    } = this.props
    const status = getRunTone(run)
    const glyph = getRunStatusGlyph(run)
    const failed = run.conclusion === APICheckConclusion.Failure
    const active = isWorkflowRunActive(run)
    const actor = run.actor
    const title = run.display_title || run.name
    const branch = run.head_branch ?? 'detached'
    const workflowFile = run.path ? getWorkflowFileName(run.path) : run.name
    const elapsed = getWorkflowRunElapsed(run, now)
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
    const elapsedLabel = translate(elapsedKey, languageMode, elapsedVariables)
    const elapsedAccessibleLabel = translate(
      elapsedKey,
      getPrimaryLanguageMode(languageMode),
      elapsedVariables
    )

    return (
      <li>
        <div
          className={classNames('actions-run-card', {
            selected: selectedRunId === run.id,
          })}
        >
          {this.props.onToggleSelection !== undefined && (
            <label className="actions-run-checkbox">
              <input
                type="checkbox"
                checked={selectedRunIds.has(run.id)}
                disabled={bulkBusy || busyRunId !== null}
                onChange={this.toggleSelection}
                aria-label={`Select workflow run ${run.run_number ?? run.id}`}
              />
            </label>
          )}
          <button
            type="button"
            className="actions-run-select"
            ref={this.setSelectButtonRef}
            onClick={this.select}
            aria-pressed={selectedRunId === run.id}
          >
            <span
              className={classNames('actions-run-status-icon', glyph.className)}
              aria-hidden="true"
            >
              <Octicon symbol={glyph.symbol} />
            </span>
            <span className="actions-run-summary">
              <strong>{title}</strong>
              <span className="actions-run-meta">
                <span className="sr-only">{status.label}</span>
                <span className="actions-run-number">
                  #{run.run_number ?? run.id}
                </span>
                <span className="branch-chip">{branch}</span>
                <span>{run.event}</span>
                {actor && (
                  <span className="actions-actor">
                    <img src={actor.avatar_url} alt="" />
                    {actor.login}
                  </span>
                )}
                <span className="actions-run-elapsed" aria-hidden="true">
                  {elapsedLabel}
                </span>
                <span className="sr-only">{elapsedAccessibleLabel}</span>
                <RelativeTime date={new Date(run.created_at)} />
              </span>
            </span>
            <span className="actions-run-wf-chip">{workflowFile}</span>
          </button>
          <span className="actions-run-buttons">
            {active ? (
              <Button
                size="small"
                className="actions-run-icon-button"
                disabled={bulkBusy || busyRunId === run.id}
                onClick={this.requestCancel}
                ariaLabel={`Cancel workflow run ${run.run_number ?? run.id}`}
                ariaHaspopup="dialog"
              >
                <Octicon symbol={octicons.stop} />
              </Button>
            ) : (
              <>
                {failed && (
                  <Button
                    size="small"
                    className="actions-run-icon-button"
                    disabled={bulkBusy || busyRunId === run.id}
                    onClick={this.rerunFailed}
                    ariaLabel="Re-run failed"
                  >
                    <Octicon symbol={octicons.alert} />
                  </Button>
                )}
                <Button
                  size="small"
                  className="actions-run-icon-button"
                  disabled={bulkBusy || busyRunId === run.id}
                  onClick={this.rerun}
                  ariaLabel="Re-run"
                >
                  <Octicon symbol={octicons.sync} />
                </Button>
              </>
            )}
            <LinkButton uri={run.html_url}>GitHub</LinkButton>
          </span>
        </div>
      </li>
    )
  }
}

export class RunList extends React.PureComponent<IRunListProps, IRunListState> {
  private elapsedInterval: number | null = null

  public constructor(props: IRunListProps) {
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

  public componentDidUpdate(prevProps: IRunListProps) {
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

  private renderRun = (run: IAPIWorkflowRun) => (
    <RunListItem
      key={run.id}
      {...this.props}
      run={run}
      now={this.state.now}
      languageMode={this.state.languageMode}
    />
  )

  public render() {
    if (this.props.runs.length === 0) {
      return (
        <div className="actions-empty">
          No workflow runs match the current filters.
        </div>
      )
    }
    return (
      <ul className="actions-run-list">
        {this.props.runs.map(this.renderRun)}
      </ul>
    )
  }
}
