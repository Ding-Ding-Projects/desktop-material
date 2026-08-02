/**
 * Pure, provider-independent planning for a future interactive-rebase editor.
 *
 * This module deliberately has no Git, shell, process, filesystem, IPC, or
 * network capability. It validates reviewed commit metadata, owns immutable
 * plan transformations, and renders only the fixed action/object-id pairs a
 * later executor may choose to hand to Git.
 */

/** The largest reviewed commit set one plan accepts. */
export const MaximumInteractiveRebaseCommits = 50

/** The maximum UTF-8 size of one display-only commit subject. */
export const MaximumInteractiveRebaseSubjectBytes = 2 * 1024

/**
 * The exact largest todo the bounded model can produce: `squash`, one space,
 * one 64-hex object id, and one LF for every allowed commit.
 */
export const MaximumInteractiveRebaseTodoBytes =
  MaximumInteractiveRebaseCommits * ('squash'.length + 1 + 64 + 1)

/** Every executable word this model permits in a rebase todo. */
export const InteractiveRebaseActions = Object.freeze([
  'pick',
  'reword',
  'edit',
  'squash',
  'fixup',
  'drop',
] as const)

export type InteractiveRebaseAction = typeof InteractiveRebaseActions[number]

export type InteractiveRebaseObjectIdWidth = 40 | 64

/** Untrusted constructor input. Derived facts are deliberately not accepted. */
export interface IInteractiveRebasePlanEntryInput {
  readonly commitId: string
  readonly action: InteractiveRebaseAction
  readonly subject: string
}

/** A reviewed commit set entry used to authorize todo parsing. */
export interface IInteractiveRebaseAllowedCommit {
  readonly commitId: string
  readonly subject: string
}

/** One immutable row for a later editor. */
export interface IInteractiveRebasePlanEntry
  extends IInteractiveRebasePlanEntryInput {
  /** Reword and edit deliberately stop replay for user input or inspection. */
  readonly pauseRequired: boolean
}

export interface IInteractiveRebaseActionCounts {
  readonly pick: number
  readonly reword: number
  readonly edit: number
  readonly squash: number
  readonly fixup: number
  readonly drop: number
}

/** Deterministic facts a later UI can render without reinterpreting actions. */
export interface IInteractiveRebasePlanSummary {
  readonly totalCount: number
  readonly effectiveCount: number
  readonly droppedCount: number
  readonly foldedCount: number
  readonly requiresPause: boolean
  readonly pauseRequiredCount: number
  readonly pauseRequiredCommitIds: ReadonlyArray<string>
  readonly reordered: boolean
  readonly actionCounts: IInteractiveRebaseActionCounts
}

/** A deeply immutable, completely validated interactive-rebase plan. */
export interface IInteractiveRebasePlan {
  readonly objectIdWidth: InteractiveRebaseObjectIdWidth
  /** The reviewed order, retained even after an explicit reorder operation. */
  readonly reviewedCommitIds: ReadonlyArray<string>
  /** The current todo order. */
  readonly entries: ReadonlyArray<IInteractiveRebasePlanEntry>
  readonly summary: IInteractiveRebasePlanSummary
}

export type InteractiveRebasePlanErrorCode =
  | 'invalid-shape'
  | 'too-many-commits'
  | 'invalid-commit-id'
  | 'zero-commit-id'
  | 'mixed-object-id-width'
  | 'duplicate-commit-id'
  | 'invalid-subject'
  | 'invalid-action'
  | 'invalid-plan'
  | 'unknown-commit'
  | 'invalid-operation'
  | 'invalid-todo'

export class InteractiveRebasePlanError extends Error {
  public constructor(
    public readonly code: InteractiveRebasePlanErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'InteractiveRebasePlanError'
  }
}

interface IParsedCommitId {
  readonly value: string
  readonly width: InteractiveRebaseObjectIdWidth
}

const TextBytes = new TextEncoder()
const ObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const UnsafeSubjectPattern =
  /[\u0000-\u001f\u007f-\u009f\ud800-\udfff\u2028\u2029\u202a-\u202e\u2066-\u2069]/u
const TodoControlPattern =
  /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/u
const InputEntryKeys = Object.freeze(['commitId', 'action', 'subject'] as const)
const AllowedCommitKeys = Object.freeze(['commitId', 'subject'] as const)
const PlanEntryKeys = Object.freeze([
  'commitId',
  'action',
  'subject',
  'pauseRequired',
] as const)
const PlanKeys = Object.freeze([
  'objectIdWidth',
  'reviewedCommitIds',
  'entries',
  'summary',
] as const)

