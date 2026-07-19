import './profile-history-test-env'
import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { chmod, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createTempDirectory } from '../helpers/temp'
import {
  LogFileName,
  LogStore,
  MaxLogFileLines,
} from '../../src/lib/stores/log-store'
import { ProfileCommitQueue } from '../../src/lib/profiles/profile-git'
import {
  forwardToLogSink,
  registerLogSink,
} from '../../src/lib/logging/renderer/log-sink'
import { Repository } from '../../src/models/repository'

interface ILogStoreHarness {
  enabled: boolean
  lines: ReadonlyArray<string>
  initialization: Promise<void> | null
  repository: Repository | null
  queue: ProfileCommitQueue | null
  commitHistory: (operation: () => Promise<void>) => Promise<void>
  initialize: () => Promise<void>
  initializeAt: (dir: string) => Promise<void>
  persist: (appendedLines: ReadonlyArray<string> | null) => Promise<void>
}

const createHarness = (lines: ReadonlyArray<string>) => {
  const store = new LogStore()
  const harness = store as unknown as ILogStoreHarness
  const persisted = new Array<ReadonlyArray<string> | null>()

  harness.enabled = true
  harness.lines = lines
  harness.initialize = async () => {}
  harness.persist = async appendedLines => {
    persisted.push(appendedLines)
  }

  return { store, harness, persisted }
}

const createInitializedStore = async (t: TestContext) => {
  const directory = await createTempDirectory(t)
  const store = new LogStore()
  const harness = store as unknown as ILogStoreHarness
  harness.initialization = harness.initializeAt(directory)
  await store.initialize()
  return { store, directory }
}

describe('LogStore append', () => {
  it('formats entries as [timestamp] [level] message and appends in place', async () => {
    const { store, harness, persisted } = createHarness([])

    await store.append('info', 'Hello logs')

    assert.equal(harness.lines.length, 1)
    assert.match(
      harness.lines[0],
      /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[info\] Hello logs$/
    )
    assert.deepEqual(persisted, [[harness.lines[0]]])
  })

  it('splits multi-line messages and trims the oldest lines at the cap', async () => {
    const seeded = Array.from(
      { length: MaxLogFileLines },
      (_, i) => `line ${i}`
    )
    const { store, harness, persisted } = createHarness(seeded)

    await store.append('error', 'Boom\n    at stack frame')

    assert.equal(harness.lines.length, MaxLogFileLines)
    assert.equal(harness.lines[0], 'line 2')
    assert.match(harness.lines.at(-2) ?? '', /\[error\] Boom$/)
    assert.equal(harness.lines.at(-1), '    at stack frame')
    // Trimming rewrites the whole file instead of appending a chunk.
    assert.deepEqual(persisted, [null])
  })
})

describe('LogStore history', () => {
  it('fails closed without mirroring or rescheduling persistent commit errors', async t => {
    const { store, directory } = await createInitializedStore(t)
    const harness = store as unknown as ILogStoreHarness
    const repository = harness.repository
    if (repository === null) {
      assert.fail('LogStore repository was not initialized')
    }

    // Use a zero-delay queue wired through the same callback as production so
    // the timer-driven failure path is exercised without a timing-based wait.
    const queue = new ProfileCommitQueue(
      repository,
      () => 'Capture log activity',
      0,
      flush => harness.commitHistory(flush)
    )
    harness.queue = queue

    const queueHarness = queue as unknown as {
      readonly pending: ReadonlyArray<string>
      readonly timer: ReturnType<typeof setTimeout> | null
    }
    const hook = join(directory, '.git', 'hooks', 'pre-commit')
    await writeFile(hook, '#!/bin/sh\nexit 1\n', 'utf8')
    await chmod(hook, 0o755)

    const originalLogError = log.error
    const mirroredAppends = new Array<Promise<void>>()
    const loggedErrors = new Array<string>()
    let mirroredMessages = 0
    let reportFailure = () => {}
    const failureReported = new Promise<void>(resolve => {
      reportFailure = resolve
    })
    log.error = (message, error) => {
      loggedErrors.push(message)
      if (message === 'LogStore history commit failed; disabled') {
        reportFailure()
      }
      forwardToLogSink(
        'error',
        `[ui] ${message}${error === undefined ? '' : `: ${error.message}`}`
      )
    }
    registerLogSink((level, message) => {
      mirroredMessages++
      mirroredAppends.push(store.append(level, message))
    })
    t.after(() => {
      log.error = originalLogError
      registerLogSink(null)
    })

    await store.append('info', 'Trigger a persistently failing commit')
    await failureReported
    await Promise.all(mirroredAppends)

    assert.ok(
      loggedErrors.some(message =>
        message.includes('exited with an unexpected code')
      ),
      'Git should report the persistent commit failure'
    )
    assert.ok(
      loggedErrors.includes('LogStore history commit failed; disabled'),
      'LogStore should report that history was disabled'
    )
    assert.equal(
      loggedErrors.includes('Failed to commit profile changes'),
      false
    )
    assert.equal(mirroredMessages, 0)
    assert.equal(harness.enabled, false)
    assert.equal(harness.queue, null)
    assert.equal(queueHarness.timer, null)
    assert.equal(queueHarness.pending.length, 1)

    // Suppression is scoped to the failed commit. The renderer sink resumes,
    // while the disabled store refuses to schedule another history commit.
    forwardToLogSink('info', '[ui] Normal logging remains active')
    await Promise.all(mirroredAppends)
    assert.equal(mirroredMessages, 1)
    assert.equal(queueHarness.timer, null)
    assert.equal(queueHarness.pending.length, 1)
  })

  it('captures appended lines as commits and undoes the latest change', async t => {
    const { store, directory } = await createInitializedStore(t)

    await store.append('info', 'First entry')
    await store.flush()

    const first = await store.getHistory()
    assert.equal(first.total, 2)
    assert.equal(first.entries[0].summary, 'Capture log activity')
    assert.deepEqual(await store.getHistoryFiles(first.entries[0].sha), [
      LogFileName,
    ])
    assert.match(
      await store.getHistoryDiff(first.entries[0].sha),
      /First entry/
    )

    await store.append('warn', 'Second entry')
    await store.flush()
    await store.undoLastChange()

    const contents = await readFile(join(directory, LogFileName), 'utf8')
    assert.match(contents, /First entry/)
    assert.doesNotMatch(contents, /Second entry/)
    assert.equal(store.getLines().length, 1)
    assert.match(store.getLines()[0], /\[info\] First entry$/)

    const afterUndo = await store.getHistory()
    assert.ok(afterUndo.canRedo)

    await store.redoLastChange()
    assert.match(
      await readFile(join(directory, LogFileName), 'utf8'),
      /Second entry/
    )
  })

  it('restores the log file to a prior commit without rewriting history', async t => {
    const { store, directory } = await createInitializedStore(t)

    await store.append('info', 'Keep me')
    await store.flush()
    const page = await store.getHistory()
    const target = page.entries[0].sha

    await store.append('debug', 'Drop me')
    await store.flush()
    await store.restoreTo(target)

    const contents = await readFile(join(directory, LogFileName), 'utf8')
    assert.match(contents, /Keep me/)
    assert.doesNotMatch(contents, /Drop me/)

    const restored = await store.getHistory()
    assert.equal(restored.entries[0].restoreOf, target)
    assert.equal(restored.total, page.total + 2)
  })
})
