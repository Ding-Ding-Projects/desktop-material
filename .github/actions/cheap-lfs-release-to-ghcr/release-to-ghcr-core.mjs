import {
  createCipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

export const RELEASE_POINTER_VERSION = 'desktop-material/cheap-lfs/v1'
export const OCI_POINTER_VERSION =
  'https://desktop-material.app/cheap-lfs/oci/v1'
export const RELEASE_BODY_SENTINEL =
  '<!-- desktop-material:cheap-lfs-release-bucket:v1 -->'
export const LEGACY_ASSET_LABEL =
  /^cheap-lfs\/v1 sha256=[a-f0-9]{64} commit=(?:-|[a-f0-9]{7,64}) path=.+$/

export const OCI_ARTIFACT_TYPE =
  'application/vnd.desktop-material.cheap-lfs.repository.v1'
export const OCI_CONFIG_MEDIA_TYPE =
  'application/vnd.oci.image.config.v1+json'
export const OCI_MANIFEST_MEDIA_TYPE =
  'application/vnd.oci.image.manifest.v1+json'
export const PUBLIC_OBJECT_MEDIA_TYPE =
  'application/vnd.desktop-material.cheap-lfs.object.v1'
export const PRIVATE_OBJECT_MEDIA_TYPE =
  'application/vnd.desktop-material.cheap-lfs.object.encrypted.v1'
export const OCI_SOURCE_ANNOTATION = 'org.opencontainers.image.source'
export const SNAPSHOT_CONFIG_FIELD = 'desktopMaterialCheapLfs'
export const OCI_REPOSITORY_TAG = 'desktop-material-cheap-lfs-v1'
export const OCI_RETENTION_TAG_PREFIX =
  'desktop-material-cheap-lfs-sha256-'

export const MAX_RELEASE_POINTER_BYTES = 512 * 1024
export const MAX_OCI_POINTER_BYTES = 1024 * 1024
export const MAX_POINTER_BLOB_BYTES =
  Math.max(MAX_RELEASE_POINTER_BYTES, MAX_OCI_POINTER_BYTES) + 1
export const MAX_OBJECTS = 4096
export const MAX_LAYERS = 8192
export const MAX_JSON_BYTES = 8 * 1024 * 1024
export const MAX_CHUNK_BYTES = Math.floor(1.5 * 1024 * 1024 * 1024)
export const MAX_CHUNKS_PER_OBJECT = 8192
export const MAX_OBJECT_BYTES = MAX_CHUNK_BYTES * MAX_CHUNKS_PER_OBJECT
export const MAX_ASSET_NAME_BYTES = 255
export const MAX_RELEASE_ASSET_BYTES = 2 * 1024 * 1024 * 1024
export const MAX_IMAGE_REFERENCES = 64

const EncryptionAlgorithm = 'AES-256-GCM'
const KeyDerivationAlgorithm = 'HKDF-SHA256'
const KeyBytes = 32
const SaltBytes = 32
const NonceBytes = 12
const AuthenticationTagBytes = 16
const DigestPattern = /^sha256:[0-9a-f]{64}$/
const ShaPattern = /^[a-f0-9]{64}$/
const IntegerPattern = /^(?:0|[1-9][0-9]*)$/
const OciRepositoryPattern =
  /^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/

export class CheapLfsReleaseToGhcrError extends Error {
  constructor(kind, message) {
    super(message)
    this.name = 'CheapLfsReleaseToGhcrError'
    this.kind = kind
  }
}

function fail(kind, message) {
  throw new CheapLfsReleaseToGhcrError(kind, message)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function digestFor(value) {
  return `sha256:${sha256(value)}`
}

export function canonicalJson(value) {
  const result = Buffer.from(JSON.stringify(value), 'utf8')
  if (result.byteLength > MAX_JSON_BYTES) {
    fail('oversized-metadata', 'Cheap LFS GHCR metadata exceeds 8 MiB.')
  }
  return result
}

function safeInteger(value, minimum, maximum) {
  return (
    Number.isSafeInteger(value) && value >= minimum && value <= maximum
  )
}

function exactKeys(value, keys) {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return false
  }
  const actual = Object.keys(value)
  return (
    actual.length === keys.length &&
    keys.every((key, index) => actual[index] === key)
  )
}

function safePointerName(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !/[\u0000-\u001f]/.test(value) &&
    Buffer.byteLength(value, 'utf8') <= MAX_ASSET_NAME_BYTES
  )
}

