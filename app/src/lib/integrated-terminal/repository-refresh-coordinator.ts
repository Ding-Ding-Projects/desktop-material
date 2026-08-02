/**
 * Provider- and UI-independent refresh coordination for repository mutation
 * signals. Signal producers must report typed facts; this module never parses
 * terminal commands, output, or provider payloads.
 */

export const RepositoryRefreshRepositoryIdMaximumLength = 256
export const RepositoryRefreshCanonicalPathMaximumLength = 2_048
export const RepositoryRefreshFingerprintMaximumLength = 256
export const RepositoryRefreshIdentityKeyMaximumLength =
  2 *
    (RepositoryRefreshRepositoryIdMaximumLength +
      RepositoryRefreshCanonicalPathMaximumLength) +
  128

export const RepositoryRefreshDebounceMinimumMilliseconds = 0
export const RepositoryRefreshDebounceMaximumMilliseconds = 60_000
export const RepositoryRefreshDefaultDebounceMilliseconds = 125

export const RepositoryRefreshMaximumRepositoriesLimit = 1_024
export const RepositoryRefreshDefaultMaximumRepositories = 128
export const RepositoryRefreshMaximumReasonsPerRepositoryLimit = 64
export const RepositoryRefreshDefaultMaximumReasonsPerRepository = 16

const RepositoryRefreshIdentityVersion = 1
const identityControlCharacters = /[\u0000-\u001f\u007f]/
const fingerprintControlCharacters = /[\u0000-\u001f\u007f]/
const fullObjectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

export interface IRepositoryRefreshIdentity {
  readonly repositoryId: string
  readonly canonicalRepositoryPath: string
}

declare const repositoryRefreshIdentityKeyBrand: unique symbol

export type RepositoryRefreshIdentityKey = string & {
  readonly [repositoryRefreshIdentityKeyBrand]: true
}

export interface IRepositoryRefreshUnbornHead {
  readonly kind: 'unborn'
}

export interface IRepositoryRefreshCommitHead {
  readonly kind: 'commit'
  readonly oid: string
}

export type RepositoryRefreshHead =
  | IRepositoryRefreshUnbornHead
  | IRepositoryRefreshCommitHead

export interface IRepositoryRefreshSnapshot {
  readonly repository: IRepositoryRefreshIdentity
  readonly head: RepositoryRefreshHead
  readonly indexFingerprint: string
  readonly worktreeFingerprint: string
  readonly refsFingerprint: string
}

export const RepositoryRefreshDimensions = Object.freeze([
  'head',
  'index',
  'worktree',
  'refs',
  'unknown',
] as const)

export type RepositoryRefreshDimension =
  typeof RepositoryRefreshDimensions[number]

export type RepositoryRefreshKnownDimension = Exclude<
  RepositoryRefreshDimension,
  'unknown'
>

export interface IRepositoryRefreshSnapshotComparison {
  readonly equal: boolean
  readonly changed: boolean
  readonly headChanged: boolean
  readonly indexChanged: boolean
  readonly worktreeChanged: boolean
  readonly refsChanged: boolean
  readonly changedDimensions: ReadonlyArray<RepositoryRefreshKnownDimension>
}

export interface IRepositoryRefreshTerminalCompletedSignal {
  readonly type: 'terminal-completed'
  readonly before: IRepositoryRefreshSnapshot
  readonly after: IRepositoryRefreshSnapshot
}

export interface IRepositoryRefreshWatcherInvalidatedSignal {
  readonly type: 'watcher-invalidated'
  readonly repository: IRepositoryRefreshIdentity
  readonly dimensions: ReadonlyArray<RepositoryRefreshDimension>
}

export interface IRepositoryRefreshCLIWorkbenchCompletedSignal {
  readonly type: 'cli-workbench-completed'
  readonly repository: IRepositoryRefreshIdentity
  readonly dimensions: ReadonlyArray<RepositoryRefreshDimension>
}

export type RepositoryRefreshSignal =
  | IRepositoryRefreshTerminalCompletedSignal
  | IRepositoryRefreshWatcherInvalidatedSignal
  | IRepositoryRefreshCLIWorkbenchCompletedSignal

