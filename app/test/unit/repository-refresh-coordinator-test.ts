import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  compareRepositoryRefreshSnapshots,
  createRepositoryRefreshIdentity,
  createRepositoryRefreshIdentityKey,
  createRepositoryRefreshSnapshot,
  IRepositoryRefreshIdentity,
  IRepositoryRefreshReason,
  IRepositoryRefreshSnapshot,
  isRepositoryRefreshIdentity,
  isRepositoryRefreshIdentityKey,
  isRepositoryRefreshSnapshot,
  RepositoryRefreshCanonicalPathMaximumLength,
  RepositoryRefreshCoordinator,
  RepositoryRefreshDebounceMaximumMilliseconds,
  RepositoryRefreshFingerprintMaximumLength,
  RepositoryRefreshIdentityKeyMaximumLength,
  RepositoryRefreshMaximumReasonsPerRepositoryLimit,
  RepositoryRefreshMaximumRepositoriesLimit,
  RepositoryRefreshRepositoryIdMaximumLength,
} from '../../src/lib/integrated-terminal/repository-refresh-coordinator'

interface IScheduledTask {
  readonly id: number
  readonly callback: () => void
  readonly dueAt: number
}

class FakeScheduler {
  private nextId = 1
  private readonly tasks = new Map<number, IScheduledTask>()
  private readonly taskHistory = new Map<number, IScheduledTask>()

  public now = 0
  public readonly cleared = new Array<number>()

  public setTimeout = (callback: () => void, delay: number): number => {
    const id = this.nextId++
    const task = {
      id,
      callback,
      dueAt: this.now + delay,
    }
    this.tasks.set(id, task)
    this.taskHistory.set(id, task)
    return id
  }

  public clearTimeout = (id: number): void => {
    if (this.tasks.delete(id)) {
      this.cleared.push(id)
    }
  }

  public get pendingCount(): number {
    return this.tasks.size
  }

  public get latestId(): number {
    return this.nextId - 1
  }

  /** Exercise the real-world race where a cleared callback was already queued. */
  public invokeEvenIfCleared(id: number): void {
    const task = this.taskHistory.get(id)
    assert.ok(task, `Unknown scheduled task ${id}.`)
    task.callback()
  }

  /** Run one earliest active task without draining work it schedules. */
  public runNext(): boolean {
    const next = [...this.tasks.values()].sort(
      (left, right) => left.dueAt - right.dueAt || left.id - right.id
    )[0]
    if (next === undefined) {
      return false
    }
    this.now = Math.max(this.now, next.dueAt)
    this.tasks.delete(next.id)
    next.callback()
    return true
  }

  public advanceBy(milliseconds: number): void {
    this.advanceTo(this.now + milliseconds)
  }

  public advanceTo(target: number): void {
    assert.ok(target >= this.now)
    while (true) {
      const next = [...this.tasks.values()]
        .filter(task => task.dueAt <= target)
        .sort(
          (left, right) => left.dueAt - right.dueAt || left.id - right.id
        )[0]
      if (next === undefined) {
        break
      }
      this.now = next.dueAt
      this.tasks.delete(next.id)
      next.callback()
    }
    this.now = target
  }
}

interface IDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
  readonly reject: (reason?: unknown) => void
}

function deferred<T>(): IDeferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

const defaultRepositoryInput = {
  repositoryId: 'repository-1',
  canonicalRepositoryPath: 'C:\\work\\repository-1',
} as const

function repository(
  repositoryId: string = defaultRepositoryInput.repositoryId,
  canonicalRepositoryPath: string = defaultRepositoryInput.canonicalRepositoryPath
): IRepositoryRefreshIdentity {
  return createRepositoryRefreshIdentity({
    repositoryId,
    canonicalRepositoryPath,
  })
}

const defaultOID = 'a'.repeat(40)

