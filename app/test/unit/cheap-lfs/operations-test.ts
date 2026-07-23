import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'
import { deflateRaw as deflateRawCallback } from 'node:zlib'
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
  IGitHubRelease,
  IGitHubReleaseAsset,
} from '../../../src/lib/github-releases'
import {
  createCheapLfsMaterializeCache,
  CheapLfsStreamChunkBytes,
  defaultCheapLfsFileSystem,
  hashFilePartsSha256,
  ICheapLfsFileSystem,
  ICheapLfsReleasesGateway,
  listCheapLfsPointers,
  listAllCheapLfsPointers,
  materializePointer,
  pinFileToRelease,
  selectCheapLfsAutoPinTargets,
  writeCheapLfsPointerAtomically,
} from '../../../src/lib/cheap-lfs/operations'
import {
  CHEAP_LFS_PART_SIZE_BYTES,
  CHEAP_LFS_POINTER_VERSION,
  ICheapLfsPointer,
  parseCheapLfsPointer,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'
import {
  CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES,
  CHEAP_LFS_OCI_POINTER_VERSION,
  serializeCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'
import {
  CheapLfsLegacyGhcrRepositoryKeyPath,
  CheapLfsRegistryRepositoryKeyPath,
} from '../../../src/lib/cheap-lfs/ghcr-key'

const selected = new Account(
  'selected',
  'https://api.github.com',
  'selected-token',
  [],
  '',
  2,
  'Selected'
)
const deflateRaw = promisify(deflateRawCallback)
const execFile = promisify(execFileCallback)
const gitHubRepository = new GitHubRepository(
  'material',
  new Owner('desktop', 'https://api.github.com', 1),
  1
)

function repositoryAt(
  path: string,
  defaultBranch: string | null = 'trunk'
): Repository {
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
    defaultBranch
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
  draft: false,
  prerelease: true,
  createdAt: new Date(0),
  publishedAt: null,
  authorLogin: 'fixture-bot',
  assets: [asset],
}

function numberedAssets(count: number): ReadonlyArray<IGitHubReleaseAsset> {
  return Array.from({ length: count }, (_, index) => ({
    ...asset,
    id: 1_000 + index,
    name: `existing-${index}.bin`,
  }))
}

function multipartBucketGateway(baseTag: string, baseAssetCount: number) {
  const remotes = new Map<string, IGitHubRelease>([
    [
      baseTag,
      {
        ...release,
        id: 70,
        tagName: baseTag,
        assets: numberedAssets(baseAssetCount),
      },
    ],
  ])
  const createdTags = new Array<string>()
  const requestedTags = new Array<string>()
  const reviewedTags = new Array<string>()
  const publishedTags = new Array<string>()
  const uploadedReleaseIds = new Array<number>()
  let uploadIndex = 0

  const gateway: ICheapLfsReleasesGateway = {
    getReleaseByTag: async (_repository, tag) => {
      requestedTags.push(tag)
      return remotes.get(tag) ?? null
    },
    create: async (_repository, draft, publishImmediately) => {
      createdTags.push(draft.tagName)
      const created: IGitHubRelease = {
        ...release,
        id: 70 + remotes.size,
        tagName: draft.tagName,
        targetCommitish: draft.targetCommitish,
        name: draft.name,
        assets: [],
        draft: !publishImmediately,
      }
      remotes.set(draft.tagName, created)
      return created
    },
    listAssets: async (_repository, releaseId) => ({
      assets:
        [...remotes.values()].find(candidate => candidate.id === releaseId)
          ?.assets ?? [],
      page: 1,
      nextPage: null,
      capped: false,
    }),
    createMutationReview: (_repository, reviewedRelease, reviewedAsset) => {
      reviewedTags.push(reviewedRelease.tagName)
      return {
        repositoryFingerprint: 'fixture',
        accountKey: 'fixture',
        accountGeneration: 1,
        releaseId: reviewedRelease.id,
        releaseFingerprint: 'fixture',
        assetId: reviewedAsset?.id ?? null,
        assetFingerprint: reviewedAsset == null ? null : 'fixture',
      }
    },
    publish: async (_repository, review) => {
      const targetEntry = [...remotes.entries()].find(
        ([, candidate]) => candidate.id === review.releaseId
      )
      assert.ok(targetEntry)
      publishedTags.push(targetEntry[0])
      const published = { ...targetEntry[1], draft: false }
      remotes.set(targetEntry[0], published)
      return published
    },
    uploadAsset: async (
      _repository,
      review,
      _sourcePath,
      name,
      _label,
      _signal,
      _onProgress,
      range
    ) => {
      uploadedReleaseIds.push(review.releaseId)
      const targetEntry = [...remotes.entries()].find(
        ([, candidate]) => candidate.id === review.releaseId
      )
      assert.ok(targetEntry)
      const partSha = uploadIndex === 0 ? 'b'.repeat(64) : 'c'.repeat(64)
      const uploaded = {
        ...asset,
        id: 10_000 + uploadIndex++,
        name,
        sizeInBytes: range?.length ?? 0,
      }
      remotes.set(targetEntry[0], {
        ...targetEntry[1],
        assets: [...targetEntry[1].assets, uploaded],
      })
      return {
        asset: uploaded,
        bytes: range?.length ?? 0,
        localDigest: `sha256:${partSha}`,
      }
    },
    deleteAsset: async () => undefined,
    downloadAsset: async () => {
      throw new Error('download not expected')
    },
  }

  return {
    gateway,
    remotes,
    createdTags,
    requestedTags,
    reviewedTags,
    publishedTags,
    uploadedReleaseIds,
  }
}

function twoPartFileSystem(
  writePointer: ICheapLfsFileSystem['writePointer'] = async () => undefined
): ICheapLfsFileSystem {
  return {
    ...defaultCheapLfsFileSystem,
    statSize: async () => 20,
    hashFile: async () => ({ sha256: 'a'.repeat(64), sizeInBytes: 20 }),
    hashFileParts: async () => ({
      sha256: 'a'.repeat(64),
      sizeInBytes: 20,
      parts: [
        { offset: 0, length: 10, sha256: 'b'.repeat(64) },
        { offset: 10, length: 10, sha256: 'c'.repeat(64) },
      ],
    }),
    writePointer,
  }
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
    createReleaseDraft: async (_owner, _name, draft) => ({
      ...release,
      tagName: draft.tagName,
      targetCommitish: draft.targetCommitish,
      name: draft.name,
    }),
    createRelease: async (_owner, _name, _draft, publishImmediately) => ({
      ...release,
      draft: !publishImmediately,
    }),
    updateRelease: async () => release,
    publishRelease: async () => ({ ...release, draft: false }),
    deleteRelease: async () => undefined,
    deleteReleaseAsset: async () => undefined,
    ...overrides,
  }
}

function fakeAPIForRelease(releaseByTag: IGitHubRelease): IGitHubReleasesAPI {
  return fakeAPI({
    fetchReleaseByTag: async () => releaseByTag,
    fetchReleaseAssets: async () => ({
      assets: releaseByTag.assets.map((releaseAsset, index) => ({
        ...releaseAsset,
        id: 10_000 + index,
      })),
      page: 1,
      nextPage: null,
      capped: false,
    }),
  })
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

async function storeWith(
  deps: IGitHubReleasesStoreDependencies,
  accounts: ReadonlyArray<Account> = [selected]
) {
  const store = new GitHubReleasesStore(
    new FakeAccountsStore(accounts) as unknown as AccountsStore,
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

async function assertCompressedMaterializationFailure(
  stored: Buffer,
  declaredOutput: Buffer,
  expectedError: RegExp,
  expectedPartSha256: string = createHash('sha256')
    .update(declaredOutput)
    .digest('hex')
): Promise<void> {
  await withTempRepository(async (dir, repository) => {
    const pointer: ICheapLfsPointer = {
      version: CHEAP_LFS_POINTER_VERSION,
      releaseTag: 'cloud-failure',
      assetName: 'failed.bin.cheap-lfs.deflate',
      sizeInBytes: declaredOutput.length,
      sha256: expectedPartSha256,
      parts: [
        {
          name: 'failed.bin.cheap-lfs.deflate',
          sizeInBytes: declaredOutput.length,
          sha256: expectedPartSha256,
          deflatedSizeInBytes: stored.length,
        },
      ],
    }
    const trackedPath = join(dir, 'failed.bin')
    const pointerText = serializeCheapLfsPointer(pointer)
    await writeFile(trackedPath, pointerText, 'utf8')
    const compressedAsset: IGitHubReleaseAsset = {
      ...asset,
      name: pointer.assetName,
      sizeInBytes: stored.length,
    }
    const cloudRelease: IGitHubRelease = {
      ...release,
      tagName: pointer.releaseTag,
      assets: [compressedAsset],
    }
    const store = await storeWith(
      dependencies(() => fakeAPIForRelease(cloudRelease), {
        downloadAsset: async (
          _account,
          _repository,
          _releaseId,
          _downloadedAsset,
          destination
        ) => {
          await writeFile(destination, stored)
          return {
            ok: true,
            path: destination,
            bytes: stored.length,
            localDigest: `sha256:${createHash('sha256')
              .update(stored)
              .digest('hex')}`,
            matchesGitHubDigest: true,
          }
        },
      })
    )
    const temporaryPaths = new Array<string>()
    const fs: ICheapLfsFileSystem = {
      ...defaultCheapLfsFileSystem,
      temporaryPathFor: path => {
        const temporaryPath = defaultCheapLfsFileSystem.temporaryPathFor(path)
        temporaryPaths.push(temporaryPath)
        return temporaryPath
      },
    }

    await assert.rejects(
      materializePointer(
        store,
        repository,
        selected,
        'failed.bin',
        undefined,
        undefined,
        fs
      ),
      expectedError
    )

    assert.equal(await readFile(trackedPath, 'utf8'), pointerText)
    assert.ok(temporaryPaths.length >= 2)
    for (const temporaryPath of temporaryPaths) {
      await assert.rejects(stat(temporaryPath))
    }
  })
}

function inMemoryReleaseGateway(
  currentRelease: () => IGitHubRelease,
  uploadAsset: ICheapLfsReleasesGateway['uploadAsset'],
  deleteAsset: ICheapLfsReleasesGateway['deleteAsset']
): ICheapLfsReleasesGateway {
  return {
    getReleaseByTag: async () => currentRelease(),
    create: async () => ({ ...currentRelease(), draft: false }),
    listAssets: async () => ({
      assets: currentRelease().assets,
      page: 1,
      nextPage: null,
      capped: false,
    }),
    createMutationReview: (_repository, reviewedRelease, reviewedAsset) => ({
      repositoryFingerprint: 'fixture',
      accountKey: 'fixture',
      accountGeneration: 1,
      releaseId: reviewedRelease.id,
      releaseFingerprint: 'fixture',
      assetId: reviewedAsset?.id ?? null,
      assetFingerprint: reviewedAsset == null ? null : 'fixture',
    }),
    publish: async () => ({ ...currentRelease(), draft: false }),
    uploadAsset,
    deleteAsset,
    downloadAsset: async () => {
      throw new Error('download not expected')
    },
  }
}

describe('cheap LFS operations', () => {
  it('keeps hash streams bounded at one MiB per read', () => {
    assert.equal(CheapLfsStreamChunkBytes, 1024 * 1024)
    assert.ok(CheapLfsStreamChunkBytes < CHEAP_LFS_PART_SIZE_BYTES)
  })

  it('throttles streamed hash progress while always reporting completion', async () => {
    await withTempRepository(async dir => {
      const sourcePath = join(dir, 'progress.bin')
      const sizeInBytes = 4 * 1024 * 1024
      await writeFile(sourcePath, Buffer.alloc(sizeInBytes, 0x5a))
      const progress = new Array<number>()

      const result = await hashFilePartsSha256(
        sourcePath,
        sizeInBytes * 2,
        undefined,
        bytes => progress.push(bytes)
      )

      assert.equal(result.sizeInBytes, sizeInBytes)
      assert.equal(progress[0], 0)
      assert.equal(progress.at(-1), sizeInBytes)
      assert.ok(
        progress.length <= 16,
        `expected throttled progress, received ${progress.length} events`
      )
    })
  })

  it('leaves the original file and no temp when pointer writing fails', async () => {
    await withTempRepository(async (dir, _repository) => {
      const trackedPath = join(dir, 'large.iso')
      const original = Buffer.from('original multi-gigabyte file stand-in')
      await writeFile(trackedPath, original)

      await assert.rejects(
        writeCheapLfsPointerAtomically(
          trackedPath,
          serializeCheapLfsPointer({
            version: CHEAP_LFS_POINTER_VERSION,
            releaseTag: 'v-pointer-write-failure',
            assetName: 'large.iso',
            sizeInBytes: original.length,
            sha256: createHash('sha256').update(original).digest('hex'),
          }),
          async (tempFile, text) => {
            await tempFile.writeFile(text.slice(0, 12), 'utf8')
            throw new Error('simulated pointer temp-write failure')
          }
        ),
        /simulated pointer temp-write failure/
      )

      assert.deepEqual(await readFile(trackedPath), original)
      assert.deepEqual(
        (await readdir(dir)).filter(name => name.startsWith('.cheeplfs-')),
        []
      )
    })
  })

  it('uses a bounded sibling temp name for a near-limit source name', async () => {
    await withTempRepository(async (dir, _repository) => {
      const trackedPath = join(dir, 'a'.repeat(255))
      const tempPath = defaultCheapLfsFileSystem.temporaryPathFor(trackedPath)

      assert.equal(dirname(tempPath), dir)
      assert.match(basename(tempPath), /^\.cheeplfs-[a-f0-9]{16}\.tmp$/)
      assert.ok(basename(tempPath).length < 255)
    })
  })

  it('sizes a selected symlink itself instead of its large target', async t => {
    await withTempRepository(async (dir, repository) => {
      const targetPath = join(dir, 'large-target.bin')
      const linkPath = join(dir, 'large-link.bin')
      await writeFile(targetPath, Buffer.alloc(1024))
      try {
        await symlink('large-target.bin', linkPath, 'file')
      } catch (error) {
        if (
          process.platform === 'win32' &&
          ((error as NodeJS.ErrnoException).code === 'EPERM' ||
            (error as NodeJS.ErrnoException).code === 'EACCES')
        ) {
          t.skip('Creating symlinks requires Windows Developer Mode.')
          return
        }
        throw error
      }

      const targets = await selectCheapLfsAutoPinTargets(
        repository,
        ['large-link.bin'],
        100,
        {
          statSize: defaultCheapLfsFileSystem.statSize,
          readPointerText: async () => 'not a pointer\n',
        }
      )

      assert.equal(targets.length, 0)
      assert.ok((await defaultCheapLfsFileSystem.statSize(linkPath)) < 100)
    })
  })

  it('never selects or uploads either repository key path as Release payload', async () => {
    await withTempRepository(async (dir, repository) => {
      const candidates = [
        CheapLfsRegistryRepositoryKeyPath.toUpperCase(),
        CheapLfsLegacyGhcrRepositoryKeyPath.replaceAll('/', '\\'),
      ]
      for (const candidate of candidates) {
        const absolutePath = join(
          dir,
          ...candidate.replace(/\\/g, '/').split('/')
        )
        await mkdir(dirname(absolutePath), { recursive: true })
        await writeFile(absolutePath, Buffer.alloc(1024, 1))
      }

      assert.deepEqual(
        await selectCheapLfsAutoPinTargets(repository, candidates, 100, {
          statSize: defaultCheapLfsFileSystem.statSize,
          readPointerText: async () => 'not a pointer\n',
        }),
        []
      )

      const gateway = {} as unknown as ICheapLfsReleasesGateway
      await assert.rejects(
        pinFileToRelease(gateway, repository, selected, {
          absoluteFilePath: join(
            dir,
            ...candidates[0].replace(/\\/g, '/').split('/')
          ),
          trackedRelativePath: candidates[0],
          releaseTag: 'assets',
        }),
        /safe repository-relative path/i
      )
    })
  })

  it('pins a file: hashes it, uploads it, and writes a matching pointer', async () => {
    await withTempRepository(async (dir, repository) => {
      const filePath = join(dir, 'blob.bin')
      const content = Buffer.from('the quick brown fox '.repeat(1000))
      await writeFile(filePath, content)
      if (process.platform !== 'win32') {
        await chmod(filePath, 0o751)
      }
      const expectedSha = createHash('sha256').update(content).digest('hex')

      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v1.0.0',
        assets: [],
      }
      let createdTargetCommitish: string | undefined
      let createdAsPrerelease: boolean | undefined
      let createdPublishImmediately: boolean | undefined
      let createdRelease = draft
      let uploaded: { sourcePath: string; name: string } | undefined
      let uploadedBytes: Buffer | undefined
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => null,
              fetchReleases: async () => ({
                releases: [],
                page: 1,
                nextPage: null,
                capped: false,
              }),
              createRelease: async (
                _owner,
                _name,
                releaseDraft,
                publishImmediately
              ) => {
                createdTargetCommitish = releaseDraft.targetCommitish
                createdAsPrerelease = releaseDraft.prerelease
                createdPublishImmediately = publishImmediately
                createdRelease = {
                  ...draft,
                  tagName: releaseDraft.tagName,
                  draft: !publishImmediately,
                }
                return createdRelease
              },
              // Revalidation must observe the same provider snapshot returned
              // by creation; the release mutation guard intentionally rejects
              // even subtle fixture drift.
              fetchRelease: async () => createdRelease,
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
              uploadedBytes = await readFile(sourcePath)
              return {
                ok: true,
                asset: { ...asset, name },
                bytes: uploadedBytes.length,
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
      assert.equal(result.pointer.parts, undefined)
      assert.equal(result.releaseId, draft.id)
      assert.equal(createdTargetCommitish, 'trunk')
      assert.equal(createdAsPrerelease, true)
      assert.equal(createdPublishImmediately, true)
      assert.notEqual(uploaded?.sourcePath, filePath)
      assert.deepEqual(uploadedBytes, content)
      await assert.rejects(stat(uploaded!.sourcePath), { code: 'ENOENT' })
      assert.equal(uploaded?.name, 'blob.bin')

      const written = await readFile(filePath, 'utf8')
      assert.equal(written, serializeCheapLfsPointer(result.pointer))
      assert.deepEqual(parseCheapLfsPointer(written), result.pointer)
      if (process.platform !== 'win32') {
        assert.equal((await stat(filePath)).mode & 0o777, 0o751)
      }

      const uploadedAsset = {
        ...asset,
        name: result.pointer.assetName,
        sizeInBytes: uploadedBytes!.length,
      }
      const releaseWithAsset: IGitHubRelease = {
        ...draft,
        tagName: 'v1.0.0',
        assets: [uploadedAsset],
      }
      const restoreStore = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithAsset), {
          downloadAsset: async (
            _account,
            _repository,
            _releaseId,
            _asset,
            destination
          ) => {
            await writeFile(destination, uploadedBytes!)
            return {
              ok: true,
              path: destination,
              bytes: uploadedBytes!.length,
              localDigest: 'sha256:unused',
              matchesGitHubDigest: null,
            }
          },
        })
      )
      await materializePointer(restoreStore, repository, selected, 'blob.bin')
      assert.deepEqual(await readFile(filePath), content)
      if (process.platform !== 'win32') {
        assert.equal((await stat(filePath)).mode & 0o777, 0o751)
      }
    })
  })

  it('uses the checked-out branch when no default branch is stored', async () => {
    await withTempRepository(async (dir, _repository) => {
      const repository = repositoryAt(dir, null)
      let createdTargetCommitish: string | undefined
      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v-current-branch',
        assets: [],
      }
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => null,
              createRelease: async (
                _owner,
                _name,
                releaseDraft,
                publishImmediately
              ) => {
                createdTargetCommitish = releaseDraft.targetCommitish
                return {
                  ...draft,
                  tagName: releaseDraft.tagName,
                  draft: !publishImmediately,
                }
              },
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              _sourcePath,
              name
            ) => ({
              ok: true,
              asset: { ...asset, name },
              bytes: 4,
              localDigest: `sha256:${'a'.repeat(64)}`,
            }),
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        statSize: async () => 4,
        hashFileParts: async () => ({
          sha256: 'a'.repeat(64),
          sizeInBytes: 4,
          parts: [{ offset: 0, length: 4, sha256: 'a'.repeat(64) }],
        }),
        hashFile: async () => ({ sha256: 'a'.repeat(64), sizeInBytes: 4 }),
        writePointer: async () => undefined,
        resolveReleaseTargetCommitish: async () => 'feature/current',
      }

      await pinFileToRelease(
        store,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'branch-target.bin'),
          trackedRelativePath: 'branch-target.bin',
          releaseTag: 'v-current-branch',
        },
        undefined,
        undefined,
        fs
      )

      assert.equal(createdTargetCommitish, 'feature/current')
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
        draft: true,
        assets: [
          { ...asset, name: 'payload.bin', sizeInBytes: content.length },
        ],
      }
      let currentRelease = releaseWithAsset
      let publishCount = 0
      let destination: string | undefined
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => currentRelease,
              fetchRelease: async () => currentRelease,
              fetchReleaseAssets: async () => ({
                assets: currentRelease.assets,
                page: 1,
                nextPage: null,
                capped: false,
              }),
              publishRelease: async () => {
                publishCount++
                currentRelease = { ...currentRelease, draft: false }
                return currentRelease
              },
            }),
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

      assert.equal(await realpath(result.path), await realpath(trackedPath))
      assert.equal(result.bytes, content.length)
      assert.equal(publishCount, 1)
      assert.equal(currentRelease.draft, false)
      // The pointer file is now the real bytes: in-place overwrite worked.
      assert.deepEqual(await readFile(trackedPath), content)
      // The temp file was renamed away, so it no longer exists.
      assert.notEqual(destination, undefined)
      await assert.rejects(stat(destination!))
    })
  })

  it('preserves a concurrent edit before replacing a single-asset pointer', async () => {
    await withTempRepository(async (dir, repository) => {
      const content = Buffer.from('verified release payload')
      const concurrentEdit = Buffer.from('user edit made during download')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'single-race',
        assetName: 'race.bin',
        sizeInBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
      }
      const trackedPath = join(dir, 'race.bin')
      await writeFile(trackedPath, serializeCheapLfsPointer(pointer), 'utf8')
      const releaseWithAsset: IGitHubRelease = {
        ...release,
        tagName: pointer.releaseTag,
        assets: [
          {
            ...asset,
            name: pointer.assetName,
            sizeInBytes: content.length,
          },
        ],
      }
      let temporaryPath: string | undefined
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithAsset), {
          downloadAsset: async (
            _account,
            _repository,
            _releaseId,
            _asset,
            destination
          ) => {
            temporaryPath = destination
            await writeFile(destination, content)
            await writeFile(trackedPath, concurrentEdit)
            return {
              ok: true,
              path: destination,
              bytes: content.length,
              localDigest: `sha256:${pointer.sha256}`,
              matchesGitHubDigest: true,
            }
          },
        })
      )

      await assert.rejects(
        materializePointer(store, repository, selected, 'race.bin'),
        /pointer changed or was removed.*current file was left in place/
      )
      assert.deepEqual(await readFile(trackedPath), concurrentEdit)
      assert.notEqual(temporaryPath, undefined)
      await assert.rejects(stat(temporaryPath!))
    })
  })

  it('removes a single-asset temp when the transfer rejects after writing it', async () => {
    await withTempRepository(async (dir, repository) => {
      const content = Buffer.from('late rejected release payload')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'single-late-rejection',
        assetName: 'late.bin',
        sizeInBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
      }
      const pointerText = serializeCheapLfsPointer(pointer)
      const trackedPath = join(dir, 'late.bin')
      await writeFile(trackedPath, pointerText, 'utf8')
      const releaseWithAsset: IGitHubRelease = {
        ...release,
        tagName: pointer.releaseTag,
        assets: [
          {
            ...asset,
            name: pointer.assetName,
            sizeInBytes: content.length,
          },
        ],
      }
      let temporaryPath: string | undefined
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithAsset), {
          downloadAsset: async (
            _account,
            _repository,
            _releaseId,
            _asset,
            destination
          ) => {
            temporaryPath = destination
            await writeFile(destination, content)
            throw new Error('late transfer rejection')
          },
        })
      )

      await assert.rejects(
        materializePointer(store, repository, selected, 'late.bin'),
        /could not download the release asset safely/
      )
      assert.equal(await readFile(trackedPath, 'utf8'), pointerText)
      assert.notEqual(temporaryPath, undefined)
      await assert.rejects(stat(temporaryPath!))
    })
  })

  it('stops single and multipart restores canceled during the final pointer recheck', async () => {
    for (const kind of ['single', 'multipart'] as const) {
      await withTempRepository(async (dir, repository) => {
        const pieces =
          kind === 'single'
            ? [Buffer.from('single canceled payload')]
            : [Buffer.from('first canceled part'), Buffer.from('second part')]
        const content = Buffer.concat(pieces)
        const pointerParts =
          kind === 'multipart'
            ? pieces.map((part, index) => ({
                name: `cancel.part-${index}`,
                sizeInBytes: part.length,
                sha256: createHash('sha256').update(part).digest('hex'),
              }))
            : undefined
        const pointer: ICheapLfsPointer = {
          version: CHEAP_LFS_POINTER_VERSION,
          releaseTag: `${kind}-cancel-at-recheck`,
          assetName:
            kind === 'single' ? 'single-cancel.bin' : 'unused-whole.bin',
          sizeInBytes: content.length,
          sha256: createHash('sha256').update(content).digest('hex'),
          parts: pointerParts,
        }
        const pointerText = serializeCheapLfsPointer(pointer)
        const relativePath = `${kind}-cancel.bin`
        const trackedPath = join(dir, relativePath)
        await writeFile(trackedPath, pointerText, 'utf8')
        const namedPieces = new Map<string, Buffer>(
          pointerParts === undefined
            ? [[pointer.assetName, pieces[0]]]
            : pointerParts.map((part, index) => [part.name, pieces[index]])
        )
        const releaseWithAssets: IGitHubRelease = {
          ...release,
          tagName: pointer.releaseTag,
          assets: [...namedPieces].map(([name, bytes], index) => ({
            ...asset,
            id: asset.id + index,
            name,
            sizeInBytes: bytes.length,
          })),
        }
        const store = await storeWith(
          dependencies(() => fakeAPIForRelease(releaseWithAssets), {
            downloadAsset: async (
              _account,
              _repository,
              _releaseId,
              releaseAsset,
              destination
            ) => {
              const bytes = namedPieces.get(releaseAsset.name)
              assert.notEqual(bytes, undefined)
              await writeFile(destination, bytes!)
              return {
                ok: true,
                path: destination,
                bytes: bytes!.length,
                localDigest: `sha256:${createHash('sha256')
                  .update(bytes!)
                  .digest('hex')}`,
                matchesGitHubDigest: true,
              }
            },
          })
        )
        const controller = new AbortController()
        let pointerReads = 0
        const fs: ICheapLfsFileSystem = {
          ...defaultCheapLfsFileSystem,
          readPointerText: async path => {
            const text = await defaultCheapLfsFileSystem.readPointerText(path)
            pointerReads++
            if (pointerReads === 2) {
              controller.abort()
            }
            return text
          },
          replaceFile: async () => {
            assert.fail(
              'a canceled materialization must not replace the pointer'
            )
          },
        }

        await assert.rejects(
          materializePointer(
            store,
            repository,
            selected,
            relativePath,
            controller.signal,
            undefined,
            fs
          ),
          (error: unknown) => {
            assert.ok(error instanceof Error)
            assert.equal(error.name, 'AbortError')
            return true
          }
        )
        assert.equal(pointerReads, 2)
        assert.equal(await readFile(trackedPath, 'utf8'), pointerText)
      })
    }
  })

  it('refuses a Release restore redirected through an outside junction', async t => {
    const outside = await mkdtemp(join(tmpdir(), 'cheap-lfs-release-outside-'))
    t.after(() => rm(outside, { recursive: true, force: true }))
    await withTempRepository(async (dir, repository) => {
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'outside-junction',
        assetName: 'outside.bin',
        sizeInBytes: 4,
        sha256: 'a'.repeat(64),
      }
      const pointerText = serializeCheapLfsPointer(pointer)
      const outsidePath = join(outside, 'outside.bin')
      await writeFile(outsidePath, pointerText, 'utf8')
      await symlink(
        outside,
        join(dir, 'redirect'),
        process.platform === 'win32' ? 'junction' : 'dir'
      )
      const releaseWithAsset: IGitHubRelease = {
        ...release,
        tagName: pointer.releaseTag,
        assets: [{ ...asset, name: pointer.assetName }],
      }
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithAsset))
      )

      await assert.rejects(
        materializePointer(store, repository, selected, 'redirect/outside.bin'),
        /symlink or junction/
      )
      assert.equal(await readFile(outsidePath, 'utf8'), pointerText)
    })
  })

  it('refuses a Release restore whose final pointer is a symlink', async t => {
    const outside = await mkdtemp(
      join(tmpdir(), 'cheap-lfs-release-link-target-')
    )
    t.after(() => rm(outside, { recursive: true, force: true }))
    await withTempRepository(async (dir, repository) => {
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'outside-file-link',
        assetName: 'outside.bin',
        sizeInBytes: 4,
        sha256: 'a'.repeat(64),
      }
      const pointerText = serializeCheapLfsPointer(pointer)
      const outsidePath = join(outside, 'outside.bin')
      await writeFile(outsidePath, pointerText, 'utf8')
      try {
        await symlink(outsidePath, join(dir, 'linked-pointer.bin'), 'file')
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (String(error.code) === 'EPERM' || String(error.code) === 'EACCES')
        ) {
          t.skip('Creating file symlinks requires Windows Developer Mode.')
          return
        }
        throw error
      }
      const releaseWithAsset: IGitHubRelease = {
        ...release,
        tagName: pointer.releaseTag,
        assets: [{ ...asset, name: pointer.assetName }],
      }
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithAsset))
      )

      await assert.rejects(
        materializePointer(store, repository, selected, 'linked-pointer.bin'),
        /symlink, junction, or linked file/
      )
      assert.equal(await readFile(outsidePath, 'utf8'), pointerText)
    })
  })

  it('materializes a signed-out public Release pointer with an anonymous read account', async () => {
    await withTempRepository(async dir => {
      const content = Buffer.from('public release payload')
      const sha256 = createHash('sha256').update(content).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'public-assets',
        assetName: 'public.bin',
        sizeInBytes: content.length,
        sha256,
      }
      const trackedPath = join(dir, 'public.bin')
      await writeFile(trackedPath, serializeCheapLfsPointer(pointer), 'utf8')
      const publicRepository = new Repository(
        dir,
        101,
        new GitHubRepository(
          'material',
          new Owner('desktop', 'https://api.github.com', 1),
          101,
          false
        ),
        false
      )
      const publicRelease: IGitHubRelease = {
        ...release,
        tagName: pointer.releaseTag,
        draft: false,
        assets: [
          {
            ...asset,
            name: pointer.assetName,
            sizeInBytes: content.length,
          },
        ],
      }
      const transferTokens = new Array<string>()
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(publicRelease), {
          downloadAsset: async (
            account,
            _repository,
            _releaseId,
            _asset,
            destination
          ) => {
            transferTokens.push(account.token)
            await writeFile(destination, content)
            return {
              ok: true,
              path: destination,
              bytes: content.length,
              localDigest: `sha256:${sha256}`,
              matchesGitHubDigest: true,
            }
          },
        }),
        []
      )

      const result = await materializePointer(
        store,
        publicRepository,
        Account.anonymous(),
        'public.bin'
      )

      assert.equal(result.bytes, content.length)
      assert.deepEqual(await readFile(trackedPath), content)
      assert.deepEqual(transferTokens, [''])
    })
  })

  it('rejects anonymous Release materialization for private or unknown visibility', async () => {
    await withTempRepository(async dir => {
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'private-assets',
        assetName: 'private.bin',
        sizeInBytes: 4,
        sha256: 'a'.repeat(64),
      }
      for (const [index, isPrivate] of [true, null].entries()) {
        const path = `private-${index}.bin`
        const trackedPath = join(dir, path)
        const pointerText = serializeCheapLfsPointer(pointer)
        await writeFile(trackedPath, pointerText, 'utf8')
        const privateRepository = new Repository(
          dir,
          102 + index,
          new GitHubRepository(
            'material',
            new Owner('desktop', 'https://api.github.com', 1),
            102 + index,
            isPrivate
          ),
          false
        )
        let releaseReads = 0
        const gateway = {
          getReleaseByTag: async () => {
            releaseReads++
            return null
          },
        } as unknown as ICheapLfsReleasesGateway

        await assert.rejects(
          materializePointer(
            gateway,
            privateRepository,
            Account.anonymous(),
            path
          ),
          error =>
            error instanceof Error &&
            /Sign in with the account selected/.test(error.message)
        )
        assert.equal(releaseReads, 0)
        assert.equal(await readFile(trackedPath, 'utf8'), pointerText)
      }
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
        dependencies(() => fakeAPIForRelease(releaseWithAsset), {
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
        })
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

  it('splits a file above the cap into one ranged asset per part', async () => {
    await withTempRepository(async (dir, repository) => {
      const cap = CHEAP_LFS_PART_SIZE_BYTES
      const total = 2 * cap + 100
      const wholeSha = 'a'.repeat(64)
      const partShas = ['b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)]
      const hashedParts = [
        { offset: 0, length: cap, sha256: partShas[0] },
        { offset: cap, length: cap, sha256: partShas[1] },
        { offset: 2 * cap, length: 100, sha256: partShas[2] },
      ]

      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v4.0.0',
        assets: [],
      }
      const uploads = new Array<{
        sourcePath: string
        name: string
        range: { offset: number; length: number } | undefined
        expectedDigest: string | undefined
      }>()
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => draft,
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              sourcePath,
              name,
              _label,
              _signal,
              _onProgress,
              range,
              expectedDigest
            ) => {
              uploads.push({ sourcePath, name, range, expectedDigest })
              return {
                ok: true,
                asset: { ...asset, name, sizeInBytes: range?.length ?? 0 },
                bytes: range?.length ?? 0,
                localDigest: `sha256:${
                  hashedParts.find(part => part.offset === range?.offset)!
                    .sha256
                }`,
              }
            },
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        statSize: async () => total,
        hashFile: async () => ({
          sha256: wholeSha,
          sizeInBytes: total,
        }),
        hashFileParts: async () => ({
          sha256: wholeSha,
          sizeInBytes: total,
          parts: hashedParts,
        }),
      }

      const filePath = join(dir, 'huge.bin')
      const result = await pinFileToRelease(
        store,
        repository,
        selected,
        {
          absoluteFilePath: filePath,
          trackedRelativePath: 'huge.bin',
          releaseTag: 'v4.0.0',
        },
        undefined,
        undefined,
        fs
      )

      // One ranged upload per part, in order, all from the same source file.
      assert.deepEqual(
        uploads.map(u => u.name),
        ['huge.bin.part001', 'huge.bin.part002', 'huge.bin.part003']
      )
      assert.deepEqual(
        uploads.map(u => u.range),
        [
          { offset: 0, length: cap },
          { offset: cap, length: cap },
          { offset: 2 * cap, length: 100 },
        ]
      )
      assert.ok(uploads.every(u => u.sourcePath === filePath))
      assert.deepEqual(
        uploads.map(u => u.expectedDigest),
        partShas.map(sha => `sha256:${sha}`)
      )

      // The pointer records every part; the sizes sum to the whole.
      assert.equal(result.pointer.sha256, wholeSha)
      assert.equal(result.pointer.sizeInBytes, total)
      assert.equal(result.pointer.assetName, 'huge.bin')
      assert.deepEqual(result.pointer.parts, [
        { name: 'huge.bin.part001', sizeInBytes: cap, sha256: partShas[0] },
        { name: 'huge.bin.part002', sizeInBytes: cap, sha256: partShas[1] },
        { name: 'huge.bin.part003', sizeInBytes: 100, sha256: partShas[2] },
      ])
      assert.equal(
        (result.pointer.parts ?? []).reduce((s, p) => s + p.sizeInBytes, 0),
        total
      )

      // The committed pointer round-trips through the on-disk text.
      const written = await readFile(filePath, 'utf8')
      assert.deepEqual(parseCheapLfsPointer(written), result.pointer)
    })
  })

  it('keeps a two-part object in a base release with exactly two slots', async () => {
    await withTempRepository(async (dir, repository) => {
      const fixture = multipartBucketGateway('assets', 998)
      const result = await pinFileToRelease(
        fixture.gateway,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'two-parts.bin'),
          trackedRelativePath: 'two-parts.bin',
          releaseTag: 'assets',
        },
        undefined,
        undefined,
        twoPartFileSystem()
      )

      assert.equal(result.pointer.releaseTag, 'assets')
      assert.equal(result.pointer.parts?.length, 2)
      assert.deepEqual(fixture.createdTags, [])
      assert.deepEqual(fixture.reviewedTags, ['assets', 'assets'])
      assert.deepEqual(fixture.uploadedReleaseIds, [70, 70])
      assert.equal(fixture.remotes.get('assets')?.assets.length, 1000)
      assert.equal(fixture.remotes.has('assets-2'), false)
    })
  })

  it('publishes an older draft bucket in place before writing a new pointer', async () => {
    await withTempRepository(async (dir, repository) => {
      const fixture = multipartBucketGateway('assets', 998)
      fixture.remotes.set('assets', {
        ...fixture.remotes.get('assets')!,
        draft: true,
        prerelease: true,
      })

      await pinFileToRelease(
        fixture.gateway,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'legacy-draft.bin'),
          trackedRelativePath: 'legacy-draft.bin',
          releaseTag: 'assets',
        },
        undefined,
        undefined,
        twoPartFileSystem()
      )

      assert.deepEqual(fixture.createdTags, [])
      assert.deepEqual(fixture.publishedTags, ['assets'])
      assert.equal(fixture.remotes.get('assets')?.draft, false)
      assert.deepEqual(fixture.uploadedReleaseIds, [70, 70])
    })
  })

  it('rolls a two-part object as one group when the base has one slot', async () => {
    await withTempRepository(async (dir, repository) => {
      const fixture = multipartBucketGateway('assets', 999)
      let pointerText = ''
      const result = await pinFileToRelease(
        fixture.gateway,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'two-parts.bin'),
          trackedRelativePath: 'two-parts.bin',
          releaseTag: 'assets',
        },
        undefined,
        undefined,
        twoPartFileSystem(async (_path, text) => {
          pointerText = text
        })
      )

      assert.equal(result.pointer.releaseTag, 'assets-2')
      assert.equal(parseCheapLfsPointer(pointerText)?.releaseTag, 'assets-2')
      assert.deepEqual(fixture.createdTags, ['assets-2'])
      assert.deepEqual(fixture.reviewedTags, ['assets-2', 'assets-2'])
      assert.deepEqual(fixture.uploadedReleaseIds, [71, 71])
      assert.deepEqual(fixture.requestedTags, [
        'assets',
        'assets-2',
        'assets-2',
      ])
      assert.equal(fixture.remotes.get('assets')?.assets.length, 999)
      assert.equal(fixture.remotes.get('assets-2')?.assets.length, 2)
    })
  })

  it('rejects an oversized multipart pointer before uploading any part', async () => {
    await withTempRepository(async (dir, repository) => {
      const partCount = 1001
      const projectedSize = CHEAP_LFS_PART_SIZE_BYTES * (partCount - 1) + 1
      const draft: IGitHubRelease = { ...release, assets: [] }
      let uploadCount = 0
      let hashCount = 0
      let releaseLookupCount = 0
      let releaseDraftCount = 0
      let pointerWritten = false
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => {
                releaseLookupCount++
                return draft
              },
              createReleaseDraft: async () => {
                releaseDraftCount++
                return draft
              },
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async () => {
              uploadCount++
              throw new Error('upload must not start')
            },
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        statSize: async () => projectedSize,
        hashFileParts: async () => {
          hashCount++
          throw new Error('hashing must not start')
        },
        writePointer: async () => {
          pointerWritten = true
        },
      }

      await assert.rejects(
        pinFileToRelease(
          store,
          repository,
          selected,
          {
            absoluteFilePath: join(dir, 'x'.repeat(255)),
            trackedRelativePath: 'huge.bin',
            releaseTag: 'v-pointer-too-large',
          },
          undefined,
          undefined,
          fs
        ),
        /needs 1001 cheap LFS parts.*at most 1000/
      )
      assert.equal(uploadCount, 0)
      assert.equal(hashCount, 0)
      assert.equal(releaseLookupCount, 0)
      assert.equal(releaseDraftCount, 0)
      assert.equal(pointerWritten, false)
    })
  })

  it('removes only attempt-owned multipart assets after cancellation', async () => {
    await withTempRepository(async (dir, repository) => {
      const filePath = join(dir, 'cancel.bin')
      await writeFile(filePath, 'original bytes')
      const preexisting = { ...asset, id: 19, name: 'keep.bin' }
      let remoteAssets = new Array<IGitHubReleaseAsset>(preexisting)
      const deletedAssetIds = new Array<number>()
      let uploadCount = 0
      let pointerWritten = false
      const currentRelease = (): IGitHubRelease => ({
        ...release,
        tagName: 'v-cancel',
        assets: [...remoteAssets],
      })
      const gateway: ICheapLfsReleasesGateway = {
        getReleaseByTag: async () => currentRelease(),
        create: async () => ({ ...currentRelease(), draft: false }),
        listAssets: async () => ({
          assets: currentRelease().assets,
          page: 1,
          nextPage: null,
          capped: false,
        }),
        createMutationReview: (
          _repository,
          reviewedRelease,
          reviewedAsset
        ) => ({
          repositoryFingerprint: 'fixture',
          accountKey: 'fixture',
          accountGeneration: 1,
          releaseId: reviewedRelease.id,
          releaseFingerprint: 'fixture',
          assetId: reviewedAsset?.id ?? null,
          assetFingerprint: reviewedAsset === null ? null : 'fixture',
        }),
        publish: async () => ({ ...currentRelease(), draft: false }),
        uploadAsset: async (
          _repository,
          _review,
          _sourcePath,
          name,
          _label,
          _signal,
          _onProgress,
          range
        ) => {
          uploadCount++
          if (uploadCount === 2) {
            const canceled = new Error('multipart upload canceled')
            canceled.name = 'AbortError'
            throw canceled
          }
          const uploaded = {
            ...asset,
            id: 100 + uploadCount,
            name,
            sizeInBytes: range!.length,
          }
          remoteAssets.push(uploaded)
          return {
            asset: uploaded,
            bytes: range!.length,
            localDigest: `sha256:${'b'.repeat(64)}`,
          }
        },
        deleteAsset: async (_repository, review) => {
          assert.notEqual(review.assetId, null)
          deletedAssetIds.push(review.assetId!)
          remoteAssets = remoteAssets.filter(
            candidate => candidate.id !== review.assetId
          )
        },
        downloadAsset: async () => {
          throw new Error('download not expected')
        },
      }
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        hashFileParts: async () => ({
          sha256: 'a'.repeat(64),
          sizeInBytes: 20,
          parts: [
            { offset: 0, length: 10, sha256: 'b'.repeat(64) },
            { offset: 10, length: 10, sha256: 'c'.repeat(64) },
          ],
        }),
        writePointer: async () => {
          pointerWritten = true
        },
      }

      await assert.rejects(
        pinFileToRelease(
          gateway,
          repository,
          selected,
          {
            absoluteFilePath: filePath,
            trackedRelativePath: 'cancel.bin',
            releaseTag: 'v-cancel',
          },
          undefined,
          undefined,
          fs
        ),
        { name: 'AbortError' }
      )

      assert.equal(pointerWritten, false)
      assert.deepEqual(deletedAssetIds, [101])
      assert.deepEqual(
        remoteAssets.map(candidate => candidate.id),
        [19]
      )
      assert.equal(await readFile(filePath, 'utf8'), 'original bytes')
    })
  })

  it('uploads multipart assets raw and reports logical progress', async () => {
    await withTempRepository(async (dir, repository) => {
      const cap = CHEAP_LFS_PART_SIZE_BYTES
      const total = 2 * cap + 100
      const parts = [
        { offset: 0, length: cap, sha256: 'b'.repeat(64) },
        { offset: cap, length: cap, sha256: 'c'.repeat(64) },
        { offset: 2 * cap, length: 100, sha256: 'd'.repeat(64) },
      ]
      const uploads = new Array<{
        sourcePath: string
        name: string
        range: { offset: number; length: number } | undefined
      }>()
      const logicalProgress = new Array<number>()
      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v4.1.0',
        assets: [],
      }
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => draft,
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              sourcePath,
              name,
              _label,
              _signal,
              onProgress,
              range
            ) => {
              uploads.push({ sourcePath, name, range })
              const bytes = range?.length ?? 0
              onProgress?.({
                operationId: name,
                transferredBytes: bytes,
                totalBytes: bytes,
                direction: 'upload',
              })
              return {
                ok: true,
                asset: { ...asset, name, sizeInBytes: bytes },
                bytes,
                localDigest: `sha256:${
                  parts.find(part => part.offset === range?.offset)!.sha256
                }`,
              }
            },
          }
        )
      )
      const filePath = join(dir, 'mixed.bin')
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        statSize: async () => total,
        hashFile: async () => ({
          sha256: 'a'.repeat(64),
          sizeInBytes: total,
        }),
        hashFileParts: async () => ({
          sha256: 'a'.repeat(64),
          sizeInBytes: total,
          parts,
        }),
      }

      const result = await pinFileToRelease(
        store,
        repository,
        selected,
        {
          absoluteFilePath: filePath,
          trackedRelativePath: 'mixed.bin',
          releaseTag: 'v4.1.0',
        },
        undefined,
        progress => logicalProgress.push(progress.transferredBytes),
        fs
      )

      assert.deepEqual(
        uploads.map(upload => upload.name),
        ['mixed.bin.part001', 'mixed.bin.part002', 'mixed.bin.part003']
      )
      assert.deepEqual(uploads[0].range, { offset: 0, length: cap })
      assert.deepEqual(uploads[1].range, { offset: cap, length: cap })
      assert.deepEqual(uploads[2].range, { offset: 2 * cap, length: 100 })
      assert.ok(uploads.every(upload => upload.sourcePath === filePath))
      assert.deepEqual(
        result.pointer.parts?.map(part => part.deflatedSizeInBytes),
        [undefined, undefined, undefined]
      )
      assert.equal(logicalProgress.at(-1), total)
    })
  })

  it('dedupes the exact truncated names of near-limit multipart assets', async () => {
    await withTempRepository(async (dir, repository) => {
      const baseName = 'a'.repeat(255)
      const filePath = join(dir, baseName)
      const wholeSha = 'a'.repeat(64)
      const partShas = ['b'.repeat(64), 'c'.repeat(64)]
      const rawFirstName = `${'a'.repeat(247)}.part001`
      const hashedFirstName = `${'a'.repeat(239)}-aaaaaaa.part001`
      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v4.2.0',
        assets: [
          { ...asset, id: 20, name: rawFirstName, sizeInBytes: 10 },
          { ...asset, id: 21, name: hashedFirstName, sizeInBytes: 10 },
        ],
      }
      const uploadedNames = new Array<string>()
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => draft,
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              _path,
              name,
              _label,
              _signal,
              _onProgress,
              range
            ) => {
              uploadedNames.push(name)
              const index = range!.offset === 0 ? 0 : 1
              return {
                ok: true,
                asset: { ...asset, name, sizeInBytes: range!.length },
                bytes: range!.length,
                localDigest: `sha256:${partShas[index]}`,
              }
            },
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        statSize: async () => 20,
        hashFile: async () => ({
          sha256: wholeSha,
          sizeInBytes: 20,
        }),
        hashFileParts: async () => ({
          sha256: wholeSha,
          sizeInBytes: 20,
          parts: [
            { offset: 0, length: 10, sha256: partShas[0] },
            { offset: 10, length: 10, sha256: partShas[1] },
          ],
        }),
        writePointer: async () => undefined,
      }

      const result = await pinFileToRelease(
        store,
        repository,
        selected,
        {
          absoluteFilePath: filePath,
          trackedRelativePath: 'long-name.bin',
          releaseTag: 'v4.2.0',
        },
        undefined,
        undefined,
        fs
      )

      assert.equal(uploadedNames.length, 2)
      assert.ok(uploadedNames.every(name => name.length === 255))
      assert.equal(uploadedNames[0].endsWith('-aaaaaaa-2.part001'), true)
      assert.equal(uploadedNames[1].endsWith('-aaaaaaa-2.part002'), true)
      assert.notEqual(uploadedNames[0], rawFirstName)
      assert.notEqual(uploadedNames[0], hashedFirstName)
      assert.deepEqual(
        result.pointer.parts?.map(part => part.name),
        uploadedNames
      )
    })
  })

  it('keeps raw names within the release asset limit', async () => {
    await withTempRepository(async (dir, repository) => {
      const baseName = 'a'.repeat(255)
      const filePath = join(dir, baseName)
      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v4.3.0',
        assets: [],
      }
      let uploadedName = ''
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => draft,
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              _sourcePath,
              name
            ) => {
              uploadedName = name
              return {
                ok: true,
                asset: { ...asset, name, sizeInBytes: 100 },
                bytes: 100,
                localDigest: `sha256:${'a'.repeat(64)}`,
              }
            },
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        statSize: async () => 100,
        hashFile: async () => ({
          sha256: 'a'.repeat(64),
          sizeInBytes: 100,
        }),
        hashFileParts: async () => ({
          sha256: 'a'.repeat(64),
          sizeInBytes: 100,
          parts: [{ offset: 0, length: 100, sha256: 'b'.repeat(64) }],
        }),
        writePointer: async () => undefined,
      }

      await pinFileToRelease(
        store,
        repository,
        selected,
        {
          absoluteFilePath: filePath,
          trackedRelativePath: 'long-name.bin',
          releaseTag: 'v4.3.0',
        },
        undefined,
        undefined,
        fs
      )

      assert.equal(uploadedName.length, 255)
      assert.equal(uploadedName.endsWith('.deflate'), false)
    })
  })

  it('advances a truncated single-asset name past prior retry uploads', async () => {
    await withTempRepository(async (dir, repository) => {
      const baseName = `${'a'.repeat(251)}.iso`
      const filePath = join(dir, baseName)
      const wholeSha = 'a'.repeat(64)
      const firstRetryName = `${'a'.repeat(243)}-aaaaaaa.iso`
      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v4.3.1',
        assets: [
          { ...asset, id: 20, name: baseName, sizeInBytes: 100 },
          { ...asset, id: 21, name: firstRetryName, sizeInBytes: 100 },
        ],
      }
      let uploadedName = ''
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => draft,
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              _sourcePath,
              name
            ) => {
              uploadedName = name
              return {
                ok: true,
                asset: { ...asset, name, sizeInBytes: 100 },
                bytes: 100,
                localDigest: `sha256:${wholeSha}`,
              }
            },
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        statSize: async () => 100,
        hashFile: async () => ({ sha256: wholeSha, sizeInBytes: 100 }),
        hashFileParts: async () => ({
          sha256: wholeSha,
          sizeInBytes: 100,
          parts: [{ offset: 0, length: 100, sha256: wholeSha }],
        }),
        writePointer: async () => undefined,
      }

      const result = await pinFileToRelease(
        store,
        repository,
        selected,
        {
          absoluteFilePath: filePath,
          trackedRelativePath: 'retry.iso',
          releaseTag: 'v4.3.1',
        },
        undefined,
        undefined,
        fs
      )

      assert.equal(uploadedName.length, 255)
      assert.equal(uploadedName.endsWith('-aaaaaaa-2.iso'), true)
      assert.notEqual(uploadedName, baseName)
      assert.notEqual(uploadedName, firstRetryName)
      assert.equal(result.pointer.assetName, uploadedName)
    })
  })

  it('rolls back only the attempt-owned single asset on response mismatch', async () => {
    await withTempRepository(async (dir, repository) => {
      const filePath = join(dir, 'changing.bin')
      const content = Buffer.from('original bytes')
      await writeFile(filePath, content)
      const expectedSha = createHash('sha256').update(content).digest('hex')
      const preexisting = { ...asset, id: 19, name: 'keep.bin' }
      let remoteAssets = new Array<IGitHubReleaseAsset>(preexisting)
      const deletedAssetIds = new Array<number>()
      const currentRelease = (): IGitHubRelease => ({
        ...release,
        tagName: 'v4.4.0',
        assets: [...remoteAssets],
      })
      const gateway = inMemoryReleaseGateway(
        currentRelease,
        async (_repository, _review, _path, name) => {
          const uploaded = {
            ...asset,
            id: 101,
            name,
            sizeInBytes: content.length,
          }
          remoteAssets.push(uploaded)
          return {
            asset: uploaded,
            bytes: content.length,
            localDigest: `sha256:${'f'.repeat(64)}`,
          }
        },
        async (_repository, review) => {
          assert.notEqual(review.assetId, null)
          deletedAssetIds.push(review.assetId!)
          remoteAssets = remoteAssets.filter(
            candidate => candidate.id !== review.assetId
          )
        }
      )

      await assert.rejects(
        pinFileToRelease(gateway, repository, selected, {
          absoluteFilePath: filePath,
          trackedRelativePath: 'changing.bin',
          releaseTag: 'v4.4.0',
        }),
        /no longer matches/
      )
      assert.notEqual(expectedSha, 'f'.repeat(64))
      assert.deepEqual(deletedAssetIds, [101])
      assert.deepEqual(
        remoteAssets.map(candidate => candidate.id),
        [19]
      )
      assert.deepEqual(await readFile(filePath), content)
    })
  })

  it('rolls back a single asset when pointer writing fails', async () => {
    await withTempRepository(async (dir, repository) => {
      const filePath = join(dir, 'pointer-failure.bin')
      const content = Buffer.from('pointer write failure bytes')
      await writeFile(filePath, content)
      const expectedSha = createHash('sha256').update(content).digest('hex')
      let remoteAssets = new Array<IGitHubReleaseAsset>()
      const deletedAssetIds = new Array<number>()
      const currentRelease = (): IGitHubRelease => ({
        ...release,
        tagName: 'v-pointer-failure',
        assets: [...remoteAssets],
      })
      const gateway = inMemoryReleaseGateway(
        currentRelease,
        async (_repository, _review, _path, name) => {
          const uploaded = {
            ...asset,
            id: 102,
            name,
            sizeInBytes: content.length,
          }
          remoteAssets.push(uploaded)
          return {
            asset: uploaded,
            bytes: content.length,
            localDigest: `sha256:${expectedSha}`,
          }
        },
        async (_repository, review) => {
          assert.notEqual(review.assetId, null)
          deletedAssetIds.push(review.assetId!)
          remoteAssets = remoteAssets.filter(
            candidate => candidate.id !== review.assetId
          )
        }
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        writePointer: async () => {
          throw new Error('simulated pointer write failure')
        },
      }

      await assert.rejects(
        pinFileToRelease(
          gateway,
          repository,
          selected,
          {
            absoluteFilePath: filePath,
            trackedRelativePath: 'pointer-failure.bin',
            releaseTag: 'v-pointer-failure',
          },
          undefined,
          undefined,
          fs
        ),
        /simulated pointer write failure/
      )

      assert.deepEqual(deletedAssetIds, [102])
      assert.deepEqual(remoteAssets, [])
      assert.deepEqual(await readFile(filePath), content)
    })
  })

  it('uses a fresh signal to roll back a single asset after cancellation', async () => {
    await withTempRepository(async (dir, repository) => {
      const filePath = join(dir, 'cancel-single.bin')
      const content = Buffer.from('single asset cancellation bytes')
      await writeFile(filePath, content)
      const expectedSha = createHash('sha256').update(content).digest('hex')
      const controller = new AbortController()
      let remoteAssets = new Array<IGitHubReleaseAsset>()
      const deletedAssetIds = new Array<number>()
      let pointerWritten = false
      const currentRelease = (): IGitHubRelease => ({
        ...release,
        tagName: 'v-cancel-single',
        assets: [...remoteAssets],
      })
      const gateway = inMemoryReleaseGateway(
        currentRelease,
        async (_repository, _review, _path, name) => {
          const uploaded = {
            ...asset,
            id: 103,
            name,
            sizeInBytes: content.length,
          }
          remoteAssets.push(uploaded)
          controller.abort()
          return {
            asset: uploaded,
            bytes: content.length,
            localDigest: `sha256:${expectedSha}`,
          }
        },
        async (_repository, review, cleanupSignal) => {
          assert.equal(cleanupSignal?.aborted, false)
          assert.notEqual(review.assetId, null)
          deletedAssetIds.push(review.assetId!)
          remoteAssets = remoteAssets.filter(
            candidate => candidate.id !== review.assetId
          )
        }
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        writePointer: async () => {
          pointerWritten = true
        },
      }

      await assert.rejects(
        pinFileToRelease(
          gateway,
          repository,
          selected,
          {
            absoluteFilePath: filePath,
            trackedRelativePath: 'cancel-single.bin',
            releaseTag: 'v-cancel-single',
          },
          controller.signal,
          undefined,
          fs
        ),
        { name: 'AbortError' }
      )

      assert.equal(pointerWritten, false)
      assert.deepEqual(deletedAssetIds, [103])
      assert.deepEqual(remoteAssets, [])
      assert.deepEqual(await readFile(filePath), content)
    })
  })

  it('does not write a multipart pointer when a raw part byte count changed', async () => {
    await withTempRepository(async (dir, repository) => {
      const filePath = join(dir, 'changing-huge.bin')
      await writeFile(filePath, 'original bytes')
      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v4.5.0',
        assets: [],
      }
      const partShas = ['b'.repeat(64), 'c'.repeat(64)]
      let pointerWritten = false
      let uploadIndex = 0
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => draft,
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              _path,
              name,
              _label,
              _signal,
              _onProgress,
              range
            ) => {
              const index = uploadIndex++
              const expectedBytes = range!.length
              return {
                ok: true,
                asset: { ...asset, name, sizeInBytes: expectedBytes },
                bytes: index === 0 ? expectedBytes : expectedBytes - 1,
                localDigest: `sha256:${partShas[index]}`,
              }
            },
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        hashFileParts: async () => ({
          sha256: 'a'.repeat(64),
          sizeInBytes: 20,
          parts: [
            { offset: 0, length: 10, sha256: partShas[0] },
            { offset: 10, length: 10, sha256: partShas[1] },
          ],
        }),
        writePointer: async () => {
          pointerWritten = true
        },
      }

      await assert.rejects(
        pinFileToRelease(
          store,
          repository,
          selected,
          {
            absoluteFilePath: filePath,
            trackedRelativePath: 'changing-huge.bin',
            releaseTag: 'v4.5.0',
          },
          undefined,
          undefined,
          fs
        ),
        /no longer matches/
      )
      assert.equal(pointerWritten, false)
      assert.equal(await readFile(filePath, 'utf8'), 'original bytes')
    })
  })

  it('does not replace a multipart source that changed after upload', async () => {
    await withTempRepository(async (dir, repository) => {
      const filePath = join(dir, 'growing-huge.bin')
      const original = Buffer.from('0123456789abcdefghij')
      const appended = Buffer.from('new tail')
      await writeFile(filePath, original)
      const digest = (bytes: Buffer) =>
        createHash('sha256').update(bytes).digest('hex')
      const first = original.subarray(0, 10)
      const second = original.subarray(10)
      const parts = [
        { offset: 0, length: first.length, sha256: digest(first) },
        { offset: first.length, length: second.length, sha256: digest(second) },
      ]
      const wholeSha = digest(original)
      const draft: IGitHubRelease = {
        ...release,
        tagName: 'v4.6.0',
        assets: [],
      }
      let uploadIndex = 0
      let pointerWritten = false
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => draft,
              fetchRelease: async () => draft,
            }),
          {
            uploadAsset: async (
              _account,
              _repository,
              _releaseId,
              _path,
              name,
              _label,
              _signal,
              _onProgress,
              range
            ) => {
              const index = uploadIndex++
              if (index === parts.length - 1) {
                await writeFile(filePath, Buffer.concat([original, appended]))
              }
              return {
                ok: true,
                asset: { ...asset, name, sizeInBytes: range!.length },
                bytes: range!.length,
                localDigest: `sha256:${parts[index].sha256}`,
              }
            },
          }
        )
      )
      const fs: ICheapLfsFileSystem = {
        ...defaultCheapLfsFileSystem,
        hashFileParts: async () => ({
          sha256: wholeSha,
          sizeInBytes: original.length,
          parts,
        }),
        writePointer: async () => {
          pointerWritten = true
        },
      }

      await assert.rejects(
        pinFileToRelease(
          store,
          repository,
          selected,
          {
            absoluteFilePath: filePath,
            trackedRelativePath: 'growing-huge.bin',
            releaseTag: 'v4.6.0',
          },
          undefined,
          undefined,
          fs
        ),
        /source changed after it was uploaded/
      )
      assert.equal(pointerWritten, false)
      assert.deepEqual(
        await readFile(filePath),
        Buffer.concat([original, appended])
      )
    })
  })

  it('preserves a concurrent edit before replacing a multipart pointer', async () => {
    await withTempRepository(async (dir, repository) => {
      const parts = [Buffer.from('first part'), Buffer.from('second part')]
      const content = Buffer.concat(parts)
      const concurrentEdit = Buffer.from('user multipart edit during download')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'multipart-race',
        assetName: 'unused-whole-name.bin',
        sizeInBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        parts: parts.map((part, index) => ({
          name: `race.part-${index}`,
          sizeInBytes: part.length,
          sha256: createHash('sha256').update(part).digest('hex'),
        })),
      }
      const trackedPath = join(dir, 'multipart-race.bin')
      await writeFile(trackedPath, serializeCheapLfsPointer(pointer), 'utf8')
      const releaseWithAssets: IGitHubRelease = {
        ...release,
        tagName: pointer.releaseTag,
        assets: pointer.parts!.map((part, index) => ({
          ...asset,
          id: asset.id + index,
          name: part.name,
          sizeInBytes: part.sizeInBytes,
        })),
      }
      const temporaryPaths: string[] = []
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithAssets), {
          downloadAsset: async (
            _account,
            _repository,
            _releaseId,
            releaseAsset,
            destination
          ) => {
            const index = pointer.parts!.findIndex(
              part => part.name === releaseAsset.name
            )
            assert.notEqual(index, -1)
            temporaryPaths.push(destination)
            await writeFile(destination, parts[index])
            if (index === parts.length - 1) {
              await writeFile(trackedPath, concurrentEdit)
            }
            return {
              ok: true,
              path: destination,
              bytes: parts[index].length,
              localDigest: `sha256:${pointer.parts![index].sha256}`,
              matchesGitHubDigest: true,
            }
          },
        })
      )

      await assert.rejects(
        materializePointer(store, repository, selected, 'multipart-race.bin'),
        /pointer changed or was removed.*current file was left in place/
      )
      assert.deepEqual(await readFile(trackedPath), concurrentEdit)
      for (const temporaryPath of temporaryPaths) {
        await assert.rejects(stat(temporaryPath))
      }
    })
  })

  it('materializes raw parts and a legacy compressed part', async () => {
    await withTempRepository(async (dir, repository) => {
      const first = Buffer.from('the first part '.repeat(300))
      const second = Buffer.from('the second part '.repeat(200))
      const storedSecond = await deflateRaw(second)
      const whole = Buffer.concat([first, second])
      const partSha = (buffer: Buffer) =>
        createHash('sha256').update(buffer).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'v6.0.0',
        assetName: 'huge.bin',
        sizeInBytes: whole.length,
        sha256: partSha(whole),
        parts: [
          {
            name: 'huge.bin.part001',
            sizeInBytes: first.length,
            sha256: partSha(first),
          },
          {
            name: 'huge.bin.part002.deflate',
            sizeInBytes: second.length,
            sha256: partSha(second),
            deflatedSizeInBytes: storedSecond.length,
          },
        ],
      }
      const trackedPath = join(dir, 'huge.bin')
      await writeFile(trackedPath, serializeCheapLfsPointer(pointer), 'utf8')

      const byName = new Map([
        ['huge.bin.part001', first],
        ['huge.bin.part002.deflate', storedSecond],
      ])
      const releaseWithParts: IGitHubRelease = {
        ...release,
        tagName: 'v6.0.0',
        assets: [...byName].map(([name, buffer]) => ({
          ...asset,
          name,
          sizeInBytes: buffer.length,
        })),
      }
      const destinations = new Array<string>()
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithParts), {
          downloadAsset: async (
            _account,
            _repository,
            _releaseId,
            downloadedAsset,
            dest
          ) => {
            destinations.push(dest)
            const content = byName.get(downloadedAsset.name)!
            await writeFile(dest, content)
            return {
              ok: true,
              path: dest,
              bytes: content.length,
              localDigest: `sha256:${partSha(content)}`,
              matchesGitHubDigest: true,
            }
          },
        })
      )

      const result = await materializePointer(
        store,
        repository,
        selected,
        'huge.bin'
      )

      assert.equal(await realpath(result.path), await realpath(trackedPath))
      assert.equal(result.bytes, whole.length)
      // The tracked file is now the reassembled whole file.
      assert.deepEqual(await readFile(trackedPath), whole)
      // Every downloaded part temp was cleaned up.
      assert.equal(destinations.length, 2)
      for (const destination of destinations) {
        await assert.rejects(stat(destination))
      }
    })
  })

  it('downloads and decompresses a cloud-style single object locally', async () => {
    await withTempRepository(async (dir, repository) => {
      const original = Buffer.from(
        'cloud compressed, locally restored\n'.repeat(400)
      )
      const stored = await deflateRaw(original)
      const digest = createHash('sha256').update(original).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'assets',
        assetName: 'payload.bin.cheap-lfs.deflate',
        sizeInBytes: original.length,
        sha256: digest,
        parts: [
          {
            name: 'payload.bin.cheap-lfs.deflate',
            sizeInBytes: original.length,
            sha256: digest,
            deflatedSizeInBytes: stored.length,
          },
        ],
      }
      const trackedPath = join(dir, 'payload.bin')
      await writeFile(trackedPath, serializeCheapLfsPointer(pointer), 'utf8')
      const compressedAsset: IGitHubReleaseAsset = {
        ...asset,
        name: pointer.assetName,
        sizeInBytes: stored.length,
      }
      const cloudRelease: IGitHubRelease = {
        ...release,
        tagName: pointer.releaseTag,
        assets: [compressedAsset],
      }
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(cloudRelease), {
          downloadAsset: async (
            _account,
            _repository,
            _releaseId,
            _downloadedAsset,
            destination
          ) => {
            await writeFile(destination, stored)
            return {
              ok: true,
              path: destination,
              bytes: stored.length,
              localDigest: `sha256:${createHash('sha256')
                .update(stored)
                .digest('hex')}`,
              matchesGitHubDigest: true,
            }
          },
        })
      )

      const result = await materializePointer(
        store,
        repository,
        selected,
        'payload.bin'
      )

      assert.equal(result.bytes, original.length)
      assert.deepEqual(await readFile(trackedPath), original)
    })
  })

  it('leaves a cloud pointer intact when its DEFLATE stream is truncated', async () => {
    const original = Buffer.from('truncated cloud object\n'.repeat(500))
    const compressed = await deflateRaw(original)
    const truncated = compressed.subarray(0, compressed.length - 3)

    await assertCompressedMaterializationFailure(
      truncated,
      original,
      /unexpected end|invalid|does not match/i
    )
  })

  it('bounds cloud decompression and removes both stored and expanded temps', async () => {
    const expanded = Buffer.from('expansion-boundary\n'.repeat(1_000))
    const compressed = await deflateRaw(expanded)
    const declared = expanded.subarray(0, expanded.length - 1)

    await assertCompressedMaterializationFailure(
      compressed,
      declared,
      /expands past its pointer size/
    )
  })

  it('leaves a cloud pointer intact when exact-size output has the wrong hash', async () => {
    const expected = Buffer.from('expected exact-size cloud bytes')
    const different = Buffer.alloc(expected.length, 0x5a)
    assert.equal(different.length, expected.length)
    const compressed = await deflateRaw(different)

    await assertCompressedMaterializationFailure(
      compressed,
      expected,
      /does not match the pointer/
    )
  })

  it('materializes multipart assets discovered beyond the release preview page', async () => {
    await withTempRepository(async (dir, repository) => {
      const first = Buffer.from('first paginated part')
      const second = Buffer.from('second paginated part')
      const whole = Buffer.concat([first, second])
      const digest = (buffer: Buffer) =>
        createHash('sha256').update(buffer).digest('hex')
      const firstAsset: IGitHubReleaseAsset = {
        ...asset,
        id: 1_201,
        name: 'paged.bin.part001',
        sizeInBytes: first.length,
        digest: `sha256:${digest(first)}`,
      }
      const secondAsset: IGitHubReleaseAsset = {
        ...asset,
        id: 1_202,
        name: 'paged.bin.part002',
        sizeInBytes: second.length,
        digest: `sha256:${digest(second)}`,
      }
      const releasePreview: IGitHubRelease = {
        ...release,
        tagName: 'v6.1.0',
        assets: [firstAsset],
      }
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: releasePreview.tagName,
        assetName: 'paged.bin',
        sizeInBytes: whole.length,
        sha256: digest(whole),
        parts: [
          {
            name: firstAsset.name,
            sizeInBytes: first.length,
            sha256: digest(first),
          },
          {
            name: secondAsset.name,
            sizeInBytes: second.length,
            sha256: digest(second),
          },
        ],
      }
      const trackedPath = join(dir, 'paged.bin')
      await writeFile(trackedPath, serializeCheapLfsPointer(pointer), 'utf8')

      const requestedPages = new Array<number>()
      const byName = new Map([
        [firstAsset.name, first],
        [secondAsset.name, second],
      ])
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => releasePreview,
              fetchReleaseAssets: async (
                _owner,
                _name,
                _releaseId,
                page = 1
              ) => {
                requestedPages.push(page)
                return page === 1
                  ? {
                      assets: [firstAsset],
                      page,
                      nextPage: 2,
                      capped: false,
                    }
                  : {
                      assets: [secondAsset],
                      page,
                      nextPage: null,
                      capped: false,
                    }
              },
            }),
          {
            downloadAsset: async (
              _account,
              _repository,
              _releaseId,
              downloadedAsset,
              destination
            ) => {
              const content = byName.get(downloadedAsset.name)!
              await writeFile(destination, content)
              return {
                ok: true,
                path: destination,
                bytes: content.length,
                localDigest: `sha256:${digest(content)}`,
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
        'paged.bin'
      )

      assert.deepEqual(requestedPages, [1, 2])
      assert.equal(result.bytes, whole.length)
      assert.deepEqual(await readFile(trackedPath), whole)
    })
  })

  it('reuses one complete release inventory across a materialize batch', async () => {
    await withTempRepository(async (dir, repository) => {
      const content = Buffer.from('shared release payload')
      const sha256 = createHash('sha256').update(content).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'v6.2.0',
        assetName: 'shared.bin',
        sizeInBytes: content.length,
        sha256,
      }
      await writeFile(
        join(dir, 'first.bin'),
        serializeCheapLfsPointer(pointer),
        'utf8'
      )
      await writeFile(
        join(dir, 'second.bin'),
        serializeCheapLfsPointer(pointer),
        'utf8'
      )
      const sharedAsset: IGitHubReleaseAsset = {
        ...asset,
        id: 1_301,
        name: pointer.assetName,
        sizeInBytes: content.length,
        digest: `sha256:${sha256}`,
      }
      const preview: IGitHubRelease = {
        ...release,
        tagName: pointer.releaseTag,
        assets: [],
      }
      let releaseRequests = 0
      let inventoryRequests = 0
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => {
                releaseRequests++
                return preview
              },
              fetchReleaseAssets: async () => {
                inventoryRequests++
                return {
                  assets: [sharedAsset],
                  page: 1,
                  nextPage: null,
                  capped: false,
                }
              },
            }),
          {
            downloadAsset: async (
              _account,
              _repository,
              _releaseId,
              _asset,
              destination
            ) => {
              await writeFile(destination, content)
              return {
                ok: true,
                path: destination,
                bytes: content.length,
                localDigest: `sha256:${sha256}`,
                matchesGitHubDigest: true,
              }
            },
          }
        )
      )
      const cache = createCheapLfsMaterializeCache()

      await materializePointer(
        store,
        repository,
        selected,
        'first.bin',
        undefined,
        undefined,
        defaultCheapLfsFileSystem,
        cache
      )
      await materializePointer(
        store,
        repository,
        selected,
        'second.bin',
        undefined,
        undefined,
        defaultCheapLfsFileSystem,
        cache
      )

      assert.equal(releaseRequests, 1)
      assert.equal(inventoryRequests, 1)
      assert.deepEqual(await readFile(join(dir, 'first.bin')), content)
      assert.deepEqual(await readFile(join(dir, 'second.bin')), content)
    })
  })

  it('evicts rejected release metadata from a shared materialize cache', async () => {
    await withTempRepository(async (dir, repository) => {
      const content = Buffer.from('retry release metadata')
      const sha256 = createHash('sha256').update(content).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'v6.3.0',
        assetName: 'retry.bin',
        sizeInBytes: content.length,
        sha256,
      }
      const pointerText = serializeCheapLfsPointer(pointer)
      await writeFile(join(dir, 'first.bin'), pointerText, 'utf8')
      await writeFile(join(dir, 'second.bin'), pointerText, 'utf8')
      const uploadedAsset: IGitHubReleaseAsset = {
        ...asset,
        id: 1_302,
        name: pointer.assetName,
        sizeInBytes: content.length,
        digest: `sha256:${sha256}`,
      }
      let releaseRequests = 0
      const store = await storeWith(
        dependencies(
          () =>
            fakeAPI({
              fetchReleaseByTag: async () => {
                releaseRequests++
                if (releaseRequests === 1) {
                  throw new Error('transient release lookup')
                }
                return {
                  ...release,
                  tagName: pointer.releaseTag,
                  assets: [uploadedAsset],
                }
              },
            }),
          {
            downloadAsset: async (
              _account,
              _repository,
              _releaseId,
              _asset,
              destination
            ) => {
              await writeFile(destination, content)
              return {
                ok: true,
                path: destination,
                bytes: content.length,
                localDigest: `sha256:${sha256}`,
                matchesGitHubDigest: true,
              }
            },
          }
        )
      )
      const cache = createCheapLfsMaterializeCache()

      await assert.rejects(
        materializePointer(
          store,
          repository,
          selected,
          'first.bin',
          undefined,
          undefined,
          defaultCheapLfsFileSystem,
          cache
        ),
        /could not load releases safely/
      )
      await materializePointer(
        store,
        repository,
        selected,
        'second.bin',
        undefined,
        undefined,
        defaultCheapLfsFileSystem,
        cache
      )

      assert.equal(releaseRequests, 2)
      assert.deepEqual(await readFile(join(dir, 'second.bin')), content)
    })
  })

  it('leaves the pointer when a downloaded part is corrupt', async () => {
    await withTempRepository(async (dir, repository) => {
      const first = Buffer.from('good first part '.repeat(300))
      const second = Buffer.from('good second part '.repeat(200))
      const whole = Buffer.concat([first, second])
      const partSha = (buffer: Buffer) =>
        createHash('sha256').update(buffer).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'v7.0.0',
        assetName: 'huge.bin',
        sizeInBytes: whole.length,
        sha256: partSha(whole),
        parts: [
          {
            name: 'huge.bin.part001',
            sizeInBytes: first.length,
            sha256: partSha(first),
          },
          {
            name: 'huge.bin.part002',
            sizeInBytes: second.length,
            sha256: partSha(second),
          },
        ],
      }
      const trackedPath = join(dir, 'huge.bin')
      const pointerText = serializeCheapLfsPointer(pointer)
      await writeFile(trackedPath, pointerText, 'utf8')

      const corruptSecond = Buffer.from('corrupted second '.repeat(200))
      const byName = new Map([
        ['huge.bin.part001', first],
        ['huge.bin.part002', corruptSecond],
      ])
      const releaseWithParts: IGitHubRelease = {
        ...release,
        tagName: 'v7.0.0',
        assets: [
          { ...asset, name: 'huge.bin.part001', sizeInBytes: first.length },
          { ...asset, name: 'huge.bin.part002', sizeInBytes: second.length },
        ],
      }
      const destinations = new Array<string>()
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithParts), {
          downloadAsset: async (
            _account,
            _repository,
            _releaseId,
            downloadedAsset,
            dest
          ) => {
            destinations.push(dest)
            const content = byName.get(downloadedAsset.name)!
            await writeFile(dest, content)
            return {
              ok: true,
              path: dest,
              bytes: content.length,
              localDigest: `sha256:${partSha(content)}`,
              matchesGitHubDigest: true,
            }
          },
        })
      )

      await assert.rejects(
        materializePointer(store, repository, selected, 'huge.bin'),
        /does not match/
      )
      // The pointer is untouched and every part temp was removed.
      assert.equal(await readFile(trackedPath, 'utf8'), pointerText)
      for (const destination of destinations) {
        await assert.rejects(stat(destination))
      }
    })
  })

  it('errors cleanly when a multi-part pointer names a missing asset', async () => {
    await withTempRepository(async (dir, repository) => {
      const first = Buffer.from('lonely first part '.repeat(100))
      const second = Buffer.from('absent second part '.repeat(100))
      const whole = Buffer.concat([first, second])
      const partSha = (buffer: Buffer) =>
        createHash('sha256').update(buffer).digest('hex')
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'v8.0.0',
        assetName: 'huge.bin',
        sizeInBytes: whole.length,
        sha256: partSha(whole),
        parts: [
          {
            name: 'huge.bin.part001',
            sizeInBytes: first.length,
            sha256: partSha(first),
          },
          {
            name: 'huge.bin.part002',
            sizeInBytes: second.length,
            sha256: partSha(second),
          },
        ],
      }
      const trackedPath = join(dir, 'huge.bin')
      const pointerText = serializeCheapLfsPointer(pointer)
      await writeFile(trackedPath, pointerText, 'utf8')

      // The release is missing the second part entirely.
      const releaseWithParts: IGitHubRelease = {
        ...release,
        tagName: 'v8.0.0',
        assets: [
          { ...asset, name: 'huge.bin.part001', sizeInBytes: first.length },
        ],
      }
      let downloads = 0
      const store = await storeWith(
        dependencies(() => fakeAPIForRelease(releaseWithParts), {
          downloadAsset: async (
            _account,
            _repository,
            _releaseId,
            _asset,
            dest
          ) => {
            downloads++
            await writeFile(dest, first)
            return {
              ok: true,
              path: dest,
              bytes: first.length,
              localDigest: `sha256:${partSha(first)}`,
              matchesGitHubDigest: true,
            }
          },
        })
      )

      await assert.rejects(
        materializePointer(store, repository, selected, 'huge.bin'),
        /no asset named/
      )
      // The missing part is detected before any download runs.
      assert.equal(downloads, 0)
      assert.equal(await readFile(trackedPath, 'utf8'), pointerText)
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

  it('inventories every tracked pointer through Git and preserves materialized metadata', async () => {
    await withTempRepository(async (dir, repository) => {
      await execFile('git', ['init', '--quiet'], { cwd: dir })
      const pointer: ICheapLfsPointer = {
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'assets',
        assetName: 'asset.bin',
        sizeInBytes: 10,
        sha256: 'b'.repeat(64),
      }
      const pointerText = serializeCheapLfsPointer(pointer)
      await Promise.all(
        Array.from({ length: 260 }, (_, index) =>
          writeFile(
            join(dir, `pointer-${index.toString().padStart(3, '0')}.bin`),
            pointerText,
            'utf8'
          )
        )
      )
      const deepDirectory = join(
        dir,
        ...Array.from({ length: 12 }, (_, index) => `level-${index}`)
      )
      await mkdir(deepDirectory, { recursive: true })
      await writeFile(join(deepDirectory, 'deep.bin'), pointerText, 'utf8')

      const materializedBytes = Buffer.from('registry original bytes')
      const objectSha = createHash('sha256')
        .update(materializedBytes)
        .digest('hex')
      const ociText = serializeCheapLfsGhcrPointer({
        version: CHEAP_LFS_OCI_POINTER_VERSION,
        image: `ghcr.io/desktop/material@sha256:${'a'.repeat(64)}`,
        object: `sha256:${objectSha}`,
        sizeInBytes: materializedBytes.length,
        layers: Array.from(
          { length: 80 },
          (_, index) => `sha256:${index.toString(16).padStart(64, '0')}`
        ),
      })
      assert.ok(Buffer.byteLength(ociText, 'utf8') > 4096)
      await writeFile(join(dir, 'registry.bin'), ociText, 'utf8')
      await execFile('git', ['add', '--all'], { cwd: dir })
      await execFile(
        'git',
        [
          '-c',
          'user.name=Cheap LFS Test',
          '-c',
          'user.email=cheap-lfs@example.test',
          'commit',
          '--quiet',
          '-m',
          'pointers',
        ],
        { cwd: dir }
      )

      await writeFile(join(dir, 'registry.bin'), materializedBytes)
      await execFile('git', ['add', '--', 'registry.bin'], { cwd: dir })
      const stagedRaw = await listAllCheapLfsPointers(repository)
      assert.equal(
        stagedRaw.find(entry => entry.relativePath === 'registry.bin')
          ?.workingTreeState,
        'modified'
      )
      await execFile('git', ['reset', '--quiet', '--', 'registry.bin'], {
        cwd: dir,
      })
      await rm(join(dir, 'pointer-000.bin'))
      await writeFile(
        join(dir, 'pointer-001.bin'),
        serializeCheapLfsPointer({ ...pointer, assetName: 'new.bin' }),
        'utf8'
      )

      const entries = await listAllCheapLfsPointers(repository)
      assert.equal(entries.length, 261)
      assert.equal(
        entries.some(entry => entry.relativePath === 'pointer-000.bin'),
        false
      )
      const changedPointer = entries.find(
        entry => entry.relativePath === 'pointer-001.bin'
      )
      assert.equal(
        changedPointer?.kind === 'release'
          ? changedPointer.pointer.assetName
          : null,
        'new.bin'
      )
      assert.equal(
        entries.some(entry => entry.relativePath.endsWith('/deep.bin')),
        true
      )
      const registry = entries.find(
        entry => entry.relativePath === 'registry.bin'
      )
      assert.equal(registry?.kind, 'oci')
      assert.equal(registry?.workingTreeState, 'materialized')
      assert.equal(registry?.pointer.sizeInBytes, materializedBytes.length)
    })
  })

  it('fails closed instead of returning a partial inventory at the pointer byte bound', async () => {
    await withTempRepository(async (dir, repository) => {
      await execFile('git', ['init', '--quiet'], { cwd: dir })
      await writeFile(
        join(dir, 'oversized.ptr'),
        `version ${CHEAP_LFS_OCI_POINTER_VERSION}\n${'x'.repeat(
          CHEAP_LFS_OCI_MAXIMUM_POINTER_TEXT_BYTES
        )}`,
        'utf8'
      )

      await assert.rejects(
        listAllCheapLfsPointers(repository),
        /exceeds the .*format limit/
      )
    })
  })
})
