import * as React from 'react'
import classNames from 'classnames'
import { t } from '../../lib/i18n'
import { MaterialSymbol, MaterialSymbolName } from '../lib/material-symbol'
import { createObservableRef, ObservableRef } from '../lib/observable-ref'
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

/**
 * The Branches destination of the MD3 shell design contract
 * (`design/History MD3.dc.html`, the `<sc-if value="{{ isBranches }}">`
 * branch).
 *
 * One full-width `surface-container` pane holding the branch filter, the
 * Local/Remote chips with the "New branch" and "Merge all" actions, and the
 * branch list grouped Current / Local / Remote. Every measurement lives in
 * `app/styles/ui/_md3-branches.scss`; the contract's inline `style` strings are
 * not reproduced here, because a value that also appears in another view must
 * resolve to the same pixel in both and a class is the only way to guarantee
 * that.
 *
 * Three things the contract cannot express are handled here rather than in the
 * stylesheet:
 *
 * - The contract's rows are `<div onClick>`. A list of selectable rows that
 *   each carry their own buttons is a `grid` in ARIA terms, so the rows are
 *   real grid rows with roving tabindex, `aria-selected`, arrow-key movement
 *   between rows and Left/Right movement into the row's own controls.
 * - The contract's `title` hints are rendered through the app's own `Tooltip`
 *   (via `Md3IconButton`), because `title` is unreachable by keyboard and this
 *   repository forbids it.
 * - "Merge all" is long-running and destructive-adjacent. The contract fakes it
 *   with a timer; here the caller reports real phase-by-phase progress through
 *   `mergeAll`, the view republishes it to the pane header's progress bar via
 *   `onMergeAllProgress`, and the handler refuses re-entry with a ref guard —
 *   the disabled attribute alone is not the guard, because a keyboard submit
 *   arriving before the state update walks straight past it.
 */

/** The leading branch glyph, per the contract's `iconStyle`. */
const BranchGlyphSize = 17

/** The `add` / `merge` glyphs inside the two tonal buttons. */
const ActionGlyphSize = 15

/** The `more_vert` glyph inside the 26px row menu button. */
const RowMenuGlyphSize = 15

/** The contract's three branch groups, in its order. */
export type Md3BranchGroup = 'Current' | 'Local' | 'Remote'

/**
 * The contract's `branchChips` set.
 *
 * Identifiers rather than copy: a caller filters on these, so they keep the
 * contract's spelling in every language mode and
 * {@link md3BranchChipLabel} supplies what the chip actually reads.
 */
export type Md3BranchChip = 'Local' | 'Remote'

/** Every filter chip the contract ships for this destination, in its order. */
export const Md3BranchChips: ReadonlyArray<Md3BranchChip> = ['Local', 'Remote']

/**
 * What a branch filter chip reads, in the active language mode.
 *
 * Deliberately not the group heading's key even though English spells both
 * words the same: one names a section of the list and the other names a filter,
 * and sharing a key would let a change to either quietly rewrite the other.
 */
export function md3BranchChipLabel(chip: Md3BranchChip): string {
  switch (chip) {
    case 'Local':
      return t('md3.branches.chip.local')
    case 'Remote':
      return t('md3.branches.chip.remote')
  }
}

/**
 * A pull request associated with a branch, for the detail line's trailing
 * "PR #421 open" clause.
 */
export interface IMd3BranchPullRequest {
  readonly number: number

  /**
   * The already-localized state word the detail line renders — "open",
   * "draft", "merged". It is copy, never identity.
   */
  readonly state: string
}

/**
 * One branch, as the pane renders it.
 *
 * `name` is the identity every callback is keyed by, so it must be the branch's
 * real ref-derived name and never a display string.
 */
export interface IMd3BranchRow {
  readonly name: string

  readonly group: Md3BranchGroup

  /** The contract's second line: "Updated 12 minutes ago by Alice Lindqvist". */
  readonly meta: string

  /** The short tip SHA the detail line opens with. */
  readonly tipSha: string

  /**
   * The upstream this branch tracks, already shortened the way the detail line
   * shows it ("origin/development"). `null` renders the untracked wording.
   */
  readonly tracking: string | null

  readonly ahead: number

  readonly behind: number

  readonly pullRequest?: IMd3BranchPullRequest

  /** Whether this branch is the checked-out one. */
  readonly isCurrent: boolean

  /** Whether the user has pinned this branch. */
  readonly isPinned?: boolean

  /** Whether a linked worktree already holds this branch. */
  readonly hasWorktree?: boolean

  /** Whether this branch may be hidden — a pinned or current branch may not. */
  readonly canHide?: boolean

  /** Whether this branch lives on a forge that can open a pull request. */
  readonly isOnForge?: boolean
}