function snapshot(
  identity: IRepositoryRefreshIdentity = repository(),
  overrides: Partial<
    Pick<
      IRepositoryRefreshSnapshot,
      'head' | 'indexFingerprint' | 'worktreeFingerprint' | 'refsFingerprint'
    >
  > = {}
): IRepositoryRefreshSnapshot {
  return createRepositoryRefreshSnapshot({
    repository: identity,
    head: { kind: 'commit', oid: defaultOID },
    indexFingerprint: 'index:one',
    worktreeFingerprint: 'worktree:one',
    refsFingerprint: 'refs:one',
    ...overrides,
  })
}

interface IRefreshCall {
  readonly repository: IRepositoryRefreshIdentity
  readonly reasons: ReadonlyArray<IRepositoryRefreshReason>
  readonly completion: IDeferred<void>
}

interface IHarnessOptions {
  readonly debounceMilliseconds?: number
  readonly maximumRepositories?: number
  readonly maximumReasonsPerRepository?: number
}

class CoordinatorHarness {
  public readonly scheduler = new FakeScheduler()
  public readonly calls = new Array<IRefreshCall>()
  public readonly coordinator: RepositoryRefreshCoordinator

  public constructor(options: IHarnessOptions = {}) {
    this.coordinator = new RepositoryRefreshCoordinator({
      scheduler: this.scheduler,
      clock: () => this.scheduler.now,
      debounceMilliseconds: options.debounceMilliseconds ?? 10,
      maximumRepositories: options.maximumRepositories ?? 4,
      maximumReasonsPerRepository: options.maximumReasonsPerRepository ?? 8,
      refresh: (identity, reasons) => {
        const completion = deferred<void>()
        this.calls.push({
          repository: identity,
          reasons: reasons.map(reason => ({ ...reason })),
          completion,
        })
        return completion.promise
      },
    })
  }

  public async runDebounce(): Promise<void> {
    this.scheduler.advanceBy(10)
    await flushPromises()
  }
}

const watcherSignal = (
  identity: IRepositoryRefreshIdentity,
  dimensions: ReadonlyArray<'head' | 'index' | 'worktree' | 'refs' | 'unknown'>
) => ({
  type: 'watcher-invalidated' as const,
  repository: identity,
  dimensions,
})

const cliSignal = (
  identity: IRepositoryRefreshIdentity,
  dimensions: ReadonlyArray<'head' | 'index' | 'worktree' | 'refs' | 'unknown'>
) => ({
  type: 'cli-workbench-completed' as const,
  repository: identity,
  dimensions,
})

