import assert from 'node:assert'
import { describe, it } from 'node:test'
import { AppStore } from '../../../src/lib/stores/app-store'
import { Repository, SubmoduleRepository } from '../../../src/models/repository'

interface IDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): IDeferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(complete => {
    resolve = complete
  })
  return { promise, resolve }
}

function repositoryFixture(): Repository {
  return new Repository('C:/work/restore-guard', 91, null, false)
}

function storeFixture() {
  const state: {
    isCommitting: boolean
    commitOperationPhase: unknown
    hookProgress: unknown
    subscribeToCommitOutput: unknown
  } = {
    isCommitting: false,
    commitOperationPhase: null,
    hookProgress: null,
    subscribeToCommitOutput: null,
  }
  const notices = new Array<ReadonlyArray<unknown>>()
  const store = Object.create(AppStore.prototype) as AppStore
  Object.assign(store, {
    cheapLfsMaterializeOwners: new Map(),
    cheapLfsMaterializeTails: new Map(),
    cheapLfsCommitGates: new Map(),
    repositoryStateCache: {
      get: () => state,
      update: (
        _repository: Repository,
        update: (current: typeof state) => Partial<typeof state>
      ) => Object.assign(state, update(state)),
    },
    emitUpdate: () => undefined,
    postPersistentErrorNotice: (...args: ReadonlyArray<unknown>) =>
      notices.push(args),
  })
  return { store, state, notices }
}

describe('Cheap LFS commit/materialize ownership', () => {
  it('blocks a commit until an active restore has fully released its owner', async () => {
    const repository = repositoryFixture()
    const { store, state, notices } = storeFixture()
    const restoreStarted = deferred<void>()
    const finishRestore = deferred<void>()

    const restore = (store as any).withCheapLfsMaterializeLock(
      repository,
      undefined,
      async () => {
        restoreStarted.resolve()
        await finishRestore.promise
        return 'restored'
      }
    ) as Promise<string>
    await restoreStarted.promise
    assert.equal(
      (store as any).canRunLegacyLocalCommitPushBatching(repository),
      false
    )

    let commitRan = false
    const blocked = await (store as any).withIsCommitting(
      repository,
      async () => {
        commitRan = true
        return true
      }
    )
    assert.equal(blocked, false)
    assert.equal(commitRan, false)
    assert.equal(state.isCommitting, false)
    assert.equal(notices.length, 1)
    assert.match(String(notices[0][0]), /Commit waits/)
    assert.match(String(notices[0][1]), /No commit started/)

    finishRestore.resolve()
    assert.equal(await restore, 'restored')
    assert.equal(
      (store as any).canRunLegacyLocalCommitPushBatching(repository),
      true
    )

    const committed = await (store as any).withIsCommitting(
      repository,
      async () => {
        commitRan = true
        return true
      }
    )
    assert.equal(committed, true)
    assert.equal(commitRan, true)
    assert.equal(state.isCommitting, false)
    assert.equal(notices.length, 1)
  })

  it('queues a restore that arrives after the commit owns the worktree', async () => {
    const repository = repositoryFixture()
    const { store } = storeFixture()
    const commitStarted = deferred<void>()
    const finishCommit = deferred<void>()
    const restoreStarted = deferred<void>()

    const commit = (store as any).withIsCommitting(repository, async () => {
      commitStarted.resolve()
      await finishCommit.promise
      return true
    }) as Promise<boolean>
    await commitStarted.promise

    let restored = false
    const restore = (store as any).withCheapLfsMaterializeLock(
      repository,
      undefined,
      async () => {
        restored = true
        restoreStarted.resolve()
        return 'restored'
      }
    ) as Promise<string>

    await Promise.resolve()
    assert.equal(restored, false)
    finishCommit.resolve()
    assert.equal(await commit, true)
    await restoreStarted.promise
    assert.equal(await restore, 'restored')
  })

  it('treats a stale cloud-compression dispatch for a submodule as a no-op', async () => {
    const parent = new Repository('C:/work/main', 7, null, false)
    const submodule = new SubmoduleRepository(
      'C:/work/main/modules/widget',
      'C:/work/main/.git/modules/modules/widget',
      parent,
      {
        name: 'modules/widget',
        path: 'modules/widget',
        url: '../widget.git',
        branch: null,
        update: null,
        ignore: null,
        shallow: null,
        fetchRecurseSubmodules: null,
        sha: '0123456789012345678901234567890123456789',
        describe: null,
        topology: 'valid',
        status: 'up-to-date',
      }
    )
    const store = Object.create(AppStore.prototype) as AppStore
    const result = await store._ensureCheapLfsCloudCompressionWorkflow(
      submodule,
      submodule.buildRunPreferences
    )

    assert.equal(result.changed, false)
    assert.equal(result.policy, 'not-github')
    assert.match(
      result.path.replaceAll('\\', '/'),
      /modules\/widget\/\.github\/workflows\/cheap-lfs-cloud-compression\.yml$/
    )
    assert.equal(
      (store as any).canRunLegacyLocalCommitPushBatching(submodule),
      false
    )
    assert.equal(
      (store as any).canRunLegacyLocalCommitPushBatching(parent),
      true
    )
  })
})
