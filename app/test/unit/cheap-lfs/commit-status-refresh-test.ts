import assert from 'node:assert'
import { describe, it } from 'node:test'
import { AppStore } from '../../../src/lib/stores/app-store'
import { Repository } from '../../../src/models/repository'

describe('cheap LFS commit status diff refresh', () => {
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
            progress: { phase },
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

    const waiting = new AbortController()
    controllers.set(repository.id, waiting)
    manualRequests.clear()
    phase = 'manual-waiting'
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
})
