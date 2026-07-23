import { createHash } from 'crypto'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { Repository } from '../../models/repository'
import {
  AutomaticCommitPushBatchByteLimit,
  AutomaticCommitPushBatchMaximumPaths,
  AutomaticCommitPushBatchProofByteBudget,
  CommitPushBatchError,
} from '../commit-push-batching'
import { git } from './core'

const ObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const RemoteNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/
const MaximumCommitProofOutputBytes = 64 * 1024 * 1024
const MaximumCommitPushIntentBranchBytes = 1024
const MaximumCommitPushIntentBytes =
  AutomaticCommitPushBatchProofByteBudget + 16 * 1024
const MaximumRequiredCommitFileBytes = 1024 * 1024
const CommitPushIntentVersion = 3
export const AutomaticCommitPushIntentRef =
  'refs/desktop-material/commit-push-intent'
export const AutomaticCommitPushPendingRef =
  'refs/desktop-material/commit-push-pending'

interface IRawCommitProofEntry {
  readonly status: 'A' | 'D' | 'M' | 'T'
  readonly newMode: string
  readonly newObjectId: string
  readonly path: string
}

export interface ICommitPushBatchProof {
  readonly headSha: string
  readonly parentSha: string | null
  readonly paths: ReadonlyArray<string>
  readonly sizeInBytes: number
}

export interface ICommitPushBatchIntent {
  readonly objectId: string
  readonly baseSha: string | null
  readonly branchRef: string
  readonly indexTreeSha: string
  readonly worktreeTreeSha: string
  readonly paths: ReadonlyArray<string>
  readonly requiredFiles: ReadonlyArray<ICommitPushBatchRequiredFileProof>
  readonly target: ICommitPushBatchTarget
}

export interface ICommitPushBatchRequiredFile {
  readonly relativePath: string
  readonly contentSha256: string
}

export interface ICommitPushBatchRequiredFileProof {
  readonly relativePath: string
  readonly objectId: string
}

export interface ICommitPushBatchTarget {
  readonly remoteName: string
  readonly remoteUrlSha256: string
  readonly remoteBranchRef: string
  readonly expectedRemoteSha: string | null
}

export interface IPendingCommitPushBatch {
  readonly commitSha: string
  readonly intent: ICommitPushBatchIntent
}

export type CommitPushBatchIntentRecovery =
  | { readonly kind: 'none' }
  | { readonly kind: 'cleared-no-commit' }
  | {
      readonly kind: 'recovered-commit'
      readonly proof: ICommitPushBatchProof
    }

interface ISerializedCommitPushBatchIntent {
  readonly version: typeof CommitPushIntentVersion
  readonly baseSha: string | null
  readonly branchRef: string
  readonly indexTreeSha: string
  readonly worktreeTreeSha: string
  readonly paths: ReadonlyArray<string>
  readonly requiredFiles: ReadonlyArray<ICommitPushBatchRequiredFileProof>
  readonly target: ICommitPushBatchTarget
}

function proofError(
  kind:
    | 'stale-commit'
    | 'unexpected-commit-path'
    | 'missing-commit-path'
    | 'commit-over-limit'
    | 'proof-over-limit'
    | 'invalid-commit-proof',
  message: string,
  path: string | null = null
): never {
  throw new CommitPushBatchError(kind, message, path)
}

function requireObjectId(value: string, label: string): string {
  if (!ObjectIdPattern.test(value)) {
    proofError(
      'invalid-commit-proof',
      `Git returned an invalid ${label} while proving an automatic commit batch.`
    )
  }
  return value
}

function requireBranchRef(value: string): string {
  if (
    !value.startsWith('refs/heads/') ||
    value.length === 'refs/heads/'.length ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n') ||
    Buffer.byteLength(value, 'utf8') > MaximumCommitPushIntentBranchBytes
  ) {
    proofError(
      'invalid-commit-proof',
      'Automatic commit batching requires an exact, valid local branch identity.'
    )
  }
  return value
}

export function hashCommitPushRemoteUrl(url: string): string {
  return createHash('sha256').update(url, 'utf8').digest('hex')
}

function validateCommitPushBatchTarget(
  target: ICommitPushBatchTarget
): ICommitPushBatchTarget {
  if (
    !RemoteNamePattern.test(target.remoteName) ||
    target.remoteName === '.' ||
    target.remoteName === '..' ||
    !/^[0-9a-f]{64}$/.test(target.remoteUrlSha256)
  ) {
    proofError(
      'invalid-commit-proof',
      'Automatic commit batching received an invalid remote identity.'
    )
  }
  requireBranchRef(target.remoteBranchRef)
  if (target.expectedRemoteSha !== null) {
    requireObjectId(target.expectedRemoteSha, 'expected remote commit')
  }
  return { ...target }
}

