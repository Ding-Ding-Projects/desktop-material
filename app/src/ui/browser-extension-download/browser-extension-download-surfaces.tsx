import * as React from 'react'
import {
  BrowserExtensionIntegrationAvailability,
  IBrowserExtensionDownloadProgress,
  IBrowserExtensionDownloadRequest,
} from '../../lib/browser-extension-download'
import { t } from '../../lib/i18n'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { OperationProgressRow } from '../lib/operation-progress-row'

export interface IBrowserExtensionDownloadSurfacesProps {
  readonly availability: BrowserExtensionIntegrationAvailability
  readonly progress: IBrowserExtensionDownloadProgress | null
  readonly onConfirm: (request: IBrowserExtensionDownloadRequest) => void
  readonly onCancelBeforeStart: (request: IBrowserExtensionDownloadRequest) => void
  readonly onPause: (request: IBrowserExtensionDownloadRequest) => void
  readonly onResume: (request: IBrowserExtensionDownloadRequest) => void
  readonly onCancel: (request: IBrowserExtensionDownloadRequest) => void
  readonly onDismissCompleted: (request: IBrowserExtensionDownloadRequest) => void
}

function formatBytes(value: number): string {
  return `${value.toLocaleString()} B`
}

/**
 * The owned desktop surfaces for a browser extension download handoff. This
 * component is intentionally mountable only by a real native-host request;
 * the current unavailable state is honest rather than manufacturing a demo
 * download from a browser page.
 */
export function BrowserExtensionDownloadSurfaces(
  props: IBrowserExtensionDownloadSurfacesProps
) {
  const progress = props.progress
  if (progress === null) {
    return null
  }
  const { request } = progress

  if (progress.phase === 'awaiting-confirmation') {
    return (
      <Dialog
        title={t('browserDownload.start.title')}
        onDismissed={() => props.onCancelBeforeStart(request)}
        emojiDecoration="progress"
      >
        <DialogContent>
          <p>{t('browserDownload.start.body')}</p>
          <dl className="browser-extension-download-details">
            <dt>{t('browserDownload.start.file')}</dt>
            <dd>{request.suggestedFileName}</dd>
            <dt>{t('browserDownload.start.source')}</dt>
            <dd>{request.source}</dd>
            <dt>{t('browserDownload.start.destination')}</dt>
            <dd>{request.destination}</dd>
          </dl>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={t('browserDownload.start.confirm')}
            cancelButtonText={t('browserDownload.start.cancel')}
            onOkButtonClick={event => {
              event.preventDefault()
              props.onConfirm(request)
            }}
            onCancelButtonClick={event => {
              event.preventDefault()
              props.onCancelBeforeStart(request)
            }}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  if (progress.phase === 'downloading' || progress.phase === 'paused') {
    const paused = progress.phase === 'paused'
    const detail =
      progress.totalBytes === null
        ? formatBytes(progress.downloadedBytes)
        : `${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}`
    return (
      <Dialog
        title={t('browserDownload.progress.title')}
        dismissDisabled={true}
        emojiDecoration="progress"
      >
        <DialogContent>
          <p>{request.suggestedFileName}</p>
          <OperationProgressRow
            label={t('browserDownload.progress.label')}
            description={
              paused
                ? t('browserDownload.progress.paused')
                : t('browserDownload.progress.running')
            }
            value={progress.downloadedBytes}
            max={progress.totalBytes}
            valueText={detail}
            detail={
              progress.bytesPerSecond === null
                ? detail
                : `${detail} · ${formatBytes(progress.bytesPerSecond)}/s`
            }
          />
          <p>
            {t('browserDownload.progress.destination', {
              destination: request.destination,
            })}
          </p>
        </DialogContent>
        <DialogFooter>
          {paused ? (
            <Button onClick={() => props.onResume(request)}>
              {t('browserDownload.progress.resume')}
            </Button>
          ) : (
            <Button onClick={() => props.onPause(request)}>
              {t('browserDownload.progress.pause')}
            </Button>
          )}
          <Button onClick={() => props.onCancel(request)}>
            {t('browserDownload.progress.cancel')}
          </Button>
        </DialogFooter>
      </Dialog>
    )
  }

  if (progress.phase === 'completed') {
    return (
      <Dialog
        title={t('browserDownload.completed.title')}
        onDismissed={() => props.onDismissCompleted(request)}
        emojiDecoration="success"
      >
        <DialogContent>
          <p>{t('browserDownload.completed.body', { file: request.suggestedFileName })}</p>
          <p>{request.destination}</p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={t('browserDownload.completed.close')}
            cancelButtonVisible={false}
            onOkButtonClick={event => {
              event.preventDefault()
              props.onDismissCompleted(request)
            }}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  if (progress.phase === 'canceled') {
    return (
      <Dialog
        title={t('browserDownload.canceled.title')}
        onDismissed={() => props.onDismissCompleted(request)}
        emojiDecoration="information"
      >
        <DialogContent>
          <p>{t('browserDownload.canceled.body')}</p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={t('browserDownload.completed.close')}
            cancelButtonVisible={false}
            onOkButtonClick={event => {
              event.preventDefault()
              props.onDismissCompleted(request)
            }}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  return (
    <Dialog
      title={t('browserDownload.failed.title')}
      type="error"
      onDismissed={() => props.onDismissCompleted(request)}
    >
      <DialogContent>
        <p>{progress.error ?? t('browserDownload.failed.body')}</p>
      </DialogContent>
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={t('browserDownload.completed.close')}
          cancelButtonVisible={false}
          onOkButtonClick={event => {
            event.preventDefault()
            props.onDismissCompleted(request)
          }}
        />
      </DialogFooter>
    </Dialog>
  )
}

/** A visible, non-fake integration status for settings/help surfaces. */
export function BrowserExtensionDownloadIntegrationStatus(
  props: Pick<IBrowserExtensionDownloadSurfacesProps, 'availability'>
) {
  return props.availability.kind === 'available' ? null : (
    <p className="browser-extension-download-unavailable" role="status">
      {t('browserDownload.unavailable', { reason: props.availability.reason })}
    </p>
  )
}
