import assert from 'node:assert'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  normalizeProfileRepositoryPath,
  normalizeProfileRepositoryPathWithinUserData,
  ProfileRepositoryLockCancelledError,
  ProfileRepositoryLockRegistry,
} from '../../src/main-process/profile-repository-lock-registry'

function createRegistry(): ProfileRepositoryLockRegistry {
  let nextLease = 0
  return new ProfileRepositoryLockRegistry(() => `lease-${++nextLease}`)
}

async function assertPending(promise: Promise<unknown>): Promise<void> {
  let settled = false
  void promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  await Promise.resolve()
  assert.equal(settled, false)
}

describe('normalizeProfileRepositoryPath', () => {
  it('normalizes ordinary external and UNC repositories', () => {
    assert.equal(
      normalizeProfileRepositoryPath('D:/Work/Clients/../Repo/./'),
      'd:\\work\\repo'
    )
    assert.equal(
      normalizeProfileRepositoryPath(
        '\\\\BuildServer\\Repositories\\Desktop Material'
      ),
      '\\\\buildserver\\repositories\\desktop material'
    )
  })

  it('rejects relative, drive-relative, empty, and NUL paths', () => {
    for (const invalidPath of [
      '',
      'repositories\\repo',
      'C:repositories\\repo',
      'D:\\repositories\\repo\0suffix',
    ]) {
      assert.throws(() => normalizeProfileRepositoryPath(invalidPath))
    }
  })
})

describe('normalizeProfileRepositoryPathWithinUserData', () => {
  const userDataRoot = 'C:\\Users\\Example\\AppData\\Roaming\\Desktop Material'

  it('normalizes an absolute nested path case-insensitively', () => {
    assert.equal(
      normalizeProfileRepositoryPathWithinUserData(
        userDataRoot,
        'c:/USERS/Example/AppData/Roaming/Desktop Material/profiles/./nested/repo/'
      ),
      'c:\\users\\example\\appdata\\roaming\\desktop material\\profiles\\nested\\repo'
    )
  })

  it('rejects the root, relative, NUL, traversal, sibling, outside, and other-drive paths', () => {
    const invalidPaths = [
      userDataRoot,
      'c:/users/example/appdata/roaming/desktop material/',
      'profiles\\repo',
      'C:profiles\\repo',
      `${userDataRoot}\\profiles\\repo\0suffix`,
      `${userDataRoot}\\profiles\\..\\repo`,
      'C:\\Users\\Example\\AppData\\Roaming\\Desktop Material Backup\\repo',
      'C:\\Users\\Example\\AppData\\Roaming\\repo',
      'D:\\Desktop Material\\profiles\\repo',
    ]

    for (const invalidPath of invalidPaths) {
      assert.throws(() =>
        normalizeProfileRepositoryPathWithinUserData(userDataRoot, invalidPath)
      )
    }
  })

  it('rejects an invalid supplied user-data root', () => {
    for (const invalidRoot of [
      'relative\\user-data',
      'C:\\user-data\\..\\other',
      'C:\\user-data\0suffix',
    ]) {
      assert.throws(() =>
        normalizeProfileRepositoryPathWithinUserData(
          invalidRoot,
          'C:\\user-data\\profiles\\repo'
        )
      )
    }
  })
})

