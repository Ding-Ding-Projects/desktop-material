import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as Fs from 'node:fs'
import * as Path from 'node:path'

/**
 * Publishing a file with temp-then-rename is correct on POSIX and insufficient
 * on Windows, where the rename fails with EPERM/EACCES/EBUSY whenever anything
 * has the destination open — Defender's scanner, the search indexer, a sync
 * client, or a second writer. The failure is silent data loss, it is
 * intermittent, and it happens more often on better-protected machines.
 *
 * A rule alone cannot catch this: a file with no rename at all passes a rule
 * about renames. So this pairs the rule with a hand-written list of the paths
 * that publish user state and must go through the retrying helper.
 */

const repoRoot = Path.resolve(__dirname, '..', '..', '..')

/** Files that publish user state by renaming a temp file over a target. */
const MUST_USE_RETRYING_RENAME = [
  'app/src/main-process/agent-server/paired-device-store.ts',
  'app/src/main-process/agent-server/agent-server.ts',
  'app/src/lib/stores/app-store.ts',
]

/** Stores that move corrupt repositories aside before reinitializing them. */
const MUST_FAIL_CLOSED_WHEN_QUARANTINE_RENAME_FAILS = [
  'app/src/lib/stores/notification-centre-store.ts',
  'app/src/lib/stores/notification-automation-store.ts',
]

function read(relative: string): string {
  const absolute = Path.join(repoRoot, relative)
  assert.equal(
    Fs.existsSync(absolute),
    true,
    `${relative} is on the atomic-rename list but does not exist. Either the file moved, in which case update this list, or it was deleted, in which case remove the entry deliberately.`
  )
  return Fs.readFileSync(absolute, 'utf8').replace(/\r\n?/g, '\n')
}

describe('files that publish user state retry their rename', () => {
  for (const relative of MUST_USE_RETRYING_RENAME) {
    it(`${relative} imports the retrying helper`, () => {
      const source = read(relative)
      assert.ok(
        source.includes('rename-with-retry'),
        `${relative} does not import renameWithRetry. A bare rename here loses a user's data on Windows whenever a scanner has the destination open.`
      )
    })

    it(`${relative} has no bare rename left`, () => {
      const source = read(relative)
      // Anchored to a call, and checked line by line so a commented-out call
      // cannot satisfy it and a longer identifier cannot hide inside the match.
      const offender = source
        .split('\n')
        .map(line => line.trim())
        .filter(line => !line.startsWith('//') && !line.startsWith('*'))
        .find(
          line =>
            line.includes('Fs.rename(') ||
            line.includes('await rename(') ||
            line.includes('fs.rename(')
        )
      assert.equal(
        offender,
        undefined,
        `${relative} still calls rename directly: ${offender}. Use renameWithRetry.`
      )
    })
  }

  it('the helper itself still refuses to retry a non-transient failure', () => {
    const helper = read('app/src/lib/rename-with-retry.ts')
    assert.ok(helper.includes("'EPERM'"), 'EPERM must be retried')
    assert.ok(helper.includes("'EACCES'"), 'EACCES must be retried')
    assert.ok(helper.includes("'EBUSY'"), 'EBUSY must be retried')
    assert.ok(
      helper.includes('throw error'),
      'the final failure must be rethrown, never swallowed'
    )
  })

  it('batch clone marker replacement retries transient rename failures', () => {
    const source = read('app/src/lib/stores/batch-clone-staging.ts')
    const start = source.indexOf('async function replaceStagingMarker(')
    const end = source.indexOf('\nfunction serializeMarker(', start)

    assert.notEqual(start, -1, 'replaceStagingMarker must remain declared')
    assert.notEqual(end, -1, 'replaceStagingMarker must retain an exact boundary')

    const replacement = source.slice(start, end)
    assert.ok(
      /^import \{ renameWithRetry \} from '\.\.\/rename-with-retry'$/m.test(
        source
      ),
      'batch clone staging must import the retrying rename helper'
    )
    assert.ok(
      /^\s*await renameWithRetry\(temporaryPath, markerPath\)\s*$/m.test(
        replacement
      ),
      'the durable marker replacement must retry transient Windows rename failures'
    )
    assert.equal(
      /^\s*await rename\(temporaryPath, markerPath\)\s*$/m.test(replacement),
      false,
      'the durable marker replacement must not call fs.rename directly'
    )
  })

  for (const relative of MUST_FAIL_CLOSED_WHEN_QUARANTINE_RENAME_FAILS) {
    it(`${relative} retries and fails closed when quarantine cannot move`, () => {
      const source = read(relative)
      const start = source.indexOf(
        '  private async recoverFromUnrecoverableCorruption('
      )
      const end = source.indexOf('\n  }\n}', start)

      assert.notEqual(
        start,
        -1,
        `${relative} must retain its corruption-recovery method`
      )
      assert.notEqual(
        end,
        -1,
        `${relative} corruption-recovery method must retain an exact boundary`
      )

      const recovery = source.slice(start, end)
      assert.ok(
        /^import \{ renameWithRetry \} from '\.\.\/rename-with-retry'$/m.test(
          source
        ),
        `${relative} must import the retrying rename helper`
      )
      assert.ok(
        /^\s*await renameWithRetry\(dir, quarantine\)\s*$/m.test(recovery),
        `${relative} must retry the quarantine move and surface final failure`
      )
      assert.equal(
        /^\s*await rename\(dir, quarantine\)\.catch\(/m.test(recovery),
        false,
        `${relative} must not swallow a failed quarantine move`
      )
    })
  }
})
