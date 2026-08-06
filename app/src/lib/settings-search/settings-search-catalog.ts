import { PreferencesTab } from '../../models/preferences'
import { translate, TranslationKey } from '../i18n'
import {
  FilterMode,
  IFilterOptions,
  IMatch,
  IMatchResult,
  matchWithMode,
} from '../fuzzy-find'

/**
 * A single searchable setting in the Preferences dialog.
 *
 * Entries are intentionally decoupled from the pane components that render the
 * actual control: the search index only needs to know a stable id, which tab
 * the setting lives on, and how to describe it in both supported languages so a
 * query in English or Cantonese can find it. Selecting a result jumps the
 * dialog to {@link ISettingsSearchEntry.tab}.
 */
export interface ISettingsSearchEntry {
  /** Stable identifier (also used as the result element id / React key). */
  readonly id: string

  /** The Preferences tab this setting is rendered on. */
  readonly tab: PreferencesTab

  /** Localized short label shown as the result title. */
  readonly titleKey: TranslationKey

  /** Localized one-line description shown under the title. */
  readonly descriptionKey: TranslationKey

  /**
   * Extra match aliases (synonyms, acronyms, alternate spellings). These are
   * search aids only — never rendered — so they may mix English and Cantonese
   * terms freely to widen recall. Matching also always includes the localized
   * title and description in both languages, so common words need not be
   * repeated here.
   */
  readonly keywords: ReadonlyArray<string>
}

/** The localized display name for a Preferences tab. */
export function settingsTabNameKey(tab: PreferencesTab): TranslationKey {
  switch (tab) {
    case PreferencesTab.Accounts:
      return 'settingsSearch.tabName.accounts'
    case PreferencesTab.Integrations:
      return 'settingsSearch.tabName.integrations'
    case PreferencesTab.Copilot:
      return 'settingsSearch.tabName.copilot'
    case PreferencesTab.Git:
      return 'settingsSearch.tabName.git'
    case PreferencesTab.Appearance:
      return 'settingsSearch.tabName.appearance'
    case PreferencesTab.Notifications:
      return 'settingsSearch.tabName.notifications'
    case PreferencesTab.Prompts:
      return 'settingsSearch.tabName.prompts'
    case PreferencesTab.Advanced:
      return 'settingsSearch.tabName.advanced'
    case PreferencesTab.Accessibility:
      return 'settingsSearch.tabName.accessibility'
    case PreferencesTab.AgentAccess:
      return 'settingsSearch.tabName.agentAccess'
    case PreferencesTab.SelfHostedServer:
      return 'settingsSearch.tabName.selfHostedServer'
    case PreferencesTab.Automation:
      return 'settingsSearch.tabName.automation'
    case PreferencesTab.Queue:
      return 'settingsSearch.tabName.queue'
    case PreferencesTab.Sound:
      return 'settingsSearch.tabName.sound'
    case PreferencesTab.Ollama:
      return 'settingsSearch.tabName.ollama'
    case PreferencesTab.AI:
      return 'settingsSearch.tabName.ai'
    default:
      return 'settingsSearch.tabName.accounts'
  }
}

/**
 * The searchable catalog of Preferences settings.
 *
 * This is a representative index of the most-searched settings across every
 * tab rather than an exhaustive mirror of every control; new settings should
 * add an entry here so they become findable. Reusing existing `settings.*`
 * translation keys keeps the index in sync with the panes that already
 * localize those labels.
 */