function fail(code: InteractiveRebasePlanErrorCode, message: string): never {
  throw new InteractiveRebasePlanError(code, message)
}

function readExactRecord(
  value: unknown,
  expectedKeys: ReadonlyArray<string>
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('invalid-shape', 'The rebase plan has an invalid object shape.')
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    fail('invalid-shape', 'The rebase plan has an invalid object shape.')
  }

  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== expectedKeys.length ||
    keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
  ) {
    fail('invalid-shape', 'The rebase plan contains unknown or missing fields.')
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of expectedKeys) {
    const descriptor = descriptors[key]
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      fail('invalid-shape', 'The rebase plan has an invalid object shape.')
    }
  }

  return value as Readonly<Record<string, unknown>>
}

function readDenseArray(
  value: unknown,
  maximumLength: number
): ReadonlyArray<unknown> {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    fail('invalid-shape', 'The rebase plan entries must be an array.')
  }
  if (value.length === 0) {
    fail('invalid-plan', 'The rebase plan must contain at least one commit.')
  }
  if (value.length > maximumLength) {
    fail(
      'too-many-commits',
      `The rebase plan may contain at most ${maximumLength} commits.`
    )
  }

  const expectedKeys = new Set<string>(['length'])
  for (let index = 0; index < value.length; index++) {
    expectedKeys.add(String(index))
  }
  const actualKeys = Reflect.ownKeys(value)
  if (
    actualKeys.length !== expectedKeys.size ||
    actualKeys.some(key => typeof key !== 'string' || !expectedKeys.has(key))
  ) {
    fail(
      'invalid-shape',
      'The rebase plan array is sparse or has surplus data.'
    )
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
  ) {
    fail('invalid-shape', 'The rebase plan array has invalid properties.')
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      fail('invalid-shape', 'The rebase plan array has invalid properties.')
    }
  }

  return value
}

function parseCommitId(value: unknown): IParsedCommitId {
  if (typeof value !== 'string' || !ObjectIdPattern.test(value)) {
    fail(
      'invalid-commit-id',
      'Each commit must use one exact lowercase 40- or 64-hex object id.'
    )
  }
  if (/^0+$/.test(value)) {
    fail('zero-commit-id', 'The all-zero object id is not a commit identity.')
  }

  return {
    value,
    width: value.length as InteractiveRebaseObjectIdWidth,
  }
}

function isAction(value: unknown): value is InteractiveRebaseAction {
  return (
    typeof value === 'string' &&
    (InteractiveRebaseActions as ReadonlyArray<string>).includes(value)
  )
}

/**
 * Canonicalize safe one-line display metadata. Control, newline, bidi-control,
 * and oversized input fails closed instead of being silently reinterpreted.
 */
export function sanitizeInteractiveRebaseSubject(value: unknown): string {
  if (typeof value !== 'string') {
    fail(
      'invalid-subject',
      'Commit subjects must be bounded single-line text without controls.'
    )
  }
  if (
    value.length > MaximumInteractiveRebaseSubjectBytes ||
    TextBytes.encode(value).byteLength > MaximumInteractiveRebaseSubjectBytes
  ) {
    fail(
      'invalid-subject',
      `Commit subjects may use at most ${MaximumInteractiveRebaseSubjectBytes} UTF-8 bytes.`
    )
  }
  if (UnsafeSubjectPattern.test(value)) {
    fail(
      'invalid-subject',
      'Commit subjects must be bounded single-line text without controls.'
    )
  }

  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim()
  const subject = normalized.length === 0 ? '(no subject)' : normalized
  if (
    TextBytes.encode(subject).byteLength > MaximumInteractiveRebaseSubjectBytes
  ) {
    fail(
      'invalid-subject',
      `Commit subjects may use at most ${MaximumInteractiveRebaseSubjectBytes} UTF-8 bytes.`
    )
  }

  return subject
}

function pauseRequired(action: InteractiveRebaseAction): boolean {
  return action === 'reword' || action === 'edit'
}

