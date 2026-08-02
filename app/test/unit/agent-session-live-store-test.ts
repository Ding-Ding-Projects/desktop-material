import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  AgentSessionIntervalHandle,
  AgentSessionLiveStore,
  IAgentSessionLiveStoreDependencies,
  MaximumConcurrentAgentSessionDiffReads,
  MaximumAgentSessionDiffPollIntervalMs,
  MinimumAgentSessionDiffPollIntervalMs,
  canonicalAgentSessionPath,
  shouldPollAgentSessionDiffs,
} from '../../src/lib/agent-sessions'
import { IAgentSessionDiffStat } from '../../src/models/agent-session'

interface IDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

function deferred<T>(): IDeferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

class ManualIntervals {
  private nextHandle = 1
  private readonly callbacks = new Map<number, () => void>()
  public readonly scheduledIntervals: Array<number> = []
  public readonly clearedHandles: Array<number> = []

  public readonly schedule = (
    callback: () => void,
    intervalMs: number
  ): AgentSessionIntervalHandle => {
    const handle = this.nextHandle++
    this.callbacks.set(handle, callback)
    this.scheduledIntervals.push(intervalMs)
    return handle
  }

  public readonly clear = (handle: AgentSessionIntervalHandle): void => {
    const numericHandle = handle as number
    this.callbacks.delete(numericHandle)
    this.clearedHandles.push(numericHandle)
  }

  public tick(): void {
    for (const callback of Array.from(this.callbacks.values())) {
      callback()
    }
  }

  public get activeCount(): number {
    return this.callbacks.size
  }
}

function cleanDiff(filesChanged = 0): IAgentSessionDiffStat {
  return { filesChanged, linesAdded: 0, linesDeleted: 0 }
}

function dependencies(
  readDiffStat: (path: string) => Promise<IAgentSessionDiffStat>,
  intervals = new ManualIntervals(),
  overrides: Partial<IAgentSessionLiveStoreDependencies> = {}
): IAgentSessionLiveStoreDependencies {
  return {
    readDiffStat,
    scheduleInterval: intervals.schedule,
    clearInterval: intervals.clear,
    ...overrides,
  }
}

