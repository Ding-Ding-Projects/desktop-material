import * as React from 'react'
import classNames from 'classnames'

import { tFunny } from '../../lib/funny-level-text'
import { t } from '../../lib/i18n'
import { MaterialSymbol } from '../lib/material-symbol'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import { createObservableRef } from '../lib/observable-ref'
import {
  Md3Chip,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
  Md3GroupHeader,
  Md3IconButton,
  Md3SearchField,
} from './md3-primitives'
import { formatAddDelete, initials, isGroupStart } from './md3-style-contract'
import {
  IMd3DiffFileTab,
  IMd3DiffPaneProps,
  Md3DiffPane,
} from './md3-diff-pane'
import {
  IMd3BulkAction,
  Md3BulkBar,
  md3BulkExportMenuSpec,
} from './md3-bulk-bar'
import {
  IMd3ListExport,
  IMd3ListExportColumn,
  Md3ListExportFormat,
  serializeMd3ListExport,
} from './md3-list-export'
import {
  md3ApplySelection,
  md3BulkPartitionSummary,
  md3BulkScope,
  md3BulkScopeLabel,
  md3InvertSelection,
  md3PartitionBulk,
  md3SelectionIntent,
  md3ToggleSelectAll,
} from './md3-list-selection'
import { Md3MenuOverlay } from './md3-menu-overlay'
import { Md3DestructiveGate } from './md3-destructive-gate'
import { notify } from './md3-toast'

/**
 * The History destination of `design/History MD3.dc.html` — the
 * `<sc-if value="{{ isHistory }}">` branch and everything `renderVals()`
 * computes for it.
 *
 * Two panes. The left one filters and lists commits, grouped by day; the right
 * one is the shared `Md3DiffPane` wearing its `details` toggle, with the commit
 * detail sheet riding over the diff on the contract's `sheetOpen` branch.
 *
 * Every measurement lives in `app/styles/ui/_md3-history-view.scss`, and the
 * diff pane's in `_md3-diff-pane.scss`. What lives here is the behaviour the
 * contract's logic block describes, plus the parts a design prototype does not
 * have to think about and a shipped surface does:
 *
 *  - the commit list is a real grid with roving focus, so a keyboard user
 *    moves through commits with the arrow keys rather than tabbing through
 *    three controls per row, and the pin and overflow buttons of the focused
 *    row are the only ones in the tab order;
 *  - selection is a real multi-selection — click, Ctrl-click, Shift-click and
 *    Shift+Arrow — because the surface this replaces has one and nothing in
 *    the rewrite may take a capability away;
 *  - the detail sheet is a real dialog: it traps focus, closes on Escape, and
 *    hands focus back to whatever opened it;
 *  - the contract's `title` hints are rendered through the repository's own
 *    `Tooltip` (by way of `Md3IconButton`), because a `title` attribute is
 *    unreachable by keyboard.
 *
 * This component owns no application state. Everything it renders arrives as
 * props and every change leaves through a callback, so the same view can be
 * driven by the app store, by a test, or by `md3-history-view-fixtures.ts`.
 */

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** The four filter chips of the contract's `historyChips` state. */
export type Md3HistoryFilterId = 'unpushed' | 'tagged' | 'mine' | 'merges'

/**
 * How a commit's signature and merge state read on the row's detail line.
 *
 * `unchecked` is the state the running application is actually in for an
 * ordinary commit: nothing in the history path runs `git verify-commit`, so no
 * signature has been examined. It is separate from `unverified` on purpose —
 * that word tells a reader the signature was looked at and did not hold up,
 * which is a claim of its own and just as unfounded as calling it verified.
 */
export type Md3CommitKind = 'merge' | 'verified' | 'unverified' | 'unchecked'

/** One commit in the left-hand list. */
export interface IMd3HistoryCommit {
  /**
   * The full SHA. It is the row key and the value every action is performed
   * against — revert, cherry-pick, copy, open on the forge — so it must never
   * be shortened here. `shortSha` is what the interface renders.
   */
  readonly sha: string

  /**
   * The abbreviated SHA the byline and the detail sheet show.
   *
   * This is a display value, not an identity. Rendering the full 40 characters
   * in the byline is what made the commit list unreadable: at monospace 11px it
   * consumes the entire 356px pane, squeezing the author and the relative time
   * out of sight and spilling under the tag pill beside it.
   */
  readonly shortSha: string

  /** The first line of the commit message. */
  readonly summary: string

  /** The rest of the commit message, shown in the detail sheet. */
  readonly body: string

  /** The author's display name; the avatar shows its initials. */
  readonly author: string

  /**
   * Whether `addedLineCount`, `deletedLineCount` and `changedFileCount` are
   * real. They are loaded per selected commit, so they are zero — not absent —
   * for every other row, and a zero that means "not known" must not render as
   * a zero that means "nothing changed".
   *
   * It stays false for the selected commit too until the changeset has
   * actually arrived, which is a window every selection passes through and the
   * state the detail sheet most often opens in. `md3HistoryChangeset` in
   * `md3-view-props.ts` is what decides it; nothing here may assume that a
   * selected row is a loaded one.
   */
  readonly statsLoaded: boolean

  /** "12 minutes ago" — used while `showAbsoluteDates` is off. */
  readonly relativeTime: string

  /** "10 Aug 2026, 09:41" — used while `showAbsoluteDates` is on. */
  readonly absoluteTime: string

  /** The uppercase group header this commit sits under, e.g. "Today". */
  readonly day: string

  /** The tag pill's text, or null for an untagged commit. */
  readonly tag: string | null

  /** Whether the commit has not reached the remote yet. */
  readonly unpushed: boolean

  /** Whether the signed-in user authored it — the "Mine" chip's predicate. */
  readonly isMine: boolean

  /** Whether the user has pinned it. */
  readonly pinned: boolean

  /**
   * How the third segment of the detail line reads: the contract's
   * `merge ? 'merge commit' : 'verified'`, plus `unverified` so a commit whose
   * signature did not check out is not described as one that did, and
   * `unchecked` — what the running application actually knows — for a commit
   * whose signature nothing has looked at.
   */
  readonly kind: Md3CommitKind

  readonly addedLineCount: number

  readonly deletedLineCount: number

  /** How many files the commit touched — the detail line's "N files". */
  readonly changedFileCount: number

  /** The branch the commit is on — the detail line's last segment. */
  readonly branchName: string
}

export interface IMd3HistoryViewProps {
  // -- the commit list ------------------------------------------------------

  /**
   * The commits to list, newest first, already ordered and grouped by the
   * shell. Filtering by the search field and by the chips happens here;
   * ordering, grouping and paging do not.
   */
  readonly commits: ReadonlyArray<IMd3HistoryCommit>

  /**
   * The selected commits. The first entry is the primary selection — the one
   * the diff pane and the detail sheet describe. Empty is a legitimate state.
   */
  readonly selectedShas: ReadonlyArray<string>

  readonly onSelectionChanged: (shas: ReadonlyArray<string>) => void

  readonly filterText: string

  readonly filterRegexEnabled: boolean

  readonly onFilterTextChanged: (value: string) => void

  readonly onFilterRegexToggled: () => void

