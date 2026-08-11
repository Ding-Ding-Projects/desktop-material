import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
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

  /** Whether the shared destructive-action gate has been fully operated. */
  readonly gateAuthorized: boolean
}

export class DeleteTag extends React.Component<
  IDeleteTagProps,
  IDeleteTagState
> {
  public constructor(props: IDeleteTagProps) {
    super(props)

    this.state = {
      isDeleting: false,
      gateAuthorized: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="delete-tag"
        emojiDecoration="destructive"
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
          <p id="delete-tag-confirmation">
            Are you sure you want to delete the tag{' '}
            <Ref>{this.props.tagName}</Ref>?
          </p>
          <Md3DestructiveGateBody
            actionId="delete-tag"
            summary={`This deletes the tag ${this.props.tagName} from ${this.props.repository.name}.`}
            irreversible={`Once the deletion is pushed, ${this.props.tagName} no longer points at its commit anywhere it was published.`}
            targetKeyLabel={`the tag ${this.props.tagName}`}
            effectKeyLabel="the tag is removed and this app cannot recreate it for you"
            disabled={this.state.isDeleting}
            onAuthorizationChanged={this.onGateAuthorizationChanged}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Delete"
            okButtonDisabled={
              this.state.isDeleting || !this.state.gateAuthorized
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

  private DeleteTag = async () => {
    // A destructive `Dialog` submits on Enter from anywhere inside the form,
    // and the affirmative control is a plain button rather than the submit
    // button, so a disabled button alone does not gate the keyboard path.
    if (!this.state.gateAuthorized) {
      return
    }

    const { dispatcher, repository, tagName } = this.props

    this.setState({ isDeleting: true })

    await dispatcher.deleteTag(repository, tagName)
    this.props.onDismissed()
  }
}
