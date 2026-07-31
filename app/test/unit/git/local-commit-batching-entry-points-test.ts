import assert from 'node:assert'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it } from 'node:test'

const appStoreSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
  'utf8'
)

function methodBody(start: string, end: string): string {
  const startIndex = appStoreSource.indexOf(start)
  const endIndex = appStoreSource.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `missing ${start}`)
  assert.notEqual(endIndex, -1, `missing boundary ${end}`)
  return appStoreSource.slice(startIndex, endIndex)
}

describe('legacy local commit batching entry points', () => {
  it('runs the legacy-history handler before a scheduled push', () => {
    const body = methodBody(
      'private async performScheduledPushWithResolvedRepository(',
      'private async performScheduledPull('
    )
    const repair = body.indexOf('handleLegacyLocalCommitPushBatching(')
    const push = body.indexOf('pushRepo(')
    const pending = body.indexOf('readPendingCommitPushBatchState(')
    assert.ok(repair >= 0)
    assert.ok(pending >= 0)
    assert.ok(push > repair)
    assert.match(body, /if \(pending === null\) \{[\s\S]*handleLegacy/)
    assert.match(
      body,
      /if \(pending === null\) \{[\s\S]*pushRepo\([\s\S]*gitStore\.tagsToPush/
    )
    assert.match(
      body,
      /pushExactPendingCommitPushBatch\([\s\S]*pending,[\s\S]*accountKey/
    )
    assert.equal(body.match(/pushRepo\(/g)?.length, 1)
  })

  it('proves an exact pending checkpoint before a normal mutable push', () => {
    const body = methodBody('private async performPush(', 'public async _pull(')
    const resolvePending = body.indexOf(
      'resolvePendingCommitPushBeforeManualPush('
    )
    const repair = body.indexOf('handleLegacyLocalCommitPushBatching(')
    const push = body.indexOf('pushRepo(')
    assert.ok(resolvePending >= 0)
    assert.ok(repair > resolvePending)
    assert.ok(push > repair)
  })

  it('recovers, proves, and clears a manual pending checkpoint in order', () => {
    const body = methodBody(
      'private async resolvePendingCommitPushBeforeManualPush(',
      "/** This shouldn't be called directly. See `Dispatcher`. */"
    )
    const readPending = body.indexOf('readPendingCommitPushBatchState(')
    const recover = body.indexOf('recoverCommitPushBatchIntent(')
    const exactPush = body.indexOf('pushExactPendingCommitPushBatch(')
    const clearPending = body.indexOf('proveAndClearPendingCommitPushBatch(')
    assert.ok(readPending >= 0)
    assert.ok(recover > readPending)
    assert.ok(exactPush > recover)
    assert.ok(clearPending > exactPush)
    assert.match(
      body,
      /operationOptions\.branch !== undefined \|\|[\s\S]*operationOptions\.forceWithLease === true/
    )
  })

  it('pushes an immutable pending SHA and proves the remote tip', () => {
    const body = methodBody(
      'private async pushExactPendingCommitPushBatch(',
      'private async resolvePendingCommitPushBeforeManualPush('
    )
    assert.match(
      body,
      /session\.operations\.push\(\{[\s\S]*headSha: pending\.commitSha/
    )
    assert.match(
      body,
      /observedAfter !== pending\.commitSha[\s\S]*not proven at the remote tip/
    )
  })

  it('never converts an explicit branch or force push into a rewrite', () => {
    const body = methodBody(
      'private async handleLegacyLocalCommitPushBatching(',
      'private async performPush('
    )
    assert.match(
      body,
      /if \(options\?\.forceWithLease \|\| options\?\.branch !== undefined\) \{\s*return/
    )
    assert.match(body, /handleLocalCommitPushBatching\(/)
    assert.match(body, /result\.mode === 'rewritten-commits'/)
  })

  it('owns the commit gate once and lets a queued restore wait behind the rewrite', () => {
    const body = methodBody(
      'private async handleLegacyLocalCommitPushBatching(',
      'private async performPush('
    )
    assert.match(
      body,
      /if \(!commitGateAlreadyHeld\) \{[\s\S]*canRunLegacyLocalCommitPushBatching\(repository\)[\s\S]*withIsCommitting\(repository,[\s\S]*handleLegacyLocalCommitPushBatching\([\s\S]*true[\s\S]*return/
    )
    assert.equal(
      body.match(/canRunLegacyLocalCommitPushBatching\(repository\)/g)?.length,
      1,
      'materialize ownership is sampled only before acquiring the gate'
    )
    assert.match(
      body,
      /Do not sample materialize ownership again after the commit gate has been[\s\S]*if \(isSubmoduleRepository\(repository\)\)/
    )
  })

  it('lets an ordinary push proceed when batching cannot apply', () => {
    const body = methodBody(
      'private async handleLegacyLocalCommitPushBatching(',
      'private async performPush('
    )
    // A refusal raised by the read-only preparation — a merge commit makes
    // the local-only range non-linear, a bound is exceeded, the remote
    // cannot be read — must not fail the push. It is absorbed and the
    // ordinary push that follows the helper runs.
    assert.match(
      body,
      /catch \(error\) \{\s*if \(error instanceof LocalCommitBatchingGitError\) \{[\s\S]*?return\s*\}\s*throw error/
    )
    // Only the preparation is guarded. Once rewriting has begun a failure
    // still propagates, so a half-rewritten history is never pushed blindly.
    const guardEnd = body.indexOf('throw error')
    const mutate = body.indexOf('handleLocalCommitPushBatching(')
    assert.ok(guardEnd >= 0)
    assert.ok(
      mutate > guardEnd,
      'the mutating batch call must sit outside the preparation guard'
    )
    assert.equal(body.match(/catch \(error\) \{/g)?.length, 1)
  })

  it('passes the exact ordinary push target when no upstream is configured', () => {
    const body = methodBody(
      'private async handleLegacyLocalCommitPushBatching(',
      'private async performPush('
    )
    assert.match(
      body,
      /const remoteBranchName =\s*tip\.branch\.upstreamWithoutRemote \?\? tip\.branch\.name/
    )
    assert.match(body, /remoteBranchRef: `refs\/heads\/\$\{remoteBranchName\}`/)
    assert.doesNotMatch(body, /upstreamRemoteName === null[\s\S]*return/)
  })

  it('disables auto-maintenance per batch and repacks once after the sequence', () => {
    const body = methodBody(
      'public async _commitIncludedChanges(',
      'private async _refreshRepositoryAfterCommit('
    )
    // The multi-batch commit opts into suppressing background maintenance.
    assert.match(body, /disableAutoMaintenance: batches\.length > 1/)
    // A single controlled repack runs after the batch sequence, gated to the
    // genuinely batched (multi-batch) path.
    const runBatches = body.indexOf('executeCommitPushBatches(')
    const repack = body.indexOf('repackAfterBatchedCommit(')
    assert.ok(runBatches >= 0)
    assert.ok(repack > runBatches)
    // The repack publishes the maintenance commit-operation phase while it
    // runs and always clears that phase again, even when the repack throws.
    assert.match(
      body,
      /batches\.length > 1\s*\)\s*\{[\s\S]*?operation: 'repacking'[\s\S]*?try \{\s*await this\.repackAfterBatchedCommit\(repository\)\s*\} finally \{[\s\S]*?commitOperationPhase: null/
    )
  })

  it('runs the post-batch repack once with auto-gc suppressed and best-effort', () => {
    const body = methodBody(
      'private async repackAfterBatchedCommit(',
      'private async withIsCommitting('
    )
    assert.match(
      body,
      /AutomaticCommitPushBatchGitMaintenanceArgs,\s*'repack',\s*'-d'/
    )
    // Best-effort: a repack failure is caught and logged, never rethrown.
    assert.match(body, /try \{[\s\S]*\} catch \(error\) \{[\s\S]*log\.warn/)
  })
})
