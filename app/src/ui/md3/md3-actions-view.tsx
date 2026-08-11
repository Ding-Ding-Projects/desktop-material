import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { APIError } from '../../lib/http'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import {
  Md3Chip,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
  Md3IconButton,
  Md3SearchField,
  Md3TonalButton,
  Md3GhostButton,
} from './md3-primitives'
import { runIcon, statusTone } from './md3-style-contract'

/**
 * The Actions destination of the MD3 shell rewrite — the
 * `<sc-if value="{{ isActions }}">` branch of `design/History MD3.dc.html`.
 *
 * Every measurement lives in `app/styles/ui/_md3-actions.scss`; this file owns
 * the markup, the ARIA state and the derived label shapes the contract's
 * `renderVals()` computes (`runRows[].meta`, `runRows[].detail`,
 * `runDetail.name`, `logLines[].style`).
 *
 * The view is presentation only. It takes read-only props and never reaches
 * for the dispatcher, the app store or `ActionsStore`; the shell adapts real
 * state to `IMd3ActionsViewProps` and owns every dialog, menu and network
 * call. Log downloading, its pagination and its 410/404 recovery all stay in
 * the existing Actions machinery — this view renders the result and offers the
 * same Retry / open-on-GitHub route `JobLogViewer` does.
 *
 * Deviations from the drawn contract, and why each one exists:
 *
 *  - The chip row carries two extra trailing icon buttons (`tune` for the
 *    advanced filter panel, `checklist` for run selection) before the
 *    contract's `play_arrow`. The surface being replaced can filter by
 *    workflow / branch / event / status and can act on runs in bulk; the
 *    prototype never drew either, and no feature may be lost in the rewrite.
 *    `play_arrow` keeps its position at the right edge of the row.
 *  - A one-line pagination footer sits under the run list, because the run
 *    list is paged and "load more" / "load all" have nowhere else to live.
 *  - A toolbar strip sits under the 42px run header carrying the attempt
 *    selector, cancel, fix-CI-locally, artifacts and open-on-GitHub — again,
 *    existing capabilities the prototype's three header controls cannot hold.
 *  - The job/step list is grouped by job, since a real run has several jobs
 *    where the prototype hard-coded one flat step list. Job-level re-run and
 *    open-on-GitHub live on the job's own header row.
 */

/** The statuses the Actions surface renders, in the contract's vocabulary. */
export type Md3ActionsStatus =
  | 'success'
  | 'failed'
  | 'running'
  | 'cancelled'
  | 'queued'

/**
 * The four filter chips the contract's `runChips` declares.
 *
 * These are identifiers, not copy. The contract writes them in English and a
 * caller filters on them, so they stay exactly as the contract spells them
 * however the interface is rendered — what the user reads comes from
 * {@link md3ActionsChipLabel}, which is localized and carries no filtering
 * meaning of its own.
 */
export type Md3ActionsChip = 'Running' | 'Failed' | 'Success' | 'This branch'

/** The chips in the contract's order. Exported so the shell can enumerate. */
export const Md3ActionsChips: ReadonlyArray<Md3ActionsChip> = [
  'Running',
  'Failed',
  'Success',
  'This branch',
]

/**
 * What a filter chip reads, in the active language mode.
 *
 * Kept apart from the identifier above deliberately: the chip's own id is what
 * a filter matches on, so translating the two together would leave a Cantonese
 * user with four chips the filter no longer recognises.
 */
export function md3ActionsChipLabel(chip: Md3ActionsChip): string {
  switch (chip) {
    case 'Running':
      return t('md3.actions.chip.running')
    case 'Failed':
      return t('md3.actions.chip.failed')
    case 'Success':
      return t('md3.actions.chip.success')
    case 'This branch':
      return t('md3.actions.chip.thisBranch')
  }
}

/** The four advanced filters the replaced surface exposes. */
export type Md3ActionsFilterName = 'workflow' | 'branch' | 'event' | 'status'

/** One `<option>` of an advanced filter. */
export interface IMd3ActionsFilterOption {
  readonly value: string
  readonly label: string
}

/**
 * A search field and everything it needs, including its own handlers.
 *
 * The two fields on this screen — workflow runs and log output — are
 * independent: each owns its query, its regex mode, its validation and its
 * builder, and neither may read the other's state.
 */
export interface IMd3ActionsSearch {
  readonly value: string

  /** Whether the query is being read as a regular expression. */
  readonly regexEnabled: boolean

  /**
   * The message shown when `regexEnabled` is on and the pattern will not
   * compile. `null` while the pattern is valid.
   */
  readonly error?: string | null

  readonly onChange: (value: string) => void
  readonly onClear: () => void
  readonly onToggleRegex: () => void

  /** Opens the anchored regex builder seeded with the current query. */
  readonly onOpenBuilder: () => void
}

/** One workflow run in the left-hand list. */
export interface IMd3ActionsRun {
  readonly id: string

  /** The workflow's name — the row's first line. */
  readonly name: string

  /** The run number, rendered as `#1482`. */
  readonly number: number

  readonly branch: string

  /** The triggering event: `push`, `pull_request`, `workflow_dispatch`. */
  readonly event: string

  /** Elapsed or total run time, already formatted: `2m 14s`. */
  readonly duration: string

  readonly status: Md3ActionsStatus

  /**
   * The status word for the detail line. Defaults to `status` — supply it when
   * the provider's own wording is more precise ("timed out", "action required").
   */
  readonly statusLabel?: string

  /** The login of whoever triggered the run. */
  readonly actor: string

  /** The abbreviated head SHA, e.g. `4f1c9ae`. */
  readonly sha: string

  readonly jobCount: number

  /** When the run started, already formatted for display. */
  readonly time: string

  readonly attempt: number

  /** Whether a cancel request is meaningful for this run right now. */
  readonly cancellable: boolean

  /** Whether this run has failed jobs a partial re-run could target. */
  readonly hasFailedJobs: boolean

  /** Set while a request against this run is in flight. */
  readonly busy?: boolean
}

