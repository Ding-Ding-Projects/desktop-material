import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

interface IDeleteRemoteBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly expectedSha?: string
  readonly onDismissed: () => void
  readonly onDeleted: (repository: Repository) => void
}
interface IDeleteRemoteBranchState {
  readonly isDeleting: boolean
  readonly gateAuthorized: boolean
}
export class DeleteRemoteBranch extends React.Component<
  IDeleteRemoteBranchProps,
  IDeleteRemoteBranchState
> {
  public constructor(props: IDeleteRemoteBranchProps) {
    super(props)

    this.state = {
      isDeleting: false,
      gateAuthorized: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="delete-branch"
        title={__DARWIN__ ? 'Delete Remote Branch' : 'Delete remote branch'}
        type="warning"
        onSubmit={this.deleteBranch}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
        role="alertdialog"
        ariaDescribedBy="delete-branch-confirmation-message"
      >
        <DialogContent>
          <div id="delete-branch-confirmation-message">
            <p>
              Delete remote branch <Ref>{this.props.branch.name}</Ref>?
            </p>
            <p>This action cannot be undone.</p>

            <p>
              This branch does not exist locally. Deleting it may impact others
              collaborating on this branch.
            </p>
            <Md3DestructiveGateBody
              actionId="delete-remote-branch"
              summary={`Delete remote branch ${this.props.branch.name}.`}
              irreversible="The remote branch cannot be restored by this action."
              targetKeyLabel={`remote branch ${this.props.branch.name}`}
              effectKeyLabel="deleting the remote branch"
              onAuthorizationChanged={gateAuthorized =>
                this.setState({ gateAuthorized })
              }
              disabled={this.state.isDeleting}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Delete"
            okButtonDisabled={
              this.state.isDeleting || !this.state.gateAuthorized
            }
            cancelButtonDisabled={this.state.isDeleting}
          />
          <p>Emergency exit: Cancel leaves the remote branch unchanged.</p>
        </DialogFooter>
      </Dialog>
    )
  }

  private deleteBranch = async () => {
    if (!this.state.gateAuthorized) {
      return
    }
    const { dispatcher, repository, branch } = this.props

    this.setState({ isDeleting: true })

    const deleted = await dispatcher.deleteRemoteBranch(
      repository,
      branch,
      this.props.expectedSha
    )
    if (deleted !== true) {
      this.setState({ isDeleting: false })
      return
    }
    this.props.onDeleted(repository)

    this.props.onDismissed()
  }
}