  /** Open the anchored regex builder for the commit filter field. */
  readonly onOpenFilterRegexBuilder: (pattern: string) => void

  /** The commit filter's own context menu — the contract's `searchMenu`. */
  readonly onFilterContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>
  ) => void

  readonly activeFilters: ReadonlyArray<Md3HistoryFilterId>

  readonly onFiltersChanged: (
    filters: ReadonlyArray<Md3HistoryFilterId>
  ) => void

  /** The contract's `graph` toggle, also reachable from the list menu. */
  readonly showCommitGraph: boolean

  readonly onShowCommitGraphChanged: (value: boolean) => void

  /** The contract's `absoluteDates` toggle, also in the settings menu. */
  readonly showAbsoluteDates: boolean

  readonly onShowAbsoluteDatesChanged: (value: boolean) => void

  // -- the diff pane --------------------------------------------------------

  /**
   * Everything the shared diff pane needs. `action`, `fileMenuLabel` and
   * `children` are supplied by this view — the contract fixes History's second
   * toolbar control to the Details toggle and hangs the commit detail sheet
   * off the pane — so the shell cannot accidentally hand History the Changes
   * pane's "Include hunk" button.
   *
   * `fileTabs` doubles as the detail sheet's file list, so the two can never
   * disagree about which files the commit touched.
   */
  readonly diff: Omit<
    IMd3DiffPaneProps,
    'action' | 'fileMenuLabel' | 'children'
  >

  // -- the commit detail sheet ----------------------------------------------

  /** The contract's `sheetOpen`. */
  readonly detailsOpen: boolean

  readonly onDetailsOpenChanged: (open: boolean) => void

  // -- menus and commands ---------------------------------------------------

  /** The `sort` button: the contract's `listMenu`. */
  readonly onOpenListMenu: (event: React.SyntheticEvent) => void

  /**
   * The per-commit `rowMenu`: revert, cherry-pick, tag, reset, copy SHA, view
   * on GitHub, amend, undo, checkout, reorder, squash — everything the commit
   * context menu this view replaces offers. Raised by the row's `more_vert`
   * button, by right-clicking a row, and by the detail sheet's own `more_vert`.
   */
  readonly onOpenRowMenu: (sha: string, event: React.SyntheticEvent) => void

  /**
   * The `fileMenu` for one file of the commit, raised by right-clicking an
   * entry in the detail sheet's file list. The pane's own toolbar overflow
   * arrives through `diff.onOpenFileMenu`.
   */
  readonly onOpenFileMenu: (path: string, event: React.SyntheticEvent) => void

  // -- direct actions -------------------------------------------------------

  readonly onTogglePin: (sha: string) => void

  readonly onCopySha: (sha: string) => void

  readonly onViewOnGitHub: (sha: string) => void

  readonly onRevertCommit: (sha: string) => void

  /**
   * Begin dragging the current selection, so the shell can keep the existing
   * drag-a-commit-onto-a-branch cherry-pick gesture working. Omit it and the
   * rows are not draggable at all.
   */
  readonly onCommitDragStart?: (
    shas: ReadonlyArray<string>,
    event: React.DragEvent<HTMLElement>
  ) => void

  // -- bulk actions ---------------------------------------------------------

  /**
   * Receives a finished bulk export. Omit it and the export button is not
   * rendered at all, rather than offered and doing nothing.
   */
  readonly onExportCommits?: (
    payload: IMd3ListExport,
    commits: ReadonlyArray<IMd3HistoryCommit>
  ) => void

  /**
   * Copies text to the clipboard. `onCopySha` writes one SHA and would
   * overwrite itself once per commit in a batch, so a bulk copy needs a
   * handler that takes the whole block at once. Omit it and "Copy SHAs" is
   * not offered — a control that cannot work is not drawn.
   */
  readonly onCopyText?: (text: string) => void
}

/**
 * The export schema for a commit row.
 *
 * `body` is the only multiline field, so the picker warns about CSV, TSV and
 * the Markdown table and about nothing else — which is true because this
 * schema was checked against what the row actually holds, not assumed.
 */
export const Md3HistoryExportColumns: ReadonlyArray<IMd3ListExportColumn> = [
  { name: 'sha' },
  { name: 'shortSha' },
  { name: 'summary' },
  { name: 'body', multiline: true },
  { name: 'author' },
  { name: 'day' },
  { name: 'absoluteTime' },
  { name: 'relativeTime' },
  { name: 'branchName' },
  { name: 'kind' },
  { name: 'tag' },
  { name: 'unpushed' },
  { name: 'isMine' },
  { name: 'pinned' },
  { name: 'addedLineCount' },
  { name: 'deletedLineCount' },
  { name: 'changedFileCount' },
]

/**
 * Flatten one commit for export.
 *
 * The three counts stay empty rather than becoming `0` while `statsLoaded` is
 * false. They are loaded per selected commit, so for every other row a zero
 * in the file would read as "this commit changed nothing" — a confident claim
 * about a commit nothing has measured, and one the reader has no way to doubt.
 */