export type RepositoryRefreshReasonSource =
  | 'terminal-completed'
  | 'watcher-invalidated'
  | 'cli-workbench-completed'

export interface IRepositoryRefreshReason {
  readonly source: RepositoryRefreshReasonSource
  readonly dimension: RepositoryRefreshDimension
}

export interface IRepositoryRefreshScheduler {
  setTimeout(callback: () => void, delayMilliseconds: number): number
  clearTimeout(handle: number): void
}

export type RepositoryRefreshClock = () => number

export type RepositoryRefreshCallback = (
  repository: IRepositoryRefreshIdentity,
  reasons: ReadonlyArray<IRepositoryRefreshReason>
) => Promise<void>

export interface IRepositoryRefreshCoordinatorOptions {
  readonly scheduler: IRepositoryRefreshScheduler
  readonly clock: RepositoryRefreshClock
  readonly refresh: RepositoryRefreshCallback
  readonly debounceMilliseconds: number
  readonly maximumRepositories: number
  readonly maximumReasonsPerRepository: number
}

export type RepositoryRefreshSignalResult =
  | 'scheduled'
  | 'coalesced'
  | 'ignored-unchanged'
  | 'ignored-capacity'
  | 'ignored-disposed'

export type RepositoryRefreshOutcome = 'none' | 'succeeded' | 'failed'

export interface IRepositoryRefreshFailure {
  readonly kind: 'refresh-callback-failed'
  /** Exact epoch milliseconds, or null when the injected clock failed. */
  readonly at: number | null
}

export interface IRepositoryRefreshCoordinatorState {
  readonly disposed: boolean
  readonly tracked: boolean
  readonly pending: boolean
  readonly scheduled: boolean
  readonly inFlight: boolean
  readonly trailing: boolean
  readonly pendingReasonCount: number
  readonly inFlightReasonCount: number
  readonly retainedReasonCount: number
  readonly pendingDroppedReasonCount: number
  readonly inFlightDroppedReasonCount: number
  readonly droppedReasonCount: number
  readonly reasonsTruncated: boolean
  readonly lastOutcome: RepositoryRefreshOutcome
  readonly lastFailure: IRepositoryRefreshFailure | null
}

type ExactDataRecord = Readonly<Record<string, unknown>>

function exactDataRecord(
  value: unknown,
  expectedKeys: ReadonlyArray<string>
): ExactDataRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  try {
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      return null
    }
    const names = Object.getOwnPropertyNames(value).sort()
    const expected = [...expectedKeys].sort()
    if (
      names.length !== expected.length ||
      !expected.every((key, index) => names[index] === key)
    ) {
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

function isBoundedIdentitySegment(
  value: unknown,
  maximumLength: number
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    !identityControlCharacters.test(value) &&
    !hasUnpairedSurrogate(value)
  )
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) {
        return true
      }
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

export function isRepositoryRefreshIdentity(
  value: unknown
): value is IRepositoryRefreshIdentity {
  const record = exactDataRecord(value, [
    'canonicalRepositoryPath',
    'repositoryId',
  ])
  return (
    record !== null &&
    isBoundedIdentitySegment(
      record.repositoryId,
      RepositoryRefreshRepositoryIdMaximumLength
    ) &&
    isBoundedIdentitySegment(
      record.canonicalRepositoryPath,
      RepositoryRefreshCanonicalPathMaximumLength
    )
  )
}

export function createRepositoryRefreshIdentity(
  value: unknown
): IRepositoryRefreshIdentity {
  if (!isRepositoryRefreshIdentity(value)) {
    throw new TypeError('Repository refresh identity is invalid.')
  }

  return Object.freeze({
    repositoryId: value.repositoryId,
    canonicalRepositoryPath: value.canonicalRepositoryPath,
  })
}

function encodeRepositoryRefreshIdentityKey(
  identity: IRepositoryRefreshIdentity
): string {
  return JSON.stringify([
    'repository-refresh',
    RepositoryRefreshIdentityVersion,
    identity.repositoryId,
    identity.canonicalRepositoryPath,
  ])
}

export function createRepositoryRefreshIdentityKey(
  identity: IRepositoryRefreshIdentity
): RepositoryRefreshIdentityKey {
  return encodeRepositoryRefreshIdentityKey(
    createRepositoryRefreshIdentity(identity)
  ) as RepositoryRefreshIdentityKey
}

