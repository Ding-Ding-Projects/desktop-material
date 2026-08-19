import * as React from 'react'

import { Repository } from '../../models/repository'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dispatcher } from '../dispatcher'
import { DialogFooter, DialogContent, Dialog } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { observeUserInitiatedOperation } from '../lib/observed-operations'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

interface IConfirmForcePushProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly upstreamBranch: string
  readonly askForConfirmationOnForcePush: boolean
  readonly onDismissed: () => void
}

interface IConfirmForcePushState {
  readonly isLoading: boolean
  readonly askForConfirmationOnForcePush: boolean
  readonly gateAuthorized: boolean
}

export class ConfirmForcePush extends React.Component<
  IConfirmForcePushProps,
  IConfirmForcePushState
> {
  public constructor(props: IConfirmForcePushProps) {
    super(props)

    this.state = {
      isLoading: false,
      askForConfirmationOnForcePush: props.askForConfirmationOnForcePush,
      gateAuthorized: false,
    }
  }

  public render() {
    return (
      <Dialog
        title="Are you sure you want to force push?"
        dismissDisabled={this.state.isLoading}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onForcePush}
        type="warning"
      >
        <DialogContent>
          <p>
            A force push will rewrite history on{' '}
            <Ref>{this.props.upstreamBranch}</Ref>. Any collaborators working on
            this branch will need to reset their own local branch to match the
            history of the remote.
          </p>
          <div>
            <Checkbox
              label="Do not show this message again"
              value={
                this.state.askForConfirmationOnForcePush
                  ? CheckboxValue.Off
                  : CheckboxValue.On
              }
              onChange={this.onAskForConfirmationOnForcePushChanged}
            />
          </div>
          <Md3DestructiveGateBody
            actionId="force-push"
            summary={`Force push ${this.props.upstreamBranch}.`}
            irreversible="Published history on the upstream branch will be rewritten."
            targetKeyLabel={`upstream branch ${this.props.upstreamBranch}`}
            effectKeyLabel="rewriting its published history"
            onAuthorizationChanged={gateAuthorized =>
              this.setState({ gateAuthorized })
            }
            disabled={this.state.isLoading}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="I'm sure"
            okButtonDisabled={
              this.state.isLoading || !this.state.gateAuthorized
            }
            cancelButtonDisabled={this.state.isLoading}
          />
          <p>Emergency exit: Cancel leaves published history unchanged.</p>
        </DialogFooter>
      </Dialog>
    )
  }

  private onAskForConfirmationOnForcePushChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ askForConfirmationOnForcePush: value })
  }

  private onForcePush = () => {
    if (!this.state.gateAuthorized) {
      return
    }
    this.props.dispatcher.setConfirmForcePushSetting(
      this.state.askForConfirmationOnForcePush
    )
    this.props.onDismissed()

    observeUserInitiatedOperation(
      () => this.props.dispatcher.performForcePush(this.props.repository),
      this.props.dispatcher,
      'confirmed force push'
    )
  }
}
