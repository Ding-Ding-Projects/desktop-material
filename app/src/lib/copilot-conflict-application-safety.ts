import { createHash } from 'crypto'

import {
  AppFileStatus,
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../models/status'
import { IFileResolution } from './copilot-conflict-resolution'

export type CopilotConflictApplicationRefusalReason =
  | 'missing-generation'
  | 'path-mismatch'
  | 'not-conflicted'
  | 'conflict-stages-changed'
  | 'content-changed'

export interface ICopilotConflictApplicationAssessment {
  readonly applicable: boolean
  readonly reason?: CopilotConflictApplicationRefusalReason
}

/** Hash the exact bytes that were reviewed by Copilot. */
export function hashCopilotConflictContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Return a stable representation of Git's unmerged stages for one path.
 * Conflict kind alone is insufficient: a user can change the conflict from
 * both-modified to delete-vs-modify while leaving marker-looking text behind.
 */
export function fingerprintCopilotConflictStatus(
  status: AppFileStatus
): string {
  if (status.kind !== AppFileStatusKind.Conflicted) {
    return JSON.stringify({ kind: status.kind })
  }

  return JSON.stringify({
    kind: status.kind,
    action: status.entry.action,
    us: status.entry.us,
    them: status.entry.them,
    submoduleStatus: status.entry.submoduleStatus ?? null,
  })
}

/**
 * Check a generated resolution against the file as it exists immediately
 * before the write. A missing generation identity fails closed because there
 * is no reviewed source to compare against.
 */
export function assessCopilotConflictApplication(
  resolution: IFileResolution,
  currentFile: WorkingDirectoryFileChange | undefined,
  currentContent: string | undefined
): ICopilotConflictApplicationAssessment {
  if (resolution.conflictGeneration === undefined) {
    return { applicable: false, reason: 'missing-generation' }
  }

  if (currentFile === undefined || currentFile.path !== resolution.path) {
    return { applicable: false, reason: 'path-mismatch' }
  }

  if (
    currentFile.status.kind !== AppFileStatusKind.Conflicted ||
    currentContent === undefined
  ) {
    return { applicable: false, reason: 'not-conflicted' }
  }

  if (
    resolution.conflictGeneration.statusFingerprint !== undefined &&
    resolution.conflictGeneration.statusFingerprint !==
      fingerprintCopilotConflictStatus(currentFile.status)
  ) {
    return { applicable: false, reason: 'conflict-stages-changed' }
  }

  if (
    hashCopilotConflictContent(currentContent) !==
    resolution.conflictGeneration.contentHash
  ) {
    return { applicable: false, reason: 'content-changed' }
  }

  return { applicable: true }
}

/**
 * Apply a generated resolution only after the caller's fresh status and file
 * read have passed the assessment. Keeping the write callback here makes the
 * no-write-on-refusal rule explicit and directly testable.
 */
export async function applyCopilotResolutionIfSafe(
  resolution: IFileResolution,
  currentFile: WorkingDirectoryFileChange | undefined,
  currentContent: string | undefined,
  write: () => Promise<void>
): Promise<ICopilotConflictApplicationAssessment> {
  const assessment = assessCopilotConflictApplication(
    resolution,
    currentFile,
    currentContent
  )
  if (!assessment.applicable) {
    return assessment
  }

  await write()
  return assessment
}