export function isRepositoryRefreshIdentityKey(
  value: unknown
): value is RepositoryRefreshIdentityKey {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > RepositoryRefreshIdentityKeyMaximumLength
  ) {
    return false
  }

  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 4 ||
      parsed[0] !== 'repository-refresh' ||
      parsed[1] !== RepositoryRefreshIdentityVersion
    ) {
      return false
    }
    const identity = {
      repositoryId: parsed[2],
      canonicalRepositoryPath: parsed[3],
    }
    return (
      isRepositoryRefreshIdentity(identity) &&
      encodeRepositoryRefreshIdentityKey(identity) === value
    )
  } catch {
    return false
  }
}

function createRepositoryRefreshHead(value: unknown): RepositoryRefreshHead {
  const unborn = exactDataRecord(value, ['kind'])
  if (unborn !== null && unborn.kind === 'unborn') {
    return Object.freeze({ kind: 'unborn' })
  }

  const commit = exactDataRecord(value, ['kind', 'oid'])
  if (
    commit !== null &&
    commit.kind === 'commit' &&
    typeof commit.oid === 'string' &&
    fullObjectId.test(commit.oid)
  ) {
    return Object.freeze({ kind: 'commit', oid: commit.oid.toLowerCase() })
  }

  throw new TypeError('Repository refresh head is invalid.')
}

function isFingerprint(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= RepositoryRefreshFingerprintMaximumLength &&
    value.trim().length > 0 &&
    !fingerprintControlCharacters.test(value) &&
    !hasUnpairedSurrogate(value)
  )
}

export function isRepositoryRefreshSnapshot(
  value: unknown
): value is IRepositoryRefreshSnapshot {
  const record = exactDataRecord(value, [
    'head',
    'indexFingerprint',
    'refsFingerprint',
    'repository',
    'worktreeFingerprint',
  ])
  if (
    record === null ||
    !isRepositoryRefreshIdentity(record.repository) ||
    !isFingerprint(record.indexFingerprint) ||
    !isFingerprint(record.worktreeFingerprint) ||
    !isFingerprint(record.refsFingerprint)
  ) {
    return false
  }

  try {
    createRepositoryRefreshHead(record.head)
    return true
  } catch {
    return false
  }
}

export function createRepositoryRefreshSnapshot(
  value: unknown
): IRepositoryRefreshSnapshot {
  const record = exactDataRecord(value, [
    'head',
    'indexFingerprint',
    'refsFingerprint',
    'repository',
    'worktreeFingerprint',
  ])
  if (
    record === null ||
    !isRepositoryRefreshIdentity(record.repository) ||
    !isFingerprint(record.indexFingerprint) ||
    !isFingerprint(record.worktreeFingerprint) ||
    !isFingerprint(record.refsFingerprint)
  ) {
    throw new TypeError('Repository refresh snapshot is invalid.')
  }

  return Object.freeze({
    repository: createRepositoryRefreshIdentity(record.repository),
    head: createRepositoryRefreshHead(record.head),
    indexFingerprint: record.indexFingerprint,
    worktreeFingerprint: record.worktreeFingerprint,
    refsFingerprint: record.refsFingerprint,
  })
}

function headsEqual(
  left: RepositoryRefreshHead,
  right: RepositoryRefreshHead
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'unborn' ||
      (right.kind === 'commit' &&
        left.oid.toLowerCase() === right.oid.toLowerCase()))
  )
}

