import * as React from 'react'
import { Account, isDotComAccount } from '../../models/account'
import { PreferencesTab } from '../../models/preferences'
import { Dispatcher } from '../dispatcher'
import { SettingsTabStrip } from '../settings-tabs/settings-tab-strip'
import { SettingsTabDockControl } from '../settings-tabs/settings-tab-dock-control'
import {
  getSettingsTabDockPosition,
  ISettingsTabItem,
  setSettingsTabDockPosition,
  SettingsTabDockPosition,
} from '../settings-tabs/settings-tab-model'
import { Accounts } from './accounts'
import { Advanced } from './advanced'
import { Git } from './git'
import { assertNever } from '../../lib/fatal-error'
import { Dialog, DialogFooter, DialogError } from '../dialog'
import {
  getGlobalConfigValue,
  setGlobalConfigValue,
} from '../../lib/git/config'
import { lookupPreferredEmail } from '../../lib/email'
import { Shell, getAvailableShells } from '../../lib/shells'
import { getAvailableEditors } from '../../lib/editors/lookup'
import {
  gitAuthorNameIsValid,
  InvalidGitAuthorNameMessage,
} from '../lib/identifier-rules'
import { Appearance } from './appearance'
import { teleportTo } from '../lib/teleport'
import { IAppearanceCustomization } from '../../models/appearance-customization'
import { ApplicationTheme } from '../lib/application-theme'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Integrations } from './integrations'
import {
  UncommittedChangesStrategy,
  defaultUncommittedChangesStrategy,
} from '../../models/uncommitted-changes-strategy'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  isConfigFileLockError,
  parseConfigLockFilePathFromError,
} from '../../lib/git'
import { ConfigLockFileExists } from '../lib/config-lock-file-exists'
import {
  setDefaultBranch,
  getDefaultBranch,
} from '../../lib/helpers/default-branch'
import { Prompts } from './prompts'
import { Repository } from '../../models/repository'
import { ShowBranchNameInRepoListSetting } from '../../models/show-branch-name-in-repo-list'
import { Notifications } from './notifications'
import { Accessibility } from './accessibility'
import { AutomationPreferences } from './automation'
import { IAutomationSettingsState } from '../../lib/automation/automation-settings'
import { CopilotPreferences } from './copilot'
import type {
  CopilotFeature,
  CopilotModelSelections,
} from '../../lib/stores/copilot-store'
import type { IBYOKProvider } from '../../lib/copilot/byok'
import { PopupType } from '../../models/popup'
import {
  ICustomIntegration,
  TargetPathArgument,
  isValidCustomIntegration,
} from '../../lib/custom-integration'
import {
  defaultGitHookEnvShell,
  defaultHooksEnvEnabledValue,
  getCacheHooksEnv,
  getGitHookEnvShell,
  getHooksEnvEnabled,
  setCacheHooksEnv,
  setGitHookEnvShell,
  setHooksEnvEnabled,
} from '../../lib/hooks/config'
import { enableCopilotSdkCommitMessageGeneration } from '../../lib/feature-flag'
import {
  DateFormat,
  TimeFormat,
  INumberFormat,
  getPreferAbsoluteDates,
  getDateFormatPreference,
  getTimeFormatPreference,
  getNumberFormatPreference,
  setDateFormatPreference,
  setTimeFormatPreference,
  setNumberFormatPreference,
} from '../../models/formatting-preferences'
import { enableFormattingPreferences } from '../../lib/feature-flag'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import { BranchSortOrder } from '../../models/branch-sort-order'
import {
  getShowCommitAuthorInfo,
  setShowCommitAuthorInfo,
} from '../../models/commit-author-display'
import { AgentAccess } from './agent-access'
import { SelfHostedServerPreferences } from './self-hosted-server'
import { ErrorPresentationStyle } from '../../models/error-presentation'
import { QueuePreferences } from './queue'
import { SoundPreferences } from './sound'
import { OllamaPreferences } from './ollama'
import { AIPreferences } from './ai'
import { getAudioCueStore } from '../../lib/audio/audio-cue-store'
import { LocalizedText } from '../lib/localized-text'
import { SettingsSearch, SettingsSearchSurfaceId } from './settings-search'
import {
  filterSettingsEntries,
  settingsTabsWithMatches,
  ISettingsSearchEntry,
} from '../../lib/settings-search/settings-search-catalog'
import { FilterMode, IMatch } from '../../lib/fuzzy-find'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { LanguageMode } from '../../models/language-mode'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translateForAccessibleName,
} from '../../lib/i18n'
import type { TranslationKey } from '../../lib/i18n'
import {
  IHomeAssistantSettingsRequest,
  ISetHomeAssistantTokenRequest,
  IScheduledSettingsConfig,
  serializeScheduledSettings,
} from '../../models/scheduled-settings'

interface IPreferencesProps {
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
  readonly repository: Repository | null
  readonly onDismissed: () => void
  readonly useWindowsOpenSSH: boolean
  readonly verboseLogging: boolean
  readonly showCommitLengthWarning: boolean
  readonly notificationsEnabled: boolean
  readonly errorPresentationStyle: ErrorPresentationStyle
  readonly optOutOfUsageTracking: boolean
  readonly useExternalCredentialHelper: boolean
  readonly initialSelectedTab?: PreferencesTab
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly askForConfirmationOnCommitFilteredChanges: boolean
  readonly confirmCommitMessageOverride: boolean
  readonly confirmWorktreeRemoval: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly selectedExternalEditor: string | null
  readonly selectedShell: Shell
  readonly selectedTheme: ApplicationTheme
  readonly appearanceCustomization: IAppearanceCustomization
  readonly scheduledSettings: IScheduledSettingsConfig
  readonly zoomBaseFactor: number
  readonly autoFitZoomEnabled: boolean
  readonly windowZoomFactor: number
  readonly selectedTabSize: number
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration | null
  readonly useCustomShell: boolean
  readonly customShell: ICustomIntegration | null
  readonly branchPresetScript: ICustomIntegration | null
  readonly showRecentRepositories: boolean
  readonly showBranchNameInRepoList: ShowBranchNameInRepoListSetting
  readonly branchSortOrder: BranchSortOrder
  readonly repositoryIndicatorsEnabled: boolean
  readonly autoSwitchAccountToRepositoryOwner: boolean
  readonly onEditGlobalGitConfig: () => void
  readonly underlineLinks: boolean
  readonly showDiffCheckMarks: boolean
  readonly selectedCopilotModels: CopilotModelSelections
  readonly copilotModels: ReadonlyArray<Model> | null
  readonly byokProviders: ReadonlyArray<IBYOKProvider>
  readonly alwaysUseCopilotForConflictResolution: boolean
  readonly automationSettings: IAutomationSettingsState
}

interface IPreferencesState {
  readonly selectedIndex: PreferencesTab
  readonly tabDockPosition: SettingsTabDockPosition
  readonly committerName: string
  readonly committerEmail: string
  readonly defaultBranch: string
  readonly initialCommitterName: string | null
  readonly initialCommitterEmail: string | null
  readonly initialDefaultBranch: string | null
  readonly disallowedCharactersMessage: string | null
  readonly useWindowsOpenSSH: boolean
  readonly verboseLogging: boolean
  readonly showCommitLengthWarning: boolean
  readonly notificationsEnabled: boolean
  readonly errorPresentationStyle: ErrorPresentationStyle
  readonly optOutOfUsageTracking: boolean
  readonly useExternalCredentialHelper: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmDiscardChangesPermanently: boolean
  readonly confirmDiscardStash: boolean
  readonly confirmCheckoutCommit: boolean
  readonly confirmForcePush: boolean
  readonly confirmUndoCommit: boolean
  readonly askForConfirmationOnCommitFilteredChanges: boolean
  readonly confirmCommitMessageOverride: boolean
  readonly confirmWorktreeRemoval: boolean
  readonly uncommittedChangesStrategy: UncommittedChangesStrategy
  readonly availableEditors: ReadonlyArray<string>
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly useCustomShell: boolean
  readonly customShell: ICustomIntegration
  readonly branchPresetScript: ICustomIntegration
  readonly selectedExternalEditor: string | null
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly showRecentRepositories: boolean
  readonly showBranchNameInRepoList: ShowBranchNameInRepoListSetting
  readonly branchSortOrder: BranchSortOrder
  readonly showCommitAuthorInfo: boolean