export function md3HistoryCommitExportRecord(
  commit: IMd3HistoryCommit
): Readonly<Record<string, string | number | boolean>> {
  return {
    sha: commit.sha,
    shortSha: commit.shortSha,
    summary: commit.summary,
    body: commit.body,
    author: commit.author,
    day: commit.day,
    absoluteTime: commit.absoluteTime,
    relativeTime: commit.relativeTime,
    branchName: commit.branchName,
    kind: commit.kind,
    tag: commit.tag ?? '',
    unpushed: commit.unpushed,
    isMine: commit.isMine,
    pinned: commit.pinned,
    addedLineCount: commit.statsLoaded ? commit.addedLineCount : '',
    deletedLineCount: commit.statsLoaded ? commit.deletedLineCount : '',
    changedFileCount: commit.statsLoaded ? commit.changedFileCount : '',
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type FilterChipKey =
  | 'md3.history.chip.unpushed'
  | 'md3.history.chip.tagged'
  | 'md3.history.chip.mine'
  | 'md3.history.chip.merges'

/** The chips, in the contract's order, paired with their localized labels. */
const FilterChips: ReadonlyArray<{
  readonly id: Md3HistoryFilterId
  readonly key: FilterChipKey
}> = [
  { id: 'unpushed', key: 'md3.history.chip.unpushed' },
  { id: 'tagged', key: 'md3.history.chip.tagged' },
  { id: 'mine', key: 'md3.history.chip.mine' },
  { id: 'merges', key: 'md3.history.chip.merges' },
]

/** How long the copied SHA shows `check` before flipping back. */
const CopiedFlipDuration = 1400

/** How far PageUp and PageDown move through the commit list. */
const PageStep = 10

/**
 * The contract's `matcher(key)`: a plain case-insensitive substring test, or a
 * case-insensitive regular expression when the field's regex mode is on.
 *
 * An invalid pattern matches everything rather than nothing, exactly as the
 * contract's `catch` does — a half-typed expression must not blank the list out
 * from under someone who is still typing it.
 */
export function createMd3HistoryMatcher(
  query: string,
  regexEnabled: boolean
): (value: string) => boolean {
  const raw = query.trim()

  if (raw.length === 0) {
    return () => true
  }

  if (regexEnabled) {
    let expression: RegExp

    try {
      expression = new RegExp(raw, 'i')
    } catch {
      return () => true
    }

    return value => expression.test(value)
  }

  const lowered = raw.toLowerCase()
  return value => value.toLowerCase().includes(lowered)
}

/**
 * The contract's `commitRows` filter: the query is tested against the summary,
 * the author and the SHA, and each active chip narrows further.
 */
export function filterMd3HistoryCommits(
  commits: ReadonlyArray<IMd3HistoryCommit>,
  matches: (value: string) => boolean,
  activeFilters: ReadonlyArray<Md3HistoryFilterId>
): ReadonlyArray<IMd3HistoryCommit> {
  return commits.filter(commit => {
    if (
      !(
        matches(commit.summary) ||
        matches(commit.author) ||
        matches(commit.sha)
      )
    ) {
      return false
    }

    if (activeFilters.includes('unpushed') && !commit.unpushed) {
      return false
    }

    if (activeFilters.includes('tagged') && commit.tag === null) {
      return false
    }

    if (activeFilters.includes('merges') && commit.kind !== 'merge') {
      return false
    }

    if (activeFilters.includes('mine') && !commit.isMine) {
      return false
    }

    return true
  })
}

function commitKindLabel(kind: Md3CommitKind): string {
  switch (kind) {
    case 'merge':
      return t('md3.history.kind.merge')
    case 'verified':
      return t('md3.history.kind.verified')
    case 'unverified':
      return t('md3.history.kind.unverified')
    case 'unchecked':
      return t('md3.history.kind.unchecked')
  }
}

/** The contract's commit-row detail line. */
export function formatMd3CommitDetail(commit: IMd3HistoryCommit): string {
  const kind = commitKindLabel(commit.kind)

  // The branch is the last segment, so an empty one leaves the line ending in a
  // dangling separator. It is empty for real: `currentBranchName` has nothing
  // to return on a detached HEAD or an unborn branch, and History still lists
  // commits in both states. Drop the segment rather than punctuating a gap.
  const branch = commit.branchName.trim()

  // The line counts only exist once a commit's changeset has been loaded, and
  // that happens for the selected commit alone. Rendering "+0 -0 - 0 files" for
  // every other row states that those commits changed nothing, which is a
  // confident lie about every commit in the list but one. Say nothing instead.
  if (!commit.statsLoaded) {
    return branch.length === 0
      ? t('md3.history.detailWithoutStatsOrBranch', { kind })
      : t('md3.history.detailWithoutStats', { kind, branch })
  }

  const stat = formatAddDelete(commit.addedLineCount, commit.deletedLineCount)
  const files = String(commit.changedFileCount)

  return branch.length === 0
    ? t('md3.history.detailWithoutBranch', { stat, files, kind })
    : t('md3.history.detail', { stat, files, kind, branch })
}

/**
 * Whether the commit list is being narrowed right now.
 *
 * The bulk bar's `filtered` decides whether select-all says "all 12 matching
 * these filters" or "all 12", and passing `false` while a chip is lit is the
 * one defect neither the component nor the user can detect. It lives here as a
 * function so the claim can be tested rather than read.
 */
export function md3HistoryFiltersActive(
  filterText: string,
  activeFilters: ReadonlyArray<Md3HistoryFilterId>
): boolean {
  return filterText.length > 0 || activeFilters.length > 0
}

/**
 * Split a bulk revert into the commits it will revert and the merges it will
 * not.
 *
 * `git revert` refuses a merge commit without being told which parent to keep,
 * and this surface has nowhere to ask, so the merges are named as skipped
 * before the gate opens rather than attempted and failed afterwards.
 */
export function md3HistoryRevertable(
  commits: ReadonlyArray<IMd3HistoryCommit>
) {
  return md3PartitionBulk(
    commits,
    commit => commit.kind !== 'merge',
    t('md3.history.bulkSkipMerge')
  )
}

/** Elements that can hold focus inside the detail sheet. */
const FocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusableWithin(panel: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FocusableSelector)
  ).filter(element => element.getClientRects().length > 0)
}

// ---------------------------------------------------------------------------
// One commit row
// ---------------------------------------------------------------------------

interface IMd3HistoryRowProps {
  readonly commit: IMd3HistoryCommit
  readonly selected: boolean
  readonly focused: boolean
  readonly showGraph: boolean
  readonly showAbsoluteDates: boolean
  readonly rowIndex: number
  readonly draggable: boolean

  /** Whether the bulk checkbox is ticked — separate from `selected`. */
  readonly checked: boolean

  /** The row's index within the visible list, which is what a range spans. */
  readonly selectIndex: number

  readonly onCheckboxPointer: (event: React.MouseEvent<HTMLInputElement>) => void
  readonly onCheckboxKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void
  readonly onCheckboxChange: (
    event: React.ChangeEvent<HTMLInputElement>
  ) => void

  readonly onActivate: (sha: string, event: React.MouseEvent) => void
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  readonly onOpenRowMenu: (sha: string, event: React.SyntheticEvent) => void
  readonly onTogglePin: (sha: string) => void
  readonly onDragStart: (
    sha: string,
    event: React.DragEvent<HTMLElement>
  ) => void
  readonly rowRef: (sha: string, element: HTMLDivElement | null) => void
}

