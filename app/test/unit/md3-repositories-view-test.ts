import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  filterMd3Repositories,
  md3HasChangesChipLabel,
  md3RepositoriesFiltersActive,
  md3RepositoryChangesLabel,
  md3RepositoryDetail,
  md3RepositoryExportRecord,
  md3RepositoryGroupChips,
  md3RepositoryIsDirty,
  md3RepositoryMeta,
  md3RepositoryRunPercent,
  md3RepositoryRunSummary,
  md3RepositoryRunTotals,
  md3RepositorySyncable,
  md3RepositoryVisibleIds,
  IMd3RepositoryRow,
  Md3RepositoryExportColumns,
} from '../../src/ui/md3/md3-repositories-view'
import { md3RepositoryFixtureRows } from '../../src/ui/md3/md3-repositories-view-fixtures'
import { IBulkRepositoryProgress } from '../../src/lib/automation/bulk-repository-runner'

/**
 * The Repositories destination's pure derivations.
 *
 * Every assertion here starts from the design contract's own literals —
 * `design/History MD3.dc.html` lines 2058–2098 — so a row that stops rendering
 * the shape the contract specified fails rather than merely looking different.
 */

const findRow = (name: string): IMd3RepositoryRow => {
  const row = md3RepositoryFixtureRows.find(
    candidate => candidate.name === name
  )
  assert.ok(row !== undefined, `fixture row ${name} is missing`)
  return row
}

