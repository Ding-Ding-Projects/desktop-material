import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { PathText } from '../lib/path-text'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TrashNameLabel } from '../lib/context-menu'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

interface IDiscardChangesProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  readonly confirmDiscardChanges: boolean
  /**
   * Determines whether to show the option
   * to ask for confirmation when discarding
   * changes
   */
  readonly discardingAllChanges: boolean
  readonly permanentlyDelete: boolean
  readonly showDiscardChangesSetting: boolean
  readonly onDismissed: () => void
  readonly onConfirmDiscardChangesChanged: (optOut: boolean) => void
}

interface IDiscardChangesState {
  /**
   * Whether or not we're currently in the process of discarding
   * changes. This is used to display a loading state
   */
  readonly isDiscardingChanges: boolean

  readonly confirmDiscardChanges: boolean

  readonly gateAuthorized: boolean
}

/**
 * If we're discarding any more than this number, we won't bother listing them
 * all.
 */
const MaxFilesToList = 10

/** A component to confirm and then discard changes. */
export class DiscardChanges extends React.Component<
  IDiscardChangesProps,
  IDiscardChangesState
> {
  public constructor(props: IDiscardChangesProps) {
    super(props)

    this.state = {
      isDiscardingChanges: false,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      gateAuthorized: false,
    }
  }

  private getOkButtonLabel() {
    if (this.props.discardingAllChanges) {
      return __DARWIN__ ? 'Discard All Changes' : 'Discard all changes'
    }
    return __DARWIN__ ? 'Discard Changes' : 'Discard changes'
  }

  private getDialogTitle() {
    if (this.props.discardingAllChanges) {
      return __DARWIN__
        ? 'Confirm Discard All Changes'
        : 'Confirm discard all changes'
    }
    return __DARWIN__ ? 'Confirm Discard Changes' : 'Confirm discard changes'
  }

  public render() {
    const isDiscardingChanges = this.state.isDiscardingChanges

    return (
      <Dialog
        id="discard-changes"
        title={this.getDialogTitle()}
        onDismissed={this.props.onDismissed}
        onSubmit={this.discard}
        dismissDisabled={isDiscardingChanges}
        loading={isDiscardingChanges}
        disabled={isDiscardingChanges}
        type="warning"
        role="alertdialog"
        ariaDescribedBy="discard-changes-confirmation-file-list discard-changes-confirmation-message"
      >
        <DialogContent>
          {this.renderFileList()}
          {this.props.permanentlyDelete ? (
            <p id="discard-changes-confirmation-message">
              <span className="warning-icon">⚠️</span>{' '}
              <b>Changes CANNOT be restored after deletion!</b>
            </p>
          ) : (
            <p id="discard-changes-confirmation-message">
              Changes can be restored by retrieving them from the{' '}
              {TrashNameLabel}.
            </p>
          )}
          <Md3DestructiveGateBody
            actionId="discard-changes"
            summary={
              this.props.discardingAllChanges
                ? 'Discard all selected changes.'
                : 'Discard the selected changes.'
            }
            irreversible={
              this.props.permanentlyDelete
                ? 'These changes cannot be restored after deletion.'
                : 'The selected changes will be moved to the trash.'
            }
            targetKeyLabel="the selected files"
            effectKeyLabel="discarding their changes"
            onAuthorizationChanged={gateAuthorized =>
              this.setState({ gateAuthorized })
            }
            disabled={isDiscardingChanges}
          />
          {this.renderConfirmDiscardChanges()}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={this.getOkButtonLabel()}
            okButtonDisabled={isDiscardingChanges || !this.state.gateAuthorized}
            cancelButtonDisabled={isDiscardingChanges}
          />
          <p>Emergency exit: Cancel leaves the selected changes untouched.</p>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderConfirmDiscardChanges() {
    if (this.props.showDiscardChangesSetting) {
      return (
        <Checkbox
          label="Do not show this message again"
          value={
            this.state.confirmDiscardChanges
              ? CheckboxValue.Off
              : CheckboxValue.On
          }
          onChange={this.onConfirmDiscardChangesChanged}
        />
      )
    } else {
      // since we ignore the users option to not show
      // confirmation, we don't want to show a checkbox
      // that will have no effect
      return null
    }
  }

  private renderFileList() {
    if (this.props.files.length > MaxFilesToList) {
      return (
        <p id="discard-changes-confirmation-file-list">
          Are you sure you want to discard all {this.props.files.length} changed
          files?
        </p>
      )
    } else {
      return (
        <div id="discard-changes-confirmation-file-list">
          <p>Are you sure you want to discard all changes to:</p>
          <div className="file-list">
            <ul>
              {this.props.files.map(p => (
                <li key={p.id}>
                  <PathText path={p.path} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )
    }
  }

  private discard = async () => {
    if (!this.state.gateAuthorized) {
      return
    }
    this.setState({ isDiscardingChanges: true })

    const moveToTrash = !this.props.permanentlyDelete
    await this.props.dispatcher.discardChanges(
      this.props.repository,
      this.props.files,
      moveToTrash,
      this.props.permanentlyDelete
    )

    this.props.onConfirmDiscardChangesChanged(this.state.confirmDiscardChanges)
    this.props.onDismissed()
  }

  private onConfirmDiscardChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ confirmDiscardChanges: value })
  }
}
