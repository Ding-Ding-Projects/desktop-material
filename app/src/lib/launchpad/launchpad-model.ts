/**
 * Provider-independent Launchpad domain types. Adapters must preserve the
 * difference between a known value, unavailable provider data, and a field
 * which does not apply to that item kind.
 */

export const LaunchpadIdentitySegmentMaximumLength = 512
export const LaunchpadItemKeyMaximumLength = 8_192

const LaunchpadIdentityVersion = 1
const identityControlCharacters = /[\u0000-\u001f\u007f]/

export type LaunchpadItemKind =
  | 'issue'
  | 'pull-request'
  | 'ci-run'
  | 'local-wip'

export interface ILaunchpadValue<T> {
  readonly availability: 'value'
  readonly value: T
}

export interface ILaunchpadUnavailable {
  readonly availability: 'unavailable'
}

export interface ILaunchpadNotApplicable {
  readonly availability: 'not-applicable'
}

export type LaunchpadField<T> =
  | ILaunchpadValue<T>
  | ILaunchpadUnavailable
  | ILaunchpadNotApplicable

export type LaunchpadRelevantField<T> =
  | ILaunchpadValue<T>
  | ILaunchpadUnavailable

export const LaunchpadUnavailable: ILaunchpadUnavailable = Object.freeze({
  availability: 'unavailable',
})

export const LaunchpadNotApplicable: ILaunchpadNotApplicable = Object.freeze({
  availability: 'not-applicable',
})

export function launchpadValue<T>(value: T): ILaunchpadValue<T> {
  return { availability: 'value', value }
}

export interface ILaunchpadItemIdentity<
  K extends LaunchpadItemKind = LaunchpadItemKind
> {
  readonly endpointId: string
  readonly accountId: string
  readonly repositoryId: string
  readonly kind: K
  /**
   * Provider-stable logical ID. An issue-shaped result and its pull-request
   * result use the same ID only when the adapter can prove they are aliases;
   * providers with separate namespaces must kind-scope this value.
   */
  readonly itemId: string
}

declare const launchpadItemKeyBrand: unique symbol
declare const launchpadProviderItemKeyBrand: unique symbol

/** Exact identity, including the observed item kind. */
export type LaunchpadItemKey = string & {
  readonly [launchpadItemKeyBrand]: true
}

/**
 * Logical provider identity. Issues and pull requests intentionally share one
 * namespace because providers can return the same pull request through both
 * issue and pull-request APIs.
 */
export type LaunchpadProviderItemKey = string & {
  readonly [launchpadProviderItemKeyBrand]: true
}

type LaunchpadProviderItemKind =
  | 'issue-or-pull-request'
  | 'ci-run'
  | 'local-wip'

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLaunchpadItemKind(value: unknown): value is LaunchpadItemKind {
  return (
    value === 'issue' ||
    value === 'pull-request' ||
    value === 'ci-run' ||
    value === 'local-wip'
  )
}

function isIdentitySegment(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= LaunchpadIdentitySegmentMaximumLength &&
    !identityControlCharacters.test(value)
  )
}

const identityKeys = [
  'accountId',
  'endpointId',
  'itemId',
  'kind',
  'repositoryId',
] as const

/** Strictly validate an identity object, including its exact property set. */
export function isLaunchpadItemIdentity(
  value: unknown
): value is ILaunchpadItemIdentity {
  if (!isRecord(value)) {
    return false
  }

  const keys = Object.keys(value).sort()
  return (
    keys.length === identityKeys.length &&
    identityKeys.every((key, index) => keys[index] === key) &&
    isIdentitySegment(value.endpointId) &&
    isIdentitySegment(value.accountId) &&
    isIdentitySegment(value.repositoryId) &&
    isLaunchpadItemKind(value.kind) &&
    isIdentitySegment(value.itemId)
  )
}

/** Validate and copy an untrusted identity before it enters the model. */
export function createLaunchpadItemIdentity(
  value: unknown
): ILaunchpadItemIdentity {
  if (!isLaunchpadItemIdentity(value)) {
    throw new Error('Launchpad item identity is invalid.')
  }

  return Object.freeze({
    endpointId: value.endpointId,
    accountId: value.accountId,
    repositoryId: value.repositoryId,
    kind: value.kind,
    itemId: value.itemId,
  })
}

