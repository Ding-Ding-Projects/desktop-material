import * as React from 'react'
import classNames from 'classnames'

import { t } from '../../lib/i18n'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import {
  Md3Chip,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3EmptyState,
  Md3GroupHeader,
  Md3IconButton,
  Md3SearchField,
  Md3TonalButton,
} from './md3-primitives'
import { isGroupStart, runIcon, statusTone } from './md3-style-contract'
import type {
  BulkRepositoryItemStatus,
  IBulkRepositoryItem,
  IBulkRepositoryProgress,
} from '../../lib/automation/bulk-repository-runner'
import type { RepositoryBulkOperation } from '../repositories-list/repository-bulk-actions'
import type { RepositorySyncSummaryKind } from '../repositories-list/repository-sync-summary'
import {
  clearBulkSelection,
  dedupeRepositoryIds,
  enterBulkSelection,
  exitBulkSelection,
  IRepositoryBulkSelection,
  isAllVisibleSelected,
  isSomeVisibleSelected,
  setVisibleSelection,
  toggleRepositorySelection,
} from '../repositories-list/repository-bulk-selection'

/**
 * The Repositories destination of the MD3 shell rewrite — the
 * `<sc-if value="{{ isRepositories }}">` branch of
 * `design/History MD3.dc.html` (markup lines 655–700) and the `repositories`,
 * `repoChips`, `repoRows`, `repoEmptyStyle`, `cloneRepos`, `addLocalRepo` and
 * `pullAll` values its `renderVals()` computes (lines 2058–2098).
 *
 * The contract draws a single full-width pane: a search field, a chip row that
 * ends in three tonal buttons, and an org-grouped repository list whose rows
 * carry a language pill, a changes pill, an Open action and a row menu.
 *
 * Everything beyond that drawing is the surface this replaces, which the
 * rewrite may not lose:
 *
 *  - multi-select with click, shift-click, ctrl/cmd-click and a keyboard
 *    equivalent, an honestly-scoped select-all, an inverse selection, and the
 *    bulk fetch / pull / open / pin / unpin / assign-group / remove-group /
 *    export / remove-from-list operations;
 *  - a determinate, cancellable run with per-repository results, so a batch can
 *    never claim more than it did;
 *  - a two-key-and-slider destructive gate in front of removal, listing exactly
 *    which repositories go;
 *  - the row's full context menu — pin, hide, alias, group name, worktrees,
 *    copy name and path, open in a new window, view on GitHub, fork, transfer,
 *    open in the shell, reveal, open in the external editor, remove — which the
 *    host still supplies, reached from this view through `onOpenRowMenu` and
 *    the row's own context-menu gesture.
 *
 * This component owns no state beyond focus, the group-name draft and the
 * removal gate's own two keys. Every list, filter and selection value arrives
 * as a read-only prop, and every change leaves through a callback.
 */

/** The glyph beside a repository row. The contract's `iconStyle` is 17px. */
const RowGlyphSize = 17

/** The pills, the open action and the small controls all take 15px glyphs. */
const SmallGlyphSize = 15

/** The status glyph in a run's per-repository result row. */
const ResultGlyphSize = 14

/** The id of the search input, so a host can focus or teleport to it. */
export const Md3RepositoriesSearchInputId = 'md3-repositories-search'

/**
 * How far the removal slider must travel before the action is authorized.
 * The gate is deliberately a full-range slide, not a click.
 */
const RemovalAuthorized = 100

/**
 * The sync state a row reports, reusing the repository list's own honest
 * vocabulary so `unknown` stays distinct from a known zero: a repository we
 * have never inspected must not be allowed to claim it is up to date.
 */
export interface IMd3RepositorySync {
  readonly kind: RepositorySyncSummaryKind

  /** Commits ready to push, or `null` when no count is known. */
  readonly ahead: number | null

  /** Commits waiting at the remote, or `null` when no count is known. */
  readonly behind: number | null
}

/** One repository, in the shape this view renders. */
export interface IMd3RepositoryRow {
  /** The repository's own id, as the app stores it. */
  readonly id: number

  /** The display name — the alias when the user set one, else the name. */
  readonly name: string

  /** A stable key for the group, used for React keys and header breaks. */
  readonly groupKey: string

  /** The group's visible name: an org, an enterprise host, or "Other". */
  readonly groupLabel: string

  /** The working directory, as the contract's meta line shows it. */
  readonly path: string

  /**
   * How long ago the repository was last fetched, already humanised — "12m
   * ago", "yesterday". Empty when it has never been fetched, which the meta
   * line then says outright rather than leaving blank.
   */
  readonly lastFetched: string

  /** The primary language. Empty when nothing has been detected. */
  readonly language: string

  /** The checkout's size on disk, or `null` when it has not been measured. */
  readonly sizeInMegabytes: number | null

  /** The checked-out branch, or `null` when there is none. */
  readonly branchName: string | null

  readonly sync: IMd3RepositorySync

  /** How many remotes the repository has. */
  readonly remoteCount: number

  /**
   * Working-directory changes, or `null` when the repository has never been
   * inspected — which reads as "not inspected", never as "clean".
   */
  readonly changedFilesCount: number | null

  /** Whether this is the repository the rest of the app is looking at. */
  readonly isCurrent: boolean

  readonly isPinned: boolean

  readonly isHidden: boolean

  /** The working directory is gone from disk. */
  readonly isMissing: boolean
}

/** The bulk operations this view offers, in the order it renders them. */
export type Md3RepositoryBulkOperation =
  | RepositoryBulkOperation
  | 'open-selected'
  | 'export-selected'

/**
 * A running batch — "Pull all" or a bulk operation over the selection.
 *
 * `operation` is `'pull-all'` for the chip row's Pull all, and otherwise the
 * bulk operation that started it.
 */
export interface IMd3RepositoryRun {
  readonly operation: Md3RepositoryBulkOperation | 'pull-all'

  /**
   * What is running, already localized — "Pulling 9 repositories". This is the
   * string the pane header's progress bar is named with, so it must describe
   * the operation rather than merely saying that something is happening.
   */
  readonly label: string

  readonly progress: IBulkRepositoryProgress

