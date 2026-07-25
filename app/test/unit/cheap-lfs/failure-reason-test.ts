import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  cheapLfsFailedFileRowText,
  cheapLfsFailureReasonText,
  cheapLfsPinFailureReasonText,
} from '../../../src/lib/cheap-lfs/failure-reason'
import {
  CheapLfsMaximumFailureReasonLength,
  cheapLfsFailureStatusCode,
  sanitizeCheapLfsFailureReason,
} from '../../../src/lib/cheap-lfs/operations'
import {
  cantoneseTranslations,
  englishTranslations,
} from '../../../src/lib/i18n-resources'

describe('sanitizeCheapLfsFailureReason', () => {
  it('keeps a real provider reason readable', () => {
    assert.strictEqual(
      sanitizeCheapLfsFailureReason(
        'GitHub could not create the release. (Validation Failed)'
      ),
      'GitHub could not create the release. (Validation Failed)'
    )
  })

  it('collapses control characters so nothing can forge terminal output', () => {
    const escape = String.fromCharCode(0x1b)
    assert.strictEqual(
      sanitizeCheapLfsFailureReason(`bad${escape}[2Jreason\nhere `),
      'bad [2Jreason here'
    )
    const control = /[\u0000-\u001f\u007f-\u009f]/
    assert.doesNotMatch(sanitizeCheapLfsFailureReason(`a${escape}bc`), control)
  })

  it('never echoes a URL that could carry an upload token', () => {
    const sanitized = sanitizeCheapLfsFailureReason(
      'Upload failed for https://uploads.github.com/x?token=SECRET123 retry later'
    )
    assert.doesNotMatch(sanitized, /SECRET123/)
    assert.doesNotMatch(sanitized, /https:/)
    assert.match(sanitized, /Upload failed for/)
  })

  it('never echoes a GitHub token or an authorization value', () => {
    assert.doesNotMatch(
      sanitizeCheapLfsFailureReason('denied for ghp_abcdef0123456789'),
      /ghp_/
    )
    assert.doesNotMatch(
      sanitizeCheapLfsFailureReason('Authorization: Bearer abcdef'),
      /abcdef/
    )
    assert.doesNotMatch(
      sanitizeCheapLfsFailureReason('rejected (token=abcdef)'),
      /abcdef/
    )
  })

  it('keeps an innocuous sentence that merely mentions a token', () => {
    // Redaction is credential-shaped, not keyword-shaped, so a real diagnosis
    // is not mangled into something the user cannot act on.
    assert.strictEqual(
      sanitizeCheapLfsFailureReason('Tried to use an invalid trampoline token'),
      'Tried to use an invalid trampoline token'
    )
  })

  it('bounds one row so it cannot dominate the terminal', () => {
    const sanitized = sanitizeCheapLfsFailureReason('x'.repeat(5_000))
    assert.strictEqual(
      Array.from(sanitized).length,
      CheapLfsMaximumFailureReasonLength
    )
    assert.ok(sanitized.endsWith('…'))
  })

  it('reports an empty reason rather than inventing one', () => {
    assert.strictEqual(sanitizeCheapLfsFailureReason('   '), '')
  })
})

describe('cheapLfsFailureStatusCode', () => {
  it('reads the status a releases/API error carries', () => {
    assert.strictEqual(
      cheapLfsFailureStatusCode(
        Object.assign(new Error('Validation Failed'), { responseStatus: 422 })
      ),
      422
    )
  })

  it('reports none for an error without a usable status', () => {
    assert.strictEqual(cheapLfsFailureStatusCode(new Error('nope')), undefined)
    assert.strictEqual(
      cheapLfsFailureStatusCode(
        Object.assign(new Error('x'), { responseStatus: 42 })
      ),
      undefined
    )
    assert.strictEqual(
      cheapLfsFailureStatusCode(
        Object.assign(new Error('x'), { responseStatus: '422' })
      ),
      undefined
    )
    assert.strictEqual(cheapLfsFailureStatusCode(undefined), undefined)
  })
})

describe('cheapLfsFailureReasonText', () => {
  it('prefers a self-diagnosed reason over relayed provider text', () => {
    assert.strictEqual(
      cheapLfsFailureReasonText({
        message: 'Validation Failed',
        reasonKey: 'cheapLfs.firstPublish.noRepository',
      }),
      englishTranslations['cheapLfs.firstPublish.noRepository']
    )
  })

  it('falls back to the sanitized provider message', () => {
    assert.strictEqual(
      cheapLfsFailureReasonText({ message: 'Validation  Failed' }),
      'Validation Failed'
    )
  })

  it('reports nothing when there is nothing honest to say', () => {
    assert.strictEqual(cheapLfsFailureReasonText(undefined), '')
    assert.strictEqual(cheapLfsFailureReasonText({}), '')
  })
})

describe('cheapLfsPinFailureReasonText', () => {
  it('adds the provider status to the notification body', () => {
    // The reported defect: `pinned 0 · failed 10` with the 422 log-only.
    assert.strictEqual(
      cheapLfsPinFailureReasonText({
        message: 'Validation Failed',
        statusCode: 422,
      }),
      ' Reason: HTTP 422 — Validation Failed'
    )
  })

  it('omits a status for a reason this app diagnosed itself', () => {
    const text = cheapLfsPinFailureReasonText({
      message: 'Validation Failed',
      statusCode: 422,
      reasonKey: 'cheapLfs.firstPublish.noRemote',
    })
    assert.doesNotMatch(text, /HTTP/)
    assert.match(text, /push remote/)
  })

  it('stays empty rather than ending in a dangling "Reason:"', () => {
    assert.strictEqual(cheapLfsPinFailureReasonText({ message: '' }), '')
    assert.strictEqual(cheapLfsPinFailureReasonText(undefined), '')
  })
})

describe('cheapLfsFailedFileRowText', () => {
  it('names the file and the status for a provider failure', () => {
    assert.strictEqual(
      cheapLfsFailedFileRowText('big.bin', {
        reason: 'Validation Failed',
        statusCode: 422,
      }),
      'big.bin — HTTP 422: Validation Failed'
    )
  })

  it('names the file and the reason when there is no status', () => {
    assert.strictEqual(
      cheapLfsFailedFileRowText('big.bin', { reason: 'Upload timed out' }),
      'big.bin — Upload timed out'
    )
  })

  it('still says something honest when a provider gives no reason', () => {
    assert.match(
      cheapLfsFailedFileRowText('big.bin', { reason: '' }),
      /big\.bin — .*no reason/
    )
  })

  it('publishes every failure string in both languages', () => {
    for (const key of [
      'cheapLfs.progress.terminalFailuresLabel',
      'cheapLfs.progress.terminalFailedFile',
      'cheapLfs.progress.terminalFailedFileWithStatus',
      'cheapLfs.progress.terminalFailedFileNoReason',
      'cheapLfs.progress.terminalFailuresOmitted',
      'cheapLfs.pinFailures.reason',
      'cheapLfs.pinFailures.reasonWithStatus',
    ] as const) {
      assert.ok((englishTranslations[key] ?? '').length > 0, key)
      assert.ok((cantoneseTranslations[key] ?? '').length > 0, key)
    }
  })
})
