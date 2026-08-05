import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { DialogHeader } from '../dialog/header'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Account } from '../../models/account'
import { getAvatarUsersForCommit } from '../../models/avatar'
import { Avatar } from '../lib/avatar'
import { CommitAttribution } from '../lib/commit-attribution'
import { RelativeTime } from '../relative-time'
import { formatDate } from '../../lib/format-date'
import { PathText } from '../lib/path-text'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  ChangeSummaryResultChange,
  IChangeSummaryResult,
} from '../../lib/change-summary/change-summary-model'

interface ICommitSummaryDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commits: ReadonlyArray<Commit>
  readonly accounts: ReadonlyArray<Account>
  readonly preferAbsoluteDates: boolean
  readonly onDismissed: () => void
}

type CommitSummaryDialogPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'result'; readonly result: IChangeSummaryResult }
  | { readonly kind: 'error'; readonly message: string }

interface ICommitSummaryDialogState {
  readonly phase: CommitSummaryDialogPhase
}

const CommitSummaryDialogTitleId = 'Dialog_Commit_Summary'

/**
 * "Explaining N commits" — shows a plain-language AI summary of a selected
 * set of commits: one row per commit (author, date), a prose summary of the
 * whole selection, and a bulleted list of what changed in each file.
 */
export class CommitSummaryDialog extends React.Component<
  ICommitSummaryDialogProps,
  ICommitSummaryDialogState
> {
  private readonly abortController = new AbortController()

  public constructor(props: ICommitSummaryDialogProps) {
    super(props)
    this.state = { phase: { kind: 'loading' } }
  }

  public componentDidMount() {
    this.requestSummary()
  }

  public componentWillUnmount() {
    this.abortController.abort()
  }

  private async requestSummary() {
    const { dispatcher, repository, commits } = this.props
    try {
      const result = await dispatcher.summarizeCommitsWithAI(
        repository,
        commits,
        this.abortController.signal
      )
      if (this.abortController.signal.aborted) {
        return
      }
      if (result.kind === 'denied') {
        this.setState({ phase: { kind: 'error', message: result.reason } })
        return
      }
      this.setState({ phase: { kind: 'result', result: result.result } })
    } catch (e) {
      if (this.abortController.signal.aborted) {
        return
      }
      const message =
        e instanceof Error
          ? e.message
          : 'Could not generate a summary for these commits.'
      this.setState({ phase: { kind: 'error', message } })
    }
  }

  private renderCommitRow = (commit: Commit) => {
    const { repository, accounts, preferAbsoluteDates } = this.props
    const gitHubRepository = repository.gitHubRepository
    const avatarUsers = getAvatarUsersForCommit(gitHubRepository, commit)

    return (
      <li key={commit.sha} className="commit-summary-dialog-commit-row">
        <Avatar accounts={accounts} user={avatarUsers[0]} size={20} />
        <span className="commit-summary-dialog-commit-subject">
          {commit.summary}
        </span>
        <span className="commit-summary-dialog-commit-byline">
          <CommitAttribution avatarUsers={avatarUsers} />
          {' • '}
          {preferAbsoluteDates ? (
            formatDate(commit.author.date)
          ) : (
            <RelativeTime date={commit.author.date} />
          )}
        </span>
      </li>
    )
  }

  private renderChange = (change: ChangeSummaryResultChange) => {
    return (
      <li key={change.path} className="commit-summary-dialog-change-row">
        <PathText path={change.path} />
        <span className="commit-summary-dialog-change-description">
          {change.availability === 'value'
            ? change.description
            : change.explanation}
        </span>
      </li>
    )
  }

  private renderBody() {
    const { phase } = this.state

    if (phase.kind === 'loading') {
      return (
        <div className="commit-summary-dialog-loading">
          <Octicon
            className="commit-summary-dialog-loading-icon"
            symbol={octicons.copilot}
          />
          <span>Explaining these commits…</span>
        </div>
      )
    }

    if (phase.kind === 'error') {
      return <div className="commit-summary-dialog-error">{phase.message}</div>
    }

    const { result } = phase
    return (
      <>
        <p className="commit-summary-dialog-summary">{result.summary}</p>
        <h2 className="commit-summary-dialog-changes-heading">Changes</h2>
        <ul className="commit-summary-dialog-changes">
          {result.changes.map(this.renderChange)}
        </ul>
      </>
    )
  }

  public render() {
    const { commits } = this.props
    const title = `Explaining ${commits.length} commit${
      commits.length === 1 ? '' : 's'
    }`

    return (
      <Dialog
        id="commit-summary-dialog"
        titleId={CommitSummaryDialogTitleId}
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
      >
        <DialogHeader
          title={title}
          titleId={CommitSummaryDialogTitleId}
          showCloseButton={true}
          onCloseButtonClick={this.props.onDismissed}
        />
        <DialogContent>
          <ul className="commit-summary-dialog-commit-list">
            {commits.map(this.renderCommitRow)}
          </ul>
          {this.renderBody()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Close"
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
