import { compileSafeRegex } from '../safe-regex'

/**
 * The data model behind the app's for-fun surface locks.
 *
 * A lock is a self-imposed speed bump on a tab, a tab group, or an appearance
 * value. It is NOT security: nothing is encrypted, nothing is protected from
 * anybody else who has the machine, and a user who forgets a credential
 * recovers by deleting the application-data folder. Every sentence this module
 * feeds the interface says so, and no sentence anywhere in the feature claims
 * otherwise.
 *
 * Two rules shape the whole model and are worth stating before the types:
 *
 * 1. **Every lock carries its own credential.** There is no master credential
 *    and no inheritance. Locking a group does not relock its members under the
 *    group's credential, and a locked property inside a locked tab is two locks
 *    with two answers. That is why {@link IMd3Lock} has no parent pointer: a
 *    lock knows only what it covers.
 * 2. **Nothing secret lives in this model.** A lock records what it covers,
 *    which factor answers it, and how long an unlock lasts. The password digest
 *    and the OTP secret live in the operating-system credential vault, reached
 *    through `lock-credentials.ts`; a lock only ever holds the vault account
 *    KEY, which is a name rather than a value.
 */

/** How a lock is answered. */
export type Md3LockFactor = 'password' | 'otp'

/** Every kind of surface a lock can cover. */
export type Md3LockSurfaceKind =
  | 'tab'
  | 'tabGroup'
  | 'appearanceProperty'
  | 'appearanceElement'
  | 'appearancePreset'

/** Every surface kind, in the order the lock manager groups them. */
export const Md3LockSurfaceKinds: ReadonlyArray<Md3LockSurfaceKind> = [
  'tab',
  'tabGroup',
  'appearanceProperty',
  'appearanceElement',
  'appearancePreset',
]

/** How long one successful unlock lasts. */
export type Md3UnlockDurationKind = 'surface' | 'minutes' | 'session'

/** The unlock durations offered, in the order the picker lists them. */
export const Md3UnlockDurationKinds: ReadonlyArray<Md3UnlockDurationKind> = [
  'surface',
  'minutes',
  'session',
]

export interface IMd3UnlockDuration {
  readonly kind: Md3UnlockDurationKind

  /**
   * Only meaningful when `kind` is `minutes`. Kept populated in every case so
   * switching kinds in the editor does not lose the number the user typed.
   */
  readonly minutes: number
}

/** Ten minutes, re-locking on launch, is the shipped default. */
export const DefaultMd3UnlockDuration: IMd3UnlockDuration = {
  kind: 'minutes',
  minutes: 10,
}

/** The shortest and longest timed unlock the picker accepts. */
export const MinimumUnlockMinutes = 1
export const MaximumUnlockMinutes = 720

/** What a lock covers. The label stays readable while the lock is on. */
export interface IMd3LockTarget {
  readonly kind: Md3LockSurfaceKind

  /**
   * Stable identity of the locked thing — a tab id, a group id, or an
   * appearance property id from {@link Md3LockableAppearanceProperties}.
   */
  readonly id: string

  /** The visible name. A locked tab keeps its label; only its content waits. */
  readonly label: string
}

/** One lock, exactly as it is persisted. Contains no secret of any kind. */
export interface IMd3Lock {
  readonly id: string

  readonly target: IMd3LockTarget

  readonly factor: Md3LockFactor

  /** ISO-8601, so an exported list is still sortable outside the app. */
  readonly createdAt: string

  readonly unlockDuration: IMd3UnlockDuration

  /** Re-lock when the app next starts. On by default. */
  readonly lockOnLaunch: boolean

  /**
   * For an `otp` lock: the account key the app's authenticator stores that
   * entry's secret under. It is a NAME, never a secret, and it is the only
   * thing this model knows about an OTP factor.
   */
  readonly otpAccountKey: string | null
}

/** A live unlock. Held in memory only — an unlock never survives a restart. */
export interface IMd3ActiveUnlock {
  readonly lockId: string

  /**
   * Epoch milliseconds after which the unlock has expired, or `null` for an
   * unlock that lasts until the app closes.
   *
   * A `surface` unlock is also `null` here: it is retired by the host when the
   * user leaves the surface, which is an event rather than a deadline.
   */
  readonly expiresAt: number | null

