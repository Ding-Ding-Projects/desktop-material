import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  appendVersionHistoryPage,
  classifyVersionHistoryDiffLine,
  IVersionHistoryEntry,
  IVersionHistoryPage,
  IVersionedStoreHistorySource,
  VersionedStoreHistory,
} from '../../../src/ui/version-history'
import { DialogStackContext } from '../../../src/ui/dialog'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolveValue: ((value: T) => void) | null = null
  const promise = new Promise<T>(resolve => {
    resolveValue = resolve
  })

  if (resolveValue === null) {
    throw new Error('Deferred promise resolver was not initialized')
  }

  return { promise, resolve: resolveValue }
}

function historyEntry(
  sha: string,
  summary: string,
  committedAt = new Date('2026-07-11T12:00:00Z')
): IVersionHistoryEntry {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    summary,
    body: '',
    committedAt,
    undoOf: null,
    redoOf: null,
    restoreOf: null,
  }
}

/** Timestamps that descend the way a newest-first timeline does. */
function at(minutesAgo: number): Date {
  return new Date(Date.UTC(2026, 6, 11, 12, 0, 0) - minutesAgo * 60_000)
}

function historyPage(
  entries: ReadonlyArray<IVersionHistoryEntry>,
  hasMore: boolean,
  canUndo = true
): IVersionHistoryPage {
  return {
    entries,
    total: entries.length,
    hasMore,
    canUndo,
    canRedo: false,
  }
}

