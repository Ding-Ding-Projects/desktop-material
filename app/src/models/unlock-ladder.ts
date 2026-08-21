/**
 * The lockout wait ladder is deliberately separate from credentials.
 *
 * A successful challenge only changes the lockout's WAITING state. It never
 * verifies a password, creates a session, restores an attempt, or returns a
 * bearer value. The main-process service owns the nonce and answer material;
 * this module contains the serializable contract and deterministic grading
 * rules shared by the main process and its renderer.
 */

export const UnlockLadderMaxSkipsPerRollingHour = 3
export const UnlockLadderRollingWindowMs = 60 * 60 * 1000
export const UnlockLadderChallengeLifetimeMs = 2 * 60 * 1000
export const UnlockLadderMoleRoundDurationMs = 12_000
export const UnlockLadderMoleVisibleWindowMs = 2_000
export const UnlockLadderMaximumSums = 10
export const UnlockLadderWrongDishesBeforeSums = 5

export type UnlockLadderRung = 'dim-sum' | 'sums' | 'moles' | 'clock'

export type UnlockLadderChallengeKind =
  | 'dim-sum-choice'
  | 'arithmetic-sums'
  | 'whack-a-mole'

export interface IUnlockLadderLockoutState {
  readonly lockoutId: string
  readonly lockoutLevel: number
  readonly attemptsRemaining: number
  /** The original escalation deadline. It is never shortened by the ladder. */
  readonly waitUntil: number
  readonly schoolMode: boolean
  readonly rung: UnlockLadderRung
  readonly wrongDishCount: number
  readonly waitingClearedAt: number | null
  readonly ladderSkipTimestamps: ReadonlyArray<number>
}

export interface IUnlockLadderDimSumChoice {
  readonly id: string
  readonly englishName: string
  readonly cantoneseName: string
}

export interface IUnlockLadderDimSumChallenge {
  readonly kind: 'dim-sum-choice'
  readonly choices: ReadonlyArray<IUnlockLadderDimSumChoice>
}

export interface IUnlockLadderSumQuestion {
  readonly id: string
  readonly left: number
  readonly operator: '+' | '-'
  readonly right: number
}

export interface IUnlockLadderSumsChallenge {
  readonly kind: 'arithmetic-sums'
  readonly questions: ReadonlyArray<IUnlockLadderSumQuestion>
}

export interface IUnlockLadderMole {
  readonly id: string
  readonly row: number
  readonly column: number
  readonly visibleAt: number
  readonly visibleUntil: number
}

export interface IUnlockLadderMolesChallenge {
  readonly kind: 'whack-a-mole'
  readonly startedAt: number
  readonly endsAt: number
  readonly requiredHits: number
  readonly moles: ReadonlyArray<IUnlockLadderMole>
}

export type UnlockLadderChallengePayload =
  | IUnlockLadderDimSumChallenge
  | IUnlockLadderSumsChallenge
  | IUnlockLadderMolesChallenge

/** Public challenge data. Correct answers never occur in this shape. */
export interface IUnlockLadderChallenge {
  readonly challengeId: string
  readonly nonce: string
  readonly lockoutId: string
  readonly rung: Exclude<UnlockLadderRung, 'clock'>
  readonly issuedAt: number
  readonly expiresAt: number
  readonly payload: UnlockLadderChallengePayload
}

export interface IUnlockLadderStartRequest {
  readonly lockoutId: string
  readonly lockoutLevel: number
  readonly attemptsRemaining: number
  readonly waitUntil: number
  readonly schoolMode: boolean
}

export type UnlockLadderAnswer =
  | { readonly kind: 'dim-sum-choice'; readonly choiceId: string }
  | {
      readonly kind: 'arithmetic-sums'
      readonly answers: ReadonlyArray<{ readonly questionId: string; readonly value: number }>
    }
  | {
      readonly kind: 'whack-a-mole'
      readonly hits: ReadonlyArray<{ readonly moleId: string; readonly at: number }>
    }

export interface IUnlockLadderSubmission {
  readonly challengeId: string
  readonly nonce: string
  readonly answer: UnlockLadderAnswer
}

export interface IUnlockLadderMoleHitRequest {
  readonly lockoutId: string
  readonly challengeId: string
  readonly nonce: string
  readonly moleId: string
}

export type UnlockLadderGrade =
  | { readonly outcome: 'correct'; readonly clearsWaiting: true }
  | {
      readonly outcome: 'incorrect'
      readonly reason:
        | 'wrong-answer'
        | 'expired'
        | 'too-early'
        | 'invalid-hit'
        | 'duplicate-hit'
        | 'wrong-answer-shape'
    }

export interface IUnlockLadderServiceResult {
  readonly lockout: IUnlockLadderLockoutState
  readonly grade: UnlockLadderGrade
  readonly authenticated: false
  readonly attemptsRefunded: 0
  readonly waitingCleared: boolean
  readonly canTryCredential: boolean
}

export function getInitialUnlockLadderRung(schoolMode: boolean): UnlockLadderRung {
  // School mode starts at sums. Do not expose or mention the suppressed dish
  // rung to the caller; the starting function has one authoritative answer.
  return schoolMode ? 'sums' : 'dim-sum'
}