  /** A cancel has been asked for; the repository in flight still finishes. */
  readonly cancelRequested: boolean
}

/** The four counts a finished run reports. Nothing is folded away. */
export interface IMd3RepositoryRunTotals {
  readonly done: number
  readonly failed: number
  readonly skipped: number
  /** Repositories the cancel stopped from ever starting. */
  readonly remaining: number
  readonly total: number
}

export interface IMd3RepositoriesViewProps {
  /** Every repository the app knows about, already grouped and ordered. */
  readonly repositories: ReadonlyArray<IMd3RepositoryRow>

  readonly searchValue: string

  readonly regexEnabled: boolean

  /** The chips currently switched on, by label. */
  readonly activeChips: ReadonlyArray<string>

  /** The row painted as selected. */
  readonly selectedRepositoryId: number | null

  readonly selection: IRepositoryBulkSelection

  /** Existing group names, offered as completions by the group field. */
  readonly groupNames: ReadonlyArray<string>

  /** The batch in flight, or the finished one still being read. */
  readonly run: IMd3RepositoryRun | null

  /** A localized one-line result from an instant bulk operation. */
  readonly notice: string | null

  /**
   * The repositories a removal is waiting on, or `null` when nothing is. The
   * gate lists every one of them before it will authorize anything.
   */
  readonly removalCandidates: ReadonlyArray<IBulkRepositoryItem> | null

  readonly onSearchChange: (value: string) => void

  readonly onClearSearch: () => void

  readonly onToggleRegex: () => void

  /** Opens the anchored regex builder seeded with the current query. */
  readonly onOpenRegexBuilder: () => void

  readonly onToggleChip: (label: string) => void

  readonly onResetFilters: () => void

  readonly onClone: () => void

  readonly onAddLocal: () => void

  /** Starts the long-running pull over every repository the filter shows. */
  readonly onPullAll: (repositoryIds: ReadonlyArray<number>) => void

  readonly onSelectRepository: (id: number) => void

  readonly onOpenRepository: (id: number) => void

  /** Opens the repository's own menu — the full action list, not a subset. */
  readonly onOpenRowMenu: (id: number) => void

  /** The row's context-menu gesture, so the host can show the same menu. */
  readonly onRowContextMenu?: (
    id: number,
    event: React.MouseEvent<HTMLElement>
  ) => void

  readonly onSelectionChanged: (selection: IRepositoryBulkSelection) => void

  readonly onBulkOperation: (
    operation: Md3RepositoryBulkOperation,
    groupName: string
  ) => void

  readonly onCancelRun: () => void

  readonly onDismissRun: () => void

  readonly onConfirmRemoval: () => void

  readonly onCancelRemoval: () => void

  readonly onDismissNotice?: () => void

  readonly className?: string
}

// ---------------------------------------------------------------------------
// Pure derivations — exported so they can be proven without a DOM
// ---------------------------------------------------------------------------

/** The contract's fourth chip: "Has changes", beside the group chips. */
export function md3HasChangesChipLabel(): string {
  return t('md3.repositories.hasChanges')
}

/**
 * The chips the contract's `repoChips` holds: one per repository group, in
 * first-seen order, then "Has changes".
 *
 * The contract's own sample lists `material`, `studio-nord` and `personal`
 * because those are the orgs in its fixture; the chips are the real groups, not
 * those three strings.
 */
export function md3RepositoryGroupChips(
  rows: ReadonlyArray<IMd3RepositoryRow>
): ReadonlyArray<string> {
  const seen = new Set<string>()
  const labels: Array<string> = []
  const hasChanges = md3HasChangesChipLabel()

  for (const row of rows) {
    if (row.groupLabel.length === 0 || seen.has(row.groupLabel)) {
      continue
    }
    seen.add(row.groupLabel)
    // A group that happens to be named exactly like the "Has changes" chip
    // would otherwise produce two chips that toggle one another's state.
    if (row.groupLabel !== hasChanges) {
      labels.push(row.groupLabel)
    }
  }

  return labels
}

export interface IMd3RepositoryFilterResult {
  readonly rows: ReadonlyArray<IMd3RepositoryRow>

  /**
   * The regex the user typed does not compile. The contract's `matcher()`
   * returns "everything matches" in that case rather than emptying the list,
   * and this view says so above the list instead of leaving the user to guess.
   */
  readonly patternInvalid: boolean
}

/** Whether a row has uncommitted work. `null` counts are never "clean". */
export function md3RepositoryIsDirty(row: IMd3RepositoryRow): boolean {
  return row.changedFilesCount !== null && row.changedFilesCount > 0
}

/**
 * The contract's `visibleRepos`: the text matcher over name, group and
 * language, then the chips, which select by group OR by "has changes".
 */
export function filterMd3Repositories(
  rows: ReadonlyArray<IMd3RepositoryRow>,
  query: string,
  regexEnabled: boolean,
  activeChips: ReadonlyArray<string>
): IMd3RepositoryFilterResult {
  const trimmed = query.trim()
  let patternInvalid = false
  let matches: (value: string) => boolean = () => true

  if (trimmed.length > 0) {
    if (regexEnabled) {
      try {
        const expression = new RegExp(trimmed, 'i')
        matches = value => expression.test(value)
      } catch {
        patternInvalid = true
      }
    } else {
      const needle = trimmed.toLowerCase()
      matches = value => value.toLowerCase().includes(needle)
    }
  }

  const hasChanges = md3HasChangesChipLabel()
  const wantsChanged = activeChips.includes(hasChanges)
  const groupChips = activeChips.filter(chip => chip !== hasChanges)

  const filtered = rows.filter(row => {
    if (
      !(matches(row.name) || matches(row.groupLabel) || matches(row.language))
    ) {
      return false
    }

    if (activeChips.length === 0) {
      return true
    }

    return (
      groupChips.includes(row.groupLabel) ||
      (wantsChanged && md3RepositoryIsDirty(row))
    )
  })

  return { rows: filtered, patternInvalid }
}