export function compareRepositoryRefreshSnapshots(
  leftValue: IRepositoryRefreshSnapshot,
  rightValue: IRepositoryRefreshSnapshot
): IRepositoryRefreshSnapshotComparison {
  const left = createRepositoryRefreshSnapshot(leftValue)
  const right = createRepositoryRefreshSnapshot(rightValue)
  if (
    createRepositoryRefreshIdentityKey(left.repository) !==
    createRepositoryRefreshIdentityKey(right.repository)
  ) {
    throw new RangeError(
      'Repository refresh snapshots belong to different repositories.'
    )
  }

  const headChanged = !headsEqual(left.head, right.head)
  const indexChanged = left.indexFingerprint !== right.indexFingerprint
  const worktreeChanged = left.worktreeFingerprint !== right.worktreeFingerprint
  const refsChanged = left.refsFingerprint !== right.refsFingerprint
  const changedDimensions = new Array<RepositoryRefreshKnownDimension>()
  if (headChanged) {
    changedDimensions.push('head')
  }
  if (indexChanged) {
    changedDimensions.push('index')
  }
  if (worktreeChanged) {
    changedDimensions.push('worktree')
  }
  if (refsChanged) {
    changedDimensions.push('refs')
  }

  return Object.freeze({
    equal: changedDimensions.length === 0,
    changed: changedDimensions.length > 0,
    headChanged,
    indexChanged,
    worktreeChanged,
    refsChanged,
    changedDimensions: Object.freeze(changedDimensions),
  })
}

export function repositoryRefreshSnapshotsEqual(
  left: IRepositoryRefreshSnapshot,
  right: IRepositoryRefreshSnapshot
): boolean {
  return !compareRepositoryRefreshSnapshots(left, right).changed
}

function isRepositoryRefreshDimension(
  value: unknown
): value is RepositoryRefreshDimension {
  return (
    typeof value === 'string' &&
    (RepositoryRefreshDimensions as ReadonlyArray<string>).includes(value)
  )
}

function createDimensions(
  value: unknown
): ReadonlyArray<RepositoryRefreshDimension> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      'Repository refresh signal dimensions must be a nonempty array.'
    )
  }

  const dimensions = new Array<RepositoryRefreshDimension>()
  const seen = new Set<RepositoryRefreshDimension>()
  for (const dimension of value) {
    if (!isRepositoryRefreshDimension(dimension) || seen.has(dimension)) {
      throw new TypeError(
        'Repository refresh signal dimensions are invalid or duplicated.'
      )
    }
    seen.add(dimension)
    dimensions.push(dimension)
  }
  return Object.freeze(dimensions)
}

interface IParsedRepositoryRefreshSignal {
  readonly repository: IRepositoryRefreshIdentity
  readonly reasons: ReadonlyArray<IRepositoryRefreshReason>
  readonly unchangedTerminal: boolean
}

function reason(
  source: RepositoryRefreshReasonSource,
  dimension: RepositoryRefreshDimension
): IRepositoryRefreshReason {
  return Object.freeze({ source, dimension })
}

function parseRepositoryRefreshSignal(
  value: unknown
): IParsedRepositoryRefreshSignal {
  const terminal = exactDataRecord(value, ['after', 'before', 'type'])
  if (terminal !== null && terminal.type === 'terminal-completed') {
    const before = createRepositoryRefreshSnapshot(terminal.before)
    const after = createRepositoryRefreshSnapshot(terminal.after)
    const comparison = compareRepositoryRefreshSnapshots(before, after)
    return {
      repository: after.repository,
      reasons: Object.freeze(
        comparison.changedDimensions.map(dimension =>
          reason('terminal-completed', dimension)
        )
      ),
      unchangedTerminal: !comparison.changed,
    }
  }

  const invalidation = exactDataRecord(value, [
    'dimensions',
    'repository',
    'type',
  ])
  if (
    invalidation !== null &&
    (invalidation.type === 'watcher-invalidated' ||
      invalidation.type === 'cli-workbench-completed')
  ) {
    const repository = createRepositoryRefreshIdentity(invalidation.repository)
    const dimensions = createDimensions(invalidation.dimensions)
    const source =
      invalidation.type === 'watcher-invalidated'
        ? 'watcher-invalidated'
        : 'cli-workbench-completed'
    return {
      repository,
      reasons: Object.freeze(
        dimensions.map(dimension => reason(source, dimension))
      ),
      unchangedTerminal: false,
    }
  }

  throw new TypeError('Repository refresh signal is invalid.')
}

function reasonKey(value: IRepositoryRefreshReason): string {
  return JSON.stringify([value.source, value.dimension])
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== 'number') {
    throw new TypeError(label + ' must be a number.')
  }
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      label + ' must be an integer between ' + minimum + ' and ' + maximum + '.'
    )
  }
  return value
}

