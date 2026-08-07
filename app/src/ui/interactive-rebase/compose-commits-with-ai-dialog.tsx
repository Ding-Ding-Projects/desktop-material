import * as React from 'react'

import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Loading } from '../lib/loading'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RebaseResult } from '../../lib/git'
import {
  IInteractiveRebasePlan,
  InteractiveRebaseAction,
  updateInteractiveRebaseAction,
  reorderInteractiveRebaseCommit,
} from '../../lib/interactive-rebase/interactive-rebase-plan'
import {
  IInteractiveRebaseEditorLabels,
  InteractiveRebaseEditor,
} from './interactive-rebase-editor'

interface IComposeCommitsWithAIDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  /** The reviewed commits this rebase plan covers, oldest first. */
  readonly commits: ReadonlyArray<Commit>
  /** SHAs in `commits` that have not yet reached the tracked upstream. */
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly onDismissed: () => void
}

type ComposeCommitsWithAIPhase =
  | 'proposing'
  | 'denied'
  | 'reviewing'
  | 'executing'
  | 'completed'
  | 'conflict'
  | 'failed'

interface IComposeCommitsWithAIDialogState {
  readonly phase: ComposeCommitsWithAIPhase
  readonly plan: IInteractiveRebasePlan | null
  readonly summary: string | null
  readonly message: string | null
}

const actionLabels: Readonly<Record<InteractiveRebaseAction, string>> = {
  pick: 'Pick',
  reword: 'Reword',
  edit: 'Edit',
  squash: 'Squash',
  fixup: 'Fixup',
  drop: 'Drop',
}

/**
 * R9 "compose commits with AI": ask the AI provider to propose a rebase
 * plan for a reviewed commit set, then hand that plan to the shared
 * interactive-rebase editor for the user to review, edit, and confirm
 * before anything executes.
 *
 * Rewriting history is destructive, so this dialog never runs the AI's plan
 * automatically: it always stops at the editor's own confirmation step,
 * which shows the final commit list and — when any reviewed commit is not
 * in `localCommitSHAs` (i.e. it has already reached the tracked upstream)
 * — an explicit pushed-history warning the user must separately confirm.
 */
export class ComposeCommitsWithAIDialog extends React.Component<
  IComposeCommitsWithAIDialogProps,
  IComposeCommitsWithAIDialogState
