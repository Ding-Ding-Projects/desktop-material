import * as React from 'react'

import {
  CodingAgentId,
  INewAgentSessionRequest,
} from '../../models/agent-session'
import {
  IAgentRunnerAvailability,
  IAgentSetupCommand,
  INewAgentSessionProblem,
  getSelectableCodingAgentIds,
  validateNewAgentSession,
} from '../../lib/agent-sessions'
import { Button } from '../lib/button'
import { MaterialSymbol } from '../lib/material-symbol'
import { Select } from '../lib/select'
import { TextArea } from '../lib/text-area'
import { TextBox } from '../lib/text-box'
import { CodingAgentPicker } from './coding-agent-picker'
import { LanguageModeChangedEvent, t } from '../../lib/i18n'
import { localizeAgentSessionProblem } from './agent-session-localization'
import { AgentSetupCommandsEditor } from './agent-setup-commands-editor'

export interface IAgentSetupRetry {
  readonly name: string
  readonly baseBranch: string
  readonly skippedCommandCount: number
}

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
  readonly onStart: (
    request: INewAgentSessionRequest,
    setupCommands: ReadonlyArray<IAgentSetupCommand>,
    restartSetup: boolean
  ) => void
  readonly onCancel: () => void
  /** Reviewed setup commands persisted for this form's exact repository. */
  readonly setupCommands: ReadonlyArray<IAgentSetupCommand>
  /** False when this repository's setup document could not be read safely. */
  readonly setupCommandsAvailable: boolean
  readonly onSaveSetupCommands: (
    commands: ReadonlyArray<IAgentSetupCommand>
  ) => boolean
  readonly canCancelStart: boolean
  readonly onCancelStart: () => void
  readonly retryableSetups: ReadonlyArray<IAgentSetupRetry>
  /** Render the fields inside the shared Dialog form instead of a nested form. */
  readonly insideDialog?: boolean
}

interface INewAgentSessionFormState {
  readonly name: string
  readonly baseBranch: string
  readonly agent: CodingAgentId
  readonly prompt: string
  readonly isOptionsExpanded: boolean
  readonly isSetupEditorOpen: boolean
  readonly restartSetup: boolean
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
  private setupButton: HTMLButtonElement | null = null

  public constructor(props: INewAgentSessionFormProps) {
    super(props)
    this.state = {
      name: '',
      baseBranch: props.defaultBaseBranch,
      agent: 'none',
      prompt: '',
      isOptionsExpanded: false,
      isSetupEditorOpen: false,
      restartSetup: false,
    }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount() {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = () => this.forceUpdate()

  private onSetupButtonRef = (button: HTMLButtonElement | null) => {
    this.setupButton = button
  }

  private get request(): INewAgentSessionRequest {
    return {
      name: this.state.name,
      baseBranch: this.state.baseBranch,
      agent: this.state.agent,
      prompt: this.state.prompt,
    }
  }

  private retryForName(name: string): IAgentSetupRetry | null {
    const trimmed = name.trim()
    return (
      this.props.retryableSetups.find(
        candidate => candidate.name === trimmed
      ) ?? null
    )
  }

  private get retryCandidate(): IAgentSetupRetry | null {
    return this.retryForName(this.state.name)
  }

  private get isExactRetry(): boolean {
    const retry = this.retryCandidate
    return retry !== null && this.state.baseBranch === retry.baseBranch
  }

  private get availableBaseBranches(): ReadonlyArray<string> {
    const retry = this.retryCandidate
    return retry !== null && !this.props.baseBranches.includes(retry.baseBranch)
      ? [retry.baseBranch, ...this.props.baseBranches]
      : this.props.baseBranches
  }

  private get problems(): ReadonlyArray<INewAgentSessionProblem> {
    const retry = this.retryCandidate
    const isRetry = this.isExactRetry
    return validateNewAgentSession(this.request, {
      existingWorktreeNames: isRetry
        ? this.props.existingWorktreeNames.filter(name => name !== retry?.name)
        : this.props.existingWorktreeNames,
      existingBranchNames: isRetry
        ? this.props.existingBranchNames.filter(name => name !== retry?.name)
        : this.props.existingBranchNames,
      availableBaseBranches: this.availableBaseBranches,
      selectableAgentIds: getSelectableCodingAgentIds(this.props.availability),
    })
  }

  private onNameChanged = (name: string) => {
    const retry = this.retryForName(name)
    this.setState(previous => ({
      name,
      baseBranch:
        retry?.baseBranch ??
        (this.props.baseBranches.includes(previous.baseBranch)
          ? previous.baseBranch
          : this.props.defaultBaseBranch),
      restartSetup: false,
    }))
  }

  private onBaseBranchChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({
      baseBranch: event.currentTarget.value,
      restartSetup: false,
    })
  }

  private onRestartSetupChanged = (event: React.FormEvent<HTMLInputElement>) =>
    this.setState({ restartSetup: event.currentTarget.checked })

  private onAgentChanged = (agent: CodingAgentId) => {
    this.setState({ agent })
  }

  private onPromptChanged = (prompt: string) => {
    this.setState({ prompt })
  }

  private onToggleOptions = () => {
    this.setState(previous => ({
      isOptionsExpanded: !previous.isOptionsExpanded,
      isSetupEditorOpen: previous.isOptionsExpanded
        ? false
        : previous.isSetupEditorOpen,
    }))
  }

  private onOpenSetupEditor = () => {
    this.setState({ isSetupEditorOpen: true })
  }

  private onCloseSetupEditor = () => {
    this.setState({ isSetupEditorOpen: false }, () => this.setupButton?.focus())
  }

  private onSaveSetupCommands = (
    commands: ReadonlyArray<IAgentSetupCommand>
  ): boolean => {
    const saved = this.props.onSaveSetupCommands(commands)
    if (saved) {
      this.onCloseSetupEditor()
    }
    return saved
  }

  public submit = () => {
    if (
      this.props.isStarting ||
      this.state.isSetupEditorOpen ||
      !this.props.setupCommandsAvailable ||
      this.problems.length > 0
    ) {
      return
    }
    this.props.onStart(
      this.request,
      this.props.setupCommands.map(command => ({
        enabled: command.enabled,
        executable: command.executable,
        args: [...command.args],
      })),
      this.state.restartSetup
    )
  }

  private onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    this.submit()
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
          <p key={problem.kind}>
            {localizeAgentSessionProblem(problem, this.request)}
          </p>
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
          disabled={this.props.isStarting}
        >
          <MaterialSymbol
            className="new-agent-session-options-chevron"
            name="expand_more"
            size={18}
          />
          {t('agentSessions.options')}
        </button>
        <div
          id="new-agent-session-options-panel"
          className="new-agent-session-options-panel"
          hidden={!isOptionsExpanded}
        >
          <Select
            label={t('agentSessions.baseBranch')}
            value={this.state.baseBranch}
            onChange={this.onBaseBranchChanged}
            disabled={this.props.isStarting}
          >
            {this.availableBaseBranches.map(branch => (
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
              label={t('agentSessions.taskLabel')}
              placeholder={t('agentSessions.taskPlaceholder')}
              rows={4}
              value={this.state.prompt}
              onValueChanged={this.onPromptChanged}
              disabled={this.props.isStarting}
              ariaDescribedBy={this.problemsId}
            />
          )}
          <Button
            className="new-agent-session-setup-link"
            dataVerification="agent-setup-configure"
            onClick={this.onOpenSetupEditor}
            onButtonRef={this.onSetupButtonRef}
            ariaExpanded={this.state.isSetupEditorOpen}
            ariaControls="agent-setup-commands-editor"
            disabled={
              this.props.isStarting || !this.props.setupCommandsAvailable
            }
          >
            {t('agentSessions.configureSetup')}
            <span className="new-agent-session-setup-count">
              {!this.props.setupCommandsAvailable
                ? t('agentSessions.setup.count.unavailable')
                : this.props.setupCommands.length === 0
                ? t('agentSessions.setup.count.none')
                : this.props.setupCommands.length === 1
                ? t('agentSessions.setup.count.one')
                : t('agentSessions.setup.count.some', {
                    count: String(this.props.setupCommands.length),
                  })}
            </span>
          </Button>
          {this.state.isSetupEditorOpen &&
            this.props.setupCommandsAvailable && (
              <AgentSetupCommandsEditor
                commands={this.props.setupCommands}
                onSave={this.onSaveSetupCommands}
                onCancel={this.onCloseSetupEditor}
              />
            )}
        </div>
      </div>
    )
  }

