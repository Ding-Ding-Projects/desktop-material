import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomUUID,
} from 'crypto'
import { constants, createReadStream, createWriteStream, Stats } from 'fs'
import {
  link,
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { basename, dirname, join, resolve } from 'path'
import { Transform, Writable } from 'stream'
import { pipeline } from 'stream/promises'

export const CheapLfsGhcrArtifactType =
  'application/vnd.desktop-material.cheap-lfs.repository.v1'
export const OciImageConfigMediaType =
  'application/vnd.oci.image.config.v1+json'
/** Retained name for callers; Cheap LFS now uses the standard OCI config. */
export const CheapLfsGhcrConfigMediaType = OciImageConfigMediaType
export const CheapLfsGhcrPublicObjectMediaType =
  'application/vnd.desktop-material.cheap-lfs.object.v1'
export const CheapLfsGhcrEncryptedObjectMediaType =
  'application/vnd.desktop-material.cheap-lfs.object.encrypted.v1'
export const OciImageManifestMediaType =
  'application/vnd.oci.image.manifest.v1+json'
export const CheapLfsOciSourceAnnotation = 'org.opencontainers.image.source'
export const CheapLfsGhcrSnapshotConfigField = 'desktopMaterialCheapLfs'

const Format = 'desktop-material-cheap-lfs-ghcr'
const FormatVersion = 1
const EncryptionAlgorithm = 'AES-256-GCM'
const KeyDerivationAlgorithm = 'HKDF-SHA256'
const MaximumObjects = 4096
const MaximumLayers = 8192
const MaximumJsonBytes = 8 * 1024 * 1024
/** GHCR's documented hard per-layer ceiling. */
export const CheapLfsGhcrMaximumLayerBytes = 10_000_000_000
/** Keep each upload comfortably below GHCR's hard ceiling and timeout risk. */
export const CheapLfsGhcrMaximumChunkBytes = Math.floor(
  1.5 * 1024 * 1024 * 1024
)
/** Adaptive timeout retries never shrink below this production safety floor. */
export const CheapLfsGhcrMinimumAdaptiveChunkBytes = 8 * 1024 * 1024
export const CheapLfsGhcrMaximumAdaptivePrepareAttempts = 9
export const CheapLfsGhcrMaximumChunksPerObject = 8192
export const CheapLfsGhcrMaximumObjectBytes =
  CheapLfsGhcrMaximumChunkBytes * CheapLfsGhcrMaximumChunksPerObject
const SaltBytes = 32
const NonceBytes = 12
const AuthenticationTagBytes = 16
const NoFollowFlag = constants.O_NOFOLLOW ?? 0

export type CheapLfsGhcrVisibility = 'public' | 'private'
export type CheapLfsGhcrPreparePhase =
  | 'preparing'
  | 'hashing'
  | 'encrypting'
  | 'verifying'

export interface ICheapLfsGhcrProgress {
  readonly phase: CheapLfsGhcrPreparePhase | 'uploading' | 'downloading'
  readonly completedObjects: number
  readonly totalObjects: number
  readonly currentObjectSha256: string | null
  readonly processedBytes: number
  readonly totalBytes: number
}

export interface IOciDescriptor {
  readonly mediaType: string
  readonly digest: string
  readonly size: number
}

export interface ICheapLfsGhcrEncryptionMetadata {
  readonly algorithm: typeof EncryptionAlgorithm
  readonly keyDerivation: typeof KeyDerivationAlgorithm
  readonly salt: string
  readonly nonce: string
  readonly authenticationTag: string
}

export interface ICheapLfsGhcrObjectRecord {
  readonly sha256: string
  readonly sizeInBytes: number
  readonly chunks: ReadonlyArray<ICheapLfsGhcrChunkRecord>
}

export interface ICheapLfsGhcrChunkRecord {
  readonly ordinal: number
  readonly offset: number
  readonly sizeInBytes: number
  readonly plaintextSha256: string
  readonly blob: IOciDescriptor
  readonly encryption: ICheapLfsGhcrEncryptionMetadata | null
}

export interface ICheapLfsGhcrSnapshot {
  readonly format: typeof Format
  readonly version: typeof FormatVersion
  readonly repositoryIdentity: string
  readonly visibility: CheapLfsGhcrVisibility
  readonly keyId: string | null
  readonly objects: ReadonlyArray<ICheapLfsGhcrObjectRecord>
}

interface ICheapLfsGhcrOciImageConfig {
  readonly architecture: 'unknown'
  readonly os: 'unknown'
  readonly config: {
    readonly Labels: {
      readonly [CheapLfsOciSourceAnnotation]: string
    }
  }
  readonly rootfs: {
    readonly type: 'layers'
    readonly diff_ids: ReadonlyArray<string>
  }
  readonly [CheapLfsGhcrSnapshotConfigField]: ICheapLfsGhcrSnapshot
}

export interface ICheapLfsGhcrDesiredObject {
  /** Lowercase plaintext SHA-256, without a `sha256:` prefix. */
  readonly sha256: string
  readonly sizeInBytes: number
  /** Required only when this object cannot reuse the previous snapshot layer. */
  readonly sourcePath?: string
}

export interface ICheapLfsGhcrPreparedLayer {
  readonly object: ICheapLfsGhcrObjectRecord
  readonly chunk: ICheapLfsGhcrChunkRecord
  readonly descriptor: IOciDescriptor
  /** Null means the registry already owns this unchanged previous layer. */
  readonly localPath: string | null
  readonly reused: boolean
}

export interface ICheapLfsGhcrPreparedImage {
  readonly directory: string
  readonly maximumChunkBytes: number
  readonly sourceRepositoryUrl: string
  readonly snapshot: ICheapLfsGhcrSnapshot
  readonly configPath: string
  readonly configDescriptor: IOciDescriptor
  readonly manifestPath: string
  readonly manifestDescriptor: IOciDescriptor
  readonly layers: ReadonlyArray<ICheapLfsGhcrPreparedLayer>
}

export interface IPrepareCheapLfsGhcrImageOptions {
  readonly repositoryIdentity: string
  /** Canonical GitHub URL used by registries to link package access/policy. */
  readonly sourceRepositoryUrl: string
  readonly visibility: CheapLfsGhcrVisibility
  readonly desiredObjects: ReadonlyArray<ICheapLfsGhcrDesiredObject>
  readonly previousSnapshot?: ICheapLfsGhcrSnapshot | null
  /** Exactly 32 bytes for private repositories; absent for public ones. */
  readonly encryptionKey?: Uint8Array | null
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: ICheapLfsGhcrProgress) => void
  /**
   * Upper bound for newly staged chunks. Defaults to 1.5 GiB. Retry callers
   * pass the typed timeout's recommended halved value.
   */
  readonly maximumChunkBytes?: number
  /** Injectable deterministic entropy for tests; production uses randomBytes. */
  readonly entropy?: (
    size: number,
    purpose: 'salt' | 'nonce',
    objectSha256: string,
    chunkOrdinal: number
  ) => Buffer
}

