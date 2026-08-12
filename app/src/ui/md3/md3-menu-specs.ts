import { t } from '../../lib/i18n'
import { MaterialSymbolName } from '../lib/material-symbol'

/**
 * Every filterable menu the MD3 shell contract defines
 * (`design/History MD3.dc.html`, `menuSpec()`), as data.
 *
 * The contract builds each menu inline and closes its items over component
 * state. This module keeps the same titles, glyphs, widths, placeholders,
 * labels and hints but performs no side effects at all: a caller supplies the
 * current values through `IMd3MenuContext` and the actions through
 * `IMd3MenuHandlers`, and `getMenuSpec` returns a plain description of the
 * surface. That is what lets the same spec be rendered, filtered, tested and
 * screenshotted without a running application behind it.
 */

/**
 * The 23 menu kinds `menuSpec()` switches on.
 *
 * `builder` and `composeDialog` are deliberately absent: the contract returns
 * `null` for both because they are dialogs with their own layout, not entries
 * in this generic overlay.
 */
export type MenuKind =
  | 'palette'
  | 'settings'
  | 'account'
  | 'repoMenu'
  | 'branchMenu'
  | 'paneMenu'
  | 'listMenu'
  | 'diffOptions'
  | 'fileMenu'
  | 'rowMenu'
  | 'changesMenu'
  | 'changeRowMenu'
  | 'branchRowMenu'
  | 'runMenu'
  | 'repoRowMenu'
  | 'compose'
  | 'agentAccess'
  | 'inboxRowMenu'
  | 'agentRowMenu'
  | 'terminalMenu'
  | 'drawerMenu'
  | 'searchMenu'
  | 'guide'

/**
 * Every kind, written out by hand.
 *
 * A contract test that derived this list from the specs themselves would pass
 * on a file that had lost half of them — it would only ever check the kinds
 * that were still there. Enumerating them separately is what makes a missing
 * menu a failure rather than a smaller green run.
 */
export const MenuKinds: ReadonlyArray<MenuKind> = [
  'palette',
  'settings',
  'account',
  'repoMenu',
  'branchMenu',
  'paneMenu',
  'listMenu',
  'diffOptions',
  'fileMenu',
  'rowMenu',
  'changesMenu',
  'changeRowMenu',
  'branchRowMenu',
  'runMenu',
  'repoRowMenu',
  'compose',
  'agentAccess',
  'inboxRowMenu',
  'agentRowMenu',
  'terminalMenu',
  'drawerMenu',
  'searchMenu',
  'guide',
]

/** The shell's top-level destinations, as the contract's `dest` state names them. */
export type Md3MenuDestination =
  | 'Repositories'
  | 'Changes'
  | 'History'
  | 'Branches'
  | 'Actions'
  | 'Inbox'
  | 'Terminal'
  | 'Agents'

/** The settings the contract's menus flip rather than open a surface for. */
export type Md3MenuToggle =
  | 'theme'
  | 'absoluteDates'
  | 'commitGraph'
  | 'wrapLongLines'
  | 'drawer'

/** A three-state permission, as the agent-access menu reports it. */
export type Md3MenuPermission = 'on' | 'ask' | 'off'

/**
 * Every named action a menu item can ask for.
 *
 * Navigation, toggles, repository/branch/account switching and opening another
 * menu each have their own handler, so this union holds only the commands that
 * carry no payload beyond their own identity.
 */
export type Md3MenuCommand =
  | 'commitAndPushAllChanges'
  | 'fetchOrigin'
  | 'pullAllRepositories'
  | 'mergeAllBranches'
  | 'openAutomationSettings'
  | 'openCopilotPreferences'
  | 'openUndoHistoryManager'
  | 'openGitSettings'
  | 'openIntegrationSettings'
  | 'openNotificationSettings'
  | 'addGitHubAccount'
  | 'addGitLabSelfHostedAccount'
  | 'commitAndPushWithCopilotMessage'
  | 'pullOrigin'
  | 'forcePush'
  | 'buildAndRun'
  | 'sortCommitsNewestFirst'
  | 'sortCommitsOldestFirst'
  | 'groupCommitsByDay'
  | 'selectMultipleCommits'
  | 'showUnifiedDiff'
  | 'showSplitDiff'
  | 'hideWhitespaceChanges'
  | 'increaseDiffContextLines'
  | 'openFileInExternalEditor'
  | 'copyFilePath'
  | 'openFileHistory'
  | 'openBlame'
  | 'discardFileChanges'
  | 'ignoreFile'
  | 'ignoreFileType'
  | 'revealInFileManager'
  | 'revertCommit'
  | 'cherryPickCommit'
  | 'createTagAtCommit'
  | 'resetToCommit'
  | 'copyCommitSha'
  | 'viewCommitOnGitHub'
  | 'includeAllFiles'
  | 'excludeAllFiles'
  | 'stashAllChanges'
  | 'discardAllChanges'
  | 'groupChangesByFolder'
  | 'mergeBranchIntoCurrent'
  | 'rebaseBranchOntoCurrent'
  | 'openPullRequest'
  | 'renameBranch'
  | 'deleteBranch'
  | 'rerunAllJobs'
  | 'rerunFailedJobs'
  | 'cancelRun'
  | 'dispatchWorkflow'
  | 'viewRawLogs'
  | 'fetchRepository'
  | 'pullRepository'
  | 'changeRepositoryAlias'
  | 'moveRepositoryToGroup'
  | 'removeRepositoryFromList'
  | 'writeCommitMessageWithCopilot'
  | 'addCoAuthors'
  | 'commitAndPush'
  | 'configureAgentReadAccess'
  | 'configureAgentCommitAccess'
  | 'configureAgentPushAccess'
  | 'openAgentSessionLog'
  | 'markNotificationRead'
  | 'markNotificationUnread'
  | 'openNotificationInBrowser'
  | 'muteNotificationThread'
  | 'deleteNotification'
  | 'resumeAgentSession'
  | 'pauseAgentSession'
  | 'duplicateAgentSession'
  | 'deleteAgentSession'
  | 'copyTerminalSelection'
  | 'pasteIntoTerminal'
  | 'clearTerminalOutput'
  | 'splitShell'
  | 'openSystemTerminal'
  | 'newShellSession'
  | 'toggleSearchRegexMode'
  | 'clearSearchField'
  | 'showRegexGuideEntry'

