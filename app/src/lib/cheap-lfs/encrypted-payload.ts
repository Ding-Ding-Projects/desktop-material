/**
 * Turning an encrypted Cheap LFS payload into pointer records, and back.
 *
 * `payload-encryption.ts` owns the cryptography — AES-256-GCM under a scrypt
 * key, one fresh salt and nonce per call. This module owns the question that
 * cryptography does not answer: **what the committed pointer records about an
 * encrypted asset, and who can check it.**
 *
 * ## What is hashed, and why both
 *
 * A pointer is committed to Git and read by anyone with the repository. An
 * encrypted part therefore records *two* digests:
 *
 * | Recorded | Over | Checked by | When |
 * | --- | --- | --- | --- |
 * | `sha256` + `size` | the **plaintext** | the app, holding the password | after decrypting |
 * | `stored-sha256` + `stored-size` | the **stored container** | **anyone, with no password at all** | on download |
 *
 * The stored pair is the point of this design. Cheap LFS objects live in a
 * public or semi-public place, and "is the object at the provider still the
 * object we published?" has to be answerable by a client that cannot read the
 * object. Recording only the plaintext digest would make integrity a privilege
 * of whoever knows the password; recording only the ciphertext digest would let
 * a decryption bug publish wrong bytes over the user's file. So both are
 * recorded, and both are enforced, in that order.
 *
 * The plaintext pair also has to stay where it is for a second reason: the head
 * `size` and `sha256` fields are the tracked file's identity everywhere else in
 * this feature. The never-re-pin check compares a working-tree content hash to
 * them, and post-commit payload restore re-hashes its retained copy against
 * them. Ciphertext measurements in those fields would silently break both.
 *
 * **The honest cost of that choice:** a committed pointer discloses the exact
 * SHA-256 and byte size of the plaintext. Encryption hides the *contents* of
 * the object at the provider; it does not hide that a file of exactly this size
 * with exactly this digest is stored there. Someone who can guess the file can
 * confirm the guess from the pointer alone. That is a real limitation and it is
 * stated rather than papered over.
 *
 * ## Order of checks
 *
 * `openCheapLfsEncryptedPart` verifies the stored container *before* deriving a
 * key. A corrupted download is then reported as a corrupted download rather
 * than as a wrong password, and no memory-hard derivation is spent on bytes
 * that already failed. The GCM tag is still the authority on authenticity; the
 * plaintext digest afterwards is defence in depth against this app's own
 * assembly, truncation, and ordering mistakes, which no tag can catch.
 */
import { createHash } from 'crypto'
import {
  CheapLfsEncryptionError,
  CheapLfsEncryptionFormatVersion,
  decryptCheapLfsPayload,
  encryptCheapLfsPayload,
  ICheapLfsKdfParameters,
  isEncryptedCheapLfsPayload,
} from './payload-encryption'
import { ICheapLfsPointerPart, isEncryptedCheapLfsPointerPart } from './pointer'

/**
 * The part size an encrypted pin splits a file into, deliberately smaller than
 * the 500 MiB raw part size.
 *
 * A container is sealed and re-opened as whole buffers, because a GCM tag
 * covers the whole message and is worth nothing if the app hands out plaintext
 * before verifying it. Peak memory for one part is therefore roughly three
 * times this number — the plaintext, the container, and the verification copy —
 * so the bound is chosen to keep that near 200 MiB rather than near 1.5 GiB.
 * Encryption costs more assets and more key derivations than a raw pin; that is
 * the trade, and it is documented rather than hidden.
 */
export const CHEAP_LFS_ENCRYPTED_PART_SIZE_BYTES = 64 * 1024 * 1024

/** What a caller must supply to pin a file as ciphertext. */
export interface ICheapLfsPinEncryption {
  /** Held in memory for the duration of the pin and never persisted here. */
  readonly password: string
  /** Omitted means the current default cost; a header records what was used. */
  readonly kdf?: ICheapLfsKdfParameters
}

/** One sealed part: the bytes to upload, and the pointer record naming them. */
export interface ICheapLfsSealedPart {
  /** The container to store at the provider. */
  readonly container: Buffer
  /** Container byte size, which is what the release asset will report. */
  readonly storedSizeInBytes: number
  /** Container SHA-256 — the password-free integrity record. */
  readonly storedSha256: string
  /** Plaintext SHA-256, carried through to the pointer unchanged. */
  readonly sha256: string
  /** Plaintext byte size, carried through to the pointer unchanged. */
  readonly sizeInBytes: number
}

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Seal one plaintext part and immediately prove the container opens back to
 * exactly those bytes.
 *
 * The re-open is not ceremony. It happens here, while the plaintext is still in
 * hand and before anything is uploaded or any pointer replaces a user's file,
 * because this is the last moment at which a container that cannot be opened is
 * a recoverable problem instead of a destroyed file. It costs a second key
 * derivation per part, which is the price of never publishing an unopenable
 * object.
 */
