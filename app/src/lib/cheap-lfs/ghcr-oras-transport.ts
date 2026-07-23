import { createHash } from 'crypto'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { createReadStream } from 'fs'
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, isAbsolute, join, resolve } from 'path'
import {
  ICheapLfsGhcrPreparedImage,
  ICheapLfsGhcrProgress,
  ICheapLfsGhcrPulledImage,
  ICheapLfsGhcrValidatedImage,
  IOciDescriptor,
  OciImageManifestMediaType,
  CheapLfsGhcrMaximumChunkBytes,
  CheapLfsGhcrMaximumLayerBytes,
  CheapLfsGhcrMaximumAdaptivePrepareAttempts,
  CheapLfsGhcrMinimumAdaptiveChunkBytes,
  getNextCheapLfsGhcrChunkBytes,
  inspectCheapLfsGhcrManifest,
  validateCheapLfsGhcrPulledImage,
  validateCheapLfsGhcrSnapshot,
} from './ghcr-image'
import {
  CHEAP_LFS_GHCR_POINTER_VERSION,
  CheapLfsGhcrPointerError,
  CheapLfsOciRegistryProvider,
  ICheapLfsGhcrPointer,
  getCheapLfsGhcrRegistryRepository,
  getCheapLfsOciRegistryProvider,
  isCheapLfsGhcrImmutableReference,
  serializeCheapLfsGhcrPointer,
} from './ghcr-pointer'
import { CheapLfsGhcrRepositoryKeyPath } from './ghcr-key'

/** The one mutable repository tag. Git pointers never store this tag. */
export const CheapLfsGhcrRepositoryTag = 'desktop-material-cheap-lfs-v1'
/**
 * Every published manifest also receives one deterministic retention tag.
 * Pointers continue to use the immutable digest, while this tag prevents a
 * registry from garbage-collecting that digest after the mutable tag moves.
 */
export const CheapLfsGhcrRetentionTagPrefix =
  'desktop-material-cheap-lfs-sha256-'

const OciRepositoryRegex =
  /^(?:ghcr\.io|docker\.io)\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const DigestRegex = /^sha256:[0-9a-f]{64}$/
const MaximumExecutableBytes = 256 * 1024 * 1024
const MaximumProcessOutputBytes = 64 * 1024
const DefaultProcessTimeoutMs = 9 * 60 * 1000
const ParallelBlobLimit = 3

export interface ICheapLfsOciRegistryCapabilities {
  readonly provider: CheapLfsOciRegistryProvider
  readonly initialChunkBytes: number
  readonly minimumAdaptiveChunkBytes: number
  readonly maximumAdaptivePrepareAttempts: number
  readonly maximumParallelBlobTransfers: number
  /** Provider-documented hard limit, or null when no official limit is known. */
  readonly documentedMaximumLayerBytes: number | null
  /** Provider-documented upload timeout, or null when none is documented. */
  readonly documentedUploadTimeoutMs: number | null
  /** No provider total-image limit is modeled; images may contain many layers. */
  readonly documentedMaximumImageBytes: null
}

export function getCheapLfsOciRegistryCapabilities(
  provider: CheapLfsOciRegistryProvider
): ICheapLfsOciRegistryCapabilities {
  return {
    provider,
    initialChunkBytes: CheapLfsGhcrMaximumChunkBytes,
    minimumAdaptiveChunkBytes: CheapLfsGhcrMinimumAdaptiveChunkBytes,
    maximumAdaptivePrepareAttempts: CheapLfsGhcrMaximumAdaptivePrepareAttempts,
    maximumParallelBlobTransfers: ParallelBlobLimit,
    documentedMaximumLayerBytes:
      provider === 'ghcr' ? CheapLfsGhcrMaximumLayerBytes : null,
    documentedUploadTimeoutMs: provider === 'ghcr' ? 10 * 60 * 1000 : null,
    documentedMaximumImageBytes: null,
  }
}

export interface ICheapLfsGhcrCredentials {
  readonly username: string
  /** Caller-owned token. The transport never logs, persists, or mutates it. */
  readonly token: Uint8Array
}

export interface ICheapLfsGhcrOrasRequest {
  readonly executable: string
  readonly args: ReadonlyArray<string>
  /** The GHCR token plus one newline. This is the only secret-bearing field. */
  readonly stdin: Buffer
  readonly signal?: AbortSignal
  readonly timeoutMs: number
}

export interface ICheapLfsGhcrOrasRunner {
  run(request: ICheapLfsGhcrOrasRequest): Promise<void>
}

export interface ICheapLfsGhcrPackagePolicyRequest {
  readonly provider: CheapLfsOciRegistryProvider
  readonly repositoryIdentity: string
  readonly sourceRepositoryUrl: string
  readonly registryRepository: string
  readonly immutableReference: string
  readonly visibility: 'public' | 'private'
  readonly signal?: AbortSignal
}

export interface ICheapLfsGhcrPackagePolicyResult {
  readonly provider: CheapLfsOciRegistryProvider
  readonly repositoryIdentity: string
  readonly sourceRepositoryUrl: string
  readonly registryRepository: string
  readonly visibility: 'public' | 'private'
  /** GHCR inherited access or Docker Hub namespace/repository access. */
  readonly sourceRepositoryAccessVerified: boolean
  readonly registryVisibilityVerified: boolean
}

/**
 * Implementations use an authenticated GitHub API boundary outside this ORAS
 * transport. The GHCR token is intentionally never supplied to this verifier.
 */
export interface ICheapLfsGhcrPackagePolicyVerifier {
  verify(
    request: ICheapLfsGhcrPackagePolicyRequest
  ): Promise<ICheapLfsGhcrPackagePolicyResult>
}

