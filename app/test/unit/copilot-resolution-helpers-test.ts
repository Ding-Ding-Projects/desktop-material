import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  getDeleteConflictChoiceLabel,
  getDeleteConflictLabels,
  getOursTheirsLabels,
} from '../../src/ui/multi-commit-operation/dialog/copilot-resolution-helpers'
import {
  AppFileStatusKind,
  GitStatusEntry,
  ManualConflict,
  UnmergedEntrySummary,
} from '../../src/models/status'

function modifyDeleteStatus(deletedSide: 'ours' | 'theirs'): ManualConflict {
  if (deletedSide === 'ours') {
    return {
      kind: AppFileStatusKind.Conflicted,
      entry: {
        kind: 'conflicted' as const,
        action: UnmergedEntrySummary.DeletedByUs,
        us: GitStatusEntry.Deleted,
        them: GitStatusEntry.UpdatedButUnmerged,
      },
    }
  }
  return {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted' as const,
      action: UnmergedEntrySummary.DeletedByThem,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.Deleted,
    },
  }
}

describe('copilot resolution choice labels', () => {
  it('keeps current and incoming labels factual for text conflicts', () => {
    const labels = getOursTheirsLabels(undefined, 'main', 'feature')
    assert.equal(labels.oursLabel, 'Use current file from main')
    assert.equal(labels.theirsLabel, 'Use incoming file from feature')
  })

  it('maps deleted and modified sides to keep/delete labels', () => {
    const oursDeleted = modifyDeleteStatus('ours')
    const labels = getDeleteConflictLabels(oursDeleted, 'main', 'feature')
    assert.equal(labels.oursLabel, 'Delete file on main')
    assert.equal(labels.theirsLabel, 'Keep file from feature')
    assert.equal(
      getDeleteConflictChoiceLabel('ours', oursDeleted),
      'Delete file'
    )
    assert.equal(
      getDeleteConflictChoiceLabel('theirs', oursDeleted),
      'Keep file'
    )

    const theirsDeleted = modifyDeleteStatus('theirs')
    assert.equal(
      getDeleteConflictLabels(theirsDeleted, 'main', 'feature').theirsLabel,
      'Delete file on feature'
    )
  })
})