export function getNextCheapLfsGhcrChunkBytes(
  currentMaximumChunkBytes: number,
  objectSizeInBytes?: number
): number | null {
  if (
    !Number.isSafeInteger(currentMaximumChunkBytes) ||
    currentMaximumChunkBytes <= CheapLfsGhcrMinimumAdaptiveChunkBytes
  ) {
    return null
  }
  const next = Math.max(
    CheapLfsGhcrMinimumAdaptiveChunkBytes,
    Math.floor(currentMaximumChunkBytes / 2)
  )
  if (
    objectSizeInBytes !== undefined &&
    (!isSafeObjectSize(objectSizeInBytes) ||
      Math.ceil(objectSizeInBytes / next) > CheapLfsGhcrMaximumChunksPerObject)
  ) {
    return null
  }
  return next
}

/**
 * Treat GHCR's decimal 10 GB ceiling as an exclusive defensive boundary.
 * Generated chunks remain much smaller, but pulled blob paths are untrusted.
 */
export function isCheapLfsGhcrLayerSizeAllowed(size: number): boolean {
  return (
    Number.isSafeInteger(size) &&
    size >= 0 &&
    size < CheapLfsGhcrMaximumLayerBytes
  )
}

export interface ICheapLfsGhcrPulledImage {
  readonly immutableReference: string
  readonly manifestPath: string
  readonly configPath: string
  /** Exact `sha256:...` descriptor digest to downloaded blob path. */
  readonly blobPaths: ReadonlyMap<string, string>
}

export interface IValidateCheapLfsGhcrPulledImageOptions {
  readonly expectedRepositoryIdentity: string
  readonly expectedVisibility: CheapLfsGhcrVisibility
  /**
   * When present, verify exactly one pointer-confirmed object's blobs. All
   * manifest/config metadata is still validated, but unrelated large layers
   * are not downloaded merely to restore one object.
   */
  readonly requiredObject?: {
    readonly sha256: string
    readonly sizeInBytes: number
    readonly layerDigests: ReadonlyArray<string>
  }
}

export interface ICheapLfsGhcrValidatedImage {
  readonly immutableReference: string
  readonly sourceRepositoryUrl: string
  readonly snapshot: ICheapLfsGhcrSnapshot
  readonly manifestDescriptor: IOciDescriptor
  readonly configDescriptor: IOciDescriptor
  readonly blobPaths: ReadonlyMap<string, string>
}

export class CheapLfsGhcrImageError extends Error {
  public constructor(
    public readonly kind:
      | 'canceled'
      | 'invalid-input'
      | 'missing-key'
      | 'integrity'
      | 'unsafe-source'
      | 'missing-source'
      | 'invalid-image'
      | 'destination-exists'
      | 'cleanup',
    message: string
  ) {
    super(message)
    this.name = 'CheapLfsGhcrImageError'
  }
}

function requireMaximumChunkBytes(value: number | undefined): number {
  const maximum = value ?? CheapLfsGhcrMaximumChunkBytes
  if (
    !Number.isSafeInteger(maximum) ||
    maximum <= 0 ||
    maximum > CheapLfsGhcrMaximumChunkBytes
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'Cheap LFS requires a positive chunk bound no larger than 1.5 GiB.'
    )
  }
  return maximum
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CheapLfsGhcrImageError(
      'canceled',
      'Cheap LFS GHCR work was canceled.'
    )
  }
}

function sha256Buffer(value: Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)
}

function isObjectSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function isSafeSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= CheapLfsGhcrMaximumChunkBytes
  )
}

function isSafeObjectSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= CheapLfsGhcrMaximumObjectBytes
  )
}

function requireRepositoryIdentity(value: string): void {
  if (!/^github\.com\/repositories\/[1-9][0-9]{0,19}$/.test(value)) {
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'Cheap LFS GHCR requires a canonical GitHub repository identity.'
    )
  }
}

function requireSourceRepositoryUrl(
  value: string,
  kind: 'invalid-input' | 'invalid-image' = 'invalid-input'
): string {
  if (typeof value !== 'string') {
    throw new CheapLfsGhcrImageError(
      kind,
      'Cheap LFS OCI storage requires a canonical https://github.com/owner/repository source URL.'
    )
  }
  const match =
    /^https:\/\/github\.com\/(?<owner>[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/(?<repository>[A-Za-z0-9._-]{1,100})$/.exec(
      value
    )
  if (
    match?.groups?.owner === undefined ||
    match.groups.repository === undefined ||
    match.groups.repository === '.' ||
    match.groups.repository === '..' ||
    match.groups.repository.toLowerCase().endsWith('.git')
  ) {
    throw new CheapLfsGhcrImageError(
      kind,
      'Cheap LFS OCI storage requires a canonical https://github.com/owner/repository source URL.'
    )
  }
  return value
}

function descriptor(
  mediaType: string,
  digest: string,
  size: number
): IOciDescriptor {
  return { mediaType, digest, size }
}

function descriptorForBytes(mediaType: string, value: Buffer): IOciDescriptor {
  return descriptor(mediaType, sha256Buffer(value), value.byteLength)
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8')
}

function exactKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>
): boolean {
  const actual = Object.keys(value)
  return (
    actual.length === keys.length && actual.every((key, i) => key === keys[i])
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCanonicalJson(
  path: string,
  maximumBytes: number
): Promise<unknown> {
  return readFile(path).then(bytes => {
    if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR rejected oversized or empty JSON metadata.'
      )
    }
    const text = bytes.toString('utf8')
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR rejected invalid JSON metadata.'
      )
    }
    if (JSON.stringify(value) !== text) {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR requires canonical JSON metadata.'
      )
    }
    return value
  })
}

async function hashFile(
  path: string
): Promise<{ digest: string; size: number }> {
  const hash = createHash('sha256')
  let size = 0
  const stream = createReadStream(path)
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    size += chunk.byteLength
    if (!isCheapLfsGhcrLayerSizeAllowed(size)) {
      stream.destroy()
      throw new CheapLfsGhcrImageError(
        'integrity',
        'Cheap LFS GHCR rejected an oversized object blob.'
      )
    }
    hash.update(chunk)
  }
  return { digest: `sha256:${hash.digest('hex')}`, size }
}

function keyIdFor(key: Uint8Array): string {
  return `sha256:${createHash('sha256').update(key).digest('hex')}`
}

function lengthPrefixed(parts: ReadonlyArray<Buffer>): Buffer {
  const encoded = new Array<Buffer>()
  for (const part of parts) {
    const length = Buffer.allocUnsafe(4)
    length.writeUInt32BE(part.byteLength)
    encoded.push(length, part)
  }
  return Buffer.concat(encoded)
}