/** The contract's meta line: `<path> · fetched <when>`. */
export function md3RepositoryMeta(row: IMd3RepositoryRow): string {
  return t('md3.repositories.meta', {
    path: row.path,
    when:
      row.lastFetched.length === 0
        ? t('md3.repositories.neverFetched')
        : row.lastFetched,
  })
}

/** The changes pill's text: "Clean", "1 change", "12 changes", or unknown. */
export function md3RepositoryChangesLabel(row: IMd3RepositoryRow): string {
  if (row.changedFilesCount === null) {
    return t('md3.repositories.changesUnknown')
  }
  if (row.changedFilesCount === 0) {
    return t('md3.repositories.clean')
  }
  if (row.changedFilesCount === 1) {
    return t('md3.repositories.changesOne')
  }
  return t('md3.repositories.changes', {
    count: String(row.changedFilesCount),
  })
}

function md3RepositorySizeLabel(row: IMd3RepositoryRow): string {
  const size = row.sizeInMegabytes
  if (size === null || !Number.isFinite(size)) {
    return t('md3.repositories.sizeUnknown')
  }
  const rounded = size >= 10 ? String(Math.round(size)) : size.toFixed(1)
  return t('md3.repositories.size', { size: rounded })
}

function md3RepositoryBranchLabel(row: IMd3RepositoryRow): string {
  switch (row.sync.kind) {
    case 'cloning':
      return t('md3.repositories.branchCloning')
    case 'missing':
      return t('md3.repositories.branchMissing')
    case 'detached':
      return t('md3.repositories.branchDetached')
    case 'empty':
      return t('md3.repositories.branchEmpty')
    default:
      break
  }

  const branch =
    row.branchName === null || row.branchName.length === 0
      ? t('md3.repositories.branchNone')
      : row.branchName

  switch (row.sync.kind) {
    case 'unknown':
      return t('md3.repositories.branchNotChecked', { branch })
    case 'no-upstream':
      return t('md3.repositories.branchNoUpstream', { branch })
    case 'in-sync':
      return t('md3.repositories.branchInSync', { branch })
    default:
      return t('md3.repositories.branchAheadBehind', {
        branch,
        ahead: String(row.sync.ahead ?? 0),
        behind: String(row.sync.behind ?? 0),
      })
  }
}

/**
 * The contract's detail line:
 * `<language> · <size> MB · <branch> ↑a ↓b|in sync · N remotes · <changes>`.
 */
export function md3RepositoryDetail(row: IMd3RepositoryRow): string {
  return t('md3.repositories.detail', {
    language:
      row.language.length === 0
        ? t('md3.repositories.languageUnknown')
        : row.language,
    size: md3RepositorySizeLabel(row),
    branch: md3RepositoryBranchLabel(row),
    remotes:
      row.remoteCount === 1
        ? t('md3.repositories.remotesOne')
        : t('md3.repositories.remotes', { count: String(row.remoteCount) }),
    // The contract lower-cases the changes word inside the detail line, while
    // the pill beside it keeps its capital.
    changes: md3RepositoryChangesLabel(row).toLocaleLowerCase(),
  })
}

/** The four counts a run reports, derived from its own per-repository items. */
export function md3RepositoryRunTotals(
  progress: IBulkRepositoryProgress
): IMd3RepositoryRunTotals {
  let done = 0
  let failed = 0
  let skipped = 0
  let remaining = 0

  for (const item of progress.items) {
    switch (item.status) {
      case 'done':
        done += 1
        break
      case 'failed':
        failed += 1
        break
      case 'skipped':
        skipped += 1
        break
      case 'cancelled':
        remaining += 1
        break
      default:
        break
    }
  }

  return { done, failed, skipped, remaining, total: progress.total }
}

/**
 * A run's completion as a percentage, for the pane header's progress bar.
 *
 * The host feeds `Md3PaneHeader`'s `progress` from this and its `progressLabel`
 * from `run.label`, so the pane header and this view can never disagree about
 * how far along a batch is.
 */
export function md3RepositoryRunPercent(
  progress: IBulkRepositoryProgress
): number {
  if (progress.total <= 0) {
    return 100
  }
  return Math.min(
    100,
    Math.max(0, Math.round((progress.completed / progress.total) * 100))
  )
}

/**
 * The honest end-of-run sentence: what succeeded, what failed, what was
 * skipped and what never ran. No count is omitted when it is zero, because a
 * missing line reads as "that did not happen" rather than "that was nothing".
 */
export function md3RepositoryRunSummary(
  progress: IBulkRepositoryProgress
): string {
  const totals = md3RepositoryRunTotals(progress)
  return t('md3.repositories.runSummary', {
    done: String(totals.done),
    total: String(totals.total),
    failed: String(totals.failed),
    skipped: String(totals.skipped),
    remaining: String(totals.remaining),
  })
}

function runStatusToneKey(status: BulkRepositoryItemStatus): string {
  switch (status) {
    case 'done':
      return 'success'
    case 'failed':
      return 'failed'
    case 'running':
      return 'running'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'info'
  }
}

function runStatusLabel(status: BulkRepositoryItemStatus): string {
  switch (status) {
    case 'queued':
      return t('md3.repositories.runStatusQueued')
    case 'running':
      return t('md3.repositories.runStatusRunning')
    case 'done':
      return t('md3.repositories.runStatusDone')
    case 'failed':
      return t('md3.repositories.runStatusFailed')
    case 'skipped':
      return t('md3.repositories.runStatusSkipped')
    case 'cancelled':
      return t('md3.repositories.runStatusCancelled')
  }
}

// ---------------------------------------------------------------------------
// The bulk operations
// ---------------------------------------------------------------------------

interface IMd3BulkActionDefinition {
  readonly operation: Md3RepositoryBulkOperation
  readonly icon: MaterialSymbolName
  readonly label: () => string
  /** Only enabled once the group field holds something. */
  readonly needsGroupName?: boolean
  readonly destructive?: boolean
}

/**
 * Every bulk action, in render order.
 *
 * The first seven are the operations the repository picker already ran, kept
 * under their existing ids so the host wires them to the same reviewed runner;
 * `open-selected` and `export-selected` are this view's additions.
 */
