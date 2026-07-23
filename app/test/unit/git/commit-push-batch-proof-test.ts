import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { join } from 'path'
import { describe, it, TestContext } from 'node:test'
import { writeFile } from 'fs/promises'
import { exec } from 'dugite'

import {
  AutomaticCommitPushIntentRef,
  beginCommitPushBatchIntent,
  captureCommitPushBatchBase,
  clearCommitPushBatchIntentAfterNoCommit,
  clearPendingCommitPushBatch,
  hashCommitPushRemoteUrl,
  markPendingCommitPushBatch,
  proveCommitPushBatch,
  readCommitPushBatchIntent,
  readPendingCommitPushBatch,
  readPendingCommitPushBatchState,
  recoverCommitPushBatchIntent,
} from '../../../src/lib/git'
import {
  AutomaticCommitPushBatchMaximumPaths,
  CommitPushBatchError,
} from '../../../src/lib/commit-push-batching'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'

const target = {
  remoteName: 'origin',
  remoteUrlSha256: hashCommitPushRemoteUrl('https://example.invalid/repo.git'),
  remoteBranchRef: 'refs/heads/main',
  expectedRemoteSha: null,
} as const

async function runGit(repository: Repository, args: ReadonlyArray<string>) {
  const result = await exec([...args], repository.path)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout.trim()
}

async function setupProofRepository(t: TestContext): Promise<Repository> {
  const repository = await setupEmptyRepository(t)
  await writeFile(join(repository.path, 'base.txt'), 'base')
  await runGit(repository, ['add', '--all'])
  await runGit(repository, ['commit', '-m', 'base'])
  return repository
}

