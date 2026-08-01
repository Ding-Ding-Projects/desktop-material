import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DefaultDialogFooter,
} from '../dialog'
import { Dispatcher } from '../dispatcher'
import {
  RepositoryWithGitHubRepository,
  isRepositoryWithForkedGitHubRepository,
} from '../../models/repository'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'
import { Account, getAccountKey } from '../../models/account'
import { API, IAPIFullRepository, IAPIOrganization } from '../../lib/api'
import { LinkButton } from '../lib/link-button'
import { PopupType } from '../../models/popup'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

/**
 * How the copy is produced.
 *
 * `fork` uses the provider's own fork endpoint, which records the attribution
 * link back to the source. `copy` creates an empty repository and pushes into
 * it, which is what this app can actually do on every provider.
 */
export type ForkStrategy = 'fork' | 'copy'

/**
 * Whether this account's provider exposes a fork endpoint this app can drive.
 *
 * Only GitHub does. `GitLabAPI` inherits `forkRepository` from the GitHub API
 * class, so calling it against a self-hosted GitLab posts to `/repos/…`,
 * which does not exist there. Offering Fork for such an account would be
 * offering a button that always fails, so those accounts get Copy only.
 */
export function supportsServerSideFork(account: Account): boolean {
  return account.provider === 'github'
}

/** A namespace a new repository can be created under. */
interface IForkOwner {
  readonly login: string
  /** Null for the signed-in user's own namespace. */
  readonly org: IAPIOrganization | null
}

interface ICreateForkDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository
  readonly account: Account
  /**
   * Every signed-in account, so the copy can be placed somewhere other than
   * the account this repository happens to be associated with.
   */
  readonly accounts?: ReadonlyArray<Account>
  readonly onDismissed: () => void
}

interface ICreateForkDialogState {
  readonly loading: boolean
  readonly error?: Error
  readonly createdForkURL?: string
  readonly accountKey: string
  readonly strategy: ForkStrategy
  /** Owners available to the selected account; null while still loading. */
  readonly owners: ReadonlyArray<IForkOwner> | null
  readonly ownerLogin: string
  readonly name: string
  readonly keepPrivate: boolean
  /** Set when organizations could not be listed, so the reason stays visible. */
  readonly ownersError?: string
}

/**
 * Dialog offering to fork the given repository, or — where forking is not
 * available or not wanted — to copy it into a new repository and push.
 */
export class CreateForkDialog extends React.Component<
  ICreateForkDialogProps,
  ICreateForkDialogState
