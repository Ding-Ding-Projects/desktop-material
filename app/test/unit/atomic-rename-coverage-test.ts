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
]

function read(relative: string): string {
  const absolute = Path.join(repoRoot, relative)
  assert.equal(
    Fs.existsSync(absolute),
    true,
    `${relative} is on the atomic-rename list but does not exist. Either the file moved, in which case update this list, or it was deleted, in which case remove the entry deliberately.`
  )
  return Fs.readFileSync(absolute, 'utf8')
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
})