const Md3BulkActions: ReadonlyArray<IMd3BulkActionDefinition> = [
  {
    operation: 'fetch-selected',
    icon: 'sync',
    label: () => t('md3.repositories.bulkFetch'),
  },
  {
    operation: 'pull-selected',
    icon: 'arrow_downward',
    label: () => t('md3.repositories.bulkPull'),
  },
  {
    operation: 'open-selected',
    icon: 'open_in_new',
    label: () => t('md3.repositories.bulkOpen'),
  },
  {
    operation: 'favorite',
    icon: 'push_pin',
    label: () => t('md3.repositories.bulkFavorite'),
  },
  {
    operation: 'unfavorite',
    icon: 'push_pin',
    label: () => t('md3.repositories.bulkUnfavorite'),
  },
  {
    operation: 'assign-group',
    icon: 'folder',
    label: () => t('md3.repositories.bulkAssignGroup'),
    needsGroupName: true,
  },
  {
    operation: 'remove-group',
    icon: 'folder_open',
    label: () => t('md3.repositories.bulkRemoveGroup'),
  },
  {
    operation: 'export-selected',
    icon: 'description',
    label: () => t('md3.repositories.bulkExport'),
  },
  {
    operation: 'remove-from-list',
    icon: 'delete',
    label: () => t('md3.repositories.bulkRemove'),
    destructive: true,
  },
]

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

interface IMd3RepositoryRowProps {
  readonly row: IMd3RepositoryRow
  readonly active: boolean
  readonly checked: boolean
  readonly selectionActive: boolean
  readonly tabIndex: number
  readonly registerRow: (id: number, element: HTMLDivElement | null) => void
  readonly onRowClick: (
    id: number,
    event: React.MouseEvent<HTMLElement>
  ) => void
  readonly onRowKeyDown: (
    id: number,
    event: React.KeyboardEvent<HTMLElement>
  ) => void
  readonly onRowFocus: (id: number) => void
  readonly onCheckedChange: (id: number, checked: boolean) => void
  readonly onOpen: (id: number) => void
  readonly onOpenMenu: (id: number) => void
  readonly onContextMenu?: (
    id: number,
    event: React.MouseEvent<HTMLElement>
  ) => void
}

