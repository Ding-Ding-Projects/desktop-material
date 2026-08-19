import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  IMd3BranchRow,
  IMd3BranchRowHandlers,
  Md3BranchRowActionId,
  groupMd3Branches,
  md3BranchDetail,
  md3BranchListActions,
  md3BranchRowActions,
  md3MergeAllProgress,
  md3MergeAllRunning,
} from '../../src/ui/md3/md3-branches-view'
import {
  md3BranchFixtures,
  md3MergeAllFinishedFixture,
  md3MergeAllRunningFixture,
} from '../../src/ui/md3/md3-branches-view-fixtures'

/**
 * The Branches destination of the MD3 shell contract.
 *
 * The derived strings are asserted against the shapes the contract's
 * `branchRows` mapping renders; the row menu is asserted against the feature
 * set of the surface this view replaces, so an action cannot quietly go
 * missing; and the stylesheet and the view source are read as text so a rule or
 * a control the view depends on cannot be deleted without a failure. Rendering
 * assertions belong with the shell's own harness.
 */

const ViewSource = join(
  __dirname,
  '..',
  '..',
  'src',
  'ui',
  'md3',
  'md3-branches-view.tsx'
)
const StyleSheet = join(
  __dirname,
  '..',
  '..',
  'styles',
  'ui',
  '_md3-branches.scss'
)

function branch(overrides: Partial<IMd3BranchRow>): IMd3BranchRow {
  return { ...md3BranchFixtures[1], ...overrides }
}

/**
 * Match a rule for exactly this selector — never one merely containing it.
 * `.md3-branches__row img` must not satisfy a demand for `.md3-branches__row`.
 */
