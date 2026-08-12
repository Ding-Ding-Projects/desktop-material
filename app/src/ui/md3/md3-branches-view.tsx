import * as React from 'react'
import classNames from 'classnames'
import { tFunny } from '../../lib/funny-level-text'
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

  /**
   * The **abbreviated** tip SHA the detail line opens with — seven characters,
   * as the contract's `tip 4f1c9ae` shows.
   *
   * A full forty-character object name is the wrong shape and must be
   * abbreviated by whoever builds the row: at 10.5px it consumes most of the
   * detail line, so the tracking and divergence clauses beside it are pushed
   * out of the row's width and ellipsed away. Both values are `string`, so
   * nothing but a test on the real adapter can catch the difference.
   */
  readonly tipSha: string

  /**
   * The upstream this branch tracks, already shortened the way the detail line
   * shows it ("origin/development"). `null` renders the untracked wording.
   */
  readonly tracking: string | null

  /**
   * Whether Git reports the configured upstream as gone. The detail line says
   * so rather than claiming the branch still tracks a ref that no longer
   * exists.
   */
  readonly upstreamGone?: boolean

  /**
   * How many commits this branch is ahead of its upstream, or `null` when
   * nothing has measured it yet.
   *
   * `null` is not the same as `0` and must never be flattened into one: the
   * ahead/behind store measures the checked-out branch and leaves every other
   * branch unmeasured, so a zero here would tell the user that every branch in
   * the list is in sync with its remote — a claim nobody made and the user
   * cannot tell apart from a real answer.
   */
  readonly ahead: number | null

  /** How many commits this branch is behind its upstream, or `null`. */
  readonly behind: number | null

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

  /**
   * How many branches the run will touch in all, or `null` when the
   * orchestrator has not published a count.
   *
   * `null` is the honest answer while a run reports only what it has finished
   * and what it is doing right now: inventing a denominator from those two
   * ("3 of 4" when twelve branches are queued) puts a bar near its end for the
   * whole run and tells the user a total nobody counted.
   */
  readonly total: number | null
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
 * A `null` `percent` means the run is genuinely indeterminate — the total is
 * not known, so no fraction of it can be — and the bar should render its
 * indeterminate state rather than a number. It is distinguishable from "no run
 * at all", which is this function returning `null` outright.
 *
 * Exported so the shell can compute the same values straight from its own
 * merge-all state rather than waiting for the view to report them.
 */
export function md3MergeAllProgress(
  status: IMd3MergeAllStatus | null | undefined
): { readonly percent: number | null; readonly label: string } | null {
  if (!md3MergeAllRunning(status) || status === null || status === undefined) {
    return null
  }

  const done = Math.max(status.completed, 0)

  if (status.total === null) {
    const label =
      status.currentBranch === null
        ? t('md3.branches.mergeAllProgressUnknown', { completed: String(done) })
        : t('md3.branches.mergeAllProgressBranchUnknown', {
            branch: status.currentBranch,
            completed: String(done),
          })
    return { percent: null, label }
  }

  const total = Math.max(status.total, 1)
  const completed = Math.min(done, total)
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
   * bar. `(null, null)` means the run is over and the bar should disappear; a
   * `null` percentage with a label means the run is in flight but its total is
   * unknown, so the bar is indeterminate rather than at zero.
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

  /**
   * Receives a finished bulk export. Omit it and the export button is not
   * rendered at all, rather than offered and doing nothing.
   */
  readonly onExportBranches?: (
    payload: IMd3ListExport,
    branches: ReadonlyArray<IMd3BranchRow>
  ) => void

  /**
   * Copies text to the clipboard. Omit it and "Copy names" is not offered —
   * the same rule: a control that cannot work is not drawn.
   */
  readonly onCopyText?: (text: string) => void

  readonly className?: string
}

/**
 * The export schema for a branch row.
 *
 * Every field the row renders, plus the identity it is keyed by. Nothing here
 * is multiline, so no format drops anything and the picker says so by
 * offering every format without a warning — which is only true because this
 * schema has been checked, not assumed.
 */
