import * as React from 'react'
import { Banner } from './banner'
import { LinkButton } from '../lib/link-button'
import { setNumber } from '../../lib/local-storage'
import { MaterialSymbol } from '../lib/material-symbol'

export const UnsupportedOSBannerDismissedAtKey =
  'unsupported-os-banner-dismissed-at'

export class OSVersionNoLongerSupportedBanner extends React.Component<{
  onDismissed: () => void
}> {
  private onDismissed = () => {
    setNumber(UnsupportedOSBannerDismissedAtKey, Date.now())
    this.props.onDismissed()
  }

  public render() {
    return (
      <Banner
        id="os-not-supported-banner"
        dismissable={true}
        onDismissed={this.onDismissed}
      >
        <MaterialSymbol name="warning" className="alert-icon" />
        This operating system is no longer supported. Software updates have been
        disabled.
        <LinkButton uri="https://ding-ding-projects.github.io/desktop-material/">
          Support details
        </LinkButton>
      </Banner>
    )
  }
}
