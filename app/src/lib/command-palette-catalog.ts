/**
 * The master command palette's catalog: every named, user-invocable app
 * function reachable through a menu event, plus a few palette-only actions.
 * Pure data + filtering so node-only tests can exercise it.
 */

import type { TranslationKey } from './i18n-resources'
import type { MaterialSymbolName } from '../ui/lib/material-symbol'
import type { TeleportTargetId } from './teleport-targets'
import { PreferencesTab } from '../models/preferences'
import { RepositorySettingsTab } from '../models/repository-settings'

/**
 * The application-selection snapshot an availability predicate inspects to
 * decide whether a command can be dispatched right now. Kept as a flat, plain
 * object so node-only tests can drive predicates without any app state.
 */
export interface IPaletteCommandContext {
  /** The current process platform (mirrors `process.platform`). */
  readonly platform?: string
  /** Stable local identity for repository-scoped presentation choices. */
  readonly repositoryKey?: string
  /** A real (non-cloning) repository is selected. */
  readonly hasRepository: boolean
  /** The selected repository has a configured remote. */
  readonly hasRemote: boolean
  /** The selected repository is on a valid, named branch. */
  readonly hasBranch: boolean
  /** The selected repository is associated with a GitHub repository. */
  readonly isGitHubRepository: boolean
  /** The selected GitHub repository is a fork of another. */
  readonly isFork?: boolean
}

/**
 * Decides whether a command should be offered for the given selection. A
 * command with no predicate is always available.
 */
export type PaletteAvailability = (context: IPaletteCommandContext) => boolean

/** Available whenever any real repository is selected. */
const whenRepository: PaletteAvailability = context => context.hasRepository

/** Available only when the selected repository is on a named branch. */
const whenBranch: PaletteAvailability = context =>
  context.hasRepository && context.hasBranch

/** Available only when the selection is a GitHub-associated repository. */
const whenGitHubRepository: PaletteAvailability = context =>
  context.hasRepository && context.isGitHubRepository

/**
 * Available only for a fork.
 *
 * Fork behaviour settings exist nowhere else, so offering the row for an
 * ordinary repository would teleport the reader to a tab that is not there -
 * a worse outcome than the row simply not being offered.
 */
const whenFork: PaletteAvailability = context =>
  context.hasRepository && context.isFork === true

/**
 * A live control the palette renders inside the row itself, so a setting can
 * be read and changed without first hunting down the screen that owns it. The
 * palette renders the control that matches the value: a switch for a boolean,
 * a text box for free text, a stepper for a number, a select for an
 * enumeration.
 */
export type IPaletteControl =
  | IPaletteToggleControl
  | IPaletteEntryControl
  | IPaletteNumberControl
  | IPaletteChoiceControl
  | IPaletteDynamicChoiceControl

/** A boolean setting, rendered as a Material switch. */
export interface IPaletteToggleControl {
  readonly kind: 'toggle'
}

/** Free text, rendered as a text box that applies on Enter or the ✓ button. */
export interface IPaletteEntryControl {
  readonly kind: 'entry'
  /** Placeholder shown while the box is empty. */
  readonly placeholderKey?: TranslationKey
  /** Rejects longer input rather than silently truncating it. */
  readonly maxLength?: number
  /**
   * Whether applying the value clears the box afterwards. True for one-shot
   * entries (a clone URL is consumed by the dialog it opens); false for a
   * value the box keeps showing (a commit summary stays what it now is).
   */
  readonly clearOnApply?: boolean
}

/** A bounded number, rendered as a numeric box with a range hint. */
export interface IPaletteNumberControl {
  readonly kind: 'number'
  readonly min: number
  readonly max: number
  readonly step?: number
  /**
   * The unit the number is in, shown beside the box.
   *
   * Without it a volume, a percentage, a cooldown and an hour-of-day all
   * render as a bare integer, and the row stops saying what it is asking for.
   */
  readonly unitKey?: TranslationKey
}

/** One of a fixed set of values, rendered as a select. */
export interface IPaletteChoiceControl {
  readonly kind: 'choice'
  readonly options: ReadonlyArray<IPaletteChoiceOption>
}

export interface IPaletteChoiceOption {
  /** The stored value, passed back verbatim when chosen. */
  readonly value: string
  readonly labelKey: TranslationKey
}

/**
 * One of a set discovered at run time, rendered as a select.
 *
 * Some choices cannot be written down here: the installed editors and shells,
 * the signed-in accounts, the models a provider currently offers. They have no
 * translation key and no fixed length, so the catalog names the *list* and the
 * app resolves it. A list the app cannot resolve renders as an empty select
 * with its current value shown, rather than as a row that lies about what is
 * available.
 */
export interface IPaletteDynamicChoiceControl {
  readonly kind: 'dynamic-choice'
  /** Which runtime list to resolve, e.g. `'external-editors'`. */
  readonly optionsId: PaletteDynamicOptionsId
}

/** The runtime lists a dynamic choice can name. */
export type PaletteDynamicOptionsId =
  | 'external-editors'
  | 'shells'
  | 'accounts'
  | 'date-formats'
  | 'time-formats'

/** A resolved option for a dynamic choice. Labels are values, not keys. */
export interface IPaletteDynamicOption {
  readonly value: string
  readonly label: string
}

/** The value a palette control reads and writes. */
export type PaletteControlValue = boolean | string | number

/**
 * Where a command's feature actually lives in the app.
 *
 * Choosing a row teleports there: the surface that owns the feature is brought
 * on screen and the exact control is spotlit. That is deliberately *not* the
 * same as running the command — teleporting to "Force push" must show the
 * user the toolbar button, never push — so a home only dispatches an event
 * when doing so is how the feature is reached (`openEvent`), and destructive
 * or side-effecting commands simply omit it and spotlight their control.
 */
export type IPaletteHome =
  | IPaletteSurfaceHome
  | IPaletteSettingsHome
  | IPaletteRepositorySettingsHome

export interface IPaletteSurfaceHome {
  readonly kind: 'surface'
  /** Localized description of the place, e.g. "Toolbar". */
  readonly labelKey: TranslationKey
  /**
   * How the surface is brought on screen before the spotlight:
   * `'self'` dispatches this command's own event (only ever set where doing so
   * merely opens the feature), any other string dispatches that event instead,
   * and omitting it spotlights the target where it already lives.
   */
  readonly openEvent?: 'self' | string
  /** The control spotlit once the surface is on screen. */
  readonly targetId?: TeleportTargetId
}

export interface IPaletteSettingsHome {
  readonly kind: 'preferences'
  /** The Settings tab the feature is rendered on. */
  readonly tab: PreferencesTab
  /** The setting row spotlit after Settings opens on that tab. */
  readonly targetId?: TeleportTargetId
}

/**
 * A setting that lives in the selected repository's own settings, which is a
 * different popup with its own tabs from the app-wide Settings.
 *
 * Kept separate rather than folded into the preferences home because the two
 * tab enumerations are genuinely different sets: collapsing them would let a
 * row name a tab the popup it opens does not have, and the reader would land
 * on whatever tab happened to be first with no sign anything went wrong.
 */
export interface IPaletteRepositorySettingsHome {
  readonly kind: 'repositorySettings'
  /** The repository settings tab the feature is rendered on. */
  readonly tab: RepositorySettingsTab
  /** The setting row spotlit after repository settings opens on that tab. */
  readonly targetId?: TeleportTargetId
}

/**
 * The home every command teleports to. A command that does not declare one
 * lives in the dialog it opens, so opening it *is* the teleport.
 */
export function resolvePaletteHome(command: IPaletteCommand): IPaletteHome {
  return (
    command.home ?? {
      kind: 'surface',
      labelKey: 'commandPalette.homeDialog',
      openEvent: 'self',
    }
  )
}

/** The palette event that opens Settings on a given tab. */
export function preferencesPaletteEvent(tab: PreferencesTab): string {
  switch (tab) {
    case PreferencesTab.Accounts:
      return 'palette:preferences-accounts'
    case PreferencesTab.Integrations:
      return 'palette:preferences-integrations'
    case PreferencesTab.Copilot:
      return 'palette:preferences-copilot'
    case PreferencesTab.Git:
      return 'palette:preferences-git'
    case PreferencesTab.Appearance:
      return 'palette:preferences-appearance'
    case PreferencesTab.Notifications:
      return 'palette:preferences-notifications'
    case PreferencesTab.Prompts:
      return 'palette:preferences-prompts'
    case PreferencesTab.Advanced:
      return 'palette:preferences-advanced'
    case PreferencesTab.Accessibility:
      return 'palette:preferences-accessibility'
    case PreferencesTab.AgentAccess:
      return 'palette:preferences-agent-access'
    case PreferencesTab.Automation:
      return 'palette:preferences-automation'
    case PreferencesTab.Queue:
      return 'palette:background-queue'
    case PreferencesTab.Sound:
      return 'palette:preferences-sound'
    case PreferencesTab.Ollama:
      return 'palette:ollama-model-manager'
    default:
      return 'show-preferences'
  }
}

/**
 * The palette action that opens the selected repository's settings on a tab.
 *
 * One event per tab, exactly as the app-wide Settings does, so a row lands on
 * the tab that owns the setting rather than on whichever tab was open last.
 */
export function repositorySettingsPaletteEvent(
  tab: RepositorySettingsTab
): string {
  return `palette:repository-settings-${RepositorySettingsTabSlug[tab]}`
}

/** Stable url-ish slugs for the repository settings tabs. */
const RepositorySettingsTabSlug: Readonly<
  Record<RepositorySettingsTab, string>
> = {
  [RepositorySettingsTab.Remote]: 'remote',
  [RepositorySettingsTab.IgnoredFiles]: 'ignored-files',
  [RepositorySettingsTab.GitConfig]: 'git-config',
  [RepositorySettingsTab.BuildRun]: 'build-run',
  [RepositorySettingsTab.CheapLfs]: 'cheap-lfs',
  [RepositorySettingsTab.Submodules]: 'submodules',
  [RepositorySettingsTab.Subtrees]: 'subtrees',
  [RepositorySettingsTab.Automation]: 'automation',
  [RepositorySettingsTab.Metadata]: 'metadata',
  [RepositorySettingsTab.Appearance]: 'appearance',
  [RepositorySettingsTab.AISecurity]: 'ai-security',
  [RepositorySettingsTab.ForkSettings]: 'fork-settings',
}

