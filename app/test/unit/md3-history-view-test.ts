import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  createMd3HistoryMatcher,
  filterMd3HistoryCommits,
  formatMd3CommitDetail,
  IMd3HistoryCommit,
  Md3HistoryFilterId,
} from '../../src/ui/md3/md3-history-view'
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
  })
})
