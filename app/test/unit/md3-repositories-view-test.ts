import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  filterMd3Repositories,
  md3HasChangesChipLabel,
  md3RepositoryChangesLabel,
  md3RepositoryDetail,
  md3RepositoryGroupChips,
  md3RepositoryIsDirty,
  md3RepositoryMeta,
  md3RepositoryRunPercent,
  md3RepositoryRunSummary,
  md3RepositoryRunTotals,
  IMd3RepositoryRow,
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
})
