import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  md3BranchRows,
  md3MergeAllStatus,
} from '../../src/ui/md3/md3-destination-adapters'
import {
  md3BranchDetail,
  md3MergeAllProgress,
} from '../../src/ui/md3/md3-branches-view'
import { Branch, BranchType, IAheadBehind } from '../../src/models/branch'

/**
 * The adapter that turns the real branches store into Branches rows.
 *
 * It had no test, and the view's own tests could never have stood in for one:
 * they render `md3BranchFixtures`, whose values are already the shapes the
 * contract draws — a seven-character SHA, a measured ahead/behind pair. Only
 * the adapter can produce the wrong shape, so only a test on the adapter can
 * catch it.
 *
 * Three defects it shipped, each of which type-checked and rendered:
 *
 * - the full forty-character object name went into `tipSha`, a field the view
 *   documents as abbreviated, so the detail line was consumed by the SHA and
 *   the tracking and divergence clauses were ellipsed away;
 * - an unmeasured branch was flattened to `0 / 0`, which reads as "in sync"
 *   beside every branch the ahead/behind store has not reached;
 * - a remote branch looked its pull request up under `origin/feature/x` while
 *   pull requests are keyed by the head's short name, so it never found one.
 */

const DevelopmentTip = '4f1c9aeb2017158918755e4f461a0b3d1c7f0a9e'
const MainTip = '9b2e7d1c84f30d3f0b6277aa105e5c4d78d76a63'

function branchAt(
  name: string,
  options: {
    readonly upstream?: string | null
    readonly sha?: string
    readonly type?: BranchType
    readonly author?: { readonly date: Date; readonly name?: string }
    readonly isGone?: boolean
  } = {}
): Branch {
  const type = options.type ?? BranchType.Local
  return new Branch(
    name,
    options.upstream === undefined ? `origin/${name}` : options.upstream,
    { sha: options.sha ?? MainTip, author: options.author },
    type,
    type === BranchType.Local ? `refs/heads/${name}` : `refs/remotes/${name}`,
    options.isGone
  )
}

const NoStrings: ReadonlySet<string> = new Set<string>()

function rowsFor(
  branches: ReadonlyArray<Branch>,
  overrides: {
    readonly currentBranchName?: string
    readonly aheadBehind?: ReadonlyMap<string, IAheadBehind>
    readonly hiddenBranches?: ReadonlySet<string>
    readonly pinnedBranches?: ReadonlySet<string>
    readonly worktreeBranches?: ReadonlySet<string>
    readonly pullRequests?: ReadonlyMap<
      string,
      { readonly number: number; readonly state: string }
    >
    readonly hasForge?: boolean
  } = {}
) {
  return md3BranchRows({
    branches,
    currentBranchName: overrides.currentBranchName ?? 'development',
    aheadBehind: overrides.aheadBehind ?? new Map<string, IAheadBehind>(),
    pinnedBranches: overrides.pinnedBranches ?? NoStrings,
    hiddenBranches: overrides.hiddenBranches ?? NoStrings,
    worktreeBranches: overrides.worktreeBranches ?? NoStrings,
    pullRequests:
      overrides.pullRequests ??
      new Map<string, { readonly number: number; readonly state: string }>(),
    hasForge: overrides.hasForge ?? true,
    now: new Date('2026-08-10T09:53:00Z').getTime(),
  })
}