const Md3HistoryRow = React.memo(function Md3HistoryRow(
  props: IMd3HistoryRowProps
) {
  const {
    commit,
    selected,
    focused,
    draggable,
    onActivate,
    onOpenRowMenu,
    onTogglePin,
    onDragStart,
    rowRef,
  } = props

  const setRef = React.useCallback(
    (element: HTMLDivElement | null) => rowRef(commit.sha, element),
    [rowRef, commit.sha]
  )

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => onActivate(commit.sha, event),
    [onActivate, commit.sha]
  )

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onOpenRowMenu(commit.sha, event)
    },
    [onOpenRowMenu, commit.sha]
  )

  const onMenuClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onOpenRowMenu(commit.sha, event)
    },
    [onOpenRowMenu, commit.sha]
  )

  const onPinClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onTogglePin(commit.sha)
    },
    [onTogglePin, commit.sha]
  )

  const onRowDragStart = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => onDragStart(commit.sha, event),
    [onDragStart, commit.sha]
  )

  const time = props.showAbsoluteDates
    ? commit.absoluteTime
    : commit.relativeTime

  // Only the focused row's own controls are tab stops; the grid itself is the
  // single stop that gets a keyboard user into and back out of the list.
  const tabIndex = focused ? 0 : -1

  return (
    <div
      ref={setRef}
      role="row"
      aria-rowindex={props.rowIndex}
      aria-selected={selected}
      data-sha={commit.sha}
      tabIndex={tabIndex}
      draggable={draggable}
      className={classNames('md3-row', 'md3-history__row', {
        'md3-row--active': selected,
        'md3-row--spined': props.showGraph,
      })}
      onClick={onClick}
      onKeyDown={props.onKeyDown}
      onContextMenu={onContextMenu}
      onDragStart={draggable ? onRowDragStart : undefined}
    >
      <div role="gridcell" className="md3-history__select-cell">
        <input
          type="checkbox"
          className="md3-bulk-bar__checkbox"
          data-row-index={props.selectIndex}
          checked={props.checked}
          aria-label={t('md3.history.row.select', { summary: commit.summary })}
          /*
           * `-1` because the row is the tab stop: a history of four hundred
           * commits would otherwise cost four hundred Tabs to cross. The
           * keyboard reaches the box through Ctrl+Space on the row itself.
           */
          tabIndex={-1}
          onMouseDown={props.onCheckboxPointer}
          onClick={props.onCheckboxPointer}
          onKeyDown={props.onCheckboxKeyDown}
          onChange={props.onCheckboxChange}
        />
      </div>

      <div role="gridcell" className="md3-history__row-cell">
        {props.showGraph ? (
          <span
            aria-hidden={true}
            className={classNames('md3-history__spine', {
              'md3-history__spine--selected': selected,
              'md3-history__spine--unpushed': !selected && commit.unpushed,
            })}
          />
        ) : null}

        <span
          aria-hidden={true}
          className={classNames('md3-history__avatar', {
            'md3-history__avatar--selected': selected,
          })}
        >
          {initials(commit.author)}
        </span>

        <span className="md3-history__row-text">
          <span
            className={classNames('md3-row__name', {
              'md3-row__name--active': selected,
            })}
          >
            {commit.summary}
          </span>
          <span className="md3-history__byline">
            <span className="md3-history__byline-text">
              {t('md3.history.byline', { author: commit.author, time })}
            </span>
            <span className="md3-history__sha">{commit.shortSha}</span>
          </span>
          <span className="md3-row__detail md3-row__detail--inline">
            {formatMd3CommitDetail(commit)}
          </span>
        </span>

        {commit.tag === null ? null : (
          <span className="md3-history__tag">
            <MaterialSymbol name="sell" size={12} />
            <span>{commit.tag}</span>
          </span>
        )}

        {commit.unpushed ? (
          <span
            role="img"
            aria-label={t('md3.history.notPushed')}
            className="md3-history__unpushed"
          >
            <MaterialSymbol name="arrow_upward" size={12} />
          </span>
        ) : null}

        <Md3IconButton
          small={true}
          icon="push_pin"
          tabIndex={tabIndex}
          pressed={commit.pinned}
          className={classNames('md3-history__pin', {
            'md3-history__pin--on': commit.pinned,
          })}
          label={commit.pinned ? t('md3.history.unpin') : t('md3.history.pin')}
          onClick={onPinClick}
        />

        <Md3IconButton
          small={true}
          icon="more_vert"
          tabIndex={tabIndex}
          hasPopup="menu"
          label={t('md3.history.rowMenu', { sha: commit.sha })}
          tooltip={t('md3.history.rowMenuHint')}
          onClick={onMenuClick}
        />
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// The commit detail sheet
// ---------------------------------------------------------------------------

interface IMd3CommitDetailSheetProps {
  readonly commit: IMd3HistoryCommit
  readonly files: ReadonlyArray<IMd3DiffFileTab>
  readonly activeFilePath: string | undefined
  readonly showAbsoluteDates: boolean
  readonly onSelectFile: ((path: string) => void) | undefined
  readonly onClose: () => void
  readonly onCopySha: (sha: string) => void
  readonly onViewOnGitHub: (sha: string) => void
  readonly onRevertCommit: (sha: string) => void
  readonly onOpenRowMenu: (sha: string, event: React.SyntheticEvent) => void
  readonly onOpenFileMenu: (path: string, event: React.SyntheticEvent) => void
}

/**
 * The contract's `sheetOpen` block: a right-anchored sheet over the diff pane,
 * behind a scrim that fills the pane rather than the window.
 *
 * It is a real dialog rather than a decorated panel — focus enters it, cannot
 * leave it by Tab, Escape closes it, and closing returns focus to whatever
 * opened it. Mount it only while it is open; it takes focus on mount.
 */
function Md3CommitDetailSheet(props: IMd3CommitDetailSheetProps) {
  const {
    commit,
    files,
    onClose,
    onCopySha,
    onViewOnGitHub,
    onRevertCommit,
    onOpenRowMenu,
  } = props

  const panelRef = React.useRef<HTMLDivElement>(null)
  const closeRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const titleId = React.useMemo(() => createUniqueId('md3-commit-sheet'), [])

  React.useEffect(() => () => releaseUniqueId(titleId), [titleId])

  const [copied, setCopied] = React.useState(false)

  // The contract flips the SHA chip's glyph to `check` for 1400ms after a copy.
  React.useEffect(() => {
    if (!copied) {
      return
    }

    const timer = window.setTimeout(() => setCopied(false), CopiedFlipDuration)
    return () => window.clearTimeout(timer)
  }, [copied])

  // A different commit's SHA has not been copied, whatever the last one's
  // state was.
  React.useEffect(() => {
    setCopied(false)
  }, [commit.sha])

  // Take focus on open and give it back on close. Without the second half a
  // keyboard user is returned to the top of the document every time the sheet
  // closes, which is nowhere near the Details button they pressed.
  React.useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus()
      }
    }
  }, [closeRef])

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const panel = panelRef.current

      if (panel === null) {
        return
      }

      const focusable = focusableWithin(panel)

      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = panel.contains(active)

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!inside || active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  const onScrimClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only the scrim itself closes the sheet; a click that started inside the
      // panel and bubbled up here must not close it out from under the user.
      if (event.target === event.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  const onCopyClick = React.useCallback(() => {
    onCopySha(commit.sha)
    setCopied(true)
  }, [onCopySha, commit.sha])

  const onGitHubClick = React.useCallback(
    () => onViewOnGitHub(commit.sha),
    [onViewOnGitHub, commit.sha]
  )

  const onRevertClick = React.useCallback(
    () => onRevertCommit(commit.sha),
    [onRevertCommit, commit.sha]
  )

  const onMenuClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) =>
      onOpenRowMenu(commit.sha, event),
    [onOpenRowMenu, commit.sha]
  )

  const time = props.showAbsoluteDates
    ? commit.absoluteTime
    : commit.relativeTime

  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- the
       scrim's click is a pointer shortcut for the close button and Escape,
       both of which are present and both of which are keyboard reachable. */
    <div
      className="md3-history__sheet-scrim md3-anim-fade"
      onClick={onScrimClick}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={true}
        aria-labelledby={titleId}
        className="md3-history__sheet md3-anim-sheet"
      >
        <div className="md3-history__sheet-header">
          <span aria-hidden={true} className="md3-history__sheet-avatar">
            {initials(commit.author)}
          </span>
          <span className="md3-history__sheet-heading">
            <span id={titleId} className="md3-history__sheet-summary">
              {commit.summary}
            </span>
            <span className="md3-history__sheet-byline">
              {t('md3.history.sheet.byline', { author: commit.author, time })}
            </span>
          </span>
          <Md3IconButton
            small={true}
            icon="close"
            iconSize={16}
            buttonRef={closeRef}
            label={t('md3.history.sheet.close')}
            onClick={onClose}
          />
        </div>

        <div className="md3-history__sheet-stats">
          <button
            type="button"
            className="md3-history__sheet-sha"
            aria-label={t('md3.history.sheet.copySha', { sha: commit.sha })}
            onClick={onCopyClick}
          >
            <span>{commit.sha}</span>
            <MaterialSymbol
              name={copied ? 'check' : 'content_copy'}
              size={13}
            />
          </button>
          {/* The three numbers arrive with the commit's changeset, one `git
              log --numstat` after the row is selected. Until then they are not
              zero, they are unknown — and the sheet is the surface where that
              matters most, because it opens on the selected commit at exactly
              the moment the read is still in flight. "+0 −0 · 0 files" there
              reads as a finished answer about a commit that plainly changed
              something. Say the count is still being taken instead. */}
          {commit.statsLoaded ? (
            <>
              <span className="md3-history__sheet-pill md3-history__sheet-pill--add">
                {`+${commit.addedLineCount}`}
              </span>
              <span className="md3-history__sheet-pill md3-history__sheet-pill--del">
                {`−${commit.deletedLineCount}`}
              </span>
              <span className="md3-history__sheet-pill md3-history__sheet-pill--files">
                {t('md3.history.sheet.fileCount', {
                  count: String(files.length),
                })}
              </span>
            </>
          ) : (
            <span className="md3-history__sheet-pill md3-history__sheet-pill--pending">
              {t('md3.history.sheet.statsPending')}
            </span>
          )}
        </div>

        {commit.body.length === 0 ? null : (
          <div className="md3-history__sheet-body">{commit.body}</div>
        )}

        <div
          role="list"
          aria-label={t('md3.history.sheet.fileListLabel')}
          className="md3-history__sheet-files"
        >
          {files.map(file => (
            <Md3SheetFileRow
              key={file.path}
              file={file}
              active={file.path === props.activeFilePath}
              onSelect={props.onSelectFile}
              onOpenFileMenu={props.onOpenFileMenu}
            />
          ))}
        </div>

        <div className="md3-history__sheet-footer">
          <button
            type="button"
            className="md3-history__sheet-primary"
            onClick={onGitHubClick}
          >
            <MaterialSymbol name="open_in_new" size={15} />
            <span>{t('md3.history.sheet.viewOnGitHub')}</span>
          </button>
          <button
            type="button"
            className="md3-history__sheet-action"
            aria-label={t('md3.history.sheet.revert')}
            onClick={onRevertClick}
          >
            <MaterialSymbol name="undo" size={16} />
          </button>
          <button
            type="button"
            className="md3-history__sheet-action"
            aria-haspopup="menu"
            aria-label={t('md3.history.sheet.menu')}
            onClick={onMenuClick}
          >
            <MaterialSymbol name="more_vert" size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