describe('versioned store history', () => {
  it('keeps a paged timeline linear when the offset window slides', () => {
    const loaded = [
      historyEntry('aaaaaaaa', 'Third', at(1)),
      historyEntry('bbbbbbbb', 'Second', at(2)),
    ]
    // A commit landed between the two reads, so the store's second page starts
    // one entry earlier and repeats the tail of the first page.
    const shifted = [
      historyEntry('bbbbbbbb', 'Second', at(2)),
      historyEntry('cccccccc', 'First', at(3)),
    ]

    assert.deepStrictEqual(
      appendVersionHistoryPage(loaded, shifted).map(entry => entry.sha),
      ['aaaaaaaa', 'bbbbbbbb', 'cccccccc']
    )
  })

  it('never pages a newer commit in underneath older ones', () => {
    const loaded = [historyEntry('aaaaaaaa', 'Third', at(1))]
    const withNewer = [
      historyEntry('dddddddd', 'Newer than everything loaded', at(0)),
      historyEntry('cccccccc', 'First', at(3)),
    ]

    assert.deepStrictEqual(
      appendVersionHistoryPage(loaded, withNewer).map(entry => entry.sha),
      ['aaaaaaaa', 'cccccccc']
    )
  })

  it('starts a new timeline when the panel is pointed at another store', async () => {
    const first = historyEntry('11111111', 'Alpha element change')
    const second = historyEntry('22222222', 'Beta element change')
    const requestedSkips: number[] = []
    const sourceFor = (
      entry: IVersionHistoryEntry
    ): IVersionedStoreHistorySource => ({
      getHistory: skip => {
        requestedSkips.push(skip ?? 0)
        return Promise.resolve(historyPage([entry], false))
      },
      getFiles: () => Promise.resolve([]),
      getDiff: () => Promise.resolve(''),
    })

    const panel = (entry: IVersionHistoryEntry, sourceKey: string) => (
      <VersionedStoreHistory
        title="Element history"
        timelineLabel="Element timeline"
        description="Test history"
        source={sourceFor(entry)}
        sourceKey={sourceKey}
        readOnly={true}
        onDismissed={() => {}}
      />
    )

    const view = render(panel(first, 'alpha'))
    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: /Alpha element change/i }))
    )

    view.rerender(panel(second, 'beta'))

    // The previous repository's commits cannot remain in a timeline that now
    // describes a different repository.
    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: /Beta element change/i }))
    )
    assert.equal(
      screen.queryByRole('option', { name: /Alpha element change/i }),
      null
    )
    assert.deepStrictEqual(requestedSkips, [0, 0])
  })

  it('pages by what the store served, not by what survived the guard', async () => {
    const shared = historyEntry('bbbbbbbb', 'Second snapshot', at(2))
    const pages = [
      historyPage(
        [historyEntry('aaaaaaaa', 'Third snapshot', at(1)), shared],
        true
      ),
      historyPage(
        [shared, historyEntry('cccccccc', 'First snapshot', at(3))],
        false
      ),
    ]
    const requestedSkips: number[] = []
    let call = 0
    const source: IVersionedStoreHistorySource = {
      getHistory: skip => {
        requestedSkips.push(skip ?? 0)
        return Promise.resolve(pages[call++])
      },
      getFiles: () => Promise.resolve([]),
      getDiff: () => Promise.resolve(''),
    }

    render(
      <VersionedStoreHistory
        title="Settings history"
        timelineLabel="Settings timeline"
        description="Test history"
        source={source}
        readOnly={true}
        onDismissed={() => {}}
      />
    )

    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: /Third snapshot/i }))
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: /First snapshot/i }))
    )

    // Two entries were read even though one was dropped as a repeat, so the
    // next page has to skip two — otherwise the same window is fetched forever.
    assert.deepStrictEqual(requestedSkips, [0, 2])
    assert.equal(
      screen.getAllByRole('option', { name: /Second snapshot/i }).length,
      1
    )
  })

  it('classifies unified diff lines for the read-only viewer', () => {
    assert.equal(classifyVersionHistoryDiffLine('diff --git a/a b/a'), 'header')
    assert.equal(
      classifyVersionHistoryDiffLine('--- a/settings.json'),
      'header'
    )
    assert.equal(
      classifyVersionHistoryDiffLine('+++ b/settings.json'),
      'header'
    )
    assert.equal(classifyVersionHistoryDiffLine('@@ -1 +1 @@'), 'hunk')
    assert.equal(classifyVersionHistoryDiffLine('-"theme": "dark"'), 'deletion')
    assert.equal(
      classifyVersionHistoryDiffLine('+"theme": "light"'),
      'addition'
    )
    assert.equal(classifyVersionHistoryDiffLine(' unchanged'), 'context')
  })

  it('lets only the topmost stacked history consume Escape', () => {
    const dismissed = { background: 0, foreground: 0 }
    const source: IVersionedStoreHistorySource = {
      getHistory: () => Promise.resolve(historyPage([], false, false)),
      getFiles: () => Promise.resolve([]),
      getDiff: () => Promise.resolve(''),
      undoLastChange: () => Promise.resolve(),
      redoLastChange: () => Promise.resolve(),
      restoreTo: () => Promise.resolve(),
    }
    const history = (isTopMost: boolean, layer: keyof typeof dismissed) => (
      <DialogStackContext.Provider value={{ isTopMost }}>
        <VersionedStoreHistory
          title={`${layer} history`}
          timelineLabel={`${layer} timeline`}
          description={`${layer} layer`}
          source={source}
          onDismissed={() => dismissed[layer]++}
        />
      </DialogStackContext.Provider>
    )

    render(
      <>
        {history(false, 'background')}
        {history(true, 'foreground')}
      </>
    )
    fireEvent.keyDown(window, { key: 'Escape' })

    assert.deepStrictEqual(dismissed, { background: 0, foreground: 1 })
  })

  it('ignores an old pagination response after undo reloads history', async () => {
    const initialEntry = historyEntry('11111111', 'Initial snapshot')
    const staleEntry = historyEntry('22222222', 'Stale older snapshot')
    const undoEntry = historyEntry('33333333', 'Undo snapshot')
    const stalePagination = createDeferred<IVersionHistoryPage>()
    let historyCalls = 0

    const source: IVersionedStoreHistorySource = {
      getHistory: () => {
        historyCalls++
        if (historyCalls === 1) {
          return Promise.resolve(historyPage([initialEntry], true))
        }
        if (historyCalls === 2) {
          return stalePagination.promise
        }
        return Promise.resolve(historyPage([undoEntry], false, false))
      },
      getFiles: () => Promise.resolve([]),
      getDiff: () => Promise.resolve(''),
      undoLastChange: () => Promise.resolve(),
      redoLastChange: () => Promise.resolve(),
      restoreTo: () => Promise.resolve(),
    }

    render(
      <VersionedStoreHistory
        title="Settings history"
        timelineLabel="Settings timeline"
        description="Test history"
        source={source}
        onDismissed={() => {}}
      />
    )

    await waitFor(() =>
      assert.equal(screen.getAllByText('Initial snapshot').length, 2)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => assert.equal(historyCalls, 2))

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => {
      assert.equal(historyCalls, 3)
      assert.equal(screen.getAllByText('Undo snapshot').length, 2)
    })

    stalePagination.resolve(historyPage([staleEntry], false))
    await stalePagination.promise
    await Promise.resolve()

    assert.equal(screen.queryAllByText('Initial snapshot').length, 0)
    assert.equal(screen.queryAllByText('Stale older snapshot').length, 0)
    assert.equal(screen.getAllByText('Undo snapshot').length, 2)
  })

  it('loads file metadata only for the selected entry', async () => {
    const first = historyEntry('11111111', 'First snapshot')
    const second = historyEntry('22222222', 'Second snapshot')
    const third = historyEntry('33333333', 'Third snapshot')
    const requestedFiles: string[] = []
    const source: IVersionedStoreHistorySource = {
      getHistory: () =>
        Promise.resolve(historyPage([first, second, third], false)),
      getFiles: sha => {
        requestedFiles.push(sha)
        return Promise.resolve(['settings.json'])
      },
      getDiff: () => Promise.resolve(''),
      undoLastChange: () => Promise.resolve(),
      redoLastChange: () => Promise.resolve(),
      restoreTo: () => Promise.resolve(),
    }

    render(
      <VersionedStoreHistory
        title="Settings history"
        timelineLabel="Settings timeline"
        description="Test history"
        source={source}
        onDismissed={() => {}}
      />
    )

    await waitFor(() => assert.deepEqual(requestedFiles, [first.sha]))
    assert.equal(screen.getAllByText('Select to inspect').length, 2)

    fireEvent.click(screen.getByRole('option', { name: /Second snapshot/i }))
    await waitFor(() =>
      assert.deepEqual(requestedFiles, [first.sha, second.sha])
    )
  })

  it('hides undo, redo, and restore in read-only mode', async () => {
    // A read-only source may omit the mutating handlers entirely.
    const source: IVersionedStoreHistorySource = {
      getHistory: () =>
        Promise.resolve(
          historyPage([historyEntry('11111111', 'Snapshot')], false)
        ),
      getFiles: () => Promise.resolve([]),
      getDiff: () => Promise.resolve(''),
    }

    render(
      <VersionedStoreHistory
        title="Appearance history — Alpha"
        timelineLabel="Tab appearance timeline"
        description="Read only"
        source={source}
        readOnly={true}
        onDismissed={() => {}}
      />
    )

    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: /Snapshot/i }))
    )
    assert.equal(screen.queryByRole('button', { name: 'Undo' }), null)
    assert.equal(screen.queryByRole('button', { name: 'Redo' }), null)
    assert.equal(
      screen.queryByRole('button', { name: /Restore Snapshot/i }),
      null
    )
    assert.equal(screen.queryByText('HEAD'), null)
  })

  it('filters the shared timeline with substring and regex modes', async () => {
    const entries = [
      historyEntry('11111111', 'Changed theme'),
      historyEntry('22222222', 'Marked notification read'),
      historyEntry('33333333', 'Restored settings'),
    ]
    const source: IVersionedStoreHistorySource = {
      getHistory: () => Promise.resolve(historyPage(entries, false)),
      getFiles: () => Promise.resolve([]),
      getDiff: () => Promise.resolve(''),
      undoLastChange: () => Promise.resolve(),
      redoLastChange: () => Promise.resolve(),
      restoreTo: () => Promise.resolve(),
    }

    render(
      <VersionedStoreHistory
        title="Settings history"
        timelineLabel="Settings timeline"
        description="Test history"
        source={source}
        onDismissed={() => {}}
      />
    )

    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: /Changed theme/i }))
    )
    fireEvent.change(screen.getByLabelText('Search version history'), {
      target: { value: 'notification' },
    })
    await waitFor(() => {
      assert.equal(
        screen.queryByRole('option', { name: /Changed theme/i }),
        null
      )
      assert.ok(
        screen.getByRole('option', { name: /Marked notification read/i })
      )
    })

    fireEvent.click(screen.getByLabelText(/Filter mode: Fuzzy/))
    fireEvent.click(screen.getByLabelText(/Filter mode: Substring/))
    fireEvent.change(screen.getByLabelText('Search version history'), {
      target: { value: '^Restored' },
    })
    await waitFor(() =>
      assert.ok(screen.getByRole('option', { name: /Restored settings/i }))
    )
  })
})