function parseEntryInputs(
  input: unknown
): ReadonlyArray<IInteractiveRebasePlanEntry> {
  const values = readDenseArray(input, MaximumInteractiveRebaseCommits)
  const entries = new Array<IInteractiveRebasePlanEntry>()
  const seen = new Set<string>()
  let objectIdWidth: InteractiveRebaseObjectIdWidth | null = null

  for (const value of values) {
    const record = readExactRecord(value, InputEntryKeys)
    const parsedId = parseCommitId(record.commitId)
    if (objectIdWidth !== null && parsedId.width !== objectIdWidth) {
      fail(
        'mixed-object-id-width',
        'One rebase plan cannot mix SHA-1 and SHA-256 object ids.'
      )
    }
    objectIdWidth = parsedId.width
    if (seen.has(parsedId.value)) {
      fail(
        'duplicate-commit-id',
        'Each reviewed commit must occur exactly once.'
      )
    }
    seen.add(parsedId.value)

    if (!isAction(record.action)) {
      fail('invalid-action', 'The rebase plan contains an unknown action.')
    }

    entries.push(
      Object.freeze({
        commitId: parsedId.value,
        action: record.action,
        subject: sanitizeInteractiveRebaseSubject(record.subject),
        pauseRequired: pauseRequired(record.action),
      })
    )
  }

  validateActionSequence(entries)
  return entries
}

function parsePlanEntries(
  input: unknown
): ReadonlyArray<IInteractiveRebasePlanEntry> {
  const values = readDenseArray(input, MaximumInteractiveRebaseCommits)
  const plainInputs = values.map(value => {
    const record = readExactRecord(value, PlanEntryKeys)
    if (typeof record.pauseRequired !== 'boolean') {
      fail('invalid-shape', 'The rebase plan contains an invalid pause fact.')
    }
    return {
      commitId: record.commitId,
      action: record.action,
      subject: record.subject,
      suppliedPauseRequired: record.pauseRequired,
    }
  })

  const entries = parseEntryInputs(
    plainInputs.map(input => ({
      commitId: input.commitId,
      action: input.action,
      subject: input.subject,
    }))
  )
  for (let index = 0; index < entries.length; index++) {
    if (
      entries[index].pauseRequired !== plainInputs[index].suppliedPauseRequired
    ) {
      fail('invalid-shape', 'The rebase plan contains an invalid pause fact.')
    }
  }
  return entries
}

function validateActionSequence(
  entries: ReadonlyArray<IInteractiveRebasePlanEntry>
): void {
  let hasEffectivePredecessor = false

  for (const entry of entries) {
    if (entry.action === 'drop') {
      continue
    }

    if (
      (entry.action === 'squash' || entry.action === 'fixup') &&
      !hasEffectivePredecessor
    ) {
      fail(
        'invalid-plan',
        'Squash and fixup require an earlier non-dropped commit.'
      )
    }

    hasEffectivePredecessor = true
  }

  if (!hasEffectivePredecessor) {
    fail('invalid-plan', 'Keep at least one commit in the rebase plan.')
  }
}

function parseReviewedCommitIds(
  input: unknown,
  expectedWidth: InteractiveRebaseObjectIdWidth,
  expectedEntries: ReadonlyArray<IInteractiveRebasePlanEntry>
): ReadonlyArray<string> {
  const values = readDenseArray(input, MaximumInteractiveRebaseCommits)
  if (values.length !== expectedEntries.length) {
    fail('invalid-plan', 'The reviewed commit identity set changed.')
  }

  const expected = new Set(expectedEntries.map(entry => entry.commitId))
  const seen = new Set<string>()
  const commitIds = values.map(value => {
    const parsed = parseCommitId(value)
    if (parsed.width !== expectedWidth) {
      fail(
        'mixed-object-id-width',
        'One rebase plan cannot mix SHA-1 and SHA-256 object ids.'
      )
    }
    if (!expected.has(parsed.value) || seen.has(parsed.value)) {
      fail('invalid-plan', 'The reviewed commit identity set changed.')
    }
    seen.add(parsed.value)
    return parsed.value
  })

  if (seen.size !== expected.size) {
    fail('invalid-plan', 'The reviewed commit identity set changed.')
  }
  return commitIds
}

function summarize(
  entries: ReadonlyArray<IInteractiveRebasePlanEntry>,
  reviewedCommitIds: ReadonlyArray<string>
): IInteractiveRebasePlanSummary {
  const mutableCounts: Record<InteractiveRebaseAction, number> = {
    pick: 0,
    reword: 0,
    edit: 0,
    squash: 0,
    fixup: 0,
    drop: 0,
  }
  const pauseRequiredCommitIds = new Array<string>()

  for (const entry of entries) {
    mutableCounts[entry.action]++
    if (entry.pauseRequired) {
      pauseRequiredCommitIds.push(entry.commitId)
    }
  }

  const actionCounts = Object.freeze({ ...mutableCounts })
  return Object.freeze({
    totalCount: entries.length,
    effectiveCount: entries.length - actionCounts.drop,
    droppedCount: actionCounts.drop,
    foldedCount: actionCounts.squash + actionCounts.fixup,
    requiresPause: pauseRequiredCommitIds.length > 0,
    pauseRequiredCount: pauseRequiredCommitIds.length,
    pauseRequiredCommitIds: Object.freeze(pauseRequiredCommitIds),
    reordered: entries.some(
      (entry, index) => entry.commitId !== reviewedCommitIds[index]
    ),
    actionCounts,
  })
}