function encryptionContext(
  repositoryIdentity: string,
  sha256: string,
  sizeInBytes: number,
  chunkOrdinal: number,
  chunkOffset: number,
  chunkSizeInBytes: number
): { readonly info: Buffer; readonly aad: Buffer } {
  const size = Buffer.allocUnsafe(8)
  size.writeBigUInt64BE(BigInt(sizeInBytes))
  const ordinal = Buffer.allocUnsafe(4)
  ordinal.writeUInt32BE(chunkOrdinal)
  const offset = Buffer.allocUnsafe(8)
  offset.writeBigUInt64BE(BigInt(chunkOffset))
  const chunkSize = Buffer.allocUnsafe(8)
  chunkSize.writeBigUInt64BE(BigInt(chunkSizeInBytes))
  const fields = [
    Buffer.from('desktop-material-cheap-lfs-ghcr-v1', 'utf8'),
    Buffer.from(repositoryIdentity, 'utf8'),
    Buffer.from(sha256, 'ascii'),
    size,
    ordinal,
    offset,
    chunkSize,
    Buffer.from(EncryptionAlgorithm, 'ascii'),
  ]
  return {
    info: lengthPrefixed([
      Buffer.from('cheap-lfs-ghcr-object-key', 'ascii'),
      ...fields,
    ]),
    aad: lengthPrefixed([
      Buffer.from('cheap-lfs-ghcr-object-aad', 'ascii'),
      ...fields,
    ]),
  }
}

function decodeFixedBase64url(
  value: unknown,
  bytes: number,
  label: string
): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      `Cheap LFS GHCR rejected invalid ${label} metadata.`
    )
  }
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length !== bytes || decoded.toString('base64url') !== value) {
    decoded.fill(0)
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      `Cheap LFS GHCR rejected invalid ${label} metadata.`
    )
  }
  return decoded
}

function validateEncryption(
  value: unknown
): ICheapLfsGhcrEncryptionMetadata | null {
  if (value === null) {
    return null
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'algorithm',
      'keyDerivation',
      'salt',
      'nonce',
      'authenticationTag',
    ]) ||
    value.algorithm !== EncryptionAlgorithm ||
    value.keyDerivation !== KeyDerivationAlgorithm
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected unsupported encryption metadata.'
    )
  }
  for (const [field, size] of [
    ['salt', SaltBytes],
    ['nonce', NonceBytes],
    ['authenticationTag', AuthenticationTagBytes],
  ] as const) {
    decodeFixedBase64url(value[field], size, field).fill(0)
  }
  return value as unknown as ICheapLfsGhcrEncryptionMetadata
}

function validateDescriptor(
  value: unknown,
  expectedMediaType?: string
): IOciDescriptor {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['mediaType', 'digest', 'size']) ||
    typeof value.mediaType !== 'string' ||
    (expectedMediaType !== undefined &&
      value.mediaType !== expectedMediaType) ||
    !isDigest(value.digest) ||
    !isSafeSize(value.size)
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected an invalid OCI descriptor.'
    )
  }
  return value as unknown as IOciDescriptor
}

/** Strictly validate a repository snapshot config before reuse or restore. */
export function validateCheapLfsGhcrSnapshot(
  value: unknown,
  expectedRepositoryIdentity?: string,
  expectedVisibility?: CheapLfsGhcrVisibility
): ICheapLfsGhcrSnapshot {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'format',
      'version',
      'repositoryIdentity',
      'visibility',
      'keyId',
      'objects',
    ]) ||
    value.format !== Format ||
    value.version !== FormatVersion ||
    typeof value.repositoryIdentity !== 'string' ||
    (value.visibility !== 'public' && value.visibility !== 'private') ||
    !Array.isArray(value.objects) ||
    value.objects.length > MaximumObjects
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected an invalid repository image config.'
    )
  }
  requireRepositoryIdentity(value.repositoryIdentity)
  if (
    (expectedRepositoryIdentity !== undefined &&
      value.repositoryIdentity !== expectedRepositoryIdentity) ||
    (expectedVisibility !== undefined &&
      value.visibility !== expectedVisibility)
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected metadata for a different repository or visibility.'
    )
  }
  if (
    (value.visibility === 'private' && !isDigest(value.keyId)) ||
    (value.visibility === 'public' && value.keyId !== null)
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected inconsistent repository encryption policy.'
    )
  }

  const objects = new Array<ICheapLfsGhcrObjectRecord>()
  let previousSha = ''
  let totalLayers = 0
  for (const entry of value.objects) {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ['sha256', 'sizeInBytes', 'chunks']) ||
      !isObjectSha256(entry.sha256) ||
      !isSafeObjectSize(entry.sizeInBytes) ||
      !Array.isArray(entry.chunks) ||
      entry.chunks.length === 0 ||
      entry.chunks.length > CheapLfsGhcrMaximumChunksPerObject ||
      entry.sha256 <= previousSha
    ) {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR rejected an unsorted or invalid object index.'
      )
    }
    previousSha = entry.sha256
    const expectedMediaType =
      value.visibility === 'private'
        ? CheapLfsGhcrEncryptedObjectMediaType
        : CheapLfsGhcrPublicObjectMediaType
    const chunks = new Array<ICheapLfsGhcrChunkRecord>()
    let expectedOffset = 0
    for (let ordinal = 0; ordinal < entry.chunks.length; ordinal++) {
      const chunk = entry.chunks[ordinal]
      if (
        !isRecord(chunk) ||
        !exactKeys(chunk, [
          'ordinal',
          'offset',
          'sizeInBytes',
          'plaintextSha256',
          'blob',
          'encryption',
        ]) ||
        chunk.ordinal !== ordinal ||
        chunk.offset !== expectedOffset ||
        !isSafeSize(chunk.sizeInBytes) ||
        chunk.sizeInBytes <= 0 ||
        !isObjectSha256(chunk.plaintextSha256)
      ) {
        throw new CheapLfsGhcrImageError(
          'invalid-image',
          'Cheap LFS GHCR rejected an invalid ordered chunk index.'
        )
      }
      const encryption = validateEncryption(chunk.encryption)
      const blob = validateDescriptor(chunk.blob, expectedMediaType)
      if (
        (value.visibility === 'private' && encryption === null) ||
        (value.visibility === 'public' && encryption !== null) ||
        (value.visibility === 'public' && blob.size !== chunk.sizeInBytes)
      ) {
        throw new CheapLfsGhcrImageError(
          'invalid-image',
          'Cheap LFS GHCR rejected a chunk with inconsistent encryption state.'
        )
      }
      expectedOffset += chunk.sizeInBytes
      if (!Number.isSafeInteger(expectedOffset)) {
        throw new CheapLfsGhcrImageError(
          'invalid-image',
          'Cheap LFS GHCR rejected an overflowing chunk index.'
        )
      }
      chunks.push({
        ordinal,
        offset: chunk.offset,
        sizeInBytes: chunk.sizeInBytes,
        plaintextSha256: chunk.plaintextSha256,
        blob,
        encryption,
      })
    }
    if (expectedOffset !== entry.sizeInBytes) {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR rejected chunks that do not cover the object exactly.'
      )
    }
    totalLayers += chunks.length
    if (totalLayers > MaximumLayers) {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR rejected an oversized layer index.'
      )
    }
    objects.push({
      sha256: entry.sha256,
      sizeInBytes: entry.sizeInBytes,
      chunks,
    })
  }
  return {
    format: Format,
    version: FormatVersion,
    repositoryIdentity: value.repositoryIdentity,
    visibility: value.visibility,
    keyId: value.keyId as string | null,
    objects,
  }
}

