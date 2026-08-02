import {
  LaunchpadItemKeyMaximumLength,
  LaunchpadProviderItemKey,
  isLaunchpadProviderItemKey,
} from './launchpad-model'

export const LaunchpadPreferencesDocumentVersion = 1
export const LaunchpadPreferencesStorageKeyPrefix =
  'desktop-material-launchpad-preferences-v1'
export const LaunchpadPreferencesNamespaceMaximumLength = 256
export const LaunchpadPreferencesMaximumPins = 128
export const LaunchpadPreferencesMaximumSnoozes = 512
export const LaunchpadPreferencesMaximumSerializedCharacters = 1024 * 1024

const namespaceControlCharacters = /[\u0000-\u001f\u007f]/

export interface ILaunchpadPreferencesStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type LaunchpadPreferencesClock = () => number

export interface ILaunchpadSnoozePreference {
  readonly itemKey: LaunchpadProviderItemKey
  /** Epoch milliseconds. The snooze is expired when `now >= expiresAt`. */
  readonly expiresAt: number
}

export interface ILaunchpadPreferencesSnapshot {
  /** Oldest pin first. Re-pinning an existing item does not move it. */
  readonly pinnedItemKeys: ReadonlyArray<LaunchpadProviderItemKey>
  readonly snoozedItems: ReadonlyArray<ILaunchpadSnoozePreference>
}

interface ILaunchpadPreferencesDocument {
  readonly version: 1
  readonly pinned: ReadonlyArray<LaunchpadProviderItemKey>
  readonly snoozed: ReadonlyArray<ILaunchpadSnoozePreference>
}

interface IParsedLaunchpadPreferencesDocument {
  readonly document: ILaunchpadPreferencesDocument
  readonly needsRewrite: boolean
}

const emptyDocument = (): ILaunchpadPreferencesDocument => ({
  version: LaunchpadPreferencesDocumentVersion,
  pinned: [],
  snoozed: [],
})

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: ReadonlyArray<string>
): boolean {
  const keys = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    keys.length === sortedExpected.length &&
    sortedExpected.every((key, index) => keys[index] === key)
  )
}

function isSafeEpochMilliseconds(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function parseDocument(
  serialized: string,
  now: number
): IParsedLaunchpadPreferencesDocument | null {
  if (serialized.length > LaunchpadPreferencesMaximumSerializedCharacters) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return null
  }

  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, ['version', 'pinned', 'snoozed']) ||
    parsed.version !== LaunchpadPreferencesDocumentVersion ||
    !Array.isArray(parsed.pinned) ||
    parsed.pinned.length > LaunchpadPreferencesMaximumPins ||
    !Array.isArray(parsed.snoozed) ||
    parsed.snoozed.length > LaunchpadPreferencesMaximumSnoozes
  ) {
    return null
  }

  const pinned: LaunchpadProviderItemKey[] = []
  const seenPins = new Set<LaunchpadProviderItemKey>()
  let needsRewrite = false
  for (const itemKey of parsed.pinned) {
    if (
      typeof itemKey !== 'string' ||
      itemKey.length > LaunchpadItemKeyMaximumLength ||
      !isLaunchpadProviderItemKey(itemKey)
    ) {
      return null
    }
    if (seenPins.has(itemKey)) {
      needsRewrite = true
      continue
    }
    seenPins.add(itemKey)
    pinned.push(itemKey)
  }

  const snoozed: ILaunchpadSnoozePreference[] = []
  const snoozeIndexes = new Map<LaunchpadProviderItemKey, number>()
  for (const candidate of parsed.snoozed) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ['expiresAt', 'itemKey']) ||
      typeof candidate.itemKey !== 'string' ||
      candidate.itemKey.length > LaunchpadItemKeyMaximumLength ||
      !isLaunchpadProviderItemKey(candidate.itemKey) ||
      !isSafeEpochMilliseconds(candidate.expiresAt)
    ) {
      return null
    }

    const preference: ILaunchpadSnoozePreference = {
      itemKey: candidate.itemKey,
      expiresAt: candidate.expiresAt,
    }
    const existingIndex = snoozeIndexes.get(preference.itemKey)
    if (existingIndex === undefined) {
      snoozeIndexes.set(preference.itemKey, snoozed.length)
      snoozed.push(preference)
    } else {
      // A duplicate is not allowed to create two live states. Preserve the
      // first position, but let the last complete record supply the value.
      snoozed[existingIndex] = preference
      needsRewrite = true
    }
  }

  const activeSnoozes = snoozed.filter(snooze => snooze.expiresAt > now)
  needsRewrite ||= activeSnoozes.length !== snoozed.length

  return {
    document: {
      version: LaunchpadPreferencesDocumentVersion,
      pinned,
      snoozed: activeSnoozes,
    },
    needsRewrite,
  }
}

