import { handle } from './ipc-main'
import { unlockLadderService } from './unlock-ladder'
import type {
  IUnlockLadderMoleHitRequest,
  IUnlockLadderServiceResult,
  IUnlockLadderSubmission,
} from './unlock-ladder'

/**
 * Register the wait-ladder boundary. Every handler is main-process owned;
 * the renderer can ask for a challenge and submit a nonce, but it cannot
 * inspect the answer store or turn a correct grade into a session.
 */
export function registerUnlockLadderIpc(): void {
  handle('unlock-ladder-record-mole-hit', async (_event, request) =>
    unlockLadderService.recordMoleHit(request as IUnlockLadderMoleHitRequest)
  )
  handle('unlock-ladder-issue', async (_event, lockoutId) =>
    unlockLadderService.issueChallenge(lockoutId)
  )
  handle(
    'unlock-ladder-submit',
    async (_event, request): Promise<IUnlockLadderServiceResult> => {
      const submission: IUnlockLadderSubmission = {
        challengeId: request.challengeId,
        nonce: request.nonce,
        answer: request.answer,
      }
      return unlockLadderService.submit(request.lockoutId, submission)
    }
  )
}
