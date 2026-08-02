/**
 * Pure immutable evidence and result contracts for reviewed change summaries.
 *
 * The authorization fields below are opaque correlation identities. This
 * module neither grants authority nor interprets security policy; an
 * integration must obtain them only after its separate R14 policy gate has
 * allowed the request.
 */

export const ChangeSummaryModelVersion = 1 as const
export const MaximumChangeSummaryCommits = 50
export const MaximumChangeSummaryFilesPerCommit = 500
export const MaximumChangeSummaryFileFacts = 5_000
export const MaximumChangeSummaryPathBytes = 4_096
export const MaximumChangeSummaryPathSegmentBytes = 255
export const MaximumChangeSummaryPathDepth = 128
export const MaximumChangeSummaryAuthorBytes = 512
export const MaximumChangeSummarySubjectBytes = 2_048
export const MaximumChangeSummaryLineCount = 2_147_483_647
export const MaximumChangeSummaryTextBytes = 4_096
export const MaximumChangeSummaryChangeTextBytes = 2_048
export const MaximumChangeSummaryUnavailableExplanationBytes = 1_024

export interface IChangeSummaryAuthorizationIdentity {
  readonly version: typeof ChangeSummaryModelVersion
  /** Exact `r14-authorization-v1:` plus a nonzero lowercase 64-hex identity. */
  readonly authorizationId: string
  /** Exact `r14-evidence-v1:` plus a nonzero lowercase 64-hex identity. */
  readonly evidenceId: string
}

export interface IChangeSummaryValueFact<T> {
  readonly availability: 'value'
  readonly value: T
}

export interface IChangeSummaryUnavailableFact {
  readonly availability: 'unavailable'
}

export interface IChangeSummaryNotApplicableFact {
  readonly availability: 'not-applicable'
}

export type ChangeSummaryMetadataFact<T> =
  | IChangeSummaryValueFact<T>
  | IChangeSummaryUnavailableFact

export type ChangeSummaryLineFact =
  | IChangeSummaryValueFact<number>
  | IChangeSummaryUnavailableFact
  | IChangeSummaryNotApplicableFact

export interface IChangeSummaryReviewedFile {
  /** Canonical, Windows-safe, repository-relative display identity. */
  readonly path: string
  readonly addedLines: ChangeSummaryLineFact
  readonly deletedLines: ChangeSummaryLineFact
}

export interface IChangeSummaryReviewedCommit {
  /** Full, lowercase SHA-1 or SHA-256 object identity. */
  readonly commitId: string
  readonly author: ChangeSummaryMetadataFact<string>
  /** A canonical UTC ISO-8601 instant when available. */
  readonly authoredAt: ChangeSummaryMetadataFact<string>
  readonly subject: ChangeSummaryMetadataFact<string>
  readonly files: ReadonlyArray<IChangeSummaryReviewedFile>
}

/** Derived facts. Known line sums deliberately do not claim to be totals. */
export interface IChangeSummaryReviewFacts {
  readonly commitCount: number
  readonly fileChangeCount: number
  readonly changedPathCount: number
  readonly authorUnavailableCount: number
  readonly authoredAtUnavailableCount: number
  readonly subjectUnavailableCount: number
  readonly knownAddedLines: number
  readonly knownDeletedLines: number
  readonly addedLinesValueCount: number
  readonly addedLinesUnavailableCount: number
  readonly addedLinesNotApplicableCount: number
  readonly deletedLinesValueCount: number
  readonly deletedLinesUnavailableCount: number
  readonly deletedLinesNotApplicableCount: number
}

export interface IChangeSummaryReview {
  readonly version: typeof ChangeSummaryModelVersion
  readonly authorization: IChangeSummaryAuthorizationIdentity
  readonly objectIdWidth: 40 | 64
  /** Exact reviewed selection order. */
  readonly commits: ReadonlyArray<IChangeSummaryReviewedCommit>
  readonly reviewedCommitIds: ReadonlyArray<string>
  /** Unique exact paths in first-reviewed-occurrence order. */
  readonly reviewedPaths: ReadonlyArray<string>
  readonly facts: IChangeSummaryReviewFacts
}

export interface IChangeSummaryDescribedChange {
  readonly path: string
  readonly availability: 'value'
  readonly description: string
}

