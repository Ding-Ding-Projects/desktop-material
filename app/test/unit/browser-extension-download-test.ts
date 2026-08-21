import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import {
  isBrowserExtensionDownloadDestination,
  parseBrowserExtensionDownloadRequest,
} from '../../src/lib/browser-extension-download'

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
      parseBrowserExtensionDownloadRequest({ ...valid, source: 'file:///secret' }),
      null
    )
    assert.equal(
      parseBrowserExtensionDownloadRequest({ ...valid, suggestedFileName: '../archive.zip' }),
      null
    )
  })

  it('requires a Windows local destination rather than an extension URI', () => {
    assert.equal(isBrowserExtensionDownloadDestination(valid.destination), true)
    assert.equal(isBrowserExtensionDownloadDestination('https://example.test/out'), false)
  })
})