  /**
   * If unable to save Git configuration values (name, email)
   * due to an existing configuration lock file this property
   * will contain the (fully qualified) path to said lock file
   * such that an error may be presented and the user given a
   * choice to delete the lock file.
   */
  readonly existingLockFilePath?: string
  readonly repositoryIndicatorsEnabled: boolean
  readonly autoSwitchAccountToRepositoryOwner: boolean

  readonly initiallySelectedTheme: ApplicationTheme
  readonly initiallySelectedAppearanceCustomization: IAppearanceCustomization
  readonly initiallyScheduledSettings: IScheduledSettingsConfig
  readonly initiallySelectedTabSize: number
  readonly scheduledSettings: IScheduledSettingsConfig

  readonly isLoadingGitConfig: boolean

  readonly underlineLinks: boolean

  readonly showDiffCheckMarks: boolean

  readonly selectedGitTabIndex?: number
  readonly enableGitHookEnv: boolean | undefined
  readonly cacheGitHookEnv: boolean | undefined
  readonly selectedGitHookEnvShell: string | undefined
  // Whether the preferences related to Git hooks environment have been changed
  readonly hooksPreferencesDirty: boolean

  readonly selectedCopilotModels: CopilotModelSelections
  readonly alwaysUseCopilotForConflictResolution: boolean
  readonly selectedDateFormat?: DateFormat
  readonly selectedTimeFormat?: TimeFormat
  readonly selectedNumberFormat?: INumberFormat
  readonly preferAbsoluteDates?: boolean
  readonly automationSettings: IAutomationSettingsState

  /** The current settings-search query text. */
  readonly settingsSearchQuery: string
  /** The active settings-search filter mode. */
  readonly settingsSearchFilterMode: FilterMode
  /** Whether settings-search matching is case sensitive. */
  readonly settingsSearchCaseSensitive: boolean
  /** The active language mode, kept in sync with the persisted preference. */
  readonly languageMode: LanguageMode
}

/**
 * Stable id for the Settings dialog's title heading. Because the Preferences
 * dialog suppresses the built-in `Dialog` header strip (overlays §2.1/§2.2 —
 * the title lives inside the left rail, not in a top strip) we render our own
 * `<h2>` heading and hand its id to the `Dialog` via the `titleId` prop so the
 * dialog's `aria-labelledby` still points at the visible title.
 */
const PreferencesTitleId = 'preferences-title'

const PreferencesTabIds: Readonly<Record<PreferencesTab, string>> = {
  [PreferencesTab.Accounts]: 'accounts',
  [PreferencesTab.Integrations]: 'integrations',
  [PreferencesTab.Copilot]: 'copilot',
  [PreferencesTab.Git]: 'git',
  [PreferencesTab.Appearance]: 'appearance',
  [PreferencesTab.Notifications]: 'notifications',
  [PreferencesTab.Prompts]: 'prompts',
  [PreferencesTab.Advanced]: 'advanced',
  [PreferencesTab.Accessibility]: 'accessibility',
  [PreferencesTab.AgentAccess]: 'agent-access',
  [PreferencesTab.Automation]: 'automation',
  [PreferencesTab.Queue]: 'queue',
  [PreferencesTab.Sound]: 'sound',
  [PreferencesTab.Ollama]: 'ollama',
  [PreferencesTab.SelfHostedServer]: 'self-hosted-server',
  [PreferencesTab.AI]: 'ai',
}

const PreferencesTabById: Readonly<Record<string, PreferencesTab>> =
  Object.fromEntries(
    Object.entries(PreferencesTabIds).map(([tab, id]) => [id, Number(tab)])
  )

/** Numeric ids written before browser tabs used stable string identities. */
const LegacyPreferencesTabIds: Readonly<Record<string, string>> = {
  '0': 'accounts',
  '1': 'integrations',
  '2': 'copilot',
  '3': 'git',
  '4': 'appearance',
  '5': 'notifications',
  '6': 'prompts',
  '7': 'advanced',
  '8': 'accessibility',
  '9': 'agent-access',
  '10': 'automation',
  '11': 'queue',
  '12': 'sound',
  '13': 'ollama',
  '14': 'self-hosted-server',
  '15': 'ai',
}

/**
 * Default custom integration values to coalesce with. We can't make up a path
 * nor a bundle ID, but we can at least provide a default argument.
 */
const DefaultCustomIntegration: ICustomIntegration = {
  path: '',
  bundleID: undefined,
  arguments: TargetPathArgument,
}

/** The app-level preferences component. */
export class Preferences extends React.Component<
  IPreferencesProps,
  IPreferencesState
