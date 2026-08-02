/**
 * Provider-, transport-, and UI-independent potential-conflict evaluation.
 *
 * Trusted adapters are responsible for observing repository state and proving
 * action availability. This module compares only typed file-change facts; it
 * never parses commands, Git output, patch bodies, or provider responses.
 */

import { types as utilTypes } from 'util'

export const ConflictForecastMaximumIdentityLength = 256
export const ConflictForecastMaximumDisplayNameLength = 256
export const ConflictForecastMaximumBranchNameLength = 512
export const ConflictForecastMaximumPathLength = 1_024
export const ConflictForecastMaximumPathSegmentLength = 255
export const ConflictForecastMaximumPathDepth = 64
export const ConflictForecastMaximumChangedFiles = 2_048
export const ConflictForecastMaximumReportedOverlaps = 256
export const ConflictForecastMaximumIgnoredScopes = 1_024
export const ConflictWarningScopeKeyMaximumLength = 2_048

const ConflictWarningScopeKeyVersion = 1
const fullObjectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const textControlOrBidi =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b\u200e\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff]/
const forbiddenBranchCharacters = /[ ~^:?*[\]\\]/
const forbiddenWindowsPathCharacters = /[<>:"|?*]/
const lowercaseLetter = /\p{Ll}/u

/**
 * Simple one-code-unit uppercase mappings present in Unicode/ICU but absent
 * from the Windows ordinal table used by CompareStringOrdinal on supported
 * Windows builds. Keep these code points distinct instead of manufacturing a
 * path collision that NTFS does not observe.
 */
const windowsOrdinalUnmappedRanges: ReadonlyArray<readonly [number, number]> = [
  [0x019b, 0x019b],
  [0x023f, 0x0240],
  [0x0252, 0x0252],
  [0x025c, 0x025c],
  [0x0261, 0x0261],
  [0x0264, 0x0266],
  [0x026a, 0x026a],
  [0x026c, 0x026c],
  [0x0282, 0x0282],
  [0x0287, 0x0287],
  [0x029d, 0x029e],
  [0x03f3, 0x03f3],
  [0x0525, 0x0525],
  [0x0527, 0x0527],
  [0x0529, 0x0529],
  [0x052b, 0x052b],
  [0x052d, 0x052d],
  [0x052f, 0x052f],
  [0x10d0, 0x10fa],
  [0x10fd, 0x10ff],
  [0x13f8, 0x13fd],
  [0x1c8a, 0x1c8a],
  [0x1d8e, 0x1d8e],
  [0x2c5f, 0x2c5f],
  [0x2cec, 0x2cec],
  [0x2cee, 0x2cee],
  [0x2cf3, 0x2cf3],
  [0x2d27, 0x2d27],
  [0x2d2d, 0x2d2d],
  [0xa661, 0xa661],
  [0xa699, 0xa699],
  [0xa69b, 0xa69b],
  [0xa791, 0xa791],
  [0xa793, 0xa794],
  [0xa797, 0xa797],
  [0xa799, 0xa799],
  [0xa79b, 0xa79b],
  [0xa79d, 0xa79d],
  [0xa79f, 0xa79f],
  [0xa7a1, 0xa7a1],
  [0xa7a3, 0xa7a3],
  [0xa7a5, 0xa7a5],
  [0xa7a7, 0xa7a7],
  [0xa7a9, 0xa7a9],
  [0xa7b5, 0xa7b5],
  [0xa7b7, 0xa7b7],
  [0xa7b9, 0xa7b9],
  [0xa7bb, 0xa7bb],
  [0xa7bd, 0xa7bd],
  [0xa7bf, 0xa7bf],
  [0xa7c1, 0xa7c1],
  [0xa7c3, 0xa7c3],
  [0xa7c8, 0xa7c8],
  [0xa7ca, 0xa7ca],
  [0xa7cd, 0xa7cd],
  [0xa7cf, 0xa7cf],
  [0xa7d1, 0xa7d1],
  [0xa7d3, 0xa7d3],
  [0xa7d5, 0xa7d5],
  [0xa7d7, 0xa7d7],
  [0xa7d9, 0xa7d9],
  [0xa7db, 0xa7db],
  [0xa7f6, 0xa7f6],
  [0xab53, 0xab53],
  [0xab70, 0xabbf],
]

export type ConflictForecastChange =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'

export interface IConflictForecastOrdinaryChangedFile {
  readonly path: string
  readonly change: Exclude<ConflictForecastChange, 'renamed'>
}

export interface IConflictForecastRenamedFile {
  readonly path: string
  readonly change: 'renamed'
  readonly previousPath: string
}

export type IConflictForecastChangedFile =
  | IConflictForecastOrdinaryChangedFile
  | IConflictForecastRenamedFile

export type ConflictForecastInventoryUnavailableReason =
  | 'not-observed'
  | 'authorization-required'
  | 'offline'
  | 'stale'

export interface IConflictForecastInventoryValue {
  readonly availability: 'value'
  readonly value: ReadonlyArray<IConflictForecastChangedFile>
}

export interface IConflictForecastInventoryUnavailable {
  readonly availability: 'unavailable'
  readonly reason: ConflictForecastInventoryUnavailableReason
}

export type ConflictForecastInventory =
  | IConflictForecastInventoryValue
  | IConflictForecastInventoryUnavailable

export interface IConflictForecastChangeSet {
  readonly repositoryId: string
  readonly branchName: string
  readonly baseOid: string
  readonly changedFiles: ConflictForecastInventory
}

export interface IConflictForecastPeer {
  readonly peerId: string
  readonly displayName: string
}

export type ConflictForecastCapabilityUnavailableReason =
  | 'not-configured'
  | 'not-authorized'
  | 'no-remote'
  | 'offline'
  | 'unknown'

export interface IConflictForecastCapabilityAvailable {
  readonly availability: 'available'
}

export interface IConflictForecastCapabilityUnavailable {
  readonly availability: 'unavailable'
  readonly reason: ConflictForecastCapabilityUnavailableReason
}

export type ConflictForecastCapability =
  | IConflictForecastCapabilityAvailable
  | IConflictForecastCapabilityUnavailable

export interface IConflictForecastActionCapabilities {
  readonly ignoreBranch: ConflictForecastCapability
  readonly pushForFetch: ConflictForecastCapability
  readonly sendSelfHostedPatch: ConflictForecastCapability
}

export interface IConflictForecastInput {
  readonly local: IConflictForecastChangeSet
  readonly peer: IConflictForecastPeer
  readonly peerChanges: IConflictForecastChangeSet
  readonly actions: IConflictForecastActionCapabilities
}

declare const conflictWarningScopeKeyBrand: unique symbol

/** A repository-and-local-branch scoped ignore identity. */
export type ConflictWarningScopeKey = string & {
  readonly [conflictWarningScopeKeyBrand]: true
}

export type ConflictForecastOverlapRisk =
  | 'same-path-changed'
  | 'both-added'
  | 'delete-vs-change'
  | 'file-directory-collision'
  | 'rename-vs-change'
  | 'divergent-rename'

export interface IConflictForecastOverlap {
  readonly path: string
  readonly peerPath: string
  readonly localChange: ConflictForecastChange
  readonly peerChange: ConflictForecastChange
  readonly risk: ConflictForecastOverlapRisk
}

export type ConflictForecastIgnoreAction = (
  | IConflictForecastCapabilityAvailable
  | IConflictForecastCapabilityUnavailable
) & {
  readonly scopeKey: ConflictWarningScopeKey
}

export interface IConflictForecastActions {
  readonly pushForFetch: ConflictForecastCapability
  readonly sendSelfHostedPatch: ConflictForecastCapability
  readonly ignoreBranch: ConflictForecastIgnoreAction
}

export interface IConflictForecastPotentialConflict {
  readonly kind: 'potential-conflict'
  readonly scopeKey: ConflictWarningScopeKey
  readonly repositoryId: string
  readonly localBranchName: string
  readonly peerBranchName: string
  readonly peerId: string
  readonly peerDisplayName: string
  readonly overlappingFileCount: number
  readonly overlappingFiles: ReadonlyArray<IConflictForecastOverlap>
  readonly overlappingFilesTruncated: boolean
  readonly actions: IConflictForecastActions
}

export type ConflictForecastClearReason =
  | 'no-local-changes'
  | 'no-peer-changes'
  | 'no-overlapping-files'

export interface IConflictForecastClear {
  readonly kind: 'clear'
  readonly scopeKey: ConflictWarningScopeKey
  readonly reason: ConflictForecastClearReason
}

export type ConflictForecastUnavailableReason =
  | 'repository-mismatch'
  | 'comparison-base-mismatch'
  | 'local-inventory-unavailable'
  | 'peer-inventory-unavailable'

export interface IConflictForecastUnavailable {
  readonly kind: 'unavailable'
  readonly scopeKey: ConflictWarningScopeKey
  readonly reason: ConflictForecastUnavailableReason
}

export interface IConflictForecastIgnored {
  readonly kind: 'ignored'
  readonly scopeKey: ConflictWarningScopeKey
}

export type ConflictForecastEvaluation =
  | IConflictForecastPotentialConflict
  | IConflictForecastClear
  | IConflictForecastUnavailable
  | IConflictForecastIgnored

export type ConflictForecastValidationErrorCode =
  | 'invalid-input'
  | 'invalid-ignore-list'

/** Fixed, non-secret validation failures for untrusted adapter boundaries. */
export class ConflictForecastValidationError extends Error {
  public constructor(
    public readonly code: ConflictForecastValidationErrorCode
  ) {
    super(
      code === 'invalid-input'
        ? 'Conflict forecast input is invalid.'
        : 'Conflict forecast ignore list is invalid.'
    )
    this.name = 'ConflictForecastValidationError'
  }
}

type ExactDataRecord = Readonly<Record<string, unknown>>

function exactDataRecord(
  value: unknown,
  expectedKeys: ReadonlyArray<string>
): ExactDataRecord | null {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      utilTypes.isProxy(value) ||
      Array.isArray(value)
    ) {
      return null
    }
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== expectedKeys.length ||
      keys.some(key => typeof key !== 'string')
    ) {
      return null
    }
    const names = keys as string[]
    names.sort()
    const expected = [...expectedKeys].sort()
    if (!expected.every((key, index) => names[index] === key)) {
      return null
    }

    const copy: Record<string, unknown> = {}
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        return null
      }
      copy[key] = descriptor.value
    }
    return copy
  } catch {
    return null
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) {
        return true
      }
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function isCanonicalText(
  value: unknown,
  maximumLength: number
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value === value.trim() &&
    value.normalize('NFC') === value &&
    !textControlOrBidi.test(value) &&
    !hasUnpairedSurrogate(value)
  )
}

