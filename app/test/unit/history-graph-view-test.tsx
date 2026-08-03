import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../src/models/branch'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import {
  buildCommitGraph,
  buildCommitGraphRows,
  resolveCommitGraphLaneVisibility,
} from '../../src/ui/history/commit-graph-model'
import {
  CommitGraphBoundaryOverlap,
  CommitGraphColumnWidth,
  CommitGraphNodeRadius,
  CommitGraphStrokeWidth,
} from '../../src/ui/history/commit-graph'
import {
  buildRefs,
  describeLaneControl,
  describeRef,
  getHistoryGraphViewport,
  HistoryGraphRowHeight,
  HistoryGraphView,
  laneColumnWidth,
} from '../../src/ui/history/history-graph-view'
import { captureClipboardWrites } from '../helpers/ui/electron'
import { fireEvent, render, screen, waitFor } from '../helpers/ui/render'

/**
 * jsdom lays everything out at zero, so the list's auto-sizer decides no rows
 * are visible and virtualizes all of them away. Hand it a real viewport the way
 * the repositories-list tests do so the rows under test actually mount.
 */
class TestResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 480,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 400,
    })
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            width: 480,
            height: 400,
            top: 0,
            right: 480,
            bottom: 400,
            left: 0,
            toJSON: () => ({}),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this as unknown as ResizeObserver
    )
  }
  public unobserve() {}
  public disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
})
Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
})

afterEach(() => {
  for (const backdrop of document.querySelectorAll<HTMLElement>(
    '.material-context-menu-backdrop'
  )) {
    fireEvent.mouseDown(backdrop)
  }
})

const identity = new CommitIdentity('Test', 'test@example.com', new Date(0))

function makeCommit(
  sha: string,
  parentSHAs: ReadonlyArray<string>,
  tags: ReadonlyArray<string> = [],
  summary = `summary of ${sha}`
) {
  return new Commit(
    sha,
    sha,
    summary,
    '',
    identity,
    identity,
    parentSHAs,
    [],
    tags
  )
}

function makeBranch(name: string, sha: string, type = BranchType.Local) {
  return new Branch(name, null, { sha }, type, `refs/heads/${name}`)
}

/** A branch-then-merge history: `merge` joins `main` and `topic` over `base`. */
const mergeHistory = [
  makeCommit('merge', ['main', 'topic']),
  makeCommit('main', ['base']),
  makeCommit('topic', ['base']),
  makeCommit('base', [], ['v1.0']),
]

describe('commit graph model: lanes', () => {
  it('reports the widest lane the whole graph reaches, not a single row', () => {
    const graph = buildCommitGraph(mergeHistory)

    // Row 0 opens the second lane, so it alone would report a width of 1 while
    // the rows below it still draw in that lane.
    assert.equal(graph.maxColumn, 1)
    assert.deepEqual(
      graph.rows.map(row => row.column),
      [0, 0, 1, 0]
    )
  })

  it('joins a merge to both parents and rejoins them at the branch point', () => {
    const { rows } = buildCommitGraph(mergeHistory)

    assert.deepEqual(
      rows[0].connections.map(path => [path.fromColumn, path.toColumn]),
      [
        [0, 0],
        [0, 1],
      ]
    )
    // `topic` in lane 1 hands its lane back to lane 0 where `base` sits.
    assert.deepEqual(
      rows[2].connections.map(path => [path.fromColumn, path.toColumn]),
      [[1, 0]]
    )
    assert.equal(rows[3].hasTopLine, true)
  })

  it('keeps every lane in play visible on every row it crosses', () => {
    const { rows, maxColumn } = buildCommitGraph(mergeHistory)

    // Row 1 (`main`) does not sit in lane 1, but `topic` is still open there and
    // has to be carried across as a continuation or the lane breaks in two.
    assert.deepEqual(
      rows[1].continuations.map(path => [path.fromColumn, path.toColumn]),
      [[1, 1]]
    )
    assert.ok(rows.every(row => row.maxColumn <= maxColumn))
  })

  it('gives the existing per-row consumer the same rows', () => {
    assert.deepEqual(
      buildCommitGraphRows(mergeHistory),
      buildCommitGraph(mergeHistory).rows
    )
  })

  it('keeps lane and canonical ref identities stable when newer history arrives', () => {
    const refs = buildRefs(
      [makeBranch('main', 'main'), makeBranch('topic', 'topic')],
      makeBranch('main', 'main')
    )
    const original = buildCommitGraph(mergeHistory, refs)
    const extended = buildCommitGraph(
      [makeCommit('newest', ['merge']), ...mergeHistory],
      refs
    )

    for (const sha of mergeHistory.map(commit => commit.sha)) {
      assert.equal(
        extended.rows.find(row => row.sha === sha)?.laneId,
        original.rows.find(row => row.sha === sha)?.laneId,
        `${sha} changed lane identity when a descendant was added`
      )
    }

    for (const refId of ['branch:refs/heads/main', 'branch:refs/heads/topic']) {
      const originalControl = original.laneControls.find(
        control => control.id === refId
      )
      const extendedControl = extended.laneControls.find(
        control => control.id === refId
      )
      assert.ok(originalControl !== undefined)
      assert.ok(extendedControl !== undefined)
      assert.equal(extendedControl.laneId, originalControl.laneId)
    }
  })

  it('labels merge curves with both endpoint lanes', () => {
    const graph = buildCommitGraph(mergeHistory)
    const mergePaths = graph.rows[0].connections

    assert.equal(mergePaths.length, 2)
    assert.equal(mergePaths[0].fromLaneId, mergePaths[0].toLaneId)
    assert.notEqual(mergePaths[1].fromLaneId, mergePaths[1].toLaneId)
    assert.ok(graph.laneIds.includes(mergePaths[1].fromLaneId))
    assert.ok(graph.laneIds.includes(mergePaths[1].toLaneId))
  })

  it('labels a converging continuation with its surviving destination lane', () => {
    const history = [
      makeCommit('A', ['C', 'E']),
      makeCommit('E', ['D']),
      makeCommit('C', ['D']),
      makeCommit('D', []),
    ]
    const current = makeBranch('topic', 'E')
    const graph = buildCommitGraph(history, buildRefs([], current))
    const cRow = graph.rows.find(row => row.sha === 'C')
    assert.ok(cRow !== undefined)

    const converging = cRow.continuations.find(
      path => path.fromColumn !== path.toColumn
    )
    assert.ok(converging !== undefined)
    assert.notEqual(converging.fromLaneId, converging.toLaneId)
    assert.equal(converging.toLaneId, graph.rows[3].laneId)

    const visibility = resolveCommitGraphLaneVisibility(
      graph,
      new Set(
        graph.laneControls
          .filter(control => control.laneId === converging.toLaneId)
          .map(control => control.id)
      ),
      null
    )
    assert.equal(visibility.visibleLaneIds.has(converging.toLaneId), false)
  })

  it('uses unique fallback names when lane anchors share a short SHA prefix', () => {
    const graph = buildCommitGraph([
      makeCommit('abcdef012345A', []),
      makeCommit('abcdef012345B', []),
    ])
    const fallbackNames = graph.laneControls
      .filter(control => control.kind === 'commit')
      .map(control => control.name)

    assert.deepEqual(fallbackNames.sort(), ['abcdef012345A', 'abcdef012345B'])
    assert.equal(new Set(fallbackNames).size, 2)
  })
})

