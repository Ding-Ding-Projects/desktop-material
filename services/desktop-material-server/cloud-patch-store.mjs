/* eslint-disable @typescript-eslint/explicit-member-accessibility */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto'
import { mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, parse, resolve } from 'node:path'

export const CloudPatchMaximumLifetimeMs = 7 * 24 * 60 * 60 * 1000
export const CloudPatchMaximumArtifactBytes =
  8 * 1024 * 1024 * 2 + 2 * 1024 * 1024 + 1024
export const CloudPatchMaximumRecipients = 50
export const CloudPatchMaximumActiveShares = 128
export const CloudPatchMaximumActiveCiphertextBytes = 512 * 1024 * 1024

const StoreVersion = 1
const MaximumMetadataBytes = 64 * 1024
const RevocationStateActive = 0
const RevocationStateRevoked = 1
const RevocationSlotBytes = 33
const RevocationFileBytes = RevocationSlotBytes * 2
const ShareIdPattern = /^cp_[a-f0-9]{64}$/
const ShareSecretPattern = /^cps_[A-Za-z0-9_-]{43}$/
const ShareDirectoryPattern = /^share-([a-f0-9]{64})$/
const PendingDirectoryPattern = /^\.pending-[a-f0-9]{64}$/
const RevokedDirectoryPattern = /^\.revoked-[a-f0-9]{64}$/
const DigestPattern = /^sha256:[a-f0-9]{64}$/
const DeviceIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const NoncePattern = /^[A-Za-z0-9_-]{16}$/
const AuthenticationTagPattern = /^[A-Za-z0-9_-]{22}$/
const MetadataFileName = 'metadata.json'
const CiphertextFileName = 'ciphertext.bin'
const RevocationFileName = 'revocation.bin'
const DummySecretHash = createHash('sha256').update('').digest()
const StoreCoordinators = new Map()
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

const ErrorMessages = Object.freeze({
  'invalid-configuration': 'Cloud Patch store configuration is invalid.',
  'invalid-input': 'Cloud Patch share input is invalid.',
  'invalid-expiry': 'Cloud Patch share expiry is invalid.',
  'digest-mismatch': 'Cloud Patch artifact digest verification failed.',
  'capacity-exceeded': 'Cloud Patch share storage capacity is exhausted.',
  'access-denied': 'Cloud Patch share access was denied.',
  'revoke-denied': 'Cloud Patch share revocation was denied.',
  'corrupt-store': 'Cloud Patch share storage is corrupted.',
  'integrity-failure': 'Cloud Patch share integrity verification failed.',
  'storage-failure': 'Cloud Patch share storage operation failed.',
  'randomness-failure': 'Cloud Patch share randomness failed safely.',
})

export class CloudPatchStoreError extends Error {
  constructor(code) {
    super(ErrorMessages[code] ?? ErrorMessages['storage-failure'])
    this.name = 'CloudPatchStoreError'
    this.code = Object.hasOwn(ErrorMessages, code) ? code : 'storage-failure'
  }
}

function fail(code) {
  throw new CloudPatchStoreError(code)
}

function safeFailure(error, fallback = 'storage-failure') {
  return error instanceof CloudPatchStoreError
    ? error
    : new CloudPatchStoreError(fallback)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, expected) {
  if (!isRecord(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    return false
  }
  const keys = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  )
}

function requireSafeInteger(value, code = 'invalid-input') {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail(code)
  }
  return value
}

function requireDeviceId(value, code = 'invalid-input') {
  if (typeof value !== 'string' || !DeviceIdPattern.test(value)) {
    return fail(code)
  }
  return value
}

function normalizeRecipients(value, ownerDeviceId, code = 'invalid-input') {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > CloudPatchMaximumRecipients
  ) {
    return fail(code)
  }
  const recipients = value.map(deviceId => requireDeviceId(deviceId, code))
  if (recipients.includes(ownerDeviceId)) {
    return fail(code)
  }
  const sorted = [...recipients].sort()
  if (new Set(sorted).size !== sorted.length) {
    return fail(code)
  }
  return { recipients, sorted }
}

function normalizePersistedRecipients(value, ownerDeviceId) {
  const normalized = normalizeRecipients(value, ownerDeviceId, 'corrupt-store')
  if (
    normalized.recipients.some(
      (deviceId, index) => deviceId !== normalized.sorted[index]
    )
  ) {
    return fail('corrupt-store')
  }
  return normalized.sorted
}

