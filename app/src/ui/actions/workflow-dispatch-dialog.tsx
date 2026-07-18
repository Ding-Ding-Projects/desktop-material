import * as React from 'react'
import classNames from 'classnames'
import { Repository } from '../../models/repository'
import { IAPIWorkflow } from '../../lib/api'
import {
  IWorkflowDispatchDefinition,
  IWorkflowDispatchInput,
  parseFreeformWorkflowInputs,
  parseWorkflowDispatchInputs,
} from '../../lib/actions-workflow-inputs'
import { ActionsStore } from '../../lib/stores/actions-store'
import { Select } from '../lib/select'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { trapActionsDialogFocus } from './actions-dialog-focus'
import { getWorkflowFileName } from './workflow-templates'

/** How many quick-pick ref chips the popover shows before falling back. */
export const WorkflowDispatchRefChipMaximum = 6

interface IWorkflowDispatchDialogProps {
  readonly repository: Repository
  readonly workflows: ReadonlyArray<IAPIWorkflow>
  readonly initialWorkflowId: number | null
  readonly branchNames: ReadonlyArray<string>
  readonly initialRef: string
  readonly actionsStore: ActionsStore
  readonly onSubmit: (
    workflowId: number,
    ref: string,
    inputs: Readonly<Record<string, string>>
  ) => Promise<void>
  readonly onDismissed: () => void
}

interface IWorkflowDispatchDialogState {
  readonly workflowId: number
  readonly ref: string
  readonly loadingDefinition: boolean
  readonly definition: IWorkflowDispatchDefinition | null
  readonly values: Readonly<Record<string, string>>
  readonly freeform: string
  readonly submitting: boolean
  readonly error: Error | null
}

export class WorkflowDispatchDialog extends React.Component<
  IWorkflowDispatchDialogProps,
  IWorkflowDispatchDialogState