function requireKey(
  visibility: CheapLfsGhcrVisibility,
  encryptionKey: Uint8Array | null | undefined
): Buffer | null {
  if (visibility === 'public') {
    if (encryptionKey !== undefined && encryptionKey !== null) {
      throw new CheapLfsGhcrImageError(
        'invalid-input',
        'Public Cheap LFS GHCR images do not accept an encryption key.'
      )
    }
    return null
  }
  if (encryptionKey === undefined || encryptionKey === null) {
    throw new CheapLfsGhcrImageError(
      'missing-key',
      'Private Cheap LFS GHCR images require the tracked repository key.'
    )
  }
  if (encryptionKey.byteLength !== 32) {
    throw new CheapLfsGhcrImageError(
      'missing-key',
      'Private Cheap LFS GHCR images require an exact 256-bit repository key.'
    )
  }
  return Buffer.from(encryptionKey)
}

function requireDesiredObjects(
  desired: ReadonlyArray<ICheapLfsGhcrDesiredObject>
): ReadonlyArray<ICheapLfsGhcrDesiredObject> {
  if (desired.length > MaximumObjects) {
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'Cheap LFS GHCR object count exceeds the bounded image index.'
    )
  }
  const sorted = [...desired].sort((a, b) => a.sha256.localeCompare(b.sha256))
  let previous = ''
  let total = 0
  for (const object of sorted) {
    if (
      !isObjectSha256(object.sha256) ||
      !isSafeObjectSize(object.sizeInBytes) ||
      object.sha256 === previous
    ) {
      throw new CheapLfsGhcrImageError(
        'invalid-input',
        'Cheap LFS GHCR requires unique lowercase SHA-256 object identities and safe sizes.'
      )
    }
    previous = object.sha256
    total += object.sizeInBytes
    if (!Number.isSafeInteger(total)) {
      throw new CheapLfsGhcrImageError(
        'invalid-input',
        'Cheap LFS GHCR object bytes exceed the safe aggregate range.'
      )
    }
  }
  return sorted
}

function requirePredictedLayerCount(
  desired: ReadonlyArray<ICheapLfsGhcrDesiredObject>,
  previousObjects: ReadonlyMap<string, ICheapLfsGhcrObjectRecord>,
  maximumChunkBytes: number
): void {
  let totalLayers = 0
  for (const object of desired) {
    const reusable = previousObjects.get(object.sha256)
    totalLayers +=
      reusable !== undefined && reusable.sizeInBytes === object.sizeInBytes
        ? reusable.chunks.length
        : Math.ceil(object.sizeInBytes / maximumChunkBytes)
    if (totalLayers > MaximumLayers) {
      throw new CheapLfsGhcrImageError(
        'invalid-input',
        'Cheap LFS adaptive chunks would exceed the bounded repository layer index.'
      )
    }
  }
}

function sourceIdentity(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  )
}

async function openStableSource(path: string, expectedSize: number) {
  const entry = await lstat(path).catch(() => null)
  if (
    entry === null ||
    entry.isSymbolicLink() ||
    !entry.isFile() ||
    entry.size !== expectedSize
  ) {
    throw new CheapLfsGhcrImageError(
      'unsafe-source',
      'Cheap LFS GHCR requires an unchanged regular source file.'
    )
  }
  const handle = await open(path, constants.O_RDONLY | NoFollowFlag)
  const opened = await handle.stat()
  if (!opened.isFile() || !sourceIdentity(entry, opened)) {
    await handle.close()
    throw new CheapLfsGhcrImageError(
      'unsafe-source',
      'Cheap LFS GHCR refuses a source that changed while opening it.'
    )
  }
  return { handle, opened }
}

function hashingTransform(
  hash: ReturnType<typeof createHash>,
  onBytes: (bytes: number) => void
): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      onBytes(chunk.byteLength)
      callback(null, chunk)
    },
  })
}

function fileHandleWritable(
  handle: Awaited<ReturnType<typeof open>>,
  start: number
): Writable {
  let position = start
  return new Writable({
    write(value: Buffer, _encoding, callback) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
      const writeAll = async () => {
        let offset = 0
        while (offset < chunk.byteLength) {
          const result = await handle.write(
            chunk,
            offset,
            chunk.byteLength - offset,
            position
          )
          if (result.bytesWritten <= 0) {
            throw new CheapLfsGhcrImageError(
              'integrity',
              'Cheap LFS could not write verified object bytes.'
            )
          }
          offset += result.bytesWritten
          position += result.bytesWritten
        }
      }
      writeAll().then(() => callback(), callback)
    },
  })
}

