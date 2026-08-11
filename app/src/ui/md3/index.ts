/**
 * The shared MD3 shell contract: the pure style mappings from
 * `design/History MD3.dc.html` and the primitives every view in the rewrite
 * is built from.
 *
 * The matching stylesheet is `app/styles/ui/_md3-shell.scss`.
 */

export {
  statusTone,
  toneByKey,
  runIcon,
  initials,
  isGroupStart,
  formatAddDelete,
} from './md3-style-contract'
export type { Md3ToneKey, IMd3Tone } from './md3-style-contract'

export {
  Md3IconButton,
  Md3TonalButton,
  Md3GhostButton,
  Md3SearchField,
  Md3ChipRow,
  Md3ChipRowSpacer,
  Md3Chip,
  Md3EmptyState,
  Md3GroupHeader,
} from './md3-primitives'
export { Md3ComposeDialog } from './md3-compose-dialog'
export type { IMd3ComposeDialogProps } from './md3-compose-dialog'

export {
  Md3ToastHost,
  md3Toasts,
  notify,
  dismissToast,
  useMd3Toasts,
  Md3ToastDefaultDuration,
} from './md3-toast'
export type { IMd3Toast, IMd3ToastOptions, Md3ToastKind } from './md3-toast'

export type {
  IMd3IconButtonProps,
  IMd3TextButtonProps,
  IMd3SearchFieldProps,
  IMd3ChipRowProps,
  IMd3ChipProps,
  IMd3EmptyStateProps,
  IMd3GroupHeaderProps,
} from './md3-primitives'

export { MenuKinds, getMenuSpec, defaultMd3MenuContext } from './md3-menu-specs'
export type {
  MenuKind,
  Md3MenuDestination,
  Md3MenuToggle,
  Md3MenuPermission,
  Md3MenuCommand,
  IMd3MenuAccount,
  IMd3MenuRepositorySummary,
  IMd3MenuBranchSummary,
  IMd3MenuContext,
  IMd3MenuHandlers,
  IMd3MenuItem,
  IMd3MenuSpec,
} from './md3-menu-specs'

export { Md3MenuOverlay, filterMenuItems } from './md3-menu-overlay'
export type {
  IMd3MenuOverlayProps,
  IMd3MenuFilterResult,
  IMd3FocusTarget,
} from './md3-menu-overlay'

export { Md3AppHeader } from './md3-app-header'
export type { IMd3AppHeaderProps } from './md3-app-header'

export {
  Md3PaneHeader,
  md3ShowBreadcrumbs,
  md3ShowSync,
} from './md3-pane-header'
export type {
  IMd3PaneHeaderProps,
  Md3Destination,
  Md3PushState,
} from './md3-pane-header'

export {
  Md3RegexBuilderDialog,
  evaluateMd3RegexPattern,
  Md3RegexDefaultFlags,
} from './md3-regex-builder-dialog'
export type {
  IMd3RegexBuilderDialogProps,
  IMd3RegexBuilderApplication,
  IMd3RegexEvaluation,
  Md3RegexResultTone,
} from './md3-regex-builder-dialog'

export {
  Md3ActionsView,
  Md3ActionsChips,
  md3ActionsStatusIcon,
  formatMd3RunMeta,
  formatMd3RunDetail,
  formatMd3RunHeading,
  classifyMd3LogLine,
} from './md3-actions-view'
export type {
  IMd3ActionsViewProps,
  IMd3ActionsRun,
  IMd3ActionsJob,
  IMd3ActionsStep,
  IMd3ActionsSearch,
  IMd3ActionsPagination,
  IMd3ActionsAttempts,
  IMd3ActionsBanner,
  IMd3ActionsFilterOption,
  Md3ActionsChip,
  Md3ActionsFilterName,
  Md3ActionsStatus,
  Md3LogLineKind,
} from './md3-actions-view'

export {
  Md3AgentsView,
  formatMd3AgentDetail,
  formatMd3AgentElapsed,
  formatMd3AgentMeta,
  md3AgentSessionMatcher,
} from './md3-agents-view'
export type {
  IMd3AgentsViewProps,
  IMd3AgentSession,
  IMd3AgentConversation,
  IMd3AgentTurn,
  Md3AgentSessionState,
  Md3AgentTurnRole,
  Md3AgentAccessTopic,
} from './md3-agents-view'