describe('md3 repositories view', () => {
  it('renders the contract meta line', () => {
    assert.equal(
      md3RepositoryMeta(findRow('desktop-material')),
      '~/code/desktop-material · fetched 12m ago'
    )
  })

  it('says a repository has never been fetched instead of leaving it blank', () => {
    const row = { ...findRow('notes'), lastFetched: '' }
    assert.equal(md3RepositoryMeta(row), '~/notes · fetched never')
  })

  it('renders the contract detail line for the ahead repository', () => {
    assert.equal(
      md3RepositoryDetail(findRow('desktop-material')),
      'TypeScript · 128 MB · development ↑3 ↓0 · 2 remotes · 12 changes'
    )
  })

  it('renders the contract detail line for an in-sync repository', () => {
    assert.equal(
      md3RepositoryDetail(findRow('remote-site')),
      'TypeScript · 117 MB · main in sync · 2 remotes · clean'
    )
  })

  it('never lets an uninspected repository claim it is in sync', () => {
    const detail = md3RepositoryDetail(findRow('notes'))
    assert.ok(detail.includes('not checked yet'), detail)
    assert.ok(!detail.includes('in sync'), detail)
  })

  it('reports an unmeasured size rather than inventing a number', () => {
    const row = { ...findRow('dotfiles'), sizeInMegabytes: null }
    assert.ok(md3RepositoryDetail(row).includes('size not measured'))
  })

  it('separates a never-inspected change count from a clean one', () => {
    const clean = findRow('remote-site')
    const unknown = { ...clean, changedFilesCount: null }
    assert.equal(md3RepositoryChangesLabel(clean), 'Clean')
    assert.equal(md3RepositoryChangesLabel(unknown), 'Not inspected')
    assert.equal(md3RepositoryIsDirty(clean), false)
    assert.equal(md3RepositoryIsDirty(unknown), false)
    assert.equal(md3RepositoryIsDirty(findRow('linux-tui')), true)
  })

  it('pluralizes one change and one remote', () => {
    assert.equal(
      md3RepositoryChangesLabel(findRow('proto-sandbox')),
      '1 change'
    )
    const single = { ...findRow('dotfiles'), remoteCount: 1 }
    assert.ok(md3RepositoryDetail(single).includes('1 remote ·'))
  })

  it('derives the group chips from the real groups, not the contract sample', () => {
    assert.deepEqual(md3RepositoryGroupChips(md3RepositoryFixtureRows), [
      'material',
      'studio-nord',
      'personal',
    ])

    const renamed = md3RepositoryFixtureRows.map(row => ({
      ...row,
      groupKey: 'acme',
      groupLabel: 'acme',
    }))
    assert.deepEqual(md3RepositoryGroupChips(renamed), ['acme'])
  })

  it('filters by name, group and language, exactly as the contract matches', () => {
    const byName = filterMd3Repositories(
      md3RepositoryFixtureRows,
      'dotfiles',
      false,
      []
    )
    assert.deepEqual(
      byName.rows.map(row => row.name),
      ['dotfiles']
    )

    const byGroup = filterMd3Repositories(
      md3RepositoryFixtureRows,
      'studio-nord',
      false,
      []
    )
    assert.deepEqual(
      byGroup.rows.map(row => row.name),
      ['design-tokens', 'proto-sandbox']
    )

    const byLanguage = filterMd3Repositories(
      md3RepositoryFixtureRows,
      'rust',
      false,
      []
    )
    assert.deepEqual(
      byLanguage.rows.map(row => row.name),
      ['linux-tui']
    )
  })

  it('reads the query as a regular expression when regex mode is on', () => {
    const result = filterMd3Repositories(
      md3RepositoryFixtureRows,
      '^d.*s$',
      true,
      []
    )
    assert.deepEqual(
      result.rows.map(row => row.name),
      ['design-tokens', 'dotfiles']
    )
    assert.equal(result.patternInvalid, false)
  })

  it('keeps every row and says so when the pattern does not compile', () => {
    const result = filterMd3Repositories(
      md3RepositoryFixtureRows,
      '([unclosed',
      true,
      []
    )
    assert.equal(result.rows.length, md3RepositoryFixtureRows.length)
    assert.equal(result.patternInvalid, true)
  })

  it('unions the group chips with the has-changes chip', () => {
    const hasChanges = md3HasChangesChipLabel()

    const personal = filterMd3Repositories(
      md3RepositoryFixtureRows,
      '',
      false,
      ['personal']
    )
    assert.deepEqual(
      personal.rows.map(row => row.name),
      ['dotfiles', 'notes']
    )

    const dirty = filterMd3Repositories(md3RepositoryFixtureRows, '', false, [
      hasChanges,
    ])
    assert.deepEqual(
      dirty.rows.map(row => row.name),
      ['desktop-material', 'linux-tui', 'proto-sandbox', 'notes']
    )

    const both = filterMd3Repositories(md3RepositoryFixtureRows, '', false, [
      'studio-nord',
      hasChanges,
    ])
    assert.deepEqual(
      both.rows.map(row => row.name),
      [
        'desktop-material',
        'linux-tui',
        'design-tokens',
        'proto-sandbox',
        'notes',
      ]
    )
  })

  describe('run reporting', () => {
    const progress = (
      statuses: ReadonlyArray<
        'queued' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled'
      >,
      finished: boolean
    ): IBulkRepositoryProgress => ({
      completed: statuses.filter(
        status =>
          status === 'done' || status === 'failed' || status === 'skipped'
      ).length,
      total: statuses.length,
      cancelled: statuses.includes('cancelled'),
      finished,
      items: statuses.map((status, index) => ({
        id: index + 1,
        name: `repo-${index + 1}`,
        status,
        detail: '',
      })),
    })

    it('counts every terminal state without folding any of them away', () => {
      const totals = md3RepositoryRunTotals(
        progress(['done', 'done', 'failed', 'skipped', 'cancelled'], true)
      )
      assert.deepEqual(totals, {
        done: 2,
        failed: 1,
        skipped: 1,
        remaining: 1,
        total: 5,
      })
    })

    it('never claims a whole batch succeeded when part of it did not', () => {
      const summary = md3RepositoryRunSummary(
        progress(
          [
            'done',
            'done',
            'done',
            'done',
            'done',
            'done',
            'done',
            'failed',
            'failed',
          ],
          true
        )
      )
      assert.equal(
        summary,
        '7 of 9 succeeded · 2 failed · 0 skipped · 0 never ran'
      )
    })

    it('reports the cancelled remainder rather than pretending it ran', () => {
      const summary = md3RepositoryRunSummary(
        progress(['done', 'cancelled', 'cancelled'], true)
      )
      assert.ok(summary.includes('2 never ran'), summary)
    })

    it('turns completion into a percentage for the pane header', () => {
      assert.equal(
        md3RepositoryRunPercent(progress(['done', 'failed', 'queued'], false)),
        67
      )
      assert.equal(
        md3RepositoryRunPercent(progress(['done', 'done'], true)),
        100
      )
      assert.equal(
        md3RepositoryRunPercent({
          completed: 0,
          total: 0,
          cancelled: false,
          finished: true,
          items: [],
        }),
        100
      )
    })
  })

  /**
   * The wiring between this view and the shared bulk modules.
   *
   * The selection algebra, the export serializer and the bar itself are proven
   * in their own suites; what is proven here is the half only this view can get
   * wrong — that the ids handed to the bar are the ones the filter left, that
   * `filtered` is true exactly when something is narrowing the list, that the
   * partition excludes what it says it excludes, that the export record fills
   * every column it declares, and that the destructive verb cannot reach the
   * dispatcher without the gate.
   */
  describe('bulk wiring', () => {
    const chip = md3HasChangesChipLabel()

    it('hands the bar the ids the query left, not every repository', () => {
      const all = md3RepositoryVisibleIds(md3RepositoryFixtureRows)
      assert.equal(all.length, md3RepositoryFixtureRows.length)

      const narrowed = filterMd3Repositories(
        md3RepositoryFixtureRows,
        'notes',
        false,
        []
      )
      assert.deepStrictEqual(md3RepositoryVisibleIds(narrowed.rows), [
        String(findRow('notes').id),
      ])
    })

    it('hands the bar the ids the chips left', () => {
      const dirty = filterMd3Repositories(md3RepositoryFixtureRows, '', false, [
        chip,
      ])
      assert.ok(dirty.rows.length > 0 && dirty.rows.length < 9, 'chip narrows')
      assert.deepStrictEqual(
        md3RepositoryVisibleIds(dirty.rows),
        dirty.rows.map(row => String(row.id))
      )
      assert.ok(dirty.rows.every(md3RepositoryIsDirty))
    })

    it('deduplicates a repository that appears under two headings', () => {
      const row = findRow('notes')
      assert.deepStrictEqual(md3RepositoryVisibleIds([row, row]), [
        String(row.id),
      ])
    })

    /*
     * Saying `filtered: false` while a filter is on is the one defect neither
     * the bar nor the user can detect: the select-all then offers "all 9" while
     * showing 2, and a bulk verb runs over rows nobody looked at.
     */
    it('reports a filter as active for a query, a chip, or both', () => {
      assert.equal(md3RepositoriesFiltersActive('notes', []), true)
      assert.equal(md3RepositoriesFiltersActive('', [chip]), true)
      assert.equal(md3RepositoriesFiltersActive('notes', [chip]), true)
    })

    it('reports no filter for an empty query and no chips', () => {
      assert.equal(md3RepositoriesFiltersActive('', []), false)
      assert.equal(md3RepositoriesFiltersActive('   ', []), false)
    })

    it('excludes a repository that is gone from disk, and says why', () => {
      const present = findRow('notes')
      const missing = { ...findRow('dotfiles'), isMissing: true }
      const partition = md3RepositorySyncable(
        [present, missing],
        'gone from disk'
      )

      assert.deepStrictEqual(
        partition.applied.map(row => row.name),
        ['notes']
      )
      assert.deepStrictEqual(
        partition.excluded.map(row => row.name),
        ['dotfiles']
      )
      assert.equal(partition.reason, 'gone from disk')
    })

    it('carries no reason when nothing was excluded', () => {
      const partition = md3RepositorySyncable(
        [findRow('notes')],
        'gone from disk'
      )
      assert.equal(partition.excluded.length, 0)
      assert.equal(partition.reason, null)
    })

    it('fills every column the export schema declares', () => {
      const record = md3RepositoryExportRecord(findRow('desktop-material'))
      for (const column of Md3RepositoryExportColumns) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(record, column.name),
          `export record is missing the declared column ${column.name}`
        )
      }
      assert.deepStrictEqual(
        Object.keys(record).sort(),
        Md3RepositoryExportColumns.map(column => column.name).sort()
      )
    })

    /*
     * A zero in an exported file reads as "no changes" and "no remotes", which
     * is a claim the reader has no way to doubt. An unmeasured count is empty.
     */
    it('exports an unmeasured count as empty rather than as zero', () => {
      const record = md3RepositoryExportRecord({
        ...findRow('notes'),
        changedFilesCount: null,
        remoteCount: null,
        sizeInMegabytes: null,
        sync: { kind: 'unknown', ahead: null, behind: null },
      })
      // Strict, deliberately: `0 == ''` is true, so a loose assertion here
      // passes on exactly the defect it exists to catch.
      assert.strictEqual(record.changedFilesCount, '')
      assert.strictEqual(record.remoteCount, '')
      assert.strictEqual(record.sizeInMegabytes, '')
      assert.strictEqual(record.ahead, '')
      assert.strictEqual(record.behind, '')
    })

    it('keeps a measured zero distinguishable from an unmeasured count', () => {
      const record = md3RepositoryExportRecord({
        ...findRow('notes'),
        changedFilesCount: 0,
        remoteCount: 0,
      })
      assert.strictEqual(record.changedFilesCount, 0)
      assert.strictEqual(record.remoteCount, 0)
    })

    /*
     * Source guards. A bar that is not rendered, a `filtered` hard-coded to a
     * literal, or a removal verb wired straight to the dispatcher all pass
     * every behavioural assertion above, because none of them looked.
     */
    describe('the view source', () => {
      const source = readFileSync(
        join(
          __dirname,
          '..',
          '..',
          'src',
          'ui',
          'md3',
          'md3-repositories-view.tsx'
        ),
        'utf8'
      )

      it('renders the shared bulk bar rather than a bespoke one', () => {
        assert.ok(source.includes('<Md3BulkBar'), 'the shared bar is rendered')
      })

      it('feeds the bar the derived filter state, not a literal', () => {
        assert.ok(
          source.includes('filtered={filtersActive}'),
          'filtered is derived'
        )
        assert.ok(
          source.includes('md3RepositoriesFiltersActive('),
          'and derived by the one exported rule'
        )
      })

      it('feeds the bar the post-filter ids', () => {
        assert.ok(source.includes('visibleIds={visibleKeys}'))
      })

      it('marks the removal verb destructive and gated', () => {
        assert.ok(
          source.includes("hasPopup: action.destructive === true ? 'dialog'"),
          'the destructive verb announces its dialog'
        )
        assert.ok(
          source.includes('<Md3RemovalGate'),
          'the two-key-and-slider gate is still rendered'
        )
        assert.ok(
          source.includes('onConfirm={props.onConfirmRemoval}'),
          'and only the gate confirms a removal'
        )
      })

      it('defaults the skip reason to a localized sentence', () => {
        assert.ok(
          source.includes("t('md3.repositories.bulkSkipMissing')"),
          'the reason the user reads comes from the catalogue'
        )
      })

      it('extends rather than replaces on a shift range', () => {
        assert.ok(
          source.includes("'extend'"),
          'a checkbox list must extend a range, never replace it'
        )
      })
    })
  })
})
