import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import { exec, GitError as DugiteError } from 'dugite'

import { GitError, IGitResult } from '../../src/lib/git/core'
import { AppStore } from '../../src/lib/stores/app-store'
import { createPullBranchDeletedOfferBudget } from '../../src/lib/pull-branch-deleted'
import { Branch, BranchType } from '../../src/models/branch'
import { PopupType } from '../../src/models/popup'
import { Repository } from '../../src/models/repository'
import { TipState } from '../../src/models/tip'
import { UncommittedChangesStrategy } from '../../src/models/uncommitted-changes-strategy'
import { setupEmptyRepository } from '../helpers/repositories'
import { makeCommit, switchTo } from '../helpers/repository-scaffolding'

function makeStore(stubs: object): AppStore {
  const store = Object.create(AppStore.prototype) as AppStore
  Object.assign(store, stubs)
  return store
}

function localBranch(name: string, upstream: string | null): Branch {
  return new Branch(
    name,
    upstream,
    { sha: 'f'.repeat(40) },
    BranchType.Local,
    `refs/heads/${name}`
  )
}

function repositoryState(options: {
  readonly tipBranch: Branch | null
  readonly defaultBranch: Branch | null
  readonly changedFileCount?: number
  readonly conflicted?: boolean
  readonly busy?: boolean
}) {
  return {
    branchesState: {
      tip:
        options.tipBranch === null
          ? { kind: TipState.Detached, currentSha: 'a'.repeat(40) }
          : { kind: TipState.Valid, branch: options.tipBranch },
      defaultBranch: options.defaultBranch,
    },
    changesState: {
      workingDirectory: {
        files: new Array(options.changedFileCount ?? 0)
          .fill(null)
          .map((_, index) => ({ id: `file-${index}` })),
      },
      conflictState: options.conflicted === true ? ({} as any) : null,
    },
    isPushPullFetchInProgress: options.busy === true,
  }
}

/** A repository with `master`, and a `feature` branch carrying two commits. */
async function setupDivergedRepository(t: TestContext): Promise<Repository> {
  const repository = await setupEmptyRepository(t)
  await makeCommit(repository, {
    commitMessage: 'Base',
    entries: [{ path: 'base.txt', contents: 'base' }],
  })
  await switchTo(repository, 'feature')
  await makeCommit(repository, {
    commitMessage: 'Feature one',
    entries: [{ path: 'one.txt', contents: 'one' }],
  })
  await makeCommit(repository, {
    commitMessage: 'Feature two',
    entries: [{ path: 'two.txt', contents: 'two' }],
  })
  await exec(['remote', 'add', 'origin', repository.path], repository.path)
  return repository
}

const missingRemoteRefError = () =>
  new GitError(
    {
      exitCode: 1,
      stdout: '',
      stderr:
        "Your configuration specifies to merge with the ref 'refs/heads/deleted-branch'\nfrom the remote, but no such ref was fetched.",
      gitError: DugiteError.NoExistingRemoteBranch,
      gitErrorDescription: 'The remote branch does not exist.',
      path: 'C:\\repository',
    } as IGitResult,
    ['pull'],
    'no such ref was fetched'
  )

describe('deleted-upstream recovery plan in the app store', () => {
  it('counts the commits that only the stale branch has', async t => {
    const repository = await setupDivergedRepository(t)
    let refreshed = 0
    const store = makeStore({
      _refreshRepository: async () => {
        refreshed++
      },
      repositoryStateCache: {
        get: () =>
          repositoryState({
            tipBranch: localBranch('feature', 'origin/deleted-branch'),
            defaultBranch: localBranch('master', 'origin/master'),
          }),
      },
    })

    const plan = await store._getPullBranchDeletedRecoveryPlan(repository)

    assert.equal(refreshed, 1, 'the plan must be read from refreshed state')
    assert.equal(plan.blocker, null)
    assert.equal(plan.staleBranchName, 'feature')
    assert.equal(plan.defaultBranchName, 'master')
    assert.equal(plan.unmergedCommitCount, 2)
    assert.equal(plan.deletionWouldStrandCommits, true)
  })

  it('reports a missing default branch rather than naming a guess', async t => {
    const repository = await setupDivergedRepository(t)
    const store = makeStore({
      _refreshRepository: async () => {},
      repositoryStateCache: {
        get: () =>
          repositoryState({
            tipBranch: localBranch('feature', 'origin/deleted-branch'),
            defaultBranch: null,
          }),
      },
    })

    const plan = await store._getPullBranchDeletedRecoveryPlan(repository)
    assert.equal(plan.blocker, 'no-default-branch')
    assert.equal(plan.defaultBranchName, null)
  })
})

