import { createCipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
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
export const OCI_CONFIG_MEDIA_TYPE = 'application/vnd.oci.image.config.v1+json'
export const OCI_MANIFEST_MEDIA_TYPE =
  'application/vnd.oci.image.manifest.v1+json'
export const PUBLIC_OBJECT_MEDIA_TYPE =
  'application/vnd.desktop-material.cheap-lfs.object.v1'
export const PRIVATE_OBJECT_MEDIA_TYPE =
  'application/vnd.desktop-material.cheap-lfs.object.encrypted.v1'
export const OCI_SOURCE_ANNOTATION = 'org.opencontainers.image.source'
export const SNAPSHOT_CONFIG_FIELD = 'desktopMaterialCheapLfs'
export const OCI_REPOSITORY_TAG = 'desktop-material-cheap-lfs-v1'
export const OCI_RETENTION_TAG_PREFIX = 'desktop-material-cheap-lfs-sha256-'
export const ADOPTION_RECEIPT_PREFIX = 'Cheap-LFS-GHCR-Receipt: '

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
export const MAX_ADOPTION_POINTERS = 1_000_000

const EncryptionAlgorithm = 'AES-256-GCM'
const KeyDerivationAlgorithm = 'HKDF-SHA256'
const KeyBytes = 32
const SaltBytes = 32
const NonceBytes = 12
const AuthenticationTagBytes = 16
const DigestPattern = /^sha256:[0-9a-f]{64}$/
const GitObjectPattern = /^[a-f0-9]{40,64}$/
const ShaPattern = /^[a-f0-9]{64}$/
const IntegerPattern = /^(?:0|[1-9][0-9]*)$/
const OciRepositoryPattern =
  /^(?:ghcr\.io|docker\.io)\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const GhcrRepositoryPattern =
  /^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const AdoptionReceiptPattern =
  /^v1 manifest=(sha256:[0-9a-f]{64}) parent=([a-f0-9]{40,64}) visibility=(public|private) pointers=([1-9][0-9]{0,6})$/

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

/**
 * Record enough immutable state in the adoption commit to safely finish a
 * canonical-tag promotion after a process crash. The receipt is only a
 * locator: repair still revalidates the exact Git diff, OCI image, package
 * policy, visibility, and remote default head before changing the tag.
 */
export function serializeAdoptionReceipt({
  manifestDigest,
  parentCommit,
  visibility,
  pointerCount,
}) {
  if (
    !DigestPattern.test(manifestDigest) ||
    !GitObjectPattern.test(parentCommit) ||
    (visibility !== 'public' && visibility !== 'private') ||
    !safeInteger(pointerCount, 1, MAX_ADOPTION_POINTERS)
  ) {
    fail(
      'invalid-adoption-receipt',
      'Cheap LFS could not serialize an invalid GHCR adoption receipt.'
    )
  }
  return (
    ADOPTION_RECEIPT_PREFIX +
    `v1 manifest=${manifestDigest} parent=${parentCommit} ` +
    `visibility=${visibility} pointers=${pointerCount}`
  )
}

export function parseAdoptionReceipt(message) {
  if (
    typeof message !== 'string' ||
    Buffer.byteLength(message, 'utf8') > 64 * 1024
  ) {
    fail(
      'invalid-adoption-receipt',
      'Cheap LFS found an oversized GHCR adoption commit message.'
    )
  }
  const receiptLines = message
    .split(/\r?\n/)
    .filter(line => line.startsWith(ADOPTION_RECEIPT_PREFIX))
  if (receiptLines.length === 0) {
    return null
  }
  if (receiptLines.length !== 1) {
    fail(
      'invalid-adoption-receipt',
      'Cheap LFS found duplicate GHCR adoption receipts.'
    )
  }
  const match = AdoptionReceiptPattern.exec(
    receiptLines[0].slice(ADOPTION_RECEIPT_PREFIX.length)
  )
  if (match === null) {
    fail(
      'invalid-adoption-receipt',
      'Cheap LFS found a malformed GHCR adoption receipt.'
    )
  }
  const pointerCount = Number(match[4])
  if (!safeInteger(pointerCount, 1, MAX_ADOPTION_POINTERS)) {
    fail(
      'invalid-adoption-receipt',
      'Cheap LFS found an invalid GHCR adoption pointer count.'
    )
  }
  return {
    manifestDigest: match[1],
    parentCommit: match[2],
    visibility: match[3],
    pointerCount,
  }
}

/**
 * Prove that HEAD is precisely a managed Release-pointer adoption before a
 * crash-repair path is allowed to promote the mutable canonical tag.
 * Registry contents are deliberately verified by the runtime separately.
 */
export function requireRepairableAdoption({
  receipt,
  headCommit,
  parentCommit,
  changedPaths,
  allowedAuxiliaryPaths = [],
  parentReleasePointers,
  currentReleasePointers,
  currentOciPointers,
  registryRepository,
  visibility,
}) {
  if (
    receipt === null ||
    typeof receipt !== 'object' ||
    !DigestPattern.test(receipt.manifestDigest) ||
    !safeInteger(receipt.pointerCount, 1, MAX_ADOPTION_POINTERS) ||
    receipt.parentCommit !== parentCommit ||
    receipt.visibility !== visibility ||
    !GitObjectPattern.test(headCommit) ||
    !GitObjectPattern.test(parentCommit) ||
    !GhcrRepositoryPattern.test(registryRepository) ||
    !Array.isArray(changedPaths) ||
    !Array.isArray(allowedAuxiliaryPaths) ||
    !Array.isArray(parentReleasePointers) ||
    !Array.isArray(currentReleasePointers) ||
    !Array.isArray(currentOciPointers)
  ) {
    fail(
      'unrepairable-adoption',
      'Cheap LFS could not prove an exact managed GHCR adoption commit.'
    )
  }
  if (
    parentReleasePointers.length !== receipt.pointerCount ||
    currentReleasePointers.length !== 0
  ) {
    fail(
      'unrepairable-adoption',
      'Cheap LFS GHCR adoption repair found a different Release pointer set.'
    )
  }

  const releaseByPath = new Map()
  for (const entry of parentReleasePointers) {
    if (
      typeof entry?.path !== 'string' ||
      entry.path.length === 0 ||
      releaseByPath.has(entry.path) ||
      (entry.mode !== '100644' && entry.mode !== '100755') ||
      !ShaPattern.test(entry.pointer?.sha256) ||
      !safeInteger(entry.pointer?.sizeInBytes, 1, MAX_OBJECT_BYTES)
    ) {
      fail(
        'unrepairable-adoption',
        'Cheap LFS GHCR adoption repair found invalid parent pointers.'
      )
    }
    releaseByPath.set(entry.path, entry)
  }
  const allowedChanges = new Set(releaseByPath.keys())
  for (const path of allowedAuxiliaryPaths) {
    if (
      typeof path !== 'string' ||
      path.length === 0 ||
      allowedChanges.has(path)
    ) {
      fail(
        'unrepairable-adoption',
        'Cheap LFS GHCR adoption repair received invalid auxiliary paths.'
      )
    }
    allowedChanges.add(path)
  }
  const actualChanges = new Set(changedPaths)
  if (
    actualChanges.size !== changedPaths.length ||
    actualChanges.size !== allowedChanges.size ||
    [...actualChanges].some(path => !allowedChanges.has(path))
  ) {
    fail(
      'unrepairable-adoption',
      'Cheap LFS GHCR adoption repair found an unexpected Git tree change.'
    )
  }

  const currentByPath = new Map()
  for (const entry of currentOciPointers) {
    if (typeof entry?.path !== 'string' || currentByPath.has(entry.path)) {
      fail(
        'unrepairable-adoption',
        'Cheap LFS GHCR adoption repair found duplicate current OCI paths.'
      )
    }
    currentByPath.set(entry.path, entry)
  }
  const immutableImage = `${registryRepository}@${receipt.manifestDigest}`
  const converted = []
  for (const [path, parent] of releaseByPath) {
    const current = currentByPath.get(path)
    if (
      current === undefined ||
      current.mode !== parent.mode ||
      current.pointer?.image !== immutableImage ||
      current.pointer?.object !== `sha256:${parent.pointer.sha256}` ||
      current.pointer?.sizeInBytes !== parent.pointer.sizeInBytes ||
      !Array.isArray(current.pointer?.layers) ||
      current.pointer.layers.length === 0 ||
      (visibility === 'public'
        ? current.pointer.keyId !== undefined
        : !DigestPattern.test(current.pointer.keyId))
    ) {
      fail(
        'unrepairable-adoption',
        `Cheap LFS GHCR adoption repair rejected the converted pointer at ${path}.`
      )
    }
    converted.push(current)
  }
  return converted
}

function safeInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function exactKeys(value, keys) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
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
  if (fields.size !== 5 || fields.get('version') !== RELEASE_POINTER_VERSION) {
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
  if ((lines.length !== 6 && lines.length !== 7) || lines.at(-1) !== '') {
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
    !/^(?:ghcr\.io|docker\.io)\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/.test(
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
    !/^(?:ghcr\.io|docker\.io)\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/.test(
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
    fail(
      'invalid-pointer',
      'Cheap LFS cannot serialize an invalid OCI pointer.'
    )
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
 * Runtime visibility policy. Repository visibility is checked independently
 * from the conversion preference: private Actions run only when GitHub says
 * `private` and the separate confirmation is true. Internal and unknown
 * visibility are deliberately unsupported rather than guessed.
 */
export function resolveConversionVisibility(
  repositoryVisibility,
  privateConfirmed
) {
  if (repositoryVisibility === 'public') {
    return 'public'
  }
  if (repositoryVisibility === 'private') {
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
    'Cheap LFS Release-to-GHCR conversion is blocked because GitHub did not report an exact supported public or private repository visibility. Internal and unknown visibility are not converted.'
  )
}

/**
 * Existing OCI pointers cannot silently cross a repository visibility
 * boundary. Public objects need an explicit materialize-and-repin migration
 * before a private snapshot can encrypt them; private objects likewise cannot
 * be published through a public snapshot.
 */
export function requireOciPointerVisibility(visibility, pointerKeyIds) {
  if (
    (visibility !== 'public' && visibility !== 'private') ||
    !Array.isArray(pointerKeyIds) ||
    pointerKeyIds.some(
      keyId => keyId !== undefined && !DigestPattern.test(keyId)
    )
  ) {
    fail(
      'visibility-unknown',
      'Cheap LFS could not prove the visibility policy of existing GHCR pointers.'
    )
  }
  const hasPublicPointers = pointerKeyIds.some(keyId => keyId === undefined)
  const hasPrivatePointers = pointerKeyIds.some(keyId => keyId !== undefined)
  if (visibility === 'private' && hasPublicPointers) {
    fail(
      'public-to-private-oci-transition',
      'This repository became private while public GHCR pointers still exist. No canonical tag or pointer was changed. Materialize those files while their public package remains accessible, repin them to private GHCR in Desktop Material, then rerun this workflow.'
    )
  }
  if (visibility === 'public' && hasPrivatePointers) {
    fail(
      'private-to-public-oci-transition',
      'This repository became public while private encrypted GHCR pointers still exist. No canonical tag or pointer was changed. Materialize and repin those files under the intended public policy before rerunning this workflow.'
    )
  }
  return true
}

/**
 * Transaction seam for immutable publication, Git compare-and-swap adoption,
 * and mutable canonical-tag promotion.
 *
 * The canonical tag is intentionally last. Only the run whose fast-forward
 * adoption wins and whose exact adopted commit is still the remote default may
 * promote it, so a concurrent loser can leave harmless immutable blobs but can
 * never overwrite the canonical tag.
 */
export async function runCanonicalPublicationTransaction({
  publishImmutableSnapshot,
  verifyPackagePolicy,
  verifyCapturedDefault,
  adoptPointers,
  verifyAdoptedDefault,
  publishCanonicalTag,
}) {
  const operations = [
    publishImmutableSnapshot,
    verifyPackagePolicy,
    verifyCapturedDefault,
    adoptPointers,
    verifyAdoptedDefault,
    publishCanonicalTag,
  ]
  if (operations.some(operation => typeof operation !== 'function')) {
    fail(
      'invalid-transaction',
      'Cheap LFS received an incomplete canonical publication transaction.'
    )
  }
  await publishImmutableSnapshot()
  await verifyPackagePolicy()
  await verifyCapturedDefault()
  const adoptionCommit = await adoptPointers()
  if (
    typeof adoptionCommit !== 'string' ||
    !GitObjectPattern.test(adoptionCommit)
  ) {
    fail(
      'invalid-transaction',
      'Cheap LFS pointer adoption did not return an exact Git commit.'
    )
  }
  await verifyAdoptedDefault(adoptionCommit)
  await publishCanonicalTag(adoptionCommit)
  return adoptionCommit
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
  if (!GhcrRepositoryPattern.test(registryRepository)) {
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

/**
 * Existing Docker Hub or external OCI pointers remain owned by their current
 * provider. Release-to-GHCR builds its canonical snapshot only from pointers
 * already aimed at this repository's exact managed GHCR package.
 */
export function selectCanonicalGhcrEntries(entries, registryRepository) {
  if (
    !Array.isArray(entries) ||
    !GhcrRepositoryPattern.test(registryRepository)
  ) {
    fail(
      'repository-identity',
      'Cheap LFS could not select pointers for an invalid canonical GHCR target.'
    )
  }
  return entries.filter(entry => {
    const image = entry?.pointer?.image
    if (typeof image !== 'string') {
      fail(
        'invalid-pointer',
        'Cheap LFS found an invalid current OCI pointer entry.'
      )
    }
    const separator = image.lastIndexOf('@')
    return (
      separator > 0 &&
      image.slice(0, separator) === registryRepository &&
      DigestPattern.test(image.slice(separator + 1))
    )
  })
}

export function parseRepositoryKey(text, expectedHeader) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 256) {
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

export function validateSnapshot(value, repositoryIdentity, visibility) {
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
      typeof asset?.label === 'string' && LEGACY_ASSET_LABEL.test(asset.label)
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
