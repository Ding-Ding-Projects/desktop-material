/**
 * Optional password encryption for GitHub Release Cheap LFS payloads.
 *
 * The working-tree file stays plaintext. Each stable upload range is encrypted
 * into an app-owned temporary file before it leaves the machine, and restore
 * authenticates into a different temporary file before publishing anything.
 *
 * Format, little-endian where numeric:
 *
 *   magic      8 bytes   "DMCLFS\0\x01"
 *   version    2 bytes   format version (currently 1)
 *   cipherId   2 bytes   1 = AES-256-GCM
 *   kdfId      2 bytes   1 = scrypt
 *   reserved   2 bytes   zero
 *   logN       4 bytes   scrypt cost exponent
 *   blockSize  4 bytes   scrypt r
 *   parallel   4 bytes   scrypt p
 *   saltLen    4 bytes
 *   nonceLen   4 bytes
 *   tagLen     4 bytes
 *   salt       saltLen
 *   nonce      nonceLen
 *   tag        tagLen
 *   ciphertext remainder
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { open, stat, unlink } from 'fs/promises'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'

const scrypt = promisify(scryptCallback) as (
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: {
    readonly N: number
    readonly r: number
    readonly p: number
    readonly maxmem: number
  }
) => Promise<Buffer>

/** Identifies the container so a foreign file is refused, not mis-parsed. */
const Magic = Buffer.from([0x44, 0x4d, 0x43, 0x4c, 0x46, 0x53, 0x00, 0x01])

/** Bumped only when the layout changes; parameters live in the header. */
export const CheapLfsEncryptionFormatVersion = 1

const CipherAesGcm = 1
const KdfScrypt = 1

const KeyLengthBytes = 32
const SaltLengthBytes = 16
/** GCM's standard nonce width. Wider nonces are not interoperable. */
const NonceLengthBytes = 12
const TagLengthBytes = 16

const HeaderFixedBytes = 8 + 2 + 2 + 2 + 2 + 4 + 4 + 4 + 4 + 4 + 4

/** The exact size added to every encrypted range; GCM itself does not pad. */
export const CHEAP_LFS_ENCRYPTION_OVERHEAD_BYTES =
  HeaderFixedBytes + SaltLengthBytes + NonceLengthBytes + TagLengthBytes

/**
 * scrypt cost. N is stored as its exponent so the header stays fixed-width.
 * Production uses roughly 128 MiB, while the absolute bound below prevents a
 * hostile header from asking Node to reserve gigabytes before authentication.
 */
const DefaultLogN = 17
const DefaultBlockSize = 8
const DefaultParallelism = 1
const MaximumLogN = 22
const MaximumBlockSize = 32
const MaximumParallelism = 16
const MaximumScryptMemoryBytes = 256 * 1024 * 1024
const ScryptMemoryReserveBytes = 16 * 1024 * 1024
// Memory alone does not bound `p`: reject a hostile header before it can ask
// scrypt for many sequentially expensive passes within the same allocation.
const MaximumScryptWorkFactor =
  4 * 2 ** DefaultLogN * DefaultBlockSize * DefaultParallelism

/** A passphrase may remain a legacy string or be caller-zeroable bytes. */
export type CheapLfsEncryptionSecret = string | Buffer | Uint8Array

export class CheapLfsEncryptionError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CheapLfsEncryptionError'
  }
}

/** Raised before any provider access when an encrypted payload lacks a secret. */
export class CheapLfsPasswordRequiredError extends CheapLfsEncryptionError {
  public constructor() {
    super('A password is required to encrypt or decrypt a Cheap LFS payload.')
    this.name = 'CheapLfsPasswordRequiredError'
  }
}

/** Wrong credentials and authenticated-ciphertext failures share one type. */
export class CheapLfsAuthenticationError extends CheapLfsEncryptionError {
  public constructor() {
    super(
      'The Cheap LFS payload could not be decrypted: the password is wrong or the stored bytes were altered.'
    )
    this.name = 'CheapLfsAuthenticationError'
  }
}

