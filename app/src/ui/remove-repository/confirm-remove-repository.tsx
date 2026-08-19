import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { Repository } from '../../models/repository'
import { TrashNameLabel } from '../lib/context-menu'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { DefaultAppDisplayName } from '../../models/app-identity'
import { RemoveRepositoryResult } from '../../models/remove-repository-result'
import { t } from '../../lib/i18n'
import { Md3DestructiveGateBody } from '../md3/md3-destructive-gate'

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
      this.setState({ isRemovingRepository: false, trashFailed: true })
      return
    }

    this.props.onDismissed()
  }

  private onForceDelete = async () => {
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
          <Md3DestructiveGateBody
            actionId="remove-repository"
            summary={`Remove repository ${this.props.repository.name}.`}
            irreversible={
              trashFailed
                ? 'The repository directory will be permanently deleted.'
                : 'The repository entry will be removed from the application.'
            }
            targetKeyLabel={`repository ${this.props.repository.name}`}
            effectKeyLabel={
              trashFailed
                ? 'permanently deleting its files'
                : 'removing the repository'
            }
            onAuthorizationChanged={gateAuthorized =>
              this.setState({ gateAuthorized })
            }
            disabled={isRemovingRepository}
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
            cancelButtonDisabled={isRemovingRepository}
          />
          <p>Emergency exit: Cancel leaves the repository untouched.</p>
        </DialogFooter>
      </Dialog>
    )
  }

  private onConfirmRepositoryDeletion = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ deleteRepoFromDisk: value })
  }
}
