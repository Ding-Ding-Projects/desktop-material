import { describe, it } from 'node:test'
import assert from 'node:assert'
import { randomBytes } from 'crypto'
import {
  CheapLfsEncryptionError,
  CheapLfsEncryptionFormatVersion,
  decryptCheapLfsPayload,
  defaultCheapLfsKdfParameters,
  encryptCheapLfsPayload,
  isEncryptedCheapLfsPayload,
  readCheapLfsEncryptionHeader,
} from '../../../src/lib/cheap-lfs/payload-encryption'

// A deliberately cheap cost so the suite stays fast. Production uses
// defaultCheapLfsKdfParameters; the format records whatever was used, which is
// exactly what lets this test pick its own.
const fastKdf = { logN: 8, blockSize: 1, parallelism: 1 }
const password = 'correct horse battery staple'

describe('Cheap LFS payload encryption', () => {
  it('round-trips to byte-identical plaintext', async () => {
    const plaintext = randomBytes(4096)
    const encrypted = await encryptCheapLfsPayload(plaintext, password, fastKdf)

    assert.ok(
      !encrypted.equals(plaintext),
      'the stored payload must not be the plaintext'
    )
    const decrypted = await decryptCheapLfsPayload(encrypted, password)
    assert.ok(decrypted.equals(plaintext))
  })

  it('round-trips an empty payload', async () => {
    const encrypted = await encryptCheapLfsPayload(
      Buffer.alloc(0),
      password,
      fastKdf
    )
    const decrypted = await decryptCheapLfsPayload(encrypted, password)
    assert.equal(decrypted.length, 0)
  })

  it('fails cleanly on a wrong password and returns no partial output', async () => {
    const plaintext = randomBytes(2048)
    const encrypted = await encryptCheapLfsPayload(plaintext, password, fastKdf)

    await assert.rejects(
      decryptCheapLfsPayload(encrypted, 'not the password'),
      CheapLfsEncryptionError
    )
  })

  it('rejects a single flipped ciphertext byte', async () => {
    const plaintext = randomBytes(2048)
    const encrypted = await encryptCheapLfsPayload(plaintext, password, fastKdf)
    const header = readCheapLfsEncryptionHeader(encrypted)

    const tampered = Buffer.from(encrypted)
    tampered[header.ciphertextOffset] ^= 0x01

    await assert.rejects(
      decryptCheapLfsPayload(tampered, password),
      CheapLfsEncryptionError
    )
  })

  it('rejects a truncated payload', async () => {
    const plaintext = randomBytes(2048)
    const encrypted = await encryptCheapLfsPayload(plaintext, password, fastKdf)

    await assert.rejects(
      decryptCheapLfsPayload(
        encrypted.subarray(0, encrypted.length - 32),
        password
      ),
      CheapLfsEncryptionError
    )
  })

  it('rejects a swapped nonce', async () => {
    const plaintext = randomBytes(2048)
    const first = await encryptCheapLfsPayload(plaintext, password, fastKdf)
    const second = await encryptCheapLfsPayload(plaintext, password, fastKdf)
    const header = readCheapLfsEncryptionHeader(first)

    // Splice the second payload's nonce into the first. The tag no longer
    // matches, so this must raise rather than yield anything.
    const nonceStart =
      header.ciphertextOffset - header.tagLength - header.nonceLength
    const spliced = Buffer.from(first)
    second.copy(
      spliced,
      nonceStart,
      nonceStart,
      nonceStart + header.nonceLength
    )

    await assert.rejects(
      decryptCheapLfsPayload(spliced, password),
      CheapLfsEncryptionError
    )
  })

  it('draws a fresh nonce and salt for every encryption of the same bytes', async () => {
    // Nonce reuse under one key breaks GCM outright, so this is the single
    // most important property in the module.
    const plaintext = randomBytes(512)
    const nonces = new Set<string>()
    const salts = new Set<string>()

    for (let i = 0; i < 12; i++) {
      const encrypted = await encryptCheapLfsPayload(
        plaintext,
        password,
        fastKdf
      )
      const header = readCheapLfsEncryptionHeader(encrypted)
      const saltStart =
        header.ciphertextOffset -
        header.tagLength -
        header.nonceLength -
        header.saltLength
      const nonceStart = saltStart + header.saltLength

      salts.add(
        encrypted
          .subarray(saltStart, saltStart + header.saltLength)
          .toString('hex')
      )
      nonces.add(
        encrypted
          .subarray(nonceStart, nonceStart + header.nonceLength)
          .toString('hex')
      )
    }

    assert.equal(nonces.size, 12, 'every encryption must use a fresh nonce')
    assert.equal(salts.size, 12, 'every encryption must use a fresh salt')
  })

  it('records the key-derivation parameters it used', async () => {
    const encrypted = await encryptCheapLfsPayload(
      randomBytes(64),
      password,
      fastKdf
    )
    const header = readCheapLfsEncryptionHeader(encrypted)

    assert.equal(header.formatVersion, CheapLfsEncryptionFormatVersion)
    assert.deepEqual(header.kdf, fastKdf)
  })

  it('decrypts a payload written with different parameters than today default', async () => {
    // Proves cost can be raised later without orphaning existing payloads:
    // decryption reads the parameters from the header rather than assuming.
    const plaintext = randomBytes(256)
    const encrypted = await encryptCheapLfsPayload(plaintext, password, {
      logN: 9,
      blockSize: 2,
      parallelism: 1,
    })

    assert.notDeepEqual(
      readCheapLfsEncryptionHeader(encrypted).kdf,
      defaultCheapLfsKdfParameters
    )
    const decrypted = await decryptCheapLfsPayload(encrypted, password)
    assert.ok(decrypted.equals(plaintext))
  })

  it('refuses a foreign payload rather than mis-parsing it', async () => {
    const foreign = randomBytes(512)

    assert.equal(isEncryptedCheapLfsPayload(foreign), false)
    assert.throws(
      () => readCheapLfsEncryptionHeader(foreign),
      CheapLfsEncryptionError
    )
  })

  it('refuses a header claiming absurd derivation cost', async () => {
    const encrypted = await encryptCheapLfsPayload(
      randomBytes(64),
      password,
      fastKdf
    )
    const hostile = Buffer.from(encrypted)
    // logN sits directly after magic, version, cipher, kdf and reserved.
    hostile.writeUInt32LE(64, 8 + 2 + 2 + 2 + 2)

    assert.throws(
      () => readCheapLfsEncryptionHeader(hostile),
      CheapLfsEncryptionError
    )
  })

  it('requires a password on both sides', async () => {
    await assert.rejects(
      encryptCheapLfsPayload(randomBytes(16), '', fastKdf),
      CheapLfsEncryptionError
    )
    const encrypted = await encryptCheapLfsPayload(
      randomBytes(16),
      password,
      fastKdf
    )
    await assert.rejects(
      decryptCheapLfsPayload(encrypted, ''),
      CheapLfsEncryptionError
    )
  })

  it('never puts the password in its error messages', async () => {
    // Both passphrases are deliberately unmistakable strings that cannot occur
    // in ordinary English prose. An earlier version of this test used "wrong"
    // as the attempted password and failed against the perfectly correct
    // message "the password is wrong or the stored bytes were altered" — the
    // test was at fault, not the code.
    const secret = 'zq7-hunter-passphrase-alpha'
    const attempted = 'zq7-different-passphrase-beta'
    const encrypted = await encryptCheapLfsPayload(
      randomBytes(128),
      secret,
      fastKdf
    )

    const error = await decryptCheapLfsPayload(encrypted, attempted).catch(
      (e: Error) => e
    )
    assert.ok(error instanceof CheapLfsEncryptionError)
    assert.ok(
      !error.message.includes(secret) && !error.message.includes(attempted),
      `the failure must not echo either password, saw: ${error.message}`
    )
  })
})