/** A pointer digest/size disagreed with stored or authenticated plaintext. */
export class CheapLfsPayloadIntegrityError extends CheapLfsEncryptionError {
  public constructor(message: string) {
    super(message)
    this.name = 'CheapLfsPayloadIntegrityError'
  }
}

export function isCheapLfsAuthenticationError(
  error: unknown
): error is CheapLfsAuthenticationError | AggregateError {
  const pending = [error]
  const seen = new Set<unknown>()
  while (pending.length > 0) {
    const candidate = pending.pop()
    if (candidate instanceof CheapLfsAuthenticationError) {
      return true
    }
    if (candidate instanceof AggregateError && !seen.has(candidate)) {
      seen.add(candidate)
      pending.push(...candidate.errors)
    }
  }
  return false
}

/**
 * Return true only when every leaf failure is an authentication failure.
 *
 * Materialization can aggregate a wrong-password error with a failure to
 * remove plaintext temporary output. That mixed failure must never be retried
 * as though it were only a stale credential, because a successful retry would
 * hide the unsafe cleanup result.
 */
export function isOnlyCheapLfsAuthenticationError(error: unknown): boolean {
  const seen = new Set<AggregateError>()
  const visit = (candidate: unknown): boolean => {
    if (candidate instanceof CheapLfsAuthenticationError) {
      return true
    }
    if (
      !(candidate instanceof AggregateError) ||
      candidate.errors.length === 0 ||
      seen.has(candidate)
    ) {
      return false
    }
    seen.add(candidate)
    return candidate.errors.every(visit)
  }
  return visit(error)
}

/** The scrypt parameters a payload was written with. */
export interface ICheapLfsKdfParameters {
  readonly logN: number
  readonly blockSize: number
  readonly parallelism: number
}

export const defaultCheapLfsKdfParameters: ICheapLfsKdfParameters = {
  logN: DefaultLogN,
  blockSize: DefaultBlockSize,
  parallelism: DefaultParallelism,
}

/** What a parsed header says, without decrypting anything. */
export interface ICheapLfsEncryptionHeader {
  readonly formatVersion: number
  readonly kdf: ICheapLfsKdfParameters
  readonly saltLength: number
  readonly nonceLength: number
  readonly tagLength: number
  /** Byte offset at which the ciphertext begins. */
  readonly ciphertextOffset: number
}

/** Integrity receipts from streaming one plaintext range into a container. */
export interface ICheapLfsEncryptedRangeResult {
  readonly plaintextSha256: string
  readonly plaintextSizeInBytes: number
  readonly storedSha256: string
  readonly storedSizeInBytes: number
}

/** Integrity receipts from an authenticated streaming decryption. */
export interface ICheapLfsDecryptedFileResult {
  readonly plaintextSha256: string
  readonly plaintextSizeInBytes: number
}

/** True for a nonempty string or caller-owned mutable byte credential. */
export function hasCheapLfsEncryptionSecret(
  secret: CheapLfsEncryptionSecret | undefined
): secret is CheapLfsEncryptionSecret {
  return typeof secret === 'string'
    ? secret.length > 0
    : secret instanceof Uint8Array && secret.byteLength > 0
}

function copySecret(secret: CheapLfsEncryptionSecret): Buffer {
  if (!hasCheapLfsEncryptionSecret(secret)) {
    throw new CheapLfsPasswordRequiredError()
  }
  if (typeof secret === 'string') {
    return Buffer.from(secret, 'utf8')
  }
  // Never let zeroing our working copy mutate the caller's credential.
  return Buffer.from(secret)
}

function ensureEncryptionNotCanceled(
  signal: AbortSignal | undefined,
  action: 'encryption' | 'decryption'
): void {
  if (signal?.aborted) {
    const error = new Error(`Cheap LFS ${action} was canceled.`)
    error.name = 'AbortError'
    throw error
  }
}