function Md3RepositoryRowView(props: IMd3RepositoryRowProps) {
  const {
    row,
    registerRow,
    onRowClick,
    onRowKeyDown,
    onRowFocus,
    onCheckedChange,
    onOpen,
    onOpenMenu,
    onContextMenu,
  } = props

  const setRef = React.useCallback(
    (element: HTMLDivElement | null) => registerRow(row.id, element),
    [registerRow, row.id]
  )
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => onRowClick(row.id, event),
    [onRowClick, row.id]
  )
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => onRowKeyDown(row.id, event),
    [onRowKeyDown, row.id]
  )
  const handleFocus = React.useCallback(
    () => onRowFocus(row.id),
    [onRowFocus, row.id]
  )
  const handleChecked = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onCheckedChange(row.id, event.currentTarget.checked),
    [onCheckedChange, row.id]
  )
  const handleOpen = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onOpen(row.id)
    },
    [onOpen, row.id]
  )
  const handleMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      onOpenMenu(row.id)
    },
    [onOpenMenu, row.id]
  )
  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (onContextMenu !== undefined) {
        onContextMenu(row.id, event)
      }
    },
    [onContextMenu, row.id]
  )

  const dirty = md3RepositoryIsDirty(row)
  const changes = md3RepositoryChangesLabel(row)
  const language =
    row.language.length === 0
      ? t('md3.repositories.languageUnknown')
      : row.language

  return (
    /*
     * A grid row rather than a list option: the row holds its own controls, and
     * an option that contains buttons is a shape assistive technology has no
     * sensible way to present. Arrow keys move between rows, ArrowLeft and
     * ArrowRight move between this row's controls, exactly as the ARIA grid
     * pattern asks.
     */
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
    <div
      ref={setRef}
      role="row"
      aria-selected={props.selectionActive ? props.checked : props.active}
      className={classNames('md3-row', 'md3-repositories-view__row', {
        'md3-row--active': props.active,
      })}
      tabIndex={props.tabIndex}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onContextMenu={handleContextMenu}
    >
      {props.selectionActive ? (
        <span role="gridcell">
          <input
            type="checkbox"
            className="md3-repositories-view__checkbox"
            data-md3-row-control="true"
            checked={props.checked}
            aria-label={t('md3.repositories.selectRow', { name: row.name })}
            onChange={handleChecked}
          />
        </span>
      ) : null}
      <span role="gridcell" className="md3-repositories-view__identity">
        <MaterialSymbol
          name={row.isCurrent ? 'check_circle' : 'book_2'}
          className={classNames('md3-repositories-view__row-icon', {
            'md3-repositories-view__row-icon--current': row.isCurrent,
          })}
          size={RowGlyphSize}
        />
        <span className="md3-repositories-view__column">
          <span className="md3-repositories-view__name-line">
            <span
              className={classNames('md3-row__name', {
                'md3-row__name--active': props.active,
              })}
            >
              {row.name}
            </span>
            {row.isPinned ? (
              <span className="md3-repositories-view__flag">
                {t('md3.repositories.pinnedFlag')}
              </span>
            ) : null}
            {row.isHidden ? (
              <span className="md3-repositories-view__flag">
                {t('md3.repositories.hiddenFlag')}
              </span>
            ) : null}
            {row.isMissing ? (
              <span className="md3-repositories-view__flag md3-repositories-view__flag--missing">
                {t('md3.repositories.missingFlag')}
              </span>
            ) : null}
          </span>
          <span className="md3-repositories-view__meta">
            {md3RepositoryMeta(row)}
          </span>
          <span className="md3-row__detail">{md3RepositoryDetail(row)}</span>
        </span>
      </span>
      <span role="gridcell">
        <span className="md3-repositories-view__pill">{language}</span>
      </span>
      <span role="gridcell">
        <span
          className={classNames(
            'md3-repositories-view__pill',
            'md3-repositories-view__pill--changes',
            { 'md3-repositories-view__pill--dirty': dirty }
          )}
        >
          {changes}
        </span>
      </span>
      <span role="gridcell">
        {row.isCurrent ? (
          /*
           * The contract paints the current repository's action transparent and
           * gives it `cursor: default`: it is a state readout, not a control, so
           * it is rendered as text rather than as a button that does nothing.
           */
          <span className="md3-repositories-view__current">
            {t('md3.repositories.current')}
          </span>
        ) : (
          <button
            type="button"
            className="md3-repositories-view__open"
            data-md3-row-control="true"
            aria-label={t('md3.repositories.openName', { name: row.name })}
            onClick={handleOpen}
          >
            {t('md3.repositories.open')}
          </button>
        )}
      </span>
      <span
        role="gridcell"
        className="md3-repositories-view__row-menu"
        data-md3-row-control-cell="true"
      >
        <Md3IconButton
          small={true}
          icon="more_vert"
          label={t('md3.repositories.rowMenu', { name: row.name })}
          tooltip={t('md3.repositories.rowMenuHint')}
          hasPopup="menu"
          className="md3-repositories-view__row-menu-button"
          onClick={handleMenu}
        />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The destructive removal gate
// ---------------------------------------------------------------------------

interface IMd3RemovalGateProps {
  readonly candidates: ReadonlyArray<IBulkRepositoryItem>
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/**
 * The two-key-and-slider gate in front of removing repositories from the list.
 *
 * Both keys are independent, the slider only moves once both are turned, and
 * the exact repositories are listed above it — a preview, not a count. Escape
 * and the emergency exit both leave without removing anything.
 */
function Md3RemovalGate(props: IMd3RemovalGateProps) {
  const { onConfirm, onCancel } = props
  const [listConfirmed, setListConfirmed] = React.useState(false)
  const [diskConfirmed, setDiskConfirmed] = React.useState(false)
  const [authorization, setAuthorization] = React.useState(0)
  const panelRef = React.useRef<HTMLDivElement>(null)

  const count = props.candidates.length
  const bothKeys = listConfirmed && diskConfirmed
  const authorized = bothKeys && authorization === RemovalAuthorized

  React.useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const onListChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setListConfirmed(event.currentTarget.checked)
      setAuthorization(0)
    },
    []
  )
  const onDiskChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDiskConfirmed(event.currentTarget.checked)
      setAuthorization(0)
    },
    []
  )
  const onSlide = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setAuthorization(Number(event.currentTarget.value))
    },
    []
  )
  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    },
    [onCancel]
  )
  const onConfirmClick = React.useCallback(() => {
    if (authorized) {
      onConfirm()
    }
  }, [authorized, onConfirm])

  const state = !bothKeys
    ? t('md3.repositories.removeStateLocked')
    : authorized
    ? t('md3.repositories.removeStateReady')
    : t('md3.repositories.removeStateMoving')

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */
    <div
      ref={panelRef}
      className="md3-repositories-view__removal"
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="md3-repositories-removal-title"
      aria-describedby="md3-repositories-removal-description md3-repositories-removal-state"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <span className="md3-repositories-view__removal-eyebrow">
        {t('md3.repositories.removeEyebrow')}
      </span>
      <strong
        id="md3-repositories-removal-title"
        className="md3-repositories-view__removal-title"
      >
        {count === 1
          ? t('md3.repositories.removeTitleOne')
          : t('md3.repositories.removeTitle', { count: String(count) })}
      </strong>
      <span
        id="md3-repositories-removal-description"
        className="md3-repositories-view__removal-body"
      >
        {t('md3.repositories.removeDescription')}
      </span>
      <ul
        className="md3-repositories-view__removal-list"
        aria-label={t('md3.repositories.removeListLabel')}
      >
        {props.candidates.map(candidate => (
          <li key={candidate.id}>{candidate.name}</li>
        ))}
      </ul>
      <fieldset className="md3-repositories-view__removal-keys">
        <legend>{t('md3.repositories.removeKeysLegend')}</legend>
        <label>
          <input
            type="checkbox"
            checked={listConfirmed}
            onChange={onListChange}
          />
          <span>{t('md3.repositories.removeKeyList')}</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={diskConfirmed}
            onChange={onDiskChange}
          />
          <span>
            {t('md3.repositories.removeKeyDisk', { count: String(count) })}
          </span>
        </label>
      </fieldset>
      <label className="md3-repositories-view__removal-slider">
        <span>
          {t('md3.repositories.removeSlider', {
            percent: String(authorization),
          })}
        </span>
        <input
          type="range"
          min={0}
          max={RemovalAuthorized}
          step={1}
          value={bothKeys ? authorization : 0}
          disabled={!bothKeys}
          aria-label={t('md3.repositories.removeSliderName')}
          aria-valuetext={t('md3.repositories.removeSliderValue', {
            percent: String(authorization),
          })}
          onChange={onSlide}
        />
      </label>
      <span
        id="md3-repositories-removal-state"
        className={classNames('md3-repositories-view__removal-state', {
          'md3-repositories-view__removal-state--ready': authorized,
        })}
        role="status"
      >
        {state}
      </span>
      <span className="md3-repositories-view__removal-actions">
        <button
          type="button"
          className="md3-ghost-button"
          onClick={props.onCancel}
        >
          <span>{t('md3.repositories.removeCancel')}</span>
        </button>
        <button
          type="button"
          className="md3-repositories-view__removal-confirm"
          disabled={!authorized}
          onClick={onConfirmClick}
        >
          <span>{t('md3.repositories.removeConfirm')}</span>
        </button>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/** The Repositories destination. */
