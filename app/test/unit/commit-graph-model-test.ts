import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { buildCommitGraphRows } from '../../src/ui/history/commit-graph-model'

const identity = new CommitIdentity('Test', 'test@example.com', new Date(0))

function makeCommit(sha: string, parentSHAs: ReadonlyArray<string>) {
  return new Commit(sha, sha, sha, '', identity, identity, parentSHAs, [], [])
}

describe('commit graph model', () => {
  it('keeps a linear first-parent history in one lane', () => {
    const rows = buildCommitGraphRows([
      makeCommit('c', ['b']),
      makeCommit('b', ['a']),
      makeCommit('a', []),
    ])

    assert.deepEqual(
      rows.map(row => row.column),
      [0, 0, 0]
    )
    assert.equal(rows[0].hasTopLine, false)
    assert.equal(rows[1].hasTopLine, true)
  })

  it('opens and rejoins a lane for a merge parent', () => {
    const rows = buildCommitGraphRows([
      makeCommit('merge', ['main', 'topic']),
      makeCommit('main', ['base']),
      makeCommit('topic', ['base']),
      makeCommit('base', []),
    ])

    assert.equal(rows[0].connections.length, 2)
    assert.deepEqual(
      rows[0].connections.map(path => path.toColumn),
      [0, 1]
    )
    assert.equal(rows[2].column, 1)
    assert.equal(rows[3].column, 0)
    assert.equal(rows[3].hasTopLine, true)
  })

  it('routes converging lanes to the surviving column', () => {
    // Two branches that both reach the same ancestor. De-duplication collapses
    // them into one lane, so every path that pointed at either must name the
    // column that survived — this is the case a per-row lane index has to get
    // right, because two entries transiently name the same sha and the first
    // is the one findIndex would have returned.
    const rows = buildCommitGraphRows([
      makeCommit('merge', ['left', 'right']),
      makeCommit('left', ['base']),
      makeCommit('right', ['base']),
      makeCommit('base', []),
    ])

    assert.equal(rows.length, 4)

    // Every connection points at a column that exists on the row it enters.
    for (const row of rows) {
      for (const path of [...row.connections, ...row.continuations]) {
        assert.ok(
          path.toColumn >= 0,
          `a path left column ${path.fromColumn} for a column that does not exist`
        )
      }
    }

    // The two branch tips occupy different columns before converging.
    const left = rows.find(row => row.sha === 'left')
    const right = rows.find(row => row.sha === 'right')
    assert.notEqual(left, undefined)
    assert.notEqual(right, undefined)
    assert.notEqual(left!.column, right!.column)

    // And the shared ancestor is drawn once, in a single column.
    const base = rows.filter(row => row.sha === 'base')
    assert.equal(base.length, 1)
  })

  it('draws a commit whose parents are not loaded yet as a lane that ends', () => {
    // History loads newest first, so the oldest loaded commit routinely has
    // parents that have not arrived. They are not visible, so no path may point
    // at them — and when the next batch loads, that row legitimately changes.
    // This is exactly why the graph cannot be resumed from a cached prefix.
    const rows = buildCommitGraphRows([
      makeCommit('c', ['b']),
      makeCommit('b', ['not-loaded-yet']),
    ])

    assert.equal(rows.length, 2)
    const last = rows[1]
    assert.deepEqual(last.connections, [])
  })
})
