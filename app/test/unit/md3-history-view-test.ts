import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  createMd3HistoryMatcher,
  filterMd3HistoryCommits,
  formatMd3CommitDetail,
  IMd3HistoryCommit,
  Md3HistoryExportColumns,
  Md3HistoryFilterId,
  md3HistoryCommitExportRecord,
  md3HistoryFiltersActive,
  md3HistoryRevertable,
} from '../../src/ui/md3/md3-history-view'
import {
  md3ListExportLoss,
  serializeMd3ListExport,
} from '../../src/ui/md3/md3-list-export'
import {
  md3HistoryCommitFixtures,
  md3HistoryDiffFixtures,
  md3HistoryFileFixtures,
} from '../../src/ui/md3/md3-history-view-fixtures'

/**
 * The History destination's pure derivations.
 *
 * Every assertion starts from the design contract's own literals
 * (`design/History MD3.dc.html`, the `isHistory` branch and the `commitRows` /
 * `historyChips` / `matcher` values in `renderVals()`), so a row that stops
 * rendering the shape the contract specified fails rather than merely looking
 * different.
 */

const find = (sha: string): IMd3HistoryCommit => {
  const commit = md3HistoryCommitFixtures.find(
    candidate => candidate.sha === sha
  )
  assert.ok(commit !== undefined, `fixture ${sha} is missing`)
  return commit
}

const filter = (
  chips: ReadonlyArray<Md3HistoryFilterId>,
  query = '',
  regex = false
) =>
  filterMd3HistoryCommits(
    md3HistoryCommitFixtures,
    createMd3HistoryMatcher(query, regex),
    chips
  ).map(commit => commit.sha)