interface IMd3SheetFileRowProps {
  readonly file: IMd3DiffFileTab
  readonly active: boolean
  readonly onSelect: ((path: string) => void) | undefined
  readonly onOpenFileMenu: (path: string, event: React.SyntheticEvent) => void
}

function Md3SheetFileRow(props: IMd3SheetFileRowProps) {
  const { file, onSelect, onOpenFileMenu } = props

  // A commit's changeset carries the commit's line totals and no per-file
  // split, so the counts beside a path are frequently unknown rather than
  // zero. Rendering "+0 −0" there says the file changed nothing, next to a
  // path the user is about to open and watch change — omit the pair instead,
  // and keep the accessible name free of the same claim.
  const stated =
    file.addedLineCount !== undefined && file.deletedLineCount !== undefined

  const onClick = React.useCallback(
    () => onSelect?.(file.path),
    [onSelect, file.path]
  )

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onOpenFileMenu(file.path, event)
    },
    [onOpenFileMenu, file.path]
  )

  return (
    <div role="listitem" className="md3-history__sheet-file-item">
      <button
        type="button"
        className={classNames('md3-history__sheet-file', {
          'md3-history__sheet-file--active': props.active,
        })}
        aria-current={props.active}
        aria-label={
          stated
            ? t('md3.history.sheet.fileEntry', {
                path: file.path,
                stat: formatAddDelete(
                  file.addedLineCount ?? 0,
                  file.deletedLineCount ?? 0
                ),
              })
            : t('md3.history.sheet.fileEntryWithoutStats', { path: file.path })
        }
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <MaterialSymbol
          name={file.kind === 'new' ? 'add_circle' : 'edit_square'}
          size={14}
          className={classNames('md3-history__file-icon', {
            'md3-history__file-icon--new': file.kind === 'new',
          })}
        />
        <span className="md3-history__sheet-file-path">{file.path}</span>
        {stated ? (
          <>
            <span className="md3-history__sheet-file-add">
              {`+${file.addedLineCount}`}
            </span>
            <span className="md3-history__sheet-file-del">
              {`−${file.deletedLineCount}`}
            </span>
          </>
        ) : null}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function Md3HistoryView(props: IMd3HistoryViewProps) {
  const {
    commits,
    selectedShas,
    onSelectionChanged,
    filterText,
    filterRegexEnabled,
    onFilterTextChanged,
    onFilterRegexToggled,
    onOpenFilterRegexBuilder,
    activeFilters,
    onFiltersChanged,
    showCommitGraph,
    onShowCommitGraphChanged,
    showAbsoluteDates,
    onShowAbsoluteDatesChanged,
    diff,
    detailsOpen,
    onDetailsOpenChanged,
    onOpenRowMenu,
    onOpenFileMenu,
    onCommitDragStart,
    onExportCommits,
    onCopyText,
    onTogglePin,
    onViewOnGitHub,
    onRevertCommit,
  } = props

  // -- filtering ------------------------------------------------------------

  const commitMatches = React.useMemo(
    () => createMd3HistoryMatcher(filterText, filterRegexEnabled),
    [filterText, filterRegexEnabled]
  )

  const visibleCommits = React.useMemo(
    () => filterMd3HistoryCommits(commits, commitMatches, activeFilters),
    [commits, commitMatches, activeFilters]
  )

  const primaryCommit = React.useMemo(() => {
    const sha = selectedShas[0]
    return sha === undefined
      ? undefined
      : commits.find(commit => commit.sha === sha)
  }, [commits, selectedShas])

  // -- selection and roving focus ------------------------------------------

  const [focusedSha, setFocusedSha] = React.useState<string | null>(null)
  const anchorSha = React.useRef<string | null>(null)
  const rowElements = React.useRef(new Map<string, HTMLDivElement>())
  const pendingFocus = React.useRef<string | null>(null)

  const registerRow = React.useCallback(
    (sha: string, element: HTMLDivElement | null) => {
      if (element === null) {
        rowElements.current.delete(sha)
      } else {
        rowElements.current.set(sha, element)
      }
    },
    []
  )

  // The row that owns the tab stop has to exist. When a filter removes it, fall
  // back to the selection and then to the first visible row, rather than
  // leaving the list with no way in from the keyboard at all.
  const effectiveFocusedSha = React.useMemo(() => {
    const shas = visibleCommits.map(commit => commit.sha)

    if (focusedSha !== null && shas.includes(focusedSha)) {
      return focusedSha
    }

    return selectedShas.find(sha => shas.includes(sha)) ?? shas[0] ?? null
  }, [visibleCommits, focusedSha, selectedShas])

  React.useLayoutEffect(() => {
    const sha = pendingFocus.current

    if (sha === null) {
      return
    }

    pendingFocus.current = null
    const element = rowElements.current.get(sha)
    element?.focus()
    element?.scrollIntoView({ block: 'nearest' })
  })

  const moveFocus = React.useCallback(
    (sha: string, extendSelection: boolean, keepSelection: boolean) => {
      setFocusedSha(sha)
      pendingFocus.current = sha

      if (keepSelection) {
        return
      }

      if (extendSelection) {
        const shas = visibleCommits.map(commit => commit.sha)
        const anchor = anchorSha.current ?? sha
        const from = shas.indexOf(anchor)
        const to = shas.indexOf(sha)

        if (from !== -1 && to !== -1) {
          const [start, end] = from <= to ? [from, to] : [to, from]
          const range = shas.slice(start, end + 1)
          // The anchor stays first, and therefore stays the primary selection,
          // so the diff pane does not jump about while a range is extended.
          onSelectionChanged(from <= to ? range : [...range].reverse())
          return
        }
      }

      anchorSha.current = sha
      onSelectionChanged([sha])
    },
    [visibleCommits, onSelectionChanged]
  )

  const onRowActivate = React.useCallback(
    (sha: string, event: React.MouseEvent) => {
      setFocusedSha(sha)

      if (event.shiftKey) {
        moveFocus(sha, true, false)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        anchorSha.current = sha
        onSelectionChanged(
          selectedShas.includes(sha)
            ? selectedShas.filter(existing => existing !== sha)
            : [...selectedShas, sha]
        )
        return
      }

      anchorSha.current = sha
      onSelectionChanged([sha])
    },
    [moveFocus, onSelectionChanged, selectedShas]
  )

  const onListKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const shas = visibleCommits.map(commit => commit.sha)

      if (shas.length === 0) {
        return
      }

      const current =
        effectiveFocusedSha === null ? -1 : shas.indexOf(effectiveFocusedSha)

      let next = -1

      switch (event.key) {
        case 'ArrowDown':
          next = Math.min(shas.length - 1, current + 1)
          break
        case 'ArrowUp':
          next = Math.max(0, current - 1)
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = shas.length - 1
          break
        case 'PageDown':
          next = Math.min(shas.length - 1, current + PageStep)
          break
        case 'PageUp':
          next = Math.max(0, current - PageStep)
          break
        case 'Enter':
        case ' ':
          // Only when the row itself has focus. Inside it sit the pin toggle
          // and the overflow button, and both are activated by exactly these
          // two keys — swallowing them here would leave a keyboard user with a
          // pin button that cannot be pressed.
          if (
            effectiveFocusedSha !== null &&
            event.target === event.currentTarget
          ) {
            event.preventDefault()
            anchorSha.current = effectiveFocusedSha
            onSelectionChanged([effectiveFocusedSha])
          }
          return
        default:
          return
      }

      event.preventDefault()

      if (next === -1 || next === current) {
        return
      }

      moveFocus(shas[next], event.shiftKey, event.ctrlKey || event.metaKey)
    },
    [visibleCommits, effectiveFocusedSha, moveFocus, onSelectionChanged]
  )

  const onRowDragStart = React.useCallback(
    (sha: string, event: React.DragEvent<HTMLElement>) => {
      onCommitDragStart?.(
        selectedShas.includes(sha) ? selectedShas : [sha],
        event
      )
    },
    [onCommitDragStart, selectedShas]
  )

  // -- bulk selection -------------------------------------------------------

  /*
   * The bulk selection is the view's own, and separate from `selectedShas` —
   * that one drives what the diff pane and the detail sheet are looking at,
   * and a bulk selection of nine commits has no single answer to that
   * question. Keeping them apart is what lets a user tick nine rows without
   * the pane behind them loading nine changesets.
   */
  const [checked, setChecked] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const anchorIndex = React.useRef<number | null>(null)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [gateOpen, setGateOpen] = React.useState(false)
  const revertButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const bulkExportButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  /** The ids the bar and every range span: after the query AND the chips. */
  const visibleShas = React.useMemo(
    () => visibleCommits.map(commit => commit.sha),
    [visibleCommits]
  )

  // A commit that leaves the list — filtered out, or gone from the log — must
  // leave the selection with it. A bulk verb running against a SHA the list no
  // longer holds is the quiet way a "revert 9" reverts 8 and reports 9.
  React.useEffect(() => {
    setChecked(previous => {
      const next = new Set<string>()
      for (const sha of visibleShas) {
        if (previous.has(sha)) {
          next.add(sha)
        }
      }
      return next.size === previous.size ? previous : next
    })
  }, [visibleShas])

  const filtersActive = md3HistoryFiltersActive(filterText, activeFilters)

  const toggleChecked = React.useCallback(
    (index: number, shiftKey: boolean) => {
      const intent = md3SelectionIntent({
        shiftKey,
        // A checkbox click is always additive: the box is the whole gesture,
        // so a plain click must never replace the rest of the selection.
        ctrlKey: true,
        metaKey: false,
      })
      setChecked(previous => {
        const result = md3ApplySelection(
          visibleShas,
          previous,
          index,
          intent,
          anchorIndex.current,
          // These rows carry checkboxes, so a Shift range adds to the ticks
          // already there. `replace` here would silently shrink a selection a
          // user was growing.
          'extend'
        )
        if (intent !== 'range') {
          anchorIndex.current = result.anchor
        }
        return new Set(result.ids)
      })
    },
    [visibleShas]
  )

  const onToggleSelectAll = React.useCallback(() => {
    setChecked(previous => new Set(md3ToggleSelectAll(visibleShas, previous)))
    anchorIndex.current = null
  }, [visibleShas])

  const onInvertSelection = React.useCallback(() => {
    setChecked(previous => new Set(md3InvertSelection(visibleShas, previous)))
    anchorIndex.current = null
  }, [visibleShas])

  const onClearSelection = React.useCallback(() => {
    setChecked(new Set<string>())
    anchorIndex.current = null
  }, [])

  /** What a bulk verb runs over: the ticked rows, or the whole filtered list. */
  const scopeCommits = React.useMemo(
    () => md3BulkScope(visibleCommits, checked, commit => commit.sha),
    [visibleCommits, checked]
  )

  const scopeLabel = md3BulkScopeLabel(
    checked.size,
    visibleCommits.length,
    filtersActive
  )

  /*
   * `git revert` refuses a merge commit without being told which parent to
   * keep, and this surface has nowhere to ask. So the merges are partitioned
   * out by name rather than attempted and failed one toast at a time: the
   * button's count, the gate's preview and the toast afterwards all describe
   * the same set.
   */
  const revertable = React.useMemo(
    () => md3HistoryRevertable(scopeCommits),
    [scopeCommits]
  )

  const onBulkPin = React.useCallback(() => {
    for (const commit of scopeCommits) {
      onTogglePin(commit.sha)
    }
  }, [onTogglePin, scopeCommits])

  const onBulkCopyShas = React.useCallback(() => {
    if (onCopyText === undefined) {
      return
    }
    onCopyText(scopeCommits.map(commit => commit.sha).join('\n'))
  }, [onCopyText, scopeCommits])

  const onBulkViewOnGitHub = React.useCallback(() => {
    for (const commit of scopeCommits) {
      onViewOnGitHub(commit.sha)
    }
  }, [onViewOnGitHub, scopeCommits])

  const onRequestBulkRevert = React.useCallback(() => setGateOpen(true), [])

  const onConfirmBulkRevert = React.useCallback(() => {
    setGateOpen(false)
    for (const commit of revertable.applied) {
      onRevertCommit(commit.sha)
    }
    const skipped = md3BulkPartitionSummary(revertable)
    if (skipped !== null) {
      notify(skipped, { kind: 'warning' })
    }
    onClearSelection()
  }, [onRevertCommit, revertable, onClearSelection])

  const runExport = React.useCallback(
    (format: Md3ListExportFormat) => {
      if (onExportCommits === undefined) {
        return
      }
      const payload = serializeMd3ListExport(
        scopeCommits.map(md3HistoryCommitExportRecord),
        {
          columns: Md3HistoryExportColumns,
          collectionName: 'commits',
          recordName: 'commit',
          title: 'Commits',
          baseName: 'commits',
        },
        format,
        { scope: scopeLabel }
      )
      setExportOpen(false)
      onExportCommits(payload, scopeCommits)
      notify(
        payload.loss === null
          ? t('md3.bulk.toast.exported', {
              count: String(payload.count),
              format: payload.format.toUpperCase(),
            })
          : t('md3.bulk.toast.exportedLossy', {
              count: String(payload.count),
              format: payload.format.toUpperCase(),
              loss: payload.loss,
            })
      )
    },
    [onExportCommits, scopeCommits, scopeLabel]
  )

  const exportMenuSpec = React.useMemo(
    () => md3BulkExportMenuSpec(Md3HistoryExportColumns, scopeLabel, runExport),
    [scopeLabel, runExport]
  )

  const bulkActions = React.useMemo((): ReadonlyArray<IMd3BulkAction> => {
    const actions: Array<IMd3BulkAction> = [
      {
        id: 'pin',
        label: t('md3.history.bulkPin'),
        icon: 'push_pin',
        disabled: scopeCommits.length === 0,
        onClick: onBulkPin,
      },
    ]
    if (onCopyText !== undefined) {
      actions.push({
        id: 'copyShas',
        label: t('md3.history.bulkCopyShas'),
        icon: 'content_copy',
        disabled: scopeCommits.length === 0,
        onClick: onBulkCopyShas,
      })
    }
    actions.push({
      id: 'viewOnGitHub',
      label: t('md3.history.bulkViewOnGitHub'),
      icon: 'open_in_new',
      disabled: scopeCommits.length === 0,
      onClick: onBulkViewOnGitHub,
    })
    actions.push({
      id: 'revert',
      label: t('md3.history.bulkRevert'),
      icon: 'undo',
      destructive: true,
      hasPopup: 'dialog',
      buttonRef: revertButtonRef,
      disabled: revertable.applied.length === 0,
      onClick: onRequestBulkRevert,
    })
    return actions
  }, [
    onCopyText,
    scopeCommits,
    revertable,
    onBulkPin,
    onBulkCopyShas,
    onBulkViewOnGitHub,
    onRequestBulkRevert,
    revertButtonRef,
  ])

  /*
   * A checkbox's `change` event is a plain `Event` with no modifier state, so
   * Shift has to be captured from the gesture that produced it. The click and
   * the keyboard both land here first; `change` then reads what they left.
   * Reading `nativeEvent.shiftKey` off the change event instead compiles, and
   * is `undefined` every time — a range that silently never ranges.
   */
  const shiftHeld = React.useRef(false)

  const onCheckboxPointer = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      shiftHeld.current = event.shiftKey
      // Ticking a box must not also move the primary selection under the diff
      // pane; the row's own click handler is what does that.
      event.stopPropagation()
    },
    []
  )

  const onCheckboxKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      shiftHeld.current = event.shiftKey
    },
    []
  )

  const onCheckboxChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const index = Number(event.currentTarget.dataset.rowIndex ?? '-1')
      if (index >= 0) {
        toggleChecked(index, shiftHeld.current)
      }
      shiftHeld.current = false
    },
    [toggleChecked]
  )

  /**
   * The row's own keyboard route into the bulk selection.
   *
   * Ctrl+Space ticks the focused row and Ctrl+Shift+Space extends the range,
   * matching what a click and a Shift-click do to the checkbox with a pointer.
   * Everything else falls through to the grid's existing navigation, so plain
   * Space still selects the commit exactly as it did before.
   */
  const onRowKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
        const index = visibleShas.indexOf(
          event.currentTarget.dataset.sha ?? ''
        )
        if (index !== -1) {
          event.preventDefault()
          toggleChecked(index, event.shiftKey)
          return
        }
      }
      onListKeyDown(event)
    },
    [visibleShas, toggleChecked, onListKeyDown]
  )

  // -- chips and toggles ----------------------------------------------------

  const onToggleFilter = React.useCallback(
    (id: Md3HistoryFilterId) => {
      onFiltersChanged(
        activeFilters.includes(id)
          ? activeFilters.filter(existing => existing !== id)
          : [...activeFilters, id]
      )
    },
    [activeFilters, onFiltersChanged]
  )

  const onResetFilters = React.useCallback(() => {
    onFiltersChanged([])
    onFilterTextChanged('')
  }, [onFiltersChanged, onFilterTextChanged])

  const onToggleGraph = React.useCallback(
    () => onShowCommitGraphChanged(!showCommitGraph),
    [onShowCommitGraphChanged, showCommitGraph]
  )

  const onToggleDates = React.useCallback(
    () => onShowAbsoluteDatesChanged(!showAbsoluteDates),
    [onShowAbsoluteDatesChanged, showAbsoluteDates]
  )

  const onClearFilterText = React.useCallback(
    () => onFilterTextChanged(''),
    [onFilterTextChanged]
  )

  const onOpenBuilder = React.useCallback(
    () => onOpenFilterRegexBuilder(filterText),
    [onOpenFilterRegexBuilder, filterText]
  )

  // -- the detail sheet -----------------------------------------------------

  const onToggleDetails = React.useCallback(
    () => onDetailsOpenChanged(!detailsOpen),
    [onDetailsOpenChanged, detailsOpen]
  )

  const onCloseDetails = React.useCallback(
    () => onDetailsOpenChanged(false),
    [onDetailsOpenChanged]
  )

  const sheetOpen = detailsOpen && primaryCommit !== undefined

  // -- render ---------------------------------------------------------------

  let rowIndex = 0
  let previousDay: string | undefined

  return (
    <div className="md3-history md3-anim-up">
      <div className="md3-history__list-pane">
        <Md3SearchField
          id="md3-history-filter"
          searchSurfaceId="md3-history"
          value={filterText}
          placeholder={t('md3.history.filterPlaceholder')}
          fieldLabel={t('md3.history.fieldLabel')}
          regexEnabled={filterRegexEnabled}
          onChange={onFilterTextChanged}
          onClear={onClearFilterText}
          onToggleRegex={onFilterRegexToggled}
          onOpenBuilder={onOpenBuilder}
          onContextMenu={props.onFilterContextMenu}
        />

        <Md3ChipRow label={t('md3.history.chipRowLabel')}>
          {FilterChips.map(chip => (
            <Md3HistoryFilterChip
              key={chip.id}
              id={chip.id}
              label={t(chip.key)}
              active={activeFilters.includes(chip.id)}
              onToggle={onToggleFilter}
            />
          ))}
          <Md3ChipRowSpacer />
          <Md3IconButton
            small={true}
            icon="account_tree"
            label={t('md3.history.toggleGraph')}
            active={showCommitGraph}
            pressed={showCommitGraph}
            onClick={onToggleGraph}
          />
          <Md3IconButton
            small={true}
            icon="schedule"
            label={t('md3.history.toggleDates')}
            active={showAbsoluteDates}
            pressed={showAbsoluteDates}
            onClick={onToggleDates}
          />
          <Md3IconButton
            small={true}
            icon="sort"
            hasPopup="menu"
            label={t('md3.history.sortAndGroup')}
            onClick={props.onOpenListMenu}
          />
        </Md3ChipRow>

        <Md3BulkBar
          listId="history"
          label={t('md3.history.bulkLabel')}
          visibleIds={visibleShas}
          selected={checked}
          filtered={filtersActive}
          scopeLabel={scopeLabel}
          actions={bulkActions}
          onToggleSelectAll={onToggleSelectAll}
          onInvertSelection={onInvertSelection}
          onClearSelection={onClearSelection}
          onExport={onExportCommits === undefined ? undefined : runExport}
          exportColumns={Md3HistoryExportColumns}
          onOpenExport={
            onExportCommits === undefined
              ? undefined
              : () => setExportOpen(true)
          }
          exportButtonRef={bulkExportButtonRef}
        />

        <div className="md3-history__list-scroller">
          <div
            role="grid"
            aria-label={t('md3.history.listLabel')}
            aria-multiselectable={true}
            aria-rowcount={visibleCommits.length}
            className="md3-history__list"
          >
            {visibleCommits.map((commit, selectIndex) => {
              const header = isGroupStart(previousDay, commit.day)
              previousDay = commit.day
              rowIndex += 1

              return (
                <React.Fragment key={commit.sha}>
                  {header ? (
                    <div role="row" className="md3-history__group-row">
                      <div role="gridcell">
                        <Md3GroupHeader label={commit.day} />
                      </div>
                    </div>
                  ) : null}
                  <Md3HistoryRow
                    commit={commit}
                    rowIndex={rowIndex}
                    selected={selectedShas.includes(commit.sha)}
                    focused={commit.sha === effectiveFocusedSha}
                    showGraph={showCommitGraph}
                    showAbsoluteDates={showAbsoluteDates}
                    draggable={onCommitDragStart !== undefined}
                    checked={checked.has(commit.sha)}
                    selectIndex={selectIndex}
                    onCheckboxPointer={onCheckboxPointer}
                    onCheckboxKeyDown={onCheckboxKeyDown}
                    onCheckboxChange={onCheckboxChange}
                    onActivate={onRowActivate}
                    onKeyDown={onRowKeyDown}
                    onOpenRowMenu={onOpenRowMenu}
                    onTogglePin={props.onTogglePin}
                    onDragStart={onRowDragStart}
                    rowRef={registerRow}
                  />
                </React.Fragment>
              )
            })}
          </div>

          {visibleCommits.length === 0 ? (
            <Md3EmptyState
              message={tFunny('md3.history.empty')}
              onAction={onResetFilters}
            />
          ) : null}
        </div>
      </div>

      <Md3DiffPane
        {...diff}
        fileMenuLabel={t('md3.history.fileMenu')}
        action={{
          kind: 'details',
          expanded: sheetOpen,
          onToggle: onToggleDetails,
        }}
      >
        {sheetOpen && primaryCommit !== undefined ? (
          <Md3CommitDetailSheet
            commit={primaryCommit}
            files={diff.fileTabs ?? []}
            activeFilePath={diff.activeFileTabPath}
            showAbsoluteDates={showAbsoluteDates}
            onSelectFile={diff.onSelectFileTab}
            onClose={onCloseDetails}
            onCopySha={props.onCopySha}
            onViewOnGitHub={props.onViewOnGitHub}
            onRevertCommit={props.onRevertCommit}
            onOpenRowMenu={onOpenRowMenu}
            onOpenFileMenu={onOpenFileMenu}
          />
        ) : null}
      </Md3DiffPane>

      {exportOpen ? (
        <Md3MenuOverlay
          spec={exportMenuSpec}
          onDismiss={() => setExportOpen(false)}
          onOpenRegexBuilder={onOpenFilterRegexBuilder}
          returnFocusTo={bulkExportButtonRef}
        />
      ) : null}

      {gateOpen ? (
        <Md3DestructiveGate
          actionId="history-bulk-revert"
          icon="undo"
          title={t('md3.history.gate.title', {
            count: String(revertable.applied.length),
          })}
          summary={t('md3.history.gate.summary', {
            count: String(revertable.applied.length),
            scope: scopeLabel,
          })}
          /*
           * "Revert 9 commits" is a number, and a number is not something a
           * person can check. The summaries are, and the skipped merges are
           * named beside them so the count in the title and the work the
           * button does are the same set.
           */
          preview={revertable.applied.map(
            commit => `${commit.shortSha} ${commit.summary}`
          )}
          previewExcluded={revertable.excluded.map(
            commit => `${commit.shortSha} ${commit.summary}`
          )}
          previewExcludedReason={revertable.reason}
          irreversible={t('md3.history.gate.irreversible')}
          targetKeyLabel={t('md3.history.gate.keyTarget', {
            count: String(revertable.applied.length),
            scope: scopeLabel,
          })}
          effectKeyLabel={t('md3.history.gate.keyEffect')}
          confirmLabel={t('md3.history.gate.confirm', {
            count: String(revertable.applied.length),
          })}
          anchorTo={revertButtonRef}
          onConfirm={onConfirmBulkRevert}
          onDismissed={() => setGateOpen(false)}
        />
      ) : null}
    </div>
  )
}

interface IMd3HistoryFilterChipProps {
  readonly id: Md3HistoryFilterId
  readonly label: string
  readonly active: boolean
  readonly onToggle: (id: Md3HistoryFilterId) => void
}

/**
 * `Md3Chip` reports its own visible label back on toggle; the view needs the
 * stable id instead, because the label is localized and changes with the
 * language mode.
 */
function Md3HistoryFilterChip(props: IMd3HistoryFilterChipProps) {
  const { id, onToggle } = props
  const onChipToggle = React.useCallback(() => onToggle(id), [onToggle, id])

  return (
    <Md3Chip
      label={props.label}
      active={props.active}
      onToggle={onChipToggle}
    />
  )
}
