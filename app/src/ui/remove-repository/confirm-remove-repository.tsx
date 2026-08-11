import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { Repository } from '../../models/repository'
import { TrashNameLabel } from '../lib/context-menu'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'
import { DefaultAppDisplayName } from '../../models/app-identity'
import { RemoveRepositoryResult } from '../../models/remove-repository-result'
import { t } from '../../lib/i18n'

interface IConfirmRemoveRepositoryProps {
  /** The repository to be removed */
  readonly repository: Repository

  /**
   * The action to execute when the user confirms. Resolves with the outcome so
   * the dialog can react to a failed Recycle Bin/Trash move by offering a
   * "Force delete permanently" fallback.
   */
  readonly onConfirmation: (
    repo: Repository,
    deleteRepoFromDisk: boolean
  ) => Promise<RemoveRepositoryResult>

  /**
   * The action to execute when the user, after a failed Recycle Bin/Trash move,
   * confirms that the repository directory should be permanently deleted.
   */
  readonly onForceDelete: (repo: Repository) => Promise<void>

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

interface IConfirmRemoveRepositoryState {
  readonly deleteRepoFromDisk: boolean
  readonly isRemovingRepository: boolean
  /**
   * Whether the Recycle Bin/Trash move failed on the last attempt, so the
   * dialog should surface the permanent "Force delete" fallback.
   */
  readonly trashFailed: boolean

  /** Whether the shared destructive-action gate has been fully operated. */
  readonly gateAuthorized: boolean
}

export class ConfirmRemoveRepository extends React.Component<
  IConfirmRemoveRepositoryProps,
  IConfirmRemoveRepositoryState
> {
  public constructor(props: IConfirmRemoveRepositoryProps) {
    super(props)

    this.state = {
      deleteRepoFromDisk: false,
      isRemovingRepository: false,
      trashFailed: false,
      gateAuthorized: false,
    }
  }

  private onSubmit = async () => {
    // A destructive `Dialog` submits on Enter from anywhere inside the form,
    // and the affirmative control is a plain button rather than the submit
    // button, so a disabled button alone does not gate the keyboard path.
    if (!this.state.gateAuthorized) {
      return
    }

    this.setState({ isRemovingRepository: true })

    const result = await this.props.onConfirmation(
      this.props.repository,
      this.state.deleteRepoFromDisk
    )

    if (result === 'trash-failed') {
      // Keep the dialog open and offer the explicit, clearly-warned fallback.
      // The fallback deletes permanently rather than moving to the trash,
      // which is a different consequence from the one the user authorized, so
      // the gate is re-armed rather than carried over.
      this.setState({
        isRemovingRepository: false,
        trashFailed: true,
        gateAuthorized: false,
      })
      return
    }

    this.props.onDismissed()
  }

  private onForceDelete = async () => {
    // A destructive `Dialog` submits on Enter from anywhere inside the form,
    // and the affirmative control is a plain button rather than the submit
    // button, so a disabled button alone does not gate the keyboard path.
    if (!this.state.gateAuthorized) {
      return
    }

    this.setState({ isRemovingRepository: true })

    await this.props.onForceDelete(this.props.repository)

    this.props.onDismissed()
  }

  public render() {
    const isRemovingRepository = this.state.isRemovingRepository
    const trashFailed = this.state.trashFailed

    return (
      <Dialog
        id="confirm-remove-repository"
        key="remove-repository-confirmation"
        type="warning"
        title={__DARWIN__ ? 'Remove Repository' : 'Remove repository'}
        dismissDisabled={isRemovingRepository}
        loading={isRemovingRepository}
        disabled={isRemovingRepository}
        onDismissed={this.props.onDismissed}
        onSubmit={trashFailed ? this.onForceDelete : this.onSubmit}
      >
        <DialogContent>
          <p>
            Are you sure you want to remove the repository "
            {this.props.repository.name}" from {DefaultAppDisplayName}?
          </p>
          <div className="description">
            <p>The repository will be removed from {DefaultAppDisplayName}:</p>
            <p>
              <Ref>{this.props.repository.path}</Ref>
            </p>
          </div>

          {trashFailed ? (
            <div className="trash-failed-warning">
              <p>
                {t('removeRepository.trashFailedMessage', {
                  trash: TrashNameLabel,
                })}
              </p>
              <p>
                <strong>{t('removeRepository.trashFailedWarning', {})}</strong>
              </p>
            </div>
          ) : (
            <div>
              <Checkbox
                label={'Also move this repository to ' + TrashNameLabel}
                value={
                  this.state.deleteRepoFromDisk
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                onChange={this.onConfirmRepositoryDeletion}
              />
            </div>
          )}
          {/*
            The key remounts the gate whenever the consequence changes — the
            trash step failing and turning this into a permanent delete, or the
            user opting the directory in or out. Without it the gate keeps the
            authorization the user gave for a different outcome, which is
            exactly the thing two keys and a slider exist to prevent.
          */}
          <Md3DestructiveGateBody
            key={`remove-repository-${trashFailed}-${this.state.deleteRepoFromDisk}`}
            actionId="remove-repository"
            summary={
              trashFailed
                ? `This permanently deletes the directory ${this.props.repository.path} from disk.`
                : `This removes ${
                    this.props.repository.name
                  } from ${DefaultAppDisplayName}${
                    this.state.deleteRepoFromDisk
                      ? `, and moves ${this.props.repository.path} to the ${TrashNameLabel}`
                      : '. The directory stays on disk'
                  }.`
            }
            irreversible={
              trashFailed
                ? `The directory is deleted outright, so it is not sent to the ${TrashNameLabel} and cannot be restored from there.`
                : this.state.deleteRepoFromDisk
                ? `The working directory can only be retrieved from the ${TrashNameLabel}, and never from ${DefaultAppDisplayName}.`
                : `Only the ${DefaultAppDisplayName} entry goes. The directory, its history and its uncommitted work stay exactly where they are.`
            }
            targetKeyLabel={
              trashFailed
                ? `the directory ${this.props.repository.path}`
                : `${this.props.repository.name} at ${this.props.repository.path}`
            }
            effectKeyLabel={
              trashFailed
                ? 'the directory is deleted permanently from disk'
                : this.state.deleteRepoFromDisk
                ? `the entry is removed and the directory is moved to the ${TrashNameLabel}`
                : 'the entry is removed and the directory is left on disk'
            }
            disabled={isRemovingRepository}
            onAuthorizationChanged={this.onGateAuthorizationChanged}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={
              trashFailed
                ? t('removeRepository.forceDeleteButton', {})
                : 'Remove'
            }
            okButtonDisabled={
              isRemovingRepository || !this.state.gateAuthorized
            }
            cancelButtonText="Emergency exit"
            cancelButtonDisabled={isRemovingRepository}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onGateAuthorizationChanged = (gateAuthorized: boolean) => {
    this.setState({ gateAuthorized })
  }

  private onConfirmRepositoryDeletion = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ deleteRepoFromDisk: value })
  }
}