  readonly kind: Md3UnlockDurationKind
}

/**
 * The kinds of appearance value a lock can cover.
 *
 * "Every appearance value is lockable" is only meaningful if the list is
 * enumerable, so the catalogue below is exhaustive over what the appearance
 * editors actually expose rather than a hand-picked subset.
 */
export type Md3LockableValueType =
  | 'colour'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'fontStyle'
  | 'textDecoration'
  | 'textCase'
  | 'spacing'
  | 'lineHeight'
  | 'alignment'
  | 'effect'
  | 'shape'
  | 'radius'
  | 'elevation'
  | 'density'
  | 'motion'
  | 'theme'
  | 'seedColour'
  | 'preset'

/** One lockable appearance value. */
export interface IMd3LockableAppearanceProperty {
  /** The property's real identifier in the appearance models. */
  readonly id: string

  readonly valueType: Md3LockableValueType

  /**
   * The appearance surface the property belongs to, used to group the picker.
   * These are the element ids the appearance editors already own.
   */
  readonly element: string
}

/**
 * Every appearance value the editors expose, by its real model identifier.
 *
 * The identifiers come from `models/appearance-customization.ts`,
 * `models/repository-tab.ts` (`ITabTitleStyle`) and
 * `models/repository-logo.ts`. Nothing here is invented: a property that is not
 * in one of those models is not in this list, and a property that is in one of
 * them and not here is a gap the coverage test below fails on.
 */
export const Md3LockableAppearanceProperties: ReadonlyArray<IMd3LockableAppearanceProperty> =
  [
    // Global appearance — theme, seed colour, elevation, density, motion.
    { id: 'accentPalette', valueType: 'seedColour', element: 'app-workspace' },
    { id: 'surfacePalette', valueType: 'theme', element: 'app-workspace' },
    {
      id: 'updateProgressPalette',
      valueType: 'colour',
      element: 'update-progress',
    },
    { id: 'elevation', valueType: 'elevation', element: 'app-workspace' },
    { id: 'motion', valueType: 'motion', element: 'app-workspace' },
    { id: 'uiFont', valueType: 'fontFamily', element: 'app-workspace' },
    { id: 'monospaceFont', valueType: 'fontFamily', element: 'code-diff' },
    { id: 'toolbarLabels', valueType: 'shape', element: 'toolbar' },
    { id: 'toolbarDensity', valueType: 'density', element: 'toolbar' },
    {
      id: 'repositoryListDensity',
      valueType: 'density',
      element: 'repository-list',
    },
    { id: 'tabDensity', valueType: 'density', element: 'repository-tabs' },
    { id: 'tabWidth', valueType: 'spacing', element: 'repository-tabs' },
    { id: 'tabCloseButtons', valueType: 'shape', element: 'repository-tabs' },
    {
      id: 'submoduleBackButtonStyle',
      valueType: 'shape',
      element: 'submodule-back-button',
    },
    {
      id: 'submoduleBackButtonLabel',
      valueType: 'textCase',
      element: 'submodule-back-button',
    },

    // Word-depth typography, from `ITabTitleStyle`.
    { id: 'color', valueType: 'colour', element: 'tab-title' },
    { id: 'backgroundColor', valueType: 'colour', element: 'tab-title' },
    { id: 'fontFamily', valueType: 'fontFamily', element: 'tab-title' },
    { id: 'fontSize', valueType: 'fontSize', element: 'tab-title' },
    { id: 'bold', valueType: 'fontWeight', element: 'tab-title' },
    { id: 'italic', valueType: 'fontStyle', element: 'tab-title' },
    { id: 'underline', valueType: 'textDecoration', element: 'tab-title' },
    { id: 'strikeThrough', valueType: 'textDecoration', element: 'tab-title' },
    { id: 'smallCaps', valueType: 'textCase', element: 'tab-title' },
    { id: 'textCase', valueType: 'textCase', element: 'tab-title' },
    { id: 'characterSpacing', valueType: 'spacing', element: 'tab-title' },
    { id: 'textEffect', valueType: 'effect', element: 'tab-title' },
    { id: 'textAlign', valueType: 'alignment', element: 'tab-title' },

    // The repository logo designer: shape, radius, line height and gradients.
    { id: 'shape', valueType: 'shape', element: 'repository-logo' },
    { id: 'fill', valueType: 'colour', element: 'repository-logo' },
    { id: 'primaryColor', valueType: 'colour', element: 'repository-logo' },
    { id: 'secondaryColor', valueType: 'colour', element: 'repository-logo' },
    { id: 'gradientAngle', valueType: 'radius', element: 'repository-logo' },
    { id: 'borderWidth', valueType: 'radius', element: 'repository-logo' },
    { id: 'borderColor', valueType: 'colour', element: 'repository-logo' },
    { id: 'shadow', valueType: 'effect', element: 'repository-logo' },
    { id: 'font', valueType: 'fontFamily', element: 'repository-logo' },
    { id: 'fontWeight', valueType: 'fontWeight', element: 'repository-logo' },
    { id: 'letterSpacing', valueType: 'spacing', element: 'repository-logo' },
    { id: 'scale', valueType: 'lineHeight', element: 'repository-logo' },
    { id: 'opacity', valueType: 'effect', element: 'repository-logo' },

    // Named presets and saved themes are locked whole.
    { id: 'namedPreset', valueType: 'preset', element: 'appearance-presets' },
  ]