> {
  private dialog: HTMLFormElement | null = null
  private previousFocus: HTMLElement | null = null

  public constructor(props: IWorkflowDispatchDialogProps) {
    super(props)
    const workflowId =
      props.workflows.find(x => x.id === props.initialWorkflowId)?.id ??
      props.workflows[0]?.id ??
      0
    this.state = {
      workflowId,
      ref: props.initialRef || props.branchNames[0] || 'main',
      loadingDefinition: false,
      definition: null,
      values: {},
      freeform: '',
      submitting: false,
      error: null,
    }
  }

  public componentDidMount() {
    this.previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    this.loadDefinition()
    this.dialog?.focus()
  }

  public componentWillUnmount() {
    if (this.previousFocus?.isConnected) {
      this.previousFocus.focus()
    }
  }

  private setDialogRef = (dialog: HTMLFormElement | null) => {
    this.dialog = dialog
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    event.stopPropagation()
    trapActionsDialogFocus(event, event.currentTarget)
    if (event.key === 'Escape' && !this.state.submitting) {
      event.preventDefault()
      this.props.onDismissed()
    }
  }

  private async loadDefinition() {
    const workflow = this.props.workflows.find(
      item => item.id === this.state.workflowId
    )
    if (workflow === undefined) {
      return
    }
    this.setState({ loadingDefinition: true, definition: null, error: null })
    try {
      const source = await this.props.actionsStore.fetchWorkflowSource(
        this.props.repository,
        workflow
      )
      const definition = parseWorkflowDispatchInputs(source)
      const values: Record<string, string> = {}
      for (const input of definition.inputs) {
        values[input.name] =
          input.defaultValue ||
          (input.type === 'choice' ? input.options[0] ?? '' : '')
      }
      this.setState({ definition, values, loadingDefinition: false })
    } catch (error) {
      this.setState({
        definition: {
          available: false,
          inputs: [],
          error: error instanceof Error ? error : new Error(String(error)),
        },
        loadingDefinition: false,
      })
    }
  }

  private onWorkflowChipClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const workflowId = Number(event.currentTarget.dataset.workflowId)
    if (workflowId !== this.state.workflowId) {
      this.setState({ workflowId }, this.loadDefinitionCallback)
    }
  }

  private loadDefinitionCallback = () => {
    void this.loadDefinition()
  }

  private onRefChipClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const ref = event.currentTarget.dataset.ref
    if (ref !== undefined) {
      this.setState({ ref })
    }
  }

  private onRefSelectChange = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({ ref: event.currentTarget.value })

  private onInputChange = (
    event: React.FormEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const input = event.currentTarget
    const value =
      input instanceof HTMLInputElement && input.type === 'checkbox'
        ? String(input.checked)
        : input.value
    this.setState({ values: { ...this.state.values, [input.name]: value } })
  }

  private onFreeformChange = (event: React.FormEvent<HTMLTextAreaElement>) =>
    this.setState({ freeform: event.currentTarget.value })

  private submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const definition = this.state.definition
    try {
      const inputs =
        definition?.available === true
          ? this.state.values
          : parseFreeformWorkflowInputs(this.state.freeform)
      for (const input of definition?.inputs ?? []) {
        if (input.required && !inputs[input.name]) {
          throw new Error(`${input.name} is required.`)
        }
      }
      this.setState({ submitting: true, error: null })
      await this.props.onSubmit(this.state.workflowId, this.state.ref, inputs)
    } catch (error) {
      this.setState({
        submitting: false,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  private renderWorkflowChip = (workflow: IAPIWorkflow) => {
    const on = workflow.id === this.state.workflowId
    return (
      <button
        key={workflow.id}
        type="button"
        className={classNames('workflow-dispatch-chip', { on })}
        aria-pressed={on}
        aria-label={`Workflow: ${workflow.name}`}
        data-workflow-id={workflow.id}
        onClick={this.onWorkflowChipClick}
      >
        {getWorkflowFileName(workflow.path) || workflow.name}
      </button>
    )
  }

  private renderRefChip = (ref: string) => {
    const on = ref === this.state.ref
    return (
      <button
        key={ref}
        type="button"
        className={classNames('workflow-dispatch-chip', { on })}
        aria-pressed={on}
        aria-label={`Run on ref: ${ref}`}
        data-ref={ref}
        onClick={this.onRefChipClick}
      >
        {ref}
      </button>
    )
  }

  private renderInput(input: IWorkflowDispatchInput) {
    const value = this.state.values[input.name] ?? ''
    return (
      <label className="workflow-input" key={input.name}>
        <span className="workflow-dispatch-label">
          Input · {input.name}
          {input.required && <strong> *</strong>}
        </span>
        {input.description && <small>{input.description}</small>}
        {input.type === 'choice' ? (
          <select name={input.name} value={value} onChange={this.onInputChange}>
            {input.options.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : input.type === 'boolean' ? (
          <input
            name={input.name}
            type="checkbox"
            checked={value === 'true'}
            onChange={this.onInputChange}
          />
        ) : (
          <input
            name={input.name}
            type="text"
            value={value}
            required={input.required}
            placeholder={`Value for ${input.name}`}
            onChange={this.onInputChange}
          />
        )}
      </label>
    )
  }

  public render() {
    const { definition, loadingDefinition, submitting } = this.state
    const branchNames =
      this.props.branchNames.length > 0
        ? this.props.branchNames
        : [this.state.ref]
    const refChips = [
      ...new Set([this.props.initialRef, this.state.ref, ...branchNames]),
    ]
      .filter(x => x.length > 0)
      .slice(0, WorkflowDispatchRefChipMaximum)
    const hasMoreRefs = branchNames.some(x => !refChips.includes(x))
    return (
      <div className="actions-dialog-layer">
        {/* The form dialog handles Escape from any descendant control. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <form
          className="workflow-dispatch-dialog workflow-dispatch-popover"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workflow-dispatch-title"
          tabIndex={-1}
          ref={this.setDialogRef}
          onKeyDown={this.onKeyDown}
          onSubmit={this.submit}
        >
          <header className="workflow-dispatch-header">
            <h2 id="workflow-dispatch-title">Run workflow</h2>
            <button
              type="button"
              className="actions-icon-button workflow-dispatch-close"
              onClick={this.props.onDismissed}
              aria-label="Close run workflow dialog"
            >
              <Octicon symbol={octicons.x} />
            </button>
          </header>
          {this.state.error && (
            <div className="actions-inline-error" role="alert">
              {this.state.error.message}
            </div>
          )}
          <div
            className="workflow-dispatch-section"
            role="group"
            aria-labelledby="workflow-dispatch-workflow-label"
          >
            <span
              className="workflow-dispatch-label"
              id="workflow-dispatch-workflow-label"
            >
              Workflow
            </span>
            <div className="workflow-dispatch-chips">
              {this.props.workflows.map(this.renderWorkflowChip)}
            </div>
          </div>
          <div
            className="workflow-dispatch-section"
            role="group"
            aria-labelledby="workflow-dispatch-ref-label"
          >
            <span
              className="workflow-dispatch-label"
              id="workflow-dispatch-ref-label"
            >
              Run on ref
            </span>
            <div className="workflow-dispatch-chips">
              {refChips.map(this.renderRefChip)}
            </div>
            {hasMoreRefs && (
              <Select
                label="All refs"
                value={this.state.ref}
                onChange={this.onRefSelectChange}
              >
                {branchNames.map(branch => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div className="workflow-dispatch-inputs">
            {loadingDefinition ? (
              <div className="actions-loading">Reading workflow inputs…</div>
            ) : definition?.available ? (
              definition.inputs.length > 0 ? (
                definition.inputs.map(input => this.renderInput(input))
              ) : (
                <p className="workflow-dispatch-no-inputs">
                  This workflow has no inputs.
                </p>
              )
            ) : (
              <label className="workflow-input">
                <span className="workflow-dispatch-label">
                  Inputs (optional name=value lines)
                </span>
                <small>
                  {definition?.error?.message ??
                    'The workflow definition could not provide a generated form.'}
                </small>
                <textarea
                  value={this.state.freeform}
                  onChange={this.onFreeformChange}
                  placeholder={'environment=staging\ndry_run=false'}
                />
              </label>
            )}
          </div>
          <button
            type="submit"
            className="workflow-dispatch-run-button"
            disabled={
              submitting || loadingDefinition || this.state.workflowId === 0
            }
          >
            <Octicon symbol={octicons.play} />
            {submitting ? 'Starting…' : 'Run workflow'}
          </button>
        </form>
      </div>
    )
  }
}
