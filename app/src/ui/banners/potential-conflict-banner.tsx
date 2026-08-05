import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Banner } from './banner'
import { LinkButton } from '../lib/link-button'

interface IPotentialConflictBannerProps {
  /** name of the branch we're on locally */
  readonly ourBranch: string
  /** name of the remote-tracking branch that has diverged, e.g. `origin/main` */
  readonly theirBranch: string
  /** paths changed on both sides since the branches diverged */
  readonly overlappingFiles: ReadonlyArray<string>
  /** callback to push the current branch */
  readonly onPush: () => void
  /** callback to ignore future conflict warnings for this branch */
  readonly onIgnore: () => void
  /**
   * Callback to send the current working changes to `theirBranch`'s owner as
   * a Cloud Patch link (R18/#135) instead of pushing. Omitted entirely when
   * no R1 self-hosted server is configured — the banner then has no Cloud
   * Patch option at all, the "honest single-player degrade" the issue calls
   * for, rather than a button that would fail.
   */
  readonly onSendAsPatch?: () => void
  /** callback to fire to dismiss the banner */
  readonly onDismissed: () => void
}

interface IPotentialConflictBannerState {
  readonly showingOverlappingFiles: boolean
}

export class PotentialConflictBanner extends React.Component<
  IPotentialConflictBannerProps,
  IPotentialConflictBannerState
> {
  public constructor(props: IPotentialConflictBannerProps) {
    super(props)
    this.state = { showingOverlappingFiles: false }
  }

  private onPush = () => {
    this.props.onDismissed()
    this.props.onPush()
  }

  private onIgnore = () => {
    this.props.onDismissed()
    this.props.onIgnore()
  }

  private onSendAsPatch = () => {
    this.props.onDismissed()
    this.props.onSendAsPatch?.()
  }

  private onToggleOverlappingFiles = () => {
    this.setState({
      showingOverlappingFiles: !this.state.showingOverlappingFiles,
    })
  }

  private renderOverlappingFiles() {
    if (!this.state.showingOverlappingFiles) {
      return null
    }

    return (
      <ul className="potential-conflict-overlapping-files">
        {this.props.overlappingFiles.map(file => (
          <li key={file}>{file}</li>
        ))}
      </ul>
    )
  }

  public render() {
    const { theirBranch, ourBranch, overlappingFiles } = this.props
    const count = overlappingFiles.length
    const pluralized = count === 1 ? 'file' : 'files'

    return (
      <Banner
        id="potential-conflict-banner"
        className={
          this.state.showingOverlappingFiles ? 'is-expanded' : undefined
        }
        onDismissed={this.props.onDismissed}
      >
        <Octicon className="alert-icon" symbol={octicons.alert} />
        <div className="banner-message">
          <span>
            <strong>{theirBranch}</strong> has changes that could conflict with
            your changes on <strong>{ourBranch}</strong>. Review to avoid future
            conflicts.
          </span>
          <div className="potential-conflict-actions">
            <LinkButton onClick={this.onPush}>
              Push your changes so they can fetch them
            </LinkButton>
            {this.props.onSendAsPatch !== undefined && (
              <LinkButton onClick={this.onSendAsPatch}>
                Send your changes to {theirBranch} as a patch
              </LinkButton>
            )}
            <LinkButton onClick={this.onIgnore}>
              Ignore conflict warnings for your changes on {ourBranch}
            </LinkButton>
            <LinkButton onClick={this.onToggleOverlappingFiles}>
              {this.state.showingOverlappingFiles ? 'Hide' : 'Show'} {count}{' '}
              overlapping {pluralized}
            </LinkButton>
          </div>
          {this.renderOverlappingFiles()}
        </div>
      </Banner>
    )
  }
}