function serializeDocument(
  document: ILaunchpadPreferencesDocument
): string | null {
  const serialized = JSON.stringify(document)
  return serialized.length <= LaunchpadPreferencesMaximumSerializedCharacters
    ? serialized
    : null
}

function defaultStorage(): ILaunchpadPreferencesStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Build an injective, versioned storage key for one non-secret profile scope. */
export function createLaunchpadPreferencesStorageKey(
  namespace: string
): string {
  if (
    typeof namespace !== 'string' ||
    namespace.length === 0 ||
    namespace.length > LaunchpadPreferencesNamespaceMaximumLength ||
    namespace.trim().length === 0 ||
    namespaceControlCharacters.test(namespace)
  ) {
    throw new Error('Launchpad preferences namespace is invalid.')
  }

  let encodedNamespace: string
  try {
    encodedNamespace = encodeURIComponent(namespace)
  } catch {
    throw new Error('Launchpad preferences namespace is invalid.')
  }
  return `${LaunchpadPreferencesStorageKeyPrefix}:${encodedNamespace}`
}

/**
 * Bounded pin and snooze persistence. Only canonical provider item keys enter
 * the document: display content, URLs, account tokens, and adapter payloads are
 * neither accepted nor serialized.
 */
export class LaunchpadPreferencesStore {
  public readonly storageKey: string
  private document: ILaunchpadPreferencesDocument

  public constructor(
    namespace: string,
    private readonly storage: ILaunchpadPreferencesStorage | null = defaultStorage(),
    private readonly clock: LaunchpadPreferencesClock = Date.now
  ) {
    this.storageKey = createLaunchpadPreferencesStorageKey(namespace)
    this.document = this.load()
  }

  public getSnapshot(): ILaunchpadPreferencesSnapshot {
    this.pruneExpiredSnoozes()
    return {
      pinnedItemKeys: [...this.document.pinned],
      snoozedItems: this.document.snoozed.map(snooze => ({ ...snooze })),
    }
  }

  public getPinnedItemKeys(): ReadonlyArray<LaunchpadProviderItemKey> {
    return [...this.document.pinned]
  }

  public getSnoozedItems(): ReadonlyArray<ILaunchpadSnoozePreference> {
    this.pruneExpiredSnoozes()
    return this.document.snoozed.map(snooze => ({ ...snooze }))
  }

  public isPinned(itemKey: LaunchpadProviderItemKey): boolean {
    return (
      isLaunchpadProviderItemKey(itemKey) &&
      this.document.pinned.includes(itemKey)
    )
  }

  /** Append a new pin without disturbing the order of existing pins. */
  public pin(itemKey: LaunchpadProviderItemKey): boolean {
    if (
      !isLaunchpadProviderItemKey(itemKey) ||
      this.document.pinned.includes(itemKey) ||
      this.document.pinned.length >= LaunchpadPreferencesMaximumPins
    ) {
      return false
    }
    return this.replace({
      ...this.document,
      pinned: [...this.document.pinned, itemKey],
    })
  }

  public unpin(itemKey: LaunchpadProviderItemKey): boolean {
    if (!isLaunchpadProviderItemKey(itemKey)) {
      return false
    }
    const pinned = this.document.pinned.filter(key => key !== itemKey)
    return pinned.length === this.document.pinned.length
      ? false
      : this.replace({ ...this.document, pinned })
  }

