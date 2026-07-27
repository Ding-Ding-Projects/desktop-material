import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  cheapLfsRestoreAnnouncementPercent,
  cheapLfsRestoreLaneReachedLookAhead,
  CheapLfsRestoreLookAheadThresholdPercent,
  CheapLfsRestoreMaximumFailureReasonLength,
  CheapLfsRestoreMaximumPathLength,
  CheapLfsRestoreMaximumVisibleFailures,
  ICheapLfsRestoreProgress,
  normalizeCheapLfsRestoreProgress,
  shouldStartCheapLfsRestoreLookAhead,
} from '../../../src/lib/cheap-lfs/restore-progress'

function progressFixture(
  overrides: Partial<ICheapLfsRestoreProgress> = {}
): ICheapLfsRestoreProgress {
  return {
    repositoryId: 7,
    repositoryName: 'fixture',
    provider: 'github-release',
    phase: 'downloading',
    filesSucceeded: 1,
    filesFailed: 0,
    filesRemaining: 2,
    filesTotal: 3,
    logicalProcessedBytes: 1_000,
    logicalTotalBytes: 3_000,
    actualDownloadedBytes: 700,
    actualDownloadTotalBytes: 2_100,
    downloadRateBytesPerSecond: 200,
    etaSeconds: 7,
    elapsedSeconds: 5,
    queuedFiles: 1,
    queuedParts: 2,
    currentLane: {
      provider: 'github-release',
      phase: 'downloading',
      relativePath: 'assets/current.bin',
      fileOrdinal: 2,
      filesTotal: 3,
      partOrdinal: 1,
      partsTotal: 2,
      processedBytes: 899,
      totalBytes: 1_000,
      percent: 89,
    },
    prefetchLane: null,
    lookAheadThresholdPercent: CheapLfsRestoreLookAheadThresholdPercent,
    failures: [],
    cancelRequested: false,
    ...overrides,
  }
}

describe('Cheap LFS restore progress', () => {
  it('starts look-ahead at exactly 90%, never one byte early', () => {
    assert.equal(shouldStartCheapLfsRestoreLookAhead(899, 1_000), false)
    assert.equal(shouldStartCheapLfsRestoreLookAhead(900, 1_000), true)
    assert.equal(shouldStartCheapLfsRestoreLookAhead(999, 1_000), true)
    assert.equal(shouldStartCheapLfsRestoreLookAhead(0, 0), false)
  })

  it('derives the same exact boundary and integer percent for a lane', () => {
    const before = normalizeCheapLfsRestoreProgress(progressFixture())
    assert.equal(before.currentLane?.percent, 89)
    assert.equal(cheapLfsRestoreLaneReachedLookAhead(before.currentLane), false)

    const atBoundary = normalizeCheapLfsRestoreProgress(
      progressFixture({
        currentLane: {
          ...progressFixture().currentLane!,
          processedBytes: 900,
          // A stale producer percent cannot move the boundary.
          percent: 2,
        },
      })
    )
    assert.equal(atBoundary.currentLane?.percent, 90)
    assert.equal(
      cheapLfsRestoreLaneReachedLookAhead(atBoundary.currentLane),
      true
    )
  })

  it('clamps counters and bounds sanitized paths and failures', () => {
    const longPath = `folder/${'a'.repeat(400)}/movie.bin`
    const unsafeReason =
      'Authorization: Bearer secret https://uploads.example.test/?token=nope ' +
      `${'x'.repeat(400)}`
    const failures = Array.from({ length: 8 }, (_, index) => ({
      relativePath: `${longPath}\n${index}`,
      reason: unsafeReason,
      statusCode: index === 0 ? 422 : 999,
    }))
    const normalized = normalizeCheapLfsRestoreProgress(
      progressFixture({
        filesSucceeded: 1,
        filesFailed: 8,
        filesRemaining: 99,
        filesTotal: 10,
        logicalProcessedBytes: 99_000,
        logicalTotalBytes: 10_000,
        actualDownloadedBytes: 40_000,
        actualDownloadTotalBytes: 20_000,
        failures,
        cancelRequested: true,
        phase: 'downloading',
      })
    )

    assert.equal(normalized.filesSucceeded, 1)
    assert.equal(normalized.filesFailed, 8)
    assert.equal(normalized.filesRemaining, 1)
    assert.equal(normalized.logicalProcessedBytes, 10_000)
    assert.equal(normalized.actualDownloadedBytes, 20_000)
    assert.equal(normalized.phase, 'canceling')
    assert.equal(
      normalized.failures.length,
      CheapLfsRestoreMaximumVisibleFailures
    )
    for (const failure of normalized.failures) {
      assert.ok(
        Array.from(failure.relativePath).length <=
          CheapLfsRestoreMaximumPathLength
      )
      assert.ok(
        Array.from(failure.reason).length <=
          CheapLfsRestoreMaximumFailureReasonLength
      )
      assert.doesNotMatch(failure.reason, /secret|https?:|token=/i)
      assert.doesNotMatch(failure.relativePath, /[\r\n]/)
    }
    assert.equal(normalized.failures[0].statusCode, 422)
    assert.equal(normalized.failures[1].statusCode, undefined)
  })

  it('migrates the sequential producer without inventing network detail', () => {
    const normalized = normalizeCheapLfsRestoreProgress({
      repositoryId: 4,
      repositoryName: 'legacy',
      filesCompleted: 2,
      filesTotal: 5,
      transferredBytes: 500,
      totalBytes: 1_000,
    })

    assert.equal(normalized.filesSucceeded, 2)
    assert.equal(normalized.filesFailed, 0)
    assert.equal(normalized.filesRemaining, 3)
    assert.equal(normalized.logicalProcessedBytes, 500)
    assert.equal(normalized.actualDownloadedBytes, null)
    assert.equal(normalized.actualDownloadTotalBytes, null)
    assert.equal(normalized.queuedFiles, 2)
    assert.equal(
      normalized.lookAheadThresholdPercent,
      CheapLfsRestoreLookAheadThresholdPercent
    )
  })

  it('buckets only the polite summary while leaving exact state untouched', () => {
    const progress = normalizeCheapLfsRestoreProgress(
      progressFixture({
        logicalProcessedBytes: 1_137,
        logicalTotalBytes: 3_000,
      })
    )
    assert.equal(progress.logicalProcessedBytes, 1_137)
    assert.equal(cheapLfsRestoreAnnouncementPercent(progress), 30)

    const complete = normalizeCheapLfsRestoreProgress(
      progressFixture({
        logicalProcessedBytes: 3_000,
        logicalTotalBytes: 3_000,
      })
    )
    assert.equal(cheapLfsRestoreAnnouncementPercent(complete), 100)
  })
})
