import { IMd3ChangedFile } from './md3-changes-view'
import { IMd3DiffLine } from './md3-diff-pane'

/**
 * Preview and test data for `Md3ChangesView` and `Md3DiffPane`.
 *
 * NOT SHIPPED CONTENT. Nothing in this module reaches a running application:
 * the view takes every row it renders as a prop, and the shell feeds it the
 * real working tree. These rows exist so a unit test, a screenshot harness or
 * a storybook-style preview has something with the right shape to render, and
 * they deliberately describe a fictional repository rather than the contract's
 * own sample commit authors.
 */

/** Eight changed files covering all three statuses and a partial selection. */
export const md3ChangesFixture: ReadonlyArray<IMd3ChangedFile> = [
  {
    path: 'app/src/ui/md3/md3-changes-view.tsx',
    status: 'A',
    included: true,
    addedLineCount: 218,
    deletedLineCount: 0,
  },
  {
    path: 'app/src/ui/md3/md3-diff-pane.tsx',
    status: 'A',
    included: true,
    addedLineCount: 164,
    deletedLineCount: 0,
  },
  {
    path: 'app/styles/ui/_md3-changes-view.scss',
    status: 'M',
    included: true,
    partiallyIncluded: true,
    addedLineCount: 96,
    deletedLineCount: 12,
  },
  {
    path: 'app/styles/_ui.scss',
    status: 'M',
    included: true,
    addedLineCount: 2,
    deletedLineCount: 0,
  },
  {
    path: 'app/src/lib/i18n-resources.ts',
    status: 'M',
    included: false,
    addedLineCount: 74,
    deletedLineCount: 3,
  },
  {
    path: 'app/test/unit/md3-changes-view-test.ts',
    status: 'A',
    included: true,
    addedLineCount: 132,
    deletedLineCount: 0,
  },
  {
    path: 'docs/features/changes/legacy-sidebar.md',
    status: 'D',
    included: false,
    addedLineCount: 0,
    deletedLineCount: 58,
  },
  {
    path: 'Makefile',
    status: 'M',
    included: true,
    addedLineCount: 4,
    deletedLineCount: 4,
  },
]

/** A short diff, one hunk, covering every line kind the pane paints. */
export const md3DiffFixture: ReadonlyArray<IMd3DiffLine> = [
  {
    id: 'h1',
    kind: 'hunk',
    text: '@@ -18,7 +18,9 @@ export function renderSidebar()',
  },
  {
    id: 'l1',
    kind: 'context',
    text: '  const files = props.workingDirectory.files',
    oldLineNumber: 18,
    newLineNumber: 18,
  },
  {
    id: 'l2',
    kind: 'delete',
    text: '  return <ChangesList files={files} />',
    oldLineNumber: 19,
  },
  {
    id: 'l3',
    kind: 'add',
    text: '  return (',
    newLineNumber: 19,
  },
  {
    id: 'l4',
    kind: 'add',
    text: '    <Md3ChangesView files={files} totalFileCount={files.length} />',
    newLineNumber: 20,
  },
  {
    id: 'l5',
    kind: 'add',
    text: '  )',
    newLineNumber: 21,
  },
  {
    id: 'l6',
    kind: 'context',
    text: '}',
    oldLineNumber: 20,
    newLineNumber: 22,
  },
]

/** How many of `md3ChangesFixture` are included, for the include-all label. */
export const md3ChangesIncludedCount = md3ChangesFixture.filter(
  file => file.included
).length