function requireDigest(value, code = 'invalid-input') {
  if (typeof value !== 'string' || !DigestPattern.test(value)) {
    return fail(code)
  }
  return value
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function secretHashBytes(secret) {
  return createHash('sha256').update(secret, 'utf8').digest()
}

function secretHash(secret) {
  return `sha256:${secretHashBytes(secret).toString('hex')}`
}

function secretMatches(secret, expectedHash) {
  const actual = secretHashBytes(typeof secret === 'string' ? secret : '')
  const expected = DigestPattern.test(expectedHash)
    ? Buffer.from(expectedHash.slice(7), 'hex')
    : DummySecretHash
  return timingSafeEqual(actual, expected)
}

function deriveRevocationKey(encryptionKey) {
  return createHmac('sha256', encryptionKey)
    .update('desktop-material/cloud-patch-revocation-key/v1', 'utf8')
    .digest()
}

function revocationSlot(revocationKey, shareId, state) {
  const stateByte = Buffer.from([state])
  const authentication = createHmac('sha256', revocationKey)
    .update('desktop-material/cloud-patch-revocation/v1\0', 'utf8')
    .update(shareId, 'utf8')
    .update(stateByte)
    .digest()
  return Buffer.concat([stateByte, authentication])
}

function initialRevocationFile(revocationKey, shareId) {
  return Buffer.concat([
    revocationSlot(revocationKey, shareId, RevocationStateActive),
    Buffer.alloc(RevocationSlotBytes),
  ])
}

function parseRevocationFile(bytes, revocationKey, shareId, errorCode) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength !== RevocationFileBytes
  ) {
    return fail(errorCode)
  }
  const active = Buffer.from(bytes.subarray(0, RevocationSlotBytes))
  const second = Buffer.from(bytes.subarray(RevocationSlotBytes))
  const expectedActive = revocationSlot(
    revocationKey,
    shareId,
    RevocationStateActive
  )
  const expectedRevoked = revocationSlot(
    revocationKey,
    shareId,
    RevocationStateRevoked
  )
  const activeIsValid = timingSafeEqual(active, expectedActive)
  const revokedIsValid = timingSafeEqual(second, expectedRevoked)
  if (!activeIsValid) {
    return fail(errorCode)
  }
  if (revokedIsValid) {
    return true
  }
  if (second[0] === 0) {
    // A non-empty payload with no commit byte is a torn or interrupted revoke.
    // Conservatively retire only this share; never let changing a committed 1
    // back to 0 reactivate its still-authenticated revocation payload.
    return second.subarray(1).some(byte => byte !== 0)
  }
  return fail(errorCode)
}

function decodeBase64Url(value, pattern, byteLength, code) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    return fail(code)
  }
  const bytes = Buffer.from(value, 'base64url')
  if (
    bytes.byteLength !== byteLength ||
    bytes.toString('base64url') !== value
  ) {
    return fail(code)
  }
  return bytes
}

function canonicalAAD(record) {
  return encoder.encode(
    JSON.stringify({
      domain: 'desktop-material/cloud-patch-share',
      version: StoreVersion,
      shareId: record.shareId,
      secretHash: record.secretHash,
      expectedArtifactSha256: record.expectedArtifactSha256,
      ownerDeviceId: record.ownerDeviceId,
      recipientDeviceIds: record.recipientDeviceIds,
      createdAtMs: record.createdAtMs,
      expiresAtMs: record.expiresAtMs,
      artifactByteLength: record.artifactByteLength,
      nonce: record.nonce,
    })
  )
}

function canonicalMetadata(record) {
  return {
    version: StoreVersion,
    shareId: record.shareId,
    secretHash: record.secretHash,
    expectedArtifactSha256: record.expectedArtifactSha256,
    ownerDeviceId: record.ownerDeviceId,
    recipientDeviceIds: record.recipientDeviceIds,
    createdAtMs: record.createdAtMs,
    expiresAtMs: record.expiresAtMs,
    artifactByteLength: record.artifactByteLength,
    nonce: record.nonce,
    authenticationTag: record.authenticationTag,
  }
}

function serializeMetadata(record) {
  return `${JSON.stringify(canonicalMetadata(record))}\n`
}

