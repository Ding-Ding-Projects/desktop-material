import { WorkingDirectoryStatus } from '../models/status'

/** A path the safety authority refused to apply, with a stable reason. */
export interface ICopilotConflictApplicationRefusal {
  readonly path: string
  readonly reason: string
}

/**
 * The single result contract shared by the application authority and the UI.
 * `complete` is authoritative: a caller must not continue on a partial batch,
 * even when one or more writes happened before a later refusal.
 */
export interface ICopilotConflictApplicationResult {
  readonly written: ReadonlyArray<string>
  readonly staged: ReadonlyArray<string>
  readonly refused: ReadonlyArray<ICopilotConflictApplicationRefusal>
  readonly freshWorkingDirectory: WorkingDirectoryStatus
  readonly complete: boolean
}

export function canContinueAfterCopilotConflictApplication(
  result: ICopilotConflictApplicationResult
): boolean {
  return (
    result.complete &&
    result.refused.length === 0 &&
    result.written.length === result.staged.length
  )
}