describe('AgentSessionLiveStore run activity', () => {
  it('correlates logs and terminal outcomes by operation id', async () => {
    let now = 100
    const store = new AgentSessionLiveStore(
      dependencies(async () => cleanDiff(), undefined, { now: () => now })
    )
    const path = 'C:\\work\\codex-session'

    store.beginRun(path, 'codex', 'operation-one')
    await store.refreshDiffStats()
    assert.deepStrictEqual(store.getOverlay(path), {
      agent: 'codex',
      runState: 'running',
      errorMessage: null,
      lastActivityAt: 100,
      diffStat: cleanDiff(),
      editedFileCount: 0,
    })

    now = 200
    assert.strictEqual(
      store.recordLogActivity({ operationId: 'some-other-operation' }),
      false
    )
    assert.strictEqual(store.getOverlay(path).lastActivityAt, 100)
    assert.strictEqual(
      store.recordLogActivity({ operationId: 'operation-one' }),
      true
    )
    assert.strictEqual(store.getOverlay(path).lastActivityAt, 200)

    now = 300
    assert.strictEqual(store.finishRun('operation-one', { ok: true }), true)
    assert.strictEqual(store.getOverlay(path).runState, 'idle')
    assert.strictEqual(store.getOverlay(path).errorMessage, null)
    assert.strictEqual(store.getOverlay(path).lastActivityAt, 300)
    assert.strictEqual(
      store.recordLogActivity({ operationId: 'operation-one' }),
      false
    )

    store.beginRun(path, 'opencode', 'operation-two')
    now = 400
    assert.strictEqual(
      store.finishRun('operation-two', {
        ok: false,
        errorMessage: 'Runner exited before completing the task.',
      }),
      true
    )
    assert.strictEqual(store.getOverlay(path).agent, 'opencode')
    assert.strictEqual(store.getOverlay(path).runState, 'error')
    assert.strictEqual(
      store.getOverlay(path).errorMessage,
      'Runner exited before completing the task.'
    )
    assert.strictEqual(store.getOverlay(path).lastActivityAt, 400)

    store.dispose()
  })

  it('uses one Windows identity across path casing and separator spellings', async () => {
    const reads: Array<string> = []
    const store = new AgentSessionLiveStore(
      dependencies(async path => {
        reads.push(path)
        return cleanDiff(2)
      })
    )

    store.syncWorktreePaths(['C:/Work/Feature/'])
    await store.refreshDiffStats()
    store.beginRun('c:\\work\\FEATURE', 'codex', 'canonical-operation')

    assert.strictEqual(
      canonicalAgentSessionPath('C:/Work/Feature/'),
      canonicalAgentSessionPath('c:\\work\\FEATURE')
    )
    assert.strictEqual(
      store.getOverlay('C:\\WORK\\feature\\').runState,
      'running'
    )
    assert.strictEqual(store.getOverlay('c:/work/feature').editedFileCount, 2)
    assert.strictEqual(
      store.getOperationId('C:/WORK/FEATURE/'),
      'canonical-operation'
    )

    store.syncWorktreePaths(['c:\\WORK\\feature'])
    assert.strictEqual(
      store.recordLogActivity({ operationId: 'canonical-operation' }),
      true
    )
    assert.strictEqual(
      store.finishRun('canonical-operation', { ok: true }),
      true
    )
    assert.strictEqual(store.getOverlay('C:/work/FEATURE').runState, 'idle')
    assert.ok(reads.length >= 1)

    store.dispose()
  })

  it('retires a cancelled operation so its late result cannot overwrite state', () => {
    const store = new AgentSessionLiveStore(
      dependencies(async () => cleanDiff())
    )
    const path = 'C:\\work\\cancelled'
    store.beginRun(path, 'codex', 'cancel-me')

    assert.strictEqual(store.cancelRun('cancel-me'), true)
    assert.strictEqual(store.getOverlay(path).runState, 'cancelled')
    assert.strictEqual(store.getOperationId(path), null)
    assert.strictEqual(store.finishRun('cancel-me', { ok: true }), false)
    assert.strictEqual(
      store.recordLogActivity({ operationId: 'cancel-me' }),
      false
    )
    assert.strictEqual(store.getOverlay(path).runState, 'cancelled')

    assert.strictEqual(
      store.recordCancellationFailure(path, 'Cancellation IPC failed.'),
      true
    )
    assert.strictEqual(store.getOverlay(path).runState, 'error')
    assert.strictEqual(
      store.getOverlay(path).errorMessage,
      'Cancellation IPC failed.'
    )
    store.dispose()
  })

  it('keeps a hidden repository run correlated without continuing to poll it', () => {
    const store = new AgentSessionLiveStore(
      dependencies(async () => cleanDiff())
    )
    const runningPath = 'C:\\work\\first-repository-agent'
    store.syncWorktreePaths([runningPath])
    store.beginRun(runningPath, 'codex', 'hidden-operation')

    store.syncWorktreePaths(['C:\\work\\second-repository'])
    assert.strictEqual(store.getOperationId(runningPath), 'hidden-operation')
    assert.strictEqual(
      store.recordLogActivity({ operationId: 'hidden-operation' }),
      true
    )
    assert.strictEqual(store.finishRun('hidden-operation', { ok: true }), true)
    assert.deepStrictEqual(store.getOverlay(runningPath), {})

    store.dispose()
  })
})

