import * as React from 'react'
import { Ref } from '../lib/ref'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface INoPullRequestsProps {
  /** The name of the repository. */
  readonly repositoryName: string

  /** Is the default branch currently checked out? */
  readonly isOnDefaultBranch: boolean

  /** Is this component being rendered due to a search? */
  readonly isSearch: boolean

  /* Called when the user wants to create a new branch. */
  readonly onCreateBranch: () => void

  /** Called when the user wants to create a pull request. */
  readonly onCreatePullRequest: () => void

  /** Are we currently loading pull requests? */
  readonly isLoadingPullRequests: boolean
}

/**
 * The placeholder for when there are no open pull requests.
 *
 * Illustrated blank slate per the design prototype: a large muted merge glyph
 * in a secondary-container tile, a heading, a caption and — when applicable —
 * a filled call-to-action button, all centered.
 */
export class NoPullRequests extends React.Component<INoPullRequestsProps, {}> {
  public render() {
    return (
      <div className="no-pull-requests">
        <div className="no-pull-requests-icon" aria-hidden="true">
          <Octicon symbol={octicons.gitMerge} />
        </div>
        {this.renderTitle()}
        {this.renderCallToAction()}
      </div>
    )
  }

  private renderTitle() {
    if (this.props.isSearch) {
      return <div className="title">Sorry, I can't find that pull request!</div>
    } else if (this.props.isLoadingPullRequests) {
      return <div className="title">Hang tight</div>
    } else {
      return (
        <>
          <div className="title">No open pull requests</div>
          <div className="no-prs">
            No open pull requests in <Ref>{this.props.repositoryName}</Ref>
          </div>
        </>
      )
    }
  }

  private renderCallToAction() {
    if (this.props.isLoadingPullRequests) {
      return (
        <div className="call-to-action">
          Loading pull requests as fast as I can!
        </div>
      )
    }

    if (this.props.isOnDefaultBranch) {
      return (
        <>
          <div className="call-to-action">
            Would you like to create a new branch and get going?
          </div>
          <Button
            className="no-pull-requests-action"
            onClick={this.props.onCreateBranch}
          >
            {__DARWIN__ ? 'Create New Branch' : 'Create new branch'}
          </Button>
        </>
      )
    } else {
      return (
        <>
          <div className="call-to-action">
            Would you like to create a pull request from the current branch?
          </div>
          <Button
            className="no-pull-requests-action"
            onClick={this.props.onCreatePullRequest}
          >
            {__DARWIN__ ? 'Create Pull Request' : 'Create pull request'}
          </Button>
        </>
      )
    }
  }
}