function isRepositoryPathText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= ConflictForecastMaximumPathLength &&
    !textControlOrBidi.test(value) &&
    !hasUnpairedSurrogate(value)
  )
}

function isIdentity(value: unknown): value is string {
  return isCanonicalText(value, ConflictForecastMaximumIdentityLength)
}

function isBranchName(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ConflictForecastMaximumBranchNameLength ||
    textControlOrBidi.test(value) ||
    hasUnpairedSurrogate(value) ||
    forbiddenBranchCharacters.test(value) ||
    value === '.' ||
    value === '@' ||
    value === 'HEAD' ||
    value.startsWith('-') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.startsWith('.') ||
    value.endsWith('.') ||
    value.includes('//') ||
    value.includes('..') ||
    value.includes('@{')
  ) {
    return false
  }

  return !value
    .split('/')
    .some(
      segment =>
        segment.startsWith('.') ||
        segment.endsWith('.') ||
        segment.toLowerCase().endsWith('.lock') ||
        isWindowsDeviceName(segment)
    )
}

function isObjectId(value: unknown): value is string {
  return (
    typeof value === 'string' && fullObjectId.test(value) && !/^0+$/.test(value)
  )
}

function isWindowsDeviceName(segment: string): boolean {
  const stem = segment.split('.')[0].toUpperCase()
  return (
    stem === 'CON' ||
    stem === 'PRN' ||
    stem === 'AUX' ||
    stem === 'NUL' ||
    /^(?:COM|LPT)(?:[1-9]|[¹²³])$/.test(stem)
  )
}