  /**
   * Snooze through, but not including, `expiresAt`. Updating a snooze keeps its
   * stable position. A deadline at or before the injected clock removes it.
   */
  public snooze(itemKey: LaunchpadProviderItemKey, expiresAt: number): boolean {
    if (
      !isLaunchpadProviderItemKey(itemKey) ||
      !isSafeEpochMilliseconds(expiresAt)
    ) {
      return false
    }

    const now = this.now()
    this.pruneExpiredSnoozesAt(now)
    if (expiresAt <= now) {
      return this.unsnooze(itemKey)
    }

    const existingIndex = this.document.snoozed.findIndex(
      snooze => snooze.itemKey === itemKey
    )
    if (existingIndex === -1) {
      if (this.document.snoozed.length >= LaunchpadPreferencesMaximumSnoozes) {
        return false
      }
      return this.replace({
        ...this.document,
        snoozed: [...this.document.snoozed, { itemKey, expiresAt }],
      })
    }

    if (this.document.snoozed[existingIndex].expiresAt === expiresAt) {
      return false
    }
    const snoozed = [...this.document.snoozed]
    snoozed[existingIndex] = { itemKey, expiresAt }
    return this.replace({ ...this.document, snoozed })
  }

  public unsnooze(itemKey: LaunchpadProviderItemKey): boolean {
    if (!isLaunchpadProviderItemKey(itemKey)) {
      return false
    }
    const snoozed = this.document.snoozed.filter(
      preference => preference.itemKey !== itemKey
    )
    return snoozed.length === this.document.snoozed.length
      ? false
      : this.replace({ ...this.document, snoozed })
  }

  public getSnoozedUntil(itemKey: LaunchpadProviderItemKey): number | null {
    if (!isLaunchpadProviderItemKey(itemKey)) {
      return null
    }
    this.pruneExpiredSnoozes()
    return (
      this.document.snoozed.find(snooze => snooze.itemKey === itemKey)
        ?.expiresAt ?? null
    )
  }

  public isSnoozed(itemKey: LaunchpadProviderItemKey): boolean {
    return this.getSnoozedUntil(itemKey) !== null
  }

  /** Prune entries at the exact deadline and return how many were removed. */
  public pruneExpiredSnoozes(): number {
    return this.pruneExpiredSnoozesAt(this.now())
  }

  private pruneExpiredSnoozesAt(now: number): number {
    const snoozed = this.document.snoozed.filter(
      preference => preference.expiresAt > now
    )
    const removed = this.document.snoozed.length - snoozed.length
    if (removed > 0) {
      this.replace({ ...this.document, snoozed })
    }
    return removed
  }

  private now(): number {
    try {
      const value = this.clock()
      return isSafeEpochMilliseconds(value) ? value : 0
    } catch {
      return 0
    }
  }

  private load(): ILaunchpadPreferencesDocument {
    if (this.storage === null) {
      return emptyDocument()
    }

    let serialized: string | null
    try {
      serialized = this.storage.getItem(this.storageKey)
    } catch {
      return emptyDocument()
    }
    if (serialized === null) {
      return emptyDocument()
    }

    const parsed = parseDocument(serialized, this.now())
    if (parsed === null) {
      const empty = emptyDocument()
      this.write(empty)
      return empty
    }
    if (parsed.needsRewrite) {
      this.write(parsed.document)
    }
    return parsed.document
  }

  private replace(document: ILaunchpadPreferencesDocument): boolean {
    const serialized = serializeDocument(document)
    if (serialized === null) {
      return false
    }
    this.document = document
    this.writeSerialized(serialized)
    return true
  }

  private write(document: ILaunchpadPreferencesDocument): void {
    const serialized = serializeDocument(document)
    if (serialized !== null) {
      this.writeSerialized(serialized)
    }
  }

  private writeSerialized(serialized: string): void {
    if (this.storage === null) {
      return
    }
    try {
      this.storage.setItem(this.storageKey, serialized)
    } catch {
      // Private-mode, quota, and shutdown failures do not break live state.
    }
  }
}