export interface ICheapLfsGhcrTransferProgress extends ICheapLfsGhcrProgress {
  readonly stage:
    | 'config'
    | 'object-chunk'
    | 'manifest'
    | 'package-policy'
    | 'tag'
  readonly currentDigest: string | null
  readonly completedItems: number
  readonly totalItems: number
  /** Ordered snapshot of object/file lanes with an ORAS blob command active. */
  readonly activeObjectSha256s?: ReadonlyArray<string>
  /**
   * Exact completed-chunk bytes for each active object lane. ORAS does not
   * expose streaming byte progress, so the current command contributes zero
   * until it succeeds; previously accepted chunks remain visible here.
   */
  readonly activeObjects?: ReadonlyArray<{
    readonly objectSha256: string
    readonly processedBytes: number
    readonly totalBytes: number
  }>
}

export interface ICheapLfsGhcrPublishedPointer {
  readonly objectSha256: string
  readonly sizeInBytes: number
  readonly text: string
}

export interface IPublishCheapLfsGhcrImageOptions {
  readonly image: ICheapLfsGhcrPreparedImage
  readonly registryRepository: string
  readonly orasExecutablePath: string
  /** Pinned SHA-256 of the packaged ORAS executable, including `sha256:`. */
  readonly orasExecutableSha256: string
  readonly credentials: ICheapLfsGhcrCredentials
  readonly packagePolicyVerifier: ICheapLfsGhcrPackagePolicyVerifier
  readonly parallelBlobUploads: boolean
  /** True only when this publish created the key during the same pin flow. */
  readonly keyCreated: boolean
  readonly keyRelativePath: typeof CheapLfsGhcrRepositoryKeyPath | null
  readonly runner?: ICheapLfsGhcrOrasRunner
  readonly signal?: AbortSignal
  readonly processTimeoutMs?: number
  readonly onProgress?: (progress: ICheapLfsGhcrTransferProgress) => void
}

export interface ICheapLfsGhcrPublishResult {
  readonly provider: CheapLfsOciRegistryProvider
  readonly immutableReference: string
  readonly taggedReference: string
  readonly manifestDigest: string
  /** Canonical pointer text for every object in the new full snapshot. */
  readonly pointers: ReadonlyArray<ICheapLfsGhcrPublishedPointer>
  readonly keyCreated: boolean
  readonly keyRelativePath: typeof CheapLfsGhcrRepositoryKeyPath | null
}

export interface IPullCheapLfsGhcrObjectOptions {
  readonly pointer: ICheapLfsGhcrPointer
  readonly expectedRepositoryIdentity: string
  readonly expectedVisibility: 'public' | 'private'
  readonly orasExecutablePath: string
  readonly orasExecutableSha256: string
  /** Null/omitted enables rate-limited anonymous pulls for public images. */
  readonly credentials?: ICheapLfsGhcrCredentials | null
  readonly parallelBlobDownloads: boolean
  readonly runner?: ICheapLfsGhcrOrasRunner
  readonly signal?: AbortSignal
  readonly processTimeoutMs?: number
  readonly onProgress?: (progress: ICheapLfsGhcrTransferProgress) => void
}

export class CheapLfsGhcrTransportError extends Error {
  public constructor(
    public readonly kind:
      | 'canceled'
      | 'invalid-input'
      | 'untrusted-executable'
      | 'process-failed'
      | 'process-timeout'
      | 'output-overflow'
      | 'integrity'
      | 'package-policy'
      | 'cleanup',
    message: string
  ) {
    super(message)
    this.name = 'CheapLfsGhcrTransportError'
  }
}

export function getCheapLfsGhcrRetentionTag(manifestDigest: string): string {
  if (!DigestRegex.test(manifestDigest)) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS requires a canonical manifest digest for retention.'
    )
  }
  return `${CheapLfsGhcrRetentionTagPrefix}${manifestDigest.slice(
    'sha256:'.length
  )}`
}

/** A retryable object-layer timeout with the deterministic next chunk bound. */
export class CheapLfsGhcrLayerUploadTimeoutError extends CheapLfsGhcrTransportError {
  public constructor(
    public readonly objectSha256: string,
    public readonly layerDigest: string,
    public readonly currentMaximumChunkBytes: number,
    public readonly recommendedMaximumChunkBytes: number | null,
    /** Whole objects whose every layer was proven uploaded in this attempt. */
    public readonly completedObjectSha256s: ReadonlyArray<string> = []
  ) {
    super(
      'process-timeout',
      recommendedMaximumChunkBytes === null
        ? 'A Cheap LFS object-layer upload timed out at the minimum adaptive chunk size.'
        : 'A Cheap LFS object-layer upload timed out; retry preparation with the recommended halved chunk size.'
    )
    this.name = 'CheapLfsGhcrLayerUploadTimeoutError'
  }
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CheapLfsGhcrTransportError(
      'canceled',
      'Cheap LFS GHCR transfer was canceled.'
    )
  }
}

function sameFile(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>
): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

async function hashBoundedFile(
  path: string,
  maximumBytes: number,
  overflowKind: 'untrusted-executable' | 'integrity' = 'untrusted-executable'
) {
  const hash = createHash('sha256')
  let size = 0
  const stream = createReadStream(path)
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    size += chunk.byteLength
    if (size > maximumBytes) {
      stream.destroy()
      throw new CheapLfsGhcrTransportError(
        overflowKind,
        overflowKind === 'untrusted-executable'
          ? 'The packaged ORAS executable exceeds its trusted size bound.'
          : 'A local OCI artifact changed beyond its trusted size bound.'
      )
    }
    hash.update(chunk)
  }
  return { digest: `sha256:${hash.digest('hex')}`, size }
}