function scryptOptions(kdf: ICheapLfsKdfParameters): {
  readonly N: number
  readonly r: number
  readonly p: number
  readonly maxmem: number
} {
  const valid =
    Number.isSafeInteger(kdf.logN) &&
    kdf.logN >= 1 &&
    kdf.logN <= MaximumLogN &&
    Number.isSafeInteger(kdf.blockSize) &&
    kdf.blockSize >= 1 &&
    kdf.blockSize <= MaximumBlockSize &&
    Number.isSafeInteger(kdf.parallelism) &&
    kdf.parallelism >= 1 &&
    kdf.parallelism <= MaximumParallelism

  const N = valid ? 2 ** kdf.logN : 0
  const estimatedBytes =
    valid && Number.isSafeInteger(N)
      ? 128 * N * kdf.blockSize + 128 * kdf.blockSize * kdf.parallelism
      : Number.POSITIVE_INFINITY
  const workFactor = valid
    ? N * kdf.blockSize * kdf.parallelism
    : Number.POSITIVE_INFINITY
  if (
    !valid ||
    !Number.isSafeInteger(estimatedBytes) ||
    estimatedBytes + ScryptMemoryReserveBytes > MaximumScryptMemoryBytes ||
    !Number.isSafeInteger(workFactor) ||
    workFactor > MaximumScryptWorkFactor
  ) {
    throw new CheapLfsEncryptionError(
      'The Cheap LFS payload header carries unusable key-derivation parameters.'
    )
  }
  return {
    N,
    r: kdf.blockSize,
    p: kdf.parallelism,
    maxmem: estimatedBytes + ScryptMemoryReserveBytes,
  }
}

function requireKdfParameters(kdf: ICheapLfsKdfParameters): void {
  scryptOptions(kdf)
}

async function deriveKey(
  password: Buffer,
  salt: Buffer,
  kdf: ICheapLfsKdfParameters
): Promise<Buffer> {
  return await scrypt(password, salt, KeyLengthBytes, scryptOptions(kdf))
}

function buildFixedHeader(
  kdf: ICheapLfsKdfParameters,
  saltLength: number,
  nonceLength: number,
  tagLength: number
): Buffer {
  const header = Buffer.alloc(HeaderFixedBytes)
  let offset = 0
  Magic.copy(header, offset)
  offset += Magic.length
  offset = header.writeUInt16LE(CheapLfsEncryptionFormatVersion, offset)
  offset = header.writeUInt16LE(CipherAesGcm, offset)
  offset = header.writeUInt16LE(KdfScrypt, offset)
  offset = header.writeUInt16LE(0, offset)
  offset = header.writeUInt32LE(kdf.logN, offset)
  offset = header.writeUInt32LE(kdf.blockSize, offset)
  offset = header.writeUInt32LE(kdf.parallelism, offset)
  offset = header.writeUInt32LE(saltLength, offset)
  offset = header.writeUInt32LE(nonceLength, offset)
  header.writeUInt32LE(tagLength, offset)
  return header
}

function parseHeaderPrefix(
  prefix: Buffer,
  totalSizeInBytes: number
): ICheapLfsEncryptionHeader {
  if (
    prefix.length < HeaderFixedBytes ||
    !Number.isSafeInteger(totalSizeInBytes) ||
    totalSizeInBytes < HeaderFixedBytes
  ) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS payload is too short to be encrypted by this app.'
    )
  }
  if (!timingSafeEqual(prefix.subarray(0, Magic.length), Magic)) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS payload was not encrypted by this app.'
    )
  }

  let offset = Magic.length
  const formatVersion = prefix.readUInt16LE(offset)
  offset += 2
  const cipherId = prefix.readUInt16LE(offset)
  offset += 2
  const kdfId = prefix.readUInt16LE(offset)
  offset += 2
  const reserved = prefix.readUInt16LE(offset)
  offset += 2

  if (formatVersion !== CheapLfsEncryptionFormatVersion) {
    throw new CheapLfsEncryptionError(
      `This Cheap LFS payload uses encryption format ${formatVersion}, which this version cannot read.`
    )
  }
  if (cipherId !== CipherAesGcm || kdfId !== KdfScrypt || reserved !== 0) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS payload uses an unsupported cipher or key-derivation function.'
    )
  }

  const logN = prefix.readUInt32LE(offset)
  offset += 4
  const blockSize = prefix.readUInt32LE(offset)
  offset += 4
  const parallelism = prefix.readUInt32LE(offset)
  offset += 4
  const saltLength = prefix.readUInt32LE(offset)
  offset += 4
  const nonceLength = prefix.readUInt32LE(offset)
  offset += 4
  const tagLength = prefix.readUInt32LE(offset)
  offset += 4

  const kdf = { logN, blockSize, parallelism }
  requireKdfParameters(kdf)
  if (
    saltLength !== SaltLengthBytes ||
    nonceLength !== NonceLengthBytes ||
    tagLength !== TagLengthBytes
  ) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS payload declares salt, nonce, or tag lengths this version cannot read.'
    )
  }

  const ciphertextOffset = offset + saltLength + nonceLength + tagLength
  if (totalSizeInBytes < ciphertextOffset) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS payload is truncated before its ciphertext.'
    )
  }
  return {
    formatVersion,
    kdf,
    saltLength,
    nonceLength,
    tagLength,
    ciphertextOffset,
  }
}