/** One signed-in account, as the accounts menu lists it. */
export interface IMd3MenuAccount {
  readonly name: string

  /** The forge host — `github.com`, `gitlab.internal`. */
  readonly host: string
}

/** One repository row in the repository switcher. */
export interface IMd3MenuRepositorySummary {
  readonly name: string

  readonly org: string

  /**
   * The already-localized working-tree summary the contract shows as the
   * hint — "12 changes", "Clean". It is copy about the repository rather than
   * about the menu, so the caller owns its wording.
   */
  readonly changesSummary: string
}

/** One branch row in the branch switcher. */
export interface IMd3MenuBranchSummary {
  readonly name: string

  /**
   * The already-localized group the contract shows as the hint — "Local",
   * "Remote". Owned by the caller for the same reason as `changesSummary`.
   */
  readonly group: string
}

/**
 * Everything the contract's menus read out of component state.
 *
 * Every field is required. A menu that silently fell back to a default would
 * report a toggle as off when it is on, which is exactly the kind of quiet
 * wrongness a hint exists to prevent; `defaultMd3MenuContext` exists for tests
 * and previews that want the contract's own sample values.
 */
export interface IMd3MenuContext {
  /** The active theme, shown as the appearance row's hint. */
  readonly theme: 'dark' | 'light'

  /** The checked-out branch, named by the merge, rebase and merge-all labels. */
  readonly branch: string

  /** The selected commit's short SHA, used by the commit-actions title. */
  readonly selectedCommitSha: string

  /** The signed-in accounts, and which of them is active. */
  readonly accounts: ReadonlyArray<IMd3MenuAccount>

  readonly activeAccount: string

  /** The repositories offered by the switcher, and which one is open. */
  readonly repositories: ReadonlyArray<IMd3MenuRepositorySummary>

  readonly repository: string

  /** The branches offered by the switcher. */
  readonly branches: ReadonlyArray<IMd3MenuBranchSummary>

  readonly absoluteDates: boolean

  readonly automationEnabled: boolean

  /** How many entries the undo-history manager currently holds. */
  readonly undoHistoryEntryCount: number

  readonly commitSortOrder: 'newest' | 'oldest'

  readonly groupCommitsByDay: boolean

  readonly commitGraphVisible: boolean

  readonly diffMode: 'unified' | 'split'

  readonly wrapLongLines: boolean

  readonly hideWhitespaceChanges: boolean

  readonly diffContextLines: number

  readonly groupChangesByFolder: boolean

  readonly agentReadAccess: Md3MenuPermission

  readonly agentCommitAccess: Md3MenuPermission

  readonly agentPushAccess: Md3MenuPermission

  /** Whether the navigation drawer is expanded, which flips its own label. */
  readonly drawerExpanded: boolean
}

/**
 * The callbacks a menu item invokes. The spec module never mutates anything
 * itself, so a caller can render a menu in a test without a store behind it.
 */
export interface IMd3MenuHandlers {
  readonly onCommand: (command: Md3MenuCommand) => void

  readonly onNavigate: (destination: Md3MenuDestination) => void

  readonly onToggle: (toggle: Md3MenuToggle) => void

  readonly onSwitchRepository: (repository: string) => void

  readonly onSwitchBranch: (branch: string) => void

  readonly onSwitchAccount: (account: string) => void

  /** Replace this menu with another one — settings, accounts, the guide. */
  readonly onOpenMenu: (kind: MenuKind) => void

  /** Open the regex builder seeded with the given pattern. */
  readonly onOpenRegexBuilder: (pattern: string) => void
}

/** One row of a menu. */
export interface IMd3MenuItem {
  /** Unique within its menu. Used for React keys and `aria-activedescendant`. */
  readonly id: string

  readonly label: string

  readonly icon: MaterialSymbolName

  /** The trailing shortcut or state. Empty means the contract hides it. */
  readonly hint: string

  readonly onClick: () => void
}

/** A complete menu, ready to render. */
export interface IMd3MenuSpec {
  readonly kind: MenuKind

  readonly title: string

  readonly icon: MaterialSymbolName

  /** The panel's `max-width` in CSS pixels, straight from the contract. */
  readonly width: number

  /**
   * Whether the filter row is rendered.
   *
   * `renderVals()` forces this to `true` for every menu after `menuSpec()`
   * returns, so in practice every menu is filterable and this is always
   * `true`. It stays on the interface because the overlay honours it, and a
   * caller assembling a spec by hand may legitimately want a menu without one.
   */
  readonly hasFilter: boolean

  readonly filterPlaceholder: string

  readonly items: ReadonlyArray<IMd3MenuItem>

  /**
   * A standing note under the items, for a menu whose choices need one fact
   * stated once rather than repeated on every row.
   *
   * The export pickers use it for the encoding and the field schema: the
   * per-format row already carries what that format would drop, and the line
   * that never changes belongs under them rather than ten times over. Omit it
   * and nothing is rendered — no menu in the contract has one.
   */
  readonly footer?: string
}

// The contract's shortcut hints. These are key notation rather than prose, so
// they are literals rather than translated copy — `⌘⏎` reads the same in every
// language, and translating it would name a key that does not exist.
const ShortcutCommitAndPush = '⌘⏎'
const ShortcutFetch = '⌘R'
const ShortcutPullAll = '⇧⌘P'
const ShortcutPullOrigin = '⌘⇧P'
const ShortcutRegexBuilder = '⌥R'
const ShortcutSettings = '⌘,'
const ShortcutOpenInEditor = '⌘⇧A'
const ShortcutPullRequest = '⌘R'
const ShortcutCopy = '⌘C'
const ShortcutPaste = '⌘V'
const ShortcutClear = '⌘K'
const ShortcutMultiSelect = '⇧click'
const DestinationShortcuts: Readonly<Record<Md3MenuDestination, string>> = {
  Repositories: '⌘0',
  Changes: '⌘1',
  History: '⌘2',
  Branches: '⌘3',
  Actions: '⌘4',
  Inbox: '⌘5',
  Terminal: '⌘6',
  Agents: '⌘7',
}

