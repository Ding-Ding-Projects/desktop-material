import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  BulkReleaseDeleteMaximumReportedFailures,
  bulkReleaseDeleteAttempted,
  bulkReleaseDeleteRemaining,
  bulkReleaseDeleteReportedFailures,
  finishBulkReleaseDelete,
  IBulkReleaseDeleteState,
  recordBulkReleaseDeleteFailure,
  recordBulkReleaseDeleteSuccess,
  requestBulkReleaseDeleteStop,
  startBulkReleaseDelete,
} from '../../src/lib/github-release-bulk-delete'

function failure(id: number, reason: string = 'GitHub denied permission.') {
  return { releaseId: id, tagName: `v1.${id}.0`, reason }
}

describe('bulk release deletion progress', () => {
  it('counts a clean batch to completion', () => {
    let state = startBulkReleaseDelete(3)
    assert.equal(state.running, true)
    assert.equal(state.total, 3)
    assert.equal(bulkReleaseDeleteAttempted(state), 0)
    assert.equal(bulkReleaseDeleteRemaining(state), 3)

    for (let index = 0; index < 3; index++) {
      state = recordBulkReleaseDeleteSuccess(state)
    }
    state = finishBulkReleaseDelete(state)

    assert.equal(state.deleted, 3)
    assert.deepEqual(state.failures, [])
    assert.equal(state.running, false)
    assert.equal(bulkReleaseDeleteRemaining(state), 0)
  })

  it('keeps deleting after a release fails and reports every reason', () => {
    // A single stale fingerprint must not abandon the rest of the reviewed
    // selection, and the operator must still learn which release failed.
    let state = startBulkReleaseDelete(4)
    state = recordBulkReleaseDeleteSuccess(state)
    state = recordBulkReleaseDeleteFailure(state, failure(8, 'Release is gone'))
    state = recordBulkReleaseDeleteSuccess(state)
    state = recordBulkReleaseDeleteFailure(state, failure(9, 'Denied'))
    state = finishBulkReleaseDelete(state)

    assert.equal(state.deleted, 2)
    assert.equal(bulkReleaseDeleteAttempted(state), 4)
    assert.equal(bulkReleaseDeleteRemaining(state), 0)
    assert.deepEqual(
      state.failures.map(entry => [entry.tagName, entry.reason]),
      [
        ['v1.8.0', 'Release is gone'],
        ['v1.9.0', 'Denied'],
      ]
    )
  })

  it('reports the exact split when a stop lands mid-batch', () => {
    let state = startBulkReleaseDelete(5)
    state = recordBulkReleaseDeleteSuccess(state)
    state = recordBulkReleaseDeleteFailure(state, failure(8))
    state = requestBulkReleaseDeleteStop(state)
    assert.equal(state.stopRequested, true)

    // The release already in flight still finishes and is still counted; only
    // the releases never sent are reported as not attempted.
    state = recordBulkReleaseDeleteSuccess(state)
    state = finishBulkReleaseDelete(state)

    assert.equal(state.deleted, 2)
    assert.equal(state.failures.length, 1)
    assert.equal(bulkReleaseDeleteAttempted(state), 3)
    assert.equal(bulkReleaseDeleteRemaining(state), 2)
    assert.equal(state.running, false)
  })

  it('ignores results that arrive after the batch closed', () => {
    let state = startBulkReleaseDelete(2)
    state = recordBulkReleaseDeleteSuccess(state)
    const finished = finishBulkReleaseDelete(state)

    assert.equal(recordBulkReleaseDeleteSuccess(finished), finished)
    assert.equal(recordBulkReleaseDeleteFailure(finished, failure(8)), finished)
    assert.equal(requestBulkReleaseDeleteStop(finished), finished)
    assert.equal(finished.deleted, 1)
    assert.equal(bulkReleaseDeleteRemaining(finished), 1)
  })

  it('never counts more work than the reviewed selection contained', () => {
    let state = startBulkReleaseDelete(1)
    state = recordBulkReleaseDeleteSuccess(state)
    state = recordBulkReleaseDeleteSuccess(state)
    state = recordBulkReleaseDeleteFailure(state, failure(8))

    assert.equal(state.deleted, 1)
    assert.deepEqual(state.failures, [])
    assert.equal(bulkReleaseDeleteAttempted(state), 1)
  })

  it('treats a nonsensical total as an empty batch', () => {
    for (const total of [0, -3, 1.5, Number.NaN]) {
      const state = startBulkReleaseDelete(total)
      assert.equal(state.total, 0)
      assert.equal(recordBulkReleaseDeleteSuccess(state).deleted, 0)
    }
  })

  it('flattens control characters and clamps a long provider reason', () => {
    // A provider message must not be able to forge extra lines in the failure
    // list or push the summary off the surface.
    const forged = [
      'denied',
      String.fromCharCode(13, 10),
      'second',
      String.fromCharCode(127),
      '  line   spaced',
    ].join('')
    let state = startBulkReleaseDelete(2)
    state = recordBulkReleaseDeleteFailure(state, failure(8, forged))
    state = recordBulkReleaseDeleteFailure(state, failure(9, 'x'.repeat(400)))

    assert.equal(state.failures[0].reason, 'denied second line spaced')
    assert.equal(state.failures[1].reason.length, 240)
    assert.ok(state.failures[1].reason.endsWith('…'))
  })

  it('shows a bounded failure list and admits what it omitted', () => {
    let state: IBulkReleaseDeleteState = startBulkReleaseDelete(9)
    for (let index = 0; index < 7; index++) {
      state = recordBulkReleaseDeleteFailure(state, failure(index))
    }

    const { shown, omitted } = bulkReleaseDeleteReportedFailures(state)
    assert.equal(shown.length, BulkReleaseDeleteMaximumReportedFailures)
    assert.equal(omitted, 7 - BulkReleaseDeleteMaximumReportedFailures)
    assert.equal(
      bulkReleaseDeleteReportedFailures(startBulkReleaseDelete(2)).omitted,
      0
    )
  })
})