/**
 * Build the one-code-unit case key used by Windows ordinal path comparison.
 * JavaScript's full uppercase expansions would incorrectly alias valid NTFS
 * names such as `ß` and `ss`. Windows leaves supplementary-plane, titlecase,
 * non-round-trip, and newer Unicode mappings distinct. It does map lowercase
 * Roman numerals, circled Latin letters, and the simple uppercase forms for
 * Greek letters with a prosgegrammeni.
 */
function isWindowsOrdinalUnmappedCodePoint(codePoint: number): boolean {
  let low = 0
  let high = windowsOrdinalUnmappedRanges.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const [start, end] = windowsOrdinalUnmappedRanges[middle]
    if (codePoint < start) {
      high = middle - 1
    } else if (codePoint > end) {
      low = middle + 1
    } else {
      return true
    }
  }

  return false
}

function windowsOrdinalUppercase(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0
  if (codePoint > 0xffff || isWindowsOrdinalUnmappedCodePoint(codePoint)) {
    return character
  }
  if (codePoint >= 0x2170 && codePoint <= 0x217f) {
    return String.fromCodePoint(codePoint - 0x10)
  }
  if (codePoint >= 0x24d0 && codePoint <= 0x24e9) {
    return String.fromCodePoint(codePoint - 0x1a)
  }
  if (
    (codePoint >= 0x1f80 && codePoint <= 0x1f87) ||
    (codePoint >= 0x1f90 && codePoint <= 0x1f97) ||
    (codePoint >= 0x1fa0 && codePoint <= 0x1fa7)
  ) {
    return String.fromCodePoint(codePoint + 8)
  }
  if (codePoint === 0x1fb3) {
    return '\u1fbc'
  }
  if (codePoint === 0x1fc3) {
    return '\u1fcc'
  }
  if (codePoint === 0x1ff3) {
    return '\u1ffc'
  }

  const upper = character.toUpperCase()
  const lower = character.toLowerCase()
  return lowercaseLetter.test(character) &&
    [...upper].length === 1 &&
    upper.toLowerCase() === lower
    ? upper
    : character
}