/** The phases the caller's merge-all orchestrator moves through. */
export type Md3MergeAllPhase =
  | 'preparing'
  | 'committing'
  | 'pulling'
  | 'merging'
  | 'resolving'
  | 'cleaning'
  | 'pushing'
  | 'complete'
  | 'cancelled'

/**
 * Real merge-all progress, adapted by the shell from the app's own
 * `IMergeAllState` (`app/src/lib/automation/merge-all.ts`).
 *
 * `completed` and `total` count branches, so the bar reports how much of the
 * actual work is done rather than how long a timer has been running.
 */
export interface IMd3MergeAllStatus {
  readonly phase: Md3MergeAllPhase

  /** The branch being merged right now, for the progress label. */
  readonly currentBranch: string | null

  readonly completed: number

  readonly total: number
}

/** The phases that mean the run is over and the button may be pressed again. */
const FinishedPhases: ReadonlySet<Md3MergeAllPhase> = new Set<Md3MergeAllPhase>(
  ['complete', 'cancelled']
)

/** Whether a merge-all run is still in flight. */
export function md3MergeAllRunning(
  status: IMd3MergeAllStatus | null | undefined
): boolean {
  return (
    status !== null && status !== undefined && !FinishedPhases.has(status.phase)
  )
}

/**
 * The percentage and the already-localized label the pane header's progress bar
 * should show for a merge-all run, or `null` when nothing is running.
 *
 * Exported so the shell can compute the same values straight from its own
 * merge-all state rather than waiting for the view to report them.
 */
export function md3MergeAllProgress(
  status: IMd3MergeAllStatus | null | undefined
): { readonly percent: number; readonly label: string } | null {
  if (!md3MergeAllRunning(status) || status === null || status === undefined) {
    return null
  }

  const total = Math.max(status.total, 1)
  const completed = Math.min(Math.max(status.completed, 0), total)
  // Never report 0 while work is genuinely running: a bar sitting at zero for
  // the whole preparing phase is indistinguishable from a bar that is stuck.
  const percent = Math.max(5, Math.round((completed / total) * 100))

  const label =
    status.currentBranch === null
      ? t('md3.branches.mergeAllProgress', {
          completed: String(completed),
          total: String(total),
        })
      : t('md3.branches.mergeAllProgressBranch', {
          branch: status.currentBranch,
          completed: String(completed),
          total: String(total),
        })

  return { percent, label }
}

/**
 * Every action a branch row can offer.
 *
 * The contract draws five (merge, rebase, open pull request, rename, delete).
 * The rest are capabilities the surface this view replaces already had —
 * pinning, hiding, solo view, worktree checkout, copy name, merge-and-delete,
 * compare, open on the forge — enumerated here so the shell's menu renders the
 * whole set rather than only the drawn five.
 */
export type Md3BranchRowActionId =
  | 'merge'
  | 'rebase'
  | 'openPullRequest'
  | 'rename'
  | 'delete'
  | 'mergeAndDelete'
  | 'compare'
  | 'copyName'
  | 'togglePin'
  | 'hide'
  | 'solo'
  | 'restoreVisibility'
  | 'checkoutInNewWorktree'
  | 'switchToWorktree'
  | 'viewOnForge'
  | 'viewPullRequestOnForge'

/** One resolved row-menu action, ready for the shell's menu overlay. */
export interface IMd3BranchRowAction {
  readonly id: Md3BranchRowActionId

  /** Already-localized, already-interpolated menu copy. */
  readonly label: string

  readonly icon: MaterialSymbolName

  /** Whether the action can be taken right now. */
  readonly enabled: boolean

  /** Whether the action destroys work and needs the super-confirmation gate. */
  readonly destructive: boolean

  readonly run: () => void
}

/**
 * The per-branch callbacks the shell supplies.
 *
 * Every one is optional: a repository with no forge has no pull request to
 * open, and a branch list rendered before worktrees are enumerated has no
 * worktree action. An omitted callback drops that action from the menu, which
 * is why the menu is resolved here rather than hard-coded anywhere.
 */
export interface IMd3BranchRowHandlers {
  readonly onMergeBranch?: (branch: IMd3BranchRow) => void
  readonly onRebaseBranch?: (branch: IMd3BranchRow) => void
  readonly onOpenPullRequest?: (branch: IMd3BranchRow) => void
  readonly onViewBranchOnForge?: (branch: IMd3BranchRow) => void
  readonly onViewPullRequestOnForge?: (branch: IMd3BranchRow) => void
  readonly onCompareBranch?: (branch: IMd3BranchRow) => void
  readonly onCopyBranchName?: (branch: IMd3BranchRow) => void
  readonly onRenameBranch?: (branch: IMd3BranchRow) => void
  readonly onTogglePin?: (branch: IMd3BranchRow) => void
  readonly onHideBranch?: (branch: IMd3BranchRow) => void
  readonly onSoloBranch?: (branch: IMd3BranchRow) => void
  readonly onRestoreVisibility?: () => void
  readonly onCheckoutInNewWorktree?: (branch: IMd3BranchRow) => void
  readonly onSwitchToWorktree?: (branch: IMd3BranchRow) => void
  readonly onMergeAndDeleteBranch?: (branch: IMd3BranchRow) => void
  readonly onDeleteBranch?: (branch: IMd3BranchRow) => void
}