function validateOptions(
  value: IRepositoryRefreshCoordinatorOptions
): IRepositoryRefreshCoordinatorOptions {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Repository refresh coordinator options are invalid.')
  }
  if (
    typeof value.scheduler !== 'object' ||
    value.scheduler === null ||
    typeof value.scheduler.setTimeout !== 'function' ||
    typeof value.scheduler.clearTimeout !== 'function' ||
    typeof value.clock !== 'function' ||
    typeof value.refresh !== 'function'
  ) {
    throw new TypeError(
      'Repository refresh coordinator dependencies are invalid.'
    )
  }

  const debounceMilliseconds = boundedInteger(
    value.debounceMilliseconds,
    'debounceMilliseconds',
    RepositoryRefreshDebounceMinimumMilliseconds,
    RepositoryRefreshDebounceMaximumMilliseconds
  )
  const maximumRepositories = boundedInteger(
    value.maximumRepositories,
    'maximumRepositories',
    1,
    RepositoryRefreshMaximumRepositoriesLimit
  )
  const maximumReasonsPerRepository = boundedInteger(
    value.maximumReasonsPerRepository,
    'maximumReasonsPerRepository',
    1,
    RepositoryRefreshMaximumReasonsPerRepositoryLimit
  )
  const scheduler = value.scheduler
  return Object.freeze({
    scheduler: Object.freeze({
      setTimeout: scheduler.setTimeout.bind(scheduler),
      clearTimeout: scheduler.clearTimeout.bind(scheduler),
    }),
    clock: value.clock,
    refresh: value.refresh,
    debounceMilliseconds,
    maximumRepositories,
    maximumReasonsPerRepository,
  })
}

function readClock(clock: RepositoryRefreshClock): number {
  let value: unknown
  try {
    value = clock()
  } catch {
    throw new TypeError('Repository refresh clock threw an exception.')
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'Repository refresh clock must return nonnegative epoch milliseconds.'
    )
  }
  return value
}

interface IRepositoryRefreshTimer {
  handle: number | null
  readonly token: number
}

interface IRepositoryRefreshRun {
  readonly token: number
  readonly reasonCount: number
  readonly droppedReasonCount: number
}

interface IRepositoryRefreshEntry {
  readonly identity: IRepositoryRefreshIdentity
  readonly pendingReasons: Map<string, IRepositoryRefreshReason>
  readonly droppedReasonKeys: Set<string>
  timer: IRepositoryRefreshTimer | null
  inFlight: IRepositoryRefreshRun | null
  trailing: boolean
  lastOutcome: RepositoryRefreshOutcome
  lastFailure: IRepositoryRefreshFailure | null
}

const EmptyState: IRepositoryRefreshCoordinatorState = Object.freeze({
  disposed: false,
  tracked: false,
  pending: false,
  scheduled: false,
  inFlight: false,
  trailing: false,
  pendingReasonCount: 0,
  inFlightReasonCount: 0,
  retainedReasonCount: 0,
  pendingDroppedReasonCount: 0,
  inFlightDroppedReasonCount: 0,
  droppedReasonCount: 0,
  reasonsTruncated: false,
  lastOutcome: 'none',
  lastFailure: null,
})

export class RepositoryRefreshCoordinator {
  private readonly options: IRepositoryRefreshCoordinatorOptions
  private readonly entries = new Map<
    RepositoryRefreshIdentityKey,
    IRepositoryRefreshEntry
  >()
  private disposed = false
  private nextTimerToken = 1
  private nextRunToken = 1
  private readonly timerCallbacks = new Array<() => void>()
  private drainingTimerCallbacks = false

  public constructor(options: IRepositoryRefreshCoordinatorOptions) {
    this.options = validateOptions(options)
  }

