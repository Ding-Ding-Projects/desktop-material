/**
 * Preview and test data for `Md3BranchesView`.
 *
 * THIS IS NOT PRODUCT CONTENT. Nothing here is shipped to a user: the view
 * takes every row it renders as a prop, and the shell feeds it from the real
 * repository. These fixtures exist so a unit test, a screenshot harness or a
 * local preview has something with the right *shape* to render — the shape
 * comes from `design/History MD3.dc.html`'s `branchData()`, and so do the
 * sample values.
 */

import { IMd3BranchRow, IMd3MergeAllStatus } from './md3-branches-view'

/** The contract's `branchData()`, in this view's prop shape. */
export const md3BranchFixtures: ReadonlyArray<IMd3BranchRow> = [
  {
    name: 'development',
    group: 'Current',
    meta: 'Updated 12 minutes ago by Alice Lindqvist',
    tipSha: '4f1c9ae',
    tracking: 'origin/development',
    ahead: 3,
    behind: 0,
    isCurrent: true,
    canHide: false,
    isOnForge: true,
  },
  {
    name: 'main',
    group: 'Local',
    meta: 'Updated yesterday by Marek Novak',
    tipSha: '9b2e7d1',
    tracking: 'origin/main',
    ahead: 0,
    behind: 4,
    isCurrent: false,
    isOnForge: true,
  },
  {
    name: 'feature/md3-shell',
    group: 'Local',
    meta: 'Updated 2 hours ago by you',
    tipSha: '1c84f30',
    tracking: 'origin/feature/md3-shell',
    ahead: 7,
    behind: 1,
    pullRequest: { number: 421, state: 'open' },
    isCurrent: false,
    isPinned: true,
    hasWorktree: true,
    isOnForge: true,
  },
  {
    name: 'feature/regex-builder',
    group: 'Local',
    meta: 'Merged yesterday',
    tipSha: '77aa105',
    tracking: null,
    ahead: 0,
    behind: 0,
    isCurrent: false,
    isOnForge: true,
  },
  {
    name: 'fix/diff-gutter',
    group: 'Local',
    meta: 'Updated 3 days ago by Jonas Weber',
    tipSha: 'd3f0b62',
    tracking: 'origin/fix/diff-gutter',
    ahead: 1,
    behind: 2,
    isCurrent: false,
    isOnForge: true,
  },
  {
    name: 'origin/development',
    group: 'Remote',
    meta: 'Tracking branch',
    tipSha: '4f1c9ae',
    tracking: null,
    ahead: 0,
    behind: 0,
    isCurrent: false,
    isOnForge: true,
  },
  {
    name: 'origin/release/2.14',
    group: 'Remote',
    meta: 'Protected branch',
    tipSha: 'ab19c4e',
    tracking: null,
    ahead: 0,
    behind: 12,
    isCurrent: false,
    isOnForge: true,
  },
]

/** A merge-all run halfway through, for the progress-bar path. */
export const md3MergeAllRunningFixture: IMd3MergeAllStatus = {
  phase: 'merging',
  currentBranch: 'feature/md3-shell',
  completed: 2,
  total: 4,
}

/** A finished merge-all run, which must release the button again. */
export const md3MergeAllFinishedFixture: IMd3MergeAllStatus = {
  phase: 'complete',
  currentBranch: null,
  completed: 4,
  total: 4,
}
