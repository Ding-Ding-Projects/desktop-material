import { BrowserOpenMode, normalizeWebURL } from '../lib/internal-browser'

export interface IBrowserExternalLaunchOptions {
  readonly mode: BrowserOpenMode
  readonly reportFailure: boolean
  readonly openExternal: (target: string) => Promise<void>
  readonly onBrowserOpenFailed: () => void
  readonly onError: (error: Error) => void
}

/**
 * Attempt one operating-system launch and report only rejected HTTP(S)
 * browser launches. File and OS-protocol failures remain with their owning
 * caller, and an explicit internal-browser route is never mislabeled.
 */
export async function launchExternalTarget(
  target: string,
  options: IBrowserExternalLaunchOptions
): Promise<boolean> {
  try {
    await options.openExternal(target)
    return true
  } catch (error) {
    options.onError(error instanceof Error ? error : new Error(String(error)))
    if (
      options.mode === 'external' &&
      options.reportFailure &&
      normalizeWebURL(target) !== null
    ) {
      try {
        options.onBrowserOpenFailed()
      } catch (notificationError) {
        options.onError(
          notificationError instanceof Error
            ? notificationError
            : new Error(String(notificationError))
        )
      }
    }
    return false
  }
}