  public signal(signal: RepositoryRefreshSignal): RepositoryRefreshSignalResult
  public signal(signal: unknown): RepositoryRefreshSignalResult
  public signal(signal: unknown): RepositoryRefreshSignalResult {
    const parsed = parseRepositoryRefreshSignal(signal)
    if (this.disposed) {
      return 'ignored-disposed'
    }
    if (parsed.unchangedTerminal) {
      return 'ignored-unchanged'
    }

    const key = createRepositoryRefreshIdentityKey(parsed.repository)
    let entry = this.entries.get(key)
    if (entry === undefined) {
      if (!this.makeCapacity()) {
        return 'ignored-capacity'
      }
      entry = {
        identity: parsed.repository,
        pendingReasons: new Map(),
        droppedReasonKeys: new Set(),
        timer: null,
        inFlight: null,
        trailing: false,
        lastOutcome: 'none',
        lastFailure: null,
      }
      this.entries.set(key, entry)
    } else {
      this.touch(key, entry)
    }

    this.addReasons(entry, parsed.reasons)
    if (entry.inFlight !== null) {
      entry.trailing = true
      return 'coalesced'
    }

    const coalesced = entry.timer !== null
    this.schedule(key, entry)
    return coalesced ? 'coalesced' : 'scheduled'
  }

  public getState(
    identity: IRepositoryRefreshIdentity
  ): IRepositoryRefreshCoordinatorState
  public getState(identity: unknown): IRepositoryRefreshCoordinatorState
  public getState(identity: unknown): IRepositoryRefreshCoordinatorState {
    const validated = createRepositoryRefreshIdentity(identity)
    if (this.disposed) {
      return Object.freeze({ ...EmptyState, disposed: true })
    }

    const key = createRepositoryRefreshIdentityKey(validated)
    const entry = this.entries.get(key)
    if (entry === undefined) {
      return EmptyState
    }

    const pendingReasonCount = entry.pendingReasons.size
    const inFlightReasonCount = entry.inFlight?.reasonCount ?? 0
    const pendingDroppedReasonCount = entry.droppedReasonKeys.size
    const inFlightDroppedReasonCount = entry.inFlight?.droppedReasonCount ?? 0
    const lastFailure =
      entry.lastFailure === null
        ? null
        : Object.freeze({ ...entry.lastFailure })
    return Object.freeze({
      disposed: false,
      tracked: true,
      pending: entry.pendingReasons.size > 0 || entry.trailing,
      scheduled: entry.timer !== null,
      inFlight: entry.inFlight !== null,
      trailing: entry.trailing,
      pendingReasonCount,
      inFlightReasonCount,
      retainedReasonCount: pendingReasonCount + inFlightReasonCount,
      pendingDroppedReasonCount,
      inFlightDroppedReasonCount,
      droppedReasonCount:
        pendingDroppedReasonCount + inFlightDroppedReasonCount,
      reasonsTruncated:
        pendingDroppedReasonCount > 0 || inFlightDroppedReasonCount > 0,
      lastOutcome: entry.lastOutcome,
      lastFailure,
    })
  }

