import assert from 'node:assert'
import { describe, it } from 'node:test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exec } from 'dugite'
import {
  AppStore,
  selectCheapLfsCommitFilesAfterPin,
} from '../../../src/lib/stores/app-store'
import { Repository } from '../../../src/models/repository'
import { Branch, BranchType } from '../../../src/models/branch'
import { TipState } from '../../../src/models/tip'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { createTempDirectory } from '../../helpers/temp'
import { setupEmptyRepository } from '../../helpers/repositories'
import {
  beginCommitPushBatchIntent,
  captureCommitPushBatchBase,
  clearPendingCommitPushBatch,
  hashCommitPushRemoteUrl,
  readPendingCommitPushBatch,
  recoverCommitPushBatchIntent,
} from '../../../src/lib/git'

describe('cheap LFS commit status diff refresh', () => {
  it('keeps a failed push checkpoint and clears it before retrying commit work', async t => {
    const repository = await setupEmptyRepository(t)
    await writeFile(join(repository.path, 'base.txt'), 'base')
    for (const args of [
      ['add', '--all'],
      ['commit', '-m', 'base'],
    ]) {
      const result = await exec(args, repository.path)
      assert.equal(result.exitCode, 0, result.stderr)
    }
    const remotePath = await createTempDirectory(t)
    assert.equal((await exec(['init', '--bare'], remotePath)).exitCode, 0)
    assert.equal(
      (await exec(['remote', 'add', 'origin', remotePath], repository.path))
        .exitCode,
      0
    )
    assert.equal(
      (await exec(['push', 'origin', 'HEAD:refs/heads/main'], repository.path))
        .exitCode,
      0
    )
    const base = await captureCommitPushBatchBase(repository)
    await writeFile(join(repository.path, 'pending.txt'), 'pending')
    await beginCommitPushBatchIntent(repository, base, ['pending.txt'], {
      remoteName: 'origin',
      remoteUrlSha256: hashCommitPushRemoteUrl(remotePath),
      remoteBranchRef: 'refs/heads/main',
      expectedRemoteSha: base,
    })
    assert.equal((await exec(['add', '--all'], repository.path)).exitCode, 0)
    assert.equal(
      (await exec(['commit', '-m', 'pending batch'], repository.path)).exitCode,
      0
    )
    const head = (
      await exec(['rev-parse', 'HEAD'], repository.path)
    ).stdout.trim()
    await recoverCommitPushBatchIntent(repository)

    const events = new Array<string>()
    const pushResults = [false, true]
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      _refreshRepository: async () => events.push('refresh'),
      requireCommitPushBatchDestination: () => ({
        remote: { name: 'origin', url: remotePath },
        remoteBranchRef: 'refs/heads/main',
      }),
      performScheduledPush: async () => {
        events.push('push')
        return pushResults.shift() ?? false
      },
      proveAndClearPendingCommitPushBatch: async (
        target: Repository,
        pending: {
          readonly commitSha: string
          readonly intent: { readonly objectId: string }
        }
      ) => {
        events.push('prove-and-clear')
        await clearPendingCommitPushBatch(
          target,
          pending.commitSha,
          pending.intent.objectId
        )
      },
    })

    await assert.rejects(
      (store as any).resumePendingCommitPushBatch(repository),
      /could not be pushed/
    )
    assert.equal(await readPendingCommitPushBatch(repository), head)
    await (store as any).resumePendingCommitPushBatch(repository)
    assert.equal(await readPendingCommitPushBatch(repository), null)
    assert.deepEqual(events, [
      'refresh',
      'push',
      'refresh',
      'push',
      'prove-and-clear',
      'refresh',
    ])
  })

  it('pushes and clears an unborn root checkpoint before the next commit', async t => {
    const repository = await setupEmptyRepository(t)
    const remotePath = await createTempDirectory(t)
    for (const [cwd, args] of [
      [remotePath, ['init', '--bare']],
      [repository.path, ['config', 'user.name', 'Desktop Material Tests']],
      [repository.path, ['config', 'user.email', 'tests@example.invalid']],
      [repository.path, ['remote', 'add', 'origin', remotePath]],
    ] as const) {
      const result = await exec([...args], cwd)
      assert.equal(result.exitCode, 0, result.stderr)
    }
    assert.equal(await captureCommitPushBatchBase(repository), null)

    const selectedFile = (path: string) =>
      new WorkingDirectoryFileChange(
        path,
        { kind: AppFileStatusKind.Untracked },
        DiffSelection.fromInitialSelection(DiffSelectionType.All)
      )
    await writeFile(join(repository.path, 'first.txt'), 'first')

    const state: any = {
      changesState: {
        conflictState: null,
        workingDirectory: WorkingDirectoryStatus.fromFiles([
          selectedFile('first.txt'),
        ]),
      },
      branchesState: {
        tip: { kind: TipState.Unborn, ref: 'refs/heads/master' },
      },
      multiCommitOperationState: null,
      remote: { name: 'origin', url: remotePath },
      allowEmptyCommit: false,
      skipCommitHooks: false,
      signOffCommits: false,
      commitToAmend: null,
    }
    const events = new Array<string>()
    let pinPreflightCount = 0
    let firstHead: string | null = null
    const resolveHead = async () => {
      const result = await exec(['rev-parse', 'HEAD'], repository.path)
      assert.equal(result.exitCode, 0, result.stderr)
      const head = result.stdout.trim()
      assert.match(head, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
      return head
    }
    const readRemoteTip = async () => {
      const result = await exec(['rev-parse', 'refs/heads/master'], remotePath)
      assert.equal(result.exitCode, 0, result.stderr)
      return result.stdout.trim()
    }

    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      accounts: [],
      assertTemporaryRepositoryIsSafe: async () => undefined,
      isTemporaryRepositoryActive: () => true,
      repositoryStateCache: {
        get: () => state,
        update: (_repository: Repository, update: (value: any) => any) =>
          Object.assign(state, update(state)),
      },
      gitStoreCache: {
        get: () => ({
          remotes: [{ name: 'origin', url: remotePath }],
          performFailableOperation: async (operation: () => Promise<unknown>) =>
            await operation(),
          setCommitMessage: async () => undefined,
        }),
      },
      withIsCommitting: async (
        _repository: Repository,
        operation: () => Promise<boolean>
      ) => await operation(),
      withTemporaryRepositoryMutationGuard: async (
        _repository: Repository,
        operation: () => Promise<unknown>
      ) => await operation(),
      autoPinLargeFilesBeforeCommit: async () => {
        pinPreflightCount++
        if (pinPreflightCount === 2) {
          assert.equal(await readPendingCommitPushBatch(repository), null)
          assert.ok(firstHead !== null)
          assert.equal(await readRemoteTip(), firstHead)
          events.push('next-batch-after-clear')
        }
        return { pinned: [], commitPaths: [], failures: [] }
      },
      onHookProgress: () => undefined,
      onHookFailure: () => undefined,
      emitUpdate: () => undefined,
      _recordCommitStats: async () => undefined,
      _refreshRepository: async () => {
        const head = await resolveHead()
        state.branchesState.tip = {
          kind: TipState.Valid,
          branch: new Branch(
            'master',
            null,
            { sha: head },
            BranchType.Local,
            'refs/heads/master'
          ),
        }
      },
      performScheduledPush: async () => {
        const head = await resolveHead()
        assert.equal(await readPendingCommitPushBatch(repository), head)
        events.push(`push:${head}`)
        const result = await exec(
          ['push', 'origin', 'HEAD:refs/heads/master'],
          repository.path
        )
        assert.equal(result.exitCode, 0, result.stderr)
        return true
      },
      refreshChangesSection: async () => {
        state.changesState.workingDirectory = WorkingDirectoryStatus.fromFiles(
          []
        )
      },
      _refreshRepositoryAfterCommit: () => undefined,
    })

    assert.equal(
      await store._commitIncludedChanges(
        repository,
        { summary: 'root batch', description: null },
        false,
        true
      ),
      true
    )
    firstHead = await resolveHead()
    assert.equal(await readPendingCommitPushBatch(repository), null)
    assert.equal(await readRemoteTip(), firstHead)

    await writeFile(join(repository.path, 'second.txt'), 'second')
    state.changesState.workingDirectory = WorkingDirectoryStatus.fromFiles([
      selectedFile('second.txt'),
    ])
    assert.equal(
      await store._commitIncludedChanges(
        repository,
        { summary: 'second batch', description: null },
        false,
        true
      ),
      true
    )

    const secondHead = await resolveHead()
    assert.notEqual(secondHead, firstHead)
    assert.equal(await readRemoteTip(), secondHead)
    assert.equal(await readPendingCommitPushBatch(repository), null)
    assert.deepEqual(events, [
      `push:${firstHead}`,
      'next-batch-after-clear',
      `push:${secondHead}`,
    ])
  })

  it('selects every OCI rewrite and private key while excluding failed raw files', () => {
    const all = DiffSelection.fromInitialSelection(DiffSelectionType.All)
    const none = DiffSelection.fromInitialSelection(DiffSelectionType.None)
    const file = (path: string, selection: DiffSelection) =>
      new WorkingDirectoryFileChange(
        path,
        { kind: AppFileStatusKind.Modified },
        selection
      )
    const selected = selectCheapLfsCommitFilesAfterPin(
      [
        file('new.bin', none),
        file('failed.bin', all),
        file('existing.pointer', none),
        file('.desktop-material/cheap-lfs-registry-key-v1', none),
        file('safe.txt', all),
      ],
      new Set(['new.bin', 'failed.bin', 'safe.txt']),
      new Set([
        'new.bin',
        'existing.pointer',
        '.desktop-material/cheap-lfs-registry-key-v1',
      ]),
      new Set(['failed.bin'])
    )

    assert.deepEqual(
      selected.map(candidate => candidate.path),
      [
        'new.bin',
        'existing.pointer',
        '.desktop-material/cheap-lfs-registry-key-v1',
        'safe.txt',
      ]
    )
    assert.equal(
      selected
        .find(candidate => candidate.path === 'existing.pointer')
        ?.selection.getSelectionType(),
      DiffSelectionType.All
    )
    assert.equal(
      selected
        .find(
          candidate =>
            candidate.path === '.desktop-material/cheap-lfs-registry-key-v1'
        )
        ?.selection.getSelectionType(),
      DiffSelectionType.All
    )
  })

  it('suppresses pre-Git diffs but refreshes the final post-commit diff', async () => {
    const repository = new Repository('C:/repo', 1, null, false)
    const store = Object.create(AppStore.prototype) as AppStore
    let phase: unknown = { kind: 'preparing' }
    let isCommitting = true
    let diffRefreshes = 0

    Object.assign(store, {
      selectedRepository: null,
      gitStoreCache: {
        get: () => ({ loadStatus: async () => ({}) }),
      },
      repositoryStateCache: {
        updateChangesState: () => undefined,
        get: () => ({ isCommitting, commitOperationPhase: phase }),
      },
      isTemporaryRepositoryActive: () => true,
      updateMultiCommitOperationConflictsIfFound: () => undefined,
      initializeMultiCommitOperationIfConflictsFound: async () => undefined,
      emitUpdate: () => undefined,
      updateChangesWorkingDirectoryDiff: () => {
        diffRefreshes++
      },
    })

    await store._loadStatus(repository)
    assert.equal(diffRefreshes, 0)

    phase = {
      kind: 'cheap-lfs',
      progress: {
        phase: 'uploading',
        completedFiles: 0,
        totalFiles: 1,
        currentPath: 'windows.iso',
        transferredBytes: 1,
        totalBytes: 2,
      },
    }
    await store._loadStatus(repository)
    assert.equal(diffRefreshes, 0)

    phase = { kind: 'git-commit', cheapLfsPointerCount: 1 }
    await store._loadStatus(repository)
    assert.equal(diffRefreshes, 1)

    isCommitting = false
    phase = null
    await store._loadStatus(repository)
    assert.equal(diffRefreshes, 2)
  })

  it('refreshes a partially pinned tree only after the commit phase clears', async () => {
    const repository = new Repository('C:/repo', 1, null, false)
    const store = Object.create(AppStore.prototype) as AppStore
    const events = new Array<string>()
    let commitPhaseActive = false

    Object.assign(store, {
      assertTemporaryRepositoryIsSafe: async () => undefined,
      resumePendingCommitPushBatch: async () =>
        events.push('pending-push-checked'),
      isTemporaryRepositoryActive: () => true,
      repositoryStateCache: {
        get: () => ({
          changesState: { workingDirectory: { files: [] } },
        }),
      },
      gitStoreCache: { get: () => ({}) },
      withIsCommitting: async (
        _repository: Repository,
        operation: () => Promise<boolean>
      ) => {
        commitPhaseActive = true
        try {
          return await operation()
        } finally {
          commitPhaseActive = false
          events.push('phase-cleared')
        }
      },
      autoPinLargeFilesBeforeCommit: async () => {
        events.push('pin-failed')
        throw new Error('synthetic second-file upload failure')
      },
      emitError: () => events.push('error-reported'),
      _refreshRepository: async () => {
        events.push(`refreshed-with-phase-${commitPhaseActive}`)
      },
    })

    const committed = await store._commitIncludedChanges(
      repository,
      {} as Parameters<AppStore['_commitIncludedChanges']>[1]
    )

    assert.equal(committed, false)
    assert.deepEqual(events, [
      'pending-push-checked',
      'pin-failed',
      'error-reported',
      'phase-cleared',
      'refreshed-with-phase-false',
    ])
  })

  it('offers manual fallback only during upload and records explicit cancel separately', () => {
    const repository = new Repository('C:/repo', 1, null, false)
    const store = Object.create(AppStore.prototype) as AppStore
    const controllers = new Map<number, AbortController>()
    const manualRequests = new Set<number>()
    const cancelRequests = new Set<number>()
    let phase = 'hashing'
    let activeFiles: ReadonlyArray<{ readonly phase: string }> = []
    let selectedStorageProvider: 'release' | 'ghcr' | undefined
    Object.assign(store, {
      cheapLfsCommitControllers: controllers,
      cheapLfsManualUploadRequests: manualRequests,
      cheapLfsCommitCancelRequests: cancelRequests,
      isTemporaryRepositoryActive: () => true,
      repositoryStateCache: {
        get: () => ({
          isCommitting: true,
          commitOperationPhase: {
            kind: 'cheap-lfs',
            progress: { phase, activeFiles, selectedStorageProvider },
          },
        }),
      },
    })

    const hashing = new AbortController()
    controllers.set(repository.id, hashing)
    store._requestManualCheapLfsUpload(repository)
    assert.equal(hashing.signal.aborted, false)

    phase = 'uploading'
    store._requestManualCheapLfsUpload(repository)
    assert.equal(hashing.signal.aborted, true)
    assert.equal(manualRequests.has(repository.id), true)
    assert.equal(cancelRequests.has(repository.id), false)

    const mixed = new AbortController()
    controllers.set(repository.id, mixed)
    manualRequests.clear()
    phase = 'hashing'
    activeFiles = [{ phase: 'uploading' }]
    store._requestManualCheapLfsUpload(repository)
    assert.equal(mixed.signal.aborted, true)
    assert.equal(manualRequests.has(repository.id), true)

    const registry = new AbortController()
    controllers.set(repository.id, registry)
    manualRequests.clear()
    phase = 'uploading'
    activeFiles = []
    selectedStorageProvider = 'ghcr'
    store._requestManualCheapLfsUpload(repository)
    assert.equal(registry.signal.aborted, false)
    assert.equal(manualRequests.has(repository.id), false)

    const waiting = new AbortController()
    controllers.set(repository.id, waiting)
    manualRequests.clear()
    phase = 'manual-waiting'
    activeFiles = []
    selectedStorageProvider = 'release'
    store._requestManualCheapLfsUpload(repository)
    assert.equal(waiting.signal.aborted, false)
    store._cancelCheapLfsCommit(repository)
    assert.equal(waiting.signal.aborted, true)
    assert.equal(cancelRequests.has(repository.id), true)
  })

  it('reports unrelated aborts but suppresses an explicit cheap-LFS cancel', async () => {
    for (const explicitlyCanceled of [false, true]) {
      const repository = new Repository('C:/repo', 1, null, false)
      const store = Object.create(AppStore.prototype) as AppStore
      const errors = new Array<Error>()
      const cancelRequests = new Set<number>()
      if (explicitlyCanceled) {
        cancelRequests.add(repository.id)
      }
      Object.assign(store, {
        cheapLfsCommitCancelRequests: cancelRequests,
        assertTemporaryRepositoryIsSafe: async () => undefined,
        resumePendingCommitPushBatch: async () => undefined,
        isTemporaryRepositoryActive: () => true,
        repositoryStateCache: {
          get: () => ({
            changesState: { workingDirectory: { files: [] } },
          }),
        },
        gitStoreCache: { get: () => ({}) },
        withIsCommitting: async (
          _repository: Repository,
          operation: () => Promise<boolean>
        ) => await operation(),
        autoPinLargeFilesBeforeCommit: async () => {
          const error = new Error('account drift aborted the request')
          error.name = 'AbortError'
          throw error
        },
        emitError: (error: Error) => errors.push(error),
        _refreshRepository: async () => undefined,
      })

      assert.equal(
        await store._commitIncludedChanges(
          repository,
          {} as Parameters<AppStore['_commitIncludedChanges']>[1]
        ),
        false
      )
      assert.equal(errors.length, explicitlyCanceled ? 0 : 1)
    }
  })

  it('does not create an allow-empty commit when every selected large file failed', async () => {
    const repository = new Repository('C:/repo', 1, null, false)
    const partial = DiffSelection.fromInitialSelection(
      DiffSelectionType.All
    ).withLineSelection(0, false)
    const failedFile = new WorkingDirectoryFileChange(
      'partial.bin',
      { kind: AppFileStatusKind.Modified },
      partial
    )
    const state = {
      changesState: {
        workingDirectory: WorkingDirectoryStatus.fromFiles([failedFile]),
      },
      allowEmptyCommit: true,
    }
    const store = Object.create(AppStore.prototype) as AppStore
    let gitOperationRequested = false
    Object.assign(store, {
      assertTemporaryRepositoryIsSafe: async () => undefined,
      resumePendingCommitPushBatch: async () => undefined,
      isTemporaryRepositoryActive: () => true,
      repositoryStateCache: {
        get: () => state,
        update: () => undefined,
      },
      gitStoreCache: {
        get: () => ({
          performFailableOperation: async () => {
            gitOperationRequested = true
          },
        }),
      },
      withIsCommitting: async (
        _repository: Repository,
        operation: () => Promise<boolean>
      ) => await operation(),
      autoPinLargeFilesBeforeCommit: async () => ({
        pinned: [],
        commitPaths: [],
        failures: [
          {
            relativePath: failedFile.path,
            sizeInBytes: 200,
            message: 'partial selection',
          },
        ],
      }),
      _loadStatus: async () => undefined,
      postCheapLfsPinNotification: () => undefined,
      postCheapLfsPinFailureNotification: () => undefined,
    })

    const committed = await store._commitIncludedChanges(
      repository,
      {} as Parameters<AppStore['_commitIncludedChanges']>[1]
    )
    assert.equal(committed, false)
    assert.equal(gitOperationRequested, false)
    assert.equal(
      state.changesState.workingDirectory.files[0].selection.getSelectionType(),
      DiffSelectionType.Partial
    )
  })

  it('refreshes status after a genuine Git commit failure', async t => {
    const root = await createTempDirectory(t)
    await writeFile(join(root, 'safe.txt'), 'safe')
    const repository = new Repository(root, 1, null, false)
    const safeFile = new WorkingDirectoryFileChange(
      'safe.txt',
      { kind: AppFileStatusKind.Modified },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    const state: any = {
      changesState: {
        conflictState: null,
        workingDirectory: WorkingDirectoryStatus.fromFiles([safeFile]),
      },
      multiCommitOperationState: null,
      remote: null,
      allowEmptyCommit: false,
      skipCommitHooks: false,
      signOffCommits: false,
      commitToAmend: null,
    }
    let refreshes = 0
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      assertTemporaryRepositoryIsSafe: async () => undefined,
      resumePendingCommitPushBatch: async () => undefined,
      isTemporaryRepositoryActive: () => true,
      repositoryStateCache: {
        get: () => state,
        update: () => undefined,
      },
      gitStoreCache: {
        get: () => ({ performFailableOperation: async () => undefined }),
      },
      withIsCommitting: async (
        _repository: Repository,
        operation: () => Promise<boolean>
      ) => await operation(),
      autoPinLargeFilesBeforeCommit: async () => ({
        pinned: [],
        commitPaths: [],
        failures: [],
      }),
      emitUpdate: () => undefined,
      _refreshRepository: async () => {
        refreshes++
      },
    })

    const committed = await store._commitIncludedChanges(repository, {
      summary: 'genuine failure',
      description: null,
    })

    assert.equal(committed, false)
    assert.equal(refreshes, 1)
  })

  it('restores a failed partial selection after committing another safe file', async t => {
    const root = await createTempDirectory(t)
    await writeFile(join(root, 'safe.txt'), 'safe')
    const repository = new Repository(root, 1, null, false)
    const partial = DiffSelection.fromInitialSelection(
      DiffSelectionType.All
    ).withLineSelection(0, false)
    const failedFile = new WorkingDirectoryFileChange(
      'partial.bin',
      { kind: AppFileStatusKind.Modified },
      partial
    )
    const safeFile = new WorkingDirectoryFileChange(
      'safe.txt',
      { kind: AppFileStatusKind.Modified },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    const state: any = {
      changesState: {
        conflictState: null,
        workingDirectory: WorkingDirectoryStatus.fromFiles([
          failedFile,
          safeFile,
        ]),
      },
      multiCommitOperationState: null,
      remote: null,
      allowEmptyCommit: false,
      skipCommitHooks: false,
      signOffCommits: false,
      commitToAmend: null,
    }
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      assertTemporaryRepositoryIsSafe: async () => undefined,
      resumePendingCommitPushBatch: async () => undefined,
      isTemporaryRepositoryActive: () => true,
      repositoryStateCache: {
        get: () => state,
        update: (_repository: Repository, update: (value: any) => any) =>
          Object.assign(state, update(state)),
        updateChangesState: (
          _repository: Repository,
          update: (value: any) => any
        ) => Object.assign(state.changesState, update(state.changesState)),
      },
      gitStoreCache: {
        get: () => ({
          performFailableOperation: async () => 'commit-sha',
          setCommitMessage: async () => undefined,
        }),
      },
      withIsCommitting: async (
        _repository: Repository,
        operation: () => Promise<boolean>
      ) => await operation(),
      autoPinLargeFilesBeforeCommit: async () => ({
        pinned: [],
        commitPaths: [],
        failures: [
          {
            relativePath: failedFile.path,
            sizeInBytes: 200,
            message: 'partial selection',
          },
        ],
      }),
      _loadStatus: async () => undefined,
      postCheapLfsPinNotification: () => undefined,
      postCheapLfsPinFailureNotification: () => undefined,
      _recordCommitStats: async () => undefined,
      refreshChangesSection: async () => {
        state.changesState.workingDirectory = WorkingDirectoryStatus.fromFiles([
          failedFile.withIncludeAll(false),
        ])
      },
      _refreshRepositoryAfterCommit: () => undefined,
      emitUpdate: () => undefined,
    })

    const committed = await store._commitIncludedChanges(
      repository,
      {} as Parameters<AppStore['_commitIncludedChanges']>[1]
    )
    assert.equal(committed, true)
    assert.equal(
      state.changesState.workingDirectory.files[0].selection.getSelectionType(),
      DiffSelectionType.Partial
    )
  })
})
