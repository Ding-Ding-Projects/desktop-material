import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'
import { Account, getAccountKey } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import {
  IGitHubRelease,
  IGitHubReleaseAsset,
  IGitHubReleaseAssetList,
  IGitHubReleaseDraft,
} from '../../../src/lib/github-releases'
import {
  IGitHubReleaseAssetUploadRange,
  IGitHubReleaseTransferProgressEvent,
} from '../../../src/lib/github-release-transfer'
import { IGitHubReleaseMutationReview } from '../../../src/lib/stores/github-releases-store'
import {
  defaultCheapLfsFileSystem,
  ICheapLfsReleasesGateway,
  materializePointer,
  pinFileToRelease,
  planCheapLfsManualUpload,
} from '../../../src/lib/cheap-lfs/operations'
import {
  isEncryptedCheapLfsPointer,
  parseCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'
import {
  CheapLfsAuthenticationError,
  CheapLfsEncryptionError,
  CheapLfsPasswordRequiredError,
  CheapLfsPayloadIntegrityError,
} from '../../../src/lib/cheap-lfs/payload-encryption'

const execFile = promisify(execFileCallback)

const selected = new Account(
  'selected',
  'https://api.github.com',
  'selected-token',
  [],
  '',
  2,
  'Selected'
)

const gitHubRepository = new GitHubRepository(
  'material',
  new Owner('desktop', 'https://api.github.com', 1),
  1
)

function repositoryAt(path: string): Repository {
  return new Repository(
    path,
    1,
    gitHubRepository,
    false,
    null,
    {},
    false,
    undefined,
    getAccountKey(selected),
    undefined,
    null,
    'main'
  )
}

class EncryptedReleaseGateway implements ICheapLfsReleasesGateway {
  private release: IGitHubRelease | null = null
  private nextAssetId = 1
  private readonly payloads = new Map<number, Buffer>()
  public readonly uploadSourcePaths = new Array<string>()
  public readonly downloadDestinationPaths = new Array<string>()
  public releaseLookupCount = 0

  public async getReleaseByTag(
    _repository: Repository,
    tag: string
  ): Promise<IGitHubRelease | null> {
    this.releaseLookupCount++
    return this.release?.tagName === tag ? this.release : null
  }

  public async create(
    _repository: Repository,
    draft: IGitHubReleaseDraft,
    publishImmediately: boolean
  ): Promise<IGitHubRelease> {
    this.release = {
      id: 7,
      tagName: draft.tagName,
      targetCommitish: draft.targetCommitish,
      name: draft.name,
      body: draft.body,
      draft: !publishImmediately,
      prerelease: draft.prerelease,
      createdAt: new Date(0),
      publishedAt: publishImmediately ? new Date(0) : null,
      authorLogin: 'fixture-bot',
      assets: [],
    }
    return this.release
  }

  public async listAssets(
    _repository: Repository,
    _releaseId: number,
    page: number = 1
  ): Promise<IGitHubReleaseAssetList> {
    return {
      assets: this.release?.assets ?? [],
      page,
      nextPage: null,
      capped: false,
    }
  }

  public createMutationReview(
    _repository: Repository,
    release: IGitHubRelease,
    asset?: IGitHubReleaseAsset | null
  ): IGitHubReleaseMutationReview {
    return { release, asset } as unknown as IGitHubReleaseMutationReview
  }

  public async publish(
    _repository: Repository,
    _review: IGitHubReleaseMutationReview
  ): Promise<IGitHubRelease> {
    assert.notEqual(this.release, null)
    this.release = { ...this.release!, draft: false }
    return this.release
  }

  public async uploadAsset(
    _repository: Repository,
    _review: IGitHubReleaseMutationReview,
    sourcePath: string,
    name: string,
    label: string | null,
    _signal: AbortSignal,
    onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void,
    range?: IGitHubReleaseAssetUploadRange,
    expectedDigest?: string
  ) {
    assert.equal(
      range,
      undefined,
      'encrypted parts upload their ciphertext temp, never a plaintext range'
    )
    const bytes = await readFile(sourcePath)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    assert.equal(expectedDigest, `sha256:${sha256}`)
    const asset: IGitHubReleaseAsset = {
      id: this.nextAssetId++,
      name,
      label,
      state: 'uploaded',
      contentType: 'application/octet-stream',
      sizeInBytes: bytes.length,
      downloadCount: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      digest: `sha256:${sha256}`,
    }
    this.uploadSourcePaths.push(sourcePath)
    this.payloads.set(asset.id, Buffer.from(bytes))
    assert.notEqual(this.release, null)
    this.release = {
      ...this.release!,
      assets: [...this.release!.assets, asset],
    }
    onProgress?.({
      operationId: `upload-${asset.id}`,
      direction: 'upload',
      transferredBytes: bytes.length,
      totalBytes: bytes.length,
    })
    return {
      asset,
      bytes: bytes.length,
      localDigest: `sha256:${sha256}`,
    }
  }

  public async deleteAsset(
    _repository: Repository,
    review: IGitHubReleaseMutationReview
  ): Promise<void> {
    const asset = (review as unknown as { asset?: IGitHubReleaseAsset }).asset
    if (asset === undefined || this.release === null) {
      return
    }
    this.payloads.delete(asset.id)
    this.release = {
      ...this.release,
      assets: this.release.assets.filter(
        candidate => candidate.id !== asset.id
      ),
    }
  }

  public async downloadAsset(
    _repository: Repository,
    _releaseId: number,
    asset: IGitHubReleaseAsset,
    destination: string,
    _signal: AbortSignal,
    onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void
  ): Promise<{ readonly path: string; readonly bytes: number }> {
    const bytes = this.payloads.get(asset.id)
    assert.notEqual(bytes, undefined)
    await writeFile(destination, bytes!)
    this.downloadDestinationPaths.push(destination)
    onProgress?.({
      operationId: `download-${asset.id}`,
      direction: 'download',
      transferredBytes: bytes!.length,
      totalBytes: bytes!.length,
    })
    return { path: destination, bytes: bytes!.length }
  }

  public storedPayload(assetId: number): Buffer {
    const payload = this.payloads.get(assetId)
    assert.notEqual(payload, undefined)
    return Buffer.from(payload!)
  }

  public replaceStoredPayload(assetId: number, payload: Buffer): void {
    assert.equal(this.payloads.has(assetId), true)
    this.payloads.set(assetId, Buffer.from(payload))
  }
}

async function gitRepository(): Promise<{
  readonly dir: string
  readonly repository: Repository
  readonly dispose: () => Promise<void>
}> {
  const dir = await mkdtemp(join(tmpdir(), 'cheap-lfs-encrypted-release-'))
  await execFile('git', ['init', '--quiet'], { cwd: dir })
  return {
    dir,
    repository: repositoryAt(dir),
    dispose: () => rm(dir, { recursive: true, force: true }),
  }
}

async function assertRemoved(paths: ReadonlyArray<string>): Promise<void> {
  for (const path of paths) {
    await assert.rejects(stat(path), { code: 'ENOENT' })
  }
}

describe('encrypted GitHub Release Cheap LFS operations', () => {
  it('rejects an empty pin secret before provider access', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const sourcePath = join(dir, 'payload.bin')
      const plaintext = Buffer.from('leave me local')
      await writeFile(sourcePath, plaintext)
      const releases = new EncryptedReleaseGateway()

      await assert.rejects(
        pinFileToRelease(releases, repository, selected, {
          absoluteFilePath: sourcePath,
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
          encryptionPassword: Buffer.alloc(0),
        }),
        CheapLfsPasswordRequiredError
      )
      assert.equal(releases.releaseLookupCount, 0)
      assert.deepEqual(await readFile(sourcePath), plaintext)
    } finally {
      await dispose()
    }
  })

  it('pins ciphertext metadata and materializes only authenticated plaintext', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const sourcePath = join(dir, 'payload.bin')
      const plaintext = Buffer.from(
        'plaintext payload whose provider object must be ciphertext\n'.repeat(
          128
        )
      )
      const password = Buffer.from('release payload password')
      await writeFile(sourcePath, plaintext)
      const releases = new EncryptedReleaseGateway()

      const pinned = await pinFileToRelease(releases, repository, selected, {
        absoluteFilePath: sourcePath,
        trackedRelativePath: 'payload.bin',
        releaseTag: 'assets',
        encryptionPassword: password,
      })
      assert.equal(isEncryptedCheapLfsPointer(pinned.pointer), true)
      assert.equal(pinned.pointer.parts?.length, 1)
      const part = pinned.pointer.parts![0]
      assert.equal(part.encrypted, true)
      assert.equal(part.sizeInBytes, plaintext.length)
      assert.equal(
        part.sha256,
        createHash('sha256').update(plaintext).digest('hex')
      )

      const stored = releases.storedPayload(pinned.asset.id)
      assert.equal(part.storedSizeInBytes, stored.length)
      assert.equal(
        part.storedSha256,
        createHash('sha256').update(stored).digest('hex')
      )
      assert.notEqual(part.storedSha256, part.sha256)
      assert.notDeepEqual(stored, plaintext)
      assert.deepEqual(
        parseCheapLfsPointer(await readFile(sourcePath, 'utf8')),
        pinned.pointer
      )
      await assertRemoved(releases.uploadSourcePaths)

      const releaseLookupsBeforeMissingPassword = releases.releaseLookupCount
      await assert.rejects(
        materializePointer(releases, repository, selected, 'payload.bin'),
        CheapLfsPasswordRequiredError
      )
      await assert.rejects(
        materializePointer(
          releases,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          undefined,
          undefined,
          ''
        ),
        CheapLfsPasswordRequiredError
      )
      await assert.rejects(
        materializePointer(
          releases,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          undefined,
          undefined,
          Buffer.alloc(0)
        ),
        CheapLfsPasswordRequiredError
      )
      assert.equal(
        releases.releaseLookupCount,
        releaseLookupsBeforeMissingPassword
      )
      assert.equal(releases.downloadDestinationPaths.length, 0)

      const restored = await materializePointer(
        releases,
        repository,
        selected,
        'payload.bin',
        undefined,
        undefined,
        undefined,
        undefined,
        password
      )
      assert.equal(restored.bytes, plaintext.length)
      assert.deepEqual(await readFile(sourcePath), plaintext)
      await assertRemoved(releases.downloadDestinationPaths)
      assert.equal(
        password.toString('utf8'),
        'release payload password',
        'the caller retains ownership of its mutable secret'
      )
      password.fill(0)
    } finally {
      await dispose()
    }
  })

  it('leaves the pointer intact for a wrong password, tamper, or truncation', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const sourcePath = join(dir, 'payload.bin')
      const plaintext = Buffer.from('authenticated bytes\n'.repeat(256))
      const password = Buffer.from('correct release password')
      await writeFile(sourcePath, plaintext)
      const releases = new EncryptedReleaseGateway()
      const pinned = await pinFileToRelease(releases, repository, selected, {
        absoluteFilePath: sourcePath,
        trackedRelativePath: 'payload.bin',
        releaseTag: 'assets',
        encryptionPassword: password,
      })
      const pointerText = await readFile(sourcePath, 'utf8')
      const originalStored = releases.storedPayload(pinned.asset.id)

      await assert.rejects(
        materializePointer(
          releases,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          undefined,
          undefined,
          Buffer.from('wrong release password')
        ),
        CheapLfsAuthenticationError
      )
      assert.equal(await readFile(sourcePath, 'utf8'), pointerText)

      const tampered = Buffer.from(originalStored)
      tampered[tampered.length - 1] ^= 0x01
      releases.replaceStoredPayload(pinned.asset.id, tampered)
      await assert.rejects(
        materializePointer(
          releases,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          undefined,
          undefined,
          password
        ),
        CheapLfsPayloadIntegrityError
      )
      assert.equal(await readFile(sourcePath, 'utf8'), pointerText)

      releases.replaceStoredPayload(
        pinned.asset.id,
        originalStored.subarray(0, originalStored.length - 1)
      )
      await assert.rejects(
        materializePointer(
          releases,
          repository,
          selected,
          'payload.bin',
          undefined,
          undefined,
          undefined,
          undefined,
          password
        ),
        CheapLfsPayloadIntegrityError
      )
      assert.equal(await readFile(sourcePath, 'utf8'), pointerText)
      await assertRemoved(releases.downloadDestinationPaths)
      password.fill(0)
    } finally {
      await dispose()
    }
  })

  it('surfaces a plaintext-temp cleanup failure instead of reporting success', async () => {
    const { dir, repository, dispose } = await gitRepository()
    let leakedPlaintextPath: string | undefined
    try {
      const sourcePath = join(dir, 'payload.bin')
      const plaintext = Buffer.from('cleanup must be proven\n'.repeat(128))
      const password = Buffer.from('cleanup test password')
      await writeFile(sourcePath, plaintext)
      const releases = new EncryptedReleaseGateway()
      await pinFileToRelease(releases, repository, selected, {
        absoluteFilePath: sourcePath,
        trackedRelativePath: 'payload.bin',
        releaseTag: 'assets',
        encryptionPassword: password,
      })

      const fs = {
        ...defaultCheapLfsFileSystem,
        removeFile: async (path: string) => {
          if (releases.downloadDestinationPaths.includes(path)) {
            await defaultCheapLfsFileSystem.removeFile(path)
            return
          }
          leakedPlaintextPath = path
          throw new Error('forced plaintext cleanup failure')
        },
      }
      const error = await materializePointer(
        releases,
        repository,
        selected,
        'payload.bin',
        undefined,
        undefined,
        fs,
        undefined,
        password
      ).catch(candidate => candidate)
      assert.ok(error instanceof AggregateError)
      assert.match(error.message, /could not remove 1 app-owned temporary file/)
      assert.notEqual(leakedPlaintextPath, undefined)
      assert.deepEqual(await readFile(sourcePath), plaintext)
      assert.deepEqual(await readFile(leakedPlaintextPath!), plaintext)
      password.fill(0)
    } finally {
      if (leakedPlaintextPath !== undefined) {
        await defaultCheapLfsFileSystem.removeFile(leakedPlaintextPath)
      }
      await dispose()
    }
  })

  it('refuses to hand plaintext ranges to the browser upload fallback', async () => {
    const releases = new EncryptedReleaseGateway()
    await assert.rejects(
      planCheapLfsManualUpload(
        releases,
        repositoryAt('C:\\fixture'),
        selected,
        [
          {
            absoluteFilePath: 'C:\\fixture\\payload.bin',
            trackedRelativePath: 'payload.bin',
            releaseTag: 'assets',
            encryptionPassword: Buffer.from('secret'),
          },
        ]
      ),
      CheapLfsEncryptionError
    )
  })
})
