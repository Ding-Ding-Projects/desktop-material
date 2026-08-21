import assert from 'node:assert'
import { describe, it, afterEach } from 'node:test'

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

  it('consumes a nonce before grading and never authenticates a ladder win', () => {
    let now = 1_000
    const service = new UnlockLadderService(
      () => now,
      () => 'challenge-1'
    )
    service.start({
      lockoutId: 'nonce-lock',
      lockoutLevel: 3,
      attemptsRemaining: 0,
      waitUntil: 2_000,
      schoolMode: false,
    })
    const challenge = service.issueChallenge('nonce-lock')
    const submission = {
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      answer: { kind: 'dim-sum-choice' as const, choiceId: 'not-a-dish' },
    }
    const first = service.submit('nonce-lock', submission)
    assert.equal(first.authenticated, false)
    assert.equal(first.attemptsRefunded, 0)
    assert.equal(first.waitingCleared, false)

    const replay = service.submit('nonce-lock', submission)
    assert.equal(replay.authenticated, false)
    assert.equal(replay.grade.outcome, 'incorrect')

    now += 1
    assert.equal(service.get('nonce-lock')?.waitingClearedAt, null)
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