async function stageObject(
  directory: string,
  ordinal: number,
  desired: ICheapLfsGhcrDesiredObject,
  repositoryIdentity: string,
  visibility: CheapLfsGhcrVisibility,
  key: Buffer | null,
  entropy: NonNullable<IPrepareCheapLfsGhcrImageOptions['entropy']>,
  maximumChunkBytes: number,
  signal: AbortSignal | undefined,
  onBytes: (bytes: number) => void
): Promise<{
  readonly object: ICheapLfsGhcrObjectRecord
  readonly layers: ReadonlyArray<ICheapLfsGhcrPreparedLayer>
}> {
  if (desired.sourcePath === undefined) {
    throw new CheapLfsGhcrImageError(
      'missing-source',
      `Cheap LFS GHCR needs source bytes for new object ${desired.sha256}.`
    )
  }
  abortIfNeeded(signal)
  const source = await openStableSource(
    resolve(desired.sourcePath),
    desired.sizeInBytes
  )
  const objectHash = createHash('sha256')
  let processed = 0
  const report = (bytes: number) => {
    processed += bytes
    onBytes(bytes)
    abortIfNeeded(signal)
  }
  const staged = new Array<{
    readonly chunk: ICheapLfsGhcrChunkRecord
    readonly path: string
  }>()
  if (
    Math.ceil(desired.sizeInBytes / maximumChunkBytes) >
    CheapLfsGhcrMaximumChunksPerObject
  ) {
    await source.handle.close()
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'Cheap LFS adaptive chunks would exceed the bounded object layer index.'
    )
  }
  try {
    let offset = 0
    let chunkOrdinal = 0
    while (offset < desired.sizeInBytes) {
      abortIfNeeded(signal)
      const chunkSize = Math.min(
        maximumChunkBytes,
        desired.sizeInBytes - offset
      )
      const path = join(
        directory,
        `object-${ordinal.toString().padStart(8, '0')}-chunk-${chunkOrdinal
          .toString()
          .padStart(4, '0')}`
      )
      const chunkHash = createHash('sha256')
      const storedHash = createHash('sha256')
      let encryption: ICheapLfsGhcrEncryptionMetadata | null = null
      let derivedKey: Buffer | null = null
      try {
        const input = source.handle.createReadStream({
          autoClose: false,
          start: offset,
          end: offset + chunkSize - 1,
        })
        const output = createWriteStream(path, {
          flags: 'wx',
          mode: 0o600,
        })
        if (visibility === 'private') {
          if (key === null) {
            throw new CheapLfsGhcrImageError(
              'missing-key',
              'Private Cheap LFS GHCR staging requires a repository key.'
            )
          }
          const salt = entropy(SaltBytes, 'salt', desired.sha256, chunkOrdinal)
          const nonce = entropy(
            NonceBytes,
            'nonce',
            desired.sha256,
            chunkOrdinal
          )
          if (salt.length !== SaltBytes || nonce.length !== NonceBytes) {
            salt.fill(0)
            nonce.fill(0)
            throw new CheapLfsGhcrImageError(
              'invalid-input',
              'Cheap LFS GHCR entropy returned an invalid byte count.'
            )
          }
          const context = encryptionContext(
            repositoryIdentity,
            desired.sha256,
            desired.sizeInBytes,
            chunkOrdinal,
            offset,
            chunkSize
          )
          derivedKey = Buffer.from(
            hkdfSync('sha256', key, salt, context.info, 32)
          )
          const cipher = createCipheriv('aes-256-gcm', derivedKey, nonce, {
            authTagLength: AuthenticationTagBytes,
          })
          cipher.setAAD(context.aad, { plaintextLength: chunkSize })
          await pipeline(
            input,
            hashingTransform(objectHash, report),
            hashingTransform(chunkHash, () => {}),
            cipher,
            hashingTransform(storedHash, () => {}),
            output
          )
          const authenticationTag = cipher.getAuthTag()
          encryption = {
            algorithm: EncryptionAlgorithm,
            keyDerivation: KeyDerivationAlgorithm,
            salt: salt.toString('base64url'),
            nonce: nonce.toString('base64url'),
            authenticationTag: authenticationTag.toString('base64url'),
          }
          salt.fill(0)
          nonce.fill(0)
          authenticationTag.fill(0)
        } else {
          await pipeline(
            input,
            hashingTransform(objectHash, report),
            hashingTransform(chunkHash, () => {}),
            hashingTransform(storedHash, () => {}),
            output
          )
        }
        const stored = await stat(path)
        const blob = descriptor(
          visibility === 'private'
            ? CheapLfsGhcrEncryptedObjectMediaType
            : CheapLfsGhcrPublicObjectMediaType,
          `sha256:${storedHash.digest('hex')}`,
          stored.size
        )
        staged.push({
          path,
          chunk: {
            ordinal: chunkOrdinal,
            offset,
            sizeInBytes: chunkSize,
            plaintextSha256: chunkHash.digest('hex'),
            blob,
            encryption,
          },
        })
      } catch (error) {
        await unlink(path).catch(() => {})
        throw error
      } finally {
        derivedKey?.fill(0)
      }
      offset += chunkSize
      chunkOrdinal++
    }
    abortIfNeeded(signal)
    const after = await source.handle.stat()
    if (
      !sourceIdentity(source.opened, after) ||
      processed !== desired.sizeInBytes
    ) {
      throw new CheapLfsGhcrImageError(
        'unsafe-source',
        'Cheap LFS GHCR refuses a source that changed while reading it.'
      )
    }
    const plaintextDigest = objectHash.digest('hex')
    if (plaintextDigest !== desired.sha256) {
      throw new CheapLfsGhcrImageError(
        'integrity',
        `Cheap LFS GHCR source bytes do not match object ${desired.sha256}.`
      )
    }
    const object: ICheapLfsGhcrObjectRecord = {
      sha256: desired.sha256,
      sizeInBytes: desired.sizeInBytes,
      chunks: staged.map(item => item.chunk),
    }
    return {
      object,
      layers: staged.map(item => ({
        object,
        chunk: item.chunk,
        descriptor: item.chunk.blob,
        localPath: item.path,
        reused: false,
      })),
    }
  } catch (error) {
    await Promise.all(staged.map(item => unlink(item.path).catch(() => {})))
    throw error
  } finally {
    await source.handle.close()
  }
}

function buildImageConfig(
  snapshot: ICheapLfsGhcrSnapshot,
  layers: ReadonlyArray<IOciDescriptor>,
  sourceRepositoryUrl: string
): ICheapLfsGhcrOciImageConfig {
  return {
    architecture: 'unknown',
    os: 'unknown',
    config: {
      Labels: {
        [CheapLfsOciSourceAnnotation]: sourceRepositoryUrl,
      },
    },
    rootfs: {
      type: 'layers',
      // Cheap LFS layers are stored without an additional compression step.
      diff_ids: layers.map(layer => layer.digest),
    },
    [CheapLfsGhcrSnapshotConfigField]: snapshot,
  }
}

function buildManifest(
  config: IOciDescriptor,
  layers: ReadonlyArray<IOciDescriptor>,
  sourceRepositoryUrl: string
) {
  return {
    schemaVersion: 2,
    mediaType: OciImageManifestMediaType,
    artifactType: CheapLfsGhcrArtifactType,
    config,
    layers,
    annotations: {
      [CheapLfsOciSourceAnnotation]: sourceRepositoryUrl,
    },
  }
}

/**
 * Prepare a complete repository snapshot and always erase its temporary files.
 * Add/remove/update are represented solely by the desired full object index.
 */
