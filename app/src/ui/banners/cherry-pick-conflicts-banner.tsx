import * as React from 'react'
import { Banner } from './banner'
import { LinkButton } from '../lib/link-button'
import { MaterialSymbol } from '../lib/material-symbol'

interface ICherryPickConflictsBannerProps {
  /** branch the user is rebasing into */
  readonly targetBranchName: string
  /** callback to fire when the dialog should be reopened */
  readonly onOpenConflictsDialog: () => void
  /** callback to fire to dismiss the banner */
  readonly onDismissed: () => void
}

export class CherryPickConflictsBanner extends React.Component<
  ICherryPickConflictsBannerProps,
  {}
> {
  private openDialog = async () => {
    this.props.onDismissed()
    this.props.onOpenConflictsDialog()
  }

  private onDismissed = () => {
    log.warn(
      `[CherryPickConflictsBanner] this is not dismissable by default unless the user clicks on the link`
    )
  }

  public render() {
    return (
      <Banner
        id="cherry-pick-conflicts-banner"
        dismissable={false}
        onDismissed={this.onDismissed}
      >
        <MaterialSymbol name="warning" className="alert-icon" />
        <div className="banner-message">
          <span>
            Resolve conflicts to continue cherry-picking onto{' '}
            <strong>{this.props.targetBranchName}</strong>.
          </span>
          <LinkButton onClick={this.openDialog}>View conflicts</LinkButton>
        </div>
      </Banner>
    )
  }
}
