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
  | 'conflict-stages-unavailable'
  | 'conflict-stages-changed'
  | 'content-changed'
  | 'binary-conflict'
  | 'delete-modify-conflict'
  | 'rename-conflict'
  | 'manual-only-conflict'
  | 'non-utf8-content'
  | 'illegal-resolution'

export interface ICopilotConflictApplicationAssessment {
  readonly applicable: boolean
  readonly reason?: CopilotConflictApplicationRefusalReason
}

export interface ICopilotConflictApplicationResult {
  readonly written: ReadonlyArray<string>
  readonly staged: ReadonlyArray<string>
  readonly skipped: ReadonlyArray<{
    readonly path: string
    readonly reason: string
  }>
}

export interface ICopilotConflictStageEntry {
  readonly mode: string
  readonly objectId: string
  readonly stage: string
  readonly path: string
}

/** Hash the exact bytes that were reviewed by Copilot. */
export function hashCopilotConflictContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Fingerprint the exact path-scoped unmerged index records. Mode, object id,
 * and stage are all included because status letters alone cannot prove that
 * the same conflict was reviewed.
 */
export function fingerprintCopilotConflictStages(
  path: string,
  stages: ReadonlyArray<ICopilotConflictStageEntry>
): string {
  const pathStages = stages.filter(stage => stage.path === path)
  if (pathStages.length === 0) {
    return ''
  }

  return JSON.stringify({
    path,
    stages: pathStages
      .sort((left, right) => left.stage.localeCompare(right.stage))
      .map(stage => ({
        mode: stage.mode,
        objectId: stage.objectId,
        stage: stage.stage,
        path: stage.path,
      })),
  })
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
  currentContent: string | undefined,
  currentStageFingerprint: string | undefined
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

  if (currentContent.includes('\0')) {
    return { applicable: false, reason: 'binary-conflict' }
  }

  if (currentContent.includes('\ufffd')) {
    return { applicable: false, reason: 'non-utf8-content' }
  }

  if (
    /^<{7}/m.test(resolution.resolvedContent) ||
    /^={7}$/m.test(resolution.resolvedContent) ||
    /^>{7}/m.test(resolution.resolvedContent)
  ) {
    return { applicable: false, reason: 'illegal-resolution' }
  }

  const action = String(currentFile.status.entry.action)
  const isDeleteModify = action.includes('deleted-by-')
  if (isDeleteModify && resolution.resolutionAction === undefined) {
    return { applicable: false, reason: 'delete-modify-conflict' }
  }
  if (!isDeleteModify && resolution.resolutionAction !== undefined) {
    return { applicable: false, reason: 'illegal-resolution' }
  }
  if (action.includes('rename')) {
    return { applicable: false, reason: 'rename-conflict' }
  }
  if (!('conflictMarkerCount' in currentFile.status)) {
    return { applicable: false, reason: 'manual-only-conflict' }
  }

  if (currentStageFingerprint === undefined || currentStageFingerprint === '') {
    return { applicable: false, reason: 'conflict-stages-unavailable' }
  }

  if (
    currentStageFingerprint !== resolution.conflictGeneration.stageFingerprint
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
  currentStageFingerprint: string | undefined,
  write: () => Promise<void>
): Promise<ICopilotConflictApplicationAssessment> {
  const assessment = assessCopilotConflictApplication(
    resolution,
    currentFile,
    currentContent,
    currentStageFingerprint
  )
  if (!assessment.applicable) {
    return assessment
  }

  await write()
  return assessment
}