describe('Git-backed automatic commit batch proof', () => {
  it('captures an unborn HEAD and proves the exact root commit', async t => {
    const repository = await setupEmptyRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    assert.equal(base, null)

    await writeFile(join(repository.path, 'first.bin'), '1234')
    await writeFile(join(repository.path, 'second.bin'), '56789')
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'root batch'])

    const proof = await proveCommitPushBatch(
      repository,
      base,
      ['first.bin', 'second.bin'],
      9
    )

    assert.equal(proof.parentSha, null)
    assert.deepEqual(proof.paths, ['first.bin', 'second.bin'])
    assert.equal(proof.sizeInBytes, 9)
  })

  it('persists and compare-and-swap clears the pending push checkpoint', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'pending.txt'), 'pending')
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      ['pending.txt'],
      target
    )
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'pending batch'])
    const head = await captureCommitPushBatchBase(repository)
    assert.ok(head !== null && head !== base)

    assert.equal(await readPendingCommitPushBatch(repository), null)
    await markPendingCommitPushBatch(repository, head, intent)
    assert.equal(await readPendingCommitPushBatch(repository), head)
    await markPendingCommitPushBatch(repository, head, intent)
    assert.equal(
      (await readPendingCommitPushBatchState(repository))?.intent.objectId,
      intent.objectId
    )
    await clearPendingCommitPushBatch(repository, head, intent.objectId)
    assert.equal(await readPendingCommitPushBatch(repository), null)
  })

  it('retains both refs when the pending intent identity changes', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'pending.txt'), 'pending')
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      ['pending.txt'],
      target
    )
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'pending batch'])
    const head = await captureCommitPushBatchBase(repository)
    assert.ok(head !== null)
    await markPendingCommitPushBatch(repository, head, intent)

    await writeFile(join(repository.path, 'replacement-intent.txt'), 'invalid')
    const replacement = await runGit(repository, [
      'hash-object',
      '-w',
      'replacement-intent.txt',
    ])
    await runGit(repository, [
      'update-ref',
      AutomaticCommitPushIntentRef,
      replacement,
      intent.objectId,
    ])

    await assert.rejects(
      clearPendingCommitPushBatch(repository, head, intent.objectId)
    )
    assert.equal(await readPendingCommitPushBatch(repository), head)
    assert.equal(
      await runGit(repository, ['rev-parse', AutomaticCommitPushIntentRef]),
      replacement
    )
  })

  it('retains both refs when a canonical valid pending intent identity changes', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'pending.txt'), 'pending')
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      ['pending.txt'],
      target
    )
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'pending batch'])
    const head = await captureCommitPushBatchBase(repository)
    assert.ok(head !== null)
    await markPendingCommitPushBatch(repository, head, intent)

    const originalText = await runGit(repository, [
      'cat-file',
      'blob',
      intent.objectId,
    ])
    const replacementValue = JSON.parse(originalText)
    replacementValue.target.remoteName = 'replacement'
    const replacementPath = join(repository.path, 'replacement-intent.json')
    await writeFile(
      replacementPath,
      `${JSON.stringify(replacementValue)}\n`,
      'utf8'
    )
    const replacement = await runGit(repository, [
      'hash-object',
      '-w',
      replacementPath,
    ])
    await runGit(repository, [
      'update-ref',
      AutomaticCommitPushIntentRef,
      replacement,
      intent.objectId,
    ])
    assert.equal(
      (await readCommitPushBatchIntent(repository))?.objectId,
      replacement
    )

    await assert.rejects(
      clearPendingCommitPushBatch(repository, head, intent.objectId),
      error =>
        error instanceof CommitPushBatchError && error.kind === 'stale-commit'
    )
    assert.equal(await readPendingCommitPushBatch(repository), head)
    assert.equal(
      await runGit(repository, ['rev-parse', AutomaticCommitPushIntentRef]),
      replacement
    )
  })

  it('clears a pre-commit intent only while branch and HEAD remain exact', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    assert.ok(base !== null)
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      ['planned.txt'],
      target
    )

    assert.deepEqual(await readCommitPushBatchIntent(repository), intent)
    await clearCommitPushBatchIntentAfterNoCommit(repository, intent)
    assert.equal(await readCommitPushBatchIntent(repository), null)
    assert.equal(await readPendingCommitPushBatch(repository), null)
  })

  it('grants only one owner for the same durable intent', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await beginCommitPushBatchIntent(repository, base, ['planned.txt'], target)

    await assert.rejects(
      beginCommitPushBatchIntent(repository, base, ['planned.txt'], target),
      error =>
        error instanceof CommitPushBatchError && error.kind === 'stale-commit'
    )
  })

  it('retains a no-commit intent when the index changed', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      ['planned.txt'],
      target
    )
    await writeFile(join(repository.path, 'unplanned.txt'), 'unplanned')
    await runGit(repository, ['add', '--', 'unplanned.txt'])

    await assert.rejects(
      clearCommitPushBatchIntentAfterNoCommit(repository, intent),
      error =>
        error instanceof CommitPushBatchError && error.kind === 'stale-commit'
    )
    assert.deepEqual(await readCommitPushBatchIntent(repository), intent)
    assert.equal(await readPendingCommitPushBatch(repository), null)
  })

  it('recovers a crash after commit by proving before marking pending', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'planned.txt'), 'planned')
    await runGit(repository, ['add', '--all'])
    await beginCommitPushBatchIntent(repository, base, ['planned.txt'], target)
    await runGit(repository, ['commit', '-m', 'crash-window batch'])
    const head = await captureCommitPushBatchBase(repository)
    assert.ok(head !== null)

    const recovery = await recoverCommitPushBatchIntent(repository)

    assert.equal(recovery.kind, 'recovered-commit')
    assert.equal(
      recovery.kind === 'recovered-commit' ? recovery.proof.headSha : null,
      head
    )
    assert.notEqual(await readCommitPushBatchIntent(repository), null)
    assert.equal(await readPendingCommitPushBatch(repository), head)
  })

  it('retains the intent and never marks pending when recovery proof fails', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'planned.txt'), 'planned')
    await writeFile(join(repository.path, 'unplanned.txt'), 'unplanned')
    await runGit(repository, ['add', '--all'])
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      ['planned.txt'],
      target
    )
    await runGit(repository, ['commit', '-m', 'invalid crash-window batch'])

    await assert.rejects(
      recoverCommitPushBatchIntent(repository),
      error =>
        error instanceof CommitPushBatchError &&
        error.kind === 'unexpected-commit-path'
    )
    assert.deepEqual(await readCommitPushBatchIntent(repository), intent)
    assert.equal(await readPendingCommitPushBatch(repository), null)
  })

  it('never marks a hook-mutated required pointer pending after a crash', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    const relativePath = 'private.ptr'
    const reviewedText = 'key-a\n'
    const mutatedText = 'key-b\n'
    assert.equal(
      Buffer.byteLength(reviewedText),
      Buffer.byteLength(mutatedText)
    )
    await writeFile(join(repository.path, relativePath), reviewedText)
    await runGit(repository, ['add', '--', relativePath])
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      [relativePath],
      target,
      [
        {
          relativePath,
          contentSha256: createHash('sha256')
            .update(reviewedText, 'utf8')
            .digest('hex'),
        },
      ]
    )

    // Model a pre-commit hook changing and restaging the reviewed pointer,
    // followed by a process crash before createCommit's live proof can run.
    await writeFile(join(repository.path, relativePath), mutatedText)
    await runGit(repository, ['add', '--', relativePath])
    await runGit(repository, ['commit', '-m', 'hook-mutated pointer'])

    await assert.rejects(
      recoverCommitPushBatchIntent(repository),
      error =>
        error instanceof CommitPushBatchError &&
        error.kind === 'invalid-commit-proof' &&
        error.path === relativePath
    )
    assert.deepEqual(await readCommitPushBatchIntent(repository), intent)
    assert.equal(await readPendingCommitPushBatch(repository), null)
  })

  it('recovers an unborn root transition from its durable intent', async t => {
    const repository = await setupEmptyRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    assert.equal(base, null)
    await writeFile(join(repository.path, 'root.txt'), 'root')
    await runGit(repository, ['add', '--all'])
    await beginCommitPushBatchIntent(repository, base, ['root.txt'], target)
    await runGit(repository, ['commit', '-m', 'root crash-window batch'])
    const head = await captureCommitPushBatchBase(repository)

    const recovery = await recoverCommitPushBatchIntent(repository)

    assert.equal(recovery.kind, 'recovered-commit')
    assert.notEqual(await readCommitPushBatchIntent(repository), null)
    assert.equal(await readPendingCommitPushBatch(repository), head)
  })

  it('blocks a stale multi-commit transition and preserves its intent', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'planned.txt'), 'planned')
    await runGit(repository, ['add', '--all'])
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      ['planned.txt'],
      target
    )
    await runGit(repository, ['commit', '-m', 'planned batch'])
    await writeFile(join(repository.path, 'later.txt'), 'later')
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'unrelated later commit'])

    await assert.rejects(
      recoverCommitPushBatchIntent(repository),
      error =>
        error instanceof CommitPushBatchError && error.kind === 'stale-commit'
    )
    assert.deepEqual(await readCommitPushBatchIntent(repository), intent)
    assert.equal(await readPendingCommitPushBatch(repository), null)
  })

  it('blocks the same HEAD on a different branch identity', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    const intent = await beginCommitPushBatchIntent(
      repository,
      base,
      ['planned.txt'],
      target
    )
    await runGit(repository, ['switch', '-c', 'different-branch'])

    await assert.rejects(
      recoverCommitPushBatchIntent(repository),
      error =>
        error instanceof CommitPushBatchError && error.kind === 'stale-commit'
    )
    assert.deepEqual(await readCommitPushBatchIntent(repository), intent)
    assert.equal(await readPendingCommitPushBatch(repository), null)
  })

  it('rejects a direct proof request above the planner path bound', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    const paths = Array.from(
      { length: AutomaticCommitPushBatchMaximumPaths + 1 },
      (_, index) => `tiny-${index}.txt`
    )

    await assert.rejects(
      proveCommitPushBatch(repository, base, paths),
      error =>
        error instanceof CommitPushBatchError &&
        error.kind === 'proof-over-limit'
    )
  })

  it('proves the exact committed paths and conservative object bytes', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'first.bin'), '1234')
    await writeFile(join(repository.path, 'second.bin'), '56789')
    await runGit(repository, ['add', '--all'])
    const head = await runGit(repository, ['commit', '-m', 'planned batch'])
    assert.notEqual(head, '')

    const proof = await proveCommitPushBatch(
      repository,
      base,
      ['first.bin', 'second.bin'],
      9
    )

    assert.equal(proof.parentSha, base)
    assert.deepEqual(proof.paths, ['first.bin', 'second.bin'])
    assert.equal(proof.sizeInBytes, 9)
  })

  it('proves both sides of a rename without counting the deletion bytes', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await runGit(repository, ['mv', 'base.txt', 'renamed.txt'])
    await runGit(repository, ['commit', '-m', 'rename batch'])

    const proof = await proveCommitPushBatch(
      repository,
      base,
      ['renamed.txt', 'base.txt'],
      4
    )

    assert.deepEqual([...proof.paths].sort(), ['base.txt', 'renamed.txt'])
    assert.equal(proof.sizeInBytes, 4)
  })

  it('rejects a hook-added or otherwise unplanned committed path', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'planned.txt'), 'planned')
    await writeFile(join(repository.path, 'hook-added.txt'), 'hook')
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'contains an extra path'])

    await assert.rejects(
      proveCommitPushBatch(repository, base, ['planned.txt'], 1_000),
      error =>
        error instanceof CommitPushBatchError &&
        error.kind === 'unexpected-commit-path' &&
        error.path === 'hook-added.txt'
    )
  })

  it('rejects an actual committed payload above the reviewed limit', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'grown.bin'), '123456')
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'grew after planning'])

    await assert.rejects(
      proveCommitPushBatch(repository, base, ['grown.bin'], 5),
      error =>
        error instanceof CommitPushBatchError &&
        error.kind === 'commit-over-limit'
    )
  })

  it('rejects omitted paths and a commit based on a different parent', async t => {
    const repository = await setupProofRepository(t)
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'only.txt'), 'only')
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'only one path'])

    await assert.rejects(
      proveCommitPushBatch(
        repository,
        base,
        ['only.txt', 'missing.txt'],
        1_000
      ),
      error =>
        error instanceof CommitPushBatchError &&
        error.kind === 'missing-commit-path'
    )

    const staleBase = base
    const current = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'next.txt'), 'next')
    await runGit(repository, ['add', '--all'])
    await runGit(repository, ['commit', '-m', 'next parent'])
    assert.notEqual(current, staleBase)
    await assert.rejects(
      proveCommitPushBatch(repository, staleBase, ['next.txt'], 1_000),
      error =>
        error instanceof CommitPushBatchError && error.kind === 'stale-commit'
    )
  })
})
