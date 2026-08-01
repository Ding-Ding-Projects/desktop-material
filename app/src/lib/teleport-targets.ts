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