/**
 * Parse a Release-backed pointer without accepting encrypted payloads.
 * Password-backed Release ciphertext cannot be converted in unattended
 * Actions because the password is deliberately not persisted in Git.
 */
export function parseReleasePointer(text) {
  if (
    typeof text !== 'string' ||
    Buffer.byteLength(text, 'utf8') > MAX_RELEASE_POINTER_BYTES ||
    text.includes('\0')
  ) {
    return null
  }
  const lines = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
  if (lines[0] !== `version ${RELEASE_POINTER_VERSION}`) {
    return null
  }

  const fields = new Map()
  const parts = []
  let encrypted = false
  for (const line of lines) {
    if (line.startsWith('part-encrypted ') || line.startsWith('encryption ')) {
      encrypted = true
      continue
    }
    let match = /^part ([a-f0-9]{64}) (0|[1-9][0-9]*) (.+)$/.exec(line)
    if (match !== null) {
      parts.push({
        sha256: match[1],
        sizeInBytes: Number(match[2]),
        storedSizeInBytes: Number(match[2]),
        name: match[3],
        compression: 'none',
      })
      continue
    }
    match =
      /^part-deflate ([a-f0-9]{64}) (0|[1-9][0-9]*) (0|[1-9][0-9]*) (.+)$/.exec(
        line
      )
    if (match !== null) {
      parts.push({
        sha256: match[1],
        sizeInBytes: Number(match[2]),
        storedSizeInBytes: Number(match[3]),
        name: match[4],
        compression: 'deflate-raw',
      })
      continue
    }
    const separator = line.indexOf(' ')
    if (separator <= 0) {
      fail('invalid-pointer', 'Cheap LFS found a malformed Release pointer.')
    }
    const key = line.slice(0, separator)
    if (fields.has(key)) {
      fail(
        'invalid-pointer',
        'Cheap LFS found a Release pointer with duplicate fields.'
      )
    }
    fields.set(key, line.slice(separator + 1))
  }

  if (encrypted) {
    fail(
      'encrypted-release-pointer',
      'Release-to-GHCR conversion cannot read password-encrypted Release pointers in unattended Actions. Materialize and repin those files to GHCR from Desktop Material instead.'
    )
  }
  if (
    fields.size !== 5 ||
    fields.get('version') !== RELEASE_POINTER_VERSION
  ) {
    fail('invalid-pointer', 'Cheap LFS found a malformed Release pointer.')
  }
  const releaseTag = fields.get('release-tag')
  const assetName = fields.get('asset-name')
  const sizeInBytesText = fields.get('size')
  const objectSha256 = fields.get('sha256')
  if (
    typeof releaseTag !== 'string' ||
    releaseTag.length === 0 ||
    /\s/.test(releaseTag) ||
    !safePointerName(assetName) ||
    !IntegerPattern.test(sizeInBytesText ?? '') ||
    !ShaPattern.test(objectSha256 ?? '')
  ) {
    fail('invalid-pointer', 'Cheap LFS found a malformed Release pointer.')
  }
  const sizeInBytes = Number(sizeInBytesText)
  if (!safeInteger(sizeInBytes, 1, MAX_OBJECT_BYTES)) {
    fail(
      'invalid-pointer',
      'Cheap LFS found an empty or oversized Release object.'
    )
  }

  const normalizedParts =
    parts.length === 0
      ? [
          {
            sha256: objectSha256,
            sizeInBytes,
            storedSizeInBytes: sizeInBytes,
            name: assetName,
            compression: 'none',
          },
        ]
      : parts
  let total = 0
  for (const part of normalizedParts) {
    if (
      !safePointerName(part.name) ||
      !safeInteger(part.sizeInBytes, 1, MAX_RELEASE_ASSET_BYTES - 1) ||
      !safeInteger(part.storedSizeInBytes, 1, MAX_RELEASE_ASSET_BYTES - 1) ||
      (part.compression === 'deflate-raw' &&
        part.storedSizeInBytes >= part.sizeInBytes)
    ) {
      fail('invalid-pointer', 'Cheap LFS found an invalid Release part.')
    }
    total += part.sizeInBytes
    if (!Number.isSafeInteger(total) || total > MAX_OBJECT_BYTES) {
      fail('invalid-pointer', 'Cheap LFS found an oversized Release object.')
    }
  }
  if (total !== sizeInBytes) {
    fail(
      'invalid-pointer',
      'Cheap LFS Release parts do not cover their object exactly.'
    )
  }
  return {
    releaseTag,
    assetName,
    sizeInBytes,
    sha256: objectSha256,
    parts: normalizedParts,
  }
}

