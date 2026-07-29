import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createHash, randomBytes } from 'crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CHEAP_LFS_ENCRYPTION_OVERHEAD_BYTES,
  CheapLfsAuthenticationError,
  CheapLfsEncryptionError,
  CheapLfsEncryptionFormatVersion,
  CheapLfsPasswordRequiredError,
  decryptCheapLfsPayloadFileToFile,
  decryptCheapLfsPayload,
  defaultCheapLfsKdfParameters,
  encryptCheapLfsPayloadRangeToFile,
  encryptCheapLfsPayload,
  isCheapLfsAuthenticationError,
  isOnlyCheapLfsAuthenticationError,
  isEncryptedCheapLfsPayload,
  readCheapLfsEncryptionHeader,
  verifyCheapLfsEncryptionSecret,
} from '../../../src/lib/cheap-lfs/payload-encryption'

// A deliberately cheap cost so the suite stays fast. Production uses
// defaultCheapLfsKdfParameters; the format records whatever was used, which is
// exactly what lets this test pick its own.
const fastKdf = { logN: 8, blockSize: 1, parallelism: 1 }

describe('Cheap LFS payload encryption', () => {
  it('keeps the current writer and reader on format v1', async () => {
    const plaintext = randomBytes(64)
    const password = randomBytes(32)
    const container = await encryptCheapLfsPayload(plaintext, password, fastKdf)

    assert.equal(
      readCheapLfsEncryptionHeader(container).formatVersion,
      CheapLfsEncryptionFormatVersion
    )
    assert.deepEqual(
      await decryptCheapLfsPayload(container, password),
      plaintext
    )
    password.fill(0)
  })

  it('round-trips to byte-identical plaintext', async () => {
    const password = randomBytes(32)
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
    const password = randomBytes(32)
    const encrypted = await encryptCheapLfsPayload(
      Buffer.alloc(0),
      password,
      fastKdf
    )
    const decrypted = await decryptCheapLfsPayload(encrypted, password)
    assert.equal(decrypted.length, 0)
  })

  it('verifies a password through an authenticated in-memory test block', async () => {
    const password = randomBytes(32)
    await verifyCheapLfsEncryptionSecret(password, fastKdf)
    password.fill(0)
  })

  it('fails cleanly on a wrong password and returns no partial output', async () => {
    const password = randomBytes(32)
    const plaintext = randomBytes(2048)
    const encrypted = await encryptCheapLfsPayload(plaintext, password, fastKdf)

    await assert.rejects(
      decryptCheapLfsPayload(encrypted, randomBytes(32)),
      CheapLfsEncryptionError
    )
  })

  it('rejects a single flipped ciphertext byte', async () => {
    const password = randomBytes(32)
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
    const password = randomBytes(32)
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
    const password = randomBytes(32)
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
    const password = randomBytes(32)
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
    const password = randomBytes(32)
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
    const password = randomBytes(32)
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
    const password = randomBytes(32)
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

  it('refuses individually valid scrypt parameters whose memory exceeds the hard bound', async () => {
    const password = randomBytes(32)
    const encrypted = await encryptCheapLfsPayload(
      randomBytes(64),
      password,
      fastKdf
    )
    const hostile = Buffer.from(encrypted)
    const kdfOffset = 8 + 2 + 2 + 2 + 2
    hostile.writeUInt32LE(20, kdfOffset)
    hostile.writeUInt32LE(32, kdfOffset + 4)

    assert.throws(
      () => readCheapLfsEncryptionHeader(hostile),
      CheapLfsEncryptionError
    )
  })

  it('requires a password on both sides', async () => {
    const password = randomBytes(32)
    await assert.rejects(
      encryptCheapLfsPayload(randomBytes(16), '', fastKdf),
      CheapLfsPasswordRequiredError
    )
    const encrypted = await encryptCheapLfsPayload(
      randomBytes(16),
      password,
      fastKdf
    )
    await assert.rejects(
      decryptCheapLfsPayload(encrypted, ''),
      CheapLfsPasswordRequiredError
    )
  })

  it('refuses scrypt parameters whose CPU work exceeds the hard bound', async () => {
    const password = randomBytes(32)
    const encrypted = await encryptCheapLfsPayload(
      randomBytes(64),
      password,
      fastKdf
    )
    const hostile = Buffer.from(encrypted)
    const kdfOffset = 8 + 2 + 2 + 2 + 2
    hostile.writeUInt32LE(17, kdfOffset)
    hostile.writeUInt32LE(8, kdfOffset + 4)
    hostile.writeUInt32LE(16, kdfOffset + 8)

    assert.throws(
      () => readCheapLfsEncryptionHeader(hostile),
      CheapLfsEncryptionError
    )
  })

  it('accepts a caller-zeroable byte secret without mutating it', async () => {
    const secret = randomBytes(32)
    const before = Buffer.from(secret)
    const plaintext = randomBytes(128)
    const encrypted = await encryptCheapLfsPayload(plaintext, secret, fastKdf)
    assert.deepEqual(secret, before)
    assert.deepEqual(await decryptCheapLfsPayload(encrypted, secret), plaintext)
    assert.deepEqual(secret, before)
    secret.fill(0)
  })

  it('never puts the password in its error messages', async () => {
    const secret = randomBytes(32)
    const attempted = randomBytes(32)
    const encrypted = await encryptCheapLfsPayload(
      randomBytes(128),
      secret,
      fastKdf
    )

    const error = await decryptCheapLfsPayload(encrypted, attempted).catch(
      (e: Error) => e
    )
    assert.ok(error instanceof CheapLfsEncryptionError)
    assert.equal(isCheapLfsAuthenticationError(error), true)
    assert.equal(
      isCheapLfsAuthenticationError(
        new AggregateError([new Error('cleanup'), error])
      ),
      true
    )
    assert.equal(isOnlyCheapLfsAuthenticationError(error), true)
    assert.equal(
      isOnlyCheapLfsAuthenticationError(
        new AggregateError([
          error,
          new AggregateError([new CheapLfsAuthenticationError()]),
        ])
      ),
      true
    )
    assert.equal(
      isOnlyCheapLfsAuthenticationError(
        new AggregateError([new Error('cleanup'), error])
      ),
      false
    )
    assert.ok(
      !error.message.includes(secret.toString('hex')) &&
        !error.message.includes(attempted.toString('hex')),
      `the failure must not echo either password, saw: ${error.message}`
    )
    secret.fill(0)
    attempted.fill(0)
  })

  it('stream-encrypts one file range and authenticates it into a separate file', async () => {
    const password = randomBytes(32)
    const dir = await mkdtemp(join(tmpdir(), 'cheap-lfs-encryption-'))
    try {
      const prefix = randomBytes(97)
      const plaintext = randomBytes(2 * 1024 * 1024 + 17)
      const suffix = randomBytes(41)
      const source = join(dir, 'source.bin')
      const encryptedPath = join(dir, 'payload.dmclfs')
      const decryptedPath = join(dir, 'decrypted.bin')
      await writeFile(source, Buffer.concat([prefix, plaintext, suffix]))

      const encrypted = await encryptCheapLfsPayloadRangeToFile(
        source,
        encryptedPath,
        prefix.length,
        plaintext.length,
        password,
        fastKdf
      )
      assert.equal(encrypted.plaintextSizeInBytes, plaintext.length)
      assert.equal(
        encrypted.plaintextSha256,
        createHash('sha256').update(plaintext).digest('hex')
      )
      assert.equal(
        encrypted.storedSizeInBytes,
        plaintext.length + CHEAP_LFS_ENCRYPTION_OVERHEAD_BYTES
      )
      const stored = await readFile(encryptedPath)
      assert.equal(
        encrypted.storedSha256,
        createHash('sha256').update(stored).digest('hex')
      )
      assert.notEqual(encrypted.storedSha256, encrypted.plaintextSha256)

      const decrypted = await decryptCheapLfsPayloadFileToFile(
        encryptedPath,
        decryptedPath,
        password
      )
      assert.deepEqual(await readFile(decryptedPath), plaintext)
      assert.equal(decrypted.plaintextSha256, encrypted.plaintextSha256)
      assert.equal(decrypted.plaintextSizeInBytes, plaintext.length)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('stream decryption removes partial output on a wrong password or truncation', async () => {
    const password = randomBytes(32)
    const dir = await mkdtemp(join(tmpdir(), 'cheap-lfs-encryption-fail-'))
    try {
      const source = join(dir, 'source.bin')
      const encryptedPath = join(dir, 'payload.dmclfs')
      const wrongOutput = join(dir, 'wrong-output.bin')
      const truncatedOutput = join(dir, 'truncated-output.bin')
      const existingOutput = join(dir, 'existing-output.bin')
      await writeFile(source, randomBytes(1024 * 1024 + 3))
      await encryptCheapLfsPayloadRangeToFile(
        source,
        encryptedPath,
        0,
        (
          await stat(source)
        ).size,
        password,
        fastKdf
      )

      const wrong = await decryptCheapLfsPayloadFileToFile(
        encryptedPath,
        wrongOutput,
        randomBytes(32)
      ).catch(error => error)
      assert.ok(wrong instanceof CheapLfsAuthenticationError)
      await assert.rejects(stat(wrongOutput), { code: 'ENOENT' })

      const stored = await readFile(encryptedPath)
      await writeFile(encryptedPath, stored.subarray(0, stored.length - 1))
      const truncated = await decryptCheapLfsPayloadFileToFile(
        encryptedPath,
        truncatedOutput,
        password
      ).catch(error => error)
      assert.ok(truncated instanceof CheapLfsAuthenticationError)
      await assert.rejects(stat(truncatedOutput), { code: 'ENOENT' })

      const existingBytes = Buffer.from('caller-owned output')
      await writeFile(existingOutput, existingBytes)
      await assert.rejects(
        decryptCheapLfsPayloadFileToFile(
          encryptedPath,
          existingOutput,
          password
        ),
        { code: 'EEXIST' }
      )
      assert.deepEqual(await readFile(existingOutput), existingBytes)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('honors a pre-aborted stream operation before creating output', async () => {
    const password = randomBytes(32)
    const dir = await mkdtemp(join(tmpdir(), 'cheap-lfs-encryption-abort-'))
    try {
      const source = join(dir, 'source.bin')
      const encryptedPath = join(dir, 'payload.dmclfs')
      const canceledEncryptedPath = join(dir, 'canceled.dmclfs')
      const canceledPlaintextPath = join(dir, 'canceled.bin')
      const plaintext = randomBytes(1024)
      await writeFile(source, plaintext)

      const encryptController = new AbortController()
      encryptController.abort()
      await assert.rejects(
        encryptCheapLfsPayloadRangeToFile(
          source,
          canceledEncryptedPath,
          0,
          plaintext.length,
          password,
          fastKdf,
          encryptController.signal
        ),
        { name: 'AbortError' }
      )
      await assert.rejects(stat(canceledEncryptedPath), { code: 'ENOENT' })

      await encryptCheapLfsPayloadRangeToFile(
        source,
        encryptedPath,
        0,
        plaintext.length,
        password,
        fastKdf
      )
      const decryptController = new AbortController()
      decryptController.abort()
      await assert.rejects(
        decryptCheapLfsPayloadFileToFile(
          encryptedPath,
          canceledPlaintextPath,
          password,
          decryptController.signal
        ),
        { name: 'AbortError' }
      )
      await assert.rejects(stat(canceledPlaintextPath), { code: 'ENOENT' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
