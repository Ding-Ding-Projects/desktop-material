import assert from 'assert'
import { describe, it } from 'node:test'

import {
  AppFileStatusKind,
  GitStatusEntry,
  UnmergedEntrySummary,
  WorkingDirectoryFileChange,
} from '../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'
import { IFileResolution } from '../../src/lib/copilot-conflict-resolution'
import {
  applyCopilotResolutionIfSafe,
  assessCopilotConflictApplication,
  fingerprintCopilotConflictStatus,
  hashCopilotConflictContent,
} from '../../src/lib/copilot-conflict-application-safety'

const reviewedContent = [
  'before',
  '<<<<<<< ours',
  'ours',
  '=======',
  'theirs',
  '>>>>>>> theirs',
  'after',
].join('\n')

const bothModifiedStatus = {
  kind: AppFileStatusKind.Conflicted as const,
  entry: {
    kind: 'conflicted' as const,
    action: UnmergedEntrySummary.BothModified,
    us: GitStatusEntry.UpdatedButUnmerged,
    them: GitStatusEntry.UpdatedButUnmerged,
  },
  conflictMarkerCount: 1,
}

const bothAddedStatus = {
  kind: AppFileStatusKind.Conflicted as const,
  entry: {
    kind: 'conflicted' as const,
    action: UnmergedEntrySummary.BothAdded,
    us: GitStatusEntry.Added,
    them: GitStatusEntry.Added,
  },
  conflictMarkerCount: 1,
}

function file(
  path: string,
  status:
    | typeof bothModifiedStatus
    | typeof bothAddedStatus = bothModifiedStatus
) {
  return new WorkingDirectoryFileChange(
    path,
    status,
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

function resolution(path: string, content = 'resolved'): IFileResolution {
  return {
    path,
    resolvedContent: content,
    reasoning: 'kept the reviewed conflict context',
    conflictGeneration: {
      contentHash: hashCopilotConflictContent(reviewedContent),
      statusFingerprint: fingerprintCopilotConflictStatus(bothModifiedStatus),
    },
  }
}

describe('Copilot conflict application safety', () => {
  it('allows a still-conflicted file whose reviewed status and content match', () => {
    assert.deepEqual(
      assessCopilotConflictApplication(
        resolution('src/file.ts'),
        file('src/file.ts'),
        reviewedContent
      ),
      { applicable: true }
    )
  })

  it('refuses a file resolved externally after generation', () => {
    const result = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      undefined,
      undefined
    )

    assert.equal(result.applicable, false)
    assert.equal(result.reason, 'path-mismatch')
  })

  it('refuses when the conflict stages changed after generation', () => {
    const result = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      file('src/file.ts', bothAddedStatus),
      reviewedContent
    )

    assert.deepEqual(result, {
      applicable: false,
      reason: 'conflict-stages-changed',
    })
  })

  it('refuses when the reviewed file was deleted or cannot be read', () => {
    const result = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      file('src/file.ts'),
      undefined
    )

    assert.deepEqual(result, {
      applicable: false,
      reason: 'not-conflicted',
    })
  })

  it('refuses changed content even when the file remains conflicted', () => {
    const result = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      file('src/file.ts'),
      `${reviewedContent}\nmanual edit`
    )

    assert.deepEqual(result, {
      applicable: false,
      reason: 'content-changed',
    })
  })

  it('keeps partial batches safe, applying only matching files', () => {
    const results = [
      assessCopilotConflictApplication(
        resolution('src/one.ts'),
        file('src/one.ts'),
        reviewedContent
      ),
      assessCopilotConflictApplication(
        resolution('src/two.ts'),
        file('src/two.ts', bothAddedStatus),
        reviewedContent
      ),
    ]

    assert.deepEqual(
      results.map(result => result.applicable),
      [true, false]
    )
    assert.equal(results[1].reason, 'conflict-stages-changed')
  })

  it('rechecks each file in race order instead of reusing the first status', () => {
    const observedStatuses = [bothModifiedStatus, bothAddedStatus]
    const results = observedStatuses.map((status, index) =>
      assessCopilotConflictApplication(
        resolution(`src/${index}.ts`),
        file(`src/${index}.ts`, status),
        reviewedContent
      )
    )

    assert.deepEqual(
      results.map(result => result.reason ?? 'applicable'),
      ['applicable', 'conflict-stages-changed']
    )
  })

  it('fails closed without a generation identity, so no write is permitted', async () => {
    const unboundResolution: IFileResolution = {
      path: 'src/file.ts',
      resolvedContent: 'must not replace the file',
      reasoning: 'missing reviewed identity',
    }

    let writeCount = 0
    const result = await applyCopilotResolutionIfSafe(
      unboundResolution,
      file('src/file.ts'),
      reviewedContent,
      async () => {
        writeCount++
      }
    )

    assert.deepEqual(result, {
      applicable: false,
      reason: 'missing-generation',
    })
    assert.equal(writeCount, 0)
  })
})
