import assert from 'node:assert/strict'
import { createCipheriv, createHash, createHmac } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  CloudPatchMaximumActiveCiphertextBytes,
  CloudPatchMaximumActiveShares,
  CloudPatchMaximumArtifactBytes,
  CloudPatchMaximumLifetimeMs,
  CloudPatchMaximumRecipients,
  CloudPatchStoreError,
  createCloudPatchStore,
} from '../cloud-patch-store.mjs'

const Owner = '11111111-1111-4111-8111-111111111111'
const RecipientA = '22222222-2222-4222-8222-222222222222'
const RecipientB = '33333333-3333-4333-8333-333333333333'
const Stranger = '44444444-4444-4444-8444-444444444444'
const OtherOwner = '55555555-5555-4555-8555-555555555555'
const InitialNow = Date.parse('2026-08-02T12:00:00.000Z')
const EncryptionKey = Buffer.alloc(32, 0x5a)
const encoder = new TextEncoder()

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function deterministicRandom() {
  let sequence = 0
  const calls = []
  return {
    calls,
    randomBytes(length, purpose) {
      calls.push({ length, purpose })
      const value = createHash('sha256')
        .update(`${purpose}:${sequence++}`)
        .digest()
      return Uint8Array.from(value.subarray(0, length))
    },
  }
}

async function fixture(options = {}) {
  const dataDirectory =
    options.dataDirectory ??
    (await mkdtemp(join(tmpdir(), 'desktop-material-cloud-patches-')))
  let now = options.now ?? InitialNow
  const randomness = options.randomness ?? deterministicRandom()
  const configuration = {
    dataDirectory,
    encryptionKey: options.encryptionKey ?? EncryptionKey,
    clock: () => now,
    randomBytes: randomness.randomBytes.bind(randomness),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  }
  return {
    dataDirectory,
    randomness,
    configuration,
    store: await createCloudPatchStore(configuration),
    setNow(value) {
      now = value
    },
    advance(milliseconds) {
      now += milliseconds
    },
    async cleanup() {
      await rm(dataDirectory, { recursive: true, force: true })
    },
  }
}

function createInput(artifact, overrides = {}) {
  return {
    ownerDeviceId: Owner,
    recipientDeviceIds: [RecipientB, RecipientA],
    expectedArtifactSha256: digest(artifact),
    artifact,
    expiresAtMs: InitialNow + 60_000,
    ...overrides,
  }
}

function openInput(share, overrides = {}) {
  return {
    shareId: share.shareId,
    shareSecret: share.shareSecret,
    requestingDeviceId: Owner,
    ...overrides,
  }
}

async function expectCode(action, code, secrets = []) {
  await assert.rejects(action, error => {
    assert.ok(error instanceof CloudPatchStoreError)
    assert.equal(error.code, code)
    assert.equal(error.message, new CloudPatchStoreError(code).message)
    assert.equal(Object.hasOwn(error, 'cause'), false)
    const rendered = `${error.name} ${error.code} ${
      error.message
    } ${JSON.stringify(error)}`
    for (const secret of secrets) {
      assert.equal(rendered.includes(secret), false)
    }
    return true
  })
}

async function persistedShare(dataDirectory) {
  const directoryName = (await readdir(dataDirectory)).find(name =>
    /^share-[a-f0-9]{64}$/.test(name)
  )
  assert.ok(directoryName)
  const directoryPath = join(dataDirectory, directoryName)
  return {
    directoryName,
    directoryPath,
    metadataPath: join(directoryPath, 'metadata.json'),
    ciphertextPath: join(directoryPath, 'ciphertext.bin'),
    revocationPath: join(directoryPath, 'revocation.bin'),
  }
}

async function readMetadata(dataDirectory) {
  const paths = await persistedShare(dataDirectory)
  return {
    ...paths,
    metadata: JSON.parse(await readFile(paths.metadataPath, 'utf8')),
  }
}

async function writeCanonicalMetadata(path, metadata) {
  await writeFile(path, `${JSON.stringify(metadata)}\n`, 'utf8')
}