export interface IChangeSummaryUnavailableChange {
  readonly path: string
  readonly availability: 'unavailable'
  readonly explanation: string
}

export type ChangeSummaryResultChange =
  | IChangeSummaryDescribedChange
  | IChangeSummaryUnavailableChange

export interface IChangeSummaryResultFacts {
  readonly changeCount: number
  readonly describedChangeCount: number
  readonly unavailableChangeCount: number
}

export interface IChangeSummaryResult {
  readonly version: typeof ChangeSummaryModelVersion
  readonly authorization: IChangeSummaryAuthorizationIdentity
  readonly reviewedCommitIds: ReadonlyArray<string>
  readonly reviewedPaths: ReadonlyArray<string>
  readonly summary: string
  /** Canonicalized to the review's first-occurrence path order. */
  readonly changes: ReadonlyArray<ChangeSummaryResultChange>
  readonly facts: IChangeSummaryResultFacts
}

export type ChangeSummaryModelErrorCode =
  | 'invalid-shape'
  | 'invalid-authorization'
  | 'authorization-mismatch'
  | 'invalid-commit-id'
  | 'duplicate-commit-id'
  | 'mixed-commit-id-width'
  | 'too-many-commits'
  | 'invalid-metadata'
  | 'invalid-date'
  | 'invalid-path'
  | 'duplicate-path'
  | 'too-many-files'
  | 'invalid-line-fact'
  | 'invalid-review'
  | 'invalid-result-text'
  | 'unknown-result-path'
  | 'duplicate-result-path'
  | 'incomplete-result'

export class ChangeSummaryModelError extends Error {
  public constructor(
    public readonly code: ChangeSummaryModelErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ChangeSummaryModelError'
  }
}

type ExactDataRecord = Readonly<Record<string, unknown>>
type DescriptorRecord = Record<PropertyKey, PropertyDescriptor | undefined>

interface IDataRecordSnapshot {
  readonly keys: ReadonlyArray<string>
  readonly values: ExactDataRecord
}

type DenseArraySnapshot =
  | { readonly kind: 'valid'; readonly values: ReadonlyArray<unknown> }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'invalid' }

interface IReviewAccumulator {
  fileChangeCount: number
  authorUnavailableCount: number
  authoredAtUnavailableCount: number
  subjectUnavailableCount: number
  knownAddedLines: number
  knownDeletedLines: number
  addedLinesValueCount: number
  addedLinesUnavailableCount: number
  addedLinesNotApplicableCount: number
  deletedLinesValueCount: number
  deletedLinesUnavailableCount: number
  deletedLinesNotApplicableCount: number
}

