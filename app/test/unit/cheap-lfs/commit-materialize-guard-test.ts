import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { AppStore } from '../../../src/lib/stores/app-store'
import { Branch, BranchType } from '../../../src/models/branch'
import { Repository, SubmoduleRepository } from '../../../src/models/repository'
import { TipState } from '../../../src/models/tip'

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

function git(cwd: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Guard Test',
      GIT_AUTHOR_EMAIL: 'guard@example.invalid',
      GIT_COMMITTER_NAME: 'Guard Test',
      GIT_COMMITTER_EMAIL: 'guard@example.invalid',
    },
  }).trim()
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

  it('keeps legacy push preparation inside the commit gate when a restore queues behind it', async t => {
    const root = await mkdtemp(join(tmpdir(), 'legacy-push-restore-gate-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const worktree = join(root, 'worktree')
    const bare = join(root, 'remote.git')
    await mkdir(worktree)
    git(root, ['init', '--bare', '--initial-branch=main', bare])
    git(worktree, ['init', '--initial-branch=main'])
    await writeFile(join(worktree, 'base.txt'), 'base\n', 'utf8')
    git(worktree, ['add', '--', 'base.txt'])
    git(worktree, ['commit', '-m', 'base'])
    git(worktree, ['remote', 'add', 'origin', bare])
    git(worktree, ['push', '-u', 'origin', 'main'])
    const tipSha = git(worktree, ['rev-parse', 'HEAD'])
    const repository = new Repository(worktree, 91, null, false)
    const { store, state } = storeFixture()
    Object.assign(state, {
      branchesState: {
        tip: {
          kind: TipState.Valid,
          branch: new Branch(
            'main',
            'origin/main',
            { sha: tipSha },
            BranchType.Local,
            'refs/heads/main'
          ),
        },
      },
    })
    const originalWithIsCommitting = Reflect.get(
      AppStore.prototype,
      'withIsCommitting'
    ) as (
      repository: Repository,
      operation: () => Promise<boolean>
    ) => Promise<boolean>
    const originalWithMaterialize = Reflect.get(
      AppStore.prototype,
      'withCheapLfsMaterializeLock'
    ) as (
      repository: Repository,
      signal: AbortSignal | undefined,
      operation: (signal: AbortSignal) => Promise<string>
    ) => Promise<string>
    let ownershipChecks = 0
    let restoreStarted = false
    let preparationRan = false
    let restore: Promise<string> | null = null

    Reflect.set(store, 'canRunLegacyLocalCommitPushBatching', () => {
      ownershipChecks++
      return true
    })
    Reflect.set(store, 'createLegacyLocalCommitBatchingGitSession', () => ({
      operations: {},
      prepare: async () => {
        preparationRan = true
        assert.equal(
          restoreStarted,
          false,
          'preparation must mutate its marker before the queued restore starts'
        )
        throw new Error('injected preparation stop')
      },
    }))
    Reflect.set(
      store,
      'withIsCommitting',
      async (
        target: Repository,
        operation: () => Promise<boolean>
      ): Promise<boolean> =>
        await originalWithIsCommitting.call(store, target, async () => {
          restore = originalWithMaterialize.call(
            store,
            target,
            undefined,
            async () => {
              restoreStarted = true
              return 'restored'
            }
          )
          await Promise.resolve()
          assert.equal(
            restoreStarted,
            false,
            'the restore must wait behind the legacy rewrite gate'
          )
          return await operation()
        })
    )

    await assert.rejects(
      (store as any).handleLegacyLocalCommitPushBatching(
        repository,
        { name: 'origin', url: bare },
        undefined,
        {}
      ),
      /injected preparation stop/
    )

    assert.equal(ownershipChecks, 1)
    assert.equal(preparationRan, true)
    assert.ok(restore !== null)
    assert.equal(await restore, 'restored')
    assert.equal(restoreStarted, true)
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