  public dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    for (const entry of this.entries.values()) {
      this.clearTimer(entry)
    }
    this.entries.clear()
  }

  private makeCapacity(): boolean {
    if (this.entries.size < this.options.maximumRepositories) {
      return true
    }

    for (const [key, entry] of this.entries) {
      if (
        entry.timer === null &&
        entry.inFlight === null &&
        entry.pendingReasons.size === 0
      ) {
        this.entries.delete(key)
        return true
      }
    }
    return false
  }

  private touch(
    key: RepositoryRefreshIdentityKey,
    entry: IRepositoryRefreshEntry
  ): void {
    this.entries.delete(key)
    this.entries.set(key, entry)
  }

  private addReasons(
    entry: IRepositoryRefreshEntry,
    reasons: ReadonlyArray<IRepositoryRefreshReason>
  ): void {
    for (const candidate of reasons) {
      const key = reasonKey(candidate)
      if (entry.pendingReasons.has(key) || entry.droppedReasonKeys.has(key)) {
        continue
      }
      if (
        entry.pendingReasons.size < this.options.maximumReasonsPerRepository
      ) {
        entry.pendingReasons.set(key, candidate)
      } else {
        entry.droppedReasonKeys.add(key)
      }
    }
  }

  private schedule(
    key: RepositoryRefreshIdentityKey,
    entry: IRepositoryRefreshEntry,
    delayMilliseconds = this.options.debounceMilliseconds
  ): void {
    this.clearTimer(entry)
    const token = this.nextTimerToken++
    const timer: IRepositoryRefreshTimer = { handle: null, token }
    entry.timer = timer

    let handle: number
    try {
      handle = this.options.scheduler.setTimeout(
        () => this.dispatchTimerCallback(() => this.onTimer(key, entry, token)),
        delayMilliseconds
      )
    } catch (error) {
      if (entry.timer === timer) {
        entry.timer = null
      }
      throw error
    }
    if (!Number.isSafeInteger(handle)) {
      if (entry.timer === timer) {
        entry.timer = null
      }
      throw new TypeError(
        'Repository refresh scheduler returned an invalid timer handle.'
      )
    }
    if (entry.timer === timer) {
      timer.handle = handle
    }
  }

  private clearTimer(entry: IRepositoryRefreshEntry): void {
    const timer = entry.timer
    if (timer === null) {
      return
    }
    entry.timer = null
    if (timer.handle === null) {
      return
    }
    try {
      this.options.scheduler.clearTimeout(timer.handle)
    } catch {
      // Disposal and rescheduling remain safe if a scheduler is shutting down.
    }
  }

  private dispatchTimerCallback(callback: () => void): void {
    this.timerCallbacks.push(callback)
    if (this.drainingTimerCallbacks) {
      return
    }

    this.drainingTimerCallbacks = true
    try {
      while (this.timerCallbacks.length > 0) {
        this.timerCallbacks.shift()!()
      }
    } finally {
      this.drainingTimerCallbacks = false
    }
  }

  private onTimer(
    key: RepositoryRefreshIdentityKey,
    entry: IRepositoryRefreshEntry,
    token: number
  ): void {
    if (
      this.disposed ||
      this.entries.get(key) !== entry ||
      entry.timer?.token !== token
    ) {
      return
    }
    entry.timer = null
    this.startRefresh(key, entry)
  }

  private startRefresh(
    key: RepositoryRefreshIdentityKey,
    entry: IRepositoryRefreshEntry
  ): void {
    if (
      this.disposed ||
      this.entries.get(key) !== entry ||
      entry.inFlight !== null ||
      entry.pendingReasons.size === 0
    ) {
      return
    }

    const reasons = Object.freeze(
      Array.from(entry.pendingReasons.values(), candidate =>
        Object.freeze({ ...candidate })
      )
    )
    const run: IRepositoryRefreshRun = {
      token: this.nextRunToken++,
      reasonCount: reasons.length,
      droppedReasonCount: entry.droppedReasonKeys.size,
    }
    entry.pendingReasons.clear()
    entry.droppedReasonKeys.clear()
    entry.trailing = false
    entry.inFlight = run

    let refresh: Promise<void>
    try {
      refresh = this.options.refresh(entry.identity, reasons)
    } catch {
      this.finishRefresh(key, entry, run, false)
      return
    }

    void Promise.resolve(refresh).then(
      () => this.finishRefresh(key, entry, run, true),
      () => this.finishRefresh(key, entry, run, false)
    )
  }

  private finishRefresh(
    key: RepositoryRefreshIdentityKey,
    entry: IRepositoryRefreshEntry,
    run: IRepositoryRefreshRun,
    succeeded: boolean
  ): void {
    if (
      this.disposed ||
      this.entries.get(key) !== entry ||
      entry.inFlight?.token !== run.token
    ) {
      return
    }

    entry.inFlight = null
    entry.lastOutcome = succeeded ? 'succeeded' : 'failed'
    if (succeeded) {
      entry.lastFailure = null
    } else {
      entry.lastFailure = Object.freeze({
        kind: 'refresh-callback-failed',
        at: this.containedClock(),
      })
    }

    if (entry.trailing && entry.pendingReasons.size > 0) {
      try {
        this.schedule(key, entry, 0)
      } catch {
        // Retain the pending/trailing state so the next trusted signal can
        // retry scheduling without leaking the refresh failure.
      }
    } else {
      entry.trailing = false
      this.touch(key, entry)
    }
  }

  private containedClock(): number | null {
    try {
      return readClock(this.options.clock)
    } catch {
      // A failing diagnostic clock cannot turn a contained refresh rejection
      // into an unhandled rejection or relabel a stale timestamp as exact.
      return null
    }
  }
}