/**
 * Read the header without deriving a key or decrypting. Lets callers verify
 * stored-object metadata before asking for a password.
 */
export function readCheapLfsEncryptionHeader(
  payload: Buffer
): ICheapLfsEncryptionHeader {
  return parseHeaderPrefix(payload, payload.length)
}

/** True when `payload` carries this app's encryption container. */
export function isEncryptedCheapLfsPayload(payload: Buffer): boolean {
  return (
    payload.length >= Magic.length &&
    payload.subarray(0, Magic.length).equals(Magic)
  )
}

interface IEncryptionMetadata {
  readonly header: ICheapLfsEncryptionHeader
  readonly salt: Buffer
  readonly nonce: Buffer
  readonly tag: Buffer
}

function encryptionMetadataFromBuffer(payload: Buffer): IEncryptionMetadata {
  const header = readCheapLfsEncryptionHeader(payload)
  let offset = HeaderFixedBytes
  const salt = Buffer.from(payload.subarray(offset, offset + header.saltLength))
  offset += header.saltLength
  const nonce = Buffer.from(
    payload.subarray(offset, offset + header.nonceLength)
  )
  offset += header.nonceLength
  const tag = Buffer.from(payload.subarray(offset, offset + header.tagLength))
  return { header, salt, nonce, tag }
}

async function readAll(
  file: Awaited<ReturnType<typeof open>>,
  buffer: Buffer,
  position: number
): Promise<number> {
  let totalBytesRead = 0
  while (totalBytesRead < buffer.length) {
    const { bytesRead } = await file.read(
      buffer,
      totalBytesRead,
      buffer.length - totalBytesRead,
      position + totalBytesRead
    )
    if (bytesRead <= 0) {
      break
    }
    totalBytesRead += bytesRead
  }
  return totalBytesRead
}

async function encryptionMetadataFromFile(
  sourcePath: string
): Promise<IEncryptionMetadata> {
  const sizeInBytes = (await stat(sourcePath)).size
  const file = await open(sourcePath, 'r')
  try {
    const fixed = Buffer.alloc(HeaderFixedBytes)
    try {
      const bytesRead = await readAll(file, fixed, 0)
      if (bytesRead !== fixed.length) {
        throw new CheapLfsEncryptionError(
          'This Cheap LFS payload is too short to be encrypted by this app.'
        )
      }
      const header = parseHeaderPrefix(fixed, sizeInBytes)
      const metadata = Buffer.alloc(
        header.saltLength + header.nonceLength + header.tagLength
      )
      const metadataBytesRead = await readAll(file, metadata, HeaderFixedBytes)
      if (metadataBytesRead !== metadata.length) {
        metadata.fill(0)
        throw new CheapLfsEncryptionError(
          'This Cheap LFS payload is truncated before its ciphertext.'
        )
      }
      const saltEnd = header.saltLength
      const nonceEnd = saltEnd + header.nonceLength
      const salt = Buffer.from(metadata.subarray(0, saltEnd))
      const nonce = Buffer.from(metadata.subarray(saltEnd, nonceEnd))
      const tag = Buffer.from(metadata.subarray(nonceEnd))
      metadata.fill(0)
      return { header, salt, nonce, tag }
    } finally {
      fixed.fill(0)
    }
  } finally {
    await file.close()
  }
}

