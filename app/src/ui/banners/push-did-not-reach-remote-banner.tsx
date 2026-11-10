import * as React from 'react'

import { Button } from '../lib/button'
import { MaterialSymbol } from '../lib/material-symbol'
import { Banner } from './banner'

interface IPushDidNotReachRemoteBannerProps {
  readonly repositoryName: string
  readonly onRetry: () => void
  readonly onDismissed: () => void
}

/**
 * A push that could not reach its remote, shown in place instead of as a
 * dialog: nothing was lost, so nothing needs to stop the person. The next
 * step, trying again, is on the banner itself.
 */
export class PushDidNotReachRemoteBanner extends React.Component<IPushDidNotReachRemoteBannerProps> {
  private onRetry = () => {
    this.props.onDismissed()
    this.props.onRetry()
  }

  public render() {
    return (
      <Banner
        id="push-did-not-reach-remote"
        dismissable={true}
        onDismissed={this.props.onDismissed}
      >
        <MaterialSymbol name="sync_problem" className="alert-icon" />
        <div className="banner-message" role="alert">
          <span>
            The push from <strong>{this.props.repositoryName}</strong> did not
            reach the remote. Your commits are safe on this computer and nothing
            was sent.
          </span>
        </div>
        <Button onClick={this.onRetry}>Try again</Button>
      </Banner>
    )
  }
}
