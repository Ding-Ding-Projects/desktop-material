import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { Disposable } from 'event-kit'
import { Account, getAccountKey } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { AccountsStore } from '../../../src/lib/stores/accounts-store'
import {
  GitHubReleasesStore,
  IGitHubReleasesAPI,
  IGitHubReleasesStoreDependencies,
} from '../../../src/lib/stores/github-releases-store'
import {
  GitHubReleaseAssetMaximumUploadBytes,
  IGitHubRelease,
  IGitHubReleaseAsset,
} from '../../../src/lib/github-releases'
import {
  defaultCheapLfsFileSystem,
  ICheapLfsFileSystem,
  listCheapLfsPointers,
  materializePointer,
  pinFileToRelease,
} from '../../../src/lib/cheap-lfs/operations'
import {
  CHEAP_LFS_POINTER_VERSION,
  ICheapLfsPointer,
  parseCheapLfsPointer,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'

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
    getAccountKey(selected)
  )
}

const asset: IGitHubReleaseAsset = {
  id: 19,
  name: 'desktop.exe',
  label: null,
  state: 'uploaded',
  contentType: 'application/octet-stream',
  sizeInBytes: 4,
  downloadCount: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  digest: `sha256:${'a'.repeat(64)}`,
}
const release: IGitHubRelease = {
  id: 7,
  tagName: 'v1.0.0',
  targetCommitish: 'main',
  name: 'Stable',
  body: 'Notes',
  draft: true,
  prerelease: false,
  createdAt: new Date(0),
  publishedAt: null,
  authorLogin: 'fixture-bot',
  assets: [asset],
}

class FakeAccountsStore {
  private readonly callbacks = new Set<
    (accounts: ReadonlyArray<Account>) => void
  >()

  public constructor(private accounts: ReadonlyArray<Account>) {}

  public async getAll() {
    return this.accounts
  }

  public onDidUpdate(callback: (accounts: ReadonlyArray<Account>) => void) {
    this.callbacks.add(callback)
    return new Disposable(() => this.callbacks.delete(callback))
  }
}

function fakeAPI(
  overrides: Partial<IGitHubReleasesAPI> = {}
): IGitHubReleasesAPI {
  return {
    fetchReleases: async () => ({
      releases: [release],
      page: 1,
      nextPage: null,
      capped: false,
    }),
    fetchRelease: async () => release,
    fetchReleaseByTag: async () => null,
    fetchReleaseAssets: async () => ({
      assets: [asset],
      page: 1,
      nextPage: null,
      capped: false,
    }),
    fetchReleaseAsset: async () => asset,
    createReleaseDraft: async () => release,
    updateRelease: async () => release,
    publishRelease: async () => ({ ...release, draft: false }),
    deleteRelease: async () => undefined,
    deleteReleaseAsset: async () => undefined,
    ...overrides,
  }
}

function dependencies(
  apiFor: IGitHubReleasesStoreDependencies['apiFor'],
  transfer: Partial<IGitHubReleasesStoreDependencies> = {}
): IGitHubReleasesStoreDependencies {
  return {
    apiFor,
    downloadAsset: async () => ({
      ok: true,
      path: 'C:\\Downloads\\desktop.exe',
      bytes: 4,
      localDigest: asset.digest!,
      matchesGitHubDigest: true,
    }),
    uploadAsset: async () => ({
      ok: true,
      asset,
      bytes: 4,
      localDigest: asset.digest!,
    }),
    ...transfer,
  }
}

async function storeWith(deps: IGitHubReleasesStoreDependencies) {
  const store = new GitHubReleasesStore(
    new FakeAccountsStore([selected]) as unknown as AccountsStore,
    deps
  )
  await Promise.resolve()
  return store
}

