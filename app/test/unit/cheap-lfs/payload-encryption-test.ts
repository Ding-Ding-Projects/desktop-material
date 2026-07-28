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
} from '../../../src/lib/cheap-lfs/payload-encryption'

// A deliberately cheap cost so the suite stays fast. Production uses
// defaultCheapLfsKdfParameters; the format records whatever was used, which is
// exactly what lets this test pick its own.
const fastKdf = { logN: 8, blockSize: 1, parallelism: 1 }
const password = 'correct horse battery staple'

describe('Cheap LFS payload encryption', () => {
  it('decrypts a format-v1 container written by the pushed origin/main implementation', async () => {
    // Captured from the already-pushed format-v1 writer with low test KDF
    // parameters. The layout/magic are immutable compatibility data.
    const originMainContainer = Buffer.from(
      'RE1DTEZTAAEBAAEAAQAAAAoAAAAIAAAAAQAAABAAAAAMAAAAEAAAAEN/FUhz5gRbCX9zzCqAHBVixTT1+V/U8i+KyMRSEmetGTNY9bRmYNpGaLcI1q1itWHvwowFWmReZbxzphuToxOCNA==',
      'base64'
    )

    const plaintext = await decryptCheapLfsPayload(
      originMainContainer,
      'compat-password'
    )
    assert.equal(plaintext.toString('utf8'), 'origin-main-compatible')
  })

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

  it('refuses individually valid scrypt parameters whose memory exceeds the hard bound', async () => {
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
    const secret = Buffer.from('mutable passphrase')
    const before = Buffer.from(secret)
    const plaintext = randomBytes(128)
    const encrypted = await encryptCheapLfsPayload(plaintext, secret, fastKdf)
    assert.deepEqual(secret, before)
    assert.deepEqual(await decryptCheapLfsPayload(encrypted, secret), plaintext)
    assert.deepEqual(secret, before)
    secret.fill(0)
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
      !error.message.includes(secret) && !error.message.includes(attempted),
      `the failure must not echo either password, saw: ${error.message}`
    )
  })

  it('stream-encrypts one file range and authenticates it into a separate file', async () => {
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
        Buffer.from(password),
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
        Buffer.from(password)
      )
      assert.deepEqual(await readFile(decryptedPath), plaintext)
      assert.equal(decrypted.plaintextSha256, encrypted.plaintextSha256)
      assert.equal(decrypted.plaintextSizeInBytes, plaintext.length)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('stream decryption removes partial output on a wrong password or truncation', async () => {
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
        Buffer.from(password),
        fastKdf
      )

      const wrong = await decryptCheapLfsPayloadFileToFile(
        encryptedPath,
        wrongOutput,
        Buffer.from('not the password')
      ).catch(error => error)
      assert.ok(wrong instanceof CheapLfsAuthenticationError)
      await assert.rejects(stat(wrongOutput), { code: 'ENOENT' })

      const stored = await readFile(encryptedPath)
      await writeFile(encryptedPath, stored.subarray(0, stored.length - 1))
      const truncated = await decryptCheapLfsPayloadFileToFile(
        encryptedPath,
        truncatedOutput,
        Buffer.from(password)
      ).catch(error => error)
      assert.ok(truncated instanceof CheapLfsAuthenticationError)
      await assert.rejects(stat(truncatedOutput), { code: 'ENOENT' })

      const existingBytes = Buffer.from('caller-owned output')
      await writeFile(existingOutput, existingBytes)
      await assert.rejects(
        decryptCheapLfsPayloadFileToFile(
          encryptedPath,
          existingOutput,
          Buffer.from(password)
        ),
        { code: 'EEXIST' }
      )
      assert.deepEqual(await readFile(existingOutput), existingBytes)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('honors a pre-aborted stream operation before creating output', async () => {
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
          Buffer.from(password),
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
        Buffer.from(password),
        fastKdf
      )
      const decryptController = new AbortController()
      decryptController.abort()
      await assert.rejects(
        decryptCheapLfsPayloadFileToFile(
          encryptedPath,
          canceledPlaintextPath,
          Buffer.from(password),
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
