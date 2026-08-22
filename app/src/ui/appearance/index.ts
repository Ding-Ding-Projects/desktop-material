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
  AppearanceLockTargetAttribute,
  AppearanceLockTargetKindAttribute,
  announceAppearanceLockBlocked,
  appearanceLockTargetProps,
  appearanceLockTargetSemantics,
  clearAppearanceUnlocks,
  firstLockedAppearanceLock,
  firstLockedTargetLock,
  forgetAppearanceUnlock,
  guardAppearanceActivation,
  guardAppearanceElementActivation,
  installAppearanceLockGate,
  isAppearanceTargetBlocked,
  isMd3TargetBlocked,
  recordAppearanceUnlock,
  refreshAppearanceLockSemantics,
  resolveAppearanceLockTarget,
  resolveAppearanceLockTargets,
  uninstallAppearanceLockGate,
} from './appearance-lock-gate'
export type { IAppearanceLockBlockedDetail } from './appearance-lock-gate'

export { AppearanceLockPromptHost } from './appearance-lock-prompt-host'
