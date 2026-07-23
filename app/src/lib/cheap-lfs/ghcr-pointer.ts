import {
  CheapLfsGhcrMaximumChunksPerObject,
  CheapLfsGhcrMaximumObjectBytes,
  ICheapLfsGhcrValidatedImage,
  materializeCheapLfsGhcrObject,
} from './ghcr-image'

export const CHEAP_LFS_OCI_POINTER_VERSION =
  'https://desktop-material.app/cheap-lfs/oci/v1'
/** Compatibility name retained for the initial GHCR integration seam. */
export const CHEAP_LFS_GHCR_POINTER_VERSION = CHEAP_LFS_OCI_POINTER_VERSION

/** Hard bound for one canonical OCI pointer, including its layer inventory. */
export const CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES = 1024 * 1024
const DigestPattern = 'sha256:[0-9a-f]{64}'
const OciRepositoryPattern =
  '(?:ghcr\\.io|docker\\.io)/[a-z0-9]+(?:[._-][a-z0-9]+)*/[a-z0-9]+(?:[._-][a-z0-9]+)*'

const ImmutableReferenceRegex = new RegExp(
  `^(?<repository>${OciRepositoryPattern})@(?<digest>${DigestPattern})$`
)

export type CheapLfsOciRegistryProvider = 'ghcr' | 'docker-hub'

export interface ICheapLfsGhcrPointer {
  readonly version: typeof CHEAP_LFS_GHCR_POINTER_VERSION
  /** Immutable image reference. Mutable tags are never valid pointer state. */
  readonly image: string
  /** Plaintext object digest. */
  readonly object: string
  readonly sizeInBytes: number
  /** Ordered OCI chunk layer digests carrying the raw/ciphertext object. */
  readonly layers: ReadonlyArray<string>
  /**
   * Exact tracked repository-key identity for a private image. New private
   * pointers always carry this; the optional shape keeps historical five-line
   * pointers readable so their image config can be consulted when necessary.
   */
  readonly keyId?: string
}

export class CheapLfsGhcrPointerError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CheapLfsGhcrPointerError'
  }
}

export function isCheapLfsGhcrImmutableReference(value: string): boolean {
  return ImmutableReferenceRegex.test(value)
}

export function getCheapLfsGhcrRegistryRepository(
  immutableReference: string
): string | null {
  return (
    ImmutableReferenceRegex.exec(immutableReference)?.groups?.repository ?? null
  )
}

export const getCheapLfsOciRegistryRepository =
  getCheapLfsGhcrRegistryRepository

export function getCheapLfsOciRegistryProvider(
  immutableReference: string
): CheapLfsOciRegistryProvider | null {
  const repository = getCheapLfsOciRegistryRepository(immutableReference)
  if (repository?.startsWith('ghcr.io/') === true) {
    return 'ghcr'
  }
  if (repository?.startsWith('docker.io/') === true) {
    return 'docker-hub'
  }
  return null
}

function requireDigest(value: string, label: string): void {
  if (!new RegExp(`^${DigestPattern}$`).test(value)) {
    throw new CheapLfsGhcrPointerError(
      `Cheap LFS GHCR pointer has an invalid ${label} digest.`
    )
  }
}

function requireSize(sizeInBytes: number): void {
  if (
    !Number.isSafeInteger(sizeInBytes) ||
    sizeInBytes < 0 ||
    sizeInBytes <= 0 ||
    sizeInBytes > CheapLfsGhcrMaximumObjectBytes
  ) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS GHCR pointer has an invalid object size.'
    )
  }
}

/** Serialize the canonical OCI pointer, with a private-image key identity. */
export function serializeCheapLfsGhcrPointer(
  pointer: ICheapLfsGhcrPointer
): string {
  if (pointer.version !== CHEAP_LFS_GHCR_POINTER_VERSION) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS GHCR pointer has an unsupported version.'
    )
  }
  if (!isCheapLfsGhcrImmutableReference(pointer.image)) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS OCI pointer requires an immutable ghcr.io or docker.io image digest.'
    )
  }
  requireDigest(pointer.object, 'object')
  requireSize(pointer.sizeInBytes)
  if (
    pointer.layers.length === 0 ||
    pointer.layers.length > CheapLfsGhcrMaximumChunksPerObject
  ) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS GHCR pointer has an invalid chunk layer count.'
    )
  }
  for (const layer of pointer.layers) {
    requireDigest(layer, 'layer')
  }
  if (pointer.keyId !== undefined) {
    requireDigest(pointer.keyId, 'repository key')
  }
  const text = `version ${pointer.version}\nimage ${pointer.image}\nobject ${
    pointer.object
  }\nsize ${pointer.sizeInBytes}\nlayers ${pointer.layers.join(',')}\n${
    pointer.keyId === undefined ? '' : `key-id ${pointer.keyId}\n`
  }`
  if (
    Buffer.byteLength(text, 'utf8') > CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES
  ) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS OCI pointer exceeds its bounded canonical text size.'
    )
  }
  return text
}

/**
 * Parse only the GHCR v1 pointer. The existing Release-backed v1 parser remains
 * independent and compatible because its version header is different.
 */