> {
  /** Cached per-render settings-search results (recomputed each render). */
  private settingsSearchResults: ReadonlyArray<IMatch<ISettingsSearchEntry>> =
    []
  /** Per-tab match counts derived from `settingsSearchResults`. */
  private settingsMatchCounts: ReadonlyMap<PreferencesTab, number> = new Map()
  /** Tabs with at least one match; used to dim non-matching rail tabs. */
  private settingsMatchedTabs: ReadonlySet<PreferencesTab> = new Set()

  public constructor(props: IPreferencesProps) {
    super(props)

    this.state = {
      selectedIndex: this.props.initialSelectedTab || PreferencesTab.Accounts,
      tabDockPosition: getSettingsTabDockPosition('preferences'),
      committerName: '',
      committerEmail: '',
      defaultBranch: '',
      initialCommitterName: null,
      initialCommitterEmail: null,
      initialDefaultBranch: null,
      disallowedCharactersMessage: null,
      availableEditors: [],
      useCustomEditor: this.props.useCustomEditor,
      customEditor: this.props.customEditor ?? DefaultCustomIntegration,
      useCustomShell: this.props.useCustomShell,
      customShell: this.props.customShell ?? DefaultCustomIntegration,
      branchPresetScript:
        this.props.branchPresetScript ?? DefaultCustomIntegration,
      useWindowsOpenSSH: false,
      verboseLogging: false,
      showCommitLengthWarning: false,
      notificationsEnabled: true,
      errorPresentationStyle: this.props.errorPresentationStyle,
      optOutOfUsageTracking: false,
      useExternalCredentialHelper: false,
      confirmRepositoryRemoval: false,
      confirmDiscardChanges: false,
      confirmDiscardChangesPermanently: false,
      confirmDiscardStash: false,
      confirmCheckoutCommit: false,
      confirmForcePush: false,
      confirmUndoCommit: false,
      askForConfirmationOnCommitFilteredChanges: false,
      confirmCommitMessageOverride: true,
      confirmWorktreeRemoval: true,
      uncommittedChangesStrategy: defaultUncommittedChangesStrategy,
      selectedExternalEditor: this.props.selectedExternalEditor,
      availableShells: [],
      selectedShell: this.props.selectedShell,
      showRecentRepositories: this.props.showRecentRepositories,
      showBranchNameInRepoList: this.props.showBranchNameInRepoList,
      branchSortOrder: this.props.branchSortOrder,
      showCommitAuthorInfo: getShowCommitAuthorInfo(),
      repositoryIndicatorsEnabled: this.props.repositoryIndicatorsEnabled,
      autoSwitchAccountToRepositoryOwner:
        this.props.autoSwitchAccountToRepositoryOwner,
      initiallySelectedTheme: this.props.selectedTheme,
      initiallySelectedAppearanceCustomization:
        this.props.appearanceCustomization,
      initiallyScheduledSettings: this.props.scheduledSettings,
      initiallySelectedTabSize: this.props.selectedTabSize,
      scheduledSettings: this.props.scheduledSettings,
      isLoadingGitConfig: true,
      underlineLinks: this.props.underlineLinks,
      showDiffCheckMarks: this.props.showDiffCheckMarks,
      enableGitHookEnv: getHooksEnvEnabled(),
      cacheGitHookEnv: getCacheHooksEnv(),
      selectedGitHookEnvShell: getGitHookEnvShell(),
      hooksPreferencesDirty: false,
      selectedCopilotModels: this.props.selectedCopilotModels,
      alwaysUseCopilotForConflictResolution:
        this.props.alwaysUseCopilotForConflictResolution,
      selectedDateFormat: getDateFormatPreference(),
      selectedTimeFormat: getTimeFormatPreference(),
      selectedNumberFormat: getNumberFormatPreference(),
      preferAbsoluteDates: getPreferAbsoluteDates(),
      automationSettings: this.props.automationSettings,
      settingsSearchQuery: '',
      settingsSearchFilterMode: readPersistedFilterMode(
        SettingsSearchSurfaceId
      ),
      settingsSearchCaseSensitive: false,
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    window.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount() {
    window.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = () => {
    this.setState({ languageMode: getPersistedLanguageMode() })
  }

  private onSettingsSearchQueryChange = (settingsSearchQuery: string) => {
    this.setState({ settingsSearchQuery })
  }

  private onSettingsSearchFilterModeChange = (
    settingsSearchFilterMode: FilterMode
  ) => {
    persistFilterMode(SettingsSearchSurfaceId, settingsSearchFilterMode)
    this.setState({ settingsSearchFilterMode })
  }

  private onSettingsSearchCaseSensitiveChange = (
    settingsSearchCaseSensitive: boolean
  ) => {
    this.setState({ settingsSearchCaseSensitive })
  }

  private onSettingsSearchRegexPatternApply = (pattern: string) => {
    this.setState({ settingsSearchQuery: pattern })
  }

  private focusScheduledSetting = async (field: string) => {
    const arrived = await teleportTo('settingsScheduledSettings')
    if (!arrived) {
      return
    }
    const target = document.querySelector<HTMLElement>(
      `.scheduled-settings-target-${field}`
    )
    if (target === null) {
      return
    }
    target.scrollIntoView({ block: 'center', inline: 'nearest' })
    const focusable = target.querySelector<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusable?.focus({ preventScroll: true })
  }

  private onSettingsSearchNavigate = (tab: PreferencesTab, entryId: string) => {
    // Jump to the setting's tab and clear the query so the pane shows through.
    this.setState({ selectedIndex: tab, settingsSearchQuery: '' }, () => {
      const scheduledFieldByEntryId: Readonly<Record<string, string>> = {
        'appearance-scheduled-enabled': 'enabled',
        'appearance-scheduled-language': 'language',
        'appearance-scheduled-theme': 'theme',
        'appearance-scheduled-highlight': 'highlight',
        'appearance-scheduled-accent-palette': 'appearance-accentPalette',
        'appearance-scheduled-update-progress-palette':
          'appearance-updateProgressPalette',
        'appearance-scheduled-surface-palette': 'appearance-surfacePalette',
        'appearance-scheduled-elevation': 'appearance-elevation',
        'appearance-scheduled-ui-font': 'appearance-uiFont',
        'appearance-scheduled-monospace-font': 'appearance-monospaceFont',
        'appearance-scheduled-motion': 'appearance-motion',
        'appearance-scheduled-toolbar-labels': 'appearance-toolbarLabels',
        'appearance-scheduled-toolbar-density': 'appearance-toolbarDensity',
        'appearance-scheduled-repository-list-density':
          'appearance-repositoryListDensity',
        'appearance-scheduled-tab-density': 'appearance-tabDensity',
        'appearance-scheduled-tab-width': 'appearance-tabWidth',
        'appearance-scheduled-tab-close-buttons': 'appearance-tabCloseButtons',
        'appearance-scheduled-submodule-back-style':
          'appearance-submoduleBackButtonStyle',
        'appearance-scheduled-submodule-back-label':
          'appearance-submoduleBackButtonLabel',
        'appearance-scheduled-start-date': 'start-date',
        'appearance-scheduled-end-date': 'end-date',
        'appearance-scheduled-start-time': 'start-time',
        'appearance-scheduled-end-time': 'end-time',
        'appearance-scheduled-all-days': 'all-days',
        'appearance-scheduled-weekdays': 'weekdays',
        'appearance-scheduled-source': 'source',
        'appearance-scheduled-api-endpoint': 'api-endpoint',
        'appearance-scheduled-home-assistant-url': 'home-assistant-url',
        'appearance-scheduled-home-assistant-entity': 'home-assistant-entity',
        'appearance-scheduled-home-assistant-token': 'home-assistant-token',
      }
      const field = scheduledFieldByEntryId[entryId]
      if (field !== undefined) {
        void this.focusScheduledSetting(field)
      } else if (entryId === 'appearance-scheduled-settings') {
        void teleportTo('settingsScheduledSettings')
      }
    })
  }

  private getSettingsSearchResults(): ReadonlyArray<
    IMatch<ISettingsSearchEntry>
  > {
    return filterSettingsEntries(this.state.settingsSearchQuery, {
      mode: this.state.settingsSearchFilterMode,
      caseSensitive: this.state.settingsSearchCaseSensitive,
    }).results
  }

  private renderTabMatchBadge(tab: PreferencesTab) {
    const count = this.settingsMatchCounts.get(tab)
    if (count === undefined || count === 0) {
      return null
    }

    return (
      <span className="preferences-tab-match-badge" aria-hidden={true}>
        {count}
      </span>
    )
  }

  /** Recompute the settings-search results and derived tab maps for a render. */
  private updateSettingsSearchContext() {
    this.settingsSearchResults = this.getSettingsSearchResults()
    this.settingsMatchedTabs = settingsTabsWithMatches(
      this.settingsSearchResults
    )
    const counts = new Map<PreferencesTab, number>()
    for (const match of this.settingsSearchResults) {
      counts.set(match.item.tab, (counts.get(match.item.tab) ?? 0) + 1)
    }
    this.settingsMatchCounts = counts
  }

  private renderSettingsSearch() {
    return (
      <SettingsSearch
        query={this.state.settingsSearchQuery}
        filterMode={this.state.settingsSearchFilterMode}
        caseSensitive={this.state.settingsSearchCaseSensitive}
        results={this.settingsSearchResults}
        languageMode={this.state.languageMode}
        onQueryChange={this.onSettingsSearchQueryChange}
        onFilterModeChange={this.onSettingsSearchFilterModeChange}
        onCaseSensitiveChange={this.onSettingsSearchCaseSensitiveChange}
        onRegexPatternApply={this.onSettingsSearchRegexPatternApply}
        onNavigate={this.onSettingsSearchNavigate}
      />
    )
  }

  private renderRailTab(
    tab: PreferencesTab,
    symbol: typeof octicons.home,
    translationKey: TranslationKey,
    searchText: string,
    isFeature = false
  ): ISettingsTabItem {
    const isSearching = this.state.settingsSearchQuery.trim().length > 0

    return {
      id: PreferencesTabIds[tab],
      domId: this.getTabId(tab),
      label: <LocalizedText translationKey={translationKey} />,
      searchText,
      accessibleLabel: translateForAccessibleName(translationKey),
      icon: <Octicon className="icon" symbol={symbol} />,
      badge: this.renderTabMatchBadge(tab),
      isFeature,
      noSearchMatch: isSearching && !this.settingsMatchedTabs.has(tab),
    }
  }

  /**
   * Every settings page, in rail order.
   *
   * Built as data rather than as a run of children because the strip keys
   * navigation by identity. The rail used to be positional — the enum's values
   * were its child indices — and the conditionally rendered Copilot page meant
   * two functions existed purely to add and subtract one from every index after
   * it. A page that is simply absent from this array cannot be selected by
   * accident.
   */
  private get railTabs(): ReadonlyArray<ISettingsTabItem> {
    const tabs: Array<ISettingsTabItem> = [
      this.renderRailTab(
        PreferencesTab.Accounts,
        octicons.home,
        'settings.accountsTab',
        'Accounts'
      ),
      this.renderRailTab(
        PreferencesTab.Integrations,
        octicons.person,
        'settings.integrationsTab',
        'Integrations'
      ),
    ]

    if (this.isCopilotSdkEnabled) {
      tabs.push(
        this.renderRailTab(
          PreferencesTab.Copilot,
          octicons.copilot,
          'settings.copilotTab',
          'Copilot'
        )
      )
    }

    tabs.push(
      this.renderRailTab(
        PreferencesTab.Git,
        octicons.gitCommit,
        'settings.gitTab',
        'Git'
      ),
      this.renderRailTab(
        PreferencesTab.Appearance,
        octicons.paintbrush,
        'settings.appearanceTab',
        'Appearance'
      ),
      this.renderRailTab(
        PreferencesTab.Notifications,
        octicons.bell,
        'settings.notificationsTab',
        'Notifications'
      ),
      this.renderRailTab(
        PreferencesTab.Prompts,
        octicons.question,
        'settings.promptsTab',
        'Prompts'
      ),
      this.renderRailTab(
        PreferencesTab.Advanced,
        octicons.gear,
        'settings.advancedTab',
        'Advanced'
      ),
      this.renderRailTab(
        PreferencesTab.Accessibility,
        octicons.accessibility,
        'settings.accessibilityTab',
        'Accessibility'
      ),
      this.renderRailTab(
        PreferencesTab.AgentAccess,
        octicons.server,
        'settings.agentAccessTab',
        'Agent access',
        true
      ),
      this.renderRailTab(
        PreferencesTab.SelfHostedServer,
        octicons.server,
        'settings.selfHostedServerTab',
        'Self-hosted server',
        true
      ),
      this.renderRailTab(
        PreferencesTab.Automation,
        octicons.sync,
        'settings.automationTab',
        'Automation',
        true
      ),
      this.renderRailTab(
        PreferencesTab.Queue,
        octicons.stack,
        'settings.queueTab',
        'Clone queue',
        true
      ),
      this.renderRailTab(
        PreferencesTab.Sound,
        octicons.unmute,
        'settings.soundTab',
        'Sound',
        true
      ),
      this.renderRailTab(
        PreferencesTab.Ollama,
        octicons.hubot,
        'settings.ollamaTab',
        'Ollama',
        true
      ),
      this.renderRailTab(
        PreferencesTab.AI,
        octicons.shield,
        'settings.aiTab',
        'AI security',
        true
      )
    )

    return tabs
  }

  public async componentWillMount() {
    const initialCommitterName = await getGlobalConfigValue('user.name')
    const initialCommitterEmail = await getGlobalConfigValue('user.email')
    const initialDefaultBranch = await getDefaultBranch()

    let committerName = initialCommitterName
    let committerEmail = initialCommitterEmail

    if (!committerName || !committerEmail) {
      const { accounts } = this.props
      const account = accounts.find(isDotComAccount) ?? accounts.at(0)

      if (account) {
        if (!committerName) {
          committerName = account.login
        }

        if (!committerEmail) {
          committerEmail = lookupPreferredEmail(account)
        }
      }
    }

    committerName = committerName || ''
    committerEmail = committerEmail || ''

    const [editors, shells] = await Promise.all([
      getAvailableEditors(),
      getAvailableShells(),
    ])

    // Kick off Copilot model list fetch (non-blocking)
    if (this.isCopilotSdkEnabled) {
      this.props.dispatcher.fetchCopilotModels()
    }

    const availableEditors = editors.map(e => e.editor) ?? null
    const availableShells = shells.map(e => e.shell) ?? null

    this.setState({
      committerName,
      committerEmail,
      defaultBranch: initialDefaultBranch,
      initialCommitterName,
      initialCommitterEmail,
      initialDefaultBranch,
      useWindowsOpenSSH: this.props.useWindowsOpenSSH,
      verboseLogging: this.props.verboseLogging,
      showCommitLengthWarning: this.props.showCommitLengthWarning,
      notificationsEnabled: this.props.notificationsEnabled,
      errorPresentationStyle: this.props.errorPresentationStyle,
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      useExternalCredentialHelper: this.props.useExternalCredentialHelper,
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      confirmDiscardChangesPermanently:
        this.props.confirmDiscardChangesPermanently,
      confirmDiscardStash: this.props.confirmDiscardStash,
      confirmCheckoutCommit: this.props.confirmCheckoutCommit,
      confirmForcePush: this.props.confirmForcePush,
      confirmUndoCommit: this.props.confirmUndoCommit,
      askForConfirmationOnCommitFilteredChanges:
        this.props.askForConfirmationOnCommitFilteredChanges,
      confirmCommitMessageOverride: this.props.confirmCommitMessageOverride,
      confirmWorktreeRemoval: this.props.confirmWorktreeRemoval,
      uncommittedChangesStrategy: this.props.uncommittedChangesStrategy,
      availableShells,
      availableEditors,
      useCustomEditor: this.props.useCustomEditor,
      customEditor: this.props.customEditor ?? DefaultCustomIntegration,
      useCustomShell: this.props.useCustomShell,
      customShell: this.props.customShell ?? DefaultCustomIntegration,
      branchPresetScript:
        this.props.branchPresetScript ?? DefaultCustomIntegration,
      isLoadingGitConfig: false,
    })
  }

  private onCancel = () => {
    if (this.state.initiallySelectedTheme !== this.props.selectedTheme) {
      this.onSelectedThemeChanged(this.state.initiallySelectedTheme)
    }
    if (this.state.initiallySelectedTabSize !== this.props.selectedTabSize) {
      this.onSelectedTabSizeChanged(this.state.initiallySelectedTabSize)
    }
    if (
      this.state.initiallySelectedAppearanceCustomization !==
      this.props.appearanceCustomization
    ) {
      this.onAppearanceCustomizationChanged(
        this.state.initiallySelectedAppearanceCustomization
      )
    }
    if (
      serializeScheduledSettings(this.state.scheduledSettings) !==
      serializeScheduledSettings(this.state.initiallyScheduledSettings)
    ) {
      this.onScheduledSettingsChanged(this.state.initiallyScheduledSettings)
    }

    this.props.onDismissed()
  }

  public render() {
    this.updateSettingsSearchContext()
    return (
      <Dialog
        id="preferences"
        titleId={PreferencesTitleId}
        onDismissed={this.onCancel}
        onSubmit={this.onSave}
      >
        {this.renderDisallowedCharactersError()}
        <div
          className="preferences-container"
          data-settings-tab-dock-position={this.state.tabDockPosition}
        >
          <div className="preferences-rail">
            <div className="preferences-rail-header">
              <h2 id={PreferencesTitleId} className="preferences-title">
                <LocalizedText translationKey="settings.dialogTitle" />
              </h2>
              <SettingsTabDockControl
                strip="preferences"
                position={this.state.tabDockPosition}
                onChange={this.onTabDockPositionChanged}
              />
            </div>
            <div className="preferences-browser-search">
              {this.renderSettingsSearch()}
            </div>
            <SettingsTabStrip
              strip="preferences"
              title={this.getSettingsBrowserTabLabels().surface}
              items={this.railTabs}
              selectedId={PreferencesTabIds[this.state.selectedIndex]}
              onSelect={this.onTabSelected}
              legacyTabIdMap={LegacyPreferencesTabIds}
              variant="browser"
              showNewTab={true}
              dockPosition={this.state.tabDockPosition}
              accessibleLabels={this.getSettingsBrowserTabLabels()}
            />
          </div>
          <div className="preferences-content-pane">
            <div className="preferences-pane-header">
              <button
                type="button"
                className="preferences-close-button"
                onClick={this.onCancel}
                aria-label={translateForAccessibleName('settings.closeAction')}
              >
                <Octicon symbol={octicons.x} />
              </button>
            </div>
            {this.renderActiveTab()}
            {this.renderFooter()}
          </div>
        </div>
      </Dialog>
    )
  }

  private getTabId = (tab: PreferencesTab) => {
    let suffix
    switch (tab) {
      case PreferencesTab.Accounts:
        suffix = 'accounts'
        break
      case PreferencesTab.Integrations:
        suffix = 'integrations'
        break
      case PreferencesTab.Copilot:
        suffix = 'copilot'
        break
      case PreferencesTab.Git:
        suffix = 'git'
        break
      case PreferencesTab.Appearance:
        suffix = 'appearance'
        break
      case PreferencesTab.Notifications:
        suffix = 'notifications'
        break
      case PreferencesTab.Prompts:
        suffix = 'prompts'
        break
      case PreferencesTab.Advanced:
        suffix = 'advanced'
        break
      case PreferencesTab.Accessibility:
        suffix = 'accessibility'
        break
      case PreferencesTab.AgentAccess:
        suffix = 'agent-access'
        break
      case PreferencesTab.SelfHostedServer:
        suffix = 'self-hosted-server'
        break
      case PreferencesTab.Automation:
        suffix = 'automation'
        break
      case PreferencesTab.Queue:
        suffix = 'queue'
        break
      case PreferencesTab.Sound:
        suffix = 'sound'
        break
      case PreferencesTab.Ollama:
        suffix = 'ollama'
        break
      case PreferencesTab.AI:
        suffix = 'ai'
        break
      default:
        return assertNever(tab, `Unknown tab type: ${tab}`)
    }

    return `preferences-tab-${suffix}`
  }

  private getSettingsBrowserTabLabels = () => {
    const surface = translateForAccessibleName('settings.globalTabsLabel')
    return {
      surface,
      tabList: surface,
      search: translateForAccessibleName('settings.browserTabSearch', {
        surface,
      }),
      openNewTab: translateForAccessibleName('settings.browserTabOpenNew', {
        surface,
      }),
      allPagesOpen: translateForAccessibleName('settings.browserTabAllOpen', {
        surface,
      }),
      morePages: (count: number) =>
        translateForAccessibleName('settings.browserTabMore', {
          count: String(count),
          surface,
        }),
      closeTab: (page: string) =>
        translateForAccessibleName('settings.browserTabClose', { page }),
      pinTab: (page: string) =>
        translateForAccessibleName('settings.browserTabPin', { page }),
      unpinTab: (page: string) =>
        translateForAccessibleName('settings.browserTabUnpin', { page }),
      pickerTitle: translateForAccessibleName(
        'settings.browserTabPickerTitle',
        { surface }
      ),
      noMatches: translateForAccessibleName('settings.browserTabNoMatches', {
        surface,
      }),
    }
  }

  private onDotComSignIn = () => {
    this.props.onDismissed()
    this.props.dispatcher.showDotComSignInDialog()
  }

  private onEnterpriseSignIn = () => {
    this.props.onDismissed()
    this.props.dispatcher.showEnterpriseSignInDialog()
  }

  private onProviderSignIn = (
    provider: 'gitlab' | 'bitbucket',
    endpoint: string,
    token: string
  ) =>
    this.props.dispatcher.authenticateProviderWithToken(
      provider,
      endpoint,
      token
    )

  private onCopilotSignIn = () => {
    this.setState({ selectedIndex: PreferencesTab.Accounts })
  }

  private onOpenCopilotPlans = () => {
    this.props.dispatcher.openInBrowser(
      'https://github.com/features/copilot/plans'
    )
  }

  private onOpenCopilotFeatureSettings = () => {
    this.props.dispatcher.openInBrowser(
      'https://github.com/settings/copilot/features'
    )
  }

  private onLogout = (account: Account) => {
    this.props.dispatcher.removeAccount(account)
  }

  private onMakeActive = (account: Account) => {
    this.props.dispatcher.promoteAccount(account)
  }

  private renderDisallowedCharactersError() {
    const message = this.state.disallowedCharactersMessage
    if (message != null) {
      return <DialogError>{message}</DialogError>
    } else {
      return null
    }
  }

  private onSelectedGitTabIndexChanged = (index: number) => {
    this.setState({ selectedGitTabIndex: index })
  }

  private onEnableGitHookEnvChanged = (enableGitHookEnv: boolean) => {
    this.setState({ enableGitHookEnv, hooksPreferencesDirty: true })
  }

  private onCacheGitHookEnvChanged = (cacheGitHookEnv: boolean) => {
    this.setState({ cacheGitHookEnv, hooksPreferencesDirty: true })
  }

  private onSelectedGitHookEnvShellChanged = (selectedShell: string) => {
    this.setState({
      selectedGitHookEnvShell: selectedShell,
      hooksPreferencesDirty: true,
    })
  }

  private renderActiveTab() {
    const index = this.state.selectedIndex
    let View
    switch (index) {
      case PreferencesTab.Accounts:
        View = (
          <Accounts
            accounts={this.props.accounts}
            onDotComSignIn={this.onDotComSignIn}
            onEnterpriseSignIn={this.onEnterpriseSignIn}
            onProviderSignIn={this.onProviderSignIn}
            onLogout={this.onLogout}
            onMakeActive={this.onMakeActive}
            onOpenInBrowser={this.openInBrowser}
          />
        )
        break
      case PreferencesTab.Integrations: {
        View = (
          <Integrations
            availableEditors={this.state.availableEditors}
            selectedExternalEditor={this.state.selectedExternalEditor}
            onSelectedEditorChanged={this.onSelectedEditorChanged}
            availableShells={this.state.availableShells}
            selectedShell={this.state.selectedShell}
            useCustomEditor={this.state.useCustomEditor}
            customEditor={this.state.customEditor}
            useCustomShell={this.state.useCustomShell}
            customShell={this.state.customShell}
            branchPresetScript={this.state.branchPresetScript}
            onSelectedShellChanged={this.onSelectedShellChanged}
            onUseCustomEditorChanged={this.onUseCustomEditorChanged}
            onCustomEditorChanged={this.onCustomEditorChanged}
            onUseCustomShellChanged={this.onUseCustomShellChanged}
            onCustomShellChanged={this.onCustomShellChanged}
            onBranchPresetScriptChanged={this.onBranchPresetScriptChanged}
          />
        )
        break
      }
      case PreferencesTab.Copilot:
        View = (
          <CopilotPreferences
            selectedCopilotModels={this.state.selectedCopilotModels}
            copilotModels={this.props.copilotModels}
            accounts={this.props.accounts}
            byokProviders={this.props.byokProviders}
            showBYOKSettings={this.shouldShowBYOKSettings()}
            onSignIn={this.onCopilotSignIn}
            onOpenCopilotPlans={this.onOpenCopilotPlans}
            onOpenCopilotFeatureSettings={this.onOpenCopilotFeatureSettings}
            alwaysUseCopilotForConflictResolution={
              this.state.alwaysUseCopilotForConflictResolution
            }
            onSelectedCopilotModelChanged={this.onSelectedCopilotModelChanged}
            onAlwaysUseCopilotForConflictResolutionChanged={
              this.onAlwaysUseCopilotForConflictResolutionChanged
            }
            onAddBYOKProvider={this.onAddBYOKProvider}
            onEditBYOKProvider={this.onEditBYOKProvider}
            onDeleteBYOKProvider={this.onDeleteBYOKProvider}
            onUpdateBYOKProvider={this.onUpdateBYOKProvider}
          />
        )
        break
      case PreferencesTab.Git: {
        const { existingLockFilePath } = this.state
        const error =
          existingLockFilePath !== undefined ? (
            <DialogError>
              <ConfigLockFileExists
                lockFilePath={existingLockFilePath}
                onLockFileDeleted={this.onLockFileDeleted}
                onError={this.onLockFileDeleteError}
              />
            </DialogError>
          ) : null

        View = (
          <>
            {error}
            <Git
              name={this.state.committerName}
              email={this.state.committerEmail}
              accounts={this.props.accounts}
              defaultBranch={this.state.defaultBranch}
              onNameChanged={this.onCommitterNameChanged}
              onEmailChanged={this.onCommitterEmailChanged}
              onDefaultBranchChanged={this.onDefaultBranchChanged}
              isLoadingGitConfig={this.state.isLoadingGitConfig}
              onEditGlobalGitConfig={this.props.onEditGlobalGitConfig}
              selectedTabIndex={this.state.selectedGitTabIndex}
              onSelectedTabIndexChanged={this.onSelectedGitTabIndexChanged}
              onEnableGitHookEnvChanged={this.onEnableGitHookEnvChanged}
              onCacheGitHookEnvChanged={this.onCacheGitHookEnvChanged}
              onSelectedShellChanged={this.onSelectedGitHookEnvShellChanged}
              enableGitHookEnv={
                this.state.enableGitHookEnv ?? defaultHooksEnvEnabledValue
              }
              cacheGitHookEnv={this.state.cacheGitHookEnv ?? true}
              selectedShell={
                this.state.selectedGitHookEnvShell ?? defaultGitHookEnvShell
              }
              showCommitAuthorInfo={this.state.showCommitAuthorInfo}
              onShowCommitAuthorInfoChanged={this.onShowCommitAuthorInfoChanged}
            />
          </>
        )
        break
      }
      case PreferencesTab.Appearance:
        View = (
          <Appearance
            selectedTheme={this.props.selectedTheme}
            onSelectedThemeChanged={this.onSelectedThemeChanged}
            appearanceCustomization={this.props.appearanceCustomization}
            onAppearanceCustomizationChanged={
              this.onAppearanceCustomizationChanged
            }
            scheduledSettings={this.state.scheduledSettings}
            onScheduledSettingsChanged={this.onScheduledSettingsChanged}
            onHomeAssistantTokenChanged={this.onHomeAssistantTokenChanged}
            onHomeAssistantStateRequested={this.onHomeAssistantStateRequested}
            zoomBaseFactor={this.props.zoomBaseFactor}
            onZoomBaseFactorChanged={this.onZoomBaseFactorChanged}
            autoFitZoomEnabled={this.props.autoFitZoomEnabled}
            onAutoFitZoomEnabledChanged={this.onAutoFitZoomEnabledChanged}
            windowZoomFactor={this.props.windowZoomFactor}
            selectedTabSize={this.props.selectedTabSize}
            onSelectedTabSizeChanged={this.onSelectedTabSizeChanged}
            selectedDateFormat={
              this.state.selectedDateFormat ?? getDateFormatPreference()
            }
            onSelectedDateFormatChanged={this.onSelectedDateFormatChanged}
            selectedTimeFormat={
              this.state.selectedTimeFormat ?? getTimeFormatPreference()
            }
            onSelectedTimeFormatChanged={this.onSelectedTimeFormatChanged}
            selectedNumberFormat={
              this.state.selectedNumberFormat ?? getNumberFormatPreference()
            }
            onSelectedNumberFormatChanged={this.onSelectedNumberFormatChanged}
            preferAbsoluteDates={
              this.state.preferAbsoluteDates ?? getPreferAbsoluteDates()
            }
            onPreferAbsoluteDatesChanged={this.onPreferAbsoluteDatesChanged}
            showRecentRepositories={this.state.showRecentRepositories}
            onShowRecentRepositoriesChanged={
              this.onShowRecentRepositoriesChanged
            }
            showBranchNameInRepoList={this.state.showBranchNameInRepoList}
            onShowBranchNameInRepoListChanged={
              this.onShowBranchNameInRepoListChanged
            }
            branchSortOrder={this.state.branchSortOrder}
            onBranchSortOrderChanged={this.onBranchSortOrderChanged}
            funnyLevelSettingsStore={getAudioCueStore()}
          />
        )
        break
      case PreferencesTab.Notifications:
        View = (
          <Notifications
            notificationsEnabled={this.state.notificationsEnabled}
            onNotificationsEnabledChanged={this.onNotificationsEnabledChanged}
            errorPresentationStyle={this.state.errorPresentationStyle}
            onErrorPresentationStyleChanged={
              this.onErrorPresentationStyleChanged
            }
          />
        )
        break
      case PreferencesTab.Prompts: {
        View = (
          <Prompts
            confirmRepositoryRemoval={this.state.confirmRepositoryRemoval}
            confirmDiscardChanges={this.state.confirmDiscardChanges}
            confirmDiscardChangesPermanently={
              this.state.confirmDiscardChangesPermanently
            }
            confirmDiscardStash={this.state.confirmDiscardStash}
            confirmCheckoutCommit={this.state.confirmCheckoutCommit}
            confirmForcePush={this.state.confirmForcePush}
            confirmUndoCommit={this.state.confirmUndoCommit}
            askForConfirmationOnCommitFilteredChanges={
              this.state.askForConfirmationOnCommitFilteredChanges
            }
            confirmCommitMessageOverride={
              this.state.confirmCommitMessageOverride
            }
            confirmWorktreeRemoval={this.state.confirmWorktreeRemoval}
            onConfirmRepositoryRemovalChanged={
              this.onConfirmRepositoryRemovalChanged
            }
            onConfirmDiscardChangesChanged={this.onConfirmDiscardChangesChanged}
            onConfirmDiscardStashChanged={this.onConfirmDiscardStashChanged}
            onConfirmCheckoutCommitChanged={this.onConfirmCheckoutCommitChanged}
            onConfirmForcePushChanged={this.onConfirmForcePushChanged}
            onConfirmDiscardChangesPermanentlyChanged={
              this.onConfirmDiscardChangesPermanentlyChanged
            }
            onConfirmUndoCommitChanged={this.onConfirmUndoCommitChanged}
            onAskForConfirmationOnCommitFilteredChanges={
              this.onAskForConfirmationOnCommitFilteredChanges
            }
            onConfirmCommitMessageOverrideChanged={
              this.onConfirmCommitMessageOverrideChanged
            }
            onConfirmWorktreeRemovalChanged={
              this.onConfirmWorktreeRemovalChanged
            }
            uncommittedChangesStrategy={this.state.uncommittedChangesStrategy}
            onUncommittedChangesStrategyChanged={
              this.onUncommittedChangesStrategyChanged
            }
            showCommitLengthWarning={this.state.showCommitLengthWarning}
            onShowCommitLengthWarningChanged={
              this.onShowCommitLengthWarningChanged
            }
          />
        )
        break
      }
      case PreferencesTab.Advanced: {
        View = (
          <Advanced
            useWindowsOpenSSH={this.state.useWindowsOpenSSH}
            verboseLogging={this.state.verboseLogging}
            optOutOfUsageTracking={this.state.optOutOfUsageTracking}
            useExternalCredentialHelper={this.state.useExternalCredentialHelper}
            repositoryIndicatorsEnabled={this.state.repositoryIndicatorsEnabled}
            autoSwitchAccountToRepositoryOwner={
              this.state.autoSwitchAccountToRepositoryOwner
            }
            onUseWindowsOpenSSHChanged={this.onUseWindowsOpenSSHChanged}
            onVerboseLoggingChanged={this.onVerboseLoggingChanged}
            onOptOutofReportingChanged={this.onOptOutofReportingChanged}
            onUseExternalCredentialHelperChanged={
              this.onUseExternalCredentialHelperChanged
            }
            onRepositoryIndicatorsEnabledChanged={
              this.onRepositoryIndicatorsEnabledChanged
            }
            onAutoSwitchAccountToRepositoryOwnerChanged={
              this.onAutoSwitchAccountToRepositoryOwnerChanged
            }
          />
        )
        break
      }
      case PreferencesTab.Accessibility:
        View = (
          <Accessibility
            underlineLinks={this.state.underlineLinks}
            showDiffCheckMarks={this.state.showDiffCheckMarks}
            onShowDiffCheckMarksChanged={this.onShowDiffCheckMarksChanged}
            onUnderlineLinksChanged={this.onUnderlineLinksChanged}
          />
        )
        break
      case PreferencesTab.AgentAccess:
        View = <AgentAccess openInBrowser={this.openInBrowser} />
        break
      case PreferencesTab.SelfHostedServer:
        View = (
          <SelfHostedServerPreferences dispatcher={this.props.dispatcher} />
        )
        break
      case PreferencesTab.Automation:
        View = (
          <AutomationPreferences
            accounts={this.props.accounts}
            settings={this.state.automationSettings}
            onSettingsChanged={this.onAutomationSettingsChanged}
          />
        )
        break
      case PreferencesTab.Queue:
        View = (
          <QueuePreferences
            accounts={this.props.accounts}
            dispatcher={this.props.dispatcher}
          />
        )
        break
      case PreferencesTab.Sound:
        View = (
          <SoundPreferences
            audioCueStore={getAudioCueStore()}
            repository={this.props.repository}
          />
        )
        break
      case PreferencesTab.Ollama:
        View = (
          <OllamaPreferences
            byokProviders={this.props.byokProviders}
            onUpdateBYOKProvider={this.onUpdateBYOKProvider}
          />
        )
        break
      case PreferencesTab.AI:
        View = <AIPreferences />
        break
      default:
        return assertNever(index, `Unknown tab index: ${index}`)
    }

    return (
      <div
        className="tab-container"
        id={`${this.getTabId(index)}-panel`}
        role="tabpanel"
        aria-labelledby={this.getTabId(index)}
      >
        {View}
      </div>
    )
  }

  private openInBrowser = (url: string) =>
    this.props.dispatcher.openInBrowser(url)

  private onRepositoryIndicatorsEnabledChanged = (
    repositoryIndicatorsEnabled: boolean
  ) => {
    this.setState({ repositoryIndicatorsEnabled })
  }

  private onAutoSwitchAccountToRepositoryOwnerChanged = (
    autoSwitchAccountToRepositoryOwner: boolean
  ) => {
    this.setState({ autoSwitchAccountToRepositoryOwner })
  }

  private onAutomationSettingsChanged = (
    automationSettings: IAutomationSettingsState
  ) => {
    this.setState({ automationSettings })
  }

  private onLockFileDeleted = () => {
    this.setState({ existingLockFilePath: undefined })
  }

  private onLockFileDeleteError = (e: Error) => {
    this.props.dispatcher.postError(e)
  }

  private onUseWindowsOpenSSHChanged = (useWindowsOpenSSH: boolean) => {
    this.setState({ useWindowsOpenSSH })
  }

  private onVerboseLoggingChanged = (verboseLogging: boolean) => {
    this.setState({ verboseLogging })
  }

  private onShowCommitLengthWarningChanged = (
    showCommitLengthWarning: boolean
  ) => {
    this.setState({ showCommitLengthWarning })
  }

  private onNotificationsEnabledChanged = (notificationsEnabled: boolean) => {
    this.setState({ notificationsEnabled })
  }

  private onErrorPresentationStyleChanged = (
    errorPresentationStyle: ErrorPresentationStyle
  ) => {
    this.setState({ errorPresentationStyle })
  }

  private onOptOutofReportingChanged = (value: boolean) => {
    this.setState({ optOutOfUsageTracking: value })
  }

  private onUseExternalCredentialHelperChanged = (value: boolean) => {
    this.setState({ useExternalCredentialHelper: value })
  }

  private onConfirmRepositoryRemovalChanged = (value: boolean) => {
    this.setState({ confirmRepositoryRemoval: value })
  }

  private onConfirmDiscardChangesChanged = (value: boolean) => {
    this.setState({ confirmDiscardChanges: value })
  }

  private onConfirmDiscardStashChanged = (value: boolean) => {
    this.setState({ confirmDiscardStash: value })
  }

  private onConfirmCheckoutCommitChanged = (value: boolean) => {
    this.setState({ confirmCheckoutCommit: value })
  }

  private onConfirmDiscardChangesPermanentlyChanged = (value: boolean) => {
    this.setState({ confirmDiscardChangesPermanently: value })
  }

  private onConfirmForcePushChanged = (value: boolean) => {
    this.setState({ confirmForcePush: value })
  }

  private onConfirmUndoCommitChanged = (value: boolean) => {
    this.setState({ confirmUndoCommit: value })
  }

  private onAskForConfirmationOnCommitFilteredChanges = (value: boolean) => {
    this.setState({ askForConfirmationOnCommitFilteredChanges: value })
  }

  private onConfirmCommitMessageOverrideChanged = (value: boolean) => {
    this.setState({ confirmCommitMessageOverride: value })
  }

  private onConfirmWorktreeRemovalChanged = (value: boolean) => {
    this.setState({ confirmWorktreeRemoval: value })
  }

  private onUncommittedChangesStrategyChanged = (
    uncommittedChangesStrategy: UncommittedChangesStrategy
  ) => {
    this.setState({ uncommittedChangesStrategy })
  }

  private onCommitterNameChanged = (committerName: string) => {
    this.setState({
      committerName,
      disallowedCharactersMessage: gitAuthorNameIsValid(committerName)
        ? null
        : InvalidGitAuthorNameMessage,
    })
  }

  private onCommitterEmailChanged = (committerEmail: string) => {
    this.setState({ committerEmail })
  }

  private onDefaultBranchChanged = (defaultBranch: string) => {
    this.setState({ defaultBranch })
  }

  private onSelectedEditorChanged = (editor: string) => {
    this.setState({ selectedExternalEditor: editor })
  }

  private onSelectedShellChanged = (shell: Shell) => {
    this.setState({ selectedShell: shell })
  }

  private onSelectedDateFormatChanged = (selectedDateFormat: DateFormat) => {
    this.setState({ selectedDateFormat })
  }

  private onSelectedTimeFormatChanged = (selectedTimeFormat: TimeFormat) => {
    this.setState({ selectedTimeFormat })
  }

  private onSelectedNumberFormatChanged = (
    selectedNumberFormat: INumberFormat
  ) => {
    this.setState({ selectedNumberFormat })
  }

  private onPreferAbsoluteDatesChanged = (preferAbsoluteDates: boolean) => {
    this.setState({ preferAbsoluteDates })
  }

  private onShowRecentRepositoriesChanged = (
    showRecentRepositories: boolean
  ) => {
    this.setState({ showRecentRepositories })
  }

  private onShowBranchNameInRepoListChanged = (
    showBranchNameInRepoList: ShowBranchNameInRepoListSetting
  ) => {
    this.setState({ showBranchNameInRepoList })
  }

  private onBranchSortOrderChanged = (branchSortOrder: BranchSortOrder) => {
    this.setState({ branchSortOrder })
  }

  private onShowCommitAuthorInfoChanged = (showCommitAuthorInfo: boolean) => {
    this.setState({ showCommitAuthorInfo })
  }

  private onUseCustomEditorChanged = (useCustomEditor: boolean) => {
    this.setState({ useCustomEditor })
  }

  private onCustomEditorChanged = (customEditor: ICustomIntegration) => {
    this.setState({ customEditor })
  }

  private onUseCustomShellChanged = (useCustomShell: boolean) => {
    this.setState({ useCustomShell })
  }

  private onCustomShellChanged = (customShell: ICustomIntegration) => {
    this.setState({ customShell })
  }

  private onBranchPresetScriptChanged = (
    branchPresetScript: ICustomIntegration
  ) => {
    this.setState({ branchPresetScript })
  }

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.dispatcher.setSelectedTheme(theme)
  }

  private onAppearanceCustomizationChanged = (
    customization: IAppearanceCustomization
  ) => {
    this.props.dispatcher.setAppearanceCustomization(customization)
  }

  private onScheduledSettingsChanged = (
    scheduledSettings: IScheduledSettingsConfig
  ) => {
    this.setState({ scheduledSettings })
    this.props.dispatcher.setScheduledSettings(scheduledSettings)
  }

  private onHomeAssistantTokenChanged = (
    request: ISetHomeAssistantTokenRequest
  ) => this.props.dispatcher.setHomeAssistantToken(request)

  private onHomeAssistantStateRequested = (
    request: IHomeAssistantSettingsRequest
  ) => this.props.dispatcher.fetchHomeAssistantState(request)

  private onZoomBaseFactorChanged = (factor: number) => {
    this.props.dispatcher.setZoomBaseFactor(factor)
  }

  private onAutoFitZoomEnabledChanged = (enabled: boolean) => {
    this.props.dispatcher.setAutoFitZoomEnabled(enabled)
  }

  private onUnderlineLinksChanged = (underlineLinks: boolean) => {
    this.setState({ underlineLinks })
  }

  private onShowDiffCheckMarksChanged = (showDiffCheckMarks: boolean) => {
    this.setState({ showDiffCheckMarks })
  }

  private onSelectedCopilotModelChanged = (
    feature: CopilotFeature,
    model: string | null
  ) => {
    this.setState(state => {
      const selections = { ...state.selectedCopilotModels }
      if (model === null) {
        delete selections[feature]
      } else {
        selections[feature] = model
      }
      return { selectedCopilotModels: selections }
    })
  }

  private onAlwaysUseCopilotForConflictResolutionChanged = (
    checked: boolean
  ) => {
    this.setState({ alwaysUseCopilotForConflictResolution: checked })
  }

  private shouldShowBYOKSettings(): boolean {
    return this.props.accounts.some(enableCopilotSdkCommitMessageGeneration)
  }

  private onAddBYOKProvider = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.EditCopilotBYOKProvider,
      provider: null,
    })
  }

  private onEditBYOKProvider = (provider: IBYOKProvider) => {
    this.props.dispatcher.showPopup({
      type: PopupType.EditCopilotBYOKProvider,
      provider,
    })
  }

  private onDeleteBYOKProvider = (provider: IBYOKProvider) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDeleteCopilotBYOKProvider,
      provider,
    })
  }

  private onUpdateBYOKProvider = async (provider: IBYOKProvider) => {
    const updated = await this.props.dispatcher.updateCopilotBYOKProvider(
      provider,
      undefined
    )
    if (!updated) {
      throw new Error('The Ollama provider model list could not be saved.')
    }
  }

  private onSelectedTabSizeChanged = (tabSize: number) => {
    this.props.dispatcher.setSelectedTabSize(tabSize)
  }

  private renderFooter() {
    const hasDisabledError = this.state.disallowedCharactersMessage != null

    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText="Save"
          okButtonDisabled={hasDisabledError}
        />
      </DialogFooter>
    )
  }

  private onSave = async () => {
    const { dispatcher } = this.props

    try {
      let shouldRefreshAuthor = false

      if (this.state.committerName !== this.state.initialCommitterName) {
        await setGlobalConfigValue('user.name', this.state.committerName)
        shouldRefreshAuthor = true
      }

      if (this.state.committerEmail !== this.state.initialCommitterEmail) {
        await setGlobalConfigValue('user.email', this.state.committerEmail)
        shouldRefreshAuthor = true
      }

      if (this.props.repository !== null && shouldRefreshAuthor) {
        dispatcher.refreshAuthor(this.props.repository)
      }

      // If the entered default branch is empty, we don't store it and keep
      // the previous value.
      // We do this because the preferences dialog doesn't have error states,
      // and since the preferences dialog have a global "Save" button (that will
      // save all the changes performed in every single tab), we cannot
      // block the user from clicking "Save" because the entered branch is not valid
      // (they will not be able to know the issue if they are in a different tab).
      if (
        this.state.defaultBranch.length > 0 &&
        this.state.defaultBranch !== this.state.initialDefaultBranch
      ) {
        await setDefaultBranch(this.state.defaultBranch)
      }

      if (
        this.props.repositoryIndicatorsEnabled !==
        this.state.repositoryIndicatorsEnabled
      ) {
        dispatcher.setRepositoryIndicatorsEnabled(
          this.state.repositoryIndicatorsEnabled
        )
      }

      if (
        this.props.autoSwitchAccountToRepositoryOwner !==
        this.state.autoSwitchAccountToRepositoryOwner
      ) {
        dispatcher.setAutoSwitchAccountToRepositoryOwner(
          this.state.autoSwitchAccountToRepositoryOwner
        )
      }

      if (
        this.state.showRecentRepositories !== this.props.showRecentRepositories
      ) {
        dispatcher.setShowRecentRepositories(this.state.showRecentRepositories)
      }

      if (
        this.state.showBranchNameInRepoList !==
        this.props.showBranchNameInRepoList
      ) {
        dispatcher.setShowBranchNameInRepoList(
          this.state.showBranchNameInRepoList
        )
      }

      if (this.state.branchSortOrder !== this.props.branchSortOrder) {
        dispatcher.setBranchSortOrder(this.state.branchSortOrder)
      }

      if (this.state.hooksPreferencesDirty) {
        if (this.state.enableGitHookEnv !== undefined) {
          setHooksEnvEnabled(this.state.enableGitHookEnv)
        }

        if (this.state.cacheGitHookEnv !== undefined) {
          setCacheHooksEnv(this.state.cacheGitHookEnv)
        }

        if (this.state.selectedGitHookEnvShell !== undefined) {
          setGitHookEnvShell(this.state.selectedGitHookEnvShell)
        }
      }
    } catch (e) {
      if (isConfigFileLockError(e)) {
        const lockFilePath = parseConfigLockFilePathFromError(e.result)

        if (lockFilePath !== null) {
          this.setState({
            existingLockFilePath: lockFilePath,
            selectedIndex: PreferencesTab.Git,
          })
          return
        }
      }

      this.props.onDismissed()
      dispatcher.postError(e)
      return
    }

    dispatcher.setUseWindowsOpenSSH(this.state.useWindowsOpenSSH)
    dispatcher.setVerboseLogging(this.state.verboseLogging)
    dispatcher.setShowCommitLengthWarning(this.state.showCommitLengthWarning)
    dispatcher.setNotificationsEnabled(this.state.notificationsEnabled)
    dispatcher.setErrorPresentationStyle(this.state.errorPresentationStyle)

    await dispatcher.setStatsOptOut(this.state.optOutOfUsageTracking, false)

    const {
      useCustomEditor,
      customEditor,
      useCustomShell,
      customShell,
      branchPresetScript,
    } = this.state

    const isValidCustomEditor =
      customEditor && (await isValidCustomIntegration(customEditor))
    dispatcher.setUseCustomEditor(useCustomEditor && isValidCustomEditor)
    if (isValidCustomEditor) {
      dispatcher.setCustomEditor(customEditor)
    }

    const isValidCustomShell =
      customShell && (await isValidCustomIntegration(customShell))
    dispatcher.setUseCustomShell(useCustomShell && isValidCustomShell)
    if (isValidCustomShell) {
      dispatcher.setCustomShell(customShell)
    }

    if (branchPresetScript.path.trim() === '') {
      dispatcher.setBranchPresetScript(branchPresetScript)
    } else if (await isValidCustomIntegration(branchPresetScript, false)) {
      dispatcher.setBranchPresetScript(branchPresetScript)
    }

    if (
      this.props.useExternalCredentialHelper !==
      this.state.useExternalCredentialHelper
    ) {
      dispatcher.setUseExternalCredentialHelper(
        this.state.useExternalCredentialHelper
      )
    }

    await dispatcher.setConfirmRepoRemovalSetting(
      this.state.confirmRepositoryRemoval
    )

    await dispatcher.setConfirmForcePushSetting(this.state.confirmForcePush)

    await dispatcher.setConfirmDiscardStashSetting(
      this.state.confirmDiscardStash
    )

    await dispatcher.setConfirmCheckoutCommitSetting(
      this.state.confirmCheckoutCommit
    )

    await dispatcher.setConfirmUndoCommitSetting(this.state.confirmUndoCommit)
    await dispatcher.setConfirmCommitFilteredChanges(
      this.state.askForConfirmationOnCommitFilteredChanges
    )
    await dispatcher.setConfirmCommitMessageOverrideSetting(
      this.state.confirmCommitMessageOverride
    )
    await dispatcher.setConfirmWorktreeRemovalSetting(
      this.state.confirmWorktreeRemoval
    )

    if (this.state.selectedExternalEditor) {
      await dispatcher.setExternalEditor(this.state.selectedExternalEditor)
    }
    await dispatcher.setShell(this.state.selectedShell)
    await dispatcher.setConfirmDiscardChangesSetting(
      this.state.confirmDiscardChanges
    )
    await dispatcher.setConfirmDiscardChangesPermanentlySetting(
      this.state.confirmDiscardChangesPermanently
    )

    await dispatcher.setUncommittedChangesStrategySetting(
      this.state.uncommittedChangesStrategy
    )

    dispatcher.setUnderlineLinksSetting(this.state.underlineLinks)

    dispatcher.setDiffCheckMarksSetting(this.state.showDiffCheckMarks)

    dispatcher.setSelectedCopilotModels(this.state.selectedCopilotModels)

    dispatcher.setAlwaysUseCopilotForConflictResolution(
      this.state.alwaysUseCopilotForConflictResolution
    )

    setShowCommitAuthorInfo(this.state.showCommitAuthorInfo)
    dispatcher.setAutomationSettings(this.state.automationSettings)

    if (enableFormattingPreferences()) {
      if (this.state.selectedDateFormat !== undefined) {
        setDateFormatPreference(this.state.selectedDateFormat)
      }

      if (this.state.selectedTimeFormat !== undefined) {
        setTimeFormatPreference(this.state.selectedTimeFormat)
      }

      if (this.state.selectedNumberFormat !== undefined) {
        setNumberFormatPreference(this.state.selectedNumberFormat)
      }

      if (this.state.preferAbsoluteDates !== undefined) {
        dispatcher.setPreferAbsoluteDates(this.state.preferAbsoluteDates)
      }
    }

    this.props.onDismissed()
  }

  /**
   * The strip reports the page's own id, so no index arithmetic is involved.
   *
   * This replaced a pair of functions that added and subtracted one from every
   * index above Copilot depending on whether that page was rendered — the kind
   * of correction that is only ever one conditional page away from opening the
   * wrong screen.
   */
  private onTabSelected = (id: string) => {
    const tab = PreferencesTabById[id]
    if (tab !== undefined) {
      this.setState({ selectedIndex: tab })
    }
  }

  private onTabDockPositionChanged = (
    tabDockPosition: SettingsTabDockPosition
  ) => {
    setSettingsTabDockPosition('preferences', tabDockPosition)
    this.setState({ tabDockPosition })
  }

  private get isCopilotSdkEnabled(): boolean {
    return this.props.accounts.some(enableCopilotSdkCommitMessageGeneration)
  }
}
