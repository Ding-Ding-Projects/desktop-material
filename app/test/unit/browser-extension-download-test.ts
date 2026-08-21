import { strict as assert } from 'assert'
import { readFileSync } from 'fs'
import { describe, it } from 'node:test'
import {
  isBrowserExtensionDownloadDestination,
  parseBrowserExtensionDownloadRequest,
} from '../../src/lib/browser-extension-download'
import {
  BrowserExtensionNativeHostName,
  NativeMessagingMaximumPayloadBytes,
  buildBrowserExtensionNativeHostRegistration,
  buildBrowserExtensionNativeHostManifest,
  decodeNativeMessagingDownloadRequest,
  decodeNativeMessagingFrame,
  encodeNativeMessagingFrame,
} from '../../src/lib/browser-extension-native-messaging'

describe('browser extension download handoff', () => {
  const valid = {
    id: 'browser-request-1',
    source: 'https://downloads.example.test/archive.zip',
    suggestedFileName: 'archive.zip',
    destination: 'C:\\Downloads\\archive.zip',
    receivedAt: 1_700_000_000_000,
  }

  it('accepts only the bounded extension download contract', () => {
    assert.deepEqual(parseBrowserExtensionDownloadRequest(valid), valid)
  })

  it('rejects extension fields that could smuggle a command or transfer option', () => {
    assert.equal(
      parseBrowserExtensionDownloadRequest({ ...valid, command: 'run this' }),
      null
    )
  })

  it('rejects non-web sources and unsafe suggested file names', () => {
    assert.equal(
      parseBrowserExtensionDownloadRequest({
        ...valid,
        source: 'file:///secret',
      }),
      null
    )
    assert.equal(
      parseBrowserExtensionDownloadRequest({
        ...valid,
        suggestedFileName: '../archive.zip',
      }),
      null
    )
    assert.equal(
      parseBrowserExtensionDownloadRequest({
        ...valid,
        source: 'https://user:password@example.test/archive.zip',
      }),
      null
    )
  })

  it('requires a Windows local destination rather than an extension URI', () => {
    assert.equal(isBrowserExtensionDownloadDestination(valid.destination), true)
    assert.equal(
      isBrowserExtensionDownloadDestination('https://example.test/out'),
      false
    )
    assert.equal(
      isBrowserExtensionDownloadDestination('C:\\Downloads\\..\\out'),
      false
    )
    assert.equal(
      isBrowserExtensionDownloadDestination('C:\\Downloads\\out. '),
      false
    )
  })

  it('decodes and re-encodes one native-messaging frame', () => {
    const frame = encodeNativeMessagingFrame(valid)
    const decoded = decodeNativeMessagingDownloadRequest(frame)
    assert.deepEqual(decoded, { kind: 'accepted', request: valid })
    assert.deepEqual(decodeNativeMessagingFrame(frame), {
      kind: 'complete',
      value: valid,
      bytesRead: frame.byteLength,
    })
  })

  it('rejects oversized, truncated, trailing, invalid UTF-8, and invalid JSON frames', () => {
    const oversized = new Uint8Array(4)
    new DataView(oversized.buffer).setUint32(
      0,
      NativeMessagingMaximumPayloadBytes + 1,
      true
    )
    assert.equal(decodeNativeMessagingFrame(oversized).kind, 'rejected')

    const frame = encodeNativeMessagingFrame(valid)
    assert.equal(
      decodeNativeMessagingFrame(frame.slice(0, -1)).kind,
      'incomplete'
    )
    const trailing = new Uint8Array(frame.byteLength + 1)
    trailing.set(frame)
    assert.equal(decodeNativeMessagingFrame(trailing).kind, 'rejected')

    const invalidUtf8 = new Uint8Array([2, 0, 0, 0, 0xc3, 0x28])
    assert.equal(decodeNativeMessagingFrame(invalidUtf8).kind, 'rejected')
    const invalidJson = new Uint8Array([1, 0, 0, 0, 0x7b])
    assert.equal(decodeNativeMessagingFrame(invalidJson).kind, 'rejected')
  })

  it('requires an exact Chrome extension ID and absolute host executable path', () => {
    const manifest = JSON.parse(
      buildBrowserExtensionNativeHostManifest({
        executablePath:
          'C:\\Program Files\\Desktop Material\\browser-download-host.exe',
        extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      })
    )
    assert.equal(manifest.name, BrowserExtensionNativeHostName)
    assert.deepEqual(manifest.allowed_origins, [
      'chrome-extension://abcdefghijklmnopabcdefghijklmnop/*',
    ])
    assert.throws(
      () =>
        buildBrowserExtensionNativeHostManifest({
          executablePath: 'browser-download-host.exe',
          extensionId: 'abcdefghijklmnopabcdefghijklmnop',
        }),
      /absolute Windows path/
    )
    assert.throws(
      () =>
        buildBrowserExtensionNativeHostManifest({
          executablePath: 'C:\\browser-download-host.exe',
          extensionId: '*',
        }),
      /exact 32-character Chrome extension ID/
    )
    assert.throws(
      () =>
        buildBrowserExtensionNativeHostManifest({
          executablePath: 'C:\\browser-download-host.exe',
          extensionId: 'qbcdefghijklmnopabcdefghijklmnop',
        }),
      /exact 32-character Chrome extension ID/
    )
  })

  it('builds only fixed per-user registry argv for supported browsers', () => {
    assert.deepEqual(
      buildBrowserExtensionNativeHostRegistration({
        browser: 'chrome',
        manifestPath: 'C:\\Program Files\\Desktop Material\\host.json',
      }),
      [
        'ADD',
        `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${BrowserExtensionNativeHostName}`,
        '/ve',
        '/t',
        'REG_SZ',
        '/d',
        'C:\\Program Files\\Desktop Material\\host.json',
        '/f',
      ]
    )
    assert.throws(
      () =>
        buildBrowserExtensionNativeHostRegistration({
          browser: 'chrome',
          manifestPath: 'host.json',
        }),
      /absolute Windows path/
    )
    assert.throws(
      () =>
        buildBrowserExtensionNativeHostRegistration({
          browser: 'safari' as 'chrome',
          manifestPath: 'C:\\host.json',
        }),
      /not supported/
    )
  })

  it('keeps the checked-in extension as a Manifest V3 native-messaging entry', () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL('../../../browser-extension/manifest.json', import.meta.url),
        'utf8'
      )
    )
    assert.equal(manifest.manifest_version, 3)
    assert.ok(manifest.permissions.includes('nativeMessaging'))
    assert.equal(manifest.background.service_worker, 'background.js')
    assert.equal(manifest.options_page, 'options.html')
    const background = readFileSync(
      new URL('../../../browser-extension/background.js', import.meta.url),
      'utf8'
    )
    assert.match(background, /chrome\.runtime\.connectNative\(HOST_NAME\)/)
  })
})