/**
 * The list-level callbacks reached from the list's own context menu, so the
 * pane keeps exactly the shape the contract draws while nothing the previous
 * surface could do becomes unreachable.
 */
export interface IMd3BranchListHandlers {
  readonly onSortByName?: () => void
  readonly onSortByRecent?: () => void
  readonly onShowPullRequests?: () => void
  readonly onFetchRemoteBranches?: () => void
  readonly onRestoreVisibility?: () => void
  readonly onBulkDeleteBranches?: () => void
}

/** One resolved list-menu action. */
export interface IMd3BranchListAction {
  readonly id: keyof IMd3BranchListHandlers
  readonly label: string
  readonly icon: MaterialSymbolName
  readonly destructive: boolean
  readonly run: () => void
}

/** How the list is ordered, so the list menu can mark the active choice. */
export type Md3BranchSortOrder = 'name' | 'recent'

export interface IMd3BranchesViewProps {
  /** Every branch to render, already filtered by the caller's own rules. */
  readonly branches: ReadonlyArray<IMd3BranchRow>

  /** The filter query. The view never owns it, so the shell can restore it. */
  readonly filterText: string

  readonly onFilterTextChanged: (value: string) => void

  /** Whether the query is read as a regular expression. */
  readonly regexEnabled: boolean

  readonly onToggleRegex: () => void

  /** Opens the shell's anchored regex builder for the `branches` field. */
  readonly onOpenRegexBuilder: () => void

  /** The active filter chips. */
  readonly activeChips: ReadonlyArray<Md3BranchChip>

  readonly onToggleChip: (chip: Md3BranchChip) => void

  /** Clears the query and every chip, for the empty state's recovery action. */
  readonly onResetFilters: () => void

  /** The selected row's branch name, or `null` for none. */
  readonly selectedBranchName: string | null

  readonly onSelectBranch: (branch: IMd3BranchRow) => void

  readonly onCheckoutBranch: (branch: IMd3BranchRow) => void

  readonly onNewBranch: () => void

  /**
   * Starts a merge-all run. The view will not call this again until `mergeAll`
   * reports the previous run finished.
   */
  readonly onMergeAll: () => void

  /** Live merge-all progress, or `null`/absent when nothing is running. */
  readonly mergeAll?: IMd3MergeAllStatus | null

  /**
   * Republishes merge-all progress to whatever owns the pane header's progress
   * bar. `(null, null)` means the run is over and the bar should disappear.
   */
  readonly onMergeAllProgress?: (
    progress: number | null,
    label: string | null
  ) => void

  /** Whether merging every branch is possible at all right now. */
  readonly canMergeAll?: boolean

  /** The name of the branch a merge or rebase would land in. */
  readonly currentBranchName: string

  /**
   * Opens the shell's menu overlay for a row. The view resolves the item list
   * so nothing the previous branch menu offered is lost in the adaptation.
   */
  readonly onOpenRowMenu: (
    branch: IMd3BranchRow,
    actions: ReadonlyArray<IMd3BranchRowAction>,
    target: HTMLElement | null,
    event: React.MouseEvent
  ) => void

  /** Per-branch actions, resolved into the row menu. */
  readonly rowHandlers?: IMd3BranchRowHandlers

  /** Opens the shell's menu overlay for the list itself. */
  readonly onOpenListMenu?: (
    actions: ReadonlyArray<IMd3BranchListAction>,
    event: React.MouseEvent
  ) => void

  /** List-level actions, resolved into the list's context menu. */
  readonly listHandlers?: IMd3BranchListHandlers

  readonly sortOrder?: Md3BranchSortOrder

  /** Whether any branch is hidden right now, enabling "Restore all branches". */
  readonly hasHiddenBranches?: boolean

  readonly className?: string
}

/** The contract's `branchRows` grouping order. */
const GroupOrder: ReadonlyArray<Md3BranchGroup> = ['Current', 'Local', 'Remote']

function groupLabel(group: Md3BranchGroup): string {
  switch (group) {
    case 'Current':
      return t('md3.branches.group.current')
    case 'Local':
      return t('md3.branches.group.local')
    case 'Remote':
      return t('md3.branches.group.remote')
  }
}