function providerItemKind(kind: LaunchpadItemKind): LaunchpadProviderItemKind {
  return kind === 'issue' || kind === 'pull-request'
    ? 'issue-or-pull-request'
    : kind
}

function encodeItemKey(identity: ILaunchpadItemIdentity): string {
  return JSON.stringify([
    'launchpad-item',
    LaunchpadIdentityVersion,
    identity.endpointId,
    identity.accountId,
    identity.repositoryId,
    identity.kind,
    identity.itemId,
  ])
}

function encodeProviderItemKey(identity: ILaunchpadItemIdentity): string {
  return JSON.stringify([
    'launchpad-provider-item',
    LaunchpadIdentityVersion,
    identity.endpointId,
    identity.accountId,
    identity.repositoryId,
    providerItemKind(identity.kind),
    identity.itemId,
  ])
}

export function createLaunchpadItemKey(
  identity: ILaunchpadItemIdentity
): LaunchpadItemKey {
  const validated = createLaunchpadItemIdentity(identity)
  return encodeItemKey(validated) as LaunchpadItemKey
}

export function createLaunchpadProviderItemKey(
  identity: ILaunchpadItemIdentity
): LaunchpadProviderItemKey {
  const validated = createLaunchpadItemIdentity(identity)
  return encodeProviderItemKey(validated) as LaunchpadProviderItemKey
}

function parseEncodedKey(value: unknown): ReadonlyArray<unknown> | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > LaunchpadItemKeyMaximumLength
  ) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function isLaunchpadItemKey(value: unknown): value is LaunchpadItemKey {
  const parsed = parseEncodedKey(value)
  if (
    parsed === null ||
    parsed.length !== 7 ||
    parsed[0] !== 'launchpad-item' ||
    parsed[1] !== LaunchpadIdentityVersion
  ) {
    return false
  }

  const identity = {
    endpointId: parsed[2],
    accountId: parsed[3],
    repositoryId: parsed[4],
    kind: parsed[5],
    itemId: parsed[6],
  }
  return isLaunchpadItemIdentity(identity) && encodeItemKey(identity) === value
}

export function isLaunchpadProviderItemKey(
  value: unknown
): value is LaunchpadProviderItemKey {
  const parsed = parseEncodedKey(value)
  if (
    parsed === null ||
    parsed.length !== 7 ||
    parsed[0] !== 'launchpad-provider-item' ||
    parsed[1] !== LaunchpadIdentityVersion ||
    !isIdentitySegment(parsed[2]) ||
    !isIdentitySegment(parsed[3]) ||
    !isIdentitySegment(parsed[4]) ||
    (parsed[5] !== 'issue-or-pull-request' &&
      parsed[5] !== 'ci-run' &&
      parsed[5] !== 'local-wip') ||
    !isIdentitySegment(parsed[6])
  ) {
    return false
  }

  return JSON.stringify(parsed) === value
}

export interface ILaunchpadDiffStat {
  readonly additions: number
  readonly deletions: number
}

export type LaunchpadCIStatus =
  | 'queued'
  | 'in-progress'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'action-required'

export type LaunchpadAssignmentState = 'assigned' | 'unassigned'
export type LaunchpadMergeConflictState = 'conflict-free' | 'conflicted'

/**
 * Provider facts used by the issue #128 section contract. Each fact remains
 * explicit when the provider cannot supply it or when it does not apply.
 */
export interface ILaunchpadAttentionSignals {
  readonly readyToMerge: LaunchpadField<boolean>
  readonly assignment: LaunchpadField<LaunchpadAssignmentState>
  readonly mergeConflict: LaunchpadField<LaunchpadMergeConflictState>
}

interface ILaunchpadBaseItem<K extends LaunchpadItemKind> {
  readonly kind: K
  readonly identity: ILaunchpadItemIdentity<K>
  readonly title: string
  /** Normalized ISO-8601 timestamp when the source exposes one. */
  readonly updatedAt: LaunchpadRelevantField<string>
  readonly attention: ILaunchpadAttentionSignals
}

