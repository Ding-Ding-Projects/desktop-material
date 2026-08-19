import { t } from '../../lib/i18n'
import { MaterialSymbolName } from '../lib/material-symbol'
import { IMd3MenuItem, MenuKind } from './md3-menu-specs'

/**
 * The capabilities the design contract never drew, and the menu each one lives
 * in now.
 *
 * The eight destination views are faithful to `design/History MD3.dc.html`,
 * and the design is a prototype of one repository with one of everything. Real
 * surfaces this fork already shipped carry more: a compare-to-branch picker, an
 * unreachable-commits dialog, four Actions manager tabs, the full native file
 * context menu, eleven more branch row actions, the repository list menu, the
 * new-agent-session form. None of that is in the contract, and a rewrite that
 * simply followed the contract would drop every one of them.
 *
 * So they are enumerated here, by hand, with the menu each belongs to. A
 * hand-written list is the point: a catalogue derived from whatever the host
 * happened to wire would validate the entries that were there and say nothing
 * about the ones that had gone. `md3UnplacedCarryOverCommands` answers the
 * question this module exists for — which of them has no action behind it —
 * so a host or a test can fail on a gap instead of discovering it in use.
 *
 * Nothing here performs an action. A host supplies the handler that opens the
 * real surface, exactly as `md3-menu-specs.ts` does for the contract's own
 * menus.
 */

/** Every carried-over capability, by id. */
export type Md3CarryOverCommand =
  // History
  | 'compareToBranch'
  | 'unreachableCommits'
  // Actions
  | 'workflowManager'
  | 'workflowCatalog'
  | 'cacheManager'
  | 'runnerManager'
  | 'refreshRuns'
  | 'runCount'
  | 'jumpToAttempt'
  // `logMatchNavigation` — prev/next match stepping — was catalogued here and
  // is deliberately retired rather than rehomed. The contract FILTERS the log
  // rather than dimming it, so every match is on screen at once and there is
  // nothing to step between; `app/test/fixtures/feature-ledger.json` records
  // the retirement and that reason. Log GROUP collapse is not superseded by
  // filtering — folding a `::group::` section is structure, not search — so it
  // stays, and `Md3ActionsView` implements it.
  | 'logGroupCollapse'
  | 'paneDivider'
  // Changes — the native file context menu beyond the contract's five
  | 'discardFile'
  | 'permanentlyDiscardFile'
  | 'stashFile'
  | 'ignoreFolder'
  | 'copyRelativePath'
  | 'copySelectedPaths'
  | 'openWithDefaultProgram'
  | 'cheapLfsPin'
  | 'includeSelectedFiles'
  | 'excludeSelectedFiles'
  // Changes — the list context menu
  | 'discardAll'
  | 'permanentlyDiscardAll'
  | 'stashAll'
  // Branches — the row menu beyond the contract's five
  | 'mergeAndDelete'
  | 'compareBranch'
  | 'copyBranchName'
  | 'togglePinBranch'
  | 'hideBranch'
  | 'soloBranch'
  | 'restoreBranchVisibility'
  | 'checkoutInNewWorktree'
  | 'switchToWorktree'
  | 'viewBranchOnForge'
  | 'viewPullRequestOnForge'
  // Branches — the list context menu
  | 'sortBranchesByName'
  | 'sortBranchesByRecent'
  | 'showPullRequests'
  | 'fetchRemoteBranches'
  | 'restoreAllBranches'
  | 'bulkDeleteBranches'
  // Repositories
  | 'repositoryListMenu'
  // Agents
  | 'newAgentSession'

/** Every command, written out. Used by the completeness report below. */
export const Md3CarryOverCommands: ReadonlyArray<Md3CarryOverCommand> = [
  'compareToBranch',
  'unreachableCommits',
  'workflowManager',
  'workflowCatalog',
  'cacheManager',
  'runnerManager',
  'refreshRuns',
  'runCount',
  'jumpToAttempt',
  'logGroupCollapse',
  'paneDivider',
  'discardFile',
  'permanentlyDiscardFile',
  'stashFile',
  'ignoreFolder',
  'copyRelativePath',
  'copySelectedPaths',
  'openWithDefaultProgram',
  'cheapLfsPin',
  'includeSelectedFiles',
  'excludeSelectedFiles',
  'discardAll',
  'permanentlyDiscardAll',
  'stashAll',
  'mergeAndDelete',
  'compareBranch',
  'copyBranchName',
  'togglePinBranch',
  'hideBranch',
  'soloBranch',
  'restoreBranchVisibility',
  'checkoutInNewWorktree',
  'switchToWorktree',
  'viewBranchOnForge',
  'viewPullRequestOnForge',
  'sortBranchesByName',
  'sortBranchesByRecent',
  'showPullRequests',
  'fetchRemoteBranches',
  'restoreAllBranches',
  'bulkDeleteBranches',
  'repositoryListMenu',
  'newAgentSession',
]

interface IMd3CarryOverDefinition {
  /** The menu this command is reachable from. */
  readonly menu: MenuKind

  readonly icon: MaterialSymbolName