export async function withPreparedCheapLfsGhcrImage<T>(
  options: IPrepareCheapLfsGhcrImageOptions,
  operation: (image: ICheapLfsGhcrPreparedImage) => Promise<T>
): Promise<T> {
  requireRepositoryIdentity(options.repositoryIdentity)
  const sourceRepositoryUrl = requireSourceRepositoryUrl(
    options.sourceRepositoryUrl
  )
  abortIfNeeded(options.signal)
  const desired = requireDesiredObjects(options.desiredObjects)
  const maximumChunkBytes = requireMaximumChunkBytes(options.maximumChunkBytes)
  const key = requireKey(options.visibility, options.encryptionKey)
  const keyId = key === null ? null : keyIdFor(key)
  const previous =
    options.previousSnapshot === null || options.previousSnapshot === undefined
      ? null
      : validateCheapLfsGhcrSnapshot(
          options.previousSnapshot,
          options.repositoryIdentity,
          options.visibility
        )
  const mayReuse = previous !== null && previous.keyId === keyId
  const previousObjects = new Map(
    (mayReuse ? previous?.objects ?? [] : []).map(object => [
      object.sha256,
      object,
    ])
  )
  requirePredictedLayerCount(desired, previousObjects, maximumChunkBytes)
  const totalBytes = desired.reduce(
    (sum, object) => sum + object.sizeInBytes,
    0
  )
  const entropy: NonNullable<IPrepareCheapLfsGhcrImageOptions['entropy']> =
    options.entropy ??
    ((size: number, _purpose, _objectSha256, _chunkOrdinal) => {
      return randomBytes(size)
    })
  const directory = await mkdtemp(join(tmpdir(), 'desktop-material-ghcr-'))
  let operationError: unknown
  try {
    const layers = new Array<ICheapLfsGhcrPreparedLayer>()
    const objects = new Array<ICheapLfsGhcrObjectRecord>()
    let completedObjects = 0
    let processedBytes = 0
    const emit = (
      phase: CheapLfsGhcrPreparePhase,
      currentObjectSha256: string | null
    ) =>
      options.onProgress?.({
        phase,
        completedObjects,
        totalObjects: desired.length,
        currentObjectSha256,
        processedBytes,
        totalBytes,
      })
    emit('preparing', null)

    for (let index = 0; index < desired.length; index++) {
      abortIfNeeded(options.signal)
      const object = desired[index]
      const reusable = previousObjects.get(object.sha256)
      if (
        reusable !== undefined &&
        reusable.sizeInBytes === object.sizeInBytes
      ) {
        objects.push(reusable)
        layers.push(
          ...reusable.chunks.map(chunk => ({
            object: reusable,
            chunk,
            descriptor: chunk.blob,
            localPath: null,
            reused: true,
          }))
        )
        completedObjects++
        processedBytes += object.sizeInBytes
        emit('verifying', object.sha256)
        continue
      }
      emit(
        options.visibility === 'private' ? 'encrypting' : 'hashing',
        object.sha256
      )
      const staged = await stageObject(
        directory,
        index,
        object,
        options.repositoryIdentity,
        options.visibility,
        key,
        entropy,
        maximumChunkBytes,
        options.signal,
        bytes => {
          processedBytes += bytes
          emit(
            options.visibility === 'private' ? 'encrypting' : 'hashing',
            object.sha256
          )
        }
      )
      objects.push(staged.object)
      layers.push(...staged.layers)
      completedObjects++
      emit('verifying', object.sha256)
    }

    const snapshot: ICheapLfsGhcrSnapshot = {
      format: Format,
      version: FormatVersion,
      repositoryIdentity: options.repositoryIdentity,
      visibility: options.visibility,
      keyId,
      objects,
    }
    validateCheapLfsGhcrSnapshot(
      snapshot,
      options.repositoryIdentity,
      options.visibility
    )
    const layerDescriptors = layers.map(layer => layer.descriptor)
    const configBytes = canonicalBytes(
      buildImageConfig(snapshot, layerDescriptors, sourceRepositoryUrl)
    )
    if (configBytes.byteLength > MaximumJsonBytes) {
      throw new CheapLfsGhcrImageError(
        'invalid-input',
        'Cheap LFS GHCR repository config exceeds its bounded size.'
      )
    }
    const configPath = join(directory, 'config.json')
    await writeFile(configPath, configBytes, { flag: 'wx', mode: 0o600 })
    const configDescriptor = descriptorForBytes(
      CheapLfsGhcrConfigMediaType,
      configBytes
    )
    const manifestBytes = canonicalBytes(
      buildManifest(configDescriptor, layerDescriptors, sourceRepositoryUrl)
    )
    if (manifestBytes.byteLength > MaximumJsonBytes) {
      throw new CheapLfsGhcrImageError(
        'invalid-input',
        'Cheap LFS GHCR OCI manifest exceeds its bounded size.'
      )
    }
    const manifestPath = join(directory, 'manifest.json')
    await writeFile(manifestPath, manifestBytes, { flag: 'wx', mode: 0o600 })
    const manifestDescriptor = descriptorForBytes(
      OciImageManifestMediaType,
      manifestBytes
    )
    emit('verifying', null)
    return await operation({
      directory,
      maximumChunkBytes,
      sourceRepositoryUrl,
      snapshot,
      configPath,
      configDescriptor,
      manifestPath,
      manifestDescriptor,
      layers,
    })
  } catch (error) {
    operationError = error
    throw error
  } finally {
    key?.fill(0)
    try {
      await rm(directory, { recursive: true, force: true })
    } catch (cleanupError) {
      if (operationError === undefined) {
        throw new CheapLfsGhcrImageError(
          'cleanup',
          'Cheap LFS GHCR could not clean its temporary image files.'
        )
      }
      // Preserve the primary failure while making the cleanup issue observable.
      if (operationError instanceof Error) {
        operationError.cause = cleanupError
      }
    }
  }
}

function parseImmutableDigest(reference: string): string {
  const match = /@(?<digest>sha256:[0-9a-f]{64})$/.exec(reference)
  if (match?.groups?.digest === undefined || reference.includes('://')) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR restores require an immutable SHA-256 image reference.'
    )
  }
  return match.groups.digest
}

function validateImageConfig(
  value: unknown,
  expectedRepositoryIdentity: string,
  expectedVisibility: CheapLfsGhcrVisibility
): {
  readonly snapshot: ICheapLfsGhcrSnapshot
  readonly sourceRepositoryUrl: string
  readonly layerDiffIds: ReadonlyArray<string>
} {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'architecture',
      'os',
      'config',
      'rootfs',
      CheapLfsGhcrSnapshotConfigField,
    ]) ||
    value.architecture !== 'unknown' ||
    value.os !== 'unknown' ||
    !isRecord(value.config) ||
    !exactKeys(value.config, ['Labels']) ||
    !isRecord(value.config.Labels) ||
    !exactKeys(value.config.Labels, [CheapLfsOciSourceAnnotation]) ||
    !isRecord(value.rootfs) ||
    !exactKeys(value.rootfs, ['type', 'diff_ids']) ||
    value.rootfs.type !== 'layers' ||
    !Array.isArray(value.rootfs.diff_ids) ||
    value.rootfs.diff_ids.length > MaximumLayers ||
    !value.rootfs.diff_ids.every(isDigest)
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected an invalid OCI image config.'
    )
  }
  return {
    snapshot: validateCheapLfsGhcrSnapshot(
      value[CheapLfsGhcrSnapshotConfigField],
      expectedRepositoryIdentity,
      expectedVisibility
    ),
    sourceRepositoryUrl: requireSourceRepositoryUrl(
      value.config.Labels[CheapLfsOciSourceAnnotation] as string,
      'invalid-image'
    ),
    layerDiffIds: value.rootfs.diff_ids as ReadonlyArray<string>,
  }
}