export const SettingsSearchCatalog: ReadonlyArray<ISettingsSearchEntry> =
  Object.freeze([
    // Accounts
    {
      id: 'accounts-sign-in',
      tab: PreferencesTab.Accounts,
      titleKey: 'settingsSearch.entry.accountsSignIn.title',
      descriptionKey: 'settingsSearch.entry.accountsSignIn.desc',
      keywords: ['login', 'signin', 'github.com', 'log in', '登入', '帳戶'],
    },
    {
      id: 'accounts-enterprise',
      tab: PreferencesTab.Accounts,
      titleKey: 'settingsSearch.entry.accountsEnterprise.title',
      descriptionKey: 'settingsSearch.entry.accountsEnterprise.desc',
      keywords: ['ghe', 'server', 'enterprise', '企業'],
    },
    // Integrations (reuses the pane's own localized labels)
    {
      id: 'integrations-external-editor',
      tab: PreferencesTab.Integrations,
      titleKey: 'settings.integrationsExternalEditorTitle',
      descriptionKey: 'settings.integrationsExternalEditorSubtitle',
      keywords: ['vscode', 'editor', 'ide', 'code', '編輯器'],
    },
    {
      id: 'integrations-shell',
      tab: PreferencesTab.Integrations,
      titleKey: 'settings.integrationsShellTitle',
      descriptionKey: 'settings.integrationsShellSubtitle',
      keywords: ['terminal', 'shell', 'bash', 'powershell', '終端機'],
    },
    {
      id: 'integrations-windows-context-menu',
      tab: PreferencesTab.Integrations,
      titleKey: 'settings.contextMenuHeading',
      descriptionKey: 'settings.contextMenuDescription',
      keywords: [
        'explorer',
        'right click',
        'right-click',
        'context menu',
        'shell extension',
        'opencode',
        'folder',
        '右鍵',
        '選單',
        '檔案總管',
      ],
    },
    // Copilot
    {
      id: 'copilot-models',
      tab: PreferencesTab.Copilot,
      titleKey: 'settingsSearch.entry.copilotModels.title',
      descriptionKey: 'settingsSearch.entry.copilotModels.desc',
      keywords: ['ai', 'model', 'copilot', 'gpt', 'byok', 'ollama', '模型'],
    },
    // Ollama — the manager and its chat workspace have their own tab, so the
    // search results point at that tab rather than at Copilot's provider list.
    {
      id: 'ollama-manager',
      tab: PreferencesTab.Ollama,
      titleKey: 'settingsSearch.entry.ollamaManager.title',
      descriptionKey: 'settingsSearch.entry.ollamaManager.desc',
      keywords: [
        'ollama',
        'local model',
        'llm',
        'endpoint',
        'provider',
        'pull',
        'byok',
        '本地模型',
        '端點',
      ],
    },
    {
      id: 'ollama-chat',
      tab: PreferencesTab.Ollama,
      titleKey: 'settingsSearch.entry.ollamaChat.title',
      descriptionKey: 'settingsSearch.entry.ollamaChat.desc',
      keywords: ['ollama', 'chat', 'prompt', 'llm', 'local', '對話', '傾偈'],
    },
    // Self-hosted server
    {
      id: 'self-hosted-server-setup',
      tab: PreferencesTab.SelfHostedServer,
      titleKey: 'settingsSearch.entry.selfHostedServer.title',
      descriptionKey: 'settingsSearch.entry.selfHostedServer.desc',
      keywords: [
        'self hosted',
        'self-hosted',
        'docker',
        'server',
        'join link',
        'saml',
        '自託管',
        '伺服器',
      ],
    },
    // AI (administrator security controls)
    {
      id: 'ai-master-switch',
      tab: PreferencesTab.AI,
      titleKey: 'settingsSearch.entry.aiMasterSwitch.title',
      descriptionKey: 'settingsSearch.entry.aiMasterSwitch.desc',
      keywords: [
        'ai',
        'kill switch',
        'admin',
        'administrator',
        'security',
        'provider',
        'allow-list',
        'allowlist',
        '關掉',
        '安全',
      ],
    },
    {
      id: 'ai-repository-eligibility',
      tab: PreferencesTab.AI,
      titleKey: 'settingsSearch.entry.aiRepositoryEligibility.title',
      descriptionKey: 'settingsSearch.entry.aiRepositoryEligibility.desc',
      keywords: [
        'ai',
        'repository',
        'eligible',
        'eligibility',
        'deny',
        'allow',
        'admin',
        'security',
        '倉庫',
      ],
    },
    {
      id: 'copilot-conflict',
      tab: PreferencesTab.Copilot,
      titleKey: 'settingsSearch.entry.copilotConflict.title',
      descriptionKey: 'settingsSearch.entry.copilotConflict.desc',
      keywords: ['merge', 'conflict', 'resolve', '衝突'],
    },
    // Git
    {
      id: 'git-name',
      tab: PreferencesTab.Git,
      titleKey: 'settingsSearch.entry.gitName.title',
      descriptionKey: 'settingsSearch.entry.gitName.desc',
      keywords: ['author', 'committer', 'user.name', '名'],
    },
    {
      id: 'git-email',
      tab: PreferencesTab.Git,
      titleKey: 'settingsSearch.entry.gitEmail.title',
      descriptionKey: 'settingsSearch.entry.gitEmail.desc',
      keywords: ['author', 'user.email', 'mail', '電郵'],
    },
    {
      id: 'git-default-branch',
      tab: PreferencesTab.Git,
      titleKey: 'settingsSearch.entry.gitDefaultBranch.title',
      descriptionKey: 'settingsSearch.entry.gitDefaultBranch.desc',
      keywords: ['main', 'master', 'init', 'branch', '分支'],
    },
    {
      id: 'git-global-ignore',
      tab: PreferencesTab.Git,
      titleKey: 'settingsSearch.entry.gitGlobalIgnore.title',
      descriptionKey: 'settingsSearch.entry.gitGlobalIgnore.desc',
      keywords: [
        'global ignore',
        'excludesFile',
        'gitignore_global',
        'ignore across all repositories',
        'core.excludesfile',
        '全域忽略',
      ],
    },
    {
      id: 'git-hooks',
      tab: PreferencesTab.Git,
      titleKey: 'settingsSearch.entry.gitHooks.title',
      descriptionKey: 'settingsSearch.entry.gitHooks.desc',
      keywords: [
        'hooks',
        'hook environment',
        'cache',
        'husky',
        'pre-commit',
        'pre-push',
        '掛鉤',
      ],
    },
    // Appearance
    {
      id: 'appearance-theme',
      tab: PreferencesTab.Appearance,
      titleKey: 'settingsSearch.entry.appearanceTheme.title',
      descriptionKey: 'settingsSearch.entry.appearanceTheme.desc',
      keywords: ['dark', 'light', 'theme', 'mode', '主題', '深色'],
    },
    {
      id: 'appearance-language-mode',
      tab: PreferencesTab.Appearance,
      titleKey: 'settingsSearch.entry.appearanceLanguageMode.title',
      descriptionKey: 'settingsSearch.entry.appearanceLanguageMode.desc',
      keywords: [
        'language',
        'english',
        'cantonese',
        'bilingual',
        'locale',
        '語言',
        '廣東話',
        '雙語',
      ],
    },
    // The funny-level sliders. Every level name is listed as a keyword so a
    // search for the setting's *current value* ("maximum playfulness", "玩到
    // 盡") finds the control, not just a search for its label.
    {
      id: 'appearance-tone',
      tab: PreferencesTab.Appearance,
      titleKey: 'settingsSearch.entry.appearanceTone.title',
      descriptionKey: 'settingsSearch.entry.appearanceTone.desc',
      keywords: [
        'funny',
        'funny level',
        'tone',
        'humour',
        'humor',
        'playfulness',
        'slider',
        'voice',
        'fully serious',
        'mostly serious',
        'lightly playful',
        'playful',
        'maximum playfulness',
        '搞笑',
        '搞笑等級',
        '語氣',
        '滑桿',
        '完全認真',
        '大致認真',
        '輕鬆少少',
        '幾好玩',
        '玩到盡',
      ],
    },
    {
      id: 'appearance-accent',
      tab: PreferencesTab.Appearance,
      titleKey: 'settingsSearch.entry.appearanceAccent.title',
      descriptionKey: 'settingsSearch.entry.appearanceAccent.desc',
      keywords: ['color', 'colour', 'seed', 'accent', '顏色'],
    },
    {
      id: 'appearance-font',
      tab: PreferencesTab.Appearance,
      titleKey: 'settingsSearch.entry.appearanceFont.title',
      descriptionKey: 'settingsSearch.entry.appearanceFont.desc',
      keywords: ['typeface', 'font', 'size', 'weight', '字體'],
    },
    {
      id: 'appearance-zoom',
      tab: PreferencesTab.Appearance,
      titleKey: 'settingsSearch.entry.appearanceZoom.title',
      descriptionKey: 'settingsSearch.entry.appearanceZoom.desc',
      keywords: ['scale', 'zoom', 'magnify', '縮放'],
    },
    {
      id: 'appearance-playfulness',
      tab: PreferencesTab.Appearance,
      titleKey: 'appearance.playfulnessHeading',
      descriptionKey: 'appearance.playfulnessDescription',
      keywords: [
        'funny',
        'funny level',
        'tone',
        'english',
        'cantonese',
        'humour',
        '搞笑',
        '語氣',
        '廣東話',
      ],
    },
    // Notifications (reuses the pane's own localized labels)
    {
      id: 'notifications-enable',
      tab: PreferencesTab.Notifications,
      titleKey: 'settings.notificationsEnableTitle',
      descriptionKey: 'settings.notificationsEnableDescription',
      keywords: ['toast', 'alert', 'notification', '通知'],
    },
    {
      id: 'notifications-error-style',
      tab: PreferencesTab.Notifications,
      titleKey: 'settingsSearch.entry.notificationsErrorStyle.title',
      descriptionKey: 'settingsSearch.entry.notificationsErrorStyle.desc',
      keywords: ['error', 'dialog', 'banner', '錯誤'],
    },
    // Prompts
    {
      id: 'prompts-discard-changes',
      tab: PreferencesTab.Prompts,
      titleKey: 'settingsSearch.entry.promptsDiscard.title',
      descriptionKey: 'settingsSearch.entry.promptsDiscard.desc',
      keywords: ['discard', 'confirm', 'changes', '捨棄'],
    },
    {
      id: 'prompts-force-push',
      tab: PreferencesTab.Prompts,
      titleKey: 'settingsSearch.entry.promptsForcePush.title',
      descriptionKey: 'settingsSearch.entry.promptsForcePush.desc',
      keywords: ['force', 'push', 'confirm', '強制'],
    },
    {
      id: 'prompts-remove-repo',
      tab: PreferencesTab.Prompts,
      titleKey: 'settingsSearch.entry.promptsRemoveRepo.title',
      descriptionKey: 'settingsSearch.entry.promptsRemoveRepo.desc',
      keywords: ['remove', 'delete', 'repository', '移除'],
    },
    // Advanced (reuses the pane's own localized labels where present)
    {
      id: 'advanced-usage-stats',
      tab: PreferencesTab.Advanced,
      titleKey: 'settings.advancedUsageStatsTitle',
      descriptionKey: 'settings.advancedUsageStatsDescription',
      keywords: ['telemetry', 'stats', 'usage', 'privacy', '統計'],
    },
    {
      id: 'advanced-credential-storage',
      tab: PreferencesTab.Advanced,
      titleKey: 'settings.advancedCredentialStorageTitle',
      descriptionKey: 'settings.advancedCredentialStorageDescription',
      keywords: ['credential', 'helper', 'password', 'token', '憑證'],
    },
    {
      id: 'advanced-browser-open-mode',
      tab: PreferencesTab.Advanced,
      titleKey: 'settings.browserOpenModeTitle',
      descriptionKey: 'settings.browserOpenModeDescription',
      keywords: [
        'browser',
        'system browser',
        'external browser',
        'in-app browser',
        'open links',
        'default',
        'recommended',
        'blank page',
        '瀏覽器',
        '系統瀏覽器',
        '外部瀏覽器',
        'app 內瀏覽器',
        '開啟連結',
        '預設',
        '建議',
        '空白',
      ],
    },
    {
      id: 'advanced-open-ssh',
      tab: PreferencesTab.Advanced,
      titleKey: 'settingsSearch.entry.advancedOpenSSH.title',
      descriptionKey: 'settingsSearch.entry.advancedOpenSSH.desc',
      keywords: ['ssh', 'openssh', 'system', 'key', '金鑰'],
    },
    {
      id: 'advanced-large-repo-auto-detect',
      tab: PreferencesTab.Advanced,
      titleKey: 'settingsSearch.entry.largeRepoAutoDetect.title',
      descriptionKey: 'settingsSearch.entry.largeRepoAutoDetect.desc',
      keywords: [
        'large',
        'repository',
        'monorepo',
        'gc',
        'maintenance',
        'performance',
        '大型',
        '效能',
      ],
    },
    {
      id: 'advanced-large-repo-auto-repack',
      tab: PreferencesTab.Advanced,
      titleKey: 'settingsSearch.entry.largeRepoAutoRepack.title',
      descriptionKey: 'settingsSearch.entry.largeRepoAutoRepack.desc',
      keywords: ['repack', 'gc', 'pack', 'optimize', 'compact', '壓縮'],
    },
    // Accessibility
    {
      id: 'accessibility-underline-links',
      tab: PreferencesTab.Accessibility,
      titleKey: 'settingsSearch.entry.accessibilityUnderline.title',
      descriptionKey: 'settingsSearch.entry.accessibilityUnderline.desc',
      keywords: ['underline', 'links', 'accessibility', '底線'],
    },
    {
      id: 'accessibility-diff-check-marks',
      tab: PreferencesTab.Accessibility,
      titleKey: 'settingsSearch.entry.accessibilityDiffMarks.title',
      descriptionKey: 'settingsSearch.entry.accessibilityDiffMarks.desc',
      keywords: ['diff', 'check', 'marks', 'colorblind', '差異'],
    },
    // Agent access
    {
      id: 'agent-access-server',
      tab: PreferencesTab.AgentAccess,
      titleKey: 'settingsSearch.entry.agentAccessServer.title',
      descriptionKey: 'settingsSearch.entry.agentAccessServer.desc',
      keywords: ['agent', 'mcp', 'server', 'api', '代理'],
    },
    // Automation (reuses the pane's own localized labels)
    {
      id: 'automation-auto-commit-push',
      tab: PreferencesTab.Automation,
      titleKey: 'settings.automationAutoCommitPushTitle',
      descriptionKey: 'settings.automationAutoCommitPushDescription',
      keywords: ['auto', 'commit', 'push', 'schedule', '自動'],
    },
    {
      id: 'automation-auto-pull',
      tab: PreferencesTab.Automation,
      titleKey: 'settings.automationAutoPullTitle',
      descriptionKey: 'settings.automationAutoPullDescription',
      keywords: ['auto', 'pull', 'fetch', 'schedule', '自動'],
    },
    // Queue (reuses the pane's own localized labels)
    {
      id: 'queue-auto-clone',
      tab: PreferencesTab.Queue,
      titleKey: 'settings.queueAutoCloneTitle',
      descriptionKey: 'settings.queueAutoCloneDescription',
      keywords: ['clone', 'queue', 'auto', '隊列'],
    },
    {
      id: 'queue-mode',
      tab: PreferencesTab.Queue,
      titleKey: 'settings.queueMode',
      descriptionKey: 'settingsSearch.entry.queueMode.desc',
      keywords: ['parallel', 'sequential', 'clone', 'mode', '模式'],
    },
    // Sound (reuses the pane's own localized labels)
    {
      id: 'sound-master-enable',
      tab: PreferencesTab.Sound,
      titleKey: 'settings.soundMasterEnableTitle',
      descriptionKey: 'settings.soundMasterEnableDescription',
      keywords: ['sound', 'audio', 'mute', 'volume', '聲音', '靜音'],
    },
    {
      id: 'sound-narrator',
      tab: PreferencesTab.Sound,
      titleKey: 'settings.soundTtsEnableTitle',
      descriptionKey: 'settings.soundTtsEnableDescription',
      keywords: [
        'narrator',
        'tts',
        'voice',
        'speech',
        'cantonese',
        '旁白',
        '講嘢',
      ],
    },
    {
      id: 'sound-recorded-narration',
      tab: PreferencesTab.Sound,
      titleKey: 'settings.soundRecordedNarrationTitle',
      descriptionKey: 'settings.soundRecordedNarrationDescription',
      keywords: [
        'recorded',
        'narration',
        'voice',
        'melody',
        'prerecorded',
        '錄音',
        '預錄',
        '旁白',
      ],
    },
    {
      id: 'sound-effects',
      tab: PreferencesTab.Sound,
      titleKey: 'settings.soundSfxEnableTitle',
      descriptionKey: 'settings.soundSfxEnableDescription',
      keywords: ['sfx', 'effects', 'cue', 'chime', '音效'],
    },
    {
      id: 'sound-cue-audition',
      tab: PreferencesTab.Sound,
      titleKey: 'settings.soundSfxAuditionHeading',
      descriptionKey: 'settings.soundSfxAuditionHint',
      keywords: [
        'cue',
        'audition',
        'preview',
        'push',
        'pull',
        'fetch',
        'build',
        'run',
        'motif',
        '試聽',
        '提示音',
      ],
    },
    {
      id: 'sound-music',
      tab: PreferencesTab.Sound,
      titleKey: 'settings.soundMusicEnableTitle',
      descriptionKey: 'settings.soundMusicEnableDescription',
      keywords: ['music', 'melody', 'loop', 'background', '音樂'],
    },
    {
      id: 'sound-repository-theme',
      tab: PreferencesTab.Sound,
      titleKey: 'settings.soundThemeSubheading',
      descriptionKey: 'settings.soundThemeExplanation',
      keywords: [
        'theme',
        'repository',
        'generated',
        'synth',
        'seed',
        'motif',
        'override',
        'mute',
        '主題',
        '主題曲',
        '生成',
      ],
    },
    {
      id: 'sound-quiet-hours',
      tab: PreferencesTab.Sound,
      titleKey: 'settings.soundQuietHoursEnableTitle',
      descriptionKey: 'settings.soundQuietHoursEnableDescription',
      keywords: ['quiet', 'hours', 'night', 'schedule', '寧靜', '夜晚'],
    },
  ])