function parseMetadata(bytes, maximumArtifactBytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength > MaximumMetadataBytes
  ) {
    return fail('corrupt-store')
  }
  let serialized
  try {
    serialized = decoder.decode(bytes)
  } catch {
    return fail('corrupt-store')
  }
  if (!Buffer.from(encoder.encode(serialized)).equals(Buffer.from(bytes))) {
    return fail('corrupt-store')
  }
  let value
  try {
    value = JSON.parse(serialized)
  } catch {
    return fail('corrupt-store')
  }
  const keys = [
    'version',
    'shareId',
    'secretHash',
    'expectedArtifactSha256',
    'ownerDeviceId',
    'recipientDeviceIds',
    'createdAtMs',
    'expiresAtMs',
    'artifactByteLength',
    'nonce',
    'authenticationTag',
  ]
  if (!hasExactKeys(value, keys) || value.version !== StoreVersion) {
    return fail('corrupt-store')
  }
  if (
    typeof value.shareId !== 'string' ||
    !ShareIdPattern.test(value.shareId)
  ) {
    return fail('corrupt-store')
  }
  const ownerDeviceId = requireDeviceId(value.ownerDeviceId, 'corrupt-store')
  const recipientDeviceIds = normalizePersistedRecipients(
    value.recipientDeviceIds,
    ownerDeviceId
  )
  const createdAtMs = requireSafeInteger(value.createdAtMs, 'corrupt-store')
  const expiresAtMs = requireSafeInteger(value.expiresAtMs, 'corrupt-store')
  if (
    createdAtMs >= expiresAtMs ||
    expiresAtMs - createdAtMs > CloudPatchMaximumLifetimeMs
  ) {
    return fail('corrupt-store')
  }
  const artifactByteLength = requireSafeInteger(
    value.artifactByteLength,
    'corrupt-store'
  )
  if (artifactByteLength > maximumArtifactBytes) {
    return fail('corrupt-store')
  }
  const record = canonicalMetadata({
    shareId: value.shareId,
    secretHash: requireDigest(value.secretHash, 'corrupt-store'),
    expectedArtifactSha256: requireDigest(
      value.expectedArtifactSha256,
      'corrupt-store'
    ),
    ownerDeviceId,
    recipientDeviceIds,
    createdAtMs,
    expiresAtMs,
    artifactByteLength,
    nonce: value.nonce,
    authenticationTag: value.authenticationTag,
  })
  decodeBase64Url(record.nonce, NoncePattern, 12, 'corrupt-store')
  decodeBase64Url(
    record.authenticationTag,
    AuthenticationTagPattern,
    16,
    'corrupt-store'
  )
  if (serializeMetadata(record) !== serialized) {
    return fail('corrupt-store')
  }
  return record
}

function encryptArtifact(artifact, record, encryptionKey, nonceBytes) {
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, nonceBytes, {
    authTagLength: 16,
  })
  cipher.setAAD(canonicalAAD(record), {
    plaintextLength: artifact.byteLength,
  })
  const ciphertext = Buffer.concat([cipher.update(artifact), cipher.final()])
  return {
    ciphertext,
    authenticationTag: cipher.getAuthTag().toString('base64url'),
  }
}

function decryptArtifact(ciphertext, record, encryptionKey, errorCode) {
  try {
    const nonce = decodeBase64Url(record.nonce, NoncePattern, 12, errorCode)
    const tag = decodeBase64Url(
      record.authenticationTag,
      AuthenticationTagPattern,
      16,
      errorCode
    )
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, nonce, {
      authTagLength: 16,
    })
    decipher.setAAD(canonicalAAD(record), {
      plaintextLength: record.artifactByteLength,
    })
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    if (
      plaintext.byteLength !== record.artifactByteLength ||
      sha256(plaintext) !== record.expectedArtifactSha256
    ) {
      return fail(errorCode)
    }
    return plaintext
  } catch (error) {
    throw safeFailure(error, errorCode)
  }
}

function normalizeLimits(value) {
  const defaults = {
    maximumArtifactBytes: CloudPatchMaximumArtifactBytes,
    maximumActiveShares: CloudPatchMaximumActiveShares,
    maximumActiveCiphertextBytes: CloudPatchMaximumActiveCiphertextBytes,
  }
  if (value === undefined) {
    return defaults
  }
  if (!hasExactKeys(value, Object.keys(defaults))) {
    return fail('invalid-configuration')
  }
  const limits = {}
  for (const [key, maximum] of Object.entries(defaults)) {
    const candidate = requireSafeInteger(value[key], 'invalid-configuration')
    if (candidate < 1 || candidate > maximum) {
      return fail('invalid-configuration')
    }
    limits[key] = candidate
  }
  return limits
}