/** The contract's `icon`: `check_circle` current, `cloud` remote, else `merge_type`. */
function branchIcon(branch: IMd3BranchRow): MaterialSymbolName {
  if (branch.isCurrent) {
    return 'check_circle'
  }

  return branch.group === 'Remote' ? 'cloud' : 'merge_type'
}

/**
 * The contract's `detail` string:
 * "tip 4f1c9ae · tracks origin/development · ↑3 ↓0 · PR #421 open", with
 * "in sync" replacing the divergence clause when there is none.
 */
export function md3BranchDetail(branch: IMd3BranchRow): string {
  const parts = [t('md3.branches.detail.tip', { sha: branch.tipSha })]

  if (branch.group === 'Remote') {
    parts.push(t('md3.branches.detail.trackingRemote'))
  } else if (branch.tracking === null) {
    parts.push(t('md3.branches.detail.untracked'))
  } else {
    parts.push(t('md3.branches.detail.tracks', { upstream: branch.tracking }))
  }

  if (branch.ahead > 0 || branch.behind > 0) {
    parts.push(
      t('md3.branches.detail.diverged', {
        ahead: String(branch.ahead),
        behind: String(branch.behind),
      })
    )
  } else {
    parts.push(t('md3.branches.detail.inSync'))
  }

  if (branch.pullRequest !== undefined) {
    parts.push(
      t('md3.branches.detail.pullRequest', {
        number: String(branch.pullRequest.number),
        state: branch.pullRequest.state,
      })
    )
  }

  return parts.join(' · ')
}

/**
 * Resolves the row menu for one branch.
 *
 * The contract's five actions come first, in its order; the actions the
 * replaced surface already had follow. An action whose handler was not supplied
 * is omitted rather than rendered dead.
 */
export function md3BranchRowActions(
  branch: IMd3BranchRow,
  currentBranchName: string,
  handlers: IMd3BranchRowHandlers,
  hasHiddenBranches: boolean
): ReadonlyArray<IMd3BranchRowAction> {
  const actions: IMd3BranchRowAction[] = []
  const isCurrent = branch.isCurrent
  const isRemote = branch.group === 'Remote'

  const add = (
    id: Md3BranchRowActionId,
    label: string,
    icon: MaterialSymbolName,
    enabled: boolean,
    destructive: boolean,
    run: (() => void) | undefined
  ) => {
    if (run !== undefined) {
      actions.push({ id, label, icon, enabled, destructive, run })
    }
  }

  const {
    onMergeBranch,
    onRebaseBranch,
    onOpenPullRequest,
    onRenameBranch,
    onDeleteBranch,
    onMergeAndDeleteBranch,
    onCompareBranch,
    onCopyBranchName,
    onTogglePin,
    onHideBranch,
    onSoloBranch,
    onRestoreVisibility,
    onSwitchToWorktree,
    onCheckoutInNewWorktree,
    onViewBranchOnForge,
    onViewPullRequestOnForge,
  } = handlers

  add(
    'merge',
    t('md3.branches.action.merge', { branch: currentBranchName }),
    'merge',
    !isCurrent,
    false,
    onMergeBranch === undefined ? undefined : () => onMergeBranch(branch)
  )

  add(
    'rebase',
    t('md3.branches.action.rebase', { branch: currentBranchName }),
    'low_priority',
    !isCurrent,
    false,
    onRebaseBranch === undefined ? undefined : () => onRebaseBranch(branch)
  )

  add(
    'openPullRequest',
    t('md3.branches.action.openPullRequest'),
    'call_merge',
    branch.isOnForge !== false,
    false,
    onOpenPullRequest === undefined
      ? undefined
      : () => onOpenPullRequest(branch)
  )

  add(
    'rename',
    t('md3.branches.action.rename'),
    'edit',
    !isRemote,
    false,
    onRenameBranch === undefined ? undefined : () => onRenameBranch(branch)
  )

  add(
    'delete',
    t('md3.branches.action.delete'),
    'delete',
    !isCurrent,
    true,
    onDeleteBranch === undefined ? undefined : () => onDeleteBranch(branch)
  )

  add(
    'mergeAndDelete',
    t('md3.branches.action.mergeAndDelete'),
    'delete_sweep',
    !isCurrent,
    true,
    onMergeAndDeleteBranch === undefined
      ? undefined
      : () => onMergeAndDeleteBranch(branch)
  )

  add(
    'compare',
    t('md3.branches.action.compare'),
    'difference',
    !isCurrent,
    false,
    onCompareBranch === undefined ? undefined : () => onCompareBranch(branch)
  )

  add(
    'copyName',
    t('md3.branches.action.copyName'),
    'content_copy',
    true,
    false,
    onCopyBranchName === undefined ? undefined : () => onCopyBranchName(branch)
  )

  add(
    'togglePin',
    branch.isPinned === true
      ? t('md3.branches.action.unpin')
      : t('md3.branches.action.pin'),
    'push_pin',
    true,
    false,
    onTogglePin === undefined ? undefined : () => onTogglePin(branch)
  )

  add(
    'hide',
    t('md3.branches.action.hide'),
    'block',
    branch.canHide !== false && !isCurrent,
    false,
    onHideBranch === undefined ? undefined : () => onHideBranch(branch)
  )

  add(
    'solo',
    t('md3.branches.action.solo'),
    'filter_list',
    true,
    false,
    onSoloBranch === undefined ? undefined : () => onSoloBranch(branch)
  )

  add(
    'restoreVisibility',
    t('md3.branches.action.restoreVisibility'),
    'visibility',
    hasHiddenBranches,
    false,
    onRestoreVisibility === undefined ? undefined : () => onRestoreVisibility()
  )

  if (branch.hasWorktree === true && onSwitchToWorktree !== undefined) {
    add(
      'switchToWorktree',
      t('md3.branches.action.switchToWorktree'),
      'folder_open',
      true,
      false,
      () => onSwitchToWorktree(branch)
    )
  } else {
    add(
      'checkoutInNewWorktree',
      t('md3.branches.action.checkoutInNewWorktree'),
      'folder_open',
      !isCurrent,
      false,
      onCheckoutInNewWorktree === undefined
        ? undefined
        : () => onCheckoutInNewWorktree(branch)
    )
  }

  add(
    'viewOnForge',
    t('md3.branches.action.viewOnForge'),
    'open_in_new',
    branch.isOnForge !== false,
    false,
    onViewBranchOnForge === undefined
      ? undefined
      : () => onViewBranchOnForge(branch)
  )

  add(
    'viewPullRequestOnForge',
    t('md3.branches.action.viewPullRequestOnForge'),
    'open_in_new',
    branch.pullRequest !== undefined,
    false,
    onViewPullRequestOnForge === undefined
      ? undefined
      : () => onViewPullRequestOnForge(branch)
  )

  return actions
}