function buildPlan(
  sourceEntries: ReadonlyArray<IInteractiveRebasePlanEntry>,
  sourceReviewedCommitIds: ReadonlyArray<string>
): IInteractiveRebasePlan {
  const entries = Object.freeze(
    sourceEntries.map(entry =>
      Object.freeze({
        commitId: entry.commitId,
        action: entry.action,
        subject: entry.subject,
        pauseRequired: entry.pauseRequired,
      })
    )
  )
  validateActionSequence(entries)
  const objectIdWidth = parseCommitId(entries[0].commitId).width
  const reviewedCommitIds = Object.freeze(
    parseReviewedCommitIds(sourceReviewedCommitIds, objectIdWidth, entries)
  )

  return Object.freeze({
    objectIdWidth,
    reviewedCommitIds,
    entries,
    summary: summarize(entries, reviewedCommitIds),
  })
}

function canonicalizePlan(
  input: IInteractiveRebasePlan
): IInteractiveRebasePlan {
  const record = readExactRecord(input, PlanKeys)
  const entries = parsePlanEntries(record.entries)
  const width = parseCommitId(entries[0].commitId).width
  if (record.objectIdWidth !== width) {
    fail('invalid-plan', 'The rebase plan object-id width changed.')
  }
  const reviewedCommitIds = parseReviewedCommitIds(
    record.reviewedCommitIds,
    width,
    entries
  )
  return buildPlan(entries, reviewedCommitIds)
}

/** Validate, canonicalize, copy, and deeply freeze a complete plan. */
export function createInteractiveRebasePlan(
  input: unknown
): IInteractiveRebasePlan {
  const entries = parseEntryInputs(input)
  return buildPlan(
    entries,
    entries.map(entry => entry.commitId)
  )
}

/** Update one action by exact commit identity without changing plan order. */
export function updateInteractiveRebaseAction(
  input: IInteractiveRebasePlan,
  commitId: string,
  action: InteractiveRebaseAction
): IInteractiveRebasePlan {
  const plan = canonicalizePlan(input)
  const parsedId = parseCommitId(commitId)
  if (parsedId.width !== plan.objectIdWidth) {
    fail('unknown-commit', 'The requested commit is not part of this plan.')
  }
  if (!isAction(action)) {
    fail('invalid-action', 'The rebase plan contains an unknown action.')
  }

  let found = false
  const entries = plan.entries.map(entry => {
    if (entry.commitId !== parsedId.value) {
      return entry
    }
    found = true
    return Object.freeze({
      ...entry,
      action,
      pauseRequired: pauseRequired(action),
    })
  })
  if (!found) {
    fail('unknown-commit', 'The requested commit is not part of this plan.')
  }

  return buildPlan(entries, plan.reviewedCommitIds)
}

/**
 * Move one commit before another exact commit id, or to the end when
 * `beforeCommitId` is null. No index is accepted at the API boundary.
 */
export function reorderInteractiveRebaseCommit(
  input: IInteractiveRebasePlan,
  commitId: string,
  beforeCommitId: string | null
): IInteractiveRebasePlan {
  const plan = canonicalizePlan(input)
  const movingId = parseCommitId(commitId)
  if (movingId.width !== plan.objectIdWidth) {
    fail('unknown-commit', 'The requested commit is not part of this plan.')
  }
  if (beforeCommitId === movingId.value) {
    fail('invalid-operation', 'A commit cannot be moved before itself.')
  }

  const entries = [...plan.entries]
  const sourceIndex = entries.findIndex(
    entry => entry.commitId === movingId.value
  )
  if (sourceIndex < 0) {
    fail('unknown-commit', 'The requested commit is not part of this plan.')
  }

  const [moving] = entries.splice(sourceIndex, 1)
  if (beforeCommitId === null) {
    entries.push(moving)
  } else {
    const targetId = parseCommitId(beforeCommitId)
    if (targetId.width !== plan.objectIdWidth) {
      fail('unknown-commit', 'The requested commit is not part of this plan.')
    }
    const targetIndex = entries.findIndex(
      entry => entry.commitId === targetId.value
    )
    if (targetIndex < 0) {
      fail('unknown-commit', 'The requested commit is not part of this plan.')
    }
    entries.splice(targetIndex, 0, moving)
  }

  return buildPlan(entries, plan.reviewedCommitIds)
}