async function hashFile(
  path: string,
  signal?: AbortSignal
): Promise<{ readonly sha256: string; readonly sizeInBytes: number }> {
  return await new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Cheap LFS encryption was canceled.')
      error.name = 'AbortError'
      reject(error)
      return
    }
    const hash = createHash('sha256')
    let sizeInBytes = 0
    const stream = createReadStream(path)
    const onAbort = () => {
      const error = new Error('Cheap LFS encryption was canceled.')
      error.name = 'AbortError'
      stream.destroy(error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    stream.on('data', chunk => {
      const bytes = chunk as Buffer
      hash.update(bytes)
      sizeInBytes += bytes.length
    })
    stream.once('error', error => {
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
    stream.once('end', () => {
      signal?.removeEventListener('abort', onAbort)
      resolve({ sha256: hash.digest('hex'), sizeInBytes })
    })
  })
}

async function writeAll(
  file: Awaited<ReturnType<typeof open>>,
  buffer: Buffer,
  position: number
): Promise<void> {
  let written = 0
  while (written < buffer.length) {
    const result = await file.write(
      buffer,
      written,
      buffer.length - written,
      position + written
    )
    if (result.bytesWritten <= 0) {
      throw new CheapLfsEncryptionError(
        'Cheap LFS could not finish writing its encrypted payload.'
      )
    }
    written += result.bytesWritten
  }
}

async function rethrowAfterOwnedDestinationCleanup(
  destinationPath: string,
  error: unknown
): Promise<never> {
  try {
    await unlink(destinationPath)
  } catch (cleanupError) {
    const primaryMessage =
      error instanceof Error
        ? error.message
        : 'Cheap LFS payload processing failed.'
    throw new AggregateError(
      [error, cleanupError],
      `${primaryMessage} Cheap LFS also could not remove its partial temporary output safely.`
    )
  }
  throw error
}

/**
 * Encrypt an in-memory payload. Kept for small callers and format tests; large
 * Cheap LFS uploads use {@link encryptCheapLfsPayloadRangeToFile}.
 */
export async function encryptCheapLfsPayload(
  plaintext: Buffer,
  secret: CheapLfsEncryptionSecret,
  kdf: ICheapLfsKdfParameters = defaultCheapLfsKdfParameters
): Promise<Buffer> {
  requireKdfParameters(kdf)
  const password = copySecret(secret)
  const salt = randomBytes(SaltLengthBytes)
  const nonce = randomBytes(NonceLengthBytes)
  let key: Buffer | undefined
  let tag: Buffer | undefined
  let updated: Buffer | undefined
  let finalized: Buffer | undefined
  try {
    key = await deriveKey(password, salt, kdf)
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: TagLengthBytes,
    })
    updated = cipher.update(plaintext)
    finalized = cipher.final()
    tag = cipher.getAuthTag()
    const header = buildFixedHeader(kdf, salt.length, nonce.length, tag.length)
    return Buffer.concat([header, salt, nonce, tag, updated, finalized])
  } finally {
    password.fill(0)
    key?.fill(0)
    salt.fill(0)
    nonce.fill(0)
    tag?.fill(0)
    updated?.fill(0)
    finalized?.fill(0)
  }
}

/**
 * Decrypt an in-memory payload. Authentication failure discards and zeroes the
 * partial plaintext emitted by `update()` before throwing its typed error.
 */
export async function decryptCheapLfsPayload(
  payload: Buffer,
  secret: CheapLfsEncryptionSecret
): Promise<Buffer> {
  const password = copySecret(secret)
  let metadata: IEncryptionMetadata | undefined
  let key: Buffer | undefined
  let updated: Buffer | undefined
  let finalized: Buffer | undefined
  try {
    metadata = encryptionMetadataFromBuffer(payload)
    key = await deriveKey(password, metadata.salt, metadata.header.kdf)
    const decipher = createDecipheriv('aes-256-gcm', key, metadata.nonce, {
      authTagLength: metadata.header.tagLength,
    })
    decipher.setAuthTag(metadata.tag)
    updated = decipher.update(
      payload.subarray(metadata.header.ciphertextOffset)
    )
    try {
      finalized = decipher.final()
    } catch {
      throw new CheapLfsAuthenticationError()
    }
    return Buffer.concat([updated, finalized])
  } finally {
    password.fill(0)
    key?.fill(0)
    metadata?.salt.fill(0)
    metadata?.nonce.fill(0)
    metadata?.tag.fill(0)
    updated?.fill(0)
    finalized?.fill(0)
  }
}