export function parseOciPointer(text) {
  if (
    typeof text !== 'string' ||
    Buffer.byteLength(text, 'utf8') > MAX_OCI_POINTER_BYTES ||
    !text.startsWith(`version ${OCI_POINTER_VERSION}\n`)
  ) {
    return null
  }
  if (text.includes('\r') || text.includes('\0')) {
    fail('invalid-pointer', 'Cheap LFS found a non-canonical OCI pointer.')
  }
  const lines = text.split('\n')
  if (
    (lines.length !== 6 && lines.length !== 7) ||
    lines.at(-1) !== ''
  ) {
    fail('invalid-pointer', 'Cheap LFS found a malformed OCI pointer.')
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
    fail('invalid-pointer', 'Cheap LFS found a malformed OCI pointer.')
  }
  const image = lines[1].slice('image '.length)
  const object = lines[2].slice('object '.length)
  const sizeText = lines[3].slice('size '.length)
  const layers = lines[4].slice('layers '.length).split(',')
  const keyId =
    lines.length === 7 ? lines[5].slice('key-id '.length) : undefined
  if (
    !/^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/.test(
      image
    ) ||
    !DigestPattern.test(object) ||
    !IntegerPattern.test(sizeText) ||
    !safeInteger(Number(sizeText), 1, MAX_OBJECT_BYTES) ||
    layers.length === 0 ||
    layers.length > MAX_CHUNKS_PER_OBJECT ||
    layers.some(layer => !DigestPattern.test(layer)) ||
    (keyId !== undefined && !DigestPattern.test(keyId))
  ) {
    fail('invalid-pointer', 'Cheap LFS found an invalid OCI pointer.')
  }
  const pointer = {
    image,
    object,
    sizeInBytes: Number(sizeText),
    layers,
    ...(keyId === undefined ? {} : { keyId }),
  }
  if (serializeOciPointer(pointer) !== text) {
    fail('invalid-pointer', 'Cheap LFS found a non-canonical OCI pointer.')
  }
  return pointer
}

export function serializeOciPointer(pointer) {
  if (
    !/^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/.test(
      pointer.image
    ) ||
    !DigestPattern.test(pointer.object) ||
    !safeInteger(pointer.sizeInBytes, 1, MAX_OBJECT_BYTES) ||
    !Array.isArray(pointer.layers) ||
    pointer.layers.length === 0 ||
    pointer.layers.length > MAX_CHUNKS_PER_OBJECT ||
    pointer.layers.some(layer => !DigestPattern.test(layer)) ||
    (pointer.keyId !== undefined && !DigestPattern.test(pointer.keyId))
  ) {
    fail('invalid-pointer', 'Cheap LFS cannot serialize an invalid OCI pointer.')
  }
  return (
    `version ${OCI_POINTER_VERSION}\n` +
    `image ${pointer.image}\n` +
    `object ${pointer.object}\n` +
    `size ${pointer.sizeInBytes}\n` +
    `layers ${pointer.layers.join(',')}\n` +
    (pointer.keyId === undefined ? '' : `key-id ${pointer.keyId}\n`)
  )
}

/**
 * Runtime visibility policy. A `true` conversion setting is not private
 * consent: private Actions run only when the separate confirmation is true.
 */
export function resolveConversionVisibility(isPrivate, privateConfirmed) {
  if (isPrivate === false) {
    return 'public'
  }
  if (isPrivate === true) {
    if (privateConfirmed === true) {
      return 'private'
    }
    fail(
      'private-actions-unconfirmed',
      'Cheap LFS Release-to-GHCR conversion is blocked because this repository is private and its separate in-repository Actions confirmation is not enabled.'
    )
  }
  fail(
    'visibility-unknown',
    'Cheap LFS Release-to-GHCR conversion is blocked until GitHub confirms whether this repository is public or private.'
  )
}