/** No hint at all — the contract's `hintStyle` hides the span entirely. */
const NoHint = ''

function onOffHint(value: boolean): string {
  return value ? t('md3.menu.hint.on') : t('md3.menu.hint.off')
}

function activeHint(value: boolean): string {
  return value ? t('md3.menu.hint.active') : NoHint
}

function permissionHint(value: Md3MenuPermission): string {
  switch (value) {
    case 'on':
      return t('md3.menu.hint.on')
    case 'ask':
      return t('md3.menu.hint.ask')
    case 'off':
      return t('md3.menu.hint.off')
    default:
      return assertNever(value, `unknown permission ${value}`)
  }
}

function themeHint(theme: 'dark' | 'light'): string {
  return theme === 'dark' ? t('md3.menu.theme.dark') : t('md3.menu.theme.light')
}

function assertNever(value: never, message: string): never {
  throw new Error(message)
}

/**
 * The contract's sample state, so a test or a preview can build any menu
 * without assembling twenty-odd fields by hand. Production callers pass their
 * own values; this is not a fallback and nothing in `getMenuSpec` reaches for
 * it.
 */
export const defaultMd3MenuContext: IMd3MenuContext = {
  theme: 'dark',
  branch: 'development',
  selectedCommitSha: '4f1c9ae',
  accounts: [
    { name: 'Alice Lindqvist', host: 'github.com' },
    { name: 'a.lindqvist', host: 'gitlab.internal' },
  ],
  activeAccount: 'Alice Lindqvist',
  repositories: [],
  repository: 'desktop-material',
  branches: [],
  absoluteDates: false,
  automationEnabled: false,
  undoHistoryEntryCount: 18,
  commitSortOrder: 'newest',
  groupCommitsByDay: true,
  commitGraphVisible: true,
  diffMode: 'unified',
  wrapLongLines: false,
  hideWhitespaceChanges: false,
  diffContextLines: 3,
  groupChangesByFolder: false,
  agentReadAccess: 'on',
  agentCommitAccess: 'ask',
  agentPushAccess: 'off',
  drawerExpanded: true,
}

function paletteSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  return {
    kind: 'palette',
    title: t('md3.menu.palette.title'),
    icon: 'terminal',
    width: 560,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.palette.placeholder'),
    items: [
      {
        id: 'commitPushAll',
        label: t('md3.menu.palette.commitPushAll'),
        icon: 'bolt',
        hint: ShortcutCommitAndPush,
        onClick: () => handlers.onCommand('commitAndPushAllChanges'),
      },
      {
        id: 'fetchOrigin',
        label: t('md3.menu.palette.fetchOrigin'),
        icon: 'sync',
        hint: ShortcutFetch,
        onClick: () => handlers.onCommand('fetchOrigin'),
      },
      {
        id: 'pullAll',
        label: t('md3.menu.palette.pullAll'),
        icon: 'arrow_downward',
        hint: ShortcutPullAll,
        onClick: () => handlers.onCommand('pullAllRepositories'),
      },
      {
        id: 'mergeAll',
        label: t('md3.menu.palette.mergeAll', { branch: context.branch }),
        icon: 'merge',
        hint: NoHint,
        onClick: () => handlers.onCommand('mergeAllBranches'),
      },
      {
        id: 'openRegexBuilder',
        label: t('md3.menu.palette.openRegexBuilder'),
        icon: 'construction',
        hint: ShortcutRegexBuilder,
        onClick: () => handlers.onOpenRegexBuilder(''),
      },
      {
        id: 'goRepositories',
        label: t('md3.menu.palette.goRepositories'),
        icon: 'book_2',
        hint: DestinationShortcuts.Repositories,
        onClick: () => handlers.onNavigate('Repositories'),
      },
      {
        id: 'goChanges',
        label: t('md3.menu.palette.goChanges'),
        icon: 'edit_note',
        hint: DestinationShortcuts.Changes,
        onClick: () => handlers.onNavigate('Changes'),
      },
      {
        id: 'goHistory',
        label: t('md3.menu.palette.goHistory'),
        icon: 'history',
        hint: DestinationShortcuts.History,
        onClick: () => handlers.onNavigate('History'),
      },
      {
        id: 'goActions',
        label: t('md3.menu.palette.goActions'),
        icon: 'play_circle',
        hint: DestinationShortcuts.Actions,
        onClick: () => handlers.onNavigate('Actions'),
      },
      {
        id: 'openSettings',
        label: t('md3.menu.palette.openSettings'),
        icon: 'settings',
        hint: ShortcutSettings,
        onClick: () => handlers.onOpenMenu('settings'),
      },
    ],
  }
}

function settingsSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  return {
    kind: 'settings',
    title: t('md3.menu.settings.title'),
    icon: 'settings',
    width: 520,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.settings.placeholder'),
    items: [
      {
        id: 'appearance',
        label: t('md3.menu.settings.appearance'),
        icon: 'palette',
        hint: themeHint(context.theme),
        onClick: () => handlers.onToggle('theme'),
      },
      {
        id: 'absoluteDates',
        label: t('md3.menu.settings.absoluteDates'),
        icon: 'schedule',
        hint: onOffHint(context.absoluteDates),
        onClick: () => handlers.onToggle('absoluteDates'),
      },
      {
        id: 'automation',
        label: t('md3.menu.settings.automation'),
        icon: 'autorenew',
        hint: onOffHint(context.automationEnabled),
        onClick: () => handlers.onCommand('openAutomationSettings'),
      },
      {
        id: 'accounts',
        label: t('md3.menu.settings.accounts'),
        icon: 'account_circle',
        hint: String(context.accounts.length),
        onClick: () => handlers.onOpenMenu('account'),
      },
      {
        id: 'copilot',
        label: t('md3.menu.settings.copilot'),
        icon: 'smart_toy',
        hint: NoHint,
        onClick: () => handlers.onCommand('openCopilotPreferences'),
      },
      {
        id: 'undoHistory',
        label: t('md3.menu.settings.undoHistory'),
        icon: 'history_toggle_off',
        hint: String(context.undoHistoryEntryCount),
        onClick: () => handlers.onCommand('openUndoHistoryManager'),
      },
      {
        id: 'git',
        label: t('md3.menu.settings.git'),
        icon: 'commit',
        hint: NoHint,
        onClick: () => handlers.onCommand('openGitSettings'),
      },
      {
        id: 'integrations',
        label: t('md3.menu.settings.integrations'),
        icon: 'terminal',
        hint: NoHint,
        onClick: () => handlers.onCommand('openIntegrationSettings'),
      },
      {
        id: 'notifications',
        label: t('md3.menu.settings.notifications'),
        icon: 'notifications',
        hint: NoHint,
        onClick: () => handlers.onCommand('openNotificationSettings'),
      },
    ],
  }
}

function accountSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  const accounts = context.accounts.map<IMd3MenuItem>(account => ({
    id: `account:${account.name}`,
    label: t('md3.menu.account.entry', {
      name: account.name,
      host: account.host,
    }),
    icon: 'person',
    hint:
      account.name === context.activeAccount
        ? t('md3.menu.hint.active')
        : NoHint,
    onClick: () => handlers.onSwitchAccount(account.name),
  }))

  return {
    kind: 'account',
    title: t('md3.menu.account.title'),
    icon: 'account_circle',
    width: 400,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      ...accounts,
      {
        id: 'addGitHub',
        label: t('md3.menu.account.addGitHub'),
        icon: 'add',
        hint: NoHint,
        onClick: () => handlers.onCommand('addGitHubAccount'),
      },
      {
        id: 'addGitLab',
        label: t('md3.menu.account.addGitLab'),
        icon: 'dns',
        hint: NoHint,
        onClick: () => handlers.onCommand('addGitLabSelfHostedAccount'),
      },
    ],
  }
}

function repoMenuSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  const repositories = context.repositories.map<IMd3MenuItem>(repository => ({
    id: `repository:${repository.name}`,
    label: t('md3.menu.repoMenu.entry', {
      name: repository.name,
      org: repository.org,
    }),
    icon: 'book_2',
    hint:
      repository.name === context.repository
        ? t('md3.menu.hint.current')
        : repository.changesSummary,
    onClick: () => handlers.onSwitchRepository(repository.name),
  }))

  return {
    kind: 'repoMenu',
    title: t('md3.menu.repoMenu.title'),
    icon: 'book_2',
    width: 440,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.repoMenu.placeholder'),
    items: [
      ...repositories,
      {
        id: 'browseAll',
        label: t('md3.menu.repoMenu.browseAll'),
        icon: 'list',
        hint: NoHint,
        onClick: () => handlers.onNavigate('Repositories'),
      },
    ],
  }
}

function branchMenuSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  const branches = context.branches.map<IMd3MenuItem>(branch => ({
    id: `branch:${branch.name}`,
    label: branch.name,
    icon: 'merge_type',
    hint:
      branch.name === context.branch
        ? t('md3.menu.hint.current')
        : branch.group,
    onClick: () => handlers.onSwitchBranch(branch.name),
  }))

  return {
    kind: 'branchMenu',
    title: t('md3.menu.branchMenu.title'),
    icon: 'merge_type',
    width: 440,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.branchMenu.placeholder'),
    items: [
      ...branches,
      {
        id: 'browseAll',
        label: t('md3.menu.branchMenu.browseAll'),
        icon: 'list',
        hint: NoHint,
        onClick: () => handlers.onNavigate('Branches'),
      },
    ],
  }
}

function paneMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'paneMenu',
    title: t('md3.menu.paneMenu.title'),
    icon: 'more_vert',
    width: 440,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'commitPushCopilot',
        label: t('md3.menu.paneMenu.commitPushCopilot'),
        icon: 'bolt',
        hint: ShortcutCommitAndPush,
        onClick: () => handlers.onCommand('commitAndPushWithCopilotMessage'),
      },
      {
        id: 'pullOrigin',
        label: t('md3.menu.paneMenu.pullOrigin'),
        icon: 'arrow_downward',
        hint: ShortcutPullOrigin,
        onClick: () => handlers.onCommand('pullOrigin'),
      },
      {
        id: 'forcePush',
        label: t('md3.menu.paneMenu.forcePush'),
        icon: 'warning',
        hint: NoHint,
        onClick: () => handlers.onCommand('forcePush'),
      },
      {
        id: 'buildAndRun',
        label: t('md3.menu.paneMenu.buildAndRun'),
        icon: 'play_arrow',
        hint: NoHint,
        onClick: () => handlers.onCommand('buildAndRun'),
      },
      {
        id: 'mergeAll',
        label: t('md3.menu.paneMenu.mergeAll'),
        icon: 'merge',
        hint: NoHint,
        onClick: () => handlers.onCommand('mergeAllBranches'),
      },
      {
        id: 'openInTerminal',
        label: t('md3.menu.paneMenu.openInTerminal'),
        icon: 'terminal',
        hint: NoHint,
        onClick: () => handlers.onNavigate('Terminal'),
      },
      {
        id: 'repositorySettings',
        label: t('md3.menu.paneMenu.repositorySettings'),
        icon: 'settings',
        hint: NoHint,
        onClick: () => handlers.onOpenMenu('settings'),
      },
    ],
  }
}

function listMenuSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  return {
    kind: 'listMenu',
    title: t('md3.menu.listMenu.title'),
    icon: 'sort',
    width: 380,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'newestFirst',
        label: t('md3.menu.listMenu.newestFirst'),
        icon: 'arrow_downward',
        hint: activeHint(context.commitSortOrder === 'newest'),
        onClick: () => handlers.onCommand('sortCommitsNewestFirst'),
      },
      {
        id: 'oldestFirst',
        label: t('md3.menu.listMenu.oldestFirst'),
        icon: 'arrow_upward',
        hint: activeHint(context.commitSortOrder === 'oldest'),
        onClick: () => handlers.onCommand('sortCommitsOldestFirst'),
      },
      {
        id: 'groupByDay',
        label: t('md3.menu.listMenu.groupByDay'),
        icon: 'calendar_month',
        hint: activeHint(context.groupCommitsByDay),
        onClick: () => handlers.onCommand('groupCommitsByDay'),
      },
      {
        id: 'showGraph',
        label: t('md3.menu.listMenu.showGraph'),
        icon: 'account_tree',
        hint: onOffHint(context.commitGraphVisible),
        onClick: () => handlers.onToggle('commitGraph'),
      },
      {
        id: 'selectMultiple',
        label: t('md3.menu.listMenu.selectMultiple'),
        icon: 'checklist',
        hint: ShortcutMultiSelect,
        onClick: () => handlers.onCommand('selectMultipleCommits'),
      },
    ],
  }
}

function diffOptionsSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  return {
    kind: 'diffOptions',
    title: t('md3.menu.diffOptions.title'),
    icon: 'tune',
    width: 380,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'unified',
        label: t('md3.menu.diffOptions.unified'),
        icon: 'view_stream',
        hint: activeHint(context.diffMode === 'unified'),
        onClick: () => handlers.onCommand('showUnifiedDiff'),
      },
      {
        id: 'split',
        label: t('md3.menu.diffOptions.split'),
        icon: 'vertical_split',
        hint: activeHint(context.diffMode === 'split'),
        onClick: () => handlers.onCommand('showSplitDiff'),
      },
      {
        id: 'wrap',
        label: t('md3.menu.diffOptions.wrap'),
        icon: 'wrap_text',
        hint: onOffHint(context.wrapLongLines),
        onClick: () => handlers.onToggle('wrapLongLines'),
      },
      {
        id: 'hideWhitespace',
        label: t('md3.menu.diffOptions.hideWhitespace'),
        icon: 'space_bar',
        hint: onOffHint(context.hideWhitespaceChanges),
        onClick: () => handlers.onCommand('hideWhitespaceChanges'),
      },
      {
        id: 'moreContext',
        label: t('md3.menu.diffOptions.moreContext'),
        icon: 'unfold_more',
        hint: String(context.diffContextLines),
        onClick: () => handlers.onCommand('increaseDiffContextLines'),
      },
    ],
  }
}

function fileMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'fileMenu',
    title: t('md3.menu.fileMenu.title'),
    icon: 'description',
    width: 440,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'openInEditor',
        label: t('md3.menu.fileMenu.openInEditor'),
        icon: 'edit',
        hint: ShortcutOpenInEditor,
        onClick: () => handlers.onCommand('openFileInExternalEditor'),
      },
      {
        id: 'copyPath',
        label: t('md3.menu.fileMenu.copyPath'),
        icon: 'content_copy',
        hint: NoHint,
        onClick: () => handlers.onCommand('copyFilePath'),
      },
      {
        id: 'fileHistory',
        label: t('md3.menu.fileMenu.fileHistory'),
        icon: 'history',
        hint: NoHint,
        onClick: () => handlers.onCommand('openFileHistory'),
      },
      {
        id: 'blame',
        label: t('md3.menu.fileMenu.blame'),
        icon: 'person_search',
        hint: NoHint,
        onClick: () => handlers.onCommand('openBlame'),
      },
      {
        id: 'discardChanges',
        label: t('md3.menu.fileMenu.discardChanges'),
        icon: 'undo',
        hint: NoHint,
        onClick: () => handlers.onCommand('discardFileChanges'),
      },
      {
        id: 'ignoreFile',
        label: t('md3.menu.fileMenu.ignoreFile'),
        icon: 'block',
        hint: NoHint,
        onClick: () => handlers.onCommand('ignoreFile'),
      },
    ],
  }
}

function rowMenuSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  return {
    kind: 'rowMenu',
    title: t('md3.menu.rowMenu.title', { sha: context.selectedCommitSha }),
    icon: 'commit',
    width: 440,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'revert',
        label: t('md3.menu.rowMenu.revert'),
        icon: 'undo',
        hint: NoHint,
        onClick: () => handlers.onCommand('revertCommit'),
      },
      {
        id: 'cherryPick',
        label: t('md3.menu.rowMenu.cherryPick'),
        icon: 'content_paste_go',
        hint: NoHint,
        onClick: () => handlers.onCommand('cherryPickCommit'),
      },
      {
        id: 'createTag',
        label: t('md3.menu.rowMenu.createTag'),
        icon: 'sell',
        hint: NoHint,
        onClick: () => handlers.onCommand('createTagAtCommit'),
      },
      {
        id: 'reset',
        label: t('md3.menu.rowMenu.reset'),
        icon: 'restart_alt',
        hint: NoHint,
        onClick: () => handlers.onCommand('resetToCommit'),
      },
      {
        id: 'copySha',
        label: t('md3.menu.rowMenu.copySha'),
        icon: 'content_copy',
        hint: context.selectedCommitSha,
        onClick: () => handlers.onCommand('copyCommitSha'),
      },
      {
        id: 'viewOnGitHub',
        label: t('md3.menu.rowMenu.viewOnGitHub'),
        icon: 'open_in_new',
        hint: NoHint,
        onClick: () => handlers.onCommand('viewCommitOnGitHub'),
      },
    ],
  }
}

function changesMenuSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  return {
    kind: 'changesMenu',
    title: t('md3.menu.changesMenu.title'),
    icon: 'edit_note',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'includeAll',
        label: t('md3.menu.changesMenu.includeAll'),
        icon: 'check_box',
        hint: NoHint,
        onClick: () => handlers.onCommand('includeAllFiles'),
      },
      {
        id: 'excludeAll',
        label: t('md3.menu.changesMenu.excludeAll'),
        icon: 'check_box_outline_blank',
        hint: NoHint,
        onClick: () => handlers.onCommand('excludeAllFiles'),
      },
      {
        id: 'stashAll',
        label: t('md3.menu.changesMenu.stashAll'),
        icon: 'inventory_2',
        hint: NoHint,
        onClick: () => handlers.onCommand('stashAllChanges'),
      },
      {
        id: 'discardAll',
        label: t('md3.menu.changesMenu.discardAll'),
        icon: 'delete_sweep',
        hint: NoHint,
        onClick: () => handlers.onCommand('discardAllChanges'),
      },
      {
        id: 'groupByFolder',
        label: t('md3.menu.changesMenu.groupByFolder'),
        icon: 'folder',
        hint: onOffHint(context.groupChangesByFolder),
        onClick: () => handlers.onCommand('groupChangesByFolder'),
      },
    ],
  }
}

function changeRowMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'changeRowMenu',
    title: t('md3.menu.changeRowMenu.title'),
    icon: 'description',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'discardChanges',
        label: t('md3.menu.changeRowMenu.discardChanges'),
        icon: 'undo',
        hint: NoHint,
        onClick: () => handlers.onCommand('discardFileChanges'),
      },
      {
        id: 'ignoreFile',
        label: t('md3.menu.changeRowMenu.ignoreFile'),
        icon: 'block',
        hint: NoHint,
        onClick: () => handlers.onCommand('ignoreFile'),
      },
      {
        id: 'ignoreType',
        label: t('md3.menu.changeRowMenu.ignoreType'),
        icon: 'block',
        hint: NoHint,
        onClick: () => handlers.onCommand('ignoreFileType'),
      },
      {
        id: 'reveal',
        label: t('md3.menu.changeRowMenu.reveal'),
        icon: 'folder',
        hint: NoHint,
        onClick: () => handlers.onCommand('revealInFileManager'),
      },
      {
        id: 'openInEditor',
        label: t('md3.menu.changeRowMenu.openInEditor'),
        icon: 'edit',
        hint: NoHint,
        onClick: () => handlers.onCommand('openFileInExternalEditor'),
      },
    ],
  }
}

function branchRowMenuSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  return {
    kind: 'branchRowMenu',
    title: t('md3.menu.branchRowMenu.title'),
    icon: 'merge_type',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'mergeInto',
        label: t('md3.menu.branchRowMenu.mergeInto', {
          branch: context.branch,
        }),
        icon: 'merge',
        hint: NoHint,
        onClick: () => handlers.onCommand('mergeBranchIntoCurrent'),
      },
      {
        id: 'rebaseOnto',
        label: t('md3.menu.branchRowMenu.rebaseOnto', {
          branch: context.branch,
        }),
        icon: 'low_priority',
        hint: NoHint,
        onClick: () => handlers.onCommand('rebaseBranchOntoCurrent'),
      },
      {
        id: 'openPullRequest',
        label: t('md3.menu.branchRowMenu.openPullRequest'),
        icon: 'call_merge',
        hint: ShortcutPullRequest,
        onClick: () => handlers.onCommand('openPullRequest'),
      },
      {
        id: 'rename',
        label: t('md3.menu.branchRowMenu.rename'),
        icon: 'edit',
        hint: NoHint,
        onClick: () => handlers.onCommand('renameBranch'),
      },
      {
        id: 'delete',
        label: t('md3.menu.branchRowMenu.delete'),
        icon: 'delete',
        hint: NoHint,
        onClick: () => handlers.onCommand('deleteBranch'),
      },
    ],
  }
}

function runMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'runMenu',
    title: t('md3.menu.runMenu.title'),
    icon: 'play_circle',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'rerunAll',
        label: t('md3.menu.runMenu.rerunAll'),
        icon: 'refresh',
        hint: NoHint,
        onClick: () => handlers.onCommand('rerunAllJobs'),
      },
      {
        id: 'rerunFailed',
        label: t('md3.menu.runMenu.rerunFailed'),
        icon: 'error',
        hint: NoHint,
        onClick: () => handlers.onCommand('rerunFailedJobs'),
      },
      {
        id: 'cancel',
        label: t('md3.menu.runMenu.cancel'),
        icon: 'cancel',
        hint: NoHint,
        onClick: () => handlers.onCommand('cancelRun'),
      },
      {
        id: 'dispatch',
        label: t('md3.menu.runMenu.dispatch'),
        icon: 'play_arrow',
        hint: NoHint,
        onClick: () => handlers.onCommand('dispatchWorkflow'),
      },
      {
        id: 'rawLogs',
        label: t('md3.menu.runMenu.rawLogs'),
        icon: 'description',
        hint: NoHint,
        onClick: () => handlers.onCommand('viewRawLogs'),
      },
    ],
  }
}

function repoRowMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'repoRowMenu',
    title: t('md3.menu.repoRowMenu.title'),
    icon: 'book_2',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'fetch',
        label: t('md3.menu.repoRowMenu.fetch'),
        icon: 'sync',
        hint: NoHint,
        onClick: () => handlers.onCommand('fetchRepository'),
      },
      {
        id: 'pull',
        label: t('md3.menu.repoRowMenu.pull'),
        icon: 'arrow_downward',
        hint: NoHint,
        onClick: () => handlers.onCommand('pullRepository'),
      },
      {
        id: 'changeAlias',
        label: t('md3.menu.repoRowMenu.changeAlias'),
        icon: 'label',
        hint: NoHint,
        onClick: () => handlers.onCommand('changeRepositoryAlias'),
      },
      {
        id: 'moveToGroup',
        label: t('md3.menu.repoRowMenu.moveToGroup'),
        icon: 'folder',
        hint: NoHint,
        onClick: () => handlers.onCommand('moveRepositoryToGroup'),
      },
      {
        id: 'reveal',
        label: t('md3.menu.repoRowMenu.reveal'),
        icon: 'folder_open',
        hint: NoHint,
        onClick: () => handlers.onCommand('revealInFileManager'),
      },
      {
        id: 'remove',
        label: t('md3.menu.repoRowMenu.remove'),
        icon: 'delete',
        hint: NoHint,
        onClick: () => handlers.onCommand('removeRepositoryFromList'),
      },
    ],
  }
}

function composeSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'compose',
    title: t('md3.menu.compose.title'),
    icon: 'edit',
    width: 480,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'openComposer',
        label: t('md3.menu.compose.openComposer'),
        icon: 'subject',
        hint: NoHint,
        onClick: () => handlers.onNavigate('Changes'),
      },
      {
        id: 'copilotMessage',
        label: t('md3.menu.compose.copilotMessage'),
        icon: 'smart_toy',
        hint: NoHint,
        onClick: () => handlers.onCommand('writeCommitMessageWithCopilot'),
      },
      {
        id: 'addCoAuthors',
        label: t('md3.menu.compose.addCoAuthors'),
        icon: 'group_add',
        hint: NoHint,
        onClick: () => handlers.onCommand('addCoAuthors'),
      },
      {
        id: 'commitAndPush',
        label: t('md3.menu.compose.commitAndPush'),
        icon: 'bolt',
        hint: ShortcutCommitAndPush,
        onClick: () => handlers.onCommand('commitAndPush'),
      },
    ],
  }
}

function agentAccessSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  return {
    kind: 'agentAccess',
    title: t('md3.menu.agentAccess.title'),
    icon: 'shield',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'readAccess',
        label: t('md3.menu.agentAccess.readAccess'),
        icon: 'visibility',
        hint: permissionHint(context.agentReadAccess),
        onClick: () => handlers.onCommand('configureAgentReadAccess'),
      },
      {
        id: 'commits',
        label: t('md3.menu.agentAccess.commits'),
        icon: 'commit',
        hint: permissionHint(context.agentCommitAccess),
        onClick: () => handlers.onCommand('configureAgentCommitAccess'),
      },
      {
        id: 'push',
        label: t('md3.menu.agentAccess.push'),
        icon: 'arrow_upward',
        hint: permissionHint(context.agentPushAccess),
        onClick: () => handlers.onCommand('configureAgentPushAccess'),
      },
      {
        id: 'sessionLog',
        label: t('md3.menu.agentAccess.sessionLog'),
        icon: 'description',
        hint: NoHint,
        onClick: () => handlers.onCommand('openAgentSessionLog'),
      },
    ],
  }
}

function inboxRowMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'inboxRowMenu',
    title: t('md3.menu.inboxRowMenu.title'),
    icon: 'notifications',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'markRead',
        label: t('md3.menu.inboxRowMenu.markRead'),
        icon: 'mark_email_read',
        hint: NoHint,
        onClick: () => handlers.onCommand('markNotificationRead'),
      },
      {
        id: 'markUnread',
        label: t('md3.menu.inboxRowMenu.markUnread'),
        icon: 'mark_email_unread',
        hint: NoHint,
        onClick: () => handlers.onCommand('markNotificationUnread'),
      },
      {
        id: 'openInBrowser',
        label: t('md3.menu.inboxRowMenu.openInBrowser'),
        icon: 'open_in_new',
        hint: NoHint,
        onClick: () => handlers.onCommand('openNotificationInBrowser'),
      },
      {
        id: 'mute',
        label: t('md3.menu.inboxRowMenu.mute'),
        icon: 'notifications_off',
        hint: NoHint,
        onClick: () => handlers.onCommand('muteNotificationThread'),
      },
      {
        id: 'delete',
        label: t('md3.menu.inboxRowMenu.delete'),
        icon: 'delete',
        hint: NoHint,
        onClick: () => handlers.onCommand('deleteNotification'),
      },
    ],
  }
}

function agentRowMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'agentRowMenu',
    title: t('md3.menu.agentRowMenu.title'),
    icon: 'smart_toy',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'resume',
        label: t('md3.menu.agentRowMenu.resume'),
        icon: 'play_arrow',
        hint: NoHint,
        onClick: () => handlers.onCommand('resumeAgentSession'),
      },
      {
        id: 'pause',
        label: t('md3.menu.agentRowMenu.pause'),
        icon: 'pause',
        hint: NoHint,
        onClick: () => handlers.onCommand('pauseAgentSession'),
      },
      {
        id: 'openLog',
        label: t('md3.menu.agentRowMenu.openLog'),
        icon: 'description',
        hint: NoHint,
        onClick: () => handlers.onCommand('openAgentSessionLog'),
      },
      {
        id: 'duplicate',
        label: t('md3.menu.agentRowMenu.duplicate'),
        icon: 'content_copy',
        hint: NoHint,
        onClick: () => handlers.onCommand('duplicateAgentSession'),
      },
      {
        id: 'access',
        label: t('md3.menu.agentRowMenu.access'),
        icon: 'shield',
        hint: NoHint,
        onClick: () => handlers.onOpenMenu('agentAccess'),
      },
      {
        id: 'delete',
        label: t('md3.menu.agentRowMenu.delete'),
        icon: 'delete',
        hint: NoHint,
        onClick: () => handlers.onCommand('deleteAgentSession'),
      },
    ],
  }
}

function terminalMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'terminalMenu',
    title: t('md3.menu.terminalMenu.title'),
    icon: 'terminal',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'copy',
        label: t('md3.menu.terminalMenu.copy'),
        icon: 'content_copy',
        hint: ShortcutCopy,
        onClick: () => handlers.onCommand('copyTerminalSelection'),
      },
      {
        id: 'paste',
        label: t('md3.menu.terminalMenu.paste'),
        icon: 'content_paste',
        hint: ShortcutPaste,
        onClick: () => handlers.onCommand('pasteIntoTerminal'),
      },
      {
        id: 'clear',
        label: t('md3.menu.terminalMenu.clear'),
        icon: 'backspace',
        hint: ShortcutClear,
        onClick: () => handlers.onCommand('clearTerminalOutput'),
      },
      {
        id: 'split',
        label: t('md3.menu.terminalMenu.split'),
        icon: 'vertical_split',
        hint: NoHint,
        onClick: () => handlers.onCommand('splitShell'),
      },
      {
        id: 'openSystem',
        label: t('md3.menu.terminalMenu.openSystem'),
        icon: 'open_in_new',
        hint: NoHint,
        onClick: () => handlers.onCommand('openSystemTerminal'),
      },
      {
        id: 'newShell',
        label: t('md3.menu.terminalMenu.newShell'),
        icon: 'add',
        hint: NoHint,
        onClick: () => handlers.onCommand('newShellSession'),
      },
    ],
  }
}

