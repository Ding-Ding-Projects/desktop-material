import assert from 'node:assert'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { exec } from 'dugite'

import {
  beginCommitPushBatchIntent,
  captureCommitPushBatchBase,
  clearCommitPushBatchIntentAfterNoCommit,
  clearPendingCommitPushBatch,
  createCommit,
  hashCommitPushRemoteUrl,
  ICommitPushBatchIntent,
  readCommitPushBatchIntent,
  readPendingCommitPushBatch,
  readPendingCommitPushBatchState,
  recoverCommitPushBatchIntent,
} from '../../../src/lib/git'
import { AppStore } from '../../../src/lib/stores/app-store'
import { Branch, BranchType } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'
import { TipState } from '../../../src/models/tip'
import { setupEmptyRepository } from '../../helpers/repositories'
import { getStatusOrThrow } from '../../helpers/status'
import { createTempDirectory } from '../../helpers/temp'

async function runGit(repository: Repository, args: ReadonlyArray<string>) {
  const result = await exec([...args], repository.path)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout.trim()
}

async function createBaseRepository(repository: Repository) {
  await writeFile(join(repository.path, 'base.txt'), 'base\n')
  await runGit(repository, ['add', '--', 'base.txt'])
  await runGit(repository, ['commit', '-m', 'base'])
  return await captureCommitPushBatchBase(repository)
}