export interface IPaletteCommand {
  /** The menu event (or palette-only action id) executed on selection. */
  readonly event: string
  /** The user-facing title (English; also the fallback when untranslated). */
  readonly title: string
  /**
   * The i18n key resolving the visible title in the active language mode.
   * When present the palette shows the translated title in English, playful
   * Hong Kong Cantonese, or the bilingual view; otherwise `title` is shown.
   */
  readonly titleKey?: TranslationKey
  /** The logical group shown beside the title. */
  readonly group: string
  /**
   * An explicit row icon. When omitted the palette falls back to the group's
   * icon, so a command only needs this when it deserves its own glyph.
   */
  readonly materialSymbol?: MaterialSymbolName
  /** Extra search terms. */
  readonly keywords?: string
  /**
   * A one-line explanation shown in the palette's detail pane. Commands whose
   * title already says everything can omit it.
   */
  readonly descriptionKey?: TranslationKey
  /**
   * The live control rendered in the row. A command with a control is a
   * setting the palette can read and change in place; a command without one is
   * an action the palette runs.
   */
  readonly control?: IPaletteControl
  /**
   * Where the feature lives, used by the row's teleport. Omitting it means the
   * feature is the dialog this command opens.
   */
  readonly home?: IPaletteHome
  /** Restricts the command to one platform. */
  readonly platform?: 'darwin' | 'win32'
  /**
   * Restricts the command to selection states where it can actually run, so
   * it is never dispatched (e.g. push with no repository) from the palette.
   */
  readonly isAvailable?: PaletteAvailability
}