async function withTempRepository(
  run: (dir: string, repository: Repository) => Promise<void>
) {
  const dir = await mkdtemp(join(tmpdir(), 'cheeplfs-'))
  try {
    await run(dir, repositoryAt(dir))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('cheap LFS operations', () => {
  it('pins a file: hashes it, uploads it, and writes a matching pointer', async () => {
    await withTempRepository(async (dir, repository) => {
      const filePath = join(dir, 'blob.bin')
      const content = Buffer.from('the quick brown fox '.repeat(1000))
      await writeFile(filePath, content)
      const expectedSha = createHash('sha256').update(content).digest('hex')

      const draft: IGitHubRelease = { ...release, assets: [] }
      let uploaded: { sourcePath: string; name: string } | undefined
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => null,
              createReleaseDraft: async () => draft,
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              sourcePath,
              name
            ) => {
              uploaded = { sourcePath, name }
              return {
                ok: true,
                asset: { ...asset, name },
                bytes: content.length,
                localDigest: `sha256:${expectedSha}`,
              }
            },
          }
        )
      )

      const result = await pinFileToRelease(store, repository, selected, {
        absoluteFilePath: filePath,
        trackedRelativePath: 'blob.bin',
        releaseTag: 'v1.0.0',
      })

      assert.equal(result.pointer.sha256, expectedSha)
      assert.equal(result.pointer.sizeInBytes, content.length)
      assert.equal(result.pointer.releaseTag, 'v1.0.0')
      assert.equal(result.pointer.assetName, 'blob.bin')
      assert.equal(result.releaseId, draft.id)
      assert.equal(uploaded?.sourcePath, filePath)
      assert.equal(uploaded?.name, 'blob.bin')

      const written = await readFile(filePath, 'utf8')
      assert.equal(written, serializeCheapLfsPointer(result.pointer))
      assert.deepEqual(parseCheapLfsPointer(written), result.pointer)
    })
  })

  it('materializes a pointer: downloads to temp, verifies, and replaces in place', async () => {
    await withTempRepository(async (dir, repository) => {
      const content = Buffer.from('binary-ish payload '.repeat(500))
      const sha256 = createHash('sha256').update(content).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'v2.0.0',
        assetName: 'payload.bin',
        sizeInBytes: content.length,
        sha256,
      }
      const trackedPath = join(dir, 'payload.bin')
      await writeFile(trackedPath, serializeCheapLfsPointer(pointer), 'utf8')

      const releaseWithAsset: IGitHubRelease = {
        ...release,
        tagName: 'v2.0.0',
        assets: [
          { ...asset, name: 'payload.bin', sizeInBytes: content.length },
        ],
      }
      let destination: string | undefined
      const store = await storeWith(
        dependencies(
          () => fakeAPI({ fetchReleaseByTag: async () => releaseWithAsset }),
          {
            downloadAsset: async (
              _account,
              _repository,
              _releaseId,
              _asset,
              dest
            ) => {
              destination = dest
              await writeFile(dest, content)
              return {
                ok: true,
                path: dest,
                bytes: content.length,
                localDigest: `sha256:${sha256}`,
                matchesGitHubDigest: true,
              }
            },
          }
        )
      )

      const result = await materializePointer(
        store,
        repository,
        selected,
        'payload.bin'
      )

      assert.equal(result.path, trackedPath)
      assert.equal(result.bytes, content.length)
      // The pointer file is now the real bytes: in-place overwrite worked.
      assert.deepEqual(await readFile(trackedPath), content)
      // The temp file was renamed away, so it no longer exists.
      assert.notEqual(destination, undefined)
      await assert.rejects(stat(destination!))
    })
  })

  it('rejects a materialize whose download does not match and leaves the pointer', async () => {
    await withTempRepository(async (dir, repository) => {
      const content = Buffer.from('expected payload '.repeat(500))
      const sha256 = createHash('sha256').update(content).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'v3.0.0',
        assetName: 'thing.bin',
        sizeInBytes: content.length,
        sha256,
      }
      const trackedPath = join(dir, 'thing.bin')
      const pointerText = serializeCheapLfsPointer(pointer)
      await writeFile(trackedPath, pointerText, 'utf8')

      const corrupted = Buffer.from('corrupted bytes '.repeat(400))
      const releaseWithAsset: IGitHubRelease = {
        ...release,
        tagName: 'v3.0.0',
        assets: [{ ...asset, name: 'thing.bin', sizeInBytes: content.length }],
      }
      let destination: string | undefined
      const store = await storeWith(
        dependencies(
          () => fakeAPI({ fetchReleaseByTag: async () => releaseWithAsset }),
          {
            downloadAsset: async (
              _account,
              _repository,
              _releaseId,
              _asset,
              dest
            ) => {
              destination = dest
              await writeFile(dest, corrupted)
              return {
                ok: true,
                path: dest,
                bytes: corrupted.length,
                localDigest: `sha256:${createHash('sha256')
                  .update(corrupted)
                  .digest('hex')}`,
                matchesGitHubDigest: true,
              }
            },
          }
        )
      )

      await assert.rejects(
        materializePointer(store, repository, selected, 'thing.bin'),
        /does not match/
      )
      // The original pointer is untouched and the temp file was removed.
      assert.equal(await readFile(trackedPath, 'utf8'), pointerText)
      assert.notEqual(destination, undefined)
      await assert.rejects(stat(destination!))
    })
  })

  it('rejects a pin above the 128 MiB cap before hashing or uploading', async () => {
    await withTempRepository(async (dir, repository) => {
      let hashed = false
      let uploaded = false
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => {
                throw new Error('release lookup should not run')
              },
            }),
          {
            uploadAsset: async () => {
              uploaded = true
              return { ok: true, asset, bytes: 0, localDigest: asset.digest! }
            },
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        statSize: async () => GitHubReleaseAssetMaximumUploadBytes + 1,
        hashFile: async () => {
          hashed = true
          return { sha256: 'a'.repeat(64), sizeInBytes: 1 }
        },
      }

      await assert.rejects(
        pinFileToRelease(
          store,
          repository,
          selected,
          {
            absoluteFilePath: join(dir, 'huge.bin'),
            trackedRelativePath: 'huge.bin',
            releaseTag: 'v4.0.0',
          },
          undefined,
          undefined,
          fs
        ),
        /128 MiB/
      )
      assert.equal(hashed, false)
      assert.equal(uploaded, false)
    })
  })

  it('lists committed pointers and skips heavy directories', async () => {
    await withTempRepository(async (dir, repository) => {
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'v5.0.0',
        assetName: 'asset.bin',
        sizeInBytes: 10,
        sha256: 'b'.repeat(64),
      }
      await writeFile(
        join(dir, 'asset.bin'),
        serializeCheapLfsPointer(pointer),
        'utf8'
      )
      await writeFile(join(dir, 'real.txt'), 'not a pointer\n')
      await mkdir(join(dir, 'node_modules'))
      await writeFile(
        join(dir, 'node_modules', 'dep.bin'),
        serializeCheapLfsPointer(pointer),
        'utf8'
      )

      const entries = await listCheapLfsPointers(repository)
      assert.equal(entries.length, 1)
      assert.equal(entries[0].relativePath, 'asset.bin')
      assert.deepEqual(entries[0].pointer, pointer)
    })
  })
})
