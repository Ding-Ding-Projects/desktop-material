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

  /** Whether the shared destructive-action gate has been fully operated. */
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
        emojiDecoration="destructive"
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
          {this.renderGate()}
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
          {this.renderConfirmDiscardChanges()}
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

  /**
   * The shared destructive-action gate. Discarding is the one operation in this
   * dialog that cannot be taken back from inside the app, so it goes through
   * the same two keys and full-range slider as every other destructive action.
   */
  private renderGate() {
    const { files, permanentlyDelete } = this.props
    const target =
      files.length > MaxFilesToList
        ? `all ${files.length} changed files`
        : files.map(file => file.path).join(', ')

    return (
      <Md3DestructiveGateBody
        actionId="discard-changes"
        summary={`This discards the uncommitted changes in ${
          files.length === 1 ? '1 file' : `${files.length} files`
        }: ${target}.`}
        irreversible={
          permanentlyDelete
            ? 'The changes are deleted outright. They are not sent anywhere they can be retrieved from.'
            : `The changes leave the working directory. They can only be retrieved from the ${TrashNameLabel}, and never from this app.`
        }
        targetKeyLabel={target}
        effectKeyLabel={
          permanentlyDelete
            ? 'the changes are deleted permanently'
            : `the changes are moved to the ${TrashNameLabel}`
        }
        disabled={this.state.isDiscardingChanges}
        onAuthorizationChanged={this.onGateAuthorizationChanged}
      />
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
    // A destructive `Dialog` submits on Enter from anywhere inside the form,
    // and the affirmative control is a plain button rather than the submit
    // button, so a disabled button alone does not gate the keyboard path.
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