/** One step of a job in the right-hand list. */
export interface IMd3ActionsStep {
  readonly id: string
  readonly name: string
  readonly status: Md3ActionsStatus

  /** The right-aligned duration, already formatted: `48s`. */
  readonly duration: string
}

/** One job of the selected run. */
export interface IMd3ActionsJob {
  readonly id: string
  readonly name: string
  readonly status: Md3ActionsStatus
  readonly duration: string
  readonly steps: ReadonlyArray<IMd3ActionsStep>

  /** Whether GitHub will accept a re-run request for this job alone. */
  readonly canRerun: boolean

  readonly busy?: boolean
}

/** The run-list paging state, mirroring what the Actions store reports. */
export interface IMd3ActionsPagination {
  /** How many runs have been downloaded so far. */
  readonly loadedCount: number

  /** How many runs the provider says exist. */
  readonly totalCount: number

  /** Whether another page is available. */
  readonly hasMore: boolean

  readonly loadingMore: boolean

  /** Whether the load-every-remaining-page sweep is running. */
  readonly loadingAll: boolean
}

/** The attempt selector state for the selected run. */
export interface IMd3ActionsAttempts {
  readonly selected: number
  readonly latest: number

  /** The bounded list of attempts offered in the selector. */
  readonly options: ReadonlyArray<number>
}

/** A non-blocking status strip above the two panes. */
export interface IMd3ActionsBanner {
  readonly id: string
  readonly kind: 'error' | 'warning' | 'success'
  readonly message: string
}

export interface IMd3ActionsViewProps {
  // --- Left pane: filtering -------------------------------------------------

  readonly runSearch: IMd3ActionsSearch

  /** Which of the four contract chips are on. */
  readonly activeChips: ReadonlyArray<Md3ActionsChip>

  readonly onToggleChip: (chip: Md3ActionsChip) => void

  /** Disables "This branch" when the repository has no checked-out branch. */
  readonly thisBranchAvailable: boolean

  /** Whether any enabled workflow accepts `workflow_dispatch`. */
  readonly canDispatch: boolean

  /** Opens the `workflow_dispatch` dialog. */
  readonly onDispatchWorkflow: () => void

  // --- Left pane: advanced filters ------------------------------------------

  readonly filtersOpen: boolean
  readonly onToggleFilters: () => void

  readonly filterValues: Readonly<Record<Md3ActionsFilterName, string>>

  readonly filterOptions: Readonly<
    Record<Md3ActionsFilterName, ReadonlyArray<IMd3ActionsFilterOption>>
  >

  readonly onFilterChange: (name: Md3ActionsFilterName, value: string) => void

  /** Clears the chips, the advanced filters and the query together. */
  readonly onResetFilters: () => void

  // --- Left pane: selection and bulk actions --------------------------------

  readonly selectionMode: boolean
  readonly onToggleSelectionMode: () => void

  readonly selectedRunIds: ReadonlySet<string>
  readonly onToggleRunSelection: (runId: string) => void
  readonly onToggleAllVisibleRuns: () => void
  readonly onClearRunSelection: () => void

  /** Re-runs every selected completed run, behind the shell's review dialog. */
  readonly onBulkRerun: () => void

  /** Cancels every selected active run, behind the shell's review dialog. */
  readonly onBulkCancel: () => void

  /** Set while a reviewed bulk request is in flight. */
  readonly bulkBusy: boolean

  // --- Left pane: the run list ----------------------------------------------

  /** The runs that survived the query, the chips and the advanced filters. */
  readonly runs: ReadonlyArray<IMd3ActionsRun>

  readonly selectedRunId: string | null

  readonly onSelectRun: (runId: string) => void

  /** Re-runs every job of one run — the row's `refresh` button. */
  readonly onRerunRun: (runId: string) => void

  /** Opens the run's row menu, from the kebab or from a right-click. */
  readonly onOpenRunMenu: (runId: string) => void

  readonly pagination: IMd3ActionsPagination | null
  readonly onLoadMoreRuns: () => void

  /** Starts the load-all sweep, or stops it while it is running. */
  readonly onLoadAllRuns: () => void

  // --- Right pane: the selected run -----------------------------------------

  /** The selected run, resolved by the shell. `null` shows the empty state. */
  readonly selectedRun: IMd3ActionsRun | null

  readonly onRerunSelectedRun: () => void
  readonly onRerunFailedJobs: () => void

  /** Opens the pane menu — the header's `more_vert`. */
  readonly onOpenPaneMenu: () => void

  readonly onCancelSelectedRun: () => void

  /** Hands a failed run to the local coding agent. Omit to hide the control. */
  readonly onFixCiLocally?: () => void

  /** Opens the run's artifacts. Omit to hide the control. */
  readonly onOpenArtifacts?: () => void

  /** Opens the run on the forge. Omit to hide the control. */
  readonly onOpenRunOnGitHub?: () => void

  readonly attempts: IMd3ActionsAttempts | null
  readonly onSelectAttempt: (attempt: number) => void

  // --- Right pane: jobs and steps -------------------------------------------

  readonly jobs: ReadonlyArray<IMd3ActionsJob>

  /** The step whose log is being shown. */
  readonly selectedStepId: string | null

  readonly onSelectStep: (stepId: string, jobId: string) => void

  readonly jobsLoading: boolean
  readonly jobsLoadingMore: boolean
  readonly jobsError: Error | null

  /** Whether another page of jobs is available. */
  readonly jobsHasMore: boolean

  /** Whether the provider truncated the job list. */
  readonly jobsTruncated: boolean

  readonly onLoadMoreJobs: () => void
  readonly onReloadJobs: () => void

  readonly onRerunJob: (jobId: string) => void
  readonly onOpenJobOnGitHub?: (jobId: string) => void

  // --- Right pane: the log --------------------------------------------------

  readonly logSearch: IMd3ActionsSearch

