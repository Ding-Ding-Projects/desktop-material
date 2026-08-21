/**
 * The narrow, serializable contract accepted from an installed browser
 * extension. The in-app browser's blocked-download route is intentionally not
 * a producer for this contract: it is sandboxed page navigation, not an
 * extension handoff.
 */
export interface IBrowserExtensionDownloadRequest {
  readonly id: string
  readonly source: string
  readonly suggestedFileName: string
  readonly destination: string
  readonly receivedAt: number
}

export type BrowserExtensionDownloadPhase =
  | 'awaiting-confirmation'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled'

export interface IBrowserExtensionDownloadProgress {
  readonly request: IBrowserExtensionDownloadRequest
  readonly phase: BrowserExtensionDownloadPhase
  readonly downloadedBytes: number
  readonly totalBytes: number | null
  readonly bytesPerSecond: number | null
  readonly error: string | null
}

export type BrowserExtensionIntegrationAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: string }

export const BrowserExtensionDownloadMaximumURLLength = 8_192
export const BrowserExtensionDownloadMaximumFileNameLength = 240
export const BrowserExtensionDownloadMaximumDestinationLength = 32_768

const safeFileName = /^[^\\/:*?"<>|\u0000-\u001f]+$/
const messageKeys = new Set([
  'id',
  'source',
  'suggestedFileName',
  'destination',
  'receivedAt',
])

/**
 * Parse one already-length-bounded native-messaging payload. This is strict by
 * design: extension metadata is untrusted and must never become an arbitrary
 * file or command request.
 */
export function parseBrowserExtensionDownloadRequest(
  value: unknown
): IBrowserExtensionDownloadRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !messageKeys.has(key))) {
    return null
  }

  const { id, source, suggestedFileName, destination, receivedAt } = record
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > 128 ||
    typeof source !== 'string' ||
    source.length === 0 ||
    source.length > BrowserExtensionDownloadMaximumURLLength ||
    typeof suggestedFileName !== 'string' ||
    suggestedFileName.length === 0 ||
    suggestedFileName.length > BrowserExtensionDownloadMaximumFileNameLength ||
    !safeFileName.test(suggestedFileName) ||
    typeof destination !== 'string' ||
    destination.length === 0 ||
    destination.length > BrowserExtensionDownloadMaximumDestinationLength ||
    !isBrowserExtensionDownloadDestination(destination) ||
    typeof receivedAt !== 'number' ||
    !Number.isSafeInteger(receivedAt) ||
    receivedAt < 0
  ) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(source)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null
  }
  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hostname === ''
  ) {
    return null
  }

  return { id, source, suggestedFileName, destination, receivedAt }
}

/** A destination must be a complete local path, never an extension-provided URI. */
export function isBrowserExtensionDownloadDestination(value: string): boolean {
  if (
    value.length === 0 ||
    /[\u0000-\u001f]/u.test(value) ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(value) ||
    /[ .](?:\\|\/)?$/u.test(value)
  ) {
    return false
  }
  return /^(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/.test(value)
}