> {
  public constructor(props: ICreateForkDialogProps) {
    super(props)
    this.state = {
      loading: false,
      accountKey: getAccountKey(props.account),
      strategy: supportsServerSideFork(props.account) ? 'fork' : 'copy',
      owners: null,
      ownerLogin: props.account.login,
      name: props.repository.gitHubRepository.name,
      keepPrivate: false,
    }
  }

  public componentDidMount() {
    void this.loadOwners()
  }

  /** Every account the user is signed in to, including the current one. */
  private availableAccounts(): ReadonlyArray<Account> {
    const accounts = this.props.accounts ?? []
    const current = getAccountKey(this.props.account)
    return accounts.some(a => getAccountKey(a) === current)
      ? accounts
      : [this.props.account, ...accounts]
  }

  private selectedAccount(): Account {
    return (
      this.availableAccounts().find(
        a => getAccountKey(a) === this.state.accountKey
      ) ?? this.props.account
    )
  }

  /**
   * List the namespaces the selected account can create in.
   *
   * A failure is reported rather than swallowed: the user's own namespace
   * still works, but they should be told why their organizations are absent
   * instead of concluding they have none.
   */
  private async loadOwners() {
    const account = this.selectedAccount()
    const personal: IForkOwner = { login: account.login, org: null }
    try {
      const orgs = await API.fromAccount(account).fetchOrgs(true)
      this.setState({
        owners: [personal, ...orgs.map(org => ({ login: org.login, org }))],
        ownersError: undefined,
      })
    } catch (e) {
      this.setState({
        owners: [personal],
        ownersError:
          e instanceof Error
            ? e.message
            : 'Organizations could not be listed for this account.',
      })
    }
  }

  private onAccountChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const accountKey = event.currentTarget.value
    const account =
      this.availableAccounts().find(a => getAccountKey(a) === accountKey) ??
      this.props.account
    this.setState(
      {
        accountKey,
        ownerLogin: account.login,
        owners: null,
        // An account whose provider has no usable fork endpoint cannot stay
        // on Fork, so the method follows the account rather than going stale.
        strategy: supportsServerSideFork(account)
          ? this.state.strategy
          : 'copy',
      },
      () => void this.loadOwners()
    )
  }

  private onOwnerChanged = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({ ownerLogin: event.currentTarget.value })

  private onStrategyChanged = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({ strategy: event.currentTarget.value as ForkStrategy })

  private onNameChanged = (name: string) => this.setState({ name })

  private onKeepPrivateChanged = (event: React.FormEvent<HTMLInputElement>) =>
    this.setState({ keepPrivate: event.currentTarget.checked })

  private selectedOwner(): IForkOwner | undefined {
    return this.state.owners?.find(
      owner => owner.login === this.state.ownerLogin
    )
  }

  private onSubmit = async () => {
    if (this.state.strategy === 'copy') {
      await this.submitCopy()
      return
    }
    await this.submitFork()
  }

  /** Fork through the provider's own endpoint. */
  private submitFork = async () => {
    this.setState({ loading: true })
    const { gitHubRepository } = this.props.repository
    const account = this.selectedAccount()
    const api = API.fromAccount(account)
    const owner = this.selectedOwner()
    let createdFork: IAPIFullRepository | null = null
    try {
      createdFork = await api.forkRepository(
        gitHubRepository.owner.login,
        gitHubRepository.name,
        owner?.org?.login
      )
      this.props.dispatcher.incrementMetric('forksCreated')
      const updatedRepository =
        await this.props.dispatcher.convertRepositoryToFork(
          this.props.repository,
          createdFork
        )

      if (isRepositoryWithForkedGitHubRepository(updatedRepository)) {
        this.setState({ loading: false })
        this.props.onDismissed()
        this.props.dispatcher.showPopup({
          type: PopupType.ChooseForkSettings,
          repository: updatedRepository,
        })
        return
      }

      throw new Error(
        'The fork was created, but Desktop Material could not connect this local repository to it. Review the repository remotes before pushing.'
      )
    } catch (e) {
      log.error(`Fork creation through API failed (${e})`)
      sendNonFatalException('forkCreation', e)
      const error = e instanceof Error ? e : new Error(String(e))
      this.setState({
        error,
        loading: false,
        createdForkURL: createdFork?.html_url,
      })
    }
  }

  /** Create an empty repository at the destination and push into it. */
  private submitCopy = async () => {
    this.setState({ loading: true })
    const account = this.selectedAccount()
    const owner = this.selectedOwner()
    try {
      await this.props.dispatcher.copyRepositoryToNewRemote(
        this.props.repository,
        account,
        owner?.org ?? null,
        this.state.name.trim(),
        '',
        this.state.keepPrivate
      )
      this.setState({ loading: false })
      this.props.onDismissed()
    } catch (e) {
      log.error(`Repository copy failed (${e})`)
      sendNonFatalException('repositoryCopy', e)
      this.setState({
        error: e instanceof Error ? e : new Error(String(e)),
        loading: false,
      })
    }
  }

  private renderDestinationControls() {
    const account = this.selectedAccount()
    const accounts = this.availableAccounts()
    const forkable = supportsServerSideFork(account)
    const copying = this.state.strategy === 'copy'

    return (
      <div className="create-fork-destination">
        {accounts.length > 1 && (
          <Select
            label="Account"
            value={this.state.accountKey}
            onChange={this.onAccountChanged}
            disabled={this.state.loading}
          >
            {accounts.map(a => (
              <option key={getAccountKey(a)} value={getAccountKey(a)}>
                {`${a.login} · ${a.friendlyEndpoint}`}
              </option>
            ))}
          </Select>
        )}

        <Select
          label="Owner"
          value={this.state.ownerLogin}
          onChange={this.onOwnerChanged}
          disabled={this.state.loading || this.state.owners === null}
        >
          {(this.state.owners ?? [{ login: account.login, org: null }]).map(
            owner => (
              <option key={owner.login} value={owner.login}>
                {owner.org === null ? `${owner.login} (personal)` : owner.login}
              </option>
            )
          )}
        </Select>

        <Select
          label="Method"
          value={this.state.strategy}
          onChange={this.onStrategyChanged}
          disabled={this.state.loading}
        >
          {forkable && <option value="fork">Fork (keeps attribution)</option>}
          <option value="copy">Copy and push (independent repository)</option>
        </Select>

        {copying && (
          <>
            <TextBox
              label="Repository name"
              value={this.state.name}
              onValueChanged={this.onNameChanged}
              disabled={this.state.loading}
            />
            <Checkbox
              label="Keep the new repository private"
              value={
                this.state.keepPrivate ? CheckboxValue.On : CheckboxValue.Off
              }
              onChange={this.onKeepPrivateChanged}
            />
          </>
        )}

        {!forkable && (
          <p className="create-fork-note">
            This account&rsquo;s provider does not expose a fork endpoint this
            app can drive, so the repository is copied and pushed instead.
          </p>
        )}
        {this.state.ownersError !== undefined && (
          <p className="create-fork-note" role="status">
            {`Organizations could not be listed, so only your own namespace is offered: ${this.state.ownersError}`}
          </p>
        )}
      </div>
    )
  }

  public render() {
    const account = this.selectedAccount()
    const copying = this.state.strategy === 'copy'
    const destination = `${this.state.ownerLogin}/${
      copying ? this.state.name : this.props.repository.gitHubRepository.name
    }`

    return (
      <Dialog
        title={copying ? 'Copy repository' : 'Fork repository'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.state.error ? undefined : this.onSubmit}
        dismissDisabled={this.state.loading}
        loading={this.state.loading}
        type={this.state.error ? 'error' : 'normal'}
        key={this.props.repository.name}
        id="create-fork"
      >
        {this.state.error !== undefined ? (
          renderCreateForkDialogError(
            this.props.repository,
            account,
            this.state.error,
            this.state.createdForkURL
          )
        ) : (
          <>
            <DialogContent>
              <div className="create-fork-intro">
                <span className="create-fork-icon" aria-hidden="true">
                  <Octicon symbol={octicons.repoForked} height={24} />
                </span>
                <div className="create-fork-copy">
                  <strong>
                    {copying
                      ? 'Copy this repository somewhere you can push'
                      : 'Create your own fork'}
                  </strong>
                  <p>
                    Work independently while keeping the original repository as
                    an upstream source.
                  </p>
                </div>
              </div>

              <div
                className="create-fork-route"
                role="group"
                aria-label="Fork destination"
              >
                <div className="create-fork-endpoint">
                  <span>Source</span>
                  <strong>
                    {this.props.repository.gitHubRepository.fullName}
                  </strong>
                </div>
                <Octicon
                  className="create-fork-arrow"
                  symbol={octicons.arrowRight}
                  height={18}
                />
                <div className="create-fork-endpoint create-fork-endpoint--destination">
                  <span>{copying ? 'New repository' : 'Your fork'}</span>
                  <strong>{destination}</strong>
                </div>
              </div>

              {this.renderDestinationControls()}

              <p className="create-fork-note">
                Desktop Material will point <code>origin</code> at{' '}
                {copying ? 'the new repository' : 'your fork'} and keep the
                source repository available as <code>upstream</code>. Your
                working files and commits stay in place.
              </p>
            </DialogContent>
            <DialogFooter>
              <OkCancelButtonGroup
                okButtonText={
                  copying
                    ? __DARWIN__
                      ? 'Copy Repository'
                      : 'Copy repository'
                    : __DARWIN__
                    ? 'Fork Repository'
                    : 'Fork repository'
                }
                okButtonDisabled={
                  this.state.loading ||
                  (copying && this.state.name.trim().length === 0)
                }
                cancelButtonDisabled={this.state.loading}
              />
            </DialogFooter>
          </>
        )}
      </Dialog>
    )
  }
}