describe('ProfileRepositoryLockRegistry', () => {
  it('grants normalized-path leases in FIFO order', async () => {
    const registry = createRegistry()
    const first = await registry.acquire(
      1,
      'C:\\Users\\Example\\profiles\\repo'
    )
    const second = registry.acquire(
      2,
      'c:/users/example/profiles/nested/../repo/'
    )
    const third = registry.acquire(3, 'C:\\USERS\\EXAMPLE\\PROFILES\\REPO')

    await assertPending(second)
    await assertPending(third)

    assert.equal(registry.release(1, first), true)
    const secondLease = await second
    await assertPending(third)

    assert.equal(registry.release(2, secondLease), true)
    const thirdLease = await third
    assert.notEqual(thirdLease, first)
    assert.notEqual(thirdLease, secondLease)
  })

  it('does not release a lease for a different sender', async () => {
    const registry = createRegistry()
    const first = await registry.acquire(10, 'C:\\profiles\\one')
    const waiting = registry.acquire(20, 'C:\\profiles\\one')

    assert.equal(registry.release(99, first), false)
    await assertPending(waiting)

    assert.equal(registry.release(10, first), true)
    const next = await waiting
    assert.equal(registry.release(20, next), true)
  })

  it('releases every held lease when a sender terminally disappears', async () => {
    const registry = createRegistry()
    const firstPathLease = await registry.acquire(7, 'C:\\profiles\\first')
    const secondPathLease = await registry.acquire(7, 'C:\\profiles\\second')
    const firstPathWaiting = registry.acquire(8, 'C:\\profiles\\first')
    const secondPathWaiting = registry.acquire(9, 'C:\\profiles\\second')

    registry.releaseSender(7)

    const [firstGranted, secondGranted] = await Promise.all([
      firstPathWaiting,
      secondPathWaiting,
    ])
    assert.equal(registry.release(7, firstPathLease), false)
    assert.equal(registry.release(7, secondPathLease), false)
    assert.equal(registry.release(8, firstGranted), true)
    assert.equal(registry.release(9, secondGranted), true)
  })

  it('cancels a navigating sender queue without releasing its active lease', async () => {
    const registry = createRegistry()
    const active = await registry.acquire(2, 'C:\\profiles\\shared')
    const later = registry.acquire(3, 'C:\\profiles\\shared')
    const otherHolder = await registry.acquire(1, 'D:\\profiles\\other')
    const queued = registry.acquire(2, 'D:\\profiles\\other')
    const queuedResult = queued.then(
      () => undefined,
      error => error
    )

    registry.cancelQueuedSender(2)

    assert.ok(
      (await queuedResult) instanceof ProfileRepositoryLockCancelledError
    )
    await assertPending(later)
    assert.equal(registry.release(2, active), true)

    const laterLease = await later
    assert.equal(registry.release(3, laterLease), true)
    assert.equal(registry.release(1, otherHolder), true)
  })

  it('allows unrelated repository paths to be held concurrently', async () => {
    const registry = createRegistry()
    const alpha = await registry.acquire(1, 'C:\\profiles\\alpha')
    const beta = await registry.acquire(2, 'C:\\profiles\\beta')
    const alphaWaiting = registry.acquire(3, 'C:\\profiles\\alpha')
    const betaWaiting = registry.acquire(4, 'C:\\profiles\\beta')

    assert.notEqual(alpha, beta)
    assert.equal(registry.release(1, alpha), true)
    const nextAlpha = await alphaWaiting
    await assertPending(betaWaiting)

    assert.equal(registry.release(2, beta), true)
    const nextBeta = await betaWaiting
    assert.equal(registry.release(3, nextAlpha), true)
    assert.equal(registry.release(4, nextBeta), true)
  })
})

describe('profile repository lock wiring', () => {
  it('leases renderer work through main and releases a document on teardown', async () => {
    const [profileSource, mainSource] = await Promise.all([
      readFile(
        join(process.cwd(), 'app', 'src', 'lib', 'profiles', 'profile-git.ts'),
        'utf8'
      ),
      readFile(
        join(process.cwd(), 'app', 'src', 'main-process', 'main.ts'),
        'utf8'
      ),
    ])

    assert.match(
      profileSource,
      /process[\s\S]*?type[\s\S]*?renderer[\s\S]*?acquire-profile-repository-lock[\s\S]*?runProfileRepositoryActionWithLease[\s\S]*?release-profile-repository-lock/
    )
    assert.match(
      mainSource,
      /acquire-profile-repository-lock[\s\S]*?normalizeProfileRepositoryPath\(repositoryPath\)[\s\S]*?Fs\.promises\.realpath[\s\S]*?profileRepositoryLocks\.acquire/
    )
    assert.match(
      mainSource,
      /cancelQueuedDocumentWork[\s\S]*?cancelQueuedSender/
    )
    assert.match(mainSource, /releaseSenderLeases[\s\S]*?releaseSender/)
    assert.match(
      mainSource,
      /did-start-navigation[\s\S]*?cancelQueuedDocumentWork\(\)/
    )
    assert.match(
      mainSource,
      /render-process-gone', releaseSenderLeases[\s\S]*?destroyed', releaseSenderLeases/
    )
  })
})