export const CommandPaletteCatalog: ReadonlyArray<IPaletteCommand> = [
  // Navigate
  {
    event: 'show-changes',
    title: 'Show changes',
    group: 'Navigate',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      openEvent: 'self',
      targetId: 'sidebarChangesTab',
    },
  },
  {
    event: 'show-history',
    title: 'Show history',
    group: 'Navigate',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      openEvent: 'self',
      targetId: 'sidebarHistoryTab',
    },
  },
  {
    event: 'show-repository-tools',
    title: 'Show repository tools',
    group: 'Navigate',
    keywords: 'hub functions maintenance',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      openEvent: 'self',
      targetId: 'sidebarRepositoryToolsTab',
    },
  },
  {
    event: 'show-branches',
    title: 'Show branches',
    group: 'Navigate',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeToolbar',
      openEvent: 'self',
      targetId: 'toolbarBranch',
    },
  },
  {
    event: 'show-worktrees',
    title: 'Show worktrees',
    group: 'Navigate',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeToolbar',
      openEvent: 'self',
      targetId: 'toolbarWorktree',
    },
  },
  {
    event: 'choose-repository',
    title: 'Choose a repository',
    group: 'Navigate',
    keywords: 'switch open',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeToolbar',
      openEvent: 'self',
      targetId: 'toolbarRepository',
    },
  },
  {
    event: 'go-to-commit-message',
    title: 'Go to commit message',
    group: 'Navigate',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeCommitBox',
      openEvent: 'self',
      targetId: 'commitSummary',
    },
  },
  {
    event: 'palette:find-in-view',
    title: 'Find in current view',
    group: 'Navigate',
    keywords: 'search text diff filter find',
  },

  // Repository. Push, pull, fetch and force push all live on the toolbar's
  // sync button and all reach the network, so their home deliberately carries
  // no opener: teleporting shows the user the button, and only the row's Run
  // action (or the button itself) actually moves any commits.
  {
    event: 'push',
    title: 'Push',
    group: 'Repository',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeToolbar',
      targetId: 'toolbarSync',
    },
  },
  {
    event: 'force-push',
    title: 'Force push',
    group: 'Repository',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeToolbar',
      targetId: 'toolbarSync',
    },
  },
  {
    event: 'pull',
    title: 'Pull',
    group: 'Repository',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeToolbar',
      targetId: 'toolbarSync',
    },
  },
  {
    event: 'fetch',
    title: 'Fetch',
    group: 'Repository',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeToolbar',
      targetId: 'toolbarSync',
    },
  },
  {
    event: 'clone-repository',
    title: 'Clone a repository',
    group: 'Repository',
    keywords: 'download multi batch',
  },
  {
    event: 'add-local-repository',
    title: 'Add a local repository',
    group: 'Repository',
  },
  {
    event: 'create-repository',
    title: 'Create a new repository',
    group: 'Repository',
  },
  {
    event: 'remove-repository',
    title: 'Remove the repository',
    group: 'Repository',
    // Removing is reached from the repository list's context menu; teleporting
    // points at the list rather than starting a removal.
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeRepositoryList',
      targetId: 'toolbarRepository',
    },
  },
  {
    event: 'fork-repository',
    title: 'Fork the repository',
    group: 'Repository',
  },
  {
    event: 'view-repository-on-github',
    title: 'View on GitHub',
    group: 'Repository',
  },
  {
    event: 'open-working-directory',
    title: 'Open the working directory',
    group: 'Repository',
    keywords: 'explorer finder folder',
  },
  { event: 'open-in-shell', title: 'Open in shell', group: 'Repository' },
  {
    event: 'open-external-editor',
    title: 'Open in external editor',
    group: 'Repository',
  },
  {
    event: 'open-with-external-editor',
    title: 'Open a file with the external editor',
    group: 'Repository',
  },
  {
    event: 'show-repository-settings',
    title: 'Repository settings',
    group: 'Repository',
  },
  {
    event: 'manage-gitignore',
    title: 'Manage .gitignore',
    group: 'Repository',
    keywords: 'ignored files',
  },
  {
    event: 'manage-sparse-checkout',
    title: 'Manage sparse checkout',
    group: 'Repository',
  },
  {
    event: 'build-and-run',
    title: 'Build and run',
    titleKey: 'palette.buildAndRun',
    group: 'Repository',
    keywords: 'docker compose npm make build run',
    isAvailable: whenRepository,
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeToolbar',
      targetId: 'toolbarBuildRun',
    },
  },
  {
    event: 'palette:resolve-conflicts-with-agent',
    title: 'Resolve conflicts with Codex/OpenCode',
    titleKey: 'palette.resolveConflictsAgent',
    group: 'Repository',
    materialSymbol: 'difference',
    keywords: 'merge conflict resolver codex opencode local agent ai',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:fix-ci-with-agent',
    title: 'Fix CI with Codex/OpenCode',
    titleKey: 'palette.fixCiAgent',
    group: 'Repository',
    materialSymbol: 'build',
    keywords: 'github actions cloud workflow failure codex opencode agent',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:hide-background-progress',
    title: 'Hide background progress',
    titleKey: 'palette.hideBackgroundProgress',
    group: 'Repository',
    materialSymbol: 'visibility',
    keywords: 'build run agent progress panel background collapse',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:show-background-progress',
    title: 'Show background progress',
    titleKey: 'palette.showBackgroundProgress',
    group: 'Repository',
    materialSymbol: 'visibility',
    keywords: 'build run agent progress panel background reopen',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:toggle-cheap-lfs-restore-progress',
    title: 'Expand/collapse Cheap LFS restore progress',
    titleKey: 'palette.toggleCheapLfsProgress',
    group: 'Repository',
    materialSymbol: 'unfold_more',
    keywords: 'large file restore download progress details collapse expand',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:cheap-lfs-settings',
    title: 'Large files (Cheap LFS) settings',
    titleKey: 'palette.cheapLfsSettings',
    group: 'Repository',
    keywords:
      'cheap lfs large files pin storage provider release-backed materialize compression parallel uploads',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:repository-automation',
    title: 'Automation overrides (this repository)',
    titleKey: 'palette.repositoryAutomation',
    group: 'Repository',
    keywords: 'automation overrides per repository this repo auto rules',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:tag-lifecycle',
    title: 'Tag lifecycle manager',
    titleKey: 'palette.tagLifecycle',
    group: 'Repository',
    keywords:
      'tag tags create delete push fetch prune sign move lifecycle manage inventory',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeRepositoryTools',
      openEvent: 'self',
    },
    isAvailable: whenRepository,
  },
  {
    event: 'palette:github-api-explorer',
    title: 'GitHub API explorer',
    titleKey: 'palette.githubApiExplorer',
    group: 'Repository',
    keywords: 'github api rest graphql endpoint request explorer functions',
    isAvailable: whenGitHubRepository,
  },
  {
    event: 'run-actions-locally',
    title: 'Run Actions locally',
    titleKey: 'actionsLocalRun.commandTitle',
    group: 'Repository',
    keywords: 'github actions workflow act ci run local',
    isAvailable: whenRepository,
  },
  {
    event: 'open-pull-request',
    title: 'Open the pull request',
    group: 'Repository',
  },
  {
    event: 'preview-pull-request',
    title: 'Preview the pull request',
    group: 'Repository',
  },
  {
    event: 'create-issue-in-repository-on-github',
    title: 'Create an issue on GitHub',
    group: 'Repository',
  },
  {
    event: 'compare-on-github',
    title: 'Compare on GitHub',
    group: 'Repository',
  },

  // Branch
  { event: 'create-branch', title: 'Create a branch', group: 'Branch' },
  { event: 'rename-branch', title: 'Rename the branch', group: 'Branch' },
  { event: 'delete-branch', title: 'Delete the branch', group: 'Branch' },
  { event: 'compare-to-branch', title: 'Compare to a branch', group: 'Branch' },
  {
    event: 'merge-branch',
    title: 'Merge into the current branch',
    group: 'Branch',
  },
  {
    event: 'squash-and-merge-branch',
    title: 'Squash and merge into the current branch',
    group: 'Branch',
  },
  {
    event: 'rebase-branch',
    title: 'Rebase the current branch',
    group: 'Branch',
  },
  {
    event: 'update-branch-with-contribution-target-branch',
    title: 'Update from the default branch',
    group: 'Branch',
  },
  {
    event: 'branch-on-github',
    title: 'View the branch on GitHub',
    group: 'Branch',
  },
  {
    event: 'inspect-branch-rules',
    title: 'Inspect effective branch rules',
    group: 'Branch',
    keywords: 'protection rulesets policy',
  },
  { event: 'create-worktree', title: 'Create a worktree', group: 'Branch' },

  // Changes. Stashing and discarding act on the working tree the moment they
  // run, so — like push — their home spotlights the changes list rather than
  // opening anything.
  {
    event: 'stash-all-changes',
    title: 'Stash all changes',
    group: 'Changes',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeChangesView',
      targetId: 'sidebarChangesTab',
    },
  },
  {
    event: 'discard-all-changes',
    title: 'Discard all changes',
    group: 'Changes',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeChangesView',
      targetId: 'sidebarChangesTab',
    },
  },
  {
    event: 'permanently-discard-all-changes',
    title: 'Permanently discard all changes',
    group: 'Changes',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeChangesView',
      targetId: 'sidebarChangesTab',
    },
  },
  {
    event: 'show-stashed-changes',
    title: 'Show stashed changes',
    group: 'Changes',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeChangesView',
      openEvent: 'self',
      targetId: 'sidebarChangesTab',
    },
  },
  {
    event: 'hide-stashed-changes',
    title: 'Hide stashed changes',
    group: 'Changes',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeChangesView',
      openEvent: 'self',
      targetId: 'sidebarChangesTab',
    },
  },
  {
    event: 'toggle-changes-filter',
    title: 'Toggle the changes filter',
    group: 'Changes',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeChangesView',
      openEvent: 'self',
      targetId: 'sidebarChangesTab',
    },
  },

  // App
  { event: 'show-preferences', title: 'Settings', group: 'App' },
  {
    event: 'show-settings-history',
    title: 'Settings history',
    group: 'App',
    keywords: 'versioned appearance',
  },
  {
    event: 'view-log-history',
    title: 'View log history',
    group: 'App',
    keywords: 'logs debug verbose diagnostics',
  },
  {
    event: 'export-repository-list',
    title: 'Export the repository list',
    group: 'App',
  },
  {
    event: 'import-repository-list',
    title: 'Import a repository list',
    group: 'App',
  },
  {
    event: 'export-tab-session',
    title: 'Export the tab session',
    group: 'App',
  },
  {
    event: 'import-tab-session',
    title: 'Import a tab session',
    group: 'App',
  },
  { event: 'show-about', title: 'About Desktop Material', group: 'App' },
  {
    event: 'show-changelog',
    title: 'Release history (changelog)',
    group: 'App',
  },
  { event: 'open-new-window', title: 'Open a new window', group: 'App' },
  { event: 'zoom-in', title: 'Zoom in', group: 'App' },
  { event: 'zoom-out', title: 'Zoom out', group: 'App' },
  { event: 'zoom-reset', title: 'Reset zoom', group: 'App' },
  {
    event: 'install-windows-cli',
    title: 'Install the command line tool',
    group: 'App',
    platform: 'win32',
  },
  {
    event: 'uninstall-windows-cli',
    title: 'Uninstall the command line tool',
    group: 'App',
    platform: 'win32',
  },
  {
    event: 'install-darwin-cli',
    title: 'Install the command line tool',
    group: 'App',
    platform: 'darwin',
  },

  // Edit
  {
    event: 'select-all',
    title: 'Select all',
    titleKey: 'palette.selectAll',
    group: 'Edit',
    keywords: 'highlight everything whole',
  },

  // Appearance. Everything below carries a live control: the palette reads the
  // current value and writes the new one in place, and its row still teleports
  // to the settings surface that owns the same value.
  {
    event: 'palette:toggle-theme',
    title: 'Dark theme',
    titleKey: 'palette.toggleTheme',
    group: 'App',
    materialSymbol: 'dark_mode',
    keywords: 'dark light mode colour color appearance switch theme',
    descriptionKey: 'palette.toggleThemeDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsTheme',
    },
  },
  {
    event: 'palette:set-language-mode',
    title: 'Language mode',
    titleKey: 'palette.languageMode',
    group: 'App',
    materialSymbol: 'text_format',
    keywords: 'language english cantonese bilingual 語言 廣東話 雙語',
    descriptionKey: 'palette.languageModeDescription',
    control: {
      kind: 'choice',
      options: [
        { value: 'english', labelKey: 'language.english' },
        { value: 'cantonese', labelKey: 'language.cantonese' },
        { value: 'bilingual', labelKey: 'language.bilingual' },
      ],
    },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsLanguageMode',
    },
  },
  {
    event: 'palette:set-funny-english',
    title: 'Playfulness (English)',
    titleKey: 'palette.funnyEnglish',
    group: 'App',
    materialSymbol: 'waving_hand',
    keywords: 'funny level playfulness humour humor english tone voice',
    descriptionKey: 'palette.funnyLevelDescription',
    control: { kind: 'number', min: 1, max: 5, step: 1 },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsFunnyEnglish',
    },
  },
  {
    event: 'palette:set-funny-cantonese',
    title: 'Playfulness (Cantonese)',
    titleKey: 'palette.funnyCantonese',
    group: 'App',
    materialSymbol: 'waving_hand',
    keywords: 'funny level playfulness humour humor cantonese tone voice 幽默',
    descriptionKey: 'palette.funnyLevelDescription',
    control: { kind: 'number', min: 1, max: 5, step: 1 },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsFunnyCantonese',
    },
  },
  {
    event: 'palette:set-tab-size',
    title: 'Diff tab size',
    titleKey: 'palette.tabSize',
    group: 'App',
    materialSymbol: 'format_align_left',
    keywords: 'tab size indentation spaces diff width',
    descriptionKey: 'palette.tabSizeDescription',
    control: { kind: 'number', min: 1, max: 16, step: 1 },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsTabSize',
    },
  },
  {
    event: 'palette:set-highlight-features',
    title: 'Highlight Desktop Material features',
    titleKey: 'palette.highlightFeatures',
    group: 'App',
    materialSymbol: 'star',
    keywords: 'highlight desktop material features badge new entry points',
    descriptionKey: 'palette.highlightFeaturesDescription',
    control: { kind: 'toggle' },
    home: { kind: 'preferences', tab: PreferencesTab.Appearance },
  },

  // Confirmations, notifications and the rest of the settings that are only
  // ever hunted for when something has already gone wrong.
  {
    event: 'palette:set-confirm-discard',
    title: 'Confirm before discarding changes',
    titleKey: 'palette.confirmDiscard',
    group: 'App',
    materialSymbol: 'delete',
    keywords: 'confirm prompt discard changes dialog warning',
    descriptionKey: 'palette.confirmDiscardDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmDiscard',
    },
  },
  {
    event: 'palette:set-confirm-force-push',
    title: 'Confirm before force pushing',
    titleKey: 'palette.confirmForcePush',
    group: 'App',
    materialSymbol: 'warning',
    keywords: 'confirm prompt force push dialog warning',
    descriptionKey: 'palette.confirmForcePushDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmForcePush',
    },
  },
  {
    event: 'palette:set-confirm-repository-removal',
    title: 'Confirm before removing a repository',
    titleKey: 'palette.confirmRepositoryRemoval',
    group: 'App',
    materialSymbol: 'delete',
    keywords: 'confirm prompt remove repository dialog warning',
    descriptionKey: 'palette.confirmRepositoryRemovalDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmRepositoryRemoval',
    },
  },
  {
    event: 'palette:set-commit-length-warning',
    title: 'Warn about long commit summaries',
    titleKey: 'palette.commitLengthWarning',
    group: 'App',
    materialSymbol: 'text_format',
    keywords: 'commit summary length warning 50 characters',
    descriptionKey: 'palette.commitLengthWarningDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsCommitLengthWarning',
    },
  },
  {
    event: 'palette:set-notifications-enabled',
    title: 'Desktop notifications',
    titleKey: 'palette.notificationsEnabled',
    group: 'App',
    materialSymbol: 'notifications',
    keywords: 'notifications alerts system toast enable disable',
    descriptionKey: 'palette.notificationsEnabledDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Notifications,
      targetId: 'settingsNotifications',
    },
  },
  {
    event: 'palette:set-underline-links',
    title: 'Underline links',
    titleKey: 'palette.underlineLinks',
    group: 'App',
    materialSymbol: 'format_underlined',
    keywords: 'underline links accessibility a11y readability',
    descriptionKey: 'palette.underlineLinksDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Accessibility,
      targetId: 'settingsUnderlineLinks',
    },
  },
  {
    event: 'palette:set-external-credential-helper',
    title: 'Use the external credential helper',
    titleKey: 'palette.externalCredentialHelper',
    group: 'App',
    materialSymbol: 'key',
    keywords: 'credential helper git authentication password manager',
    descriptionKey: 'palette.externalCredentialHelperDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsExternalCredentialHelper',
    },
  },
  {
    event: 'palette:set-windows-openssh',
    title: 'Use the Windows OpenSSH client',
    titleKey: 'palette.windowsOpenSSH',
    group: 'App',
    materialSymbol: 'terminal',
    keywords: 'ssh openssh windows client git transport',
    descriptionKey: 'palette.windowsOpenSSHDescription',
    control: { kind: 'toggle' },
    platform: 'win32',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsWindowsOpenSSH',
    },
  },

  // Diff presentation, which lives with the diff rather than in Settings.
  {
    event: 'palette:set-side-by-side-diff',
    title: 'Side-by-side diff',
    titleKey: 'palette.sideBySideDiff',
    group: 'Changes',
    materialSymbol: 'difference',
    keywords: 'diff split unified side by side view',
    descriptionKey: 'palette.sideBySideDiffDescription',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeChangesView',
      targetId: 'sidebarChangesTab',
    },
  },
  {
    event: 'palette:set-hide-whitespace-changes',
    title: 'Hide whitespace in the changes diff',
    titleKey: 'palette.hideWhitespaceChanges',
    group: 'Changes',
    materialSymbol: 'code',
    keywords: 'whitespace diff hide ignore changes',
    descriptionKey: 'palette.hideWhitespaceChangesDescription',
    control: { kind: 'toggle' },
    isAvailable: whenRepository,
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeChangesView',
      targetId: 'sidebarChangesTab',
    },
  },

  // Text the palette takes directly, rather than sending the user to a field
  // and asking them to type it there.
  {
    event: 'palette:entry-commit-summary',
    title: 'Commit summary',
    titleKey: 'palette.commitSummary',
    group: 'Changes',
    materialSymbol: 'edit',
    keywords: 'commit summary message subject write type',
    descriptionKey: 'palette.commitSummaryDescription',
    control: {
      kind: 'entry',
      placeholderKey: 'palette.commitSummaryPlaceholder',
      maxLength: 500,
    },
    isAvailable: whenRepository,
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeCommitBox',
      openEvent: 'go-to-commit-message',
      targetId: 'commitSummary',
    },
  },
  {
    event: 'palette:entry-clone-url',
    title: 'Clone from a URL',
    titleKey: 'palette.cloneUrl',
    group: 'Repository',
    materialSymbol: 'cloud_download',
    keywords: 'clone url git https repository download',
    descriptionKey: 'palette.cloneUrlDescription',
    control: {
      kind: 'entry',
      placeholderKey: 'palette.cloneUrlPlaceholder',
      maxLength: 2048,
      clearOnApply: true,
    },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeDialog',
      openEvent: 'clone-repository',
    },
  },

  // Settings panes
  {
    event: 'palette:preferences-accounts',
    title: 'Preferences: Accounts',
    titleKey: 'palette.preferencesAccounts',
    group: 'App',
    keywords: 'settings sign in login github account',
    home: { kind: 'preferences', tab: PreferencesTab.Accounts },
  },
  {
    event: 'palette:preferences-appearance',
    title: 'Preferences: Appearance',
    titleKey: 'palette.preferencesAppearance',
    group: 'App',
    keywords: 'settings theme language font look',
    home: { kind: 'preferences', tab: PreferencesTab.Appearance },
  },
  {
    event: 'palette:preferences-integrations',
    title: 'Preferences: Integrations',
    titleKey: 'palette.preferencesIntegrations',
    group: 'App',
    keywords: 'settings editor shell external tools',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Integrations,
      targetId: 'settingsExternalEditor',
    },
  },
  {
    event: 'palette:preferences-automation',
    title: 'Preferences: Automation',
    titleKey: 'palette.preferencesAutomation',
    group: 'App',
    keywords: 'settings automation rules scheduled',
    home: { kind: 'preferences', tab: PreferencesTab.Automation },
  },
  {
    event: 'palette:preferences-advanced',
    title: 'Preferences: Advanced',
    titleKey: 'palette.preferencesAdvanced',
    group: 'App',
    keywords: 'settings advanced diagnostics usage',
    home: { kind: 'preferences', tab: PreferencesTab.Advanced },
  },
  {
    event: 'palette:preferences-prompts',
    title: 'Preferences: Prompts and confirmations',
    titleKey: 'palette.preferencesPrompts',
    group: 'App',
    keywords: 'settings prompts confirmation dialog discard force push warning',
    home: { kind: 'preferences', tab: PreferencesTab.Prompts },
  },
  {
    event: 'palette:preferences-agent-access',
    title: 'Preferences: Agent access',
    titleKey: 'palette.preferencesAgentAccess',
    group: 'App',
    keywords: 'settings agent access automation permissions codex opencode',
    home: { kind: 'preferences', tab: PreferencesTab.AgentAccess },
  },
  {
    event: 'palette:preferences-notifications',
    title: 'Preferences: Notifications',
    titleKey: 'palette.preferencesNotifications',
    group: 'App',
    keywords: 'settings notifications alerts',
    home: { kind: 'preferences', tab: PreferencesTab.Notifications },
  },
  {
    event: 'palette:preferences-git',
    title: 'Preferences: Git',
    titleKey: 'palette.preferencesGit',
    group: 'App',
    keywords: 'settings git name email identity',
    home: { kind: 'preferences', tab: PreferencesTab.Git },
  },
  {
    event: 'palette:preferences-accessibility',
    title: 'Preferences: Accessibility',
    titleKey: 'palette.preferencesAccessibility',
    group: 'App',
    keywords: 'settings accessibility a11y motion contrast',
    home: { kind: 'preferences', tab: PreferencesTab.Accessibility },
  },
  {
    event: 'palette:preferences-sound',
    title: 'Preferences: Sound',
    titleKey: 'palette.preferencesSound',
    group: 'App',
    keywords:
      'settings sound audio music narrator tts voice volume quiet hours effects',
    home: { kind: 'preferences', tab: PreferencesTab.Sound },
  },
  // Surfaces that are otherwise only reachable by knowing which settings tab
  // hosts them. Naming them here makes them findable by what they do.
  {
    event: 'palette:ollama-model-manager',
    title: 'Ollama model manager',
    titleKey: 'palette.ollamaModelManager',
    group: 'App',
    materialSymbol: 'stacks',
    keywords:
      'ollama local model llm ai copilot provider pull run inventory manager endpoint',
    home: { kind: 'preferences', tab: PreferencesTab.Ollama },
  },
  {
    event: 'palette:ollama-chat',
    title: 'Ollama chat',
    titleKey: 'palette.ollamaChat',
    group: 'App',
    materialSymbol: 'stacks',
    keywords:
      'ollama chat prompt conversation local model llm ai copilot workspace',
    home: { kind: 'preferences', tab: PreferencesTab.Ollama },
  },
  {
    event: 'palette:preferences-copilot',
    title: 'Preferences: Copilot and AI providers',
    titleKey: 'palette.preferencesCopilot',
    group: 'App',
    materialSymbol: 'auto_awesome',
    keywords: 'copilot ai provider ollama openai model byok endpoint chat',
    home: { kind: 'preferences', tab: PreferencesTab.Copilot },
  },
  {
    event: 'palette:background-queue',
    title: 'Background action and API queue',
    titleKey: 'palette.backgroundQueue',
    group: 'App',
    materialSymbol: 'low_priority',
    keywords:
      'queue background docker api action job pending run task throughput concurrency',
    home: { kind: 'preferences', tab: PreferencesTab.Queue },
  },

  // Notifications
  {
    event: 'palette:notification-centre',
    title: 'Open notification centre',
    titleKey: 'palette.notificationCentre',
    group: 'App',
    materialSymbol: 'notifications',
    keywords: 'notifications centre center alerts inbox unread',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeNotificationCentre',
      openEvent: 'self',
    },
  },
  {
    // This opens the Git-backed version history of the notification store
    // (undo/redo/restore), not the notification inbox itself - that is
    // `palette:notification-centre`. The title says so directly so the two
    // rows are never confused for one another.
    event: 'palette:notification-history',
    title: 'Notification version history (undo, redo, restore)',
    titleKey: 'palette.notificationHistory',
    group: 'App',
    materialSymbol: 'history',
    keywords: 'notifications history undo redo restore local changes version',
  },
  {
    event: 'palette:notification-automations',
    title: 'Notification automations',
    titleKey: 'palette.notificationAutomations',
    group: 'App',
    keywords: 'notifications automation rules alerts',
  },

  // Clipboard
  {
    event: 'palette:copy-repo-path',
    title: 'Copy repository path',
    titleKey: 'palette.copyRepoPath',
    group: 'Repository',
    keywords: 'clipboard folder directory location',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:copy-branch-name',
    title: 'Copy current branch name',
    titleKey: 'palette.copyBranchName',
    group: 'Branch',
    keywords: 'clipboard head ref',
    isAvailable: whenBranch,
  },
  {
    event: 'palette:copy-commit-sha',
    title: 'Copy current commit SHA',
    titleKey: 'palette.copyCommitSha',
    group: 'Branch',
    keywords: 'clipboard hash tip head revision',
    isAvailable: whenBranch,
  },
  {
    event: 'palette:repository-settings-remote',
    title: 'Repository remotes',
    titleKey: 'palette.repositorySettingsRemote',
    group: 'Repository',
    keywords: 'origin upstream url push fetch remote',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.Remote,
    },
  },
  {
    event: 'palette:repository-settings-ignored-files',
    title: 'Ignored files',
    titleKey: 'palette.repositorySettingsIgnoredFiles',
    group: 'Repository',
    keywords: 'gitignore exclude ignore',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.IgnoredFiles,
    },
  },
  {
    event: 'palette:repository-settings-git-config',
    title: 'Repository Git config',
    titleKey: 'palette.repositorySettingsGitConfig',
    group: 'Repository',
    keywords: 'name email identity user config',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.GitConfig,
    },
  },
  {
    event: 'palette:repository-settings-build-run',
    title: 'Build and run settings',
    titleKey: 'palette.repositorySettingsBuildRun',
    group: 'Repository',
    keywords: 'compile toolchain task script run',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.BuildRun,
    },
  },
  {
    event: 'palette:repository-settings-cheap-lfs',
    title: 'Large file settings',
    titleKey: 'palette.repositorySettingsCheapLfs',
    group: 'Repository',
    keywords: 'lfs large binary storage sidecar',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.CheapLfs,
    },
  },
  {
    event: 'palette:repository-settings-submodules',
    title: 'Submodule settings',
    titleKey: 'palette.repositorySettingsSubmodules',
    group: 'Repository',
    keywords: 'submodule nested clone update',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.Submodules,
    },
  },
  {
    event: 'palette:repository-settings-subtrees',
    title: 'Subtree settings',
    titleKey: 'palette.repositorySettingsSubtrees',
    group: 'Repository',
    keywords: 'subtree vendored merge split prefix',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.Subtrees,
    },
  },
  {
    event: 'palette:repository-settings-automation',
    title: 'Repository automation overrides',
    titleKey: 'palette.repositorySettingsAutomation',
    group: 'Repository',
    keywords: 'automation hooks schedule trigger override',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.Automation,
    },
  },
  {
    event: 'palette:repository-settings-metadata',
    title: 'Repository metadata',
    titleKey: 'palette.repositorySettingsMetadata',
    group: 'Repository',
    keywords: 'description topics label notes',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.Metadata,
    },
  },
  {
    event: 'palette:repository-settings-appearance',
    title: 'Repository appearance',
    titleKey: 'palette.repositorySettingsAppearance',
    group: 'Repository',
    keywords: 'colour color icon logo tab decoration',
    isAvailable: whenRepository,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.Appearance,
    },
  },
  {
    event: 'palette:repository-settings-fork-settings',
    title: 'Fork behaviour',
    titleKey: 'palette.repositorySettingsForkSettings',
    group: 'Repository',
    keywords: 'fork upstream parent contribution',
    isAvailable: whenFork,
    home: {
      kind: 'repositorySettings',
      tab: RepositorySettingsTab.ForkSettings,
    },
  },
  {
    event: 'palette:report-issue',
    title: 'Report an issue',
    titleKey: 'palette.reportIssue',
    descriptionKey: 'palette.reportIssueDescription',
    group: 'App',
    keywords: 'bug feedback problem github issue bug報告',
    home: { kind: 'surface', labelKey: 'commandPalette.homeMenuBar' },
  },
  {
    event: 'palette:contact-support',
    title: 'Contact support',
    titleKey: 'palette.contactSupport',
    descriptionKey: 'palette.contactSupportDescription',
    group: 'App',
    keywords: 'help support contact assistance',
    home: { kind: 'surface', labelKey: 'commandPalette.homeMenuBar' },
  },
  {
    event: 'palette:user-guides',
    title: 'Show the user guides',
    titleKey: 'palette.userGuides',
    descriptionKey: 'palette.userGuidesDescription',
    group: 'App',
    keywords: 'help docs documentation manual guide',
    home: { kind: 'surface', labelKey: 'commandPalette.homeMenuBar' },
  },
  {
    event: 'palette:keyboard-shortcuts',
    title: 'Show keyboard shortcuts',
    titleKey: 'palette.keyboardShortcuts',
    descriptionKey: 'palette.keyboardShortcutsDescription',
    group: 'App',
    keywords: 'keys hotkeys accelerators bindings shortcut',
    home: { kind: 'surface', labelKey: 'commandPalette.homeMenuBar' },
  },
  {
    event: 'palette:show-logs-folder',
    title: 'Show the logs folder',
    titleKey: 'palette.showLogsFolder',
    descriptionKey: 'palette.showLogsFolderDescription',
    group: 'App',
    keywords: 'log diagnostics troubleshoot folder directory',
    home: { kind: 'surface', labelKey: 'commandPalette.homeMenuBar' },
  },
  {
    event: 'increase-active-resizable-width',
    title: 'Expand the active resizable pane',
    titleKey: 'palette.increaseActiveResizableWidth',
    group: 'App',
    keywords: 'active expand pane resizable the',
  },
  {
    event: 'decrease-active-resizable-width',
    title: 'Contract the active resizable pane',
    titleKey: 'palette.decreaseActiveResizableWidth',
    group: 'App',
    keywords: 'active contract pane resizable the',
  },
  {
    event: 'palette:set-theme-mode',
    title: 'Theme',
    titleKey: 'palette.setThemeMode',
    group: 'App',
    keywords: 'theme',
    control: {
      kind: 'choice',
      options: [
        { value: 'light', labelKey: 'palette.setThemeMode.light' },
        { value: 'dark', labelKey: 'palette.setThemeMode.dark' },
        { value: 'system', labelKey: 'palette.setThemeMode.system' },
      ],
    },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsTheme',
    },
  },
  {
    event: 'palette:set-ui-scale',
    title: 'Interface scale',
    titleKey: 'palette.setUiScale',
    group: 'App',
    keywords: 'interface scale',
    control: { kind: 'number', min: 50, max: 200, step: 5 },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsUiScale',
    },
  },
  {
    event: 'palette:set-auto-fit-zoom',
    title: 'Shrink the interface to fit small windows',
    titleKey: 'palette.setAutoFitZoom',
    group: 'App',
    keywords: 'fit interface shrink small the windows',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsAutoFitZoom',
    },
  },
  {
    event: 'palette:set-show-recent-repositories',
    title: 'Show recent repositories',
    titleKey: 'palette.setShowRecentRepositories',
    group: 'App',
    keywords: 'recent repositories show',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsShowRecentRepositories',
    },
  },
  {
    event: 'palette:set-branch-name-in-repo-list',
    title: 'Show the branch name in the repository list',
    titleKey: 'palette.setBranchNameInRepoList',
    group: 'App',
    keywords: 'branch list name repository show the',
    control: {
      kind: 'choice',
      options: [
        { value: 'always', labelKey: 'palette.setBranchNameInRepoList.always' },
        {
          value: 'notDefault',
          labelKey: 'palette.setBranchNameInRepoList.notDefault',
        },
        { value: 'never', labelKey: 'palette.setBranchNameInRepoList.never' },
      ],
    },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsBranchNameInRepoList',
    },
  },
  {
    event: 'palette:set-branch-sort',
    title: 'Sort branches',
    titleKey: 'palette.setBranchSort',
    group: 'Branch',
    keywords: 'branches sort',
    control: {
      kind: 'choice',
      options: [
        {
          value: 'lastModified',
          labelKey: 'palette.setBranchSort.lastModified',
        },
        {
          value: 'alphabetical',
          labelKey: 'palette.setBranchSort.alphabetical',
        },
      ],
    },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsBranchSort',
    },
  },
  {
    event: 'palette:set-date-format',
    title: 'Date format',
    titleKey: 'palette.setDateFormat',
    group: 'App',
    keywords: 'date format',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsDateFormat',
    },
  },
  {
    event: 'palette:set-time-format',
    title: 'Time format',
    titleKey: 'palette.setTimeFormat',
    group: 'App',
    keywords: 'format time',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsTimeFormat',
    },
  },
  {
    event: 'palette:set-number-format',
    title: 'Number format',
    titleKey: 'palette.setNumberFormat',
    group: 'App',
    keywords: 'format number',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsNumberFormat',
    },
  },
  {
    event: 'palette:set-prefer-absolute-dates',
    title: 'Prefer absolute dates over relative',
    titleKey: 'palette.setPreferAbsoluteDates',
    group: 'App',
    keywords: 'absolute dates over prefer relative',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Appearance,
      targetId: 'settingsPreferAbsoluteDates',
    },
  },
  {
    event: 'palette:set-auto-switch-account',
    title: 'Switch the active account to the repository owner',
    titleKey: 'palette.setAutoSwitchAccount',
    group: 'App',
    keywords: 'account active owner repository switch the',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsAutoSwitchAccount',
    },
  },
  {
    event: 'palette:set-repository-indicators',
    title: 'Show status icons in the repository list',
    titleKey: 'palette.setRepositoryIndicators',
    group: 'App',
    keywords: 'icons list repository show status the',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsRepositoryIndicators',
    },
  },
  {
    event: 'palette:set-usage-stats',
    title: 'Submit usage stats',
    titleKey: 'palette.setUsageStats',
    group: 'App',
    keywords: 'stats submit usage',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsUsageStats',
    },
  },
  {
    event: 'palette:set-verbose-logging',
    title: 'Verbose logging (debug level)',
    titleKey: 'palette.setVerboseLogging',
    group: 'App',
    keywords: 'debug level logging verbose',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsVerboseLogging',
    },
  },
  {
    event: 'palette:set-large-repo-auto-detect',
    title: 'Detect large repositories automatically',
    titleKey: 'palette.setLargeRepoAutoDetect',
    group: 'App',
    keywords: 'automatically detect large repositories',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsLargeRepoAutoDetect',
    },
  },
  {
    event: 'palette:set-large-repo-auto-repack',
    title: 'Repack large repositories when idle',
    titleKey: 'palette.setLargeRepoAutoRepack',
    group: 'App',
    keywords: 'idle large repack repositories when',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsLargeRepoAutoRepack',
    },
  },
  {
    event: 'palette:set-browser-open-mode',
    title: 'Open web links',
    titleKey: 'palette.setBrowserOpenMode',
    group: 'App',
    keywords: 'links open web',
    control: {
      kind: 'choice',
      options: [
        { value: 'internal', labelKey: 'palette.setBrowserOpenMode.internal' },
        { value: 'external', labelKey: 'palette.setBrowserOpenMode.external' },
      ],
    },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Advanced,
      targetId: 'settingsBrowserOpenMode',
    },
  },
  {
    event: 'palette:set-confirm-discard-permanently',
    title: 'Confirm before permanently discarding changes',
    titleKey: 'palette.setConfirmDiscardPermanently',
    group: 'App',
    keywords: 'before changes confirm discarding permanently',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmDiscardPermanently',
    },
  },
  {
    event: 'palette:set-confirm-discard-stash',
    title: 'Confirm before discarding a stash',
    titleKey: 'palette.setConfirmDiscardStash',
    group: 'Changes',
    keywords: 'before confirm discarding stash',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmDiscardStash',
    },
  },
  {
    event: 'palette:set-confirm-checkout-commit',
    title: 'Confirm before checking out a commit',
    titleKey: 'palette.setConfirmCheckoutCommit',
    group: 'Branch',
    keywords: 'before checking commit confirm out',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmCheckoutCommit',
    },
  },
  {
    event: 'palette:set-confirm-undo-commit',
    title: 'Confirm before undoing a commit',
    titleKey: 'palette.setConfirmUndoCommit',
    group: 'Changes',
    keywords: 'before commit confirm undoing',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmUndoCommit',
    },
  },
  {
    event: 'palette:set-confirm-commit-message-override',
    title: 'Confirm before overwriting the commit message with a generated one',
    titleKey: 'palette.setConfirmCommitMessageOverride',
    group: 'Changes',
    keywords:
      'before commit confirm generated message one overwriting the with',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmCommitMessageOverride',
    },
  },
  {
    event: 'palette:set-confirm-worktree-removal',
    title: 'Confirm before removing a worktree',
    titleKey: 'palette.setConfirmWorktreeRemoval',
    group: 'Branch',
    keywords: 'before confirm removing worktree',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmWorktreeRemoval',
    },
  },
  {
    event: 'palette:set-confirm-commit-filtered-changes',
    title: 'Confirm before committing changes hidden by the filter',
    titleKey: 'palette.setConfirmCommitFilteredChanges',
    group: 'Changes',
    keywords: 'before changes committing confirm filter hidden the',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsConfirmCommitFilteredChanges',
    },
  },
  {
    event: 'palette:set-uncommitted-changes-strategy',
    title: 'When switching branches with uncommitted changes',
    titleKey: 'palette.setUncommittedChangesStrategy',
    group: 'Changes',
    keywords: 'branches changes switching uncommitted when with',
    control: {
      kind: 'choice',
      options: [
        {
          value: 'askForConfirmation',
          labelKey: 'palette.setUncommittedChangesStrategy.askForConfirmation',
        },
        {
          value: 'moveToNewBranch',
          labelKey: 'palette.setUncommittedChangesStrategy.moveToNewBranch',
        },
        {
          value: 'stashOnCurrentBranch',
          labelKey:
            'palette.setUncommittedChangesStrategy.stashOnCurrentBranch',
        },
      ],
    },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Prompts,
      targetId: 'settingsUncommittedChangesStrategy',
    },
  },
  {
    event: 'palette:set-diff-check-marks',
    title: 'Show check marks in the diff',
    titleKey: 'palette.setDiffCheckMarks',
    group: 'Changes',
    keywords: 'check diff marks show the',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'settingsDiffCheckMarks',
    },
  },
  {
    event: 'palette:set-error-presentation',
    title: 'Application error presentation',
    titleKey: 'palette.setErrorPresentation',
    group: 'App',
    keywords: 'application error presentation',
    control: {
      kind: 'choice',
      options: [
        { value: 'notice', labelKey: 'palette.setErrorPresentation.notice' },
        { value: 'dialog', labelKey: 'palette.setErrorPresentation.dialog' },
      ],
    },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'settingsErrorPresentation',
    },
  },
  {
    event: 'palette:entry-git-author-name',
    title: 'Git author name',
    titleKey: 'palette.entryGitAuthorName',
    group: 'App',
    keywords: 'author git name',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Git,
      targetId: 'settingsGitAuthorName',
    },
  },
  {
    event: 'palette:entry-git-author-email',
    title: 'Git author email',
    titleKey: 'palette.entryGitAuthorEmail',
    group: 'App',
    keywords: 'author email git',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Git,
      targetId: 'settingsGitAuthorEmail',
    },
  },
  {
    event: 'palette:set-show-commit-identity',
    title: 'Show the effective identity above the commit message',
    titleKey: 'palette.setShowCommitIdentity',
    group: 'Changes',
    keywords: 'above commit effective identity message show the',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Git,
      targetId: 'settingsShowCommitIdentity',
    },
  },
  {
    event: 'palette:entry-default-branch-name',
    title: 'Default branch name for new repositories',
    titleKey: 'palette.entryDefaultBranchName',
    group: 'Branch',
    keywords: 'branch default for name new repositories',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Git,
      targetId: 'settingsDefaultBranchName',
    },
  },
  {
    event: 'palette:set-git-hook-env',
    title: 'Load Git hook environment variables from the shell',
    titleKey: 'palette.setGitHookEnv',
    group: 'App',
    keywords: 'environment from git hook load shell the variables',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Git,
      targetId: 'settingsGitHookEnv',
    },
  },
  {
    event: 'palette:set-git-hook-env-shell',
    title: 'Shell used to load the hook environment',
    titleKey: 'palette.setGitHookEnvShell',
    group: 'App',
    keywords: 'environment hook load shell the used',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Git,
      targetId: 'settingsGitHookEnvShell',
    },
  },
  {
    event: 'palette:set-git-hook-env-cache',
    title: 'Cache Git hook environment variables',
    titleKey: 'palette.setGitHookEnvCache',
    group: 'App',
    keywords: 'cache environment git hook variables',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Git,
      targetId: 'settingsGitHookEnvCache',
    },
  },
  {
    event: 'palette:global-ignore',
    title: 'Global ignore rules',
    titleKey: 'palette.globalIgnore',
    group: 'App',
    keywords: 'global ignore rules',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Git,
      targetId: 'settingsGlobalIgnore',
    },
  },
  {
    event: 'palette:set-external-editor',
    title: 'External editor',
    titleKey: 'palette.setExternalEditor',
    group: 'App',
    keywords: 'editor external',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Integrations,
      targetId: 'settingsExternalEditor',
    },
  },
  {
    event: 'palette:set-shell',
    title: 'Shell',
    titleKey: 'palette.setShell',
    group: 'App',
    keywords: 'shell',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Integrations,
      targetId: 'settingsShell',
    },
  },
  {
    event: 'palette:set-context-menu-opencode',
    title: 'Explorer context menu: Open with OpenCode here',
    titleKey: 'palette.setContextMenuOpencode',
    group: 'App',
    keywords: 'context explorer here menu open opencode with',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Integrations,
      targetId: 'settingsContextMenuOpencode',
    },
  },
  {
    event: 'palette:set-context-menu-desktop-material',
    title: 'Explorer context menu: Open in Desktop Material',
    titleKey: 'palette.setContextMenuDesktopMaterial',
    group: 'App',
    keywords: 'context desktop explorer material menu open',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Integrations,
      targetId: 'settingsContextMenuDesktopMaterial',
    },
  },
  {
    event: 'palette:set-context-menu-modern',
    title: 'Show in the main Windows 11 menu',
    titleKey: 'palette.setContextMenuModern',
    group: 'App',
    keywords: 'main menu show the windows',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Integrations,
      targetId: 'settingsContextMenuModern',
    },
  },
  {
    event: 'palette:branch-preset-script',
    title: 'Branch name preset script',
    titleKey: 'palette.branchPresetScript',
    group: 'Branch',
    keywords: 'branch name preset script',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Integrations,
      targetId: 'settingsBranchPresetScript',
    },
  },
  {
    event: 'palette:custom-integrations',
    title: 'Custom editor and shell commands',
    titleKey: 'palette.customIntegrations',
    group: 'App',
    keywords: 'and commands custom editor shell',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Integrations,
      targetId: 'settingsCustomIntegration',
    },
  },
  {
    event: 'palette:set-agent-server-enabled',
    title: 'Agent server',
    titleKey: 'palette.setAgentServerEnabled',
    group: 'App',
    keywords: 'agent server',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.AgentAccess,
      targetId: 'settingsAgentServerEnabled',
    },
  },
  {
    event: 'palette:agent-access-mode',
    title: 'Agent access mode',
    titleKey: 'palette.agentAccessMode',
    group: 'App',
    keywords: 'access agent mode',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.AgentAccess,
      targetId: 'settingsAgentAccessMode',
    },
  },
  {
    event: 'palette:agent-pairing',
    title: 'Pair a mobile device',
    titleKey: 'palette.agentPairing',
    group: 'App',
    keywords: 'device mobile pair',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.AgentAccess,
      targetId: 'settingsAgentPairing',
    },
  },
  {
    event: 'palette:agent-token',
    title: 'Desktop bearer token',
    titleKey: 'palette.agentToken',
    group: 'App',
    keywords: 'bearer desktop token',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.AgentAccess,
      targetId: 'settingsAgentToken',
    },
  },
  {
    event: 'palette:set-auto-commit-push',
    title: 'Automatically commit and push',
    titleKey: 'palette.setAutoCommitPush',
    group: 'Repository',
    keywords: 'and automatically commit push',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Automation,
      targetId: 'settingsAutoCommitPush',
    },
  },
  {
    event: 'palette:set-auto-commit-push-interval',
    title: 'Commit and push interval',
    titleKey: 'palette.setAutoCommitPushInterval',
    group: 'Repository',
    keywords: 'and commit interval push',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Automation,
      targetId: 'settingsAutoCommitPushInterval',
    },
  },
  {
    event: 'palette:set-auto-pull',
    title: 'Automatically pull',
    titleKey: 'palette.setAutoPull',
    group: 'Repository',
    keywords: 'automatically pull',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Automation,
      targetId: 'settingsAutoPull',
    },
  },
  {
    event: 'palette:set-auto-pull-interval',
    title: 'Pull interval',
    titleKey: 'palette.setAutoPullInterval',
    group: 'Repository',
    keywords: 'interval pull',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Automation,
      targetId: 'settingsAutoPullInterval',
    },
  },
  {
    event: 'palette:automation-account-overrides',
    title: 'Automation overrides (per account)',
    titleKey: 'palette.automationAccountOverrides',
    group: 'App',
    keywords: 'account automation overrides per',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Automation,
      targetId: 'settingsAutomationAccountOverrides',
    },
  },
  {
    event: 'palette:queue-clone-settings',
    title: 'Clone queue settings (per account)',
    titleKey: 'palette.queueCloneSettings',
    group: 'App',
    keywords: 'account clone per queue settings',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Queue,
      targetId: 'settingsQueueAccounts',
    },
  },
  {
    event: 'palette:set-sound-enabled',
    title: 'Sound',
    titleKey: 'palette.setSoundEnabled',
    group: 'App',
    keywords: 'sound',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundMaster',
    },
  },
  {
    event: 'palette:set-sound-effects',
    title: 'Play sound effects',
    titleKey: 'palette.setSoundEffects',
    group: 'App',
    keywords: 'effects play sound',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundEffects',
    },
  },
  {
    event: 'palette:set-sound-effect-volume',
    title: 'Effect volume',
    titleKey: 'palette.setSoundEffectVolume',
    group: 'App',
    keywords: 'effect volume',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundEffectVolume',
    },
  },
  {
    event: 'palette:set-sound-narrator',
    title: 'Spoken narrator',
    titleKey: 'palette.setSoundNarrator',
    group: 'App',
    keywords: 'narrator spoken',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundNarrator',
    },
  },
  {
    event: 'palette:set-sound-recorded-narration',
    title: 'Use recorded narration',
    titleKey: 'palette.setSoundRecordedNarration',
    group: 'App',
    keywords: 'narration recorded use',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundRecordedNarration',
    },
  },
  {
    event: 'palette:set-sound-narrator-volume',
    title: 'Narrator volume',
    titleKey: 'palette.setSoundNarratorVolume',
    group: 'App',
    keywords: 'narrator volume',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundNarratorVolume',
    },
  },
  {
    event: 'palette:set-sound-narrator-cooldown',
    title: 'Minimum gap between narrated lines',
    titleKey: 'palette.setSoundNarratorCooldown',
    group: 'App',
    keywords: 'between gap lines minimum narrated',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundNarratorCooldown',
    },
  },
  {
    event: 'palette:set-sound-music',
    title: 'Play themed music',
    titleKey: 'palette.setSoundMusic',
    group: 'App',
    keywords: 'music play themed',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundMusic',
    },
  },
  {
    event: 'palette:set-sound-music-volume',
    title: 'Music volume',
    titleKey: 'palette.setSoundMusicVolume',
    group: 'App',
    keywords: 'music volume',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundMusicVolume',
    },
  },
  {
    event: 'palette:set-sound-quiet-hours',
    title: 'Mute during quiet hours',
    titleKey: 'palette.setSoundQuietHours',
    group: 'App',
    keywords: 'during hours mute quiet',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundQuietHours',
    },
  },
  {
    event: 'palette:set-sound-quiet-hours-start',
    title: 'Quiet hours start',
    titleKey: 'palette.setSoundQuietHoursStart',
    group: 'App',
    keywords: 'hours quiet start',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundQuietHoursStart',
    },
  },
  {
    event: 'palette:set-sound-quiet-hours-end',
    title: 'Quiet hours end',
    titleKey: 'palette.setSoundQuietHoursEnd',
    group: 'App',
    keywords: 'end hours quiet',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundQuietHoursEnd',
    },
  },
  {
    event: 'palette:set-sound-reduced-motion',
    title: 'Follow reduced motion for sound',
    titleKey: 'palette.setSoundReducedMotion',
    group: 'App',
    keywords: 'follow for motion reduced sound',
    control: { kind: 'toggle' },
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundReducedMotion',
    },
  },
  {
    event: 'palette:repository-music-track',
    title: 'Music track for this repository',
    titleKey: 'palette.repositoryMusicTrack',
    group: 'Repository',
    keywords: 'for music repository this track',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundMusicTrack',
    },
  },
  {
    event: 'palette:audition-sound-cues',
    title: 'Audition the sound cues',
    titleKey: 'palette.auditionSoundCues',
    group: 'App',
    keywords: 'audition cues sound the',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Sound,
      targetId: 'settingsSoundAudition',
    },
  },
  {
    event: 'palette:copilot-commit-model',
    title: 'Copilot commit-message model',
    titleKey: 'palette.copilotCommitModel',
    group: 'App',
    keywords: 'commit copilot message model',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'settingsCopilotCommitModel',
    },
  },
  {
    event: 'palette:copilot-conflict-model',
    title: 'Copilot conflict-resolution model',
    titleKey: 'palette.copilotConflictModel',
    group: 'App',
    keywords: 'conflict copilot model resolution',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'settingsCopilotConflictModel',
    },
  },
  {
    event: 'palette:set-copilot-always-resolve-conflicts',
    title: 'Always use Copilot when conflicts are detected',
    titleKey: 'palette.setCopilotAlwaysResolveConflicts',
    group: 'Changes',
    keywords: 'always are conflicts copilot detected use when',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'settingsCopilotAlwaysConflicts',
    },
  },
  {
    event: 'palette:add-ai-provider',
    title: 'Add an AI provider (BYOK)',
    titleKey: 'palette.addAiProvider',
    group: 'App',
    keywords: 'add byok provider',
    home: {
      kind: 'preferences',
      tab: PreferencesTab.Copilot,
    },
  },
  {
    event: 'palette:entry-ollama-endpoint',
    title: 'Ollama endpoint',
    titleKey: 'palette.entryOllamaEndpoint',
    group: 'App',
    keywords: 'endpoint ollama',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'settingsOllamaEndpoint',
    },
  },
  {
    event: 'palette:ssh-working-copy',
    title: 'SSH working copy',
    titleKey: 'palette.sshWorkingCopy',
    group: 'Repository',
    keywords: 'copy ssh working',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeRepositoryTools',
      targetId: 'sidebarRepositoryToolsTab',
    },
  },
  {
    event: 'palette:set-build-auto-install',
    title: 'Auto-install missing build tools',
    titleKey: 'palette.setBuildAutoInstall',
    group: 'Repository',
    keywords: 'auto build install missing tools',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsBuildAutoInstall',
    },
  },
  {
    event: 'palette:set-build-pre-elevate',
    title: 'Pre-elevate the build chain',
    titleKey: 'palette.setBuildPreElevate',
    group: 'Repository',
    keywords: 'build chain elevate pre the',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsBuildPreElevate',
    },
  },
  {
    event: 'palette:set-build-run-after-build',
    title: 'Run after a successful build',
    titleKey: 'palette.setBuildRunAfterBuild',
    group: 'Repository',
    keywords: 'after build run successful',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsBuildRunAfterBuild',
    },
  },
  {
    event: 'palette:set-build-auto-ignore-outputs',
    title: 'Auto-ignore build outputs',
    titleKey: 'palette.setBuildAutoIgnoreOutputs',
    group: 'Repository',
    keywords: 'auto build ignore outputs',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsBuildAutoIgnore',
    },
  },
  {
    event: 'palette:set-build-after-pull',
    title: 'Build after pulling new commits',
    titleKey: 'palette.setBuildAfterPull',
    group: 'Repository',
    keywords: 'after build commits new pulling',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsBuildAfterPull',
    },
  },
  {
    event: 'palette:set-build-offer-agents',
    title: 'Offer Codex/OpenCode to fix build errors',
    titleKey: 'palette.setBuildOfferAgents',
    group: 'Repository',
    keywords: 'build codex errors fix offer opencode',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsBuildOfferAgents',
    },
  },
  {
    event: 'palette:set-build-fix-provider',
    title: 'Preferred build-fix provider',
    titleKey: 'palette.setBuildFixProvider',
    group: 'Repository',
    keywords: 'build fix preferred provider',
    control: {
      kind: 'choice',
      options: [
        { value: 'codex', labelKey: 'palette.setBuildFixProvider.codex' },
        { value: 'opencode', labelKey: 'palette.setBuildFixProvider.opencode' },
      ],
    },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsBuildFixProvider',
    },
  },
  {
    event: 'palette:set-build-fix-auto-approve',
    title: 'Auto-approve the build-fix agent in this repository',
    titleKey: 'palette.setBuildFixAutoApprove',
    group: 'Repository',
    keywords: 'agent approve auto build fix repository the this',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsBuildFixAutoApprove',
    },
  },
  {
    event: 'palette:set-cheap-lfs-auto-materialize',
    title: 'Download large files after cloning',
    titleKey: 'palette.setCheapLfsAutoMaterialize',
    group: 'Repository',
    keywords: 'after cloning download files large',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsCheapLfsAutoMaterialize',
    },
  },
  {
    event: 'palette:set-cheap-lfs-auto-pin',
    title: 'Pin large files when committing',
    titleKey: 'palette.setCheapLfsAutoPin',
    group: 'Repository',
    keywords: 'committing files large pin when',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsCheapLfsAutoPin',
    },
  },
  {
    event: 'palette:set-cheap-lfs-clone-helper',
    title: 'Include the clone helper script',
    titleKey: 'palette.setCheapLfsCloneHelper',
    group: 'Repository',
    keywords: 'clone helper include script the',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsCheapLfsCloneHelper',
    },
  },
  {
    event: 'palette:set-cheap-lfs-parallel-uploads',
    title: 'Simultaneous Cheap LFS uploads',
    titleKey: 'palette.setCheapLfsParallelUploads',
    group: 'Repository',
    keywords: 'cheap lfs simultaneous uploads',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsCheapLfsParallelUploads',
    },
  },
  {
    event: 'palette:set-cheap-lfs-storage-provider',
    title: 'Large-file storage provider',
    titleKey: 'palette.setCheapLfsStorageProvider',
    group: 'Repository',
    keywords: 'file large provider storage',
    control: {
      kind: 'choice',
      options: [
        {
          value: 'release',
          labelKey: 'palette.setCheapLfsStorageProvider.release',
        },
        { value: 'ghcr', labelKey: 'palette.setCheapLfsStorageProvider.ghcr' },
        {
          value: 'dockerhub',
          labelKey: 'palette.setCheapLfsStorageProvider.dockerhub',
        },
      ],
    },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsCheapLfsStorageProvider',
    },
  },
  {
    event: 'palette:set-cheap-lfs-cloud-compression',
    title: 'Cloud compression for this private repository',
    titleKey: 'palette.setCheapLfsCloudCompression',
    group: 'Repository',
    keywords: 'cloud compression for private repository this',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsCheapLfsCloudCompression',
    },
  },
  {
    event: 'palette:cheap-lfs-encryption',
    title: 'Encrypt new Release payloads with a password',
    titleKey: 'palette.cheapLfsEncryption',
    group: 'Repository',
    keywords: 'encrypt new password payloads release with',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsCheapLfsEncryption',
    },
  },
  {
    event: 'palette:set-signing-commits',
    title: 'Sign commits by default',
    titleKey: 'palette.setSigningCommits',
    group: 'Repository',
    keywords: 'commits default sign',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeRepositoryTools',
      openEvent: 'show-repository-tools',
      targetId: 'repositoryToolsSigning',
    },
    isAvailable: whenRepository,
  },
  {
    event: 'palette:set-signing-tags',
    title: 'Sign annotated tags by default',
    titleKey: 'palette.setSigningTags',
    group: 'Repository',
    keywords: 'annotated default sign tags',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeRepositoryTools',
      openEvent: 'show-repository-tools',
      targetId: 'repositoryToolsSigning',
    },
    isAvailable: whenRepository,
  },
  {
    event: 'palette:signing-policy',
    title: 'Manage the signing policy',
    titleKey: 'palette.signingPolicy',
    group: 'Repository',
    keywords: 'manage policy signing the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeRepositoryTools',
      openEvent: 'show-repository-tools',
      targetId: 'repositoryToolsSigning',
    },
    isAvailable: whenRepository,
  },
  {
    event: 'palette:set-diff-auto-expand-context',
    title: 'Automatically expand whole-file context',
    titleKey: 'palette.setDiffAutoExpandContext',
    group: 'Changes',
    keywords: 'automatically context expand file whole',
    control: { kind: 'toggle' },
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'diffOptionsButton',
    },
  },
  {
    event: 'palette:set-diff-context-step',
    title: 'Context expansion step',
    titleKey: 'palette.setDiffContextStep',
    group: 'Changes',
    keywords: 'context expansion step',
  },
  {
    event: 'palette:appearance',
    title: 'Customize the command palette',
    titleKey: 'palette.appearance',
    group: 'App',
    keywords: 'command customize palette the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'paletteAppearanceButton',
    },
  },
  {
    event: 'palette:set-palette-density',
    title: 'Command palette row density',
    titleKey: 'palette.setPaletteDensity',
    group: 'App',
    keywords: 'command density palette row',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homePalette',
      targetId: 'paletteAppearanceButton',
    },
  },
  {
    event: 'palette:set-palette-random-per-repository',
    title: "Randomize the palette's look per repository",
    titleKey: 'palette.setPaletteRandomPerRepository',
    group: 'App',
    keywords: 'look palette per randomize repository the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homePalette',
      targetId: 'paletteAppearanceButton',
    },
  },
  {
    event: 'palette:set-palette-show-icons',
    title: 'Show icons in palette rows',
    titleKey: 'palette.setPaletteShowIcons',
    group: 'App',
    keywords: 'icons palette rows show',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homePalette',
      targetId: 'paletteAppearanceButton',
    },
  },
  {
    event: 'palette:set-palette-show-group-chips',
    title: 'Show group chips in palette rows',
    titleKey: 'palette.setPaletteShowGroupChips',
    group: 'App',
    keywords: 'chips group palette rows show',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homePalette',
      targetId: 'paletteAppearanceButton',
    },
  },
  {
    event: 'palette:set-palette-show-keywords',
    title: 'Show the keyword line in palette rows',
    titleKey: 'palette.setPaletteShowKeywords',
    group: 'App',
    keywords: 'keyword line palette rows show the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homePalette',
      targetId: 'paletteAppearanceButton',
    },
  },
  {
    event: 'palette:new-tab-group',
    title: 'New tab group',
    titleKey: 'palette.newTabGroup',
    group: 'App',
    keywords: 'group new tab',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:edit-tab-group',
    title: 'Edit the current tab group',
    titleKey: 'palette.editTabGroup',
    group: 'App',
    keywords: 'current edit group tab the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:close-tabs-containing',
    title: 'Close tabs containing text',
    titleKey: 'palette.closeTabsContaining',
    group: 'App',
    keywords: 'close containing tabs text',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:close-tabs-not-containing',
    title: 'Close tabs not containing text',
    titleKey: 'palette.closeTabsNotContaining',
    group: 'App',
    keywords: 'close containing not tabs text',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:pin-tab',
    title: 'Pin the current tab',
    titleKey: 'palette.pinTab',
    group: 'App',
    keywords: 'current pin tab the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:unpin-tab',
    title: 'Unpin the current tab',
    titleKey: 'palette.unpinTab',
    group: 'App',
    keywords: 'current tab the unpin',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:edit-tab-appearance',
    title: "Edit the current tab's appearance",
    titleKey: 'palette.editTabAppearance',
    group: 'App',
    keywords: 'appearance current edit tab the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:search-tabs',
    title: 'Search open tabs',
    titleKey: 'palette.searchTabs',
    group: 'Navigate',
    keywords: 'open search tabs',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:edit-app-appearance',
    title: "Edit the app's appearance",
    titleKey: 'palette.editAppAppearance',
    group: 'App',
    keywords: 'app appearance edit the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'appWorkspace',
    },
  },
  {
    event: 'palette:edit-app-identity',
    title: 'Edit the app name and logo',
    titleKey: 'palette.editAppIdentity',
    group: 'App',
    keywords: 'and app edit logo name the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'titleBarBrand',
    },
  },
  {
    event: 'palette:edit-toolbar-appearance',
    title: "Edit the toolbar's appearance",
    titleKey: 'palette.editToolbarAppearance',
    group: 'App',
    keywords: 'appearance edit the toolbar',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'toolbarRepository',
    },
  },
  {
    event: 'palette:edit-repository-list-appearance',
    title: "Edit the repository list's appearance",
    titleKey: 'palette.editRepositoryListAppearance',
    group: 'App',
    keywords: 'appearance edit list repository the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repositorySidebar',
    },
  },
  {
    event: 'palette:edit-repository-tabs-appearance',
    title: 'Edit repository tab appearance',
    titleKey: 'palette.editRepositoryTabsAppearance',
    group: 'App',
    keywords: 'appearance edit repository tab',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:edit-repository-logo',
    title: 'Edit the repository logo',
    titleKey: 'palette.editRepositoryLogo',
    group: 'Repository',
    keywords: 'edit logo repository the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeRepositoryAppearance',
      targetId: 'repoSettingsAppearance',
    },
  },
  {
    event: 'palette:manage-repository-groups',
    title: 'Manage repository groups',
    titleKey: 'palette.manageRepositoryGroups',
    group: 'App',
    keywords: 'groups manage repository',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeRepositoryList',
      targetId: 'repositorySidebar',
    },
  },
  {
    event: 'palette:repository-account',
    title: 'Repository account',
    titleKey: 'palette.repositoryAccount',
    group: 'Repository',
    keywords: 'account repository',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeSidebar',
      targetId: 'repoSettingsAccount',
    },
  },
  {
    event: 'palette:regex-builder',
    title: 'Open the regex builder',
    titleKey: 'palette.regexBuilder',
    group: 'Edit',
    keywords: 'builder open regex the',
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeWorkspace',
      targetId: 'appWorkspace',
    },
  },
  // Tab management. These execute directly against the active tab (close,
  // favorite, the eight sort orders) rather than teleporting, since each one
  // is a real one-shot action the existing repository-tabs store already
  // supports - the same shape as the pin/unpin rows above.
  {
    event: 'palette:close-tab',
    title: 'Close the current tab',
    titleKey: 'palette.closeTab',
    group: 'App',
    keywords: 'close current tab the',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:close-other-tabs',
    title: 'Close other tabs',
    titleKey: 'palette.closeOtherTabs',
    group: 'App',
    keywords: 'close other tabs',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:close-tabs-to-left',
    title: 'Close tabs to the left',
    titleKey: 'palette.closeTabsToLeft',
    group: 'App',
    keywords: 'close left tabs the to',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:close-tabs-to-right',
    title: 'Close tabs to the right',
    titleKey: 'palette.closeTabsToRight',
    group: 'App',
    keywords: 'close right tabs the to',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:favorite-tab',
    title: 'Favorite the current tab',
    titleKey: 'palette.favoriteTab',
    group: 'App',
    keywords: 'current favorite favourite star tab the',
    isAvailable: whenRepository,
  },
  {
    event: 'palette:rename-tab',
    title: 'Rename the current tab',
    titleKey: 'palette.renameTab',
    group: 'App',
    keywords: 'current label rename tab the',
    isAvailable: whenRepository,
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:move-tab-to-group',
    title: 'Move the current tab to a group',
    titleKey: 'palette.moveTabToGroup',
    group: 'App',
    keywords: 'current group move tab the to',
    isAvailable: whenRepository,
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:collapse-tab-group',
    title: 'Collapse the current tab group',
    titleKey: 'palette.collapseTabGroup',
    group: 'App',
    keywords: 'collapse current group tab the',
    isAvailable: whenRepository,
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:delete-tab-group',
    title: 'Delete the current tab group',
    titleKey: 'palette.deleteTabGroup',
    group: 'App',
    keywords: 'current delete group tab the',
    isAvailable: whenRepository,
    home: {
      kind: 'surface',
      labelKey: 'commandPalette.homeTabStrip',
      targetId: 'tabStrip',
    },
  },
  {
    event: 'palette:sort-tabs-label-ascending',
    title: 'Sort tabs A to Z',
    titleKey: 'palette.sortTabsLabelAscending',
    group: 'App',
    keywords: 'a alphabetical ascending label sort tabs to z',
  },
  {
    event: 'palette:sort-tabs-label-descending',
    title: 'Sort tabs Z to A',
    titleKey: 'palette.sortTabsLabelDescending',
    group: 'App',
    keywords: 'a alphabetical descending label sort tabs to z',
  },
  {
    event: 'palette:sort-tabs-opened-newest',
    title: 'Sort tabs newest first',
    titleKey: 'palette.sortTabsOpenedNewest',
    group: 'App',
    keywords: 'first newest opened sort tabs',
  },
  {
    event: 'palette:sort-tabs-opened-oldest',
    title: 'Sort tabs oldest first',
    titleKey: 'palette.sortTabsOpenedOldest',
    group: 'App',
    keywords: 'first oldest opened sort tabs',
  },
  {
    event: 'palette:sort-tabs-status-attention-first',
    title: 'Sort tabs by status, needs attention first',
    titleKey: 'palette.sortTabsStatusAttentionFirst',
    group: 'App',
    keywords: 'attention conflicts needs sort status tabs',
  },
  {
    event: 'palette:sort-tabs-status-clean-first',
    title: 'Sort tabs by status, clean first',
    titleKey: 'palette.sortTabsStatusCleanFirst',
    group: 'App',
    keywords: 'clean first sort status tabs',
  },
  {
    event: 'palette:sort-tabs-favorite-first',
    title: 'Sort tabs, favorites first',
    titleKey: 'palette.sortTabsFavoriteFirst',
    group: 'App',
    keywords: 'favorite favourite first sort tabs',
  },
  {
    event: 'palette:sort-tabs-favorite-last',
    title: 'Sort tabs, favorites last',
    titleKey: 'palette.sortTabsFavoriteLast',
    group: 'App',
    keywords: 'favorite favourite last sort tabs',
  },
  // Settings undo/redo. Mirrors the same undo/redo/restore surface already
  // shipped in the tab strip's settings-history side sheet.
  {
    event: 'palette:undo-settings-change',
    title: 'Undo the last settings change',
    titleKey: 'palette.undoSettingsChange',
    group: 'App',
    materialSymbol: 'undo',
    keywords: 'change last settings undo',
  },
  {
    event: 'palette:redo-settings-change',
    title: 'Redo the last settings change',
    titleKey: 'palette.redoSettingsChange',
    group: 'App',
    materialSymbol: 'redo',
    keywords: 'change last redo settings',
  },
  // Sign-in. Reuses the existing dot-com and Enterprise sign-in dialogs
  // already reachable from Preferences: Accounts.
  {
    event: 'palette:sign-in-dotcom',
    title: 'Sign in to GitHub.com',
    titleKey: 'palette.signInDotcom',
    group: 'App',
    keywords: 'account com dotcom github in login sign',
  },
  {
    event: 'palette:sign-in-enterprise',
    title: 'Sign in to GitHub Enterprise',
    titleKey: 'palette.signInEnterprise',
    group: 'App',
    keywords: 'account enterprise github in login sign',
  },
]

