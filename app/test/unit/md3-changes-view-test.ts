import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  md3ChangeDetail,
  md3ChangeDirectory,
  md3ChangeExtension,
  md3ChangeExportRecord,
  md3ChangeName,
  md3ChangesBulkActions,
  md3ChangesExcludable,
  md3ChangesFiltersActive,
  md3ChangesIncludable,
  md3IncludeAllIcon,
  md3SummaryHint,
  md3VisibleChangedFiles,
  Md3ChangeExportColumns,
  IMd3ChangedFile,
} from '../../src/ui/md3/md3-changes-view'
import { serializeMd3ListExport } from '../../src/ui/md3/md3-list-export'
import {
  md3ChangesFixture,
  md3ChangesIncludedCount,
} from '../../src/ui/md3/md3-changes-view-fixtures'

/**
 * The Changes destination's pure derivations.
 *
 * Every assertion starts from the design contract's own literals
 * (`design/History MD3.dc.html`, the `isChanges` branch and the `changeRows`
 * / `allCheckIcon` / `summaryHint` values in `renderVals()`), so a row that
 * stops rendering the shape the contract specified fails rather than merely
 * looking different.
 */

const find = (path: string): IMd3ChangedFile => {
  const file = md3ChangesFixture.find(candidate => candidate.path === path)
  assert.ok(file !== undefined, `fixture ${path} is missing`)
  return file
}

describe('md3 changes view', () => {
  it('splits a path into the contract name and directory lines', () => {
    assert.equal(
      md3ChangeName('app/src/ui/md3/md3-changes-view.tsx'),
      'md3-changes-view.tsx'
    )
    assert.equal(
      md3ChangeDirectory('app/src/ui/md3/md3-changes-view.tsx'),
      'app/src/ui/md3'
    )
  })

  it('leaves the directory line empty for a repository-root file', () => {
    assert.equal(md3ChangeName('Makefile'), 'Makefile')
    assert.equal(md3ChangeDirectory('Makefile'), '')
  })

  it('reports no extension rather than repeating the filename', () => {
    // The contract's `path.split('.').pop()` answers "Makefile" here, which
    // would have the row claim the file is of type "Makefile".
    assert.equal(md3ChangeExtension('Makefile'), undefined)
    assert.equal(md3ChangeExtension('.gitignore'), undefined)
    assert.equal(md3ChangeExtension('app/styles/_ui.scss'), 'scss')
  })

  it('renders the contract detail line for a new included file', () => {
    assert.equal(
      md3ChangeDetail(find('app/src/ui/md3/md3-changes-view.tsx')),
      'new file · +218 −0 · tsx · included'
    )
  })

  it('renders the contract detail line for an excluded deletion', () => {
    assert.equal(
      md3ChangeDetail(find('docs/features/changes/legacy-sidebar.md')),
      'deleted · +0 −58 · md · excluded'
    )
  })

  it('renders the contract detail line for a modified file', () => {
    assert.equal(
      md3ChangeDetail(find('app/src/lib/i18n-resources.ts')),
      'modified · +74 −3 · ts · excluded'
    )
  })

  it('counts a partially included file as included', () => {
    const detail = md3ChangeDetail(find('app/styles/ui/_md3-changes-view.scss'))
    assert.ok(detail.endsWith('· included'), detail)
  })

  it('omits the extension segment instead of leaving an empty one', () => {
    const detail = md3ChangeDetail(find('Makefile'))
    assert.equal(detail, 'modified · +4 −4 · included')
    assert.ok(!detail.includes('· ·'), detail)
  })

  it('uses the minus sign the contract writes, not a hyphen', () => {
    assert.ok(md3ChangeDetail(find('Makefile')).includes('−4'))
    assert.ok(!md3ChangeDetail(find('Makefile')).includes('-4'))
  })

  it('picks the contract include-all glyph for each of the three states', () => {
    assert.equal(md3IncludeAllIcon(8, 8), 'check_box')
    assert.equal(md3IncludeAllIcon(0, 8), 'check_box_outline_blank')
    assert.equal(md3IncludeAllIcon(3, 8), 'indeterminate_check_box')
  })

  it('never claims everything is included when there is nothing at all', () => {
    // `0 === 0` would otherwise report a clean tree as fully included, and
    // pressing the toggle would then try to exclude files that do not exist.
    assert.equal(md3IncludeAllIcon(0, 0), 'check_box_outline_blank')
  })

  it('renders the contract summary hint on both sides of the guide', () => {
    assert.equal(md3SummaryHint(0), '0/50')
    assert.equal(md3SummaryHint(50), '50/50')
    assert.equal(md3SummaryHint(51), '51/50 — summary is long')
  })

  it('drops the line-count segment for a file whose diff is not loaded', () => {
    // Not "+0 −0". Every row in this list is a file Git has just reported as
    // changed, so a zero pair would be a confident statement that the file is
    // identical to HEAD. The fixture cannot show this — every fixture row
    // carries real counts — so the unloaded row is built here.
    const unloaded: IMd3ChangedFile = {
      ...find('app/src/lib/i18n-resources.ts'),
      statsLoaded: false,
    }

    const detail = md3ChangeDetail(unloaded)
    assert.equal(detail, 'modified · ts · excluded')
    assert.ok(!detail.includes('+'), detail)
    assert.ok(!detail.includes('−'), detail)
    assert.ok(!detail.includes('· ·'), detail)
  })

  it('still renders a real zero when the loaded diff genuinely has none', () => {
    // A new file with no deletions is a true +218 −0, and the segment stays.
    assert.ok(
      md3ChangeDetail(find('app/src/ui/md3/md3-changes-view.tsx')).includes(
        '+218 −0'
      )
    )
  })

  it('filters the list by a plain-text query against the whole path', () => {
    const visible = md3VisibleChangedFiles(md3ChangesFixture, 'md3', false)
    assert.ok(visible.length > 0)
    assert.ok(visible.length < md3ChangesFixture.length)
    assert.ok(visible.every(file => file.path.toLowerCase().includes('md3')))
  })

  it('matches a plain-text query case-insensitively', () => {
    assert.deepEqual(
      md3VisibleChangedFiles(md3ChangesFixture, 'MAKEFILE', false).map(
        file => file.path
      ),
      ['Makefile']
    )
  })

  it('applies a regular expression only once regex mode is on', () => {
    // Plain-text mode treats the pattern as literal characters, so a query
    // that would match everything as a regex matches nothing as text.
    assert.equal(
      md3VisibleChangedFiles(md3ChangesFixture, '\\.tsx$', false).length,
      0
    )

    const regex = md3VisibleChangedFiles(md3ChangesFixture, '\\.tsx$', true)
    assert.ok(regex.length > 0)
    assert.ok(regex.every(file => file.path.endsWith('.tsx')))
  })

  it('keeps every row visible while a regex is still being typed', () => {
    // A half-typed "(" must not blank the list; an empty list reads as a
    // working tree that emptied itself rather than as an unfinished pattern.
    assert.equal(
      md3VisibleChangedFiles(md3ChangesFixture, '(', true).length,
      md3ChangesFixture.length
    )
  })

  it('shows the whole working tree for an empty or blank query', () => {
    assert.equal(
      md3VisibleChangedFiles(md3ChangesFixture, '', false).length,
      md3ChangesFixture.length
    )
    assert.equal(
      md3VisibleChangedFiles(md3ChangesFixture, '   ', false).length,
      md3ChangesFixture.length
    )
  })

  it('ships a fixture that exercises every status and both inclusion states', () => {
    const statuses = new Set(md3ChangesFixture.map(file => file.status))
    assert.deepEqual([...statuses].sort(), ['A', 'D', 'M'])
    assert.ok(md3ChangesIncludedCount > 0)
    assert.ok(md3ChangesIncludedCount < md3ChangesFixture.length)
    assert.ok(
      md3ChangesFixture.some(file => file.partiallyIncluded === true),
      'no fixture row exercises the partial-inclusion glyph'
    )
  })
})

