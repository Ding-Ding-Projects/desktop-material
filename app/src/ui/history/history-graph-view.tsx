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
  ICommitGraphLaneControl,
  ICommitGraphLaneVisibility,
  ICommitGraphRef,
  ICommitGraphRefLabel,
  resolveCommitGraphLaneVisibility,
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

/** A concise, unambiguous name for lane visibility controls. */
export function describeLaneControl(control: ICommitGraphLaneControl): string {
  if (control.kind === 'commit') {
    return `commit ${control.name}`
  }

  if (control.isCurrent) {
    return `current branch ${control.name}`
  }

  return `${control.kind} ${control.name}`
}

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
  readonly hiddenLaneControlIds: ReadonlySet<string>
  readonly soloLaneControlId: string | null
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
  private laneVisibility = memoizeOne(
    (
      graph: ICommitGraph,
      hiddenControlIds: ReadonlySet<string>,
      soloControlId: string | null
    ) =>
      resolveCommitGraphLaneVisibility(graph, hiddenControlIds, soloControlId)
  )

  public state: IHistoryGraphViewState = {
    scrollTop: this.props.compareListScrollTop ?? 0,
    clientHeight: 0,
    hiddenLaneControlIds: new Set(),
    soloLaneControlId: null,
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

  private getLaneVisibility(graph = this.getGraph()) {
    return this.laneVisibility(
      graph,
      this.state.hiddenLaneControlIds,
      this.state.soloLaneControlId
    )
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

  private getLaneControlFromEvent(
    event: React.MouseEvent<HTMLButtonElement>
  ): ICommitGraphLaneControl | undefined {
    const controlId = event.currentTarget.dataset.laneControlId
    return this.getGraph().laneControls.find(
      control => control.id === controlId
    )
  }

  private onToggleLaneHidden = (event: React.MouseEvent<HTMLButtonElement>) => {
    const control = this.getLaneControlFromEvent(event)
    if (control === undefined) {
      return
    }

    const graph = this.getGraph()
    if (this.getLaneVisibility(graph).protectedLaneIds.has(control.laneId)) {
      return
    }

    this.setState(state => {
      const controlsForLane = graph.laneControls.filter(
        candidate => candidate.laneId === control.laneId
      )
      const wasHidden = controlsForLane.some(candidate =>
        state.hiddenLaneControlIds.has(candidate.id)
      )
      const hiddenLaneControlIds = new Set(state.hiddenLaneControlIds)

      // Aliases such as a branch and tag on the same lane are one visual lane,
      // so showing it through either control clears every alias for that lane.
      for (const candidate of controlsForLane) {
        hiddenLaneControlIds.delete(candidate.id)
      }
      if (!wasHidden) {
        hiddenLaneControlIds.add(control.id)
      }

      return { hiddenLaneControlIds, soloLaneControlId: null }
    })
  }

  private onToggleLaneSolo = (event: React.MouseEvent<HTMLButtonElement>) => {
    const control = this.getLaneControlFromEvent(event)
    if (control === undefined) {
      return
    }

    const graph = this.getGraph()
    this.setState(state => {
      const currentSoloLaneId = graph.laneControls.find(
        candidate => candidate.id === state.soloLaneControlId
      )?.laneId

      return {
        soloLaneControlId:
          currentSoloLaneId === control.laneId ? null : control.id,
      }
    })
  }

  private onShowAllLanes = () => {
    this.setState({
      hiddenLaneControlIds: new Set(),
      soloLaneControlId: null,
    })
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

    const visibility = this.getLaneVisibility(graph)
    const laneHidden = visibility.hiddenLaneIds.has(graphRow.laneId)

    return (
      <div
        className={classNames('history-graph-row', {
          'lane-hidden': laneHidden,
        })}
        style={
          {
            '--history-graph-lane-color': graphRow.color,
          } as React.CSSProperties
        }
      >
        <div className="history-graph-cell history-graph-refs">
          {graphRow.refs.map(ref =>
            this.renderRefChip(ref, visibility.hiddenLaneIds.has(ref.laneId))
          )}
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

  private renderRefChip(ref: ICommitGraphRefLabel, laneHidden: boolean) {
    return (
      <span
        key={ref.refId}
        className={classNames('history-graph-ref-chip', ref.kind, {
          current: ref.isCurrent,
          'lane-hidden': laneHidden,
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

  private renderLaneControls(
    graph: ICommitGraph,
    visibility: ICommitGraphLaneVisibility
  ) {
    const explicitlyHiddenLaneIds = new Set(
      graph.laneControls
        .filter(control => this.state.hiddenLaneControlIds.has(control.id))
        .map(control => control.laneId)
    )
    const hasStoredFilter =
      this.state.hiddenLaneControlIds.size > 0 ||
      this.state.soloLaneControlId !== null
    const protectionNoteId = 'history-graph-lane-protection-note'
    const protectionNote =
      this.props.currentBranch === null
        ? 'The first displayed lane stays visible while HEAD is detached.'
        : 'HEAD and the current branch always stay visible.'

    return (
      <div
        className="history-graph-lane-controls"
        role="group"
        aria-label="Graph lane visibility"
      >
        <button
          type="button"
          className="history-graph-show-all-lanes"
          onClick={this.onShowAllLanes}
          disabled={!hasStoredFilter}
        >
          Show all
        </button>
        <span
          id={protectionNoteId}
          className="history-graph-lane-protection-note"
        >
          {protectionNote}
        </span>
        {graph.laneControls.map(control => {
          const description = describeLaneControl(control)
          const protectedLane = visibility.protectedLaneIds.has(control.laneId)
          // Report effective visibility, not a suspended stored preference. A
          // hidden lane that becomes current/HEAD is protected and visible.
          const hidden =
            explicitlyHiddenLaneIds.has(control.laneId) &&
            visibility.hiddenLaneIds.has(control.laneId)
          const soloed = visibility.soloLaneId === control.laneId

          return (
            <div
              key={control.id}
              className="history-graph-lane-control"
              role="group"
              aria-label={`${description} lane`}
              data-lane-control-id={control.id}
              data-lane-id={control.laneId}
              style={
                {
                  '--history-graph-control-color': control.color,
                } as React.CSSProperties
              }
            >
              <span className="history-graph-lane-control-name">
                {control.name} ·{' '}
                {control.isCurrent ? 'current branch' : control.kind}
              </span>
              <button
                type="button"
                className="history-graph-lane-visibility-button"
                aria-label={`Hide ${description} lane`}
                aria-describedby={protectionNoteId}
                aria-pressed={hidden}
                aria-disabled={protectedLane}
                data-lane-control-id={control.id}
                onClick={this.onToggleLaneHidden}
              >
                Hide
              </button>
              <button
                type="button"
                className="history-graph-lane-visibility-button"
                aria-label={`Solo ${description} lane`}
                aria-describedby={protectionNoteId}
                aria-pressed={soloed}
                data-lane-control-id={control.id}
                onClick={this.onToggleLaneSolo}
              >
                Solo
              </button>
            </div>
          )
        })}
      </div>
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

  private renderViewportGraph(
    graph: ICommitGraph,
    visibility: ICommitGraphLaneVisibility
  ) {
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
            visibleLaneIds={visibility.visibleLaneIds}
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
    const visibility = this.getLaneVisibility(graph)

    return (
      <div id="history-graph-view">
        {this.renderHeader()}
        {this.renderLaneControls(graph, visibility)}
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
              hiddenLaneControlIds: this.state.hiddenLaneControlIds,
              soloLaneControlId: this.state.soloLaneControlId,
            }}
            setScrollTop={this.props.compareListScrollTop}
          />
          {this.renderViewportGraph(graph, visibility)}
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
  const seen = new Set<string>()
  const refs = new Array<ICommitGraphRef>()

  // Compare's branch picker omits the checked-out branch. Put it back into the
  // graph's ref inventory so All refs and detached ordering do not confuse a
  // merely newest row with attached HEAD.
  const graphBranches =
    currentBranch === null ? branches : [currentBranch, ...branches]
  for (const branch of graphBranches) {
    if (branch.isDesktopForkRemoteBranch || seen.has(branch.ref)) {
      continue
    }
    seen.add(branch.ref)
    refs.push({
      refId: `branch:${branch.ref}`,
      name: branch.name,
      sha: branch.tip.sha,
      kind: 'branch',
      isCurrent: currentBranch !== null && branch.ref === currentBranch.ref,
    })
  }

  return refs
}

/** The spoken form of a chip, which also serves as its hover tooltip. */
export function describeRef(ref: ICommitGraphRefLabel | ICommitGraphRef) {
  if (ref.isCurrent) {
    return `${ref.name} (current branch)`
  }

  return ref.kind === 'tag' ? `${ref.name} (tag)` : `${ref.name} (branch)`
}