/** Resolves the list's own context menu. */
export function md3BranchListActions(
  handlers: IMd3BranchListHandlers,
  sortOrder: Md3BranchSortOrder | undefined
): ReadonlyArray<IMd3BranchListAction> {
  const actions: IMd3BranchListAction[] = []
  const {
    onSortByName,
    onSortByRecent,
    onShowPullRequests,
    onFetchRemoteBranches,
    onRestoreVisibility,
    onBulkDeleteBranches,
  } = handlers

  if (onSortByName !== undefined) {
    actions.push({
      id: 'onSortByName',
      label:
        sortOrder === 'name'
          ? t('md3.branches.list.sortByNameActive')
          : t('md3.branches.list.sortByName'),
      icon: 'sort',
      destructive: false,
      run: onSortByName,
    })
  }

  if (onSortByRecent !== undefined) {
    actions.push({
      id: 'onSortByRecent',
      label:
        sortOrder === 'recent'
          ? t('md3.branches.list.sortByRecentActive')
          : t('md3.branches.list.sortByRecent'),
      icon: 'history',
      destructive: false,
      run: onSortByRecent,
    })
  }

  if (onShowPullRequests !== undefined) {
    actions.push({
      id: 'onShowPullRequests',
      label: t('md3.branches.list.pullRequests'),
      icon: 'call_merge',
      destructive: false,
      run: onShowPullRequests,
    })
  }

  if (onFetchRemoteBranches !== undefined) {
    actions.push({
      id: 'onFetchRemoteBranches',
      label: t('md3.branches.list.fetchRemotes'),
      icon: 'sync',
      destructive: false,
      run: onFetchRemoteBranches,
    })
  }

  if (onRestoreVisibility !== undefined) {
    actions.push({
      id: 'onRestoreVisibility',
      label: t('md3.branches.action.restoreVisibility'),
      icon: 'visibility',
      destructive: false,
      run: onRestoreVisibility,
    })
  }

  if (onBulkDeleteBranches !== undefined) {
    actions.push({
      id: 'onBulkDeleteBranches',
      label: t('md3.branches.list.bulkDelete'),
      icon: 'delete_sweep',
      destructive: true,
      run: onBulkDeleteBranches,
    })
  }

  return actions
}

/** The rows in render order, and the indices each group starts at. */
interface IGroupedBranches {
  readonly rows: ReadonlyArray<IMd3BranchRow>
  readonly headerAt: ReadonlySet<number>
}