async function captureCommitPushBatchLocalState(
  repository: Repository,
  baseSha: string | null
): Promise<{
  readonly indexTreeSha: string
  readonly worktreeTreeSha: string
}> {
  const index = await git(
    ['write-tree'],
    repository.path,
    'captureAutomaticCommitBatchIndexTree',
    { maxBuffer: 8 * 1024 }
  )
  const indexTreeSha = requireObjectId(
    index.stdout.trim(),
    'pre-commit index tree'
  )
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'desktop-material-commit-intent-')
  )
  const temporaryIndex = join(temporaryDirectory, 'index')
  const env = { GIT_INDEX_FILE: temporaryIndex }
  try {
    await git(
      baseSha === null ? ['read-tree', '--empty'] : ['read-tree', baseSha],
      repository.path,
      'captureAutomaticCommitBatchWorktreeBase',
      { env, maxBuffer: 8 * 1024 }
    )
    await git(
      ['add', '-A', '--', '.'],
      repository.path,
      'captureAutomaticCommitBatchWorktree',
      { env, maxBuffer: 8 * 1024 }
    )
    const worktree = await git(
      ['write-tree'],
      repository.path,
      'captureAutomaticCommitBatchWorktreeTree',
      { env, maxBuffer: 8 * 1024 }
    )
    return {
      indexTreeSha,
      worktreeTreeSha: requireObjectId(
        worktree.stdout.trim(),
        'pre-commit worktree tree'
      ),
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

function validatePlannedPaths(
  paths: ReadonlyArray<string>
): ReadonlyArray<string> {
  if (paths.length > AutomaticCommitPushBatchMaximumPaths) {
    proofError(
      'proof-over-limit',
      `Automatic commit proof received more than ${AutomaticCommitPushBatchMaximumPaths} planned paths.`
    )
  }
  const seen = new Set<string>()
  let estimatedProofBytes = 0
  for (const path of paths) {
    if (path.length === 0 || path.includes('\0') || seen.has(path)) {
      proofError(
        'invalid-commit-proof',
        'Automatic commit proof received an invalid or duplicate planned path.',
        path
      )
    }
    seen.add(path)
    const nextEstimatedProofBytes =
      estimatedProofBytes + 256 + Buffer.byteLength(path, 'utf8')
    if (
      !Number.isSafeInteger(nextEstimatedProofBytes) ||
      nextEstimatedProofBytes > AutomaticCommitPushBatchProofByteBudget
    ) {
      proofError(
        'proof-over-limit',
        `Automatic commit proof received more than ${AutomaticCommitPushBatchProofByteBudget} bytes of planned path metadata.`,
        path
      )
    }
    estimatedProofBytes = nextEstimatedProofBytes
  }
  return [...paths]
}

function validateRequiredFilePath(relativePath: string): string {
  const segments = relativePath.split('/')
  if (
    relativePath.length === 0 ||
    relativePath.length > 4096 ||
    relativePath.startsWith('/') ||
    /^[A-Za-z]:\//.test(relativePath) ||
    relativePath.includes('\\') ||
    /[\u0000-\u001f]/.test(relativePath) ||
    segments.some(
      segment => segment.length === 0 || segment === '.' || segment === '..'
    ) ||
    /^\.git$/i.test(segments[0])
  ) {
    proofError(
      'invalid-commit-proof',
      'Automatic commit batching received an unsafe required-file path.',
      relativePath
    )
  }
  return relativePath
}

function validateRequiredFileProofs(
  files: ReadonlyArray<ICommitPushBatchRequiredFileProof>
): ReadonlyArray<ICommitPushBatchRequiredFileProof> {
  if (files.length > AutomaticCommitPushBatchMaximumPaths + 1) {
    proofError(
      'proof-over-limit',
      'Automatic commit batching received too many required-file proofs.'
    )
  }
  const seen = new Set<string>()
  return files.map(file => {
    const relativePath = validateRequiredFilePath(file.relativePath)
    const identity = relativePath.toLowerCase()
    if (seen.has(identity)) {
      proofError(
        'invalid-commit-proof',
        'Automatic commit batching received duplicate required-file proofs.',
        relativePath
      )
    }
    seen.add(identity)
    return {
      relativePath,
      objectId: requireObjectId(file.objectId, 'required-file object'),
    }
  })
}

async function captureRequiredFileProofs(
  repository: Repository,
  files: ReadonlyArray<ICommitPushBatchRequiredFile>
): Promise<ReadonlyArray<ICommitPushBatchRequiredFileProof>> {
  if (files.length > AutomaticCommitPushBatchMaximumPaths + 1) {
    proofError(
      'proof-over-limit',
      'Automatic commit batching received too many required files.'
    )
  }
  const seen = new Set<string>()
  const proofs = new Array<ICommitPushBatchRequiredFileProof>()
  for (const file of files) {
    const relativePath = validateRequiredFilePath(file.relativePath)
    const identity = relativePath.toLowerCase()
    if (seen.has(identity) || !/^[0-9a-f]{64}$/.test(file.contentSha256)) {
      proofError(
        'invalid-commit-proof',
        'Automatic commit batching received an invalid required-file binding.',
        relativePath
      )
    }
    seen.add(identity)
    const [entry, text] = await Promise.all([
      git(
        ['ls-files', '--stage', '-z', '--', relativePath],
        repository.path,
        'captureAutomaticCommitRequiredFileEntry',
        { maxBuffer: 8 * 1024 }
      ),
      git(
        ['show', `:${relativePath}`],
        repository.path,
        'captureAutomaticCommitRequiredFileBytes',
        { maxBuffer: MaximumRequiredCommitFileBytes + 1 }
      ),
    ])
    const match = /^100644 ([0-9a-f]{40}|[0-9a-f]{64}) 0\t([^\0]+)\0$/.exec(
      entry.stdout
    )
    if (
      match === null ||
      match[2] !== relativePath ||
      Buffer.byteLength(text.stdout, 'utf8') > MaximumRequiredCommitFileBytes ||
      createHash('sha256').update(text.stdout, 'utf8').digest('hex') !==
        file.contentSha256
    ) {
      proofError(
        'invalid-commit-proof',
        'The staged required file changed before its durable commit intent was captured.',
        relativePath
      )
    }
    proofs.push({ relativePath, objectId: match[1] })
  }
  return proofs
}

async function verifyRequiredFilesInCommit(
  repository: Repository,
  commitSha: string,
  files: ReadonlyArray<ICommitPushBatchRequiredFileProof>
): Promise<void> {
  for (const file of files) {
    const result = await git(
      ['ls-tree', '-z', commitSha, '--', file.relativePath],
      repository.path,
      'proveAutomaticCommitRequiredFile',
      { maxBuffer: 8 * 1024 }
    )
    const match = /^100644 blob ([0-9a-f]{40}|[0-9a-f]{64})\t([^\0]+)\0$/.exec(
      result.stdout
    )
    if (
      match === null ||
      match[2] !== file.relativePath ||
      match[1] !== file.objectId
    ) {
      proofError(
        'invalid-commit-proof',
        'A commit hook changed a required private Cheap LFS pointer or key before crash recovery.',
        file.relativePath
      )
    }
  }
}

async function captureCommitPushBatchBranchRef(
  repository: Repository
): Promise<string> {
  const result = await git(
    ['symbolic-ref', '--quiet', 'HEAD'],
    repository.path,
    'captureAutomaticCommitBatchBranch',
    { successExitCodes: new Set([0, 1]), maxBuffer: 4 * 1024 }
  )
  if (result.exitCode !== 0) {
    proofError(
      'stale-commit',
      'Automatic commit batching cannot continue from a detached HEAD.'
    )
  }
  return requireBranchRef(result.stdout.trim())
}

function serializeCommitPushBatchIntent(
  baseSha: string | null,
  branchRef: string,
  indexTreeSha: string,
  worktreeTreeSha: string,
  paths: ReadonlyArray<string>,
  requiredFiles: ReadonlyArray<ICommitPushBatchRequiredFileProof>,
  target: ICommitPushBatchTarget
): string {
  const value: ISerializedCommitPushBatchIntent = {
    version: CommitPushIntentVersion,
    baseSha,
    branchRef,
    indexTreeSha,
    worktreeTreeSha,
    paths,
    requiredFiles,
    target,
  }
  const serialized = `${JSON.stringify(value)}\n`
  if (Buffer.byteLength(serialized, 'utf8') > MaximumCommitPushIntentBytes) {
    proofError(
      'proof-over-limit',
      'The automatic commit intent is larger than its bounded metadata budget.'
    )
  }
  return serialized
}

function parseCommitPushBatchIntent(
  objectId: string,
  serialized: string
): ICommitPushBatchIntent {
  if (Buffer.byteLength(serialized, 'utf8') > MaximumCommitPushIntentBytes) {
    proofError(
      'invalid-commit-proof',
      'The stored automatic commit intent exceeds its metadata limit.'
    )
  }
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    proofError(
      'invalid-commit-proof',
      'The stored automatic commit intent is not valid JSON.'
    )
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    proofError(
      'invalid-commit-proof',
      'The stored automatic commit intent has an invalid shape.'
    )
  }
  const candidate = value as Partial<ISerializedCommitPushBatchIntent>
  if (
    candidate.version !== CommitPushIntentVersion ||
    (candidate.baseSha !== null && typeof candidate.baseSha !== 'string') ||
    typeof candidate.branchRef !== 'string' ||
    typeof candidate.indexTreeSha !== 'string' ||
    typeof candidate.worktreeTreeSha !== 'string' ||
    !Array.isArray(candidate.paths) ||
    candidate.paths.some(path => typeof path !== 'string') ||
    !Array.isArray(candidate.requiredFiles) ||
    candidate.requiredFiles.some(
      file =>
        file === null ||
        typeof file !== 'object' ||
        Array.isArray(file) ||
        typeof (file as Partial<ICommitPushBatchRequiredFileProof>)
          .relativePath !== 'string' ||
        typeof (file as Partial<ICommitPushBatchRequiredFileProof>).objectId !==
          'string'
    ) ||
    candidate.target === null ||
    typeof candidate.target !== 'object' ||
    Array.isArray(candidate.target)
  ) {
    proofError(
      'invalid-commit-proof',
      'The stored automatic commit intent has unsupported fields.'
    )
  }
  const baseSha = candidate.baseSha
  if (baseSha !== null) {
    requireObjectId(baseSha, 'intent base')
  }
  const branchRef = requireBranchRef(candidate.branchRef)
  const indexTreeSha = requireObjectId(
    candidate.indexTreeSha,
    'intent index tree'
  )
  const worktreeTreeSha = requireObjectId(
    candidate.worktreeTreeSha,
    'intent worktree tree'
  )
  const paths = validatePlannedPaths(candidate.paths as ReadonlyArray<string>)
  const requiredFiles = validateRequiredFileProofs(
    candidate.requiredFiles as ReadonlyArray<ICommitPushBatchRequiredFileProof>
  )
  const rawTarget = candidate.target as Partial<ICommitPushBatchTarget>
  if (
    typeof rawTarget.remoteName !== 'string' ||
    typeof rawTarget.remoteUrlSha256 !== 'string' ||
    typeof rawTarget.remoteBranchRef !== 'string' ||
    (rawTarget.expectedRemoteSha !== null &&
      typeof rawTarget.expectedRemoteSha !== 'string')
  ) {
    proofError(
      'invalid-commit-proof',
      'The stored automatic commit target has unsupported fields.'
    )
  }
  const target = validateCommitPushBatchTarget(
    rawTarget as ICommitPushBatchTarget
  )
  const canonical = serializeCommitPushBatchIntent(
    baseSha,
    branchRef,
    indexTreeSha,
    worktreeTreeSha,
    paths,
    requiredFiles,
    target
  )
  if (canonical !== serialized) {
    proofError(
      'invalid-commit-proof',
      'The stored automatic commit intent is not canonically serialized.'
    )
  }
  return {
    objectId,
    baseSha,
    branchRef,
    indexTreeSha,
    worktreeTreeSha,
    paths,
    requiredFiles,
    target,
  }
}

function parseRawDiff(output: string): ReadonlyArray<IRawCommitProofEntry> {
  if (Buffer.byteLength(output, 'utf8') > MaximumCommitProofOutputBytes) {
    proofError(
      'invalid-commit-proof',
      'Git returned too much changed-path data while proving an automatic commit batch.'
    )
  }

  const fields = output.split('\0')
  if (fields[fields.length - 1] === '') {
    fields.pop()
  }
  if (fields.length % 2 !== 0) {
    proofError(
      'invalid-commit-proof',
      'Git returned a truncated changed-path list while proving an automatic commit batch.'
    )
  }

  const entries = new Array<IRawCommitProofEntry>()
  const seenPaths = new Set<string>()
  for (let index = 0; index < fields.length; index += 2) {
    const header = fields[index]
    const path = fields[index + 1]
    const match =
      /^:[0-7]{6} ([0-7]{6}) (?:[0-9a-f]{40}|[0-9a-f]{64}) ([0-9a-f]{40}|[0-9a-f]{64}) ([ADMT])$/.exec(
        header
      )
    if (
      match === null ||
      path.length === 0 ||
      path.includes('\0') ||
      seenPaths.has(path)
    ) {
      proofError(
        'invalid-commit-proof',
        'Git returned an invalid or duplicate changed path while proving an automatic commit batch.'
      )
    }
    seenPaths.add(path)
    entries.push({
      status: match[3] as IRawCommitProofEntry['status'],
      newMode: match[1],
      newObjectId: match[2],
      path,
    })
  }
  return entries
}

async function readObjectSizes(
  repository: Repository,
  objectIds: ReadonlyArray<string>
): Promise<ReadonlyMap<string, number>> {
  const unique = [...new Set(objectIds)]
  if (unique.length === 0) {
    return new Map()
  }

  const result = await git(
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    repository.path,
    'proveAutomaticCommitBatchObjectSizes',
    {
      stdin: `${unique.join('\n')}\n`,
      maxBuffer: MaximumCommitProofOutputBytes,
    }
  )
  const sizes = new Map<string, number>()
  const output = result.stdout.replace(/[\r\n]+$/, '')
  for (const line of output.length === 0 ? [] : output.split(/\r?\n/)) {
    const match =
      /^([0-9a-f]{40}|[0-9a-f]{64}) (?:blob|commit|tree|tag) ([0-9]+)$/.exec(
        line
      )
    const size = match === null ? NaN : Number(match[2])
    if (
      match === null ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      sizes.has(match[1])
    ) {
      proofError(
        'invalid-commit-proof',
        'Git returned an invalid object-size inventory while proving an automatic commit batch.'
      )
    }
    sizes.set(match[1], size)
  }
  if (sizes.size !== unique.length) {
    proofError(
      'invalid-commit-proof',
      'Git omitted an object size while proving an automatic commit batch.'
    )
  }
  return sizes
}

/** Resolve the exact parent checkpoint immediately before an automatic commit. */
export async function captureCommitPushBatchBase(
  repository: Repository
): Promise<string | null> {
  const result = await git(
    ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'],
    repository.path,
    'captureAutomaticCommitBatchBase',
    { successExitCodes: new Set([0, 1]), maxBuffer: 4 * 1024 }
  )
  if (result.exitCode === 1) {
    return null
  }
  return requireObjectId(result.stdout.trim(), 'pre-commit HEAD')
}

/** Read the exact pre-commit plan protected by the durable intent ref. */
export async function readCommitPushBatchIntent(
  repository: Repository
): Promise<ICommitPushBatchIntent | null> {
  const resolved = await git(
    [
      'for-each-ref',
      '--format=%(refname)%00%(objectname)',
      AutomaticCommitPushIntentRef,
    ],
    repository.path,
    'readAutomaticCommitPushIntentRef',
    { maxBuffer: 4 * 1024 }
  )
  const value = resolved.stdout.replace(/[\r\n]+$/, '')
  if (value.length === 0) {
    return null
  }
  const fields = value.split('\0')
  if (fields.length !== 2 || fields[0] !== AutomaticCommitPushIntentRef) {
    proofError(
      'invalid-commit-proof',
      'Git returned an invalid automatic commit intent ref.'
    )
  }
  const objectId = requireObjectId(fields[1], 'automatic commit intent object')
  const blob = await git(
    ['cat-file', 'blob', objectId],
    repository.path,
    'readAutomaticCommitPushIntentBlob',
    { maxBuffer: MaximumCommitPushIntentBytes }
  )
  return parseCommitPushBatchIntent(objectId, blob.stdout)
}

/**
 * Persist the exact plan before invoking Git commit. The object is immutable and
 * the ref update is atomic; a later recovery never trusts mutable worktree data.
 */
export async function beginCommitPushBatchIntent(
  repository: Repository,
  baseSha: string | null,
  paths: ReadonlyArray<string>,
  targetInput: ICommitPushBatchTarget,
  requiredFileInputs: ReadonlyArray<ICommitPushBatchRequiredFile> = []
): Promise<ICommitPushBatchIntent> {
  if (baseSha !== null) {
    requireObjectId(baseSha, 'intent base')
  }
  const validatedPaths = validatePlannedPaths(paths)
  const target = validateCommitPushBatchTarget(targetInput)
  const branchRef = await captureCommitPushBatchBranchRef(repository)
  const actualBase = await captureCommitPushBatchBase(repository)
  if (actualBase !== baseSha) {
    proofError(
      'stale-commit',
      'HEAD changed before the automatic commit intent could be persisted.'
    )
  }
  if ((await readPendingCommitPushBatch(repository)) !== null) {
    proofError(
      'stale-commit',
      'A previous automatic commit batch must be proven remotely before another commit starts.'
    )
  }

  if ((await readCommitPushBatchIntent(repository)) !== null) {
    proofError(
      'stale-commit',
      'Another automatic commit intent must be recovered before a new commit starts.'
    )
  }
  const [{ indexTreeSha, worktreeTreeSha }, requiredFiles] = await Promise.all([
    captureCommitPushBatchLocalState(repository, baseSha),
    captureRequiredFileProofs(repository, requiredFileInputs),
  ])

  const serialized = serializeCommitPushBatchIntent(
    baseSha,
    branchRef,
    indexTreeSha,
    worktreeTreeSha,
    validatedPaths,
    requiredFiles,
    target
  )
  const hashed = await git(
    ['hash-object', '-w', '--stdin'],
    repository.path,
    'writeAutomaticCommitPushIntentBlob',
    { stdin: serialized, maxBuffer: 4 * 1024 }
  )
  const objectId = requireObjectId(
    hashed.stdout.trim(),
    'automatic commit intent object'
  )
  const zero = '0'.repeat(objectId.length)
  await git(
    ['update-ref', '--stdin'],
    repository.path,
    'markAutomaticCommitPushIntentRef',
    {
      stdin: [
        'start',
        `create ${AutomaticCommitPushIntentRef} ${objectId}`,
        `verify ${AutomaticCommitPushPendingRef} ${zero}`,
        'prepare',
        'commit',
        '',
      ].join('\n'),
      maxBuffer: 4 * 1024,
    }
  )

  // Re-read both identities after the atomic ref update. If an external Git
  // process raced this operation, retain the intent so recovery fails closed.
  if (
    (await captureCommitPushBatchBranchRef(repository)) !== branchRef ||
    (await captureCommitPushBatchBase(repository)) !== baseSha
  ) {
    proofError(
      'stale-commit',
      'The branch changed while the automatic commit intent was being persisted.'
    )
  }
  return {
    objectId,
    baseSha,
    branchRef,
    indexTreeSha,
    worktreeTreeSha,
    paths: validatedPaths,
    requiredFiles,
    target,
  }
}

async function clearCommitPushBatchIntent(
  repository: Repository,
  intent: ICommitPushBatchIntent,
  reason: string
): Promise<void> {
  const current = await readCommitPushBatchIntent(repository)
  if (current?.objectId !== intent.objectId) {
    proofError(
      'stale-commit',
      'The automatic commit intent changed before cleanup.'
    )
  }
  await git(
    [
      'update-ref',
      '-m',
      reason,
      '-d',
      AutomaticCommitPushIntentRef,
      intent.objectId,
    ],
    repository.path,
    'clearAutomaticCommitPushIntentRef',
    { maxBuffer: 4 * 1024 }
  )
}

/** Clear a failed commit's intent only while the exact pre-commit state remains. */
export async function clearCommitPushBatchIntentAfterNoCommit(
  repository: Repository,
  intent: ICommitPushBatchIntent
): Promise<void> {
  const branchRef = await captureCommitPushBatchBranchRef(repository)
  const headSha = await captureCommitPushBatchBase(repository)
  if (branchRef !== intent.branchRef || headSha !== intent.baseSha) {
    proofError(
      'stale-commit',
      'Git changed branch or HEAD while reporting that the automatic commit failed; its durable intent was retained.'
    )
  }
  const localState = await captureCommitPushBatchLocalState(
    repository,
    intent.baseSha
  )
  if (
    localState.indexTreeSha !== intent.indexTreeSha ||
    localState.worktreeTreeSha !== intent.worktreeTreeSha
  ) {
    proofError(
      'stale-commit',
      'Git changed the index or working tree while the automatic commit failed. The durable intent was retained; restore the pre-commit index and files before retrying recovery.'
    )
  }
  await clearCommitPushBatchIntent(
    repository,
    intent,
    'desktop-material automatic commit produced no commit'
  )
}

/**
 * Reconcile a crash window before any new commit. An exact no-commit state is
 * cleared; an exact one-commit transition is reproven and promoted to pending.
 */
export async function recoverCommitPushBatchIntent(
  repository: Repository
): Promise<CommitPushBatchIntentRecovery> {
  const intent = await readCommitPushBatchIntent(repository)
  if (intent === null) {
    return { kind: 'none' }
  }
  const branchRef = await captureCommitPushBatchBranchRef(repository)
  if (branchRef !== intent.branchRef) {
    proofError(
      'stale-commit',
      'The branch differs from the durable automatic commit intent.'
    )
  }
  const headSha = await captureCommitPushBatchBase(repository)
  if (headSha === intent.baseSha) {
    await clearCommitPushBatchIntentAfterNoCommit(repository, intent)
    return { kind: 'cleared-no-commit' }
  }

  const proof = await proveCommitPushBatch(
    repository,
    intent.baseSha,
    intent.paths
  )
  await verifyRequiredFilesInCommit(
    repository,
    proof.headSha,
    intent.requiredFiles
  )
  if (
    (await captureCommitPushBatchBranchRef(repository)) !== intent.branchRef ||
    (await captureCommitPushBatchBase(repository)) !== proof.headSha
  ) {
    proofError(
      'stale-commit',
      'The branch changed while the durable automatic commit intent was being proven.'
    )
  }
  await markPendingCommitPushBatch(repository, proof.headSha, intent)
  if (
    (await captureCommitPushBatchBranchRef(repository)) !== intent.branchRef ||
    (await captureCommitPushBatchBase(repository)) !== proof.headSha
  ) {
    proofError(
      'stale-commit',
      'The branch changed while the proven automatic commit was being checkpointed.'
    )
  }
  return { kind: 'recovered-commit', proof }
}

/** Read the durable commit which must reach its remote before another batch. */
export async function readPendingCommitPushBatch(
  repository: Repository
): Promise<string | null> {
  const result = await git(
    [
      'for-each-ref',
      '--format=%(refname)%00%(objectname)',
      AutomaticCommitPushPendingRef,
    ],
    repository.path,
    'readAutomaticCommitPushPendingRef',
    { maxBuffer: 4 * 1024 }
  )
  const value = result.stdout.replace(/[\r\n]+$/, '')
  if (value.length === 0) {
    return null
  }
  const fields = value.split('\0')
  if (fields.length !== 2 || fields[0] !== AutomaticCommitPushPendingRef) {
    proofError(
      'invalid-commit-proof',
      'Git returned an invalid automatic commit push checkpoint ref.'
    )
  }
  const objectId = requireObjectId(fields[1], 'pending batch commit')
  const type = await git(
    ['cat-file', '-t', objectId],
    repository.path,
    'readAutomaticCommitPushPendingType',
    { maxBuffer: 4 * 1024 }
  )
  if (type.stdout.trim() !== 'commit') {
    proofError(
      'invalid-commit-proof',
      'The automatic commit push checkpoint does not reference a commit.'
    )
  }
  return objectId
}

/** Read the commit together with the immutable branch and remote intent. */
export async function readPendingCommitPushBatchState(
  repository: Repository
): Promise<IPendingCommitPushBatch | null> {
  const commitSha = await readPendingCommitPushBatch(repository)
  if (commitSha === null) {
    return null
  }
  const intent = await readCommitPushBatchIntent(repository)
  if (intent === null) {
    proofError(
      'invalid-commit-proof',
      'The automatic commit push checkpoint lost its branch and remote intent.'
    )
  }
  return { commitSha, intent }
}

/** Persist a proven local batch before attempting its network push. */
export async function markPendingCommitPushBatch(
  repository: Repository,
  commitSha: string,
  intent: ICommitPushBatchIntent
): Promise<void> {
  requireObjectId(commitSha, 'pending batch commit')
  const currentIntent = await readCommitPushBatchIntent(repository)
  if (currentIntent?.objectId !== intent.objectId) {
    proofError(
      'stale-commit',
      'The automatic commit intent changed before its pending checkpoint was created.'
    )
  }
  const current = await readPendingCommitPushBatch(repository)
  if (current === commitSha) {
    return
  }
  if (current !== null) {
    proofError(
      'stale-commit',
      'Another automatic commit batch is still waiting for remote proof.'
    )
  }
  await git(
    ['update-ref', '--stdin'],
    repository.path,
    'markAutomaticCommitPushPendingRef',
    {
      stdin: [
        'start',
        `verify ${AutomaticCommitPushIntentRef} ${intent.objectId}`,
        `create ${AutomaticCommitPushPendingRef} ${commitSha}`,
        'prepare',
        'commit',
        '',
      ].join('\n'),
      maxBuffer: 4 * 1024,
    }
  )
}

/** Remove the checkpoint only after that exact commit is proven remotely. */
export async function clearPendingCommitPushBatch(
  repository: Repository,
  expectedCommitSha: string,
  expectedIntentObjectId: string
): Promise<void> {
  requireObjectId(expectedCommitSha, 'pending batch commit')
  requireObjectId(expectedIntentObjectId, 'pending batch intent')
  const current = await readPendingCommitPushBatch(repository)
  if (current !== expectedCommitSha) {
    proofError(
      'stale-commit',
      'The automatic commit push checkpoint changed before cleanup.'
    )
  }
  const intent = await readCommitPushBatchIntent(repository)
  if (intent === null) {
    proofError(
      'invalid-commit-proof',
      'The proven automatic commit lost its durable branch and remote intent during cleanup.'
    )
  }
  if (intent.objectId !== expectedIntentObjectId) {
    proofError(
      'stale-commit',
      'The automatic commit intent changed before pending cleanup.'
    )
  }
  await git(
    ['update-ref', '--stdin'],
    repository.path,
    'clearAutomaticCommitPushPendingRef',
    {
      stdin: [
        'start',
        `delete ${AutomaticCommitPushPendingRef} ${expectedCommitSha}`,
        `delete ${AutomaticCommitPushIntentRef} ${expectedIntentObjectId}`,
        'prepare',
        'commit',
        '',
      ].join('\n'),
      maxBuffer: 4 * 1024,
    }
  )
}

/**
 * Prove the commit that is about to be pushed, using committed Git objects
 * rather than the earlier working-tree estimate. This catches hook-added paths,
 * hook-expanded files, and concurrent edits before any remote mutation.
 */
export async function proveCommitPushBatch(
  repository: Repository,
  expectedParentSha: string | null,
  expectedPaths: ReadonlyArray<string>,
  byteLimit: number = AutomaticCommitPushBatchByteLimit
): Promise<ICommitPushBatchProof> {
  if (expectedParentSha !== null) {
    requireObjectId(expectedParentSha, 'expected parent')
  }
  if (!Number.isSafeInteger(byteLimit) || byteLimit <= 0) {
    proofError(
      'invalid-commit-proof',
      'Automatic commit proof requires a positive safe-integer byte limit.'
    )
  }
  const expectedPathSet = new Set(validatePlannedPaths(expectedPaths))

  const identity = await git(
    ['show', '-s', '--format=%H%x00%P', 'HEAD', '--'],
    repository.path,
    'proveAutomaticCommitBatchIdentity',
    { maxBuffer: 8 * 1024 }
  )
  const identityFields = identity.stdout.replace(/[\r\n]+$/, '').split('\0')
  if (identityFields.length !== 2) {
    proofError(
      'invalid-commit-proof',
      'Git returned an invalid commit identity while proving an automatic commit batch.'
    )
  }
  const headSha = requireObjectId(identityFields[0], 'automatic commit')
  const parents = identityFields[1].split(' ').filter(x => x.length > 0)
  const hasExpectedParent =
    expectedParentSha === null
      ? parents.length === 0
      : parents.length === 1 && parents[0] === expectedParentSha
  if (!hasExpectedParent) {
    proofError(
      'stale-commit',
      'The automatic commit does not have the exact pre-commit state as its parent.'
    )
  }

  const commitArguments =
    expectedParentSha === null
      ? ['--root', headSha]
      : [expectedParentSha, headSha]
  const diff = await git(
    [
      'diff-tree',
      '-r',
      '--no-commit-id',
      '--raw',
      '-z',
      '--no-renames',
      '--full-index',
      ...commitArguments,
      '--',
    ],
    repository.path,
    'proveAutomaticCommitBatchDiff',
    { maxBuffer: MaximumCommitProofOutputBytes }
  )
  const entries = parseRawDiff(diff.stdout)
  const actualPathSet = new Set(entries.map(entry => entry.path))
  for (const entry of entries) {
    if (!expectedPathSet.has(entry.path)) {
      proofError(
        'unexpected-commit-path',
        `The automatic commit contains an unplanned path: ${entry.path}.`,
        entry.path
      )
    }
  }
  for (const path of expectedPathSet) {
    if (!actualPathSet.has(path)) {
      proofError(
        'missing-commit-path',
        `The automatic commit omitted its planned path: ${path}.`,
        path
      )
    }
  }

  const zeroObjectId = '0'.repeat(headSha.length)
  const objectIds = entries
    .filter(entry => entry.status !== 'D' && entry.newMode !== '160000')
    .map(entry => {
      if (entry.newObjectId === zeroObjectId) {
        proofError(
          'invalid-commit-proof',
          `Git returned a missing object for ${entry.path}.`,
          entry.path
        )
      }
      return entry.newObjectId
    })
  const sizes = await readObjectSizes(repository, objectIds)
  let sizeInBytes = 0
  for (const entry of entries) {
    const size =
      entry.status === 'D' || entry.newMode === '160000'
        ? 0
        : sizes.get(entry.newObjectId) ??
          proofError(
            'invalid-commit-proof',
            `Git omitted the committed object size for ${entry.path}.`,
            entry.path
          )
    if (!Number.isSafeInteger(sizeInBytes + size)) {
      proofError(
        'invalid-commit-proof',
        'The automatic commit payload is larger than a safe integer.'
      )
    }
    sizeInBytes += size
  }
  if (sizeInBytes > byteLimit) {
    proofError(
      'commit-over-limit',
      `The created commit contains ${sizeInBytes} bytes, above the automatic ${byteLimit}-byte push batch limit.`
    )
  }

  return {
    headSha,
    parentSha: expectedParentSha,
    paths: entries.map(entry => entry.path),
    sizeInBytes,
  }
}