/**
 * Prove the complete production cipher/KDF path before a repository enables
 * encryption. The random test block never leaves memory, and every copy is
 * cleared after the authenticated round trip.
 */
export async function verifyCheapLfsEncryptionSecret(
  secret: CheapLfsEncryptionSecret,
  kdf: ICheapLfsKdfParameters = defaultCheapLfsKdfParameters
): Promise<void> {
  const testBlock = randomBytes(64)
  let encrypted: Buffer | undefined
  let decrypted: Buffer | undefined
  try {
    encrypted = await encryptCheapLfsPayload(testBlock, secret, kdf)
    decrypted = await decryptCheapLfsPayload(encrypted, secret)
    if (
      decrypted.length !== testBlock.length ||
      !timingSafeEqual(decrypted, testBlock)
    ) {
      throw new CheapLfsEncryptionError(
        'Cheap LFS could not verify this password with an authenticated test block. Encryption remains off.'
      )
    }
  } finally {
    testBlock.fill(0)
    encrypted?.fill(0)
    decrypted?.fill(0)
  }
}

/**
 * Stream-encrypt exactly one plaintext range into a new container file.
 *
 * The destination is created exclusively and deleted on every failure. A
 * plaintext hash is computed in the same pass so the caller can prove the
 * stable range it intended to encrypt was the range actually consumed.
 */
export async function encryptCheapLfsPayloadRangeToFile(
  sourcePath: string,
  destinationPath: string,
  offset: number,
  length: number,
  secret: CheapLfsEncryptionSecret,
  kdf: ICheapLfsKdfParameters = defaultCheapLfsKdfParameters,
  signal?: AbortSignal
): Promise<ICheapLfsEncryptedRangeResult> {
  ensureEncryptionNotCanceled(signal, 'encryption')
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(length) ||
    length < 0
  ) {
    throw new CheapLfsEncryptionError(
      'Cheap LFS cannot encrypt this file range.'
    )
  }
  const sourceSize = (await stat(sourcePath)).size
  if (offset + length > sourceSize) {
    throw new CheapLfsEncryptionError(
      'The Cheap LFS source changed size before its range could be encrypted.'
    )
  }

  requireKdfParameters(kdf)
  const password = copySecret(secret)
  const salt = randomBytes(SaltLengthBytes)
  const nonce = randomBytes(NonceLengthBytes)
  const placeholderTag = Buffer.alloc(TagLengthBytes)
  let key: Buffer | undefined
  let tag: Buffer | undefined
  let ownsDestination = false
  try {
    ensureEncryptionNotCanceled(signal, 'encryption')
    key = await deriveKey(password, salt, kdf)
    ensureEncryptionNotCanceled(signal, 'encryption')
    const header = buildFixedHeader(
      kdf,
      salt.length,
      nonce.length,
      placeholderTag.length
    )
    const prefix = Buffer.concat([header, salt, nonce, placeholderTag])
    const initialDestination = await open(destinationPath, 'wx+')
    ownsDestination = true
    try {
      await writeAll(initialDestination, prefix, 0)
      await initialDestination.sync()
    } finally {
      await initialDestination.close()
    }

    const plaintextHash = createHash('sha256')
    let plaintextSizeInBytes = 0
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        const bytes = chunk as Buffer
        plaintextHash.update(bytes)
        plaintextSizeInBytes += bytes.length
        callback(null, bytes)
      },
    })
    const source =
      length === 0
        ? Readable.from([])
        : createReadStream(sourcePath, {
            start: offset,
            end: offset + length - 1,
          })
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: TagLengthBytes,
    })
    await pipeline(
      source,
      meter,
      cipher,
      createWriteStream(destinationPath, {
        flags: 'r+',
        start: prefix.length,
      }),
      { signal }
    )
    if (plaintextSizeInBytes !== length) {
      throw new CheapLfsEncryptionError(
        'The Cheap LFS source changed size while its range was being encrypted.'
      )
    }
    tag = cipher.getAuthTag()
    const tagOffset = HeaderFixedBytes + salt.length + nonce.length
    const destination = await open(destinationPath, 'r+')
    try {
      await writeAll(destination, tag, tagOffset)
      await destination.sync()
    } finally {
      await destination.close()
    }
    const stored = await hashFile(destinationPath, signal)
    return {
      plaintextSha256: plaintextHash.digest('hex'),
      plaintextSizeInBytes,
      storedSha256: stored.sha256,
      storedSizeInBytes: stored.sizeInBytes,
    }
  } catch (error) {
    if (ownsDestination) {
      return await rethrowAfterOwnedDestinationCleanup(destinationPath, error)
    }
    throw error
  } finally {
    password.fill(0)
    key?.fill(0)
    salt.fill(0)
    nonce.fill(0)
    tag?.fill(0)
    placeholderTag.fill(0)
  }
}