/**
 * Build the language-neutral match keys for a settings entry.
 *
 * The shared fuzzy matcher only decides membership from the first two keys
 * (title / subtitle), so all searchable text is packed into exactly two keys:
 * key 0 holds the title in both languages and key 1 holds the descriptions and
 * keyword aliases. This means a query typed in either language — and keyword
 * synonyms that never appear in a label — match in fuzzy, substring, and regex
 * modes alike, regardless of the viewer's chosen display language.
 */
export function settingsSearchKeys(
  entry: ISettingsSearchEntry
): ReadonlyArray<string> {
  const title = [
    translate(entry.titleKey, 'english'),
    translate(entry.titleKey, 'cantonese'),
  ].join(' ')

  const detail = [
    translate(entry.descriptionKey, 'english'),
    translate(entry.descriptionKey, 'cantonese'),
    ...entry.keywords,
  ].join(' ')

  return [title, detail]
}

/**
 * Filter the settings catalog for a query using the shared fuzzy / substring /
 * regex matcher. An empty (whitespace-only) query yields no results so callers
 * can distinguish "not searching" from "searching, nothing matched".
 */
export function filterSettingsEntries(
  query: string,
  options: IFilterOptions,
  entries: ReadonlyArray<ISettingsSearchEntry> = SettingsSearchCatalog
): IMatchResult<ISettingsSearchEntry> {
  if (query.trim().length === 0) {
    return { results: [], regexError: null }
  }

  return matchWithMode(query, entries, settingsSearchKeys, options)
}

