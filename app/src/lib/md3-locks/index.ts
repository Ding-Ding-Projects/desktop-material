/**
 * The for-fun surface locks: a password or one-time-password speed bump on a
 * tab, a tab group, or any appearance value.
 *
 * The platform-vault wiring (`lock-vault-os.ts`) is deliberately NOT re-exported
 * here. It loads a native dependency, so importing it from this barrel would
 * drag the keychain into every consumer — including the tests that exercise the
 * model with a fake vault. The app installs it explicitly at start-up instead.
 */

export {
  Md3LockSurfaceKinds,
  Md3UnlockDurationKinds,
  DefaultMd3UnlockDuration,
  MinimumUnlockMinutes,
  MaximumUnlockMinutes,
  MaximumLockIdentifierLength,
  MaximumLockLabelLength,
  Md3LockableAppearanceProperties,
  Md3LockableValueTypes,
  findLockableAppearanceProperty,
  lockCredentialAccountKey,
  createMd3LockId,
  normalizeUnlockDuration,
  normalizeLock,
  isMd3UnlockActive,
  createActiveUnlock,
  md3LockAttemptDelayMs,
  filterMd3Locks,
} from './lock-model'
export type {
  Md3LockFactor,
  Md3LockSurfaceKind,
  Md3UnlockDurationKind,
  Md3LockableValueType,
  IMd3UnlockDuration,
  IMd3LockTarget,
  IMd3Lock,
  IMd3ActiveUnlock,
  IMd3LockableAppearanceProperty,
  IMd3LockFilterResult,
  IMd3LockFilterOptions,
} from './lock-model'

export {
  Md3LocksStorageKey,
  Md3LocksChangedEvent,
  readMd3Locks,
  writeMd3Locks,
  addMd3Lock,
  updateMd3Lock,
  removeMd3Locks,
  locksForTarget,
  isTargetLocked,
} from './lock-registry'
export type {
  Md3LockStorage,
  IMd3LockDraft,
  IMd3LockUpdate,
} from './lock-registry'

export {
  VaultUnavailableMessage,
  MinimumLockPasswordLength,
  MaximumLockPasswordLength,
  setMd3LockCredentialVault,
  resetMd3LockCredentialVault,
  getMd3LockCredentialVault,
  setMd3TotpVerifier,
  isMd3TotpAvailable,
  setMd3LockSupportTicketsRoute,
  isMd3LockSupportTicketsAvailable,
  openMd3LockSupportTickets,
  isValidMd3LockPassword,
  setMd3LockPassword,
  hasMd3LockPassword,
  verifyMd3LockPassword,
  removeMd3LockCredential,
  md3LockAttemptState,
  clearMd3LockAttempts,
  clearAllMd3LockAttempts,
  verifyMd3Lock,
  isMd3LockAnswerable,
} from './lock-credentials'
export type {
  IMd3LockCredentialVault,
  IMd3TotpVerifier,
  Md3LockSupportTicketsRoute,
  Md3LockVerificationOutcome,
  IMd3LockVerification,
} from './lock-credentials'

export {
  Md3LockExportFormats,
  Md3LockExportOmissionNotice,
  toMd3LockExportRecord,
  serializeMd3LockExport,
} from './lock-export'
export type {
  Md3LockExportFormat,
  IMd3LockExportFormatDescriptor,
  IMd3LockExportRecord,
  IMd3LockExport,
  IMd3LockExportOptions,
} from './lock-export'