function normalizeOptions(value) {
  if (
    !hasExactKeys(value, [
      'dataDirectory',
      'encryptionKey',
      'clock',
      'randomBytes',
      ...(Object.hasOwn(value ?? {}, 'limits') ? ['limits'] : []),
    ]) ||
    typeof value.dataDirectory !== 'string' ||
    !isAbsolute(value.dataDirectory) ||
    resolve(value.dataDirectory) !== value.dataDirectory ||
    parse(value.dataDirectory).root === value.dataDirectory ||
    value.dataDirectory.length === 0 ||
    value.dataDirectory.length > 4096 ||
    value.dataDirectory.includes('\0') ||
    !(value.encryptionKey instanceof Uint8Array) ||
    value.encryptionKey.byteLength !== 32 ||
    typeof value.clock !== 'function' ||
    typeof value.randomBytes !== 'function'
  ) {
    return fail('invalid-configuration')
  }
  return {
    dataDirectory: value.dataDirectory,
    encryptionKey: Buffer.from(value.encryptionKey),
    clock: value.clock,
    randomBytes: value.randomBytes,
    limits: normalizeLimits(value.limits),
  }
}

function normalizeCreateInput(value, maximumArtifactBytes) {
  if (
    !hasExactKeys(value, [
      'ownerDeviceId',
      'recipientDeviceIds',
      'expectedArtifactSha256',
      'artifact',
      'expiresAtMs',
    ]) ||
    !(value.artifact instanceof Uint8Array) ||
    value.artifact.byteLength > maximumArtifactBytes
  ) {
    return fail('invalid-input')
  }
  const ownerDeviceId = requireDeviceId(value.ownerDeviceId)
  const { sorted: recipientDeviceIds } = normalizeRecipients(
    value.recipientDeviceIds,
    ownerDeviceId
  )
  return {
    ownerDeviceId,
    recipientDeviceIds,
    expectedArtifactSha256: requireDigest(value.expectedArtifactSha256),
    artifact: Uint8Array.from(value.artifact),
    expiresAtMs: requireSafeInteger(value.expiresAtMs),
  }
}

function normalizeOpenInput(value) {
  if (
    !hasExactKeys(value, ['shareId', 'shareSecret', 'requestingDeviceId']) ||
    typeof value.shareId !== 'string' ||
    !ShareIdPattern.test(value.shareId) ||
    typeof value.shareSecret !== 'string' ||
    value.shareSecret.length > 256
  ) {
    return fail('invalid-input')
  }
  return {
    shareId: value.shareId,
    shareSecret: value.shareSecret,
    requestingDeviceId: requireDeviceId(value.requestingDeviceId),
  }
}

function normalizeRevokeInput(value) {
  if (
    !hasExactKeys(value, ['shareId', 'requestingDeviceId']) ||
    typeof value.shareId !== 'string' ||
    !ShareIdPattern.test(value.shareId)
  ) {
    return fail('invalid-input')
  }
  return {
    shareId: value.shareId,
    requestingDeviceId: requireDeviceId(value.requestingDeviceId),
  }
}

function normalizeListInput(value) {
  if (!hasExactKeys(value, ['ownerDeviceId'])) {
    return fail('invalid-input')
  }
  return { ownerDeviceId: requireDeviceId(value.ownerDeviceId) }
}

async function writeSyncedFile(path, bytes) {
  let handle
  try {
    handle = await open(path, 'wx', 0o600)
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle?.close()
  }
}

