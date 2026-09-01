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
  readonly onCancelBeforeStart: (
    request: IBrowserExtensionDownloadRequest
  ) => void
  readonly onPause: (request: IBrowserExtensionDownloadRequest) => void
  readonly onResume: (request: IBrowserExtensionDownloadRequest) => void
  readonly onCancel: (request: IBrowserExtensionDownloadRequest) => void
  readonly onDismissCompleted: (
    request: IBrowserExtensionDownloadRequest
  ) => void
}

function formatBytes(value: number): string {
  return `${value.toLocaleString()} B`
}

function useBrowserExtensionDownloadHandlers(
  props: IBrowserExtensionDownloadSurfacesProps,
  request: IBrowserExtensionDownloadRequest | null
) {
  return React.useMemo(
    () => ({
      confirm: () => {
        if (request !== null) {
          props.onConfirm(request)
        }
      },
      cancelBeforeStart: () => {
        if (request !== null) {
          props.onCancelBeforeStart(request)
        }
      },
      pause: () => {
        if (request !== null) {
          props.onPause(request)
        }
      },
      resume: () => {
        if (request !== null) {
          props.onResume(request)
        }
      },
      cancel: () => {
        if (request !== null) {
          props.onCancel(request)
        }
      },
      dismissCompleted: () => {
        if (request !== null) {
          props.onDismissCompleted(request)
        }
      },
    }),
    [
      props.onConfirm,
      props.onCancelBeforeStart,
      props.onPause,
      props.onResume,
      props.onCancel,
      props.onDismissCompleted,
      request,
    ]
  )
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
  const request = progress?.request ?? null
  const actions = useBrowserExtensionDownloadHandlers(props, request)

  if (progress === null) {
    return null
  }

  const activeRequest = progress.request

  if (progress.phase === 'awaiting-confirmation') {
    return (
      <Dialog
        title={t('browserDownload.start.title')}
        onDismissed={actions.cancelBeforeStart}
        emojiDecoration="progress"
      >
        <DialogContent>
          <p>{t('browserDownload.start.body')}</p>
          <dl className="browser-extension-download-details">
            <dt>{t('browserDownload.start.file')}</dt>
            <dd>{activeRequest.suggestedFileName}</dd>
            <dt>{t('browserDownload.start.source')}</dt>
            <dd>{activeRequest.source}</dd>
            <dt>{t('browserDownload.start.destination')}</dt>
            <dd>{activeRequest.destination}</dd>
          </dl>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={t('browserDownload.start.confirm')}
            cancelButtonText={t('browserDownload.start.cancel')}
            onOkButtonClick={event => {
              event.preventDefault()
              actions.confirm()
            }}
            onCancelButtonClick={event => {
              event.preventDefault()
              actions.cancelBeforeStart()
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
        : `${formatBytes(progress.downloadedBytes)} / ${formatBytes(
            progress.totalBytes
          )}`
    return (
      <Dialog
        title={t('browserDownload.progress.title')}
        dismissDisabled={true}
        emojiDecoration="progress"
      >
        <DialogContent>
          <p>{activeRequest.suggestedFileName}</p>
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
              destination: activeRequest.destination,
            })}
          </p>
        </DialogContent>
        <DialogFooter>
          {paused ? (
            <Button onClick={actions.resume}>
              {t('browserDownload.progress.resume')}
            </Button>
          ) : (
            <Button onClick={actions.pause}>
              {t('browserDownload.progress.pause')}
            </Button>
          )}
          <Button onClick={actions.cancel}>
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
        onDismissed={actions.dismissCompleted}
        emojiDecoration="success"
      >
        <DialogContent>
          <p>
            {t('browserDownload.completed.body', {
              file: activeRequest.suggestedFileName,
            })}
          </p>
          <p>{activeRequest.destination}</p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={t('browserDownload.completed.close')}
            cancelButtonVisible={false}
            onOkButtonClick={event => {
              event.preventDefault()
              actions.dismissCompleted()
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
        onDismissed={actions.dismissCompleted}
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
              actions.dismissCompleted()
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
      onDismissed={actions.dismissCompleted}
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
            actions.dismissCompleted()
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