describe('md3 history view', () => {
  it('renders the contract detail line', () => {
    // The contract's own sample row reads
    // "+218 −96 · 4 files · verified · development".
    assert.equal(
      formatMd3CommitDetail(find('4f1c9ae')),
      '+218 −96 · 4 files · verified · development'
    )
  })

  it('names a merge commit rather than calling it verified', () => {
    assert.equal(
      formatMd3CommitDetail(find('77ab4c9')),
      '+903 −140 · 4 files · merge commit · development'
    )
  })

  it('uses the minus sign the contract writes, not a hyphen', () => {
    assert.ok(formatMd3CommitDetail(find('4f1c9ae')).includes('−96'))
    assert.ok(!formatMd3CommitDetail(find('4f1c9ae')).includes('-96'))
  })

  it('matches the summary, the author and the sha', () => {
    assert.deepEqual(filter([], 'tonal containers'), ['4f1c9ae'])
    assert.deepEqual(filter([], 'Okonkwo'), ['77ab4c9'])
    assert.deepEqual(filter([], 'c30a8f1'), ['c30a8f1'])
  })

  it('matches case-insensitively, as the contract does', () => {
    assert.deepEqual(filter([], 'RELEASE 3.5.0'), ['c30a8f1'])
  })

  it('reads the query as a regular expression in regex mode', () => {
    assert.deepEqual(filter([], '^Release', true), ['c30a8f1'])
  })

  it('matches everything on an invalid pattern rather than nothing', () => {
    // A half-typed expression must not blank the list out from under someone
    // who is still typing it — the contract's `catch` returns `() => true`.
    assert.equal(filter([], '(unclosed', true).length, 4)
  })

  it('narrows to unpushed, tagged, mine and merges', () => {
    assert.deepEqual(filter(['unpushed']), ['4f1c9ae', '9b7de20'])
    assert.deepEqual(filter(['tagged']), ['c30a8f1'])
    assert.deepEqual(filter(['mine']), ['4f1c9ae', '9b7de20'])
    assert.deepEqual(filter(['merges']), ['77ab4c9'])
  })

  it('intersects several chips rather than uniting them', () => {
    assert.deepEqual(filter(['tagged', 'unpushed']), [])
  })

  it('composes the chips with the query', () => {
    assert.deepEqual(filter(['mine'], 'regex builder'), ['9b7de20'])
  })

  it('ships the contract file and diff shapes', () => {
    assert.equal(md3HistoryFileFixtures.length, 4)
    assert.ok(md3HistoryFileFixtures.some(file => file.kind === 'new'))

    const hunks = md3HistoryDiffFixtures.filter(line => line.kind === 'hunk')
    assert.equal(hunks.length, 2)
    assert.ok(hunks.every(line => line.text.startsWith('@@')))

    // A hunk header carries neither line number; the contract renders both
    // gutters empty for it.
    assert.ok(
      hunks.every(
        line =>
          line.oldLineNumber === undefined && line.newLineNumber === undefined
      )
    )
  })
  // Reported from the running app: commit summaries truncated to a few
  // characters, and the tag pill drawn over the SHA with the author and the
  // relative time nowhere to be seen. One chain caused all of it — the adapter
  // put the full forty-character SHA into a field documented as abbreviated,
  // and at monospace 11px that consumes the whole 356px pane.
  describe('commit byline', () => {
    it('renders the abbreviated SHA, never the full one', () => {
      for (const commit of md3HistoryCommitFixtures) {
        assert.equal(
          commit.shortSha.length,
          7,
          `${commit.sha} should render as 7 characters, not ${commit.shortSha.length}`
        )
        assert.ok(
          commit.sha.startsWith(commit.shortSha),
          'the abbreviation must be a prefix of the identity it stands for'
        )
        // The full-SHA regression itself belongs to the adapter, which is the
        // only thing that can produce one — these contract fixtures already
        // use seven characters and so could never reproduce it. See
        // md3-history-commits-adapter-test.ts.
      }
    })

    it('carries an author and a relative time to render beside it', () => {
      for (const commit of md3HistoryCommitFixtures) {
        assert.ok(
          commit.author.trim().length > 0,
          `${commit.shortSha} has no author, so the byline reads as a bare SHA`
        )
        assert.ok(
          commit.relativeTime.trim().length > 0,
          `${commit.shortSha} has no relative time — "how long ago" is the ` +
            'single most-read value on the row'
        )
        assert.ok(commit.absoluteTime.trim().length > 0)
      }
    })
  })

  describe('commit detail line', () => {
    it('says nothing about line counts it has not loaded', () => {
      const [loaded] = md3HistoryCommitFixtures
      const unloaded = { ...loaded, statsLoaded: false }

      const text = formatMd3CommitDetail(unloaded)

      // A zero meaning "not known yet" must never render as a zero meaning
      // "this commit changed nothing" — that is a confident lie about every
      // row in the list except the selected one.
      assert.ok(
        !/0 files/.test(text),
        `unloaded detail line still claims a file count: "${text}"`
      )
      assert.ok(!text.includes('+0'), `still claims added lines: "${text}"`)
      assert.ok(text.includes(unloaded.branchName))
    })

    it('reports the real counts once they are loaded', () => {
      const [loaded] = md3HistoryCommitFixtures
      const text = formatMd3CommitDetail({ ...loaded, statsLoaded: true })

      assert.ok(text.includes(String(loaded.changedFileCount)))
      assert.ok(text.includes(loaded.branchName))
    })

    /*
     * `unchecked` is what the running application actually knows about an
     * ordinary commit: nothing in the History path runs `git verify-commit`.
     * "unverified" says the signature WAS looked at and did not hold up, which
     * is a claim of its own and just as unfounded as calling it verified.
     */
    it('says an unexamined signature was never examined', () => {
      const [loaded] = md3HistoryCommitFixtures
      const text = formatMd3CommitDetail({ ...loaded, kind: 'unchecked' })

      assert.ok(
        !/\bunverified\b/.test(text),
        `an unchecked commit reads as rejected: "${text}"`
      )
      assert.ok(text.includes('signature not checked'))
    })

    it('drops the branch segment rather than ending on a separator', () => {
      // `currentBranchName` has nothing to return on a detached HEAD or an
      // unborn branch, and History still lists commits in both states. The
      // branch is the line's last segment, so an empty one left the row
      // reading "… · verified · " with a dangling separator.
      const [commit] = md3HistoryCommitFixtures

      for (const statsLoaded of [true, false]) {
        const text = formatMd3CommitDetail({
          ...commit,
          statsLoaded,
          branchName: '',
        })

        assert.ok(
          !/·\s*$/.test(text),
          `detail line ends on a separator with no branch: "${text}"`
        )
        assert.ok(text.trim().length > 0)
      }
    })
  })
})