describe('switching to the default branch after a deleted upstream', () => {
  const buildStore = (
    state: ReturnType<typeof repositoryState>,
    events: Array<string>,
    options: {
      readonly stateAfterCheckout?: ReturnType<typeof repositoryState>
      readonly pullError?: Error
    } = {}
  ) => {
    let current = state
    const errorListeners = new Array<(error: Error) => void>()
    return makeStore({
      _refreshRepository: async () => {},
      repositoryStateCache: { get: () => current },
      gitStoreCache: {
        get: () => ({
          onDidError: (fn: (error: Error) => void) => {
            errorListeners.push(fn)
            return { dispose: () => {} }
          },
        }),
      },
      _checkoutBranch: async (
        _repository: Repository,
        branch: Branch,
        strategy: UncommittedChangesStrategy
      ) => {
        events.push(`checkout:${branch.name}:${strategy}`)
        if (options.stateAfterCheckout !== undefined) {
          current = options.stateAfterCheckout
        }
      },
      _deleteBranch: async (
        _repository: Repository,
        branch: Branch,
        includeUpstream: boolean | undefined,
        toCheckout: Branch | null
      ) => {
        events.push(
          `delete:${branch.name}:upstream=${String(
            includeUpstream
          )}:to=${String(toCheckout?.name)}`
        )
      },
      _pull: async () => {
        events.push('pull')
        if (options.pullError !== undefined) {
          for (const listener of errorListeners) {
            listener(options.pullError)
          }
        }
      },
    })
  }

  it('refuses a dirty worktree without touching the branch or the remote', async t => {
    const repository = await setupDivergedRepository(t)
    const events = new Array<string>()
    const store = buildStore(
      repositoryState({
        tipBranch: localBranch('feature', 'origin/deleted-branch'),
        defaultBranch: localBranch('master', 'origin/master'),
        changedFileCount: 2,
      }),
      events
    )

    const outcome = await store._switchToDefaultBranchAndPull(repository, true)

    assert.deepStrictEqual(outcome, {
      kind: 'blocked',
      blocker: 'dirty-worktree',
    })
    assert.deepStrictEqual(events, [], 'nothing may be mutated on a refusal')
  })

  it('refuses when the repository has no default branch', async t => {
    const repository = await setupDivergedRepository(t)
    const events = new Array<string>()
    const store = buildStore(
      repositoryState({
        tipBranch: localBranch('feature', 'origin/deleted-branch'),
        defaultBranch: null,
      }),
      events
    )

    assert.deepStrictEqual(
      await store._switchToDefaultBranchAndPull(repository),
      { kind: 'blocked', blocker: 'no-default-branch' }
    )
    assert.deepStrictEqual(events, [])
  })

  it('switches and retries without deleting anything by default', async t => {
    const repository = await setupDivergedRepository(t)
    const events = new Array<string>()
    const store = buildStore(
      repositoryState({
        tipBranch: localBranch('feature', 'origin/deleted-branch'),
        defaultBranch: localBranch('master', 'origin/master'),
      }),
      events,
      {
        stateAfterCheckout: repositoryState({
          tipBranch: localBranch('master', 'origin/master'),
          defaultBranch: localBranch('master', 'origin/master'),
        }),
      }
    )

    const outcome = await store._switchToDefaultBranchAndPull(repository)

    assert.deepStrictEqual(outcome, {
      kind: 'completed',
      defaultBranchName: 'master',
      deletedStaleBranch: false,
      deletionSkippedReason: null,
      pull: 'succeeded',
      pullError: null,
    })
    assert.deepStrictEqual(events, [
      `checkout:master:${UncommittedChangesStrategy.AskForConfirmation}`,
      'pull',
    ])
  })

  it('deletes only the local stale branch when that was chosen', async t => {
    const repository = await setupDivergedRepository(t)
    const events = new Array<string>()
    const store = buildStore(
      repositoryState({
        tipBranch: localBranch('feature', 'origin/deleted-branch'),
        defaultBranch: localBranch('master', 'origin/master'),
      }),
      events,
      {
        stateAfterCheckout: repositoryState({
          tipBranch: localBranch('master', 'origin/master'),
          defaultBranch: localBranch('master', 'origin/master'),
        }),
      }
    )

    const outcome = await store._switchToDefaultBranchAndPull(repository, true)

    assert.equal(outcome.kind, 'completed')
    assert.equal(
      outcome.kind === 'completed' ? outcome.deletedStaleBranch : null,
      true
    )
    assert.deepStrictEqual(events, [
      `checkout:master:${UncommittedChangesStrategy.AskForConfirmation}`,
      'delete:feature:upstream=false:to=master',
      'pull',
    ])
  })

  it('reports a failed retry instead of claiming the pull worked', async t => {
    const repository = await setupDivergedRepository(t)
    const events = new Array<string>()
    const store = buildStore(
      repositoryState({
        tipBranch: localBranch('feature', 'origin/deleted-branch'),
        defaultBranch: localBranch('master', 'origin/master'),
      }),
      events,
      {
        stateAfterCheckout: repositoryState({
          tipBranch: localBranch('master', 'origin/master'),
          defaultBranch: localBranch('master', 'origin/master'),
        }),
        pullError: new Error('Authentication failed for origin'),
      }
    )

    const outcome = await store._switchToDefaultBranchAndPull(repository)

    assert.equal(outcome.kind, 'completed')
    if (outcome.kind === 'completed') {
      assert.equal(outcome.pull, 'failed')
      assert.equal(outcome.pullError, 'Authentication failed for origin')
      assert.equal(outcome.defaultBranchName, 'master')
    }
  })

  it('reports a checkout that did not land, and never pulls afterwards', async t => {
    const repository = await setupDivergedRepository(t)
    const events = new Array<string>()
    const store = buildStore(
      repositoryState({
        tipBranch: localBranch('feature', 'origin/deleted-branch'),
        defaultBranch: localBranch('master', 'origin/master'),
      }),
      events
      // No state change after checkout: the tip stays on the stale branch.
    )

    assert.deepStrictEqual(
      await store._switchToDefaultBranchAndPull(repository, true),
      { kind: 'checkout-failed', defaultBranchName: 'master' }
    )
    assert.deepStrictEqual(events, [
      `checkout:master:${UncommittedChangesStrategy.AskForConfirmation}`,
    ])
  })
})