async function readBoundedFile(path, maximumBytes, expectedBytes, errorCode) {
  let handle
  try {
    handle = await open(path, 'r')
    const before = await handle.stat()
    if (
      !before.isFile() ||
      !Number.isSafeInteger(before.size) ||
      before.size > maximumBytes ||
      (expectedBytes !== undefined && before.size !== expectedBytes)
    ) {
      return fail(errorCode)
    }
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.byteLength) {
      const result = await handle.read(
        bytes,
        offset,
        bytes.byteLength - offset,
        offset
      )
      if (result.bytesRead === 0) {
        return fail(errorCode)
      }
      offset += result.bytesRead
    }
    const overflowProbe = Buffer.alloc(1)
    if ((await handle.read(overflowProbe, 0, 1, before.size)).bytesRead !== 0) {
      return fail(errorCode)
    }
    if ((await handle.stat()).size !== before.size) {
      return fail(errorCode)
    }
    return bytes
  } catch (error) {
    throw safeFailure(error, errorCode)
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function persistRevocation(path, revocationKey, shareId) {
  let handle
  try {
    handle = await open(path, 'r+')
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size !== RevocationFileBytes) {
      return fail('integrity-failure')
    }
    const slot = revocationSlot(revocationKey, shareId, RevocationStateRevoked)
    const authentication = slot.subarray(1)
    let offset = 0
    while (offset < authentication.byteLength) {
      const written = await handle.write(
        authentication,
        offset,
        authentication.byteLength - offset,
        RevocationSlotBytes + 1 + offset
      )
      if (written.bytesWritten === 0) {
        return fail('storage-failure')
      }
      offset += written.bytesWritten
    }
    await handle.sync()
    const authenticationVerification = Buffer.alloc(authentication.byteLength)
    const authenticationRead = await handle.read(
      authenticationVerification,
      0,
      authenticationVerification.byteLength,
      RevocationSlotBytes + 1
    )
    if (
      authenticationRead.bytesRead !== authenticationVerification.byteLength ||
      !timingSafeEqual(authenticationVerification, authentication)
    ) {
      return fail('storage-failure')
    }
    const committed = await handle.write(slot, 0, 1, RevocationSlotBytes)
    if (committed.bytesWritten !== 1) {
      return fail('storage-failure')
    }
    await handle.sync()
    const verification = Buffer.alloc(RevocationSlotBytes)
    const read = await handle.read(
      verification,
      0,
      verification.byteLength,
      RevocationSlotBytes
    )
    if (
      read.bytesRead !== verification.byteLength ||
      !timingSafeEqual(verification, slot)
    ) {
      return fail('storage-failure')
    }
  } finally {
    await handle?.close()
  }
}

async function syncDirectory(path) {
  // Directory-handle fsync can remain pending indefinitely on Windows. Atomic
  // same-directory renames plus strict startup validation remain fail-closed
  // there; platforms that support directory fsync also get power-loss
  // durability before a create or revoke is acknowledged.
  if (process.platform === 'win32') {
    return
  }
  let handle
  try {
    handle = await open(path, 'r')
    await handle.sync()
  } catch (error) {
    if (!['EINVAL', 'EISDIR', 'ENOTSUP'].includes(error?.code)) {
      throw error
    }
  } finally {
    await handle?.close()
  }
}

function coordinatorFor(dataDirectory) {
  let coordinator = StoreCoordinators.get(dataDirectory)
  if (coordinator === undefined) {
    coordinator = { pending: Promise.resolve() }
    StoreCoordinators.set(dataDirectory, coordinator)
  }
  return coordinator
}

function shareDirectoryName(shareId) {
  return `share-${shareId.slice(3)}`
}

function shareIdFromDirectoryName(directoryName) {
  const match = ShareDirectoryPattern.exec(directoryName)
  return match === null ? null : `cp_${match[1]}`
}

function sameRecord(left, right) {
  return serializeMetadata(left) === serializeMetadata(right)
}

class CloudPatchStore {
  constructor(options) {
    this.dataDirectory = options.dataDirectory
    this.encryptionKey = options.encryptionKey
    this.revocationKey = deriveRevocationKey(options.encryptionKey)
    this.clock = options.clock
    this.randomSource = options.randomBytes
    this.limits = options.limits
    this.records = new Map()
    this.coordinator = coordinatorFor(options.dataDirectory)
  }

  async initialize() {
    return this.runSerialized(() => this.refreshFromDisk())
  }

