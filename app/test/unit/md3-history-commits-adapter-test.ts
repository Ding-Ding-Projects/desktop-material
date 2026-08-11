import assert from 'node:assert'
import { describe, it } from 'node:test'

import { md3HistoryCommits } from '../../src/ui/md3/md3-destination-adapters'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'

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
  } = {}
): Commit {
  const identity = new CommitIdentity(
    options.author ?? 'Priya Raman',
    options.email ?? 'priya@example.invalid',
    new Date('2026-08-10T09:41:00Z'),
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
    options.tags ?? [],
    undefined
  )
}

const rowsFor = (commit: Commit, changesetSha: string | null = null) =>
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
    now: new Date('2026-08-10T09:53:00Z').getTime(),
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