/** Every value type that at least one catalogued property carries. */
export const Md3LockableValueTypes: ReadonlyArray<Md3LockableValueType> = [
  'colour',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'textCase',
  'spacing',
  'lineHeight',
  'alignment',
  'effect',
  'shape',
  'radius',
  'elevation',
  'density',
  'motion',
  'theme',
  'seedColour',
  'preset',
]

/** Look one catalogued appearance property up by its model identifier. */
export function findLockableAppearanceProperty(
  id: string
): IMd3LockableAppearanceProperty | null {
  return Md3LockableAppearanceProperties.find(entry => entry.id === id) ?? null
}

/** The vault account key a password lock's digest is stored under. */
export function lockCredentialAccountKey(lockId: string): string {
  return `lock:${lockId}`
}

const HexAlphabet = '0123456789abcdef'

/** A random, collision-resistant lock id. Never derived from the target. */
export function createMd3LockId(
  randomBytes: (length: number) => Uint8Array = defaultRandomBytes
): string {
  const bytes = randomBytes(12)
  let id = ''
  for (const byte of bytes) {
    id += HexAlphabet[(byte >> 4) & 0xf] + HexAlphabet[byte & 0xf]
  }
  return id
}

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  if (typeof crypto === 'undefined') {
    throw new Error('Web Crypto is unavailable, so a lock id cannot be minted')
  }
  crypto.getRandomValues(bytes)
  return bytes
}

function clampMinutes(value: unknown): number {
  const minutes = typeof value === 'number' ? Math.round(value) : Number.NaN
  if (!Number.isFinite(minutes)) {
    return DefaultMd3UnlockDuration.minutes
  }
  return Math.min(MaximumUnlockMinutes, Math.max(MinimumUnlockMinutes, minutes))
}

/** Coerce arbitrary persisted JSON into a valid duration. */
export function normalizeUnlockDuration(value: unknown): IMd3UnlockDuration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DefaultMd3UnlockDuration
  }
  const record = value as Record<string, unknown>
  const kind = Md3UnlockDurationKinds.find(entry => entry === record.kind)
  return {
    kind: kind ?? DefaultMd3UnlockDuration.kind,
    minutes: clampMinutes(record.minutes),
  }
}

const controlCharacters = /[\u0000-\u001f\u007f]/g

function normalizeText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') {
    return null
  }
  // Control characters would break both the row and the export formats.
  const text = value.replace(controlCharacters, '').trim()
  return text.length > 0 && text.length <= maximumLength ? text : null
}

/** The longest target id and label a lock will accept. */
export const MaximumLockIdentifierLength = 200
export const MaximumLockLabelLength = 200

/**
 * Coerce one persisted entry into a lock, or reject it.
 *
 * A malformed entry is dropped rather than repaired into something the user
 * never asked for: a lock the app invented is a lock nobody has the credential
 * for, which is the one failure this feature must not produce.
 */