/**
 * Group settings match results by their owning tab, preserving the order in
 * which tabs first appear in the results.
 */
export function groupSettingsResultsByTab(
  results: ReadonlyArray<IMatch<ISettingsSearchEntry>>
): ReadonlyArray<{
  readonly tab: PreferencesTab
  readonly matches: ReadonlyArray<IMatch<ISettingsSearchEntry>>
}> {
  const order: PreferencesTab[] = []
  const byTab = new Map<PreferencesTab, IMatch<ISettingsSearchEntry>[]>()

  for (const match of results) {
    const { tab } = match.item
    const existing = byTab.get(tab)
    if (existing === undefined) {
      order.push(tab)
      byTab.set(tab, [match])
    } else {
      existing.push(match)
    }
  }

  return order.map(tab => ({ tab, matches: byTab.get(tab) ?? [] }))
}

/** The set of tabs that contain at least one matching setting. */
export function settingsTabsWithMatches(
  results: ReadonlyArray<IMatch<ISettingsSearchEntry>>
): ReadonlySet<PreferencesTab> {
  return new Set(results.map(match => match.item.tab))
}

/** Convenience wrapper defaulting to a fuzzy, case-insensitive search. */
export function fuzzyFilterSettings(
  query: string,
  entries: ReadonlyArray<ISettingsSearchEntry> = SettingsSearchCatalog
): ReadonlyArray<ISettingsSearchEntry> {
  return filterSettingsEntries(
    query,
    { mode: FilterMode.Fuzzy, caseSensitive: false },
    entries
  ).results.map(match => match.item)
}