describe('pending automatic commit push safety', () => {
  it('pushes and clears only the proven pending SHA when the local branch advances', async t => {
    const repository = await setupEmptyRepository(t)
    const baseSha = await createBaseRepository(repository)
    assert.ok(baseSha !== null)

    const branchRef = await runGit(repository, ['symbolic-ref', 'HEAD'])
    const branchName = branchRef.slice('refs/heads/'.length)
    const remoteBranchRef = `refs/heads/${branchName}`
    const remotePath = await createTempDirectory(t)
    assert.equal((await exec(['init', '--bare'], remotePath)).exitCode, 0)
    await runGit(repository, ['remote', 'add', 'origin', remotePath])
    await runGit(repository, [
      'push',
      'origin',
      `${baseSha}:${remoteBranchRef}`,
    ])

    await writeFile(join(repository.path, 'pending.txt'), 'pending\n')
    await runGit(repository, ['add', '--', 'pending.txt'])
    await beginCommitPushBatchIntent(repository, baseSha, ['pending.txt'], {
      remoteName: 'origin',
      remoteUrlSha256: hashCommitPushRemoteUrl(remotePath),
      remoteBranchRef,
      expectedRemoteSha: baseSha,
    })
    await runGit(repository, ['commit', '-m', 'pending batch'])
    const pendingSha = await captureCommitPushBatchBase(repository)
    assert.ok(pendingSha !== null)
    await recoverCommitPushBatchIntent(repository)
    assert.equal(await readPendingCommitPushBatch(repository), pendingSha)

    // This is the adversarial race: the branch no longer names the checkpoint
    // by the time the scheduled push starts.
    await writeFile(join(repository.path, 'later.txt'), 'later\n')
    await runGit(repository, ['add', '--', 'later.txt'])
    await runGit(repository, ['commit', '-m', 'later local commit'])
    const laterSha = await captureCommitPushBatchBase(repository)
    assert.ok(laterSha !== null && laterSha !== pendingSha)

    const remote = { name: 'origin', url: remotePath }
    const state: any = {
      remote,
      isPushPullFetchInProgress: false,
      branchesState: {
        tip: {
          kind: TipState.Valid,
          branch: new Branch(
            branchName,
            null,
            { sha: laterSha },
            BranchType.Local,
            branchRef
          ),
        },
      },
    }
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      accounts: [],
      canContinueScheduledAutomation: () => true,
      repositoryStateCache: { get: () => state },
      gitStoreCache: {
        get: () => ({
          remotes: [remote],
          tagsToPush: [],
          clearTagsToPush: () => undefined,
        }),
      },
      withPushPullFetch: async (
        _repository: Repository,
        operation: () => Promise<void>
      ) => await operation(),
      handleLegacyLocalCommitPushBatching: async () =>
        assert.fail('a pending checkpoint must not enter legacy batching'),
      _refreshRepository: async () => undefined,
      deployDockerAfterPush: async () => undefined,
    })

    assert.equal(
      await (store as any).performScheduledPushWithResolvedRepository(
        repository,
        null
      ),
      true
    )
    const remoteTip = (
      await exec(['rev-parse', remoteBranchRef], remotePath)
    ).stdout.trim()
    assert.equal(remoteTip, pendingSha)
    assert.notEqual(remoteTip, laterSha)
    assert.equal(await readPendingCommitPushBatch(repository), pendingSha)

    assert.equal(
      await (store as any).resolvePendingCommitPushBeforeManualPush(
        repository,
        undefined,
        {}
      ),
      true
    )
    assert.equal(await readPendingCommitPushBatch(repository), null)
    assert.equal(
      (await exec(['rev-parse', remoteBranchRef], remotePath)).stdout.trim(),
      pendingSha
    )
    assert.notEqual(
      (await exec(['rev-parse', remoteBranchRef], remotePath)).stdout.trim(),
      laterSha
    )
  })

  it('clears a checkpoint the CLI already pushed inside a newer commit', async t => {
    const repository = await setupEmptyRepository(t)
    const baseSha = await createBaseRepository(repository)
    assert.ok(baseSha !== null)

    const branchRef = await runGit(repository, ['symbolic-ref', 'HEAD'])
    const branchName = branchRef.slice('refs/heads/'.length)
    const remoteBranchRef = `refs/heads/${branchName}`
    const remotePath = await createTempDirectory(t)
    assert.equal((await exec(['init', '--bare'], remotePath)).exitCode, 0)
    await runGit(repository, ['remote', 'add', 'origin', remotePath])
    await runGit(repository, [
      'push',
      'origin',
      `${baseSha}:${remoteBranchRef}`,
    ])

    await writeFile(join(repository.path, 'pending.txt'), 'pending\n')
    await runGit(repository, ['add', '--', 'pending.txt'])
    await beginCommitPushBatchIntent(repository, baseSha, ['pending.txt'], {
      remoteName: 'origin',
      remoteUrlSha256: hashCommitPushRemoteUrl(remotePath),
      remoteBranchRef,
      expectedRemoteSha: baseSha,
    })
    await runGit(repository, ['commit', '-m', 'pending batch'])
    const pendingSha = await captureCommitPushBatchBase(repository)
    assert.ok(pendingSha !== null)
    await recoverCommitPushBatchIntent(repository)
    assert.equal(await readPendingCommitPushBatch(repository), pendingSha)

    // The user keeps working in the CLI: another commit lands on top of the
    // checkpoint and a plain `git push` publishes both. The remote tip is now
    // a descendant of the checkpoint — nothing is left for the app to push.
    await writeFile(join(repository.path, 'cli.txt'), 'cli\n')
    await runGit(repository, ['add', '--', 'cli.txt'])
    await runGit(repository, ['commit', '-m', 'cli commit'])
    const cliSha = await captureCommitPushBatchBase(repository)
    assert.ok(cliSha !== null && cliSha !== pendingSha)
    await runGit(repository, ['push', 'origin', `${cliSha}:${remoteBranchRef}`])

    const remote = { name: 'origin', url: remotePath }
    const state: any = {
      remote,
      isPushPullFetchInProgress: false,
      branchesState: {
        tip: {
          kind: TipState.Valid,
          branch: new Branch(
            branchName,
            null,
            { sha: cliSha },
            BranchType.Local,
            branchRef
          ),
        },
      },
    }
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      accounts: [],
      repositoryStateCache: { get: () => state },
      gitStoreCache: {
        get: () => ({
          remotes: [remote],
          tagsToPush: [],
          clearTagsToPush: () => undefined,
        }),
      },
      _refreshRepository: async () => undefined,
    })

    assert.equal(
      await (store as any).resolvePendingCommitPushBeforeManualPush(
        repository,
        undefined,
        {}
      ),
      true
    )
    assert.equal(await readPendingCommitPushBatch(repository), null)
    // The remote tip is untouched: the CLI's newer commit stays the tip.
    assert.equal(
      (await exec(['rev-parse', remoteBranchRef], remotePath)).stdout.trim(),
      cliSha
    )

    // The resume path sees the same satisfied state as already finished.
    await (store as any).resumePendingCommitPushBatch(repository)
    assert.equal(await readPendingCommitPushBatch(repository), null)
  })

  it('pushes a waiting checkpoint after the remote advanced to a tip the checkpoint contains', async t => {
    const repository = await setupEmptyRepository(t)
    const baseSha = await createBaseRepository(repository)
    assert.ok(baseSha !== null)

    const branchRef = await runGit(repository, ['symbolic-ref', 'HEAD'])
    const branchName = branchRef.slice('refs/heads/'.length)
    const remoteBranchRef = `refs/heads/${branchName}`
    const remotePath = await createTempDirectory(t)
    assert.equal((await exec(['init', '--bare'], remotePath)).exitCode, 0)
    await runGit(repository, ['remote', 'add', 'origin', remotePath])
    await runGit(repository, [
      'push',
      'origin',
      `${baseSha}:${remoteBranchRef}`,
    ])

    // The local branch already carries one commit beyond the remote tip —
    // the state a merge leaves behind before the automatic push runs.
    await writeFile(join(repository.path, 'merged.txt'), 'merged\n')
    await runGit(repository, ['add', '--', 'merged.txt'])
    await runGit(repository, ['commit', '-m', 'merged commit'])
    const mergedSha = await captureCommitPushBatchBase(repository)
    assert.ok(mergedSha !== null)

    await writeFile(join(repository.path, 'pending.txt'), 'pending\n')
    await runGit(repository, ['add', '--', 'pending.txt'])
    await beginCommitPushBatchIntent(repository, mergedSha, ['pending.txt'], {
      remoteName: 'origin',
      remoteUrlSha256: hashCommitPushRemoteUrl(remotePath),
      remoteBranchRef,
      expectedRemoteSha: baseSha,
    })
    await runGit(repository, ['commit', '-m', 'pending batch'])
    const pendingSha = await captureCommitPushBatchBase(repository)
    assert.ok(pendingSha !== null)
    await recoverCommitPushBatchIntent(repository)
    assert.equal(await readPendingCommitPushBatch(repository), pendingSha)

    // Another client publishes the merged commit first: the remote tip now
    // differs from the recorded expectation but is an ancestor of the
    // checkpoint, so pushing it is a pure fast-forward — exactly the case
    // where a plain `git push` succeeds.
    await runGit(repository, [
      'push',
      'origin',
      `${mergedSha}:${remoteBranchRef}`,
    ])

    const remote = { name: 'origin', url: remotePath }
    const state: any = {
      remote,
      isPushPullFetchInProgress: false,
      branchesState: {
        tip: {
          kind: TipState.Valid,
          branch: new Branch(
            branchName,
            null,
            { sha: pendingSha },
            BranchType.Local,
            branchRef
          ),
        },
      },
    }
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      accounts: [],
      repositoryStateCache: { get: () => state },
      gitStoreCache: {
        get: () => ({
          remotes: [remote],
          tagsToPush: [],
          clearTagsToPush: () => undefined,
        }),
      },
      _refreshRepository: async () => undefined,
    })

    assert.equal(
      await (store as any).resolvePendingCommitPushBeforeManualPush(
        repository,
        undefined,
        {}
      ),
      true
    )
    assert.equal(await readPendingCommitPushBatch(repository), null)
    assert.equal(
      (await exec(['rev-parse', remoteBranchRef], remotePath)).stdout.trim(),
      pendingSha
    )
  })

  it('still refuses a waiting checkpoint when the remote genuinely diverged', async t => {
    const repository = await setupEmptyRepository(t)
    const baseSha = await createBaseRepository(repository)
    assert.ok(baseSha !== null)

    const branchRef = await runGit(repository, ['symbolic-ref', 'HEAD'])
    const branchName = branchRef.slice('refs/heads/'.length)
    const remoteBranchRef = `refs/heads/${branchName}`
    const remotePath = await createTempDirectory(t)
    assert.equal((await exec(['init', '--bare'], remotePath)).exitCode, 0)
    await runGit(repository, ['remote', 'add', 'origin', remotePath])
    await runGit(repository, [
      'push',
      'origin',
      `${baseSha}:${remoteBranchRef}`,
    ])

    await writeFile(join(repository.path, 'pending.txt'), 'pending\n')
    await runGit(repository, ['add', '--', 'pending.txt'])
    await beginCommitPushBatchIntent(repository, baseSha, ['pending.txt'], {
      remoteName: 'origin',
      remoteUrlSha256: hashCommitPushRemoteUrl(remotePath),
      remoteBranchRef,
      expectedRemoteSha: baseSha,
    })
    await runGit(repository, ['commit', '-m', 'pending batch'])
    const pendingSha = await captureCommitPushBatchBase(repository)
    assert.ok(pendingSha !== null)
    await recoverCommitPushBatchIntent(repository)
    assert.equal(await readPendingCommitPushBatch(repository), pendingSha)

    // The remote gains a commit the checkpoint does not contain, so a push
    // would discard someone else's work and must stay refused.
    await runGit(repository, ['checkout', '--detach', baseSha])
    await writeFile(join(repository.path, 'divergent.txt'), 'divergent\n')
    await runGit(repository, ['add', '--', 'divergent.txt'])
    await runGit(repository, ['commit', '-m', 'divergent commit'])
    const divergentSha = await runGit(repository, ['rev-parse', 'HEAD'])
    await runGit(repository, [
      'push',
      'origin',
      `+${divergentSha}:${remoteBranchRef}`,
    ])
    await runGit(repository, ['checkout', branchName])

    const remote = { name: 'origin', url: remotePath }
    const state: any = {
      remote,
      isPushPullFetchInProgress: false,
      branchesState: {
        tip: {
          kind: TipState.Valid,
          branch: new Branch(
            branchName,
            null,
            { sha: pendingSha },
            BranchType.Local,
            branchRef
          ),
        },
      },
    }
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      accounts: [],
      repositoryStateCache: { get: () => state },
      gitStoreCache: {
        get: () => ({
          remotes: [remote],
          tagsToPush: [],
          clearTagsToPush: () => undefined,
        }),
      },
      _refreshRepository: async () => undefined,
    })

    await assert.rejects(
      (store as any).resolvePendingCommitPushBeforeManualPush(
        repository,
        undefined,
        {}
      ),
      /exact remote branch changed/
    )
    assert.equal(await readPendingCommitPushBatch(repository), pendingSha)
    assert.equal(
      (await exec(['rev-parse', remoteBranchRef], remotePath)).stdout.trim(),
      divergentSha
    )
  })

  it('clears an intent captured from Desktop-owned staging after a no-commit rejection and permits retry', async t => {
    const repository = await setupEmptyRepository(t)
    const baseSha = await createBaseRepository(repository)
    assert.ok(baseSha !== null)
    await writeFile(join(repository.path, 'planned.txt'), 'planned\n')
    const planned = (await getStatusOrThrow(repository)).workingDirectory.files
    const target = {
      remoteName: 'origin',
      remoteUrlSha256: hashCommitPushRemoteUrl(
        'https://example.invalid/repository.git'
      ),
      remoteBranchRef: 'refs/heads/main',
      expectedRemoteSha: baseSha,
    } as const
    const rejected = new Error('synthetic pre-commit rejection')
    let rejectedIntent: ICommitPushBatchIntent | null = null

    await assert.rejects(
      createCommit(
        repository,
        'rejected batch',
        planned,
        {
          onCommitIndexPrepared: async () => {
            rejectedIntent = await beginCommitPushBatchIntent(
              repository,
              baseSha,
              ['planned.txt'],
              target
            )
          },
        },
        { runCommit: async () => Promise.reject(rejected) }
      ),
      error => error === rejected
    )
    const rejectedProof = rejectedIntent
    assert.ok(rejectedProof !== null)
    await clearCommitPushBatchIntentAfterNoCommit(repository, rejectedProof)
    assert.equal(await readCommitPushBatchIntent(repository), null)

    let retryIntent: ICommitPushBatchIntent | null = null
    await createCommit(repository, 'retry batch', planned, {
      onCommitIndexPrepared: async () => {
        retryIntent = await beginCommitPushBatchIntent(
          repository,
          baseSha,
          ['planned.txt'],
          target
        )
      },
    })
    assert.ok(retryIntent !== null)
    const recovery = await recoverCommitPushBatchIntent(repository)
    assert.equal(recovery.kind, 'recovered-commit')
    if (recovery.kind === 'recovered-commit') {
      const pending = await readPendingCommitPushBatchState(repository)
      assert.ok(pending !== null)
      assert.equal(pending.commitSha, recovery.proof.headSha)
      await clearPendingCommitPushBatch(
        repository,
        pending.commitSha,
        pending.intent.objectId
      )
    }
  })

  it('retains a prepared intent when an unrelated index mutation races a rejected commit', async t => {
    const repository = await setupEmptyRepository(t)
    const baseSha = await createBaseRepository(repository)
    assert.ok(baseSha !== null)
    await Promise.all([
      writeFile(join(repository.path, 'planned.txt'), 'planned\n'),
      writeFile(join(repository.path, 'unrelated.txt'), 'unrelated\n'),
    ])
    const planned = (
      await getStatusOrThrow(repository)
    ).workingDirectory.files.filter(file => file.path === 'planned.txt')
    let intent: ICommitPushBatchIntent | null = null
    const rejected = new Error('synthetic rejection after external staging')

    await assert.rejects(
      createCommit(
        repository,
        'raced batch',
        planned,
        {
          onCommitIndexPrepared: async () => {
            intent = await beginCommitPushBatchIntent(
              repository,
              baseSha,
              ['planned.txt'],
              {
                remoteName: 'origin',
                remoteUrlSha256: hashCommitPushRemoteUrl(
                  'https://example.invalid/repository.git'
                ),
                remoteBranchRef: 'refs/heads/main',
                expectedRemoteSha: baseSha,
              }
            )
          },
        },
        {
          runCommit: async () => {
            await runGit(repository, ['add', '--', 'unrelated.txt'])
            throw rejected
          },
        }
      ),
      error => error === rejected
    )
    const preparedIntent = intent
    assert.ok(preparedIntent !== null)
    await assert.rejects(
      clearCommitPushBatchIntentAfterNoCommit(repository, preparedIntent),
      /index or working tree/
    )
    assert.notEqual(await readCommitPushBatchIntent(repository), null)

    // Restore the exact owned staged index so the test repository can release
    // its retained intent without weakening the production proof.
    await runGit(repository, ['reset', '--mixed', 'HEAD'])
    await runGit(repository, ['add', '--', 'planned.txt'])
    await clearCommitPushBatchIntentAfterNoCommit(repository, preparedIntent)
    assert.equal(await readCommitPushBatchIntent(repository), null)
  })
})
