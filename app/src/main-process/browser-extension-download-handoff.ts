import {
  BrowserExtensionIntegrationAvailability,
  IBrowserExtensionDownloadRequest,
  parseBrowserExtensionDownloadRequest,
} from '../lib/browser-extension-download'

export interface IBrowserExtensionDownloadHandoffOptions {
  readonly onDownloadRequested: (
    request: IBrowserExtensionDownloadRequest
  ) => void
}

/**
 * Receives a decoded message from the separately installed native-messaging
 * host. It deliberately does not accept messages from the app-hosted browser,
 * the File Explorer shell extension, or renderer IPC; those are different
 * trust boundaries and cannot stand in for a browser-extension handoff.
 */
export class BrowserExtensionDownloadHandoff {
  public constructor(
    private readonly options: IBrowserExtensionDownloadHandoffOptions
  ) {}

  public acceptNativeMessage(value: unknown): boolean {
    const request = parseBrowserExtensionDownloadRequest(value)
    if (request === null) {
      return false
    }
    this.options.onDownloadRequested(request)
    return true
  }

  /**
   * This repository currently ships no browser extension or registered native
   * host manifest. Keep the boundary explicit until an installed extension is
   * built and registered through its own packaging lane.
   */
  public getAvailability(): BrowserExtensionIntegrationAvailability {
    return {
      kind: 'unavailable',
      reason:
        'No installed browser-extension native-messaging host is registered for this Desktop Material build.',
    }
  }
}
