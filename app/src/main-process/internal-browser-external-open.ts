import { launchExternalTarget } from './browser-external-launch'

/**
 * Open an app-hosted browser tab in the system browser. A rejected HTTP(S)
 * launch reports only the owning Desktop Material window id; neither the URL
 * nor the Electron error crosses into the renderer notice.
 */
export function openInternalBrowserURLExternally(
  url: string,
  ownerWindowId: number | null,
  openExternal: (target: string) => Promise<void>,
  onExternalOpenFailed: (ownerWindowId: number | null) => void,
  onError: (error: Error) => void
): Promise<boolean> {
  return launchExternalTarget(url, {
    mode: 'external',
    reportFailure: true,
    openExternal,
    onBrowserOpenFailed: () => onExternalOpenFailed(ownerWindowId),
    onError,
  })
}
