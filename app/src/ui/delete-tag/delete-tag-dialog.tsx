import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

interface IDeleteTagProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly tagName: string
  readonly onDismissed: () => void
}

interface IDeleteTagState {
  readonly isDeleting: boolean
  readonly authorized: boolean
  readonly error: Error | null
}

export class DeleteTag extends React.Component<
  IDeleteTagProps,
  IDeleteTagState
> {
  public constructor(props: IDeleteTagProps) {
    super(props)

    this.state = {
      isDeleting: false,
      authorized: false,
      error: null,
    }
  }

  public render() {
    return (
      <Dialog
        id="delete-tag"
        title={__DARWIN__ ? 'Delete Tag' : 'Delete tag'}
        type="warning"
        onSubmit={this.DeleteTag}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
        role="alertdialog"
        ariaDescribedBy="delete-tag-confirmation"
      >
        <DialogContent>
          {this.state.error && (
            <DialogError>
              Unable to delete this tag: {this.state.error.message}. You can
              retry after reviewing the same tag.
            </DialogError>
          )}
          <div id="delete-tag-confirmation">
            <Md3DestructiveGateBody
              actionId="delete-tag"
              summary={`Delete tag ${this.props.tagName}.`}
              irreversible="The tag and its published deletion cannot be undone."
              targetKeyLabel={`the tag ${this.props.tagName}`}
              effectKeyLabel="the irreversible deletion"
              disabled={this.state.isDeleting}
              onAuthorizationChanged={this.onAuthorizationChanged}
            />
            <p>
              The exact tag is <Ref>{this.props.tagName}</Ref>.
            </p>
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Delete tag"
            okButtonDisabled={!this.state.authorized || this.state.isDeleting}
            cancelButtonText="Emergency exit"
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private DeleteTag = async () => {
    const { dispatcher, repository, tagName } = this.props

    if (!this.state.authorized || this.state.isDeleting) {
      return
    }

    this.setState({ isDeleting: true, error: null })

    try {
      await dispatcher.deleteTag(repository, tagName)
      this.props.onDismissed()
    } catch (error) {
      this.setState({
        isDeleting: false,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  private onAuthorizationChanged = (authorized: boolean) => {
    if (!this.state.isDeleting && authorized !== this.state.authorized) {
      this.setState({ authorized })
    }
  }
}