/**
 * Narrow and rank the catalog for a query: title prefix matches first, then
 * title substrings, then group/keyword/event matches, preserving catalog
 * order within each band.
 *
 * When `context` is supplied, commands whose availability predicate rejects
 * the current selection are dropped so they can never be dispatched in an
 * invalid state. Omitting `context` keeps the whole platform-eligible catalog.
 */
export function filterPaletteCommands(
  commands: ReadonlyArray<IPaletteCommand>,
  query: string,
  platform?: string,
  context?: IPaletteCommandContext
): ReadonlyArray<IPaletteCommand> {
  const platformEligible = commands.filter(
    command =>
      (command.platform === undefined ||
        platform === undefined ||
        command.platform === platform) &&
      (context === undefined ||
        command.isAvailable === undefined ||
        command.isAvailable(context))
  )

  const trimmed = query.trim().toLowerCase()
  if (trimmed.length === 0) {
    return platformEligible
  }

  const prefix: IPaletteCommand[] = []
  const substring: IPaletteCommand[] = []
  const secondary: IPaletteCommand[] = []

  for (const command of platformEligible) {
    const title = command.title.toLowerCase()
    if (title.startsWith(trimmed)) {
      prefix.push(command)
    } else if (title.includes(trimmed)) {
      substring.push(command)
    } else if (
      `${command.group} ${command.keywords ?? ''} ${command.event}`
        .toLowerCase()
        .includes(trimmed)
    ) {
      secondary.push(command)
    }
  }

  return [...prefix, ...substring, ...secondary]
}
