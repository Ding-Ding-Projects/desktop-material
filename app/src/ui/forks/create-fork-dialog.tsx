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
import { Account } from '../../models/account'
import { API, IAPIFullRepository } from '../../lib/api'
import { LinkButton } from '../lib/link-button'
import { PopupType } from '../../models/popup'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ICreateForkDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository
  readonly account: Account
  readonly onDismissed: () => void
}

interface ICreateForkDialogState {
  readonly loading: boolean
  readonly error?: Error
  readonly createdForkURL?: string
}

/**
 * Dialog offering to create a fork of the given repository
 */
export class CreateForkDialog extends React.Component<
  ICreateForkDialogProps,
  ICreateForkDialogState
> {
  public constructor(props: ICreateForkDialogProps) {
    super(props)
    this.state = { loading: false }
  }
  /**
   *  Starts fork process on GitHub!
   */
  private onSubmit = async () => {
    this.setState({ loading: true })
    const { gitHubRepository } = this.props.repository
    const api = API.fromAccount(this.props.account)
    let createdFork: IAPIFullRepository | null = null
    try {
      createdFork = await api.forkRepository(
        gitHubRepository.owner.login,
        gitHubRepository.name
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

  public render() {
    return (
      <Dialog
        title="Fork repository"
        onDismissed={this.props.onDismissed}
        onSubmit={this.state.error ? undefined : this.onSubmit}
        dismissDisabled={this.state.loading}
        loading={this.state.loading}
        type={this.state.error ? 'error' : 'normal'}
        key={this.props.repository.name}
        id="create-fork"
      >
        {this.state.error !== undefined
          ? renderCreateForkDialogError(
              this.props.repository,
              this.props.account,
              this.state.error,
              this.state.createdForkURL
            )
          : renderCreateForkDialogContent(
              this.props.repository,
              this.props.account,
              this.state.loading
            )}
      </Dialog>
    )
  }
}

/** Standard (non-error) message and buttons for `CreateForkDialog` */
function renderCreateForkDialogContent(
  repository: RepositoryWithGitHubRepository,
  account: Account,
  loading: boolean
) {
  return (
    <>
      <DialogContent>
        <div className="create-fork-intro">
          <span className="create-fork-icon" aria-hidden="true">
            <Octicon symbol={octicons.repoForked} height={24} />
          </span>
          <div className="create-fork-copy">
            <strong>Create your own GitHub fork</strong>
            <p>
              Work independently while keeping the original repository as an
              upstream source.
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
            <strong>{repository.gitHubRepository.fullName}</strong>
          </div>
          <Octicon
            className="create-fork-arrow"
            symbol={octicons.arrowRight}
            height={18}
          />
          <div className="create-fork-endpoint create-fork-endpoint--destination">
            <span>Your fork</span>
            <strong>{`${account.login}/${repository.gitHubRepository.name}`}</strong>
          </div>
        </div>

        <p className="create-fork-note">
          Desktop Material will point <code>origin</code> at your fork and keep
          the source repository available as <code>upstream</code>. Your working
          files and commits stay in place.
        </p>
      </DialogContent>
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={__DARWIN__ ? 'Fork Repository' : 'Fork repository'}
          okButtonDisabled={loading}
          cancelButtonDisabled={loading}
        />
      </DialogFooter>
    </>
  )
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
