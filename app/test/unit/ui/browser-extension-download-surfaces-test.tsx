import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  BrowserExtensionDownloadSurfaces,
  IBrowserExtensionDownloadSurfacesProps,
} from '../../../src/ui/browser-extension-download/browser-extension-download-surfaces'
import { render, fireEvent, screen } from '../../helpers/ui/render'

const request = {
  id: 'browser-surface-test',
  source: 'https://downloads.example.test/archive.zip',
  suggestedFileName: 'archive.zip',
  destination: 'C:\\Downloads\\archive.zip',
  receivedAt: 1_700_000_000_000,
}

function props(
  overrides: Partial<IBrowserExtensionDownloadSurfacesProps> = {}
): IBrowserExtensionDownloadSurfacesProps {
  return {
    availability: { kind: 'available' },
    progress: null,
    onConfirm: () => undefined,
    onCancelBeforeStart: () => undefined,
    onPause: () => undefined,
    onResume: () => undefined,
    onCancel: () => undefined,
    onDismissCompleted: () => undefined,
    ...overrides,
  }
}

describe('BrowserExtensionDownloadSurfaces', () => {
  it('keeps hook order stable when a request appears after an empty state', () => {
    const view = render(<BrowserExtensionDownloadSurfaces {...props()} />)

    assert.doesNotThrow(() => {
      view.rerender(
        <BrowserExtensionDownloadSurfaces
          {...props({
            progress: {
              request,
              phase: 'awaiting-confirmation',
              downloadedBytes: 0,
              totalBytes: 10,
              bytesPerSecond: null,
              error: null,
            },
          })}
        />
      )
    })
    assert.ok(screen.getByRole('dialog', { hidden: true }))
  })

  it('prevents the dialog form from submitting while confirming or dismissing', () => {
    let confirmed = 0
    const view = render(
      <BrowserExtensionDownloadSurfaces
        {...props({
          progress: {
            request,
            phase: 'awaiting-confirmation',
            downloadedBytes: 0,
            totalBytes: 10,
            bytesPerSecond: null,
            error: null,
          },
          onConfirm: () => {
            confirmed++
          },
        })}
      />
    )

    const confirm = view.container.querySelector<HTMLButtonElement>(
      '.button-group button[type="submit"]'
    )
    assert.ok(confirm)
    assert.equal(fireEvent.click(confirm), false)
    assert.equal(confirmed, 1)

    view.rerender(
      <BrowserExtensionDownloadSurfaces
        {...props({
          progress: {
            request,
            phase: 'completed',
            downloadedBytes: 10,
            totalBytes: 10,
            bytesPerSecond: null,
            error: null,
          },
        })}
      />
    )
    const close = view.container.querySelector<HTMLButtonElement>(
      '.button-group button[type="submit"]'
    )
    assert.ok(close)
    assert.equal(fireEvent.click(close), false)
  })
})