function sameDescriptor(left: IOciDescriptor, right: IOciDescriptor): boolean {
  return (
    left.mediaType === right.mediaType &&
    left.digest === right.digest &&
    left.size === right.size
  )
}

function requirePublishDescriptor(
  descriptor: IOciDescriptor,
  provider: CheapLfsOciRegistryProvider
): void {
  if (
    typeof descriptor.mediaType !== 'string' ||
    descriptor.mediaType.length === 0 ||
    !DigestRegex.test(descriptor.digest) ||
    !Number.isSafeInteger(descriptor.size) ||
    descriptor.size <= 0 ||
    descriptor.size > CheapLfsGhcrMaximumChunkBytes ||
    (provider === 'ghcr' && descriptor.size >= CheapLfsGhcrMaximumLayerBytes)
  ) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      provider === 'ghcr'
        ? 'Cheap LFS refuses an invalid layer, an app-policy layer over 1.5 GiB, or a GHCR layer at least 10 GB.'
        : 'Cheap LFS refuses an invalid layer or an app-policy layer over 1.5 GiB.'
    )
  }
}

async function requireLocalDescriptor(
  path: string,
  descriptor: IOciDescriptor,
  provider: CheapLfsOciRegistryProvider
): Promise<void> {
  requirePublishDescriptor(descriptor, provider)
  const before = await lstat(path).catch(() => null)
  if (
    before === null ||
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.size !== descriptor.size
  ) {
    throw new CheapLfsGhcrTransportError(
      'integrity',
      'Cheap LFS GHCR rejected an unsafe or changed local OCI artifact.'
    )
  }
  const actual = await hashBoundedFile(
    path,
    CheapLfsGhcrMaximumLayerBytes - 1,
    'integrity'
  )
  const after = await lstat(path)
  if (
    actual.digest !== descriptor.digest ||
    actual.size !== descriptor.size ||
    !sameFile(before, after) ||
    after.size !== before.size
  ) {
    throw new CheapLfsGhcrTransportError(
      'integrity',
      'Cheap LFS GHCR local OCI bytes do not match their descriptor.'
    )
  }
}

async function requirePreparedImage(
  image: ICheapLfsGhcrPreparedImage,
  provider: CheapLfsOciRegistryProvider
): Promise<void> {
  if (
    !Number.isSafeInteger(image.maximumChunkBytes) ||
    image.maximumChunkBytes <= 0 ||
    image.maximumChunkBytes > CheapLfsGhcrMaximumChunkBytes
  ) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS rejected an invalid prepared-image chunk bound.'
    )
  }
  const snapshot = validateCheapLfsGhcrSnapshot(
    image.snapshot,
    image.snapshot.repositoryIdentity,
    image.snapshot.visibility
  )
  requirePublishDescriptor(image.configDescriptor, provider)
  requirePublishDescriptor(image.manifestDescriptor, provider)
  if (image.manifestDescriptor.mediaType !== OciImageManifestMediaType) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS GHCR rejected an unsupported prepared manifest media type.'
    )
  }
  const manifest = await inspectCheapLfsGhcrManifest(image.manifestPath)
  const expectedEntries = snapshot.objects.flatMap(object =>
    object.chunks.map(chunk => ({ object, chunk }))
  )
  const expectedLayers = expectedEntries.map(entry => entry.chunk.blob)
  if (
    !sameDescriptor(manifest.config, image.configDescriptor) ||
    manifest.layers.length !== expectedLayers.length ||
    image.layers.length !== expectedLayers.length
  ) {
    throw new CheapLfsGhcrTransportError(
      'integrity',
      'Cheap LFS GHCR rejected an incomplete prepared OCI image.'
    )
  }
  for (let index = 0; index < expectedLayers.length; index++) {
    const expected = expectedLayers[index]
    const expectedEntry = expectedEntries[index]
    const manifestLayer = manifest.layers[index]
    const preparedLayer = image.layers[index]
    requirePublishDescriptor(expected, provider)
    if (
      !sameDescriptor(expected, manifestLayer) ||
      !sameDescriptor(expected, preparedLayer.descriptor) ||
      preparedLayer.object.sha256 !== expectedEntry.object.sha256 ||
      preparedLayer.object.sizeInBytes !== expectedEntry.object.sizeInBytes ||
      preparedLayer.chunk.ordinal !== expectedEntry.chunk.ordinal ||
      preparedLayer.chunk.offset !== expectedEntry.chunk.offset ||
      preparedLayer.chunk.sizeInBytes !== expectedEntry.chunk.sizeInBytes ||
      preparedLayer.chunk.plaintextSha256 !==
        expectedEntry.chunk.plaintextSha256 ||
      preparedLayer.reused !== (preparedLayer.localPath === null)
    ) {
      throw new CheapLfsGhcrTransportError(
        'integrity',
        'Cheap LFS GHCR rejected inconsistent prepared layer metadata.'
      )
    }
  }
  await requireLocalDescriptor(
    image.configPath,
    image.configDescriptor,
    provider
  )
  await requireLocalDescriptor(
    image.manifestPath,
    image.manifestDescriptor,
    provider
  )
  const localLayers = image.layers.filter(
    (layer): layer is typeof layer & { readonly localPath: string } =>
      layer.localPath !== null
  )
  await runBounded(localLayers, ParallelBlobLimit, async layer => {
    await requireLocalDescriptor(layer.localPath, layer.descriptor, provider)
  })
}