const TextBytes = new TextEncoder()
const CommitIdPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const AuthorizationIdPattern = /^r14-authorization-v1:([a-f0-9]{64})$/
const EvidenceIdPattern = /^r14-evidence-v1:([a-f0-9]{64})$/
const CanonicalISOInstantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const UnsafeTextPattern =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u206f\ufeff]/u
const ForbiddenWindowsPathCharacters = /[<>:"|?*\\]/u
const UnsafePlainLanguageMarkupPattern =
  /[<>`\[\]{}*_~\\]|(?:^|\s)(?:#{1,6}|>|[-+])(?:\s|$)|(?:^|\s)\d+[.)](?:\s|$)|(?:^|\s)-{3,}(?:\s|$)|&(?:#\d+|#x[a-f0-9]+|[a-z][a-z0-9]+);/iu
const SecretAssignmentPattern =
  /\b(?:api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token|credential|password|private[-_ ]?key|secret)\b\s*(?:[:=]|is\b)|\bbearer\s+[a-z0-9._~+\/-]{8,}|\b(?:github_pat_|gh[pousr]_|sk-)[a-z0-9_-]{12,}/iu

const AuthorizationKeys = Object.freeze([
  'version',
  'authorizationId',
  'evidenceId',
] as const)
const ReviewInputKeys = Object.freeze(['authorization', 'commits'] as const)
const CommitKeys = Object.freeze([
  'commitId',
  'author',
  'authoredAt',
  'subject',
  'files',
] as const)
const FileKeys = Object.freeze(['path', 'addedLines', 'deletedLines'] as const)
const UnavailableFactKeys = Object.freeze(['availability'] as const)
const ValueFactKeys = Object.freeze(['availability', 'value'] as const)
const ReviewKeys = Object.freeze([
  'version',
  'authorization',
  'objectIdWidth',
  'commits',
  'reviewedCommitIds',
  'reviewedPaths',
  'facts',
] as const)
const ReviewFactKeys = Object.freeze([
  'commitCount',
  'fileChangeCount',
  'changedPathCount',
  'authorUnavailableCount',
  'authoredAtUnavailableCount',
  'subjectUnavailableCount',
  'knownAddedLines',
  'knownDeletedLines',
  'addedLinesValueCount',
  'addedLinesUnavailableCount',
  'addedLinesNotApplicableCount',
  'deletedLinesValueCount',
  'deletedLinesUnavailableCount',
  'deletedLinesNotApplicableCount',
] as const)
const CandidateKeys = Object.freeze([
  'authorization',
  'summary',
  'changes',
] as const)
const DescribedChangeKeys = Object.freeze([
  'path',
  'availability',
  'description',
] as const)
const UnavailableChangeKeys = Object.freeze([
  'path',
  'availability',
  'explanation',
] as const)

function fail(code: ChangeSummaryModelErrorCode, message: string): never {
  throw new ChangeSummaryModelError(code, message)
}

function snapshotDataRecord(value: unknown): IDataRecordSnapshot | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return null
    }

    const descriptors = Object.getOwnPropertyDescriptors(
      value
    ) as unknown as DescriptorRecord
    const ownKeys = Reflect.ownKeys(descriptors)
    if (ownKeys.some(key => typeof key !== 'string')) {
      return null
    }

    const keys = ownKeys as ReadonlyArray<string>
    const copy: Record<string, unknown> = Object.create(null)
    for (const key of keys) {
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null
      }
      copy[key] = descriptor.value
    }

    return Object.freeze({
      keys: Object.freeze([...keys]),
      values: Object.freeze(copy),
    })
  } catch {
    return null
  }
}

function hasExactKeys(
  snapshot: IDataRecordSnapshot,
  expectedKeys: ReadonlyArray<string>
): boolean {
  return (
    snapshot.keys.length === expectedKeys.length &&
    snapshot.keys.every(key => expectedKeys.includes(key))
  )
}

function readExactRecord(
  value: unknown,
  expectedKeys: ReadonlyArray<string>,
  code: ChangeSummaryModelErrorCode = 'invalid-shape'
): ExactDataRecord {
  const snapshot = snapshotDataRecord(value)
  if (snapshot === null || !hasExactKeys(snapshot, expectedKeys)) {
    fail(code, 'The change-summary value has an invalid object shape.')
  }
  return snapshot.values
}

function snapshotDenseArray(
  value: unknown,
  maximumLength: number
): DenseArraySnapshot {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return { kind: 'invalid' }
    }

    const boundedLengthDescriptor = Object.getOwnPropertyDescriptor(
      value,
      'length'
    )
    if (
      boundedLengthDescriptor === undefined ||
      boundedLengthDescriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(boundedLengthDescriptor, 'value') ||
      !Number.isSafeInteger(boundedLengthDescriptor.value) ||
      (boundedLengthDescriptor.value as number) < 0
    ) {
      return { kind: 'invalid' }
    }
    const boundedLength = boundedLengthDescriptor.value as number
    if (boundedLength > maximumLength) {
      return { kind: 'too-large' }
    }

    const descriptors = Object.getOwnPropertyDescriptors(
      value
    ) as unknown as DescriptorRecord
    const ownKeys = Reflect.ownKeys(descriptors)
    const lengthDescriptor = descriptors.length
    if (
      lengthDescriptor === undefined ||
      lengthDescriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      (lengthDescriptor.value as number) < 0 ||
      lengthDescriptor.value !== boundedLength
    ) {
      return { kind: 'invalid' }
    }

    const length = lengthDescriptor.value as number
    if (
      ownKeys.length !== length + 1 ||
      ownKeys.some(key => typeof key !== 'string') ||
      !ownKeys.includes('length')
    ) {
      return { kind: 'invalid' }
    }

    const copy = new Array<unknown>()
    for (let index = 0; index < length; index++) {
      const key = String(index)
      if (!ownKeys.includes(key)) {
        return { kind: 'invalid' }
      }
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return { kind: 'invalid' }
      }
      copy.push(descriptor.value)
    }
    return { kind: 'valid', values: Object.freeze(copy) }
  } catch {
    return { kind: 'invalid' }
  }
}

function readDenseArray(
  value: unknown,
  maximumLength: number,
  allowEmpty: boolean,
  tooLargeCode: 'too-many-commits' | 'too-many-files'
): ReadonlyArray<unknown> {
  const snapshot = snapshotDenseArray(value, maximumLength)
  if (snapshot.kind === 'too-large') {
    fail(tooLargeCode, 'The change-summary collection exceeds its bound.')
  }
  if (
    snapshot.kind === 'invalid' ||
    (!allowEmpty && snapshot.values.length < 1)
  ) {
    fail('invalid-shape', 'Change-summary collections must be dense arrays.')
  }
  return snapshot.values
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) {
        return true
      }
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function canonicalizeDisplayText(
  value: unknown,
  maximumBytes: number,
  allowEmpty: boolean,
  code: 'invalid-metadata' | 'invalid-result-text'
): string {
  if (
    typeof value !== 'string' ||
    value.length > maximumBytes ||
    hasUnpairedSurrogate(value) ||
    UnsafeTextPattern.test(value) ||
    TextBytes.encode(value).byteLength > maximumBytes
  ) {
    fail(code, 'Change-summary display text is invalid or oversized.')
  }

  const canonical = value.normalize('NFC').replace(/\s+/gu, ' ').trim()
  if (
    (!allowEmpty && canonical.length === 0) ||
    canonical.length > maximumBytes ||
    hasUnpairedSurrogate(canonical) ||
    UnsafeTextPattern.test(canonical) ||
    TextBytes.encode(canonical).byteLength > maximumBytes
  ) {
    fail(code, 'Change-summary display text is invalid or oversized.')
  }
  return canonical
}

function canonicalizePlainLanguage(
  value: unknown,
  maximumBytes: number
): string {
  const canonical = canonicalizeDisplayText(
    value,
    maximumBytes,
    false,
    'invalid-result-text'
  )
  if (
    UnsafePlainLanguageMarkupPattern.test(canonical) ||
    SecretAssignmentPattern.test(canonical)
  ) {
    fail(
      'invalid-result-text',
      'Change-summary result text must be bounded plain language.'
    )
  }
  return canonical
}

function parseAuthorizationId(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string') {
    fail('invalid-authorization', 'The R14 evidence identity is malformed.')
  }
  const match = pattern.exec(value)
  if (match === null || /^0+$/.test(match[1])) {
    fail('invalid-authorization', 'The R14 evidence identity is malformed.')
  }
  return value
}

function parseAuthorization(
  value: unknown
): IChangeSummaryAuthorizationIdentity {
  const record = readExactRecord(
    value,
    AuthorizationKeys,
    'invalid-authorization'
  )
  if (record.version !== ChangeSummaryModelVersion) {
    fail('invalid-authorization', 'The R14 evidence identity is malformed.')
  }
  return Object.freeze({
    version: ChangeSummaryModelVersion,
    authorizationId: parseAuthorizationId(
      record.authorizationId,
      AuthorizationIdPattern
    ),
    evidenceId: parseAuthorizationId(record.evidenceId, EvidenceIdPattern),
  })
}

function authorizationMatches(
  left: IChangeSummaryAuthorizationIdentity,
  right: IChangeSummaryAuthorizationIdentity
): boolean {
  return (
    left.version === right.version &&
    left.authorizationId === right.authorizationId &&
    left.evidenceId === right.evidenceId
  )
}

function parseCommitId(value: unknown): {
  readonly value: string
  readonly width: 40 | 64
} {
  if (
    typeof value !== 'string' ||
    !CommitIdPattern.test(value) ||
    /^0+$/.test(value)
  ) {
    fail(
      'invalid-commit-id',
      'A full nonzero lowercase 40- or 64-hex commit identity is required.'
    )
  }
  return Object.freeze({ value, width: value.length as 40 | 64 })
}

function parseMetadataFact(
  value: unknown,
  maximumBytes: number,
  allowEmpty: boolean
): ChangeSummaryMetadataFact<string> {
  const snapshot = snapshotDataRecord(value)
  if (
    snapshot !== null &&
    hasExactKeys(snapshot, UnavailableFactKeys) &&
    snapshot.values.availability === 'unavailable'
  ) {
    return Object.freeze({ availability: 'unavailable' as const })
  }
  if (
    snapshot !== null &&
    hasExactKeys(snapshot, ValueFactKeys) &&
    snapshot.values.availability === 'value'
  ) {
    return Object.freeze({
      availability: 'value' as const,
      value: canonicalizeDisplayText(
        snapshot.values.value,
        maximumBytes,
        allowEmpty,
        'invalid-metadata'
      ),
    })
  }
  fail(
    'invalid-metadata',
    'Metadata must be one exact value or unavailable fact.'
  )
}

function parseAuthoredAtFact(
  value: unknown
): ChangeSummaryMetadataFact<string> {
  const fact = parseMetadataFact(value, 64, false)
  if (fact.availability === 'unavailable') {
    return fact
  }
  if (
    !CanonicalISOInstantPattern.test(fact.value) ||
    !Number.isFinite(Date.parse(fact.value)) ||
    new Date(fact.value).toISOString() !== fact.value
  ) {
    fail(
      'invalid-date',
      'Available commit dates must be canonical UTC instants.'
    )
  }
  return fact
}

function parseLineFact(value: unknown): ChangeSummaryLineFact {
  const snapshot = snapshotDataRecord(value)
  if (
    snapshot !== null &&
    hasExactKeys(snapshot, UnavailableFactKeys) &&
    (snapshot.values.availability === 'unavailable' ||
      snapshot.values.availability === 'not-applicable')
  ) {
    return Object.freeze({
      availability: snapshot.values.availability,
    }) as IChangeSummaryUnavailableFact | IChangeSummaryNotApplicableFact
  }
  if (
    snapshot !== null &&
    hasExactKeys(snapshot, ValueFactKeys) &&
    snapshot.values.availability === 'value' &&
    Number.isSafeInteger(snapshot.values.value) &&
    !Object.is(snapshot.values.value, -0) &&
    (snapshot.values.value as number) >= 0 &&
    (snapshot.values.value as number) <= MaximumChangeSummaryLineCount
  ) {
    return Object.freeze({
      availability: 'value' as const,
      value: snapshot.values.value as number,
    })
  }
  fail(
    'invalid-line-fact',
    'Line counts must be one exact value, unavailable, or not-applicable fact.'
  )
}

function isWindowsDeviceName(segment: string): boolean {
  const stem = segment.split('.')[0].toUpperCase()
  return (
    stem === 'CON' ||
    stem === 'PRN' ||
    stem === 'AUX' ||
    stem === 'NUL' ||
    stem === 'CLOCK$' ||
    stem === 'CONIN$' ||
    stem === 'CONOUT$' ||
    /^(?:COM|LPT)(?:[1-9]|[¹²³])$/.test(stem)
  )
}

function windowsPathKey(path: string): string {
  let result = ''
  for (const character of path) {
    const upper = character.toUpperCase()
    const lower = character.toLowerCase()
    // Windows filename comparison avoids linguistic one-way folds. Keep a
    // character distinct unless its single-code-point uppercase mapping
    // round-trips through lowercase (for example sigma, but not final-sigma).
    result +=
      [...upper].length === 1 && upper.toLowerCase() === lower
        ? upper
        : character
  }
  return result
}

function parseRepositoryRelativePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MaximumChangeSummaryPathBytes ||
    value !== value.normalize('NFC') ||
    hasUnpairedSurrogate(value) ||
    UnsafeTextPattern.test(value) ||
    ForbiddenWindowsPathCharacters.test(value) ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('//') ||
    TextBytes.encode(value).byteLength > MaximumChangeSummaryPathBytes
  ) {
    fail(
      'invalid-path',
      'A canonical Windows-safe repository path is required.'
    )
  }

  const segments = value.split('/')
  if (
    segments.length > MaximumChangeSummaryPathDepth ||
    segments.some(
      segment =>
        segment.length === 0 ||
        segment.length > MaximumChangeSummaryPathSegmentBytes ||
        TextBytes.encode(segment).byteLength >
          MaximumChangeSummaryPathSegmentBytes ||
        segment === '.' ||
        segment === '..' ||
        segment.toLowerCase() === '.git' ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        isWindowsDeviceName(segment)
    )
  ) {
    fail(
      'invalid-path',
      'A canonical Windows-safe repository path is required.'
    )
  }
  return value
}

function incrementLineFacts(
  fact: ChangeSummaryLineFact,
  kind: 'added' | 'deleted',
  accumulator: IReviewAccumulator
): void {
  if (fact.availability === 'value') {
    if (kind === 'added') {
      accumulator.knownAddedLines += fact.value
      accumulator.addedLinesValueCount++
    } else {
      accumulator.knownDeletedLines += fact.value
      accumulator.deletedLinesValueCount++
    }
  } else if (fact.availability === 'unavailable') {
    if (kind === 'added') {
      accumulator.addedLinesUnavailableCount++
    } else {
      accumulator.deletedLinesUnavailableCount++
    }
  } else if (kind === 'added') {
    accumulator.addedLinesNotApplicableCount++
  } else {
    accumulator.deletedLinesNotApplicableCount++
  }
}

function emptyAccumulator(): IReviewAccumulator {
  return {
    fileChangeCount: 0,
    authorUnavailableCount: 0,
    authoredAtUnavailableCount: 0,
    subjectUnavailableCount: 0,
    knownAddedLines: 0,
    knownDeletedLines: 0,
    addedLinesValueCount: 0,
    addedLinesUnavailableCount: 0,
    addedLinesNotApplicableCount: 0,
    deletedLinesValueCount: 0,
    deletedLinesUnavailableCount: 0,
    deletedLinesNotApplicableCount: 0,
  }
}

function buildReview(
  rawAuthorization: unknown,
  rawCommits: unknown
): IChangeSummaryReview {
  const authorization = parseAuthorization(rawAuthorization)
  const commitValues = readDenseArray(
    rawCommits,
    MaximumChangeSummaryCommits,
    false,
    'too-many-commits'
  )
  const commits = new Array<IChangeSummaryReviewedCommit>()
  const reviewedCommitIds = new Array<string>()
  const reviewedPaths = new Array<string>()
  const commitIds = new Set<string>()
  const globalPaths = new Map<string, string>()
  const accumulator = emptyAccumulator()
  let objectIdWidth: 40 | 64 | null = null

  for (const commitValue of commitValues) {
    const commitRecord = readExactRecord(commitValue, CommitKeys)
    const parsedCommitId = parseCommitId(commitRecord.commitId)
    if (objectIdWidth !== null && parsedCommitId.width !== objectIdWidth) {
      fail(
        'mixed-commit-id-width',
        'One review cannot mix 40- and 64-character commit identities.'
      )
    }
    if (commitIds.has(parsedCommitId.value)) {
      fail('duplicate-commit-id', 'Each reviewed commit must appear once.')
    }
    objectIdWidth = parsedCommitId.width
    commitIds.add(parsedCommitId.value)
    reviewedCommitIds.push(parsedCommitId.value)

    const author = parseMetadataFact(
      commitRecord.author,
      MaximumChangeSummaryAuthorBytes,
      false
    )
    const authoredAt = parseAuthoredAtFact(commitRecord.authoredAt)
    const subject = parseMetadataFact(
      commitRecord.subject,
      MaximumChangeSummarySubjectBytes,
      true
    )
    if (author.availability === 'unavailable') {
      accumulator.authorUnavailableCount++
    }
    if (authoredAt.availability === 'unavailable') {
      accumulator.authoredAtUnavailableCount++
    }
    if (subject.availability === 'unavailable') {
      accumulator.subjectUnavailableCount++
    }

    const fileValues = readDenseArray(
      commitRecord.files,
      MaximumChangeSummaryFilesPerCommit,
      true,
      'too-many-files'
    )
    if (
      accumulator.fileChangeCount + fileValues.length >
      MaximumChangeSummaryFileFacts
    ) {
      fail('too-many-files', 'The reviewed file evidence exceeds its bound.')
    }
    const files = new Array<IChangeSummaryReviewedFile>()
    const commitPaths = new Set<string>()
    for (const fileValue of fileValues) {
      const fileRecord = readExactRecord(fileValue, FileKeys)
      const path = parseRepositoryRelativePath(fileRecord.path)
      const pathKey = windowsPathKey(path)
      if (commitPaths.has(pathKey)) {
        fail(
          'duplicate-path',
          'A commit cannot contain duplicate or Windows-equivalent paths.'
        )
      }
      commitPaths.add(pathKey)

      const knownGlobalPath = globalPaths.get(pathKey)
      if (knownGlobalPath !== undefined && knownGlobalPath !== path) {
        fail(
          'duplicate-path',
          'Distinct spellings cannot identify the same Windows path.'
        )
      }
      if (knownGlobalPath === undefined) {
        globalPaths.set(pathKey, path)
        reviewedPaths.push(path)
      }

      const addedLines = parseLineFact(fileRecord.addedLines)
      const deletedLines = parseLineFact(fileRecord.deletedLines)
      incrementLineFacts(addedLines, 'added', accumulator)
      incrementLineFacts(deletedLines, 'deleted', accumulator)
      accumulator.fileChangeCount++
      files.push(Object.freeze({ path, addedLines, deletedLines }))
    }

    commits.push(
      Object.freeze({
        commitId: parsedCommitId.value,
        author,
        authoredAt,
        subject,
        files: Object.freeze(files),
      })
    )
  }

  if (objectIdWidth === null) {
    fail('invalid-shape', 'At least one reviewed commit is required.')
  }

  const facts: IChangeSummaryReviewFacts = Object.freeze({
    commitCount: commits.length,
    fileChangeCount: accumulator.fileChangeCount,
    changedPathCount: reviewedPaths.length,
    authorUnavailableCount: accumulator.authorUnavailableCount,
    authoredAtUnavailableCount: accumulator.authoredAtUnavailableCount,
    subjectUnavailableCount: accumulator.subjectUnavailableCount,
    knownAddedLines: accumulator.knownAddedLines,
    knownDeletedLines: accumulator.knownDeletedLines,
    addedLinesValueCount: accumulator.addedLinesValueCount,
    addedLinesUnavailableCount: accumulator.addedLinesUnavailableCount,
    addedLinesNotApplicableCount: accumulator.addedLinesNotApplicableCount,
    deletedLinesValueCount: accumulator.deletedLinesValueCount,
    deletedLinesUnavailableCount: accumulator.deletedLinesUnavailableCount,
    deletedLinesNotApplicableCount: accumulator.deletedLinesNotApplicableCount,
  })

  return Object.freeze({
    version: ChangeSummaryModelVersion,
    authorization,
    objectIdWidth,
    commits: Object.freeze(commits),
    reviewedCommitIds: Object.freeze(reviewedCommitIds),
    reviewedPaths: Object.freeze(reviewedPaths),
    facts,
  })
}

function exactStringArrayMatches(
  value: unknown,
  expected: ReadonlyArray<string>
): boolean {
  const snapshot = snapshotDenseArray(value, expected.length)
  return (
    snapshot.kind === 'valid' &&
    snapshot.values.length === expected.length &&
    snapshot.values.every((entry, index) => entry === expected[index])
  )
}

function exactFactsMatch(
  value: unknown,
  expected: IChangeSummaryReviewFacts
): boolean {
  const snapshot = snapshotDataRecord(value)
  return (
    snapshot !== null &&
    hasExactKeys(snapshot, ReviewFactKeys) &&
    ReviewFactKeys.every(key => snapshot.values[key] === expected[key])
  )
}

function canonicalizeExistingReview(value: unknown): IChangeSummaryReview {
  const record = readExactRecord(value, ReviewKeys, 'invalid-review')
  const canonical = buildReview(record.authorization, record.commits)
  if (
    record.version !== canonical.version ||
    record.objectIdWidth !== canonical.objectIdWidth ||
    !exactStringArrayMatches(
      record.reviewedCommitIds,
      canonical.reviewedCommitIds
    ) ||
    !exactStringArrayMatches(record.reviewedPaths, canonical.reviewedPaths) ||
    !exactFactsMatch(record.facts, canonical.facts)
  ) {
    fail('invalid-review', 'The supplied review is not canonical evidence.')
  }
  return canonical
}

function parseCandidateChange(value: unknown): ChangeSummaryResultChange {
  const snapshot = snapshotDataRecord(value)
  if (snapshot === null) {
    fail('invalid-shape', 'Each result change must be an exact data record.')
  }
  if (
    snapshot.values.availability === 'value' &&
    hasExactKeys(snapshot, DescribedChangeKeys)
  ) {
    return Object.freeze({
      path: parseRepositoryRelativePath(snapshot.values.path),
      availability: 'value' as const,
      description: canonicalizePlainLanguage(
        snapshot.values.description,
        MaximumChangeSummaryChangeTextBytes
      ),
    })
  }
  if (
    snapshot.values.availability === 'unavailable' &&
    hasExactKeys(snapshot, UnavailableChangeKeys)
  ) {
    return Object.freeze({
      path: parseRepositoryRelativePath(snapshot.values.path),
      availability: 'unavailable' as const,
      explanation: canonicalizePlainLanguage(
        snapshot.values.explanation,
        MaximumChangeSummaryUnavailableExplanationBytes
      ),
    })
  }
  fail(
    'invalid-shape',
    'Each result change must be exactly described or explicitly unavailable.'
  )
}

/** Validate, copy, and deeply freeze reviewed source evidence. */
export function createChangeSummaryReview(
  input: unknown
): IChangeSummaryReview {
  const record = readExactRecord(input, ReviewInputKeys)
  return buildReview(record.authorization, record.commits)
}

/**
 * Validate an untrusted result against one canonical review. Every reviewed
 * path is conserved exactly once and returned in reviewed order. `candidate`
 * is the response envelope assembled by the integration boundary: its opaque
 * identities correlate the response but never constitute proof of authority.
 */
export function createChangeSummaryResult(
  review: unknown,
  candidate: unknown
): IChangeSummaryResult {
  const canonicalReview = canonicalizeExistingReview(review)
  const candidateRecord = readExactRecord(candidate, CandidateKeys)
  const candidateAuthorization = parseAuthorization(
    candidateRecord.authorization
  )
  if (
    !authorizationMatches(canonicalReview.authorization, candidateAuthorization)
  ) {
    fail(
      'authorization-mismatch',
      'The result is not bound to this reviewed authorization evidence.'
    )
  }

  const summary = canonicalizePlainLanguage(
    candidateRecord.summary,
    MaximumChangeSummaryTextBytes
  )
  const changeValues = readDenseArray(
    candidateRecord.changes,
    canonicalReview.reviewedPaths.length,
    true,
    'too-many-files'
  )
  const reviewedPaths = new Set(canonicalReview.reviewedPaths)
  const byPath = new Map<string, ChangeSummaryResultChange>()
  for (const changeValue of changeValues) {
    const change = parseCandidateChange(changeValue)
    if (!reviewedPaths.has(change.path)) {
      fail(
        'unknown-result-path',
        'A result change refers to a path outside the reviewed evidence.'
      )
    }
    if (byPath.has(change.path)) {
      fail(
        'duplicate-result-path',
        'Every reviewed path may appear only once in a result.'
      )
    }
    byPath.set(change.path, change)
  }
  if (byPath.size !== canonicalReview.reviewedPaths.length) {
    fail(
      'incomplete-result',
      'Every reviewed path requires one result entry or unavailable explanation.'
    )
  }

  const changes = canonicalReview.reviewedPaths.map(path => byPath.get(path)!)
  const describedChangeCount = changes.filter(
    change => change.availability === 'value'
  ).length
  const facts: IChangeSummaryResultFacts = Object.freeze({
    changeCount: changes.length,
    describedChangeCount,
    unavailableChangeCount: changes.length - describedChangeCount,
  })

  return Object.freeze({
    version: ChangeSummaryModelVersion,
    authorization: canonicalReview.authorization,
    reviewedCommitIds: canonicalReview.reviewedCommitIds,
    reviewedPaths: canonicalReview.reviewedPaths,
    summary,
    changes: Object.freeze(changes),
    facts,
  })
}
