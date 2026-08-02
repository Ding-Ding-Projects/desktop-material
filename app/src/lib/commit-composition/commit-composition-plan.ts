/**
 * Pure, immutable planning for a reviewed commit-composition proposal.
 *
 * This module owns display metadata, identity conservation, ordering, and
 * review facts only. It deliberately exposes no serializer or execution
 * capability: a later integration must make its own separately authorized
 * decision about how a reviewed plan is applied.
 */

export const MaximumCommitCompositionUnits = 128
export const MaximumCommitCompositionGroups = 128
export const MaximumCommitCompositionPathBytes = 4_096
export const MaximumCommitCompositionLabelBytes = 2_048
export const MaximumCommitCompositionTitleBytes = 256
export const MaximumCommitCompositionDescriptionBytes = 4_096

export const CommitCompositionSourceKinds = Object.freeze([
  'working-tree',
  'existing-history',
] as const)

export type CommitCompositionSourceKind =
  typeof CommitCompositionSourceKinds[number]

export type CommitCompositionPushedFact =
  | { readonly value: boolean }
  | { readonly unavailable: true }

/** Display-only working-tree metadata captured during an earlier review. */
export interface IWorkingTreeCommitCompositionUnit {
  readonly kind: 'working-tree'
  /** Full, source-bound stable identity; never a path or array index. */
  readonly id: string
  /** Exact lowercase `sha256:` fingerprint of the reviewed content. */
  readonly contentFingerprint: string
  /** Canonical display text only; it is never used as a filesystem path. */
  readonly path: string
}

/** Display-only existing-history metadata captured during an earlier review. */
export interface IExistingHistoryCommitCompositionUnit {
  readonly kind: 'existing-history'
  /** Full, source-bound stable identity; never a commit prefix or array index. */
  readonly id: string
  /** Exact lowercase `sha256:` fingerprint of the reviewed content. */
  readonly contentFingerprint: string
  /** Canonical display text only; it never enters an executable representation. */
  readonly label: string
  /** Full lowercase SHA-1 or SHA-256 commit identity. */
  readonly commitId: string
  /** Explicit evidence. Unavailable is retained rather than changed to false. */
  readonly pushed: CommitCompositionPushedFact
}

export type CommitCompositionReviewedUnit =
  | IWorkingTreeCommitCompositionUnit
  | IExistingHistoryCommitCompositionUnit

/** One ordered proposed commit, containing reviewed unit identities only. */
export interface ICommitCompositionGroup {
  readonly groupId: string
  /** Canonical display-only title. */
  readonly title: string
  /** Canonical display-only explanation; an empty explanation is permitted. */
  readonly description: string
  /** Explicit proposal order within this group. */
  readonly unitIds: ReadonlyArray<string>
}

/** Derived facts which callers must not supply as authority. */
export interface ICommitCompositionPlanSummary {
  readonly sourceKind: CommitCompositionSourceKind
  readonly unitCount: number
  readonly groupCount: number
  readonly reordered: boolean
  /** Existing-history proposals pause before any later destructive workflow. */
  readonly requiresPause: boolean
  /** Every proposal requires explicit human review. */
  readonly requiresReview: true
  /** Known-pushed history units. Always zero for a working-tree plan. */
  readonly pushedCount: number
  /** History units whose pushed evidence remains unavailable. */
  readonly pushedEvidenceUnavailableCount: number
  readonly requiresPushedHistoryConfirmation: boolean
}

/** A deeply frozen, source-homogeneous, conservation-checked proposal. */
export interface ICommitCompositionPlan {
  readonly sourceKind: CommitCompositionSourceKind
  /** Reviewed source order and metadata, independent from proposal order. */
  readonly reviewedUnits: ReadonlyArray<CommitCompositionReviewedUnit>
  /** Reviewed source order retained explicitly for stable comparison. */
  readonly reviewedUnitIds: ReadonlyArray<string>
  /** Explicit ordered commit groups and their explicit ordered members. */
  readonly groups: ReadonlyArray<ICommitCompositionGroup>
  readonly summary: ICommitCompositionPlanSummary
}