  /** Its label's translation key. */
  readonly labelKey: Parameters<typeof t>[0]

  /**
   * Whether the action is destructive and must therefore go through the
   * shared two-key gate before it runs. A host reads this rather than
   * deciding per call site, so one of them cannot quietly skip the gate.
   */
  readonly destructive?: true
}

/**
 * The catalogue. Order within a menu is the order the items are appended in.
 */
const Definitions: Readonly<
  Record<Md3CarryOverCommand, IMd3CarryOverDefinition>
> = {
  compareToBranch: {
    menu: 'listMenu',
    icon: 'difference',
    labelKey: 'md3.shell.carry.compareToBranch',
  },
  unreachableCommits: {
    menu: 'rowMenu',
    icon: 'history_toggle_off',
    labelKey: 'md3.shell.carry.unreachableCommits',
  },
  workflowManager: {
    menu: 'paneMenu',
    icon: 'tune',
    labelKey: 'md3.shell.carry.workflowManager',
  },
  workflowCatalog: {
    menu: 'paneMenu',
    icon: 'library_add_check',
    labelKey: 'md3.shell.carry.workflowCatalog',
  },
  cacheManager: {
    menu: 'paneMenu',
    icon: 'database',
    labelKey: 'md3.shell.carry.cacheManager',
  },
  runnerManager: {
    menu: 'paneMenu',
    icon: 'dns',
    labelKey: 'md3.shell.carry.runnerManager',
  },
  refreshRuns: {
    menu: 'paneMenu',
    icon: 'refresh',
    labelKey: 'md3.shell.carry.refreshRuns',
  },
  runCount: {
    menu: 'paneMenu',
    icon: 'label',
    labelKey: 'md3.shell.carry.runCount',
  },
  jumpToAttempt: {
    menu: 'runMenu',
    icon: 'replay',
    labelKey: 'md3.shell.carry.jumpToAttempt',
  },
  logGroupCollapse: {
    menu: 'runMenu',
    icon: 'unfold_more',
    labelKey: 'md3.shell.carry.logGroupCollapse',
  },
  paneDivider: {
    menu: 'paneMenu',
    icon: 'vertical_split',
    labelKey: 'md3.shell.carry.paneDivider',
  },
  discardFile: {
    menu: 'changeRowMenu',
    icon: 'undo',
    labelKey: 'md3.shell.carry.discardFile',
    destructive: true,
  },
  permanentlyDiscardFile: {
    menu: 'changeRowMenu',
    icon: 'delete_sweep',
    labelKey: 'md3.shell.carry.permanentlyDiscardFile',
    destructive: true,
  },
  stashFile: {
    menu: 'changeRowMenu',
    icon: 'inventory_2',
    labelKey: 'md3.shell.carry.stashFile',
  },
  ignoreFolder: {
    menu: 'changeRowMenu',
    icon: 'folder',
    labelKey: 'md3.shell.carry.ignoreFolder',
  },
  copyRelativePath: {
    menu: 'changeRowMenu',
    icon: 'content_copy',
    labelKey: 'md3.shell.carry.copyRelativePath',
  },
  copySelectedPaths: {
    menu: 'changeRowMenu',
    icon: 'content_copy',
    labelKey: 'md3.shell.carry.copySelectedPaths',
  },
  openWithDefaultProgram: {
    menu: 'changeRowMenu',
    icon: 'open_in_new',
    labelKey: 'md3.shell.carry.openWithDefaultProgram',
  },
  cheapLfsPin: {
    menu: 'changeRowMenu',
    icon: 'push_pin',
    labelKey: 'md3.shell.carry.cheapLfsPin',
  },
  includeSelectedFiles: {
    menu: 'changeRowMenu',
    icon: 'check_box',
    labelKey: 'md3.shell.carry.includeSelectedFiles',
  },
  excludeSelectedFiles: {
    menu: 'changeRowMenu',
    icon: 'check_box_outline_blank',
    labelKey: 'md3.shell.carry.excludeSelectedFiles',
  },
  discardAll: {
    menu: 'changesMenu',
    icon: 'undo',
    labelKey: 'md3.shell.carry.discardAll',
    destructive: true,
  },
  permanentlyDiscardAll: {
    menu: 'changesMenu',
    icon: 'delete_sweep',
    labelKey: 'md3.shell.carry.permanentlyDiscardAll',
    destructive: true,
  },
  stashAll: {
    menu: 'changesMenu',
    icon: 'inventory_2',
    labelKey: 'md3.shell.carry.stashAll',
  },
  mergeAndDelete: {
    menu: 'branchRowMenu',
    icon: 'merge',
    labelKey: 'md3.shell.carry.mergeAndDelete',
    destructive: true,
  },
  compareBranch: {
    menu: 'branchRowMenu',
    icon: 'difference',
    labelKey: 'md3.shell.carry.compareBranch',
  },
  copyBranchName: {
    menu: 'branchRowMenu',
    icon: 'content_copy',
    labelKey: 'md3.shell.carry.copyBranchName',
  },
  togglePinBranch: {
    menu: 'branchRowMenu',
    icon: 'push_pin',
    labelKey: 'md3.shell.carry.togglePinBranch',
  },
  hideBranch: {
    menu: 'branchRowMenu',
    icon: 'do_not_disturb_on',
    labelKey: 'md3.shell.carry.hideBranch',
  },
  soloBranch: {
    menu: 'branchRowMenu',
    icon: 'filter_list',
    labelKey: 'md3.shell.carry.soloBranch',
  },
  restoreBranchVisibility: {
    menu: 'branchRowMenu',
    icon: 'visibility',
    labelKey: 'md3.shell.carry.restoreBranchVisibility',
  },
  checkoutInNewWorktree: {
    menu: 'branchRowMenu',
    icon: 'account_tree',
    labelKey: 'md3.shell.carry.checkoutInNewWorktree',
  },
  switchToWorktree: {
    menu: 'branchRowMenu',
    icon: 'account_tree',
    labelKey: 'md3.shell.carry.switchToWorktree',
  },
  viewBranchOnForge: {
    menu: 'branchRowMenu',
    icon: 'open_in_new',
    labelKey: 'md3.shell.carry.viewBranchOnForge',
  },
  viewPullRequestOnForge: {
    menu: 'branchRowMenu',
    icon: 'open_in_new',
    labelKey: 'md3.shell.carry.viewPullRequestOnForge',
  },
  sortBranchesByName: {
    menu: 'listMenu',
    icon: 'sort',
    labelKey: 'md3.shell.carry.sortBranchesByName',
  },
  sortBranchesByRecent: {
    menu: 'listMenu',
    icon: 'schedule',
    labelKey: 'md3.shell.carry.sortBranchesByRecent',
  },
  showPullRequests: {
    menu: 'listMenu',
    icon: 'call_merge',
    labelKey: 'md3.shell.carry.showPullRequests',
  },
  fetchRemoteBranches: {
    menu: 'listMenu',
    icon: 'sync',
    labelKey: 'md3.shell.carry.fetchRemoteBranches',
  },
  restoreAllBranches: {
    menu: 'listMenu',
    icon: 'visibility',
    labelKey: 'md3.shell.carry.restoreAllBranches',
  },
  bulkDeleteBranches: {
    menu: 'listMenu',
    icon: 'delete',
    labelKey: 'md3.shell.carry.bulkDeleteBranches',
    destructive: true,
  },
  repositoryListMenu: {
    menu: 'repoRowMenu',
    icon: 'book_2',
    labelKey: 'md3.shell.carry.repositoryListMenu',
  },
  newAgentSession: {
    menu: 'paneMenu',
    icon: 'add_circle',
    labelKey: 'md3.shell.carry.newAgentSession',
  },
}