describe('AgentSessionLiveStore diff polling', () => {
  it('publishes changed diff stats and skips identical snapshots', async () => {
    let nextDiff = { filesChanged: 2, linesAdded: 11, linesDeleted: 3 }
    const intervals = new ManualIntervals()
    const store = new AgentSessionLiveStore(
      dependencies(async () => nextDiff, intervals)
    )
    let notifications = 0
    const unsubscribe = store.subscribe(() => notifications++)

    store.syncWorktreePaths(['C:\\work\\alpha'])
    await store.refreshDiffStats()
    assert.deepStrictEqual(store.getOverlay('C:\\work\\alpha'), {
      diffStat: nextDiff,
      editedFileCount: 2,
    })
    assert.strictEqual(notifications, 1)

    intervals.tick()
    await store.refreshDiffStats()
    assert.strictEqual(notifications, 1)

    nextDiff = { filesChanged: 3, linesAdded: 13, linesDeleted: 5 }
    intervals.tick()
    await store.refreshDiffStats()
    assert.deepStrictEqual(
      store.getOverlay('C:\\work\\alpha').diffStat,
      nextDiff
    )
    assert.strictEqual(store.getOverlay('C:\\work\\alpha').editedFileCount, 3)
    assert.strictEqual(notifications, 2)

    unsubscribe()
    store.dispose()
  })

  it('contains rejected reads and diagnostic callback failures', async () => {
    const errors: Array<{ path: string; error: unknown }> = []
    let shouldFail = true
    const store = new AgentSessionLiveStore(
      dependencies(
        async path => {
          if (shouldFail) {
            throw new Error(`cannot read ${path}`)
          }
          return cleanDiff(1)
        },
        undefined,
        {
          onPollError: (error, path) => {
            errors.push({ path, error })
            throw new Error('diagnostic callback also failed')
          },
        }
      )
    )

    store.syncWorktreePaths(['C:\\work\\broken'])
    await assert.doesNotReject(store.refreshDiffStats())
    assert.strictEqual(errors.length, 1)
    assert.deepStrictEqual(store.getOverlay('C:\\work\\broken'), {})

    shouldFail = false
    await store.refreshDiffStats()
    assert.strictEqual(store.getOverlay('C:\\work\\broken').editedFileCount, 1)

    store.dispose()
  })
})

