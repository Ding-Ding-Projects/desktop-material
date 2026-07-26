import * as React from 'react'

import { t, translatedVariable, TranslationKey } from '../../lib/i18n'
import {
  describeEstimateDuration,
  describeReleaseCadence,
  IEstimateDuration,
  IUpdateArrivalEstimate,
  IUpdateComingSoonSignal,
} from '../../lib/update-coming-soon-estimate'
import { LinkButton } from '../lib/link-button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

/** The bare-duration resource matching a rounded duration's unit. */
function durationKey(duration: IEstimateDuration): TranslationKey {
  switch (duration.unit) {
    case 'minute':
      return 'update.comingSoon.durationMinutes'
    case 'hour':
      return 'update.comingSoon.durationHours'
    case 'day':
      return 'update.comingSoon.durationDays'
  }
}

/**
 * The one-line arrival estimate.
 *
 * Every branch says "estimated". There is deliberately no phrasing here that
 * can be read as a commitment, and an absent basis says so plainly rather than
 * falling back to an invented number.
 */
export function updateArrivalEstimateText(
  estimate: IUpdateArrivalEstimate | null
): string {
  if (estimate === null) {
    return t('update.comingSoon.etaUnknown')
  }
  if (estimate.etaMilliseconds === null) {
    if (estimate.isOverdue) {
      return t('update.comingSoon.etaAnyMinute')
    }
    return estimate.basis === 'green-ci-no-release'
      ? t('update.comingSoon.etaShortly')
      : t('update.comingSoon.etaUnknown')
  }

  const duration = describeEstimateDuration(estimate.etaMilliseconds)
  if (duration === null) {
    return t('update.comingSoon.etaAnyMinute')
  }
  switch (duration.unit) {
    case 'minute':
      return t('update.comingSoon.etaMinutes', {
        count: duration.count.toString(),
      })
    case 'hour':
      return t('update.comingSoon.etaHours', {
        count: duration.count.toString(),
      })
    case 'day':
      return t('update.comingSoon.etaDays', {
        count: duration.count.toString(),
      })
  }
}

/** Exactly what the estimate above was computed from. */
export function updateArrivalBasisText(
  estimate: IUpdateArrivalEstimate | null
): string {
  if (estimate === null) {
    return t('update.comingSoon.basisCadenceUnmeasured')
  }
  switch (estimate.basis) {
    case 'running-workflow':
      return estimate.sampleSize === 0
        ? t('update.comingSoon.basisRunningWorkflowUnmeasured')
        : t('update.comingSoon.basisRunningWorkflow', {
            count: estimate.sampleSize.toString(),
          })
    case 'green-ci-no-release':
      return t('update.comingSoon.basisGreenCI')
    case 'release-cadence':
      return estimate.sampleSize === 0
        ? t('update.comingSoon.basisCadenceUnmeasured')
        : t('update.comingSoon.basisCadence', {
            count: estimate.sampleSize.toString(),
          })
  }
}

/** How often the fork has actually been shipping lately. */
export function updateReleaseCadenceText(
  signal: IUpdateComingSoonSignal
): string {
  const cadence = describeReleaseCadence(signal.recentReleaseTimes)
  const duration =
    cadence === null
      ? null
      : describeEstimateDuration(cadence.medianGapMilliseconds)
  if (cadence === null || duration === null) {
    return t('update.comingSoon.cadenceUnknown')
  }

  return t('update.comingSoon.cadenceValue', {
    // A translated value, so bilingual mode renders one gap per language
    // instead of leaking an English duration into the Cantonese half.
    gap: translatedVariable(durationKey(duration), {
      count: duration.count.toString(),
    }),
    count: cadence.sampleSize.toString(),
  })
}

function signalText(signal: IUpdateComingSoonSignal): string {
  switch (signal.kind) {
    case 'build-running':
      return t('update.comingSoon.signalBuildRunning')
    case 'awaiting-release':
      return t('update.comingSoon.signalAwaitingRelease')
    case 'newer-commit':
      return t('update.comingSoon.signalNewerCommit')
  }
}

interface IUpdateComingSoonDetailsProps {
  readonly signal: IUpdateComingSoonSignal
  readonly estimate: IUpdateArrivalEstimate | null
  readonly isExpanded: boolean
  readonly onToggleExpanded: () => void
  /** Unique id tying the disclosure button to the region it controls. */
  readonly detailsId: string
}

/**
 * The "Show more details" disclosure shared by the coming-update banner and the
 * About dialog, so both surfaces explain a pending update the same way.
 *
 * The summary line stays deliberately short; everything that justifies it —
 * target version, the signal that was observed, the estimate's basis, and the
 * recent release cadence — lives behind the disclosure so the banner never
 * becomes a wall of text.
 */
export class UpdateComingSoonDetails extends React.Component<IUpdateComingSoonDetailsProps> {
  public render() {
    const { isExpanded, detailsId } = this.props
    return (
      <div className="update-coming-soon-disclosure">
        <button
          type="button"
          className="update-coming-soon-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          onClick={this.props.onToggleExpanded}
        >
          <Octicon
            symbol={isExpanded ? octicons.chevronUp : octicons.chevronDown}
          />
          <span>
            {isExpanded
              ? t('update.comingSoon.hideDetails')
              : t('update.comingSoon.showDetails')}
          </span>
        </button>
        {isExpanded ? this.renderDetails() : null}
      </div>
    )
  }

  private renderDetails() {
    const { signal, estimate, detailsId } = this.props
    return (
      <div
        id={detailsId}
        className="update-coming-soon-details"
        role="group"
        aria-label={t('update.comingSoon.detailsLabel')}
      >
        <dl>
          <div className="update-coming-soon-detail">
            <dt>{t('update.comingSoon.targetLabel')}</dt>
            <dd>{signal.targetTag ?? t('update.comingSoon.targetUnknown')}</dd>
          </div>
          <div className="update-coming-soon-detail">
            <dt>{t('update.comingSoon.signalLabel')}</dt>
            <dd>
              {signalText(signal)}
              {this.renderLinks()}
            </dd>
          </div>
          <div className="update-coming-soon-detail">
            <dt>{t('update.comingSoon.basisLabel')}</dt>
            <dd>{updateArrivalBasisText(estimate)}</dd>
          </div>
          <div className="update-coming-soon-detail">
            <dt>{t('update.comingSoon.cadenceLabel')}</dt>
            <dd>{updateReleaseCadenceText(signal)}</dd>
          </div>
          <div className="update-coming-soon-detail">
            <dt>{t('update.comingSoon.latestReleaseLabel')}</dt>
            <dd>
              {signal.latestReleaseTag ??
                t('update.comingSoon.latestReleaseUnknown')}
            </dd>
          </div>
          <div className="update-coming-soon-detail">
            <dt>{t('update.comingSoon.commitLabel')}</dt>
            <dd>
              <code>{signal.headSHA.slice(0, 10)}</code>
            </dd>
          </div>
        </dl>
        <p className="update-coming-soon-notice">
          {t('update.comingSoon.estimateNotice')}
        </p>
      </div>
    )
  }

  private renderLinks() {
    const { commitURL, runURL } = this.props.signal
    if (commitURL === null && runURL === null) {
      return null
    }
    return (
      <span className="update-coming-soon-links">
        {runURL !== null && (
          <LinkButton uri={runURL}>{t('update.comingSoon.viewRun')}</LinkButton>
        )}
        {commitURL !== null && (
          <LinkButton uri={commitURL}>
            {t('update.comingSoon.viewCommit')}
          </LinkButton>
        )}
      </span>
    )
  }
}
