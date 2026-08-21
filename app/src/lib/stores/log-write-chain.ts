export interface ILogWriteActions {
  append: (content: string) => Promise<void>
  rewrite: (content: string) => Promise<void>
}

/**
 * Queue one log-file write behind its predecessor. A failed predecessor may
 * have left its in-memory lines absent from disk, so recovery replaces the
 * file from this operation's complete snapshot instead of appending only the
 * newest chunk. A failed replacement remains rejected for the next queued
 * snapshot to repair in the same way.
 */
export function enqueueRecoveringLogWrite(
  previous: Promise<void>,
  fullContent: string,
  appendedContent: string | null,
  actions: ILogWriteActions
): Promise<void> {
  return previous.then(
    async () => {
      if (appendedContent === null) {
        await actions.rewrite(fullContent)
      } else if (appendedContent.length > 0) {
        await actions.append(appendedContent)
      }
    },
    () => actions.rewrite(fullContent)
  )
}

/**
 * Drain a serialized write tail. If its last operation failed and no later
 * append arrived to repair it, replace the file from the latest complete
 * snapshot. The boolean tells the caller to schedule history for that repair.
 */
export function recoverFailedLogWrite(
  previous: Promise<void>,
  fullContent: string,
  rewrite: (content: string) => Promise<void>
): Promise<boolean> {
  return previous.then(
    () => false,
    async () => {
      await rewrite(fullContent)
      return true
    }
  )
}