/** Serialize only validated fixed action/object-id pairs with one terminal LF. */
export function serializeInteractiveRebaseTodo(
  input: IInteractiveRebasePlan
): string {
  const plan = canonicalizePlan(input)
  const todo = `${plan.entries
    .map(entry => `${entry.action} ${entry.commitId}`)
    .join('\n')}\n`
  if (TextBytes.encode(todo).byteLength > MaximumInteractiveRebaseTodoBytes) {
    fail('invalid-todo', 'The interactive-rebase todo exceeds its fixed bound.')
  }
  return todo
}

function parseAllowedCommits(input: unknown): {
  readonly commits: ReadonlyArray<IInteractiveRebaseAllowedCommit>
  readonly width: InteractiveRebaseObjectIdWidth
} {
  const values = readDenseArray(input, MaximumInteractiveRebaseCommits)
  const commits = new Array<IInteractiveRebaseAllowedCommit>()
  const seen = new Set<string>()
  let width: InteractiveRebaseObjectIdWidth | null = null

  for (const value of values) {
    const record = readExactRecord(value, AllowedCommitKeys)
    const parsedId = parseCommitId(record.commitId)
    if (width !== null && parsedId.width !== width) {
      fail(
        'mixed-object-id-width',
        'One reviewed commit set cannot mix object-id widths.'
      )
    }
    width = parsedId.width
    if (seen.has(parsedId.value)) {
      fail(
        'duplicate-commit-id',
        'Each reviewed commit must occur exactly once.'
      )
    }
    seen.add(parsedId.value)
    commits.push(
      Object.freeze({
        commitId: parsedId.value,
        subject: sanitizeInteractiveRebaseSubject(record.subject),
      })
    )
  }

  return {
    commits: Object.freeze(commits),
    width: width!,
  }
}

/**
 * Parse an exact todo only when it contains every explicitly reviewed commit
 * once and no other object id. Subjects come from the reviewed set and never
 * from executable todo text.
 */
export function parseInteractiveRebaseTodo(
  todo: unknown,
  allowedCommits: unknown
): IInteractiveRebasePlan {
  if (typeof todo !== 'string') {
    fail('invalid-todo', 'The interactive-rebase todo is not canonical.')
  }
  if (
    todo.length > MaximumInteractiveRebaseTodoBytes ||
    TextBytes.encode(todo).byteLength > MaximumInteractiveRebaseTodoBytes ||
    TodoControlPattern.test(todo) ||
    !todo.endsWith('\n') ||
    todo.endsWith('\n\n')
  ) {
    fail('invalid-todo', 'The interactive-rebase todo is not canonical.')
  }

  const allowed = parseAllowedCommits(allowedCommits)
  const lines = todo.slice(0, -1).split('\n')
  if (lines.length !== allowed.commits.length) {
    fail(
      'invalid-todo',
      'The todo must contain every reviewed commit exactly once.'
    )
  }

  const allowedById = new Map(
    allowed.commits.map(commit => [commit.commitId, commit] as const)
  )
  const seen = new Set<string>()
  const entries = lines.map(line => {
    const match =
      /^(pick|reword|edit|squash|fixup|drop) ([0-9a-f]{40}|[0-9a-f]{64})$/.exec(
        line
      )
    if (match === null) {
      fail('invalid-todo', 'The interactive-rebase todo is not canonical.')
    }

    const action = match[1]
    const parsedId = parseCommitId(match[2])
    const allowedCommit = allowedById.get(parsedId.value)
    if (
      !isAction(action) ||
      parsedId.width !== allowed.width ||
      allowedCommit === undefined ||
      seen.has(parsedId.value)
    ) {
      fail(
        'invalid-todo',
        'The todo must contain every reviewed commit exactly once.'
      )
    }
    seen.add(parsedId.value)

    return Object.freeze({
      commitId: parsedId.value,
      action,
      subject: allowedCommit.subject,
      pauseRequired: pauseRequired(action),
    })
  })

  if (
    seen.size !== allowed.commits.length ||
    allowed.commits.some(commit => !seen.has(commit.commitId))
  ) {
    fail(
      'invalid-todo',
      'The todo must contain every reviewed commit exactly once.'
    )
  }

  return buildPlan(
    entries,
    allowed.commits.map(commit => commit.commitId)
  )
}