> {
  private readonly abortController = new AbortController()

  public constructor(props: IComposeCommitsWithAIDialogProps) {
    super(props)
    this.state = {
      phase: 'proposing',
      plan: null,
      summary: null,
      message: null,
    }
  }

  public componentDidMount(): void {
    this.propose()
  }

  public componentWillUnmount(): void {
    this.abortController.abort()
  }

  private propose = async () => {
    const { dispatcher, repository, commits } = this.props
    const result = await dispatcher.proposeComposeCommitsPlan(
      repository,
      commits,
      this.abortController.signal
    )

    if (this.abortController.signal.aborted) {
      return
    }

    if (result.kind === 'denied') {
      this.setState({ phase: 'denied', message: result.reason })
      return
    }

    this.setState({
      phase: 'reviewing',
      plan: result.plan,
      summary: result.summary,
    })
  }

  private get hasPushedReviewedCommits(): boolean {
    const { plan } = this.state
    if (plan === null) {
      return false
    }
    const local = new Set(this.props.localCommitSHAs)
    return plan.reviewedCommitIds.some(commitId => !local.has(commitId))
  }

  private onActionChange = (
    commitId: string,
    action: InteractiveRebaseAction
  ) => {
    this.setState(state =>
      state.plan === null
        ? state
        : {
            ...state,
            plan: updateInteractiveRebaseAction(state.plan, commitId, action),
          }
    )
  }

  private onReorder = (commitId: string, beforeCommitId: string | null) => {
    this.setState(state =>
      state.plan === null
        ? state
        : {
            ...state,
            plan: reorderInteractiveRebaseCommit(
              state.plan,
              commitId,
              beforeCommitId
            ),
          }
    )
  }

  private onExecute = async (plan: IInteractiveRebasePlan) => {
    this.setState({ phase: 'executing' })
    const result = await this.props.dispatcher.executeComposeCommitsPlan(
      this.props.repository,
      plan
    )

    if (result === RebaseResult.CompletedWithoutError) {
      this.setState({ phase: 'completed' })
    } else if (result === RebaseResult.ConflictsEncountered) {
      this.setState({
        phase: 'conflict',
        message:
          'The rebase stopped with conflicts. Resolve them in Changes, then continue the rebase from there.',
      })
    } else {
      this.setState({
        phase: 'failed',
        message: 'The rebase could not be completed.',
      })
    }
  }

  private onCancel = () => {
    this.props.onDismissed()
  }

  private getLabels(): IInteractiveRebaseEditorLabels {
    return {
      title: 'Compose commits with AI',
      description:
        'The AI provider proposed the plan below. Review and edit every row before confirming — nothing runs until you confirm.',
      planHeading: 'Proposed plan',
      summaryHeading: 'Summary',
      confirmationHeading: 'Confirm',
      actionLabels,
      commitIdLabel: commit => `Commit ${commit.shortCommitId}`,
      actionSelectorLabel: commit =>
        `Action for ${commit.shortCommitId}: ${commit.subject}`,
      moveUpLabel: () => 'Move up',
      moveDownLabel: () => 'Move down',
      pauseRequiredLabel: 'Pauses for input',
      totalSummary: count => `${count} commit${count === 1 ? '' : 's'} total`,
      pauseSummary: count => `${count} will pause for reword/edit`,
      dropSummary: count => `${count} dropped`,
      foldSummary: count => `${count} folded into an earlier commit`,
      reorderedSummary: reordered =>
        reordered ? 'Commit order changed' : 'Commit order unchanged',
      rewriteWarningTitle: 'This rewrites history',
      rewriteWarningBody:
        'Confirming replaces the reviewed commits with new ones. The originals remain reachable briefly through Git but are not tracked by any branch afterward.',
      pushedHistoryWarningTitle: 'Some of these commits are already pushed',
      pushedHistoryWarningBody:
        'At least one reviewed commit has already reached the tracked upstream. Rewriting it means anyone who already pulled it will need to reconcile their history, and pushing afterward will require a force push.',
      reviewConfirmationLabel: 'I reviewed the plan above and want to proceed',
      pushedHistoryConfirmationLabel:
        'I understand this rewrites commits already pushed to the remote',
      reviewConfirmationRequiredReason:
        'Review the plan and check the confirmation box to continue.',
      pushedHistoryConfirmationRequiredReason:
        'Confirm you understand this rewrites already-pushed commits to continue.',
      executeLabel: 'Rewrite history',
      cancelLabel: 'Cancel',
    }
  }

  private renderContent(): JSX.Element {
    const { phase, plan, message } = this.state

    switch (phase) {
      case 'proposing':
        return (
          <DialogContent>
            <div className="compose-commits-with-ai-dialog__loading">
              <Loading />
              <p>Asking the AI provider to propose a plan…</p>
            </div>
          </DialogContent>
        )
      case 'denied':
        return (
          <DialogContent>
            <p role="alert">{message}</p>
          </DialogContent>
        )
      case 'reviewing':
      case 'executing':
        return plan === null ? (
          <DialogContent>
            <p role="alert">Something went wrong preparing the plan.</p>
          </DialogContent>
        ) : (
          <DialogContent>
            <InteractiveRebaseEditor
              plan={plan}
              labels={this.getLabels()}
              hasPushedReviewedCommits={this.hasPushedReviewedCommits}
              onActionChange={this.onActionChange}
              onReorder={this.onReorder}
              onExecute={this.onExecute}
              onCancel={this.onCancel}
            />
          </DialogContent>
        )
      case 'completed':
        return (
          <DialogContent>
            <div className="compose-commits-with-ai-dialog__result">
              <Octicon symbol={octicons.checkCircleFill} />
              <p>History was rewritten successfully.</p>
            </div>
          </DialogContent>
        )
      case 'conflict':
      case 'failed':
        return (
          <DialogContent>
            <p role="alert">{message}</p>
          </DialogContent>
        )
    }
  }

  public render() {
    const { phase } = this.state
    // The interactive-rebase editor renders its own execute/cancel footer
    // while reviewing, so this dialog's chrome only supplies a footer for
    // the states before and after that (loading, denied, done, failed).
    const showsOwnFooter = phase === 'reviewing' || phase === 'executing'

    return (
      <Dialog
        id="compose-commits-with-ai"
        title="Compose commits with AI"
        loading={phase === 'proposing' || phase === 'executing'}
        disabled={phase === 'proposing' || phase === 'executing'}
        onDismissed={this.props.onDismissed}
        onSubmit={showsOwnFooter ? undefined : this.onCancel}
      >
        {this.renderContent()}
        {showsOwnFooter ? null : (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText="Close"
              cancelButtonVisible={false}
            />
          </DialogFooter>
        )}
      </Dialog>
    )
  }
}
