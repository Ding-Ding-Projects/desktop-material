import {
  BrowserExtensionDownloadMaximumDestinationLength,
  BrowserExtensionDownloadMaximumURLLength,
  IBrowserExtensionDownloadRequest,
  parseBrowserExtensionDownloadRequest,
} from './browser-extension-download'

/** The stable host name used by the unpacked extension and the host manifest. */
export const BrowserExtensionNativeHostName =
  'com.dingdingprojects.desktop_material.browser_download'

/** Chrome's native-messaging frame header is a little-endian uint32. */
export const NativeMessagingFrameHeaderBytes = 4
export const NativeMessagingMaximumPayloadBytes = 64 * 1024

export type NativeMessagingFrameResult =
  | {
      readonly kind: 'complete'
      readonly value: unknown
      readonly bytesRead: number
    }
  | { readonly kind: 'incomplete'; readonly expectedBytes: number }
  | { readonly kind: 'rejected'; readonly reason: string }

/**
 * Decode exactly one browser native-messaging frame. The caller owns stream
 * buffering; this function never reads beyond one bounded payload and never
 * accepts trailing bytes as part of the JSON value.
 */
export function decodeNativeMessagingFrame(
  frame: Uint8Array
): NativeMessagingFrameResult {
  if (frame.byteLength < NativeMessagingFrameHeaderBytes) {
    return {
      kind: 'incomplete',
      expectedBytes: NativeMessagingFrameHeaderBytes,
    }
  }

  const payloadLength = new DataView(
    frame.buffer,
    frame.byteOffset,
    frame.byteLength
  ).getUint32(0, true)
  if (payloadLength > NativeMessagingMaximumPayloadBytes) {
    return {
      kind: 'rejected',
      reason: 'Native-messaging payload exceeds the 64 KiB limit.',
    }
  }

  const expectedBytes = NativeMessagingFrameHeaderBytes + payloadLength
  if (frame.byteLength < expectedBytes) {
    return { kind: 'incomplete', expectedBytes }
  }
  if (frame.byteLength !== expectedBytes) {
    return {
      kind: 'rejected',
      reason: 'Native-messaging frame contains trailing bytes.',
    }
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(
      frame.slice(NativeMessagingFrameHeaderBytes)
    )
  } catch {
    return {
      kind: 'rejected',
      reason: 'Native-messaging payload is not UTF-8.',
    }
  }

  try {
    const value: unknown = JSON.parse(text)
    return { kind: 'complete', value, bytesRead: expectedBytes }
  } catch {
    return { kind: 'rejected', reason: 'Native-messaging payload is not JSON.' }
  }
}

/** Encode one bounded response frame for Chrome. */
export function encodeNativeMessagingFrame(value: unknown): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(value))
  if (payload.byteLength > NativeMessagingMaximumPayloadBytes) {
    throw new Error('Native-messaging response exceeds the 64 KiB limit.')
  }

  const frame = new Uint8Array(
    NativeMessagingFrameHeaderBytes + payload.byteLength
  )
  new DataView(frame.buffer).setUint32(0, payload.byteLength, true)
  frame.set(payload, NativeMessagingFrameHeaderBytes)
  return frame
}

/** Decode and validate the one request shape the native host may forward. */
export function decodeNativeMessagingDownloadRequest(frame: Uint8Array):
  | {
      readonly kind: 'accepted'
      readonly request: IBrowserExtensionDownloadRequest
    }
  | { readonly kind: 'rejected'; readonly reason: string } {
  const decoded = decodeNativeMessagingFrame(frame)
  if (decoded.kind !== 'complete') {
    return {
      kind: 'rejected',
      reason:
        decoded.kind === 'incomplete'
          ? `Native-messaging frame is incomplete; expected ${decoded.expectedBytes} bytes.`
          : decoded.reason,
    }
  }

  const request = parseBrowserExtensionDownloadRequest(decoded.value)
  return request === null
    ? {
        kind: 'rejected',
        reason: 'Native-messaging request failed validation.',
      }
    : { kind: 'accepted', request }
}

export interface IBrowserExtensionNativeHostManifestOptions {
  /** Absolute path to a real native-messaging host executable. */
  readonly executablePath: string
  /** Exact unpacked/installed extension ID; wildcards are refused. */
  readonly extensionId: string
}

export type BrowserExtensionNativeMessagingBrowser = 'chrome' | 'edge'

export interface IBrowserExtensionNativeHostRegistrationOptions {
  readonly browser: BrowserExtensionNativeMessagingBrowser
  /** Absolute path to the generated host manifest JSON. */
  readonly manifestPath: string
}

const windowsAbsolutePath = /^[a-zA-Z]:[\\/][^\0]*$/
const chromeExtensionId = /^[a-p]{32}$/

/**
 * Build the host registration JSON without ever inventing a wildcard origin.
 * A host manifest with a wildcard would let an unrelated extension submit
 * download requests, so registration is deliberately impossible without the
 * exact extension ID and executable path.
 */
export function buildBrowserExtensionNativeHostManifest(
  options: IBrowserExtensionNativeHostManifestOptions
): string {
  if (!windowsAbsolutePath.test(options.executablePath)) {
    throw new Error(
      'Native host executable path must be an absolute Windows path.'
    )
  }
  if (!chromeExtensionId.test(options.extensionId)) {
    throw new Error(
      'Native host registration requires the exact 32-character Chrome extension ID.'
    )
  }

  return JSON.stringify(
    {
      name: BrowserExtensionNativeHostName,
      description: 'Desktop Material browser download handoff',
      path: options.executablePath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${options.extensionId}/*`],
    },
    null,
    2
  )
}

/**
 * Build the exact per-user registry operation used by Chrome and Edge. The
 * caller must execute this fixed argv with `shell: false`; no browser,
 * extension, or renderer value can become a command fragment.
 */
export function buildBrowserExtensionNativeHostRegistration(
  options: IBrowserExtensionNativeHostRegistrationOptions
): ReadonlyArray<string> {
  if (!windowsAbsolutePath.test(options.manifestPath)) {
    throw new Error(
      'Native host manifest path must be an absolute Windows path.'
    )
  }

  const browserKey =
    options.browser === 'chrome'
      ? 'Google\\Chrome'
      : options.browser === 'edge'
      ? 'Microsoft\\Edge'
      : null
  if (browserKey === null) {
    throw new Error('Native host registration browser is not supported.')
  }

  return [
    'ADD',
    `HKCU\\Software\\${browserKey}\\NativeMessagingHosts\\${BrowserExtensionNativeHostName}`,
    '/ve',
    '/t',
    'REG_SZ',
    '/d',
    options.manifestPath,
    '/f',
  ]
}

/** Keep the native host's bounds visible to callers that build an options UI. */
export const BrowserExtensionNativeHostLimits = Object.freeze({
  maximumSourceLength: BrowserExtensionDownloadMaximumURLLength,
  maximumDestinationLength: BrowserExtensionDownloadMaximumDestinationLength,
})