function hasRule(source: string, selector: string): boolean {
  const withoutComments = source.replace(/\/\/[^\n]*/g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*(?:[,{:]|::)`).test(withoutComments)
}

/** Every handler wired, so the menu resolves its full set. */
function allHandlers(): IMd3BranchRowHandlers {
  const noop = () => {}
  return {
    onMergeBranch: noop,
    onRebaseBranch: noop,
    onOpenPullRequest: noop,
    onViewBranchOnForge: noop,
    onViewPullRequestOnForge: noop,
    onCompareBranch: noop,
    onCopyBranchName: noop,
    onRenameBranch: noop,
    onTogglePin: noop,
    onHideBranch: noop,
    onSoloBranch: noop,
    onRestoreVisibility: noop,
    onCheckoutInNewWorktree: noop,
    onSwitchToWorktree: noop,
    onMergeAndDeleteBranch: noop,
    onDeleteBranch: noop,
  }
}

describe('Md3BranchesView', () => {
  describe('md3BranchDetail', () => {
    it('renders the contract detail line for a diverged tracked branch', () => {
      assert.strictEqual(
        md3BranchDetail(md3BranchFixtures[0]),
        'tip 4f1c9ae · tracks origin/development · ↑3 ↓0'
      )
    })

    it('says "in sync" rather than printing two zeroes', () => {
      const detail = md3BranchDetail(
        branch({ ahead: 0, behind: 0, tracking: 'origin/main' })
      )
      assert.strictEqual(detail, 'tip 9b2e7d1 · tracks origin/main · in sync')
    })

    it('appends the pull request clause when there is one', () => {
      assert.strictEqual(
        md3BranchDetail(md3BranchFixtures[2]),
        'tip 1c84f30 · tracks origin/feature/md3-shell · ↑7 ↓1 · PR #421 open'
      )
    })

    it('says a branch has no upstream rather than printing nothing', () => {
      const detail = md3BranchDetail(branch({ tracking: null }))
      assert.ok(detail.includes('no upstream'))
      assert.ok(!detail.includes('null'))
      assert.ok(!detail.includes('undefined'))
    })

    it('says a remote branch tracks origin', () => {
      assert.strictEqual(
        md3BranchDetail(md3BranchFixtures[5]),
        'tip 4f1c9ae · tracking origin · in sync'
      )
    })

    /*
     * The ahead/behind store measures one branch at a time, so most rows carry
     * no measurement at all. "in sync" there is a claim about the branch's
     * relationship with its remote that nothing checked, and the user cannot
     * tell it apart from a measured one.
     */
    it('says a branch was never compared rather than claiming it is in sync', () => {
      const detail = md3BranchDetail(
        branch({ ahead: null, behind: null, tracking: 'origin/main' })
      )
      assert.strictEqual(
        detail,
        'tip 9b2e7d1 · tracks origin/main · not compared yet'
      )
      assert.ok(!detail.includes('in sync'))
      assert.ok(!detail.includes('↑'))
      assert.ok(!detail.includes('null'))
    })

    it('treats a half-measured comparison as unmeasured', () => {
      assert.ok(
        md3BranchDetail(branch({ ahead: 3, behind: null })).includes(
          'not compared yet'
        )
      )
      assert.ok(
        md3BranchDetail(branch({ ahead: null, behind: 3 })).includes(
          'not compared yet'
        )
      )
    })

    it('says an upstream is gone rather than claiming the branch still tracks it', () => {
      const detail = md3BranchDetail(
        branch({ tracking: 'origin/main', upstreamGone: true })
      )
      assert.ok(detail.includes('tracked origin/main, now gone'))
      assert.ok(!detail.includes('tracks origin/main'))
    })
  })

  describe('groupMd3Branches', () => {
    it('orders the groups Current, Local, Remote', () => {
      const { rows } = groupMd3Branches(md3BranchFixtures)
      assert.deepStrictEqual(
        rows.map(row => row.group),
        ['Current', 'Local', 'Local', 'Local', 'Local', 'Remote', 'Remote']
      )
    })

    it('marks a header on the first row of each group and nowhere else', () => {
      const { headerAt } = groupMd3Branches(md3BranchFixtures)
      assert.deepStrictEqual(
        [...headerAt].sort((a, b) => a - b),
        [0, 1, 5]
      )
    })

    it('emits no header for a group with no branches in it', () => {
      const remoteOnly = md3BranchFixtures.filter(b => b.group === 'Remote')
      const { rows, headerAt } = groupMd3Branches(remoteOnly)
      assert.strictEqual(rows.length, 2)
      assert.deepStrictEqual([...headerAt], [0])
    })

    it('drops nothing it was given', () => {
      const { rows } = groupMd3Branches(md3BranchFixtures)
      assert.strictEqual(rows.length, md3BranchFixtures.length)
    })
  })

  describe('md3BranchRowActions', () => {
    /**
     * The capability list of `generateBranchContextMenuItems`, which this view
     * replaces. Every one of these must still be reachable, or the rewrite has
     * silently removed a feature.
     */
    const required: ReadonlyArray<Md3BranchRowActionId> = [
      'merge',
      'rebase',
      'openPullRequest',
      'rename',
      'delete',
      'mergeAndDelete',
      'compare',
      'copyName',
      'togglePin',
      'hide',
      'solo',
      'restoreVisibility',
      'checkoutInNewWorktree',
      'viewOnForge',
      'viewPullRequestOnForge',
    ]

    it('reaches every action the surface it replaces could reach', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[1],
        'development',
        allHandlers(),
        true
      )
      const ids = actions.map(action => action.id)
      for (const id of required) {
        assert.ok(ids.includes(id), `the row menu lost "${id}"`)
      }
    })

    it('opens with the five actions the contract draws, in its order', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[1],
        'development',
        allHandlers(),
        false
      )
      assert.deepStrictEqual(
        actions.slice(0, 5).map(a => a.id),
        ['merge', 'rebase', 'openPullRequest', 'rename', 'delete']
      )
    })

    it('names the branch a merge or rebase would land in', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[1],
        'development',
        allHandlers(),
        false
      )
      assert.strictEqual(
        actions.find(a => a.id === 'merge')?.label,
        'Merge into development'
      )
      assert.strictEqual(
        actions.find(a => a.id === 'rebase')?.label,
        'Rebase onto development'
      )
    })

    it('omits an action whose handler was not supplied rather than deadening it', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[1],
        'development',
        { onDeleteBranch: () => {} },
        false
      )
      assert.deepStrictEqual(
        actions.map(a => a.id),
        ['delete']
      )
    })

    it('marks the irreversible actions destructive', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[1],
        'development',
        allHandlers(),
        false
      )
      const destructive = actions.filter(a => a.destructive).map(a => a.id)
      assert.deepStrictEqual(destructive.sort(), ['delete', 'mergeAndDelete'])
    })

    it('disables merge, rebase and delete on the checked-out branch', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[0],
        'development',
        allHandlers(),
        false
      )
      for (const id of ['merge', 'rebase', 'delete', 'hide']) {
        assert.strictEqual(
          actions.find(a => a.id === id)?.enabled,
          false,
          `"${id}" should be disabled on the current branch`
        )
      }
    })

    it('disables rename on a remote branch', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[6],
        'development',
        allHandlers(),
        false
      )
      assert.strictEqual(actions.find(a => a.id === 'rename')?.enabled, false)
    })

    it('offers switching to an existing worktree instead of making a new one', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[2],
        'development',
        allHandlers(),
        false
      )
      const ids = actions.map(a => a.id)
      assert.ok(ids.includes('switchToWorktree'))
      assert.ok(!ids.includes('checkoutInNewWorktree'))
    })

    it('labels the pin action by what pressing it would do', () => {
      const pinned = md3BranchRowActions(
        branch({ isPinned: true }),
        'development',
        allHandlers(),
        false
      )
      const unpinned = md3BranchRowActions(
        branch({ isPinned: false }),
        'development',
        allHandlers(),
        false
      )
      assert.strictEqual(
        pinned.find(a => a.id === 'togglePin')?.label,
        'Unpin branch'
      )
      assert.strictEqual(
        unpinned.find(a => a.id === 'togglePin')?.label,
        'Pin branch'
      )
    })

    it('disables "restore all branches" when nothing is hidden', () => {
      const actions = md3BranchRowActions(
        md3BranchFixtures[1],
        'development',
        allHandlers(),
        false
      )
      assert.strictEqual(
        actions.find(a => a.id === 'restoreVisibility')?.enabled,
        false
      )
    })

    it('disables the pull request actions on a branch with no forge', () => {
      const actions = md3BranchRowActions(
        branch({ isOnForge: false, pullRequest: undefined }),
        'development',
        allHandlers(),
        false
      )
      assert.strictEqual(
        actions.find(a => a.id === 'openPullRequest')?.enabled,
        false
      )
      assert.strictEqual(
        actions.find(a => a.id === 'viewPullRequestOnForge')?.enabled,
        false
      )
    })
  })

  describe('md3BranchListActions', () => {
    it('reaches the list-level capabilities the previous surface had', () => {
      const noop = () => {}
      const actions = md3BranchListActions(
        {
          onSortByName: noop,
          onSortByRecent: noop,
          onShowPullRequests: noop,
          onFetchRemoteBranches: noop,
          onRestoreVisibility: noop,
          onBulkDeleteBranches: noop,
        },
        'name'
      )
      assert.deepStrictEqual(
        actions.map(a => a.id),
        [
          'onSortByName',
          'onSortByRecent',
          'onShowPullRequests',
          'onFetchRemoteBranches',
          'onRestoreVisibility',
          'onBulkDeleteBranches',
        ]
      )
    })

    it('says which sort order is the current one', () => {
      const noop = () => {}
      const actions = md3BranchListActions(
        { onSortByName: noop, onSortByRecent: noop },
        'recent'
      )
      assert.strictEqual(actions[0].label, 'Sort by name')
      assert.strictEqual(actions[1].label, 'Sort by most recent (current)')
    })

    it('marks the bulk delete destructive', () => {
      const actions = md3BranchListActions(
        { onBulkDeleteBranches: () => {} },
        undefined
      )
      assert.strictEqual(actions[0].destructive, true)
    })

    it('resolves to nothing when no handler was supplied', () => {
      assert.deepStrictEqual(md3BranchListActions({}, undefined), [])
    })
  })

  describe('merge all', () => {
    it('reports a run that is still going', () => {
      assert.strictEqual(md3MergeAllRunning(md3MergeAllRunningFixture), true)
    })

    it('reports a finished or cancelled run as over', () => {
      assert.strictEqual(md3MergeAllRunning(md3MergeAllFinishedFixture), false)
      assert.strictEqual(
        md3MergeAllRunning({
          phase: 'cancelled',
          currentBranch: null,
          completed: 1,
          total: 4,
        }),
        false
      )
      assert.strictEqual(md3MergeAllRunning(null), false)
      assert.strictEqual(md3MergeAllRunning(undefined), false)
    })

    it('reports real progress, not a timer', () => {
      const progress = md3MergeAllProgress(md3MergeAllRunningFixture)
      assert.strictEqual(progress?.percent, 50)
      assert.strictEqual(progress?.label, 'Merging feature/md3-shell, 2 of 4')
    })

    it('never sits at zero while work is genuinely running', () => {
      const progress = md3MergeAllProgress({
        phase: 'preparing',
        currentBranch: null,
        completed: 0,
        total: 9,
      })
      assert.ok(progress !== null)
      assert.ok(progress.percent !== null && progress.percent > 0)
      assert.strictEqual(progress.label, 'Merging all branches, 0 of 9')
    })

    it('survives a nonsense total without dividing by zero', () => {
      const progress = md3MergeAllProgress({
        phase: 'merging',
        currentBranch: null,
        completed: 3,
        total: 0,
      })
      assert.ok(progress !== null)
      assert.ok(progress.percent !== null)
      assert.ok(Number.isFinite(progress.percent))
      assert.ok(progress.percent <= 100)
    })

    /*
     * The store behind this reports what it has finished and what it is doing
     * right now, and never how many branches the run will touch. Deriving a
     * denominator from those two renders "3 of 4" over a queue of twelve and
     * pins the bar near its end for the whole run, so an unknown total has to
     * stay unknown all the way to the bar.
     */
    it('reports an indeterminate run rather than inventing a denominator', () => {
      const progress = md3MergeAllProgress({
        phase: 'merging',
        currentBranch: 'feature/md3-shell',
        completed: 3,
        total: null,
      })
      assert.ok(progress !== null)
      assert.strictEqual(progress.percent, null)
      assert.strictEqual(
        progress.label,
        'Merging feature/md3-shell, 3 done so far'
      )
      assert.ok(!progress.label.includes(' of '))
    })

    it('keeps an unknown total indeterminate before any branch is in hand', () => {
      const progress = md3MergeAllProgress({
        phase: 'preparing',
        currentBranch: null,
        completed: 0,
        total: null,
      })
      assert.ok(progress !== null)
      assert.strictEqual(progress.percent, null)
      assert.strictEqual(progress.label, 'Merging all branches, 0 done so far')
    })

    it('has no progress to report when nothing is running', () => {
      assert.strictEqual(md3MergeAllProgress(null), null)
      assert.strictEqual(md3MergeAllProgress(md3MergeAllFinishedFixture), null)
    })
  })

  describe('the view source', () => {
    const source = readFileSync(ViewSource, 'utf8')

    it('refuses re-entry with a ref rather than the disabled attribute alone', () => {
      assert.ok(source.includes('mergeRequested.current'))
      assert.ok(/if \(mergeRequested\.current\) \{\s*return/.test(source))
      assert.ok(source.includes('disabled={running'))
    })

    it('binds the search field to the contract placeholder and names it', () => {
      assert.ok(source.includes("t('md3.branches.filterPlaceholder')"))
      assert.ok(source.includes("t('md3.branches.fieldLabel')"))
      assert.ok(source.includes('onOpenBuilder='))
    })

    it('ships both tonal actions the contract draws', () => {
      assert.ok(source.includes('icon="add"'))
      assert.ok(source.includes('icon="merge"'))
      assert.ok(source.includes("t('md3.branches.newBranch')"))
    })

    it('gives the row list grid semantics and a roving tab stop', () => {
      assert.ok(source.includes('role="grid"'))
      assert.ok(source.includes('role="row"'))
      assert.ok(source.includes('role="gridcell"'))
      assert.ok(source.includes('aria-selected={selected}'))
      assert.ok(source.includes('tabIndex={row.name === rovingName ? 0 : -1}'))
    })

    it('animates through the namespaced class, never the global keyframe', () => {
      assert.ok(source.includes("'md3-anim-up'"))
      assert.ok(!source.includes('dmUp'))
    })

    it('hangs no hint on a title attribute', () => {
      // The ban is on the HTML `title` tooltip, which is unreachable by
      // keyboard and unread by most screen readers. A React component is free
      // to take a prop called `title` — the destructive gate's dialog heading
      // is one — so the match is narrowed to lowercase (host) elements rather
      // than every occurrence of the six characters.
      const onHostElement = [...source.matchAll(/\stitle=/g)].filter(match => {
        const opening = source.lastIndexOf('<', match.index)
        return (
          opening >= 0 && /^<[a-z]/.test(source.slice(opening, opening + 2))
        )
      })

      assert.deepEqual(
        onHostElement.map(match => source.slice(match.index, match.index + 40)),
        []
      )
    })

    it('offers an honest empty state rather than a blank pane', () => {
      assert.ok(source.includes('Md3EmptyState'))
      // The empty state is a banded family, so it renders through `tFunny`
      // rather than `t`. `md3-language-modes-test.ts` owns the bands
      // themselves; what matters here is that the pane still says something.
      assert.ok(source.includes("tFunny('md3.branches.empty')"))
    })

    /*
     * `null > 0` is `false`, so an unmeasured branch would hide its pills even
     * without the null check — and the day somebody flips the guard to
     * `!== 0` or `Boolean(row.ahead)` an unmeasured branch starts drawing a
     * pill reading "↑null". The explicit check is what states the intent.
     */
    it('draws a divergence pill only for a measured, non-zero count', () => {
      assert.ok(source.includes('row.ahead !== null && row.ahead > 0'))
      assert.ok(source.includes('row.behind !== null && row.behind > 0'))
    })
  })

  describe('the stylesheet', () => {
    const styles = readFileSync(StyleSheet, 'utf8')

    it('ships a rule for every class the view depends on', () => {
      for (const selector of [
        '.md3-branches',
        '.md3-branches__pane',
        '.md3-branches__list',
        '.md3-branches__row',
        '.md3-branches__main',
        '.md3-branches__icon',
        '.md3-branches__icon--current',
        '.md3-branches__text',
        '.md3-branches__meta',
        '.md3-branches__pills',
        '.md3-branches__pill',
        '.md3-branches__pill--ahead',
        '.md3-branches__pill--behind',
        '.md3-branches__checkout',
        '.md3-branches__checkout--current',
      ]) {
        assert.ok(hasRule(styles, selector), `missing a rule for ${selector}`)
      }
    })

    it('keeps the contract measurements', () => {
      assert.ok(styles.includes('border-radius: 12px'))
      assert.ok(styles.includes('padding: 0 8px 8px 8px'))
      assert.ok(styles.includes('padding: 0 6px 8px 6px'))
      assert.ok(styles.includes('font-size: 10.5px'))
      assert.ok(styles.includes('height: 20px'))
      assert.ok(styles.includes('height: 26px'))
      assert.ok(styles.includes('font-size: 11px'))
    })

    it('reads its colours from tokens and hard-codes none', () => {
      assert.ok(styles.includes('var(--md-sys-color-surface-container)'))
      assert.ok(styles.includes('var(--dm-amber-container)'))
      assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(styles))
    })

    it('drops its transition under reduced motion', () => {
      assert.ok(styles.includes('prefers-reduced-motion: reduce'))
    })

    it('uses no [data-theme] selector, which this app never sets', () => {
      assert.ok(!styles.includes('[data-theme'))
    })
  })
})
