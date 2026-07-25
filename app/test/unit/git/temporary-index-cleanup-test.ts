import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  IIndexLockObservation,
  decideTemporaryIndexLockCleanup,
} from '../../../src/lib/large-repository/stale-index-lock'
import {
  ITemporaryIndexCleanupDependencies,
  isLockHeldError,
  removeTemporaryGitIndexDirectory,
} from '../../../src/lib/git/temporary-index-cleanup'

const directory = '/tmp/desktop-material-commit-batch-abc'

function lock(
  overrides: Partial<IIndexLockObservation> = {}
): IIndexLockObservation {
  return {
    exists: true,
    isRegularFile: true,
    isSymbolicLink: false,
    ageMs: 1_000,
    ownerActive: null,
    ...overrides,
  }
}

function busy(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${code}: resource busy`)
  error.code = code
  return error
}

interface IHarness {
  readonly dependencies: Partial<ITemporaryIndexCleanupDependencies>
  readonly removals: ReadonlyArray<string>
  readonly abandoned: ReadonlyArray<string>
  readonly waits: ReadonlyArray<number>
}

function harness(
  observations: ReadonlyArray<IIndexLockObservation>,
  removeDirectory: (path: string) => Promise<void> = async () => undefined
): IHarness {
  const removals = new Array<string>()
  const abandoned = new Array<string>()
  const waits = new Array<number>()
  let index = 0
  return {
    removals,
    abandoned,
    waits,
    dependencies: {
      observe: async () =>
        observations[Math.min(index++, observations.length - 1)],
      removeDirectory: async path => {
        removals.push(path)
        await removeDirectory(path)
      },
      delay: async milliseconds => {
        waits.push(milliseconds)
      },
      onAbandoned: (path, reason) => abandoned.push(`${path}: ${reason}`),
      waitBudgetMs: 1_000,
      pollIntervalMs: 100,
    },
  }
}

describe('decideTemporaryIndexLockCleanup', () => {
  it('removes the directory when no lock exists', () => {
    assert.strictEqual(
      decideTemporaryIndexLockCleanup(lock({ exists: false }), 0, 1_000),
      'remove-directory'
    )
  })

  it('removes the directory when the lock is provably unowned', () => {
    assert.strictEqual(
      decideTemporaryIndexLockCleanup(lock({ ownerActive: false }), 0, 1_000),
      'remove-directory'
    )
  })

  it('waits rather than unlinking a lock a live process owns', () => {
    assert.strictEqual(
      decideTemporaryIndexLockCleanup(lock({ ownerActive: true }), 0, 1_000),
      'wait'
    )
  })

  it('waits rather than unlinking a lock of indeterminate ownership', () => {
    // The reported EBUSY race: `git add -A` still held index.lock while the
    // cleanup pass unlinked it. Unknown ownership must never authorize a
    // delete.
    assert.strictEqual(
      decideTemporaryIndexLockCleanup(lock({ ownerActive: null }), 0, 1_000),
      'wait'
    )
  })

  it('never touches a symlink or non-regular lock', () => {
    assert.strictEqual(
      decideTemporaryIndexLockCleanup(
        lock({ isSymbolicLink: true, ownerActive: false }),
        0,
        1_000
      ),
      'abandon'
    )
    assert.strictEqual(
      decideTemporaryIndexLockCleanup(
        lock({ isRegularFile: false, ownerActive: false }),
        0,
        1_000
      ),
      'abandon'
    )
  })

  it('abandons instead of forcing once the wait budget is spent', () => {
    assert.strictEqual(
      decideTemporaryIndexLockCleanup(lock(), 1_000, 1_000),
      'abandon'
    )
  })
})

describe('isLockHeldError', () => {
  it('recognizes the OS proving a live owner', () => {
    for (const code of ['EBUSY', 'EPERM', 'EACCES']) {
      assert.strictEqual(isLockHeldError(busy(code)), true)
    }
  })

  it('does not treat unrelated failures as contention', () => {
    assert.strictEqual(isLockHeldError(busy('ENOENT')), false)
    assert.strictEqual(isLockHeldError(new Error('nope')), false)
    assert.strictEqual(isLockHeldError(undefined), false)
  })
})

describe('removeTemporaryGitIndexDirectory', () => {
  it('removes the directory immediately when the lock is gone', async () => {
    const test = harness([lock({ exists: false })])
    assert.strictEqual(
      await removeTemporaryGitIndexDirectory(directory, test.dependencies),
      'removed'
    )
    assert.deepStrictEqual(test.removals, [directory])
    assert.deepStrictEqual(test.waits, [])
    assert.deepStrictEqual(test.abandoned, [])
  })

  it('awaits release instead of unlinking a live lock', async () => {
    const test = harness([lock(), lock(), lock({ exists: false })])
    assert.strictEqual(
      await removeTemporaryGitIndexDirectory(directory, test.dependencies),
      'removed'
    )
    // Two polls while the lock was held, then exactly one removal.
    assert.deepStrictEqual(test.waits, [100, 100])
    assert.deepStrictEqual(test.removals, [directory])
  })

  it('treats EBUSY from the unlink as proof of a live owner and retries', async () => {
    let attempts = 0
    const test = harness([lock({ exists: false })], async () => {
      attempts++
      if (attempts === 1) {
        throw busy('EBUSY')
      }
    })
    assert.strictEqual(
      await removeTemporaryGitIndexDirectory(directory, test.dependencies),
      'removed'
    )
    assert.strictEqual(attempts, 2)
    assert.deepStrictEqual(test.waits, [100])
  })

  it('abandons — never throws — when the lock is never released', async () => {
    const test = harness([lock()])
    assert.strictEqual(
      await removeTemporaryGitIndexDirectory(directory, test.dependencies),
      'abandoned'
    )
    // Bounded: exactly budget/interval polls, then it gives up.
    assert.strictEqual(test.waits.length, 10)
    assert.deepStrictEqual(test.removals, [])
    assert.strictEqual(test.abandoned.length, 1)
  })

  it('never deletes around a symlinked lock', async () => {
    const test = harness([lock({ isSymbolicLink: true })])
    assert.strictEqual(
      await removeTemporaryGitIndexDirectory(directory, test.dependencies),
      'abandoned'
    )
    assert.deepStrictEqual(test.removals, [])
    assert.deepStrictEqual(test.waits, [])
  })

  it('swallows an unexpected removal failure so a push can continue', async () => {
    // A cleanup error thrown from a `finally` used to replace the real error
    // and abort the push before any network I/O.
    const test = harness([lock({ exists: false })], async () => {
      throw new Error('disk gone')
    })
    assert.strictEqual(
      await removeTemporaryGitIndexDirectory(directory, test.dependencies),
      'abandoned'
    )
    assert.strictEqual(test.abandoned.length, 1)
    assert.match(test.abandoned[0], /disk gone/)
  })

  it('swallows an unreadable lock path rather than failing the operation', async () => {
    const abandoned = new Array<string>()
    assert.strictEqual(
      await removeTemporaryGitIndexDirectory(directory, {
        observe: async () => {
          throw new Error('probe exploded')
        },
        removeDirectory: async () => undefined,
        delay: async () => undefined,
        onAbandoned: (path, reason) => abandoned.push(reason),
        waitBudgetMs: 100,
        pollIntervalMs: 50,
      }),
      'abandoned'
    )
    assert.match(abandoned[0], /probe exploded/)
  })
})