export function Md3RepositoriesView(props: IMd3RepositoriesViewProps) {
  const {
    repositories,
    selection,
    onSelectionChanged,
    onSelectRepository,
    onOpenRepository,
    onOpenRowMenu,
    onBulkOperation,
    onPullAll,
  } = props

  const [focusedId, setFocusedId] = React.useState<number | null>(null)
  const [groupDraft, setGroupDraft] = React.useState('')
  const anchorId = React.useRef<number | null>(null)
  const rowElements = React.useRef(new Map<number, HTMLDivElement>())

  const filtered = React.useMemo(
    () =>
      filterMd3Repositories(
        repositories,
        props.searchValue,
        props.regexEnabled,
        props.activeChips
      ),
    [repositories, props.searchValue, props.regexEnabled, props.activeChips]
  )
  const visibleRows = filtered.rows
  const visibleIds = React.useMemo(
    () => dedupeRepositoryIds(visibleRows.map(row => row.id)),
    [visibleRows]
  )
  const groupChips = React.useMemo(
    () => md3RepositoryGroupChips(repositories),
    [repositories]
  )

  const running = props.run !== null && !props.run.progress.finished
  const selectionActive = selection.active
  const selectedCount = selection.selectedIds.size
  const allVisibleSelected = isAllVisibleSelected(selection, visibleIds)
  const someVisibleSelected = isSomeVisibleSelected(selection, visibleIds)

  // Drop the remembered focus when its row leaves the filter, so the tab stop
  // can never sit on a row that is no longer rendered.
  React.useEffect(() => {
    const live = new Set(visibleIds)
    for (const id of Array.from(rowElements.current.keys())) {
      if (!live.has(id)) {
        rowElements.current.delete(id)
      }
    }
    setFocusedId(current =>
      current !== null && live.has(current) ? current : null
    )
  }, [visibleIds])

  const rovingId =
    focusedId !== null && visibleIds.includes(focusedId)
      ? focusedId
      : props.selectedRepositoryId !== null &&
        visibleIds.includes(props.selectedRepositoryId)
      ? props.selectedRepositoryId
      : visibleIds.length > 0
      ? visibleIds[0]
      : null

  const registerRow = React.useCallback(
    (id: number, element: HTMLDivElement | null) => {
      if (element === null) {
        rowElements.current.delete(id)
      } else {
        rowElements.current.set(id, element)
      }
    },
    []
  )

  const focusRow = React.useCallback((id: number) => {
    setFocusedId(id)
    rowElements.current.get(id)?.focus()
  }, [])

  const selectRange = React.useCallback(
    (fromId: number, toId: number) => {
      const from = visibleIds.indexOf(fromId)
      const to = visibleIds.indexOf(toId)
      if (from === -1 || to === -1) {
        return
      }
      const range = visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1)
      const base = selection.active ? selection : enterBulkSelection()
      onSelectionChanged(setVisibleSelection(base, range, true))
    },
    [visibleIds, selection, onSelectionChanged]
  )

  const toggleRow = React.useCallback(
    (id: number, selected: boolean) => {
      const base = selection.active ? selection : enterBulkSelection()
      onSelectionChanged(toggleRepositorySelection(base, id, selected))
    },
    [selection, onSelectionChanged]
  )

  const onRowFocus = React.useCallback((id: number) => {
    setFocusedId(id)
  }, [])

  const onRowClick = React.useCallback(
    (id: number, event: React.MouseEvent<HTMLElement>) => {
      setFocusedId(id)

      if (event.shiftKey) {
        event.preventDefault()
        selectRange(anchorId.current ?? id, id)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        anchorId.current = id
        toggleRow(id, !selection.selectedIds.has(id))
        return
      }

      anchorId.current = id

      if (selection.active) {
        toggleRow(id, !selection.selectedIds.has(id))
        return
      }

      onSelectRepository(id)
    },
    [selection, selectRange, toggleRow, onSelectRepository]
  )

  const onCheckedChange = React.useCallback(
    (id: number, checked: boolean) => {
      anchorId.current = id
      toggleRow(id, checked)
    },
    [toggleRow]
  )

  const onRowKeyDown = React.useCallback(
    (id: number, event: React.KeyboardEvent<HTMLElement>) => {
      const index = visibleIds.indexOf(id)
      if (index === -1) {
        return
      }

      // Ctrl/Cmd+A selects exactly the rows the filter is showing — the count
      // the select-all control names, never every repository in the app.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        const base = selection.active ? selection : enterBulkSelection()
        onSelectionChanged(setVisibleSelection(base, visibleIds, true))
        return
      }

      const row = rowElements.current.get(id)
      const onRowItself = event.target === row

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          event.preventDefault()
          const next =
            event.key === 'ArrowDown'
              ? Math.min(index + 1, visibleIds.length - 1)
              : Math.max(index - 1, 0)
          const nextId = visibleIds[next]
          if (event.shiftKey) {
            selectRange(anchorId.current ?? id, nextId)
          } else {
            anchorId.current = nextId
          }
          focusRow(nextId)
          return
        }
        case 'Home':
        case 'End': {
          event.preventDefault()
          const target =
            event.key === 'Home'
              ? visibleIds[0]
              : visibleIds[visibleIds.length - 1]
          anchorId.current = target
          focusRow(target)
          return
        }
        case 'ArrowRight':
        case 'ArrowLeft': {
          if (row === undefined) {
            return
          }
          const stops: Array<HTMLElement> = [
            row,
            ...Array.from(
              row.querySelectorAll<HTMLElement>(
                '[data-md3-row-control="true"], [data-md3-row-control-cell="true"] button'
              )
            ),
          ]
          const current = stops.findIndex(
            stop => stop === event.target || stop.contains(event.target as Node)
          )
          if (current === -1) {
            return
          }
          const next =
            event.key === 'ArrowRight'
              ? Math.min(current + 1, stops.length - 1)
              : Math.max(current - 1, 0)
          event.preventDefault()
          stops[next].focus()
          return
        }
        case 'Enter': {
          if (!onRowItself) {
            return
          }
          event.preventDefault()
          onOpenRepository(id)
          return
        }
        case ' ': {
          if (!onRowItself) {
            return
          }
          event.preventDefault()
          anchorId.current = id
          toggleRow(id, !selection.selectedIds.has(id))
          return
        }
        default:
          return
      }
    },
    [
      visibleIds,
      selection,
      onSelectionChanged,
      selectRange,
      focusRow,
      onOpenRepository,
      toggleRow,
    ]
  )

  const onToggleSelectionMode = React.useCallback(() => {
    onSelectionChanged(
      selection.active ? exitBulkSelection() : enterBulkSelection()
    )
  }, [selection.active, onSelectionChanged])

  const onSelectAllChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const base = selection.active ? selection : enterBulkSelection()
      onSelectionChanged(
        setVisibleSelection(base, visibleIds, event.currentTarget.checked)
      )
    },
    [selection, visibleIds, onSelectionChanged]
  )

  const onInvertSelection = React.useCallback(() => {
    const base = selection.active ? selection : enterBulkSelection()
    const toSelect = visibleIds.filter(id => !base.selectedIds.has(id))
    const toClear = visibleIds.filter(id => base.selectedIds.has(id))
    onSelectionChanged(
      setVisibleSelection(
        setVisibleSelection(base, toClear, false),
        toSelect,
        true
      )
    )
  }, [selection, visibleIds, onSelectionChanged])

  const onClearSelection = React.useCallback(() => {
    onSelectionChanged(clearBulkSelection(selection))
  }, [selection, onSelectionChanged])

  const onExitSelection = React.useCallback(() => {
    onSelectionChanged(exitBulkSelection())
  }, [onSelectionChanged])

  const onGroupDraftChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setGroupDraft(event.currentTarget.value)
    },
    []
  )

  const onBulkClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const operation = event.currentTarget.value as Md3RepositoryBulkOperation
      onBulkOperation(operation, groupDraft.trim())
    },
    [onBulkOperation, groupDraft]
  )

  const onPullAllClick = React.useCallback(() => {
    onPullAll(visibleIds)
  }, [onPullAll, visibleIds])

  const selectAllRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (selectAllRef.current !== null) {
      selectAllRef.current.indeterminate =
        someVisibleSelected && !allVisibleSelected
    }
  }, [someVisibleSelected, allVisibleSelected])

  const renderRows = () => {
    const nodes: Array<React.ReactNode> = []
    let previousGroup: string | undefined
    let group: Array<React.ReactNode> = []
    let groupKey = ''
    let groupLabel = ''

    const flush = () => {
      if (group.length === 0) {
        return
      }
      const headerId = `md3-repositories-group-${groupKey}`
      nodes.push(
        <div key={`header-${groupKey}`} role="presentation">
          <Md3GroupHeader id={headerId} label={groupLabel} />
        </div>,
        <div
          key={`group-${groupKey}`}
          role="rowgroup"
          aria-labelledby={headerId}
        >
          {group}
        </div>
      )
      group = []
    }

    visibleRows.forEach((row, index) => {
      if (isGroupStart(previousGroup, row.groupKey)) {
        flush()
        groupKey = row.groupKey
        groupLabel = row.groupLabel
      }
      previousGroup = row.groupKey

      group.push(
        <Md3RepositoryRowView
          key={row.id}
          row={row}
          active={row.id === props.selectedRepositoryId}
          checked={selection.selectedIds.has(row.id)}
          selectionActive={selectionActive}
          tabIndex={row.id === rovingId ? 0 : -1}
          registerRow={registerRow}
          onRowClick={onRowClick}
          onRowKeyDown={onRowKeyDown}
          onRowFocus={onRowFocus}
          onCheckedChange={onCheckedChange}
          onOpen={onOpenRepository}
          onOpenMenu={onOpenRowMenu}
          onContextMenu={props.onRowContextMenu}
        />
      )
    })

    flush()
    return nodes
  }

  const renderRun = () => {
    const run = props.run
    if (run === null) {
      return null
    }

    const percent = md3RepositoryRunPercent(run.progress)
    const finished = run.progress.finished

    return (
      <section
        className="md3-repositories-view__run"
        aria-label={t('md3.repositories.runRegion')}
      >
        <div className="md3-repositories-view__run-heading">
          <strong>{run.label}</strong>
          <span className="md3-repositories-view__run-count">
            {t('md3.repositories.runCount', {
              completed: String(run.progress.completed),
              total: String(run.progress.total),
            })}
          </span>
        </div>
        <div
          className="md3-repositories-view__run-track"
          role="progressbar"
          aria-label={run.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={t('md3.repositories.runProgressText', {
            operation: run.label,
            percent: String(percent),
          })}
        >
          <span
            className="md3-repositories-view__run-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        {run.cancelRequested && !finished ? (
          <p className="md3-repositories-view__run-note" role="status">
            {t('md3.repositories.runCancelling')}
          </p>
        ) : null}
        {finished ? (
          <p className="md3-repositories-view__run-note" role="status">
            {md3RepositoryRunSummary(run.progress)}
          </p>
        ) : null}
        <ul
          className="md3-repositories-view__run-results"
          aria-label={t('md3.repositories.runResults')}
          aria-busy={!finished}
        >
          {run.progress.items.map(item => {
            const toneKey = runStatusToneKey(item.status)
            const tone = statusTone(toneKey)
            return (
              <li key={item.id}>
                <MaterialSymbol
                  name={runIcon(toneKey)}
                  className={tone.on}
                  size={ResultGlyphSize}
                />
                <span className="md3-repositories-view__run-name">
                  {item.name}
                </span>
                <span
                  className={classNames(
                    'md3-repositories-view__pill',
                    tone.container,
                    tone.on
                  )}
                >
                  {runStatusLabel(item.status)}
                </span>
                <span className="md3-repositories-view__run-detail">
                  {item.detail.length > 0
                    ? item.detail
                    : t('md3.repositories.runNoDetail')}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="md3-repositories-view__run-actions">
          {finished ? (
            <Md3TonalButton
              icon="close"
              label={t('md3.repositories.runDismiss')}
              onClick={props.onDismissRun}
            />
          ) : (
            <Md3TonalButton
              icon="cancel"
              label={t('md3.repositories.runCancel')}
              accessibleName={t('md3.repositories.runCancelName', {
                operation: run.label,
              })}
              disabled={run.cancelRequested}
              onClick={props.onCancelRun}
            />
          )}
        </div>
      </section>
    )
  }

  const renderBulkBar = () => {
    if (!selectionActive) {
      return null
    }

    const count = String(selectedCount)

    return (
      <div
        className="md3-repositories-view__bulk"
        role="group"
        aria-label={t('md3.repositories.bulkRegion')}
      >
        <label className="md3-repositories-view__bulk-select-all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleSelected}
            disabled={visibleIds.length === 0 || running}
            onChange={onSelectAllChange}
          />
          <span>
            {t('md3.repositories.selectAllVisible', {
              count: String(visibleIds.length),
            })}
          </span>
        </label>
        <span className="md3-repositories-view__bulk-scope">
          {t('md3.repositories.selectionScope', {
            shown: String(visibleIds.length),
            total: String(repositories.length),
          })}
        </span>
        <span className="md3-repositories-view__bulk-count" role="status">
          {t('md3.repositories.selectedCount', { count })}
        </span>
        <Md3IconButton
          small={true}
          icon="swap_horiz"
          label={t('md3.repositories.invertSelection')}
          disabled={visibleIds.length === 0 || running}
          onClick={onInvertSelection}
        />
        <label className="md3-repositories-view__bulk-group">
          <span>{t('md3.repositories.groupFieldLabel')}</span>
          <input
            type="text"
            list="md3-repositories-group-options"
            value={groupDraft}
            disabled={running}
            placeholder={t('md3.repositories.groupFieldPlaceholder')}
            aria-label={t('md3.repositories.groupFieldLabel')}
            onChange={onGroupDraftChange}
          />
          <datalist id="md3-repositories-group-options">
            {props.groupNames.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <span className="md3-repositories-view__bulk-actions">
          {Md3BulkActions.map(action => {
            const label = action.label()
            return (
              <button
                key={action.operation}
                type="button"
                value={action.operation}
                className={classNames('md3-tonal-button', {
                  'md3-repositories-view__bulk-destructive':
                    action.destructive === true,
                })}
                disabled={
                  selectedCount === 0 ||
                  running ||
                  (action.needsGroupName === true &&
                    groupDraft.trim().length === 0)
                }
                aria-label={t('md3.repositories.bulkActionName', {
                  action: label,
                  count,
                })}
                onClick={onBulkClick}
              >
                <MaterialSymbol name={action.icon} size={SmallGlyphSize} />
                <span>{label}</span>
              </button>
            )
          })}
        </span>
        <Md3IconButton
          small={true}
          icon="close"
          label={t('md3.repositories.clearSelection')}
          disabled={selectedCount === 0 || running}
          onClick={onClearSelection}
        />
        <Md3TonalButton
          icon="done_all"
          label={t('md3.repositories.exitSelection')}
          disabled={running}
          onClick={onExitSelection}
        />
      </div>
    )
  }

  return (
    <div
      className={classNames(
        'md3-repositories-view',
        'md3-anim-up',
        props.className
      )}
    >
      <div className="md3-repositories-view__pane">
        <Md3SearchField
          id={Md3RepositoriesSearchInputId}
          fieldLabel={t('md3.repositories.searchFieldName')}
          placeholder={t('md3.repositories.searchPlaceholder')}
          value={props.searchValue}
          regexEnabled={props.regexEnabled}
          onChange={props.onSearchChange}
          onClear={props.onClearSearch}
          onToggleRegex={props.onToggleRegex}
          onOpenBuilder={props.onOpenRegexBuilder}
        />
        <Md3ChipRow label={t('md3.repositories.filtersLabel')}>
          {groupChips.map(chip => (
            <Md3Chip
              key={chip}
              label={chip}
              active={props.activeChips.includes(chip)}
              onToggle={props.onToggleChip}
            />
          ))}
          <Md3Chip
            key="md3-has-changes"
            label={md3HasChangesChipLabel()}
            active={props.activeChips.includes(md3HasChangesChipLabel())}
            onToggle={props.onToggleChip}
          />
          <Md3ChipRowSpacer />
          <Md3IconButton
            small={true}
            icon="checklist"
            label={t('md3.repositories.selectMultiple')}
            active={selectionActive}
            pressed={selectionActive}
            onClick={onToggleSelectionMode}
          />
          <Md3TonalButton
            icon="cloud_download"
            label={t('md3.repositories.clone')}
            onClick={props.onClone}
          />
          <Md3TonalButton
            icon="folder_open"
            label={t('md3.repositories.addLocal')}
            onClick={props.onAddLocal}
          />
          <Md3TonalButton
            icon="arrow_downward"
            label={t('md3.repositories.pullAll')}
            accessibleName={t('md3.repositories.pullAllName', {
              count: String(visibleIds.length),
            })}
            disabled={running || visibleIds.length === 0}
            onClick={onPullAllClick}
          />
        </Md3ChipRow>
        {filtered.patternInvalid ? (
          <p className="md3-repositories-view__notice" role="status">
            {t('md3.repositories.invalidPattern')}
          </p>
        ) : null}
        {props.notice === null ? null : (
          <div className="md3-repositories-view__notice" role="status">
            <span>{props.notice}</span>
            {props.onDismissNotice === undefined ? null : (
              <Md3IconButton
                small={true}
                icon="close"
                label={t('md3.repositories.dismissNotice')}
                onClick={props.onDismissNotice}
              />
            )}
          </div>
        )}
        {renderBulkBar()}
        {props.removalCandidates === null ? null : (
          <Md3RemovalGate
            candidates={props.removalCandidates}
            onConfirm={props.onConfirmRemoval}
            onCancel={props.onCancelRemoval}
          />
        )}
        {renderRun()}
        {/*
         * The list is rendered in full rather than virtualized. A repository
         * list is bounded by how many repositories a person has added by hand —
         * tens, occasionally low hundreds — and each row is a handful of static
         * nodes with one icon button, so the whole list costs less than the
         * windowing machinery would. If a profile ever arrives with thousands,
         * this is the place that needs `react-virtualized`, and the roving
         * tabindex above already keys off `visibleIds` rather than the DOM,
         * so it would survive the change.
         */}
        <div className="md3-repositories-view__list">
          {visibleRows.length === 0 ? (
            <Md3EmptyState
              message={t('md3.repositories.empty')}
              onAction={props.onResetFilters}
            />
          ) : (
            <div
              role="grid"
              aria-label={t('md3.repositories.listLabel')}
              aria-multiselectable={selectionActive}
            >
              {renderRows()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
