import { randomUUID } from 'crypto'
import { open, realpath, unlink } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import {
  CheapLfsGhcrMaximumAdaptivePrepareAttempts,
  CheapLfsGhcrMaximumChunkBytes,
  CheapLfsGhcrMinimumAdaptiveChunkBytes,
  CheapLfsGhcrVisibility,
  ICheapLfsGhcrDesiredObject,
  ICheapLfsGhcrPreparedImage,
  ICheapLfsGhcrProgress,
  ICheapLfsGhcrSnapshot,
  ICheapLfsGhcrValidatedImage,
  getNextCheapLfsGhcrChunkBytes,
  validateCheapLfsGhcrSnapshot,
  materializeCheapLfsGhcrObject,
  withPreparedCheapLfsGhcrImage,
} from './ghcr-image'
import {
  CheapLfsGhcrVerifiedVisibility,
  CheapLfsRegistryRepositoryKeyPath,
  CheapLfsCreatedRepositoryKeyCleanupResult,
  ICheapLfsCreatedRepositoryKeyCleanupProof,
  ICheapLfsGhcrRepositoryKeyResult,
  captureCheapLfsCreatedRepositoryKeyCleanupProof,
  cheapLfsRegistryRepositoryKeyId,
  discardCheapLfsCreatedRepositoryKeyIfUnchanged,
  isCheapLfsRepositoryKeyPath,
  resolveCheapLfsGhcrRepositoryKey,
  resolveCheapLfsRegistryRepositoryKeyForId,
} from './ghcr-key'
import {
  CheapLfsGhcrLayerUploadTimeoutError,
  ICheapLfsGhcrPublishResult,
  ICheapLfsGhcrTransferProgress,
} from './ghcr-oras-transport'
import {
  CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES,
  CheapLfsOciRegistryProvider,
  ICheapLfsGhcrPointer,
  getCheapLfsOciRegistryProvider,
  getCheapLfsOciRegistryRepository,
  materializeCheapLfsOciPointer,
  parseCheapLfsGhcrPointer,
} from './ghcr-pointer'
import {
  CheapLfsWorkingTreePointerState,
  ICheapLfsFileSystem,
  ICheapLfsPointerCandidate,
  defaultCheapLfsFileSystem,
} from './operations'
import {
  ICheapLfsPointer,
  parseCheapLfsPointer,
  validateCheapLfsTrackedPath,
} from './pointer'
import { requireSafeCheapLfsMaterializationPath } from './materialization-path'
import {
  CheapLfsTrackedPathError,
  defaultCheapLfsTrackedPathStore,
  ICheapLfsOwnedFile,
  ICheapLfsSourceFileProof,
  ICheapLfsTrackedFileProof,
  ICheapLfsTrackedPathStore,
} from './tracked-path-store'

const Sha256Pattern = /^[0-9a-f]{64}$/
const RepositoryIdentityPattern =
  /^github\.com\/repositories\/[1-9][0-9]{0,19}$/

export type CheapLfsOciVerifiedVisibility = Exclude<
  CheapLfsGhcrVerifiedVisibility,
  'unknown'
>

export interface ICheapLfsReleaseStoredPointer {
  readonly backend: 'release'
  readonly relativePath: string
  readonly text: string
  readonly pointer: ICheapLfsPointer
  readonly workingTreeState: CheapLfsWorkingTreePointerState
  readonly metadataSource: 'working-tree' | 'index' | 'head'
  readonly workingTreeSha256?: string
  readonly workingTreeSizeInBytes?: number
}

export interface ICheapLfsOciStoredPointer {
  readonly backend: 'oci'
  readonly provider: CheapLfsOciRegistryProvider
  readonly relativePath: string
  readonly text: string
  readonly pointer: ICheapLfsGhcrPointer
  readonly workingTreeState: CheapLfsWorkingTreePointerState
  readonly metadataSource: 'working-tree' | 'index' | 'head'
  readonly workingTreeSha256?: string
  readonly workingTreeSizeInBytes?: number
}

export type ICheapLfsStoredPointer =
  | ICheapLfsReleaseStoredPointer
  | ICheapLfsOciStoredPointer

export interface ICheapLfsOciFileSystem {
  readonly trackedPaths?: ICheapLfsTrackedPathStore
  scanPointerCandidates(
    root: string
  ): Promise<ReadonlyArray<ICheapLfsPointerCandidate>>
  readPointerText(path: string): Promise<string>
  /**
   * Atomically replace the current file with `text`. A rejection must leave
   * the original file intact unless the exact requested pointer is already
   * the durable final state.
   */
  writePointer(path: string, text: string): Promise<void>
  hashFile(
    path: string,
    signal?: AbortSignal
  ): Promise<{ readonly sha256: string; readonly sizeInBytes: number }>
  /** Unlike the legacy release seam, removal errors must remain observable. */
  removeFile(path: string): Promise<void>
}

const defaultCheapLfsOciFileSystem: ICheapLfsOciFileSystem = {
  trackedPaths: defaultCheapLfsTrackedPathStore,
  scanPointerCandidates: root =>
    defaultCheapLfsFileSystem.scanPointerCandidates(root),
  readPointerText: async path => {
    const handle = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      return buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  },
  writePointer: (path, text) =>
    defaultCheapLfsFileSystem.writePointer(path, text),
  hashFile: (path, signal) => defaultCheapLfsFileSystem.hashFile(path, signal),
  removeFile: path => unlink(path),
}

export interface ICheapLfsOciPullRequest {
  readonly pointer: ICheapLfsGhcrPointer
  readonly expectedRepositoryIdentity: string
  readonly expectedVisibility: CheapLfsGhcrVisibility
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: ICheapLfsGhcrTransferProgress) => void
}

export interface ICheapLfsOciPublishRequest {
  readonly image: ICheapLfsGhcrPreparedImage
  readonly provider: CheapLfsOciRegistryProvider
  readonly registryRepository: string
  readonly repositoryIdentity: string
  readonly visibility: CheapLfsGhcrVisibility
  readonly parallelBlobUploads: boolean
  readonly keyCreated: boolean
  readonly keyRelativePath: typeof CheapLfsRegistryRepositoryKeyPath | null
  readonly attempt: number
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: ICheapLfsGhcrTransferProgress) => void
}

/**
 * Runtime credentials, pinned ORAS discovery, and package-policy verification
 * live outside this provider-neutral orchestration layer.
 */
export interface ICheapLfsOciRuntime {
  publish(
    request: ICheapLfsOciPublishRequest
  ): Promise<ICheapLfsGhcrPublishResult>
  withPulledImage<T>(
    request: ICheapLfsOciPullRequest,
    operation: (image: ICheapLfsGhcrValidatedImage) => Promise<T>
  ): Promise<T>
}

export interface ICheapLfsOciOperationDependencies {
  readonly runtime: ICheapLfsOciRuntime
  readonly fileSystem?: ICheapLfsOciFileSystem
  readonly withPreparedImage?: typeof withPreparedCheapLfsGhcrImage
  readonly resolveRepositoryKey?: typeof resolveCheapLfsGhcrRepositoryKey
  readonly resolveRepositoryKeyForId?: typeof resolveCheapLfsRegistryRepositoryKeyForId
  /** Test seam; production discards only an identity/content-proven key. */
  readonly discardCreatedKey?: (
    proof: ICheapLfsCreatedRepositoryKeyCleanupProof
  ) => Promise<CheapLfsCreatedRepositoryKeyCleanupResult>
}

export interface ICheapLfsOciRepositoryContext {
  readonly repositoryPath: string
  readonly repositoryIdentity: string
  /** Canonical repository URL embedded in the OCI manifest for package linking. */
  readonly sourceRepositoryUrl: string
  readonly visibility: CheapLfsOciVerifiedVisibility
  readonly provider: CheapLfsOciRegistryProvider
  /** Canonical `ghcr.io/owner/repository` or `docker.io/owner/repository`. */
  readonly registryRepository: string
  /** At most three at runtime; timeout retries are automatically sequential. */
  readonly parallelBlobTransfers: boolean
}

export type CheapLfsOciOperationPhase =
  | 'scanning'
  | 'hashing'
  | 'pulling'
  | 'preparing'
  | 'publishing'
  | 'updating-pointers'

export interface ICheapLfsOciOperationProgress {
  readonly phase: CheapLfsOciOperationPhase
  readonly currentPath: string | null
  /** Deterministic snapshot of the file lanes currently using the registry. */
  readonly activeFiles?: ReadonlyArray<ICheapLfsOciActiveFileProgress>
  readonly completedFiles: number
  readonly totalFiles: number
  readonly attempt: number
  readonly maximumChunkBytes: number
  readonly transfer?: ICheapLfsGhcrProgress | ICheapLfsGhcrTransferProgress
}

export interface ICheapLfsOciActiveFileProgress {
  readonly relativePath: string
  readonly objectSha256: string
  /** ORAS reports command completion, not streaming bytes, so this is exact. */
  readonly processedBytes: number
  readonly totalBytes: number
}

export interface ICheapLfsOciPinTarget {
  readonly relativePath: string
  /** Optional selection-time guard; the file is always freshly hashed. */
  readonly expectedSizeInBytes?: number
}

export interface ICheapLfsOciFileResult {
  readonly relativePath: string
  readonly objectSha256: string
  readonly sizeInBytes: number
  readonly pointerText: string
  readonly operation: 'pinned' | 'rewritten'
  readonly changed: boolean
}

