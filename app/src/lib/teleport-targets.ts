/**
 * Where a feature actually lives on screen.
 *
 * The command palette can do more than dispatch a menu event: choosing a row
 * *teleports* the user to the control that owns the feature, so the next time
 * they need it they know where it is. Each teleport target is a symbolic id
 * resolved to a DOM selector here, in one place, rather than scattering
 * selectors through the catalog.
 *
 * Two flavours of selector appear below:
 *
 * - Stable structural hooks the app already renders (`#changes-tab`,
 *   `[data-toolbar-item-id="sync"]`). These need no source change and cannot
 *   drift silently, because the attribute is part of the component's contract.
 * - Explicit `data-teleport-target` anchors added to a surface that had no
 *   stable hook of its own (mostly individual settings rows).
 *
 * Keep this file free of DOM and React imports: it is pure data so the palette
 * catalog and its node-only tests can consume it.
 */
export const TeleportTargetSelectors = {
  // Toolbar items. `data-toolbar-item-id` is rendered by the toolbar for its
  // overflow bookkeeping, so these hooks exist whether or not anyone teleports.
  toolbarRepository: '[data-toolbar-item-id="repository"]',
  toolbarWorktree: '[data-toolbar-item-id="worktree"]',
  toolbarBranch: '[data-toolbar-item-id="branch"]',
  toolbarSync: '[data-toolbar-item-id="sync"]',
  toolbarCommitPush: '[data-toolbar-item-id="one-click-commit-push"]',
  toolbarBuildRun: '[data-toolbar-item-id="build-run"]',

  // The repository view's vertical rail.
  sidebarChangesTab: '#changes-tab',
  sidebarHistoryTab: '#history-tab',
  sidebarActionsTab: '#actions-tab',
  sidebarReleasesTab: '#releases-tab',
  sidebarIssuesTab: '#issues-tab',
  sidebarCheapLfsTab: '#cheap-lfs-tab',
  sidebarGitHubApiTab: '#github-api-tab',
  sidebarRepositoryToolsTab: '#repository-tools-tab',
  repositorySidebar: '#repository-sidebar',

  // The commit box.
  commitSummary: '.summary-field',

  // Settings rows. These carry explicit anchors because a checkbox in a stack
  // of checkboxes has nothing else to aim at.
  settingsTheme: '[data-teleport-target="settings-theme"]',
  settingsLanguageMode: '[data-teleport-target="settings-language-mode"]',
  settingsFunnyEnglish: '[data-teleport-target="settings-funny-english"]',
  settingsFunnyCantonese: '[data-teleport-target="settings-funny-cantonese"]',
  settingsTabSize: '[data-teleport-target="settings-tab-size"]',
  settingsConfirmDiscard: '[data-teleport-target="settings-confirm-discard"]',
  settingsConfirmForcePush:
    '[data-teleport-target="settings-confirm-force-push"]',
  settingsConfirmRepositoryRemoval:
    '[data-teleport-target="settings-confirm-repository-removal"]',
  settingsCommitLengthWarning:
    '[data-teleport-target="settings-commit-length-warning"]',
  settingsNotifications: '[data-teleport-target="settings-notifications"]',
  settingsUnderlineLinks: '[data-teleport-target="settings-underline-links"]',
  settingsExternalCredentialHelper:
    '[data-teleport-target="settings-external-credential-helper"]',
  settingsWindowsOpenSSH: '[data-teleport-target="settings-windows-openssh"]',
  settingsExternalEditor: '[data-teleport-target="settings-external-editor"]',
  settingsShell: '[data-teleport-target="settings-shell"]',

  // Appearance
  settingsUiScale: '[data-teleport-target="settings-ui-scale"]',
  settingsAutoFitZoom: '[data-teleport-target="settings-auto-fit-zoom"]',
  settingsShowRecentRepositories:
    '[data-teleport-target="settings-show-recent-repositories"]',
  settingsBranchNameInRepoList:
    '[data-teleport-target="settings-branch-name-in-repo-list"]',
  settingsBranchSort: '[data-teleport-target="settings-branch-sort"]',
  settingsDateFormat: '[data-teleport-target="settings-date-format"]',
  settingsTimeFormat: '[data-teleport-target="settings-time-format"]',
  settingsNumberFormat: '[data-teleport-target="settings-number-format"]',
  settingsPreferAbsoluteDates:
    '[data-teleport-target="settings-prefer-absolute-dates"]',

  // Advanced
  settingsAutoSwitchAccount:
    '[data-teleport-target="settings-auto-switch-account"]',
  settingsRepositoryIndicators:
    '[data-teleport-target="settings-repository-indicators"]',
  settingsUsageStats: '[data-teleport-target="settings-usage-stats"]',
  settingsVerboseLogging: '[data-teleport-target="settings-verbose-logging"]',
  settingsLargeRepoAutoDetect:
    '[data-teleport-target="settings-large-repo-auto-detect"]',
  settingsLargeRepoAutoRepack:
    '[data-teleport-target="settings-large-repo-auto-repack"]',
  settingsBrowserOpenMode:
    '[data-teleport-target="settings-browser-open-mode"]',

  // Prompts
  settingsConfirmDiscardPermanently:
    '[data-teleport-target="settings-confirm-discard-permanently"]',
  settingsConfirmDiscardStash:
    '[data-teleport-target="settings-confirm-discard-stash"]',
  settingsConfirmCheckoutCommit:
    '[data-teleport-target="settings-confirm-checkout-commit"]',
  settingsConfirmUndoCommit:
    '[data-teleport-target="settings-confirm-undo-commit"]',
  settingsConfirmCommitMessageOverride:
    '[data-teleport-target="settings-confirm-commit-message-override"]',
  settingsConfirmWorktreeRemoval:
    '[data-teleport-target="settings-confirm-worktree-removal"]',
  settingsConfirmCommitFilteredChanges:
    '[data-teleport-target="settings-confirm-commit-filtered-changes"]',
  settingsUncommittedChangesStrategy:
    '[data-teleport-target="settings-uncommitted-changes-strategy"]',

  // Accessibility and notifications
  settingsDiffCheckMarks: '[data-teleport-target="settings-diff-check-marks"]',
  settingsErrorPresentation:
    '[data-teleport-target="settings-error-presentation"]',

  // Git
  settingsGitAuthorName: '[data-teleport-target="settings-git-author-name"]',
  settingsGitAuthorEmail: '[data-teleport-target="settings-git-author-email"]',
  settingsShowCommitIdentity:
    '[data-teleport-target="settings-show-commit-identity"]',
  settingsDefaultBranchName:
    '[data-teleport-target="settings-default-branch-name"]',
  settingsGitHookEnv: '[data-teleport-target="settings-git-hook-env"]',
  settingsGitHookEnvShell:
    '[data-teleport-target="settings-git-hook-env-shell"]',
  settingsGitHookEnvCache:
    '[data-teleport-target="settings-git-hook-env-cache"]',
  settingsGlobalIgnore: '[data-teleport-target="settings-global-ignore"]',

  // Integrations
  settingsContextMenuOpencode:
    '[data-teleport-target="settings-context-menu-opencode"]',
  settingsContextMenuDesktopMaterial:
    '[data-teleport-target="settings-context-menu-desktop-material"]',
  settingsContextMenuModern:
    '[data-teleport-target="settings-context-menu-modern"]',
  settingsBranchPresetScript:
    '[data-teleport-target="settings-branch-preset-script"]',
  settingsCustomIntegration:
    '[data-teleport-target="settings-custom-integration"]',

  // Agent access
  settingsAgentServerEnabled:
    '[data-teleport-target="settings-agent-server-enabled"]',
  settingsAgentAccessMode:
    '[data-teleport-target="settings-agent-access-mode"]',
  settingsAgentPairing: '[data-teleport-target="settings-agent-pairing"]',
  settingsAgentToken: '[data-teleport-target="settings-agent-token"]',

  // Automation and queue
  settingsAutoCommitPush: '[data-teleport-target="settings-auto-commit-push"]',
  settingsAutoCommitPushInterval:
    '[data-teleport-target="settings-auto-commit-push-interval"]',
  settingsAutoPull: '[data-teleport-target="settings-auto-pull"]',
  settingsAutoPullInterval:
    '[data-teleport-target="settings-auto-pull-interval"]',
  settingsAutomationAccountOverrides:
    '[data-teleport-target="settings-automation-account-overrides"]',
  settingsQueueAccounts: '[data-teleport-target="settings-queue-accounts"]',

  // Sound
  settingsSoundMaster: '[data-teleport-target="settings-sound-master"]',
  settingsSoundEffects: '[data-teleport-target="settings-sound-effects"]',
  settingsSoundEffectVolume:
    '[data-teleport-target="settings-sound-effect-volume"]',
  settingsSoundNarrator: '[data-teleport-target="settings-sound-narrator"]',
  settingsSoundRecordedNarration:
    '[data-teleport-target="settings-sound-recorded-narration"]',
  settingsSoundNarratorVolume:
    '[data-teleport-target="settings-sound-narrator-volume"]',
  settingsSoundNarratorCooldown:
    '[data-teleport-target="settings-sound-narrator-cooldown"]',
  settingsSoundMusic: '[data-teleport-target="settings-sound-music"]',
  settingsSoundMusicVolume:
    '[data-teleport-target="settings-sound-music-volume"]',
  settingsSoundMusicTrack:
    '[data-teleport-target="settings-sound-music-track"]',
  settingsSoundQuietHours:
    '[data-teleport-target="settings-sound-quiet-hours"]',
  settingsSoundQuietHoursStart:
    '[data-teleport-target="settings-sound-quiet-hours-start"]',
  settingsSoundQuietHoursEnd:
    '[data-teleport-target="settings-sound-quiet-hours-end"]',
  settingsSoundReducedMotion:
    '[data-teleport-target="settings-sound-reduced-motion"]',
  settingsSoundAudition: '[data-teleport-target="settings-sound-audition"]',

  // Copilot and Ollama
  settingsCopilotCommitModel:
    '[data-teleport-target="settings-copilot-commit-model"]',
  settingsCopilotConflictModel:
    '[data-teleport-target="settings-copilot-conflict-model"]',
  settingsCopilotAlwaysConflicts:
    '[data-teleport-target="settings-copilot-always-conflicts"]',
  settingsOllamaEndpoint: '[data-teleport-target="settings-ollama-endpoint"]',

  // Repository settings
  repoSettingsAccount: '[data-teleport-target="repo-settings-account"]',
  repoSettingsAppearance: '[data-teleport-target="repo-settings-appearance"]',
  repoSettingsBuildAutoInstall:
    '[data-teleport-target="repo-settings-build-auto-install"]',
  repoSettingsBuildPreElevate:
    '[data-teleport-target="repo-settings-build-pre-elevate"]',
  repoSettingsBuildRunAfterBuild:
    '[data-teleport-target="repo-settings-build-run-after-build"]',
  repoSettingsBuildAutoIgnore:
    '[data-teleport-target="repo-settings-build-auto-ignore"]',
  repoSettingsBuildAfterPull:
    '[data-teleport-target="repo-settings-build-after-pull"]',
  repoSettingsBuildOfferAgents:
    '[data-teleport-target="repo-settings-build-offer-agents"]',
  repoSettingsBuildFixProvider:
    '[data-teleport-target="repo-settings-build-fix-provider"]',
  repoSettingsBuildFixAutoApprove:
    '[data-teleport-target="repo-settings-build-fix-auto-approve"]',
  repoSettingsCheapLfsAutoMaterialize:
    '[data-teleport-target="repo-settings-cheap-lfs-auto-materialize"]',
  repoSettingsCheapLfsAutoPin:
    '[data-teleport-target="repo-settings-cheap-lfs-auto-pin"]',
  repoSettingsCheapLfsCloneHelper:
    '[data-teleport-target="repo-settings-cheap-lfs-clone-helper"]',
  repoSettingsCheapLfsParallelUploads:
    '[data-teleport-target="repo-settings-cheap-lfs-parallel-uploads"]',
  repoSettingsCheapLfsStorageProvider:
    '[data-teleport-target="repo-settings-cheap-lfs-storage-provider"]',
  repoSettingsCheapLfsCloudCompression:
    '[data-teleport-target="repo-settings-cheap-lfs-cloud-compression"]',
  repoSettingsCheapLfsEncryption:
    '[data-teleport-target="repo-settings-cheap-lfs-encryption"]',

  // Non-settings surfaces
  // The signing anchor is the hub's real navigation button. Focusing it selects
  // and reveals the signing policy panel, so a palette teleport never lands on
  // a detached or hidden placeholder.
  repositoryToolsSigning: '[data-teleport-target="repository-tools-signing"]',
  diffOptionsButton: '[data-teleport-target="diff-options-button"]',
  paletteAppearanceButton: '[data-teleport-target="palette-appearance-button"]',
  tabStrip: '[data-teleport-target="tab-strip"]',
  titleBarBrand: '[data-teleport-target="title-bar-brand"]',
  appWorkspace: '[data-teleport-target="app-workspace"]',
} as const

/** The symbolic name of a place the palette can teleport to. */
export type TeleportTargetId = keyof typeof TeleportTargetSelectors

/** The DOM selector a teleport target resolves to. */
export function teleportTargetSelector(id: TeleportTargetId): string {
  return TeleportTargetSelectors[id]
}

/**
 * The props an owning surface spreads onto the element it wants to be
 * teleportable to, e.g. `<div {...teleportAnchor('settings-theme')}>`.
 *
 * The literal id passed here is the value inside the matching
 * `data-teleport-target` selector above; keeping both in this file is what
 * makes a rename a compile-visible edit rather than a silently dead selector.
 */
export function teleportAnchor(anchorId: string): {
  readonly 'data-teleport-target': string
} {
  return { 'data-teleport-target': anchorId }
}
