import * as React from 'react'
import { IBrowserExtensionDownloadProgress } from '../../lib/browser-extension-download'
import { BrowserExtensionDownloadSurfaces } from './browser-extension-download-surfaces'
import {
  cancelBrowserExtensionDownload,
  confirmBrowserExtensionDownload,
  onBrowserExtensionDownloadProgress,
  pauseBrowserExtensionDownload,
  resumeBrowserExtensionDownload,
} from '../main-process-proxy'

export function BrowserExtensionDownloadRuntimeHost() {
  const [progress, setProgress] =
    React.useState<IBrowserExtensionDownloadProgress | null>(null)
  React.useEffect(
    () =>
      onBrowserExtensionDownloadProgress((_event, next) => setProgress(next)),
    []
  )
  return (
    <BrowserExtensionDownloadSurfaces
      availability={{ kind: 'available' }}
      progress={progress}
      onConfirm={value => void confirmBrowserExtensionDownload(value.id)}
      onCancelBeforeStart={value => {
        void cancelBrowserExtensionDownload(value.id)
        setProgress(null)
      }}
      onPause={value => void pauseBrowserExtensionDownload(value.id)}
      onResume={value => void resumeBrowserExtensionDownload(value.id)}
      onCancel={value => void cancelBrowserExtensionDownload(value.id)}
      onDismissCompleted={value => {
        void cancelBrowserExtensionDownload(value.id)
        setProgress(null)
      }}
    />
  )
}
