import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DefaultDialogFooter,
} from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'
import { RadioButton } from '../lib/radio-button'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { Dispatcher } from '../dispatcher'
import { Account, getAccountKey } from '../../models/account'
import {
  API,
  getDotComAPIEndpoint,
  getHTMLURL,
  IAPIOrganization,
} from '../../lib/api'
import {
  IRepositoryTransferProgress,
  RepositoryTransferMode,
  RepositoryTransferProgressStage,
  describeRepositoryTransferMode,
  validateRepositoryTransferName,
} from '../../lib/repository-transfer'
import { SignInResult } from '../../lib/stores/sign-in-store'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'

interface ITransferOwner {
  readonly login: string
  readonly org: IAPIOrganization | null
}

type RepositoryTransferDialogStage =
  | 'form'
  | 'review'
  | 'running'
  | 'complete'
  | 'error'

interface IRepositoryTransferDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository
  readonly accounts: ReadonlyArray<Account>
  readonly onCompleted?: () => void
  readonly onDismissed: () => void
}

interface IRepositoryTransferDialogState {
  readonly stage: RepositoryTransferDialogStage
  readonly accountKey: string
  readonly signedInAccount?: Account
  readonly owners: ReadonlyArray<ITransferOwner> | null
  readonly ownerLogin: string
  readonly ownersError?: string
  readonly mode: RepositoryTransferMode
  readonly name: string
  readonly keepPrivate: boolean
  /**
   * Whether the shared destructive-action gate on the review stage has been
   * fully operated: both keys turned and the authorization slider driven to
   * its maximum. The gate owns that state; this records only its verdict.
   */
  readonly gateAuthorized: boolean
  readonly progress?: IRepositoryTransferProgress
  readonly error?: Error
}

const transferStages: ReadonlyArray<RepositoryTransferProgressStage> = [
  'checking',
  'creating',
  'preparing',
  'publishing',
  'retargeting',
  'complete',
]

