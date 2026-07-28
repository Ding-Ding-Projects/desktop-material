import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createHash, randomBytes } from 'crypto'
import {
  cheapLfsEncryptedPointerPart,
  cheapLfsEncryptionFormatVersionForNewPins,
  CHEAP_LFS_ENCRYPTED_PART_SIZE_BYTES,
  openCheapLfsEncryptedPart,
  sealCheapLfsEncryptedPart,
  verifyStoredCheapLfsEncryptedPart,
} from '../../../src/lib/cheap-lfs/encrypted-payload'
import { CheapLfsEncryptionError } from '../../../src/lib/cheap-lfs/payload-encryption'
import {
  cheapLfsPartStoredSizeInBytes,
  CHEAP_LFS_POINTER_VERSION,
  ICheapLfsPointer,
  isEncryptedCheapLfsPointer,
  isEncryptedCheapLfsPointerPart,
  parseCheapLfsPointer,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'

// scrypt at the shipping 2^17 cost is deliberately expensive; every case here
// is about the *records* around the container rather than the cost of the key
// derivation, which `payload-encryption-test.ts` already covers.
const fastKdf = { logN: 2, blockSize: 1, parallelism: 1 }
const passphrase = 'correct-horse-battery-staple-QQ7'
const wrongPassphrase = 'nothing-like-the-other-one-ZZ42'

const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')

const seal = (plaintext: Buffer, password: string = passphrase) =>
  sealCheapLfsEncryptedPart(plaintext, { password, kdf: fastKdf })

describe('Cheap LFS encrypted payload records', () => {
  it('records the plaintext pair and the stored pair separately', async () => {
    const plaintext = randomBytes(2048)
    const sealed = await seal(plaintext)

    assert.equal(sealed.sizeInBytes, plaintext.length)
    assert.equal(sealed.sha256, sha256(plaintext))
    assert.equal(sealed.storedSizeInBytes, sealed.container.length)
    assert.equal(sealed.storedSha256, sha256(sealed.container))
    // The container is a header, salt, nonce and tag wrapped around the
    // plaintext, so it is always strictly larger than what it protects.
    assert.ok(sealed.storedSizeInBytes > sealed.sizeInBytes)
    assert.notEqual(sealed.storedSha256, sealed.sha256)
  })

  it('verifies a stored container with no password at all', async () => {
    const plaintext = randomBytes(1024)
    const sealed = await seal(plaintext)
    const part = cheapLfsEncryptedPointerPart('payload.part001', sealed)

    // This is the whole point of recording the stored digest: a client that
    // cannot read the object can still prove the provider holds what was
    // published. No password is in scope anywhere in this assertion.
    verifyStoredCheapLfsEncryptedPart(part, sealed.container)
    assert.equal(cheapLfsPartStoredSizeInBytes(part), sealed.container.length)
  })

  it('fails closed when the stored container is one byte different', async () => {
    const sealed = await seal(randomBytes(512))
    const part = cheapLfsEncryptedPointerPart('payload.part001', sealed)
    const tampered = Buffer.from(sealed.container)
    tampered[tampered.length - 1] ^= 0x01

    assert.throws(
      () => verifyStoredCheapLfsEncryptedPart(part, tampered),
      CheapLfsEncryptionError
    )
    await assert.rejects(
      openCheapLfsEncryptedPart(part, tampered, passphrase),
      CheapLfsEncryptionError
    )
  })

  it('fails closed on a stored size mismatch before deriving a key', async () => {
    const sealed = await seal(randomBytes(512))
    const part = cheapLfsEncryptedPointerPart('payload.part001', sealed)
    const truncated = sealed.container.subarray(0, sealed.container.length - 1)

    assert.throws(
      () => verifyStoredCheapLfsEncryptedPart(part, truncated),
      /size recorded in the pointer/
    )
  })

  it('round-trips to byte-identical plaintext', async () => {
    const plaintext = randomBytes(4096)
    const sealed = await seal(plaintext)
    const part = cheapLfsEncryptedPointerPart('payload.part001', sealed)

    const reopened = await openCheapLfsEncryptedPart(
      part,
      sealed.container,
      passphrase
    )
    assert.ok(reopened.equals(plaintext))
  })

  it('refuses a wrong password without producing output', async () => {
    const sealed = await seal(randomBytes(1024))
    const part = cheapLfsEncryptedPointerPart('payload.part001', sealed)

    await assert.rejects(
      openCheapLfsEncryptedPart(part, sealed.container, wrongPassphrase),
      (error: Error) => {
        assert.ok(error instanceof CheapLfsEncryptionError)
        // Neither passphrase may appear in the message. A failure that echoes
        // what was typed is a failure that leaks it into logs and screenshots.
        assert.ok(!error.message.includes(passphrase))
        assert.ok(!error.message.includes(wrongPassphrase))
        return true
      }
    )
  })

  it('rejects a plaintext digest that disagrees with the pointer', async () => {
    const sealed = await seal(randomBytes(256))
    const part = {
      ...cheapLfsEncryptedPointerPart('payload.part001', sealed),
      // The container is authentic and opens correctly; the pointer claims a
      // different file. The AEAD tag cannot catch this, which is exactly why
      // the plaintext digest is checked after decryption as well.
      sha256: sha256(Buffer.from('some other file entirely')),
    }

    await assert.rejects(
      openCheapLfsEncryptedPart(part, sealed.container, passphrase),
      /does not match the pointer/
    )
  })

  it('refuses to treat a plain part as an encrypted one', () => {
    assert.throws(
      () =>
        verifyStoredCheapLfsEncryptedPart(
          { name: 'plain.part001', sizeInBytes: 4, sha256: 'a'.repeat(64) },
          Buffer.alloc(4)
        ),
      /not an encrypted part/
    )
  })

  it('cuts encrypted parts smaller than raw parts so memory stays bounded', () => {
    assert.ok(CHEAP_LFS_ENCRYPTED_PART_SIZE_BYTES > 0)
    assert.ok(CHEAP_LFS_ENCRYPTED_PART_SIZE_BYTES <= 64 * 1024 * 1024)
  })
})

describe('Cheap LFS encrypted pointer text', () => {
  const encryptedPointer = (
    stored: { readonly size: number; readonly sha256: string },
    plaintext: { readonly size: number; readonly sha256: string }
  ): ICheapLfsPointer => ({
    version: CHEAP_LFS_POINTER_VERSION,
    releaseTag: 'assets',
    assetName: 'payload.bin',
    sizeInBytes: plaintext.size,
    sha256: plaintext.sha256,
    encryptionFormatVersion: cheapLfsEncryptionFormatVersionForNewPins(),
    parts: [
      {
        name: 'payload.bin.part001',
        sizeInBytes: plaintext.size,
        sha256: plaintext.sha256,
        encryptedStoredSizeInBytes: stored.size,
        encryptedStoredSha256: stored.sha256,
      },
    ],
  })

  it('round-trips an encrypted pointer through serialize and parse', async () => {
    const plaintext = randomBytes(300)
    const sealed = await seal(plaintext)
    const pointer = encryptedPointer(
      { size: sealed.storedSizeInBytes, sha256: sealed.storedSha256 },
      { size: sealed.sizeInBytes, sha256: sealed.sha256 }
    )

    const text = serializeCheapLfsPointer(pointer)
    assert.match(text, /^encryption 1$/m)
    assert.match(text, /^part-encrypted [a-f0-9]{64} \d+ \d+ [a-f0-9]{64} /m)

    const parsed = parseCheapLfsPointer(text)
    assert.deepEqual(parsed, pointer)
    assert.ok(isEncryptedCheapLfsPointer(parsed!))
    assert.ok(isEncryptedCheapLfsPointerPart(parsed!.parts![0]))
  })

  it('keeps the head size and digest over the plaintext, not the ciphertext', async () => {
    const plaintext = randomBytes(300)
    const sealed = await seal(plaintext)
    const parsed = parseCheapLfsPointer(
      serializeCheapLfsPointer(
        encryptedPointer(
          { size: sealed.storedSizeInBytes, sha256: sealed.storedSha256 },
          { size: sealed.sizeInBytes, sha256: sealed.sha256 }
        )
      )
    )!

    // The never-re-pin check and post-commit payload restore both compare a
    // working-tree content hash against these two fields, so they have to stay
    // the tracked file's own identity even when the asset is ciphertext.
    assert.equal(parsed.sizeInBytes, plaintext.length)
    assert.equal(parsed.sha256, sha256(plaintext))
  })

  it('refuses a pointer that is only half encrypted', () => {
    const digest = 'b'.repeat(64)
    const mixed = [
      `version ${CHEAP_LFS_POINTER_VERSION}`,
      'release-tag assets',
      'asset-name payload.bin',
      'size 20',
      `sha256 ${digest}`,
      'encryption 1',
      `part-encrypted ${digest} 10 94 ${digest} payload.bin.part001`,
      `part ${digest} 10 payload.bin.part002`,
    ].join('\n')

    assert.equal(parseCheapLfsPointer(mixed), null)
  })

  it('refuses an encryption declaration with nothing encrypted under it', () => {
    const digest = 'c'.repeat(64)
    const claim = [
      `version ${CHEAP_LFS_POINTER_VERSION}`,
      'release-tag assets',
      'asset-name payload.bin',
      'size 10',
      `sha256 ${digest}`,
      'encryption 1',
    ].join('\n')

    assert.equal(parseCheapLfsPointer(claim), null)
  })

  it('refuses an encrypted part whose container is not larger than its plaintext', () => {
    const digest = 'd'.repeat(64)
    const impossible = [
      `version ${CHEAP_LFS_POINTER_VERSION}`,
      'release-tag assets',
      'asset-name payload.bin',
      'size 10',
      `sha256 ${digest}`,
      'encryption 1',
      `part-encrypted ${digest} 10 10 ${digest} payload.bin.part001`,
    ].join('\n')

    assert.equal(parseCheapLfsPointer(impossible), null)
  })

  it('leaves a plain pointer byte-for-byte unchanged', () => {
    const digest = 'e'.repeat(64)
    const plain = [
      `version ${CHEAP_LFS_POINTER_VERSION}`,
      'release-tag assets',
      'asset-name payload.bin',
      'size 5',
      `sha256 ${digest}`,
      '',
    ].join('\n')

    const parsed = parseCheapLfsPointer(plain)!
    assert.equal(parsed.encryptionFormatVersion, undefined)
    assert.ok(!isEncryptedCheapLfsPointer(parsed))
    assert.equal(serializeCheapLfsPointer(parsed), plain)
  })
})
