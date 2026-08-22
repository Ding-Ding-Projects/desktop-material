import * as React from 'react'
import { randomUUID } from 'crypto'

import { Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter, DialogError } from '../dialog'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { SearchableSelect } from '../lib/searchable-select'
import { TextBox } from '../lib/text-box'
import { LinkButton } from '../lib/link-button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { FilterMode } from '../../lib/fuzzy-find'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import {
  filterActionsLocalRunLog,
  IActionsLocalRunLogFilterResult,
} from './actions-local-run-log-filter'
import {
  detectActionsLocalTools,
  installActionsLocalAct,
  listActionsWorkflows,
  startActionsLocalRun,
  cancelActionsLocalRun,
  onActionsLocalRunLog,
  onActionsLocalRunState,
} from '../main-process-proxy'
import {
  ActionsLocalRunPhase,
  IActionsLocalToolAvailability,
  IActionsWorkflow,
  IActionsWorkflowInput,
  IActionsLocalRunLogEvent,
  IActionsLocalRunStateEvent,
  ActionsLocalRunTerminalPhases,
} from '../../lib/actions-local-run/types'
import { t, LanguageModeChangedEvent } from '../../lib/i18n'

/** The URLs surfaced when the local-run toolchain is missing. */
const ActInstallDocsUrl = 'https://nektosact.com/installation/index.html'
const DockerInstallUrl = 'https://docs.docker.com/get-docker/'

/** Max lines kept in the streamed output buffer. */
const MaxLogLines = 5000

/** localStorage id used to persist the run-output filter mode. */
const LogFilterListId = 'actions-local-run-log'

interface IActionsLocalRunDialogProps {
  readonly repository: Repository
  readonly onDismissed: () => void
}

interface ILogLine {
  readonly stream: IActionsLocalRunLogEvent['stream']
  readonly text: string
}

interface IActionsLocalRunDialogState {
  readonly tools: IActionsLocalToolAvailability | null
  readonly workflows: ReadonlyArray<IActionsWorkflow> | null
  readonly selectedWorkflowPath: string | null
  readonly selectedEvent: string
  readonly selectedJob: string
  readonly inputValues: Record<string, string>
  readonly secrets: ReadonlyArray<{
    readonly name: string
    readonly value: string
  }>
  readonly dryRun: boolean
  readonly logLines: ReadonlyArray<ILogLine>
  readonly phase: ActionsLocalRunPhase | 'idle'
  readonly activeRunId: string | null
  readonly stopping: boolean
  readonly error: string | null
  readonly logFilter: string
  readonly logFilterMode: FilterMode
  readonly logFilterCaseSensitive: boolean
  /** True while act is being downloaded and installed for the user. */
  readonly installingAct: boolean
  /** Why the automatic act install failed, or null while it is fine. */
  readonly actInstallError: string | null
}

interface IActionsLocalRunInputRowProps {
  readonly input: IActionsWorkflowInput
  readonly value: string
  readonly onChange: (name: string, value: string) => void
}

/**
 * One `workflow_dispatch` input field; binds its own change handler so no
 * arrow function is created in the parent's JSX.
 */
class ActionsLocalRunInputRow extends React.Component<IActionsLocalRunInputRowProps> {
  private onValueChanged = (value: string) =>
    this.props.onChange(this.props.input.name, value)

  public render() {
    const { input, value } = this.props
    const label = input.description !== null ? input.description : input.name
    return (
      <TextBox
        label={
          input.required
            ? `${label} (${t('actionsLocalRun.inputRequired')})`
            : label
        }
        placeholder={input.name}
        value={value}
        onValueChanged={this.onValueChanged}
      />
    )
  }
}

interface IActionsLocalRunSecretRowProps {
  readonly index: number
  readonly name: string
  readonly value: string
  readonly onNameChange: (index: number, name: string) => void
  readonly onValueChange: (index: number, value: string) => void
  readonly onRemove: (index: number) => void
}

/** One secret name/value row with a remove button; binds its own handlers. */
class ActionsLocalRunSecretRow extends React.Component<IActionsLocalRunSecretRowProps> {
  private onNameChanged = (name: string) =>
    this.props.onNameChange(this.props.index, name)
  private onValueChanged = (value: string) =>
    this.props.onValueChange(this.props.index, value)
  private onRemove = () => this.props.onRemove(this.props.index)

