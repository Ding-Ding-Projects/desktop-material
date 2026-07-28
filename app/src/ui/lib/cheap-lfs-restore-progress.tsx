import * as React from 'react'
import classNames from 'classnames'

import {
  cheapLfsRestoreAnnouncementPercent,
  cheapLfsRestoreLaneReachedLookAhead,
  CheapLfsRestorePhase,
  CheapLfsRestoreProgressInput,
  CheapLfsRestoreProvider,
  ICheapLfsRestoreLaneProgress,
  ICheapLfsRestoreProgress,
  normalizeCheapLfsRestoreProgress,
} from '../../lib/cheap-lfs/restore-progress'
import { formatPreciseDuration } from '../../lib/format-duration'
import {
  t,
  translatedVariable,
  translateForAccessibleName,
} from '../../lib/i18n'
import { Button } from './button'
import { formatBytes } from './bytes'
import { MaterialSymbol } from './material-symbol'
import { OperationProgressRow } from './operation-progress-row'

export interface ICheapLfsRestoreProgressProps {
  readonly progress: CheapLfsRestoreProgressInput
  /** App-wide restore can be canceled; nested read-only views omit the action. */
  readonly onCancel?: () => void
  readonly className?: string
}

function formatRestoreBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }
  return formatBytes(bytes, bytes < 1024 ? 0 : 1)
}

function formatRestoreDuration(seconds: number): string {
  return formatPreciseDuration(seconds * 1_000)
}

function restoreProviderKey(
  provider: CheapLfsRestoreProvider
):
  | 'cheapLfs.restore.provider.githubRelease'
  | 'cheapLfs.restore.provider.ghcr'
  | 'cheapLfs.restore.provider.dockerHub'
  | 'cheapLfs.restore.provider.mixed'
  | 'cheapLfs.restore.provider.unknown' {
  switch (provider) {
    case 'github-release':
      return 'cheapLfs.restore.provider.githubRelease'
    case 'ghcr':
      return 'cheapLfs.restore.provider.ghcr'
    case 'docker-hub':
      return 'cheapLfs.restore.provider.dockerHub'
    case 'mixed':
      return 'cheapLfs.restore.provider.mixed'
    case 'unknown':
      return 'cheapLfs.restore.provider.unknown'
  }
}

function restorePhaseKey(
  phase: CheapLfsRestorePhase
):
  | 'cheapLfs.restore.phase.preparing'
  | 'cheapLfs.restore.phase.downloading'
  | 'cheapLfs.restore.phase.decompressing'
  | 'cheapLfs.restore.phase.verifying'
  | 'cheapLfs.restore.phase.materializing'
  | 'cheapLfs.restore.phase.canceling' {
  switch (phase) {
    case 'preparing':
      return 'cheapLfs.restore.phase.preparing'
    case 'downloading':
      return 'cheapLfs.restore.phase.downloading'
    case 'decompressing':
      return 'cheapLfs.restore.phase.decompressing'
    case 'verifying':
      return 'cheapLfs.restore.phase.verifying'
    case 'materializing':
      return 'cheapLfs.restore.phase.materializing'
    case 'canceling':
      return 'cheapLfs.restore.phase.canceling'
  }
}

function globalPercent(progress: ICheapLfsRestoreProgress): number {
  return progress.logicalTotalBytes > 0
    ? Math.min(
        100,
        Math.floor(
          (progress.logicalProcessedBytes / progress.logicalTotalBytes) * 100
        )
      )
    : 0
}

function actualDownloadValue(progress: ICheapLfsRestoreProgress): string {
  if (
    progress.actualDownloadedBytes !== null &&
    progress.actualDownloadTotalBytes !== null
  ) {
    return t('cheapLfs.restore.downloadWithTotal', {
      downloaded: formatRestoreBytes(progress.actualDownloadedBytes),
      total: formatRestoreBytes(progress.actualDownloadTotalBytes),
    })
  }
  if (progress.actualDownloadedBytes !== null) {
    return t('cheapLfs.restore.downloadWithoutTotal', {
      downloaded: formatRestoreBytes(progress.actualDownloadedBytes),
    })
  }
  if (progress.actualDownloadTotalBytes !== null) {
    return t('cheapLfs.restore.downloadTotalOnly', {
      total: formatRestoreBytes(progress.actualDownloadTotalBytes),
    })
  }
  return t('cheapLfs.restore.notReported')
}

