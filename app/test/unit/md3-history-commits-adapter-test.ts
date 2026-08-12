import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  md3CommittedFileTabs,
  md3DayLabel,
  md3HistoryCommits,
} from '../../src/ui/md3/md3-destination-adapters'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { AppFileStatusKind, CommittedFileChange } from '../../src/models/status'

/**
 * The adapter that turns real commits into History rows.
 *
 * It had no test, and it shipped the defect that made the commit list
 * unreadable in the running app: it put the full forty-character SHA into a
 * field the view documents as abbreviated. At monospace 11px that value alone
 * consumes the whole 356px pane, so the author and the relative time were
 * squeezed to nothing and the overflow ran underneath the tag pill.
 *
 * Everything about that was invisible to the type checker — both fields are
 * `string` — and invisible to the view's own tests, because the contract
 * fixtures already use seven-character SHAs and so could never reproduce it.
 * A bug that only the real adapter can produce needs a test on the real
 * adapter.
 */

const FullSha = 'b2017158918755e4f461a0b3d1c7f0a9e5c4d78d76a63f21'.slice(0, 40)

function commitAt(
  sha: string,
  options: {
    readonly summary?: string
    readonly author?: string
    readonly email?: string
    readonly parents?: ReadonlyArray<string>
    readonly tags?: ReadonlyArray<string>
    readonly date?: Date
  } = {}
): Commit {
  const identity = new CommitIdentity(
    options.author ?? 'Priya Raman',
    options.email ?? 'priya@example.invalid',
    options.date ?? new Date('2026-08-10T09:41:00Z'),
    0
  )

  return new Commit(
    sha,
    sha.slice(0, 7),
    options.summary ?? 'Rewrite history panel surfaces on MD3 tonal containers',
    'Replaces stacked pane borders with tonal containers.',
    identity,
    identity,
    options.parents ?? ['a'.repeat(40)],
    [],
    options.tags ?? []
  )
}

const rowsFor = (
  commit: Commit,
  changesetSha: string | null = null,
  now: number = new Date('2026-08-10T09:53:00Z').getTime()
) =>
  md3HistoryCommits({
    shas: [commit.sha],
    commitLookup: new Map([[commit.sha, commit]]),
    localCommitSHAs: [],
    branchName: 'development',
    userEmails: new Set<string>(),
    pinnedShas: new Set<string>(),
    changeset: {
      sha: changesetSha,
      linesAdded: 218,
      linesDeleted: 96,
      fileCount: 4,
    },
    now,
  })

describe('md3HistoryCommits', () => {
  it('renders an abbreviated SHA while keeping the full one as identity', () => {
    const [row] = rowsFor(commitAt(FullSha))

    assert.equal(
      row.sha,
      FullSha,
      'the identity must stay whole — every row ' +
        'action is performed against it'
    )
    assert.equal(row.shortSha.length, 7)
    assert.ok(FullSha.startsWith(row.shortSha))
    assert.notEqual(
      row.shortSha,
      row.sha,
      'the byline rendered the full 40-character SHA, which is what pushed the ' +
        'author and the relative time out of the row'
    )
  })

  it('always supplies an author and a relative time', () => {
    const [row] = rowsFor(commitAt(FullSha, { author: 'Priya Raman' }))

    assert.equal(row.author, 'Priya Raman')
    assert.ok(
      row.relativeTime.trim().length > 0,
      '"how long ago" is the most-read value on the row and was missing'
    )
    assert.ok(row.absoluteTime.trim().length > 0)
    assert.ok(row.day.trim().length > 0)
  })

  it('marks stats unloaded for every commit but the selected one', () => {
    const commit = commitAt(FullSha)

    const [unselected] = rowsFor(commit, null)
    assert.equal(
      unselected.statsLoaded,
      false,
      'a zero that means "not loaded" must be distinguishable from a zero ' +
        'that means "changed nothing"'
    )
    assert.equal(unselected.changedFileCount, 0)

    const [selected] = rowsFor(commit, commit.sha)
    assert.equal(selected.statsLoaded, true)
    assert.equal(selected.addedLineCount, 218)
    assert.equal(selected.deletedLineCount, 96)
    assert.equal(selected.changedFileCount, 4)
  })

  it('reads a merge commit from its parent count', () => {
    const merge = commitAt(FullSha, {
      parents: ['a'.repeat(40), 'b'.repeat(40)],
    })

    assert.equal(rowsFor(merge)[0].kind, 'merge')
  })

  it('says a signature was never checked rather than that it failed', () => {
    // Nothing in the history path runs `git verify-commit` — `getCommits`
    // passes `--no-show-signature` — so the adapter has examined no signature
    // at all. Reporting `unverified` told every reader that each of their
    // signed commits had been looked at and had not held up.
    assert.equal(rowsFor(commitAt(FullSha))[0].kind, 'unchecked')
  })

  describe('day headings', () => {
    const now = new Date('2026-08-10T09:53:00')

    const dayFor = (date: Date) =>
      rowsFor(commitAt(FullSha, { date }), null, now.getTime())[0].day

    it('names today and yesterday, as the contract does', () => {
      // The contract's headings read `Today` and `Yesterday`; a bare
      // `10 Aug 2026` above this morning's commits makes the reader work out
      // from a calendar the one thing the heading exists to tell them.
      assert.equal(dayFor(new Date('2026-08-10T08:12:00')), 'Today')
      assert.equal(dayFor(new Date('2026-08-09T23:50:00')), 'Yesterday')
    })

    it('falls back to a real date further back', () => {
      const older = dayFor(new Date('2026-08-02T11:10:00'))

      assert.notEqual(older, 'Today')
      assert.notEqual(older, 'Yesterday')
      assert.ok(
        older.includes('2026'),
        `expected a dated heading, got ${older}`
      )
    })

    it('splits on the local calendar day, not on elapsed hours', () => {
      // Twenty minutes apart and either side of midnight: the same heading for
      // both would put yesterday's work under `Today`.
      assert.equal(
        md3DayLabel(new Date('2026-08-10T00:10:00'), now.getTime()),
        'Today'
      )
      assert.equal(
        md3DayLabel(new Date('2026-08-09T23:50:00'), now.getTime()),
        'Yesterday'
      )
    })
  })

  describe('the selected commit’s file list', () => {
    const fileChange = (path: string) =>
      new CommittedFileChange(
        path,
        { kind: AppFileStatusKind.Modified },
        FullSha,
        `${FullSha}^`
      )

    it('states no per-file line counts, because none were read', () => {
      // `getChangedFiles` sums `--numstat` into the changeset's two totals and
      // keeps nothing per file. Sending zeroes drew "+0 −0" beside every path
      // in the detail sheet and announced the same to a screen reader: a claim
      // that each of those files changed nothing.
      const [tab] = md3CommittedFileTabs([
        fileChange('app/src/ui/md3/md3-history-view.tsx'),
      ])

      assert.equal(tab.addedLineCount, undefined)
      assert.equal(tab.deletedLineCount, undefined)
      assert.equal(tab.name, 'md3-history-view.tsx')
      assert.equal(tab.kind, 'modified')
    })
  })

  it('skips a SHA whose commit body has not loaded', () => {
    const rows = md3HistoryCommits({
      shas: [FullSha],
      commitLookup: new Map(),
      localCommitSHAs: [],
      branchName: 'development',
      userEmails: new Set<string>(),
      pinnedShas: new Set<string>(),
      changeset: { sha: null, linesAdded: 0, linesDeleted: 0, fileCount: 0 },
    })

    // Rendering it anyway would show a commit with an empty message.
    assert.deepEqual(rows, [])
  })
})
