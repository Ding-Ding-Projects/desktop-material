import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  md3ChangedFiles,
  md3ChangesFilterActive,
  Md3ChangesFilterId,
  Md3ChangesFilterIds,
  md3DiffLineCounts,
  md3FilterChangedFiles,
  md3IncludedFileCount,
} from '../../src/ui/md3/md3-destination-adapters'
import { IFileListFilterState } from '../../src/lib/app-state'
import { md3ChangeDetail } from '../../src/ui/md3/md3-changes-view'
import {
  AppFileStatus,
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'
import { DiffType, IDiff } from '../../src/models/diff/diff-data'
import { DiffLine, DiffLineType } from '../../src/models/diff/diff-line'
import { DiffHunk, DiffHunkExpansionType } from '../../src/models/diff/raw-diff'
import { DiffHunkHeader } from '../../src/models/diff/raw-diff'

/**
 * The adapter that turns the real working directory into Changes rows.
 *
 * It had no test, and it shipped the same class of defect the History adapter
 * did: a value that is present, correctly typed, and wrong. Every row was
 * handed `addedLineCount: 0` and `deletedLineCount: 0`, so every file in the
 * changed-file list rendered "modified · +0 −0 · ts · included" — a detail
 * line stating that a file which Git has just reported as changed is identical
 * to HEAD.
 *
 * The view's own tests could not see it. They build rows from
 * `md3-changes-view-fixtures.ts`, which carries real counts because its job is
 * to render the contract's full detail line, so the fixture can never
 * reproduce what the adapter actually produces. A defect only the real adapter
 * can create needs a test on the real adapter — this one.
 */

function statusOf(kind: AppFileStatusKind): AppFileStatus {
  switch (kind) {
    case AppFileStatusKind.Copied:
    case AppFileStatusKind.Renamed:
      return {
        kind,
        oldPath: 'old/path.ts',
        renameIncludesModifications: false,
      }
    case AppFileStatusKind.Untracked:
      return { kind }
    case AppFileStatusKind.Conflicted:
      return {
        kind,
        entry: {
          kind: 'text',
          us: 'M',
          them: 'M',
        } as never,
        conflictMarkerCount: 2,
      }
    default:
      return { kind }
  }
}

type Inclusion = 'all' | 'none' | 'partial'

function selectionOf(inclusion: Inclusion): DiffSelection {
  if (inclusion === 'all') {
    return DiffSelection.fromInitialSelection(DiffSelectionType.All)
  }
  if (inclusion === 'none') {
    return DiffSelection.fromInitialSelection(DiffSelectionType.None)
  }
  // One diverging line against an "all selected" default is exactly what a
  // half-staged file looks like.
  return DiffSelection.fromInitialSelection(
    DiffSelectionType.All
  ).withLineSelection(3, false)
}

function fileAt(
  path: string,
  kind: AppFileStatusKind = AppFileStatusKind.Modified,
  inclusion: Inclusion = 'all'
): WorkingDirectoryFileChange {
  return new WorkingDirectoryFileChange(
    path,
    statusOf(kind),
    selectionOf(inclusion)
  )
}

/** A textual diff with `added` added lines and `deleted` deleted ones. */
function textDiff(added: number, deleted: number): IDiff {
  const lines = [
    new DiffLine('@@ -1,4 +1,6 @@', DiffLineType.Hunk, 1, null, null),
    new DiffLine(' context', DiffLineType.Context, 2, 1, 1),
  ]
  for (let i = 0; i < added; i++) {
    lines.push(new DiffLine(`+added ${i}`, DiffLineType.Add, null, null, 2 + i))
  }
  for (let i = 0; i < deleted; i++) {
    lines.push(
      new DiffLine(`-deleted ${i}`, DiffLineType.Delete, null, 2 + i, null)
    )
  }

  return {
    kind: DiffType.Text,
    text: lines.map(line => line.text).join('\n'),
    hunks: [
      new DiffHunk(
        new DiffHunkHeader(1, 4, 1, 6),
        lines,
        0,
        lines.length - 1,
        DiffHunkExpansionType.None
      ),
    ],
    maxLineNumber: 40,
    hasHiddenBidiChars: false,
  }
}

const binaryDiff: IDiff = { kind: DiffType.Binary }

function filterState(
  overrides: Partial<IFileListFilterState> = {}
): IFileListFilterState {
  return {
    filterText: '',
    isIncludedInCommit: false,
    isExcludedFromCommit: false,
    isNewFile: false,
    isModifiedFile: false,
    isDeletedFile: false,
    isCheapLfsCandidate: false,
    ...overrides,
  }
}

describe('md3 changes adapter', () => {
  it('reports the loaded file’s real added and deleted line counts', () => {
    const files = [fileAt('app/src/ui/md3/md3-changes-view.tsx')]
    const rows = md3ChangedFiles(files, {
      path: 'app/src/ui/md3/md3-changes-view.tsx',
      diff: textDiff(12, 5),
    })

    assert.equal(rows[0].statsLoaded, true)
    assert.equal(rows[0].addedLineCount, 12)
    assert.equal(rows[0].deletedLineCount, 5)
    assert.equal(md3ChangeDetail(rows[0]), 'modified · +12 −5 · tsx · included')
  })

  it('never reports +0 −0 for a file whose diff has not been loaded', () => {
    // The shipped defect: `git status` says which files changed and never by
    // how much, so a row with no loaded diff has no counts. Printing them as
    // zeroes tells the user a changed file is unchanged.
    const files = [
      fileAt('app/src/lib/i18n-resources.ts'),
      fileAt('app/styles/ui/_md3-changes-view.scss'),
    ]
    const rows = md3ChangedFiles(files, {
      path: 'app/src/lib/i18n-resources.ts',
      diff: textDiff(3, 1),
    })

    const unloaded = rows[1]
    assert.equal(unloaded.statsLoaded, false)

    const detail = md3ChangeDetail(unloaded)
    assert.equal(detail, 'modified · scss · included')
    assert.ok(!detail.includes('+0'), detail)
    assert.ok(!detail.includes('−0'), detail)
  })

  it('loads counts for no row at all when nothing has been selected', () => {
    const rows = md3ChangedFiles([fileAt('Makefile')])
    assert.equal(rows[0].statsLoaded, false)
    assert.equal(md3ChangeDetail(rows[0]), 'modified · included')
  })

  it('claims no counts for a diff that carries no countable text', () => {
    // An image or a binary has a loaded diff and still no line totals. Zero
    // would be a confident answer about a file nobody counted.
    const rows = md3ChangedFiles([fileAt('app/static/logo.png')], {
      path: 'app/static/logo.png',
      diff: binaryDiff,
    })

    assert.equal(rows[0].statsLoaded, false)
    assert.equal(md3DiffLineCounts(binaryDiff), null)
    assert.equal(md3DiffLineCounts(null), null)
  })

  it('distinguishes a genuinely empty diff from an uncounted one', () => {
    // Zero is a real answer here — the diff loaded and changed no lines — so
    // it must survive as `{ added: 0, deleted: 0 }` rather than becoming null.
    const counts = md3DiffLineCounts(textDiff(0, 0))
    assert.deepEqual(counts, { added: 0, deleted: 0 })
  })

  it('does not lend one file’s counts to another row', () => {
    const rows = md3ChangedFiles(
      [fileAt('a.ts'), fileAt('b.ts'), fileAt('c.ts')],
      { path: 'b.ts', diff: textDiff(9, 4) }
    )

    assert.deepEqual(
      rows.map(row => [row.statsLoaded, row.addedLineCount]),
      [
        [false, 0],
        [true, 9],
        [false, 0],
      ]
    )
  })

  it('maps every status letter the badge tones key on', () => {
    const rows = md3ChangedFiles([
      fileAt('new.ts', AppFileStatusKind.New),
      fileAt('untracked.ts', AppFileStatusKind.Untracked),
      fileAt('copied.ts', AppFileStatusKind.Copied),
      fileAt('gone.ts', AppFileStatusKind.Deleted),
      fileAt('changed.ts', AppFileStatusKind.Modified),
      fileAt('moved.ts', AppFileStatusKind.Renamed),
      fileAt('clash.ts', AppFileStatusKind.Conflicted),
    ])

    assert.deepEqual(
      rows.map(row => row.status),
      ['A', 'A', 'A', 'D', 'M', 'M', 'M']
    )
  })

  it('maps the three inclusion states onto the row checkbox', () => {
    const rows = md3ChangedFiles([
      fileAt('all.ts', AppFileStatusKind.Modified, 'all'),
      fileAt('none.ts', AppFileStatusKind.Modified, 'none'),
      fileAt('some.ts', AppFileStatusKind.Modified, 'partial'),
    ])

    assert.deepEqual(
      rows.map(row => [row.included, row.partiallyIncluded]),
      [
        [true, false],
        [false, false],
        [true, true],
      ]
    )
  })

  it('shows every file while no filter chip is lit', () => {
    const files = [
      fileAt('new.ts', AppFileStatusKind.New),
      fileAt('gone.ts', AppFileStatusKind.Deleted),
      fileAt('changed.ts', AppFileStatusKind.Modified, 'none'),
    ]

    assert.equal(md3FilterChangedFiles(files, filterState()).length, 3)
  })

  it('narrows the list to the status a lit chip names', () => {
    const files = [
      fileAt('new.ts', AppFileStatusKind.New),
      fileAt('untracked.ts', AppFileStatusKind.Untracked),
      fileAt('gone.ts', AppFileStatusKind.Deleted),
      fileAt('changed.ts', AppFileStatusKind.Modified),
    ]

    assert.deepEqual(
      md3FilterChangedFiles(files, filterState({ isNewFile: true })).map(
        file => file.path
      ),
      // An untracked file counts as new, exactly as the existing changed-file
      // list has it. Re-deriving the predicate here would have dropped it.
      ['new.ts', 'untracked.ts']
    )

    assert.deepEqual(
      md3FilterChangedFiles(files, filterState({ isDeletedFile: true })).map(
        file => file.path
      ),
      ['gone.ts']
    )
  })

  it('narrows the list by inclusion state', () => {
    const files = [
      fileAt('in.ts', AppFileStatusKind.Modified, 'all'),
      fileAt('some.ts', AppFileStatusKind.Modified, 'partial'),
      fileAt('out.ts', AppFileStatusKind.Modified, 'none'),
    ]

    assert.deepEqual(
      md3FilterChangedFiles(
        files,
        filterState({ isIncludedInCommit: true })
      ).map(file => file.path),
      ['in.ts']
    )

    assert.deepEqual(
      md3FilterChangedFiles(
        files,
        filterState({ isExcludedFromCommit: true })
      ).map(file => file.path),
      ['out.ts']
    )
  })

  it('never empties the list over a size nobody measured', () => {
    // `isCheapLfsCandidate` matches on a file's size on disk, which this list
    // does not read, and the shared predicate fails closed on an unknown size.
    // Honouring it here would blank the list with no chip to unset.
    const files = [fileAt('big.bin'), fileAt('small.ts')]

    assert.equal(
      md3FilterChangedFiles(files, filterState({ isCheapLfsCandidate: true }))
        .length,
      2
    )
    assert.ok(
      !(Md3ChangesFilterIds as ReadonlyArray<string>).includes(
        'cheapLfsCandidate'
      )
    )
  })

  it('ignores the store’s own filter text, which the search field owns', () => {
    // Two controls writing one predicate means one of them silently wins. The
    // MD3 list's own search field applies the query, with its regex builder.
    const files = [fileAt('a.ts'), fileAt('b.ts')]

    assert.equal(
      md3FilterChangedFiles(files, filterState({ filterText: 'zzzz' })).length,
      2
    )
  })

  it('reads every chip’s lit state from the repository’s real filter', () => {
    const lit: Record<Md3ChangesFilterId, IFileListFilterState> = {
      included: filterState({ isIncludedInCommit: true }),
      excluded: filterState({ isExcludedFromCommit: true }),
      new: filterState({ isNewFile: true }),
      modified: filterState({ isModifiedFile: true }),
      deleted: filterState({ isDeletedFile: true }),
    }

    for (const id of Md3ChangesFilterIds) {
      assert.equal(
        md3ChangesFilterActive(lit[id], id),
        true,
        `${id} did not read its own filter flag`
      )
      assert.equal(
        md3ChangesFilterActive(filterState(), id),
        false,
        `${id} reported itself lit against an empty filter`
      )
      // A chip must read its own flag and no other's, or two chips light
      // together and neither one can be turned off.
      for (const other of Md3ChangesFilterIds) {
        if (other !== id) {
          assert.equal(
            md3ChangesFilterActive(lit[other], id),
            false,
            `${id} lit up when ${other} was the filter that was set`
          )
        }
      }
    }
  })

  it('counts a partially included file towards the include-all label', () => {
    // The tri-state pill reads "n of m included"; a half-staged file is going
    // into the commit, so excluding it from the count would under-report what
    // the next commit contains.
    const files = [
      fileAt('all.ts', AppFileStatusKind.Modified, 'all'),
      fileAt('some.ts', AppFileStatusKind.Modified, 'partial'),
      fileAt('none.ts', AppFileStatusKind.Modified, 'none'),
    ]

    assert.equal(md3IncludedFileCount(files), 2)
  })
})
