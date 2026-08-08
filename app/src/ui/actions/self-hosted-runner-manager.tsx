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
  readonly selectedAccountKey: string
  readonly platform: SelfHostedRunnerPlatform
  readonly runnerName: string
  readonly labels: string
  readonly selectedDistribution: string
  readonly createDedicatedWsl: boolean
  readonly baseDistribution: string
  readonly dedicatedDistribution: string
  readonly busy: boolean
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

function defaultLabels(platform: SelfHostedRunnerPlatform): string {
  return `self-hosted,desktop-material,${
    platform === 'windows' ? 'windows' : 'linux-wsl'
  }`
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

  public constructor(props: ISelfHostedRunnerManagerProps) {
    super(props)
    this.lastRepositoryKey = repositoryKey(props.repository)
    this.state = this.initialState(props)
  }

  private initialState(
    props: ISelfHostedRunnerManagerProps
  ): ISelfHostedRunnerManagerState {
    const remote = props.repository.gitHubRepository
    const account = this.githubAccounts(props).at(0)
    return {
      status: null,
      remoteRunners: [],
      selectedAccountKey: account === undefined ? '' : getAccountKey(account),
      platform: 'windows',
      runnerName: `desktop-material-${
        process.arch === 'arm64' ? 'arm64' : 'x64'
      }`,
      labels: defaultLabels('windows'),
      selectedDistribution: '',
      createDedicatedWsl: false,
      baseDistribution: '',
      dedicatedDistribution:
        remote === null ? 'desktop-material-runner' : `${remote.name}-runner`,
      busy: false,
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
      this.lastRepositoryKey = nextKey
      this.setState(this.initialState(this.props), () => void this.refresh())
    }
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('self-hosted-runner-progress', this.onProgress)
  }

  private onProgress = (
    _event: Electron.IpcRendererEvent,
    progress: ISelfHostedRunnerProgress
  ) => {
    this.setState({ progress })
  }

  private refresh = async () => {
    try {
      const remote = this.props.repository.gitHubRepository
      if (remote === null) {
        this.setState({ status: null, remoteRunners: [] })
        return
      }
      const status = await ipcRenderer.invoke('get-self-hosted-runner-status', {
        owner: remote.owner.login,
        repository: remote.name,
      })
      this.setDefaultDistro(status)
      const account = this.selectedAccount()
      if (account !== null) {
        try {
          const runners = await API.fromAccount(account).fetchSelfHostedRunners(
            remote.owner.login,
            remote.name
          )
          this.setState({ remoteRunners: runners.runners })
        } catch {
          this.setState({ remoteRunners: [] })
        }
      } else {
        this.setState({ remoteRunners: [] })
      }
    } catch (error) {
      this.setState({
        error: errorText(
          error,
          'The runner manager could not load its status.'
        ),
      })
    }
  }

  private onPlatformChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const platform = event.currentTarget.value as SelfHostedRunnerPlatform
    this.setState(state => ({
      platform,
      labels: state.labels
        .split(',')
        .map(label => label.trim())
        .filter(
          label => label !== '' && label !== 'windows' && label !== 'linux-wsl'
        )
        .concat(platform === 'windows' ? 'windows' : 'linux-wsl')
        .join(','),
    }))
  }

  private onSetup = async () => {
    const remote = this.props.repository.gitHubRepository
    const account = this.selectedAccount()
    if (remote === null || account === null || this.state.busy) {
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

    this.setState({ busy: true, error: null, message: null, progress: null })
    try {
      const reply = await ipcRenderer.invoke('setup-self-hosted-runner', {
        id: crypto.randomUUID(),
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
          'Runner setup is complete. GitHub may take a few seconds to show it as online.',
      })
      await this.refresh()
    } catch (error) {
      this.setState({
        error: errorText(
          error,
          'Runner setup failed. Request a new token and retry.'
        ),
      })
    } finally {
      this.setState({ busy: false })
    }
  }

  private invokeControl = async (id: string, action: 'start' | 'stop') => {
    const remote = this.props.repository.gitHubRepository
    if (this.state.busy || remote === null) {
      return
    }
    this.setState({ busy: true, error: null, message: null })
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
      this.setState({ busy: false })
    }
  }

  private requestRemove = (runner: ISelfHostedRunner) => {
    if (this.state.removeSubmitting) {
      return
    }
    this.setState({ removeTarget: runner, removeError: null })
  }

  private dismissRemove = () => {
    this.setState({ removeTarget: null, removeError: null })
  }

  private confirmRemove = async () => {
    const remote = this.props.repository.gitHubRepository
    const account = this.selectedAccount()
    const target = this.state.removeTarget
    if (remote === null || account === null || target === null) {
      return
    }
    this.setState({ removeSubmitting: true, removeError: null })
    try {
      const reply = await ipcRenderer.invoke('remove-self-hosted-runner', {
        id: target.id,
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
      this.setState({ removeSubmitting: false })
    }
  }

  private renderRunner(runner: ISelfHostedRunner) {
    const running = runner.status === 'running'
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
        <div className="actions-runner-card-actions">
          <Button
            size="small"
            dataVerification={`runner-${runner.id}-${
              running ? 'stop' : 'start'
            }`}
            disabled={this.state.busy || this.state.removeSubmitting}
            onClick={() =>
              void this.invokeControl(runner.id, running ? 'stop' : 'start')
            }
          >
            {running ? 'Stop' : 'Start'}
          </Button>
          <Button
            size="small"
            className="destructive"
            dataVerification={`runner-${runner.id}-remove`}
            disabled={this.state.busy || this.state.removeSubmitting}
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
    const canSetup =
      status?.supported === true &&
      remote !== null &&
      githubAccounts.length > 0 &&
      !this.state.busy &&
      !this.state.removeSubmitting
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
              machine. Linux runners run inside an existing or dedicated WSL 2
              distro.
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
              <Select
                label="GitHub account"
                value={this.state.selectedAccountKey}
                disabled={this.state.busy || this.state.removeSubmitting}
                onChange={event =>
                  this.setState(
                    { selectedAccountKey: event.currentTarget.value },
                    () => void this.refresh()
                  )
                }
              >
                {githubAccounts.map(account => (
                  <option
                    key={getAccountKey(account)}
                    value={getAccountKey(account)}
                  >
                    {account.friendlyName} · {account.friendlyEndpoint}
                  </option>
                ))}
              </Select>
              <TextBox
                label="Runner name"
                value={this.state.runnerName}
                disabled={this.state.busy || this.state.removeSubmitting}
                onValueChanged={runnerName => this.setState({ runnerName })}
              />
              <Select
                label="Runner platform"
                value={this.state.platform}
                disabled={this.state.busy || this.state.removeSubmitting}
                onChange={this.onPlatformChanged}
              >
                <option value="windows">Windows</option>
                <option value="linux-wsl">Linux in WSL 2</option>
              </Select>
              <TextBox
                label="Labels (comma-separated)"
                value={this.state.labels}
                disabled={this.state.busy || this.state.removeSubmitting}
                onValueChanged={labels => this.setState({ labels })}
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
                onClick={() => void this.onSetup()}
              >
                Set up runner
              </Button>
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
                ? 'Requesting a removal token and unregistering the runner…'
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
