import assert from 'node:assert'
import { describe, it } from 'node:test'

import { md3HistoryChangeset } from '../../src/ui/md3/md3-view-props'
import { md3HistoryCommits } from '../../src/ui/md3/md3-destination-adapters'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { AppFileStatusKind, CommittedFileChange } from '../../src/models/status'

/**
 * The seam between `commitSelection` and the History rows.
 *
 * `buildMd3HistoryProps` decided that the loaded changeset described the
 * primary selected commit by naming that commit's SHA unconditionally. Both
 * halves of that were wrong in ways nothing could see:
 *
 *  - the store empties `changesetData` the instant the selection changes and
 *    refills it when `git log --numstat` returns, so for the length of that
 *    round trip — and for good, if it fails — the row was handed three zeroes
 *    and told they were real. It rendered "+0 −0 · 0 files" about a commit
 *    that had plainly changed something;
 *  - with several commits selected the store loads the *range's* combined
 *    totals, which attributed to the first commit report one commit as having
 *    made every change in the span.
 *
 * Neither is a type error — a SHA is a string either way — and neither is
 * reachable from a view test, because the view is handed the decision already
 * made. It has to be asserted here, against the shape the real store produces.
 */

const ShaA = 'a'.repeat(40)
const ShaB = 'b'.repeat(40)

const file = (path: string) =>
  new CommittedFileChange(
    path,
    { kind: AppFileStatusKind.Modified },
    ShaA,
    `${ShaA}^`
  )

const loaded = {
  files: [file('app/src/ui/md3/md3-history-view.tsx')],
  linesAdded: 218,
  linesDeleted: 96,
}

/** Exactly what the store writes when a selection changes. */
const pending = { files: [], linesAdded: 0, linesDeleted: 0 }

describe('md3HistoryChangeset', () => {
  it('claims nothing while the changeset read is still in flight', () => {
    const changeset = md3HistoryChangeset({
      shas: [ShaA],
      changesetData: pending,
    })

    assert.equal(
      changeset.sha,
      null,
      'naming the selected commit here is what made the freshly selected row ' +
        'read "+0 −0 · 0 files" for the length of the load'
    )
  })

  it('describes the selected commit once its files have arrived', () => {
    const changeset = md3HistoryChangeset({
      shas: [ShaA],
      changesetData: loaded,
    })

    assert.equal(changeset.sha, ShaA)
    assert.equal(changeset.linesAdded, 218)
    assert.equal(changeset.linesDeleted, 96)
    assert.equal(changeset.fileCount, 1)
  })

  it('refuses to pin a range’s totals on the first commit of the range', () => {
    // The store loads combined totals for a multi-commit selection. Attributing
    // them to `shas[0]` reports that one commit as the author of every change
    // in the span.
    const changeset = md3HistoryChangeset({
      shas: [ShaA, ShaB],
      changesetData: loaded,
    })

    assert.equal(changeset.sha, null)
  })

  it('claims nothing when no commit is selected at all', () => {
    assert.equal(
      md3HistoryChangeset({ shas: [], changesetData: pending }).sha,
      null
    )
  })

  it('leaves the row honest end to end', () => {
    // The decision only matters because the row believes it, so assert the
    // pair together rather than the boolean alone.
    const identity = new CommitIdentity(
      'Priya Raman',
      'priya@example.invalid',
      new Date('2026-08-10T09:41:00Z'),
      0
    )
    const commit = new Commit(
      ShaA,
      ShaA.slice(0, 7),
      'Rewrite history panel surfaces on MD3 tonal containers',
      '',
      identity,
      identity,
      [ShaB],
      [],
      []
    )

    const rowWith = (changesetData: typeof pending | typeof loaded) =>
      md3HistoryCommits({
        shas: [ShaA],
        commitLookup: new Map([[ShaA, commit]]),
        localCommitSHAs: [],
        branchName: 'development',
        userEmails: new Set<string>(),
        pinnedShas: new Set<string>(),
        changeset: md3HistoryChangeset({ shas: [ShaA], changesetData }),
        now: new Date('2026-08-10T09:53:00Z').getTime(),
      })[0]

    assert.equal(rowWith(pending).statsLoaded, false)
    assert.equal(rowWith(loaded).statsLoaded, true)
    assert.equal(rowWith(loaded).addedLineCount, 218)
  })
})