function windowsPathKey(path: string): string {
  let result = ''
  for (const character of path) {
    result += windowsOrdinalUppercase(character)
  }
  return result
}

function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRepositoryRelativePath(value: unknown): value is string {
  if (
    !isRepositoryPathText(value) ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('\\') ||
    value.includes('//') ||
    forbiddenWindowsPathCharacters.test(value)
  ) {
    return false
  }

  const segments = value.split('/')
  return (
    segments.length <= ConflictForecastMaximumPathDepth &&
    segments.every(
      segment =>
        segment.length > 0 &&
        segment.length <= ConflictForecastMaximumPathSegmentLength &&
        segment !== '.' &&
        segment !== '..' &&
        segment.toLowerCase() !== '.git' &&
        !segment.startsWith(' ') &&
        !segment.endsWith('.') &&
        !segment.endsWith(' ') &&
        !isWindowsDeviceName(segment)
    )
  )
}

function isOrdinaryChange(
  value: unknown
): value is Exclude<ConflictForecastChange, 'renamed'> {
  return value === 'added' || value === 'modified' || value === 'deleted'
}

function copyChangedFile(value: unknown): IConflictForecastChangedFile | null {
  const record = exactDataRecord(value, ['change', 'path'])
  if (
    record !== null &&
    isRepositoryRelativePath(record.path) &&
    isOrdinaryChange(record.change)
  ) {
    return Object.freeze({ path: record.path, change: record.change })
  }

  const renamed = exactDataRecord(value, ['change', 'path', 'previousPath'])
  if (
    renamed === null ||
    renamed.change !== 'renamed' ||
    !isRepositoryRelativePath(renamed.path) ||
    !isRepositoryRelativePath(renamed.previousPath) ||
    renamed.path === renamed.previousPath
  ) {
    return null
  }

  return Object.freeze({
    path: renamed.path,
    change: 'renamed' as const,
    previousPath: renamed.previousPath,
  })
}

function copyPlainDenseArray(
  value: unknown,
  maximumLength: number
): ReadonlyArray<unknown> | null {
  try {
    if (utilTypes.isProxy(value) || !Array.isArray(value)) {
      return null
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (
      lengthDescriptor === undefined ||
      !('value' in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > maximumLength ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return null
    }
    const length = lengthDescriptor.value as number
    const keys = Reflect.ownKeys(value)
    if (keys.some(key => typeof key !== 'string')) {
      return null
    }
    const names = keys as string[]
    if (
      names.length !== length + 1 ||
      !names.includes('length') ||
      !Array.from({ length }, (_, index) => `${index}`).every(name =>
        names.includes(name)
      )
    ) {
      return null
    }
    const copy = new Array<unknown>()
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index)
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        return null
      }
      copy.push(descriptor.value)
    }
    return copy
  } catch {
    return null
  }
}

