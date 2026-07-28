/**
 * Optional password encryption for Cheap LFS payloads.
 *
 * Cheap LFS objects live in a GitHub Release or an OCI registry — a public or
 * semi-public place. This module encrypts the bytes before they are uploaded,
 * so the provider stores ciphertext, while the pointer keeps enough plain
 * metadata for anyone to verify the stored asset is intact **without** holding
 * the password.
 *
 * Deliberate non-goal: encrypting working-tree files in place. That would
 * defeat Git's diffing (a ciphertext blob has no meaningful line diff) and
 * make every save rewrite the whole file, so it is not implemented here.
 *
 * Format, little-endian where numeric:
 *
 *   magic      8 bytes   "DMCLFS\0\x01"
 *   version    2 bytes   format version (currently 1)
 *   cipherId   2 bytes   1 = AES-256-GCM
 *   kdfId      2 bytes   1 = scrypt
 *   reserved   2 bytes   zero, keeps the header 8-byte aligned
 *   logN       4 bytes   scrypt cost, stored as the exponent
 *   blockSize  4 bytes   scrypt r
 *   parallel   4 bytes   scrypt p
 *   saltLen    4 bytes
 *   nonceLen   4 bytes
 *   tagLen     4 bytes
 *   salt       saltLen
 *   nonce      nonceLen
 *   tag        tagLen
 *   ciphertext remainder
 *
 * Every KDF parameter is recorded rather than assumed, so cost can be raised
 * later without orphaning payloads written by an earlier build.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCallback) as (
  password: Buffer | string,
  salt: Buffer,
  keylen: number,
  options: { readonly N: number; readonly r: number; readonly p: number }
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

/**
 * scrypt cost. N is stored as its exponent so the header stays fixed-width.
 * 2^17 with r=8 needs roughly 128 MiB, which is deliberately painful for an
 * attacker guessing passwords and unremarkable once per pinned file.
 */
const DefaultLogN = 17
const DefaultBlockSize = 8
const DefaultParallelism = 1

/** Refuse absurd parameters from a hostile or corrupt header before spending memory. */
const MaximumLogN = 22
const MaximumBlockSize = 32
const MaximumParallelism = 16

export class CheapLfsEncryptionError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CheapLfsEncryptionError'
  }
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

function requirePassword(password: string): void {
  if (typeof password !== 'string' || password.length === 0) {
    throw new CheapLfsEncryptionError(
      'A password is required to encrypt or decrypt a Cheap LFS payload.'
    )
  }
}

function requireKdfParameters(kdf: ICheapLfsKdfParameters): void {
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

  if (!valid) {
    throw new CheapLfsEncryptionError(
      'The Cheap LFS payload header carries unusable key-derivation parameters.'
    )
  }
}

async function deriveKey(
  password: string,
  salt: Buffer,
  kdf: ICheapLfsKdfParameters
): Promise<Buffer> {
  requireKdfParameters(kdf)
  // scrypt's own maxmem defaults below what a high cost needs, so raise it in
  // step with the parameters rather than letting derivation fail opaquely.
  const N = 2 ** kdf.logN
  return scrypt(password, salt, KeyLengthBytes, {
    N,
    r: kdf.blockSize,
    p: kdf.parallelism,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ maxmem: 256 * N * kdf.blockSize } as any),
  })
}

/**
 * Encrypt `plaintext` under `password`.
 *
 * A fresh salt and a fresh nonce are drawn on every call, so re-encrypting the
 * same bytes with the same password never reuses a nonce — reuse under one key
 * is what breaks GCM outright.
 */
export async function encryptCheapLfsPayload(
  plaintext: Buffer,
  password: string,
  kdf: ICheapLfsKdfParameters = defaultCheapLfsKdfParameters
): Promise<Buffer> {
  requirePassword(password)
  requireKdfParameters(kdf)

  const salt = randomBytes(SaltLengthBytes)
  const nonce = randomBytes(NonceLengthBytes)
  const key = await deriveKey(password, salt, kdf)

  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: TagLengthBytes,
  })
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

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
  offset = header.writeUInt32LE(salt.length, offset)
  offset = header.writeUInt32LE(nonce.length, offset)
  header.writeUInt32LE(tag.length, offset)

  return Buffer.concat([header, salt, nonce, tag, ciphertext])
}

/**
 * Read the header without deriving a key or decrypting. Lets a caller report
 * "this asset is encrypted" and check integrity metadata cheaply.
 */
export function readCheapLfsEncryptionHeader(
  payload: Buffer
): ICheapLfsEncryptionHeader {
  if (payload.length < HeaderFixedBytes) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS payload is too short to be encrypted by this app.'
    )
  }
  if (!timingSafeEqual(payload.subarray(0, Magic.length), Magic)) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS payload was not encrypted by this app.'
    )
  }

  let offset = Magic.length
  const formatVersion = payload.readUInt16LE(offset)
  offset += 2
  const cipherId = payload.readUInt16LE(offset)
  offset += 2
  const kdfId = payload.readUInt16LE(offset)
  offset += 4 // kdfId plus the reserved pair

  if (formatVersion !== CheapLfsEncryptionFormatVersion) {
    throw new CheapLfsEncryptionError(
      `This Cheap LFS payload uses encryption format ${formatVersion}, which this version cannot read.`
    )
  }
  if (cipherId !== CipherAesGcm || kdfId !== KdfScrypt) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS payload uses an unsupported cipher or key-derivation function.'
    )
  }

  const logN = payload.readUInt32LE(offset)
  offset += 4
  const blockSize = payload.readUInt32LE(offset)
  offset += 4
  const parallelism = payload.readUInt32LE(offset)
  offset += 4
  const saltLength = payload.readUInt32LE(offset)
  offset += 4
  const nonceLength = payload.readUInt32LE(offset)
  offset += 4
  const tagLength = payload.readUInt32LE(offset)
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
  if (payload.length < ciphertextOffset) {
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

/** True when `payload` carries this app's encryption container. */
export function isEncryptedCheapLfsPayload(payload: Buffer): boolean {
  return (
    payload.length >= Magic.length &&
    payload.subarray(0, Magic.length).equals(Magic)
  )
}

/**
 * Decrypt a payload written by {@link encryptCheapLfsPayload}.
 *
 * The GCM tag is verified before any plaintext is returned, so a tampered,
 * truncated, or nonce-swapped payload raises instead of yielding bytes. A
 * wrong password fails the same way — the caller cannot distinguish the two,
 * which is the correct behaviour: neither should produce output.
 */
export async function decryptCheapLfsPayload(
  payload: Buffer,
  password: string
): Promise<Buffer> {
  requirePassword(password)

  const header = readCheapLfsEncryptionHeader(payload)

  let offset = HeaderFixedBytes
  const salt = payload.subarray(offset, offset + header.saltLength)
  offset += header.saltLength
  const nonce = payload.subarray(offset, offset + header.nonceLength)
  offset += header.nonceLength
  const tag = payload.subarray(offset, offset + header.tagLength)

  const ciphertext = payload.subarray(header.ciphertextOffset)
  const key = await deriveKey(password, salt, header.kdf)

  const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
    authTagLength: header.tagLength,
  })
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    // `final()` throws when the tag does not verify. Never leak which of the
    // two causes it was, and never return the partial plaintext `update()`
    // produced — unauthenticated bytes are not a result.
    throw new CheapLfsEncryptionError(
      'The Cheap LFS payload could not be decrypted: the password is wrong or the stored bytes were altered.'
    )
  }
}