  private renderSetupStatus() {
    if (!this.props.setupCommandsAvailable) {
      return (
        <p className="new-agent-session-setup-status" role="status">
          {t('agentSessions.setup.unavailable')}
        </p>
      )
    }

    const retry = this.retryCandidate
    if (retry === null || !this.isExactRetry) {
      return null
    }
    const plan = this.state.restartSetup
      ? t('agentSessions.setup.retryPlan.restart')
      : retry.skippedCommandCount === 0
      ? t('agentSessions.setup.retryPlan.all')
      : retry.skippedCommandCount === 1
      ? t('agentSessions.setup.retryPlan.one')
      : t('agentSessions.setup.retryPlan.some', {
          count: String(retry.skippedCommandCount),
        })

    return (
      <div className="new-agent-session-setup-status">
        <p role="status">{plan}</p>
        {retry.skippedCommandCount > 0 && (
          <label>
            <input
              type="checkbox"
              checked={this.state.restartSetup}
              onChange={this.onRestartSetupChanged}
              disabled={this.props.isStarting}
            />
            {t('agentSessions.setup.restart')}
          </label>
        )}
      </div>
    )
  }

  public render() {
    const problems = this.problems
    const hasNameProblem = problems.some(problem =>
      problem.kind.startsWith('name-')
    )

    const content = (
      <>
        <TextBox
          label={t('agentSessions.worktreeName')}
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
        {this.renderSetupStatus()}
        {this.renderProblems(problems)}
        <div className="new-agent-session-actions">
          <Button
            onClick={
              this.props.isStarting
                ? this.props.onCancelStart
                : this.props.onCancel
            }
            disabled={this.props.isStarting && !this.props.canCancelStart}
          >
            {this.props.isStarting
              ? t('agentSessions.setup.cancelRun')
              : t('agentSessions.cancel')}
          </Button>
          <Button
            type="submit"
            className="new-agent-session-start"
            disabled={
              this.props.isStarting ||
              this.state.isSetupEditorOpen ||
              !this.props.setupCommandsAvailable ||
              problems.length > 0
            }
          >
            {t('agentSessions.start')}
          </Button>
        </div>
      </>
    )

    return this.props.insideDialog ? (
      <div className="new-agent-session-form">{content}</div>
    ) : (
      <form className="new-agent-session-form" onSubmit={this.onSubmit}>
        {content}
      </form>
    )
  }
}