  public render() {
    return (
      <div className="actions-local-run-secret-row">
        <TextBox
          placeholder={t('actionsLocalRun.secretNamePlaceholder')}
          ariaLabel={t('actionsLocalRun.secretNamePlaceholder')}
          value={this.props.name}
          onValueChanged={this.onNameChanged}
        />
        <TextBox
          type="password"
          placeholder={t('actionsLocalRun.secretValuePlaceholder')}
          ariaLabel={t('actionsLocalRun.secretValuePlaceholder')}
          value={this.props.value}
          onValueChanged={this.onValueChanged}
        />
        <Button
          ariaLabel={t('actionsLocalRun.removeSecret')}
          onClick={this.onRemove}
        >
          <Octicon symbol={octicons.trash} />
        </Button>
      </div>
    )
  }
}

/**
 * Self-contained dialog for the Local GitHub Actions runner.
 *
 * It probes the host for `act`/Docker, lists and parses the repository's
 * workflows, collects the event/job/inputs/secrets, and streams a run's output
 * over IPC. All user-facing copy flows through i18n (English / Cantonese /
 * bilingual); the destructive/guarded and error text stays clear in every mode.
 * The dialog talks to the main process directly via the proxy — no store or
 * dispatcher wiring — so it stays entirely local to this popup.
 */
export class ActionsLocalRunDialog extends React.Component<
  IActionsLocalRunDialogProps,
  IActionsLocalRunDialogState
