/* eslint-disable react/jsx-no-bind -- controlled runner form callbacks */
/* eslint-disable react/no-unused-prop-types -- account credentials are forwarded to the manager */
import * as React from 'react'

import { API, IAPISelfHostedRunner } from '../../lib/api'
import * as ipcRenderer from '../../lib/ipc-renderer'
import {
  ISelfHostedRunner,
  ISelfHostedRunnerProgress,
  ISelfHostedRunnerStatus,
  SelfHostedRunnerPlatform,
} from '../../lib/self-hosted-runner/types'
import { Account, getAccountKey } from '../../models/account'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { AccountPicker } from '../account-picker'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { SelfHostedRunnerRemovalDialog } from './self-hosted-runner-removal-dialog'

interface ISelfHostedRunnerManagerProps {
  readonly repository: Repository
  readonly accounts?: ReadonlyArray<Account>
}

interface ISelfHostedRunnerManagerState {
  readonly status: ISelfHostedRunnerStatus | null
  readonly remoteRunners: ReadonlyArray<IAPISelfHostedRunner>
  readonly remoteRunnersError: string | null
  readonly setupPreflightStatus: 'checking' | 'safe' | 'unsafe' | 'unavailable'
  readonly setupPreflightDetail: string
  readonly setupPreflightScopeKey: string | null
  readonly workflowTrustAcknowledged: boolean
  readonly hostAccessAcknowledged: boolean
  readonly selectedAccountKey: string
  readonly platform: SelfHostedRunnerPlatform
  readonly runnerName: string
  readonly labels: string
  readonly selectedDistribution: string
  readonly createDedicatedWsl: boolean
  readonly baseDistribution: string
  readonly dedicatedDistribution: string
  readonly busy: boolean
  readonly activeOperationRunnerId: string | null
  readonly activeOperationKind: 'setup' | 'start' | 'remove' | null
  readonly activeOperationRunnerName: string
  readonly cancellationRequested: boolean
  readonly error: string | null
  readonly message: string | null
  readonly progress: ISelfHostedRunnerProgress | null
  readonly removeTarget: ISelfHostedRunner | null
  readonly removeSubmitting: boolean
  readonly removeError: Error | null
}

function repositoryKey(repository: Repository): string {
  const remote = repository.gitHubRepository
  return remote === null
    ? repository.path
    : `${remote.endpoint}/${remote.owner.login}/${remote.name}`
}

export function defaultSelfHostedRunnerLabel(
  repository: string,
  platform: SelfHostedRunnerPlatform
): string {
  const suffix = platform === 'windows' ? '-windows-local' : '-wsl-local'
  const repositoryPrefix = repository
    .toLocaleLowerCase()
    .slice(0, 64 - suffix.length)
  return `${repositoryPrefix}${suffix}`
}

function labelsForPlatform(
  value: string,
  repository: string,
  platform: SelfHostedRunnerPlatform
): string {
  const projectLabels = new Set([
    defaultSelfHostedRunnerLabel(repository, 'windows'),
    defaultSelfHostedRunnerLabel(repository, 'linux-wsl'),
  ])
  const labels = value
    .split(',')
    .map(label => label.trim())
    .filter(
      label => label.length > 0 && !projectLabels.has(label.toLowerCase())
    )
  labels.push(defaultSelfHostedRunnerLabel(repository, platform))
  return [...new Set(labels)].join(',')
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback
}

export class SelfHostedRunnerManager extends React.Component<
  ISelfHostedRunnerManagerProps,
  ISelfHostedRunnerManagerState
