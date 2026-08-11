import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  md3ChangeDetail,
  md3ChangeDirectory,
  md3ChangeExtension,
  md3ChangeName,
  md3IncludeAllIcon,
  md3SummaryHint,
  IMd3ChangedFile,
} from '../../src/ui/md3/md3-changes-view'
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
