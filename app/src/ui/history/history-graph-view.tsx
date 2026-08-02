import * as React from 'react'
import classNames from 'classnames'
import memoizeOne from 'memoize-one'

import { Branch } from '../../models/branch'
import { Commit } from '../../models/commit'
import { Emoji } from '../../lib/emoji'
import { List } from '../lib/list'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RichText } from '../lib/rich-text'
import { TooltippedContent } from '../lib/tooltipped-content'
import { CommitGraphColumnWidth, CommitGraphViewport } from './commit-graph'
import {
  buildCommitGraph,
  ICommitGraph,
  ICommitGraphRef,
  ICommitGraphRefLabel,
} from './commit-graph-model'
import {
  ICommitContextMenuProps,
  showCommitContextMenu,
} from './commit-context-menu'

/**
 * The row pitch, deliberately identical to the commit list's. The two views
 * share a persisted scroll offset, so a different pitch would land the reader
 * on a different commit every time they switched view.
 */
export const HistoryGraphRowHeight = 56
const HistoryGraphViewportOverscan = 1

export interface IHistoryGraphViewport {
  readonly scrollTop: number
  readonly height: number
  readonly firstVisibleRow: number
  readonly lastVisibleRow: number
  readonly firstRenderedRow: number
  readonly lastRenderedRow: number
}

/**
 * Resolves the graph slice that shares the virtual list's viewport. One row of
 * vector overscan on either side gives curved connectors room to cross the
 * viewport edge without drawing the entire history.
 */
export function getHistoryGraphViewport(
  rowCount: number,
  scrollTop: number,
  clientHeight: number
): IHistoryGraphViewport | null {
  if (rowCount <= 0 || clientHeight <= 0) {
    return null
  }

  const height = Math.max(0, clientHeight)
  const maxScrollTop = Math.max(0, rowCount * HistoryGraphRowHeight - height)
  const normalizedScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop))
  const firstVisibleRow = Math.min(
    rowCount - 1,
    Math.floor(normalizedScrollTop / HistoryGraphRowHeight)
  )
  const lastVisibleRow = Math.min(
    rowCount - 1,
    Math.max(
      firstVisibleRow,
      Math.ceil((normalizedScrollTop + height) / HistoryGraphRowHeight) - 1
    )
  )

  return {
    scrollTop: normalizedScrollTop,
    height,
    firstVisibleRow,
    lastVisibleRow,
    firstRenderedRow: Math.max(
      0,
      firstVisibleRow - HistoryGraphViewportOverscan
    ),
    lastRenderedRow: Math.min(
      rowCount - 1,
      lastVisibleRow + HistoryGraphViewportOverscan
    ),
  }
}

interface IHistoryGraphViewProps extends ICommitContextMenuProps {
  /** Every known branch, used to place branch-head chips. */
  readonly branches: ReadonlyArray<Branch>

  /** The branch currently checked out, marked in its chip. */
  readonly currentBranch: Branch | null

  /** The emoji lookup used to render commit summaries. */
  readonly emoji: Map<string, Emoji>

  /** The message to display inside the view when no commits are displayed */
  readonly emptyListMessage?: JSX.Element | string

  /** Callback which fires when a commit has been selected */
  readonly onCommitsSelected?: (
    commits: ReadonlyArray<Commit>,
    isContiguous: boolean
  ) => void

  /** Callback that fires when a scroll event has occurred */
  readonly onScroll?: (start: number, end: number) => void

  /** Callback fired with the new scroll offset so it can be remembered. */
  readonly onCompareListScrolled?: (scrollTop: number) => void

  /** The scroll offset to restore. */
  readonly compareListScrollTop?: number
}

interface IHistoryGraphViewState {
  readonly scrollTop: number
  readonly clientHeight: number
}

/** A three-column Branch / Graph / Message view over the same commits. */
export class HistoryGraphView extends React.Component<
  IHistoryGraphViewProps,
  IHistoryGraphViewState