describe('Repository refresh identity and snapshots', () => {
  it('strictly validates and collision-safely keys complete identities', () => {
    const identity = repository()
    const key = createRepositoryRefreshIdentityKey(identity)

    assert.deepEqual(identity, defaultRepositoryInput)
    assert.equal(Object.isFrozen(identity), true)
    assert.equal(isRepositoryRefreshIdentity(identity), true)
    assert.equal(isRepositoryRefreshIdentityKey(key), true)
    assert.equal(
      createRepositoryRefreshIdentityKey(repository('a|b', 'C:\\work\\c')) ===
        createRepositoryRefreshIdentityKey(repository('a', 'C:\\work\\b|c')),
      false
    )

    const invalid = [
      null,
      {},
      { ...defaultRepositoryInput, extra: true },
      { ...defaultRepositoryInput, repositoryId: '' },
      { ...defaultRepositoryInput, repositoryId: 'bad\nrepository' },
      {
        ...defaultRepositoryInput,
        repositoryId: 'x'.repeat(
          RepositoryRefreshRepositoryIdMaximumLength + 1
        ),
      },
      { ...defaultRepositoryInput, canonicalRepositoryPath: '' },
      { ...defaultRepositoryInput, canonicalRepositoryPath: 'C:\\bad\0path' },
      {
        ...defaultRepositoryInput,
        canonicalRepositoryPath: 'x'.repeat(
          RepositoryRefreshCanonicalPathMaximumLength + 1
        ),
      },
      {
        ...defaultRepositoryInput,
        repositoryId: String.fromCharCode(0xd800),
      },
      {
        ...defaultRepositoryInput,
        repositoryId: String.fromCharCode(0xdc00),
      },
      {
        ...defaultRepositoryInput,
        canonicalRepositoryPath: String.fromCharCode(0xd800),
      },
      {
        ...defaultRepositoryInput,
        canonicalRepositoryPath: String.fromCharCode(0xdc00),
      },
    ]
    for (const candidate of invalid) {
      assert.equal(isRepositoryRefreshIdentity(candidate), false)
      assert.throws(() => createRepositoryRefreshIdentity(candidate))
    }
    assert.equal(isRepositoryRefreshIdentityKey(` ${key}`), false)
    assert.equal(isRepositoryRefreshIdentityKey('not-json'), false)

    const escapeHeavy = (length: number) =>
      Array.from({ length }, (_, index) => (index % 2 === 0 ? '\\' : '"')).join(
        ''
      )
    const maximumIdentity = repository(
      escapeHeavy(RepositoryRefreshRepositoryIdMaximumLength),
      `C:${escapeHeavy(RepositoryRefreshCanonicalPathMaximumLength - 2)}`
    )
    const maximumKey = createRepositoryRefreshIdentityKey(maximumIdentity)
    assert.ok(maximumKey.length <= RepositoryRefreshIdentityKeyMaximumLength)
    assert.equal(
      isRepositoryRefreshIdentityKey(maximumKey),
      true,
      'every key emitted for a valid escape-heavy identity must validate'
    )
    const pairedUnicodeIdentity = repository(
      '😀'.repeat(RepositoryRefreshRepositoryIdMaximumLength / 2),
      '😀'.repeat(RepositoryRefreshCanonicalPathMaximumLength / 2)
    )
    assert.equal(
      isRepositoryRefreshIdentityKey(
        createRepositoryRefreshIdentityKey(pairedUnicodeIdentity)
      ),
      true,
      'valid paired Unicode at both bounds must round-trip through the key'
    )
  })

  it('copies and deeply freezes strict snapshots with bounded Git facts', () => {
    const mutable = {
      repository: {
        repositoryId: String(defaultRepositoryInput.repositoryId),
        canonicalRepositoryPath: String(
          defaultRepositoryInput.canonicalRepositoryPath
        ),
      },
      head: { kind: 'commit', oid: defaultOID },
      indexFingerprint: 'index:one',
      worktreeFingerprint: 'worktree:one',
      refsFingerprint: 'refs:one',
    }
    const created = createRepositoryRefreshSnapshot(mutable)
    mutable.repository.repositoryId = 'mutated'
    mutable.head.oid = 'b'.repeat(40)

    assert.equal(created.repository.repositoryId, 'repository-1')
    assert.deepEqual(created.head, { kind: 'commit', oid: defaultOID })
    assert.equal(Object.isFrozen(created), true)
    assert.equal(Object.isFrozen(created.repository), true)
    assert.equal(Object.isFrozen(created.head), true)
    assert.equal(isRepositoryRefreshSnapshot(created), true)
    assert.equal(
      isRepositoryRefreshSnapshot(
        createRepositoryRefreshSnapshot({
          ...created,
          head: { kind: 'unborn' },
        })
      ),
      true
    )

    const invalid = [
      { ...created, extra: true },
      { ...created, repository: { ...created.repository, extra: true } },
      { ...created, head: { kind: 'commit', oid: 'a'.repeat(39) } },
      { ...created, head: { kind: 'commit', oid: 'g'.repeat(40) } },
      { ...created, head: { kind: 'unborn', oid: defaultOID } },
      { ...created, indexFingerprint: '' },
      { ...created, worktreeFingerprint: 'bad\nvalue' },
      {
        ...created,
        refsFingerprint: 'x'.repeat(
          RepositoryRefreshFingerprintMaximumLength + 1
        ),
      },
    ]
    for (const candidate of invalid) {
      assert.equal(isRepositoryRefreshSnapshot(candidate), false)
      assert.throws(() => createRepositoryRefreshSnapshot(candidate))
    }
  })

  it('compares every snapshot dimension in one stable order', () => {
    const base = snapshot()
    const variants = [
      {
        dimension: 'head',
        value: snapshot(repository(), { head: { kind: 'unborn' } }),
      },
      {
        dimension: 'index',
        value: snapshot(repository(), { indexFingerprint: 'index:two' }),
      },
      {
        dimension: 'worktree',
        value: snapshot(repository(), {
          worktreeFingerprint: 'worktree:two',
        }),
      },
      {
        dimension: 'refs',
        value: snapshot(repository(), { refsFingerprint: 'refs:two' }),
      },
    ] as const

    assert.deepEqual(compareRepositoryRefreshSnapshots(base, snapshot()), {
      equal: true,
      changed: false,
      headChanged: false,
      indexChanged: false,
      worktreeChanged: false,
      refsChanged: false,
      changedDimensions: [],
    })
    for (const variant of variants) {
      const comparison = compareRepositoryRefreshSnapshots(base, variant.value)
      assert.equal(comparison.equal, false)
      assert.deepEqual(comparison.changedDimensions, [variant.dimension])
    }

    assert.deepEqual(
      compareRepositoryRefreshSnapshots(
        base,
        snapshot(repository(), {
          head: { kind: 'commit', oid: 'b'.repeat(64) },
          indexFingerprint: 'index:two',
          worktreeFingerprint: 'worktree:two',
          refsFingerprint: 'refs:two',
        })
      ),
      {
        equal: false,
        changed: true,
        headChanged: true,
        indexChanged: true,
        worktreeChanged: true,
        refsChanged: true,
        changedDimensions: ['head', 'index', 'worktree', 'refs'],
      }
    )
    assert.throws(() =>
      compareRepositoryRefreshSnapshots(
        base,
        snapshot(repository('other', 'C:\\work\\other'))
      )
    )
  })
})

