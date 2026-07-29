import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  estimateCommandLength,
  maximumGitHubReporterFiles,
  partitionFiles,
  parseReportedTests,
  shouldUseGitHubReporter,
  summarizeRun,
} from './test.mjs'

// A completed batch: spawned, exited normally, and emitted a reporter summary.
function completedBatch(files, exitCode, reportedTests) {
  return {
    files,
    exitCode,
    signal: null,
    spawnError: null,
    reportedTests,
  }
}

describe('test harness partitioning', () => {
  it('keeps every file in exactly one batch, preserving order', () => {
    const files = ['a', 'b', 'c', 'd', 'e']
    const batches = partitionFiles([], files, 13)
    assert.deepEqual(batches.flat(), files)
    // Each file has its own batch once the running command exceeds the tiny
    // limit, but nothing is dropped or duplicated.
    assert.equal(new Set(batches.flat()).size, files.length)
  })

  it('splits only when the estimated command exceeds the limit', () => {
    const files = ['f1', 'f2', 'f3', 'f4']
    assert.equal(partitionFiles([], files, 1000).length, 1)
    assert.equal(partitionFiles([], files, 13).length, files.length)
  })

  it('always yields at least one batch, even with no files', () => {
    assert.deepEqual(partitionFiles([], [], 100), [[]])
  })

  it('accounts for base args in the length estimate', () => {
    assert.ok(
      estimateCommandLength(['--test', 'file.tsx']) >
        estimateCommandLength(['file.tsx'])
    )
  })

  it('bounds GitHub step summaries for the complete unit suite', () => {
    assert.equal(shouldUseGitHubReporter(false, 1), false)
    assert.equal(
      shouldUseGitHubReporter(true, maximumGitHubReporterFiles),
      true
    )
    assert.equal(
      shouldUseGitHubReporter(true, maximumGitHubReporterFiles + 1),
      false
    )
  })
})

describe('test harness reporter parsing', () => {
  it('reads the reported test count from the TAP summary', () => {
    assert.equal(
      parseReportedTests('TAP version 13\n# tests 42\n# pass 42\n'),
      42
    )
  })

  it('uses the final summary when several are present', () => {
    assert.equal(parseReportedTests('# tests 3\nfiller\n# tests 7\n'), 7)
  })

  it('returns null when no summary was emitted (a crashed batch)', () => {
    assert.equal(parseReportedTests('TAP version 13\nok 1 - a passed\n'), null)
  })
})

describe('test harness run accounting', () => {
  const discovered = ['a', 'b', 'c', 'd']

  it('passes cleanly when every file is accounted for', () => {
    const summary = summarizeRun(discovered, [
      completedBatch(['a', 'b'], 0, 10),
      completedBatch(['c', 'd'], 0, 8),
    ])
    assert.equal(summary.ok, true)
    assert.equal(summary.discovered, 4)
    assert.equal(summary.accounted, 4)
    assert.equal(summary.reportedTests, 18)
    assert.deepEqual(summary.missingFiles, [])
    assert.equal(summary.failingExitCode, 0)
  })

  it('fails on real test failures but reports no skipped files', () => {
    const summary = summarizeRun(discovered, [
      completedBatch(['a', 'b'], 1, 10),
      completedBatch(['c', 'd'], 0, 8),
    ])
    assert.equal(summary.ok, false)
    assert.equal(summary.failingExitCode, 1)
    // The failing batch still ran all its files, so nothing is silently skipped.
    assert.deepEqual(summary.missingFiles, [])
    assert.equal(summary.accounted, 4)
  })

  it('flags files whose batch produced no reporter summary (silent skip)', () => {
    const summary = summarizeRun(discovered, [
      completedBatch(['a', 'b'], 0, 10),
      // Exited 0 yet emitted no summary — e.g. a coordinator that died, or a
      // batch that the old `break` never ran at all.
      {
        files: ['c', 'd'],
        exitCode: 0,
        signal: null,
        spawnError: null,
        reportedTests: null,
      },
    ])
    assert.equal(summary.ok, false)
    assert.deepEqual(summary.missingFiles, ['c', 'd'])
    assert.equal(summary.accounted, 2)
    assert.equal(summary.incompleteBatches.length, 1)
  })

  it('flags a batch that failed to spawn (e.g. ENAMETOOLONG)', () => {
    const summary = summarizeRun(
      ['a', 'b'],
      [
        {
          files: ['a', 'b'],
          exitCode: null,
          signal: null,
          spawnError: { code: 'E2BIG', message: 'spawn E2BIG' },
          reportedTests: null,
        },
      ]
    )
    assert.equal(summary.ok, false)
    assert.deepEqual(summary.missingFiles, ['a', 'b'])
    assert.equal(summary.failingExitCode, 1)
  })

  it('flags a batch terminated by a signal', () => {
    const summary = summarizeRun(
      ['a'],
      [
        {
          files: ['a'],
          exitCode: null,
          signal: 'SIGKILL',
          spawnError: null,
          reportedTests: null,
        },
      ]
    )
    assert.equal(summary.ok, false)
    assert.deepEqual(summary.missingFiles, ['a'])
    assert.equal(summary.failingExitCode, 128)
  })

  it('only counts reported tests from completed batches', () => {
    const summary = summarizeRun(
      ['a', 'b'],
      [
        completedBatch(['a'], 0, 5),
        {
          files: ['b'],
          exitCode: 0,
          signal: null,
          spawnError: null,
          reportedTests: null,
        },
      ]
    )
    assert.equal(summary.reportedTests, 5)
    assert.deepEqual(summary.missingFiles, ['b'])
  })
})