  /**
   * The raw job log, exactly as the existing downloader returned it.
   *
   * The view splits it, numbers it and — while `logSearch` holds a query —
   * filters it, because the contract does the filtering in the view
   * (`logShown = lQuery ? logsAll.filter(lMatch) : logsAll`). The shell keeps
   * the downloading, its paging and its 410 recovery.
   */
  readonly logText: string

  readonly logLoading: boolean

  /** The download failure, if any. A 410 renders the expiry copy. */
  readonly logError: Error | null

  readonly onRetryLog: () => void

  // --- Chrome ---------------------------------------------------------------

  /** Rate-limit, error and confirmation strips from the Actions store. */
  readonly banners?: ReadonlyArray<IMd3ActionsBanner>
}

/**
 * The contract's `runIcon(status)`, plus the queued state the prototype's
 * fixtures never produced — `runIcon()` would fall through to `cancel` and
 * report a queued run as cancelled.
 */
export function md3ActionsStatusIcon(
  status: Md3ActionsStatus
): MaterialSymbolName {
  return status === 'queued' ? 'schedule' : runIcon(status)
}

/** The contract's row meta line: `#1482 · development · push · 2m 14s`. */
export function formatMd3RunMeta(run: IMd3ActionsRun): string {
  return t('md3.actions.runMeta', {
    number: String(run.number),
    branch: run.branch,
    event: run.event,
    duration: run.duration,
  })
}

/**
 * The contract's row detail line:
 * `failed · triggered by alice · 4f1c9ae · 6 jobs · 2m 14s · attempt 2`.
 */
export function formatMd3RunDetail(run: IMd3ActionsRun): string {
  return t('md3.actions.runDetail', {
    status: run.statusLabel ?? run.status,
    actor: run.actor,
    sha: run.sha,
    jobs: String(run.jobCount),
    time: run.time,
    attempt: String(run.attempt),
  })
}

/** The contract's `runDetail.name`: `Release · #1482 · development`. */
export function formatMd3RunHeading(run: IMd3ActionsRun): string {
  return t('md3.actions.detailHeading', {
    name: run.name,
    number: String(run.number),
    branch: run.branch,
  })
}

/** How a log line is painted. The contract tests the raw text, not the parse. */
export type Md3LogLineKind = 'error' | 'command' | 'plain'

const LogErrorPattern = /FAIL|Error|●/

/**
 * The contract's two log rules: `/FAIL|Error|●/` paints the error colour, a
 * leading `$` paints primary at weight 500, everything else is
 * on-surface-variant.
 */
export function classifyMd3LogLine(text: string): Md3LogLineKind {
  if (LogErrorPattern.test(text)) {
    return 'error'
  }
  return text.startsWith('$') ? 'command' : 'plain'
}

/** One rendered log row. */
interface IMd3LogLine {
  /**
   * The 1-based position of this line **in the raw log**, not in the filtered
   * view.
   *
   * The contract filters the list when a log query is active and numbers the
   * survivors `i + 1`, which renumbers the log — a reader cannot then match a
   * row against the raw file, which is the only reason a gutter exists. The
   * numbering shipped here is therefore the true log line number, so a
   * filtered view reads 12, 47, 48, 200 rather than 1, 2, 3, 4.
   */
  readonly number: number
  readonly text: string
  readonly kind: Md3LogLineKind
}

function splitLogLines(log: string): ReadonlyArray<IMd3LogLine> {
  if (log.length === 0) {
    return []
  }
  const raw = log.split(/\r\n|\n|\r/)
  // A log that ends with a newline yields a trailing empty element that is not
  // a line of the file; dropping it keeps the count honest.
  if (raw.length > 1 && raw[raw.length - 1] === '') {
    raw.pop()
  }
  return raw.map((text, index) => ({
    number: index + 1,
    text,
    kind: classifyMd3LogLine(text),
  }))
}

/**
 * How many rows of a long list are rendered before the reader scrolls further.
 *
 * This is deliberately not `useMd3VirtualWindow` from `md3-virtual-window.ts`,
 * which the changed-file and diff lists use. That hook replaces off-screen rows
 * with padding, which needs one fixed row height and needs the rows it is
 * hiding not to matter. Neither holds here:
 *
 *  - a log line is `white-space: pre-wrap; word-break: break-word`, so its
 *    height depends on its own text and no single row height exists;
 *  - the run list carries roving focus, and `ArrowDown` finds the next row by
 *    walking the DOM. A row replaced by padding cannot be focused, so a
 *    windowed run list would silently stop responding to the arrow keys at the
 *    edge of the window.
 *
 * Growing a render window instead keeps every rendered row real, costs one
 * `slice`, and still means a 200,000-line log paints 1,500 rows rather than all
 * of them.
 */
const LogWindowSize = 1500
const RunWindowSize = 200

/** Grow the window when the scroller comes within this many pixels of the end. */
const WindowGrowThreshold = 320

function useIncrementalWindow(total: number, step: number) {
  const [count, setCount] = React.useState(step)

  // A new list (a different run, a changed filter) starts at the first window
  // again rather than inheriting however far the previous one was scrolled.
  React.useEffect(() => setCount(step), [total, step])

  const grow = React.useCallback(() => {
    setCount(current => (current >= total ? current : current + step))
  }, [total, step])

  const onScroll = React.useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const element = event.currentTarget
      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight
      if (remaining < WindowGrowThreshold) {
        grow()
      }
    },
    [grow]
  )

  return { count: Math.min(count, total), grow, onScroll }
}

/**
 * Move roving focus within a list of siblings matching `selector`.
 *
 * The rows and steps are looked up from the DOM rather than through a ref per
 * item: the container is `event.currentTarget`'s ancestor and already holds
 * them in visual order, so there is no map to keep in step with a windowed
 * list that grows underneath it.
 */