function copyChangedFiles(
  value: unknown
): ReadonlyArray<IConflictForecastChangedFile> | null {
  const candidates = copyPlainDenseArray(
    value,
    ConflictForecastMaximumChangedFiles
  )
  if (candidates === null) {
    return null
  }

  const seen = new Set<string>()
  const seenRenameSources = new Set<string>()
  const files = new Array<IConflictForecastChangedFile>()
  for (const candidate of candidates) {
    const file = copyChangedFile(candidate)
    if (file === null) {
      return null
    }
    const key = windowsPathKey(file.path)
    if (seen.has(key)) {
      return null
    }
    seen.add(key)
    if (file.change === 'renamed') {
      const sourceKey = windowsPathKey(file.previousPath)
      if (seenRenameSources.has(sourceKey)) {
        return null
      }
      seenRenameSources.add(sourceKey)
    }
    files.push(file)
  }

  files.sort((left, right) =>
    compareCanonicalText(windowsPathKey(left.path), windowsPathKey(right.path))
  )
  return Object.freeze(files)
}

function isInventoryUnavailableReason(
  value: unknown
): value is ConflictForecastInventoryUnavailableReason {
  return (
    value === 'not-observed' ||
    value === 'authorization-required' ||
    value === 'offline' ||
    value === 'stale'
  )
}

function copyInventory(value: unknown): ConflictForecastInventory | null {
  const availabilityRecord = exactDataRecord(value, ['availability', 'value'])
  if (
    availabilityRecord !== null &&
    availabilityRecord.availability === 'value'
  ) {
    const files = copyChangedFiles(availabilityRecord.value)
    return files === null
      ? null
      : Object.freeze({ availability: 'value' as const, value: files })
  }

  const unavailableRecord = exactDataRecord(value, ['availability', 'reason'])
  if (
    unavailableRecord !== null &&
    unavailableRecord.availability === 'unavailable' &&
    isInventoryUnavailableReason(unavailableRecord.reason)
  ) {
    return Object.freeze({
      availability: 'unavailable' as const,
      reason: unavailableRecord.reason,
    })
  }

  return null
}

function copyChangeSet(value: unknown): IConflictForecastChangeSet | null {
  const record = exactDataRecord(value, [
    'baseOid',
    'branchName',
    'changedFiles',
    'repositoryId',
  ])
  if (
    record === null ||
    !isIdentity(record.repositoryId) ||
    !isBranchName(record.branchName) ||
    !isObjectId(record.baseOid)
  ) {
    return null
  }

  const changedFiles = copyInventory(record.changedFiles)
  if (changedFiles === null) {
    return null
  }

  return Object.freeze({
    repositoryId: record.repositoryId,
    branchName: record.branchName,
    baseOid: record.baseOid,
    changedFiles,
  })
}

function copyPeer(value: unknown): IConflictForecastPeer | null {
  const record = exactDataRecord(value, ['displayName', 'peerId'])
  if (
    record === null ||
    !isIdentity(record.peerId) ||
    !isCanonicalText(
      record.displayName,
      ConflictForecastMaximumDisplayNameLength
    )
  ) {
    return null
  }

  return Object.freeze({
    peerId: record.peerId,
    displayName: record.displayName,
  })
}

function isCapabilityUnavailableReason(
  value: unknown
): value is ConflictForecastCapabilityUnavailableReason {
  return (
    value === 'not-configured' ||
    value === 'not-authorized' ||
    value === 'no-remote' ||
    value === 'offline' ||
    value === 'unknown'
  )
}

function copyCapability(value: unknown): ConflictForecastCapability | null {
  const available = exactDataRecord(value, ['availability'])
  if (available !== null && available.availability === 'available') {
    return Object.freeze({ availability: 'available' as const })
  }

  const unavailable = exactDataRecord(value, ['availability', 'reason'])
  if (
    unavailable !== null &&
    unavailable.availability === 'unavailable' &&
    isCapabilityUnavailableReason(unavailable.reason)
  ) {
    return Object.freeze({
      availability: 'unavailable' as const,
      reason: unavailable.reason,
    })
  }
  return null
}

