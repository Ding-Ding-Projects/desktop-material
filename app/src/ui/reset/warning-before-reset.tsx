import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'
import { Commit } from '../../models/commit'

interface IWarningBeforeResetProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commit: Commit
  readonly onDismissed: () => void
}

interface IWarningBeforeResetState {
  readonly isLoading: boolean

  /** Whether the shared destructive-action gate has been fully operated. */
  readonly gateAuthorized: boolean
}

/**
 * Dialog that alerts user that there are uncommitted changes in the working
 * directory where they are gonna be resetting to a previous commit.
 */
export class WarningBeforeReset extends React.Component<
  IWarningBeforeResetProps,
  IWarningBeforeResetState
> {
  public constructor(props: IWarningBeforeResetProps) {
    super(props)
    this.state = { isLoading: false, gateAuthorized: false }
  }

  public render() {
    const title = __DARWIN__ ? 'Reset to Commit' : 'Reset to commit'

    return (
      <Dialog
        id="warning-before-reset"
        type="warning"
        title={title}
        loading={this.state.isLoading}
        disabled={this.state.isLoading}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        role="alertdialog"
        ariaDescribedBy="reset-warning-message"
      >
        <DialogContent>
          <Row id="reset-warning-message">
            You have changes in progress. Resetting to a previous commit might
            result in some of these changes being lost. Do you want to continue
            anyway?
          </Row>
          <Md3DestructiveGateBody
            actionId="reset-to-commit"
            summary={`This resets ${
              this.props.repository.name
            } to ${this.props.commit.sha.slice(0, 7)} — ${
              this.props.commit.summary
            } — while the working directory still has changes in progress.`}
            irreversible="Changes in progress that the reset overwrites are not recorded anywhere, so this app cannot bring them back."
            targetKeyLabel={`${
              this.props.repository.name
            } reset to ${this.props.commit.sha.slice(0, 7)}`}
            effectKeyLabel="some of the changes currently in progress may be lost"
            disabled={this.state.isLoading}
            onAuthorizationChanged={this.onGateAuthorizationChanged}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Continue"
            okButtonDisabled={
              this.state.isLoading || !this.state.gateAuthorized
            }
            cancelButtonText="Emergency exit"
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onGateAuthorizationChanged = (gateAuthorized: boolean) => {
    this.setState({ gateAuthorized })
  }

  private onSubmit = async () => {
    // A destructive `Dialog` submits on Enter from anywhere inside the form,
    // and the affirmative control is a plain button rather than the submit
    // button, so a disabled button alone does not gate the keyboard path.
    if (!this.state.gateAuthorized) {
      return
    }

    const { dispatcher, repository, commit, onDismissed } = this.props
    this.setState({ isLoading: true })

    try {
      await dispatcher.resetToCommit(repository, commit, false)
    } finally {
      this.setState({ isLoading: false })
    }

    onDismissed()
  }
}
