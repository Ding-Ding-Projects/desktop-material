/**
 * Preview and test data for `Md3HistoryView`.
 *
 * THIS IS NOT PRODUCT CONTENT. Nothing here is shipped to a user: the view
 * takes every row it renders as a prop and the shell feeds it from the real
 * repository. These fixtures exist so that a unit test, a screenshot harness or
 * a local preview has something with the right *shape* to render — the shapes
 * come from `design/History MD3.dc.html`'s `commitData()`, `fileData()` and
 * `diffData()`, and so do the sample values.
 */

import { IMd3DiffFileTab, IMd3DiffLine } from './md3-diff-pane'
import { IMd3HistoryCommit } from './md3-history-view'

/** The contract's `commitData()`, in this view's prop shape. */
export const md3HistoryCommitFixtures: ReadonlyArray<IMd3HistoryCommit> = [
  {
    sha: '4f1c9ae',
    summary: 'Rewrite history panel surfaces on MD3 tonal containers',
    body: 'Replaces stacked pane borders with tonal containers, moves secondary actions into overflow menus, and turns commit detail into a right-anchored sheet over the diff.',
    author: 'Alice Lindqvist',
    relativeTime: '12 minutes ago',
    absoluteTime: '10 Aug 2026, 09:41',
    day: 'Today',
    tag: null,
    unpushed: true,
    isMine: true,
    pinned: false,
    kind: 'verified',
    addedLineCount: 218,
    deletedLineCount: 96,
    changedFileCount: 4,
    branchName: 'development',
  },
  {
    sha: '9b7de20',
    summary: 'Add anchored regex builder to every search field',
    body: 'Each search field now owns its own builder, bound to that field’s query, pattern, flags and mode.',
    author: 'Alice Lindqvist',
    relativeTime: '2 hours ago',
    absoluteTime: '10 Aug 2026, 07:58',
    day: 'Today',
    tag: null,
    unpushed: true,
    isMine: true,
    pinned: true,
    kind: 'verified',
    addedLineCount: 411,
    deletedLineCount: 38,
    changedFileCount: 4,
    branchName: 'development',
  },
  {
    sha: 'c30a8f1',
    summary: 'Release 3.5.0',
    body: 'Version bump and changelog for the 3.5.0 release.',
    author: 'Ravi Chandran',
    relativeTime: 'Yesterday, 18:04',
    absoluteTime: '9 Aug 2026, 18:04',
    day: 'Yesterday',
    tag: 'v3.5.0',
    unpushed: false,
    isMine: false,
    pinned: false,
    kind: 'verified',
    addedLineCount: 12,
    deletedLineCount: 3,
    changedFileCount: 4,
    branchName: 'development',
  },
  {
    sha: '77ab4c9',
    summary: 'Merge branch ’feature/inbox’ into development',
    body: 'Brings the notification inbox onto development.',
    author: 'Mira Okonkwo',
    relativeTime: 'Yesterday, 15:22',
    absoluteTime: '9 Aug 2026, 15:22',
    day: 'Yesterday',
    tag: null,
    unpushed: false,
    isMine: false,
    pinned: false,
    kind: 'merge',
    addedLineCount: 903,
    deletedLineCount: 140,
    changedFileCount: 4,
    branchName: 'development',
  },
]

/** The contract's `fileData()`, in the shared diff pane's tab shape. */
export const md3HistoryFileFixtures: ReadonlyArray<IMd3DiffFileTab> = [
  {
    path: 'app/src/ui/history/history-view.tsx',
    name: 'history-view.tsx',
    kind: 'modified',
    addedLineCount: 96,
    deletedLineCount: 61,
  },
  {
    path: 'app/styles/ui/_history.scss',
    name: '_history.scss',
    kind: 'modified',
    addedLineCount: 84,
    deletedLineCount: 35,
  },
  {
    path: 'app/src/ui/history/commit-detail-sheet.tsx',
    name: 'commit-detail-sheet.tsx',
    kind: 'new',
    addedLineCount: 7,
    deletedLineCount: 0,
  },
  {
    path: 'app/src/ui/history/index.ts',
    name: 'index.ts',
    kind: 'modified',
    addedLineCount: 31,
    deletedLineCount: 0,
  },
]

/** The contract's `diffData()`. */
export const md3HistoryDiffFixtures: ReadonlyArray<IMd3DiffLine> = [
  {
    id: 'h1',
    kind: 'hunk',
    text: '@@ -118,14 +118,26 @@ .history-view-panel',
  },
  {
    id: 'l1',
    kind: 'context',
    text: '  display: flex;',
    oldLineNumber: 118,
    newLineNumber: 118,
  },
  {
    id: 'l2',
    kind: 'context',
    text: '  flex-direction: column;',
    oldLineNumber: 119,
    newLineNumber: 119,
  },
  {
    id: 'l3',
    kind: 'delete',
    text: '  border-right: 1px solid var(--md-sys-color-outline-variant);',
    oldLineNumber: 120,
  },
  {
    id: 'l4',
    kind: 'delete',
    text: '  border-bottom: var(--base-border);',
    oldLineNumber: 121,
  },
  {
    id: 'l5',
    kind: 'add',
    text: '  background: var(--md-sys-color-surface-container-low);',
    newLineNumber: 120,
  },
  {
    id: 'l6',
    kind: 'add',
    text: '  border-radius: var(--md-sys-shape-corner-large);',
    newLineNumber: 121,
  },
  {
    id: 'l7',
    kind: 'add',
    text: '  overflow: hidden;',
    newLineNumber: 122,
  },
  {
    id: 'l8',
    kind: 'context',
    text: '  min-height: 0;',
    oldLineNumber: 122,
    newLineNumber: 123,
  },
  {
    id: 'l9',
    kind: 'context',
    text: '}',
    oldLineNumber: 123,
    newLineNumber: 124,
  },
  {
    id: 'h2',
    kind: 'hunk',
    text: '@@ -146,9 +158,21 @@ .commit',
  },
  {
    id: 'l10',
    kind: 'context',
    text: '.commit {',
    oldLineNumber: 146,
    newLineNumber: 158,
  },
  {
    id: 'l11',
    kind: 'delete',
    text: '  padding: 11px 12px;',
    oldLineNumber: 147,
  },
  {
    id: 'l12',
    kind: 'add',
    text: '  padding: 7px 6px 7px 4px;',
    newLineNumber: 159,
  },
  {
    id: 'l13',
    kind: 'add',
    text: '  border-radius: 10px;',
    newLineNumber: 160,
  },
  {
    id: 'l14',
    kind: 'context',
    text: '',
    oldLineNumber: 148,
    newLineNumber: 161,
  },
  {
    id: 'l15',
    kind: 'context',
    text: '  &.selected {',
    oldLineNumber: 149,
    newLineNumber: 162,
  },
  {
    id: 'l16',
    kind: 'delete',
    text: '    background: var(--box-selected-background-color);',
    oldLineNumber: 150,
  },
  {
    id: 'l17',
    kind: 'add',
    text: '    background: var(--md-sys-color-secondary-container);',
    newLineNumber: 163,
  },
  {
    id: 'l18',
    kind: 'context',
    text: '  }',
    oldLineNumber: 151,
    newLineNumber: 164,
  },
  {
    id: 'l19',
    kind: 'context',
    text: '}',
    oldLineNumber: 152,
    newLineNumber: 165,
  },
]