async function requirePinnedOrasExecutable(
  requestedPath: string,
  expectedDigest: string
): Promise<string> {
  if (
    !isAbsolute(requestedPath) ||
    basename(requestedPath).toLowerCase() !== 'oras.exe' ||
    !DigestRegex.test(expectedDigest)
  ) {
    throw new CheapLfsGhcrTransportError(
      'untrusted-executable',
      'Cheap LFS GHCR requires an absolute, digest-pinned oras.exe path.'
    )
  }
  const path = resolve(requestedPath)
  const before = await lstat(path).catch(() => null)
  if (
    before === null ||
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.size <= 0 ||
    before.size > MaximumExecutableBytes
  ) {
    throw new CheapLfsGhcrTransportError(
      'untrusted-executable',
      'Cheap LFS GHCR rejected an unsafe packaged ORAS executable.'
    )
  }
  const canonical = await realpath(path)
  const canonicalMetadata = await lstat(canonical)
  if (!sameFile(before, canonicalMetadata)) {
    throw new CheapLfsGhcrTransportError(
      'untrusted-executable',
      'Cheap LFS GHCR rejected a redirected packaged ORAS executable.'
    )
  }
  const actual = await hashBoundedFile(path, MaximumExecutableBytes)
  const after = await lstat(path)
  if (
    actual.size !== before.size ||
    actual.digest !== expectedDigest ||
    !sameFile(before, after) ||
    after.size !== before.size
  ) {
    throw new CheapLfsGhcrTransportError(
      'untrusted-executable',
      'The packaged ORAS executable does not match its pinned digest.'
    )
  }
  return canonical
}

function requireRegistryRepository(value: string): CheapLfsOciRegistryProvider {
  if (!OciRepositoryRegex.test(value)) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS requires a canonical lowercase ghcr.io or docker.io owner/package.'
    )
  }
  return value.startsWith('ghcr.io/') ? 'ghcr' : 'docker-hub'
}

function requireCredentials(
  credentials: ICheapLfsGhcrCredentials,
  provider: CheapLfsOciRegistryProvider
): void {
  const validUsername =
    provider === 'ghcr'
      ? /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(
          credentials.username
        )
      : /^[a-z0-9](?:[a-z0-9_-]{0,253}[a-z0-9])?$/.test(credentials.username)
  if (!validUsername) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS GHCR rejected the registry username.'
    )
  }
  if (
    credentials.token.byteLength === 0 ||
    credentials.token.byteLength > 16 * 1024
  ) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS GHCR rejected the registry credential length.'
    )
  }
  for (const byte of credentials.token) {
    if (byte < 0x21 || byte > 0x7e) {
      throw new CheapLfsGhcrTransportError(
        'invalid-input',
        'Cheap LFS GHCR registry credentials must be printable single-line text.'
      )
    }
  }
}

function requireTimeout(value: number | undefined): number {
  const timeout = value ?? DefaultProcessTimeoutMs
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout >= 600_000) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS GHCR requires a bounded ORAS process timeout below ten minutes.'
    )
  }
  return timeout
}

class DefaultOrasRunner implements ICheapLfsGhcrOrasRunner {
  public async run(request: ICheapLfsGhcrOrasRequest): Promise<void> {
    abortIfNeeded(request.signal)
    await new Promise<void>((resolveRun, rejectRun) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(request.executable, [...request.args], {
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }) as ChildProcessWithoutNullStreams
      } catch {
        rejectRun(
          new CheapLfsGhcrTransportError(
            'process-failed',
            'The packaged ORAS process could not be started.'
          )
        )
        return
      }

      let forcedError: CheapLfsGhcrTransportError | null = null
      let outputBytes = 0
      let settled = false
      const force = (error: CheapLfsGhcrTransportError) => {
        if (forcedError === null) {
          forcedError = error
          try {
            child.kill()
          } catch {
            // The process may have closed at the cancellation boundary.
          }
        }
      }
      const onOutput = (value: Buffer | string) => {
        outputBytes += Buffer.byteLength(value)
        if (outputBytes > MaximumProcessOutputBytes) {
          force(
            new CheapLfsGhcrTransportError(
              'output-overflow',
              'The ORAS process exceeded its bounded output allowance.'
            )
          )
        }
      }
      child.stdout.on('data', onOutput)
      child.stderr.on('data', onOutput)
      const onAbort = () =>
        force(
          new CheapLfsGhcrTransportError(
            'canceled',
            'Cheap LFS GHCR transfer was canceled.'
          )
        )
      request.signal?.addEventListener('abort', onAbort, { once: true })
      const timeout = setTimeout(
        () =>
          force(
            new CheapLfsGhcrTransportError(
              'process-timeout',
              'The ORAS process exceeded its bounded runtime.'
            )
          ),
        request.timeoutMs
      )
      const finish = (error?: CheapLfsGhcrTransportError) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        request.signal?.removeEventListener('abort', onAbort)
        if (error === undefined) {
          resolveRun()
        } else {
          rejectRun(error)
        }
      }
      child.once('error', () =>
        finish(
          forcedError ??
            new CheapLfsGhcrTransportError(
              'process-failed',
              'The packaged ORAS process failed.'
            )
        )
      )
      child.once('close', code => {
        if (forcedError !== null) {
          finish(forcedError)
        } else if (code === 0) {
          finish()
        } else {
          finish(
            new CheapLfsGhcrTransportError(
              'process-failed',
              'The packaged ORAS process failed.'
            )
          )
        }
      })
      child.stdin.on('error', () => {
        // A failed child can close stdin before its close event supplies status.
      })
      child.stdin.end(request.stdin)
    })
  }
}

function authArguments(
  username: string | null,
  registryConfigPath: string,
  noTty: boolean
): ReadonlyArray<string> {
  return [
    ...(username === null ? [] : ['--username', username, '--password-stdin']),
    '--registry-config',
    registryConfigPath,
    ...(noTty ? ['--no-tty'] : []),
  ]
}