/**
 * Decide whether package policy permits pointer adoption. GHCR creates the
 * first package as private even for a public source repository; that state is
 * intentionally actionable rather than silently changed by an unsupported API.
 */
export function requirePackagePolicy({
  sourceVisibility,
  packageVisibility,
  repositoryIdentity,
  linkedRepositoryIdentity,
}) {
  if (sourceVisibility === 'public' && packageVisibility === 'private') {
    fail(
      'public-package-private',
      'GHCR created the first Cheap LFS package as private. No pointers were changed. Open the package settings, make the package public, then rerun this workflow.'
    )
  }
  if (repositoryIdentity !== linkedRepositoryIdentity) {
    fail(
      'package-policy',
      'GHCR did not link the Cheap LFS package to this exact source repository. No pointers were changed.'
    )
  }
  if (packageVisibility !== sourceVisibility) {
    fail(
      'package-policy',
      'The GHCR package visibility does not match the source repository. No pointers were changed.'
    )
  }
  return true
}

export function deriveTarget(repository) {
  const owner = repository?.owner?.login
  const name = repository?.name
  const id = repository?.id
  if (
    typeof owner !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) ||
    typeof name !== 'string' ||
    name.length < 1 ||
    name.length > 100 ||
    !/^[A-Za-z0-9._-]+$/.test(name) ||
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    fail(
      'repository-identity',
      'Cheap LFS could not derive a canonical GHCR target from GitHub metadata.'
    )
  }
  const namespace = owner.toLowerCase()
  const repositoryName = name.toLowerCase()
  const registryRepository = `ghcr.io/${namespace}/${repositoryName}-cheap-lfs`
  if (!OciRepositoryPattern.test(registryRepository)) {
    fail(
      'repository-identity',
      'Cheap LFS could not derive a canonical GHCR repository name.'
    )
  }
  return {
    repositoryIdentity: `github.com/repositories/${id}`,
    sourceRepositoryUrl: `https://github.com/${namespace}/${repositoryName}`,
    registryRepository,
    registryPath: `${namespace}/${repositoryName}-cheap-lfs`,
    packageName: `${repositoryName}-cheap-lfs`,
  }
}

export function parseRepositoryKey(text, expectedHeader) {
  if (
    typeof text !== 'string' ||
    Buffer.byteLength(text, 'utf8') > 256
  ) {
    fail('invalid-key', 'The tracked Cheap LFS repository key is invalid.')
  }
  const lines = text.split('\n')
  if (
    lines.length !== 3 ||
    lines[0] !== expectedHeader ||
    !/^[A-Za-z0-9_-]{43}$/.test(lines[1]) ||
    lines[2] !== ''
  ) {
    fail('invalid-key', 'The tracked Cheap LFS repository key is invalid.')
  }
  const key = Buffer.from(lines[1], 'base64url')
  if (key.length !== KeyBytes || key.toString('base64url') !== lines[1]) {
    key.fill(0)
    fail('invalid-key', 'The tracked Cheap LFS repository key is invalid.')
  }
  return key
}

export function serializeRepositoryKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KeyBytes) {
    fail('invalid-key', 'Cheap LFS requires an exact 256-bit repository key.')
  }
  return `desktop-material-cheap-lfs-registry-key-v1\n${key.toString(
    'base64url'
  )}\n`
}

export function newRepositoryKey() {
  return randomBytes(KeyBytes)
}

export function repositoryKeyId(key) {
  if (!Buffer.isBuffer(key) || key.length !== KeyBytes) {
    fail('invalid-key', 'Cheap LFS requires an exact 256-bit repository key.')
  }
  return `sha256:${sha256(key)}`
}

function lengthPrefixed(parts) {
  const encoded = []
  for (const part of parts) {
    const length = Buffer.allocUnsafe(4)
    length.writeUInt32BE(part.byteLength)
    encoded.push(length, part)
  }
  return Buffer.concat(encoded)
}

