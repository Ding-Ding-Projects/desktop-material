import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import {
  ConflictedFileStatus,
  GitStatusEntry,
  isManualConflict,
  ManualConflict,
} from '../../../models/status'
import * as octicons from '../../octicons/octicons.generated'

export type CopilotFileResolutionChoice = 'copilot' | 'ours' | 'theirs'

/** Label and icon for each resolution choice. */
export const resolutionChoices = {
  copilot: { label: 'Copilot', icon: octicons.copilot },
  ours: { label: 'Current', icon: octicons.chevronLeft },
  theirs: { label: 'Incoming', icon: octicons.chevronRight },
} as const

/**
 * Derive the resolution choice for a file from the manual resolutions map.
 * Defaults to 'copilot' when no manual override is set.
 */
export function getResolutionChoiceForFile(
  path: string,
  manualResolutions: Map<string, ManualConflictResolution>
): CopilotFileResolutionChoice {
  const manual = manualResolutions.get(path)
  if (manual === ManualConflictResolution.ours) {
    return 'ours'
  }
  if (manual === ManualConflictResolution.theirs) {
    return 'theirs'
  }
  return 'copilot'
}

/** Returns true for a modify/delete conflict that needs a keep/delete choice. */
export function isDeleteConflictFile(
  status: ConflictedFileStatus
): status is ManualConflict {
  if (!isManualConflict(status)) {
    return false
  }
  const { us, them } = status.entry
  return (
    (us === GitStatusEntry.Deleted && them !== GitStatusEntry.Deleted) ||
    (them === GitStatusEntry.Deleted && us !== GitStatusEntry.Deleted)
  )
}

/** Return the side that deleted a file in a modify/delete conflict. */
export function getDeletedSide(
  status: ManualConflict
): 'ours' | 'theirs' | undefined {
  if (status.entry.us === GitStatusEntry.Deleted) {
    return 'ours'
  }
  if (status.entry.them === GitStatusEntry.Deleted) {
    return 'theirs'
  }
  return undefined
}

/** Build delete-aware labels for the two sides of a modify/delete conflict. */
export function getDeleteConflictLabels(
  status: ManualConflict,
  ourBranch?: string,
  theirBranch?: string
): { readonly oursLabel: string; readonly theirsLabel: string } {
  const deletedSide = getDeletedSide(status)
  if (deletedSide === 'ours') {
    return {
      oursLabel: `Delete file${ourBranch ? ` on ${ourBranch}` : ''}`,
      theirsLabel: `Keep file${theirBranch ? ` from ${theirBranch}` : ''}`,
    }
  }
  return {
    oursLabel: `Keep file${ourBranch ? ` from ${ourBranch}` : ''}`,
    theirsLabel: `Delete file${theirBranch ? ` on ${theirBranch}` : ''}`,
  }
}

/** Return the concise label for the selected delete-aware choice. */
export function getDeleteConflictChoiceLabel(
  choice: CopilotFileResolutionChoice,
  status: ManualConflict
): string {
  if (choice === 'copilot') {
    return 'Copilot'
  }
  const deletedSide = getDeletedSide(status)
  if (deletedSide === 'ours') {
    return choice === 'ours' ? 'Delete file' : 'Keep file'
  }
  return choice === 'ours' ? 'Keep file' : 'Delete file'
}

/** Build labels for either a text conflict or a modify/delete conflict. */
export function getOursTheirsLabels(
  status: ConflictedFileStatus | undefined,
  ourBranch?: string,
  theirBranch?: string
): { readonly oursLabel: string; readonly theirsLabel: string } {
  if (status !== undefined && isDeleteConflictFile(status)) {
    return getDeleteConflictLabels(status, ourBranch, theirBranch)
  }
  return {
    oursLabel: ourBranch
      ? `Use current file from ${ourBranch}`
      : 'Use current file',
    theirsLabel: theirBranch
      ? `Use incoming file from ${theirBranch}`
      : 'Use incoming file',
  }
}