/** Which menu a carried-over capability lives in. */
export function md3CarryOverMenu(command: Md3CarryOverCommand): MenuKind {
  return Definitions[command].menu
}

/** Whether a carried-over capability must go through the destructive gate. */
export function md3CarryOverIsDestructive(
  command: Md3CarryOverCommand
): boolean {
  return Definitions[command].destructive === true
}

/**
 * The actions behind the catalogue.
 *
 * A command with no handler is deliberately omitted from the built menus
 * rather than rendered as a row that does nothing — a control that looks like
 * it works and does not is the exact defect this repository forbids
 * everywhere else. `md3UnplacedCarryOverCommands` names those omissions so
 * they are visible rather than silent.
 */
export type Md3CarryOverHandlers = Partial<
  Record<Md3CarryOverCommand, () => void>
>

/**
 * Which carried-over capabilities have no action behind them, in catalogue
 * order.
 *
 * A host reports these; a test asserts the list is the one somebody decided
 * on. Either way a gap is a fact somebody can read rather than a row that
 * quietly never appeared.
 */
export function md3UnplacedCarryOverCommands(
  handlers: Md3CarryOverHandlers
): ReadonlyArray<Md3CarryOverCommand> {
  return Md3CarryOverCommands.filter(command => handlers[command] === undefined)
}

/**
 * Build the `menuExtensions` map the shell takes, from whichever handlers a
 * host has supplied.
 *
 * @param handlers The actions. Only commands with one produce an item.
 * @param hints    Optional trailing hints, keyed by command — the run count's
 *                 own number, for instance.
 */
export function buildMd3CarryOverExtensions(
  handlers: Md3CarryOverHandlers,
  hints: Partial<Record<Md3CarryOverCommand, string>> = {}
): Partial<Record<MenuKind, ReadonlyArray<IMd3MenuItem>>> {
  const built: Partial<Record<MenuKind, Array<IMd3MenuItem>>> = {}

  for (const command of Md3CarryOverCommands) {
    const onClick = handlers[command]
    if (onClick === undefined) {
      continue
    }

    const definition = Definitions[command]
    const item: IMd3MenuItem = {
      id: `carry-${command}`,
      label: t(definition.labelKey),
      icon: definition.icon,
      hint: hints[command] ?? '',
      onClick,
    }

    const bucket = built[definition.menu]
    if (bucket === undefined) {
      built[definition.menu] = [item]
    } else {
      bucket.push(item)
    }
  }

  return built
}