function moveRovingFocus(
  event: React.KeyboardEvent<HTMLElement>,
  containerSelector: string,
  itemSelector: string,
  onGrow?: () => void
): boolean {
  const container = event.currentTarget.closest(containerSelector)
  if (container === null) {
    return false
  }
  const items = Array.from(
    container.querySelectorAll<HTMLElement>(itemSelector)
  )
  const index = items.indexOf(event.currentTarget)
  if (index === -1) {
    return false
  }

  let next = index
  switch (event.key) {
    case 'ArrowDown':
      next = index + 1
      break
    case 'ArrowUp':
      next = index - 1
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = items.length - 1
      break
    default:
      return false
  }

  if (next >= items.length) {
    // The last rendered row is not necessarily the last row: grow the window
    // and let the next keypress reach what it revealed.
    onGrow?.()
    return true
  }
  if (next < 0) {
    return false
  }

  event.preventDefault()
  items[next].focus()
  return true
}

// ---------------------------------------------------------------------------
// Run list
// ---------------------------------------------------------------------------

interface IMd3RunRowProps {
  readonly run: IMd3ActionsRun
  readonly selected: boolean
  readonly focused: boolean
  readonly selectionMode: boolean
  readonly checked: boolean
  readonly bulkBusy: boolean
  readonly onSelect: (runId: string) => void
  readonly onFocusRow: (runId: string) => void
  readonly onRerun: (runId: string) => void
  readonly onOpenMenu: (runId: string) => void
  readonly onToggleSelection: (runId: string) => void
  readonly onGrowWindow: () => void
}

const Md3RunRow = React.memo(function Md3RunRow(props: IMd3RunRowProps) {
  const {
    run,
    onSelect,
    onFocusRow,
    onRerun,
    onOpenMenu,
    onToggleSelection,
    onGrowWindow,
  } = props
  const tone = statusTone(run.status)

  const select = React.useCallback(() => onSelect(run.id), [onSelect, run.id])
  const focusRow = React.useCallback(
    () => onFocusRow(run.id),
    [onFocusRow, run.id]
  )
  const rerun = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onRerun(run.id)
    },
    [onRerun, run.id]
  )
  const openMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onSelect(run.id)
      onOpenMenu(run.id)
    },
    [onOpenMenu, onSelect, run.id]
  )
  const contextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      onSelect(run.id)
      onOpenMenu(run.id)
    },
    [onOpenMenu, onSelect, run.id]
  )
  const toggleSelection = React.useCallback(
    () => onToggleSelection(run.id),
    [onToggleSelection, run.id]
  )
  const stopClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => event.stopPropagation(),
    []
  )
  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (
        moveRovingFocus(
          event,
          '.md3-actions-run-list',
          '[data-run-row]',
          onGrowWindow
        )
      ) {
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(run.id)
      }
    },
    [onGrowWindow, onSelect, run.id]
  )

  return (
    // The row is a grid row: it is clickable, arrow-key navigable and Enter /
    // Space activated, which is exactly what these two rules exist to require.
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */
    <div
      role="row"
      data-run-row={true}
      aria-selected={props.selected}
      tabIndex={props.focused ? 0 : -1}
      className={classNames('md3-row', 'md3-actions-run', {
        'md3-row--active': props.selected,
      })}
      onClick={select}
      onFocus={focusRow}
      onKeyDown={onKeyDown}
      onContextMenu={contextMenu}
    >
      {props.selectionMode ? (
        <span role="gridcell" className="md3-actions-run__check">
          {/* The click is swallowed so ticking the box does not also select
              the run and load its log. */}
          <input
            type="checkbox"
            checked={props.checked}
            disabled={props.bulkBusy}
            onChange={toggleSelection}
            onClick={stopClick}
            aria-label={t('md3.actions.selectRun', { name: run.name })}
          />
        </span>
      ) : null}
      <span role="gridcell" className="md3-actions-run__status">
        <MaterialSymbol
          name={md3ActionsStatusIcon(run.status)}
          size={17}
          className={classNames(tone.on, {
            'md3-actions-spin': run.status === 'running',
          })}
        />
      </span>
      <span role="gridcell" className="md3-actions-run__text">
        <span
          className={classNames('md3-row__name', {
            'md3-row__name--active': props.selected,
          })}
        >
          {run.name}
        </span>
        <span className="md3-actions-run__meta">{formatMd3RunMeta(run)}</span>
        <span className="md3-row__detail">{formatMd3RunDetail(run)}</span>
      </span>
      <span role="gridcell" className="md3-actions-run__actions">
        <Md3IconButton
          small={true}
          icon="refresh"
          label={t('md3.actions.rerunRun', { name: run.name })}
          tooltip={t('md3.actions.rerun')}
          disabled={run.busy === true || props.bulkBusy}
          onClick={rerun}
        />
        <Md3IconButton
          small={true}
          icon="more_vert"
          label={t('md3.actions.runMenuFor', { name: run.name })}
          tooltip={t('md3.actions.runMenuHint')}
          hasPopup="menu"
          onClick={openMenu}
        />
      </span>
    </div>
  )
})

interface IMd3RunListProps {
  readonly runs: ReadonlyArray<IMd3ActionsRun>
  readonly selectedRunId: string | null
  readonly selectionMode: boolean
  readonly selectedRunIds: ReadonlySet<string>
  readonly bulkBusy: boolean
  readonly onSelectRun: (runId: string) => void
  readonly onRerunRun: (runId: string) => void
  readonly onOpenRunMenu: (runId: string) => void
  readonly onToggleRunSelection: (runId: string) => void
  readonly onResetFilters: () => void
}

