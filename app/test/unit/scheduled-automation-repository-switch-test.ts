import assert from 'node:assert'
import { describe, it } from 'node:test'
import { IAutomationGuardState } from '../../src/lib/automation/automation-guards'
import { AppStore } from '../../src/lib/stores/app-store'
import { Repository } from '../../src/models/repository'

type ScheduledMethod = (repository: Repository) => Promise<void>

const safeGuardState: IAutomationGuardState = {
  tipIsValid: true,
  hasChanges: true,
  hasConflict: false,
  hasMultiCommitOperation: false,
  isCommitting: false,
  isGeneratingCommitMessage: false,
  isPushPullFetchInProgress: false,
  isCheckingOut: false,
  hasDraftCommitMessage: false,
  hasUpstream: true,
  mergeHeadSet: false,
}

function invoke(
  store: AppStore,
  methodName: string,
  repository: Repository
): Promise<void> {
  const method = Reflect.get(AppStore.prototype, methodName) as ScheduledMethod
  return method.call(store, repository)
}

class SwitchOnGitDirectoryRepository extends Repository {
  public onGitDirectoryRead: () => void = () => undefined

  public override get resolvedGitDir(): string {
    this.onGitDirectoryRead()
    return super.resolvedGitDir
  }
}

describe('scheduled automation repository selection', () => {
  it('cancels commit/push and pull when selection changes during refresh', async () => {
    for (const [methodName, effectName] of [
      ['runScheduledCommitPush', 'performScheduledCommitPush'],
      ['runScheduledPull', 'performScheduledPull'],
    ] as const) {
      const repository = new Repository('C:/work/selected', 1, null, false)
      const replacement = new Repository('C:/work/replacement', 2, null, false)
      const store = Object.create(AppStore.prototype) as AppStore
      let releaseRefresh!: () => void
      let effects = 0
      Object.assign(store, {
        selectedRepository: repository,
        _refreshRepository: () =>
          new Promise<void>(resolve => {
            releaseRefresh = resolve
          }),
        getAutomationGuardState: () => safeGuardState,
        [effectName]: async () => {
          effects++
        },
        postNotification: () => {
          effects++
        },
      })

      const pending = invoke(store, methodName, repository)
      await Promise.resolve()
      Reflect.set(store, 'selectedRepository', replacement)
      releaseRefresh()
      await pending

      assert.equal(effects, 0, methodName)
    }
  })

  it('cancels pull when selection changes while merge state is loading', async () => {
    const repository = new SwitchOnGitDirectoryRepository(
      'C:/work/selected',
      1,
      null,
      false
    )
    const replacement = new Repository('C:/work/replacement', 2, null, false)
    const store = Object.create(AppStore.prototype) as AppStore
    let pulls = 0
    Object.assign(store, {
      selectedRepository: repository,
      _refreshRepository: async () => undefined,
      getAutomationGuardState: () => safeGuardState,
      performScheduledPull: async () => {
        pulls++
      },
      postNotification: () => {
        pulls++
      },
    })
    repository.onGitDirectoryRead = () => {
      Reflect.set(store, 'selectedRepository', replacement)
    }

    await invoke(store, 'runScheduledPull', repository)

    assert.equal(pulls, 0)
  })

  it('fences pre-commit awaits and always completes a successful commit/push pair', async () => {
    const boundaries = [
      'message',
      'include',
      'precommit',
      'commit',
      'refresh',
      'push',
    ]
    for (const boundary of boundaries) {
      const repository = new Repository('C:/work/selected', 1, null, false)
      const replacement = new Repository('C:/work/replacement', 2, null, false)
      const store = Object.create(AppStore.prototype) as AppStore
      const events = new Array<string>()
      const step = (name: string) => {
        events.push(name)
        if (boundary === name) {
          Reflect.set(store, 'selectedRepository', replacement)
        }
      }
      Object.assign(store, {
        selectedRepository: repository,
        repositoryStateCache: {
          get: () => ({
            changesState: { workingDirectory: { files: [] } },
          }),
        },
        setOneClickCommitPushPhase: () => undefined,
        generateAutomationCommitMessage: async () => {
          step('message')
          return null
        },
        _changeIncludeAllFiles: async () => step('include'),
        _commitIncludedChanges: async (
          _repository: Repository,
          _context: unknown,
          _forceAutoPin: boolean,
          pushAfterCommit: boolean,
          canStartCommit: () => boolean
        ) => {
          assert.equal(pushAfterCommit, true)
          assert.equal(canStartCommit(), true)
          step('precommit')
          if (!canStartCommit()) {
            return false
          }
          step('commit')
          // The refresh and push now live inside the commit batch sequencer.
          // Once its first commit succeeds, repository selection fencing must
          // not strand that commit before the paired push.
          step('refresh')
          step('push')
          return true
        },
        postNotification: () => events.push('notification'),
      })

      const operation = invoke(store, 'performScheduledCommitPush', repository)
      if (boundary === 'precommit') {
        await assert.rejects(operation, /automatic commit did not complete/i)
      } else {
        await operation
      }

      const expected =
        boundary === 'message'
          ? ['message']
          : boundary === 'include'
          ? ['message', 'include']
          : boundary === 'precommit'
          ? ['message', 'include', 'precommit']
          : [
              'message',
              'include',
              'precommit',
              'commit',
              'refresh',
              'push',
              'notification',
            ]
      assert.deepEqual(events, expected, boundary)
    }
  })

  it('accepts an equivalent immutable repository replacement during refresh', async () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const refreshed = new Repository(
      'c:\\WORK\\selected',
      1,
      null,
      false,
      'refreshed model'
    )
    const store = Object.create(AppStore.prototype) as AppStore
    let commitPushes = 0
    Object.assign(store, {
      selectedRepository: repository,
      _refreshRepository: async () => {
        Reflect.set(store, 'selectedRepository', refreshed)
      },
      getAutomationGuardState: () => safeGuardState,
      performScheduledCommitPush: async () => {
        commitPushes++
      },
    })

    await invoke(store, 'runScheduledCommitPush', repository)

    assert.equal(commitPushes, 1)
  })

  it('fences a switch away and back even when repository identity matches', () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const replacement = new Repository('c:\\WORK\\selected', 1, null, false)
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      selectedRepository: repository,
      scheduledAutomationSelectionEpoch: 4,
    })

    const capture = Reflect.get(
      AppStore.prototype,
      'captureScheduledAutomationFence'
    ) as (repository: Repository) => unknown
    const isCurrent = Reflect.get(
      AppStore.prototype,
      'isScheduledAutomationFenceCurrent'
    ) as (fence: unknown) => boolean
    const fence = capture.call(store, repository)

    Reflect.set(store, 'selectedRepository', replacement)
    Reflect.set(store, 'scheduledAutomationSelectionEpoch', 6)

    assert.equal(isCurrent.call(store, fence), false)
  })

  it('does not enter resolved push or pull work after a repository switch', async () => {
    for (const [methodName, resolvedMethodName] of [
      ['performScheduledPush', 'performScheduledPushWithResolvedRepository'],
      ['performScheduledPull', 'performScheduledPullWithResolvedRepository'],
    ] as const) {
      const repository = new Repository('C:/work/selected', 1, null, false)
      const replacement = new Repository('C:/work/replacement', 2, null, false)
      const store = Object.create(AppStore.prototype) as AppStore
      let effects = 0
      Object.assign(store, {
        selectedRepository: repository,
        repositoryWithRefreshedGitHubRepository: async () => {
          Reflect.set(store, 'selectedRepository', replacement)
          return repository
        },
        [resolvedMethodName]: async () => {
          effects++
        },
      })

      await invoke(store, methodName, repository)

      assert.equal(effects, 0, methodName)
    }
  })

  it('continues resolved push work after an equivalent model refresh', async () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const refreshed = new Repository(
      'c:\\WORK\\selected',
      1,
      null,
      false,
      'refreshed model'
    )
    const store = Object.create(AppStore.prototype) as AppStore
    let pushes = 0
    Object.assign(store, {
      selectedRepository: repository,
      repositoryWithRefreshedGitHubRepository: async () => {
        Reflect.set(store, 'selectedRepository', refreshed)
        return refreshed
      },
      performScheduledPushWithResolvedRepository: async () => {
        pushes++
        return true
      },
    })

    await invoke(store, 'performScheduledPush', repository)

    assert.equal(pushes, 1)
  })

  it('rechecks selection inside the network-operation boundary', async () => {
    for (const methodName of [
      'performScheduledPushWithResolvedRepository',
      'performScheduledPullWithResolvedRepository',
    ]) {
      const repository = new Repository(
        'C:/definitely-missing/scheduled-repository',
        1,
        null,
        false
      )
      const replacement = new Repository('C:/work/replacement', 2, null, false)
      const store = Object.create(AppStore.prototype) as AppStore
      let tagsCleared = 0
      Object.assign(store, {
        accounts: [],
        selectedRepository: repository,
        repositoryStateCache: {
          get: () => ({
            remote: {
              name: 'origin',
              url: 'https://example.invalid/owner/repository.git',
            },
            branchesState: {
              tip: {
                kind: 'Valid',
                branch: {
                  name: 'main',
                  upstreamRemoteName: 'origin',
                  upstreamWithoutRemote: 'main',
                },
              },
            },
            isPushPullFetchInProgress: false,
          }),
        },
        gitStoreCache: {
          get: () => ({
            tagsToPush: [],
            clearTagsToPush: () => {
              tagsCleared++
            },
          }),
        },
        withPushPullFetch: async (
          _repository: Repository,
          operation: () => Promise<void>
        ) => {
          Reflect.set(store, 'selectedRepository', replacement)
          await operation()
        },
      })

      await invoke(store, methodName, repository)

      assert.equal(tagsCleared, 0, methodName)
    }
  })
})
