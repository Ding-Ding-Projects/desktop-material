import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Commit } from '../../models/commit'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

interface IWarningBeforeResetProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commit: Commit
  readonly onDismissed: () => void
}

interface IWarningBeforeResetState {
  readonly isLoading: boolean
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
            summary={`Reset to commit ${this.props.commit.sha}.`}
            irreversible="Uncommitted working-directory changes may be lost."
            targetKeyLabel="the current working directory"
            effectKeyLabel="resetting to the selected commit"
            onAuthorizationChanged={gateAuthorized =>
              this.setState({ gateAuthorized })
            }
            disabled={this.state.isLoading}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Continue"
            okButtonDisabled={
              this.state.isLoading || !this.state.gateAuthorized
            }
            cancelButtonDisabled={this.state.isLoading}
          />
          <p>Emergency exit: Cancel keeps the current changes.</p>
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
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
