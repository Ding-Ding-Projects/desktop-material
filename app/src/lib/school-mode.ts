/**
 * The resettable cross-surface presentation lock. This is intentionally a
 * local preference, not a security boundary: deleting the local profile data
 * resets it.
 */
export const SchoolModeStorageKey = 'desktop-material-school-mode-v1'
const DefaultSchoolModeName = 'School mode'
const MaximumSchoolModeNameLength = 80

export interface ISchoolModeState {
  readonly enabled: boolean
  readonly name: string
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