describe('commit graph model: lane visibility', () => {
  const threeLaneHistory = [
    makeCommit('merge-three', ['main-three', 'topic-three', 'side-three']),
    makeCommit('main-three', ['base-three']),
    makeCommit('topic-three', ['base-three']),
    makeCommit('side-three', ['base-three']),
    makeCommit('base-three', []),
  ]
  const refs = buildRefs(
    [
      makeBranch('main', 'main-three'),
      makeBranch('topic', 'topic-three'),
      makeBranch('side', 'side-three'),
    ],
    makeBranch('main', 'main-three')
  )

  it('protects current and HEAD lanes from hide while solo keeps both visible', () => {
    const graph = buildCommitGraph(threeLaneHistory, refs)
    const main = graph.laneControls.find(control => control.name === 'main')
    const topic = graph.laneControls.find(control => control.name === 'topic')
    const side = graph.laneControls.find(control => control.name === 'side')
    assert.ok(main !== undefined)
    assert.ok(topic !== undefined)
    assert.ok(side !== undefined)

    const hidden = resolveCommitGraphLaneVisibility(
      graph,
      new Set(graph.laneControls.map(control => control.id)),
      null
    )
    assert.ok(hidden.visibleLaneIds.has(main.laneId))
    assert.ok(hidden.protectedLaneIds.has(graph.rows[0].laneId))
    assert.equal(hidden.hiddenLaneIds.has(main.laneId), false)

    const solo = resolveCommitGraphLaneVisibility(graph, new Set(), topic.id)
    assert.ok(solo.visibleLaneIds.has(main.laneId))
    assert.ok(solo.visibleLaneIds.has(topic.laneId))
    assert.equal(solo.visibleLaneIds.has(side.laneId), false)
  })

  it('falls back to all lanes for a stale solo identity', () => {
    const graph = buildCommitGraph(threeLaneHistory, refs)
    const visibility = resolveCommitGraphLaneVisibility(
      graph,
      new Set(),
      'branch:refs/heads/deleted'
    )

    assert.equal(visibility.soloLaneId, null)
    assert.deepEqual(
      [...visibility.visibleLaneIds].sort(),
      [...graph.laneIds].sort()
    )
  })

  it('keeps a visible anchor when no current branch identity is available', () => {
    const graph = buildCommitGraph(threeLaneHistory)
    const visibility = resolveCommitGraphLaneVisibility(
      graph,
      new Set(graph.laneControls.map(control => control.id)),
      null
    )

    assert.ok(visibility.visibleLaneIds.has(graph.rows[0].laneId))
    assert.ok(visibility.visibleLaneIds.size > 0)
  })
})