export type CommitCompositionPlanErrorCode =
  | 'invalid-shape'
  | 'invalid-source-kind'
  | 'mixed-source-kind'
  | 'invalid-id'
  | 'duplicate-id'
  | 'invalid-fingerprint'
  | 'invalid-commit-id'
  | 'duplicate-commit-id'
  | 'mixed-commit-id-width'
  | 'invalid-pushed-evidence'
  | 'invalid-display-text'
  | 'invalid-title'
  | 'invalid-description'
  | 'too-many-units'
  | 'too-many-groups'
  | 'invalid-plan'
  | 'unknown-unit'
  | 'unknown-group'
  | 'invalid-operation'

export class CommitCompositionPlanError extends Error {
  public constructor(
    public readonly code: CommitCompositionPlanErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'CommitCompositionPlanError'
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

interface IParsedReviewedUnits {
  readonly sourceKind: CommitCompositionSourceKind
  readonly units: ReadonlyArray<CommitCompositionReviewedUnit>
}

interface IParsedCommitId {
  readonly value: string
  readonly width: 40 | 64
}

const TextBytes = new TextEncoder()
const UnitIdPattern = /^(?:working-tree|existing-history):[a-f0-9]{64}$/
const GroupIdPattern = /^group:[a-f0-9]{64}$/
const ContentFingerprintPattern = /^sha256:[a-f0-9]{64}$/
const CommitIdPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const UnsafeDisplayTextPattern =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u206f\ufeff]/u

const WorkingTreeUnitKeys = Object.freeze([
  'kind',
  'id',
  'contentFingerprint',
  'path',
] as const)
const ExistingHistoryUnitKeys = Object.freeze([
  'kind',
  'id',
  'contentFingerprint',
  'label',
  'commitId',
  'pushed',
] as const)
const PushedValueKeys = Object.freeze(['value'] as const)
const PushedUnavailableKeys = Object.freeze(['unavailable'] as const)
const GroupKeys = Object.freeze([
  'groupId',
  'title',
  'description',
  'unitIds',
] as const)
const PlanKeys = Object.freeze([
  'sourceKind',
  'reviewedUnits',
  'reviewedUnitIds',
  'groups',
  'summary',
] as const)
const SummaryKeys = Object.freeze([
  'sourceKind',
  'unitCount',
  'groupCount',
  'reordered',
  'requiresPause',
  'requiresReview',
  'pushedCount',
  'pushedEvidenceUnavailableCount',
  'requiresPushedHistoryConfirmation',
] as const)

function fail(code: CommitCompositionPlanErrorCode, message: string): never {
  throw new CommitCompositionPlanError(code, message)
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
  expectedKeys: ReadonlyArray<string>
): ExactDataRecord {
  const snapshot = snapshotDataRecord(value)
  if (snapshot === null || !hasExactKeys(snapshot, expectedKeys)) {
    fail(
      'invalid-shape',
      'The commit-composition value has an invalid object shape.'
    )
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
      (lengthDescriptor.value as number) < 0
    ) {
      return { kind: 'invalid' }
    }

    const length = lengthDescriptor.value as number
    if (length > maximumLength) {
      return { kind: 'too-large' }
    }

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

function readNonEmptyDenseArray(
  value: unknown,
  maximumLength: number,
  tooLargeCode: 'too-many-units' | 'too-many-groups'
): ReadonlyArray<unknown> {
  const snapshot = snapshotDenseArray(value, maximumLength)
  if (snapshot.kind === 'too-large') {
    fail(
      tooLargeCode,
      `The commit-composition input exceeds its ${maximumLength}-item bound.`
    )
  }
  if (snapshot.kind === 'invalid') {
    fail(
      'invalid-shape',
      'Commit-composition collections must be ordinary dense arrays.'
    )
  }
  if (snapshot.values.length === 0) {
    fail('invalid-plan', 'A commit-composition collection cannot be empty.')
  }
  return snapshot.values
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

function canonicalizeDisplayText(
  value: unknown,
  maximumBytes: number,
  allowEmpty: boolean,
  code: 'invalid-display-text' | 'invalid-title' | 'invalid-description'
): string {
  if (
    typeof value !== 'string' ||
    value.length > maximumBytes ||
    hasUnpairedSurrogate(value) ||
    UnsafeDisplayTextPattern.test(value) ||
    TextBytes.encode(value).byteLength > maximumBytes
  ) {
    fail(code, 'Commit-composition display text is invalid or oversized.')
  }

  const canonical = value.normalize('NFC').replace(/\s+/gu, ' ').trim()
  if (
    (!allowEmpty && canonical.length === 0) ||
    canonical.length > maximumBytes ||
    hasUnpairedSurrogate(canonical) ||
    UnsafeDisplayTextPattern.test(canonical) ||
    TextBytes.encode(canonical).byteLength > maximumBytes
  ) {
    fail(code, 'Commit-composition display text is invalid or oversized.')
  }
  return canonical
}

function parseSourceKind(value: unknown): CommitCompositionSourceKind {
  if (value !== 'working-tree' && value !== 'existing-history') {
    fail(
      'invalid-source-kind',
      'Commit composition accepts only working-tree or existing-history sources.'
    )
  }
  return value
}

function parseUnitId(
  value: unknown,
  expectedKind: CommitCompositionSourceKind
): string {
  if (
    typeof value !== 'string' ||
    !UnitIdPattern.test(value) ||
    !value.startsWith(`${expectedKind}:`)
  ) {
    fail('invalid-id', 'A full source-bound stable unit id is required.')
  }
  return value
}

function parseGroupId(value: unknown): string {
  if (typeof value !== 'string' || !GroupIdPattern.test(value)) {
    fail('invalid-id', 'A full stable group id is required.')
  }
  return value
}

function parseContentFingerprint(value: unknown): string {
  if (typeof value !== 'string' || !ContentFingerprintPattern.test(value)) {
    fail(
      'invalid-fingerprint',
      'Each reviewed unit requires an exact lowercase SHA-256 fingerprint.'
    )
  }
  return value
}

function parseCommitId(value: unknown): IParsedCommitId {
  if (
    typeof value !== 'string' ||
    !CommitIdPattern.test(value) ||
    /^0+$/.test(value)
  ) {
    fail(
      'invalid-commit-id',
      'History units require a full nonzero lowercase 40- or 64-hex commit id.'
    )
  }
  return Object.freeze({ value, width: value.length as 40 | 64 })
}

function parsePushedFact(value: unknown): CommitCompositionPushedFact {
  const snapshot = snapshotDataRecord(value)
  if (snapshot !== null && hasExactKeys(snapshot, PushedValueKeys)) {
    if (typeof snapshot.values.value !== 'boolean') {
      fail(
        'invalid-pushed-evidence',
        'Known pushed evidence must contain one boolean value.'
      )
    }
    return Object.freeze({ value: snapshot.values.value })
  }
  if (snapshot !== null && hasExactKeys(snapshot, PushedUnavailableKeys)) {
    if (snapshot.values.unavailable !== true) {
      fail(
        'invalid-pushed-evidence',
        'Unavailable pushed evidence must be explicit.'
      )
    }
    return Object.freeze({ unavailable: true })
  }
  fail(
    'invalid-pushed-evidence',
    'Pushed evidence must be one exact known or unavailable fact.'
  )
}

function parseReviewedUnit(value: unknown): CommitCompositionReviewedUnit {
  const snapshot = snapshotDataRecord(value)
  if (snapshot === null) {
    fail(
      'invalid-shape',
      'Each reviewed source unit must be an exact plain data record.'
    )
  }

  const kind = parseSourceKind(snapshot.values.kind)
  if (kind === 'working-tree') {
    if (!hasExactKeys(snapshot, WorkingTreeUnitKeys)) {
      fail(
        'invalid-shape',
        'A working-tree unit contains missing or inapplicable facts.'
      )
    }
    return Object.freeze({
      kind,
      id: parseUnitId(snapshot.values.id, kind),
      contentFingerprint: parseContentFingerprint(
        snapshot.values.contentFingerprint
      ),
      path: canonicalizeDisplayText(
        snapshot.values.path,
        MaximumCommitCompositionPathBytes,
        false,
        'invalid-display-text'
      ),
    })
  }

  if (!hasExactKeys(snapshot, ExistingHistoryUnitKeys)) {
    fail(
      'invalid-shape',
      'An existing-history unit contains missing or inapplicable facts.'
    )
  }
  const commit = parseCommitId(snapshot.values.commitId)
  return Object.freeze({
    kind,
    id: parseUnitId(snapshot.values.id, kind),
    contentFingerprint: parseContentFingerprint(
      snapshot.values.contentFingerprint
    ),
    label: canonicalizeDisplayText(
      snapshot.values.label,
      MaximumCommitCompositionLabelBytes,
      false,
      'invalid-display-text'
    ),
    commitId: commit.value,
    pushed: parsePushedFact(snapshot.values.pushed),
  })
}

function parseReviewedUnits(input: unknown): IParsedReviewedUnits {
  const values = readNonEmptyDenseArray(
    input,
    MaximumCommitCompositionUnits,
    'too-many-units'
  )
  const units = new Array<CommitCompositionReviewedUnit>()
  const seenIds = new Set<string>()
  const seenCommitIds = new Set<string>()
  let sourceKind: CommitCompositionSourceKind | null = null
  let commitIdWidth: 40 | 64 | null = null

  for (const value of values) {
    const unit = parseReviewedUnit(value)
    if (sourceKind !== null && unit.kind !== sourceKind) {
      fail(
        'mixed-source-kind',
        'One commit-composition plan cannot mix source kinds.'
      )
    }
    sourceKind = unit.kind
    if (seenIds.has(unit.id)) {
      fail('duplicate-id', 'Every reviewed unit id must be unique.')
    }
    seenIds.add(unit.id)

    if (unit.kind === 'existing-history') {
      const commit = parseCommitId(unit.commitId)
      if (commitIdWidth !== null && commit.width !== commitIdWidth) {
        fail(
          'mixed-commit-id-width',
          'One history plan cannot mix commit-id widths.'
        )
      }
      commitIdWidth = commit.width
      if (seenCommitIds.has(commit.value)) {
        fail(
          'duplicate-commit-id',
          'Every reviewed history commit must occur exactly once.'
        )
      }
      seenCommitIds.add(commit.value)
    }
    units.push(unit)
  }

  if (sourceKind === null) {
    fail('invalid-plan', 'A commit-composition plan requires reviewed units.')
  }
  return Object.freeze({
    sourceKind,
    units: Object.freeze(units),
  })
}

function parseGroups(
  input: unknown,
  reviewed: IParsedReviewedUnits
): ReadonlyArray<ICommitCompositionGroup> {
  const values = readNonEmptyDenseArray(
    input,
    MaximumCommitCompositionGroups,
    'too-many-groups'
  )
  if (values.length > reviewed.units.length) {
    fail(
      'invalid-plan',
      'A plan cannot have more nonempty groups than reviewed units.'
    )
  }

  const reviewedIds = new Set(reviewed.units.map(unit => unit.id))
  const assignedIds = new Set<string>()
  const groupIds = new Set<string>()
  const groups = new Array<ICommitCompositionGroup>()

  for (const value of values) {
    const record = readExactRecord(value, GroupKeys)
    const groupId = parseGroupId(record.groupId)
    if (groupIds.has(groupId)) {
      fail('duplicate-id', 'Every proposed group id must be unique.')
    }
    groupIds.add(groupId)

    const rawUnitIds = readNonEmptyDenseArray(
      record.unitIds,
      MaximumCommitCompositionUnits,
      'too-many-units'
    )
    const unitIds = new Array<string>()
    for (const rawUnitId of rawUnitIds) {
      const unitId = parseUnitId(rawUnitId, reviewed.sourceKind)
      if (!reviewedIds.has(unitId)) {
        fail(
          'unknown-unit',
          'A proposed group references an unreviewed unit id.'
        )
      }
      if (assignedIds.has(unitId)) {
        fail(
          'invalid-plan',
          'Every reviewed unit must appear in exactly one group.'
        )
      }
      assignedIds.add(unitId)
      unitIds.push(unitId)
    }

    groups.push(
      Object.freeze({
        groupId,
        title: canonicalizeDisplayText(
          record.title,
          MaximumCommitCompositionTitleBytes,
          false,
          'invalid-title'
        ),
        description: canonicalizeDisplayText(
          record.description,
          MaximumCommitCompositionDescriptionBytes,
          true,
          'invalid-description'
        ),
        unitIds: Object.freeze(unitIds),
      })
    )
  }

  if (assignedIds.size !== reviewedIds.size) {
    fail(
      'invalid-plan',
      'Every reviewed unit must appear in exactly one proposed group.'
    )
  }
  return Object.freeze(groups)
}

function copyReviewedUnit(
  unit: CommitCompositionReviewedUnit
): CommitCompositionReviewedUnit {
  if (unit.kind === 'working-tree') {
    return Object.freeze({
      kind: unit.kind,
      id: unit.id,
      contentFingerprint: unit.contentFingerprint,
      path: unit.path,
    })
  }
  return Object.freeze({
    kind: unit.kind,
    id: unit.id,
    contentFingerprint: unit.contentFingerprint,
    label: unit.label,
    commitId: unit.commitId,
    pushed:
      'value' in unit.pushed
        ? Object.freeze({ value: unit.pushed.value })
        : Object.freeze({ unavailable: true }),
  })
}

function buildPlan(
  reviewed: IParsedReviewedUnits,
  sourceGroups: ReadonlyArray<ICommitCompositionGroup>
): ICommitCompositionPlan {
  const reviewedUnits = Object.freeze(reviewed.units.map(copyReviewedUnit))
  const reviewedUnitIds = Object.freeze(reviewedUnits.map(unit => unit.id))
  const groups = Object.freeze(
    sourceGroups.map(group =>
      Object.freeze({
        groupId: group.groupId,
        title: group.title,
        description: group.description,
        unitIds: Object.freeze([...group.unitIds]),
      })
    )
  )

  const proposedUnitIds = groups.flatMap(group => group.unitIds)
  const reordered = proposedUnitIds.some(
    (unitId, index) => unitId !== reviewedUnitIds[index]
  )
  let pushedCount = 0
  let pushedEvidenceUnavailableCount = 0
  if (reviewed.sourceKind === 'existing-history') {
    for (const unit of reviewedUnits) {
      if (unit.kind !== 'existing-history') {
        fail('invalid-plan', 'The reviewed source kind changed unexpectedly.')
      }
      if ('unavailable' in unit.pushed) {
        pushedEvidenceUnavailableCount++
      } else if (unit.pushed.value) {
        pushedCount++
      }
    }
  }

  const summary: ICommitCompositionPlanSummary = Object.freeze({
    sourceKind: reviewed.sourceKind,
    unitCount: reviewedUnits.length,
    groupCount: groups.length,
    reordered,
    requiresPause: reviewed.sourceKind === 'existing-history',
    requiresReview: true,
    pushedCount,
    pushedEvidenceUnavailableCount,
    requiresPushedHistoryConfirmation: pushedCount > 0,
  })

  return Object.freeze({
    sourceKind: reviewed.sourceKind,
    reviewedUnits,
    reviewedUnitIds,
    groups,
    summary,
  })
}

function validateReviewedUnitIds(
  value: unknown,
  expected: ReadonlyArray<string>
): void {
  const supplied = readNonEmptyDenseArray(
    value,
    MaximumCommitCompositionUnits,
    'too-many-units'
  )
  if (
    supplied.length !== expected.length ||
    supplied.some((unitId, index) => unitId !== expected[index])
  ) {
    fail('invalid-plan', 'The preserved reviewed unit order is invalid.')
  }
}

function validateSummary(
  value: unknown,
  expected: ICommitCompositionPlanSummary
): void {
  const supplied = readExactRecord(value, SummaryKeys)
  for (const key of SummaryKeys) {
    if (supplied[key] !== expected[key]) {
      fail('invalid-plan', 'The commit-composition summary is invalid.')
    }
  }
}

function canonicalizePlan(
  input: ICommitCompositionPlan
): ICommitCompositionPlan {
  const record = readExactRecord(input, PlanKeys)
  const reviewed = parseReviewedUnits(record.reviewedUnits)
  const groups = parseGroups(record.groups, reviewed)
  const plan = buildPlan(reviewed, groups)

  if (record.sourceKind !== plan.sourceKind) {
    fail(
      'invalid-plan',
      'The plan source kind does not match its reviewed units.'
    )
  }
  validateReviewedUnitIds(record.reviewedUnitIds, plan.reviewedUnitIds)
  validateSummary(record.summary, plan.summary)
  return plan
}

/** Validate, canonicalize, copy, and deeply freeze one reviewed proposal. */
export function createCommitCompositionPlan(
  reviewedUnits: unknown,
  proposedGroups: unknown
): ICommitCompositionPlan {
  const reviewed = parseReviewedUnits(reviewedUnits)
  const groups = parseGroups(proposedGroups, reviewed)
  return buildPlan(reviewed, groups)
}

/** Update one display-only title by a full stable group id. */
export function updateCommitCompositionGroupTitle(
  input: ICommitCompositionPlan,
  groupId: string,
  title: string
): ICommitCompositionPlan {
  const plan = canonicalizePlan(input)
  const exactGroupId = parseGroupId(groupId)
  const canonicalTitle = canonicalizeDisplayText(
    title,
    MaximumCommitCompositionTitleBytes,
    false,
    'invalid-title'
  )
  let found = false
  const groups = plan.groups.map(group => {
    if (group.groupId !== exactGroupId) {
      return {
        groupId: group.groupId,
        title: group.title,
        description: group.description,
        unitIds: [...group.unitIds],
      }
    }
    found = true
    return {
      groupId: group.groupId,
      title: canonicalTitle,
      description: group.description,
      unitIds: [...group.unitIds],
    }
  })
  if (!found) {
    fail('unknown-group', 'The requested group is not part of this plan.')
  }
  return createCommitCompositionPlan(plan.reviewedUnits, groups)
}

/**
 * Move one exact reviewed unit into a target group, before another exact unit
 * in that group or at the end when `beforeUnitId` is null. No index, path,
 * fingerprint, title, or commit prefix can address this operation.
 */
export function moveCommitCompositionUnit(
  input: ICommitCompositionPlan,
  unitId: string,
  destinationGroupId: string,
  beforeUnitId: string | null
): ICommitCompositionPlan {
  const plan = canonicalizePlan(input)
  const movingId = parseUnitId(unitId, plan.sourceKind)
  const targetGroupId = parseGroupId(destinationGroupId)
  const anchorId =
    beforeUnitId === null ? null : parseUnitId(beforeUnitId, plan.sourceKind)

  if (!plan.reviewedUnitIds.includes(movingId)) {
    fail('unknown-unit', 'The requested unit is not part of this plan.')
  }
  if (anchorId === movingId) {
    fail('invalid-operation', 'A unit cannot be moved before itself.')
  }
  if (anchorId !== null && !plan.reviewedUnitIds.includes(anchorId)) {
    fail('unknown-unit', 'The requested anchor is not part of this plan.')
  }

  const sourceGroupIndex = plan.groups.findIndex(group =>
    group.unitIds.includes(movingId)
  )
  const destinationGroupIndex = plan.groups.findIndex(
    group => group.groupId === targetGroupId
  )
  if (sourceGroupIndex < 0) {
    fail('unknown-unit', 'The requested unit is not part of a proposal group.')
  }
  if (destinationGroupIndex < 0) {
    fail('unknown-group', 'The target group is not part of this plan.')
  }
  if (
    sourceGroupIndex !== destinationGroupIndex &&
    plan.groups[sourceGroupIndex].unitIds.length === 1
  ) {
    fail(
      'invalid-operation',
      'Moving this unit would leave an empty proposal group.'
    )
  }
  if (
    anchorId !== null &&
    !plan.groups[destinationGroupIndex].unitIds.includes(anchorId)
  ) {
    fail(
      'invalid-operation',
      'The requested anchor is not inside the target group.'
    )
  }

  const groups = plan.groups.map(group => ({
    groupId: group.groupId,
    title: group.title,
    description: group.description,
    unitIds: [...group.unitIds],
  }))
  const sourceUnitIds = groups[sourceGroupIndex].unitIds
  const sourceIndex = sourceUnitIds.indexOf(movingId)
  sourceUnitIds.splice(sourceIndex, 1)
  const destinationUnitIds = groups[destinationGroupIndex].unitIds
  if (anchorId === null) {
    destinationUnitIds.push(movingId)
  } else {
    const anchorIndex = destinationUnitIds.indexOf(anchorId)
    if (anchorIndex < 0) {
      fail(
        'invalid-operation',
        'The requested anchor is not inside the target group.'
      )
    }
    destinationUnitIds.splice(anchorIndex, 0, movingId)
  }

  return createCommitCompositionPlan(plan.reviewedUnits, groups)
}
