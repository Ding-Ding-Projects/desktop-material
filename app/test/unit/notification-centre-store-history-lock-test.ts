import './profile-history-test-env'
import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { createTempDirectory } from '../helpers/temp'
import { NotificationCentreStore } from '../../src/lib/stores/notification-centre-store'
import {
  ProfileCommitQueue,
  withProfileRepositoryLock,
} from '../../src/lib/profiles/profile-git'
import { Repository } from '../../src/models/repository'
import { git } from '../../src/lib/git/core'

interface INotificationStoreHarness {
  initialization: Promise<void> | null
  repository: Repository | null
  queue: ProfileCommitQueue | null
  initializeAt: (dir: string) => Promise<void>
}

interface IQueueHarness {
  readonly enqueueFlush?: (flush: () => Promise<void>) => Promise<void>
}

const createInitializedStore = async (t: TestContext) => {
  const directory = await createTempDirectory(t)
  const store = new NotificationCentreStore()
  const harness = store as unknown as INotificationStoreHarness
  harness.initialization = harness.initializeAt(directory)
  await store.initialize()
  return { store, harness, directory }
}

const head = async (repository: Repository): Promise<string> =>
  (
    await git(['rev-parse', 'HEAD'], repository.path, 'historyLockTestHead')
  ).stdout.trim()

/** Yield the event loop so already-queued microtasks and timers have run. */
const settle = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

describe('NotificationCentreStore history serialization', () => {
  it('holds the repository lease across the drain and the mutation', async t => {
    const { store, harness } = await createInitializedStore(t)
    const repository = harness.repository
    if (repository === null) {
      assert.fail('NotificationCentreStore repository was not initialized')
    }

    await store.post({ kind: 'info', title: 'Keep me', body: 'first' })
    await store.flush()
    const target = (await store.getHistory()).entries[0].sha

    await store.post({ kind: 'info', title: 'Drop me', body: 'second' })
    await store.flush()
    const before = await head(repository)

    // Leave a commit pending in the queue, so the mutation has to drain it and
    // a debounced flush is genuinely outstanding while the restore runs.
    await store.post({ kind: 'info', title: 'Mid restore', body: 'third' })

    const restore = store.restoreTo(target)
    // Every step before the lease acquisition is a microtask, so yielding the
    // event loop is enough for the mutation to have taken it.
    await settle()

    // A second writer is granted the lease only once the mutation has released
    // it, so this reads the repository the whole mutation left behind.
    const observed = await withProfileRepositoryLock(repository, () =>
      head(repository)
    )
    await restore

    assert.notEqual(
      observed,
      before,
      'the lease was granted while the mutation was still running'
    )
    assert.equal(observed, await head(repository))

    // The queued notification was committed before the restore rather than on
    // top of its half-restored tree, and the audit commit still reserves the
    // parent it sampled.
    const restored = await store.getHistory()
    assert.equal(restored.entries[0].restoreOf, target)
    assert.match(restored.entries[1].summary, /Add notification: Mid restore/)
    assert.deepEqual(
      store.getState().entries.map(value => value.title),
      ['Keep me']
    )
  })

  it('routes the debounced commit through the same lease', async t => {
    const { store, harness } = await createInitializedStore(t)
    const repository = harness.repository
    const queue = harness.queue
    if (repository === null || queue === null) {
      assert.fail('NotificationCentreStore repository was not initialized')
    }

    const enqueueFlush = (queue as unknown as IQueueHarness).enqueueFlush
    assert.ok(
      enqueueFlush !== undefined,
      'the debounce timer must enqueue its commit instead of committing directly'
    )

    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    const holder = withProfileRepositoryLock(repository, () => held)

    let committed = false
    const flushed = enqueueFlush(async () => {
      committed = true
    })
    await settle()

    assert.equal(
      committed,
      false,
      'the debounced commit ran while another writer held the lease'
    )

    release()
    await holder
    await flushed
    assert.equal(committed, true)
    await store.flush()
  })
})