function copyActionCapabilities(
  value: unknown
): IConflictForecastActionCapabilities | null {
  const record = exactDataRecord(value, [
    'ignoreBranch',
    'pushForFetch',
    'sendSelfHostedPatch',
  ])
  if (record === null) {
    return null
  }
  const ignoreBranch = copyCapability(record.ignoreBranch)
  const pushForFetch = copyCapability(record.pushForFetch)
  const sendSelfHostedPatch = copyCapability(record.sendSelfHostedPatch)
  return ignoreBranch === null ||
    pushForFetch === null ||
    sendSelfHostedPatch === null
    ? null
    : Object.freeze({
        ignoreBranch,
        pushForFetch,
        sendSelfHostedPatch,
      })
}

/** Strictly validate, copy, sort, and deeply freeze an adapter-produced input. */
export function createConflictForecastInput(
  value: unknown
): IConflictForecastInput {
  const record = exactDataRecord(value, [
    'actions',
    'local',
    'peer',
    'peerChanges',
  ])
  if (record !== null) {
    const local = copyChangeSet(record.local)
    const peer = copyPeer(record.peer)
    const peerChanges = copyChangeSet(record.peerChanges)
    const actions = copyActionCapabilities(record.actions)
    if (
      local !== null &&
      peer !== null &&
      peerChanges !== null &&
      actions !== null
    ) {
      return Object.freeze({ local, peer, peerChanges, actions })
    }
  }

  throw new ConflictForecastValidationError('invalid-input')
}

function encodeScopeKey(repositoryId: string, branchName: string): string {
  return JSON.stringify([
    'conflict-warning-scope',
    ConflictWarningScopeKeyVersion,
    repositoryId,
    branchName,
  ])
}

export function createConflictWarningScopeKey(
  repositoryId: string,
  branchName: string
): ConflictWarningScopeKey {
  if (!isIdentity(repositoryId) || !isBranchName(branchName)) {
    throw new ConflictForecastValidationError('invalid-input')
  }
  const key = encodeScopeKey(repositoryId, branchName)
  if (key.length > ConflictWarningScopeKeyMaximumLength) {
    throw new ConflictForecastValidationError('invalid-input')
  }
  return key as ConflictWarningScopeKey
}

export function isConflictWarningScopeKey(
  value: unknown
): value is ConflictWarningScopeKey {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ConflictWarningScopeKeyMaximumLength
  ) {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(value)
    return (
      Array.isArray(parsed) &&
      parsed.length === 4 &&
      parsed[0] === 'conflict-warning-scope' &&
      parsed[1] === ConflictWarningScopeKeyVersion &&
      isIdentity(parsed[2]) &&
      isBranchName(parsed[3]) &&
      encodeScopeKey(parsed[2], parsed[3]) === value
    )
  } catch {
    return false
  }
}

function copyIgnoredScopes(
  value: unknown
): ReadonlySet<ConflictWarningScopeKey> {
  const candidates = copyPlainDenseArray(
    value,
    ConflictForecastMaximumIgnoredScopes
  )
  if (candidates === null) {
    throw new ConflictForecastValidationError('invalid-ignore-list')
  }

  const result = new Set<ConflictWarningScopeKey>()
  for (const candidate of candidates) {
    if (!isConflictWarningScopeKey(candidate) || result.has(candidate)) {
      throw new ConflictForecastValidationError('invalid-ignore-list')
    }
    result.add(candidate)
  }
  return result
}

function overlapRisk(
  localChange: ConflictForecastChange,
  peerChange: ConflictForecastChange,
  exactPath: boolean
): ConflictForecastOverlapRisk {
  if (!exactPath) {
    return 'file-directory-collision'
  }
  if (localChange === 'added' && peerChange === 'added') {
    return 'both-added'
  }
  if (
    (localChange === 'deleted' && peerChange !== 'deleted') ||
    (peerChange === 'deleted' && localChange !== 'deleted')
  ) {
    return 'delete-vs-change'
  }
  return 'same-path-changed'
}