describe('AgentSessionLiveStore lifecycle', () => {
  it('suspends automatic polling without discarding live session state', async () => {
    const intervals = new ManualIntervals()
    let reads = 0
    let now = 100
    const store = new AgentSessionLiveStore(
      dependencies(async () => cleanDiff(++reads), intervals, {
        now: () => now,
      })
    )
    const path = 'C:\\work\\paused'

    store.syncWorktreePaths([path])
    await store.refreshDiffStats()
    store.beginRun(path, 'codex', 'paused-operation')
    assert.strictEqual(intervals.activeCount, 1)
    assert.strictEqual(store.getOverlay(path).editedFileCount, 1)

    store.setPollingEnabled(false)
    assert.strictEqual(intervals.activeCount, 0)
    assert.strictEqual(store.getOverlay(path).runState, 'running')

    now = 200
    assert.strictEqual(
      store.recordLogActivity({ operationId: 'paused-operation' }),
      true
    )
    assert.strictEqual(store.getOverlay(path).lastActivityAt, 200)
    intervals.tick()
    await Promise.resolve()
    assert.strictEqual(reads, 1)

    await store.refreshDiffStats()
    assert.strictEqual(reads, 2)
    assert.strictEqual(store.getOverlay(path).editedFileCount, 2)
    assert.strictEqual(intervals.activeCount, 0)

    store.setPollingEnabled(true)
    await store.refreshDiffStats()
    assert.strictEqual(reads, 3)
    assert.strictEqual(intervals.activeCount, 1)
    store.setPollingEnabled(true)
    assert.strictEqual(intervals.activeCount, 1)
    assert.strictEqual(store.finishRun('paused-operation', { ok: true }), true)

    store.dispose()
  })

  it('prunes inactive overlays and the timer without orphaning a live run', async () => {
    const intervals = new ManualIntervals()
    const store = new AgentSessionLiveStore(
      dependencies(
        async path => cleanDiff(path.endsWith('alpha') ? 1 : 2),
        intervals
      )
    )

    store.syncWorktreePaths(['C:\\work\\alpha', 'C:\\work\\beta'])
    await store.refreshDiffStats()
    store.beginRun('C:\\work\\alpha', 'codex', 'alpha-operation')
    assert.strictEqual(intervals.activeCount, 1)

    store.syncWorktreePaths(['C:\\work\\beta'])
    assert.strictEqual(
      store.recordLogActivity({ operationId: 'alpha-operation' }),
      true
    )
    assert.strictEqual(store.finishRun('alpha-operation', { ok: true }), true)
    assert.deepStrictEqual(store.getOverlay('C:\\work\\alpha'), {})
    assert.strictEqual(store.getOverlay('C:\\work\\beta').editedFileCount, 2)
    assert.strictEqual(intervals.activeCount, 1)

    store.syncWorktreePaths([])
    assert.deepStrictEqual(store.getOverlay('C:\\work\\beta'), {})
    assert.strictEqual(intervals.activeCount, 0)
    assert.deepStrictEqual(intervals.clearedHandles, [1])

    store.dispose()
    assert.deepStrictEqual(intervals.clearedHandles, [1])
  })

  it('bounds its interval, prevents overlapping reads, and disposes safely', async () => {
    const intervals = new ManualIntervals()
    const pending: Array<IDeferred<IAgentSessionDiffStat>> = []
    let activeReads = 0
    let maximumActiveReads = 0
    const store = new AgentSessionLiveStore(
      dependencies(
        () => {
          activeReads++
          maximumActiveReads = Math.max(maximumActiveReads, activeReads)
          const read = deferred<IAgentSessionDiffStat>()
          pending.push(read)
          return read.promise.finally(() => activeReads--)
        },
        intervals,
        { pollIntervalMs: 1 }
      )
    )

    store.syncWorktreePaths(['C:\\work\\slow'])
    assert.deepStrictEqual(intervals.scheduledIntervals, [
      MinimumAgentSessionDiffPollIntervalMs,
    ])
    assert.strictEqual(pending.length, 1)

    intervals.tick()
    intervals.tick()
    assert.strictEqual(pending.length, 1)
    assert.strictEqual(maximumActiveReads, 1)

    const firstPoll = store.refreshDiffStats()
    pending[0].resolve(cleanDiff(1))
    await firstPoll
    await Promise.resolve()
    assert.strictEqual(pending.length, 2)
    assert.strictEqual(maximumActiveReads, 1)

    store.dispose()
    assert.strictEqual(intervals.activeCount, 0)
    pending[1].resolve(cleanDiff(2))
    await pending[1].promise
    await Promise.resolve()
    assert.deepStrictEqual(store.getOverlay('C:\\work\\slow'), {})

    intervals.tick()
    assert.strictEqual(pending.length, 2)
  })

  it('also clamps excessively slow requested intervals', () => {
    const intervals = new ManualIntervals()
    const store = new AgentSessionLiveStore(
      dependencies(async () => cleanDiff(), intervals, {
        pollIntervalMs: Number.MAX_SAFE_INTEGER,
      })
    )

    store.syncWorktreePaths(['C:\\work\\slow-cadence'])
    assert.deepStrictEqual(intervals.scheduledIntervals, [
      MaximumAgentSessionDiffPollIntervalMs,
    ])
    store.dispose()
  })

  it('caps concurrent worktree reads during a large fleet refresh', async () => {
    let activeReads = 0
    let maximumActiveReads = 0
    let completedReads = 0
    const store = new AgentSessionLiveStore(
      dependencies(async () => {
        activeReads++
        maximumActiveReads = Math.max(maximumActiveReads, activeReads)
        await Promise.resolve()
        activeReads--
        completedReads++
        return cleanDiff()
      })
    )
    store.setPollingEnabled(false)
    store.syncWorktreePaths(
      Array.from({ length: 9 }, (_, index) => `C:\\work\\fleet-${index}`)
    )

    await store.refreshDiffStats()
    assert.strictEqual(completedReads, 9)
    assert.strictEqual(
      maximumActiveReads,
      MaximumConcurrentAgentSessionDiffReads
    )
    store.dispose()
  })
})

describe('agent session polling visibility policy', () => {
  const visible = {
    repositoryFoldoutOpen: true,
    agentsViewSelected: true,
    hasRepositorySelection: true,
    repositoryIsSubmodule: false,
  }

  it('polls only for a visible Agents view on a selected regular repository', () => {
    assert.strictEqual(shouldPollAgentSessionDiffs(visible), true)
    for (const hidden of [
      { ...visible, repositoryFoldoutOpen: false },
      { ...visible, agentsViewSelected: false },
      { ...visible, hasRepositorySelection: false },
      { ...visible, repositoryIsSubmodule: true },
    ]) {
      assert.strictEqual(shouldPollAgentSessionDiffs(hidden), false)
    }
  })
})