export function parseCheapLfsGhcrPointer(
  text: string
): ICheapLfsGhcrPointer | null {
  if (
    Buffer.byteLength(text, 'utf8') >
      CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES ||
    !text.startsWith(`version ${CHEAP_LFS_GHCR_POINTER_VERSION}\n`)
  ) {
    return null
  }
  if (text.includes('\r') || text.includes('\0')) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS GHCR pointer is not canonical text.'
    )
  }
  const lines = text.split('\n')
  if (
    (lines.length !== 6 && lines.length !== 7) ||
    lines[lines.length - 1] !== ''
  ) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS OCI pointer must contain five legacy lines or six key-bound canonical lines.'
    )
  }
  const prefixes = [
    'version ',
    'image ',
    'object ',
    'size ',
    'layers ',
    ...(lines.length === 7 ? ['key-id '] : []),
  ]
  if (
    lines
      .slice(0, prefixes.length)
      .some((line, index) => !line.startsWith(prefixes[index]))
  ) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS GHCR pointer fields are missing or out of order.'
    )
  }
  const version = lines[0].slice(prefixes[0].length)
  const image = lines[1].slice(prefixes[1].length)
  const object = lines[2].slice(prefixes[2].length)
  const sizeText = lines[3].slice(prefixes[3].length)
  const layers = lines[4].slice(prefixes[4].length).split(',')
  const keyId =
    lines.length === 7 ? lines[5].slice('key-id '.length) : undefined
  if (version !== CHEAP_LFS_GHCR_POINTER_VERSION) {
    return null
  }
  if (!/^(0|[1-9][0-9]*)$/.test(sizeText)) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS GHCR pointer has a non-canonical object size.'
    )
  }
  const pointer: ICheapLfsGhcrPointer = {
    version: CHEAP_LFS_GHCR_POINTER_VERSION,
    image,
    object,
    sizeInBytes: Number(sizeText),
    layers,
    ...(keyId === undefined ? {} : { keyId }),
  }
  const canonical = serializeCheapLfsGhcrPointer(pointer)
  if (canonical !== text) {
    throw new CheapLfsGhcrPointerError(
      'Cheap LFS GHCR pointer is not canonical text.'
    )
  }
  return pointer
}

export function isCheapLfsGhcrPointerText(text: string): boolean {
  try {
    return parseCheapLfsGhcrPointer(text) !== null
  } catch {
    return false
  }
}

/**
 * Cheap prefix-only classifier used before reading a complete bounded pointer.
 * Parsing remains separate because a valid OCI pointer can be much larger than
 * a filesystem sniff buffer when timeout splitting creates many layers.
 */
export function isCheapLfsGhcrPointerHeader(text: string): boolean {
  if (typeof text !== 'string') {
    return false
  }
  const prefix = text.slice(0, 256)
  if (prefix.includes('\u0000')) {
    return false
  }
  const firstLine = (
    prefix.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  ).trim()
  return firstLine === `version ${CHEAP_LFS_OCI_POINTER_VERSION}`
}

export interface ICheapLfsGhcrPointerCandidate {
  readonly relativePath: string
  readonly text: string
}

export interface ICheapLfsGhcrPointerEntry {
  readonly relativePath: string
  readonly pointer: ICheapLfsGhcrPointer
}

/** Parse a bounded caller-provided scan without coupling to the Release walker. */
export function listCheapLfsGhcrPointers(
  candidates: ReadonlyArray<ICheapLfsGhcrPointerCandidate>,
  maximumEntries: number = 4096
): ReadonlyArray<ICheapLfsGhcrPointerEntry> {
  const boundedMaximum = Math.max(0, Math.min(4096, Math.floor(maximumEntries)))
  const entries = new Array<ICheapLfsGhcrPointerEntry>()
  for (const candidate of candidates) {
    if (entries.length >= boundedMaximum) {
      break
    }
    const pointer = parseCheapLfsGhcrPointer(candidate.text)
    if (pointer !== null) {
      entries.push({ relativePath: candidate.relativePath, pointer })
    }
  }
  return entries
}

export interface IMaterializeCheapLfsOciPointerOptions {
  readonly pointerText: string
  readonly destinationPath: string
  readonly encryptionKey?: Uint8Array | null
  readonly signal?: AbortSignal
}

/**
 * Replace a tracked pointer only after exact immutable identity, layer order,
 * decryption, size, and SHA verification. The same-directory final rename is
 * atomic on supported Windows filesystems; the pointer is never pre-unlinked.
 */
export async function materializeCheapLfsOciPointer(
  image: ICheapLfsGhcrValidatedImage,
  options: IMaterializeCheapLfsOciPointerOptions
): Promise<void> {
  const pointer = parseCheapLfsGhcrPointer(options.pointerText)
  if (pointer === null || pointer.image !== image.immutableReference) {
    throw new CheapLfsGhcrPointerError(
      'The tracked Cheap LFS pointer does not name the validated immutable image.'
    )
  }
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
    throw new CheapLfsGhcrPointerError(
      'The tracked Cheap LFS pointer does not match the validated object index.'
    )
  }
  await materializeCheapLfsGhcrObject(image, {
    objectSha256: sha256,
    destinationPath: options.destinationPath,
    encryptionKey: options.encryptionKey,
    signal: options.signal,
    expectedPointerText: options.pointerText,
  })
}