describe('commit graph model: ref chips', () => {
  it('chips branch heads onto the commit they point at, in that lane colour', () => {
    const { rows } = buildCommitGraph(
      mergeHistory,
      buildRefs(
        [makeBranch('main', 'main'), makeBranch('topic', 'topic')],
        makeBranch('main', 'main')
      )
    )

    assert.deepEqual(
      rows[1].refs.map(ref => ref.name),
      ['main']
    )
    assert.equal(rows[1].refs[0].color, rows[1].color)
    assert.equal(rows[2].refs[0].color, rows[2].color)
    // Different lanes, so the two chips must not share a colour.
    assert.notEqual(rows[1].refs[0].color, rows[2].refs[0].color)
    assert.deepEqual(rows[0].refs, [])
  })

  it('marks the checked-out branch and orders it first', () => {
    const { rows } = buildCommitGraph(
      [makeCommit('a', [])],
      buildRefs(
        [makeBranch('zebra', 'a'), makeBranch('alpha', 'a')],
        makeBranch('zebra', 'a')
      )
    )

    assert.deepEqual(
      rows[0].refs.map(ref => [ref.name, ref.isCurrent]),
      [
        ['zebra', true],
        ['alpha', false],
      ]
    )
  })

  it('folds the commit’s own tags in after its branches', () => {
    const { rows } = buildCommitGraph(
      mergeHistory,
      buildRefs([makeBranch('base', 'base')], null)
    )

    assert.deepEqual(
      rows[3].refs.map(ref => [ref.name, ref.kind]),
      [
        ['base', 'branch'],
        ['v1.0', 'tag'],
      ]
    )
  })

  it('deduplicates a caller tag without an explicit identity against the commit tag', () => {
    const graph = buildCommitGraph(
      [makeCommit('tagged', [], ['release'])],
      [
        {
          name: 'release',
          sha: 'tagged',
          kind: 'tag',
          isCurrent: false,
        },
      ]
    )

    assert.deepEqual(
      graph.rows[0].refs.map(ref => ref.refId),
      ['tag:refs/tags/release']
    )
    assert.deepEqual(
      graph.laneControls.map(control => control.id),
      ['tag:refs/tags/release']
    )
  })

  it('keeps same-named branch and tag controls distinct', () => {
    const graph = buildCommitGraph(
      [makeCommit('same-ref', [], ['release'])],
      buildRefs([makeBranch('release', 'same-ref')], null)
    )

    assert.deepEqual(graph.laneControls.map(control => control.id).sort(), [
      'branch:refs/heads/release',
      'tag:refs/tags/release',
    ])
    assert.equal(
      new Set(graph.laneControls.map(control => control.laneId)).size,
      1
    )
  })

  it('keeps canonical same-named branch refs distinct and marks only the true current ref', () => {
    const local = new Branch(
      'main',
      null,
      { sha: 'same-tip' },
      BranchType.Local,
      'refs/heads/main'
    )
    const remote = new Branch(
      'main',
      null,
      { sha: 'same-tip' },
      BranchType.Remote,
      'refs/remotes/origin/main'
    )
    const graph = buildCommitGraph(
      [makeCommit('same-tip', [])],
      buildRefs([remote], local)
    )

    assert.deepEqual(graph.laneControls.map(control => control.id).sort(), [
      'branch:refs/heads/main',
      'branch:refs/remotes/origin/main',
    ])
    assert.deepEqual(
      graph.laneControls
        .filter(control => control.isCurrent)
        .map(control => control.id),
      ['branch:refs/heads/main']
    )
    assert.deepEqual(graph.laneControls.map(control => control.name).sort(), [
      'main (refs/heads/main)',
      'main (refs/remotes/origin/main)',
    ])
    assert.equal(new Set(graph.laneControls.map(describeLaneControl)).size, 2)
  })

  it('drops refs pointing outside the loaded commits', () => {
    const { rows } = buildCommitGraph(
      [makeCommit('a', [])],
      buildRefs([makeBranch('gone', 'not-loaded')], null)
    )

    assert.deepEqual(rows[0].refs, [])
  })

  it('leaves out the fork remotes Desktop creates as plumbing', () => {
    const refs = buildRefs(
      [
        makeBranch('github-desktop-fork/x/main', 'a', BranchType.Remote),
        makeBranch('origin/main', 'a', BranchType.Remote),
      ],
      null
    )

    assert.deepEqual(
      refs.map(ref => ref.name),
      ['origin/main']
    )
  })

  it('describes each chip kind for screen readers and tooltips', () => {
    assert.equal(
      describeRef({ name: 'main', sha: 'a', kind: 'branch', isCurrent: true }),
      'main (current branch)'
    )
    assert.equal(
      describeRef({ name: 'main', sha: 'a', kind: 'branch', isCurrent: false }),
      'main (branch)'
    )
    assert.equal(
      describeRef({ name: 'v1.0', sha: 'a', kind: 'tag', isCurrent: false }),
      'v1.0 (tag)'
    )
    assert.equal(
      describeLaneControl({
        id: 'branch:refs/heads/main',
        laneId: 'lane:a',
        name: 'main',
        kind: 'branch',
        color: 'var(--md-sys-color-primary)',
        isCurrent: true,
        isHead: true,
      }),
      'current branch main'
    )
  })
})