function canonicalAAD(record) {
  return encoder.encode(
    JSON.stringify({
      domain: 'desktop-material/cloud-patch-share',
      version: 1,
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

function revocationSlot(shareId, state) {
  const revocationKey = createHmac('sha256', EncryptionKey)
    .update('desktop-material/cloud-patch-revocation-key/v1', 'utf8')
    .digest()
  const stateByte = Buffer.from([state])
  const authentication = createHmac('sha256', revocationKey)
    .update('desktop-material/cloud-patch-revocation/v1\0', 'utf8')
    .update(shareId, 'utf8')
    .update(stateByte)
    .digest()
  return Buffer.concat([stateByte, authentication])
}

function retag(artifact, metadata) {
  const nonce = Buffer.from(metadata.nonce, 'base64url')
  const cipher = createCipheriv('aes-256-gcm', EncryptionKey, nonce, {
    authTagLength: 16,
  })
  cipher.setAAD(canonicalAAD(metadata), {
    plaintextLength: artifact.byteLength,
  })
  const ciphertext = Buffer.concat([cipher.update(artifact), cipher.final()])
  return {
    ciphertext,
    authenticationTag: cipher.getAuthTag().toString('base64url'),
  }
}

describe('encrypted Cloud Patch share store', () => {
  it('round-trips for authorized devices, lists bounded metadata, and restarts', async () => {
    const subject = await fixture()
    try {
      const artifact = encoder.encode('canonical cloud patch payload')
      const share = await subject.store.createShare(createInput(artifact))
      assert.match(share.shareId, /^cp_[a-f0-9]{64}$/)
      assert.match(share.shareSecret, /^cps_[A-Za-z0-9_-]{43}$/)

      for (const requestingDeviceId of [Owner, RecipientA, RecipientB]) {
        assert.deepEqual(
          await subject.store.openShare(
            openInput(share, { requestingDeviceId })
          ),
          artifact
        )
      }

      const listed = await subject.store.listOwnerShares({
        ownerDeviceId: Owner,
      })
      assert.deepEqual(listed, [
        {
          shareId: share.shareId,
          expectedArtifactSha256: digest(artifact),
          ownerDeviceId: Owner,
          recipientDeviceIds: [RecipientA, RecipientB],
          createdAtMs: InitialNow,
          expiresAtMs: InitialNow + 60_000,
          artifactByteLength: artifact.byteLength,
        },
      ])
      assert.equal(Object.isFrozen(listed), true)
      assert.equal(Object.isFrozen(listed[0]), true)
      assert.equal(Object.isFrozen(listed[0].recipientDeviceIds), true)
      assert.deepEqual(
        await subject.store.listOwnerShares({
          ownerDeviceId: OtherOwner,
        }),
        []
      )

      const restarted = await createCloudPatchStore(subject.configuration)
      assert.deepEqual(await restarted.openShare(openInput(share)), artifact)
      assert.deepEqual(
        subject.randomness.calls.slice(0, 4).map(call => call.purpose),
        ['share-id', 'share-secret', 'encryption-nonce', 'operation-id']
      )
    } finally {
      await subject.cleanup()
    }
  })

  it('persists no plaintext capability and isolates caller and output buffers', async () => {
    const subject = await fixture()
    try {
      const artifact = encoder.encode(
        'PLAINTEXT-CLOUD-PATCH-CANARY-DO-NOT-PERSIST'
      )
      const expected = Uint8Array.from(artifact)
      const creating = subject.store.createShare(createInput(artifact))
      artifact.fill(0)
      const share = await creating

      const files = await persistedShare(subject.dataDirectory)
      const metadata = await readFile(files.metadataPath)
      const ciphertext = await readFile(files.ciphertextPath)
      const revocation = await readFile(files.revocationPath)
      for (const persisted of [metadata, ciphertext, revocation]) {
        assert.equal(persisted.includes(Buffer.from(expected)), false)
        assert.equal(persisted.includes(Buffer.from(share.shareSecret)), false)
      }

      const first = await subject.store.openShare(openInput(share))
      assert.deepEqual(first, expected)
      first.fill(0)
      assert.deepEqual(
        await subject.store.openShare(openInput(share)),
        expected
      )

      const listed = await subject.store.listOwnerShares({
        ownerDeviceId: Owner,
      })
      assert.deepEqual(Object.keys(listed[0]).sort(), [
        'artifactByteLength',
        'createdAtMs',
        'expectedArtifactSha256',
        'expiresAtMs',
        'ownerDeviceId',
        'recipientDeviceIds',
        'shareId',
      ])
      assert.equal(JSON.stringify(listed).includes(share.shareSecret), false)
      assert.equal(JSON.stringify(listed).includes('secretHash'), false)
      assert.throws(() => listed[0].recipientDeviceIds.push(Stranger))
      assert.equal(
        (
          await subject.store.listOwnerShares({ ownerDeviceId: Owner })
        )[0].recipientDeviceIds.includes(Stranger),
        false
      )
    } finally {
      await subject.cleanup()
    }
  })

  it('denies wrong capabilities, devices, and revokers with fixed safe errors', async () => {
    const subject = await fixture()
    try {
      const artifact = encoder.encode('authorization fixture')
      const share = await subject.store.createShare(createInput(artifact))
      const hostile = 'HOSTILE-DEVICE-OR-TOKEN-MUST-NOT-LEAK'
      await expectCode(
        subject.store.openShare(
          openInput(share, { shareSecret: `cps_${'A'.repeat(43)}` })
        ),
        'access-denied',
        [hostile, share.shareSecret]
      )
      await expectCode(
        subject.store.openShare(
          openInput(share, { requestingDeviceId: Stranger })
        ),
        'access-denied',
        [share.shareSecret]
      )
      await expectCode(
        subject.store.revokeShare({
          shareId: share.shareId,
          requestingDeviceId: RecipientA,
        }),
        'revoke-denied'
      )
      await expectCode(
        subject.store.openShare({
          ...openInput(share),
          unexpected: hostile,
        }),
        'invalid-input',
        [hostile]
      )

      assert.deepEqual(
        await subject.store.revokeShare({
          shareId: share.shareId,
          requestingDeviceId: Owner,
        }),
        { revoked: true }
      )
      await expectCode(
        subject.store.openShare(openInput(share)),
        'access-denied',
        [share.shareSecret]
      )
    } finally {
      await subject.cleanup()
    }
  })

  it('retires an authenticated revoke marker after an interrupted namespace rename', async () => {
    const subject = await fixture()
    try {
      const artifact = encoder.encode('durable revoke marker')
      const share = await subject.store.createShare(createInput(artifact))
      const paths = await readMetadata(subject.dataDirectory)
      const revocation = await readFile(paths.revocationPath)
      const revokedSlot = revocationSlot(share.shareId, 1)
      revokedSlot.subarray(1).copy(revocation, 34)
      await writeFile(paths.revocationPath, revocation)

      const uncommittedRestart = await createCloudPatchStore(
        subject.configuration
      )
      assert.deepEqual(
        await uncommittedRestart.listOwnerShares({ ownerDeviceId: Owner }),
        []
      )
      await expectCode(
        uncommittedRestart.openShare(openInput(share)),
        'access-denied',
        [share.shareSecret]
      )

      const committedShare = await subject.store.createShare(
        createInput(artifact)
      )
      const committedPaths = await readMetadata(subject.dataDirectory)
      const committedRevocation = await readFile(committedPaths.revocationPath)
      revocationSlot(committedShare.shareId, 1).copy(committedRevocation, 33)
      await writeFile(committedPaths.revocationPath, committedRevocation)

      const restarted = await createCloudPatchStore(subject.configuration)
      assert.deepEqual(
        await restarted.listOwnerShares({ ownerDeviceId: Owner }),
        []
      )
      assert.deepEqual(await readdir(subject.dataDirectory), [])
      await expectCode(
        restarted.openShare(openInput(committedShare)),
        'access-denied',
        [committedShare.shareSecret]
      )
    } finally {
      await subject.cleanup()
    }
  })

  it('enforces exact expiry and prunes before low active-share caps', async () => {
    const limits = {
      maximumArtifactBytes: 32,
      maximumActiveShares: 1,
      maximumActiveCiphertextBytes: 32,
    }
    const subject = await fixture({ limits })
    try {
      const artifact = encoder.encode('expiry')
      const exactMaximum = await subject.store.createShare(
        createInput(artifact, {
          expiresAtMs: InitialNow + CloudPatchMaximumLifetimeMs,
        })
      )
      subject.setNow(InitialNow + CloudPatchMaximumLifetimeMs - 1)
      assert.deepEqual(
        await subject.store.openShare(openInput(exactMaximum)),
        artifact
      )
      subject.advance(1)
      await expectCode(
        subject.store.openShare(openInput(exactMaximum)),
        'access-denied'
      )

      subject.setNow(InitialNow)
      await expectCode(
        subject.store.createShare(
          createInput(artifact, {
            expiresAtMs: InitialNow + CloudPatchMaximumLifetimeMs + 1,
          })
        ),
        'invalid-expiry'
      )
      const short = await subject.store.createShare(
        createInput(artifact, { expiresAtMs: InitialNow + 1 })
      )
      subject.advance(1)
      const replacement = await subject.store.createShare(
        createInput(artifact, { expiresAtMs: InitialNow + 60_000 })
      )
      assert.notEqual(replacement.shareId, short.shareId)
    } finally {
      await subject.cleanup()
    }
  })

  it('prunes valid expired records before the persisted active-share cap', async () => {
    const limits = {
      maximumArtifactBytes: 8,
      maximumActiveShares: 2,
      maximumActiveCiphertextBytes: 16,
    }
    const subject = await fixture({ limits })
    try {
      const artifact = Uint8Array.of(0x7a)
      await Promise.all([
        subject.store.createShare(
          createInput(artifact, { expiresAtMs: InitialNow + 1 })
        ),
        subject.store.createShare(
          createInput(artifact, { expiresAtMs: InitialNow + 1 })
        ),
      ])
      assert.equal(
        (await readdir(subject.dataDirectory)).length,
        limits.maximumActiveShares
      )

      subject.setNow(InitialNow + 1)
      const restarted = await createCloudPatchStore({
        ...subject.configuration,
        limits: {
          ...limits,
          maximumActiveShares: 1,
        },
      })
      assert.deepEqual(
        await restarted.listOwnerShares({ ownerDeviceId: Owner }),
        []
      )
      assert.deepEqual(await readdir(subject.dataDirectory), [])
    } finally {
      await subject.cleanup()
    }
  })

  it('enforces artifact, active-share, ciphertext, and concurrent cap boundaries', async () => {
    assert.equal(
      CloudPatchMaximumArtifactBytes,
      8 * 1024 * 1024 * 2 + 2 * 1024 * 1024 + 1024
    )
    assert.equal(CloudPatchMaximumActiveShares, 128)
    assert.equal(CloudPatchMaximumActiveCiphertextBytes, 512 * 1024 * 1024)

    const canonicalBoundary = await fixture()
    try {
      const exactMaximum = new Uint8Array(CloudPatchMaximumArtifactBytes)
      exactMaximum[0] = 0x7b
      exactMaximum[exactMaximum.byteLength - 1] = 0x7d
      const share = await canonicalBoundary.store.createShare(
        createInput(exactMaximum)
      )
      assert.match(share.shareId, /^cp_[a-f0-9]{64}$/)

      await expectCode(
        canonicalBoundary.store.createShare(
          createInput(new Uint8Array(CloudPatchMaximumArtifactBytes + 1))
        ),
        'invalid-input'
      )
    } finally {
      await canonicalBoundary.cleanup()
    }

    const subject = await fixture({
      limits: {
        maximumArtifactBytes: 8,
        maximumActiveShares: 2,
        maximumActiveCiphertextBytes: 10,
      },
    })
    try {
      const exactMaximum = new Uint8Array(8).fill(8)
      const exactMaximumShare = await subject.store.createShare(
        createInput(exactMaximum)
      )
      assert.deepEqual(
        await subject.store.openShare(openInput(exactMaximumShare)),
        exactMaximum
      )
      await subject.store.revokeShare({
        shareId: exactMaximumShare.shareId,
        requestingDeviceId: Owner,
      })

      const five = new Uint8Array(5).fill(1)
      await subject.store.createShare(createInput(five))
      await subject.store.createShare(createInput(five))
      await expectCode(
        subject.store.createShare(createInput(Uint8Array.of(1))),
        'capacity-exceeded'
      )
      await expectCode(
        subject.store.createShare(createInput(new Uint8Array(9))),
        'invalid-input'
      )
    } finally {
      await subject.cleanup()
    }

    const raced = await fixture({
      limits: {
        maximumArtifactBytes: 8,
        maximumActiveShares: 1,
        maximumActiveCiphertextBytes: 8,
      },
    })
    try {
      const artifact = Uint8Array.of(1)
      const peer = await createCloudPatchStore(raced.configuration)
      const results = await Promise.allSettled([
        raced.store.createShare(createInput(artifact)),
        peer.createShare(createInput(artifact)),
      ])
      assert.equal(
        results.filter(result => result.status === 'fulfilled').length,
        1
      )
      const rejected = results.find(result => result.status === 'rejected')
      assert.ok(rejected)
      assert.equal(rejected.reason.code, 'capacity-exceeded')

      const share = results.find(result => result.status === 'fulfilled').value
      const revoking = raced.store.revokeShare({
        shareId: share.shareId,
        requestingDeviceId: Owner,
      })
      const opening = peer.openShare(openInput(share))
      await revoking
      await expectCode(opening, 'access-denied')
    } finally {
      await raced.cleanup()
    }
  })

  it('stays synchronized with the canonical app artifact-size contract', async () => {
    const appSource = await readFile(
      new URL(
        '../../../app/src/lib/cloud-patches/patch-artifact.ts',
        import.meta.url
      ),
      'utf8'
    )
    const uncommentedAppSource = appSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    assert.equal(
      [
        ...uncommentedAppSource.matchAll(
          /^export const MaximumCloudPatchPatchBytes = 8 \* 1024 \* 1024[ \t]*$/gm
        ),
      ].length,
      1
    )
    assert.equal(
      [
        ...uncommentedAppSource.matchAll(
          /^export const MaximumCloudPatchManifestBytes = 2 \* 1024 \* 1024[ \t]*$/gm
        ),
      ].length,
      1
    )
    assert.equal(
      [
        ...uncommentedAppSource.matchAll(
          /^export const MaximumCloudPatchArtifactBytes =[ \t]*\r?\n[ \t]+MaximumCloudPatchPatchBytes \* 2 \+ MaximumCloudPatchManifestBytes \+ 1024[ \t]*$/gm
        ),
      ].length,
      1
    )
    assert.equal(
      CloudPatchMaximumArtifactBytes,
      8 * 1024 * 1024 * 2 + 2 * 1024 * 1024 + 1024
    )
  })

  it('rejects malformed recipients, shapes, digests, and randomness safely', async () => {
    const subject = await fixture()
    try {
      const artifact = Uint8Array.of(1, 2, 3)
      const maximumRecipients = Array.from(
        { length: CloudPatchMaximumRecipients },
        (_, index) =>
          `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`
      )
      const maximumRecipientShare = await subject.store.createShare(
        createInput(artifact, { recipientDeviceIds: maximumRecipients })
      )
      assert.equal(
        (await subject.store.listOwnerShares({ ownerDeviceId: Owner }))[0]
          .recipientDeviceIds.length,
        CloudPatchMaximumRecipients
      )
      await subject.store.revokeShare({
        shareId: maximumRecipientShare.shareId,
        requestingDeviceId: Owner,
      })

      for (const recipientDeviceIds of [
        [],
        [RecipientA, RecipientA],
        [Owner],
        Array.from(
          { length: CloudPatchMaximumRecipients + 1 },
          (_, index) =>
            `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`
        ),
      ]) {
        await expectCode(
          subject.store.createShare(
            createInput(artifact, { recipientDeviceIds })
          ),
          'invalid-input'
        )
      }
      await expectCode(
        subject.store.createShare(
          createInput(artifact, {
            expectedArtifactSha256: `sha256:${'0'.repeat(64)}`,
          })
        ),
        'digest-mismatch'
      )
      await expectCode(
        subject.store.createShare({
          ...createInput(artifact),
          extra: true,
        }),
        'invalid-input'
      )
    } finally {
      await subject.cleanup()
    }

    await expectCode(
      createCloudPatchStore({
        dataDirectory: 'relative-cloud-patch-store',
        encryptionKey: EncryptionKey,
        clock: () => InitialNow,
        randomBytes: deterministicRandom().randomBytes,
      }),
      'invalid-configuration'
    )
    const invalidConfigurationDirectory = await mkdtemp(
      join(tmpdir(), 'desktop-material-cloud-patches-invalid-configuration-')
    )
    try {
      await expectCode(
        createCloudPatchStore({
          dataDirectory: invalidConfigurationDirectory,
          encryptionKey: new Uint8Array(31),
          clock: () => InitialNow,
          randomBytes: deterministicRandom().randomBytes,
        }),
        'invalid-configuration'
      )
    } finally {
      await rm(invalidConfigurationDirectory, { recursive: true, force: true })
    }

    const brokenRandom = await mkdtemp(
      join(tmpdir(), 'desktop-material-cloud-patches-random-')
    )
    try {
      const store = await createCloudPatchStore({
        dataDirectory: brokenRandom,
        encryptionKey: EncryptionKey,
        clock: () => InitialNow,
        randomBytes: length => new Uint8Array(Math.max(0, length - 1)),
      })
      await expectCode(
        store.createShare(createInput(Uint8Array.of(1))),
        'randomness-failure'
      )
    } finally {
      await rm(brokenRandom, { recursive: true, force: true })
    }
  })

  it('fails closed for ciphertext, tag, AAD, digest, and length tampering', async () => {
    const cases = [
      async ({ paths }) => {
        const bytes = await readFile(paths.ciphertextPath)
        bytes[0] ^= 1
        await writeFile(paths.ciphertextPath, bytes)
      },
      async ({ paths, metadata }) => {
        metadata.authenticationTag = `${
          metadata.authenticationTag[0] === 'A' ? 'B' : 'A'
        }${metadata.authenticationTag.slice(1)}`
        await writeCanonicalMetadata(paths.metadataPath, metadata)
      },
      async ({ paths, metadata }) => {
        metadata.ownerDeviceId = OtherOwner
        await writeCanonicalMetadata(paths.metadataPath, metadata)
      },
      async ({ paths, metadata, artifact }) => {
        metadata.expectedArtifactSha256 = `sha256:${'f'.repeat(64)}`
        const encrypted = retag(artifact, metadata)
        metadata.authenticationTag = encrypted.authenticationTag
        await writeFile(paths.ciphertextPath, encrypted.ciphertext)
        await writeCanonicalMetadata(paths.metadataPath, metadata)
      },
      async ({ paths, metadata }) => {
        metadata.artifactByteLength += 1
        await writeCanonicalMetadata(paths.metadataPath, metadata)
      },
    ]

    for (const mutate of cases) {
      const subject = await fixture()
      try {
        const artifact = encoder.encode('tamper target')
        const share = await subject.store.createShare(createInput(artifact))
        const paths = await readMetadata(subject.dataDirectory)
        await mutate({ paths, metadata: paths.metadata, artifact })
        await expectCode(
          subject.store.openShare(openInput(share)),
          'integrity-failure',
          [share.shareSecret]
        )
        await expectCode(
          createCloudPatchStore(subject.configuration),
          'corrupt-store',
          [share.shareSecret]
        )
      } finally {
        await subject.cleanup()
      }
    }
  })

  it('refuses malformed persisted state instead of resetting it', async () => {
    const cases = [
      async ({ paths, metadata }) => {
        metadata.unknown = true
        await writeCanonicalMetadata(paths.metadataPath, metadata)
      },
      async ({ paths, metadata }) => {
        const serialized = JSON.stringify(metadata)
        await writeFile(
          paths.metadataPath,
          `${serialized.slice(0, -1)},"shareId":${JSON.stringify(
            metadata.shareId
          )}}\n`,
          'utf8'
        )
      },
      async ({ paths }) => {
        await rm(paths.ciphertextPath)
      },
      async ({ paths }) => {
        const bytes = await readFile(paths.revocationPath)
        bytes[1] ^= 1
        await writeFile(paths.revocationPath, bytes)
      },
      async ({ paths }) => {
        await writeFile(paths.metadataPath, Buffer.alloc(64 * 1024 + 1))
      },
      async ({ paths, metadata }) => {
        await writeFile(
          paths.ciphertextPath,
          Buffer.alloc(metadata.artifactByteLength + 1)
        )
      },
      async ({ paths }) => {
        await writeFile(join(paths.directoryPath, 'unexpected.txt'), 'x')
      },
      async ({ paths }) => {
        await rename(
          paths.directoryPath,
          join(paths.directoryPath, '..', `share-${'f'.repeat(64)}`)
        )
      },
    ]

    for (const mutate of cases) {
      const subject = await fixture()
      try {
        const artifact = encoder.encode('persisted corruption')
        const share = await subject.store.createShare(createInput(artifact))
        const paths = await readMetadata(subject.dataDirectory)
        await mutate({ paths, metadata: paths.metadata })
        await expectCode(
          createCloudPatchStore(subject.configuration),
          'corrupt-store',
          [share.shareSecret]
        )
        assert.notEqual((await readdir(subject.dataDirectory)).length, 0)
      } finally {
        await subject.cleanup()
      }
    }
  })

  it('recovers only fixed owned pending and revoked directories', async () => {
    const dataDirectory = await mkdtemp(
      join(tmpdir(), 'desktop-material-cloud-patches-recovery-')
    )
    try {
      const pending = join(dataDirectory, `.pending-${'a'.repeat(64)}`)
      const revoked = join(dataDirectory, `.revoked-${'b'.repeat(64)}`)
      await mkdir(pending)
      await mkdir(revoked)
      await writeFile(join(pending, 'partial'), 'partial plaintext canary')
      await writeFile(join(revoked, 'old'), 'retired')
      await writeFile(join(dataDirectory, 'unrelated-sentinel.txt'), 'keep')

      const subject = await fixture({ dataDirectory })
      assert.deepEqual(await readdir(dataDirectory), ['unrelated-sentinel.txt'])
      assert.deepEqual(
        await subject.store.listOwnerShares({ ownerDeviceId: Owner }),
        []
      )
      await writeFile(
        join(dataDirectory, '.pending-malformed'),
        'do not delete'
      )
      await expectCode(
        createCloudPatchStore(subject.configuration),
        'corrupt-store'
      )
      assert.equal(
        await readFile(join(dataDirectory, '.pending-malformed'), 'utf8'),
        'do not delete'
      )
    } finally {
      await rm(dataDirectory, { recursive: true, force: true })
    }
  })

  it('imports no network, child-process, logging, Git, apply, or archive capability', async () => {
    const source = await readFile(
      new URL('../cloud-patch-store.mjs', import.meta.url),
      'utf8'
    )
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
      match => match[1]
    )
    assert.deepEqual(imports, ['node:crypto', 'node:fs/promises', 'node:path'])
    assert.doesNotMatch(source, /\breadFile\s*\(/)
    assert.match(
      source,
      /readBoundedFile\([\s\S]+MaximumMetadataBytes[\s\S]+readBoundedFile\([\s\S]+maximumArtifactBytes/
    )
    assert.ok(
      source.indexOf('value.artifact.byteLength > maximumArtifactBytes') <
        source.indexOf('Uint8Array.from(value.artifact)')
    )
    assert.doesNotMatch(
      source,
      /finalDirectories\.length\s*>\s*CloudPatchMaximumActiveShares/
    )
    assert.ok(
      source.indexOf('await this.pruneExpired(now)') <
        source.indexOf('this.validateActiveLimits(errorCode)')
    )
    assert.match(
      source,
      /syncDirectory\(pending\.path\)[\s\S]+rename\(pending\.path, finalPath\)[\s\S]+syncDirectory\(this\.dataDirectory\)/
    )
    assert.match(
      source,
      /rename\(finalPath, revokedPath\)[\s\S]+syncDirectory\(this\.dataDirectory\)/
    )
    assert.match(
      source,
      /async revokeShareSerialized[\s\S]+persistRevocation\([\s\S]+await this\.retire/
    )
    assert.equal(source.match(/encryptArtifact\(/g)?.length, 2)
    for (const forbidden of [
      /\bimport\s*\(/,
      /node:(?:http|https|net|tls|dns|dgram|child_process|worker_threads)/,
      /\b(?:fetch|XMLHttpRequest|WebSocket)\b/,
      /(?:^|[^\w.])(?:spawn|exec|execFile|fork|eval)\s*\(/m,
      /\bnew\s+Function\b/,
      /\b(?:console|logger)\s*\./,
      /\bprocess\.env\b/,
      /\bgit\b/i,
      /\barchive\b/i,
      /\bapply(?:Patch)?\s*\(/,
    ]) {
      assert.doesNotMatch(source, forbidden)
    }
  })
})
