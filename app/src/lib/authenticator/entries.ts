import {
  clampTotpDigits,
  clampTotpPeriod,
  DefaultTotpAlgorithm,
  DefaultTotpDigits,
  DefaultTotpPeriod,
  ITotpParameters,
  parseTotpAlgorithm,
  TotpAlgorithm,
} from './totp'

/**
 * The authenticator's own records: who each factor belongs to, how it is
 * configured, and where it sits in the list.
 *
 * **No secret ever appears in this document.** Every field here is written to
 * an ordinary settings file and to the app's local Git history, so the shared
 * key lives in the operating-system credential vault under the entry's id and
 * nothing else. That split is the entire security design of this feature: a
 * settings file that leaks tells an attacker which accounts exist, and nothing
 * that would let them produce a code.
 */

/** One registered TOTP factor, minus its secret. */
export interface IAuthenticatorEntry {
  /** Stable identity. Also the credential-vault account key for the secret. */
  readonly id: string
  /** Who issued the factor: "GitHub", "Fastmail". May be empty. */
  readonly issuer: string
  /** The account it belongs to: an email address, a username, a handle. */
  readonly account: string
  readonly algorithm: TotpAlgorithm
  readonly digits: number
  /** The time step in seconds. */
  readonly period: number
  /** The group this entry is filed under. Empty means ungrouped. */
  readonly group: string
  /** ISO-8601, recorded when the factor was registered. */
  readonly addedAt: string
}

/** The persisted document. Versioned so a later shape can migrate forward. */
export interface IAuthenticatorDocument {
  readonly version: 1
  /** The list, in the user's own order. */
  readonly entries: ReadonlyArray<IAuthenticatorEntry>
  /** Group names in the user's own order, including empty groups. */
  readonly groups: ReadonlyArray<string>
}

/** The document a fresh profile starts from: genuinely empty, not seeded. */
export const DefaultAuthenticatorDocument: IAuthenticatorDocument = {
  version: 1,
  entries: [],
  groups: [],
}

/** Bounds that keep a hand-edited or imported file from growing without end. */
export const MaximumAuthenticatorEntries = 500
export const MaximumAuthenticatorFieldLength = 200

function trimTo(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether an unknown value is a well-formed entry. */
export function isAuthenticatorEntry(
  value: unknown
): value is IAuthenticatorEntry {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.issuer === 'string' &&
    typeof value.account === 'string' &&
    value.account.trim().length > 0 &&
    typeof value.algorithm === 'string' &&
    parseTotpAlgorithm(value.algorithm) !== null &&
    typeof value.digits === 'number' &&
    typeof value.period === 'number' &&
    typeof value.group === 'string' &&
    typeof value.addedAt === 'string'
  )
}

/** Whether an unknown value is a well-formed authenticator document. */
export function isAuthenticatorDocument(
  value: unknown
): value is IAuthenticatorDocument {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.version === 1 &&
    Array.isArray(value.entries) &&
    value.entries.every(isAuthenticatorEntry) &&
    Array.isArray(value.groups) &&
    value.groups.every(group => typeof group === 'string')
  )
}

/**
 * The canonical form of a document.
 *
 * Duplicate ids are dropped rather than merged — two rows claiming the same
 * vault key would read each other's secret, and the second one wins silently.
 * Every group an entry references is guaranteed present in `groups`, so the
 * list can never render a row into a group header that does not exist.
 */
export function normalizeAuthenticatorDocument(
  document: IAuthenticatorDocument
): IAuthenticatorDocument {
  const seen = new Set<string>()
  const entries: Array<IAuthenticatorEntry> = []

  for (const entry of document.entries) {
    if (entries.length >= MaximumAuthenticatorEntries) {
      break
    }
    const id = trimTo(entry.id, MaximumAuthenticatorFieldLength)
    if (id.length === 0 || seen.has(id)) {
      continue
    }
    seen.add(id)
    entries.push({
      id,
      issuer: trimTo(entry.issuer, MaximumAuthenticatorFieldLength),
      account: trimTo(entry.account, MaximumAuthenticatorFieldLength),
      algorithm: parseTotpAlgorithm(entry.algorithm) ?? DefaultTotpAlgorithm,
      digits: clampTotpDigits(entry.digits),
      period: clampTotpPeriod(entry.period),
      group: trimTo(entry.group, MaximumAuthenticatorFieldLength),
      addedAt: trimTo(entry.addedAt, 64),
    })
  }

  const groups: Array<string> = []
  for (const group of document.groups) {
    const trimmed = trimTo(group, MaximumAuthenticatorFieldLength)
    if (trimmed.length > 0 && !groups.includes(trimmed)) {
      groups.push(trimmed)
    }
  }
  for (const entry of entries) {
    if (entry.group.length > 0 && !groups.includes(entry.group)) {
      groups.push(entry.group)
    }
  }

  return { version: 1, entries, groups }
}

/** The TOTP parameters of an entry. */
export function entryParameters(entry: IAuthenticatorEntry): ITotpParameters {
  return {
    algorithm: entry.algorithm,
    digits: entry.digits,
    period: entry.period,
  }
}

/**
 * The entry's display name: "Issuer (account)", or just the account when there
 * is no issuer. Never invents an issuer, because "Unknown" filed beside a real
 * one reads as a provider called Unknown.
 */