function encryptionContext(
  repositoryIdentity,
  objectSha256,
  objectSize,
  ordinal,
  offset,
  chunkSize
) {
  const size = Buffer.allocUnsafe(8)
  size.writeBigUInt64BE(BigInt(objectSize))
  const ordinalBytes = Buffer.allocUnsafe(4)
  ordinalBytes.writeUInt32BE(ordinal)
  const offsetBytes = Buffer.allocUnsafe(8)
  offsetBytes.writeBigUInt64BE(BigInt(offset))
  const chunkSizeBytes = Buffer.allocUnsafe(8)
  chunkSizeBytes.writeBigUInt64BE(BigInt(chunkSize))
  const fields = [
    Buffer.from('desktop-material-cheap-lfs-ghcr-v1', 'utf8'),
    Buffer.from(repositoryIdentity, 'utf8'),
    Buffer.from(objectSha256, 'ascii'),
    size,
    ordinalBytes,
    offsetBytes,
    chunkSizeBytes,
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

export async function encryptChunk({
  sourcePath,
  destinationPath,
  repositoryIdentity,
  objectSha256,
  objectSize,
  ordinal,
  offset,
  chunkSize,
  repositoryKey,
}) {
  const salt = randomBytes(SaltBytes)
  const nonce = randomBytes(NonceBytes)
  const context = encryptionContext(
    repositoryIdentity,
    objectSha256,
    objectSize,
    ordinal,
    offset,
    chunkSize
  )
  const derivedKey = Buffer.from(
    hkdfSync('sha256', repositoryKey, salt, context.info, KeyBytes)
  )
  try {
    const cipher = createCipheriv('aes-256-gcm', derivedKey, nonce, {
      authTagLength: AuthenticationTagBytes,
    })
    cipher.setAAD(context.aad, { plaintextLength: chunkSize })
    await pipeline(
      createReadStream(sourcePath),
      cipher,
      createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 })
    )
    const metadata = await stat(destinationPath)
    if (metadata.size !== chunkSize) {
      fail('integrity', 'Cheap LFS could not stage an encrypted OCI chunk.')
    }
    const authenticationTag = cipher.getAuthTag()
    const result = {
      algorithm: EncryptionAlgorithm,
      keyDerivation: KeyDerivationAlgorithm,
      salt: salt.toString('base64url'),
      nonce: nonce.toString('base64url'),
      authenticationTag: authenticationTag.toString('base64url'),
    }
    authenticationTag.fill(0)
    return result
  } catch (error) {
    await unlink(destinationPath).catch(() => {})
    throw error
  } finally {
    salt.fill(0)
    nonce.fill(0)
    derivedKey.fill(0)
  }
}

export function validateSnapshot(
  value,
  repositoryIdentity,
  visibility
) {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'repositoryIdentity',
      'visibility',
      'keyId',
      'objects',
    ]) ||
    value.format !== 'desktop-material-cheap-lfs-ghcr' ||
    value.version !== 1 ||
    value.repositoryIdentity !== repositoryIdentity ||
    value.visibility !== visibility ||
    (visibility === 'public'
      ? value.keyId !== null
      : !DigestPattern.test(value.keyId)) ||
    !Array.isArray(value.objects) ||
    value.objects.length > MAX_OBJECTS
  ) {
    fail(
      'invalid-image',
      'Cheap LFS rejected GHCR metadata for another repository or policy.'
    )
  }
  let previousSha = ''
  let totalLayers = 0
  const objects = []
  for (const object of value.objects) {
    if (
      !exactKeys(object, ['sha256', 'sizeInBytes', 'chunks']) ||
      !ShaPattern.test(object.sha256) ||
      object.sha256 <= previousSha ||
      !safeInteger(object.sizeInBytes, 1, MAX_OBJECT_BYTES) ||
      !Array.isArray(object.chunks) ||
      object.chunks.length === 0 ||
      object.chunks.length > MAX_CHUNKS_PER_OBJECT
    ) {
      fail('invalid-image', 'Cheap LFS rejected an invalid GHCR object index.')
    }
    previousSha = object.sha256
    let expectedOffset = 0
    const chunks = []
    for (let ordinal = 0; ordinal < object.chunks.length; ordinal++) {
      const chunk = object.chunks[ordinal]
      if (
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
        !safeInteger(chunk.sizeInBytes, 1, MAX_CHUNK_BYTES) ||
        !ShaPattern.test(chunk.plaintextSha256) ||
        !exactKeys(chunk.blob, ['mediaType', 'digest', 'size']) ||
        chunk.blob.mediaType !==
          (visibility === 'private'
            ? PRIVATE_OBJECT_MEDIA_TYPE
            : PUBLIC_OBJECT_MEDIA_TYPE) ||
        !DigestPattern.test(chunk.blob.digest) ||
        chunk.blob.size !== chunk.sizeInBytes ||
        (visibility === 'public'
          ? chunk.encryption !== null
          : !validEncryption(chunk.encryption))
      ) {
        fail('invalid-image', 'Cheap LFS rejected an invalid GHCR chunk index.')
      }
      expectedOffset += chunk.sizeInBytes
      chunks.push(chunk)
    }
    if (expectedOffset !== object.sizeInBytes) {
      fail(
        'invalid-image',
        'Cheap LFS rejected GHCR chunks that do not cover an object exactly.'
      )
    }
    totalLayers += chunks.length
    if (totalLayers > MAX_LAYERS) {
      fail('invalid-image', 'Cheap LFS rejected an oversized GHCR layer index.')
    }
    objects.push({
      sha256: object.sha256,
      sizeInBytes: object.sizeInBytes,
      chunks,
    })
  }
  return {
    format: 'desktop-material-cheap-lfs-ghcr',
    version: 1,
    repositoryIdentity,
    visibility,
    keyId: value.keyId,
    objects,
  }
}