function validateManifest(value: unknown): {
  readonly config: IOciDescriptor
  readonly layers: ReadonlyArray<IOciDescriptor>
  readonly sourceRepositoryUrl: string
} {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'mediaType',
      'artifactType',
      'config',
      'layers',
      'annotations',
    ]) ||
    value.schemaVersion !== 2 ||
    value.mediaType !== OciImageManifestMediaType ||
    value.artifactType !== CheapLfsGhcrArtifactType ||
    !Array.isArray(value.layers) ||
    value.layers.length > MaximumLayers ||
    !isRecord(value.annotations) ||
    !exactKeys(value.annotations, [CheapLfsOciSourceAnnotation])
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected an invalid OCI image manifest.'
    )
  }
  return {
    config: validateDescriptor(value.config, CheapLfsGhcrConfigMediaType),
    layers: value.layers.map(layer => validateDescriptor(layer)),
    sourceRepositoryUrl: requireSourceRepositoryUrl(
      value.annotations[CheapLfsOciSourceAnnotation] as string,
      'invalid-image'
    ),
  }
}

/** Safely inspect only descriptors before a transport downloads referenced blobs. */
export async function inspectCheapLfsGhcrManifest(
  manifestPath: string
): Promise<{
  readonly config: IOciDescriptor
  readonly layers: ReadonlyArray<IOciDescriptor>
  readonly sourceRepositoryUrl: string
}> {
  return validateManifest(
    await parseCanonicalJson(manifestPath, MaximumJsonBytes)
  )
}

/** Verify every hostile registry byte before exposing a reusable snapshot. */
export async function validateCheapLfsGhcrPulledImage(
  image: ICheapLfsGhcrPulledImage,
  options: IValidateCheapLfsGhcrPulledImageOptions
): Promise<ICheapLfsGhcrValidatedImage> {
  requireRepositoryIdentity(options.expectedRepositoryIdentity)
  const expectedManifestDigest = parseImmutableDigest(image.immutableReference)
  const manifestFile = await hashFile(image.manifestPath)
  if (manifestFile.digest !== expectedManifestDigest) {
    throw new CheapLfsGhcrImageError(
      'integrity',
      'Cheap LFS GHCR manifest bytes do not match the immutable reference.'
    )
  }
  const manifest = validateManifest(
    await parseCanonicalJson(image.manifestPath, MaximumJsonBytes)
  )
  const configFile = await hashFile(image.configPath)
  if (
    configFile.digest !== manifest.config.digest ||
    configFile.size !== manifest.config.size
  ) {
    throw new CheapLfsGhcrImageError(
      'integrity',
      'Cheap LFS GHCR config bytes do not match the OCI descriptor.'
    )
  }
  const config = validateImageConfig(
    await parseCanonicalJson(image.configPath, MaximumJsonBytes),
    options.expectedRepositoryIdentity,
    options.expectedVisibility
  )
  if (config.sourceRepositoryUrl !== manifest.sourceRepositoryUrl) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected inconsistent source repository metadata.'
    )
  }
  const snapshot = config.snapshot
  const expectedLayers = snapshot.objects.flatMap(object =>
    object.chunks.map(chunk => chunk.blob)
  )
  if (
    manifest.layers.length !== expectedLayers.length ||
    config.layerDiffIds.length !== expectedLayers.length
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected an incomplete object layer index.'
    )
  }
  for (let index = 0; index < expectedLayers.length; index++) {
    const expected = expectedLayers[index]
    const actual = manifest.layers[index]
    if (
      expected.mediaType !== actual.mediaType ||
      expected.digest !== actual.digest ||
      expected.size !== actual.size ||
      config.layerDiffIds[index] !== expected.digest
    ) {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR rejected a layer/config object mismatch.'
      )
    }
  }

  let layersToVerify = expectedLayers
  if (options.requiredObject !== undefined) {
    const required = options.requiredObject
    const object = snapshot.objects.find(
      value => value.sha256 === required.sha256
    )
    const objectLayerDigests = object?.chunks.map(chunk => chunk.blob.digest)
    if (
      object === undefined ||
      object.sizeInBytes !== required.sizeInBytes ||
      objectLayerDigests?.length !== required.layerDigests.length ||
      objectLayerDigests.some(
        (digest, index) => digest !== required.layerDigests[index]
      )
    ) {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR rejected a pointer/object index mismatch.'
      )
    }
    layersToVerify = object.chunks.map(chunk => chunk.blob)
  }

  const verifiedPaths = new Map<string, string>()
  for (const layer of layersToVerify) {
    const path = image.blobPaths.get(layer.digest)
    if (path === undefined) {
      throw new CheapLfsGhcrImageError(
        'invalid-image',
        'Cheap LFS GHCR did not receive every required object layer.'
      )
    }
    if (!verifiedPaths.has(layer.digest)) {
      const blob = await hashFile(path)
      if (blob.digest !== layer.digest || blob.size !== layer.size) {
        throw new CheapLfsGhcrImageError(
          'integrity',
          'Cheap LFS GHCR object bytes do not match their OCI descriptor.'
        )
      }
      verifiedPaths.set(layer.digest, path)
    }
  }
  if (
    image.blobPaths.size !== verifiedPaths.size ||
    [...image.blobPaths.keys()].some(digest => !verifiedPaths.has(digest))
  ) {
    throw new CheapLfsGhcrImageError(
      'invalid-image',
      'Cheap LFS GHCR rejected orphan or duplicate object layers.'
    )
  }
  return {
    immutableReference: image.immutableReference,
    sourceRepositoryUrl: manifest.sourceRepositoryUrl,
    snapshot,
    manifestDescriptor: descriptor(
      OciImageManifestMediaType,
      manifestFile.digest,
      manifestFile.size
    ),
    configDescriptor: manifest.config,
    blobPaths: verifiedPaths,
  }
}

export interface IMaterializeCheapLfsGhcrObjectOptions {
  readonly objectSha256: string
  readonly destinationPath: string
  readonly encryptionKey?: Uint8Array | null
  readonly signal?: AbortSignal
  /**
   * When supplied, atomically replace only this exact unchanged tracked
   * pointer after all restored bytes verify. Omit for no-overwrite cache use.
   */
  readonly expectedPointerText?: string
}

async function readExpectedPointerIdentity(
  path: string,
  expectedText: string
): Promise<Stats> {
  const expected = Buffer.from(expectedText, 'utf8')
  if (expected.byteLength === 0 || expected.byteLength > 1024 * 1024) {
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'Cheap LFS rejected an empty or oversized expected pointer.'
    )
  }
  const entry = await lstat(path).catch(() => null)
  if (
    entry === null ||
    entry.isSymbolicLink() ||
    !entry.isFile() ||
    entry.nlink !== 1 ||
    entry.size !== expected.byteLength
  ) {
    throw new CheapLfsGhcrImageError(
      'integrity',
      'The tracked Cheap LFS pointer changed before materialization.'
    )
  }
  const handle = await open(path, constants.O_RDONLY | NoFollowFlag)
  try {
    const opened = await handle.stat()
    const actual = await handle.readFile()
    const after = await lstat(path)
    if (
      !sourceIdentity(entry, opened) ||
      !sourceIdentity(opened, after) ||
      !actual.equals(expected)
    ) {
      throw new CheapLfsGhcrImageError(
        'integrity',
        'The tracked Cheap LFS pointer changed before materialization.'
      )
    }
    return opened
  } finally {
    await handle.close()
  }
}

