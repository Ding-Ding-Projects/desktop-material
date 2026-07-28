import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { Account, getAccountKey } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import {
  IGitHubRelease,
  IGitHubReleaseAsset,
} from '../../../src/lib/github-releases'
import { IGitHubReleaseMutationReview } from '../../../src/lib/stores/github-releases-store'
import { CheapLfsReleaseBodySentinel } from '../../../src/lib/cheap-lfs/asset-version'
import {
  defaultCheapLfsFileSystem,
  ICheapLfsFileSystem,
  ICheapLfsReleasesGateway,
  materializePointer,
  pinFileToRelease,
} from '../../../src/lib/cheap-lfs/operations'
import {
  isEncryptedCheapLfsPointer,
  isEncryptedCheapLfsPointerPart,
  parseCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'
import { verifyStoredCheapLfsEncryptedPart } from '../../../src/lib/cheap-lfs/encrypted-payload'

// The shipping cost is 2^17, which is the point. These cases exercise the pin
// and restore wiring, not the key-derivation cost that `payload-encryption-
// test.ts` measures, so they use a cheap KDF to stay a unit test.
const fastKdf = { logN: 2, blockSize: 1, parallelism: 1 }
const passphrase = 'a-passphrase-only-this-suite-uses-8842'
const wrongPassphrase = 'a-different-passphrase-entirely-3317'

const selected = new Account(
  'selected',
  'https://api.github.com',
  'selected-token',
  [],
  '',
  2,
  'Selected'
)

const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')

function repositoryAt(path: string): Repository {
  return new Repository(
    path,
    1,
    new GitHubRepository(
      'material',
      new Owner('desktop', 'https://api.github.com', 1),
      1
    ),
    false,
    null,
    {},
    false,
    undefined,
    getAccountKey(selected),
    undefined,
    null,
    'trunk'
  )
}

/**
 * A release bucket held entirely in memory, recording the exact bytes each
 * upload consumed so a test can look at what actually left the machine.
 */
function inMemoryBucket() {
  const stored = new Map<string, Buffer>()
  const assets = new Array<IGitHubReleaseAsset>()
  let nextId = 100
  const release = (): IGitHubRelease => ({
    id: 7,
    name: 'assets',
    tagName: 'assets',
    body: CheapLfsReleaseBodySentinel,
    draft: false,
    prerelease: true,
    createdAt: new Date('2026-07-27T00:00:00Z'),
    publishedAt: new Date('2026-07-27T00:00:00Z'),
    htmlURL: 'https://github.com/desktop/material/releases/tag/assets',
    targetCommitish: 'trunk',
    authorLogin: 'selected',
    assets: [...assets],
  })
  const gateway: ICheapLfsReleasesGateway = {
    getReleaseByTag: async (_repository, tag) =>
      tag === 'assets' ? release() : null,
    create: async () => release(),
    listAssets: async () => ({
      assets: [...assets],
      page: 1,
      nextPage: null,
      capped: false,
    }),
    createMutationReview: (_repository, reviewedRelease, reviewedAsset) =>
      ({
        repositoryFingerprint: 'fixture',
        release: reviewedRelease,
        asset: reviewedAsset ?? null,
        account: selected,
        uploadURL: 'https://uploads.github.com/fixture',
        // Only the fields this fixture actually exercises; the real review
        // carries account and release fingerprints the in-memory bucket has no
        // equivalent for.
      } as unknown as IGitHubReleaseMutationReview),
    publish: async () => release(),
    uploadAsset: async (
      _repository,
      _review,
      sourcePath,
      name,
      _label,
      _signal,
      _onProgress,
      range
    ) => {
      const whole = await readFile(sourcePath)
      const bytes =
        range === undefined
          ? whole
          : whole.subarray(range.offset, range.offset + range.length)
      stored.set(name, Buffer.from(bytes))
      const asset: IGitHubReleaseAsset = {
        id: nextId++,
        name,
        label: null,
        sizeInBytes: bytes.length,
        contentType: 'application/octet-stream',
        state: 'uploaded',
        downloadCount: 0,
        createdAt: new Date('2026-07-27T00:00:00Z'),
        updatedAt: new Date('2026-07-27T00:00:00Z'),
        digest: `sha256:${sha256(Buffer.from(bytes))}`,
      }
      assets.push(asset)
      return {
        asset,
        bytes: bytes.length,
        localDigest: `sha256:${sha256(Buffer.from(bytes))}`,
      }
    },
    deleteAsset: async () => undefined,
    downloadAsset: async (_repository, _releaseId, asset, destination) => {
      const bytes = stored.get(asset.name)
      assert.ok(bytes !== undefined, `no stored asset named ${asset.name}`)
      await writeFile(destination, bytes)
      return { path: destination, bytes: bytes.length }
    },
  }
  return { gateway, stored, assets }
}

/**
 * The legacy (no tracked-path store) disk seam, which is what the surrounding
 * suite already uses: real files, real hashing, real sealing, no git directory
 * required. `allocatePayloadTemporaryPath` is forced to `null` so payload temps
 * fall back to in-tree siblings rather than needing a repository git dir.
 */
function legacyFileSystem(): ICheapLfsFileSystem {
  return {
    ...defaultCheapLfsFileSystem,
    allocatePayloadTemporaryPath: async () => null,
    resolveReleaseTargetCommitish: async () => 'trunk',
  }
}

async function withTempRepository(
  run: (dir: string, repository: Repository) => Promise<void>
) {
  const dir = await mkdtemp(join(tmpdir(), 'cheeplfs-encrypt-'))
  try {
    await run(dir, repositoryAt(dir))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('Cheap LFS encryption on the pin path', () => {
  it('uploads ciphertext when encryption is enabled', async () => {
    await withTempRepository(async (dir, repository) => {
      const plaintext = Buffer.from(
        'a recognisable run of plaintext bytes that must not reach the release'
      )
      const source = join(dir, 'payload.bin')
      await writeFile(source, plaintext)
      const bucket = inMemoryBucket()

      const result = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryption: { password: passphrase, kdf: fastKdf },
        },
        undefined,
        undefined,
        legacyFileSystem()
      )

      assert.ok(isEncryptedCheapLfsPointer(result.pointer))
      assert.equal(result.pointer.encryptionFormatVersion, 1)
      // The head fields stay the tracked file's own identity.
      assert.equal(result.pointer.sizeInBytes, plaintext.length)
      assert.equal(result.pointer.sha256, sha256(plaintext))

      const uploaded = [...bucket.stored.values()]
      assert.equal(uploaded.length, 1)
      assert.ok(
        !uploaded[0].includes(plaintext),
        'the plaintext must not appear in the uploaded asset'
      )
      assert.ok(uploaded[0].length > plaintext.length)

      const parts = result.pointer.parts!
      assert.equal(parts.length, 1)
      assert.ok(isEncryptedCheapLfsPointerPart(parts[0]))
      assert.equal(parts[0].encryptedStoredSizeInBytes, uploaded[0].length)
      assert.equal(parts[0].encryptedStoredSha256, sha256(uploaded[0]))
    })
  })

  it('uploads the plaintext bytes unchanged when encryption is disabled', async () => {
    await withTempRepository(async (dir, repository) => {
      const plaintext = Buffer.from('ordinary unencrypted payload bytes')
      const source = join(dir, 'payload.bin')
      await writeFile(source, plaintext)
      const bucket = inMemoryBucket()

      const result = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
        },
        undefined,
        undefined,
        legacyFileSystem()
      )

      assert.equal(result.pointer.encryptionFormatVersion, undefined)
      assert.ok(!isEncryptedCheapLfsPointer(result.pointer))
      // A single plain asset keeps the original five-line pointer exactly.
      assert.equal(result.pointer.parts, undefined)
      const uploaded = [...bucket.stored.values()]
      assert.ok(uploaded[0].equals(plaintext))
    })
  })

  it('lets a client verify the stored asset without the passphrase', async () => {
    await withTempRepository(async (dir, repository) => {
      const plaintext = Buffer.from('bytes whose integrity anyone may check')
      const source = join(dir, 'payload.bin')
      await writeFile(source, plaintext)
      const bucket = inMemoryBucket()

      const result = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryption: { password: passphrase, kdf: fastKdf },
        },
        undefined,
        undefined,
        legacyFileSystem()
      )

      // Everything from here on uses only the committed pointer text and the
      // stored bytes. No passphrase is in scope.
      const committed = parseCheapLfsPointer(
        await readFile(join(dir, 'payload.bin'), 'utf8')
      )!
      for (const part of committed.parts!) {
        const asset = bucket.stored.get(part.name)!
        verifyStoredCheapLfsEncryptedPart(part, asset)
        assert.equal(
          bucket.assets.find(a => a.name === part.name)!.sizeInBytes,
          part.encryptedStoredSizeInBytes
        )
      }
      assert.equal(committed.sha256, result.pointer.sha256)
    })
  })

  it('restores the exact original bytes with the right passphrase', async () => {
    await withTempRepository(async (dir, repository) => {
      const plaintext = Buffer.from(
        'the bytes that have to come back byte-for-byte'
      )
      const source = join(dir, 'payload.bin')
      await writeFile(source, plaintext)
      const bucket = inMemoryBucket()
      const fs = legacyFileSystem()

      await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryption: { password: passphrase, kdf: fastKdf },
        },
        undefined,
        undefined,
        fs
      )

      await materializePointer(
        bucket.gateway,
        repository,
        selected,
        'payload.bin',
        undefined,
        undefined,
        fs,
        undefined,
        async () => passphrase
      )

      assert.ok((await readFile(source)).equals(plaintext))
    })
  })

  it('reports decrypting, not decompressing, while it decrypts', async () => {
    // scrypt at the configured cost makes this the longest visible step of an
    // encrypted restore, so it is precisely the step a user reads. Naming it
    // "Decompressing" was wrong at the worst possible moment.
    await withTempRepository(async (dir, repository) => {
      const source = join(dir, 'payload.bin')
      await writeFile(source, Buffer.from('bytes worth naming the stage for'))
      const bucket = inMemoryBucket()
      const fs = legacyFileSystem()
      const phases: Array<string> = []

      await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryption: { password: passphrase, kdf: fastKdf },
        },
        undefined,
        undefined,
        fs
      )

      await materializePointer(
        bucket.gateway,
        repository,
        selected,
        'payload.bin',
        undefined,
        update => phases.push(update.phase),
        fs,
        undefined,
        async () => passphrase
      )

      assert.ok(
        phases.includes('decrypting'),
        `an encrypted restore must report the decrypting phase, saw: ${phases.join(
          ', '
        )}`
      )
      assert.ok(
        !phases.includes('decompressing'),
        `nothing was compressed, so no restore may claim it was, saw: ${phases.join(
          ', '
        )}`
      )
    })
  })

  it('leaves the pointer in place when the passphrase is wrong', async () => {
    await withTempRepository(async (dir, repository) => {
      const source = join(dir, 'payload.bin')
      await writeFile(source, Buffer.from('bytes nobody gets back today'))
      const bucket = inMemoryBucket()
      const fs = legacyFileSystem()

      await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryption: { password: passphrase, kdf: fastKdf },
        },
        undefined,
        undefined,
        fs
      )
      const pointerText = await readFile(source, 'utf8')

      await assert.rejects(
        materializePointer(
          bucket.gateway,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          fs,
          undefined,
          async () => wrongPassphrase
        ),
        (error: Error) => {
          // Never echo either passphrase, including on this path.
          assert.ok(!error.message.includes(passphrase))
          assert.ok(!error.message.includes(wrongPassphrase))
          return true
        }
      )
      // No partial write: the committed pointer is byte-for-byte what it was.
      assert.equal(await readFile(source, 'utf8'), pointerText)
    })
  })

  it('fails closed when the stored container digest drifts', async () => {
    await withTempRepository(async (dir, repository) => {
      const source = join(dir, 'payload.bin')
      await writeFile(source, Buffer.from('bytes that will be tampered with'))
      const bucket = inMemoryBucket()
      const fs = legacyFileSystem()

      await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryption: { password: passphrase, kdf: fastKdf },
        },
        undefined,
        undefined,
        fs
      )
      const pointerText = await readFile(source, 'utf8')

      // Flip one byte of the stored container while keeping its length, so the
      // asset-size check passes and only the recorded digest can catch it.
      const [name, container] = [...bucket.stored.entries()][0]
      const tampered = Buffer.from(container)
      tampered[tampered.length - 1] ^= 0x40
      bucket.stored.set(name, tampered)

      await assert.rejects(
        materializePointer(
          bucket.gateway,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          fs,
          undefined,
          async () => passphrase
        ),
        /digest recorded in the pointer/
      )
      assert.equal(await readFile(source, 'utf8'), pointerText)
    })
  })

  it('fails closed when the stored container size drifts', async () => {
    await withTempRepository(async (dir, repository) => {
      const source = join(dir, 'payload.bin')
      await writeFile(source, Buffer.from('bytes that will be truncated'))
      const bucket = inMemoryBucket()
      const fs = legacyFileSystem()

      await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryption: { password: passphrase, kdf: fastKdf },
        },
        undefined,
        undefined,
        fs
      )
      const pointerText = await readFile(source, 'utf8')

      const [name, container] = [...bucket.stored.entries()][0]
      bucket.stored.set(name, container.subarray(0, container.length - 1))

      await assert.rejects(
        materializePointer(
          bucket.gateway,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          fs,
          undefined,
          async () => passphrase
        )
      )
      assert.equal(await readFile(source, 'utf8'), pointerText)
    })
  })

  it('refuses to restore an encrypted pointer with no passphrase resolver', async () => {
    await withTempRepository(async (dir, repository) => {
      const source = join(dir, 'payload.bin')
      await writeFile(source, Buffer.from('bytes needing a passphrase'))
      const bucket = inMemoryBucket()
      const fs = legacyFileSystem()

      await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: source,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryption: { password: passphrase, kdf: fastKdf },
        },
        undefined,
        undefined,
        fs
      )

      await assert.rejects(
        materializePointer(
          bucket.gateway,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          fs
        ),
        /cannot decrypt them/
      )
    })
  })

  it('refuses to pin at all when the transfer seam cannot encrypt', async () => {
    await withTempRepository(async (dir, repository) => {
      const source = join(dir, 'payload.bin')
      await writeFile(source, Buffer.from('bytes that must not go out plain'))
      const bucket = inMemoryBucket()
      const fs: ICheapLfsFileSystem = {
        ...legacyFileSystem(),
        sealEncryptedPart: undefined,
      }

      await assert.rejects(
        pinFileToRelease(
          bucket.gateway,
          repository,
          selected,
          {
            absoluteFilePath: source,
            trackedRelativePath: 'payload.bin',
            releaseTag: 'assets',
            encryption: { password: passphrase, kdf: fastKdf },
          },
          undefined,
          undefined,
          fs
        ),
        /cannot encrypt/
      )
      assert.equal(bucket.stored.size, 0)
    })
  })
})
