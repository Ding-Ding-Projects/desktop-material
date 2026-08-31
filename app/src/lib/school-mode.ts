/**
 * The resettable cross-surface presentation lock. This is intentionally a
 * local preference, not a security boundary: deleting the local profile data
 * resets it.
 */
export const SchoolModeStorageKey = 'desktop-material-school-mode-v1'
export const SchoolModeCredentialStorageKey =
  'desktop-material-school-mode-credential-v1'
export const SchoolModeChangedEvent = 'desktop-material-school-mode-changed'
export const DefaultSchoolModeName = 'School mode'
const MaximumSchoolModeNameLength = 80
const MinimumSchoolModeCredentialLength = 4
const MaximumSchoolModeCredentialLength = 128

export interface ISchoolModeState {
  readonly enabled: boolean
  readonly name: string
}

interface ISchoolModeCredentialRecord {
  readonly salt: string
  readonly digest: string
}

const defaultState: ISchoolModeState = {
  enabled: false,
  name: DefaultSchoolModeName,
}

export function readSchoolMode(
  storage: Pick<Storage, 'getItem'> = localStorage
): ISchoolModeState {
  try {
    const raw = storage.getItem(SchoolModeStorageKey)
    if (raw === null) {
      return defaultState
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return defaultState
    }
    const value = parsed as Record<string, unknown>
    const name = normalizeSchoolModeName(value.name)
    return { enabled: value.enabled === true, name }
  } catch {
    return defaultState
  }
}

export function writeSchoolMode(
  state: ISchoolModeState,
  storage: Pick<Storage, 'setItem'> = localStorage
): ISchoolModeState {
  const normalized = {
    enabled: state.enabled === true,
    name: normalizeSchoolModeName(state.name),
  }
  storage.setItem(SchoolModeStorageKey, JSON.stringify(normalized))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(SchoolModeChangedEvent))
  }
  return normalized
}

export function isSchoolModeEnabled(): boolean {
  return typeof localStorage !== 'undefined' && readSchoolMode().enabled
}

export function normalizeSchoolModeName(value: unknown): string {
  if (typeof value !== 'string') {
    return DefaultSchoolModeName
  }
  const name = value.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  return name.length > 0 && name.length <= MaximumSchoolModeNameLength
    ? name
    : DefaultSchoolModeName
}

export function isValidSchoolModeCredential(value: string): boolean {
  const normalized = value.trim()
  return (
    normalized.length >= MinimumSchoolModeCredentialLength &&
    normalized.length <= MaximumSchoolModeCredentialLength
  )
}

function getWebCrypto(): Crypto {
  if (
    typeof crypto === 'undefined' ||
    crypto.subtle === undefined ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    throw new Error('Web Crypto is unavailable for School mode credentials')
  }
  return crypto
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function digestCredential(credential: string, salt: string) {
  const input = new TextEncoder().encode(`${salt}\u0000${credential}`)
  const digest = await getWebCrypto().subtle.digest('SHA-256', input)
  return bytesToHex(new Uint8Array(digest))
}

function readCredentialRecord(
  storage: Pick<Storage, 'getItem'> = localStorage
): ISchoolModeCredentialRecord | null {
  try {
    const raw = storage.getItem(SchoolModeCredentialStorageKey)
    if (raw === null) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const value = parsed as Record<string, unknown>
    return typeof value.salt === 'string' && typeof value.digest === 'string'
      ? { salt: value.salt, digest: value.digest }
      : null
  } catch {
    return null
  }
}

export function hasSchoolModeCredential(
  storage: Pick<Storage, 'getItem'> = localStorage
): boolean {
  return readCredentialRecord(storage) !== null
}

export async function setSchoolModeCredential(
  credential: string,
  storage: Pick<Storage, 'setItem'> = localStorage
): Promise<void> {
  if (!isValidSchoolModeCredential(credential)) {
    throw new Error('School mode credentials must be 4 to 128 characters')
  }
  const saltBytes = new Uint8Array(16)
  getWebCrypto().getRandomValues(saltBytes)
  const salt = bytesToHex(saltBytes)
  const digest = await digestCredential(credential, salt)
  const record: ISchoolModeCredentialRecord = { salt, digest }
  storage.setItem(SchoolModeCredentialStorageKey, JSON.stringify(record))
}

export async function verifySchoolModeCredential(
  credential: string,
  storage: Pick<Storage, 'getItem'> = localStorage
): Promise<boolean> {
  const record = readCredentialRecord(storage)
  if (record === null || !isValidSchoolModeCredential(credential)) {
    return false
  }
  const digest = await digestCredential(credential, record.salt)
  if (digest.length !== record.digest.length) {
    return false
  }
  let difference = 0
  for (let index = 0; index < digest.length; index++) {
    difference |= digest.charCodeAt(index) ^ record.digest.charCodeAt(index)
  }
  return difference === 0
}
