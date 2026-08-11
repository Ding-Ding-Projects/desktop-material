import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { PathText } from '../lib/path-text'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'
import { ITextDiff, DiffSelection } from '../../models/diff'

interface IDiscardSelectionProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  /**
   * The file where the selection of changes to discard should be applied.
   */
  readonly file: WorkingDirectoryFileChange
  /**
   * The current diff with the local changes for that file.
   */
  readonly diff: ITextDiff
  /**
   * The selection (based on the passed diff) of changes to discard.
   */
  readonly selection: DiffSelection
  /**
   * Function called when the user either dismisses the dialog or
   * the discard operation finishes.
   */
  readonly onDismissed: () => void
}

interface IDiscardSelectionState {
  /**
   * Whether or not we're currently in the process of discarding
   * changes. This is used to display a loading state
   */
  readonly isDiscardingSelection: boolean
  /**
   * Whether or not the "do not show this message again" checkbox
   * is checked.
   */
  readonly confirmDiscardSelection: boolean

  /** Whether the shared destructive-action gate has been fully operated. */
  readonly gateAuthorized: boolean
}

/** A component to confirm and then discard changes from a selection. */
export class DiscardSelection extends React.Component<
  IDiscardSelectionProps,
  IDiscardSelectionState
> {
  public constructor(props: IDiscardSelectionProps) {
    super(props)

    this.state = {
      isDiscardingSelection: false,
      confirmDiscardSelection: true,
      gateAuthorized: false,
    }
  }

  private getOkButtonLabel() {
    return __DARWIN__ ? 'Discard Changes' : 'Discard changes'
  }

  public render() {
    const isDiscardingChanges = this.state.isDiscardingSelection

    return (
      <Dialog
        id="discard-changes"
        title={
          __DARWIN__ ? 'Confirm Discard changes' : 'Confirm discard changes'
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.discard}
        dismissDisabled={isDiscardingChanges}
        loading={isDiscardingChanges}
        disabled={isDiscardingChanges}
        type="warning"
      >
        <DialogContent>
          <p>Are you sure you want to discard the selected changes to:</p>

          <ul>
            <li>
              <PathText path={this.props.file.path} />
            </li>
          </ul>

          <Md3DestructiveGateBody
            actionId="discard-selection"
            summary={`This discards the selected lines of the uncommitted diff in ${this.props.file.path}.`}
            irreversible="The selected lines leave the working directory and are not recoverable from this app."
            targetKeyLabel={`the selected changes in ${this.props.file.path}`}
            effectKeyLabel="those lines are discarded and the rest of the file is left alone"
            disabled={this.state.isDiscardingSelection}
            onAuthorizationChanged={this.onGateAuthorizationChanged}
          />

          <Checkbox
            label="Do not show this message again"
            value={
              this.state.confirmDiscardSelection
                ? CheckboxValue.Off
                : CheckboxValue.On
            }
            onChange={this.onConfirmDiscardSelectionChanged}
          />
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={this.getOkButtonLabel()}
            okButtonDisabled={isDiscardingChanges || !this.state.gateAuthorized}
            cancelButtonText="Emergency exit"
            cancelButtonDisabled={isDiscardingChanges}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onGateAuthorizationChanged = (gateAuthorized: boolean) => {
    this.setState({ gateAuthorized })
  }

  private discard = async () => {
    // A destructive `Dialog` submits on Enter from anywhere inside the form,
    // and the affirmative control is a plain button rather than the submit
    // button, so a disabled button alone does not gate the keyboard path.
    if (!this.state.gateAuthorized) {
      return
    }

    this.setState({ isDiscardingSelection: true })

    await this.props.dispatcher.discardChangesFromSelection(
      this.props.repository,
      this.props.file.path,
      this.props.diff,
      this.props.selection
    )
    this.props.dispatcher.setConfirmDiscardChangesSetting(
      this.state.confirmDiscardSelection
    )
    this.props.onDismissed()
  }

  private onConfirmDiscardSelectionChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ confirmDiscardSelection: value })
  }
}
