import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'

import { handle } from './ipc-main'
import { UnlockLadderService } from './unlock-ladder'
import { FileUnlockLadderAllowanceStore } from './unlock-ladder-allowance-store'
import type {
  IUnlockLadderMoleHitRequest,
  IUnlockLadderServiceResult,
  IUnlockLadderStartRequest,
  IUnlockLadderSubmission,
} from './unlock-ladder'

/**
 * Register the wait-ladder boundary. Every handler is main-process owned;
 * the renderer can ask for a challenge and submit a nonce, but it cannot
 * inspect the answer store or turn a correct grade into a session.
 */
export function registerUnlockLadderIpc(): void {
  const unlockLadderService = new UnlockLadderService(
    () => Date.now(),
    () => randomUUID(),
    new FileUnlockLadderAllowanceStore(
      join(app.getPath('userData'), 'unlock-ladder', 'allowance.json')
    )
  )
  handle('unlock-ladder-start', async (_event, request) =>
    unlockLadderService.start(request as IUnlockLadderStartRequest)
  )
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