/**
 * The bulk wiring, not the selection algebra.
 *
 * `md3-list-selection.ts` already proves what a range or a select-all does to
 * an id set; what can only be wrong here is this view's own answers — whether
 * a filter is on, which rows a verb can touch, whether the destructive verb
 * carries its gate, and whether the export writes every column it declares.
 */
describe('md3 changes bulk actions', () => {
  const noop = () => {}

  const file = (
    overrides: Partial<IMd3ChangedFile> & { readonly path: string }
  ): IMd3ChangedFile => ({
    status: 'M',
    included: false,
    statsLoaded: false,
    addedLineCount: 0,
    deletedLineCount: 0,
    ...overrides,
  })

  const chip = (id: string, active: boolean) => ({
    id,
    label: id,
    active,
    onToggle: noop,
  })

  describe('md3ChangesFiltersActive', () => {
    it('is false with no query and no chip set', () => {
      assert.equal(md3ChangesFiltersActive('', undefined), false)
      assert.equal(md3ChangesFiltersActive('', [chip('new', false)]), false)
    })

    it('is true while a query is narrowing the list', () => {
      assert.equal(md3ChangesFiltersActive('scss', undefined), true)
    })

    it('is true while any chip is narrowing the list', () => {
      assert.equal(
        md3ChangesFiltersActive('', [
          chip('new', false),
          chip('deleted', true),
        ]),
        true
      )
    })

    it('treats a whitespace-only query as no query, as the matcher does', () => {
      // `md3VisibleChangedFiles` trims before matching, so "   " hides nothing.
      // Reporting it as a filter would make the select-all claim a scope the
      // list is not actually narrowed to.
      assert.equal(
        md3VisibleChangedFiles(md3ChangesFixture, '   ', false).length,
        md3ChangesFixture.length
      )
      assert.equal(md3ChangesFiltersActive('   ', undefined), false)
    })
  })

  describe('the visible-id list', () => {
    it('holds exactly the paths that survive the query', () => {
      const visible = md3VisibleChangedFiles(md3ChangesFixture, 'md3', false)
      assert.ok(visible.length > 0)
      assert.ok(visible.length < md3ChangesFixture.length)
      assert.deepEqual(
        visible.map(f => f.path),
        md3ChangesFixture
          .filter(f => f.path.toLowerCase().includes('md3'))
          .map(f => f.path)
      )
    })
  })

  describe('partitions', () => {
    it('excludes the already-included rows from Include, with a reason', () => {
      const rows = [
        file({ path: 'a', included: true }),
        file({ path: 'b', included: false }),
        file({ path: 'c', included: true, partiallyIncluded: true }),
      ]
      const partition = md3ChangesIncludable(rows)
      assert.deepEqual(
        partition.applied.map(f => f.path),
        // A partially included file is still changed by Include: it goes whole.
        ['b', 'c']
      )
      assert.deepEqual(
        partition.excluded.map(f => f.path),
        ['a']
      )
      assert.notEqual(partition.reason, null)
    })

    it('excludes the already-excluded rows from Exclude', () => {
      const rows = [
        file({ path: 'a', included: true }),
        file({ path: 'b', included: false }),
        file({ path: 'c', included: false, partiallyIncluded: true }),
      ]
      const partition = md3ChangesExcludable(rows)
      assert.deepEqual(
        partition.applied.map(f => f.path),
        ['a', 'c']
      )
      assert.deepEqual(
        partition.excluded.map(f => f.path),
        ['b']
      )
      assert.notEqual(partition.reason, null)
    })

    it('reports no reason when nothing is skipped', () => {
      const partition = md3ChangesIncludable([file({ path: 'a' })])
      assert.equal(partition.excluded.length, 0)
      assert.equal(partition.reason, null)
    })
  })

  describe('md3ChangesBulkActions', () => {
    const spec = (
      overrides: Partial<Parameters<typeof md3ChangesBulkActions>[0]> = {}
    ) => ({
      includable: md3ChangesIncludable([file({ path: 'a' })]),
      excludable: md3ChangesExcludable([file({ path: 'a' })]),
      scopeCount: 1,
      onInclude: noop,
      onExclude: noop,
      ...overrides,
    })

    it('offers only the verbs whose handler the host supplied', () => {
      assert.deepEqual(
        md3ChangesBulkActions(spec()).map(a => a.id),
        ['include', 'exclude']
      )
      assert.deepEqual(
        md3ChangesBulkActions(spec({ onCopyPaths: noop, onDiscard: noop })).map(
          a => a.id
        ),
        ['include', 'exclude', 'copyPaths', 'discard']
      )
    })

    it('routes the discard through the destructive gate', () => {
      const discard = md3ChangesBulkActions(spec({ onDiscard: noop })).find(
        a => a.id === 'discard'
      )
      assert.equal(discard?.destructive, true)
      // `dialog` is what tells assistive technology a gate is coming rather
      // than the files vanishing on the click.
      assert.equal(discard?.hasPopup, 'dialog')
    })

    it('disables Include by the partition, never by the scope size', () => {
      // Ten rows in scope and none of them includable is a button that would
      // change nothing; enabling it invites a click that reports ten.
      const rows = [
        file({ path: 'a', included: true }),
        file({ path: 'b', included: true }),
      ]
      const actions = md3ChangesBulkActions(
        spec({
          includable: md3ChangesIncludable(rows),
          excludable: md3ChangesExcludable(rows),
          scopeCount: rows.length,
        })
      )
      assert.equal(actions.find(a => a.id === 'include')?.disabled, true)
      assert.equal(actions.find(a => a.id === 'exclude')?.disabled, false)
    })
  })

  describe('the export', () => {
    it('carries every declared column for every row', () => {
      const record = md3ChangeExportRecord(
        find('app/src/ui/md3/md3-changes-view.tsx')
      )
      for (const column of Md3ChangeExportColumns) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(record, column.name),
          `export record is missing the declared column ${column.name}`
        )
      }
      assert.deepEqual(
        Object.keys(record).sort(),
        Md3ChangeExportColumns.map(c => c.name).sort()
      )
    })

    it('leaves the counts empty for a file whose diff was never loaded', () => {
      // A `0` in an exported file reads as "nothing changed", which is false
      // of every row in a changed-file list by definition.
      const record = md3ChangeExportRecord(
        file({ path: 'a', statsLoaded: false })
      )
      assert.equal(record.addedLines, '')
      assert.equal(record.deletedLines, '')
    })

    it('writes every column into a serialized file', () => {
      const payload = serializeMd3ListExport(
        md3ChangesFixture.map(md3ChangeExportRecord),
        {
          columns: Md3ChangeExportColumns,
          collectionName: 'changes',
          recordName: 'change',
          title: 'Changed files',
          baseName: 'changes',
        },
        'csv',
        { scope: 'all' }
      )
      const header = payload.content.split('\n')[0]
      for (const column of Md3ChangeExportColumns) {
        assert.ok(
          header.includes(column.name),
          `${column.name} is missing from the exported header`
        )
      }
      assert.equal(payload.count, md3ChangesFixture.length)
    })
  })
})
