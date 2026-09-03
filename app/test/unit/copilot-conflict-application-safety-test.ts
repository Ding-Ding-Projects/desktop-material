import assert from 'assert'
import { describe, it } from 'node:test'
import { execFileSync } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  AppFileStatus,
  AppFileStatusKind,
  GitStatusEntry,
  ConflictsWithMarkers,
  ManualConflict,
  UnmergedEntrySummary,
  WorkingDirectoryFileChange,
} from '../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'
import { IFileResolution } from '../../src/lib/copilot-conflict-resolution'
import {
  applyCopilotResolutionIfSafe,
  assessCopilotConflictApplication,
  fingerprintCopilotConflictStages,
  hashCopilotConflictContent,
} from '../../src/lib/copilot-conflict-application-safety'
import {
  MaxConflictResolutionReferences,
  MaxConflictResolutionResolvedContentBytes,
  MaxConflictResolutionSummaryBytes,
  parseCopilotConflictResolution,
} from '../../src/lib/copilot-conflict-resolution'

const reviewedContent = [
  'before',
  '<<<<<<< ours',
  'ours',
  '=======',
  'theirs',
  '>>>>>>> theirs',
  'after',
].join('\n')

const bothModifiedStatus: ConflictsWithMarkers = {
  kind: AppFileStatusKind.Conflicted as const,
  entry: {
    kind: 'conflicted' as const,
    action: UnmergedEntrySummary.BothModified,
    us: GitStatusEntry.UpdatedButUnmerged,
    them: GitStatusEntry.UpdatedButUnmerged,
  },
  conflictMarkerCount: 1,
}

const bothAddedStatus: ConflictsWithMarkers = {
  kind: AppFileStatusKind.Conflicted as const,
  entry: {
    kind: 'conflicted' as const,
    action: UnmergedEntrySummary.BothAdded,
    us: GitStatusEntry.Added,
    them: GitStatusEntry.Added,
  },
  conflictMarkerCount: 1,
}

const reviewedStages = [
  {
    mode: '100644',
    objectId: 'a'.repeat(40),
    stage: '2',
    path: 'src/file.ts',
  },
  {
    mode: '100644',
    objectId: 'b'.repeat(40),
    stage: '3',
    path: 'src/file.ts',
  },
]

const deletedByThemStatus: ManualConflict = {
  kind: AppFileStatusKind.Conflicted,
  entry: {
    kind: 'conflicted',
    action: UnmergedEntrySummary.DeletedByThem,
    us: GitStatusEntry.UpdatedButUnmerged,
    them: GitStatusEntry.Deleted,
  },
}
const reviewedStageFingerprint = fingerprintCopilotConflictStages(
  'src/file.ts',
  reviewedStages
)

function file(path: string, status: AppFileStatus = bothModifiedStatus) {
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
      stageFingerprint: fingerprintCopilotConflictStages(
        path,
        reviewedStages.map(stage => ({ ...stage, path }))
      ),
      conflictType: 'text',
    },
  }
}

