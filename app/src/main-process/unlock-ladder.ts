import { randomBytes, randomInt, randomUUID } from 'crypto'

import {
  advanceUnlockLadder,
  canUseUnlockLadder,
  createUnlockLadderLockoutState,
  gradeUnlockLadderAnswer,
  UnlockLadderChallengeLifetimeMs,
  UnlockLadderChallengePayload,
  UnlockLadderMoleRoundDurationMs,
  UnlockLadderMoleVisibleWindowMs,
  UnlockLadderMaximumSums,
} from '../models/unlock-ladder'
import type {
  IUnlockLadderChallenge,
  IUnlockLadderDimSumChoice,
  IUnlockLadderLockoutState,
  IUnlockLadderMole,
  IUnlockLadderMoleHitRequest,
  IUnlockLadderServiceResult,
  IUnlockLadderStartRequest,
  IUnlockLadderSubmission,
  IUnlockLadderSumsChallenge,
  UnlockLadderAnswer,
  UnlockLadderRung,
} from '../models/unlock-ladder'

export type {
  IUnlockLadderMoleHitRequest,
  IUnlockLadderServiceResult,
  IUnlockLadderStartRequest,
  IUnlockLadderSubmission,
} from '../models/unlock-ladder'

interface IStoredChallenge {
  readonly challenge: IUnlockLadderChallenge
  readonly answer: UnlockLadderAnswer | null
  readonly recordedHits: Map<string, number>
}

const dimSumChoices: ReadonlyArray<IUnlockLadderDimSumChoice> = [
  { id: 'har-gow', englishName: 'Classic Har Gow', cantoneseName: '蝦餃' },
  { id: 'siu-mai', englishName: 'Siu Mai', cantoneseName: '燒賣' },
  { id: 'char-siu-bao', englishName: 'Char Siu Bao', cantoneseName: '叉燒包' },
  { id: 'turnip-cake', englishName: 'Turnip Cake', cantoneseName: '蘿蔔糕' },
]

/**
 * In-memory service for one renderer/main-process lifetime.
 *
 * It is intentionally not a credential store. `waitingClearedAt` is an audit
 * fact, while the separate credential flow remains responsible for sign-in.
 * The challenge map is private to the main process: the renderer receives
 * only prompt data, never an answer or a server-side answer key.
 */
export class UnlockLadderService {
  private readonly lockouts = new Map<string, IUnlockLadderLockoutState>()
  private readonly challenges = new Map<string, IStoredChallenge>()
  private readonly activeChallengeByLockout = new Map<string, string>()

  public constructor(
    private readonly clock: () => number = () => Date.now(),
    private readonly uuid: () => string = () => randomUUID()
  ) {}

  public start(request: IUnlockLadderStartRequest): IUnlockLadderLockoutState {
    const now = this.clock()
    const state = createUnlockLadderLockoutState(request, now)
    this.lockouts.set(state.lockoutId, state)
    return state
  }

  public get(lockoutId: string): IUnlockLadderLockoutState | null {
    return this.lockouts.get(lockoutId) ?? null
  }

  public issueChallenge(lockoutId: string): IUnlockLadderChallenge {
    const state = this.requireLockout(lockoutId)
    const now = this.clock()
    if (state.waitingClearedAt !== null || state.rung === 'clock') {
      throw new Error('The lockout ladder is no longer available for this wait.')
    }
    if (!canUseUnlockLadder(state.ladderSkipTimestamps, now)) {
      throw new Error('The lockout ladder wait-skip allowance is exhausted.')
    }

    const challengeId = this.uuid()
    const nonce = randomBytes(32).toString('base64url')
    const challenge: IUnlockLadderChallenge = {
      challengeId,
      nonce,
      lockoutId,
      rung: state.rung,
      issuedAt: now,
      expiresAt: now + UnlockLadderChallengeLifetimeMs,
      payload: this.createPayload(state.rung, now),
    }
    const previousChallengeId = this.activeChallengeByLockout.get(lockoutId)
    if (previousChallengeId !== undefined) {
      // One live challenge per lockout bounds answer material and makes a
      // refresh replace the old nonce rather than creating a replay pool.
      this.challenges.delete(previousChallengeId)
    }
    this.challenges.set(challengeId, {
      challenge,
      answer: this.answerFor(challenge.payload),
      recordedHits: new Map(),
    })
    this.activeChallengeByLockout.set(lockoutId, challengeId)
    return challenge
  }

  public submit(
    lockoutId: string,
    submission: IUnlockLadderSubmission
  ): IUnlockLadderServiceResult {
    const state = this.requireLockout(lockoutId)
    const now = this.clock()
    const stored = this.challenges.get(submission.challengeId)

    // Consume before any grading, including nonce/lockout mismatch checks.
    // A replay therefore cannot be used to probe the answer or state.
    this.challenges.delete(submission.challengeId)
    if (stored !== undefined && this.activeChallengeByLockout.get(lockoutId) === submission.challengeId) {
      this.activeChallengeByLockout.delete(lockoutId)
    }

    if (
      stored === undefined ||
      stored.challenge.nonce !== submission.nonce ||
      stored.challenge.lockoutId !== lockoutId
    ) {
      return this.result(
        state,
        { outcome: 'incorrect', reason: 'wrong-answer-shape' },
        false
      )
    }

    const answer =
      stored.challenge.payload.kind === 'whack-a-mole'
        ? {
            kind: 'whack-a-mole' as const,
            hits: [...stored.recordedHits].map(([moleId, at]) => ({ moleId, at })),
          }
        : submission.answer
    const grade = gradeUnlockLadderAnswer(
      stored.challenge,
      answer,
      now,
      stored.answer ?? undefined
    )
    // A stale or premature submission consumes its nonce but does not count
    // as a wrong rung answer and does not accelerate the underlying lockout.
    if (
      grade.outcome === 'incorrect' &&
      (grade.reason === 'expired' || grade.reason === 'too-early')
    ) {
      return this.result(state, grade, false)
    }
    if (grade.outcome === 'correct' && !canUseUnlockLadder(state.ladderSkipTimestamps, now)) {
      return this.result(
        state,
        { outcome: 'incorrect', reason: 'wrong-answer' },
        false
      )
    }
    const next = advanceUnlockLadder(state, grade, now)
    this.lockouts.set(lockoutId, next)
    return this.result(next, grade, grade.outcome === 'correct')
  }

