import * as React from 'react'
import * as Path from 'path'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

interface IDeleteWorktreeDialogProps {
  readonly repository: Repository
  readonly worktreePath: string
  readonly onDeleteWorktree: (
    repository: Repository,
    worktreePath: string
  ) => Promise<void>
  readonly onDismissed: () => void
}

interface IDeleteWorktreeDialogState {
  readonly isDeleting: boolean
  readonly authorized: boolean
  readonly error: string | null
}

export class DeleteWorktreeDialog extends React.Component<
  IDeleteWorktreeDialogProps,
  IDeleteWorktreeDialogState
> {
  public constructor(props: IDeleteWorktreeDialogProps) {
    super(props)

    this.state = {
      isDeleting: false,
      authorized: false,
      error: null,
    }
  }

  public render() {
    const name = Path.basename(this.props.worktreePath)

    return (
      <Dialog
        id="delete-worktree"
        title={__DARWIN__ ? 'Delete Worktree' : 'Delete worktree'}
        type="warning"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
        role="alertdialog"
        ariaDescribedBy="delete-worktree-confirmation"
      >
        <DialogContent>
          <p id="delete-worktree-confirmation">
            Are you sure you want to delete the worktree <Ref>{name}</Ref>?
          </p>
          <Md3DestructiveGateBody
            actionId="delete-worktree"
            summary={`Delete the linked worktree ${name}.`}
            irreversible="The worktree directory and any uncommitted files in it cannot be recovered by this action."
            targetKeyLabel={`the linked worktree ${name}`}
            effectKeyLabel={`deleting the worktree directory ${name}`}
            disabled={this.state.isDeleting}
            onAuthorizationChanged={authorized => this.setState({ authorized })}
          />
          {this.state.error !== null && (
            <div role="alert">
              <p>{this.state.error}</p>
              <Button onClick={this.onRetry} disabled={this.state.isDeleting}>
                Retry delete
              </Button>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Delete"
            okButtonDisabled={!this.state.authorized || this.state.isDeleting}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    if (!this.state.authorized || this.state.isDeleting) {
      return
    }
    this.setState({ isDeleting: true })
    try {
      await this.props.onDeleteWorktree(
        this.props.repository,
        this.props.worktreePath
      )
      this.props.onDismissed()
    } catch (error) {
      this.setState({
        isDeleting: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private onRetry = () => {
    void this.onSubmit()
  }
}