describe('Copilot conflict application safety', () => {
  it('allows a still-conflicted file whose reviewed status and content match', () => {
    assert.deepEqual(
      assessCopilotConflictApplication(
        resolution('src/file.ts'),
        file('src/file.ts'),
        reviewedContent,
        reviewedStageFingerprint
      ),
      { applicable: true }
    )
  })

  it('refuses a file resolved externally after generation', () => {
    const result = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      undefined,
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
      reviewedContent,
      fingerprintCopilotConflictStages('src/file.ts', [
        ...reviewedStages,
        { ...reviewedStages[0], objectId: 'c'.repeat(40) },
      ])
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
      undefined,
      reviewedStageFingerprint
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
      `${reviewedContent}\nmanual edit`,
      reviewedStageFingerprint
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
        reviewedContent,
        fingerprintCopilotConflictStages('src/one.ts', [
          ...reviewedStages.map(stage => ({ ...stage, path: 'src/one.ts' })),
        ])
      ),
      assessCopilotConflictApplication(
        resolution('src/two.ts'),
        file('src/two.ts', bothAddedStatus),
        reviewedContent,
        fingerprintCopilotConflictStages('src/two.ts', [
          ...reviewedStages.map(stage => ({ ...stage, path: 'src/two.ts' })),
          {
            ...reviewedStages[0],
            path: 'src/two.ts',
            objectId: 'c'.repeat(40),
          },
        ])
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
        reviewedContent,
        index === 0
          ? fingerprintCopilotConflictStages(
              `src/${index}.ts`,
              reviewedStages.map(stage => ({
                ...stage,
                path: `src/${index}.ts`,
              }))
            )
          : 'different-stage-fingerprint'
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
      undefined,
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

  it('binds exact Git stage object ids even when the status remains UU', async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), 'copilot-conflict-'))
    const runGit = (...args: string[]) => ({
      stdout: execFileSync('git', args, {
        cwd: repositoryPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    })

    try {
      await runGit('init', '-q')
      await runGit('config', 'user.email', 'test@example.invalid')
      await runGit('config', 'user.name', 'Conflict Safety Test')
      const baseBranch = (await runGit('branch', '--show-current')).stdout
        .toString()
        .trim()
      await writeFile(join(repositoryPath, 'conflict.txt'), 'base\n')
      await runGit('add', '--', 'conflict.txt')
      await runGit('commit', '-qm', 'base')
      await runGit('branch', 'incoming')
      await runGit('checkout', '-q', 'incoming')
      await writeFile(join(repositoryPath, 'conflict.txt'), 'incoming\n')
      await runGit('commit', '-qam', 'incoming')
      await runGit('checkout', '-q', baseBranch)
      await writeFile(join(repositoryPath, 'conflict.txt'), 'current\n')
      await runGit('commit', '-qam', 'current')
      try {
        runGit('merge', '--no-commit', '--no-edit', 'incoming')
      } catch {
        // Expected: the merge leaves conflict stages in the index.
      }

      const initial = await runGit('ls-files', '-u', '--', 'conflict.txt')
      const initialEntries = initial.stdout
        .toString()
        .trim()
        .split(/\r?\n/)
        .map(record => {
          const [header, path] = record.split('\t')
          const [mode, objectId, stage] = header.split(' ')
          return { mode, objectId, stage, path }
        })
      assert.deepEqual(initialEntries.map(entry => entry.stage).sort(), [
        '1',
        '2',
        '3',
      ])

      const initialFingerprint = fingerprintCopilotConflictStages(
        'conflict.txt',
        initialEntries
      )
      const reviewedWorkingContent = await readFile(
        join(repositoryPath, 'conflict.txt'),
        'utf8'
      )
      const replacementBlob = execFileSync(
        'git',
        ['hash-object', '-w', '--stdin'],
        {
          cwd: repositoryPath,
          input: 'replacement\n',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      )
        .toString()
        .trim()
      execFileSync('git', ['update-index', '--index-info'], {
        cwd: repositoryPath,
        input: `100644 ${replacementBlob} 2\tconflict.txt\n`,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const changed = await runGit('ls-files', '-u', '--', 'conflict.txt')
      const changedEntries = changed.stdout
        .toString()
        .trim()
        .split(/\r?\n/)
        .map(record => {
          const [header, path] = record.split('\t')
          const [mode, objectId, stage] = header.split(' ')
          return { mode, objectId, stage, path }
        })
      assert.deepEqual(changedEntries.map(entry => entry.stage).sort(), [
        '1',
        '2',
        '3',
      ])
      assert.notEqual(
        fingerprintCopilotConflictStages('conflict.txt', changedEntries),
        initialFingerprint
      )
      assert.equal(
        await readFile(join(repositoryPath, 'conflict.txt'), 'utf8'),
        reviewedWorkingContent
      )
    } finally {
      await rm(repositoryPath, { recursive: true, force: true })
    }
  })

  it('refuses binary, delete-modify, rename, and manual-only conflicts', () => {
    const binary = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      file('src/file.ts'),
      '\0binary',
      reviewedStageFingerprint
    )
    assert.equal(binary.reason, 'binary-conflict')

    const deleteModify = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      file('src/file.ts', deletedByThemStatus),
      reviewedContent,
      reviewedStageFingerprint
    )
    assert.equal(deleteModify.reason, 'delete-modify-conflict')

    const illegalTextAction = assessCopilotConflictApplication(
      { ...resolution('src/file.ts'), resolutionAction: 'delete' },
      file('src/file.ts'),
      reviewedContent,
      reviewedStageFingerprint
    )
    assert.equal(illegalTextAction.reason, 'illegal-resolution')

    const allowedDeleteModifyAction = assessCopilotConflictApplication(
      { ...resolution('src/file.ts'), resolutionAction: 'keep' },
      file('src/file.ts', deletedByThemStatus),
      reviewedContent,
      reviewedStageFingerprint
    )
    assert.equal(allowedDeleteModifyAction.applicable, true)

    const rename = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      file('src/file.ts', {
        ...bothModifiedStatus,
        entry: { ...bothModifiedStatus.entry, action: 'rename' as never },
      }),
      reviewedContent,
      reviewedStageFingerprint
    )
    assert.equal(rename.reason, 'rename-conflict')

    const manualOnly = assessCopilotConflictApplication(
      resolution('src/file.ts'),
      file(
        'src/file.ts',
        (() => {
          const { conflictMarkerCount: _ignored, ...manualStatus } =
            bothModifiedStatus
          return manualStatus
        })()
      ),
      reviewedContent,
      reviewedStageFingerprint
    )
    assert.equal(manualOnly.reason, 'manual-only-conflict')
  })

  it('rejects oversized response fields before reassembly', () => {
    const base = {
      path: 'src/file.ts',
      hunks: [{ resolvedContent: 'ok' }],
      reasoning: 'reason',
    }
    const oversizedSummary = JSON.stringify({
      summary: 'x'.repeat(MaxConflictResolutionSummaryBytes + 1),
      references: [],
      resolutions: [base],
    })
    assert.throws(() => parseCopilotConflictResolution(oversizedSummary))

    const oversizedResolved = JSON.stringify({
      summary: null,
      references: [],
      resolutions: [
        {
          ...base,
          hunks: [
            {
              resolvedContent: 'x'.repeat(
                MaxConflictResolutionResolvedContentBytes + 1
              ),
            },
          ],
        },
      ],
    })
    assert.throws(() => parseCopilotConflictResolution(oversizedResolved))

    const oversizedReferences = JSON.stringify({
      summary: null,
      references: new Array(MaxConflictResolutionReferences + 1).fill({
        type: 'commit',
        id: 'a'.repeat(7),
      }),
      resolutions: [base],
    })
    assert.throws(() => parseCopilotConflictResolution(oversizedReferences))
  })
})