export function createUnlockLadderLockoutState(
  request: {
    readonly lockoutId: string
    readonly lockoutLevel: number
    readonly attemptsRemaining: number
    readonly waitUntil: number
    readonly schoolMode: boolean
  },
  now: number
): IUnlockLadderLockoutState {
  return {
    lockoutId: request.lockoutId,
    lockoutLevel: Number.isSafeInteger(request.lockoutLevel)
      ? Math.max(0, request.lockoutLevel)
      : 0,
    attemptsRemaining: Number.isSafeInteger(request.attemptsRemaining)
      ? Math.max(0, request.attemptsRemaining)
      : 0,
    waitUntil: Number.isFinite(request.waitUntil)
      ? Math.max(now, request.waitUntil)
      : now,
    schoolMode: request.schoolMode === true,
    rung: getInitialUnlockLadderRung(request.schoolMode === true),
    wrongDishCount: 0,
    waitingClearedAt: null,
    ladderSkipTimestamps: [],
  }
}

export function canUseUnlockLadder(
  timestamps: ReadonlyArray<number>,
  now: number
): boolean {
  return timestamps.filter(timestamp => now - timestamp < UnlockLadderRollingWindowMs).length < UnlockLadderMaxSkipsPerRollingHour
}

export function pruneUnlockLadderSkipTimestamps(
  timestamps: ReadonlyArray<number>,
  now: number
): ReadonlyArray<number> {
  return timestamps.filter(timestamp => now - timestamp < UnlockLadderRollingWindowMs)
}

function expectedSum(question: IUnlockLadderSumQuestion): number {
  return question.operator === '+'
    ? question.left + question.right
    : question.left - question.right
}

function gradeSums(
  challenge: IUnlockLadderSumsChallenge,
  answer: UnlockLadderAnswer
): UnlockLadderGrade {
  if (answer.kind !== 'arithmetic-sums' || answer.answers.length !== challenge.questions.length) {
    return { outcome: 'incorrect', reason: 'wrong-answer-shape' }
  }
  const byId = new Map(answer.answers.map(item => [item.questionId, item.value]))
  if (
    byId.size !== answer.answers.length ||
    challenge.questions.some(question => byId.get(question.id) !== expectedSum(question))
  ) {
    return { outcome: 'incorrect', reason: 'wrong-answer' }
  }
  return { outcome: 'correct', clearsWaiting: true }
}

function gradeMoles(
  challenge: IUnlockLadderMolesChallenge,
  answer: UnlockLadderAnswer,
  now: number
): UnlockLadderGrade {
  if (answer.kind !== 'whack-a-mole') {
    return { outcome: 'incorrect', reason: 'wrong-answer-shape' }
  }
  // The server refuses an answer submitted before the round's own duration,
  // even if the claimed hits would otherwise be perfect.
  if (now < challenge.endsAt) {
    return { outcome: 'incorrect', reason: 'too-early' }
  }
  const byId = new Map(challenge.moles.map(mole => [mole.id, mole]))
  const seen = new Set<string>()
  let validHits = 0
  for (const hit of answer.hits) {
    if (seen.has(hit.moleId)) {
      return { outcome: 'incorrect', reason: 'duplicate-hit' }
    }
    seen.add(hit.moleId)
    const mole = byId.get(hit.moleId)
    if (mole === undefined || hit.at < mole.visibleAt || hit.at > mole.visibleUntil) {
      return { outcome: 'incorrect', reason: 'invalid-hit' }
    }
    validHits += 1
  }
  return validHits >= challenge.requiredHits
    ? { outcome: 'correct', clearsWaiting: true }
    : { outcome: 'incorrect', reason: 'wrong-answer' }
}

/** Grade a consumed challenge. The caller must consume the nonce first. */
export function gradeUnlockLadderAnswer(
  challenge: IUnlockLadderChallenge,
  answer: UnlockLadderAnswer,
  now: number,
  /** Main-process-only answer material; never put it on the public challenge. */
  serverAnswer?: UnlockLadderAnswer
): UnlockLadderGrade {
  if (now >= challenge.expiresAt) {
    return { outcome: 'incorrect', reason: 'expired' }
  }
  switch (challenge.payload.kind) {
    case 'dim-sum-choice':
      return answer.kind === 'dim-sum-choice' &&
        challenge.payload.choices.some(choice => choice.id === answer.choiceId) &&
        (serverAnswer === undefined ||
          (serverAnswer.kind === 'dim-sum-choice' &&
            serverAnswer.choiceId === answer.choiceId))
        ? { outcome: 'correct', clearsWaiting: true }
        : answer.kind === 'dim-sum-choice'
        ? { outcome: 'incorrect', reason: 'wrong-answer' }
        : { outcome: 'incorrect', reason: 'wrong-answer-shape' }
    case 'arithmetic-sums':
      return gradeSums(challenge.payload, answer)
    case 'whack-a-mole':
      return gradeMoles(challenge.payload, answer, now)
  }
}

/** Move only the ladder state; this never changes credential state. */
export function advanceUnlockLadder(
  state: IUnlockLadderLockoutState,
  grade: UnlockLadderGrade,
  now: number
): IUnlockLadderLockoutState {
  const timestamps = pruneUnlockLadderSkipTimestamps(
    state.ladderSkipTimestamps,
    now
  )
  if (grade.outcome === 'correct') {
    return {
      ...state,
      waitingClearedAt: now,
      ladderSkipTimestamps: [...timestamps, now],
    }
  }
  if (state.rung === 'dim-sum') {
    const wrongDishCount = state.wrongDishCount + 1
    return {
      ...state,
      wrongDishCount,
      rung:
        wrongDishCount >= UnlockLadderWrongDishesBeforeSums ? 'sums' : 'dim-sum',
      ladderSkipTimestamps: timestamps,
    }
  }
  if (state.rung === 'sums') {
    return { ...state, rung: 'moles', ladderSkipTimestamps: timestamps }
  }
  if (state.rung === 'moles') {
    return { ...state, rung: 'clock', ladderSkipTimestamps: timestamps }
  }
  return { ...state, ladderSkipTimestamps: timestamps }
}
