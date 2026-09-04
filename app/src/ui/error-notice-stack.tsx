import { MaterialSymbol } from './lib/material-symbol'
import * as React from 'react'

import { IErrorNotice, IErrorNoticeAction } from '../models/error-notice'
import { TooltippedContent } from './lib/tooltipped-content'
import { TooltipDirection } from './lib/tooltip'
import { t } from '../lib/i18n'

interface IErrorNoticeCardProps {
  readonly notice: IErrorNotice
  readonly onDismiss: (id: string) => void
  readonly onShowDetails?: (notice: IErrorNotice) => void
  readonly onAction?: (notice: IErrorNotice, action: IErrorNoticeAction) => void
}

interface IErrorNoticeCardState {
  readonly detailsExpanded: boolean
  readonly confirmingLockRemoval: boolean
  /** The workflow replacement discards the user's edits, so it confirms first. */
  readonly confirmingWorkflowUpdate: boolean
}

class ErrorNoticeCard extends React.PureComponent<
  IErrorNoticeCardProps,
  IErrorNoticeCardState
> {
  public state: IErrorNoticeCardState = {
    detailsExpanded: false,
    confirmingLockRemoval: false,
    confirmingWorkflowUpdate: false,
  }

  private onDismiss = () => {
    this.props.onDismiss(this.props.notice.id)
  }

  private onShowDetails = () => {
    if (this.props.onShowDetails !== undefined) {
      this.props.onShowDetails(this.props.notice)
      return
    }

    this.setState(state => ({ detailsExpanded: !state.detailsExpanded }))
  }

  private onRequestAction = () => {
    const { action } = this.props.notice
    if (action?.kind === 'remove-repository-lock') {
      this.setState({ confirmingLockRemoval: true })
    }
  }

  private onApplyAutoFix = () => {
    const { action } = this.props.notice
    if (action?.kind === 'apply-git-auto-fix') {
      this.props.onAction?.(this.props.notice, action)
    }
  }

  private onEditRepositoryRemotes = () => {
    const { action } = this.props.notice
    if (action?.kind === 'edit-repository-remotes') {
      this.props.onAction?.(this.props.notice, action)
    }
  }

  private onRequestWorkflowUpdate = () => {
    const { action } = this.props.notice
    if (action?.kind === 'update-cheap-lfs-workflow') {
      this.setState({ confirmingWorkflowUpdate: true })
    }
  }

  private onCancelWorkflowUpdate = () => {
    this.setState({ confirmingWorkflowUpdate: false })
  }

  private onConfirmWorkflowUpdate = () => {
    const { action } = this.props.notice
    if (action?.kind !== 'update-cheap-lfs-workflow') {
      return
    }
    this.setState({ confirmingWorkflowUpdate: false })
    this.props.onAction?.(this.props.notice, action)
  }

  private onCancelLockRemoval = () => {
    this.setState({ confirmingLockRemoval: false })
  }

  private onConfirmLockRemoval = () => {
    const { action } = this.props.notice
    if (action?.kind !== 'remove-repository-lock') {
      return
    }
    this.setState({ confirmingLockRemoval: false })
    this.props.onAction?.(this.props.notice, action)
  }

  public render() {
    const { notice } = this.props
    const showDetails = notice.details !== null

    return (
      <article
        className={`error-notice error-notice--${notice.severity ?? 'error'}`}
        role="alert"
        aria-atomic="true"
        data-error-notice-id={notice.id}
      >
        <span className="error-notice-icon" aria-hidden="true">
          <MaterialSymbol name="warning" />
        </span>
        <div className="error-notice-content">
          <h2>{notice.title}</h2>
          <p>{notice.message}</p>
          {notice.occurrences > 1 && (
            <span className="error-notice-occurrences">
              Reported {notice.occurrences} times
            </span>
          )}
          {this.state.detailsExpanded && notice.details !== null && (
            <pre className="error-notice-diagnostic">{notice.details}</pre>
          )}
          {this.state.confirmingLockRemoval &&
            notice.action?.kind === 'remove-repository-lock' && (
              <div
                className="error-notice-lock-confirmation"
                role="group"
                aria-label="Confirm lock file removal"
              >
                <p>
                  Stop all Git and IDE processes before continuing. Removing a
                  lock owned by an active process can corrupt repository state.
                </p>
                <div className="error-notice-lock-confirmation-actions">
                  <button
                    type="button"
                    className="error-notice-recovery-confirm"
                    onClick={this.onConfirmLockRemoval}
                  >
                    Confirm remove lock file
                  </button>
                  <button
                    type="button"
                    className="error-notice-recovery-cancel"
                    onClick={this.onCancelLockRemoval}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          {this.state.confirmingWorkflowUpdate &&
            notice.action?.kind === 'update-cheap-lfs-workflow' && (
              <div
                className="error-notice-lock-confirmation"
                role="group"
                aria-label={t('cheapLfs.cloud.autoInstall.updateAction')}
              >
                <p>{t('cheapLfs.cloud.autoInstall.updateWarning')}</p>
                <div className="error-notice-lock-confirmation-actions">
                  <button
                    type="button"
                    className="error-notice-recovery-confirm"
                    onClick={this.onConfirmWorkflowUpdate}
                  >
                    {t('cheapLfs.cloud.autoInstall.updateConfirm')}
                  </button>
                  <button
                    type="button"
                    className="error-notice-recovery-cancel"
                    onClick={this.onCancelWorkflowUpdate}
                  >
                    {t('cheapLfs.cloud.autoInstall.updateCancel')}
                  </button>
                </div>
              </div>
            )}
        </div>
        <div className="error-notice-actions">
          {notice.action?.kind === 'remove-repository-lock' &&
            !this.state.confirmingLockRemoval && (
              <button
                type="button"
                className="error-notice-recovery"
                onClick={this.onRequestAction}
              >
                Remove lock file
              </button>
            )}
          {notice.action?.kind === 'apply-git-auto-fix' && (
            <button
              type="button"
              className="error-notice-recovery"
              onClick={this.onApplyAutoFix}
            >
              {notice.action.label}
            </button>
          )}
          {notice.action?.kind === 'edit-repository-remotes' && (
            <button
              type="button"
              className="error-notice-recovery"
              onClick={this.onEditRepositoryRemotes}
            >
              {notice.action.label}
            </button>
          )}
          {notice.action?.kind === 'update-cheap-lfs-workflow' &&
            !this.state.confirmingWorkflowUpdate && (
              <button
                type="button"
                className="error-notice-recovery"
                onClick={this.onRequestWorkflowUpdate}
              >
                {notice.action.label}
              </button>
            )}
          {showDetails && (
            <button
              type="button"
              className="error-notice-details"
              onClick={this.onShowDetails}
              aria-expanded={this.state.detailsExpanded}
            >
              {this.state.detailsExpanded ? 'Hide details' : 'Details'}
            </button>
          )}
          <TooltippedContent
            tooltip={`Dismiss ${notice.title}`}
            direction={TooltipDirection.WEST}
            openOnFocus={true}
          >
            <button
              type="button"
              className="error-notice-dismiss"
              aria-label={`Dismiss ${notice.title}`}
              onClick={this.onDismiss}
            >
              <MaterialSymbol name="close" />
            </button>
          </TooltippedContent>
        </div>
      </article>
    )
  }
}

export interface IErrorNoticeStackProps {
  readonly notices: ReadonlyArray<IErrorNotice>
  readonly onDismiss: (id: string) => void
  readonly onShowDetails?: (notice: IErrorNotice) => void
  readonly onAction?: (notice: IErrorNotice, action: IErrorNoticeAction) => void
}

/** Fixed non-modal stack for bounded transient application errors. */
export class ErrorNoticeStack extends React.PureComponent<IErrorNoticeStackProps> {
  public render() {
    if (this.props.notices.length === 0) {
      return null
    }

    return (
      <section
        className="error-notice-stack"
        aria-label="Application notifications"
      >
        {this.props.notices.map(notice => (
          <ErrorNoticeCard
            key={notice.id}
            notice={notice}
            onDismiss={this.props.onDismiss}
            onShowDetails={this.props.onShowDetails}
            onAction={this.props.onAction}
          />
        ))}
      </section>
    )
  }
}
