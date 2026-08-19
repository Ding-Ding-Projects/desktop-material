import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  IMd3HistoryCommit,
  IMd3HistoryViewProps,
  Md3HistoryView,
} from '../../src/ui/md3/md3-history-view'
import {
  md3HistoryCommitFixtures,
  md3HistoryDiffFixtures,
  md3HistoryFileFixtures,
} from '../../src/ui/md3/md3-history-view-fixtures'
import { render, screen } from '../helpers/ui/render'

/**
 * The commit detail sheet, rendered.
 *
 * Both defects it guards were invisible to the derivation tests beside it,
 * because both live in the sheet's own markup rather than in a formatter: the
 * three stat pills printed `+0 −0` and `0 files` regardless of whether the
 * commit's changeset had actually been read, and each file row printed the
 * same pair beside a path whose per-file counts the adapter never had. Nothing
 * about either is a type error, and the contract fixtures carry real numbers,
 * so only a render with the real "not loaded" shape can reproduce them.
 */

const commit = md3HistoryCommitFixtures[0]

function viewProps(
  primary: IMd3HistoryCommit,
  files = md3HistoryFileFixtures
): IMd3HistoryViewProps {
  return {
    commits: [primary],
    selectedShas: [primary.sha],
    onSelectionChanged: () => {},
    filterText: '',
    filterRegexEnabled: false,
    onFilterTextChanged: () => {},
    onFilterRegexToggled: () => {},
    onOpenFilterRegexBuilder: () => {},
    activeFilters: [],
    onFiltersChanged: () => {},
    showCommitGraph: true,
    onShowCommitGraphChanged: () => {},
    showAbsoluteDates: false,
    onShowAbsoluteDatesChanged: () => {},
    diff: {
      filePath: files[0]?.path ?? '',
      wrapLines: false,
      onToggleWrap: () => {},
      onOpenDiffOptions: () => {},
      onOpenFileMenu: () => {},
      searchValue: '',
      searchRegexEnabled: false,
      onSearchChange: () => {},
      onSearchClear: () => {},
      onToggleSearchRegex: () => {},
      onOpenSearchBuilder: () => {},
      fileTabs: files,
      activeFileTabPath: files[0]?.path,
      onSelectFileTab: () => {},
      lines: md3HistoryDiffFixtures,
    },
    detailsOpen: true,
    onDetailsOpenChanged: () => {},
    onOpenListMenu: () => {},
    onOpenRowMenu: () => {},
    onOpenFileMenu: () => {},
    onTogglePin: () => {},
    onCopySha: () => {},
    onViewOnGitHub: () => {},
    onRevertCommit: () => {},
  }
}

const sheetText = (props: IMd3HistoryViewProps): string => {
  render(<Md3HistoryView {...props} />)
  const sheet = screen.getByRole('dialog')
  return sheet.textContent ?? ''
}

describe('md3 commit detail sheet', () => {
  it('reports the real totals once the changeset has been read', () => {
    const text = sheetText(viewProps({ ...commit, statsLoaded: true }))

    assert.ok(text.includes(`+${commit.addedLineCount}`))
    assert.ok(text.includes(`−${commit.deletedLineCount}`))
    assert.ok(text.includes(`${md3HistoryFileFixtures.length} files`))
  })

  it('says the count is still being taken rather than printing zeroes', () => {
    // The sheet opens on the selected commit at exactly the moment its
    // `--numstat` read is in flight, so this is the state it is most often
    // first seen in. "+0 −0 · 0 files" there is a finished-looking answer
    // about a commit that plainly changed something.
    const text = sheetText(
      viewProps(
        {
          ...commit,
          statsLoaded: false,
          addedLineCount: 0,
          deletedLineCount: 0,
          changedFileCount: 0,
        },
        []
      )
    )

    assert.ok(!text.includes('+0'), `sheet still claims added lines: ${text}`)
    assert.ok(!text.includes('−0'), `sheet still claims deleted lines: ${text}`)
    assert.ok(!text.includes('0 files'), `sheet still claims a count: ${text}`)
    assert.ok(text.includes('Counting what changed'))
  })

  it('omits a file’s line counts when none were ever read', () => {
    // What the History adapter actually produces: a commit's changeset carries
    // the commit's two totals and no per-file split.
    const files = md3HistoryFileFixtures.map(file => ({
      ...file,
      addedLineCount: undefined,
      deletedLineCount: undefined,
    }))

    const props = viewProps({ ...commit, statsLoaded: true }, files)
    render(<Md3HistoryView {...props} />)

    const list = screen.getByRole('list', { name: 'Files in this commit' })
    const text = list.textContent ?? ''

    assert.ok(
      !text.includes('+0') && !text.includes('−0'),
      `a file row still claims it changed nothing: ${text}`
    )

    for (const file of files) {
      // The paths themselves must survive the omission.
      assert.ok(text.includes(file.path), `${file.path} left the file list`)

      const row = screen.getByRole('button', { name: file.path })
      assert.ok(row !== null)
    }
  })

  it('keeps the per-file counts when they are genuinely known', () => {
    const props = viewProps({ ...commit, statsLoaded: true })
    render(<Md3HistoryView {...props} />)

    const list = screen.getByRole('list', { name: 'Files in this commit' })
    const text = list.textContent ?? ''
    const [first] = md3HistoryFileFixtures

    assert.ok(text.includes(`+${first.addedLineCount}`))
    assert.ok(text.includes(`−${first.deletedLineCount}`))
  })
})