> {
  private lastRepositoryKey: string
  private refreshGeneration = 0
  private labelAuditTimeout: ReturnType<typeof setTimeout> | null = null
  private activeRemovalRunnerId: string | null = null

  public constructor(props: ISelfHostedRunnerManagerProps) {
    super(props)
    this.lastRepositoryKey = repositoryKey(props.repository)
    this.state = this.initialState(props)
  }

  private initialState(
    props: ISelfHostedRunnerManagerProps
  ): ISelfHostedRunnerManagerState {
    const remote = props.repository.gitHubRepository
    const accounts = this.githubAccounts(props)
    const account =
      accounts.find(
        candidate =>
          getAccountKey(candidate) === (props.repository.accountKey ?? '')
      ) ?? accounts.at(0)
    return {
      status: null,
      remoteRunners: [],
      remoteRunnersError: null,
      setupPreflightStatus: 'checking',
      setupPreflightDetail:
        "Waiting to check the current setup form's account and proposed labels.",
      setupPreflightScopeKey: null,
      workflowTrustAcknowledged: false,
      hostAccessAcknowledged: false,
      selectedAccountKey: account === undefined ? '' : getAccountKey(account),
      platform: 'windows',
      runnerName: `desktop-material-${
        process.arch === 'arm64' ? 'arm64' : 'x64'
      }`,
      labels: defaultSelfHostedRunnerLabel(
        remote?.name ?? 'repository',
        'windows'
      ),
      selectedDistribution: '',
      createDedicatedWsl: false,
      baseDistribution: '',
      dedicatedDistribution:
        remote === null ? 'desktop-material-runner' : `${remote.name}-runner`,
      busy: false,
      activeOperationRunnerId: null,
      activeOperationKind: null,
      activeOperationRunnerName: '',
      cancellationRequested: false,
      error: null,
      message: null,
      progress: null,
      removeTarget: null,
      removeSubmitting: false,
      removeError: null,
    }
  }

  private githubAccounts = (
    props: ISelfHostedRunnerManagerProps = this.props
  ): ReadonlyArray<Account> => {
    const endpoint = props.repository.gitHubRepository?.endpoint
    return (props.accounts ?? []).filter(
      account =>
        account.provider === 'github' &&
        account.token.length > 0 &&
        (endpoint === undefined || account.endpoint === endpoint)
    )
  }

  private selectedAccount(): Account | null {
    return (
      this.githubAccounts().find(
        account => getAccountKey(account) === this.state.selectedAccountKey
      ) ??
      this.githubAccounts().at(0) ??
      null
    )
  }

  private setDefaultDistro(status: ISelfHostedRunnerStatus) {
    const first = status.distributions.at(0) ?? ''
    this.setState(state => ({
      status,
      selectedDistribution:
        state.selectedDistribution.length > 0 &&
        status.distributions.includes(state.selectedDistribution)
          ? state.selectedDistribution
          : first,
      baseDistribution:
        state.baseDistribution.length > 0 &&
        status.distributions.includes(state.baseDistribution)
          ? state.baseDistribution
          : first,
    }))
  }

  public componentDidMount() {
    ipcRenderer.on('self-hosted-runner-progress', this.onProgress)
    void this.refresh()
  }

  public componentDidUpdate() {
    const nextKey = repositoryKey(this.props.repository)
    if (nextKey !== this.lastRepositoryKey) {
      this.refreshGeneration++
      this.lastRepositoryKey = nextKey
      this.setState(this.initialState(this.props), () => void this.refresh())
    }
  }

  public componentWillUnmount() {
    this.refreshGeneration++
    if (this.labelAuditTimeout !== null) {
      clearTimeout(this.labelAuditTimeout)
      this.labelAuditTimeout = null
    }
    ipcRenderer.removeListener('self-hosted-runner-progress', this.onProgress)
  }

  private setupPreflightLabels(): ReadonlyArray<string> {
    return [
      'self-hosted',
      ...this.state.labels
        .split(',')
        .map(label => label.trim())
        .filter(label => label.length > 0),
      this.state.platform === 'windows' ? 'Windows' : 'Linux',
      process.arch === 'arm64' ? 'ARM64' : 'X64',
    ]
  }

  private currentSetupPreflightScopeKey(
    account: Account | null = this.selectedAccount(),
    labels: ReadonlyArray<string> = this.setupPreflightLabels()
  ): string | null {
    const remote = this.props.repository.gitHubRepository
    return remote === null || account === null
      ? null
      : JSON.stringify([
          repositoryKey(this.props.repository),
          getAccountKey(account),
          labels,
        ])
  }

  private invalidateSetupPreflight = () => {
    this.refreshGeneration++
    this.setState({
      setupPreflightStatus: 'checking',
      setupPreflightDetail:
        "Waiting to check the current setup form's account and proposed labels.",
      setupPreflightScopeKey: null,
    })
  }

  private onLabelsChanged = (labels: string) => {
    this.invalidateSetupPreflight()
    this.setState({ labels }, this.scheduleWorkflowAuditRefresh)
  }

  private scheduleWorkflowAuditRefresh = () => {
    if (this.labelAuditTimeout !== null) {
      clearTimeout(this.labelAuditTimeout)
    }
    this.labelAuditTimeout = setTimeout(() => {
      this.labelAuditTimeout = null
      void this.refresh()
    }, 400)
  }

  private onProgress = (
    _event: Electron.IpcRendererEvent,
    progress: ISelfHostedRunnerProgress
  ) => {
    if (
      (this.state.busy &&
        progress.runnerId === this.state.activeOperationRunnerId) ||
      (this.state.removeSubmitting &&
        progress.runnerId === this.activeRemovalRunnerId)
    ) {
      this.setState({ progress })
      return
    }
    this.setState({
      error: progress.detail,
      progress: null,
    })
    void this.refresh()
  }

  private refresh = async () => {
    const generation = ++this.refreshGeneration
    const selectedRepositoryKey = repositoryKey(this.props.repository)
    const isCurrent = () =>
      generation === this.refreshGeneration &&
      selectedRepositoryKey === repositoryKey(this.props.repository)
    try {
      const remote = this.props.repository.gitHubRepository
      if (remote === null) {
        if (isCurrent()) {
          this.setState({
            status: null,
            remoteRunners: [],
            remoteRunnersError: null,
            setupPreflightStatus: 'unavailable',
            setupPreflightDetail:
              'Connect the repository before workflow safety can be checked.',
            setupPreflightScopeKey: null,
          })
        }
        return
      }
      const status = await ipcRenderer.invoke('get-self-hosted-runner-status', {
        owner: remote.owner.login,
        repository: remote.name,
      })
      if (!isCurrent()) {
        return
      }
      this.setDefaultDistro(status)
      const account = this.selectedAccount()
      if (account !== null) {
        const api = API.fromAccount(account)
        try {
          const runners = await api.fetchSelfHostedRunners(
            remote.owner.login,
            remote.name
          )
          if (isCurrent()) {
            this.setState({
              remoteRunners: runners.runners,
              remoteRunnersError: null,
            })
          }
        } catch (error) {
          if (isCurrent()) {
            this.setState({
              remoteRunners: [],
              remoteRunnersError: errorText(
                error,
                'GitHub runner inventory is unavailable. Setup will fail safely instead of replacing an existing runner.'
              ),
            })
          }
        }
        if (isCurrent()) {
          this.setState({
            setupPreflightStatus: 'checking',
            setupPreflightDetail: `The main process is checking the current setup form's account and proposed labels against ${
              remote.isPrivate === false
                ? 'public workflow triggers'
                : 'private-fork policy'
            }, one immutable workflow commit, and pending runner jobs.`,
            setupPreflightScopeKey: null,
          })
        }
        try {
          const runnerLabels = this.setupPreflightLabels()
          const preflightScopeKey = this.currentSetupPreflightScopeKey(
            account,
            runnerLabels
          )
          if (preflightScopeKey === null) {
            return
          }
          const audit = await ipcRenderer.invoke(
            'preflight-self-hosted-runner',
            {
              accountKey: getAccountKey(account),
              owner: remote.owner.login,
              repository: remote.name,
              githubApiEndpoint: account.endpoint,
              labels: runnerLabels,
            }
          )
          if (
            isCurrent() &&
            preflightScopeKey === this.currentSetupPreflightScopeKey()
          ) {
            this.setState(
              audit.ok
                ? {
                    setupPreflightStatus: 'safe',
                    setupPreflightDetail: `The main process proved ${
                      remote.isPrivate === false
                        ? 'public workflow triggers cannot reach the managed runner from an untrusted event'
                        : 'private-fork pull-request workflows are disabled'
                    } for the selected account and proposed labels ${runnerLabels.join(
                      ', '
                    )}, audited ${
                      audit.result.workflowCount
                    } workflow files at immutable commit ${audit.result.commitSHA.slice(
                      0,
                      12
                    )}, and found two stable queue snapshots with no pending job that can claim these labels.`,
                    setupPreflightScopeKey: preflightScopeKey,
                  }
                : {
                    setupPreflightStatus:
                      audit.code === 'workflow-trust-unsafe' ||
                      audit.code === 'runner-queued-job-blocked'
                        ? 'unsafe'
                        : 'unavailable',
                    setupPreflightDetail: audit.recovery,
                    setupPreflightScopeKey: null,
                  }
            )
          }
        } catch (error) {
          if (isCurrent()) {
            this.setState({
              setupPreflightStatus: 'unavailable',
              setupPreflightDetail: errorText(
                error,
                'The complete workflow inventory could not be read and parsed, so setup remains blocked.'
              ),
              setupPreflightScopeKey: null,
            })
          }
        }
      } else if (isCurrent()) {
        this.setState({
          remoteRunners: [],
          remoteRunnersError: null,
          setupPreflightStatus: 'unavailable',
          setupPreflightDetail:
            'Select a signed-in GitHub account before workflow safety can be checked.',
          setupPreflightScopeKey: null,
        })
      }
    } catch (error) {
      if (isCurrent()) {
        this.setState({
          error: errorText(
            error,
            'The runner manager could not load its status.'
          ),
        })
      }
    }
  }

  private onPlatformChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const platform = event.currentTarget.value as SelfHostedRunnerPlatform
    const repository =
      this.props.repository.gitHubRepository?.name ?? 'repository'
    this.invalidateSetupPreflight()
    this.setState(
      state => ({
        platform,
        labels: labelsForPlatform(state.labels, repository, platform),
      }),
      this.scheduleWorkflowAuditRefresh
    )
  }

  private onAccountChanged = (account: Account) => {
    if (this.labelAuditTimeout !== null) {
      clearTimeout(this.labelAuditTimeout)
      this.labelAuditTimeout = null
    }
    this.invalidateSetupPreflight()
    this.setState(
      { selectedAccountKey: getAccountKey(account) },
      () => void this.refresh()
    )
  }

  private setupBlockReason(): string | null {
    const remote = this.props.repository.gitHubRepository
    if (this.state.busy || this.state.removeSubmitting) {
      return 'Wait for the current runner operation to finish.'
    }
    if (remote === null || this.githubAccounts().length === 0) {
      return 'Connect the repository and select a signed-in GitHub account.'
    }
    if (remote.isPrivate !== true && remote.isPrivate !== false) {
      return 'Repository visibility is unknown; refresh the repository before setting up a runner.'
    }
    if (this.state.status?.supported !== true) {
      return 'Runner setup is available only in the Windows desktop app.'
    }
    if (
      this.state.setupPreflightStatus !== 'safe' ||
      this.state.setupPreflightScopeKey === null ||
      this.state.setupPreflightScopeKey !== this.currentSetupPreflightScopeKey()
    ) {
      return 'Wait for a complete safe setup-form preflight for the current account and proposed labels.'
    }
    if (
      !this.state.workflowTrustAcknowledged ||
      !this.state.hostAccessAcknowledged
    ) {
      return 'Acknowledge both self-hosted runner security boundaries before setup.'
    }
    if (
      this.state.runnerName.trim().length === 0 ||
      this.state.labels.trim().length === 0
    ) {
      return 'Enter a runner name and at least one label.'
    }
    if (
      this.state.remoteRunners.some(
        runner =>
          runner.name.toLocaleLowerCase() ===
          this.state.runnerName.trim().toLocaleLowerCase()
      )
    ) {
      return 'Choose a unique runner name; this app never replaces an existing runner.'
    }
    return null
  }

  private runnerStartBlockReason(): string | null {
    const remote = this.props.repository.gitHubRepository
    if (
      remote !== null &&
      remote.isPrivate !== true &&
      remote.isPrivate !== false
    ) {
      return 'Repository visibility is unknown; refresh the repository before starting a runner.'
    }
    if (
      !this.state.workflowTrustAcknowledged ||
      !this.state.hostAccessAcknowledged
    ) {
      return 'Acknowledge both self-hosted runner security boundaries before starting a runner.'
    }
    return null
  }

  private onSetup = async () => {
    const remote = this.props.repository.gitHubRepository
    const account = this.selectedAccount()
    const blockReason = this.setupBlockReason()
    if (remote === null || account === null || blockReason !== null) {
      if (blockReason !== null && !this.state.busy) {
        this.setState({ error: blockReason })
      }
      return
    }
    const labels = this.state.labels
      .split(',')
      .map(label => label.trim())
      .filter(label => label.length > 0)
    if (labels.length === 0) {
      this.setState({ error: 'Add at least one runner label.' })
      return
    }
    if (
      this.state.platform === 'linux-wsl' &&
      !this.state.createDedicatedWsl &&
      this.state.selectedDistribution.length === 0
    ) {
      this.setState({
        error: 'Choose an existing WSL distro or create a dedicated one.',
      })
      return
    }
    if (
      this.state.platform === 'linux-wsl' &&
      this.state.createDedicatedWsl &&
      (this.state.baseDistribution.length === 0 ||
        this.state.dedicatedDistribution.length === 0)
    ) {
      this.setState({
        error: 'Choose a base distro and a name for the dedicated WSL distro.',
      })
      return
    }

    const runnerId = crypto.randomUUID()
    this.setState({
      busy: true,
      activeOperationRunnerId: runnerId,
      activeOperationKind: 'setup',
      activeOperationRunnerName: this.state.runnerName,
      cancellationRequested: false,
      error: null,
      message: null,
      progress: null,
    })
    try {
      const reply = await ipcRenderer.invoke('setup-self-hosted-runner', {
        id: runnerId,
        accountKey: getAccountKey(account),
        owner: remote.owner.login,
        repository: remote.name,
        githubApiEndpoint: account.endpoint,
        name: this.state.runnerName,
        labels,
        platform: this.state.platform,
        ...(this.state.selectedDistribution.length === 0
          ? {}
          : { wslDistribution: this.state.selectedDistribution }),
        createDedicatedWsl: this.state.createDedicatedWsl,
        ...(this.state.baseDistribution.length === 0
          ? {}
          : { wslBaseDistribution: this.state.baseDistribution }),
        ...(this.state.dedicatedDistribution.length === 0
          ? {}
          : { dedicatedWslDistribution: this.state.dedicatedDistribution }),
        autoInstallDependencies: true,
      })
      if (!reply.ok) {
        throw new Error(reply.recovery)
      }
      this.setState({
        message:
          'Runner setup is complete. GitHub reports the exact runner online with the expected labels.',
      })
      await this.refresh()
    } catch (error) {
      this.setState({
        error: errorText(
          error,
          'Runner setup failed. Request a new token and retry.'
        ),
      })
      await this.refresh()
    } finally {
      this.setState({
        busy: false,
        activeOperationRunnerId: null,
        activeOperationKind: null,
        activeOperationRunnerName: '',
        cancellationRequested: false,
      })
    }
  }

  private cancelOperation = async () => {
    const runnerId = this.state.activeOperationRunnerId
    if (runnerId === null || this.state.cancellationRequested) {
      return
    }
    this.setState({ cancellationRequested: true })
    try {
      const accepted = await ipcRenderer.invoke(
        'cancel-self-hosted-runner-operation',
        runnerId
      )
      if (!accepted) {
        this.setState({
          error:
            'The runner operation already finished before cancellation reached it. Refreshing runner status.',
        })
      }
    } catch (error) {
      this.setState({
        cancellationRequested: false,
        error: errorText(
          error,
          'Cancellation could not be requested. Wait for the bounded runner operation to finish.'
        ),
      })
    }
  }

  private invokeControl = async (id: string, action: 'start' | 'stop') => {
    const remote = this.props.repository.gitHubRepository
    const startBlockReason =
      action === 'start' ? this.runnerStartBlockReason() : null
    if (this.state.busy || remote === null || startBlockReason !== null) {
      if (startBlockReason !== null && !this.state.busy) {
        this.setState({ error: startBlockReason })
      }
      return
    }
    const runnerName =
      this.state.status?.runners.find(runner => runner.id === id)?.name ?? id
    this.setState({
      busy: true,
      activeOperationRunnerId: action === 'start' ? id : null,
      activeOperationKind: action === 'start' ? 'start' : null,
      activeOperationRunnerName: action === 'start' ? runnerName : '',
      cancellationRequested: false,
      error: null,
      message: null,
    })
    try {
      const reply = await ipcRenderer.invoke(
        action === 'start'
          ? 'start-self-hosted-runner'
          : 'stop-self-hosted-runner',
        { id, owner: remote.owner.login, repository: remote.name }
      )
      if (!reply.ok) {
        throw new Error(reply.recovery)
      }
      this.setState({
        message: action === 'start' ? 'Runner started.' : 'Runner stopped.',
      })
      await this.refresh()
    } catch (error) {
      this.setState({ error: errorText(error, `Runner ${action} failed.`) })
    } finally {
      this.setState({
        busy: false,
        activeOperationRunnerId: null,
        activeOperationKind: null,
        activeOperationRunnerName: '',
        cancellationRequested: false,
      })
    }
  }

  private requestRemove = (runner: ISelfHostedRunner) => {
    if (this.state.removeSubmitting) {
      return
    }
    this.setState({ removeTarget: runner, removeError: null, progress: null })
  }

  private dismissRemove = () => {
    this.setState({ removeTarget: null, removeError: null, progress: null })
  }

  private confirmRemove = async () => {
    const remote = this.props.repository.gitHubRepository
    const account = this.selectedAccount()
    const target = this.state.removeTarget
    if (remote === null || account === null || target === null) {
      return
    }
    this.activeRemovalRunnerId = target.id
    this.setState({
      removeSubmitting: true,
      removeError: null,
      activeOperationRunnerId: target.id,
      activeOperationKind: 'remove',
      activeOperationRunnerName: target.name,
      cancellationRequested: false,
      progress: {
        runnerId: target.id,
        phase: 'removing-runner',
        detail: 'Requesting a removal token and unregistering the runner…',
      },
    })
    try {
      const reply = await ipcRenderer.invoke('remove-self-hosted-runner', {
        id: target.id,
        accountKey: target.accountKey ?? getAccountKey(account),
        owner: remote.owner.login,
        repository: remote.name,
        githubApiEndpoint: account.endpoint,
      })
      if (!reply.ok) {
        throw new Error(reply.recovery)
      }
      const warnings = reply.result.warnings
      this.setState({
        removeTarget: null,
        message:
          warnings.length === 0
            ? 'Runner removed from GitHub and its managed files were deleted.'
            : `Runner removed, but WSL cleanup needs attention: ${warnings.join(
                ' '
              )}`,
      })
      await this.refresh()
    } catch (error) {
      const message = errorText(
        error,
        'Runner removal failed. Request a new removal token and retry.'
      )
      if (this.state.removeTarget === null) {
        this.setState({ removeError: new Error(message), error: message })
      } else {
        this.setState({ removeError: new Error(message) })
      }
    } finally {
      this.activeRemovalRunnerId = null
      this.setState({
        removeSubmitting: false,
        activeOperationRunnerId: null,
        activeOperationKind: null,
        activeOperationRunnerName: '',
        cancellationRequested: false,
        progress: null,
      })
    }
  }

  private renderRunner(runner: ISelfHostedRunner) {
    const running = runner.status === 'running'
    const managementAvailable = runner.platform === 'windows'
    const startBlockReason = running ? null : this.runnerStartBlockReason()
    const startAuditNoteId = `runner-${runner.id}-start-audit-note`
    const startBlockReasonId = `runner-${runner.id}-start-block-reason`
    return (
      <article className="actions-runner-card" key={runner.id}>
        <div className="actions-runner-card-heading">
          <div>
            <h3>{runner.name}</h3>
            <p>
              {runner.platform === 'windows' ? 'Windows' : 'Linux in WSL'}
              {runner.wslDistribution === null
                ? ''
                : ` · ${runner.wslDistribution}`}
              {runner.dedicatedWsl ? ' · dedicated distro' : ''}
            </p>
          </div>
          <span
            className={`actions-runner-status ${runner.status}`}
            role="status"
            aria-label={`${runner.name} status: ${runner.status}`}
          >
            {runner.status}
          </span>
        </div>
        <p className="actions-runner-card-repository">
          <code>
            {runner.owner}/{runner.repository}
          </code>
        </p>
        <p className="actions-runner-labels">
          Labels: {runner.labels.join(', ')}
        </p>
        {!managementAvailable && (
          <p className="actions-banner warning" role="status">
            WSL process-group control is not yet provable. Start, stop, and
            remove this runner directly inside its distro and on GitHub.
          </p>
        )}
        {managementAvailable && !running && (
          <p id={startAuditNoteId} className="actions-runner-help" role="note">
            Starting {runner.name} runs a fresh main-process audit using that
            runner&apos;s exact live labels, private-fork policy, immutable
            default-branch workflows, and pending jobs. The setup-form preflight
            is not reused.
          </p>
        )}
        {managementAvailable && startBlockReason !== null && (
          <p
            id={startBlockReasonId}
            className="actions-banner warning"
            role="status"
          >
            {startBlockReason}
          </p>
        )}
        <div className="actions-runner-card-actions">
          <Button
            size="small"
            ariaLabel={`${running ? 'Stop' : 'Start'} ${runner.name}`}
            ariaDescribedBy={
              managementAvailable && !running
                ? `${startAuditNoteId}${
                    startBlockReason === null ? '' : ` ${startBlockReasonId}`
                  }`
                : undefined
            }
            dataVerification={`runner-${runner.id}-${
              running ? 'stop' : 'start'
            }`}
            disabled={
              !managementAvailable ||
              startBlockReason !== null ||
              this.state.busy ||
              this.state.removeSubmitting
            }
            onClick={() =>
              void this.invokeControl(runner.id, running ? 'stop' : 'start')
            }
          >
            {running ? 'Stop' : 'Start'}
          </Button>
          <Button
            size="small"
            className="destructive"
            ariaLabel={`Remove ${runner.name}`}
            dataVerification={`runner-${runner.id}-remove`}
            disabled={
              !managementAvailable ||
              this.state.busy ||
              this.state.removeSubmitting
            }
            onClick={() => this.requestRemove(runner)}
          >
            Remove
          </Button>
        </div>
      </article>
    )
  }

  private renderRemoteRunners() {
    if (this.state.remoteRunners.length === 0) {
      return null
    }
    return (
      <section
        className="actions-runner-remote"
        aria-labelledby="actions-runner-remote-heading"
      >
        <h3 id="actions-runner-remote-heading">GitHub runner inventory</h3>
        <p>
          These are the runners GitHub currently reports for this repository.
          Controls above apply only to runners managed by this app.
        </p>
        <ul>
          {this.state.remoteRunners.map(runner => (
            <li key={runner.id}>
              <strong>{runner.name}</strong> · {runner.os} ·{' '}
              {runner.busy ? 'busy' : runner.status}
              {runner.labels.length === 0
                ? ''
                : ` · ${runner.labels.map(label => label.name).join(', ')}`}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  public render() {
    const remote = this.props.repository.gitHubRepository
    const githubAccounts = this.githubAccounts()
    const status = this.state.status
    const runnerNameCollision = this.state.remoteRunners.some(
      runner =>
        runner.name.toLocaleLowerCase() ===
        this.state.runnerName.trim().toLocaleLowerCase()
    )
    const setupBlockReason = this.setupBlockReason()
    const canSetup = setupBlockReason === null
    return (
      <section
        className="actions-runner-manager"
        aria-labelledby="actions-runner-heading"
      >
        <header className="actions-runner-manager-header">
          <div>
            <h2 id="actions-runner-heading">
              <Octicon symbol={octicons.server} /> Self-hosted runners
            </h2>
            <p>
              Set up repository-scoped GitHub Actions runners on this Windows
              machine. Native Windows setup is available after the workflow
              trust check; WSL management is fail-closed until in-distro
              process-group cancellation can be proven.
            </p>
          </div>
          <Button
            size="small"
            onClick={() => void this.refresh()}
            disabled={this.state.busy || this.state.removeSubmitting}
          >
            Refresh
          </Button>
        </header>

        <div className="actions-runner-manager-note" role="note">
          Registration and removal tokens stay in memory only. The manager
          downloads the official Actions runner package, verifies its SHA-256
          digest, and installs the required Git/WSL dependencies automatically.
        </div>

        <div className="actions-banner warning" role="alert">
          Self-hosted workflow code runs with this Windows user&apos;s access to
          files and network services. WSL—including a dedicated distro—can reach
          mounted Windows drives and is not a security boundary. Anyone who can
          make a workflow target these labels can execute code with that access.
          {remote?.isPrivate === true
            ? ' This repository is private.'
            : remote?.isPrivate === false
            ? ' This repository is public. Setup is permitted only after the immutable workflow audit proves that no untrusted event can reach this managed runner.'
            : ' Repository visibility is unknown, so setup remains unavailable until GitHub proves whether it is public or private.'}
        </div>

        {this.state.error !== null && (
          <div className="actions-banner error" role="alert">
            {this.state.error}
          </div>
        )}
        {this.state.message !== null && (
          <div
            className="actions-banner success"
            role="status"
            aria-live="polite"
          >
            {this.state.message}
          </div>
        )}
        {this.state.progress !== null && this.state.busy && (
          <div
            className="actions-runner-progress"
            role="status"
            aria-live="polite"
          >
            {this.state.progress.detail}
          </div>
        )}
        {this.state.busy &&
          this.state.activeOperationRunnerId !== null &&
          this.state.activeOperationKind !== null && (
            <Button
              size="small"
              ariaLabel={`Cancel ${this.state.activeOperationKind} for ${this.state.activeOperationRunnerName}`}
              disabled={this.state.cancellationRequested}
              onClick={() => void this.cancelOperation()}
            >
              {this.state.cancellationRequested
                ? 'Cancellation requested'
                : `Cancel ${this.state.activeOperationKind}`}
            </Button>
          )}
        {this.state.remoteRunnersError !== null && (
          <div className="actions-banner warning" role="status">
            {this.state.remoteRunnersError}
          </div>
        )}

        {remote === null ? (
          <p className="actions-banner warning" role="alert">
            Connect this repository to GitHub before managing its Actions
            runners.
          </p>
        ) : githubAccounts.length === 0 ? (
          <p className="actions-banner warning" role="alert">
            Sign in to the GitHub account connected to this repository before
            requesting a runner token.
          </p>
        ) : status !== null && !status.supported ? (
          <p className="actions-banner warning" role="alert">
            Runner management is available from the Windows desktop app. This
            platform can still view the repository Actions surface.
          </p>
        ) : (
          <>
            <div className="actions-runner-form">
              <AccountPicker
                accounts={githubAccounts}
                selectedAccount={this.selectedAccount() ?? githubAccounts[0]!}
                onSelectedAccountChanged={this.onAccountChanged}
                disabled={this.state.busy || this.state.removeSubmitting}
                buttonAriaLabel="GitHub account"
              />
              <TextBox
                label="Runner name"
                value={this.state.runnerName}
                disabled={this.state.busy || this.state.removeSubmitting}
                onValueChanged={runnerName => this.setState({ runnerName })}
              />
              {runnerNameCollision && (
                <p className="actions-inline-error" role="alert">
                  GitHub already has a runner named {this.state.runnerName}.
                  Choose a unique name; this app never replaces an existing
                  runner.
                </p>
              )}
              <Select
                label="Runner platform"
                value={this.state.platform}
                disabled={this.state.busy || this.state.removeSubmitting}
                onChange={this.onPlatformChanged}
              >
                <option value="windows">Windows</option>
                <option value="linux-wsl" disabled={true}>
                  Linux in WSL 2 (temporarily unavailable)
                </option>
              </Select>
              <TextBox
                label="Labels (comma-separated)"
                value={this.state.labels}
                disabled={this.state.busy || this.state.removeSubmitting}
                onValueChanged={this.onLabelsChanged}
              />
              <p className="actions-runner-help">
                GitHub adds the built-in self-hosted, operating-system, and
                architecture labels. The suggested project label matches this
                repository&apos;s dedicated-runner workflow convention.
              </p>

              <div
                className={`actions-banner ${
                  this.state.setupPreflightStatus === 'safe'
                    ? 'success'
                    : this.state.setupPreflightStatus === 'unsafe'
                    ? 'error'
                    : 'warning'
                }`}
                role={
                  this.state.setupPreflightStatus === 'unsafe'
                    ? 'alert'
                    : 'status'
                }
              >
                Setup-form safety preflight: {this.state.setupPreflightDetail}
              </div>
              <p className="actions-runner-help">
                This result applies only to the selected account and proposed
                labels currently shown in the setup form. Existing-runner Start
                does not reuse it.
              </p>
              <Checkbox
                value={
                  this.state.workflowTrustAcknowledged
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                disabled={this.state.busy || this.state.removeSubmitting}
                label="I trust everyone allowed to run repository workflows that can target a managed runner on this machine"
                onChange={event =>
                  this.setState({
                    workflowTrustAcknowledged: event.currentTarget.checked,
                  })
                }
              />
              <Checkbox
                value={
                  this.state.hostAccessAcknowledged
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                disabled={this.state.busy || this.state.removeSubmitting}
                label="I understand jobs run as my Windows user and WSL does not isolate Windows files or network access"
                onChange={event =>
                  this.setState({
                    hostAccessAcknowledged: event.currentTarget.checked,
                  })
                }
              />

              {this.state.platform === 'linux-wsl' && (
                <div className="actions-runner-wsl-options">
                  <Select
                    label="Existing WSL distro"
                    value={this.state.selectedDistribution}
                    disabled={
                      this.state.busy ||
                      this.state.removeSubmitting ||
                      this.state.createDedicatedWsl
                    }
                    onChange={event =>
                      this.setState({
                        selectedDistribution: event.currentTarget.value,
                      })
                    }
                  >
                    <option value="">Choose a distro…</option>
                    {(status?.distributions ?? []).map(distribution => (
                      <option key={distribution} value={distribution}>
                        {distribution}
                      </option>
                    ))}
                  </Select>
                  <Checkbox
                    value={
                      this.state.createDedicatedWsl
                        ? CheckboxValue.On
                        : CheckboxValue.Off
                    }
                    disabled={this.state.busy || this.state.removeSubmitting}
                    label="Create a dedicated WSL 2 distro for this runner"
                    onChange={event =>
                      this.setState({
                        createDedicatedWsl: event.currentTarget.checked,
                      })
                    }
                  />
                  {this.state.createDedicatedWsl && (
                    <>
                      <Select
                        label="Clone this base distro"
                        value={this.state.baseDistribution}
                        disabled={
                          this.state.busy || this.state.removeSubmitting
                        }
                        onChange={event =>
                          this.setState({
                            baseDistribution: event.currentTarget.value,
                          })
                        }
                      >
                        <option value="">Choose a base distro…</option>
                        {(status?.distributions ?? []).map(distribution => (
                          <option key={distribution} value={distribution}>
                            {distribution}
                          </option>
                        ))}
                      </Select>
                      <TextBox
                        label="New dedicated distro name"
                        value={this.state.dedicatedDistribution}
                        disabled={
                          this.state.busy || this.state.removeSubmitting
                        }
                        onValueChanged={dedicatedDistribution =>
                          this.setState({ dedicatedDistribution })
                        }
                      />
                    </>
                  )}
                  <p className="actions-runner-help">
                    The app installs the Debian/Ubuntu runner toolchain inside
                    WSL. An existing distro is modified in place; a dedicated
                    distro is deleted with its runner.
                  </p>
                </div>
              )}
              <Button
                dataVerification="self-hosted-runner-setup"
                disabled={!canSetup}
                ariaDescribedBy={
                  setupBlockReason === null
                    ? undefined
                    : 'self-hosted-runner-setup-block-reason'
                }
                tooltip={setupBlockReason ?? undefined}
                onClick={() => void this.onSetup()}
              >
                Set up runner
              </Button>
              {setupBlockReason !== null && (
                <p
                  id="self-hosted-runner-setup-block-reason"
                  className="actions-runner-help"
                  role="status"
                >
                  {setupBlockReason}
                </p>
              )}
            </div>
          </>
        )}

        <section
          className="actions-runner-managed"
          aria-labelledby="actions-runner-managed-heading"
        >
          <h3 id="actions-runner-managed-heading">Managed on this machine</h3>
          {status === null ? (
            <p>Loading runner status…</p>
          ) : status.runners.length === 0 ? (
            <p>No runners are managed by this app yet.</p>
          ) : (
            <div className="actions-runner-cards">
              {status.runners.map(runner => this.renderRunner(runner))}
            </div>
          )}
        </section>
        {this.renderRemoteRunners()}

        {this.state.removeTarget !== null && (
          <SelfHostedRunnerRemovalDialog
            runner={this.state.removeTarget}
            submitting={this.state.removeSubmitting}
            error={this.state.removeError}
            progressMessage={
              this.state.removeSubmitting
                ? this.state.progress?.runnerId === this.state.removeTarget.id
                  ? this.state.progress.detail
                  : 'Requesting a removal token and unregistering the runner…'
                : null
            }
            onConfirm={() => void this.confirmRemove()}
            onDismissed={this.dismissRemove}
          />
        )}
      </section>
    )
  }
}
