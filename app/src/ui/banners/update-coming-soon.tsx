import * as React from 'react'

import { t } from '../../lib/i18n'
import {
  deriveUpdateArrivalEstimate,
  dismissUpdateComingSoon,
  isUpdateComingSoonDismissed,
  IUpdateComingSoonSignal,
  updateComingSoonTargetKey,
} from '../../lib/update-coming-soon-estimate'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  UpdateComingSoonDetails,
  updateArrivalEstimateText,
} from '../updates/update-coming-soon-details'
import { Banner } from './banner'

interface IUpdateComingSoonProps {
  readonly signal: IUpdateComingSoonSignal
  /** Injectable clock so the estimate can be exercised deterministically. */
  readonly now?: number
}

interface IUpdateComingSoonState {
  readonly isDismissed: boolean
  readonly isExpanded: boolean
}

/**
 * A non-blocking banner announcing that a new update is on its way, together
 * with an honest estimate of when it will arrive.
 *
 * Nothing here is a promise: the summary line always reads as an estimate, and
 * "Show more details" reveals the exact signal and basis it was derived from so
 * the user can judge it themselves. Dismissal is remembered against the coming
 * build's commit, so the banner stays gone until a genuinely new build appears.
 */
export class UpdateComingSoon extends React.Component<
  IUpdateComingSoonProps,
  IUpdateComingSoonState
> {
  public constructor(props: IUpdateComingSoonProps) {
    super(props)
    this.state = {
      isDismissed: isUpdateComingSoonDismissed(props.signal),
      isExpanded: false,
    }
  }

  public render() {
    if (this.state.isDismissed) {
      return null
    }

    const estimate = deriveUpdateArrivalEstimate(
      this.props.signal,
      this.props.now ?? Date.now()
    )

    return (
      <Banner
        id="update-coming-soon"
        className={this.state.isExpanded ? 'expanded' : undefined}
        dismissable={true}
        onDismissed={this.onDismissed}
      >
        <Octicon className="coming-soon-icon" symbol={octicons.clock} />
        <div className="update-coming-soon-body">
          {/*
           * No live region of its own: `Banner` is already a polite,
           * atomic `role="status"`, so a nested one here would make a
           * screen reader announce the summary twice — once for the inner
           * region and again for the atomic banner around it.
           */}
          <span className="update-coming-soon-summary">
            <span className="update-coming-soon-headline">
              {t('update.comingSoon')}
            </span>
            <span className="update-coming-soon-estimate">
              {updateArrivalEstimateText(estimate)}
            </span>
          </span>
          <UpdateComingSoonDetails
            signal={this.props.signal}
            estimate={estimate}
            isExpanded={this.state.isExpanded}
            onToggleExpanded={this.onToggleExpanded}
            detailsId={`update-coming-soon-details-${updateComingSoonTargetKey(
              this.props.signal
            )}`}
          />
        </div>
      </Banner>
    )
  }

  private onToggleExpanded = () => {
    this.setState({ isExpanded: !this.state.isExpanded })
  }

  private onDismissed = () => {
    dismissUpdateComingSoon(this.props.signal)
    this.setState({ isDismissed: true })
  }
}