async function runAuthenticated(
  runner: ICheapLfsGhcrOrasRunner,
  executable: string,
  args: ReadonlyArray<string>,
  credentials: ICheapLfsGhcrCredentials | null,
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<void> {
  abortIfNeeded(signal)
  const stdin =
    credentials === null
      ? Buffer.alloc(0)
      : Buffer.allocUnsafe(credentials.token.byteLength + 1)
  if (credentials !== null) {
    stdin.set(credentials.token, 0)
    stdin[stdin.byteLength - 1] = 0x0a
  }
  try {
    await runner.run({ executable, args, stdin, signal, timeoutMs })
  } finally {
    stdin.fill(0)
  }
}

async function withRegistryConfig<T>(
  operation: (directory: string, registryConfigPath: string) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-material-oras-'))
  const registryConfigPath = join(directory, 'registry-config.json')
  let operationError: unknown
  try {
    // Per-command stdin authentication is used; this file never stores auth.
    await writeFile(registryConfigPath, '{}', { flag: 'wx', mode: 0o600 })
    return await operation(directory, registryConfigPath)
  } catch (error) {
    operationError = error
    throw error
  } finally {
    try {
      await rm(directory, { recursive: true, force: true })
    } catch (cleanupError) {
      if (operationError === undefined) {
        throw new CheapLfsGhcrTransportError(
          'cleanup',
          'Cheap LFS GHCR could not clean its ORAS working directory.'
        )
      }
      if (operationError instanceof Error) {
        operationError.cause = cleanupError
      }
    }
  }
}

async function runBounded<T>(
  items: ReadonlyArray<T>,
  concurrency: number,
  operation: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0
  let failure: unknown
  const workers = Array.from(
    { length: Math.min(items.length, concurrency) },
    async () => {
      while (true) {
        if (failure !== undefined) {
          return
        }
        const index = cursor++
        if (index >= items.length) {
          return
        }
        try {
          await operation(items[index])
        } catch (error) {
          failure = error
          return
        }
      }
    }
  )
  await Promise.all(workers)
  if (failure !== undefined) {
    throw failure
  }
}

function uniqueDescriptors(
  values: ReadonlyArray<{
    readonly descriptor: IOciDescriptor
    readonly localPath: string | null
    readonly objectSha256: string
  }>
) {
  const unique = new Map<
    string,
    {
      readonly descriptor: IOciDescriptor
      readonly localPath: string | null
      readonly objectSha256: string
    }
  >()
  for (const value of values) {
    const existing = unique.get(value.descriptor.digest)
    if (
      existing !== undefined &&
      (existing.descriptor.size !== value.descriptor.size ||
        existing.descriptor.mediaType !== value.descriptor.mediaType)
    ) {
      throw new CheapLfsGhcrTransportError(
        'integrity',
        'Cheap LFS GHCR rejected conflicting descriptors for one digest.'
      )
    }
    if (existing === undefined || existing.localPath === null) {
      unique.set(value.descriptor.digest, value)
    }
  }
  return [...unique.values()]
}

async function requireExactManifest(
  actualPath: string,
  expectedPath: string,
  expectedDigest: string
): Promise<void> {
  const [actual, expected] = await Promise.all([
    readFile(actualPath),
    readFile(expectedPath),
  ])
  const digest = `sha256:${createHash('sha256').update(actual).digest('hex')}`
  if (digest !== expectedDigest || !actual.equals(expected)) {
    throw new CheapLfsGhcrTransportError(
      'integrity',
      'GHCR returned manifest bytes that differ from the published digest.'
    )
  }
}

function pointerResults(
  image: ICheapLfsGhcrPreparedImage,
  immutableReference: string
): ReadonlyArray<ICheapLfsGhcrPublishedPointer> {
  return image.snapshot.objects.map(object => ({
    objectSha256: object.sha256,
    sizeInBytes: object.sizeInBytes,
    text: serializeCheapLfsGhcrPointer({
      version: CHEAP_LFS_GHCR_POINTER_VERSION,
      image: immutableReference,
      object: `sha256:${object.sha256}`,
      sizeInBytes: object.sizeInBytes,
      layers: object.chunks.map(chunk => chunk.blob.digest),
      ...(image.snapshot.visibility === 'private'
        ? { keyId: image.snapshot.keyId! }
        : {}),
    }),
  }))
}

function requireKeyPublishState(options: IPublishCheapLfsGhcrImageOptions) {
  if (options.image.snapshot.visibility === 'public') {
    if (options.keyCreated || options.keyRelativePath !== null) {
      throw new CheapLfsGhcrTransportError(
        'invalid-input',
        'Public Cheap LFS GHCR publishes cannot include repository key state.'
      )
    }
  } else if (options.keyRelativePath !== CheapLfsGhcrRepositoryKeyPath) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Private Cheap LFS GHCR publishes must surface the canonical tracked key path.'
    )
  }
}

/**
 * Publish an exact complete snapshot by digest, verify it and its GHCR policy,
 * then perform the sole mutable operation: moving one repository tag.
 */