export function normalizeLock(value: unknown): IMd3Lock | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>

  const id = normalizeText(record.id, MaximumLockIdentifierLength)
  if (id === null) {
    return null
  }

  const target = record.target
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    return null
  }
  const targetRecord = target as Record<string, unknown>
  const kind = Md3LockSurfaceKinds.find(entry => entry === targetRecord.kind)
  const targetId = normalizeText(targetRecord.id, MaximumLockIdentifierLength)
  const label = normalizeText(targetRecord.label, MaximumLockLabelLength)
  if (kind === undefined || targetId === null || label === null) {
    return null
  }

  const factor: Md3LockFactor = record.factor === 'otp' ? 'otp' : 'password'
  const createdAt =
    typeof record.createdAt === 'string' &&
    Number.isFinite(Date.parse(record.createdAt))
      ? record.createdAt
      : new Date(0).toISOString()

  const otpAccountKey =
    factor === 'otp'
      ? normalizeText(record.otpAccountKey, MaximumLockIdentifierLength)
      : null

  return {
    id,
    target: { kind, id: targetId, label },
    factor,
    createdAt,
    unlockDuration: normalizeUnlockDuration(record.unlockDuration),
    // Locked on launch is the default, so anything that is not an explicit
    // `false` re-locks. A corrupt record must fail closed.
    lockOnLaunch: record.lockOnLaunch !== false,
    otpAccountKey,
  }
}

/** Is this unlock still live at `now`? */
export function isMd3UnlockActive(
  unlock: IMd3ActiveUnlock | undefined,
  now: number
): boolean {
  if (unlock === undefined) {
    return false
  }
  return unlock.expiresAt === null || unlock.expiresAt > now
}

/** Build the unlock a successful attempt grants. */
export function createActiveUnlock(
  lockId: string,
  duration: IMd3UnlockDuration,
  now: number
): IMd3ActiveUnlock {
  if (duration.kind === 'minutes') {
    return {
      lockId,
      kind: 'minutes',
      expiresAt: now + clampMinutes(duration.minutes) * 60_000,
    }
  }
  return { lockId, kind: duration.kind, expiresAt: null }
}

/**
 * How long a wrong attempt makes the next one wait, in milliseconds.
 *
 * The delay exists so a mistyped credential is not a hundred-a-second guessing
 * game, not because this is enforcement — it is a toy lock, and the copy beside
 * it says so. The first two attempts are free, because the overwhelmingly
 * common case is a typo.
 */
export function md3LockAttemptDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 2) {
    return 0
  }
  if (consecutiveFailures === 3) {
    return 5_000
  }
  if (consecutiveFailures === 4) {
    return 15_000
  }
  return 30_000
}

/** A filtered lock list, plus the regex error when the pattern will not compile. */
export interface IMd3LockFilterResult {
  readonly locks: ReadonlyArray<IMd3Lock>

  /** Non-null only in regex mode, and only when the pattern is invalid. */
  readonly regexError: string | null
}

export interface IMd3LockFilterOptions {
  readonly regexEnabled: boolean
  readonly caseSensitive: boolean
}

/**
 * Filter locks by label, target id, factor and surface kind.
 *
 * Plain text is the default and matches a case-insensitive substring across
 * every searchable field. Regex mode goes through the repository's RE2 adapter,
 * which is linear-time by construction, so an adversarial pattern typed into
 * this field cannot wedge the renderer.
 */
export function filterMd3Locks(
  locks: ReadonlyArray<IMd3Lock>,
  query: string,
  options: IMd3LockFilterOptions
): IMd3LockFilterResult {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return { locks, regexError: null }
  }

  const fields = (lock: IMd3Lock): ReadonlyArray<string> => [
    lock.target.label,
    lock.target.id,
    lock.target.kind,
    lock.factor,
  ]

  if (!options.regexEnabled) {
    const needle = trimmed.toLowerCase()
    return {
      locks: locks.filter(lock =>
        fields(lock).some(field => field.toLowerCase().includes(needle))
      ),
      regexError: null,
    }
  }

  const { regex, error } = compileSafeRegex(trimmed, options.caseSensitive)
  if (regex === null) {
    // An invalid pattern reports itself and shows the unfiltered list, rather
    // than an empty one that reads as "you have no locks".
    return { locks, regexError: error }
  }

  return {
    locks: locks.filter(lock => fields(lock).some(field => regex.test(field))),
    regexError: null,
  }
}