function lowerBound(
  sortedValues: ReadonlyArray<string>,
  target: string
): number {
  let low = 0
  let high = sortedValues.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (compareCanonicalText(sortedValues[middle], target) < 0) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

type ConflictForecastPathKeys = readonly [string] | readonly [string, string]

function changedFilePathKeys(
  file: IConflictForecastChangedFile
): ConflictForecastPathKeys {
  return file.change === 'renamed'
    ? [windowsPathKey(file.path), windowsPathKey(file.previousPath)]
    : [windowsPathKey(file.path)]
}

function indexPeerPaths(
  peerPathKeys: ReadonlyArray<ConflictForecastPathKeys>
): {
  readonly indicesByPath: ReadonlyMap<string, ReadonlyArray<number>>
  readonly sortedPaths: ReadonlyArray<string>
} {
  const mutable = new Map<string, number[]>()
  peerPathKeys.forEach((paths, index) => {
    for (const path of paths) {
      const indices = mutable.get(path)
      if (indices === undefined) {
        mutable.set(path, [index])
      } else if (indices[indices.length - 1] !== index) {
        indices.push(index)
      }
    }
  })
  return {
    indicesByPath: mutable,
    sortedPaths: [...mutable.keys()].sort(compareCanonicalText),
  }
}

function collectPathCandidates(
  path: string,
  indicesByPath: ReadonlyMap<string, ReadonlyArray<number>>,
  sortedPaths: ReadonlyArray<string>,
  result: Set<number>
): void {
  const add = (indices: ReadonlyArray<number> | undefined): void => {
    indices?.forEach(index => result.add(index))
  }

  add(indicesByPath.get(path))
  let ancestorPath = path
  while (ancestorPath.includes('/')) {
    ancestorPath = ancestorPath.slice(0, ancestorPath.lastIndexOf('/'))
    add(indicesByPath.get(ancestorPath))
  }

  const descendantPrefix = `${path}/`
  for (
    let index = lowerBound(sortedPaths, descendantPrefix);
    index < sortedPaths.length &&
    sortedPaths[index].startsWith(descendantPrefix);
    index++
  ) {
    add(indicesByPath.get(sortedPaths[index]))
  }
}

function pathKeyRelation(
  local: string,
  peer: string
): 'exact' | 'prefix' | null {
  if (local === peer) {
    return 'exact'
  }
  return local.startsWith(`${peer}/`) || peer.startsWith(`${local}/`)
    ? 'prefix'
    : null
}

function classifyFilePair(
  localFile: IConflictForecastChangedFile,
  peerFile: IConflictForecastChangedFile,
  localPaths: ConflictForecastPathKeys,
  peerPaths: ConflictForecastPathKeys,
  inferredDivergentRename: boolean
): ConflictForecastOverlapRisk | null {
  const currentRelation = pathKeyRelation(localPaths[0], peerPaths[0])
  if (currentRelation === 'exact') {
    if (localFile.change === 'deleted' && peerFile.change === 'deleted') {
      return inferredDivergentRename ? 'divergent-rename' : null
    }
    return overlapRisk(localFile.change, peerFile.change, true)
  }

  if (
    localFile.change === 'renamed' &&
    peerFile.change === 'renamed' &&
    pathKeyRelation(localPaths[1]!, peerPaths[1]!) === 'exact'
  ) {
    return 'divergent-rename'
  }

  const renameRelations = [
    localFile.change === 'renamed'
      ? pathKeyRelation(localPaths[1]!, peerPaths[0])
      : null,
    peerFile.change === 'renamed'
      ? pathKeyRelation(localPaths[0], peerPaths[1]!)
      : null,
    localFile.change === 'renamed' && peerFile.change === 'renamed'
      ? pathKeyRelation(localPaths[1]!, peerPaths[1]!)
      : null,
  ]
  if (renameRelations.includes('prefix')) {
    return 'file-directory-collision'
  }
  if (renameRelations.includes('exact')) {
    return 'rename-vs-change'
  }
  return currentRelation === 'prefix' ? 'file-directory-collision' : null
}

function clearResult(
  scopeKey: ConflictWarningScopeKey,
  reason: ConflictForecastClearReason
): IConflictForecastClear {
  return Object.freeze({ kind: 'clear', scopeKey, reason })
}

function unavailableResult(
  scopeKey: ConflictWarningScopeKey,
  reason: ConflictForecastUnavailableReason
): IConflictForecastUnavailable {
  return Object.freeze({ kind: 'unavailable', scopeKey, reason })
}

/**
 * Evaluate one local/peer observation pair. The returned warning means only
 * that both sides changed the same Windows-checkout path or created a
 * file/directory prefix collision; it never claims that Git has already
 * detected a merge conflict.
 */
export function evaluateConflictForecast(
  value: unknown,
  ignoredScopeKeys: unknown = []
): ConflictForecastEvaluation {
  const input = createConflictForecastInput(value)
  const ignored = copyIgnoredScopes(ignoredScopeKeys)
  const scopeKey = createConflictWarningScopeKey(
    input.local.repositoryId,
    input.local.branchName
  )

  if (input.local.repositoryId !== input.peerChanges.repositoryId) {
    return unavailableResult(scopeKey, 'repository-mismatch')
  }
  if (input.local.baseOid !== input.peerChanges.baseOid) {
    return unavailableResult(scopeKey, 'comparison-base-mismatch')
  }
  if (input.local.changedFiles.availability === 'unavailable') {
    return unavailableResult(scopeKey, 'local-inventory-unavailable')
  }
  if (input.peerChanges.changedFiles.availability === 'unavailable') {
    return unavailableResult(scopeKey, 'peer-inventory-unavailable')
  }
  if (ignored.has(scopeKey)) {
    return Object.freeze({ kind: 'ignored', scopeKey })
  }

  const localFiles = input.local.changedFiles.value
  const peerFiles = input.peerChanges.changedFiles.value
  if (localFiles.length === 0) {
    return clearResult(scopeKey, 'no-local-changes')
  }
  if (peerFiles.length === 0) {
    return clearResult(scopeKey, 'no-peer-changes')
  }

  const localPathKeys = localFiles.map(changedFilePathKeys)
  const peerPathKeys = peerFiles.map(changedFilePathKeys)
  const peerIndex = indexPeerPaths(peerPathKeys)
  const localAdded = localFiles.filter(file => file.change === 'added')
  const peerAdded = peerFiles.filter(file => file.change === 'added')
  const localDeleted = localFiles.filter(file => file.change === 'deleted')
  const peerDeleted = peerFiles.filter(file => file.change === 'deleted')
  const inferSingleDivergentReplacement =
    localAdded.length === 1 &&
    peerAdded.length === 1 &&
    localDeleted.length === 1 &&
    peerDeleted.length === 1 &&
    pathKeyRelation(
      windowsPathKey(localDeleted[0].path),
      windowsPathKey(peerDeleted[0].path)
    ) === 'exact' &&
    pathKeyRelation(
      windowsPathKey(localAdded[0].path),
      windowsPathKey(peerAdded[0].path)
    ) !== 'exact'

  let overlappingFileCount = 0
  const overlaps = new Array<IConflictForecastOverlap>()
  for (
    let localFileIndex = 0;
    localFileIndex < localFiles.length;
    localFileIndex++
  ) {
    const localFile = localFiles[localFileIndex]
    const candidateIndices = new Set<number>()
    for (const path of localPathKeys[localFileIndex]) {
      collectPathCandidates(
        path,
        peerIndex.indicesByPath,
        peerIndex.sortedPaths,
        candidateIndices
      )
    }
    for (const peerFileIndex of [...candidateIndices].sort(
      (left, right) => left - right
    )) {
      const peerFile = peerFiles[peerFileIndex]
      const risk = classifyFilePair(
        localFile,
        peerFile,
        localPathKeys[localFileIndex],
        peerPathKeys[peerFileIndex],
        inferSingleDivergentReplacement &&
          localFile === localDeleted[0] &&
          peerFile === peerDeleted[0]
      )
      if (risk === null) {
        continue
      }
      overlappingFileCount++
      if (overlaps.length < ConflictForecastMaximumReportedOverlaps) {
        overlaps.push(
          Object.freeze({
            path: localFile.path,
            peerPath: peerFile.path,
            localChange: localFile.change,
            peerChange: peerFile.change,
            risk,
          })
        )
      }
    }
  }
  if (overlappingFileCount === 0) {
    return clearResult(scopeKey, 'no-overlapping-files')
  }

  const overlappingFiles = Object.freeze(overlaps)
  const actions = Object.freeze({
    pushForFetch: input.actions.pushForFetch,
    sendSelfHostedPatch: input.actions.sendSelfHostedPatch,
    ignoreBranch: Object.freeze({
      ...input.actions.ignoreBranch,
      scopeKey,
    }),
  })

  return Object.freeze({
    kind: 'potential-conflict',
    scopeKey,
    repositoryId: input.local.repositoryId,
    localBranchName: input.local.branchName,
    peerBranchName: input.peerChanges.branchName,
    peerId: input.peer.peerId,
    peerDisplayName: input.peer.displayName,
    overlappingFileCount,
    overlappingFiles,
    overlappingFilesTruncated: overlappingFileCount > overlappingFiles.length,
    actions,
  })
}