export const Md3BranchExportColumns: ReadonlyArray<IMd3ListExportColumn> = [
  { name: 'name' },
  { name: 'group' },
  { name: 'meta' },
  { name: 'tipSha' },
  { name: 'tracking' },
  { name: 'ahead' },
  { name: 'behind' },
  { name: 'pullRequest' },
  { name: 'isCurrent' },
  { name: 'isPinned' },
  { name: 'hasWorktree' },
]

/**
 * Flatten one branch for export.
 *
 * `ahead` and `behind` stay empty rather than becoming `0` when nothing has
 * measured them: a zero in an exported file is read as "in sync", and a file
 * that says every branch is in sync when nothing compared any of them is a
 * claim the reader has no way to doubt.
 */
export function md3BranchExportRecord(
  branch: IMd3BranchRow
): Readonly<Record<string, string | number | boolean>> {
  return {
    name: branch.name,
    group: branch.group,
    meta: branch.meta,
    tipSha: branch.tipSha,
    tracking: branch.tracking ?? '',
    ahead: branch.ahead === null ? '' : branch.ahead,
    behind: branch.behind === null ? '' : branch.behind,
    pullRequest:
      branch.pullRequest === undefined
        ? ''
        : `#${branch.pullRequest.number} ${branch.pullRequest.state}`,
    isCurrent: branch.isCurrent,
    isPinned: branch.isPinned === true,
    hasWorktree: branch.hasWorktree === true,
  }
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

/** Whether a row's divergence has actually been measured. */
export function md3BranchComparisonKnown(branch: IMd3BranchRow): boolean {
  return branch.ahead !== null && branch.behind !== null
}

/**
 * The contract's `detail` string:
 * "tip 4f1c9ae · tracks origin/development · ↑3 ↓0 · PR #421 open", with
 * "in sync" replacing the divergence clause when there is none and
 * "not compared yet" replacing it when nothing has measured this branch.
 */
export function md3BranchDetail(branch: IMd3BranchRow): string {
  const parts = [t('md3.branches.detail.tip', { sha: branch.tipSha })]

  if (branch.group === 'Remote') {
    parts.push(t('md3.branches.detail.trackingRemote'))
  } else if (branch.tracking === null) {
    parts.push(t('md3.branches.detail.untracked'))
  } else if (branch.upstreamGone === true) {
    parts.push(
      t('md3.branches.detail.tracksGone', { upstream: branch.tracking })
    )
  } else {
    parts.push(t('md3.branches.detail.tracks', { upstream: branch.tracking }))
  }

  const { ahead, behind } = branch
  if (ahead === null || behind === null) {
    // Nothing measured this branch, so neither "in sync" nor a pair of zeroes
    // may be printed: both read as an answer, and this is the absence of one.
    parts.push(t('md3.branches.detail.notCompared'))
  } else if (ahead > 0 || behind > 0) {
    parts.push(
      t('md3.branches.detail.diverged', {
        ahead: String(ahead),
        behind: String(behind),
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

/**
 * Every focusable control inside one row, in visual order.
 *
 * The selection checkbox is an `input`, not a `button`, so a selector that
 * only names buttons leaves it unreachable by keyboard while looking present
 * on screen — the whole "keyboard equivalent" half of the multi-select
 * contract, lost to one CSS selector.
 */
function rowControls(row: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(
    row.querySelectorAll<HTMLElement>(
      'input[type="checkbox"]:not(:disabled), button:not(:disabled)'
    )
  )
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
    onExportBranches,
    onCopyText,
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
  // Bulk selection
  // ---------------------------------------------------------------------

  /*
   * The bulk selection is the view's own, and separate from `selectedBranchName`
   * — that one drives what the rest of the shell is looking at, and a bulk
   * selection of nine branches has no single answer to that question. Keeping
   * them apart is what lets a user tick nine rows without the pane behind them
   * navigating nine times.
   */
  const [checked, setChecked] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const anchorIndex = React.useRef<number | null>(null)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [gateOpen, setGateOpen] = React.useState(false)
  const deleteButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )
  const exportButtonRef = React.useMemo(
    () => createObservableRef<HTMLButtonElement>(),
    []
  )

  const visibleNames = React.useMemo(() => rows.map(row => row.name), [rows])

  // A branch that leaves the list — deleted, or filtered out — must leave the
  // selection with it. A bulk action running against a name the list no longer
  // holds is the quiet way a "delete 9" deletes 8 and reports 9.
  React.useEffect(() => {
    setChecked(previous => {
      const next = new Set<string>()
      for (const name of visibleNames) {
        if (previous.has(name)) {
          next.add(name)
        }
      }
      return next.size === previous.size ? previous : next
    })
  }, [visibleNames])

  const filtersActive =
    filterText.length > 0 || props.activeChips.length < Md3BranchChips.length

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
          visibleNames,
          previous,
          index,
          intent,
          anchorIndex.current,
          'extend'
        )
        if (intent !== 'range') {
          anchorIndex.current = result.anchor
        }
        return new Set(result.ids)
      })
    },
    [visibleNames]
  )

  const onToggleSelectAll = React.useCallback(() => {
    setChecked(previous => new Set(md3ToggleSelectAll(visibleNames, previous)))
    anchorIndex.current = null
  }, [visibleNames])

  const onInvertSelection = React.useCallback(() => {
    setChecked(previous => new Set(md3InvertSelection(visibleNames, previous)))
    anchorIndex.current = null
  }, [visibleNames])

  const onClearSelection = React.useCallback(() => {
    setChecked(new Set<string>())
    anchorIndex.current = null
  }, [])

  /** What a bulk verb runs over: the ticked rows, or the whole filtered list. */
  const scopeRows = React.useMemo(
    () => md3BulkScope(rows, checked, row => row.name),
    [rows, checked]
  )

  const scopeLabel = md3BulkScopeLabel(
    checked.size,
    rows.length,
    filtersActive
  )

  /*
   * Every partition names what it will skip and why, so the button's own
   * count, the gate's preview and the toast afterwards all describe the same
   * set. A bulk delete that quietly leaves the checked-out branch behind and
   * still reports the full count is the failure this exists to prevent.
   */
  const deletable = React.useMemo(
    () =>
      md3PartitionBulk(
        scopeRows,
        row => !row.isCurrent && row.group !== 'Remote',
        t('md3.branches.bulkSkipCurrent')
      ),
    [scopeRows]
  )

  const hideable = React.useMemo(
    () =>
      md3PartitionBulk(
        scopeRows,
        row => row.canHide !== false,
        t('md3.branches.bulkSkipCannotHide')
      ),
    [scopeRows]
  )

  const onBulkPin = React.useCallback(() => {
    const handler = rowHandlers?.onTogglePin
    if (handler === undefined) {
      return
    }
    for (const row of scopeRows) {
      handler(row)
    }
  }, [rowHandlers, scopeRows])

  const onBulkHide = React.useCallback(() => {
    const handler = rowHandlers?.onHideBranch
    if (handler === undefined) {
      return
    }
    for (const row of hideable.applied) {
      handler(row)
    }
    const skipped = md3BulkPartitionSummary(hideable)
    if (skipped !== null) {
      notify(skipped, { kind: 'warning' })
    }
  }, [rowHandlers, hideable])

  const onBulkCopyNames = React.useCallback(() => {
    if (onCopyText === undefined) {
      return
    }
    onCopyText(scopeRows.map(row => row.name).join('\n'))
  }, [onCopyText, scopeRows])

  const onRequestBulkDelete = React.useCallback(() => setGateOpen(true), [])

  const onConfirmBulkDelete = React.useCallback(() => {
    const handler = rowHandlers?.onDeleteBranch
    setGateOpen(false)
    if (handler === undefined) {
      return
    }
    for (const row of deletable.applied) {
      handler(row)
    }
    const skipped = md3BulkPartitionSummary(deletable)
    if (skipped !== null) {
      notify(skipped, { kind: 'warning' })
    }
    onClearSelection()
  }, [rowHandlers, deletable, onClearSelection])

  const runExport = React.useCallback(
    (format: Md3ListExportFormat) => {
      if (onExportBranches === undefined) {
        return
      }
      const payload = serializeMd3ListExport(
        scopeRows.map(md3BranchExportRecord),
        {
          columns: Md3BranchExportColumns,
          collectionName: 'branches',
          recordName: 'branch',
          title: 'Branches',
          baseName: 'branches',
        },
        format,
        { scope: scopeLabel }
      )
      setExportOpen(false)
      onExportBranches(payload, scopeRows)
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
    [onExportBranches, scopeRows, scopeLabel]
  )

  const exportMenuSpec = React.useMemo(
    () => md3BulkExportMenuSpec(Md3BranchExportColumns, scopeLabel, runExport),
    [scopeLabel, runExport]
  )

  const bulkActions = React.useMemo((): ReadonlyArray<IMd3BulkAction> => {
    const actions: Array<IMd3BulkAction> = []
    if (rowHandlers?.onTogglePin !== undefined) {
      actions.push({
        id: 'pin',
        label: t('md3.branches.bulkPin'),
        icon: 'push_pin',
        disabled: scopeRows.length === 0,
        onClick: onBulkPin,
      })
    }
    if (rowHandlers?.onHideBranch !== undefined) {
      actions.push({
        id: 'hide',
        label: t('md3.branches.bulkHide'),
        // `block`, the same glyph the row menu's own Hide uses: the bundled
        // subset carries no `visibility_off`, and a name the font does not
        // have renders the literal English word rather than a glyph.
        icon: 'block',
        disabled: hideable.applied.length === 0,
        onClick: onBulkHide,
      })
    }
    if (onCopyText !== undefined) {
      actions.push({
        id: 'copyNames',
        label: t('md3.branches.bulkCopyNames'),
        icon: 'content_copy',
        disabled: scopeRows.length === 0,
        onClick: onBulkCopyNames,
      })
    }
    if (rowHandlers?.onDeleteBranch !== undefined) {
      actions.push({
        id: 'delete',
        label: t('md3.branches.bulkDelete'),
        icon: 'delete_sweep',
        destructive: true,
        hasPopup: 'dialog',
        buttonRef: deleteButtonRef,
        disabled: deletable.applied.length === 0,
        onClick: onRequestBulkDelete,
      })
    }
    return actions
  }, [
    rowHandlers,
    onCopyText,
    scopeRows,
    hideable,
    deletable,
    onBulkPin,
    onBulkHide,
    onBulkCopyNames,
    onRequestBulkDelete,
    deleteButtonRef,
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
   * The row's own keyboard route into the selection.
   *
   * Ctrl+Space ticks the focused row and Ctrl+Shift+Space extends the range,
   * matching what Ctrl-click and Shift-click do with a pointer. Plain Space
   * still checks the branch out, because that is what it did before and no
   * capability may be taken away; everything else falls through to the grid's
   * existing navigation.
   */
  const onRowKeyDownWithSelection = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
        const index = rows.findIndex(
          row => row.name === event.currentTarget.dataset.branchName
        )
        if (index !== -1) {
          event.preventDefault()
          toggleChecked(index, event.shiftKey)
          return
        }
      }
      onRowKeyDown(event)
    },
    [rows, toggleChecked, onRowKeyDown]
  )

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

        <Md3BulkBar
          listId="branches"
          label={t('md3.branches.bulkLabel')}
          visibleIds={visibleNames}
          selected={checked}
          filtered={filtersActive}
          scopeLabel={scopeLabel}
          actions={bulkActions}
          onToggleSelectAll={onToggleSelectAll}
          onInvertSelection={onInvertSelection}
          onClearSelection={onClearSelection}
          onExport={onExportBranches === undefined ? undefined : runExport}
          exportColumns={Md3BranchExportColumns}
          onOpenExport={
            onExportBranches === undefined
              ? undefined
              : () => setExportOpen(true)
          }
          exportButtonRef={exportButtonRef}
        />

        {rows.length === 0 ? (
          <div className="md3-branches__list" onContextMenu={onListContextMenu}>
            <Md3EmptyState
              message={tFunny('md3.branches.empty')}
              onAction={onResetFilters}
            />
          </div>
        ) : (
          <div
            className="md3-branches__list"
            role="grid"
            aria-label={t('md3.branches.listLabel')}
            aria-rowcount={totalRowCount}
            aria-colcount={5}
            aria-multiselectable={true}
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
                    onKeyDown={onRowKeyDownWithSelection}
                    onContextMenu={onRowContextMenu}
                  >
                    <div
                      role="gridcell"
                      className="md3-branches__select-cell"
                    >
                      <input
                        type="checkbox"
                        className="md3-bulk-bar__checkbox"
                        data-row-index={index}
                        checked={checked.has(row.name)}
                        aria-label={t('md3.branches.row.select', {
                          name: row.name,
                        })}
                        /*
                         * `-1` because the row is the tab stop: a grid with
                         * forty branches would otherwise cost forty Tabs to
                         * cross. The arrow keys reach the box through the
                         * row's own Left/Right cell navigation.
                         */
                        tabIndex={-1}
                        onMouseDown={onCheckboxPointer}
                        onClick={onCheckboxPointer}
                        onKeyDown={onCheckboxKeyDown}
                        onChange={onCheckboxChange}
                      />
                    </div>

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
                      {row.ahead !== null && row.ahead > 0 ? (
                        <span className="md3-branches__pill md3-branches__pill--ahead">
                          <span aria-hidden={true}>{`↑${row.ahead}`}</span>
                          <span className="sr-only">
                            {t('md3.branches.aheadLabel', {
                              count: String(row.ahead),
                            })}
                          </span>
                        </span>
                      ) : null}
                      {row.behind !== null && row.behind > 0 ? (
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

      {exportOpen ? (
        <Md3MenuOverlay
          spec={exportMenuSpec}
          onDismiss={() => setExportOpen(false)}
          onOpenRegexBuilder={props.onOpenRegexBuilder}
          returnFocusTo={exportButtonRef}
        />
      ) : null}

      {gateOpen ? (
        <Md3DestructiveGate
          actionId="branches-bulk-delete"
          icon="delete_sweep"
          title={t('md3.branches.gate.title', {
            count: String(deletable.applied.length),
          })}
          summary={t('md3.branches.gate.summary', {
            count: String(deletable.applied.length),
            scope: scopeLabel,
          })}
          /*
           * The preview is the point of the gate, not decoration: "delete 9
           * branches" is a number, and a number is not something a person can
           * check. The names are, and the skipped rows are named beside them
           * so the count in the title and the work the button does are the
           * same set.
           */
          preview={deletable.applied.map(row => row.name)}
          previewExcluded={deletable.excluded.map(row => row.name)}
          previewExcludedReason={deletable.reason}
          irreversible={t('md3.branches.gate.irreversible')}
          targetKeyLabel={t('md3.branches.gate.keyTarget', {
            count: String(deletable.applied.length),
            scope: scopeLabel,
          })}
          effectKeyLabel={t('md3.branches.gate.keyEffect')}
          confirmLabel={t('md3.branches.gate.confirm', {
            count: String(deletable.applied.length),
          })}
          anchorTo={deleteButtonRef}
          onConfirm={onConfirmBulkDelete}
          onDismissed={() => setGateOpen(false)}
        />
      ) : null}
    </div>
  )
}