function Md3RunList(props: IMd3RunListProps) {
  const { runs } = props
  const runWindow = useIncrementalWindow(runs.length, RunWindowSize)
  const [focusedRunId, setFocusedRunId] = React.useState<string | null>(null)

  const onFocusRow = React.useCallback(
    (runId: string) => setFocusedRunId(runId),
    []
  )

  if (runs.length === 0) {
    return (
      <div className="md3-actions-run-list md3-actions-run-list--empty">
        <Md3EmptyState
          message={t('md3.actions.noRuns')}
          onAction={props.onResetFilters}
        />
      </div>
    )
  }

  // Roving tabindex: exactly one row is a tab stop. It is the focused row when
  // there is one, otherwise the selected row, otherwise the first.
  const rovingId = focusedRunId ?? props.selectedRunId ?? runs[0]?.id ?? null

  return (
    <div className="md3-actions-run-list" onScroll={runWindow.onScroll}>
      <div
        role="grid"
        aria-label={t('md3.actions.runList')}
        aria-multiselectable={props.selectionMode}
        aria-rowcount={runs.length}
      >
        <div role="rowgroup">
          {runs.slice(0, runWindow.count).map(run => (
            <Md3RunRow
              key={run.id}
              run={run}
              selected={run.id === props.selectedRunId}
              focused={run.id === rovingId}
              selectionMode={props.selectionMode}
              checked={props.selectedRunIds.has(run.id)}
              bulkBusy={props.bulkBusy}
              onSelect={props.onSelectRun}
              onFocusRow={onFocusRow}
              onRerun={props.onRerunRun}
              onOpenMenu={props.onOpenRunMenu}
              onToggleSelection={props.onToggleRunSelection}
              onGrowWindow={runWindow.grow}
            />
          ))}
        </div>
      </div>
      {runWindow.count < runs.length ? (
        <div className="md3-actions-window-more">
          <Md3GhostButton
            icon="expand_more"
            label={t('md3.actions.showMoreRuns')}
            onClick={runWindow.grow}
          />
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Advanced filters
// ---------------------------------------------------------------------------

interface IMd3FilterSelectProps {
  readonly name: Md3ActionsFilterName
  readonly label: string
  readonly value: string
  readonly options: ReadonlyArray<IMd3ActionsFilterOption>
  readonly onChange: (name: Md3ActionsFilterName, value: string) => void
}

function Md3FilterSelect(props: IMd3FilterSelectProps) {
  const { name, onChange } = props
  const id = `md3-actions-filter-${name}`
  const change = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) =>
      onChange(name, event.currentTarget.value),
    [name, onChange]
  )

  return (
    <div className="md3-actions-filter">
      <label htmlFor={id}>{props.label}</label>
      <select id={id} value={props.value} onChange={change}>
        {props.options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Jobs and steps
// ---------------------------------------------------------------------------

interface IMd3StepButtonProps {
  readonly step: IMd3ActionsStep
  readonly jobId: string
  readonly selected: boolean

  /**
   * Whether this step is the list's single tab stop. It is the selected step
   * when there is one and the very first step otherwise — without the
   * fallback a run whose log has not been opened yet would have no reachable
   * step at all.
   */
  readonly roving: boolean
  readonly onSelect: (stepId: string, jobId: string) => void
}

const Md3StepButton = React.memo(function Md3StepButton(
  props: IMd3StepButtonProps
) {
  const { step, jobId, onSelect } = props
  const tone = statusTone(step.status)
  const select = React.useCallback(
    () => onSelect(step.id, jobId),
    [onSelect, step.id, jobId]
  )
  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      moveRovingFocus(event, '.md3-actions-steps', '[data-step-button]')
    },
    []
  )

  return (
    <button
      type="button"
      data-step-button={true}
      className={classNames('md3-actions-step', {
        'md3-actions-step--active': props.selected,
      })}
      aria-current={props.selected ? true : undefined}
      tabIndex={props.roving ? 0 : -1}
      onClick={select}
      onKeyDown={onKeyDown}
    >
      <MaterialSymbol
        name={md3ActionsStatusIcon(step.status)}
        size={15}
        className={classNames(tone.on, {
          'md3-actions-spin': step.status === 'running',
        })}
      />
      <span className="md3-actions-step__label">{step.name}</span>
      <span className="md3-actions-step__time">{step.duration}</span>
    </button>
  )
})

interface IMd3JobBlockProps {
  readonly job: IMd3ActionsJob
  readonly selectedStepId: string | null

  /** The one step in the whole list that is a tab stop. */
  readonly rovingStepId: string | null
  readonly onSelectStep: (stepId: string, jobId: string) => void
  readonly onRerunJob: (jobId: string) => void
  readonly onOpenJobOnGitHub?: (jobId: string) => void
}

const Md3JobBlock = React.memo(function Md3JobBlock(props: IMd3JobBlockProps) {
  const { job, onRerunJob, onOpenJobOnGitHub } = props
  const tone = statusTone(job.status)
  const rerun = React.useCallback(
    () => onRerunJob(job.id),
    [onRerunJob, job.id]
  )
  const openOnGitHub = React.useCallback(
    () => onOpenJobOnGitHub?.(job.id),
    [onOpenJobOnGitHub, job.id]
  )

  return (
    <div role="group" aria-label={job.name} className="md3-actions-job">
      <div className="md3-actions-job__header">
        <MaterialSymbol
          name={md3ActionsStatusIcon(job.status)}
          size={15}
          className={classNames(tone.on, {
            'md3-actions-spin': job.status === 'running',
          })}
        />
        <span className="md3-actions-job__name">{job.name}</span>
        <span className="md3-actions-job__time">{job.duration}</span>
        {job.canRerun ? (
          <Md3IconButton
            small={true}
            icon="replay"
            label={t('md3.actions.rerunJob', { name: job.name })}
            disabled={job.busy === true}
            onClick={rerun}
          />
        ) : null}
        {onOpenJobOnGitHub === undefined ? null : (
          <Md3IconButton
            small={true}
            icon="open_in_new"
            label={t('md3.actions.jobOnGitHub', { name: job.name })}
            onClick={openOnGitHub}
          />
        )}
      </div>
      {job.steps.map(step => (
        <Md3StepButton
          key={step.id}
          step={step}
          jobId={job.id}
          selected={step.id === props.selectedStepId}
          roving={step.id === props.rovingStepId}
          onSelect={props.onSelectStep}
        />
      ))}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Log viewer
// ---------------------------------------------------------------------------

interface IMd3LogViewerProps {
  readonly lines: ReadonlyArray<IMd3LogLine>
  readonly loading: boolean
  readonly error: Error | null
  readonly onRetry: () => void
  readonly onOpenOnGitHub?: () => void
  readonly filtered: boolean
}

function Md3LogViewer(props: IMd3LogViewerProps) {
  const { lines } = props
  const logWindow = useIncrementalWindow(lines.length, LogWindowSize)

  if (props.loading) {
    return (
      <div className="md3-actions-log md3-actions-log--message" role="status">
        {t('md3.actions.logLoading')}
      </div>
    )
  }

  if (props.error !== null) {
    const expired =
      props.error instanceof APIError && props.error.responseStatus === 410
    return (
      <div className="md3-actions-log md3-actions-log--message">
        <p role="alert" className="md3-actions-log__error">
          {expired ? t('md3.actions.logExpired') : props.error.message}
        </p>
        <div className="md3-actions-log__error-actions">
          <Md3TonalButton
            icon="refresh"
            label={t('md3.actions.logRetry')}
            onClick={props.onRetry}
          />
          {props.onOpenOnGitHub === undefined ? null : (
            <Md3GhostButton
              icon="open_in_new"
              label={t('md3.actions.openOnGitHub')}
              onClick={props.onOpenOnGitHub}
            />
          )}
        </div>
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="md3-actions-log md3-actions-log--message" role="status">
        {props.filtered
          ? t('md3.actions.logNoMatch')
          : t('md3.actions.logEmpty')}
      </div>
    )
  }

  return (
    <div
      className="md3-actions-log"
      role="region"
      aria-label={t('md3.actions.logRegion')}
      // A scrolling container that holds no focusable descendants is
      // unreachable by keyboard unless it is itself a tab stop, so a
      // keyboard-only reader could never page through the log (WCAG 2.1.1).
      // The named region is exactly the case this rule's default option list
      // is too narrow for.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onScroll={logWindow.onScroll}
    >
      {lines.slice(0, logWindow.count).map(line => (
        <div
          key={line.number}
          className={classNames(
            'md3-actions-log__line',
            `md3-actions-log__line--${line.kind}`
          )}
        >
          <span className="md3-actions-log__number">{line.number}</span>
          <span className="md3-actions-log__text">{line.text}</span>
        </div>
      ))}
      {logWindow.count < lines.length ? (
        <div className="md3-actions-window-more">
          <Md3GhostButton
            icon="expand_more"
            label={t('md3.actions.logShowMore')}
            onClick={logWindow.grow}
          />
          <span className="md3-actions-window-more__status" role="status">
            {t('md3.actions.logShowing', {
              shown: String(logWindow.count),
              total: String(lines.length),
            })}
          </span>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function Md3ActionsView(props: IMd3ActionsViewProps) {
  const {
    runSearch,
    logSearch,
    onToggleChip,
    onFilterChange,
    onSelectAttempt,
    selectedRun,
    logText,
  } = props

  const activeChips = props.activeChips
  const isChipActive = React.useCallback(
    (chip: Md3ActionsChip) => activeChips.includes(chip),
    [activeChips]
  )

  // The chip reports its own untranslated id rather than the label it renders,
  // so this stays a straight lookup in every language mode.
  const toggleChip = React.useCallback(
    (value: string) => {
      const chip = Md3ActionsChips.find(candidate => candidate === value)
      if (chip !== undefined) {
        onToggleChip(chip)
      }
    },
    [onToggleChip]
  )

  const changeAttempt = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) =>
      onSelectAttempt(Number(event.currentTarget.value)),
    [onSelectAttempt]
  )

  const allLogLines = React.useMemo(() => splitLogLines(logText), [logText])
  const logQuery = logSearch.value.trim()
  const logLines = React.useMemo(() => {
    if (logQuery.length === 0) {
      return allLogLines
    }
    if (logSearch.regexEnabled) {
      try {
        const pattern = new RegExp(logQuery, 'i')
        return allLogLines.filter(line => pattern.test(line.text))
      } catch {
        // An uncompilable pattern matches nothing rather than everything; the
        // field renders `logSearch.error` beside it saying why.
        return []
      }
    }
    const needle = logQuery.toLowerCase()
    return allLogLines.filter(line => line.text.toLowerCase().includes(needle))
  }, [allLogLines, logQuery, logSearch.regexEnabled])

  const selectedRunCount = props.selectedRunIds.size
  const selectedRuns = React.useMemo(
    () => props.runs.filter(run => props.selectedRunIds.has(run.id)),
    [props.runs, props.selectedRunIds]
  )
  const selectedCompletedCount = selectedRuns.filter(
    run => !run.cancellable
  ).length
  const selectedActiveCount = selectedRuns.filter(run => run.cancellable).length
  const allVisibleSelected =
    props.runs.length > 0 &&
    props.runs.every(run => props.selectedRunIds.has(run.id))

  const banners = props.banners ?? []

  // One tab stop in the whole step list, so a run with forty steps costs one
  // Tab rather than forty.
  const rovingStepId =
    props.selectedStepId ?? props.jobs[0]?.steps[0]?.id ?? null

  return (
    <div className="md3-actions-view">
      {banners.length === 0 ? null : (
        <div className="md3-actions-banners">
          {banners.map(banner => (
            <p
              key={banner.id}
              className={classNames(
                'md3-actions-banner',
                `md3-actions-banner--${banner.kind}`
              )}
              role={banner.kind === 'success' ? 'status' : 'alert'}
            >
              {banner.message}
            </p>
          ))}
        </div>
      )}

      <div className="md3-actions-view__panes md3-anim-up">
        {/* ---------------------------------------------------------------
            Left: the run list
        --------------------------------------------------------------- */}
        <section
          className="md3-actions-pane md3-actions-pane--runs"
          aria-label={t('md3.actions.runList')}
        >
          <Md3SearchField
            id="md3-actions-run-search"
            fieldLabel={t('md3.actions.runFieldLabel')}
            placeholder={t('md3.actions.filterPlaceholder')}
            value={runSearch.value}
            regexEnabled={runSearch.regexEnabled}
            onChange={runSearch.onChange}
            onClear={runSearch.onClear}
            onToggleRegex={runSearch.onToggleRegex}
            onOpenBuilder={runSearch.onOpenBuilder}
          />
          {runSearch.error ? (
            <p className="md3-actions-query-error" role="alert">
              {runSearch.error}
            </p>
          ) : null}

          <Md3ChipRow label={t('md3.actions.chipRowLabel')}>
            {Md3ActionsChips.map(chip => (
              <Md3Chip
                key={chip}
                label={md3ActionsChipLabel(chip)}
                value={chip}
                active={isChipActive(chip)}
                disabled={chip === 'This branch' && !props.thisBranchAvailable}
                onToggle={toggleChip}
              />
            ))}
            <Md3ChipRowSpacer />
            <Md3IconButton
              small={true}
              icon="tune"
              label={t('md3.actions.moreFilters')}
              expanded={props.filtersOpen}
              pressed={props.filtersOpen}
              active={props.filtersOpen}
              onClick={props.onToggleFilters}
            />
            <Md3IconButton
              small={true}
              icon="checklist"
              label={t('md3.actions.selectRuns')}
              pressed={props.selectionMode}
              active={props.selectionMode}
              onClick={props.onToggleSelectionMode}
            />
            <Md3IconButton
              small={true}
              icon="play_arrow"
              label={t('md3.actions.dispatch')}
              hasPopup="dialog"
              disabled={!props.canDispatch}
              onClick={props.onDispatchWorkflow}
            />
          </Md3ChipRow>

          {props.filtersOpen ? (
            <section
              className="md3-actions-filters"
              aria-label={t('md3.actions.filtersHeading')}
            >
              <Md3FilterSelect
                name="workflow"
                label={t('md3.actions.filterWorkflow')}
                value={props.filterValues.workflow}
                options={props.filterOptions.workflow}
                onChange={onFilterChange}
              />
              <Md3FilterSelect
                name="branch"
                label={t('md3.actions.filterBranch')}
                value={props.filterValues.branch}
                options={props.filterOptions.branch}
                onChange={onFilterChange}
              />
              <Md3FilterSelect
                name="event"
                label={t('md3.actions.filterEvent')}
                value={props.filterValues.event}
                options={props.filterOptions.event}
                onChange={onFilterChange}
              />
              <Md3FilterSelect
                name="status"
                label={t('md3.actions.filterStatus')}
                value={props.filterValues.status}
                options={props.filterOptions.status}
                onChange={onFilterChange}
              />
              <Md3GhostButton
                icon="restart_alt"
                label={t('md3.actions.resetFilters')}
                onClick={props.onResetFilters}
              />
            </section>
          ) : null}

          {props.selectionMode ? (
            <div
              className="md3-actions-bulk"
              role="group"
              aria-label={t('md3.actions.bulkLabel')}
            >
              <label className="md3-actions-bulk__all">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={props.runs.length === 0 || props.bulkBusy}
                  onChange={props.onToggleAllVisibleRuns}
                />
                <span>{t('md3.actions.selectAllVisible')}</span>
              </label>
              <span className="md3-actions-bulk__count" role="status">
                {t('md3.actions.selectedCount', {
                  count: String(selectedRunCount),
                })}
              </span>
              <Md3GhostButton
                icon="refresh"
                label={t('md3.actions.bulkRerun', {
                  count: String(selectedCompletedCount),
                })}
                disabled={selectedCompletedCount === 0 || props.bulkBusy}
                onClick={props.onBulkRerun}
              />
              <Md3GhostButton
                icon="cancel"
                label={t('md3.actions.bulkCancel', {
                  count: String(selectedActiveCount),
                })}
                disabled={selectedActiveCount === 0 || props.bulkBusy}
                onClick={props.onBulkCancel}
              />
              <Md3GhostButton
                icon="backspace"
                label={t('md3.actions.clearSelection')}
                disabled={selectedRunCount === 0 || props.bulkBusy}
                onClick={props.onClearRunSelection}
              />
            </div>
          ) : null}

          <Md3RunList
            runs={props.runs}
            selectedRunId={props.selectedRunId}
            selectionMode={props.selectionMode}
            selectedRunIds={props.selectedRunIds}
            bulkBusy={props.bulkBusy}
            onSelectRun={props.onSelectRun}
            onRerunRun={props.onRerunRun}
            onOpenRunMenu={props.onOpenRunMenu}
            onToggleRunSelection={props.onToggleRunSelection}
            onResetFilters={props.onResetFilters}
          />

          {props.pagination === null ? null : (
            <div className="md3-actions-pagination">
              <span role="status">
                {t('md3.actions.pagination', {
                  shown: String(props.runs.length),
                  loaded: String(props.pagination.loadedCount),
                  total: String(props.pagination.totalCount),
                })}
              </span>
              {props.pagination.hasMore ? (
                <>
                  <Md3GhostButton
                    icon="expand_more"
                    label={
                      props.pagination.loadingMore
                        ? t('md3.actions.loadingMore')
                        : t('md3.actions.loadMoreRuns')
                    }
                    disabled={
                      props.pagination.loadingMore ||
                      props.pagination.loadingAll
                    }
                    onClick={props.onLoadMoreRuns}
                  />
                  <Md3GhostButton
                    icon={props.pagination.loadingAll ? 'pause' : 'stacks'}
                    label={
                      props.pagination.loadingAll
                        ? t('md3.actions.stopLoading')
                        : t('md3.actions.loadAllRuns')
                    }
                    onClick={props.onLoadAllRuns}
                  />
                </>
              ) : null}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------
            Right: the selected run
        --------------------------------------------------------------- */}
        <section
          className="md3-actions-pane md3-actions-pane--detail"
          aria-label={t('md3.actions.detailLabel')}
        >
          {selectedRun === null ? (
            <Md3EmptyState
              icon="play_circle"
              message={t('md3.actions.noRunSelected')}
            />
          ) : (
            <>
              <header className="md3-actions-detail-header">
                <MaterialSymbol
                  name={md3ActionsStatusIcon(selectedRun.status)}
                  size={17}
                  className={classNames(statusTone(selectedRun.status).on, {
                    'md3-actions-spin': selectedRun.status === 'running',
                  })}
                />
                <h2 className="md3-actions-detail-header__title">
                  {formatMd3RunHeading(selectedRun)}
                </h2>
                <Md3TonalButton
                  icon="refresh"
                  label={t('md3.actions.rerun')}
                  accessibleName={t('md3.actions.rerunRun', {
                    name: selectedRun.name,
                  })}
                  disabled={selectedRun.busy === true}
                  onClick={props.onRerunSelectedRun}
                />
                <Md3TonalButton
                  icon="error"
                  label={t('md3.actions.rerunFailed')}
                  accessibleName={t('md3.actions.rerunFailedFor', {
                    name: selectedRun.name,
                  })}
                  disabled={
                    selectedRun.busy === true || !selectedRun.hasFailedJobs
                  }
                  onClick={props.onRerunFailedJobs}
                />
                <Md3IconButton
                  icon="more_vert"
                  label={t('md3.actions.paneMenu')}
                  hasPopup="menu"
                  onClick={props.onOpenPaneMenu}
                />
              </header>

              <div
                className="md3-actions-run-toolbar"
                role="group"
                aria-label={t('md3.actions.runToolbar')}
              >
                {props.attempts === null ||
                props.attempts.options.length < 2 ? null : (
                  <div className="md3-actions-filter md3-actions-filter--inline">
                    <label htmlFor="md3-actions-attempt">
                      {t('md3.actions.attempt')}
                    </label>
                    <select
                      id="md3-actions-attempt"
                      value={String(props.attempts.selected)}
                      onChange={changeAttempt}
                    >
                      {props.attempts.options.map(attempt => (
                        <option key={attempt} value={String(attempt)}>
                          {attempt === props.attempts?.latest
                            ? t('md3.actions.attemptLatest', {
                                attempt: String(attempt),
                              })
                            : t('md3.actions.attemptOption', {
                                attempt: String(attempt),
                              })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedRun.cancellable ? (
                  <Md3GhostButton
                    icon="cancel"
                    label={t('md3.actions.cancelRun')}
                    hasPopup="dialog"
                    disabled={selectedRun.busy === true}
                    onClick={props.onCancelSelectedRun}
                  />
                ) : null}
                {props.onFixCiLocally === undefined ? null : (
                  <Md3GhostButton
                    icon="handyman"
                    label={t('md3.actions.fixCiLocally')}
                    tooltip={t('md3.actions.fixCiLocallyHint')}
                    onClick={props.onFixCiLocally}
                  />
                )}
                {props.onOpenArtifacts === undefined ? null : (
                  <Md3GhostButton
                    icon="inventory_2"
                    label={t('md3.actions.artifacts')}
                    onClick={props.onOpenArtifacts}
                  />
                )}
                {props.onOpenRunOnGitHub === undefined ? null : (
                  <Md3GhostButton
                    icon="open_in_new"
                    label={t('md3.actions.openOnGitHub')}
                    onClick={props.onOpenRunOnGitHub}
                  />
                )}
              </div>

              <div
                className="md3-actions-steps"
                role="group"
                aria-label={t('md3.actions.jobList')}
                aria-busy={props.jobsLoading}
              >
                {props.jobsLoading && props.jobs.length === 0 ? (
                  <p className="md3-actions-steps__message" role="status">
                    {t('md3.actions.jobsLoading')}
                  </p>
                ) : null}
                {props.jobsError === null ? null : (
                  <p className="md3-actions-steps__message" role="alert">
                    {props.jobsError.message}
                  </p>
                )}
                {props.jobs.map(job => (
                  <Md3JobBlock
                    key={job.id}
                    job={job}
                    selectedStepId={props.selectedStepId}
                    rovingStepId={rovingStepId}
                    onSelectStep={props.onSelectStep}
                    onRerunJob={props.onRerunJob}
                    onOpenJobOnGitHub={props.onOpenJobOnGitHub}
                  />
                ))}
                {props.jobsTruncated ? (
                  <p className="md3-actions-steps__message" role="status">
                    {t('md3.actions.jobsTruncated')}
                  </p>
                ) : null}
                {props.jobsHasMore || props.jobsError !== null ? (
                  <div className="md3-actions-steps__actions">
                    {props.jobsHasMore ? (
                      <Md3GhostButton
                        icon="expand_more"
                        label={
                          props.jobsLoadingMore
                            ? t('md3.actions.loadingMore')
                            : t('md3.actions.loadMoreJobs')
                        }
                        disabled={props.jobsLoading || props.jobsLoadingMore}
                        onClick={props.onLoadMoreJobs}
                      />
                    ) : null}
                    <Md3GhostButton
                      icon="autorenew"
                      label={t('md3.actions.reloadJobs')}
                      disabled={props.jobsLoading}
                      onClick={props.onReloadJobs}
                    />
                  </div>
                ) : null}
              </div>

              <Md3SearchField
                id="md3-actions-log-search"
                fieldLabel={t('md3.actions.logFieldLabel')}
                placeholder={t('md3.actions.logPlaceholder')}
                value={logSearch.value}
                regexEnabled={logSearch.regexEnabled}
                matchCount={logLines.length}
                onChange={logSearch.onChange}
                onClear={logSearch.onClear}
                onToggleRegex={logSearch.onToggleRegex}
                onOpenBuilder={logSearch.onOpenBuilder}
              />
              {logSearch.error ? (
                <p className="md3-actions-query-error" role="alert">
                  {logSearch.error}
                </p>
              ) : null}

              <Md3LogViewer
                lines={logLines}
                loading={props.logLoading}
                error={props.logError}
                onRetry={props.onRetryLog}
                onOpenOnGitHub={props.onOpenRunOnGitHub}
                filtered={logQuery.length > 0}
              />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
