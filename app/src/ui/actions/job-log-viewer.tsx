import * as React from 'react'
import { AutoSizer, Grid, GridCellProps } from 'react-virtualized'
import memoizeOne from 'memoize-one'
import { IActionsJob } from '../../lib/actions-jobs'
import { ActionsLogParser } from '../../lib/actions-log-parser/action-log-parser'
import {
  ILogLineTemplateData,
  IParsedContent,
} from '../../lib/actions-log-parser/actions-log-parser-objects'
import { APIError } from '../../lib/http'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import { Button } from '../lib/button'
import { FilterModeControl } from '../lib/filter-mode-control'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { LinkButton } from '../lib/link-button'
import { trapActionsDialogFocus } from './actions-dialog-focus'

/** localStorage key used to persist the find-in-log filter mode. */
const JobLogFilterListId = 'actions-job-log'

/** Fixed height of one rendered log row (see `.actions-log-line`). */
const ActionsLogRowHeight = 24

/** Width of the line-number gutter (see `.actions-log-number`). */
const ActionsLogNumberColumnWidth = 54

/**
 * Horizontal padding around the log text (the `code` element's 12px
 * padding-right) plus slack for fonts whose bold advance differs from the
 * measured regular advance.
 */
const ActionsLogLinePadding = 28

/** Font shorthand size matching `.actions-log-line`'s font-size. */
const ActionsLogFontSize = 11.5

/**
 * Character-cell count a log line occupies when rendered with
 * `white-space: pre` in a monospace font: tabs advance to the next 8-column
 * stop and East Asian wide characters occupy two cells.
 */
export function getActionsLogLineLength(line: ILogLineTemplateData): number {
  const text = getActionsLogLineText(line)
  let length = 0
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0
    if (char === '\n' || char === '\r') {
      // The parser keeps each line's trailing newline; it occupies no cell.
      continue
    } else if (char === '\t') {
      length += 8 - (length % 8)
    } else if (codePoint >= 0x1100) {
      // Everything at or above Hangul Jamo (CJK, fullwidth forms, emoji)
      // is treated as a double-width cell; an overestimate only widens the
      // scrollable area, never clips.
      length += 2
    } else {
      length += 1
    }
  }
  return length
}

interface IJobLogViewerProps {
  readonly job: IActionsJob
  readonly log: string
  readonly loading: boolean
  readonly error: Error | null
  readonly onClose: () => void
}

interface IJobLogViewerState {
  readonly search: string
  readonly searchMode: FilterMode
  readonly searchCaseSensitive: boolean
  readonly match: number
  readonly collapsedGroups: ReadonlySet<number>
}

export function getActionsLogLineText(line: ILogLineTemplateData): string {
  return line.lineContent
    .flatMap(content =>
      content.output.flatMap(item => [item.entry, item.entryUrl, item.afterUrl])
    )
    .filter((value): value is string => value !== undefined)
    .join('')
}

export function getVisibleActionsLogLines(
  lines: ReadonlyArray<ILogLineTemplateData>,
  collapsedGroups: ReadonlySet<number>
): ReadonlyArray<ILogLineTemplateData> {
  let groupCollapsed = false
  const visible = new Array<ILogLineTemplateData>()
  for (const line of lines) {
    if (line.isGroup) {
      groupCollapsed = collapsedGroups.has(line.lineNumber)
      visible.push(line)
      continue
    }
    if (!line.inGroup) {
      groupCollapsed = false
    }
    if (!groupCollapsed) {
      visible.push(line)
    }
  }
  return visible
}

export class JobLogViewer extends React.Component<
  IJobLogViewerProps,
  IJobLogViewerState