export {
  Md3TerminalView,
  createMd3TerminalLines,
  classifyTerminalLine,
  stripTerminalControlSequences,
} from './md3-terminal-view'
export type {
  IMd3TerminalViewProps,
  IMd3TerminalSession,
  IMd3TerminalSearch,
  IMd3TerminalLine,
  Md3TerminalLineKind,
  Md3TerminalSessionStatus,
} from './md3-terminal-view'

export { Md3DiffPane } from './md3-diff-pane'
export type {
  IMd3DiffPaneProps,
  IMd3DiffLine,
  IMd3DiffFileTab,
  Md3DiffLineKind,
  Md3DiffPaneAction,
} from './md3-diff-pane'

export {
  Md3HistoryView,
  createMd3HistoryMatcher,
  filterMd3HistoryCommits,
  formatMd3CommitDetail,
} from './md3-history-view'
export type {
  IMd3HistoryViewProps,
  IMd3HistoryCommit,
  Md3HistoryFilterId,
  Md3CommitKind,
} from './md3-history-view'

export {
  Md3ChangesView,
  md3ChangeName,
  md3ChangeDirectory,
  md3ChangeExtension,
  md3ChangeDetail,
  md3IncludeAllIcon,
  md3SummaryHint,
} from './md3-changes-view'
export type {
  IMd3ChangesViewProps,
  IMd3ChangedFile,
  IMd3ChangesFilterChip,
  Md3ChangeStatus,
} from './md3-changes-view'

export {
  useMd3VirtualWindow,
  useMd3MeasuredRowHeight,
} from './md3-virtual-window'
export type { IMd3VirtualWindow } from './md3-virtual-window'

export {
  Md3BranchesView,
  Md3BranchChips,
  md3BranchDetail,
  md3BranchRowActions,
  md3BranchListActions,
  md3MergeAllProgress,
  md3MergeAllRunning,
  groupMd3Branches,
} from './md3-branches-view'
export type {
  IMd3BranchesViewProps,
  IMd3BranchRow,
  IMd3BranchPullRequest,
  IMd3BranchRowAction,
  IMd3BranchRowHandlers,
  IMd3BranchListAction,
  IMd3BranchListHandlers,
  IMd3MergeAllStatus,
  Md3BranchChip,
  Md3BranchGroup,
  Md3BranchRowActionId,
  Md3BranchSortOrder,
  Md3MergeAllPhase,
} from './md3-branches-view'

export { Md3NavigationDrawer, md3Destinations } from './md3-navigation-drawer'
export type {
  IMd3NavigationDrawerProps,
  IMd3Destination,
  Md3DestinationId,
} from './md3-navigation-drawer'

export {
  Md3InboxView,
  filterMd3InboxNotifications,
  md3InboxDetailLine,
  md3InboxExportRecord,
  md3InboxIsMention,
  md3InboxToneWord,
} from './md3-inbox-view'
export type {
  IMd3InboxViewProps,
  IMd3InboxNotification,
  IMd3InboxExportRequest,
  IMd3InboxFilterResult,
  IMd3InboxFilterState,
  Md3InboxFilter,
  Md3InboxTone,
} from './md3-inbox-view'

export {
  Md3InboxExportFormats,
  serializeMd3InboxExport,
} from './md3-inbox-export'
export type {
  IMd3InboxExport,
  IMd3InboxExportFormatDescriptor,
  IMd3InboxExportOptions,
  IMd3InboxExportRecord,
  Md3InboxExportFormat,
} from './md3-inbox-export'

export {
  Md3RepositoriesView,
  Md3RepositoriesSearchInputId,
  filterMd3Repositories,
  md3HasChangesChipLabel,
  md3RepositoryChangesLabel,
  md3RepositoryDetail,
  md3RepositoryGroupChips,
  md3RepositoryIsDirty,
  md3RepositoryMeta,
  md3RepositoryRunPercent,
  md3RepositoryRunSummary,
  md3RepositoryRunTotals,
} from './md3-repositories-view'
export type {
  IMd3RepositoriesViewProps,
  IMd3RepositoryFilterResult,
  IMd3RepositoryRow,
  IMd3RepositoryRun,
  IMd3RepositoryRunTotals,
  IMd3RepositorySync,
  Md3RepositoryBulkOperation,
} from './md3-repositories-view'