> {
  private mounted = false
  private disposeLog: (() => void) | null = null
  private disposeState: (() => void) | null = null
  private logEndRef: HTMLDivElement | null = null

  public constructor(props: IActionsLocalRunDialogProps) {
    super(props)
    this.state = {
      tools: null,
      workflows: null,
      selectedWorkflowPath: null,
      selectedEvent: '',
      selectedJob: '',
      inputValues: {},
      secrets: [],
      dryRun: false,
      logLines: [],
      phase: 'idle',
      activeRunId: null,
      stopping: false,
      error: null,
      logFilter: '',
      logFilterMode: readPersistedFilterMode(LogFilterListId),
      logFilterCaseSensitive: false,
      installingAct: false,
      actInstallError: null,
    }
  }

  public componentDidMount() {
    this.mounted = true
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.disposeLog = onActionsLocalRunLog(this.onRunLog)
    this.disposeState = onActionsLocalRunState(this.onRunState)
    void this.detect()
    void this.loadWorkflows()
  }

  public componentWillUnmount() {
    this.mounted = false
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.disposeLog?.()
    this.disposeState?.()
    // A run keeps going in the main process if the dialog is closed; cancel it
    // so a discarded run does not linger.
    if (this.state.activeRunId !== null) {
      void cancelActionsLocalRun(this.state.activeRunId)
    }
  }

  private onLanguageModeChanged = () => {
    // Copy is read live from `t()`, so a re-render is all that is needed.
    this.forceUpdate()
  }

  private async detect() {
    try {
      const tools = await detectActionsLocalTools()
      if (this.mounted) {
        this.setState({ tools })
        // Missing act is a solved problem, so solve it rather than reporting
        // it. Only when the user has not already failed an install this
        // session — retrying the same failing download on every probe would
        // replace one dead end with a louder one.
        if (!tools.actAvailable && this.state.actInstallError === null) {
          void this.installActAutomatically()
        }
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({
          tools: {
            actAvailable: false,
            actPath: null,
            actVersion: null,
            dockerAvailable: false,
            dockerPath: null,
            runnable: false,
          },
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private async loadWorkflows() {
    try {
      const workflows = await listActionsWorkflows(this.props.repository.path)
      if (!this.mounted) {
        return
      }
      const first = workflows.find(w => w.events.length > 0) ?? workflows[0]
      this.setState({ workflows })
      if (first !== undefined) {
        this.selectWorkflow(first.relativePath, workflows)
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({
          workflows: [],
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private selectWorkflow(
    relativePath: string,
    workflows: ReadonlyArray<IActionsWorkflow> = this.state.workflows ?? []
  ) {
    const workflow = workflows.find(w => w.relativePath === relativePath)
    const selectedEvent = workflow?.events[0] ?? 'push'
    this.setState({
      selectedWorkflowPath: relativePath,
      selectedEvent,
      selectedJob: '',
      inputValues: {},
    })
  }

  private getSelectedWorkflow(): IActionsWorkflow | null {
    const { workflows, selectedWorkflowPath } = this.state
    if (workflows === null || selectedWorkflowPath === null) {
      return null
    }
    return workflows.find(w => w.relativePath === selectedWorkflowPath) ?? null
  }

  private onRunLog = (
    _event: Electron.IpcRendererEvent,
    log: IActionsLocalRunLogEvent
  ) => {
    if (log.runId !== this.state.activeRunId) {
      return
    }
    this.setState(prev => {
      const next = [...prev.logLines, { stream: log.stream, text: log.text }]
      if (next.length > MaxLogLines) {
        next.splice(0, next.length - MaxLogLines)
      }
      return { logLines: next }
    }, this.scrollLogToBottom)
  }

  private onRunState = (
    _event: Electron.IpcRendererEvent,
    state: IActionsLocalRunStateEvent
  ) => {
    if (state.runId !== this.state.activeRunId) {
      return
    }
    const isTerminal = ActionsLocalRunTerminalPhases.has(state.phase)
    this.setState({
      phase: state.phase,
      activeRunId: isTerminal ? null : state.runId,
      stopping: isTerminal ? false : this.state.stopping,
    })
  }

  private onLogFilterChanged = (logFilter: string) => {
    this.setState({ logFilter })
  }

  private onLogFilterModeChanged = (logFilterMode: FilterMode) => {
    persistFilterMode(LogFilterListId, logFilterMode)
    this.setState({ logFilterMode })
  }

  private onLogFilterCaseSensitiveChanged = (
    logFilterCaseSensitive: boolean
  ) => {
    this.setState({ logFilterCaseSensitive })
  }

  private onLogFilterPatternApply = (logFilter: string) => {
    this.setState({ logFilter })
  }

  private getLogFilterSampleItems = (): ReadonlyArray<string> =>
    this.state.logLines.slice(-50).map(line => line.text)

  private scrollLogToBottom = () => {
    this.logEndRef?.scrollIntoView({ block: 'end' })
  }

  private setLogEndRef = (ref: HTMLDivElement | null) => {
    this.logEndRef = ref
  }

  // The searchable listbox reports the chosen value rather than a DOM event,
  // since the option that was picked may have been reached by keyboard from a
  // filtered list and there is no <select> element to read it back off.
  private onWorkflowSelected = (value: string) => {
    this.selectWorkflow(value)
  }

  private onEventSelected = (value: string) => {
    this.setState({ selectedEvent: value })
  }

  private onJobSelected = (value: string) => {
    this.setState({ selectedJob: value })
  }

  private onDryRunChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ dryRun: event.currentTarget.checked })
  }

  private onInputChanged = (name: string, value: string) => {
    this.setState(prev => ({
      inputValues: { ...prev.inputValues, [name]: value },
    }))
  }

  private onAddSecret = () => {
    this.setState(prev => ({
      secrets: [...prev.secrets, { name: '', value: '' }],
    }))
  }

  private onSecretNameChanged = (index: number, name: string) => {
    this.setState(prev => ({
      secrets: prev.secrets.map((s, i) => (i === index ? { ...s, name } : s)),
    }))
  }

  private onSecretValueChanged = (index: number, value: string) => {
    this.setState(prev => ({
      secrets: prev.secrets.map((s, i) => (i === index ? { ...s, value } : s)),
    }))
  }

  private onRemoveSecret = (index: number) => {
    this.setState(prev => ({
      secrets: prev.secrets.filter((_s, i) => i !== index),
    }))
  }

  private canRun(): boolean {
    return (
      this.state.tools?.runnable === true &&
      this.getSelectedWorkflow() !== null &&
      this.state.selectedEvent.length > 0 &&
      this.state.activeRunId === null
    )
  }

  private startRun = (dryRun: boolean) => {
    const workflow = this.getSelectedWorkflow()
    const tools = this.state.tools
    if (workflow === null || tools?.actPath == null) {
      return
    }

    const inputs = Object.entries(this.state.inputValues)
      .filter(([, value]) => value.length > 0)
      .map(([name, value]) => ({ name, value }))
    const secrets = this.state.secrets.filter(s => s.name.trim().length > 0)

    const runId = randomUUID()
    this.setState({
      activeRunId: runId,
      phase: 'starting',
      logLines: [],
      error: null,
      stopping: false,
    })

    startActionsLocalRun({
      runId,
      repositoryId: this.props.repository.id,
      repositoryPath: this.props.repository.path,
      workflowRelativePath: workflow.relativePath,
      event: this.state.selectedEvent,
      job: this.state.selectedJob.length > 0 ? this.state.selectedJob : null,
      secrets,
      inputs,
      dryRun,
      actPath: tools.actPath,
    }).catch(error => {
      if (this.mounted) {
        this.setState({
          phase: 'failed',
          activeRunId: null,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  private onRun = () => this.startRun(false)
  private onDryRun = () => this.startRun(true)

  private onStop = () => {
    if (this.state.activeRunId === null) {
      return
    }
    this.setState({ stopping: true })
    void cancelActionsLocalRun(this.state.activeRunId)
  }

  private renderToolsBanner() {
    const tools = this.state.tools
    if (tools === null) {
      return (
        <div className="actions-local-run-status" role="status">
          {t('actionsLocalRun.checkingTools')}
        </div>
      )
    }
    if (tools.runnable) {
      return null
    }
    return (
      <div className="actions-local-run-tools-missing" role="alert">
        <strong>{t('actionsLocalRun.toolsMissingTitle')}</strong>
        <ul>
          {!tools.actAvailable && (
            <li>
              {this.state.installingAct
                ? t('actionsLocalRun.actInstalling')
                : this.state.actInstallError ??
                  t('actionsLocalRun.actInstallingAutomatically')}{' '}
              <LinkButton uri={ActInstallDocsUrl}>
                {t('actionsLocalRun.installActLink')}
              </LinkButton>
            </li>
          )}
          {!tools.dockerAvailable && (
            <li>
              {t('actionsLocalRun.dockerMissing')}{' '}
              <LinkButton uri={DockerInstallUrl}>
                {t('actionsLocalRun.installDockerLink')}
              </LinkButton>
            </li>
          )}
        </ul>
        <p>{t('actionsLocalRun.installHint')}</p>
        <Button onClick={this.onRetryDetection}>
          {t('actionsLocalRun.retryDetection')}
        </Button>
      </div>
    )
  }

  private onRetryDetection = () => {
    this.setState({ tools: null, actInstallError: null })
    void this.detect()
  }

  /**
   * Install `act` without being asked to.
   *
   * Docker is deliberately not installed for the user: it is a machine-wide
   * service install that wants elevation and, on Windows, a reboot. `act` is a
   * single binary that drops into the app's own data directory, so there is
   * nothing to consent to and nothing to undo — which is why one is automatic
   * and the other still links out.
   */
  private installActAutomatically = async () => {
    if (this.state.installingAct) {
      return
    }
    this.setState({ installingAct: true, actInstallError: null })
    try {
      const tools = await installActionsLocalAct()
      this.setState({ tools, installingAct: false })
    } catch (error) {
      this.setState({
        installingAct: false,
        // The install failed, so say why here rather than leaving the panel
        // claiming an install is in progress that has already stopped.
        actInstallError:
          error instanceof Error
            ? error.message
            : t('actionsLocalRun.actInstallFailed'),
      })
    }
  }

  private renderConfiguration() {
    const { workflows } = this.state
    if (workflows === null) {
      return null
    }
    if (workflows.length === 0) {
      return (
        <div className="actions-local-run-empty" role="status">
          {t('actionsLocalRun.noWorkflows')}
        </div>
      )
    }

    const workflow = this.getSelectedWorkflow()

    return (
      <div className="actions-local-run-config">
        <SearchableSelect
          label={t('actionsLocalRun.workflowLabel')}
          value={this.state.selectedWorkflowPath ?? ''}
          searchSurfaceId="actions-local-run-workflow"
          regexBuilderTarget="workflows"
          onChange={this.onWorkflowSelected}
          options={workflows.map(w => ({
            value: w.relativePath,
            label: w.name !== null ? `${w.name} (${w.fileName})` : w.fileName,
          }))}
        />

        {workflow !== null && this.renderWorkflowDetail(workflow)}
      </div>
    )
  }

  private renderWorkflowDetail(workflow: IActionsWorkflow) {
    const events =
      workflow.events.length > 0
        ? workflow.events
        : ['push', 'workflow_dispatch']

    return (
      <>
        {workflow.parseError !== null && (
          <div className="actions-local-run-parse-error" role="status">
            {t('actionsLocalRun.parseErrorPrefix')}
            {workflow.parseError}
          </div>
        )}

        <SearchableSelect
          label={t('actionsLocalRun.eventLabel')}
          value={this.state.selectedEvent}
          searchSurfaceId="actions-local-run-event"
          regexBuilderTarget="events"
          onChange={this.onEventSelected}
          options={events.map(e => ({ value: e, label: e }))}
        />

        {workflow.jobs.length > 0 && (
          <SearchableSelect
            label={t('actionsLocalRun.jobLabel')}
            value={this.state.selectedJob}
            searchSurfaceId="actions-local-run-job"
            regexBuilderTarget="jobs"
            onChange={this.onJobSelected}
            options={[
              { value: '', label: t('actionsLocalRun.allJobs') },
              ...workflow.jobs.map(j => ({
                value: j.id,
                label: j.name !== null ? `${j.name} (${j.id})` : j.id,
              })),
            ]}
          />
        )}

        {this.renderInputs(workflow)}
        {this.renderSecrets()}

        <Checkbox
          label={t('actionsLocalRun.dryRunLabel')}
          value={this.state.dryRun ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onDryRunChanged}
        />
        <p className="actions-local-run-help">
          {t('actionsLocalRun.dryRunHelp')}
        </p>

        {workflow.releaseUploadSteps.length > 0 &&
          this.renderReleaseUploadNotice()}
      </>
    )
  }

  private renderInputs(workflow: IActionsWorkflow) {
    if (
      this.state.selectedEvent !== 'workflow_dispatch' ||
      workflow.dispatchInputs.length === 0
    ) {
      return null
    }
    return (
      <div className="actions-local-run-inputs">
        <h3>{t('actionsLocalRun.inputsHeading')}</h3>
        {workflow.dispatchInputs.map(input => (
          <ActionsLocalRunInputRow
            key={input.name}
            input={input}
            value={
              this.state.inputValues[input.name] ?? input.defaultValue ?? ''
            }
            onChange={this.onInputChanged}
          />
        ))}
      </div>
    )
  }

  private renderSecrets() {
    return (
      <div className="actions-local-run-secrets">
        <h3>{t('actionsLocalRun.secretsHeading')}</h3>
        <p className="actions-local-run-help">
          {t('actionsLocalRun.secretsHint')}
        </p>
        {this.state.secrets.map((secret, index) => (
          <ActionsLocalRunSecretRow
            key={index}
            index={index}
            name={secret.name}
            value={secret.value}
            onNameChange={this.onSecretNameChanged}
            onValueChange={this.onSecretValueChanged}
            onRemove={this.onRemoveSecret}
          />
        ))}
        <Button onClick={this.onAddSecret}>
          {t('actionsLocalRun.addSecret')}
        </Button>
      </div>
    )
  }

  private renderReleaseUploadNotice() {
    return (
      <div className="actions-local-run-release-upload" role="note">
        <strong>{t('actionsLocalRun.releaseUploadHeading')}</strong>
        <p>{t('actionsLocalRun.releaseUploadNote')}</p>
        <p>{t('actionsLocalRun.releaseUploadWarning')}</p>
      </div>
    )
  }

  private statusText(): string | null {
    switch (this.state.phase) {
      case 'starting':
        return t('actionsLocalRun.statusStarting')
      case 'running':
        return t('actionsLocalRun.statusRunning')
      case 'succeeded':
        return t('actionsLocalRun.statusSucceeded')
      case 'failed':
        return t('actionsLocalRun.statusFailed')
      case 'cancelled':
        return t('actionsLocalRun.statusCancelled')
      default:
        return null
    }
  }

  private renderLogFilter(result: IActionsLocalRunLogFilterResult<ILogLine>) {
    const matchStatus =
      result.regexError !== null
        ? result.regexError
        : result.active
        ? result.matchCount === 0
          ? t('actionsLocalRun.filterStatusNone')
          : t('actionsLocalRun.filterStatusCount', {
              matched: result.matchCount.toLocaleString(),
              total: result.totalCount.toLocaleString(),
            })
        : ''

    return (
      <div className="actions-local-run-log-search">
        <TextBox
          type="search"
          searchSurfaceId="actions-local-run-log"
          className="actions-local-run-log-filter-input"
          value={this.state.logFilter}
          onValueChanged={this.onLogFilterChanged}
          placeholder={t('actionsLocalRun.filterPlaceholder')}
          ariaLabel={t('actionsLocalRun.filterLabel')}
        />
        <FilterModeControl
          searchSurfaceId="actions-local-run-log"
          mode={this.state.logFilterMode}
          caseSensitive={this.state.logFilterCaseSensitive}
          onModeChange={this.onLogFilterModeChanged}
          onCaseSensitiveChange={this.onLogFilterCaseSensitiveChanged}
          regexBuilderTarget={t('actionsLocalRun.filterRegexTarget')}
          getSampleItems={this.getLogFilterSampleItems}
          filterText={this.state.logFilter}
          onRegexPatternApply={this.onLogFilterPatternApply}
        />
        <span
          className="actions-local-run-log-match"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {matchStatus}
        </span>
      </div>
    )
  }

  private renderOutput() {
    if (this.state.logLines.length === 0 && this.state.phase === 'idle') {
      return null
    }
    const status = this.statusText()
    const filterResult = filterActionsLocalRunLog(
      this.state.logLines,
      this.state.logFilter,
      this.state.logFilterMode,
      this.state.logFilterCaseSensitive
    )
    return (
      <div className="actions-local-run-output-wrapper">
        {status !== null && (
          <div className="actions-local-run-run-status" role="status">
            {status}
          </div>
        )}
        {this.renderLogFilter(filterResult)}
        <div
          className="actions-local-run-output"
          role="log"
          aria-label={t('actionsLocalRun.logRegionLabel')}
          aria-live="polite"
        >
          {filterResult.lines.map((line, index) => (
            <div
              key={index}
              className={`actions-local-run-line stream-${line.stream}`}
            >
              {line.text}
            </div>
          ))}
          <div ref={this.setLogEndRef} />
        </div>
      </div>
    )
  }

  public render() {
    const running = this.state.activeRunId !== null

    return (
      <Dialog
        id="actions-local-run"
        className="actions-local-run-dialog"
        title={t('actionsLocalRun.dialogTitle')}
        onDismissed={this.props.onDismissed}
        dismissDisabled={false}
      >
        {this.state.error !== null && (
          <DialogError>{this.state.error}</DialogError>
        )}
        <DialogContent>
          <p className="actions-local-run-subtitle">
            {t('actionsLocalRun.subtitle')}
          </p>
          {this.renderToolsBanner()}
          {this.renderConfiguration()}
          {this.renderOutput()}
        </DialogContent>
        <DialogFooter>
          <div className="button-group">
            <Button onClick={this.props.onDismissed}>
              {t('actionsLocalRun.closeButton')}
            </Button>
            {running ? (
              <Button
                onClick={this.onStop}
                disabled={this.state.stopping}
                type="button"
              >
                {this.state.stopping
                  ? t('actionsLocalRun.stoppingButton')
                  : t('actionsLocalRun.stopButton')}
              </Button>
            ) : (
              <>
                <Button onClick={this.onDryRun} disabled={!this.canRun()}>
                  {t('actionsLocalRun.dryRunButton')}
                </Button>
                <Button
                  type="submit"
                  onClick={this.onRun}
                  disabled={!this.canRun()}
                >
                  {t('actionsLocalRun.runButton')}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </Dialog>
    )
  }
}