/**
 * Restore one verified object through a private sibling temp and publish with a
 * no-overwrite hard link only after GCM, byte-count, and SHA-256 verification.
 */
export async function materializeCheapLfsGhcrObject(
  image: ICheapLfsGhcrValidatedImage,
  options: IMaterializeCheapLfsGhcrObjectOptions
): Promise<void> {
  abortIfNeeded(options.signal)
  if (!isObjectSha256(options.objectSha256)) {
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'Cheap LFS GHCR requires a lowercase SHA-256 object identity.'
    )
  }
  const object = image.snapshot.objects.find(
    candidate => candidate.sha256 === options.objectSha256
  )
  if (object === undefined) {
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'The requested object is not part of this repository image.'
    )
  }
  const key = requireKey(image.snapshot.visibility, options.encryptionKey)
  if (key !== null && keyIdFor(key) !== image.snapshot.keyId) {
    key.fill(0)
    throw new CheapLfsGhcrImageError(
      'integrity',
      'The tracked repository key does not match this Cheap LFS image.'
    )
  }
  const requestedDestination = resolve(options.destinationPath)
  const requestedParent = dirname(requestedDestination)
  const parentMetadata = await lstat(requestedParent).catch(() => null)
  if (
    parentMetadata === null ||
    parentMetadata.isSymbolicLink() ||
    !parentMetadata.isDirectory()
  ) {
    key?.fill(0)
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'Cheap LFS GHCR requires a canonical destination directory.'
    )
  }
  const parent = await realpath(requestedParent)
  const canonicalParentMetadata = await lstat(parent)
  if (!canonicalParentMetadata.isDirectory()) {
    key?.fill(0)
    throw new CheapLfsGhcrImageError(
      'invalid-input',
      'Cheap LFS GHCR requires a canonical destination directory.'
    )
  }
  const destination = join(parent, basename(requestedDestination))
  const initialPointerIdentity =
    options.expectedPointerText === undefined
      ? null
      : await readExpectedPointerIdentity(
          destination,
          options.expectedPointerText
        )
  const temporary = join(
    parent,
    `.${basename(destination)}.cheap-lfs-ghcr-${process.pid}-${randomUUID()}`
  )
  let temporaryExists = false
  let temporaryHandle: Awaited<ReturnType<typeof open>> | null = null
  try {
    temporaryHandle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NoFollowFlag,
      0o600
    )
    temporaryExists = true
    const objectHash = createHash('sha256')
    let plaintextBytes = 0
    for (const chunk of object.chunks) {
      abortIfNeeded(options.signal)
      const blobPath = image.blobPaths.get(chunk.blob.digest)
      if (blobPath === undefined) {
        throw new CheapLfsGhcrImageError(
          'invalid-image',
          'The requested Cheap LFS GHCR object chunk is unavailable.'
        )
      }
      const storedHash = createHash('sha256')
      const chunkHash = createHash('sha256')
      let storedBytes = 0
      let chunkBytes = 0
      const input = createReadStream(blobPath)
      const output = fileHandleWritable(temporaryHandle, chunk.offset)
      const objectTransform = hashingTransform(objectHash, bytes => {
        plaintextBytes += bytes
        abortIfNeeded(options.signal)
      })
      const chunkTransform = hashingTransform(chunkHash, bytes => {
        chunkBytes += bytes
      })
      const storedTransform = hashingTransform(storedHash, bytes => {
        storedBytes += bytes
        abortIfNeeded(options.signal)
      })
      let derivedKey: Buffer | null = null
      try {
        if (chunk.encryption === null) {
          await pipeline(
            input,
            storedTransform,
            objectTransform,
            chunkTransform,
            output
          )
        } else {
          if (key === null) {
            throw new CheapLfsGhcrImageError(
              'missing-key',
              'Private Cheap LFS GHCR restore requires the tracked repository key.'
            )
          }
          const salt = decodeFixedBase64url(
            chunk.encryption.salt,
            SaltBytes,
            'salt'
          )
          const nonce = decodeFixedBase64url(
            chunk.encryption.nonce,
            NonceBytes,
            'nonce'
          )
          const tag = decodeFixedBase64url(
            chunk.encryption.authenticationTag,
            AuthenticationTagBytes,
            'authenticationTag'
          )
          const context = encryptionContext(
            image.snapshot.repositoryIdentity,
            object.sha256,
            object.sizeInBytes,
            chunk.ordinal,
            chunk.offset,
            chunk.sizeInBytes
          )
          derivedKey = Buffer.from(
            hkdfSync('sha256', key, salt, context.info, 32)
          )
          const decipher = createDecipheriv('aes-256-gcm', derivedKey, nonce, {
            authTagLength: AuthenticationTagBytes,
          })
          decipher.setAAD(context.aad, {
            plaintextLength: chunk.sizeInBytes,
          })
          decipher.setAuthTag(tag)
          salt.fill(0)
          nonce.fill(0)
          tag.fill(0)
          await pipeline(
            input,
            storedTransform,
            decipher,
            objectTransform,
            chunkTransform,
            output
          )
        }
      } finally {
        derivedKey?.fill(0)
      }
      if (
        `sha256:${storedHash.digest('hex')}` !== chunk.blob.digest ||
        storedBytes !== chunk.blob.size ||
        chunkHash.digest('hex') !== chunk.plaintextSha256 ||
        chunkBytes !== chunk.sizeInBytes
      ) {
        throw new CheapLfsGhcrImageError(
          'integrity',
          'Cheap LFS GHCR restored chunk bytes failed integrity verification.'
        )
      }
    }
    abortIfNeeded(options.signal)
    if (
      objectHash.digest('hex') !== object.sha256 ||
      plaintextBytes !== object.sizeInBytes
    ) {
      throw new CheapLfsGhcrImageError(
        'integrity',
        'Cheap LFS GHCR restored bytes failed integrity verification.'
      )
    }
    await temporaryHandle.sync()
    await temporaryHandle.close()
    temporaryHandle = null
    if (
      options.expectedPointerText !== undefined &&
      initialPointerIdentity !== null
    ) {
      const finalPointerIdentity = await readExpectedPointerIdentity(
        destination,
        options.expectedPointerText
      )
      if (!sourceIdentity(initialPointerIdentity, finalPointerIdentity)) {
        throw new CheapLfsGhcrImageError(
          'integrity',
          'The tracked Cheap LFS pointer changed during materialization.'
        )
      }
      await rename(temporary, destination)
    } else {
      try {
        await link(temporary, destination)
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          String(error.code) === 'EEXIST'
        ) {
          throw new CheapLfsGhcrImageError(
            'destination-exists',
            'Cheap LFS GHCR did not overwrite the existing destination.'
          )
        }
        throw error
      }
      await unlink(temporary)
    }
    temporaryExists = false
  } finally {
    key?.fill(0)
    await temporaryHandle?.close().catch(() => {})
    if (temporaryExists) {
      await unlink(temporary).catch(() => {})
    }
  }
}
