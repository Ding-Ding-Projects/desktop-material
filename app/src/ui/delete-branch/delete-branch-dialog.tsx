import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

interface IDeleteBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly existsOnRemote: boolean
  readonly expectedSha?: string
  readonly onDismissed: () => void
  readonly onDeleted: (repository: Repository) => void
}

interface IDeleteBranchState {
  readonly includeRemoteBranch: boolean
  readonly isDeleting: boolean
  readonly gateAuthorized: boolean
}

export class DeleteBranch extends React.Component<
  IDeleteBranchProps,
  IDeleteBranchState
> {
  public constructor(props: IDeleteBranchProps) {
    super(props)

    this.state = {
      includeRemoteBranch: false,
      isDeleting: false,
      gateAuthorized: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="delete-branch"
        title={__DARWIN__ ? 'Delete Branch' : 'Delete branch'}
        type="warning"
        onSubmit={this.deleteBranch}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
        role="alertdialog"
        ariaDescribedBy="delete-branch-confirmation-message delete-branch-confirmation-message-remote"
      >
        <DialogContent>
          <div id="delete-branch-confirmation-message">
            <p>
              Delete branch <Ref>{this.props.branch.name}</Ref>?
            </p>
            <p>This action cannot be undone.</p>

            {this.renderDeleteOnRemote()}
            <Md3DestructiveGateBody
              actionId="delete-branch"
              summary={`Delete branch ${this.props.branch.name}.`}
              irreversible="The branch and any selected remote copy cannot be restored by this action."
              targetKeyLabel={`branch ${this.props.branch.name}`}
              effectKeyLabel="deleting the branch"
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
          <p>Emergency exit: Cancel leaves the branch unchanged.</p>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderDeleteOnRemote() {
    if (this.props.branch.upstreamRemoteName && this.props.existsOnRemote) {
      return (
        <div>
          <p id="delete-branch-confirmation-message-remote">
            <strong>
              The branch also exists on the remote, do you wish to delete it
              there as well?
            </strong>
          </p>
          <Checkbox
            label="Yes, delete this branch on the remote"
            value={
              this.state.includeRemoteBranch
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onIncludeRemoteChanged}
          />
        </div>
      )
    }

    return null
  }

  private onIncludeRemoteChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ includeRemoteBranch: value })
  }

  private deleteBranch = async () => {
    if (!this.state.gateAuthorized) {
      return
    }
    const { dispatcher, repository, branch } = this.props

    this.setState({ isDeleting: true })

    const deleted = await dispatcher.deleteLocalBranch(
      repository,
      branch,
      this.state.includeRemoteBranch,
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
