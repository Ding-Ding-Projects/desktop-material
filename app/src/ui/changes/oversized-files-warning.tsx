import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { PathText } from '../lib/path-text'
import { Dispatcher } from '../dispatcher'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { ICommitContext } from '../../models/commit'
import { DefaultCommitMessage } from '../../models/commit-message'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { getGitHubReleasesAvailability } from '../../lib/stores/github-releases-store'

const GitLFSWebsiteURL =
  'https://help.github.com/articles/versioning-large-files/'

interface IOversizedFilesProps {
  readonly oversizedFiles: ReadonlyArray<string>
  readonly onDismissed: () => void
  readonly dispatcher: Dispatcher
  readonly context: ICommitContext
  readonly repository: Repository
  readonly accounts: ReadonlyArray<Account>
}

/** A dialog to display a list of files that are too large to commit. */
export class OversizedFiles extends React.Component<IOversizedFilesProps> {
  public constructor(props: IOversizedFilesProps) {
    super(props)
  }

  public render() {
    const canPinToRelease =
      getGitHubReleasesAvailability(
        this.props.repository,
        this.props.accounts
      ) === 'available'

    return (
      <Dialog
        id="oversized-files"
        title={__DARWIN__ ? 'Files Too Large' : 'Files too large'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        type="warning"
      >
        <DialogContent>
          <p>
            The following files are over 100MB.{' '}
            <strong>
              If you commit these files, you will no longer be able to push this
              repository to GitHub.com.
            </strong>
          </p>
          {this.renderFileList()}
          <p className="recommendation">
            We recommend you avoid committing these files or use{' '}
            <LinkButton uri={GitLFSWebsiteURL}>Git LFS</LinkButton> to store
            large files on GitHub.
          </p>
          {this.renderCheapLfsNote(canPinToRelease)}
        </DialogContent>

        <DialogFooter>{this.renderFooterActions(canPinToRelease)}</DialogFooter>
      </Dialog>
    )
  }

  private renderFileList() {
    return (
      <div className="files-list">
        <ul>
          {this.props.oversizedFiles.map(fileName => (
            <li key={fileName}>
              <PathText path={fileName} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  private renderCheapLfsNote(canPinToRelease: boolean) {
    if (canPinToRelease) {
      return (
        <p className="cheap-lfs-note">
          This app can pin these files to a GitHub Release and commit a small
          pointer in their place, keeping the repository pushable.
        </p>
      )
    }
    return (
      <p className="cheap-lfs-note">
        Pinning large files to a release (this app's cheap LFS) needs a GitHub
        repository with a signed-in account, which isn't available here.
      </p>
    )
  }

  private renderFooterActions(canPinToRelease: boolean) {
    if (!canPinToRelease) {
      return this.renderCommitAnywayGroup()
    }
    return (
      <div className="oversized-files-actions">
        <Button onClick={this.onPinToReleaseAndCommit}>
          {__DARWIN__
            ? 'Pin to Release (Cheap LFS)'
            : 'Pin to release (cheap LFS)'}
        </Button>
        {this.renderCommitAnywayGroup()}
      </div>
    )
  }

  private renderCommitAnywayGroup() {
    return (
      <OkCancelButtonGroup
        destructive={true}
        okButtonText={__DARWIN__ ? 'Commit Anyway' : 'Commit anyway'}
      />
    )
  }

  private onSubmit = async () => {
    this.props.onDismissed()

    await this.props.dispatcher.commitIncludedChanges(
      this.props.repository,
      this.props.context
    )

    this.props.dispatcher.setCommitMessage(
      this.props.repository,
      DefaultCommitMessage
    )
  }

  // Pin every listed oversized file to a GitHub Release and commit the pointers
  // in one step. `forceAutoPinLargeFiles` overrides a disabled per-repo pin
  // preference; the commit flow still requires Releases availability, gated on
  // the same check that shows this button.
  private onPinToReleaseAndCommit = async () => {
    this.props.onDismissed()

    await this.props.dispatcher.commitIncludedChanges(
      this.props.repository,
      this.props.context,
      true
    )

    this.props.dispatcher.setCommitMessage(
      this.props.repository,
      DefaultCommitMessage
    )
  }
}