describe('history graph view', () => {
  const commitLookup = new Map(mergeHistory.map(commit => [commit.sha, commit]))
  const commitSHAs = mergeHistory.map(commit => commit.sha)

  const renderView = (
    props: Partial<React.ComponentProps<typeof HistoryGraphView>> = {}
  ) =>
    render(
      <HistoryGraphView
        gitHubRepository={null}
        commitSHAs={commitSHAs}
        commitLookup={commitLookup}
        selectedSHAs={[]}
        localCommitSHAs={commitSHAs}
        branches={[makeBranch('main', 'main'), makeBranch('topic', 'topic')]}
        currentBranch={makeBranch('main', 'main')}
        emoji={new Map()}
        {...props}
      />
    )

  /**
   * The list only learns its size from a deferred resize callback, so the rows
   * arrive a tick after mounting.
   */
  const renderRows = async (
    props: Partial<React.ComponentProps<typeof HistoryGraphView>> = {}
  ) => {
    const result = renderView(props)
    await waitFor(() =>
      assert.ok(result.container.querySelector('.history-graph-row') !== null)
    )
    return result
  }

  it('draws one viewport surface across the visible virtual rows', async () => {
    const { container } = await renderRows()

    await waitFor(() =>
      assert.ok(
        container.querySelector('svg.history-graph-viewport-svg') !== null
      )
    )

    assert.equal(container.querySelectorAll('svg.commit-graph').length, 0)
    const graphs = container.querySelectorAll('svg.history-graph-viewport-svg')
    assert.equal(graphs.length, 1)

    const expectedWidth = String(
      laneColumnWidth(buildCommitGraph(mergeHistory))
    )
    const graph = graphs[0]
    assert.equal(graph.getAttribute('height'), '400')
    assert.equal(graph.getAttribute('width'), expectedWidth)

    const layout = container.querySelector('.history-graph-viewport-layout')
    assert.equal(layout?.getAttribute('aria-hidden'), 'true')
    assert.equal(layout?.getAttribute('data-first-visible-row'), '0')
    assert.equal(layout?.getAttribute('data-last-visible-row'), '3')
    assert.equal(layout?.getAttribute('data-row-height'), '56')
    assert.equal(
      graph.querySelectorAll('circle[data-segment="node"]').length,
      mergeHistory.length
    )
  })

  it('lets connectors cross row boundaries in the shared coordinate space', async () => {
    const { container } = await renderRows()

    await waitFor(() =>
      assert.ok(
        container.querySelector('svg.history-graph-viewport-svg') !== null
      )
    )

    const paths = Array.from(
      container.querySelectorAll<SVGPathElement>(
        '.history-graph-viewport-svg path[data-start-y][data-end-y]'
      )
    )
    const firstBoundary = HistoryGraphRowHeight
    const crossing = paths.filter(path => {
      const start = Number(path.dataset.startY)
      const end = Number(path.dataset.endY)
      return start < firstBoundary && end > firstBoundary
    })

    assert.ok(crossing.length > 0)
    assert.ok(
      crossing.some(path => path.dataset.row === '0'),
      'the row above did not draw through the boundary'
    )
    assert.ok(
      crossing.some(path => path.dataset.row === '1'),
      'the row below did not draw through the boundary'
    )
  })

  it('aligns vector virtualization to the exact list scroll offset', async () => {
    const viewport = getHistoryGraphViewport(
      100,
      HistoryGraphRowHeight * 1.5,
      HistoryGraphRowHeight * 2
    )

    assert.ok(viewport !== null)
    assert.deepEqual(viewport, {
      scrollTop: 84,
      height: 112,
      firstVisibleRow: 1,
      lastVisibleRow: 3,
      firstRenderedRow: 0,
      lastRenderedRow: 4,
    })

    assert.equal(
      viewport.firstVisibleRow * HistoryGraphRowHeight - viewport.scrollTop,
      -HistoryGraphRowHeight / 2
    )
    assert.equal(
      (viewport.firstVisibleRow + 1) * HistoryGraphRowHeight -
        viewport.scrollTop,
      HistoryGraphRowHeight / 2
    )

    const longHistory = Array.from({ length: 12 }, (_, index) =>
      makeCommit(`long-${index}`, index === 11 ? [] : [`long-${index + 1}`])
    )
    const longSHAs = longHistory.map(commit => commit.sha)
    const { container } = await renderRows({
      commitSHAs: longSHAs,
      commitLookup: new Map(
        longHistory.map(commit => [commit.sha, commit] as const)
      ),
      localCommitSHAs: longSHAs,
      branches: [],
      currentBranch: null,
      compareListScrollTop: viewport.scrollTop,
    })

    await waitFor(() =>
      assert.equal(
        container
          .querySelector('.history-graph-viewport-layout')
          ?.getAttribute('data-scroll-top'),
        '84'
      )
    )
    assert.equal(
      container.querySelector('circle[data-row="2"]')?.getAttribute('cy'),
      String(HistoryGraphRowHeight)
    )
  })

  it('keeps stroke and node extents clipping-safe at supported UI scales', () => {
    for (const scale of [1, 1.25, 1.5, 2]) {
      const halfLane = (CommitGraphColumnWidth / 2) * scale
      const nodeExtent =
        (CommitGraphNodeRadius + CommitGraphStrokeWidth / 2) * scale

      assert.equal(Number.isInteger(HistoryGraphRowHeight * scale), true)
      assert.equal(Number.isInteger(CommitGraphColumnWidth * scale), true)
      assert.equal(
        CommitGraphBoundaryOverlap * scale >=
          (CommitGraphStrokeWidth / 2) * scale,
        true
      )
      assert.equal(nodeExtent < halfLane, true)
    }
  })

  it('renders the three columns with the branch, graph and message cells', async () => {
    const { container } = await renderRows()

    const header = container.querySelector('.history-graph-header')
    assert.ok(header !== null)
    assert.equal(header?.getAttribute('aria-hidden'), 'true')
    assert.deepEqual(
      Array.from(header?.children ?? []).map(cell => cell.textContent),
      ['Branch / Tag', 'Graph', 'Commit Message']
    )

    const row = container.querySelector('.history-graph-row')
    assert.ok(row !== null)
    assert.ok(row.querySelector('.history-graph-refs') !== null)
    assert.ok(row.querySelector('.history-graph-lanes') !== null)
    assert.equal(
      row.querySelector('.history-graph-summary')?.textContent,
      'summary of merge'
    )
  })

  it('marks the current branch’s chip and tints chips with the lane colour', async () => {
    const { container } = await renderRows()

    const currentChip = container.querySelector(
      '.history-graph-ref-chip.current'
    )
    assert.equal(
      currentChip?.querySelector('.ref-chip-name')?.textContent,
      'main'
    )
    assert.ok(currentChip?.querySelector('.ref-chip-check') !== null)

    const topicChip = Array.from(
      container.querySelectorAll('.history-graph-ref-chip')
    ).find(chip => chip.textContent === 'topic')
    assert.ok(topicChip !== undefined)
    assert.equal(topicChip?.classList.contains('current'), false)
  })

  it('visibly distinguishes same-named branch and tag lane controls', async () => {
    const history = [
      makeCommit('branch-tip', []),
      makeCommit('tag-tip', [], ['release']),
    ]
    await renderRows({
      commitSHAs: history.map(commit => commit.sha),
      commitLookup: new Map(
        history.map(commit => [commit.sha, commit] as const)
      ),
      localCommitSHAs: [],
      branches: [makeBranch('release', 'branch-tip')],
      currentBranch: null,
    })

    assert.ok(screen.getByText('release · branch'))
    assert.ok(screen.getByText('release · tag'))
  })

  it('visibly and accessibly distinguishes same-named canonical branch controls', async () => {
    const local = new Branch(
      'main',
      null,
      { sha: 'local-tip' },
      BranchType.Local,
      'refs/heads/main'
    )
    const remote = new Branch(
      'main',
      null,
      { sha: 'remote-tip' },
      BranchType.Remote,
      'refs/remotes/origin/main'
    )
    const history = [makeCommit('local-tip', []), makeCommit('remote-tip', [])]
    await renderRows({
      commitSHAs: history.map(commit => commit.sha),
      commitLookup: new Map(
        history.map(commit => [commit.sha, commit] as const)
      ),
      localCommitSHAs: [],
      branches: [local, remote],
      currentBranch: null,
    })

    assert.ok(screen.getByText('main (refs/heads/main) · branch'))
    assert.ok(screen.getByText('main (refs/remotes/origin/main) · branch'))
    assert.ok(
      screen.getByRole('button', {
        name: 'Hide branch main (refs/heads/main) lane',
      })
    )
    assert.ok(
      screen.getByRole('button', {
        name: 'Hide branch main (refs/remotes/origin/main) lane',
      })
    )
  })

  it('names every row with its summary and its refs spelled out in full', async () => {
    const { container } = await renderRows()

    const options = Array.from(container.querySelectorAll('[role="option"]'))
    const labels = options.map(option => option.getAttribute('aria-label'))

    assert.ok(labels.includes('summary of merge'))
    assert.ok(labels.includes('summary of main, main (current branch)'))
    assert.ok(labels.includes('summary of base, v1.0 (tag)'))
  })

  it('reports a clicked row as the selected commit', async () => {
    const selections: Array<[ReadonlyArray<string>, boolean]> = []
    const { container } = await renderRows({
      onCommitsSelected: (commits, isContiguous) =>
        selections.push([commits.map(commit => commit.sha), isContiguous]),
    })

    const rows = container.querySelectorAll('[role="option"]')
    fireEvent.mouseDown(rows[2])
    fireEvent.click(rows[2])

    // The list reports a mouse selection through both of its selection
    // callbacks, exactly as it does for the commit list, so what matters is
    // that every report names the clicked commit.
    assert.ok(selections.length > 0)
    for (const selection of selections) {
      assert.deepEqual(selection, [['topic'], true])
    }
  })

  it('hides and restores a lane without changing rows, selection, or context targets', async () => {
    const clipboard = captureClipboardWrites()

    try {
      const { container } = await renderRows({ selectedSHAs: ['topic'] })
      const optionLabels = Array.from(
        container.querySelectorAll<HTMLElement>('[role="option"]')
      ).map(option => option.getAttribute('aria-label'))
      const viewportWidth = container
        .querySelector('svg.history-graph-viewport-svg')
        ?.getAttribute('width')
      const topicControl = screen.getByRole('group', {
        name: 'branch topic lane',
      })
      const topicLaneId = topicControl.getAttribute('data-lane-id')
      assert.ok(topicLaneId !== null)
      const laneDrawingSelector = [
        `[data-lane-id="${topicLaneId}"]`,
        `[data-from-lane-id="${topicLaneId}"]`,
        `[data-to-lane-id="${topicLaneId}"]`,
      ].join(',')

      const hideCurrent = screen.getByRole('button', {
        name: 'Hide current branch main lane',
      })
      assert.equal(hideCurrent.getAttribute('aria-disabled'), 'true')
      fireEvent.click(hideCurrent)
      assert.equal(hideCurrent.getAttribute('aria-pressed'), 'false')

      const hideTopic = screen.getByRole('button', {
        name: 'Hide branch topic lane',
      })
      assert.equal(hideTopic.tagName, 'BUTTON')
      assert.equal(hideTopic.tabIndex, 0)
      hideTopic.focus()
      assert.equal(document.activeElement, hideTopic)
      fireEvent.click(hideTopic)

      await waitFor(() =>
        assert.equal(
          screen
            .getByRole('button', { name: 'Hide branch topic lane' })
            .getAttribute('aria-pressed'),
          'true'
        )
      )
      const filteredSvg = container.querySelector(
        'svg.history-graph-viewport-svg'
      )
      assert.equal(filteredSvg?.querySelector(laneDrawingSelector), null)
      assert.equal(filteredSvg?.getAttribute('width'), viewportWidth)

      const options = Array.from(
        container.querySelectorAll<HTMLElement>('[role="option"]')
      )
      assert.deepEqual(
        options.map(option => option.getAttribute('aria-label')),
        optionLabels
      )
      assert.equal(options[2].getAttribute('aria-selected'), 'true')
      assert.equal(
        options.some(option => option.querySelector('button') !== null),
        false,
        'lane controls became interactive descendants of listbox options'
      )
      assert.ok(options[2].querySelector('.history-graph-row.lane-hidden'))

      fireEvent.contextMenu(options[2], { button: 2 })
      await waitFor(() => assert.ok(screen.getByRole('menu')))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy SHA' }))
      await waitFor(() => assert.deepEqual(clipboard.writes, ['topic']))

      fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
      await waitFor(() => {
        assert.ok(
          container
            .querySelector('svg.history-graph-viewport-svg')
            ?.querySelector(laneDrawingSelector)
        )
        assert.equal(
          screen
            .getByRole('button', { name: 'Hide branch topic lane' })
            .getAttribute('aria-pressed'),
          'false'
        )
      })
    } finally {
      clipboard.restore()
    }
  })

  it('solos one lane while keeping the current and HEAD lane visible', async () => {
    const history = [
      makeCommit('merge-three', ['main-three', 'topic-three', 'side-three']),
      makeCommit('main-three', ['base-three']),
      makeCommit('topic-three', ['base-three']),
      makeCommit('side-three', ['base-three']),
      makeCommit('base-three', []),
    ]
    const shas = history.map(commit => commit.sha)
    const { container } = await renderRows({
      commitSHAs: shas,
      commitLookup: new Map(
        history.map(commit => [commit.sha, commit] as const)
      ),
      localCommitSHAs: shas,
      branches: [
        makeBranch('main', 'main-three'),
        makeBranch('topic', 'topic-three'),
        makeBranch('side', 'side-three'),
      ],
      currentBranch: makeBranch('main', 'main-three'),
    })

    const laneId = (name: string) => {
      const value = screen
        .getByRole('group', { name })
        .getAttribute('data-lane-id')
      assert.ok(value !== null)
      return value
    }
    const mainLaneId = laneId('current branch main lane')
    const topicLaneId = laneId('branch topic lane')
    const sideLaneId = laneId('branch side lane')

    fireEvent.click(
      screen.getByRole('button', { name: 'Solo branch topic lane' })
    )
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole('button', { name: 'Solo branch topic lane' })
          .getAttribute('aria-pressed'),
        'true'
      )
    )

    const svg = container.querySelector('svg.history-graph-viewport-svg')
    assert.ok(svg?.querySelector(`[data-lane-id="${mainLaneId}"]`))
    assert.ok(svg?.querySelector(`[data-lane-id="${topicLaneId}"]`))
    assert.equal(
      svg?.querySelector(
        `[data-lane-id="${sideLaneId}"], [data-from-lane-id="${sideLaneId}"], [data-to-lane-id="${sideLaneId}"]`
      ),
      null
    )
    assert.equal(
      screen
        .getByRole('button', { name: 'Hide branch side lane' })
        .getAttribute('aria-pressed'),
      'false'
    )
    assert.match(
      screen.getByText('HEAD and the current branch always stay visible.')
        .textContent ?? '',
      /always stay visible/
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    await waitFor(() =>
      assert.ok(
        container
          .querySelector('svg.history-graph-viewport-svg')
          ?.querySelector(`[data-lane-id="${sideLaneId}"]`)
      )
    )
  })

  it('suspends a hidden lane when it becomes current without a contradictory pressed state', async () => {
    const branches = [makeBranch('main', 'main'), makeBranch('topic', 'topic')]
    const { container, rerender } = await renderRows({ branches })
    const hideTopic = screen.getByRole('button', {
      name: 'Hide branch topic lane',
    })
    const topicLaneId = hideTopic.getAttribute('data-lane-control-id')
    assert.ok(topicLaneId !== null)
    fireEvent.click(hideTopic)

    await waitFor(() =>
      assert.equal(hideTopic.getAttribute('aria-pressed'), 'true')
    )

    rerender(
      <HistoryGraphView
        gitHubRepository={null}
        commitSHAs={commitSHAs}
        commitLookup={commitLookup}
        selectedSHAs={[]}
        localCommitSHAs={commitSHAs}
        branches={branches}
        currentBranch={makeBranch('topic', 'topic')}
        emoji={new Map()}
      />
    )

    const protectedTopic = screen.getByRole('button', {
      name: 'Hide current branch topic lane',
    })
    assert.equal(protectedTopic.getAttribute('aria-disabled'), 'true')
    assert.equal(protectedTopic.getAttribute('aria-pressed'), 'false')
    assert.equal(
      screen.getByRole('button', { name: 'Show all' }).hasAttribute('disabled'),
      false
    )

    const protectedLaneId = screen
      .getByRole('group', { name: 'current branch topic lane' })
      .getAttribute('data-lane-id')
    assert.ok(protectedLaneId !== null)
    assert.ok(
      container
        .querySelector('svg.history-graph-viewport-svg')
        ?.querySelector(`[data-lane-id="${protectedLaneId}"]`)
    )
  })

  it('opens the shared commit actions and targets the right-clicked row', async () => {
    const clipboard = captureClipboardWrites()

    try {
      const { container } = await renderRows({
        // A stale selection on another row must not redirect the menu action.
        selectedSHAs: ['main'],
      })
      const rows = container.querySelectorAll<HTMLElement>('[role="option"]')

      assert.equal(
        fireEvent.contextMenu(rows[2], {
          button: 2,
          clientX: 120,
          clientY: 160,
        }),
        false
      )

      await waitFor(() => assert.ok(screen.getByRole('menu')))
      assert.ok(
        screen.getByRole('menuitem', { name: 'Create branch from commit' })
      )
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy SHA' }))

      await waitFor(() => assert.deepEqual(clipboard.writes, ['topic']))
    } finally {
      clipboard.restore()
    }
  })

  it('opens from both keyboard menu gestures and restores the virtual row focus', async () => {
    const { container } = await renderRows()
    const row = container.querySelector<HTMLElement>('[role="option"]')
    assert.ok(row !== null)

    for (const key of [
      { key: 'F10', shiftKey: true },
      { key: 'ContextMenu', shiftKey: false },
    ]) {
      row.focus()
      assert.equal(document.activeElement, row)
      assert.equal(fireEvent.keyDown(row, key), false)

      await waitFor(() => assert.ok(screen.getByRole('menu')))
      assert.ok(
        container.contains(row),
        'the virtual row unmounted under its menu'
      )
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

      await waitFor(() => {
        assert.equal(screen.queryByRole('menu'), null)
        assert.equal(document.activeElement, row)
      })
    }
  })

  it('shows the empty message rather than an empty table', () => {
    const { container } = renderView({
      commitSHAs: [],
      emptyListMessage: 'No history',
    })

    assert.equal(
      container.querySelector('.blankslate')?.textContent,
      'No history'
    )
    assert.equal(container.querySelector('.history-graph-header'), null)
  })
})