function rateValue(progress: ICheapLfsRestoreProgress): string {
  return progress.downloadRateBytesPerSecond !== null &&
    progress.downloadRateBytesPerSecond > 0
    ? t('cheapLfs.restore.rateValue', {
        rate: `${formatRestoreBytes(progress.downloadRateBytesPerSecond)}/s`,
      })
    : t('cheapLfs.restore.ratePending')
}

function etaValue(progress: ICheapLfsRestoreProgress): string {
  return progress.etaSeconds === null
    ? t('cheapLfs.restore.etaPending')
    : formatRestoreDuration(progress.etaSeconds)
}

function lanePath(lane: ICheapLfsRestoreLaneProgress): string {
  return lane.relativePath.length > 0
    ? lane.relativePath
    : t('cheapLfs.restore.pathUnavailable')
}

/**
 * One detailed Material 3 restore card shared by the app strip and batch-clone
 * finalization. Exact visual readings can refresh per chunk. Only the summary
 * is a polite live region, and its percentage is bucketed by the model so
 * assistive technology is not interrupted for every byte event.
 */
export class CheapLfsRestoreProgress extends React.Component<ICheapLfsRestoreProgressProps> {
  private renderLane(
    lane: ICheapLfsRestoreLaneProgress,
    kind: 'current' | 'prefetch'
  ) {
    const path = lanePath(lane)
    const laneTitleKey =
      kind === 'current'
        ? 'cheapLfs.restore.currentLane'
        : 'cheapLfs.restore.prefetchLane'
    const laneLabel = translateForAccessibleName(
      'cheapLfs.restore.laneGroupLabel',
      {
        lane: translateForAccessibleName(laneTitleKey),
        path,
      }
    )
    const fileOrdinal = t('cheapLfs.restore.laneFile', {
      current: String(lane.fileOrdinal),
      total: String(lane.filesTotal),
    })
    const partOrdinal =
      lane.partOrdinal !== null && lane.partsTotal !== null
        ? t('cheapLfs.restore.lanePart', {
            current: String(lane.partOrdinal),
            total: String(lane.partsTotal),
          })
        : null
    const laneBytes =
      lane.totalBytes === null
        ? t('cheapLfs.restore.laneBytesWithoutTotal', {
            processed: formatRestoreBytes(lane.processedBytes),
          })
        : t('cheapLfs.restore.laneBytes', {
            processed: formatRestoreBytes(lane.processedBytes),
            total: formatRestoreBytes(lane.totalBytes),
          })
    const valueText =
      lane.totalBytes === null || lane.percent === null
        ? translateForAccessibleName(
            'cheapLfs.restore.laneValueIndeterminate',
            {
              processed: formatRestoreBytes(lane.processedBytes),
              path,
            }
          )
        : translateForAccessibleName('cheapLfs.restore.laneValueText', {
            processed: formatRestoreBytes(lane.processedBytes),
            total: formatRestoreBytes(lane.totalBytes),
            percent: String(lane.percent),
            path,
          })

    return (
      <div
        className={classNames('cheap-lfs-restore-lane', kind)}
        role="group"
        aria-label={laneLabel}
        key={kind}
      >
        <div className="cheap-lfs-restore-lane-heading">
          <span className="cheap-lfs-restore-lane-title">
            <MaterialSymbol
              name={kind === 'current' ? 'cloud_download' : 'low_priority'}
              size={18}
            />
            <strong>{t(laneTitleKey)}</strong>
          </span>
          <span className="cheap-lfs-restore-lane-percent" aria-hidden="true">
            {lane.percent === null ? '—' : `${lane.percent}%`}
          </span>
        </div>
        <div className="cheap-lfs-restore-lane-path">{path}</div>
        <div className="cheap-lfs-restore-lane-meta">
          <span>{fileOrdinal}</span>
          {partOrdinal !== null && <span>{partOrdinal}</span>}
          <span>{t(restoreProviderKey(lane.provider))}</span>
          <span>{t(restorePhaseKey(lane.phase))}</span>
        </div>
        <OperationProgressRow
          className="cheap-lfs-restore-lane-bar"
          label={translateForAccessibleName(
            'cheapLfs.restore.laneProgressLabel',
            { path }
          )}
          // Drive the fill from the normalized integer percent so 89.9% never
          // rounds up and visually claims the exact 90% look-ahead boundary.
          value={lane.percent}
          max={lane.percent === null ? null : 100}
          valueText={valueText}
          detail={laneBytes}
        />
      </div>
    )
  }