describe('Repository refresh signals', () => {
  it('rejects hostile or text-shaped input instead of parsing command output', () => {
    const identity = repository()
    const before = snapshot(identity)
    const after = snapshot(identity, { indexFingerprint: 'index:two' })
    const other = snapshot(repository('repository-2', 'C:\\work\\repository-2'))
    const harness = new CoordinatorHarness()
    const invalid = [
      null,
      'git status --porcelain',
      { type: 'watcher-invalidated', repository: identity, dimensions: [] },
      {
        type: 'watcher-invalidated',
        repository: identity,
        dimensions: ['git status --porcelain'],
      },
      {
        type: 'cli-workbench-completed',
        repository: identity,
        dimensions: ['head'],
        output: 'HEAD changed',
      },
      { type: 'terminal-completed', before, after: other },
      { type: 'terminal-completed', before, after, reason: 'refresh it' },
    ]

    for (const candidate of invalid) {
      assert.throws(() => harness.coordinator.signal(candidate))
    }
    assert.equal(harness.scheduler.pendingCount, 0)
    assert.equal(harness.calls.length, 0)
  })

  it('ignores an unchanged terminal snapshot but honors explicit invalidation', async () => {
    const identity = repository()
    const before = snapshot(identity)
    const unchangedClone = createRepositoryRefreshSnapshot({
      repository: { ...identity },
      head: { kind: 'commit', oid: defaultOID },
      indexFingerprint: 'index:one',
      worktreeFingerprint: 'worktree:one',
      refsFingerprint: 'refs:one',
    })
    const harness = new CoordinatorHarness()

    assert.equal(
      harness.coordinator.signal({
        type: 'terminal-completed',
        before,
        after: unchangedClone,
      }),
      'ignored-unchanged'
    )
    assert.equal(harness.scheduler.pendingCount, 0)

    assert.equal(
      harness.coordinator.signal(watcherSignal(identity, ['unknown'])),
      'scheduled'
    )
    await harness.runDebounce()
    assert.equal(harness.calls.length, 1)
    assert.deepEqual(harness.calls[0].reasons, [
      { source: 'watcher-invalidated', dimension: 'unknown' },
    ])
  })

  it('turns terminal snapshot differences into ordered structured reasons', async () => {
    const identity = repository()
    const harness = new CoordinatorHarness()
    const before = snapshot(identity)
    const after = snapshot(identity, {
      head: { kind: 'unborn' },
      indexFingerprint: 'index:two',
      refsFingerprint: 'refs:two',
    })

    assert.equal(
      harness.coordinator.signal({
        type: 'terminal-completed',
        before,
        after,
      }),
      'scheduled'
    )
    await harness.runDebounce()
    assert.deepEqual(harness.calls[0].reasons, [
      { source: 'terminal-completed', dimension: 'head' },
      { source: 'terminal-completed', dimension: 'index' },
      { source: 'terminal-completed', dimension: 'refs' },
    ])
  })
})