function githubAccounts(
  accounts: ReadonlyArray<Account>
): ReadonlyArray<Account> {
  const seen = new Set<string>()
  return accounts.filter(account => {
    if (account.provider !== 'github') {
      return false
    }
    const key = getAccountKey(account)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

/**
 * Transfer a local repository to a repository owned by another signed-in
 * account. The sign-in dialog is deliberately opened through Dispatcher so
 * the account token remains in the existing credential store.
 */
export class RepositoryTransferDialog extends React.Component<
  IRepositoryTransferDialogProps,
  IRepositoryTransferDialogState
> {
  private ownersRequest = 0
  private isMountedFlag = false

  public constructor(props: IRepositoryTransferDialogProps) {
    super(props)
    const accounts = githubAccounts(props.accounts)
    const source = props.repository.gitHubRepository
    const sourceAccount = accounts.find(
      account =>
        account.login === source.owner.login &&
        account.endpoint === source.endpoint
    )
    const initialAccount = sourceAccount ?? accounts[0]

    this.state = {
      stage: 'form',
      accountKey:
        initialAccount === undefined ? '' : getAccountKey(initialAccount),
      owners: null,
      ownerLogin: initialAccount?.login ?? source.owner.login,
      mode: 'full-history',
      name: source.name,
      // Preserve a known-private source by default. Making that repository
      // public should require an explicit user choice in the review step.
      keepPrivate: source.isPrivate === true,
      gateAuthorized: false,
    }
  }

  public componentDidMount() {
    this.isMountedFlag = true
    void this.loadOwners()
  }

  public componentWillUnmount() {
    this.isMountedFlag = false
    this.ownersRequest += 1
  }

  private availableAccounts(): ReadonlyArray<Account> {
    const accounts = githubAccounts([
      ...(this.state.signedInAccount === undefined
        ? []
        : [this.state.signedInAccount]),
      ...this.props.accounts,
    ])
    return accounts
  }

  private selectedAccount(): Account | undefined {
    return this.availableAccounts().find(
      account => getAccountKey(account) === this.state.accountKey
    )
  }

  private selectedOwner(): ITransferOwner | undefined {
    return this.state.owners?.find(
      owner => owner.login === this.state.ownerLogin
    )
  }

  private async loadOwners(account = this.selectedAccount()) {
    const request = ++this.ownersRequest
    if (account === undefined) {
      if (this.isMountedFlag) {
        this.setState({ owners: [] })
      }
      return
    }

    const personal: ITransferOwner = { login: account.login, org: null }
    try {
      const organizations = await API.fromAccount(account).fetchOrgs(true)
      if (
        !this.isMountedFlag ||
        request !== this.ownersRequest ||
        this.state.accountKey !== getAccountKey(account)
      ) {
        return
      }
      this.setState({
        owners: [
          personal,
          ...organizations.map(org => ({ login: org.login, org })),
        ],
        ownerLogin: this.state.ownerLogin || account.login,
        ownersError: undefined,
      })
    } catch (error) {
      if (
        !this.isMountedFlag ||
        request !== this.ownersRequest ||
        this.state.accountKey !== getAccountKey(account)
      ) {
        return
      }
      this.setState({
        owners: [personal],
        ownerLogin: account.login,
        ownersError:
          error instanceof Error
            ? error.message
            : 'Organizations could not be listed for this account.',
      })
    }
  }

  private onAccountChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const accountKey = event.currentTarget.value
    const account = this.availableAccounts().find(
      candidate => getAccountKey(candidate) === accountKey
    )
    this.setState(
      {
        accountKey,
        ownerLogin: account?.login ?? '',
        owners: null,
        ownersError: undefined,
      },
      () => void this.loadOwners(account)
    )
  }

  private onOwnerChanged = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({ ownerLogin: event.currentTarget.value })

  private onModeSelected = (mode: RepositoryTransferMode) =>
    this.setState({ mode })

  private onNameChanged = (name: string) => this.setState({ name })

  private onKeepPrivateChanged = (event: React.FormEvent<HTMLInputElement>) =>
    this.setState({ keepPrivate: event.currentTarget.checked })

  private onGateAuthorizationChanged = (gateAuthorized: boolean) =>
    this.setState({ gateAuthorized })

  private onSignIn = () => {
    const endpoint = this.props.repository.gitHubRepository.endpoint
    const resultCallback = (result: SignInResult) => {
      if (result.kind !== 'success' || result.account.provider !== 'github') {
        return
      }
      if (!this.isMountedFlag) {
        return
      }
      this.setState(
        {
          signedInAccount: result.account,
          accountKey: getAccountKey(result.account),
          ownerLogin: result.account.login,
          owners: null,
          ownersError: undefined,
        },
        () => void this.loadOwners(result.account)
      )
    }

    if (endpoint === getDotComAPIEndpoint()) {
      void this.props.dispatcher.showDotComSignInDialog(resultCallback)
    } else {
      void this.props.dispatcher.showEnterpriseSignInDialog(
        getHTMLURL(endpoint),
        resultCallback
      )
    }
  }

  private nameError(): string | undefined {
    try {
      validateRepositoryTransferName(this.state.name)
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  private canReview(): boolean {
    return (
      this.selectedAccount() !== undefined &&
      this.selectedOwner() !== undefined &&
      this.state.owners !== null &&
      this.nameError() === undefined
    )
  }

  private canTransfer(): boolean {
    return this.state.gateAuthorized
  }

  private onDialogSubmit = () => {
    if (this.state.stage === 'form') {
      if (this.canReview()) {
        this.setState({
          stage: 'review',
          gateAuthorized: false,
          error: undefined,
        })
      }
      return
    }

    if (this.state.stage === 'review' && this.canTransfer()) {
      void this.executeTransfer()
    }
  }

  private executeTransfer = async () => {
    const account = this.selectedAccount()
    const owner = this.selectedOwner()
    const nameError = this.nameError()
    if (
      account === undefined ||
      owner === undefined ||
      nameError !== undefined
    ) {
      return
    }

    let lastProgress: IRepositoryTransferProgress | undefined
    this.setState({ stage: 'running', progress: undefined, error: undefined })
    try {
      await this.props.dispatcher.transferRepository(
        this.props.repository,
        account,
        owner.org,
        validateRepositoryTransferName(this.state.name),
        '',
        this.state.keepPrivate,
        this.state.mode,
        progress => {
          lastProgress = progress
          this.setState({ progress })
        }
      )
      this.props.onCompleted?.()
      this.setState({
        stage: 'complete',
        progress: lastProgress ?? {
          stage: 'complete',
          message: 'Transfer complete.',
        },
      })
    } catch (error) {
      const transferError =
        error instanceof Error ? error : new Error(String(error))
      log.error('Repository transfer failed', transferError)
      sendNonFatalException('repositoryTransfer', transferError)
      this.setState({ stage: 'error', error: transferError })
    }
  }

  private renderAccountControls() {
    const accounts = this.availableAccounts()
    const account = this.selectedAccount()

    return (
      <div className="repository-transfer-destination">
        <Select
          label="Destination account"
          value={this.state.accountKey}
          onChange={this.onAccountChanged}
          disabled={this.state.stage !== 'form' || accounts.length === 0}
        >
          {accounts.length === 0 ? (
            <option value="">Sign in to choose an account</option>
          ) : (
            accounts.map(candidate => (
              <option
                key={getAccountKey(candidate)}
                value={getAccountKey(candidate)}
              >
                {`${candidate.login} · ${candidate.friendlyEndpoint}`}
              </option>
            ))
          )}
        </Select>
        <Button
          type="button"
          onClick={this.onSignIn}
          disabled={this.state.stage !== 'form'}
          className="repository-transfer-sign-in"
        >
          {accounts.length === 0
            ? 'Sign in to a GitHub account…'
            : 'Sign in to another account…'}
        </Button>

        <Select
          label="Destination owner"
          value={this.state.ownerLogin}
          onChange={this.onOwnerChanged}
          disabled={
            this.state.stage !== 'form' ||
            account === undefined ||
            this.state.owners === null
          }
        >
          {(this.state.owners ?? []).map(owner => (
            <option key={owner.login} value={owner.login}>
              {owner.org === null ? `${owner.login} (personal)` : owner.login}
            </option>
          ))}
        </Select>
        {this.state.ownersError !== undefined && (
          <p className="repository-transfer-note" role="status">
            {`Organizations could not be listed, so only the personal namespace is offered: ${this.state.ownersError}`}
          </p>
        )}
      </div>
    )
  }

  private renderModeControls() {
    return (
      <fieldset
        className="repository-transfer-mode"
        disabled={this.state.stage !== 'form'}
      >
        <legend>Transfer mode</legend>
        <RadioButton<RepositoryTransferMode>
          value="full-history"
          checked={this.state.mode === 'full-history'}
          onSelected={this.onModeSelected}
          label="Full history"
        />
        <p>{describeRepositoryTransferMode('full-history')}</p>
        <RadioButton<RepositoryTransferMode>
          value="clean-state"
          checked={this.state.mode === 'clean-state'}
          onSelected={this.onModeSelected}
          label="Clean state"
        />
        <p>{describeRepositoryTransferMode('clean-state')}</p>
      </fieldset>
    )
  }

  private renderForm() {
    const account = this.selectedAccount()
    const owner = this.selectedOwner()
    const destination =
      account === undefined || owner === undefined
        ? 'Choose a destination account and owner'
        : `${owner.login}/${this.state.name.trim()}`
    const nameError = this.nameError()

    return (
      <>
        <DialogContent>
          <div className="repository-transfer-intro">
            <strong>Move this repository to another account</strong>
            <p>
              The destination is created in the selected account, then this
              local repository is published and <code>origin</code> is pointed
              at it.
            </p>
          </div>
          <div
            className="repository-transfer-route"
            role="group"
            aria-label="Repository transfer route"
          >
            <div>
              <span>Source</span>
              <strong>{this.props.repository.gitHubRepository.fullName}</strong>
            </div>
            <span aria-hidden="true" className="repository-transfer-arrow">
              →
            </span>
            <div>
              <span>Destination</span>
              <strong>{destination}</strong>
            </div>
          </div>
          {this.renderAccountControls()}
          <TextBox
            label="Repository name"
            value={this.state.name}
            onValueChanged={this.onNameChanged}
            disabled={this.state.stage !== 'form'}
          />
          {nameError !== undefined && (
            <p className="repository-transfer-validation" role="alert">
              {nameError}
            </p>
          )}
          {this.renderModeControls()}
          <Checkbox
            label="Keep the destination repository private"
            value={
              this.state.keepPrivate ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onKeepPrivateChanged}
            disabled={this.state.stage !== 'form'}
          />
          <p className="repository-transfer-note">
            Full-history transfer requires a clean working tree. Clean-state
            transfer snapshots the current files, including local changes;
            ignored files are not part of a Git commit. Existing source remotes
            are preserved as <code>upstream</code> when needed.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Review transfer"
            okButtonDisabled={!this.canReview()}
          />
        </DialogFooter>
      </>
    )
  }

  private renderReview() {
    const account = this.selectedAccount()
    const owner = this.selectedOwner()
    const destination = `${owner?.login ?? 'unknown'}/${this.state.name.trim()}`
    const transferReady = this.canTransfer()
    const modeLabel =
      this.state.mode === 'full-history' ? 'Full history' : 'Clean state'

    return (
      <>
        <DialogContent>
          <div
            className="repository-transfer-review"
            id="repository-transfer-review-description"
          >
            <strong>Review the exact transfer</strong>
            <p>
              <code>{this.props.repository.gitHubRepository.fullName}</code>{' '}
              will be published to{' '}
              <code>{account?.login ?? 'unknown account'}</code> as{' '}
              <code>{destination}</code>.
            </p>
            <p>
              Mode: <strong>{modeLabel}</strong>. The destination account will
              receive the repository according to its privacy setting. This
              local checkout will retarget <code>origin</code> only after the
              destination reports a successful push.
            </p>
          </div>
          <Md3DestructiveGateBody
            actionId="repository-transfer"
            summary={`This publishes ${
              this.props.repository.gitHubRepository.fullName
            } to ${destination} as a ${modeLabel.toLowerCase()} transfer.`}
            irreversible={`This checkout's origin remote is retargeted at ${destination} once the destination reports a successful push, and the previous origin is not restored automatically.`}
            targetKeyLabel={`the destination ${destination} on ${
              account?.login ?? 'unknown account'
            }`}
            effectKeyLabel={`the ${modeLabel.toLowerCase()} history mode, and this checkout's origin moving to the new repository`}
            onAuthorizationChanged={this.onGateAuthorizationChanged}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Transfer repository"
            okButtonDisabled={!transferReady}
            cancelButtonText="Emergency exit"
            cancelButtonTitle="Cancel without transferring the repository"
          />
        </DialogFooter>
      </>
    )
  }

  private renderRunning() {
    const currentStage = this.state.progress?.stage ?? 'checking'
    const currentIndex = transferStages.indexOf(currentStage)

    return (
      <>
        <DialogContent>
          <div className="repository-transfer-progress" aria-live="polite">
            <strong>
              {this.state.progress?.message ?? 'Starting transfer…'}
            </strong>
            <ol>
              {transferStages.map((stage, index) => (
                <li
                  key={stage}
                  className={index <= currentIndex ? 'is-complete' : undefined}
                >
                  {stage}
                </li>
              ))}
            </ol>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button type="button" disabled={true}>
            Transfer in progress…
          </Button>
        </DialogFooter>
      </>
    )
  }

  private renderError() {
    return (
      <>
        <DialogContent>
          <div className="repository-transfer-error-copy">
            <strong>Repository transfer did not finish.</strong>
            <p>
              The destination may already exist. The local remote is retargeted
              only after a verified push, and the transfer rolls back a partial
              remote edit when possible. Review the remotes and error details
              before trying again.
            </p>
          </div>
          <details>
            <summary>Error details</summary>
            <pre className="error">{this.state.error?.message}</pre>
          </details>
        </DialogContent>
        <DefaultDialogFooter />
      </>
    )
  }

  private renderComplete() {
    return (
      <>
        <DialogContent>
          <div className="repository-transfer-complete" role="status">
            <strong>
              {this.state.progress?.message ?? 'Transfer complete.'}
            </strong>
            <p>
              The repository is ready at its new destination. Review the remote
              manager if you need to confirm the new <code>origin</code> and
              preserved <code>upstream</code>.
            </p>
          </div>
        </DialogContent>
        <DefaultDialogFooter buttonText="Done" />
      </>
    )
  }

  public render() {
    const isRunning = this.state.stage === 'running'
    const title =
      this.state.stage === 'review'
        ? 'Confirm repository transfer'
        : this.state.stage === 'complete'
        ? 'Repository transfer complete'
        : 'Transfer repository'

    return (
      <Dialog
        title={title}
        onDismissed={this.props.onDismissed}
        onSubmit={
          this.state.stage === 'error' || this.state.stage === 'complete'
            ? undefined
            : this.onDialogSubmit
        }
        dismissDisabled={isRunning}
        disabled={isRunning}
        loading={isRunning}
        type={this.state.stage === 'error' ? 'error' : 'normal'}
        id="repository-transfer"
        ariaDescribedBy={
          this.state.stage === 'review'
            ? 'repository-transfer-review-description'
            : undefined
        }
      >
        {this.state.stage === 'form' && this.renderForm()}
        {this.state.stage === 'review' && this.renderReview()}
        {this.state.stage === 'running' && this.renderRunning()}
        {this.state.stage === 'error' && this.renderError()}
        {this.state.stage === 'complete' && this.renderComplete()}
      </Dialog>
    )
  }
}