export interface ICheapLfsOciFileFailure {
  readonly relativePath: string
  readonly operation: 'pin' | 'rewrite' | 'remove'
  readonly message: string
}

export interface ICheapLfsOciMutationResult {
  readonly provider: CheapLfsOciRegistryProvider
  readonly published: boolean
  readonly immutableReference: string | null
  readonly attempts: number
  readonly maximumChunkBytes: number
  readonly files: ReadonlyArray<ICheapLfsOciFileResult>
  readonly failures: ReadonlyArray<ICheapLfsOciFileFailure>
  /** Changed working-tree paths safe for the caller to add to a commit. */
  readonly commitPaths: ReadonlyArray<string>
  /** Always surfaced for a successful private publish, even when pre-existing. */
  readonly keyCommitPath: typeof CheapLfsRegistryRepositoryKeyPath | null
  readonly keyCreated: boolean
}

export interface ICheapLfsOciRemoveResult extends ICheapLfsOciMutationResult {
  readonly removed: boolean
  readonly removedPath: string
}

export interface ICheapLfsOciMaterializeResult {
  readonly provider: CheapLfsOciRegistryProvider
  readonly relativePath: string
  readonly objectSha256: string
  readonly sizeInBytes: number
}

export class CheapLfsOciOperationError extends Error {
  public constructor(
    public readonly kind:
      | 'invalid-input'
      | 'inconsistent-pointers'
      | 'integrity'
      | 'cleanup',
    message: string
  ) {
    super(message)
    this.name = 'CheapLfsOciOperationError'
  }
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Cheap LFS OCI operation was canceled.')
    error.name = 'AbortError'
    throw error
  }
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error &&
      (error.name === 'AbortError' ||
        ('kind' in error && error.kind === 'canceled')))
  )
}