describe('Repository refresh scheduling', () => {
  it('validates bounds and snapshots injected options against later mutation', async () => {
    const identity = repository()
    const scheduler = new FakeScheduler()
    const calls = new Array<ReadonlyArray<IRepositoryRefreshReason>>()
    const mutableOptions = {
      scheduler,
      clock: () => scheduler.now,
      refresh: async (
        _repository: IRepositoryRefreshIdentity,
        reasons: ReadonlyArray<IRepositoryRefreshReason>
      ) => {
        calls.push(reasons)
      },
      debounceMilliseconds: 5,
      maximumRepositories: 2,
      maximumReasonsPerRepository: 3,
    }
    const coordinator = new RepositoryRefreshCoordinator(mutableOptions)

    mutableOptions.debounceMilliseconds = 999
    mutableOptions.maximumRepositories = 1
    mutableOptions.maximumReasonsPerRepository = 1
    mutableOptions.clock = () => {
      throw new Error('mutated clock must not be observed')
    }
    mutableOptions.refresh = async () => {
      throw new Error('mutated refresh must not be observed')
    }
    mutableOptions.scheduler.setTimeout = () => {
      throw new Error('mutated scheduler must not be observed')
    }

    assert.equal(
      coordinator.signal(watcherSignal(identity, ['head', 'index'])),
      'scheduled'
    )
    scheduler.advanceBy(5)
    await flushPromises()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].length, 2)

    const valid = {
      scheduler: new FakeScheduler(),
      clock: () => 0,
      refresh: async () => undefined,
      debounceMilliseconds: 1,
      maximumRepositories: 1,
      maximumReasonsPerRepository: 1,
    }
    for (const invalid of [
      { ...valid, debounceMilliseconds: -1 },
      {
        ...valid,
        debounceMilliseconds: RepositoryRefreshDebounceMaximumMilliseconds + 1,
      },
      { ...valid, maximumRepositories: 0 },
      {
        ...valid,
        maximumRepositories: RepositoryRefreshMaximumRepositoriesLimit + 1,
      },
      { ...valid, maximumReasonsPerRepository: 0 },
      {
        ...valid,
        maximumReasonsPerRepository:
          RepositoryRefreshMaximumReasonsPerRepositoryLimit + 1,
      },
      { ...valid, debounceMilliseconds: 1.5 },
    ]) {
      assert.throws(() => new RepositoryRefreshCoordinator(invalid))
    }
  })

  it('does not lose a timer callback that runs before setTimeout returns', async () => {
    const identity = repository()
    const completion = deferred<void>()
    let refreshes = 0
    const coordinator = new RepositoryRefreshCoordinator({
      scheduler: {
        setTimeout: callback => {
          callback()
          return 1
        },
        clearTimeout: () => undefined,
      },
      clock: () => 0,
      refresh: () => {
        refreshes++
        return completion.promise
      },
      debounceMilliseconds: 1,
      maximumRepositories: 1,
      maximumReasonsPerRepository: 1,
    })

    assert.equal(
      coordinator.signal(watcherSignal(identity, ['head'])),
      'scheduled'
    )
    assert.equal(refreshes, 1)
    assert.equal(coordinator.getState(identity).scheduled, false)
    assert.equal(coordinator.getState(identity).inFlight, true)
    completion.resolve(undefined)
    await flushPromises()
    assert.equal(coordinator.getState(identity).lastOutcome, 'succeeded')
  })

  it('debounces, dedupes, caps reasons, and fences a cleared callback', async () => {
    const identity = repository()
    const harness = new CoordinatorHarness({
      maximumReasonsPerRepository: 3,
    })

    assert.equal(
      harness.coordinator.signal(watcherSignal(identity, ['head', 'index'])),
      'scheduled'
    )
    const clearedTimer = harness.scheduler.latestId
    harness.scheduler.advanceBy(5)
    assert.equal(
      harness.coordinator.signal(watcherSignal(identity, ['head'])),
      'coalesced'
    )
    harness.scheduler.advanceBy(5)
    assert.equal(
      harness.coordinator.signal(cliSignal(identity, ['worktree', 'refs'])),
      'coalesced'
    )

    const pending = harness.coordinator.getState(identity)
    assert.ok(pending)
    assert.equal(pending.pending, true)
    assert.equal(pending.retainedReasonCount, 3)
    assert.equal(pending.reasonsTruncated, true)
    assert.ok(pending.droppedReasonCount >= 1)
    assert.equal(harness.scheduler.pendingCount, 1)

    harness.scheduler.invokeEvenIfCleared(clearedTimer)
    await flushPromises()
    assert.equal(harness.calls.length, 0)

    await harness.runDebounce()
    assert.equal(harness.calls.length, 1)
    assert.deepEqual(harness.calls[0].reasons, [
      { source: 'watcher-invalidated', dimension: 'head' },
      { source: 'watcher-invalidated', dimension: 'index' },
      { source: 'cli-workbench-completed', dimension: 'worktree' },
    ])
    harness.calls[0].completion.resolve(undefined)
    await flushPromises()
  })

  it('keeps repository lanes independent and truthfully enforces capacity', async () => {
    const first = repository('first', 'C:\\work\\first')
    const second = repository('second', 'C:\\work\\second')
    const overCapacity = repository('third', 'C:\\work\\third')
    const harness = new CoordinatorHarness({ maximumRepositories: 2 })

    assert.equal(
      harness.coordinator.signal(watcherSignal(first, ['head'])),
      'scheduled'
    )
    harness.scheduler.advanceBy(5)
    assert.equal(
      harness.coordinator.signal(watcherSignal(second, ['index'])),
      'scheduled'
    )
    assert.equal(
      harness.coordinator.signal(watcherSignal(overCapacity, ['refs'])),
      'ignored-capacity'
    )
    assert.equal(harness.coordinator.getState(overCapacity).tracked, false)

    harness.scheduler.advanceBy(5)
    await flushPromises()
    assert.deepEqual(
      harness.calls.map(call => call.repository.repositoryId),
      ['first']
    )
    harness.scheduler.advanceBy(5)
    await flushPromises()
    assert.deepEqual(
      harness.calls.map(call => call.repository.repositoryId),
      ['first', 'second']
    )
    assert.equal(harness.coordinator.getState(first).inFlight, true)
    assert.equal(harness.coordinator.getState(second).inFlight, true)
    harness.calls[0].completion.resolve(undefined)
    harness.calls[1].completion.resolve(undefined)
    await flushPromises()
  })

  it('allows one in-flight refresh and exactly one combined trailing refresh', async () => {
    const identity = repository()
    const harness = new CoordinatorHarness()

    harness.coordinator.signal(watcherSignal(identity, ['head']))
    await harness.runDebounce()
    assert.equal(harness.calls.length, 1)
    assert.equal(harness.coordinator.getState(identity)?.inFlight, true)

    assert.equal(
      harness.coordinator.signal(watcherSignal(identity, ['index'])),
      'coalesced'
    )
    assert.equal(
      harness.coordinator.signal(cliSignal(identity, ['worktree'])),
      'coalesced'
    )
    assert.equal(
      harness.coordinator.signal(watcherSignal(identity, ['refs'])),
      'coalesced'
    )
    assert.equal(harness.scheduler.pendingCount, 0)
    assert.equal(harness.coordinator.getState(identity)?.trailing, true)
    assert.equal(harness.calls.length, 1)

    harness.calls[0].completion.resolve(undefined)
    await flushPromises()
    harness.scheduler.advanceBy(0)
    await flushPromises()
    assert.equal(harness.calls.length, 2)
    assert.deepEqual(harness.calls[1].reasons, [
      { source: 'watcher-invalidated', dimension: 'index' },
      { source: 'cli-workbench-completed', dimension: 'worktree' },
      { source: 'watcher-invalidated', dimension: 'refs' },
    ])

    harness.calls[1].completion.resolve(undefined)
    await flushPromises()
    assert.deepEqual(harness.coordinator.getState(identity), {
      disposed: false,
      tracked: true,
      pending: false,
      scheduled: false,
      inFlight: false,
      trailing: false,
      pendingReasonCount: 0,
      inFlightReasonCount: 0,
      retainedReasonCount: 0,
      pendingDroppedReasonCount: 0,
      inFlightDroppedReasonCount: 0,
      droppedReasonCount: 0,
      reasonsTruncated: false,
      lastOutcome: 'succeeded',
      lastFailure: null,
    })
  })

  it('sanitizes failure state and retries without leaking the failed batch', async () => {
    const identity = repository()
    const harness = new CoordinatorHarness()
    harness.coordinator.signal(watcherSignal(identity, ['head']))
    await harness.runDebounce()

    harness.scheduler.now = 50
    harness.calls[0].completion.reject(
      new Error('secret-provider-token must never reach state')
    )
    await flushPromises()
    const failed = harness.coordinator.getState(identity)
    assert.ok(failed)
    assert.deepEqual(failed.lastFailure, {
      kind: 'refresh-callback-failed',
      at: 50,
    })
    assert.equal(
      JSON.stringify(failed).includes('secret-provider-token'),
      false
    )
    assert.equal(failed.inFlight, false)

    assert.equal(
      harness.coordinator.signal(cliSignal(identity, ['refs'])),
      'scheduled'
    )
    await harness.runDebounce()
    assert.equal(harness.calls.length, 2)
    assert.deepEqual(harness.calls[1].reasons, [
      { source: 'cli-workbench-completed', dimension: 'refs' },
    ])
    harness.calls[1].completion.resolve(undefined)
    await flushPromises()
    assert.equal(harness.coordinator.getState(identity)?.lastFailure, null)
  })

  it('runs combined trailing demand even when the in-flight refresh fails', async () => {
    const identity = repository()
    const harness = new CoordinatorHarness()
    harness.coordinator.signal(watcherSignal(identity, ['head']))
    await harness.runDebounce()
    harness.coordinator.signal(watcherSignal(identity, ['index']))
    harness.coordinator.signal(cliSignal(identity, ['worktree']))

    harness.calls[0].completion.reject(new Error('first refresh failed'))
    await flushPromises()
    harness.scheduler.advanceBy(0)
    await flushPromises()
    assert.equal(harness.calls.length, 2)
    assert.deepEqual(harness.calls[1].reasons, [
      { source: 'watcher-invalidated', dimension: 'index' },
      { source: 'cli-workbench-completed', dimension: 'worktree' },
    ])
    harness.calls[1].completion.resolve(undefined)
    await flushPromises()
  })

  it('contains synchronous refresh throws and permits a clean retry', async () => {
    const identity = repository()
    const scheduler = new FakeScheduler()
    let attempts = 0
    const coordinator = new RepositoryRefreshCoordinator({
      scheduler,
      clock: () => scheduler.now,
      debounceMilliseconds: 5,
      maximumRepositories: 1,
      maximumReasonsPerRepository: 2,
      refresh: () => {
        attempts++
        if (attempts === 1) {
          throw new Error('synchronous failure')
        }
        return Promise.resolve()
      },
    })

    coordinator.signal(watcherSignal(identity, ['head']))
    assert.doesNotThrow(() => scheduler.advanceBy(5))
    await flushPromises()
    assert.equal(
      coordinator.getState(identity).lastFailure?.kind,
      'refresh-callback-failed'
    )

    coordinator.signal(watcherSignal(identity, ['index']))
    scheduler.advanceBy(5)
    await flushPromises()
    assert.equal(attempts, 2)
    assert.equal(coordinator.getState(identity).lastFailure, null)
  })

  it('defers trailing work when refresh synchronously signals and throws', async () => {
    const identity = repository()
    const scheduler = new FakeScheduler()
    let attempts = 0
    const holder: { coordinator?: RepositoryRefreshCoordinator } = {}
    const coordinator = new RepositoryRefreshCoordinator({
      scheduler,
      clock: () => scheduler.now,
      debounceMilliseconds: 5,
      maximumRepositories: 1,
      maximumReasonsPerRepository: 4,
      refresh: () => {
        attempts++
        if (attempts === 1) {
          assert.ok(holder.coordinator)
          assert.equal(
            holder.coordinator.signal(cliSignal(identity, ['index'])),
            'coalesced'
          )
          throw new Error('synchronous failure after new demand')
        }
        return Promise.resolve()
      },
    })
    holder.coordinator = coordinator

    coordinator.signal(watcherSignal(identity, ['head']))
    assert.equal(scheduler.runNext(), true)
    assert.equal(attempts, 1)
    assert.equal(scheduler.pendingCount, 1)
    assert.equal(coordinator.getState(identity).trailing, true)

    scheduler.advanceBy(0)
    await flushPromises()
    assert.equal(attempts, 2)
    assert.equal(coordinator.getState(identity).lastOutcome, 'succeeded')
  })

  it('marks a failure timestamp unavailable when the diagnostic clock fails', async () => {
    const identity = repository()
    const scheduler = new FakeScheduler()
    const completion = deferred<void>()
    const coordinator = new RepositoryRefreshCoordinator({
      scheduler,
      clock: () => {
        throw new Error('clock unavailable')
      },
      refresh: () => completion.promise,
      debounceMilliseconds: 5,
      maximumRepositories: 1,
      maximumReasonsPerRepository: 2,
    })
    assert.equal(
      coordinator.signal(watcherSignal(identity, ['head'])),
      'scheduled',
      'a diagnostic-only clock cannot block scheduling'
    )
    scheduler.advanceBy(5)
    completion.reject(new Error('refresh failed'))
    await flushPromises()

    assert.deepEqual(coordinator.getState(identity).lastFailure, {
      kind: 'refresh-callback-failed',
      at: null,
    })
  })

  it('cancels pending and trailing work and absorbs a late rejection on dispose', async () => {
    const pendingIdentity = repository('pending', 'C:\\work\\pending')
    const pending = new CoordinatorHarness()
    pending.coordinator.signal(watcherSignal(pendingIdentity, ['head']))
    const pendingTimer = pending.scheduler.latestId
    pending.coordinator.dispose()

    assert.ok(pending.scheduler.cleared.includes(pendingTimer))
    pending.scheduler.invokeEvenIfCleared(pendingTimer)
    pending.scheduler.advanceBy(100)
    await flushPromises()
    assert.equal(pending.calls.length, 0)
    assert.equal(
      pending.coordinator.signal(watcherSignal(pendingIdentity, ['index'])),
      'ignored-disposed'
    )

    const activeIdentity = repository('active', 'C:\\work\\active')
    const active = new CoordinatorHarness()
    const unhandled = new Array<unknown>()
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      active.coordinator.signal(watcherSignal(activeIdentity, ['head']))
      await active.runDebounce()
      active.coordinator.signal(watcherSignal(activeIdentity, ['index']))
      assert.equal(active.coordinator.getState(activeIdentity)?.trailing, true)
      active.coordinator.dispose()
      active.calls[0].completion.reject(new Error('late rejection'))
      await flushPromises()
      await new Promise<void>(resolve => setImmediate(resolve))

      assert.equal(active.calls.length, 1)
      assert.deepEqual(unhandled, [])
      assert.equal(
        active.coordinator.signal(watcherSignal(activeIdentity, ['refs'])),
        'ignored-disposed'
      )
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
