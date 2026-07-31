import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  BrowserExternalOpenFailureNoticeKey,
  showBrowserExternalOpenFailure,
} from '../../../src/ui/lib/browser-external-open-failure'

describe('renderer external-browser failure notice', () => {
  it('presents one localized, detail-free, non-blocking notice', () => {
    const calls: Array<ReadonlyArray<string>> = []

    showBrowserExternalOpenFailure(
      {
        showPersistentErrorNotice: (title, message, dedupeKey) =>
          calls.push([title, message, dedupeKey]),
      },
      'english'
    )

    assert.deepEqual(calls, [
      [
        'System browser did not open',
        'Desktop Material could not open this web link in the system browser. Nothing else was opened. Check your default browser and retry, or deliberately choose Inside Desktop Material under Settings → Advanced.',
        BrowserExternalOpenFailureNoticeKey,
      ],
    ])
    assert.doesNotMatch(calls[0].join(' '), /https?:|token=|example\.com/)
  })
})