function messageFor(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'Cheap LFS OCI storage failed.'
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

/** A rename/unlink can reach its durable state before its caller sees an error. */
async function pointerWriteReachedFinalState(
  fs: ICheapLfsOciFileSystem,
  path: string,
  expectedText: string
): Promise<boolean> {
  try {
    return (await fs.readPointerText(path)) === expectedText
  } catch {
    return false
  }
}

async function removalReachedFinalState(
  fs: ICheapLfsOciFileSystem,
  path: string
): Promise<boolean> {
  try {
    await fs.readPointerText(path)
    return false
  } catch (error) {
    return isMissingPathError(error)
  }
}

function checkedRelativePath(relativePath: string): string {
  const path = validateCheapLfsTrackedPath(relativePath)
  if (path === null || isCheapLfsRepositoryKeyPath(path)) {
    throw new CheapLfsOciOperationError(
      'invalid-input',
      'Choose a safe repository-relative Cheap LFS path outside Git metadata and the registry key path.'
    )
  }
  return path
}

function absoluteTrackedPath(repositoryPath: string, relativePath: string) {
  return join(resolve(repositoryPath), ...relativePath.split('/'))
}

function sameCanonicalPath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

function imageVisibility(
  visibility: CheapLfsOciVerifiedVisibility
): CheapLfsGhcrVisibility {
  return visibility === 'verified-private' ? 'private' : 'public'
}

function validateContext(context: ICheapLfsOciRepositoryContext): void {
  if (!RepositoryIdentityPattern.test(context.repositoryIdentity)) {
    throw new CheapLfsOciOperationError(
      'invalid-input',
      'Cheap LFS OCI storage requires a canonical GitHub repository identity.'
    )
  }
  const probe = `${context.registryRepository}@sha256:${'0'.repeat(64)}`
  if (
    getCheapLfsOciRegistryProvider(probe) !== context.provider ||
    getCheapLfsOciRegistryRepository(probe) !== context.registryRepository
  ) {
    throw new CheapLfsOciOperationError(
      'invalid-input',
      'Cheap LFS OCI storage requires a canonical repository for the selected registry provider.'
    )
  }
  const source =
    /^https:\/\/github\.com\/(?<owner>[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/(?<repository>[A-Za-z0-9._-]{1,100})$/.exec(
      context.sourceRepositoryUrl
    )
  if (
    source?.groups?.owner === undefined ||
    source.groups.repository === undefined ||
    source.groups.repository === '.' ||
    source.groups.repository === '..' ||
    source.groups.repository.toLowerCase().endsWith('.git')
  ) {
    throw new CheapLfsOciOperationError(
      'invalid-input',
      'Cheap LFS OCI storage requires a canonical https://github.com/owner/repository source URL.'
    )
  }
  if (
    context.provider === 'ghcr' &&
    `ghcr.io/${source.groups.owner}/${source.groups.repository}-cheap-lfs`.toLowerCase() !==
      context.registryRepository
  ) {
    throw new CheapLfsOciOperationError(
      'invalid-input',
      'The GHCR package repository must match the annotated GitHub source repository.'
    )
  }
}

function dependencies(deps: ICheapLfsOciOperationDependencies) {
  return {
    runtime: deps.runtime,
    fileSystem: deps.fileSystem ?? defaultCheapLfsOciFileSystem,
    withPreparedImage: deps.withPreparedImage ?? withPreparedCheapLfsGhcrImage,
    resolveRepositoryKey:
      deps.resolveRepositoryKey ?? resolveCheapLfsGhcrRepositoryKey,
    resolveRepositoryKeyForId:
      deps.resolveRepositoryKeyForId ??
      resolveCheapLfsRegistryRepositoryKeyForId,
    discardCreatedKey:
      deps.discardCreatedKey ?? discardCheapLfsCreatedRepositoryKeyIfUnchanged,
  }
}

/**
 * List both legacy Release and OCI pointers through the complete shared Git
 * inventory. Candidate text is already a full format-bounded pointer; raw
 * materialized files carry their authoritative index/HEAD pointer metadata.
 */
export async function listCheapLfsStoredPointers(
  repositoryPath: string,
  fs: Pick<
    ICheapLfsOciFileSystem,
    'scanPointerCandidates'
  > = defaultCheapLfsOciFileSystem
): Promise<ReadonlyArray<ICheapLfsStoredPointer>> {
  const candidates = await fs.scanPointerCandidates(repositoryPath)
  const entries = new Array<ICheapLfsStoredPointer>()
  const seen = new Map<string, string>()
  for (const candidate of candidates) {
    const relativePath = validateCheapLfsTrackedPath(candidate.relativePath)
    if (relativePath === null) {
      continue
    }
    const collisionKey = relativePath.toLowerCase()
    const existingSpelling = seen.get(collisionKey)
    if (existingSpelling === relativePath) {
      continue
    }
    if (existingSpelling !== undefined) {
      throw new CheapLfsOciOperationError(
        'invalid-input',
        'Cheap LFS refused tracked paths whose Windows spellings collide case-insensitively.'
      )
    }
    seen.set(collisionKey, relativePath)
    const text = candidate.text
    const workingTreeState = candidate.workingTreeState ?? 'pointer'
    const metadataSource = candidate.metadataSource ?? 'working-tree'
    const release = parseCheapLfsPointer(text)
    if (release !== null) {
      entries.push({
        backend: 'release',
        relativePath,
        text,
        pointer: release,
        workingTreeState,
        metadataSource,
        workingTreeSha256: candidate.workingTreeSha256,
        workingTreeSizeInBytes: candidate.workingTreeSizeInBytes,
      })
      continue
    }
    try {
      const pointer = parseCheapLfsGhcrPointer(text)
      const provider =
        pointer === null ? null : getCheapLfsOciRegistryProvider(pointer.image)
      if (pointer !== null && provider !== null) {
        entries.push({
          backend: 'oci',
          provider,
          relativePath,
          text,
          pointer,
          workingTreeState,
          metadataSource,
          workingTreeSha256: candidate.workingTreeSha256,
          workingTreeSizeInBytes: candidate.workingTreeSizeInBytes,
        })
      }
    } catch {
      // A pointer-looking but non-canonical file is ordinary working-tree data.
    }
  }
  return entries
}

interface IPreviousState {
  readonly snapshot: ICheapLfsGhcrSnapshot | null
  readonly entries: ReadonlyArray<ICheapLfsOciStoredPointer>
  /** Paths which must be rebuilt from verified local raws, never old blobs. */
  readonly migrationPaths: ReadonlySet<string>
}

function pointerObjectSha256(pointer: ICheapLfsGhcrPointer): string {
  return pointer.object.slice('sha256:'.length)
}

function requirePointerObject(
  pointer: ICheapLfsGhcrPointer,
  snapshot: ICheapLfsGhcrSnapshot
) {
  const sha256 = pointerObjectSha256(pointer)
  const object = snapshot.objects.find(candidate => candidate.sha256 === sha256)
  const layers = object?.chunks.map(chunk => chunk.blob.digest)
  if (
    object === undefined ||
    object.sizeInBytes !== pointer.sizeInBytes ||
    (pointer.keyId !== undefined && pointer.keyId !== snapshot.keyId) ||
    layers?.length !== pointer.layers.length ||
    layers.some((digest, index) => digest !== pointer.layers[index])
  ) {
    throw new CheapLfsOciOperationError(
      'integrity',
      'A Cheap LFS OCI pointer does not match its immutable image snapshot.'
    )
  }
  return object
}

async function loadPreviousState(
  context: ICheapLfsOciRepositoryContext,
  allEntries: ReadonlyArray<ICheapLfsStoredPointer>,
  deps: ReturnType<typeof dependencies>,
  signal?: AbortSignal,
  onProgress?: (progress: ICheapLfsOciOperationProgress) => void
): Promise<IPreviousState> {
  const entries = allEntries.filter(
    (entry): entry is ICheapLfsOciStoredPointer => entry.backend === 'oci'
  )
  if (entries.length === 0) {
    return { snapshot: null, entries, migrationPaths: new Set() }
  }
  const existingTargets = new Map<CheapLfsOciRegistryProvider, string>()
  for (const entry of entries) {
    const registryRepository = getCheapLfsOciRegistryRepository(
      entry.pointer.image
    )
    if (registryRepository === null) {
      throw new CheapLfsOciOperationError(
        'inconsistent-pointers',
        'An existing Cheap LFS OCI pointer has an invalid registry repository.'
      )
    }
    const existingRepository = existingTargets.get(entry.provider)
    if (
      existingRepository !== undefined &&
      existingRepository !== registryRepository
    ) {
      throw new CheapLfsOciOperationError(
        'inconsistent-pointers',
        'Existing Cheap LFS OCI pointers must share one registry repository per provider.'
      )
    }
    existingTargets.set(entry.provider, registryRepository)
  }
  const currentRegistryRepository = existingTargets.get(context.provider)
  if (
    currentRegistryRepository !== undefined &&
    currentRegistryRepository !== context.registryRepository
  ) {
    throw new CheapLfsOciOperationError(
      'inconsistent-pointers',
      'Existing Cheap LFS OCI pointers use a different registry repository.'
    )
  }

  const migrationEntries = entries.filter(
    entry => entry.provider !== context.provider
  )
  const migrationPaths = new Set(
    migrationEntries.map(entry => entry.relativePath)
  )
  for (const entry of migrationEntries) {
    abortIfNeeded(signal)
    if (
      entry.workingTreeState !== 'materialized' ||
      entry.metadataSource !== 'index' ||
      entry.workingTreeSha256 !== pointerObjectSha256(entry.pointer) ||
      entry.workingTreeSizeInBytes !== entry.pointer.sizeInBytes
    ) {
      throw new CheapLfsOciOperationError(
        'inconsistent-pointers',
        'Materialize every old-provider Cheap LFS OCI pointer without edits before continuing registry migration.'
      )
    }
    const actual = await deps.fileSystem.hashFile(
      absoluteTrackedPath(context.repositoryPath, entry.relativePath),
      signal
    )
    if (
      actual.sha256 !== pointerObjectSha256(entry.pointer) ||
      actual.sizeInBytes !== entry.pointer.sizeInBytes
    ) {
      throw new CheapLfsOciOperationError(
        'inconsistent-pointers',
        'An existing materialized Cheap LFS file changed before its registry migration.'
      )
    }
  }

  // Cross-provider blobs are never pulled or reused. Entries already moved to
  // the requested provider may reuse their validated immutable snapshots while
  // remaining old-provider paths are rebuilt from the exact local raw bytes.
  const currentEntries = entries.filter(
    entry => entry.provider === context.provider
  )
  if (currentEntries.length === 0) {
    return { snapshot: null, entries, migrationPaths }
  }
  const byImage = new Map<string, ICheapLfsOciStoredPointer[]>()
  for (const entry of currentEntries) {
    const group = byImage.get(entry.pointer.image) ?? []
    group.push(entry)
    byImage.set(entry.pointer.image, group)
  }
  const snapshots = new Map<string, ICheapLfsGhcrSnapshot>()
  let completedFiles = 0
  for (const [imageReference, group] of byImage) {
    abortIfNeeded(signal)
    const representative = group[0]
    const snapshot = await deps.runtime.withPulledImage(
      {
        pointer: representative.pointer,
        expectedRepositoryIdentity: context.repositoryIdentity,
        expectedVisibility: imageVisibility(context.visibility),
        signal,
        onProgress: transfer =>
          onProgress?.({
            phase: 'pulling',
            currentPath: representative.relativePath,
            completedFiles,
            totalFiles: currentEntries.length,
            attempt: 0,
            maximumChunkBytes: CheapLfsGhcrMaximumChunkBytes,
            transfer,
          }),
      },
      async image => {
        if (image.immutableReference !== imageReference) {
          throw new CheapLfsOciOperationError(
            'integrity',
            'The pulled Cheap LFS image does not match its immutable pointer.'
          )
        }
        const validated = validateCheapLfsGhcrSnapshot(
          image.snapshot,
          context.repositoryIdentity,
          imageVisibility(context.visibility)
        )
        for (const entry of group) {
          requirePointerObject(entry.pointer, validated)
        }
        return validated
      }
    )
    snapshots.set(imageReference, snapshot)
    completedFiles += group.length
  }

  const first = snapshots.values().next().value as
    | ICheapLfsGhcrSnapshot
    | undefined
  if (first === undefined) {
    throw new CheapLfsOciOperationError(
      'integrity',
      'Cheap LFS could not resolve the current OCI image snapshot.'
    )
  }
  for (const snapshot of snapshots.values()) {
    if (snapshot.keyId !== first.keyId) {
      throw new CheapLfsOciOperationError(
        'inconsistent-pointers',
        'Existing private Cheap LFS pointers require different repository keys.'
      )
    }
  }

  // Mixed immutable digests can remain after an interrupted local rewrite.
  // Merge only objects still referenced by the working tree, choosing any one
  // valid encrypted representation for duplicate plaintext identities.
  const objects = new Map<string, ICheapLfsGhcrSnapshot['objects'][number]>()
  for (const entry of currentEntries) {
    const snapshot = snapshots.get(entry.pointer.image)!
    const object = requirePointerObject(entry.pointer, snapshot)
    objects.set(object.sha256, objects.get(object.sha256) ?? object)
  }
  return {
    entries,
    migrationPaths,
    snapshot: {
      ...first,
      objects: [...objects.values()].sort((a, b) =>
        a.sha256.localeCompare(b.sha256)
      ),
    },
  }
}

interface IResolvedPublishKey {
  readonly key: Buffer | null
  readonly keyId: string | null
  readonly created: boolean
  readonly absolutePath: string | null
  readonly commitPath: typeof CheapLfsRegistryRepositoryKeyPath | null
  readonly cleanupProof: ICheapLfsCreatedRepositoryKeyCleanupProof | null
}

async function validateResolvedKey(
  context: ICheapLfsOciRepositoryContext,
  result: ICheapLfsGhcrRepositoryKeyResult
): Promise<IResolvedPublishKey> {
  if (result.key === null || result.path === null || result.key.length !== 32) {
    result.key?.fill(0)
    throw new CheapLfsOciOperationError(
      'integrity',
      'Private Cheap LFS OCI storage did not resolve an exact repository key.'
    )
  }
  const expected = absoluteTrackedPath(
    context.repositoryPath,
    CheapLfsRegistryRepositoryKeyPath
  )
  const [actualCanonical, expectedCanonical] = await Promise.all([
    realpath(result.path),
    realpath(expected),
  ])
  if (actualCanonical.toLowerCase() !== expectedCanonical.toLowerCase()) {
    result.key.fill(0)
    throw new CheapLfsOciOperationError(
      'integrity',
      'Private Cheap LFS OCI storage resolved an unexpected key path.'
    )
  }
  return {
    key: result.key,
    keyId: cheapLfsRegistryRepositoryKeyId(result.key),
    created: result.created,
    absolutePath: result.path,
    commitPath: CheapLfsRegistryRepositoryKeyPath,
    cleanupProof: result.created
      ? await captureCheapLfsCreatedRepositoryKeyCleanupProof(
          result.path,
          result.key
        )
      : null,
  }
}

async function resolvePublishKey(
  context: ICheapLfsOciRepositoryContext,
  previous: ICheapLfsGhcrSnapshot | null,
  deps: ReturnType<typeof dependencies>
): Promise<IResolvedPublishKey> {
  if (context.visibility === 'verified-public') {
    return {
      key: null,
      keyId: null,
      created: false,
      absolutePath: null,
      commitPath: null,
      cleanupProof: null,
    }
  }
  if (previous === null) {
    return await validateResolvedKey(
      context,
      await deps.resolveRepositoryKey({
        repositoryPath: context.repositoryPath,
        visibility: context.visibility,
        createIfMissing: true,
      })
    )
  }
  if (previous.keyId === null) {
    throw new CheapLfsOciOperationError(
      'integrity',
      'A private Cheap LFS OCI image is missing its repository key identity.'
    )
  }
  const exact = await deps.resolveRepositoryKeyForId({
    repositoryPath: context.repositoryPath,
    keyId: previous.keyId,
  })
  const canonical = absoluteTrackedPath(
    context.repositoryPath,
    CheapLfsRegistryRepositoryKeyPath
  )
  if (
    exact.path !== null &&
    (await realpath(exact.path)).toLowerCase() ===
      (await realpath(canonical)).toLowerCase()
  ) {
    return await validateResolvedKey(context, exact)
  }

  // Migrate (never rotate) a retained legacy key before publishing a new image.
  exact.key?.fill(0)
  return await validateResolvedKey(
    context,
    await deps.resolveRepositoryKey({
      repositoryPath: context.repositoryPath,
      visibility: context.visibility,
      createIfMissing: true,
    })
  )
}

async function discardCreatedPublishKeyAfterFailure(
  key: IResolvedPublishKey | null,
  deps: ReturnType<typeof dependencies>,
  publishError: unknown
): Promise<void> {
  if (!key?.created || key.absolutePath === null) {
    return
  }
  if (key.cleanupProof === null) {
    throw new CheapLfsOciOperationError(
      'cleanup',
      `${messageFor(
        publishError
      )} The newly created repository key was retained because its cleanup identity could not be proven.`
    )
  }
  let cleanupResult: CheapLfsCreatedRepositoryKeyCleanupResult
  try {
    cleanupResult = await deps.discardCreatedKey(key.cleanupProof)
  } catch (cleanupError) {
    throw new CheapLfsOciOperationError(
      'cleanup',
      `${messageFor(
        publishError
      )} The newly created repository key could not be safely removed: ${messageFor(
        cleanupError
      )}`
    )
  }
  if (cleanupResult === 'retained-replaced') {
    throw new CheapLfsOciOperationError(
      'cleanup',
      `${messageFor(
        publishError
      )} The repository key was replaced concurrently, so Cheap LFS retained it instead of deleting an unowned file.`
    )
  }
}

function uniqueDesiredObjects(
  values: ReadonlyArray<ICheapLfsGhcrDesiredObject>
): ReadonlyArray<ICheapLfsGhcrDesiredObject> {
  const bySha = new Map<string, ICheapLfsGhcrDesiredObject>()
  for (const value of values) {
    const current = bySha.get(value.sha256)
    if (current !== undefined && current.sizeInBytes !== value.sizeInBytes) {
      throw new CheapLfsOciOperationError(
        'integrity',
        'The same Cheap LFS object digest was assigned inconsistent sizes.'
      )
    }
    if (current === undefined || current.sourcePath === undefined) {
      bySha.set(value.sha256, value)
    }
  }
  return [...bySha.values()]
}

interface IPublishedImage {
  readonly result: ICheapLfsGhcrPublishResult
  readonly attempts: number
  readonly maximumChunkBytes: number
}

function validatePublishedImage(
  context: ICheapLfsOciRepositoryContext,
  desiredObjects: ReadonlyArray<ICheapLfsGhcrDesiredObject>,
  expectedKeyId: string | null,
  result: ICheapLfsGhcrPublishResult
): void {
  if (
    result.provider !== context.provider ||
    getCheapLfsOciRegistryRepository(result.immutableReference) !==
      context.registryRepository ||
    getCheapLfsOciRegistryProvider(result.immutableReference) !==
      context.provider ||
    result.immutableReference !==
      `${context.registryRepository}@${result.manifestDigest}`
  ) {
    throw new CheapLfsOciOperationError(
      'integrity',
      'The verified registry publish returned an unexpected immutable image.'
    )
  }
  const expected = new Map(
    desiredObjects.map(object => [object.sha256, object.sizeInBytes])
  )
  const actual = new Set<string>()
  for (const published of result.pointers) {
    const pointer = parseCheapLfsGhcrPointer(published.text)
    const expectedSize = expected.get(published.objectSha256)
    if (
      pointer === null ||
      actual.has(published.objectSha256) ||
      expectedSize === undefined ||
      expectedSize !== published.sizeInBytes ||
      pointer.image !== result.immutableReference ||
      pointer.object !== `sha256:${published.objectSha256}` ||
      pointer.sizeInBytes !== published.sizeInBytes ||
      (context.visibility === 'verified-private'
        ? pointer.keyId !== expectedKeyId
        : pointer.keyId !== undefined)
    ) {
      throw new CheapLfsOciOperationError(
        'integrity',
        'The verified registry publish returned an invalid object pointer set.'
      )
    }
    actual.add(published.objectSha256)
  }
  if (actual.size !== expected.size) {
    throw new CheapLfsOciOperationError(
      'integrity',
      'The verified registry publish omitted an object pointer.'
    )
  }
}

interface ICheapLfsOciDisplayFile {
  readonly relativePath: string
  readonly sizeInBytes: number
}

function displayFilesByObjectSha256(
  values: ReadonlyArray<ICheapLfsOciDisplayFile & { readonly sha256: string }>
): ReadonlyMap<string, ICheapLfsOciDisplayFile> {
  const result = new Map<string, ICheapLfsOciDisplayFile>()
  for (const value of values) {
    if (!result.has(value.sha256)) {
      result.set(value.sha256, {
        relativePath: value.relativePath,
        sizeInBytes: value.sizeInBytes,
      })
    }
  }
  return result
}

async function publishWithAdaptiveChunks(
  context: ICheapLfsOciRepositoryContext,
  desiredObjects: ReadonlyArray<ICheapLfsGhcrDesiredObject>,
  displayFileByObjectSha256: ReadonlyMap<string, ICheapLfsOciDisplayFile>,
  previousSnapshot: ICheapLfsGhcrSnapshot | null,
  key: IResolvedPublishKey,
  deps: ReturnType<typeof dependencies>,
  totalFiles: number,
  revalidateBeforePublish?: () => Promise<void>,
  signal?: AbortSignal,
  onProgress?: (progress: ICheapLfsOciOperationProgress) => void
): Promise<IPublishedImage> {
  let maximumChunkBytes = CheapLfsGhcrMaximumChunkBytes
  let resumableSnapshot = previousSnapshot
  for (
    let attempt = 1;
    attempt <= CheapLfsGhcrMaximumAdaptivePrepareAttempts;
    attempt++
  ) {
    abortIfNeeded(signal)
    // A mutable box makes the prepared image visible to the retry handler even
    // though TypeScript does not model assignment inside the callback.
    const attemptedImage: { value: ICheapLfsGhcrPreparedImage | null } = {
      value: null,
    }
    try {
      const result = await deps.withPreparedImage(
        {
          repositoryIdentity: context.repositoryIdentity,
          sourceRepositoryUrl: context.sourceRepositoryUrl,
          visibility: imageVisibility(context.visibility),
          desiredObjects,
          previousSnapshot: resumableSnapshot,
          encryptionKey: key.key,
          maximumChunkBytes,
          signal,
          onProgress: transfer =>
            onProgress?.({
              phase: 'preparing',
              currentPath: null,
              completedFiles: transfer.completedObjects,
              totalFiles,
              attempt,
              maximumChunkBytes,
              transfer,
            }),
        },
        async image => {
          attemptedImage.value = image
          await revalidateBeforePublish?.()
          return deps.runtime.publish({
            image,
            provider: context.provider,
            registryRepository: context.registryRepository,
            repositoryIdentity: context.repositoryIdentity,
            visibility: imageVisibility(context.visibility),
            parallelBlobUploads: attempt === 1 && context.parallelBlobTransfers,
            keyCreated: key.created,
            keyRelativePath: key.commitPath,
            attempt,
            signal,
            onProgress: transfer => {
              const activeObjectProgress = new Map(
                transfer.activeObjects?.map(active => [
                  active.objectSha256,
                  active,
                ]) ?? []
              )
              const activeObjects = new Set(
                transfer.activeObjects?.map(active => active.objectSha256) ??
                  transfer.activeObjectSha256s ??
                  []
              )
              const activeFiles = [...displayFileByObjectSha256]
                .filter(([objectSha256]) => activeObjects.has(objectSha256))
                .map(([objectSha256, file]) => {
                  const active = activeObjectProgress.get(objectSha256)
                  return {
                    relativePath: file.relativePath,
                    objectSha256,
                    processedBytes: Math.min(
                      file.sizeInBytes,
                      Math.max(0, active?.processedBytes ?? 0)
                    ),
                    totalBytes: file.sizeInBytes,
                  }
                })
              onProgress?.({
                phase: 'publishing',
                currentPath: activeFiles[0]?.relativePath ?? null,
                activeFiles,
                completedFiles: Math.min(
                  totalFiles,
                  Math.max(0, transfer.completedObjects)
                ),
                totalFiles,
                attempt,
                maximumChunkBytes,
                transfer,
              })
            },
          })
        }
      )
      validatePublishedImage(context, desiredObjects, key.keyId, result)
      return { result, attempts: attempt, maximumChunkBytes }
    } catch (error) {
      if (isCancellation(error, signal)) {
        throw error
      }
      if (!(error instanceof CheapLfsGhcrLayerUploadTimeoutError)) {
        throw error
      }
      if (attemptedImage.value !== null) {
        const prepared = attemptedImage.value
        const completed = new Set(error.completedObjectSha256s)
        const localObjects = new Set(
          prepared.layers
            .filter(layer => !layer.reused)
            .map(layer => layer.object.sha256)
        )
        resumableSnapshot = {
          ...prepared.snapshot,
          // Reused objects are already referenced by the last published
          // snapshot. Newly prepared objects are carried into the retry only
          // when every one of their chunks completed, preserving their random
          // encryption metadata and content digests without nonce reuse.
          objects: prepared.snapshot.objects.filter(
            object =>
              !localObjects.has(object.sha256) || completed.has(object.sha256)
          ),
        }
      }
      const expectedNext = getNextCheapLfsGhcrChunkBytes(maximumChunkBytes)
      if (
        attempt >= CheapLfsGhcrMaximumAdaptivePrepareAttempts ||
        error.currentMaximumChunkBytes !== maximumChunkBytes ||
        error.recommendedMaximumChunkBytes !== expectedNext ||
        expectedNext === null ||
        expectedNext < CheapLfsGhcrMinimumAdaptiveChunkBytes
      ) {
        throw error
      }
      maximumChunkBytes = expectedNext
    }
  }
  throw new CheapLfsOciOperationError(
    'integrity',
    'Cheap LFS OCI adaptive upload attempts were exhausted.'
  )
}

interface IPreparedTarget {
  readonly relativePath: string
  /** Canonical tracked destination captured before any registry request. */
  readonly absolutePath: string
  /** Private verified copy used exclusively as the OCI staging source. */
  readonly sourcePath: string
  readonly sha256: string
  readonly sizeInBytes: number
  readonly trackedProof?: ICheapLfsTrackedFileProof
  readonly sourceProof?: ICheapLfsSourceFileProof
  readonly ownedSource?: ICheapLfsOwnedFile
}

interface IMigrationSource {
  readonly relativePath: string
  readonly sourcePath: string
  readonly destinationProof: ICheapLfsTrackedFileProof
  readonly sourceProof: ICheapLfsSourceFileProof
  readonly owned: ICheapLfsOwnedFile
}

async function prepareTargets(
  context: ICheapLfsOciRepositoryContext,
  targets: ReadonlyArray<ICheapLfsOciPinTarget>,
  occupiedPaths: ReadonlySet<string>,
  fs: ICheapLfsOciFileSystem,
  failures: ICheapLfsOciFileFailure[],
  signal?: AbortSignal,
  onProgress?: (progress: ICheapLfsOciOperationProgress) => void
): Promise<ReadonlyArray<IPreparedTarget>> {
  const prepared = new Array<IPreparedTarget>()
  const seen = new Set<string>()
  const occupiedPathKeys = new Set(
    [...occupiedPaths].map(path => path.toLowerCase())
  )
  for (const target of targets) {
    abortIfNeeded(signal)
    let relativePath: string
    try {
      relativePath = checkedRelativePath(target.relativePath)
    } catch (error) {
      failures.push({
        relativePath: target.relativePath,
        operation: 'pin',
        message: messageFor(error),
      })
      continue
    }
    const relativePathKey = relativePath.toLowerCase()
    if (seen.has(relativePathKey) || occupiedPathKeys.has(relativePathKey)) {
      failures.push({
        relativePath,
        operation: 'pin',
        message: seen.has(relativePathKey)
          ? 'The same Cheap LFS path was selected more than once.'
          : 'Materialize the existing Cheap LFS pointer before replacing this path.',
      })
      continue
    }
    seen.add(relativePathKey)
    const absolutePath = absoluteTrackedPath(
      context.repositoryPath,
      relativePath
    )
    try {
      onProgress?.({
        phase: 'hashing',
        currentPath: relativePath,
        completedFiles: prepared.length,
        totalFiles: targets.length,
        attempt: 0,
        maximumChunkBytes: CheapLfsGhcrMaximumChunkBytes,
      })
      const verified = await fs.trackedPaths?.prepareUpload(
        context.repositoryPath,
        relativePath,
        absolutePath,
        CheapLfsGhcrMaximumChunkBytes,
        signal
      )
      const hashed =
        verified === undefined
          ? await fs.hashFile(absolutePath, signal)
          : {
              sha256: verified.sha256,
              sizeInBytes: verified.sizeInBytes,
            }
      if (
        !Sha256Pattern.test(hashed.sha256) ||
        !Number.isSafeInteger(hashed.sizeInBytes) ||
        hashed.sizeInBytes <= 0 ||
        (target.expectedSizeInBytes !== undefined &&
          target.expectedSizeInBytes !== hashed.sizeInBytes)
      ) {
        if (verified !== undefined && fs.trackedPaths !== undefined) {
          await fs.trackedPaths.cleanupOwned(verified.owned)
        }
        throw new CheapLfsOciOperationError(
          'integrity',
          'The selected Cheap LFS file changed size or produced an invalid digest.'
        )
      }
      prepared.push({
        relativePath,
        absolutePath,
        sourcePath: verified?.owned.path ?? absolutePath,
        ...hashed,
        trackedProof: verified?.destination,
        sourceProof: verified?.source,
        ownedSource: verified?.owned,
      })
    } catch (error) {
      if (isCancellation(error, signal)) {
        await cleanupPreparedTargets(prepared, fs)
        throw error
      }
      failures.push({
        relativePath,
        operation: 'pin',
        message: messageFor(error),
      })
    }
  }
  return prepared
}

async function cleanupPreparedTargets(
  targets: ReadonlyArray<IPreparedTarget>,
  fs: ICheapLfsOciFileSystem
): Promise<void> {
  if (fs.trackedPaths === undefined) {
    return
  }
  let firstError: unknown = null
  for (const target of targets) {
    if (target.ownedSource === undefined) {
      continue
    }
    try {
      await fs.trackedPaths.cleanupOwned(target.ownedSource)
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError !== null) {
    throw firstError
  }
}

async function prepareMigrationSources(
  context: ICheapLfsOciRepositoryContext,
  entries: ReadonlyArray<ICheapLfsOciStoredPointer>,
  fs: ICheapLfsOciFileSystem,
  signal?: AbortSignal
): Promise<ReadonlyMap<string, IMigrationSource>> {
  const prepared = new Map<string, IMigrationSource>()
  if (fs.trackedPaths === undefined) {
    return prepared
  }
  try {
    for (const entry of entries) {
      const verified = await fs.trackedPaths.prepareUpload(
        context.repositoryPath,
        entry.relativePath,
        absoluteTrackedPath(context.repositoryPath, entry.relativePath),
        CheapLfsGhcrMaximumChunkBytes,
        signal
      )
      if (
        verified.sha256 !== pointerObjectSha256(entry.pointer) ||
        verified.sizeInBytes !== entry.pointer.sizeInBytes
      ) {
        await fs.trackedPaths.cleanupOwned(verified.owned)
        throw new CheapLfsOciOperationError(
          'integrity',
          'A materialized Cheap LFS migration source changed before its private upload copy was verified.'
        )
      }
      prepared.set(entry.relativePath, {
        relativePath: entry.relativePath,
        sourcePath: verified.owned.path,
        destinationProof: verified.destination,
        sourceProof: verified.source,
        owned: verified.owned,
      })
    }
    return prepared
  } catch (error) {
    await cleanupMigrationSources(prepared, fs)
    throw error
  }
}

async function revalidateMigrationSources(
  sources: ReadonlyMap<string, IMigrationSource>,
  fs: ICheapLfsOciFileSystem
): Promise<void> {
  if (fs.trackedPaths === undefined) {
    return
  }
  for (const source of sources.values()) {
    await fs.trackedPaths.revalidateSource(source.sourceProof)
    await fs.trackedPaths.revalidate(source.destinationProof)
  }
}

async function cleanupMigrationSources(
  sources: ReadonlyMap<string, IMigrationSource>,
  fs: ICheapLfsOciFileSystem
): Promise<void> {
  if (fs.trackedPaths === undefined) {
    return
  }
  let firstError: unknown = null
  for (const source of sources.values()) {
    try {
      await fs.trackedPaths.cleanupOwned(source.owned)
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError !== null) {
    throw firstError
  }
}

function publishedPointersBySha(result: ICheapLfsGhcrPublishResult) {
  return new Map(
    result.pointers.map(pointer => [pointer.objectSha256, pointer])
  )
}

type CheapLfsTrackedProofs = ReadonlyMap<string, ICheapLfsTrackedFileProof>

async function captureTrackedInputProofs(
  context: ICheapLfsOciRepositoryContext,
  entries: ReadonlyArray<ICheapLfsOciStoredPointer>,
  fs: ICheapLfsOciFileSystem
): Promise<CheapLfsTrackedProofs | undefined> {
  if (fs.trackedPaths === undefined) {
    return undefined
  }
  const proofs = new Map<string, ICheapLfsTrackedFileProof>()
  for (const entry of entries) {
    proofs.set(
      entry.relativePath,
      await fs.trackedPaths.proveExisting(
        context.repositoryPath,
        entry.relativePath
      )
    )
  }
  return proofs
}

async function verifyMutationInputs(
  context: ICheapLfsOciRepositoryContext,
  existing: ReadonlyArray<ICheapLfsOciStoredPointer>,
  targets: ReadonlyArray<IPreparedTarget>,
  fs: ICheapLfsOciFileSystem,
  trackedProofs?: CheapLfsTrackedProofs,
  signal?: AbortSignal
): Promise<ReadonlyArray<ICheapLfsOciFileFailure>> {
  const failures = new Array<ICheapLfsOciFileFailure>()
  for (const entry of existing) {
    abortIfNeeded(signal)
    try {
      const absolutePath = absoluteTrackedPath(
        context.repositoryPath,
        entry.relativePath
      )
      const proof = trackedProofs?.get(entry.relativePath)
      if (proof !== undefined && fs.trackedPaths !== undefined) {
        await fs.trackedPaths.revalidate(proof)
      }
      if (entry.workingTreeState === 'pointer') {
        const actual =
          proof === undefined || fs.trackedPaths === undefined
            ? await fs.readPointerText(absolutePath)
            : await fs.trackedPaths.readText(
                proof,
                CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES
              )
        if (actual !== entry.text) {
          throw new Error(
            'The Cheap LFS pointer changed while its new image was publishing.'
          )
        }
      } else {
        const actual =
          proof === undefined
            ? await fs.hashFile(absolutePath, signal)
            : {
                sha256: proof.sha256,
                sizeInBytes: proof.sizeInBytes,
              }
        if (
          actual.sha256 !== entry.workingTreeSha256 ||
          actual.sizeInBytes !== entry.workingTreeSizeInBytes
        ) {
          throw new Error(
            'The materialized Cheap LFS file changed while its new image was publishing.'
          )
        }
      }
    } catch (error) {
      failures.push({
        relativePath: entry.relativePath,
        operation: 'rewrite',
        message: messageFor(error),
      })
    }
  }
  for (const target of targets) {
    abortIfNeeded(signal)
    try {
      if (
        fs.trackedPaths !== undefined &&
        target.sourceProof !== undefined &&
        target.trackedProof !== undefined
      ) {
        await fs.trackedPaths.revalidateSource(target.sourceProof)
        await fs.trackedPaths.revalidate(target.trackedProof)
      }
      const current = await fs.hashFile(target.sourcePath, signal)
      if (
        current.sha256 !== target.sha256 ||
        current.sizeInBytes !== target.sizeInBytes
      ) {
        throw new Error(
          'The selected Cheap LFS source changed while its image was publishing.'
        )
      }
    } catch (error) {
      if (isCancellation(error, signal)) {
        throw error
      }
      failures.push({
        relativePath: target.relativePath,
        operation: 'pin',
        message: messageFor(error),
      })
    }
  }
  return failures
}

async function requireMutationInputsUnchanged(
  context: ICheapLfsOciRepositoryContext,
  existing: ReadonlyArray<ICheapLfsOciStoredPointer>,
  targets: ReadonlyArray<IPreparedTarget>,
  fs: ICheapLfsOciFileSystem,
  trackedProofs?: CheapLfsTrackedProofs,
  signal?: AbortSignal
): Promise<void> {
  const conflicts = await verifyMutationInputs(
    context,
    existing,
    targets,
    fs,
    trackedProofs,
    signal
  )
  if (conflicts.length > 0) {
    throw new CheapLfsOciOperationError(
      'integrity',
      conflicts.map(conflict => conflict.message).join(' ')
    )
  }
}

function failedMutationResult(
  context: ICheapLfsOciRepositoryContext,
  failures: ReadonlyArray<ICheapLfsOciFileFailure>,
  attempts: number = 0,
  maximumChunkBytes: number = CheapLfsGhcrMaximumChunkBytes
): ICheapLfsOciMutationResult {
  return {
    provider: context.provider,
    published: false,
    immutableReference: null,
    attempts,
    maximumChunkBytes,
    files: [],
    failures,
    commitPaths: [],
    keyCommitPath: null,
    keyCreated: false,
  }
}

/**
 * Add raw files to one logical OCI image. Every currently tracked OCI pointer
 * is carried forward and unchanged layers are reused. Pointer files move to
 * the verified immutable manifest after publish; verified materialized raw
 * files retain their still-valid committed pointer so local bytes stay local.
 */
export async function pinCheapLfsFilesToOci(
  context: ICheapLfsOciRepositoryContext,
  targets: ReadonlyArray<ICheapLfsOciPinTarget>,
  operationDependencies: ICheapLfsOciOperationDependencies,
  signal?: AbortSignal,
  onProgress?: (progress: ICheapLfsOciOperationProgress) => void
): Promise<ICheapLfsOciMutationResult> {
  validateContext(context)
  abortIfNeeded(signal)
  const deps = dependencies(operationDependencies)
  onProgress?.({
    phase: 'scanning',
    currentPath: null,
    completedFiles: 0,
    totalFiles: targets.length,
    attempt: 0,
    maximumChunkBytes: CheapLfsGhcrMaximumChunkBytes,
  })
  const stored = await listCheapLfsStoredPointers(
    context.repositoryPath,
    deps.fileSystem
  )
  const trackedInputProofs = await captureTrackedInputProofs(
    context,
    stored.filter(
      (entry): entry is ICheapLfsOciStoredPointer => entry.backend === 'oci'
    ),
    deps.fileSystem
  )
  // A real pointer cannot be hashed as a replacement source. A materialized
  // or locally edited raw file is deliberately replaceable: explicit pinning
  // publishes its current bytes and supersedes the prior object for this path.
  const occupied = new Set(
    stored
      .filter(entry => entry.workingTreeState === 'pointer')
      .map(entry => entry.relativePath)
  )
  const failures = new Array<ICheapLfsOciFileFailure>()
  const preparedTargets = await prepareTargets(
    context,
    targets,
    occupied,
    deps.fileSystem,
    failures,
    signal,
    onProgress
  )
  if (preparedTargets.length === 0) {
    return failedMutationResult(context, failures)
  }

  let migrationSources: ReadonlyMap<string, IMigrationSource> = new Map()
  try {
    let key: IResolvedPublishKey | null = null
    let published: IPublishedImage
    let previous: IPreviousState
    try {
      previous = await loadPreviousState(
        context,
        stored,
        deps,
        signal,
        onProgress
      )
      key = await resolvePublishKey(context, previous.snapshot, deps)
      const replacementPaths = new Set(
        preparedTargets.map(target => target.relativePath)
      )
      const retainedEntries = previous.entries.filter(
        entry => !replacementPaths.has(entry.relativePath)
      )
      const retainedMigrationEntries = retainedEntries.filter(entry =>
        previous.migrationPaths.has(entry.relativePath)
      )
      if (retainedMigrationEntries.length > 0) {
        migrationSources = await prepareMigrationSources(
          context,
          retainedMigrationEntries,
          deps.fileSystem,
          signal
        )
      }
      const desiredObjects = uniqueDesiredObjects([
        ...retainedEntries.map(entry => ({
          sha256: pointerObjectSha256(entry.pointer),
          sizeInBytes: entry.pointer.sizeInBytes,
          ...(previous.migrationPaths.has(entry.relativePath)
            ? {
                sourcePath:
                  migrationSources.get(entry.relativePath)?.sourcePath ??
                  absoluteTrackedPath(
                    context.repositoryPath,
                    entry.relativePath
                  ),
              }
            : {}),
        })),
        ...preparedTargets.map(target => ({
          sha256: target.sha256,
          sizeInBytes: target.sizeInBytes,
          sourcePath: target.sourcePath,
        })),
      ])
      published = await publishWithAdaptiveChunks(
        context,
        desiredObjects,
        displayFilesByObjectSha256([
          ...retainedEntries.map(entry => ({
            relativePath: entry.relativePath,
            sha256: pointerObjectSha256(entry.pointer),
            sizeInBytes: entry.pointer.sizeInBytes,
          })),
          ...preparedTargets,
        ]),
        previous.snapshot,
        key,
        deps,
        retainedEntries.length + preparedTargets.length,
        async () => {
          await revalidateMigrationSources(migrationSources, deps.fileSystem)
          await requireMutationInputsUnchanged(
            context,
            retainedEntries,
            preparedTargets,
            deps.fileSystem,
            trackedInputProofs,
            signal
          )
        },
        signal,
        onProgress
      )
    } catch (error) {
      try {
        await discardCreatedPublishKeyAfterFailure(key, deps, error)
      } catch (cleanupError) {
        key?.key?.fill(0)
        throw cleanupError
      }
      key?.key?.fill(0)
      if (isCancellation(error, signal)) {
        throw error
      }
      failures.push(
        ...preparedTargets.map(target => ({
          relativePath: target.relativePath,
          operation: 'pin' as const,
          message: messageFor(error),
        }))
      )
      return failedMutationResult(context, failures)
    } finally {
      key?.key?.fill(0)
    }

    const replacementPaths = new Set(
      preparedTargets.map(target => target.relativePath)
    )
    const retainedEntries = previous.entries.filter(
      entry => !replacementPaths.has(entry.relativePath)
    )
    const conflicts = await verifyMutationInputs(
      context,
      retainedEntries,
      preparedTargets,
      deps.fileSystem,
      trackedInputProofs,
      signal
    )
    if (conflicts.length > 0) {
      const conflictedPaths = new Set(
        conflicts.map(failure => failure.relativePath)
      )
      failures.push(...conflicts)
      failures.push(
        ...preparedTargets
          .filter(target => !conflictedPaths.has(target.relativePath))
          .map(target => ({
            relativePath: target.relativePath,
            operation: 'pin' as const,
            message:
              'No local pointers were changed because another Cheap LFS input changed during publish.',
          }))
      )
      return {
        ...failedMutationResult(
          context,
          failures,
          published.attempts,
          published.maximumChunkBytes
        ),
        published: true,
        immutableReference: published.result.immutableReference,
        keyCommitPath: key?.commitPath ?? null,
        keyCreated: key?.created ?? false,
      }
    }

    // Cancellation is honored up to the all-inputs-verified commit point. Once
    // pointer replacement starts, finish every independent atomic write so the
    // working tree converges as far as possible on the published image.
    abortIfNeeded(signal)
    const pointers = publishedPointersBySha(published.result)
    const files = new Array<ICheapLfsOciFileResult>()
    const changedPaths = new Array<string>()
    const mutations: Array<{
      readonly relativePath: string
      readonly absolutePath: string
      readonly oldText: string | null
      readonly sha256: string
      readonly sizeInBytes: number
      readonly operation: 'pinned' | 'rewritten'
      readonly preserveMaterializedBytes: boolean
      readonly trackedProof?: ICheapLfsTrackedFileProof
    }> = [
      ...retainedEntries.map(entry => ({
        relativePath: entry.relativePath,
        absolutePath: absoluteTrackedPath(
          context.repositoryPath,
          entry.relativePath
        ),
        oldText: entry.text,
        sha256: pointerObjectSha256(entry.pointer),
        sizeInBytes: entry.pointer.sizeInBytes,
        operation: 'rewritten' as const,
        preserveMaterializedBytes:
          !previous.migrationPaths.has(entry.relativePath) &&
          entry.workingTreeState !== 'pointer',
        trackedProof: trackedInputProofs?.get(entry.relativePath),
      })),
      ...preparedTargets.map(target => ({
        relativePath: target.relativePath,
        absolutePath: target.absolutePath,
        oldText: null,
        sha256: target.sha256,
        sizeInBytes: target.sizeInBytes,
        operation: 'pinned' as const,
        preserveMaterializedBytes: false,
        trackedProof: target.trackedProof,
      })),
    ]
    const retainedEntriesByPath = new Map(
      retainedEntries.map(entry => [entry.relativePath, entry])
    )
    const preparedTargetsByPath = new Map(
      preparedTargets.map(target => [target.relativePath, target])
    )
    let completed = 0
    for (const mutation of mutations) {
      const pointerText = pointers.get(mutation.sha256)!.text
      const changed =
        !mutation.preserveMaterializedBytes && pointerText !== mutation.oldText
      let mutationSucceeded = !changed
      try {
        onProgress?.({
          phase: 'updating-pointers',
          currentPath: mutation.relativePath,
          completedFiles: completed,
          totalFiles: mutations.length,
          attempt: published.attempts,
          maximumChunkBytes: published.maximumChunkBytes,
        })
        if (changed) {
          const retainedEntry = retainedEntriesByPath.get(mutation.relativePath)
          const preparedTarget = preparedTargetsByPath.get(
            mutation.relativePath
          )
          await requireMutationInputsUnchanged(
            context,
            retainedEntry === undefined ? [] : [retainedEntry],
            preparedTarget === undefined ? [] : [preparedTarget],
            deps.fileSystem,
            trackedInputProofs,
            signal
          )
          if (
            mutation.trackedProof !== undefined &&
            deps.fileSystem.trackedPaths !== undefined
          ) {
            await deps.fileSystem.trackedPaths.publishText(
              mutation.trackedProof,
              pointerText
            )
          } else {
            await deps.fileSystem.writePointer(
              mutation.absolutePath,
              pointerText
            )
          }
          mutationSucceeded = true
        }
      } catch (error) {
        mutationSucceeded =
          changed &&
          (mutation.trackedProof !== undefined &&
          deps.fileSystem.trackedPaths !== undefined
            ? error instanceof CheapLfsTrackedPathError && error.applied
            : await pointerWriteReachedFinalState(
                deps.fileSystem,
                mutation.absolutePath,
                pointerText
              ))
        if (!mutationSucceeded) {
          failures.push({
            relativePath: mutation.relativePath,
            operation: mutation.operation === 'pinned' ? 'pin' : 'rewrite',
            message: messageFor(error),
          })
        }
      }
      if (mutationSucceeded) {
        if (changed) {
          changedPaths.push(mutation.relativePath)
        }
        files.push({
          relativePath: mutation.relativePath,
          objectSha256: mutation.sha256,
          sizeInBytes: mutation.sizeInBytes,
          pointerText,
          operation: mutation.operation,
          changed,
        })
      }
      completed++
    }
    if (changedPaths.length > 0 && key?.commitPath !== null) {
      changedPaths.push(key.commitPath)
    }
    return {
      provider: context.provider,
      published: true,
      immutableReference: published.result.immutableReference,
      attempts: published.attempts,
      maximumChunkBytes: published.maximumChunkBytes,
      files,
      failures,
      commitPaths: [...new Set(changedPaths)],
      keyCommitPath: key?.commitPath ?? null,
      keyCreated: key?.created ?? false,
    }
  } finally {
    try {
      await cleanupMigrationSources(migrationSources, deps.fileSystem)
    } finally {
      await cleanupPreparedTargets(preparedTargets, deps.fileSystem)
    }
  }
}

/** Pull, validate, decrypt when needed, and atomically replace one OCI pointer. */
export async function materializeCheapLfsOciFile(
  context: Pick<
    ICheapLfsOciRepositoryContext,
    'repositoryPath' | 'repositoryIdentity' | 'visibility'
  >,
  relativePathInput: string,
  operationDependencies: ICheapLfsOciOperationDependencies,
  signal?: AbortSignal,
  onProgress?: (progress: ICheapLfsOciOperationProgress) => void
): Promise<ICheapLfsOciMaterializeResult> {
  if (!RepositoryIdentityPattern.test(context.repositoryIdentity)) {
    throw new CheapLfsOciOperationError(
      'invalid-input',
      'Cheap LFS OCI restore requires a canonical GitHub repository identity.'
    )
  }
  const relativePath = checkedRelativePath(relativePathInput)
  const deps = dependencies(operationDependencies)
  const trackedProof = await deps.fileSystem.trackedPaths?.proveExisting(
    context.repositoryPath,
    relativePath
  )
  const destinationPath =
    trackedProof?.absolutePath ??
    (await requireSafeCheapLfsMaterializationPath(
      context.repositoryPath,
      relativePath
    ))
  const pointerText =
    trackedProof !== undefined && deps.fileSystem.trackedPaths !== undefined
      ? await deps.fileSystem.trackedPaths.readText(
          trackedProof,
          CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES
        )
      : await deps.fileSystem.readPointerText(destinationPath)
  const pointer = parseCheapLfsGhcrPointer(pointerText)
  const provider =
    pointer === null ? null : getCheapLfsOciRegistryProvider(pointer.image)
  if (pointer === null || provider === null) {
    throw new CheapLfsOciOperationError(
      'invalid-input',
      'This file is not a canonical Cheap LFS OCI pointer.'
    )
  }
  abortIfNeeded(signal)
  return await deps.runtime.withPulledImage(
    {
      pointer,
      expectedRepositoryIdentity: context.repositoryIdentity,
      expectedVisibility: imageVisibility(context.visibility),
      signal,
      onProgress: transfer =>
        onProgress?.({
          phase: 'pulling',
          currentPath: relativePath,
          completedFiles: transfer.completedObjects,
          totalFiles: 1,
          attempt: 1,
          maximumChunkBytes: CheapLfsGhcrMaximumChunkBytes,
          transfer,
        }),
    },
    async image => {
      const validated = validateCheapLfsGhcrSnapshot(
        image.snapshot,
        context.repositoryIdentity,
        imageVisibility(context.visibility)
      )
      const object = requirePointerObject(pointer, validated)
      let key: Buffer | null = null
      try {
        if (validated.visibility === 'private') {
          if (validated.keyId === null) {
            throw new CheapLfsOciOperationError(
              'integrity',
              'The private Cheap LFS image omitted its key identity.'
            )
          }
          const resolved = await deps.resolveRepositoryKeyForId({
            repositoryPath: context.repositoryPath,
            keyId: validated.keyId,
          })
          key = resolved.key
          if (key === null || key.length !== 32) {
            throw new CheapLfsOciOperationError(
              'integrity',
              'Cheap LFS could not resolve the tracked key for this image.'
            )
          }
        }
        if (
          trackedProof !== undefined &&
          deps.fileSystem.trackedPaths !== undefined
        ) {
          await deps.fileSystem.trackedPaths.revalidate(trackedProof)
          const materializedPath = join(
            dirname(destinationPath),
            `.${basename(destinationPath)}.cheap-lfs-materialized-${
              process.pid
            }-${randomUUID()}`
          )
          await materializeCheapLfsGhcrObject(image, {
            objectSha256: object.sha256,
            destinationPath: materializedPath,
            encryptionKey: key,
            signal,
          })
          await deps.fileSystem.trackedPaths.replaceFromPath(
            trackedProof,
            materializedPath,
            object.sha256,
            object.sizeInBytes,
            signal
          )
        } else {
          const verifiedDestinationPath =
            await requireSafeCheapLfsMaterializationPath(
              context.repositoryPath,
              relativePath
            )
          if (!sameCanonicalPath(destinationPath, verifiedDestinationPath)) {
            throw new CheapLfsOciOperationError(
              'integrity',
              'The Cheap LFS materialization path changed during restore.'
            )
          }
          await materializeCheapLfsOciPointer(image, {
            pointerText,
            destinationPath: verifiedDestinationPath,
            encryptionKey: key,
            signal,
          })
        }
      } finally {
        key?.fill(0)
      }
      return {
        provider,
        relativePath,
        objectSha256: pointerObjectSha256(pointer),
        sizeInBytes: pointer.sizeInBytes,
      }
    }
  )
}

/**
 * Remove one tracked object/path by first publishing the complete remaining
 * snapshot. The selected path is deleted and pointer-form survivors are
 * rewritten only after the new manifest and tag have been verified;
 * materialized survivors remain raw and keep their valid committed metadata.
 */
export async function removeCheapLfsOciFile(
  context: ICheapLfsOciRepositoryContext,
  relativePathInput: string,
  operationDependencies: ICheapLfsOciOperationDependencies,
  signal?: AbortSignal,
  onProgress?: (progress: ICheapLfsOciOperationProgress) => void
): Promise<ICheapLfsOciRemoveResult> {
  validateContext(context)
  const relativePath = checkedRelativePath(relativePathInput)
  const deps = dependencies(operationDependencies)
  const stored = await listCheapLfsStoredPointers(
    context.repositoryPath,
    deps.fileSystem
  )
  const trackedInputProofs = await captureTrackedInputProofs(
    context,
    stored.filter(
      (entry): entry is ICheapLfsOciStoredPointer => entry.backend === 'oci'
    ),
    deps.fileSystem
  )
  const target = stored.find(entry => entry.relativePath === relativePath)
  if (target?.backend !== 'oci') {
    throw new CheapLfsOciOperationError(
      'invalid-input',
      'The selected file is not a Cheap LFS OCI pointer.'
    )
  }
  const failures = new Array<ICheapLfsOciFileFailure>()
  let migrationSources: ReadonlyMap<string, IMigrationSource> = new Map()
  try {
    let key: IResolvedPublishKey | null = null
    let previous: IPreviousState
    let published: IPublishedImage
    try {
      previous = await loadPreviousState(
        context,
        stored,
        deps,
        signal,
        onProgress
      )
      key = await resolvePublishKey(context, previous.snapshot, deps)
      const survivors = previous.entries.filter(
        entry => entry.relativePath !== relativePath
      )
      const survivorMigrationEntries = survivors.filter(entry =>
        previous.migrationPaths.has(entry.relativePath)
      )
      if (survivorMigrationEntries.length > 0) {
        migrationSources = await prepareMigrationSources(
          context,
          survivorMigrationEntries,
          deps.fileSystem,
          signal
        )
      }
      const desiredObjects = uniqueDesiredObjects(
        survivors.map(entry => ({
          sha256: pointerObjectSha256(entry.pointer),
          sizeInBytes: entry.pointer.sizeInBytes,
          ...(previous.migrationPaths.has(entry.relativePath)
            ? {
                sourcePath:
                  migrationSources.get(entry.relativePath)?.sourcePath ??
                  absoluteTrackedPath(
                    context.repositoryPath,
                    entry.relativePath
                  ),
              }
            : {}),
        }))
      )
      published = await publishWithAdaptiveChunks(
        context,
        desiredObjects,
        displayFilesByObjectSha256(
          survivors.map(entry => ({
            relativePath: entry.relativePath,
            sha256: pointerObjectSha256(entry.pointer),
            sizeInBytes: entry.pointer.sizeInBytes,
          }))
        ),
        previous.snapshot,
        key,
        deps,
        survivors.length,
        async () => {
          await revalidateMigrationSources(migrationSources, deps.fileSystem)
          await requireMutationInputsUnchanged(
            context,
            previous.entries,
            [],
            deps.fileSystem,
            trackedInputProofs,
            signal
          )
        },
        signal,
        onProgress
      )
    } catch (error) {
      try {
        await discardCreatedPublishKeyAfterFailure(key, deps, error)
      } catch (cleanupError) {
        key?.key?.fill(0)
        throw cleanupError
      }
      key?.key?.fill(0)
      if (isCancellation(error, signal)) {
        throw error
      }
      failures.push({
        relativePath,
        operation: 'remove',
        message: messageFor(error),
      })
      return {
        ...failedMutationResult(context, failures),
        removed: false,
        removedPath: relativePath,
      }
    } finally {
      key?.key?.fill(0)
    }

    const conflicts = await verifyMutationInputs(
      context,
      previous.entries,
      [],
      deps.fileSystem,
      trackedInputProofs,
      signal
    )
    if (conflicts.length > 0) {
      return {
        ...failedMutationResult(
          context,
          conflicts,
          published.attempts,
          published.maximumChunkBytes
        ),
        published: true,
        immutableReference: published.result.immutableReference,
        keyCommitPath: key?.commitPath ?? null,
        keyCreated: key?.created ?? false,
        removed: false,
        removedPath: relativePath,
      }
    }
    abortIfNeeded(signal)
    let removalSucceeded = false
    try {
      await requireMutationInputsUnchanged(
        context,
        [target],
        [],
        deps.fileSystem,
        trackedInputProofs,
        signal
      )
      const targetProof = trackedInputProofs?.get(relativePath)
      if (
        targetProof !== undefined &&
        deps.fileSystem.trackedPaths !== undefined
      ) {
        await deps.fileSystem.trackedPaths.remove(targetProof)
      } else {
        await deps.fileSystem.removeFile(
          absoluteTrackedPath(context.repositoryPath, relativePath)
        )
      }
      removalSucceeded = true
    } catch (error) {
      removalSucceeded =
        trackedInputProofs !== undefined &&
        deps.fileSystem.trackedPaths !== undefined
          ? error instanceof CheapLfsTrackedPathError && error.applied
          : await removalReachedFinalState(
              deps.fileSystem,
              absoluteTrackedPath(context.repositoryPath, relativePath)
            )
      if (!removalSucceeded) {
        return {
          provider: context.provider,
          published: true,
          immutableReference: published.result.immutableReference,
          attempts: published.attempts,
          maximumChunkBytes: published.maximumChunkBytes,
          files: [],
          failures: [
            {
              relativePath,
              operation: 'remove',
              message: messageFor(error),
            },
          ],
          commitPaths: [],
          keyCommitPath: key?.commitPath ?? null,
          keyCreated: key?.created ?? false,
          removed: false,
          removedPath: relativePath,
        }
      }
    }

    const pointers = publishedPointersBySha(published.result)
    const files = new Array<ICheapLfsOciFileResult>()
    const commitPaths = [relativePath]
    let completed = 0
    const survivors = previous.entries.filter(
      entry => entry.relativePath !== relativePath
    )
    for (const entry of survivors) {
      const sha256 = pointerObjectSha256(entry.pointer)
      const pointerText = pointers.get(sha256)!.text
      const preserveMaterializedBytes =
        !previous.migrationPaths.has(entry.relativePath) &&
        entry.workingTreeState !== 'pointer'
      const changed = !preserveMaterializedBytes && pointerText !== entry.text
      let mutationSucceeded = !changed
      try {
        onProgress?.({
          phase: 'updating-pointers',
          currentPath: entry.relativePath,
          completedFiles: completed,
          totalFiles: survivors.length,
          attempt: published.attempts,
          maximumChunkBytes: published.maximumChunkBytes,
        })
        if (changed) {
          await requireMutationInputsUnchanged(
            context,
            [entry],
            [],
            deps.fileSystem,
            trackedInputProofs,
            signal
          )
          const proof = trackedInputProofs?.get(entry.relativePath)
          if (
            proof !== undefined &&
            deps.fileSystem.trackedPaths !== undefined
          ) {
            await deps.fileSystem.trackedPaths.publishText(proof, pointerText)
          } else {
            await deps.fileSystem.writePointer(
              absoluteTrackedPath(context.repositoryPath, entry.relativePath),
              pointerText
            )
          }
          mutationSucceeded = true
        }
      } catch (error) {
        mutationSucceeded =
          changed &&
          (trackedInputProofs !== undefined &&
          deps.fileSystem.trackedPaths !== undefined
            ? error instanceof CheapLfsTrackedPathError && error.applied
            : await pointerWriteReachedFinalState(
                deps.fileSystem,
                absoluteTrackedPath(context.repositoryPath, entry.relativePath),
                pointerText
              ))
        if (!mutationSucceeded) {
          failures.push({
            relativePath: entry.relativePath,
            operation: 'rewrite',
            message: messageFor(error),
          })
        }
      }
      if (mutationSucceeded) {
        if (changed) {
          commitPaths.push(entry.relativePath)
        }
        files.push({
          relativePath: entry.relativePath,
          objectSha256: sha256,
          sizeInBytes: entry.pointer.sizeInBytes,
          pointerText,
          operation: 'rewritten',
          changed,
        })
      }
      completed++
    }
    if (key?.commitPath !== null) {
      commitPaths.push(key.commitPath)
    }
    return {
      provider: context.provider,
      published: true,
      immutableReference: published.result.immutableReference,
      attempts: published.attempts,
      maximumChunkBytes: published.maximumChunkBytes,
      files,
      failures,
      commitPaths: [...new Set(commitPaths)],
      keyCommitPath: key?.commitPath ?? null,
      keyCreated: key?.created ?? false,
      removed: true,
      removedPath: relativePath,
    }
  } finally {
    await cleanupMigrationSources(migrationSources, deps.fileSystem)
  }
}

/** Structural helper for callers adapting the existing Release disk seam. */
export function cheapLfsOciFileSystemFromReleaseFileSystem(
  fs: ICheapLfsFileSystem,
  removeFile: (path: string) => Promise<void> = unlink
): ICheapLfsOciFileSystem {
  return {
    scanPointerCandidates: root => fs.scanPointerCandidates(root),
    readPointerText: path => fs.readPointerText(path),
    writePointer: (path, text) => fs.writePointer(path, text),
    hashFile: (path, signal) => fs.hashFile(path, signal),
    removeFile,
  }
}
