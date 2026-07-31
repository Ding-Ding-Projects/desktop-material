import * as React from 'react'
import classNames from 'classnames'
import { IAPIWorkflow, IAPIWorkflowRun } from '../../lib/api'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { getWorkflowStateAction } from './workflow-state-control'
import { getWorkflowFileName, getWorkflowGlyph } from './workflow-templates'

/** localStorage key used to persist the workflow filter mode. */
const WorkflowManagerFilterListId = 'actions-workflows'

/**
 * Renders a run duration the way a glance wants it: seconds under a minute,
 * minutes and seconds under an hour, hours and minutes above that. Never zero —
 * a run that finished inside the same second still took some time.
 */
export function formatRunDuration(milliseconds: number): string {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) {
    const seconds = totalSeconds % 60
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`
}

/**
 * How long a workflow's most recent finished run took, in milliseconds, or null
 * when no run of it has completed. GitHub reports no explicit duration on the
 * run resource, so this is `updated_at - created_at` of the newest completed
 * run — the same span the Actions web UI shows. Queued time is included, which
 * is the honest number for "how long until it was done"; a still-running or
 * never-run workflow reports nothing rather than a misleading partial time.
 */
export function getLastRunDuration(
  workflow: IAPIWorkflow,
  runs: ReadonlyArray<IAPIWorkflowRun>
): number | null {
  let newestStart = Number.NEGATIVE_INFINITY
  let duration: number | null = null

  for (const run of runs) {
    if (run.workflow_id !== workflow.id || run.status !== 'completed') {
      continue
    }
    if (run.updated_at === undefined) {
      continue
    }
    const started = Date.parse(run.created_at)
    const ended = Date.parse(run.updated_at)
    if (Number.isNaN(started) || Number.isNaN(ended) || ended < started) {
      continue
    }
    if (started > newestStart) {
      newestStart = started
      duration = ended - started
    }
  }

  return duration
}

interface IWorkflowManagerRowProps {
  readonly workflow: IAPIWorkflow
  readonly busyWorkflowId: number | null
  /** Duration of this workflow's most recent completed run, in milliseconds. */
  readonly lastRunDuration: number | null
  readonly index: number
  readonly onRequestChange: (workflow: IAPIWorkflow, enabled: boolean) => void
}

class WorkflowManagerRow extends React.PureComponent<IWorkflowManagerRowProps> {
  private toggle = () => {
    const { workflow } = this.props
    const action = getWorkflowStateAction(workflow)
    if (action !== null) {
      this.props.onRequestChange(workflow, action.enabled)
    }
  }

  public render() {
    const { workflow, busyWorkflowId, lastRunDuration, index } = this.props
    const enabled = workflow.state === 'active'
    const action = getWorkflowStateAction(workflow)
    const stateLabel = workflow.state.replace(/_/g, ' ')
    const durationLabel =
      lastRunDuration === null ? null : formatRunDuration(lastRunDuration)
    const style = { animationDelay: `${Math.min(index, 8) * 40}ms` }
    return (
      <div
        className={classNames('actions-workflow-row', { disabled: !enabled })}
        style={style}
      >
        <span className="actions-workflow-row-icon" aria-hidden="true">
          <Octicon
            symbol={getWorkflowGlyph(`${workflow.name} ${workflow.path}`)}
          />
        </span>
        <span className="actions-workflow-row-text">
          <strong>{workflow.name}</strong>
          <span className="actions-workflow-row-file">
            {getWorkflowFileName(workflow.path)} · {stateLabel}
            {durationLabel !== null && (
              <>
                {' · '}
                <span className="actions-workflow-row-duration">
                  last run {durationLabel}
                </span>
              </>
            )}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className="actions-workflow-switch"
          onClick={this.toggle}
          disabled={action === null || busyWorkflowId === workflow.id}
          aria-label={`${enabled ? 'Disable' : 'Enable'} workflow: ${
            workflow.name
          }`}
        >
          <span className="actions-workflow-switch-thumb" aria-hidden="true" />
        </button>
      </div>
    )
  }
}

interface IWorkflowManagerProps {
  readonly workflows: ReadonlyArray<IAPIWorkflow>
  /** Loaded runs, used to report each workflow's most recent run duration. */
  readonly runs: ReadonlyArray<IAPIWorkflowRun>
  readonly busyWorkflowId: number | null
  readonly onRequestChange: (workflow: IAPIWorkflow, enabled: boolean) => void
  readonly onNewWorkflow: () => void
}

interface IWorkflowManagerState {
  /** Free-text query narrowing workflows by name or file path. */
  readonly filterText: string
  readonly filterMode: FilterMode
  readonly filterCaseSensitive: boolean
}

/**
 * Filled inset card listing every workflow in the repository with an
 * enable/disable switch per row, a filter bar, plus the entry point into
 * the workflow template catalog.
 */
export class WorkflowManager extends React.PureComponent<
  IWorkflowManagerProps,
  IWorkflowManagerState
> {
  public state: IWorkflowManagerState = {
    filterText: '',
    filterMode: readPersistedFilterMode(WorkflowManagerFilterListId),
    filterCaseSensitive: false,
  }

  private onFilterChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ filterText: event.target.value })
  }

  private onFilterModeChanged = (filterMode: FilterMode) => {
    persistFilterMode(WorkflowManagerFilterListId, filterMode)
    this.setState({ filterMode })
  }

  private onFilterCaseSensitiveChanged = (filterCaseSensitive: boolean) =>
    this.setState({ filterCaseSensitive })

  private onFilterPatternApply = (filterText: string) =>
    this.setState({ filterText })

  private getFilterSampleItems = (): ReadonlyArray<string> =>
    this.props.workflows.flatMap(workflow => [workflow.name, workflow.path])

  private getVisibleWorkflows(): {
    readonly workflows: ReadonlyArray<IAPIWorkflow>
    readonly regexError: string | null
  } {
    const { workflows } = this.props
    const query = this.state.filterText.trim()
    if (query.length === 0) {
      return { workflows, regexError: null }
    }
    const { results, regexError } = matchWithMode(
      query,
      workflows,
      workflow => [workflow.name, workflow.path],
      {
        mode: this.state.filterMode,
        caseSensitive: this.state.filterCaseSensitive,
      }
    )
    return { workflows: results.map(r => r.item), regexError }
  }

  private renderRow = (workflow: IAPIWorkflow, index: number) => (
    <WorkflowManagerRow
      key={workflow.id}
      workflow={workflow}
      busyWorkflowId={this.props.busyWorkflowId}
      lastRunDuration={getLastRunDuration(workflow, this.props.runs)}
      index={index}
      onRequestChange={this.props.onRequestChange}
    />
  )

  public render() {
    const { workflows } = this.props
    const activeCount = workflows.filter(x => x.state === 'active').length
    const { workflows: visible, regexError } = this.getVisibleWorkflows()

    return (
      <section
        className="actions-workflow-management"
        aria-label="Workflow manager"
      >
        <header className="actions-workflow-management-header">
          <span className="actions-workflow-management-title">
            Workflows · {activeCount} active
          </span>
          <button
            type="button"
            className="actions-new-workflow-button"
            onClick={this.props.onNewWorkflow}
            aria-haspopup="dialog"
          >
            <Octicon symbol={octicons.plus} />
            New workflow
          </button>
        </header>
        {workflows.length > 0 && (
          <div className="actions-search-row actions-workflow-filter">
            <div
              className={classNames('actions-search-pill', {
                invalid: regexError !== null,
              })}
            >
              <Octicon symbol={octicons.search} />
              <input
                data-search-surface-id="actions-workflows"
                value={this.state.filterText}
                onChange={this.onFilterChanged}
                placeholder="Filter workflows by name or file…"
                spellCheck={false}
                aria-label="Filter workflows"
              />
              <FilterModeControl
                searchSurfaceId="actions-workflows"
                mode={this.state.filterMode}
                caseSensitive={this.state.filterCaseSensitive}
                onModeChange={this.onFilterModeChanged}
                onCaseSensitiveChange={this.onFilterCaseSensitiveChanged}
                regexBuilderTarget="Workflows"
                getSampleItems={this.getFilterSampleItems}
                filterText={this.state.filterText}
                onRegexPatternApply={this.onFilterPatternApply}
              />
            </div>
          </div>
        )}
        {workflows.length === 0 ? (
          <p className="actions-workflow-management-empty">
            No workflows yet — start from a template.
          </p>
        ) : visible.length === 0 ? (
          <p className="actions-workflow-management-empty">
            No workflows match the current filter.
          </p>
        ) : (
          visible.map(this.renderRow)
        )}
      </section>
    )
  }
}