export interface ILaunchpadIssueItem extends ILaunchpadBaseItem<'issue'> {
  readonly referenceNumber: LaunchpadRelevantField<number>
  readonly branchName: ILaunchpadNotApplicable
  readonly webUrl: LaunchpadRelevantField<string>
  readonly diffStat: ILaunchpadNotApplicable
  readonly ciStatus: ILaunchpadNotApplicable
}

export interface ILaunchpadPullRequestItem
  extends ILaunchpadBaseItem<'pull-request'> {
  readonly referenceNumber: LaunchpadRelevantField<number>
  readonly branchName: LaunchpadRelevantField<string>
  readonly webUrl: LaunchpadRelevantField<string>
  readonly diffStat: LaunchpadRelevantField<ILaunchpadDiffStat>
  readonly ciStatus: LaunchpadRelevantField<LaunchpadCIStatus>
}

export interface ILaunchpadCIItem extends ILaunchpadBaseItem<'ci-run'> {
  readonly referenceNumber: LaunchpadRelevantField<number>
  readonly branchName: LaunchpadRelevantField<string>
  readonly webUrl: LaunchpadRelevantField<string>
  readonly diffStat: ILaunchpadNotApplicable
  readonly ciStatus: LaunchpadRelevantField<LaunchpadCIStatus>
}

export interface ILaunchpadLocalWIPItem
  extends ILaunchpadBaseItem<'local-wip'> {
  readonly referenceNumber: ILaunchpadNotApplicable
  readonly branchName: LaunchpadRelevantField<string>
  readonly webUrl: ILaunchpadNotApplicable
  readonly diffStat: LaunchpadRelevantField<ILaunchpadDiffStat>
  readonly ciStatus: ILaunchpadNotApplicable
}

export type LaunchpadItem =
  | ILaunchpadIssueItem
  | ILaunchpadPullRequestItem
  | ILaunchpadCIItem
  | ILaunchpadLocalWIPItem

export const LaunchpadBuckets = Object.freeze({
  Pinned: 'Pinned',
  ReadyToMerge: 'Ready to merge',
  Unassigned: 'Unassigned',
  CIFailing: 'CI failing',
  MergeConflicts: 'Merge conflicts',
} as const)

export type LaunchpadBucket =
  typeof LaunchpadBuckets[keyof typeof LaunchpadBuckets]

/** Exact visible section order required by issue #128. */
export const LaunchpadBucketOrder: ReadonlyArray<LaunchpadBucket> =
  Object.freeze([
    LaunchpadBuckets.Pinned,
    LaunchpadBuckets.ReadyToMerge,
    LaunchpadBuckets.Unassigned,
    LaunchpadBuckets.CIFailing,
    LaunchpadBuckets.MergeConflicts,
  ])

function isTrue(field: LaunchpadField<boolean>): boolean {
  return field.availability === 'value' && field.value
}

function hasCIStatus(item: LaunchpadItem, status: LaunchpadCIStatus): boolean {
  return (
    item.ciStatus.availability === 'value' && item.ciStatus.value === status
  )
}

/**
 * Classify one visible item. Null is an honest result: issue #128 defines no
 * catch-all section, so unmatched work must be reported separately.
 */
export function classifyLaunchpadItem(
  item: LaunchpadItem,
  pinnedItemKeys: ReadonlySet<LaunchpadProviderItemKey>
): LaunchpadBucket | null {
  const itemKey = createLaunchpadProviderItemKey(item.identity)
  if (pinnedItemKeys.has(itemKey)) {
    return LaunchpadBuckets.Pinned
  }
  if (isTrue(item.attention.readyToMerge)) {
    return LaunchpadBuckets.ReadyToMerge
  }
  if (
    item.attention.assignment.availability === 'value' &&
    item.attention.assignment.value === 'unassigned'
  ) {
    return LaunchpadBuckets.Unassigned
  }
  if (hasCIStatus(item, 'failed')) {
    return LaunchpadBuckets.CIFailing
  }
  if (
    item.attention.mergeConflict.availability === 'value' &&
    item.attention.mergeConflict.value === 'conflicted'
  ) {
    return LaunchpadBuckets.MergeConflicts
  }
  return null
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableValue).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableValue(value[key])}`)
      .join(',')}}`
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'number:NaN'
    }
    if (value === Number.POSITIVE_INFINITY) {
      return 'number:Infinity'
    }
    if (value === Number.NEGATIVE_INFINITY) {
      return 'number:-Infinity'
    }
    if (Object.is(value, -0)) {
      return 'number:-0'
    }
    return `number:${value}`
  }
  return `${typeof value}:${JSON.stringify(value) ?? String(value)}`
}

function availableFieldCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + availableFieldCount(entry), 0)
  }
  if (!isRecord(value)) {
    return 0
  }

  const own = value.availability === 'value' ? 1 : 0
  return (
    own +
    Object.values(value).reduce<number>(
      (total, entry) => total + availableFieldCount(entry),
      0
    )
  )
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareDedupeCandidates(
  left: LaunchpadItem,
  right: LaunchpadItem
): number {
  if (left.kind !== right.kind) {
    if (left.kind === 'pull-request') {
      return -1
    }
    if (right.kind === 'pull-request') {
      return 1
    }
  }

  const availabilityDifference =
    availableFieldCount(right) - availableFieldCount(left)
  if (availabilityDifference !== 0) {
    return availabilityDifference
  }

  return compareText(stableValue(left), stableValue(right))
}

/**
 * Collapse duplicate provider results without depending on input order. A
 * pull-request record supersedes its issue-shaped counterpart; otherwise the
 * candidate with more available fields wins, then a canonical value tie-break.
 */
export function deduplicateLaunchpadItems(
  items: ReadonlyArray<LaunchpadItem>
): ReadonlyArray<LaunchpadItem> {
  const candidates = [...items].sort((left, right) => {
    const keyComparison = compareText(
      createLaunchpadProviderItemKey(left.identity),
      createLaunchpadProviderItemKey(right.identity)
    )
    return keyComparison !== 0
      ? keyComparison
      : compareDedupeCandidates(left, right)
  })
  const unique = new Array<LaunchpadItem>()
  let previousKey: LaunchpadProviderItemKey | null = null

  for (const candidate of candidates) {
    const key = createLaunchpadProviderItemKey(candidate.identity)
    if (key !== previousKey) {
      unique.push(candidate)
      previousKey = key
    }
  }

  return unique
}

export interface ILaunchpadSection {
  readonly bucket: LaunchpadBucket
  readonly items: ReadonlyArray<LaunchpadItem>
}

export const LaunchpadMaximumOmittedItems = 256

export interface ILaunchpadSectionBuildResult {
  readonly sections: ReadonlyArray<ILaunchpadSection>
  /** Bounded sample of unsnoozed items which match no issue #128 section. */
  readonly omittedItems: ReadonlyArray<LaunchpadItem>
  /** Total unmatched count, including entries beyond the bounded sample. */
  readonly omittedItemCount: number
  readonly snoozedItemCount: number
}

/**
 * Dedupe and partition every unsnoozed item at most once. Unmatched items are
 * surfaced explicitly instead of being mislabeled as a sixth visible section.
 */
export function buildLaunchpadSections(
  items: ReadonlyArray<LaunchpadItem>,
  pinnedItemKeys: ReadonlySet<LaunchpadProviderItemKey>,
  snoozedItemKeys: ReadonlySet<LaunchpadProviderItemKey> = new Set()
): ILaunchpadSectionBuildResult {
  const sections = new Map<LaunchpadBucket, LaunchpadItem[]>()
  for (const bucket of LaunchpadBucketOrder) {
    sections.set(bucket, [])
  }

  const omittedItems = new Array<LaunchpadItem>()
  let omittedItemCount = 0
  let snoozedItemCount = 0
  for (const item of deduplicateLaunchpadItems(items)) {
    const itemKey = createLaunchpadProviderItemKey(item.identity)
    if (snoozedItemKeys.has(itemKey)) {
      snoozedItemCount++
      continue
    }

    const bucket = classifyLaunchpadItem(item, pinnedItemKeys)
    if (bucket === null) {
      omittedItemCount++
      if (omittedItems.length < LaunchpadMaximumOmittedItems) {
        omittedItems.push(item)
      }
      continue
    }
    sections.get(bucket)!.push(item)
  }

  return {
    sections: LaunchpadBucketOrder.map(bucket => ({
      bucket,
      items: sections.get(bucket)!,
    })),
    omittedItems,
    omittedItemCount,
    snoozedItemCount,
  }
}