  /** Record a mole at the server's receipt time; client timestamps are ignored. */
  public recordMoleHit(request: IUnlockLadderMoleHitRequest): boolean {
    const stored = this.challenges.get(request.challengeId)
    if (
      stored === undefined ||
      stored.challenge.lockoutId !== request.lockoutId ||
      stored.challenge.nonce !== request.nonce ||
      stored.challenge.payload.kind !== 'whack-a-mole'
    ) {
      return false
    }
    const now = this.clock()
    if (now >= stored.challenge.expiresAt || stored.recordedHits.has(request.moleId)) {
      return false
    }
    const mole = stored.challenge.payload.moles.find(item => item.id === request.moleId)
    if (mole === undefined || now < mole.visibleAt || now > mole.visibleUntil) {
      return false
    }
    stored.recordedHits.set(request.moleId, now)
    return true
  }

  /** Drop stale challenge material without exposing it to the renderer. */
  public pruneExpired(): void {
    const now = this.clock()
    for (const [id, stored] of this.challenges) {
      if (stored.challenge.expiresAt <= now) {
        this.challenges.delete(id)
        if (this.activeChallengeByLockout.get(stored.challenge.lockoutId) === id) {
          this.activeChallengeByLockout.delete(stored.challenge.lockoutId)
        }
      }
    }
  }

  private result(
    lockout: IUnlockLadderLockoutState,
    grade: IUnlockLadderServiceResult['grade'],
    waitingCleared: boolean
  ): IUnlockLadderServiceResult {
    return {
      lockout,
      grade,
      authenticated: false,
      attemptsRefunded: 0,
      waitingCleared,
      canTryCredential: waitingCleared,
    }
  }

  private requireLockout(lockoutId: string): IUnlockLadderLockoutState {
    if (typeof lockoutId !== 'string' || lockoutId.length === 0) {
      throw new Error('A lockout identifier is required.')
    }
    const state = this.lockouts.get(lockoutId)
    if (state === undefined) {
      throw new Error('The lockout is not known to this process.')
    }
    return state
  }

  private createPayload(
    rung: Exclude<UnlockLadderRung, 'clock'>,
    now: number
  ): UnlockLadderChallengePayload {
    if (rung === 'dim-sum') {
      return { kind: 'dim-sum-choice', choices: dimSumChoices }
    }
    if (rung === 'sums') {
      const questions: IUnlockLadderSumsChallenge['questions'] = []
      for (let index = 0; index < UnlockLadderMaximumSums; index += 1) {
        const left = randomInt(1, 20)
        const right = randomInt(1, 20)
        questions.push({
          id: `sum-${index + 1}-${this.uuid()}`,
          left,
          operator: left >= right ? '-' : '+',
          right,
        })
      }
      return { kind: 'arithmetic-sums', questions }
    }

    const startedAt = now
    const endsAt = now + UnlockLadderMoleRoundDurationMs
    const moles: ReadonlyArray<IUnlockLadderMole> = Array.from(
      { length: 8 },
      (_, index) => {
        const visibleAt = startedAt + randomInt(0, UnlockLadderMoleRoundDurationMs - 1000)
        return {
          id: `mole-${index + 1}-${this.uuid()}`,
          row: Math.floor(index / 4),
          column: index % 4,
          visibleAt,
          visibleUntil: Math.min(endsAt, visibleAt + UnlockLadderMoleVisibleWindowMs),
        }
      }
    )
    return {
      kind: 'whack-a-mole',
      startedAt,
      endsAt,
      requiredHits: 4,
      moles,
    }
  }

  private answerFor(payload: UnlockLadderChallengePayload): UnlockLadderAnswer {
    switch (payload.kind) {
      case 'dim-sum-choice':
        // The answer is held server-side only. It is deterministic here to
        // keep the challenge data reproducible without leaking it publicly.
        return { kind: 'dim-sum-choice', choiceId: payload.choices[randomInt(payload.choices.length)].id }
      case 'arithmetic-sums':
        return {
          kind: 'arithmetic-sums',
          answers: payload.questions.map(question => ({
            questionId: question.id,
            value:
              question.operator === '+'
                ? question.left + question.right
                : question.left - question.right,
          })),
        }
      case 'whack-a-mole':
        return {
          kind: 'whack-a-mole',
          hits: payload.moles
            .slice(0, payload.requiredHits)
            .map(mole => ({ moleId: mole.id, at: mole.visibleAt })),
        }
    }
  }
}

export const unlockLadderService = new UnlockLadderService()