export async function publishCheapLfsGhcrImage(
  options: IPublishCheapLfsGhcrImageOptions
): Promise<ICheapLfsGhcrPublishResult> {
  const provider = requireRegistryRepository(options.registryRepository)
  requireCredentials(options.credentials, provider)
  requireKeyPublishState(options)
  abortIfNeeded(options.signal)
  await requirePreparedImage(options.image, provider)
  const timeoutMs = requireTimeout(options.processTimeoutMs)
  const executable = await requirePinnedOrasExecutable(
    options.orasExecutablePath,
    options.orasExecutableSha256
  )
  const runner = options.runner ?? new DefaultOrasRunner()
  const immutableReference = `${options.registryRepository}@${options.image.manifestDescriptor.digest}`
  const taggedReference = `${options.registryRepository}:${CheapLfsGhcrRepositoryTag}`

  return await withRegistryConfig(async (directory, registryConfigPath) => {
    const auth = (noTty: boolean) =>
      authArguments(options.credentials.username, registryConfigPath, noTty)
    const localLayerEntries = options.image.layers
      .filter(layer => layer.localPath !== null)
      .map(layer => ({
        descriptor: layer.descriptor,
        localPath: layer.localPath,
        objectSha256: layer.object.sha256,
      }))
    const localLayers = uniqueDescriptors(localLayerEntries)
    const objectOrder = new Map(
      options.image.snapshot.objects.map((object, index) => [
        object.sha256,
        index,
      ])
    )
    const activeObjectSha256s = new Set<string>()
    const activeObjects = () =>
      [...activeObjectSha256s].sort(
        (left, right) =>
          (objectOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (objectOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      )
    const descriptorsByObject = new Map<string, IOciDescriptor[]>()
    const requiredDigestsByObject = new Map<string, Set<string>>()
    for (const layer of localLayerEntries) {
      const descriptors = descriptorsByObject.get(layer.objectSha256) ?? []
      descriptors.push(layer.descriptor)
      descriptorsByObject.set(layer.objectSha256, descriptors)
      const required =
        requiredDigestsByObject.get(layer.objectSha256) ?? new Set<string>()
      required.add(layer.descriptor.digest)
      requiredDigestsByObject.set(layer.objectSha256, required)
    }
    const uploadedDigests = new Set<string>()
    const completedObjectCount = () =>
      [...requiredDigestsByObject.values()].filter(required =>
        [...required].every(digest => uploadedDigests.has(digest))
      ).length
    const activeObjectProgress = () =>
      activeObjects().map(objectSha256 => {
        const descriptors = descriptorsByObject.get(objectSha256) ?? []
        let processedBytes = 0
        let totalBytes = 0
        for (const descriptor of descriptors) {
          totalBytes += descriptor.size
          if (uploadedDigests.has(descriptor.digest)) {
            processedBytes += descriptor.size
          }
        }
        return { objectSha256, processedBytes, totalBytes }
      })
    const totalItems = localLayers.length + 6
    const totalBytes =
      options.image.configDescriptor.size +
      options.image.manifestDescriptor.size +
      localLayers.reduce((sum, layer) => sum + layer.descriptor.size, 0)
    let completedItems = 0
    let processedBytes = 0
    const emit = (
      stage: ICheapLfsGhcrTransferProgress['stage'],
      digest: string | null,
      objectSha256: string | null
    ) =>
      options.onProgress?.({
        phase: 'uploading',
        stage,
        currentDigest: digest,
        currentObjectSha256: objectSha256,
        completedItems,
        totalItems,
        activeObjectSha256s: activeObjects(),
        activeObjects: activeObjectProgress(),
        completedObjects: completedObjectCount(),
        totalObjects: requiredDigestsByObject.size,
        processedBytes,
        totalBytes,
      })

    emit('config', options.image.configDescriptor.digest, null)
    await runAuthenticated(
      runner,
      executable,
      [
        'blob',
        'push',
        ...auth(true),
        `${options.registryRepository}@${options.image.configDescriptor.digest}`,
        options.image.configPath,
      ],
      options.credentials,
      options.signal,
      timeoutMs
    )
    completedItems++
    processedBytes += options.image.configDescriptor.size
    emit('config', options.image.configDescriptor.digest, null)

    // The user-facing setting promises up to three *files* at once. Keep the
    // chunks for one object ordered in a single lane so a very large file
    // cannot consume every lane by itself.
    const layersByObject = new Map<string, Array<typeof localLayers[number]>>()
    for (const layer of localLayers) {
      const group = layersByObject.get(layer.objectSha256) ?? []
      group.push(layer)
      layersByObject.set(layer.objectSha256, group)
    }

    // Blob pushes are content-addressed and globally deduplicated, so a layer
    // assigned to one object's upload lane can also satisfy another object.
    // Checkpoint an object only when every distinct local digest it references
    // has actually returned success from the registry.
    try {
      await runBounded(
        [...layersByObject.values()],
        options.parallelBlobUploads ? ParallelBlobLimit : 1,
        async layers => {
          const objectSha256 = layers[0]?.objectSha256
          if (objectSha256 === undefined) {
            return
          }
          activeObjectSha256s.add(objectSha256)
          try {
            for (const layer of layers) {
              abortIfNeeded(options.signal)
              emit('object-chunk', layer.descriptor.digest, layer.objectSha256)
              try {
                await runAuthenticated(
                  runner,
                  executable,
                  [
                    'blob',
                    'push',
                    ...auth(true),
                    `${options.registryRepository}@${layer.descriptor.digest}`,
                    layer.localPath as string,
                  ],
                  options.credentials,
                  options.signal,
                  timeoutMs
                )
              } catch (error) {
                if (
                  error instanceof CheapLfsGhcrTransportError &&
                  error.kind === 'process-timeout'
                ) {
                  throw new CheapLfsGhcrLayerUploadTimeoutError(
                    layer.objectSha256,
                    layer.descriptor.digest,
                    options.image.maximumChunkBytes,
                    getNextCheapLfsGhcrChunkBytes(
                      options.image.maximumChunkBytes,
                      options.image.snapshot.objects.find(
                        object => object.sha256 === layer.objectSha256
                      )?.sizeInBytes
                    )
                  )
                }
                throw error
              }
              uploadedDigests.add(layer.descriptor.digest)
              completedItems++
              processedBytes += layer.descriptor.size
              emit('object-chunk', layer.descriptor.digest, layer.objectSha256)
            }
          } finally {
            activeObjectSha256s.delete(objectSha256)
            emit(
              'object-chunk',
              layers[layers.length - 1]?.descriptor.digest ?? null,
              objectSha256
            )
          }
        }
      )
    } catch (error) {
      if (error instanceof CheapLfsGhcrLayerUploadTimeoutError) {
        const completedObjectSha256s = [...requiredDigestsByObject]
          .filter(([, required]) =>
            [...required].every(digest => uploadedDigests.has(digest))
          )
          .map(([objectSha256]) => objectSha256)
          .sort()
        throw new CheapLfsGhcrLayerUploadTimeoutError(
          error.objectSha256,
          error.layerDigest,
          error.currentMaximumChunkBytes,
          error.recommendedMaximumChunkBytes,
          completedObjectSha256s
        )
      }
      throw error
    }

    emit('manifest', options.image.manifestDescriptor.digest, null)
    await runAuthenticated(
      runner,
      executable,
      [
        'manifest',
        'push',
        '--media-type',
        OciImageManifestMediaType,
        ...auth(false),
        immutableReference,
        options.image.manifestPath,
      ],
      options.credentials,
      options.signal,
      timeoutMs
    )
    completedItems++
    processedBytes += options.image.manifestDescriptor.size
    emit('manifest', options.image.manifestDescriptor.digest, null)

    const verifiedManifestPath = join(directory, 'verified-manifest.json')
    await runAuthenticated(
      runner,
      executable,
      [
        'manifest',
        'fetch',
        '--output',
        verifiedManifestPath,
        ...auth(true),
        immutableReference,
      ],
      options.credentials,
      options.signal,
      timeoutMs
    )
    await requireExactManifest(
      verifiedManifestPath,
      options.image.manifestPath,
      options.image.manifestDescriptor.digest
    )
    completedItems++
    emit('manifest', options.image.manifestDescriptor.digest, null)

    const retentionTag = getCheapLfsGhcrRetentionTag(
      options.image.manifestDescriptor.digest
    )
    const retentionReference = `${options.registryRepository}:${retentionTag}`
    emit('tag', options.image.manifestDescriptor.digest, null)
    await runAuthenticated(
      runner,
      executable,
      ['tag', ...auth(false), immutableReference, retentionTag],
      options.credentials,
      options.signal,
      timeoutMs
    )

    const retainedManifestPath = join(directory, 'retained-manifest.json')
    await runAuthenticated(
      runner,
      executable,
      [
        'manifest',
        'fetch',
        '--output',
        retainedManifestPath,
        ...auth(true),
        retentionReference,
      ],
      options.credentials,
      options.signal,
      timeoutMs
    )
    await requireExactManifest(
      retainedManifestPath,
      options.image.manifestPath,
      options.image.manifestDescriptor.digest
    )
    completedItems++
    emit('tag', options.image.manifestDescriptor.digest, null)

    emit('package-policy', options.image.manifestDescriptor.digest, null)
    const policy = await options.packagePolicyVerifier.verify({
      provider,
      repositoryIdentity: options.image.snapshot.repositoryIdentity,
      sourceRepositoryUrl: options.image.sourceRepositoryUrl,
      registryRepository: options.registryRepository,
      immutableReference,
      visibility: options.image.snapshot.visibility,
      signal: options.signal,
    })
    if (
      policy.provider !== provider ||
      policy.repositoryIdentity !== options.image.snapshot.repositoryIdentity ||
      policy.sourceRepositoryUrl !== options.image.sourceRepositoryUrl ||
      policy.registryRepository !== options.registryRepository ||
      policy.visibility !== options.image.snapshot.visibility ||
      !policy.sourceRepositoryAccessVerified ||
      !policy.registryVisibilityVerified
    ) {
      throw new CheapLfsGhcrTransportError(
        'package-policy',
        'Cheap LFS GHCR refused to move the tag before package access and visibility were verified.'
      )
    }
    completedItems++
    emit('package-policy', options.image.manifestDescriptor.digest, null)

    emit('tag', options.image.manifestDescriptor.digest, null)
    await runAuthenticated(
      runner,
      executable,
      ['tag', ...auth(false), immutableReference, CheapLfsGhcrRepositoryTag],
      options.credentials,
      options.signal,
      timeoutMs
    )

    const taggedManifestPath = join(directory, 'tagged-manifest.json')
    await runAuthenticated(
      runner,
      executable,
      [
        'manifest',
        'fetch',
        '--output',
        taggedManifestPath,
        ...auth(true),
        taggedReference,
      ],
      options.credentials,
      options.signal,
      timeoutMs
    )
    await requireExactManifest(
      taggedManifestPath,
      options.image.manifestPath,
      options.image.manifestDescriptor.digest
    )
    completedItems++
    emit('tag', options.image.manifestDescriptor.digest, null)

    return {
      provider,
      immutableReference,
      taggedReference,
      manifestDigest: options.image.manifestDescriptor.digest,
      pointers: pointerResults(options.image, immutableReference),
      keyCreated: options.keyCreated,
      keyRelativePath: options.keyRelativePath,
    }
  })
}

function assertPointerMatchesObject(
  pointer: ICheapLfsGhcrPointer,
  image: ICheapLfsGhcrValidatedImage
) {
  const sha256 = pointer.object.slice('sha256:'.length)
  const object = image.snapshot.objects.find(value => value.sha256 === sha256)
  const layers = object?.chunks.map(chunk => chunk.blob.digest)
  if (
    object === undefined ||
    object.sizeInBytes !== pointer.sizeInBytes ||
    (pointer.keyId !== undefined && pointer.keyId !== image.snapshot.keyId) ||
    layers?.length !== pointer.layers.length ||
    layers.some((digest, index) => digest !== pointer.layers[index])
  ) {
    throw new CheapLfsGhcrTransportError(
      'integrity',
      'The committed Cheap LFS GHCR pointer does not match its immutable image index.'
    )
  }
}

/**
 * Pull one pointer's confirmed chunks from its immutable image, validate all
 * manifest/config structure and bytes, then expose only the scoped temp image.
 */
export async function withPulledCheapLfsGhcrObject<T>(
  options: IPullCheapLfsGhcrObjectOptions,
  operation: (image: ICheapLfsGhcrValidatedImage) => Promise<T>
): Promise<T> {
  // Runtime callers may construct the interface directly; force every field
  // through the canonical serializer before any registry/network operation.
  serializeCheapLfsGhcrPointer(options.pointer)
  if (
    options.pointer.version !== CHEAP_LFS_GHCR_POINTER_VERSION ||
    !isCheapLfsGhcrImmutableReference(options.pointer.image)
  ) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS GHCR restore requires a canonical immutable pointer.'
    )
  }
  const registryRepository = getCheapLfsGhcrRegistryRepository(
    options.pointer.image
  )
  if (registryRepository === null) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS restore requires an immutable ghcr.io or docker.io image reference.'
    )
  }
  const provider = getCheapLfsOciRegistryProvider(options.pointer.image)
  if (provider === null) {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Cheap LFS restore could not identify the OCI registry provider.'
    )
  }
  if (options.credentials !== undefined && options.credentials !== null) {
    requireCredentials(options.credentials, provider)
  } else if (options.expectedVisibility === 'private') {
    throw new CheapLfsGhcrTransportError(
      'invalid-input',
      'Private Cheap LFS registry restores require explicit credentials.'
    )
  }
  const credentials = options.credentials ?? null
  abortIfNeeded(options.signal)
  const timeoutMs = requireTimeout(options.processTimeoutMs)
  const executable = await requirePinnedOrasExecutable(
    options.orasExecutablePath,
    options.orasExecutableSha256
  )
  const runner = options.runner ?? new DefaultOrasRunner()

  return await withRegistryConfig(async (directory, registryConfigPath) => {
    const auth = () =>
      authArguments(credentials?.username ?? null, registryConfigPath, true)
    const manifestPath = join(directory, 'manifest.json')
    const configPath = join(directory, 'config.json')
    let completedItems = 0
    let processedBytes = 0
    let totalBytes = 0
    let totalItems = 2
    const emit = (
      stage: ICheapLfsGhcrTransferProgress['stage'],
      digest: string | null
    ) =>
      options.onProgress?.({
        phase: 'downloading',
        stage,
        currentDigest: digest,
        currentObjectSha256: options.pointer.object.slice('sha256:'.length),
        completedItems,
        totalItems,
        completedObjects: completedItems,
        totalObjects: totalItems,
        processedBytes,
        totalBytes,
      })

    emit('manifest', options.pointer.image.slice(-71))
    await runAuthenticated(
      runner,
      executable,
      [
        'manifest',
        'fetch',
        '--output',
        manifestPath,
        ...auth(),
        options.pointer.image,
      ],
      credentials,
      options.signal,
      timeoutMs
    )
    completedItems++
    const manifest = await inspectCheapLfsGhcrManifest(manifestPath)
    totalBytes += manifest.config.size
    emit('manifest', options.pointer.image.slice(-71))

    emit('config', manifest.config.digest)
    await runAuthenticated(
      runner,
      executable,
      [
        'blob',
        'fetch',
        '--output',
        configPath,
        ...auth(),
        `${registryRepository}@${manifest.config.digest}`,
      ],
      credentials,
      options.signal,
      timeoutMs
    )
    completedItems++
    processedBytes += manifest.config.size

    const uniquePointerLayers = [...new Set(options.pointer.layers)]
    const descriptorByDigest = new Map(
      manifest.layers.map(descriptor => [descriptor.digest, descriptor])
    )
    const requestedDescriptors = uniquePointerLayers.map(digest => {
      const descriptor = descriptorByDigest.get(digest)
      if (descriptor === undefined) {
        throw new CheapLfsGhcrTransportError(
          'integrity',
          'The committed Cheap LFS GHCR pointer references a layer absent from its image.'
        )
      }
      return descriptor
    })
    totalItems += requestedDescriptors.length
    totalBytes += requestedDescriptors.reduce(
      (sum, descriptor) => sum + descriptor.size,
      0
    )
    emit('config', manifest.config.digest)

    const blobPaths = new Map<string, string>()
    await runBounded(
      requestedDescriptors,
      options.parallelBlobDownloads ? ParallelBlobLimit : 1,
      async descriptor => {
        abortIfNeeded(options.signal)
        const path = join(
          directory,
          `blob-${descriptor.digest.slice('sha256:'.length)}`
        )
        emit('object-chunk', descriptor.digest)
        await runAuthenticated(
          runner,
          executable,
          [
            'blob',
            'fetch',
            '--output',
            path,
            ...auth(),
            `${registryRepository}@${descriptor.digest}`,
          ],
          credentials,
          options.signal,
          timeoutMs
        )
        blobPaths.set(descriptor.digest, path)
        completedItems++
        processedBytes += descriptor.size
        emit('object-chunk', descriptor.digest)
      }
    )

    const pulled: ICheapLfsGhcrPulledImage = {
      immutableReference: options.pointer.image,
      manifestPath,
      configPath,
      blobPaths,
    }
    const validated = await validateCheapLfsGhcrPulledImage(pulled, {
      expectedRepositoryIdentity: options.expectedRepositoryIdentity,
      expectedVisibility: options.expectedVisibility,
      requiredObject: {
        sha256: options.pointer.object.slice('sha256:'.length),
        sizeInBytes: options.pointer.sizeInBytes,
        layerDigests: options.pointer.layers,
      },
    })
    assertPointerMatchesObject(options.pointer, validated)
    return await operation(validated)
  })
}