  async refreshFromDisk(errorCode = 'corrupt-store') {
    try {
      await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 })
      const entries = await readdir(this.dataDirectory, { withFileTypes: true })
      const finalDirectories = []
      let removedOwnedRecoveryEntry = false
      for (const entry of entries) {
        if (ShareDirectoryPattern.test(entry.name)) {
          if (!entry.isDirectory()) {
            return fail(errorCode)
          }
          finalDirectories.push(entry.name)
          continue
        }
        if (
          PendingDirectoryPattern.test(entry.name) ||
          RevokedDirectoryPattern.test(entry.name)
        ) {
          await rm(join(this.dataDirectory, entry.name), {
            recursive: true,
            force: true,
          })
          removedOwnedRecoveryEntry = true
          continue
        }
        if (
          entry.name.startsWith('share-') ||
          entry.name.startsWith('.pending-') ||
          entry.name.startsWith('.revoked-')
        ) {
          return fail(errorCode)
        }
      }
      if (removedOwnedRecoveryEntry) {
        await syncDirectory(this.dataDirectory)
      }
      this.records = new Map()
      finalDirectories.sort()
      for (const directoryName of finalDirectories) {
        const loaded = await this.loadEnvelope(directoryName, errorCode)
        if (loaded.revoked) {
          await this.retire(loaded.record.shareId)
          continue
        }
        if (this.records.has(loaded.record.shareId)) {
          return fail(errorCode)
        }
        this.records.set(loaded.record.shareId, loaded.record)
      }
      const now = this.readClock('invalid-configuration')
      await this.pruneExpired(now)
      this.validateActiveLimits(errorCode)
    } catch (error) {
      throw safeFailure(error)
    }
  }

  createShare(input) {
    try {
      const normalized = normalizeCreateInput(
        input,
        this.limits.maximumArtifactBytes
      )
      return this.enqueue(() => this.createShareSerialized(normalized))
    } catch (error) {
      return Promise.reject(safeFailure(error))
    }
  }

  openShare(input) {
    try {
      const normalized = normalizeOpenInput(input)
      return this.enqueue(() => this.openShareSerialized(normalized))
    } catch (error) {
      return Promise.reject(safeFailure(error))
    }
  }

  revokeShare(input) {
    try {
      const normalized = normalizeRevokeInput(input)
      return this.enqueue(() => this.revokeShareSerialized(normalized))
    } catch (error) {
      return Promise.reject(safeFailure(error))
    }
  }

  listOwnerShares(input) {
    try {
      const normalized = normalizeListInput(input)
      return this.enqueue(() => this.listOwnerSharesSerialized(normalized))
    } catch (error) {
      return Promise.reject(safeFailure(error))
    }
  }

  enqueue(operation) {
    return this.runSerialized(async () => {
      await this.refreshFromDisk('integrity-failure')
      return operation()
    })
  }

  runSerialized(operation) {
    const result = this.coordinator.pending.then(async () => {
      try {
        return await operation()
      } catch (error) {
        throw safeFailure(error)
      }
    })
    this.coordinator.pending = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  readClock(code = 'invalid-input') {
    let now
    try {
      now = this.clock()
    } catch {
      return fail(code)
    }
    return requireSafeInteger(now, code)
  }

  random(length, purpose) {
    let value
    try {
      value = this.randomSource(length, purpose)
    } catch {
      return fail('randomness-failure')
    }
    if (!(value instanceof Uint8Array) || value.byteLength !== length) {
      return fail('randomness-failure')
    }
    return Buffer.from(value)
  }

  async makePendingDirectory() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const name = `.pending-${this.random(32, 'operation-id').toString('hex')}`
      const path = join(this.dataDirectory, name)
      try {
        await mkdir(path, { mode: 0o700 })
        return { name, path }
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          throw error
        }
      }
    }
    return fail('randomness-failure')
  }

  generateShareId() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const shareId = `cp_${this.random(32, 'share-id').toString('hex')}`
      if (!this.records.has(shareId)) {
        return shareId
      }
    }
    return fail('randomness-failure')
  }

  validateActiveLimits(code) {
    if (this.records.size > this.limits.maximumActiveShares) {
      return fail(code)
    }
    let total = 0
    for (const record of this.records.values()) {
      total += record.artifactByteLength
      if (total > this.limits.maximumActiveCiphertextBytes) {
        return fail(code)
      }
    }
    return total
  }

  async createShareSerialized(input) {
    const now = this.readClock()
    if (
      input.expiresAtMs <= now ||
      input.expiresAtMs - now > CloudPatchMaximumLifetimeMs
    ) {
      return fail('invalid-expiry')
    }
    if (input.artifact.byteLength > this.limits.maximumArtifactBytes) {
      return fail('invalid-input')
    }
    if (sha256(input.artifact) !== input.expectedArtifactSha256) {
      return fail('digest-mismatch')
    }
    await this.pruneExpired(now)
    const activeBytes = this.validateActiveLimits('capacity-exceeded')
    if (
      this.records.size >= this.limits.maximumActiveShares ||
      activeBytes + input.artifact.byteLength >
        this.limits.maximumActiveCiphertextBytes
    ) {
      return fail('capacity-exceeded')
    }

    const shareId = this.generateShareId()
    const shareSecret = `cps_${this.random(32, 'share-secret').toString(
      'base64url'
    )}`
    const nonceBytes = this.random(12, 'encryption-nonce')
    const partialRecord = {
      version: StoreVersion,
      shareId,
      secretHash: secretHash(shareSecret),
      expectedArtifactSha256: input.expectedArtifactSha256,
      ownerDeviceId: input.ownerDeviceId,
      recipientDeviceIds: input.recipientDeviceIds,
      createdAtMs: now,
      expiresAtMs: input.expiresAtMs,
      artifactByteLength: input.artifact.byteLength,
      nonce: nonceBytes.toString('base64url'),
    }
    const encrypted = encryptArtifact(
      input.artifact,
      partialRecord,
      this.encryptionKey,
      nonceBytes
    )
    const record = canonicalMetadata({
      ...partialRecord,
      authenticationTag: encrypted.authenticationTag,
    })
    const pending = await this.makePendingDirectory()
    const finalPath = join(this.dataDirectory, shareDirectoryName(shareId))
    let published = false
    try {
      await writeSyncedFile(
        join(pending.path, CiphertextFileName),
        encrypted.ciphertext
      )
      await writeSyncedFile(
        join(pending.path, MetadataFileName),
        serializeMetadata(record)
      )
      await writeSyncedFile(
        join(pending.path, RevocationFileName),
        initialRevocationFile(this.revocationKey, shareId)
      )
      await syncDirectory(pending.path)
      await rename(pending.path, finalPath)
      published = true
      await syncDirectory(this.dataDirectory)
    } finally {
      if (!published) {
        try {
          await rm(pending.path, { recursive: true, force: true })
        } catch {
          // The unpublished directory has no authorizing final name. Startup
          // retries cleanup using the same fixed pending-directory grammar.
        }
      }
    }
    this.records.set(shareId, record)
    return Object.freeze({
      shareId,
      shareSecret,
      createdAtMs: now,
      expiresAtMs: input.expiresAtMs,
    })
  }

  async openShareSerialized(input) {
    const record = this.records.get(input.shareId)
    const now = this.readClock()
    const secretIsValid = secretMatches(
      input.shareSecret,
      record?.secretHash ?? `sha256:${DummySecretHash.toString('hex')}`
    )
    const deviceIsAuthorized =
      record !== undefined &&
      (record.ownerDeviceId === input.requestingDeviceId ||
        record.recipientDeviceIds.includes(input.requestingDeviceId))
    if (
      record === undefined ||
      record.expiresAtMs <= now ||
      !ShareSecretPattern.test(input.shareSecret) ||
      !secretIsValid ||
      !deviceIsAuthorized
    ) {
      if (record !== undefined && record.expiresAtMs <= now) {
        await this.pruneExpired(now)
      }
      return fail('access-denied')
    }
    const loaded = await this.loadEnvelope(
      shareDirectoryName(record.shareId),
      'integrity-failure'
    )
    if (!sameRecord(record, loaded.record)) {
      return fail('integrity-failure')
    }
    if (loaded.revoked) {
      await this.retire(record.shareId)
      return fail('access-denied')
    }
    return Uint8Array.from(loaded.artifact)
  }

  async revokeShareSerialized(input) {
    const record = this.records.get(input.shareId)
    const now = this.readClock()
    if (
      record === undefined ||
      record.expiresAtMs <= now ||
      record.ownerDeviceId !== input.requestingDeviceId
    ) {
      if (record !== undefined && record.expiresAtMs <= now) {
        await this.pruneExpired(now)
      }
      return fail('revoke-denied')
    }
    const loaded = await this.loadEnvelope(
      shareDirectoryName(record.shareId),
      'integrity-failure'
    )
    if (!sameRecord(record, loaded.record)) {
      return fail('integrity-failure')
    }
    if (loaded.revoked) {
      await this.retire(record.shareId)
      return Object.freeze({ revoked: true })
    }
    await persistRevocation(
      join(
        this.dataDirectory,
        shareDirectoryName(record.shareId),
        RevocationFileName
      ),
      this.revocationKey,
      record.shareId
    )
    await this.retire(record.shareId)
    return Object.freeze({ revoked: true })
  }

  async listOwnerSharesSerialized(input) {
    const now = this.readClock()
    await this.pruneExpired(now)
    const result = []
    for (const record of [...this.records.values()].sort((left, right) =>
      left.shareId.localeCompare(right.shareId)
    )) {
      if (record.ownerDeviceId !== input.ownerDeviceId) {
        continue
      }
      const loaded = await this.loadEnvelope(
        shareDirectoryName(record.shareId),
        'integrity-failure'
      )
      if (!sameRecord(record, loaded.record)) {
        return fail('integrity-failure')
      }
      if (loaded.revoked) {
        await this.retire(record.shareId)
        continue
      }
      result.push(
        Object.freeze({
          shareId: record.shareId,
          expectedArtifactSha256: record.expectedArtifactSha256,
          ownerDeviceId: record.ownerDeviceId,
          recipientDeviceIds: Object.freeze([...record.recipientDeviceIds]),
          createdAtMs: record.createdAtMs,
          expiresAtMs: record.expiresAtMs,
          artifactByteLength: record.artifactByteLength,
        })
      )
    }
    return Object.freeze(result)
  }

  async pruneExpired(now) {
    const expired = [...this.records.values()]
      .filter(record => record.expiresAtMs <= now)
      .sort((left, right) => left.shareId.localeCompare(right.shareId))
    for (const record of expired) {
      await this.retire(record.shareId)
    }
  }

  async retire(shareId) {
    const finalPath = join(this.dataDirectory, shareDirectoryName(shareId))
    const revokedPath = join(this.dataDirectory, `.revoked-${shareId.slice(3)}`)
    await rename(finalPath, revokedPath)
    await syncDirectory(this.dataDirectory)
    this.records.delete(shareId)
    try {
      await rm(revokedPath, { recursive: true, force: true })
      await syncDirectory(this.dataDirectory)
    } catch {
      // The atomic rename already removed the share from the authorization
      // namespace. Startup retries deletion of this exact owned tombstone.
    }
  }

  async loadEnvelope(directoryName, errorCode) {
    try {
      const expectedShareId = shareIdFromDirectoryName(directoryName)
      if (expectedShareId === null) {
        return fail(errorCode)
      }
      const directoryPath = join(this.dataDirectory, directoryName)
      const entries = await readdir(directoryPath, { withFileTypes: true })
      entries.sort((left, right) => left.name.localeCompare(right.name))
      if (
        entries.length !== 3 ||
        entries[0].name !== CiphertextFileName ||
        !entries[0].isFile() ||
        entries[1].name !== MetadataFileName ||
        !entries[1].isFile() ||
        entries[2].name !== RevocationFileName ||
        !entries[2].isFile()
      ) {
        return fail(errorCode)
      }
      const metadataBytes = await readBoundedFile(
        join(directoryPath, MetadataFileName),
        MaximumMetadataBytes,
        undefined,
        errorCode
      )
      const record = parseMetadata(
        metadataBytes,
        this.limits.maximumArtifactBytes
      )
      if (record.shareId !== expectedShareId) {
        return fail(errorCode)
      }
      const revocationBytes = await readBoundedFile(
        join(directoryPath, RevocationFileName),
        RevocationFileBytes,
        RevocationFileBytes,
        errorCode
      )
      const revoked = parseRevocationFile(
        revocationBytes,
        this.revocationKey,
        record.shareId,
        errorCode
      )
      const ciphertext = await readBoundedFile(
        join(directoryPath, CiphertextFileName),
        this.limits.maximumArtifactBytes,
        record.artifactByteLength,
        errorCode
      )
      return {
        record,
        revoked,
        artifact: decryptArtifact(
          ciphertext,
          record,
          this.encryptionKey,
          errorCode
        ),
      }
    } catch (error) {
      if (
        errorCode !== 'corrupt-store' &&
        error instanceof CloudPatchStoreError &&
        error.code === 'corrupt-store'
      ) {
        throw new CloudPatchStoreError(errorCode)
      }
      throw safeFailure(error, errorCode)
    }
  }
}

export async function createCloudPatchStore(options) {
  const store = new CloudPatchStore(normalizeOptions(options))
  await store.initialize()
  return Object.freeze({
    createShare: input => store.createShare(input),
    openShare: input => store.openShare(input),
    revokeShare: input => store.revokeShare(input),
    listOwnerShares: input => store.listOwnerShares(input),
  })
}