/** Error state message (and buttons) for `CreateForkDialog` */
function renderCreateForkDialogError(
  repository: RepositoryWithGitHubRepository,
  account: Account,
  error: Error,
  createdForkURL?: string
) {
  const suggestionURL =
    createdForkURL ?? repository.gitHubRepository.htmlURL ?? undefined
  const suggestion = suggestionURL ? (
    createdForkURL ? (
      <>
        Your fork was created.{' '}
        <LinkButton uri={suggestionURL}>
          Open it on GitHub and review this repository’s remotes
        </LinkButton>
        .
      </>
    ) : (
      <>
        You can try{' '}
        <LinkButton uri={suggestionURL}>
          creating the fork manually on GitHub
        </LinkButton>
        .
      </>
    )
  ) : undefined
  return (
    <>
      <DialogContent>
        <div className="create-fork-error-copy">
          {createdForkURL === undefined
            ? 'Creating your fork '
            : 'Connecting this repository to your fork '}
          <strong>
            {`${account.login}/${repository.gitHubRepository.name}`}
          </strong>
          {` failed. `}
          {suggestion}
        </div>
        <details>
          <summary>Error details</summary>
          <pre className="error">{error.message}</pre>
        </details>
      </DialogContent>
      <DefaultDialogFooter />
    </>
  )
}
