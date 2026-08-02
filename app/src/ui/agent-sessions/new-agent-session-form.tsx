import * as React from 'react'

import {
  CodingAgentId,
  INewAgentSessionRequest,
} from '../../models/agent-session'
import {
  IAgentRunnerAvailability,
  INewAgentSessionProblem,
  getSelectableCodingAgentIds,
  validateNewAgentSession,
} from '../../lib/agent-sessions'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { MaterialSymbol } from '../lib/material-symbol'
import { Select } from '../lib/select'
import { TextArea } from '../lib/text-area'
import { TextBox } from '../lib/text-box'
import { CodingAgentPicker } from './coding-agent-picker'

interface INewAgentSessionFormProps {
  readonly availability: IAgentRunnerAvailability
  /** Short branch names offered by the base-branch picker. */
  readonly baseBranches: ReadonlyArray<string>
  /** The branch pre-selected when the form opens, usually the default branch. */
  readonly defaultBaseBranch: string
  readonly existingWorktreeNames: ReadonlyArray<string>
  readonly existingBranchNames: ReadonlyArray<string>
  /** True while a session is being created; the form stays visible but inert. */
  readonly isStarting: boolean
  readonly onStart: (request: INewAgentSessionRequest) => void
  readonly onCancel: () => void
  /**
   * Opens the setup-commands editor. Optional because that editor is not part
   * of this panel — when it is absent the link says so rather than pretending
   * to be a working control.
   */
  readonly onConfigureSetupCommands?: () => void
}

interface INewAgentSessionFormState {
  readonly name: string
  readonly baseBranch: string
  readonly agent: CodingAgentId
  readonly prompt: string
  readonly isOptionsExpanded: boolean
}

/**
 * The session creator: a name, an `Options` disclosure holding the base branch,
 * the coding agent, the agent's task and the setup-commands link, and Start.
 *
 * Start sits outside the disclosure on purpose. A primary action a user cannot
 * see until they expand an optional section is a usability defect; keeping it
 * in the footer leaves the disclosure holding exactly the optional things.
 *
 * The task field appears only once a runnable agent is chosen, and is required
 * from that point on. An agent spawned with nothing to do would exit having
 * done nothing, which is the silent no-op the picker exists to prevent.
 */
export class NewAgentSessionForm extends React.Component<
  INewAgentSessionFormProps,
  INewAgentSessionFormState
> {
  private readonly problemsId = 'new-agent-session-problems'

  public constructor(props: INewAgentSessionFormProps) {
    super(props)
    this.state = {
      name: '',
      baseBranch: props.defaultBaseBranch,
      agent: 'none',
      prompt: '',
      isOptionsExpanded: false,
    }
  }

  private get request(): INewAgentSessionRequest {
    return {
      name: this.state.name,
      baseBranch: this.state.baseBranch,
      agent: this.state.agent,
      prompt: this.state.prompt,
    }
  }

  private get problems(): ReadonlyArray<INewAgentSessionProblem> {
    return validateNewAgentSession(this.request, {
      existingWorktreeNames: this.props.existingWorktreeNames,
      existingBranchNames: this.props.existingBranchNames,
      availableBaseBranches: this.props.baseBranches,
      selectableAgentIds: getSelectableCodingAgentIds(this.props.availability),
    })
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private onBaseBranchChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({ baseBranch: event.currentTarget.value })
  }

  private onAgentChanged = (agent: CodingAgentId) => {
    this.setState({ agent })
  }

  private onPromptChanged = (prompt: string) => {
    this.setState({ prompt })
  }

  private onToggleOptions = () => {
    this.setState(previous => ({
      isOptionsExpanded: !previous.isOptionsExpanded,
    }))
  }

  private onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (this.props.isStarting || this.problems.length > 0) {
      return
    }
    this.props.onStart(this.request)
  }

  private renderProblems(problems: ReadonlyArray<INewAgentSessionProblem>) {
    // A blank name is the form's resting state, not a mistake the user made,
    // so it never gets shouted at them before they have typed anything.
    const shown = problems.filter(problem => problem.kind !== 'name-empty')

    return (
      <div
        className="new-agent-session-problems"
        id={this.problemsId}
        role="status"
      >
        {shown.map(problem => (
          <p key={problem.kind}>{problem.message}</p>
        ))}
      </div>
    )
  }

  private renderOptions() {
    const { isOptionsExpanded } = this.state

    return (
      <div className="new-agent-session-options">
        <button
          type="button"
          className="new-agent-session-options-toggle"
          aria-expanded={isOptionsExpanded}
          aria-controls="new-agent-session-options-panel"
          onClick={this.onToggleOptions}
        >
          <MaterialSymbol
            className="new-agent-session-options-chevron"
            name="expand_more"
            size={18}
          />
          Options
        </button>
        <div
          id="new-agent-session-options-panel"
          className="new-agent-session-options-panel"
          hidden={!isOptionsExpanded}
        >
          <Select
            label="Base branch"
            value={this.state.baseBranch}
            onChange={this.onBaseBranchChanged}
            disabled={this.props.isStarting}
          >
            {this.props.baseBranches.map(branch => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </Select>
          <CodingAgentPicker
            value={this.state.agent}
            availability={this.props.availability}
            onChange={this.onAgentChanged}
            disabled={this.props.isStarting}
          />
          {this.state.agent !== 'none' && (
            <TextArea
              label="Task for the agent"
              placeholder="What should the agent do in this worktree?"
              rows={4}
              value={this.state.prompt}
              onValueChanged={this.onPromptChanged}
              disabled={this.props.isStarting}
              ariaDescribedBy={this.problemsId}
            />
          )}
          <LinkButton
            className="new-agent-session-setup-link"
            onClick={this.props.onConfigureSetupCommands}
            disabled={this.props.onConfigureSetupCommands === undefined}
            title={
              this.props.onConfigureSetupCommands === undefined
                ? 'Setup commands cannot be configured from this panel yet.'
                : undefined
            }
          >
            Configure setup commands
          </LinkButton>
        </div>
      </div>
    )
  }

  public render() {
    const problems = this.problems
    const hasNameProblem = problems.some(problem =>
      problem.kind.startsWith('name-')
    )

    return (
      <form className="new-agent-session-form" onSubmit={this.onSubmit}>
        <TextBox
          label="Worktree name"
          placeholder="new-worktree"
          value={this.state.name}
          onValueChanged={this.onNameChanged}
          disabled={this.props.isStarting}
          ariaDescribedBy={this.problemsId}
          ariaInvalid={hasNameProblem && this.state.name.trim().length > 0}
          displayInvalidState={
            hasNameProblem && this.state.name.trim().length > 0
          }
        />
        {this.renderOptions()}
        {this.renderProblems(problems)}
        <div className="new-agent-session-actions">
          <Button
            onClick={this.props.onCancel}
            disabled={this.props.isStarting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="new-agent-session-start"
            disabled={this.props.isStarting || problems.length > 0}
          >
            Start
          </Button>
        </div>
      </form>
    )
  }
}