describe('offering deleted-upstream recovery from the app store', () => {
  const buildOfferStore = (
    repository: Repository,
    upstream: string,
    popups: Array<any>
  ) =>
    makeStore({
      accounts: [],
      _refreshRepository: async () => {},
      _showPopup: (popup: any) => popups.push(popup),
      repositoryStateCache: {
        get: () =>
          repositoryState({
            tipBranch: localBranch('feature', upstream),
            defaultBranch: localBranch('master', 'origin/master'),
          }),
      },
      gitStoreCache: {
        get: () => ({
          tip: {
            kind: TipState.Valid,
            branch: localBranch('feature', upstream),
          },
          currentRemote: { name: 'origin', url: repository.path },
          remotes: [{ name: 'origin', url: repository.path }],
        }),
      },
    })

  it('offers once the remote really no longer advertises the branch', async t => {
    const repository = await setupDivergedRepository(t)
    const popups = new Array<any>()
    const store = buildOfferStore(repository, 'origin/deleted-branch', popups)

    const offered = await store._maybeOfferPullBranchDeletedRecovery(
      repository,
      { reportedMissingRemoteRef: true, isPullOperation: true }
    )

    assert.equal(offered, true)
    assert.equal(popups.length, 1)
    assert.equal(popups[0].type, PopupType.PullBranchDeleted)
    assert.equal(popups[0].branchName, 'feature')
    assert.equal(popups[0].remoteName, 'origin')
    assert.equal(popups[0].remoteBranchName, 'deleted-branch')
  })

  it('declines when the remote still advertises the branch', async t => {
    const repository = await setupDivergedRepository(t)
    const popups = new Array<any>()
    const store = buildOfferStore(repository, 'origin/master', popups)

    const offered = await store._maybeOfferPullBranchDeletedRecovery(
      repository,
      { reportedMissingRemoteRef: true, isPullOperation: true }
    )

    assert.equal(offered, false)
    assert.deepStrictEqual(popups, [])
  })

  it('declines for a failure that was not the missing-ref classification', async t => {
    const repository = await setupDivergedRepository(t)
    const popups = new Array<any>()
    const store = buildOfferStore(repository, 'origin/deleted-branch', popups)

    assert.equal(
      await store._maybeOfferPullBranchDeletedRecovery(repository, {
        reportedMissingRemoteRef: false,
        isPullOperation: true,
      }),
      false
    )
    assert.equal(
      await store._maybeOfferPullBranchDeletedRecovery(repository, {
        reportedMissingRemoteRef: true,
        isPullOperation: false,
      }),
      false
    )
    assert.deepStrictEqual(popups, [])
  })
})

