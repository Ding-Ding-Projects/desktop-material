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

export { Md3NavigationDrawer, md3Destinations } from './md3-navigation-drawer'
export type {
  IMd3NavigationDrawerProps,
  IMd3Destination,
  Md3DestinationId,
} from './md3-navigation-drawer'
