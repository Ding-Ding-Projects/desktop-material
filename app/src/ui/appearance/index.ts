export {
  AppearanceEditorElementId,
  AppearanceEditorPanel,
} from './appearance-editor-panel'

export {
  AppIdentityAppearanceEditor,
  AppWorkspaceAppearanceEditor,
  CodeDiffAppearanceEditor,
  DefaultRepositoryLogoAppearanceEditor,
  FeatureHighlightingAppearanceEditor,
  RepositoryListAppearanceEditor,
  RepositoryTabsAppearanceEditor,
  RepositoryTabsOverrideAppearanceEditor,
  RepositoryToolbarAppearanceEditor,
  RepositoryWorkspaceAppearanceEditor,
  ToolbarAppearanceEditor,
  UpdateProgressAppearanceEditor,
} from './element-appearance-editors'
export type {
  IAppWorkspaceAppearance,
  ICodeDiffAppearance,
  IControlledAppearanceEditorProps,
  IDefaultRepositoryLogoAppearanceEditorProps,
  IFeatureHighlightingAppearance,
  IRepositoryListAppearance,
  IRepositoryTabsAppearance,
  IRepositoryTabsOverrideAppearanceEditorProps,
  IRepositoryToolbarAppearanceEditorProps,
  IRepositoryWorkspaceAppearanceEditorProps,
  IToolbarAppearance,
  IUpdateProgressAppearance,
} from './element-appearance-editors'

export {
  AnchoredAppearanceEditor,
  AppearanceElementHistoryDialog,
  getAppearanceRepositoryDisplayPath,
  isAppearanceEditorContextMenuKey,
  isAppearanceEditorFallbackContextMenu,
  isAppearanceEditorPointerGesture,
  openAppearanceEditorFromContextMenu,
  openAppearanceEditorFromKeyDown,
} from './anchored-appearance-editor'

export {
  ProfileDefaultRepositoryLogoAppearanceEditor,
  RepositoryListNameAppearanceEditor,
  RepositoryLogoAppearanceEditor,
} from './repository-element-appearance-editors'
export type {
  IProfileDefaultRepositoryLogoAppearanceEditorProps,
  IRepositoryListNameAppearanceEditorProps,
  IRepositoryLogoAppearanceEditorProps,
} from './repository-element-appearance-editors'
export type {
  AnchoredAppearanceEditorChildren,
  IAnchoredAppearanceEditorControls,
  IAnchoredAppearanceEditorProps,
  IAppearanceElementHistoryDialogProps,
} from './anchored-appearance-editor'

export {
  AppearanceLockBlockedEvent,
  AppearanceLockCreationRequestedEvent,
  AppearanceUnlocksChangedEvent,
  AppearanceLockTargetAttribute,
  announceAppearanceLockCreation,
  announceAppearanceLockBlocked,
  appearanceLockTargetProps,
  appearanceLockTargetSemantics,
  clearAppearanceUnlocks,
  consumeAppearanceLockContextMenuTarget,
  firstLockedAppearanceLock,
  forgetAppearanceUnlock,
  getAppearanceUnlocks,
  guardAppearanceActivation,
  guardAppearanceElementActivation,
  installAppearanceLockGate,
  isAppearanceTargetBlocked,
  recordAppearanceUnlock,
  refreshAppearanceLockSemantics,
  resolveAppearanceLockTarget,
  resolveAppearanceLockCreationTarget,
  resolveAppearanceLockTargets,
  uninstallAppearanceLockGate,
} from './appearance-lock-gate'
export type {
  IAppearanceLockBlockedDetail,
  IAppearanceLockCreationRequestedDetail,
  IAppearanceLockTargetResolution,
} from './appearance-lock-gate'

export {
  AppearanceActionableElementSelector,
  AppearanceAutoLockTargetAttribute,
  AppearanceElementRegistryChangedEvent,
  clearAppearanceElementRegistrations,
  installAppearanceElementInstrumentation,
  isAppearanceElementInstrumentationInstalled,
  listAppearanceElementRegistrations,
  registerAppearanceElement,
  uninstallAppearanceElementInstrumentation,
} from './appearance-lock-element-registry'
export type {
  IAppearanceElementRegistration,
  IAppearanceElementRegistrationOptions,
} from './appearance-lock-element-registry'

export { AppearanceLockPromptHost } from './appearance-lock-prompt-host'