  private renderFailures(progress: ICheapLfsRestoreProgress) {
    if (progress.filesFailed === 0) {
      return null
    }

    const omitted = Math.max(0, progress.filesFailed - progress.failures.length)
    return (
      <div
        className="cheap-lfs-restore-failures"
        role="group"
        aria-label={translateForAccessibleName(
          'cheapLfs.restore.failuresLabel'
        )}
      >
        <strong>{t('cheapLfs.restore.failuresLabel')}</strong>
        {progress.failures.length > 0 ? (
          <ul>
            {progress.failures.map((failure, index) => {
              const reason =
                failure.reason.length > 0
                  ? failure.reason
                  : t('cheapLfs.restore.failureUnknown')
              return (
                <li key={`${failure.relativePath}:${index}`}>
                  <span className="cheap-lfs-restore-failure-path">
                    {failure.relativePath.length > 0
                      ? failure.relativePath
                      : t('cheapLfs.restore.pathUnavailable')}
                  </span>
                  <span>
                    {failure.statusCode === undefined
                      ? t('cheapLfs.restore.failureReason', { reason })
                      : t('cheapLfs.restore.failureReasonWithStatus', {
                          status: String(failure.statusCode),
                          reason,
                        })}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <span>{t('cheapLfs.restore.failureUnknown')}</span>
        )}
        {omitted > 0 && (
          <span className="cheap-lfs-restore-failures-omitted">
            {t('cheapLfs.restore.failuresOmitted', {
              count: String(omitted),
            })}
          </span>
        )}
      </div>
    )
  }

  public render() {
    const progress = normalizeCheapLfsRestoreProgress(this.props.progress)
    const percent = globalPercent(progress)
    const announcementPercent = cheapLfsRestoreAnnouncementPercent(progress)
    const currentReachedThreshold = cheapLfsRestoreLaneReachedLookAhead(
      progress.currentLane
    )
    const hasQueuedWork = progress.queuedFiles > 0 || progress.queuedParts > 0
    const lookAheadText =
      progress.prefetchLane !== null
        ? t('cheapLfs.restore.lookAheadActive', {
            percent: String(progress.lookAheadThresholdPercent),
          })
        : hasQueuedWork && currentReachedThreshold
        ? t('cheapLfs.restore.lookAheadStarting', {
            percent: String(progress.lookAheadThresholdPercent),
          })
        : hasQueuedWork
        ? t('cheapLfs.restore.lookAheadStarts', {
            percent: String(progress.lookAheadThresholdPercent),
          })
        : t('cheapLfs.restore.lookAheadBoundary', {
            percent: String(progress.lookAheadThresholdPercent),
          })
    const logicalBytes = t('cheapLfs.restore.logicalBytesValue', {
      processed: formatRestoreBytes(progress.logicalProcessedBytes),
      total: formatRestoreBytes(progress.logicalTotalBytes),
    })
    const providerBadge = t('cheapLfs.restore.providerBadge', {
      provider: translatedVariable(restoreProviderKey(progress.provider)),
    })
    const phaseBadge = t('cheapLfs.restore.phaseBadge', {
      phase: translatedVariable(restorePhaseKey(progress.phase)),
    })
    const summary = t('cheapLfs.restore.summary', {
      percent: String(announcementPercent),
      succeeded: String(progress.filesSucceeded),
      failed: String(progress.filesFailed),
      remaining: String(progress.filesRemaining),
    })
    const valueText = translateForAccessibleName(
      'cheapLfs.restore.progressValueText',
      {
        processed: formatRestoreBytes(progress.logicalProcessedBytes),
        total: formatRestoreBytes(progress.logicalTotalBytes),
        percent: String(percent),
        succeeded: String(progress.filesSucceeded),
        failed: String(progress.filesFailed),
        remaining: String(progress.filesRemaining),
      }
    )

    return (
      <section
        className={classNames(
          'cheap-lfs-restore-progress',
          this.props.className
        )}
        aria-label={translateForAccessibleName(
          'cheapLfs.restore.sectionLabel',
          { repository: progress.repositoryName }
        )}
        aria-busy={true}
        data-verification="cheap-lfs-restore-progress"
      >
        <header className="cheap-lfs-restore-header">
          <div className="cheap-lfs-restore-heading">
            <MaterialSymbol name="cloud_download" size={22} fill={1} />
            <span>
              <strong>{t('cheapLfs.restore.title')}</strong>
              <span className="cheap-lfs-restore-repository">
                {progress.repositoryName}
              </span>
            </span>
          </div>
          <div className="cheap-lfs-restore-badges">
            <span>{providerBadge}</span>
            <span>{phaseBadge}</span>
          </div>
          {this.props.onCancel !== undefined && (
            <Button
              className="cheap-lfs-restore-cancel"
              onClick={this.props.onCancel}
              disabled={progress.cancelRequested}
              ariaBusy={progress.cancelRequested}
              size="small"
            >
              {progress.cancelRequested
                ? t('cheapLfs.restore.canceling')
                : t('cheapLfs.restore.cancel')}
            </Button>
          )}
        </header>

        <div
          className="cheap-lfs-restore-summary"
          role="status"
          aria-live="polite"
          aria-atomic={true}
        >
          {summary}
        </div>

        <OperationProgressRow
          className="cheap-lfs-restore-overall"
          label={translateForAccessibleName('cheapLfs.restore.progressLabel')}
          value={progress.logicalTotalBytes > 0 ? percent : null}
          max={progress.logicalTotalBytes > 0 ? 100 : null}
          valueText={valueText}
          countText={`${percent}%`}
          detail={logicalBytes}
        />

        <div className="cheap-lfs-restore-look-ahead">
          <MaterialSymbol name="low_priority" size={18} />
          <span>{lookAheadText}</span>
        </div>

        <dl className="cheap-lfs-restore-stats">
          <div>
            <dt>{t('cheapLfs.restore.filesLabel')}</dt>
            <dd>
              {t('cheapLfs.restore.filesValue', {
                succeeded: String(progress.filesSucceeded),
                failed: String(progress.filesFailed),
                remaining: String(progress.filesRemaining),
                total: String(progress.filesTotal),
              })}
            </dd>
          </div>
          <div>
            <dt>{t('cheapLfs.restore.logicalBytesLabel')}</dt>
            <dd>{logicalBytes}</dd>
          </div>
          <div>
            <dt>{t('cheapLfs.restore.actualBytesLabel')}</dt>
            <dd>{actualDownloadValue(progress)}</dd>
          </div>
          <div>
            <dt>{t('cheapLfs.restore.rateLabel')}</dt>
            <dd>{rateValue(progress)}</dd>
          </div>
          <div>
            <dt>{t('cheapLfs.restore.etaLabel')}</dt>
            <dd>{etaValue(progress)}</dd>
          </div>
          <div>
            <dt>{t('cheapLfs.restore.elapsedLabel')}</dt>
            <dd>{formatRestoreDuration(progress.elapsedSeconds)}</dd>
          </div>
          <div>
            <dt>{t('cheapLfs.restore.queueLabel')}</dt>
            <dd>
              {t('cheapLfs.restore.queueValue', {
                files: String(progress.queuedFiles),
                parts: String(progress.queuedParts),
              })}
            </dd>
          </div>
        </dl>

        {progress.currentLane !== null ? (
          <div className="cheap-lfs-restore-lanes">
            {this.renderLane(progress.currentLane, 'current')}
            {progress.prefetchLane !== null &&
              this.renderLane(progress.prefetchLane, 'prefetch')}
          </div>
        ) : (
          <div className="cheap-lfs-restore-lane-waiting">
            {t('cheapLfs.restore.laneWaiting')}
          </div>
        )}

        {this.renderFailures(progress)}
      </section>
    )
  }
}