describe('batch sync deleted-upstream recovery', () => {
  const offerBatch = (
    store: AppStore,
    repository: Repository,
    error: unknown,
    budget: { offersRemaining: number }
  ) =>
    (
      Reflect.get(store, 'offerBatchPullBranchDeletedRecovery') as (
        this: AppStore,
        repository: Repository,
        error: unknown,
        budget: { offersRemaining: number }
      ) => Promise<{ status: 'failed'; detail: string } | null>
    ).call(store, repository, error, budget)

  const buildBatchStore = (
    repository: Repository,
    upstream: string,
    popups: Array<any>
  ) =>
    makeStore({
      accounts: [],
      _refreshRepository: async () => {},
      _showPopup: (popup: any) => popups.push(popup),
      repositoryStateCache: {
        get: () =>
          repositoryState({
            tipBranch: localBranch('feature', upstream),
            defaultBranch: localBranch('master', 'origin/master'),
          }),
      },
      gitStoreCache: {
        get: () => ({
          tip: {
            kind: TipState.Valid,
            branch: localBranch('feature', upstream),
          },
          currentRemote: { name: 'origin', url: repository.path },
          remotes: [{ name: 'origin', url: repository.path }],
        }),
      },
    })

  it('raises a per-repository offer and says so in the result row', async t => {
    const repository = await setupDivergedRepository(t)
    const popups = new Array<any>()
    const store = buildBatchStore(repository, 'origin/deleted-branch', popups)
    const budget = createPullBranchDeletedOfferBudget()

    const result = await offerBatch(
      store,
      repository,
      missingRemoteRefError(),
      budget
    )

    assert.notEqual(result, null)
    assert.equal(result?.status, 'failed')
    assert.match(result?.detail ?? '', /deleted-branch/)
    assert.match(result?.detail ?? '', /default branch/)
    assert.equal(popups.length, 1)
    assert.equal(popups[0].type, PopupType.PullBranchDeleted)
    assert.equal(budget.offersRemaining, 9)
  })

  it('leaves an unrelated batch failure to be reported as itself', async t => {
    const repository = await setupDivergedRepository(t)
    const popups = new Array<any>()
    const store = buildBatchStore(repository, 'origin/deleted-branch', popups)

    assert.equal(
      await offerBatch(
        store,
        repository,
        new Error('Authentication failed'),
        createPullBranchDeletedOfferBudget()
      ),
      null
    )
    assert.deepStrictEqual(popups, [])
  })

  it('stops opening dialogs once a batch has spent its allowance', async t => {
    const repository = await setupDivergedRepository(t)
    const popups = new Array<any>()
    const store = buildBatchStore(repository, 'origin/deleted-branch', popups)
    const budget = { offersRemaining: 0 }

    const result = await offerBatch(
      store,
      repository,
      missingRemoteRefError(),
      budget
    )

    assert.equal(result?.status, 'failed')
    assert.match(result?.detail ?? '', /deleted-branch/)
    assert.match(result?.detail ?? '', /Too many repositories/)
    assert.deepStrictEqual(popups, [], 'the cap must not open another dialog')
  })
})