export async function sealCheapLfsEncryptedPart(
  plaintext: Buffer,
  encryption: ICheapLfsPinEncryption
): Promise<ICheapLfsSealedPart> {
  const container = await encryptCheapLfsPayload(
    plaintext,
    encryption.password,
    encryption.kdf
  )
  const sealed: ICheapLfsSealedPart = {
    container,
    storedSizeInBytes: container.length,
    storedSha256: sha256Of(container),
    sha256: sha256Of(plaintext),
    sizeInBytes: plaintext.length,
  }

  const reopened = await decryptCheapLfsPayload(container, encryption.password)
  if (
    reopened.length !== sealed.sizeInBytes ||
    sha256Of(reopened) !== sealed.sha256
  ) {
    throw new CheapLfsEncryptionError(
      'The encrypted Cheap LFS payload did not decrypt back to the original bytes, so nothing was uploaded and the file was left alone.'
    )
  }
  return sealed
}

/**
 * Build the pointer record for a sealed part, given the asset name it took.
 * Takes the measurements rather than the container so a caller that streamed
 * the seal to disk — which is what the real pin path does — can use it without
 * holding a payload-sized buffer.
 */
export function cheapLfsEncryptedPointerPart(
  name: string,
  sealed: Omit<ICheapLfsSealedPart, 'container'>
): ICheapLfsPointerPart {
  return {
    name,
    sizeInBytes: sealed.sizeInBytes,
    sha256: sealed.sha256,
    encryptedStoredSizeInBytes: sealed.storedSizeInBytes,
    encryptedStoredSha256: sealed.storedSha256,
  }
}

/** The container format version an encrypted pointer written now declares. */
export function cheapLfsEncryptionFormatVersionForNewPins(): number {
  return CheapLfsEncryptionFormatVersion
}

/**
 * Verify a downloaded container against the pointer **without the password**.
 *
 * This is the check that makes an encrypted object's integrity everybody's
 * business rather than only the key holder's: given the committed pointer and
 * the stored bytes, any client can prove the provider still holds what was
 * published. It throws on any size or digest drift, so a truncated, swapped, or
 * re-uploaded asset fails closed before a key is ever derived.
 */
export function verifyStoredCheapLfsEncryptedPart(
  part: ICheapLfsPointerPart,
  storedBytes: Buffer
): void {
  if (!isEncryptedCheapLfsPointerPart(part)) {
    throw new CheapLfsEncryptionError(
      'This Cheap LFS pointer part is not an encrypted part.'
    )
  }
  if (storedBytes.length !== part.encryptedStoredSizeInBytes) {
    throw new CheapLfsEncryptionError(
      'A stored encrypted Cheap LFS part does not match the size recorded in the pointer. The pointer was left in place.'
    )
  }
  if (sha256Of(storedBytes) !== part.encryptedStoredSha256) {
    throw new CheapLfsEncryptionError(
      'A stored encrypted Cheap LFS part does not match the digest recorded in the pointer. The pointer was left in place.'
    )
  }
  if (!isEncryptedCheapLfsPayload(storedBytes)) {
    throw new CheapLfsEncryptionError(
      'A stored Cheap LFS part is recorded as encrypted but does not carry this app’s encryption container.'
    )
  }
}

/**
 * Open a downloaded container: stored integrity first, then the GCM tag, then
 * the recorded plaintext size and digest. Every one of the three fails closed,
 * and a wrong password is indistinguishable from tampering by design.
 */
export async function openCheapLfsEncryptedPart(
  part: ICheapLfsPointerPart,
  storedBytes: Buffer,
  password: string
): Promise<Buffer> {
  verifyStoredCheapLfsEncryptedPart(part, storedBytes)
  const plaintext = await decryptCheapLfsPayload(storedBytes, password)
  if (
    plaintext.length !== part.sizeInBytes ||
    sha256Of(plaintext) !== part.sha256
  ) {
    throw new CheapLfsEncryptionError(
      'A decrypted Cheap LFS part does not match the pointer. The pointer was left in place.'
    )
  }
  return plaintext
}