export {
  Md3DestructiveGate,
  Md3DestructiveGateBody,
  Md3GateAuthorizationMaximum,
  md3GateState,
  md3GateAnchorPosition,
} from './md3-destructive-gate'
export type {
  IMd3DestructiveGateProps,
  IMd3DestructiveGateBodyProps,
  IMd3GateElementRef,
  IMd3GatePosition,
  IMd3GateRect,
  Md3GateState,
} from './md3-destructive-gate'

export {
  Md3DestructiveActions,
  md3DestructiveAction,
} from './md3-destructive-actions'
export type {
  IMd3DestructiveAction,
  Md3DestructiveActionId,
  Md3DestructiveGateHost,
} from './md3-destructive-actions'

export { Md3SupportTicketsDesk } from './md3-support-tickets-view'
export type {
  IMd3SupportTicketsDeskProps,
  Md3SupportTicketFilter,
} from './md3-support-tickets-view'

export { Md3SupportTicketEntry } from './md3-support-ticket-entry'
export type { IMd3SupportTicketEntryProps } from './md3-support-ticket-entry'

export { Md3SupportTicketDeleteGate } from './md3-support-ticket-delete-gate'
export type { IMd3SupportTicketDeleteGateProps } from './md3-support-ticket-delete-gate'

export {
  Md3LockUnlockPrompt,
  md3LockPromptPosition,
  md3LockForgottenRouteAvailable,
} from './md3-lock-unlock-prompt'
export type {
  IMd3LockUnlockPromptProps,
  IMd3LockAnchorRect,
} from './md3-lock-unlock-prompt'

export {
  Md3LockSetupDialog,
  describeUnlockDuration,
} from './md3-lock-setup-dialog'
export type { IMd3LockSetupDialogProps } from './md3-lock-setup-dialog'

export { Md3LockRemovalGate } from './md3-lock-removal-gate'
export type { IMd3LockRemovalGateProps } from './md3-lock-removal-gate'

export { Md3LocksView, describeLockState } from './md3-locks-view'
export type { IMd3LocksViewProps } from './md3-locks-view'

export {
  ShortcutLockSurface,
  ShortcutManageLocks,
  buildMd3LockMenuItems,
  md3LockedResultLabel,
  excludeLockedFromBulkClose,
} from './md3-lock-menu-items'
export type {
  IMd3LockMenuContext,
  IMd3LockMenuHandlers,
  IMd3LockedBulkCloseResult,
} from './md3-lock-menu-items'

export {
  Md3AuthenticatorView,
  md3FactorTitle,
  filterMd3AuthenticatorFactors,
  md3AuthenticatorExportRecord,
} from './md3-authenticator-view'
export type {
  IMd3AuthenticatorViewProps,
  IMd3AuthenticatorFactor,
  IMd3AuthenticatorExportRequest,
  IMd3AuthenticatorFilter,
} from './md3-authenticator-view'

export {
  md3AuthenticatorFixtureFactors,
  md3AuthenticatorFixtureGroups,
  md3AuthenticatorFixtureSecrets,
} from './md3-authenticator-fixtures'

export {
  Md3AuthenticatorRegistration,
  Md3RegistrationSources,
} from './md3-authenticator-registration'
export type {
  IMd3AuthenticatorRegistrationProps,
  IMd3RegistrationResult,
  IMd3RegistrationSubject,
  Md3RegistrationSource,
} from './md3-authenticator-registration'

export {
  Md3AuthenticatorQr,
  MinimumQrModulePixels,
  DefaultQrPixelSize,
} from './md3-authenticator-qr'
export type { IMd3AuthenticatorQrProps } from './md3-authenticator-qr'

export {
  Md3AuthenticatorExportFormats,
  serializeMd3AuthenticatorExport,
  serializeMd3AuthenticatorSecrets,
} from './md3-authenticator-export'
export type {
  IMd3AuthenticatorExport,
  IMd3AuthenticatorExportRecord,
  IMd3AuthenticatorExportFormatDescriptor,
  Md3AuthenticatorExportFormat,
} from './md3-authenticator-export'

export {
  decodeQrFromBlob,
  readQrFromClipboard,
  hasCameraDevice,
  startCameraScan,
} from './md3-authenticator-capture'
export type {
  Md3CaptureResult,
  IMd3CameraScan,
} from './md3-authenticator-capture'