describe('md3BranchRows', () => {
  describe('the tip SHA', () => {
    it('abbreviates the object name the detail line opens with', () => {
      const [row] = rowsFor([branchAt('development', { sha: DevelopmentTip })])

      assert.equal(DevelopmentTip.length, 40)
      assert.equal(
        row.tipSha.length,
        7,
        'the row shipped the whole object name into a field the view ' +
          'documents as abbreviated, which consumed the detail line'
      )
      assert.ok(DevelopmentTip.startsWith(row.tipSha))
      assert.notEqual(row.tipSha, DevelopmentTip)
    })

    it('opens the rendered detail line with the short SHA', () => {
      const [row] = rowsFor([branchAt('development', { sha: DevelopmentTip })])

      assert.ok(md3BranchDetail(row).startsWith('tip 4f1c9ae ·'))
      assert.ok(!md3BranchDetail(row).includes(DevelopmentTip))
    })

    it('survives a tip shorter than the abbreviation', () => {
      const [row] = rowsFor([branchAt('main', { sha: 'abc' })])
      assert.equal(row.tipSha, 'abc')
    })
  })

  describe('ahead and behind', () => {
    /*
     * The app measures the checked-out branch and deliberately leaves every
     * other branch out of the map rather than reporting it as zero/zero. An
     * adapter that then defaults the miss to zero puts that claim back, one
     * layer down, where nothing is looking for it.
     */
    it('leaves an unmeasured branch unmeasured instead of calling it in sync', () => {
      const [row] = rowsFor([branchAt('main')])

      assert.equal(row.ahead, null)
      assert.equal(row.behind, null)
      assert.ok(md3BranchDetail(row).includes('not compared yet'))
      assert.ok(!md3BranchDetail(row).includes('in sync'))
    })

    it('reports a measured branch exactly as the store measured it', () => {
      const [row] = rowsFor([branchAt('development')], {
        aheadBehind: new Map([['development', { ahead: 3, behind: 0 }]]),
      })

      assert.equal(row.ahead, 3)
      assert.equal(row.behind, 0)
      assert.ok(md3BranchDetail(row).includes('↑3 ↓0'))
    })

    it('keeps a genuine zero-zero measurement as in sync', () => {
      const [row] = rowsFor([branchAt('development')], {
        aheadBehind: new Map([['development', { ahead: 0, behind: 0 }]]),
      })

      assert.equal(row.ahead, 0)
      assert.equal(row.behind, 0)
      assert.ok(md3BranchDetail(row).includes('in sync'))
    })

    it('measures only the branch the store named', () => {
      const rows = rowsFor([branchAt('development'), branchAt('main')], {
        aheadBehind: new Map([['development', { ahead: 3, behind: 0 }]]),
      })

      assert.equal(rows[0].ahead, 3)
      assert.equal(rows[1].ahead, null)
    })
  })

  describe('the meta line', () => {
    it('names the tip author when the ref was read with one', () => {
      const [row] = rowsFor([
        branchAt('development', {
          author: {
            date: new Date('2026-08-10T09:41:00Z'),
            name: 'Alice Lindqvist',
          },
        }),
      ])

      assert.ok(
        row.meta.includes('Alice Lindqvist'),
        'the contract byline reads "Updated 12 minutes ago by <author>"'
      )
      assert.ok(row.meta.startsWith('Updated '))
    })

    it('omits the author rather than inventing one when Git gave none', () => {
      const [row] = rowsFor([
        branchAt('development', {
          author: { date: new Date('2026-08-10T09:41:00Z') },
        }),
      ])

      assert.ok(row.meta.startsWith('Updated '))
      assert.ok(!row.meta.includes(' by '))
      assert.ok(!row.meta.includes('undefined'))
    })

    it('falls back to the short SHA when the ref carried no date at all', () => {
      const [row] = rowsFor([branchAt('main', { sha: MainTip })])

      assert.equal(row.meta, `Tip ${MainTip.slice(0, 7)}`)
      assert.ok(!row.meta.includes(MainTip))
    })
  })

  describe('the upstream', () => {
    it('reports an upstream Git says is gone rather than claiming it tracks', () => {
      const [row] = rowsFor([
        branchAt('main', { upstream: 'origin/main', isGone: true }),
      ])

      assert.equal(row.upstreamGone, true)
      assert.ok(md3BranchDetail(row).includes('now gone'))
    })

    it('keeps a live upstream a plain tracking clause', () => {
      const [row] = rowsFor([branchAt('main', { upstream: 'origin/main' })])

      assert.equal(row.upstreamGone, false)
      assert.ok(md3BranchDetail(row).includes('tracks origin/main'))
    })

    it('says a branch has no upstream when Git reported none', () => {
      const [row] = rowsFor([branchAt('scratch', { upstream: null })])

      assert.equal(row.tracking, null)
      assert.ok(md3BranchDetail(row).includes('no upstream'))
    })
  })

  describe('pull requests', () => {
    const pullRequests = new Map([
      ['feature/md3-shell', { number: 421, state: 'open' }],
    ])

    it('finds the pull request for a local head branch', () => {
      const [row] = rowsFor([branchAt('feature/md3-shell')], { pullRequests })

      assert.equal(row.pullRequest?.number, 421)
      assert.ok(md3BranchDetail(row).includes('PR #421 open'))
    })

    /*
     * Pull requests are keyed by the head branch's short name. A remote ref is
     * named with its remote prefix, so looking it up under `origin/feature/x`
     * never matched and the remote row silently lost its pull-request clause.
     */
    it('finds the same pull request from the remote ref that carries it', () => {
      const [row] = rowsFor(
        [
          branchAt('origin/feature/md3-shell', {
            type: BranchType.Remote,
            upstream: null,
          }),
        ],
        { pullRequests }
      )

      assert.equal(row.pullRequest?.number, 421)
    })

    it('leaves the clause off a branch with no pull request', () => {
      const [row] = rowsFor([branchAt('fix/diff-gutter')], { pullRequests })

      assert.equal(row.pullRequest, undefined)
      assert.ok(!md3BranchDetail(row).includes('PR #'))
    })
  })

  describe('merge-all progress', () => {
    /*
     * The orchestrator publishes what it has finished and what it holds right
     * now, and no candidate count at all. `completed + 1` looks like a total,
     * renders as one — "3 of 4" over a queue of twelve — and keeps the bar
     * near its end for the whole run.
     */
    it('refuses to invent a total the orchestrator never published', () => {
      const status = md3MergeAllStatus({
        phase: 'merging',
        currentBranch: 'feature/md3-shell',
        results: [{}, {}, {}],
      })

      assert.ok(status !== null)
      assert.equal(status.completed, 3)
      assert.equal(
        status.total,
        null,
        'a denominator derived from "finished plus the one in hand" is not a ' +
          'total, and the bar reads it as one'
      )

      const progress = md3MergeAllProgress(status)
      assert.ok(progress !== null)
      assert.equal(progress.percent, null)
      assert.ok(!progress.label.includes(' of '))
    })

    it('has nothing to report when no run is in flight', () => {
      assert.equal(md3MergeAllStatus(null), null)
    })

    it('lets a finished run release the button', () => {
      const status = md3MergeAllStatus({
        phase: 'complete',
        currentBranch: null,
        results: [{}, {}],
      })

      assert.ok(status !== null)
      assert.equal(status.phase, 'complete')
      assert.equal(md3MergeAllProgress(status), null)
    })
  })

  describe('grouping and visibility', () => {
    it('groups the checked-out branch apart from local and remote', () => {
      const rows = rowsFor(
        [
          branchAt('development'),
          branchAt('main'),
          branchAt('origin/development', {
            type: BranchType.Remote,
            upstream: null,
          }),
        ],
        { currentBranchName: 'development' }
      )

      assert.deepEqual(
        rows.map(row => row.group),
        ['Current', 'Local', 'Remote']
      )
      assert.deepEqual(
        rows.map(row => row.isCurrent),
        [true, false, false]
      )
    })

    it('drops a hidden branch and refuses to let the current one be hidden', () => {
      const rows = rowsFor([branchAt('development'), branchAt('main')], {
        hiddenBranches: new Set(['main']),
      })

      assert.deepEqual(
        rows.map(row => row.name),
        ['development']
      )
      assert.equal(rows[0].canHide, false)
    })

    it('carries pin, worktree and forge state through to the row', () => {
      const [row] = rowsFor([branchAt('feature/md3-shell')], {
        pinnedBranches: new Set(['feature/md3-shell']),
        worktreeBranches: new Set(['feature/md3-shell']),
        hasForge: false,
      })

      assert.equal(row.isPinned, true)
      assert.equal(row.hasWorktree, true)
      assert.equal(row.isOnForge, false)
    })
  })
})