> {
  private list: Grid | null = null
  private viewer: HTMLElement | null = null
  private previousFocus: HTMLElement | null = null
  private logCharWidth: number | null = null
  private scrollbarWidth: number | null = null
  private readonly groupToggleHandlers = new Map<number, () => void>()
  private getMaxLineLength = memoizeOne(
    (lines: ReadonlyArray<ILogLineTemplateData>) =>
      lines.reduce(
        (max, line) => Math.max(max, getActionsLogLineLength(line)),
        0
      )
  )
  private parseLog = memoizeOne((log: string, prefix: string) =>
    new ActionsLogParser(log, prefix).getParsedLogLinesTemplateData()
  )
  private getVisibleLines = memoizeOne(getVisibleActionsLogLines)
  private findMatches = memoizeOne(
    (
      lines: ReadonlyArray<ILogLineTemplateData>,
      search: string,
      mode: FilterMode,
      caseSensitive: boolean
    ) => {
      const query = search.trim()
      if (query.length === 0) {
        return { matches: [], regexError: null }
      }
      const { results, regexError } = matchWithMode(
        query,
        lines.map((line, index) => ({ line, index })),
        ({ line }) => [getActionsLogLineText(line)],
        { mode, caseSensitive }
      )
      if (regexError !== null) {
        // An invalid pattern passes every line through matchWithMode; treating
        // that as "every line matches" would make navigation meaningless.
        return { matches: [], regexError }
      }
      // Fuzzy results are score-sorted; Previous/Next should walk line order.
      return {
        matches: results.map(r => r.item).sort((a, b) => a.index - b.index),
        regexError: null,
      }
    }
  )

  public constructor(props: IJobLogViewerProps) {
    super(props)
    this.state = {
      search: '',
      searchMode: readPersistedFilterMode(JobLogFilterListId),
      searchCaseSensitive: false,
      match: 0,
      collapsedGroups: new Set(),
    }
  }

  public componentDidMount() {
    this.previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    this.viewer?.focus()
  }

  public componentWillUnmount() {
    if (this.previousFocus?.isConnected) {
      this.previousFocus.focus()
    }
  }

  private setViewerRef = (viewer: HTMLElement | null) => {
    this.viewer = viewer
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // Keys pressed inside the regex builder overlay belong to the builder: it
    // dismisses itself on Escape via a window-level listener that would never
    // fire past this handler's stopPropagation.
    if (
      event.target instanceof Element &&
      event.target.closest('.regex-builder-overlay') !== null
    ) {
      return
    }
    event.stopPropagation()
    trapActionsDialogFocus(event, event.currentTarget)
    if (event.key === 'Escape') {
      event.preventDefault()
      this.props.onClose()
    }
  }

  private getLines() {
    const prefix = this.props.job.htmlUrl
      ? `${this.props.job.htmlUrl}#step`
      : ''
    return this.getVisibleLines(
      this.parseLog(this.props.log, prefix),
      this.state.collapsedGroups
    )
  }

  private getSearchResult(lines: ReadonlyArray<ILogLineTemplateData>) {
    return this.findMatches(
      lines,
      this.state.search,
      this.state.searchMode,
      this.state.searchCaseSensitive
    )
  }

  private getMatches(lines: ReadonlyArray<ILogLineTemplateData>) {
    return this.getSearchResult(lines).matches
  }

  private onSearch = (event: React.FormEvent<HTMLInputElement>) =>
    this.setState(
      { search: event.currentTarget.value, match: 0 },
      this.scrollToMatch
    )

  private onSearchModeChange = (searchMode: FilterMode) => {
    persistFilterMode(JobLogFilterListId, searchMode)
    this.setState({ searchMode, match: 0 }, this.scrollToMatch)
  }

  private onSearchCaseSensitiveChange = (searchCaseSensitive: boolean) =>
    this.setState({ searchCaseSensitive, match: 0 }, this.scrollToMatch)

  private onSearchPatternApply = (search: string) =>
    this.setState({ search, match: 0 }, this.scrollToMatch)

  private getSearchSampleItems = () =>
    this.getLines().slice(0, 50).map(getActionsLogLineText)

  private nextMatch = () => {
    const count = this.getMatches(this.getLines()).length
    if (count > 0) {
      this.setState(
        { match: (this.state.match + 1) % count },
        this.scrollToMatch
      )
    }
  }

  private previousMatch = () => {
    const count = this.getMatches(this.getLines()).length
    if (count > 0) {
      this.setState(
        { match: (this.state.match + count - 1) % count },
        this.scrollToMatch
      )
    }
  }

  private scrollToMatch = () => {
    const matches = this.getMatches(this.getLines())
    const target = matches[this.state.match]
    if (target) {
      this.list?.scrollToCell({ columnIndex: 0, rowIndex: target.index })
    }
  }

  private toggleGroup = (lineNumber: number) => {
    const collapsedGroups = new Set(this.state.collapsedGroups)
    if (collapsedGroups.has(lineNumber)) {
      collapsedGroups.delete(lineNumber)
    } else {
      collapsedGroups.add(lineNumber)
    }
    this.setState({ collapsedGroups })
  }

  private getGroupToggleHandler(lineNumber: number) {
    let handler = this.groupToggleHandlers.get(lineNumber)
    if (handler === undefined) {
      handler = () => this.toggleGroup(lineNumber)
      this.groupToggleHandlers.set(lineNumber, handler)
    }
    return handler
  }

  private setListRef = (list: Grid | null) => {
    this.list = list
  }

  /**
   * Measures the advance width of one character cell in the log's monospace
   * font, falling back to an estimate where layout measurement is
   * unavailable (e.g. under tests).
   */
  private getLogCharWidth(): number {
    if (this.logCharWidth === null) {
      let width = ActionsLogFontSize * 0.62
      try {
        const probe = document.createElement('span')
        probe.style.position = 'absolute'
        probe.style.top = '-9999px'
        probe.style.whiteSpace = 'pre'
        probe.style.fontFamily = 'var(--font-family-monospace)'
        probe.style.fontSize = `${ActionsLogFontSize}px`
        probe.textContent = '0'.repeat(100)
        document.body.appendChild(probe)
        const measured = probe.getBoundingClientRect().width / 100
        probe.remove()
        if (measured > 0) {
          width = measured
        }
      } catch {
        // Keep the estimate; a shortfall is caught by the row's
        // min-width: max-content safety net.
      }
      this.logCharWidth = width
    }
    return this.logCharWidth
  }

  /** Measures the width a classic (non-overlay) scrollbar occupies. */
  private getScrollbarWidth(): number {
    if (this.scrollbarWidth === null) {
      let width = 17
      try {
        const probe = document.createElement('div')
        probe.style.cssText =
          'position:absolute;top:-9999px;width:50px;height:50px;overflow:scroll;'
        document.body.appendChild(probe)
        width = probe.offsetWidth - probe.clientWidth
        probe.remove()
      } catch {
        // Keep the classic-scrollbar estimate.
      }
      this.scrollbarWidth = width
    }
    return this.scrollbarWidth
  }

  /**
   * The pixel width the widest visible log line needs. Sizing the Grid's
   * single column to this makes react-virtualized compute a real horizontal
   * scroll extent, so long lines scroll instead of being clipped by the
   * list's containers.
   */
  private getContentWidth(lines: ReadonlyArray<ILogLineTemplateData>): number {
    return Math.ceil(
      ActionsLogNumberColumnWidth +
        this.getMaxLineLength(lines) * this.getLogCharWidth() +
        ActionsLogLinePadding
    )
  }

  private renderParsedContent(content: IParsedContent, index: number) {
    return (
      <span key={index} className={content.classes.join(' ')}>
        {content.output.map((item, outputIndex) => (
          <React.Fragment key={outputIndex}>
            {item.entry}
            {item.entryUrl && (
              <LinkButton uri={item.entryUrl}>{item.entryUrl}</LinkButton>
            )}
            {item.afterUrl}
          </React.Fragment>
        ))}
      </span>
    )
  }

  private renderRow = ({ rowIndex: index, key, style }: GridCellProps) => {
    const lines = this.getLines()
    const line = lines[index]
    const isMatch = this.getMatches(lines).some(match => match.index === index)
    return (
      <div
        key={key}
        style={style}
        className={`actions-log-line ${line.className} ${
          isMatch ? 'search-match' : ''
        }`}
      >
        <button
          type="button"
          className="actions-log-number"
          disabled={!line.isGroup}
          onClick={this.getGroupToggleHandler(line.lineNumber)}
          aria-label={
            line.isGroup
              ? `Toggle log group at line ${line.lineNumber}`
              : undefined
          }
          aria-expanded={
            line.isGroup
              ? !this.state.collapsedGroups.has(line.lineNumber)
              : undefined
          }
        >
          {line.isGroup
            ? this.state.collapsedGroups.has(line.lineNumber)
              ? '▶'
              : '▼'
            : line.lineNumber}
        </button>
        <code>
          {line.lineContent.map((content, contentIndex) =>
            this.renderParsedContent(content, contentIndex)
          )}
        </code>
      </div>
    )
  }

  public render() {
    const lines = this.getLines()
    const { matches, regexError } = this.getSearchResult(lines)
    const expired =
      this.props.error instanceof APIError &&
      this.props.error.responseStatus === 410

    return (
      <div className="actions-dialog-layer">
        {/* The log overlay handles Escape and contains keyboard focus. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <section
          className="actions-log-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`${this.props.job.name} logs`}
          tabIndex={-1}
          ref={this.setViewerRef}
          onKeyDown={this.onKeyDown}
        >
          <header>
            <div>
              <span className="eyebrow">Job log</span>
              <h2>{this.props.job.name}</h2>
            </div>
            <Button onClick={this.props.onClose}>Close</Button>
          </header>
          <div className="actions-log-search">
            <input
              data-search-surface-id="actions-job-log"
              type="search"
              value={this.state.search}
              onChange={this.onSearch}
              placeholder="Search logs"
              aria-label="Search logs"
            />
            <FilterModeControl
              searchSurfaceId="actions-job-log"
              mode={this.state.searchMode}
              caseSensitive={this.state.searchCaseSensitive}
              onModeChange={this.onSearchModeChange}
              onCaseSensitiveChange={this.onSearchCaseSensitiveChange}
              regexBuilderTarget="Job log"
              getSampleItems={this.getSearchSampleItems}
              filterText={this.state.search}
              onRegexPatternApply={this.onSearchPatternApply}
            />
            <span role="status" aria-live="polite" aria-atomic="true">
              {regexError !== null
                ? regexError
                : matches.length === 0
                ? 'No matches'
                : `${Math.min(this.state.match + 1, matches.length)} of ${
                    matches.length
                  }`}
            </span>
            <Button
              size="small"
              disabled={matches.length === 0}
              onClick={this.previousMatch}
            >
              Previous
            </Button>
            <Button
              size="small"
              disabled={matches.length === 0}
              onClick={this.nextMatch}
            >
              Next
            </Button>
          </div>
          {this.props.loading ? (
            <div className="actions-loading">Downloading job log…</div>
          ) : this.props.error ? (
            <div className="actions-inline-error" role="alert">
              {expired
                ? 'These workflow logs have expired on GitHub.'
                : this.props.error.message}
            </div>
          ) : (
            <div className="actions-log-list">
              <AutoSizer>
                {({ width, height }) => {
                  // A Grid whose single column spans the widest line gives
                  // react-virtualized a real horizontal scroll extent; a
                  // plain List clips long lines (its column always equals
                  // the viewport width). When the content fits, subtract
                  // the vertical scrollbar so the fitting column does not
                  // itself trigger a phantom horizontal scrollbar.
                  const scrollbar =
                    lines.length * ActionsLogRowHeight > height
                      ? this.getScrollbarWidth()
                      : 0
                  const columnWidth = Math.max(
                    width - scrollbar,
                    this.getContentWidth(lines)
                  )
                  return (
                    <Grid
                      ref={this.setListRef}
                      width={width}
                      height={height}
                      columnCount={1}
                      columnWidth={columnWidth}
                      rowCount={lines.length}
                      rowHeight={ActionsLogRowHeight}
                      cellRenderer={this.renderRow}
                      overscanRowCount={20}
                    />
                  )
                }}
              </AutoSizer>
            </div>
          )}
        </section>
      </div>
    )
  }
}
