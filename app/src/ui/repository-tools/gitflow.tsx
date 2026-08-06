import * as React from 'react'

import {
  finishGitflowBranch,
  getGitflowBranchName,
  getGitflowTargetBranches,
  GitflowBranchKinds,
  parseGitflowBranch,
  startGitflowBranch,
  GitflowBranchKind,
} from '../../lib/git/gitflow'
import { getStatus } from '../../lib/git/status'
import { getBranchNames } from '../../lib/git/branch'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'

export interface IGitflowManagerProps {
  readonly repository: Repository
  readonly disabled: boolean
  readonly onRefreshRepository: () => Promise<void>
}

interface IGitflowManagerState {
  readonly kind: GitflowBranchKind
  readonly name: string
  readonly currentBranch: string | null
  readonly targets: ReadonlyArray<string>
  readonly target: string
  readonly busy: boolean
  readonly confirmFinish: boolean
  readonly status: string
  readonly error: string | null
}

export class GitflowManager extends React.Component<
  IGitflowManagerProps,
  IGitflowManagerState
> {
  public state: IGitflowManagerState = {
    kind: 'feature',
    name: '',
    currentBranch: null,
    targets: [],
    target: '',
    busy: false,
    confirmFinish: false,
    status: 'Load the current branch before choosing a Gitflow operation.',
    error: null,
  }

  public componentDidMount() {
    void this.refresh()
  }

  private async refresh() {
    try {
      const [status, branches] = await Promise.all([
        getStatus(this.props.repository),
        getBranchNames(this.props.repository),
      ])
      if (status === null) {
        throw new Error('Unable to inspect the repository before Gitflow.')
      }
      const currentBranch = status.currentBranch ?? null
      const parsed = parseGitflowBranch(currentBranch ?? '')
      const targets = getGitflowTargetBranches(
        branches,
        parsed?.kind ?? this.state.kind
      )
      this.setState({
        currentBranch,
        targets,
        target: targets[0] ?? '',
        status:
          'Choose a branch type and name, or finish the checked-out flow branch.',
        error: null,
      })
    } catch (error) {
      this.setState({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to inspect Gitflow branches.',
      })
    }
  }

  private onStart = () => {
    const name = this.state.name.trim()
    if (name.length === 0 || this.state.busy) {
      return
    }
    this.setState({
      busy: true,
      error: null,
      status: 'Creating the reviewed Gitflow branch…',
    })
    void startGitflowBranch(this.props.repository, this.state.kind, name)
      .then(async branchName => {
        await this.props.onRefreshRepository()
        this.setState({
          busy: false,
          name: '',
          currentBranch: branchName,
          status: `Checked out ${branchName}.`,
        })
        await this.refresh()
      })
      .catch(error =>
        this.setState({
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to create the Gitflow branch.',
        })
      )
  }

  private onRequestFinish = () => {
    if (!this.state.busy) {
      this.setState({ confirmFinish: true, error: null })
    }
  }

  private onFinish = () => {
    if (!this.state.confirmFinish || this.state.busy) {
      return
    }
    this.setState({
      busy: true,
      confirmFinish: false,
      error: null,
      status: 'Merging the flow branch with --no-ff…',
    })
    void finishGitflowBranch(this.props.repository, this.state.target)
      .then(async result => {
        await this.props.onRefreshRepository()
        this.setState({
          busy: false,
          status: `Merged ${result.sourceBranch} into ${result.targetBranch}.`,
        })
        await this.refresh()
      })
      .catch(error =>
        this.setState({
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to finish the Gitflow branch.',
        })
      )
  }

  private onCancelFinish = () => this.setState({ confirmFinish: false })

  private onKindChanged = (event: React.ChangeEvent<HTMLSelectElement>) =>
    this.setState({ kind: event.currentTarget.value as GitflowBranchKind })

  private onNameChanged = (event: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ name: event.currentTarget.value })

  private onTargetChanged = (event: React.ChangeEvent<HTMLSelectElement>) =>
    this.setState({ target: event.currentTarget.value })

  public render() {
    const parsed = parseGitflowBranch(this.state.currentBranch ?? '')
    const canFinish = parsed !== null && this.state.targets.length > 0
    const preview =
      this.state.name.trim().length > 0
        ? getGitflowBranchName(this.state.kind, this.state.name)
        : null
    const disabled = this.props.disabled || this.state.busy

    return (
      <section
        className="repository-tools-category repository-gitflow"
        aria-labelledby="repository-gitflow-title"
      >
        <h2 id="repository-gitflow-title">Gitflow operations</h2>
        <p>
          Start feature, release, and hotfix branches with fixed Git arguments,
          then review a non-fast-forward finish before the source branch is
          removed.
        </p>
        <div className="repository-tool-card">
          <h3>Start a flow branch</h3>
          <label htmlFor="gitflow-kind">Branch type</label>
          <select
            id="gitflow-kind"
            value={this.state.kind}
            disabled={disabled}
            onChange={this.onKindChanged}
          >
            {GitflowBranchKinds.map(kind => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <label htmlFor="gitflow-name">Name</label>
          <input
            id="gitflow-name"
            value={this.state.name}
            disabled={disabled}
            maxLength={128}
            onChange={this.onNameChanged}
          />
          {preview !== null && (
            <output aria-live="polite">
              Creates <code>{preview}</code>
            </output>
          )}
          <Button
            disabled={disabled || preview === null}
            onClick={this.onStart}
          >
            Start branch
          </Button>
        </div>
        <div className="repository-tool-card">
          <h3>Finish the checked-out branch</h3>
          <p>
            Current branch:{' '}
            <strong>{this.state.currentBranch ?? 'unknown'}</strong>
          </p>
          <label htmlFor="gitflow-target">Merge into</label>
          <select
            id="gitflow-target"
            value={this.state.target}
            disabled={disabled || !canFinish}
            onChange={this.onTargetChanged}
          >
            {this.state.targets.map(target => (
              <option key={target} value={target}>
                {target}
              </option>
            ))}
          </select>
          {this.state.confirmFinish ? (
            <div role="alertdialog" aria-label="Confirm Gitflow finish">
              <p>
                This merges the current flow branch with <code>--no-ff</code>{' '}
                and deletes it after success. Uncommitted or conflicted work
                blocks the action.
              </p>
              <Button disabled={disabled} onClick={this.onFinish}>
                Confirm finish
              </Button>
              <Button disabled={disabled} onClick={this.onCancelFinish}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              disabled={disabled || !canFinish}
              onClick={this.onRequestFinish}
            >
              Review finish
            </Button>
          )}
        </div>
        <p className="repository-tools-status" role="status" aria-live="polite">
          {this.state.status}
        </p>
        {this.state.error !== null && (
          <p className="repository-tools-error" role="alert">
            {this.state.error}
          </p>
        )}
      </section>
    )
  }
}