describe('history graph view: wiring', () => {
  const read = (...parts: ReadonlyArray<string>) =>
    readFileSync(join(process.cwd(), 'app', ...parts), 'utf8')

  const compare = read('src', 'ui', 'history', 'compare.tsx')

  it('offers accessible list and graph history tabs with selected state', () => {
    assert.match(
      compare,
      /className="history-view-tabs"[\s\S]*?role="tablist"[\s\S]*?className="history-view-tab"[\s\S]*?data-view="list"[\s\S]*?aria-selected=\{!graphSelected\}[\s\S]*?data-view="graph"[\s\S]*?aria-selected=\{graphSelected\}/
    )
    assert.match(compare, /onKeyDown=\{this\.onHistoryViewTabKeyDown\}/)
    assert.match(compare, /aria-controls=\{panelId\}/)
  })

  it('persists the chosen view the way the commit-graph toggle does', () => {
    assert.match(compare, /const ShowGraphViewKey = 'history-show-graph-view'/)
    assert.match(
      compare,
      /showGraphView: getBoolean\(ShowGraphViewKey, false\)/
    )
    assert.match(
      compare,
      /private setHistoryView = \(showGraphView: boolean\)[\s\S]*?setBoolean\(ShowGraphViewKey, showGraphView\)[\s\S]*?this\.setState\(\{ showGraphView \}\)/
    )
  })

  it('keeps the commit list as the other view rather than replacing it', () => {
    assert.match(compare, /isHistory && this\.state\.showGraphView/)
    assert.match(compare, /<CommitList/)
    assert.match(
      compare,
      /id=\{isHistory \? 'history-view-panel' : undefined\}/
    )
  })

  it('shares one context-menu builder and the same production action wiring', () => {
    const graphView = read('src', 'ui', 'history', 'history-graph-view.tsx')
    const commitList = read('src', 'ui', 'history', 'commit-list.tsx')

    assert.match(graphView, /showCommitContextMenu\(row, event, this\.props\)/)
    assert.match(commitList, /showCommitContextMenu\(row, event, this\.props\)/)

    const graphProps = /<HistoryGraphView\s+ref=([\s\S]*?)\/>/.exec(
      compare
    )?.[1]
    assert.ok(graphProps !== undefined)
    for (const prop of [
      'gitHubRepository',
      'localCommitSHAs',
      'canResetToCommits',
      'canUndoCommits',
      'canAmendCommits',
      'onViewCommitOnGitHub',
      'onUndoCommit',
      'onResetToCommit',
      'onRevertCommit',
      'onAmendCommit',
      'onCreateBranch',
      'onCreateWorktreeFromCommit',
      'onCheckoutCommit',
      'onCreateTag',
      'onDeleteTag',
      'onCherryPick',
      'onKeyboardReorder',
      'onSquash',
      'tagsToPush',
      'disableReordering',
      'disableSquashing',
      'isMultiCommitOperationInProgress',
    ]) {
      assert.match(graphProps, new RegExp(`${prop}=`), `${prop} is not wired`)
    }
  })

  it('mounts the list before handing off graph-originated keyboard reorder data', () => {
    const handler =
      /private onKeyboardReorder[\s\S]*?(?=\n  private onSquash)/.exec(
        compare
      )?.[0]
    assert.ok(handler !== undefined)
    assert.match(
      handler,
      /if \(this\.state\.showGraphView\) \{[\s\S]*?this\.setState\(\{ showGraphView: false \}, \(\) => \{[\s\S]*?this\.setState\(\{ keyboardReorderData \}\)[\s\S]*?\}\)[\s\S]*?return/
    )
    assert.doesNotMatch(
      handler,
      /this\.setState\(\{\s*showGraphView: false,\s*keyboardReorderData/
    )
  })

  it('registers its stylesheet in the styles index', () => {
    assert.match(
      read('styles', '_ui.scss'),
      /@import 'ui\/history-graph-view';/
    )
  })

  it('styles the history tabs for narrow widths and reduced motion', () => {
    const style = read('styles', 'ui', 'history', '_history.scss')

    assert.match(
      style,
      /\.history-view-tabs \{[\s\S]*?min-height: 48px;[\s\S]*?overflow-x: auto;/
    )
    assert.match(
      style,
      /\.history-view-tab \{[\s\S]*?min-width: 104px;[\s\S]*?min-height: 44px;[\s\S]*?&:focus-visible \{/
    )
    assert.match(
      style,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.history-view-tab \{[\s\S]*?transition: none;/
    )
  })

  it('truncates long names rather than letting them overflow the row', () => {
    const style = read('styles', 'ui', '_history-graph-view.scss')

    assert.match(
      style,
      /\.ref-chip-name \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/
    )
    assert.match(
      style,
      /\.history-graph-summary-text \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/
    )
  })

  it('keeps lane controls focus-visible, adequately sized, and scrollable when narrow', () => {
    const style = read('styles', 'ui', '_history-graph-view.scss')

    assert.match(
      style,
      /\.history-graph-lane-controls \{[\s\S]*?min-height: 48px;[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: hidden;/
    )
    assert.match(
      style,
      /\.history-graph-lane-control \{[\s\S]*?flex: 0 0 auto;[\s\S]*?min-width: max-content;/
    )
    assert.match(
      style,
      /\.history-graph-show-all-lanes,[\s\S]*?\.history-graph-lane-visibility-button \{[\s\S]*?min-width: 48px;[\s\S]*?min-height: 40px;[\s\S]*?&:focus-visible \{/
    )
    const laneNameRule = style.match(
      /\.history-graph-lane-control-name \{([^}]*)\}/
    )
    assert.ok(laneNameRule !== null)
    assert.doesNotMatch(
      laneNameRule[1],
      /max-width|overflow|text-overflow/,
      'lane names were clipped instead of remaining reachable by horizontal scroll'
    )
    const focusableDisabledRule = style.match(
      /&\[aria-disabled='true'\] \{([^}]*)\}/
    )
    assert.ok(focusableDisabledRule !== null)
    assert.doesNotMatch(
      focusableDisabledRule[1],
      /opacity/,
      'a focusable unavailable Hide control dimmed its focus indicator'
    )
  })

  it('respects reduced motion', () => {
    const style = read('styles', 'ui', '_history-graph-view.scss')
    assert.match(style, /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(
      style,
      /prefers-reduced-motion: reduce[\s\S]*?history-graph-lane-visibility-button[\s\S]*?transition: none;/
    )
  })

  it('takes every colour from Material tokens and the shared lane palette', () => {
    const style = read('styles', 'ui', '_history-graph-view.scss')

    // The lane colours arrive as custom properties set from the graph model, so
    // a hard-coded colour here would silently let the two history views
    // disagree about what colour a given branch is.
    for (const [, value] of style.matchAll(
      /(?:color|background|border|fill|stroke):\s*([^;]+);/g
    )) {
      assert.ok(
        !/#[0-9a-f]{3,8}\b|\brgb\(|\bhsl\(/i.test(value),
        `literal colour in stylesheet: ${value}`
      )
    }

    assert.match(
      read('src', 'ui', 'history', 'commit-graph-model.ts'),
      /'var\(--md-sys-color-primary\)'/
    )
  })
})