export function entryTitle(entry: IAuthenticatorEntry): string {
  return entry.issuer.length === 0
    ? entry.account
    : `${entry.issuer} (${entry.account})`
}

/** The parameter line a row shows: "SHA1 · 6 digits · 30s". */
export function entryParameterSummary(entry: IAuthenticatorEntry): string {
  return `${entry.algorithm} · ${entry.digits} · ${entry.period}s`
}

/** Every string a search over this entry should look at. */
export function entryHaystack(
  entry: IAuthenticatorEntry
): ReadonlyArray<string> {
  return [
    entry.issuer,
    entry.account,
    entry.group,
    entry.algorithm,
    String(entry.digits),
    String(entry.period),
  ]
}

/** A stable id derived from the clock and a random suffix. */
export function createEntryId(now: number, randomSuffix: string): string {
  return `totp-${now.toString(36)}-${randomSuffix}`
}

/** Add an entry to the end of the list. */
export function addEntry(
  document: IAuthenticatorDocument,
  entry: IAuthenticatorEntry
): IAuthenticatorDocument {
  return normalizeAuthenticatorDocument({
    ...document,
    entries: [...document.entries, entry],
  })
}

/** Replace an entry's editable fields, leaving its id and vault key alone. */
export function updateEntry(
  document: IAuthenticatorDocument,
  id: string,
  changes: Partial<Omit<IAuthenticatorEntry, 'id' | 'addedAt'>>
): IAuthenticatorDocument {
  return normalizeAuthenticatorDocument({
    ...document,
    entries: document.entries.map(entry =>
      entry.id === id ? { ...entry, ...changes } : entry
    ),
  })
}

/** Remove entries by id. The caller is responsible for the vault deletion. */
export function removeEntries(
  document: IAuthenticatorDocument,
  ids: ReadonlyArray<string>
): IAuthenticatorDocument {
  const removing = new Set(ids)
  return normalizeAuthenticatorDocument({
    ...document,
    entries: document.entries.filter(entry => !removing.has(entry.id)),
  })
}

/**
 * Move one entry to a new index in the flat list.
 *
 * Reordering is a flat-list operation on purpose: grouping is a label, not a
 * container, so an entry dragged past a group header simply lands next to
 * whatever is there and keeps its own group until it is told otherwise.
 */
export function moveEntry(
  document: IAuthenticatorDocument,
  id: string,
  toIndex: number
): IAuthenticatorDocument {
  const from = document.entries.findIndex(entry => entry.id === id)
  if (from === -1) {
    return document
  }
  const entries = [...document.entries]
  const [moved] = entries.splice(from, 1)
  const bounded = Math.max(0, Math.min(toIndex, entries.length))
  entries.splice(bounded, 0, moved)
  return normalizeAuthenticatorDocument({ ...document, entries })
}

/** File entries under a group, creating the group when it is new. */
export function assignGroup(
  document: IAuthenticatorDocument,
  ids: ReadonlyArray<string>,
  group: string
): IAuthenticatorDocument {
  const assigning = new Set(ids)
  const trimmed = group.trim().slice(0, MaximumAuthenticatorFieldLength)
  return normalizeAuthenticatorDocument({
    ...document,
    groups:
      trimmed.length === 0 ? document.groups : [...document.groups, trimmed],
    entries: document.entries.map(entry =>
      assigning.has(entry.id) ? { ...entry, group: trimmed } : entry
    ),
  })
}

/** Rename a group, carrying every entry filed under it. */
export function renameGroup(
  document: IAuthenticatorDocument,
  from: string,
  to: string
): IAuthenticatorDocument {
  const target = to.trim().slice(0, MaximumAuthenticatorFieldLength)
  if (target.length === 0) {
    return document
  }
  return normalizeAuthenticatorDocument({
    ...document,
    groups: document.groups.map(group => (group === from ? target : group)),
    entries: document.entries.map(entry =>
      entry.group === from ? { ...entry, group: target } : entry
    ),
  })
}

/** Remove a group. Its entries survive, ungrouped. */
export function removeGroup(
  document: IAuthenticatorDocument,
  group: string
): IAuthenticatorDocument {
  return normalizeAuthenticatorDocument({
    ...document,
    groups: document.groups.filter(entry => entry !== group),
    entries: document.entries.map(entry =>
      entry.group === group ? { ...entry, group: '' } : entry
    ),
  })
}

/** Build a fresh entry from a registration's parameters. */
export function createEntry(
  id: string,
  issuer: string,
  account: string,
  parameters: Partial<ITotpParameters>,
  addedAt: string,
  group = ''
): IAuthenticatorEntry {
  return {
    id,
    issuer: issuer.trim().slice(0, MaximumAuthenticatorFieldLength),
    account: account.trim().slice(0, MaximumAuthenticatorFieldLength),
    algorithm: parameters.algorithm ?? DefaultTotpAlgorithm,
    digits: clampTotpDigits(parameters.digits ?? DefaultTotpDigits),
    period: clampTotpPeriod(parameters.period ?? DefaultTotpPeriod),
    group: group.trim().slice(0, MaximumAuthenticatorFieldLength),
    addedAt,
  }
}