function canonicalBase64url(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return false
  }
  const decoded = Buffer.from(value, 'base64url')
  const valid =
    decoded.length === length && decoded.toString('base64url') === value
  decoded.fill(0)
  return valid
}

function validEncryption(value) {
  return (
    exactKeys(value, [
      'algorithm',
      'keyDerivation',
      'salt',
      'nonce',
      'authenticationTag',
    ]) &&
    value.algorithm === EncryptionAlgorithm &&
    value.keyDerivation === KeyDerivationAlgorithm &&
    canonicalBase64url(value.salt, SaltBytes) &&
    canonicalBase64url(value.nonce, NonceBytes) &&
    canonicalBase64url(value.authenticationTag, AuthenticationTagBytes)
  )
}

export function buildImage({
  repositoryIdentity,
  sourceRepositoryUrl,
  visibility,
  keyId,
  objects,
}) {
  const snapshot = validateSnapshot(
    {
      format: 'desktop-material-cheap-lfs-ghcr',
      version: 1,
      repositoryIdentity,
      visibility,
      keyId,
      objects: [...objects].sort((left, right) =>
        left.sha256.localeCompare(right.sha256)
      ),
    },
    repositoryIdentity,
    visibility
  )
  const layers = snapshot.objects.flatMap(object =>
    object.chunks.map(chunk => chunk.blob)
  )
  const configBytes = canonicalJson({
    architecture: 'unknown',
    os: 'unknown',
    config: {
      Labels: {
        [OCI_SOURCE_ANNOTATION]: sourceRepositoryUrl,
      },
    },
    rootfs: {
      type: 'layers',
      diff_ids: layers.map(layer => layer.digest),
    },
    [SNAPSHOT_CONFIG_FIELD]: snapshot,
  })
  const configDescriptor = {
    mediaType: OCI_CONFIG_MEDIA_TYPE,
    digest: digestFor(configBytes),
    size: configBytes.byteLength,
  }
  const manifestBytes = canonicalJson({
    schemaVersion: 2,
    mediaType: OCI_MANIFEST_MEDIA_TYPE,
    artifactType: OCI_ARTIFACT_TYPE,
    config: configDescriptor,
    layers,
    annotations: {
      [OCI_SOURCE_ANNOTATION]: sourceRepositoryUrl,
    },
  })
  return {
    snapshot,
    configBytes,
    configDescriptor,
    manifestBytes,
    manifestDigest: digestFor(manifestBytes),
  }
}

export function requireManagedRelease(release, assets, expectedTag) {
  const legacyProvenance = assets.some(
    asset =>
      typeof asset?.label === 'string' &&
      LEGACY_ASSET_LABEL.test(asset.label)
  )
  if (
    release?.tag_name !== expectedTag ||
    release?.draft === true ||
    release?.prerelease !== true ||
    (release?.body !== RELEASE_BODY_SENTINEL && !legacyProvenance)
  ) {
    fail(
      'unowned-release',
      'Cheap LFS Release-to-GHCR conversion refused a draft, stable, renamed, or unowned Release.'
    )
  }
}