/**
 * The bulk-action wiring of the History destination.
 *
 * The selection algebra and the export serializer are proven in their own
 * modules; what is proven here is this view's use of them — that the ids the
 * bar is handed are the ones the filter left behind, that `filtered` is true
 * exactly when something is narrowing the list, that the revert partition
 * excludes what it says it excludes, and that the export schema and the record
 * builder cannot drift apart.
 */
describe('md3 history bulk actions', () => {
  const ViewSource = join(
    __dirname,
    '..',
    '..',
    'src',
    'ui',
    'md3',
    'md3-history-view.tsx'
  )
  const source = readFileSync(ViewSource, 'utf8')

  describe('md3HistoryFiltersActive', () => {
    it('is false only when nothing is narrowing the list', () => {
      assert.equal(md3HistoryFiltersActive('', []), false)
    })

    it('is true for a query alone', () => {
      assert.equal(md3HistoryFiltersActive('regex', []), true)
    })

    /*
     * The chip case is the one that gets missed: a lit chip narrows the list
     * with an empty search box, and a select-all that says "Select all 3"
     * rather than "Select all 3 matching these filters" is how a bulk revert
     * runs over rows nobody looked at.
     */
    it('is true for a lit chip with an empty query', () => {
      assert.equal(md3HistoryFiltersActive('', ['merges']), true)
    })
  })

  describe('the visible ids the bar is handed', () => {
    it('are the shas the chips left behind, in list order', () => {
      const visible = filterMd3HistoryCommits(
        md3HistoryCommitFixtures,
        createMd3HistoryMatcher('', false),
        ['merges']
      ).map(commit => commit.sha)

      assert.deepStrictEqual(visible, ['77ab4c9'])
      assert.ok(visible.length < md3HistoryCommitFixtures.length)
    })

    it('shrink with the query too, so a range cannot span a hidden row', () => {
      const visible = filterMd3HistoryCommits(
        md3HistoryCommitFixtures,
        createMd3HistoryMatcher('regex', false),
        []
      ).map(commit => commit.sha)

      assert.deepStrictEqual(visible, ['9b7de20'])
    })

    it('are passed to the bar as the filtered list, never the whole log', () => {
      assert.ok(source.includes('visibleIds={visibleShas}'))
      assert.ok(
        source.includes('visibleCommits.map(commit => commit.sha)'),
        'visibleShas must be derived from the filtered commits'
      )
      assert.ok(source.includes('filtered={filtersActive}'))
      assert.ok(source.includes('md3HistoryFiltersActive(filterText'))
    })
  })

  describe('md3HistoryRevertable', () => {
    it('reverts an ordinary commit and skips a merge', () => {
      const partition = md3HistoryRevertable(md3HistoryCommitFixtures)

      assert.deepStrictEqual(
        partition.applied.map(commit => commit.sha),
        ['4f1c9ae', '9b7de20', 'c30a8f1']
      )
      assert.deepStrictEqual(
        partition.excluded.map(commit => commit.sha),
        ['77ab4c9']
      )
    })

    it('carries a real reason whenever it excluded something', () => {
      const partition = md3HistoryRevertable(md3HistoryCommitFixtures)
      assert.ok(partition.reason !== null)
      assert.ok((partition.reason ?? '').trim().length > 0)
      assert.ok(!(partition.reason ?? '').includes('md3.history'))
    })

    it('reports no reason when it skipped nothing', () => {
      const ordinary = md3HistoryCommitFixtures.filter(
        commit => commit.kind !== 'merge'
      )
      const partition = md3HistoryRevertable(ordinary)
      assert.equal(partition.excluded.length, 0)
      assert.equal(partition.reason, null)
    })

    /*
     * The count in the button, the count in the gate's title and the number of
     * commits the confirm actually reverts are all `applied.length`. Were they
     * ever three separate sums, "revert 4" would revert 3 and still say 4.
     */
    it('accounts for every commit it was given', () => {
      const partition = md3HistoryRevertable(md3HistoryCommitFixtures)
      assert.equal(
        partition.applied.length + partition.excluded.length,
        md3HistoryCommitFixtures.length
      )
    })
  })

  describe('the destructive verb', () => {
    it('is marked destructive, opens a dialog, and routes through the gate', () => {
      assert.ok(source.includes("id: 'revert'"))
      assert.ok(source.includes('destructive: true'))
      assert.ok(source.includes("hasPopup: 'dialog'"))
      assert.ok(source.includes('onClick: onRequestBulkRevert'))
      assert.ok(source.includes('Md3DestructiveGate'))
      assert.ok(source.includes('actionId="history-bulk-revert"'))
    })

    it('reverts only the partition it previewed', () => {
      assert.ok(source.includes('for (const commit of revertable.applied)'))
      assert.ok(source.includes('preview={revertable.applied.map('))
      assert.ok(source.includes('previewExcluded={revertable.excluded.map('))
      assert.ok(source.includes('previewExcludedReason={revertable.reason}'))
    })

    it('anchors the gate to the button that opened it', () => {
      assert.ok(source.includes('buttonRef: revertButtonRef'))
      assert.ok(source.includes('anchorTo={revertButtonRef}'))
    })
  })

  describe('the selection gesture', () => {
    /*
     * These rows carry checkboxes, so a Shift range ADDS to the ticks already
     * there. `replace` would silently shrink a selection the user was growing,
     * and the count beside the button would be the only clue.
     */
    it('extends a range rather than replacing the ticks', () => {
      assert.ok(source.includes("'extend'"))
      assert.ok(
        !/anchorIndex\.current,\s*(?:\/\*[\s\S]*?\*\/\s*)?'replace'/.test(
          source
        )
      )
    })

    it('offers a keyboard equivalent of the checkbox gesture', () => {
      assert.ok(source.includes("event.key === ' ' && (event.ctrlKey"))
      assert.ok(source.includes('toggleChecked(index, event.shiftKey)'))
    })

    it('names every checkbox for a screen reader', () => {
      assert.ok(source.includes("t('md3.history.row.select'"))
    })
  })

  describe('the export', () => {
    it('builds a record carrying every declared column', () => {
      for (const commit of md3HistoryCommitFixtures) {
        const record = md3HistoryCommitExportRecord(commit)
        for (const column of Md3HistoryExportColumns) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(record, column.name),
            `the export record dropped "${column.name}"`
          )
        }
      }
    })

    it('declares no column the record does not fill', () => {
      const declared = new Set(Md3HistoryExportColumns.map(c => c.name))
      for (const name of Object.keys(
        md3HistoryCommitExportRecord(md3HistoryCommitFixtures[0])
      )) {
        assert.ok(declared.has(name), `"${name}" is exported but undeclared`)
      }
    })

    /*
     * The three counts are loaded per selected commit. A zero in the file for
     * every other row reads as "this commit changed nothing" — a confident
     * claim about a commit nothing has measured.
     */
    it('leaves the counts empty rather than writing an unmeasured zero', () => {
      const record = md3HistoryCommitExportRecord({
        ...md3HistoryCommitFixtures[0],
        statsLoaded: false,
      })
      assert.equal(record.addedLineCount, '')
      assert.equal(record.deletedLineCount, '')
      assert.equal(record.changedFileCount, '')
    })

    it('writes the counts once they have actually been measured', () => {
      const record = md3HistoryCommitExportRecord(md3HistoryCommitFixtures[0])
      assert.equal(record.addedLineCount, 218)
      assert.equal(record.deletedLineCount, 96)
      assert.equal(record.changedFileCount, 4)
    })

    it('warns that a row-oriented format flattens the commit body', () => {
      const loss = md3ListExportLoss(Md3HistoryExportColumns, 'csv')
      assert.ok(loss !== null)
      assert.ok((loss ?? '').includes('body'))
      assert.equal(md3ListExportLoss(Md3HistoryExportColumns, 'json'), null)
    })

    it('serializes the whole schema into a machine-readable format', () => {
      const payload = serializeMd3ListExport(
        md3HistoryCommitFixtures.map(md3HistoryCommitExportRecord),
        {
          columns: Md3HistoryExportColumns,
          collectionName: 'commits',
          recordName: 'commit',
          title: 'Commits',
          baseName: 'commits',
        },
        'json',
        { scope: 'all 4' }
      )
      assert.equal(payload.count, md3HistoryCommitFixtures.length)
      assert.equal(payload.filename, 'commits.json')
      const parsed = JSON.parse(payload.content)
      assert.deepStrictEqual(
        parsed.schema,
        Md3HistoryExportColumns.map(column => column.name)
      )
      assert.equal(parsed.commits[0].sha, '4f1c9ae')
    })
  })
})
