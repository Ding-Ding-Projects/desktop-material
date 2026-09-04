import assert from 'node:assert'
import { describe, it, afterEach } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  advanceUnlockLadder,
  canUseUnlockLadder,
  createUnlockLadderLockoutState,
  getInitialUnlockLadderRung,
  UnlockLadderMaxSkipsPerRollingHour,
  UnlockLadderRollingWindowMs,
} from '../../src/models/unlock-ladder'
import { UnlockLadderService } from '../../src/main-process/unlock-ladder'
import {
  FileUnlockLadderAllowanceStore,
  UnlockLadderAllowanceSchemaVersion,
} from '../../src/main-process/unlock-ladder-allowance-store'
import {
  clearAllMd3LockAttempts,
  clearMd3LockWait,
  md3LockAttemptState,
  setMd3TotpVerifier,
  verifyMd3Lock,
} from '../../src/lib/md3-locks/lock-credentials'

afterEach(() => {
  clearAllMd3LockAttempts()
  setMd3TotpVerifier(null)
})

describe('the credential wait ladder', () => {
  it('starts at sums in School mode without exposing the dish rung', () => {
    assert.equal(getInitialUnlockLadderRung(true), 'sums')
    assert.equal(
      createUnlockLadderLockoutState(
        {
          lockoutId: 'school-lock',
          lockoutLevel: 3,
          attemptsRemaining: 0,
          waitUntil: 500,
          schoolMode: true,
        },
        100
      ).rung,
      'sums'
    )
  })

  it('caps successful wait skips to three in a rolling hour', () => {
    const now = 10_000
    const timestamps = Array.from(
      { length: UnlockLadderMaxSkipsPerRollingHour },
      (_, index) => now - index * 1_000
    )
    assert.equal(canUseUnlockLadder(timestamps, now), false)
    assert.equal(
      canUseUnlockLadder([now - UnlockLadderRollingWindowMs - 1], now),
      true
    )
  })

  it('advances a wrong dish without changing credential attempts', () => {
    const state = createUnlockLadderLockoutState(
      {
        lockoutId: 'dish-lock',
        lockoutLevel: 1,
        attemptsRemaining: 0,
        waitUntil: 100,
        schoolMode: false,
      },
      0
    )
    const next = advanceUnlockLadder(
      state,
      { outcome: 'incorrect', reason: 'wrong-answer' },
      1
    )
    assert.equal(next.wrongDishCount, 1)
    assert.equal(next.rung, 'dim-sum')
    assert.equal(next.attemptsRemaining, 0)
    assert.equal(next.waitingClearedAt, null)
  })

  it('consumes a nonce before grading and never authenticates a ladder win', async () => {
    let now = 1_000
    const service = new UnlockLadderService(
      () => now,
      () => 'challenge-1'
    )
    await service.start({
      lockoutId: 'nonce-lock',
      lockoutLevel: 3,
      attemptsRemaining: 0,
      waitUntil: 2_000,
      schoolMode: false,
    })
    const challenge = await service.issueChallenge('nonce-lock')
    const submission = {
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      answer: { kind: 'dim-sum-choice' as const, choiceId: 'not-a-dish' },
    }
    const first = await service.submit('nonce-lock', submission)
    assert.equal(first.authenticated, false)
    assert.equal(first.attemptsRefunded, 0)
    assert.equal(first.waitingCleared, false)

    const replay = await service.submit('nonce-lock', submission)
    assert.equal(replay.authenticated, false)
    assert.equal(replay.grade.outcome, 'incorrect')

    now += 1
    assert.equal(service.get('nonce-lock')?.waitingClearedAt, null)
  })

  it('persists the rolling-hour allowance across service restarts', async t => {
    const root = await mkdtemp(join(tmpdir(), 'unlock-ladder-allowance-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const path = join(root, 'allowance.json')
    const now = 100_000

    const firstStore = new FileUnlockLadderAllowanceStore(path)
    for (
      let index = 0;
      index < UnlockLadderMaxSkipsPerRollingHour;
      index += 1
    ) {
      assert.ok(await firstStore.tryRecordSkip(now + index))
    }

    const restartedStore = new FileUnlockLadderAllowanceStore(path)
    assert.equal((await restartedStore.read(now + 10)).length, 3)
    assert.equal(await restartedStore.tryRecordSkip(now + 10), null)

    const service = new UnlockLadderService(
      () => now + 10,
      () => 'durable-challenge',
      restartedStore
    )
    const state = await service.start({
      lockoutId: 'durable-lockout',
      lockoutLevel: 4,
      attemptsRemaining: 0,
      waitUntil: now + 1_000,
      schoolMode: false,
    })
    assert.equal(state.ladderSkipTimestamps.length, 3)
    await assert.rejects(
      service.issueChallenge('durable-lockout'),
      /allowance is exhausted/
    )

    const file = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(file.schemaVersion, UnlockLadderAllowanceSchemaVersion)
    assert.deepEqual(file.skipTimestamps, [now, now + 1, now + 2])
  })

  it('serializes simultaneous spends so only three can land', async t => {
    const root = await mkdtemp(join(tmpdir(), 'unlock-ladder-race-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const store = new FileUnlockLadderAllowanceStore(
      join(root, 'allowance.json')
    )

    const outcomes = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        store.tryRecordSkip(200_000 + index)
      )
    )
    assert.equal(outcomes.filter(value => value !== null).length, 3)
    assert.equal(outcomes.filter(value => value === null).length, 1)
    assert.equal((await store.read(200_010)).length, 3)
  })

  it('fails closed when durable allowance data is malformed', async t => {
    const root = await mkdtemp(join(tmpdir(), 'unlock-ladder-invalid-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const path = join(root, 'allowance.json')
    await writeFile(path, '{"schemaVersion":1,"skipTimestamps":["nope"]}')

    const store = new FileUnlockLadderAllowanceStore(path)
    await assert.rejects(store.read(300_000), /allowance data is invalid/)
    await assert.rejects(
      store.tryRecordSkip(300_000),
      /allowance data is invalid/
    )
  })

  it('clears only the current retry deadline after a credential wait recovery', async () => {
    setMd3TotpVerifier({
      hasEntry: async () => true,
      verify: async () => false,
    })
    const lock = {
      id: 'wait-only-lock',
      factor: 'otp' as const,
      otpAccountKey: 'authenticator-entry',
    } as Parameters<typeof verifyMd3Lock>[0]

    await verifyMd3Lock(lock, '000000', 0)
    await verifyMd3Lock(lock, '000000', 1)
    const third = await verifyMd3Lock(lock, '000000', 2)
    assert.equal(third.consecutiveFailures, 3)
    assert.ok(third.retryAt > 2)

    clearMd3LockWait(lock.id)
    const state = md3LockAttemptState(lock.id)
    assert.equal(state.consecutiveFailures, 3)
    assert.equal(state.retryAt, 0)
  })
})