/** Groups the rows Current / Local / Remote, in the contract's order. */
export function groupMd3Branches(
  branches: ReadonlyArray<IMd3BranchRow>
): IGroupedBranches {
  const rows: IMd3BranchRow[] = []
  const headerAt = new Set<number>()

  for (const group of GroupOrder) {
    const inGroup = branches.filter(branch => branch.group === group)
    if (inGroup.length === 0) {
      continue
    }

    headerAt.add(rows.length)
    rows.push(...inGroup)
  }

  return { rows, headerAt }
}

/** Every focusable control inside one row, in visual order. */
function rowControls(row: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(row.querySelectorAll<HTMLElement>('button:not(:disabled)'))
}

export function Md3BranchesView(props: IMd3BranchesViewProps) {
  const {
    branches,
    filterText,
    onFilterTextChanged,
    onResetFilters,
    onSelectBranch,
    onCheckoutBranch,
    onMergeAll,
    onMergeAllProgress,
    onOpenRowMenu,
    onOpenListMenu,
    onToggleChip,
    rowHandlers,
    listHandlers,
    currentBranchName,
    hasHiddenBranches,
    sortOrder,
    mergeAll,
    selectedBranchName,
  } = props

  const { rows, headerAt } = React.useMemo(
    () => groupMd3Branches(branches),
    [branches]
  )

  const rowRefs = React.useRef(new Map<string, ObservableRef<HTMLDivElement>>())
  const refFor = React.useCallback((name: string) => {
    const existing = rowRefs.current.get(name)
    if (existing !== undefined) {
      return existing
    }

    const created = createObservableRef<HTMLDivElement>()
    rowRefs.current.set(name, created)
    return created
  }, [])

  // Roving tabindex. The selected row owns the tab stop while it is on screen;
  // otherwise the first row does, so the list is never a dead end for Tab.
  const [focusedName, setFocusedName] = React.useState<string | null>(null)
  const rovingName = React.useMemo(() => {
    const names = rows.map(row => row.name)
    if (focusedName !== null && names.includes(focusedName)) {
      return focusedName
    }
    if (selectedBranchName !== null && names.includes(selectedBranchName)) {
      return selectedBranchName
    }
    return names.length > 0 ? names[0] : null
  }, [rows, focusedName, selectedBranchName])

  // ---------------------------------------------------------------------
  // Merge all
  // ---------------------------------------------------------------------

  const running = md3MergeAllRunning(mergeAll)

  // The disabled attribute is the visible guard; this ref is the real one. A
  // keyboard submit dispatched before the caller's state comes back would
  // otherwise start a second run over the same branches.
  const mergeRequested = React.useRef(false)
  React.useEffect(() => {
    mergeRequested.current = running
  }, [running])

  const onMergeAllClick = React.useCallback(() => {
    if (mergeRequested.current) {
      return
    }
    mergeRequested.current = true
    onMergeAll()
  }, [onMergeAll])

  // Republish real progress to whatever owns the pane header's bar.
  const progress = React.useMemo(
    () => md3MergeAllProgress(mergeAll),
    [mergeAll]
  )
  React.useEffect(() => {
    if (onMergeAllProgress === undefined) {
      return
    }
    if (progress === null) {
      onMergeAllProgress(null, null)
    } else {
      onMergeAllProgress(progress.percent, progress.label)
    }
  }, [progress, onMergeAllProgress])

  // ---------------------------------------------------------------------
  // Selection and keyboard
  // ---------------------------------------------------------------------

  const rowByName = React.useCallback(
    (name: string | undefined) => rows.find(row => row.name === name),
    [rows]
  )

  const focusRow = React.useCallback(
    (row: IMd3BranchRow) => {
      setFocusedName(row.name)
      refFor(row.name).current?.focus()
      onSelectBranch(row)
    },
    [refFor, onSelectBranch]
  )

  const onRowKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const rowElement = event.currentTarget
      const index = rows.findIndex(
        row => row.name === rowElement.dataset.branchName
      )
      if (index === -1) {
        return
      }

      const fromControl = event.target !== rowElement

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          focusRow(rows[Math.min(index + 1, rows.length - 1)])
          return
        case 'ArrowUp':
          event.preventDefault()
          focusRow(rows[Math.max(index - 1, 0)])
          return
        case 'Home':
          event.preventDefault()
          focusRow(rows[0])
          return
        case 'End':
          event.preventDefault()
          focusRow(rows[rows.length - 1])
          return
        case 'ArrowRight': {
          // Grid cell navigation: step into, then along, the row's controls.
          const controls = rowControls(rowElement)
          if (controls.length === 0) {
            return
          }
          const at = fromControl
            ? controls.indexOf(event.target as HTMLElement)
            : -1
          if (at < controls.length - 1) {
            event.preventDefault()
            controls[at + 1].focus()
          }
          return
        }
        case 'ArrowLeft': {
          if (!fromControl) {
            return
          }
          const controls = rowControls(rowElement)
          const at = controls.indexOf(event.target as HTMLElement)
          event.preventDefault()
          if (at <= 0) {
            rowElement.focus()
          } else {
            controls[at - 1].focus()
          }
          return
        }
        case 'Enter':
        case ' ': {
          if (fromControl) {
            // The button will handle its own activation.
            return
          }
          const row = rows[index]
          if (!row.isCurrent) {
            event.preventDefault()
            onCheckoutBranch(row)
          }
          return
        }
        default:
          return
      }
    },
    [rows, focusRow, onCheckoutBranch]
  )

  const onRowClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const row = rowByName(event.currentTarget.dataset.branchName)
      if (row !== undefined) {
        setFocusedName(row.name)
        onSelectBranch(row)
      }
    },
    [rowByName, onSelectBranch]
  )

  const onRowFocus = React.useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const name = event.currentTarget.dataset.branchName
      if (name !== undefined) {
        setFocusedName(name)
      }
    },
    []
  )

  const openRowMenu = React.useCallback(
    (
      row: IMd3BranchRow,
      target: HTMLElement | null,
      event: React.MouseEvent
    ) => {
      event.preventDefault()
      event.stopPropagation()
      setFocusedName(row.name)
      onSelectBranch(row)
      onOpenRowMenu(
        row,
        md3BranchRowActions(
          row,
          currentBranchName,
          rowHandlers ?? {},
          hasHiddenBranches === true
        ),
        target,
        event
      )
    },
    [
      onOpenRowMenu,
      onSelectBranch,
      currentBranchName,
      rowHandlers,
      hasHiddenBranches,
    ]
  )

  const onRowContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const row = rowByName(event.currentTarget.dataset.branchName)
      if (row !== undefined) {
        openRowMenu(row, event.currentTarget, event)
      }
    },
    [rowByName, openRowMenu]
  )

  const onListContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (onOpenListMenu === undefined || listHandlers === undefined) {
        return
      }
      const actions = md3BranchListActions(listHandlers, sortOrder)
      if (actions.length === 0) {
        return
      }
      event.preventDefault()
      onOpenListMenu(actions, event)
    },
    [onOpenListMenu, listHandlers, sortOrder]
  )

  const onCheckoutClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const owner =
        event.currentTarget.closest<HTMLElement>('[data-branch-name]')
      const row = rowByName(owner?.dataset.branchName)
      if (row !== undefined && !row.isCurrent) {
        onCheckoutBranch(row)
      }
    },
    [rowByName, onCheckoutBranch]
  )

  const onMenuButtonEvent = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const owner =
        event.currentTarget.closest<HTMLElement>('[data-branch-name]')
      const row = rowByName(owner?.dataset.branchName)
      if (row !== undefined) {
        openRowMenu(row, event.currentTarget, event)
      }
    },
    [rowByName, openRowMenu]
  )

  // The chip reports its untranslated id, never the label it renders, so this
  // lookup keeps working when the interface is in Cantonese or bilingual mode.
  const onChipToggle = React.useCallback(
    (value: string) => {
      const chip = Md3BranchChips.find(candidate => candidate === value)
      if (chip !== undefined) {
        onToggleChip(chip)
      }
    },
    [onToggleChip]
  )

  const onClearFilter = React.useCallback(() => {
    onFilterTextChanged('')
  }, [onFilterTextChanged])

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const mergeAllLabel = t('md3.branches.mergeAll')
  const totalRowCount = rows.length + headerAt.size

  return (
    <div className={classNames('md3-branches', 'md3-anim-up', props.className)}>
      <div className="md3-branches__pane">
        <Md3SearchField
          id="md3-branches-filter"
          searchSurfaceId="md3-branches"
          value={filterText}
          placeholder={t('md3.branches.filterPlaceholder')}
          fieldLabel={t('md3.branches.fieldLabel')}
          regexEnabled={props.regexEnabled}
          onChange={onFilterTextChanged}
          onClear={onClearFilter}
          onToggleRegex={props.onToggleRegex}
          onOpenBuilder={props.onOpenRegexBuilder}
        />

        <Md3ChipRow label={t('md3.branches.chipsLabel')}>
          {Md3BranchChips.map(chip => (
            <Md3Chip
              key={chip}
              label={md3BranchChipLabel(chip)}
              value={chip}
              active={props.activeChips.includes(chip)}
              onToggle={onChipToggle}
            />
          ))}
          <Md3ChipRowSpacer />
          <Md3TonalButton
            icon="add"
            iconSize={ActionGlyphSize}
            label={t('md3.branches.newBranch')}
            hasPopup="dialog"
            onClick={props.onNewBranch}
          />
          <Md3TonalButton
            icon="merge"
            iconSize={ActionGlyphSize}
            label={mergeAllLabel}
            accessibleName={
              running
                ? t('md3.branches.mergeAllRunning', { label: mergeAllLabel })
                : undefined
            }
            disabled={running || props.canMergeAll === false}
            onClick={onMergeAllClick}
          />
        </Md3ChipRow>

        {rows.length === 0 ? (
          <div className="md3-branches__list" onContextMenu={onListContextMenu}>
            <Md3EmptyState
              message={t('md3.branches.empty')}
              onAction={onResetFilters}
            />
          </div>
        ) : (
          <div
            className="md3-branches__list"
            role="grid"
            aria-label={t('md3.branches.listLabel')}
            aria-rowcount={totalRowCount}
            aria-colcount={4}
            /*
             * The rows own the tab stop, not the grid. `-1` keeps the container
             * programmatically focusable — which is what the interactive-role
             * rule asks for — without adding a second stop in front of a list
             * the user can already reach.
             */
            tabIndex={-1}
            onContextMenu={onListContextMenu}
          >
            {rows.map((row, index) => {
              const selected = row.name === selectedBranchName

              return (
                <React.Fragment key={row.name}>
                  {headerAt.has(index) ? (
                    <div role="row" className="md3-branches__group-row">
                      <div
                        role="rowheader"
                        className="md3-branches__group-cell"
                      >
                        <Md3GroupHeader
                          id={`md3-branches-group-${row.group.toLowerCase()}`}
                          label={groupLabel(row.group)}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div
                    ref={refFor(row.name)}
                    role="row"
                    data-branch-name={row.name}
                    className={classNames('md3-row', 'md3-branches__row', {
                      'md3-row--active': selected,
                    })}
                    aria-selected={selected}
                    aria-label={t('md3.branches.rowLabel', {
                      name: row.name,
                      group: groupLabel(row.group),
                    })}
                    tabIndex={row.name === rovingName ? 0 : -1}
                    onClick={onRowClick}
                    onFocus={onRowFocus}
                    onKeyDown={onRowKeyDown}
                    onContextMenu={onRowContextMenu}
                  >
                    <div role="gridcell" className="md3-branches__main">
                      <MaterialSymbol
                        name={branchIcon(row)}
                        size={BranchGlyphSize}
                        className={classNames('md3-branches__icon', {
                          'md3-branches__icon--current': row.isCurrent,
                        })}
                      />
                      <span className="md3-branches__text">
                        <span
                          className={classNames('md3-row__name', {
                            'md3-row__name--active': selected,
                          })}
                        >
                          {row.name}
                        </span>
                        <span className="md3-branches__meta">{row.meta}</span>
                        <span className="md3-row__detail">
                          {md3BranchDetail(row)}
                        </span>
                      </span>
                    </div>

                    <div role="gridcell" className="md3-branches__pills">
                      {/*
                       * The arrow is hidden from assistive technology and the
                       * sentence beside it carries the meaning: a screen reader
                       * announcing "up arrow three" tells nobody which way the
                       * branch has moved.
                       */}
                      {row.ahead > 0 ? (
                        <span className="md3-branches__pill md3-branches__pill--ahead">
                          <span aria-hidden={true}>{`↑${row.ahead}`}</span>
                          <span className="sr-only">
                            {t('md3.branches.aheadLabel', {
                              count: String(row.ahead),
                            })}
                          </span>
                        </span>
                      ) : null}
                      {row.behind > 0 ? (
                        <span className="md3-branches__pill md3-branches__pill--behind">
                          <span aria-hidden={true}>{`↓${row.behind}`}</span>
                          <span className="sr-only">
                            {t('md3.branches.behindLabel', {
                              count: String(row.behind),
                            })}
                          </span>
                        </span>
                      ) : null}
                    </div>

                    <div
                      role="gridcell"
                      className="md3-branches__checkout-cell"
                    >
                      {row.isCurrent ? (
                        <span className="md3-branches__checkout md3-branches__checkout--current">
                          {t('md3.branches.current')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="md3-branches__checkout"
                          aria-label={t('md3.branches.checkoutLabel', {
                            name: row.name,
                          })}
                          tabIndex={-1}
                          onClick={onCheckoutClick}
                        >
                          {t('md3.branches.checkout')}
                        </button>
                      )}
                    </div>

                    <div role="gridcell" className="md3-branches__menu-cell">
                      <Md3IconButton
                        small={true}
                        icon="more_vert"
                        iconSize={RowMenuGlyphSize}
                        label={t('md3.branches.rowMenu', { name: row.name })}
                        tooltip={t('md3.branches.rowMenuHint')}
                        hasPopup="menu"
                        tabIndex={-1}
                        className="md3-branches__menu-button"
                        onClick={onMenuButtonEvent}
                        onContextMenu={onMenuButtonEvent}
                      />
                    </div>
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