/**
 * Authenticate and stream-decrypt one encrypted container into a new file.
 *
 * GCM may emit bytes before `final()` verifies its tag, so the destination is
 * deliberately private and is deleted on every failure. Callers must still
 * compare the returned plaintext receipt with the pointer before publishing.
 */
export async function decryptCheapLfsPayloadFileToFile(
  sourcePath: string,
  destinationPath: string,
  secret: CheapLfsEncryptionSecret,
  signal?: AbortSignal
): Promise<ICheapLfsDecryptedFileResult> {
  ensureEncryptionNotCanceled(signal, 'decryption')
  const password = copySecret(secret)
  let metadata: IEncryptionMetadata | undefined
  let key: Buffer | undefined
  let ownsDestination = false
  try {
    metadata = await encryptionMetadataFromFile(sourcePath)
    ensureEncryptionNotCanceled(signal, 'decryption')
    key = await deriveKey(password, metadata.salt, metadata.header.kdf)
    ensureEncryptionNotCanceled(signal, 'decryption')
    const decipher = createDecipheriv('aes-256-gcm', key, metadata.nonce, {
      authTagLength: metadata.header.tagLength,
    })
    decipher.setAuthTag(metadata.tag)
    const plaintextHash = createHash('sha256')
    let plaintextSizeInBytes = 0
    const totalSize = (await stat(sourcePath)).size
    const ciphertextLength = totalSize - metadata.header.ciphertextOffset
    const source =
      ciphertextLength === 0
        ? Readable.from([])
        : createReadStream(sourcePath, {
            start: metadata.header.ciphertextOffset,
            signal,
          })
    ensureEncryptionNotCanceled(signal, 'decryption')
    const destination = await open(destinationPath, 'wx')
    ownsDestination = true
    let writePosition = 0
    try {
      for await (const chunk of source) {
        const plaintext = decipher.update(chunk as Buffer)
        try {
          await writeAll(destination, plaintext, writePosition)
          plaintextHash.update(plaintext)
          plaintextSizeInBytes += plaintext.length
          writePosition += plaintext.length
        } finally {
          plaintext.fill(0)
        }
      }
      let finalPlaintext: Buffer
      try {
        finalPlaintext = decipher.final()
      } catch {
        throw new CheapLfsAuthenticationError()
      }
      try {
        await writeAll(destination, finalPlaintext, writePosition)
        plaintextHash.update(finalPlaintext)
        plaintextSizeInBytes += finalPlaintext.length
      } finally {
        finalPlaintext.fill(0)
      }
      await destination.sync()
    } finally {
      await destination.close()
    }
    return {
      plaintextSha256: plaintextHash.digest('hex'),
      plaintextSizeInBytes,
    }
  } catch (error) {
    if (ownsDestination) {
      return await rethrowAfterOwnedDestinationCleanup(destinationPath, error)
    }
    throw error
  } finally {
    password.fill(0)
    key?.fill(0)
    metadata?.salt.fill(0)
    metadata?.nonce.fill(0)
    metadata?.tag.fill(0)
  }
}