function drawerMenuSpec(
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  const destinations: ReadonlyArray<[string, Md3MenuDestination, string]> = [
    ['goRepositories', 'Repositories', t('md3.menu.drawerMenu.goRepositories')],
    ['goChanges', 'Changes', t('md3.menu.drawerMenu.goChanges')],
    ['goHistory', 'History', t('md3.menu.drawerMenu.goHistory')],
    ['goBranches', 'Branches', t('md3.menu.drawerMenu.goBranches')],
    ['goActions', 'Actions', t('md3.menu.drawerMenu.goActions')],
    ['goInbox', 'Inbox', t('md3.menu.drawerMenu.goInbox')],
    ['goTerminal', 'Terminal', t('md3.menu.drawerMenu.goTerminal')],
    ['goAgents', 'Agents', t('md3.menu.drawerMenu.goAgents')],
  ]

  const destinationIcons: Readonly<
    Record<Md3MenuDestination, MaterialSymbolName>
  > = {
    Repositories: 'book_2',
    Changes: 'edit_note',
    History: 'history',
    Branches: 'merge_type',
    Actions: 'play_circle',
    Inbox: 'inbox',
    Terminal: 'terminal',
    Agents: 'smart_toy',
  }

  return {
    kind: 'drawerMenu',
    title: t('md3.menu.drawerMenu.title'),
    icon: 'menu',
    width: 400,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'toggleDrawer',
        label: context.drawerExpanded
          ? t('md3.menu.drawerMenu.collapse')
          : t('md3.menu.drawerMenu.expand'),
        icon: 'menu_open',
        hint: NoHint,
        onClick: () => handlers.onToggle('drawer'),
      },
      ...destinations.map<IMd3MenuItem>(([id, destination, label]) => ({
        id,
        label,
        icon: destinationIcons[destination],
        hint: DestinationShortcuts[destination],
        onClick: () => handlers.onNavigate(destination),
      })),
    ],
  }
}

function searchMenuSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  return {
    kind: 'searchMenu',
    title: t('md3.menu.searchMenu.title'),
    icon: 'search',
    width: 420,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: [
      {
        id: 'openBuilder',
        label: t('md3.menu.searchMenu.openBuilder'),
        icon: 'construction',
        hint: ShortcutRegexBuilder,
        onClick: () => handlers.onOpenRegexBuilder(''),
      },
      {
        id: 'toggleRegex',
        label: t('md3.menu.searchMenu.toggleRegex'),
        icon: 'code',
        hint: NoHint,
        onClick: () => handlers.onCommand('toggleSearchRegexMode'),
      },
      {
        id: 'clearField',
        label: t('md3.menu.searchMenu.clearField'),
        icon: 'backspace',
        hint: NoHint,
        onClick: () => handlers.onCommand('clearSearchField'),
      },
      {
        id: 'howRegexWorks',
        label: t('md3.menu.searchMenu.howRegexWorks'),
        icon: 'help',
        hint: NoHint,
        onClick: () => handlers.onOpenMenu('guide'),
      },
    ],
  }
}

function guideSpec(handlers: IMd3MenuHandlers): IMd3MenuSpec {
  const entries: ReadonlyArray<[string, string, MaterialSymbolName, string]> = [
    [
      'caret',
      t('md3.menu.guide.caret'),
      'first_page',
      t('md3.menu.hint.anchor'),
    ],
    [
      'dollar',
      t('md3.menu.guide.dollar'),
      'last_page',
      t('md3.menu.hint.anchor'),
    ],
    [
      'classes',
      t('md3.menu.guide.classes'),
      'text_fields',
      t('md3.menu.hint.class'),
    ],
    [
      'quantifiers',
      t('md3.menu.guide.quantifiers'),
      'repeat',
      t('md3.menu.hint.quantifier'),
    ],
    [
      'groups',
      t('md3.menu.guide.groups'),
      'data_object',
      t('md3.menu.hint.group'),
    ],
    [
      'alternation',
      t('md3.menu.guide.alternation'),
      'alt_route',
      t('md3.menu.hint.alternation'),
    ],
    ['flags', t('md3.menu.guide.flags'), 'flag', t('md3.menu.hint.flags')],
  ]

  return {
    kind: 'guide',
    title: t('md3.menu.guide.title'),
    icon: 'help',
    width: 520,
    hasFilter: true,
    filterPlaceholder: t('md3.menu.filterPlaceholder'),
    items: entries.map<IMd3MenuItem>(([id, label, icon, hint]) => ({
      id,
      label,
      icon,
      hint,
      onClick: () => handlers.onCommand('showRegexGuideEntry'),
    })),
  }
}

/**
 * Build the spec for one menu kind.
 *
 * The result is a fresh object every call: the labels and hints are computed
 * from `context`, so a menu rebuilt after a toggle flips reports the new state
 * rather than the state it was opened with.
 */
export function getMenuSpec(
  kind: MenuKind,
  context: IMd3MenuContext,
  handlers: IMd3MenuHandlers
): IMd3MenuSpec {
  switch (kind) {
    case 'palette':
      return paletteSpec(context, handlers)
    case 'settings':
      return settingsSpec(context, handlers)
    case 'account':
      return accountSpec(context, handlers)
    case 'repoMenu':
      return repoMenuSpec(context, handlers)
    case 'branchMenu':
      return branchMenuSpec(context, handlers)
    case 'paneMenu':
      return paneMenuSpec(handlers)
    case 'listMenu':
      return listMenuSpec(context, handlers)
    case 'diffOptions':
      return diffOptionsSpec(context, handlers)
    case 'fileMenu':
      return fileMenuSpec(handlers)
    case 'rowMenu':
      return rowMenuSpec(context, handlers)
    case 'changesMenu':
      return changesMenuSpec(context, handlers)
    case 'changeRowMenu':
      return changeRowMenuSpec(handlers)
    case 'branchRowMenu':
      return branchRowMenuSpec(context, handlers)
    case 'runMenu':
      return runMenuSpec(handlers)
    case 'repoRowMenu':
      return repoRowMenuSpec(handlers)
    case 'compose':
      return composeSpec(handlers)
    case 'agentAccess':
      return agentAccessSpec(context, handlers)
    case 'inboxRowMenu':
      return inboxRowMenuSpec(handlers)
    case 'agentRowMenu':
      return agentRowMenuSpec(handlers)
    case 'terminalMenu':
      return terminalMenuSpec(handlers)
    case 'drawerMenu':
      return drawerMenuSpec(context, handlers)
    case 'searchMenu':
      return searchMenuSpec(handlers)
    case 'guide':
      return guideSpec(handlers)
    default:
      return assertNever(kind, `unknown menu kind ${kind}`)
  }
}