> {
  private listRef = React.createRef<List>()
  private bodyRef = React.createRef<HTMLDivElement>()
  private viewportResizeObserver: ResizeObserver | null = null
  private observedBody: HTMLDivElement | null = null
  private commitIndexBySha = memoizeOne(
    (commitSHAs: ReadonlyArray<string>) =>
      new Map(commitSHAs.map((sha, index) => [sha, index]))
  )
  private graph = memoizeOne(
    (
      commitSHAs: ReadonlyArray<string>,
      commitLookup: ReadonlyMap<string, Commit>,
      branches: ReadonlyArray<Branch>,
      currentBranch: Branch | null
    ): ICommitGraph => {
      const commits = commitSHAs.flatMap(sha => {
        const commit = commitLookup.get(sha)
        return commit === undefined ? [] : [commit]
      })

      return buildCommitGraph(commits, buildRefs(branches, currentBranch))
    }
  )

  public state: IHistoryGraphViewState = {
    scrollTop: this.props.compareListScrollTop ?? 0,
    clientHeight: 0,
  }

  public componentDidMount() {
    this.observeViewportBody()
  }

  public componentDidUpdate() {
    // The view can mount while history is still empty. Attach the observer as
    // soon as loading replaces the blankslate with the virtual list.
    this.observeViewportBody()
  }

  public componentWillUnmount() {
    this.viewportResizeObserver?.disconnect()
  }

  private observeViewportBody() {
    const body = this.bodyRef.current
    if (body === this.observedBody) {
      return
    }

    this.viewportResizeObserver?.disconnect()
    this.viewportResizeObserver = null
    this.observedBody = body

    if (body === null) {
      return
    }

    this.viewportResizeObserver = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height ?? body.clientHeight
      this.updateViewport(this.state.scrollTop, height)
    })
    this.viewportResizeObserver.observe(body)
  }

  public focus() {
    this.listRef.current?.focus()
  }

  private getGraph() {
    const { commitSHAs, commitLookup, branches, currentBranch } = this.props
    return this.graph(commitSHAs, commitLookup, branches, currentBranch)
  }

  private rowForSHA(sha: string) {
    return this.commitIndexBySha(this.props.commitSHAs).get(sha) ?? -1
  }

  private lookupCommits(
    commitSHAs: ReadonlyArray<string>
  ): ReadonlyArray<Commit> {
    return commitSHAs.flatMap(sha => {
      const commit = this.props.commitLookup.get(sha)
      return commit === undefined ? [] : [commit]
    })
  }

  /**
   * Mirrors the commit list's contiguity test so selecting a range here reaches
   * the dispatcher with the same shape it would from the list.
   */
  private isContiguous(indexes: ReadonlyArray<number>) {
    if (indexes.length <= 1) {
      return true
    }

    const sorted = indexes.toSorted((a, b) => b - a)

    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i] - 1 !== sorted[i + 1]) {
        return false
      }
    }

    return true
  }

  private onSelectionChanged = (rows: ReadonlyArray<number>) => {
    const selectedSHAs = rows.map(row => this.props.commitSHAs[row])
    this.props.onCommitsSelected?.(
      this.lookupCommits(selectedSHAs),
      this.isContiguous(rows)
    )
  }

  private onSelectedRowChanged = (row: number) => {
    const commit = this.props.commitLookup.get(this.props.commitSHAs[row])
    if (commit !== undefined) {
      this.props.onCommitsSelected?.([commit], true)
    }
  }

  private onRowContextMenu = (
    row: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    showCommitContextMenu(row, event, this.props)
  }

  private onRowKeyboardContextMenu = (
    row: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    showCommitContextMenu(row, event, this.props)
  }

  private updateViewport(scrollTop: number, clientHeight: number) {
    if (
      scrollTop !== this.state.scrollTop ||
      clientHeight !== this.state.clientHeight
    ) {
      this.setState({ scrollTop, clientHeight })
    }
  }

  private onScroll = (scrollTop: number, clientHeight: number) => {
    this.updateViewport(scrollTop, clientHeight)

    const top = Math.floor(scrollTop / HistoryGraphRowHeight)
    this.props.onScroll?.(
      top,
      top + Math.ceil(clientHeight / HistoryGraphRowHeight)
    )
    this.props.onCompareListScrolled?.(scrollTop)
  }

  private getRowAriaLabel = (row: number) => {
    const commit = this.props.commitLookup.get(this.props.commitSHAs[row])
    if (commit === undefined) {
      return undefined
    }

    // The row's own contents are hidden from screen readers once this label
    // exists, so the truncated chips and summary have to be spelled out here in
    // full or they become unreachable rather than merely abbreviated.
    const refs = this.getGraph().rows[row]?.refs ?? []
    const refText = refs.map(describeRef).join(', ')

    return refText.length === 0
      ? commit.summary
      : `${commit.summary}, ${refText}`
  }

  private renderRow = (row: number) => {
    const sha = this.props.commitSHAs[row]
    const commit = this.props.commitLookup.get(sha)
    const graph = this.getGraph()
    const graphRow = graph.rows[row]

    if (commit === undefined || graphRow === undefined) {
      return null
    }

    return (
      <div
        className="history-graph-row"
        style={
          {
            '--history-graph-lane-color': graphRow.color,
          } as React.CSSProperties
        }
      >
        <div className="history-graph-cell history-graph-refs">
          {graphRow.refs.map(ref => this.renderRefChip(ref))}
        </div>
        <div
          className="history-graph-cell history-graph-lanes"
          style={{ width: laneColumnWidth(graph) }}
        />
        <div className="history-graph-cell history-graph-summary">
          <RichText
            className="history-graph-summary-text"
            emoji={this.props.emoji}
            text={commit.summary}
            renderUrlsAsLinks={false}
          />
        </div>
      </div>
    )
  }

  private renderRefChip(ref: ICommitGraphRefLabel) {
    return (
      <span
        key={`${ref.kind}-${ref.name}`}
        className={classNames('history-graph-ref-chip', ref.kind, {
          current: ref.isCurrent,
        })}
        style={
          { '--history-graph-ref-color': ref.color } as React.CSSProperties
        }
      >
        {ref.isCurrent ? (
          <Octicon className="ref-chip-check" symbol={octicons.check} />
        ) : null}
        {/*
          A chip narrow enough to truncate is exactly the chip a reader needs
          spelled out, so the full name is always one hover away.
        */}
        <TooltippedContent className="ref-chip-name" tooltip={describeRef(ref)}>
          {ref.name}
        </TooltippedContent>
      </span>
    )
  }

  private renderHeader() {
    // Purely a visual column key; the rows themselves are options with their
    // own labels, so announcing these headings again would only add noise.
    return (
      <div className="history-graph-header" aria-hidden="true">
        <div className="history-graph-cell history-graph-refs">
          Branch / Tag
        </div>
        <div
          className="history-graph-cell history-graph-lanes"
          style={{ width: laneColumnWidth(this.getGraph()) }}
        >
          Graph
        </div>
        <div className="history-graph-cell history-graph-summary">
          Commit Message
        </div>
      </div>
    )
  }

  private renderViewportGraph(graph: ICommitGraph) {
    const viewport = getHistoryGraphViewport(
      graph.rows.length,
      this.state.scrollTop,
      this.state.clientHeight
    )

    if (viewport === null) {
      return null
    }

    return (
      <div
        className="history-graph-viewport-layout"
        aria-hidden="true"
        data-first-visible-row={viewport.firstVisibleRow}
        data-last-visible-row={viewport.lastVisibleRow}
        data-first-rendered-row={viewport.firstRenderedRow}
        data-last-rendered-row={viewport.lastRenderedRow}
        data-scroll-top={viewport.scrollTop}
        data-row-height={HistoryGraphRowHeight}
      >
        <div className="history-graph-cell history-graph-refs" />
        <div
          className="history-graph-cell history-graph-lanes"
          style={{ width: laneColumnWidth(graph) }}
        >
          <CommitGraphViewport
            graph={graph}
            rowHeight={HistoryGraphRowHeight}
            scrollTop={viewport.scrollTop}
            viewportHeight={viewport.height}
            firstRow={viewport.firstRenderedRow}
            lastRow={viewport.lastRenderedRow}
          />
        </div>
        <div className="history-graph-cell history-graph-summary" />
      </div>
    )
  }

  public render() {
    const { commitSHAs, selectedSHAs, emptyListMessage } = this.props

    if (commitSHAs.length === 0) {
      return (
        <div className="panel blankslate">
          {emptyListMessage ?? 'No commits to list'}
        </div>
      )
    }

    const selectedRows = selectedSHAs
      .map(sha => this.rowForSHA(sha))
      .filter(row => row !== -1)

    const graph = this.getGraph()

    return (
      <div id="history-graph-view">
        {this.renderHeader()}
        <div className="history-graph-body" ref={this.bodyRef}>
          <List
            ariaLabel="Commit graph"
            ref={this.listRef}
            rowCount={commitSHAs.length}
            rowHeight={HistoryGraphRowHeight}
            selectedRows={selectedRows}
            rowRenderer={this.renderRow}
            getRowAriaLabel={this.getRowAriaLabel}
            onSelectionChanged={this.onSelectionChanged}
            onSelectedRowChanged={this.onSelectedRowChanged}
            onRowContextMenu={this.onRowContextMenu}
            onRowKeyboardContextMenu={this.onRowKeyboardContextMenu}
            selectionMode="multi"
            onScroll={this.onScroll}
            invalidationProps={{
              commitSHAs,
              branches: this.props.branches,
              currentBranch: this.props.currentBranch,
              commitLookup: this.props.commitLookup,
            }}
            setScrollTop={this.props.compareListScrollTop}
          />
          {this.renderViewportGraph(graph)}
        </div>
      </div>
    )
  }
}

/** The pixel width the lane column needs to hold every lane in the graph. */
export function laneColumnWidth(graph: ICommitGraph) {
  return (graph.maxColumn + 1) * CommitGraphColumnWidth
}

/** The branch heads the graph should chip, minus Desktop's fork plumbing. */
export function buildRefs(
  branches: ReadonlyArray<Branch>,
  currentBranch: Branch | null
): ReadonlyArray<ICommitGraphRef> {
  return branches
    .filter(branch => !branch.isDesktopForkRemoteBranch)
    .map(branch => ({
      name: branch.name,
      sha: branch.tip.sha,
      kind: 'branch' as const,
      isCurrent: currentBranch !== null && branch.name === currentBranch.name,
    }))
}

/** The spoken form of a chip, which also serves as its hover tooltip. */
export function describeRef(ref: ICommitGraphRefLabel | ICommitGraphRef) {
  if (ref.isCurrent) {
    return `${ref.name} (current branch)`
  }

  return ref.kind === 'tag' ? `${ref.name} (tag)` : `${ref.name} (branch)`
}
