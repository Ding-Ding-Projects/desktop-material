import assert from 'node:assert'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  CheapLfsGhcrMaximumAdaptivePrepareAttempts,
  CheapLfsGhcrMaximumChunkBytes,
  ICheapLfsGhcrSnapshot,
  ICheapLfsGhcrValidatedImage,
  getNextCheapLfsGhcrChunkBytes,
  withPreparedCheapLfsGhcrImage,
} from '../../../src/lib/cheap-lfs/ghcr-image'
import {
  CheapLfsRegistryRepositoryKeyPath,
  resolveCheapLfsGhcrRepositoryKey,
} from '../../../src/lib/cheap-lfs/ghcr-key'
import {
  CheapLfsGhcrLayerUploadTimeoutError,
  ICheapLfsGhcrPublishResult,
} from '../../../src/lib/cheap-lfs/ghcr-oras-transport'
import {
  CHEAP_LFS_GHCR_POINTER_VERSION,
  ICheapLfsGhcrPointer,
  parseCheapLfsGhcrPointer,
  serializeCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'
import {
  ICheapLfsOciPublishRequest,
  ICheapLfsOciFileSystem,
  ICheapLfsOciPullRequest,
  ICheapLfsOciRepositoryContext,
  ICheapLfsOciRuntime,
  listCheapLfsStoredPointers,
  materializeCheapLfsOciFile,
  pinCheapLfsFilesToOci,
  removeCheapLfsOciFile,
} from '../../../src/lib/cheap-lfs/oci-operations'
import {
  ICheapLfsPointerCandidate,
  writeCheapLfsPointerAtomically,
} from '../../../src/lib/cheap-lfs/operations'
import {
  CHEAP_LFS_POINTER_VERSION,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'

const roots: string[] = []
const repositoryIdentity = 'github.com/repositories/8675309'
const registryRepository = 'ghcr.io/desktop-material/project-cheap-lfs'
const sourceRepositoryUrl = 'https://github.com/desktop-material/project'

async function temporaryRepository() {
  const path = await mkdtemp(join(tmpdir(), 'cheap-lfs-oci-operations-test-'))
  roots.push(path)
  return path
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function publicContext(repositoryPath: string): ICheapLfsOciRepositoryContext {
  return {
    repositoryPath,
    repositoryIdentity,
    sourceRepositoryUrl,
    visibility: 'verified-public',
    provider: 'ghcr',
    registryRepository,
    parallelBlobTransfers: true,
  }
}

function privateContext(repositoryPath: string): ICheapLfsOciRepositoryContext {
  return {
    ...publicContext(repositoryPath),
    visibility: 'verified-private',
  }
}

function dockerHubContext(
  repositoryPath: string
): ICheapLfsOciRepositoryContext {
  return {
    ...publicContext(repositoryPath),
    provider: 'docker-hub',
    registryRepository: 'docker.io/shared-builders/project-cheap-lfs',
  }
}

function pointerFor(
  snapshot: ICheapLfsGhcrSnapshot,
  immutableReference: string,
  objectSha256: string
): ICheapLfsGhcrPointer {
  const object = snapshot.objects.find(value => value.sha256 === objectSha256)!
  return {
    version: CHEAP_LFS_GHCR_POINTER_VERSION,
    image: immutableReference,
    object: `sha256:${object.sha256}`,
    sizeInBytes: object.sizeInBytes,
    layers: object.chunks.map(chunk => chunk.blob.digest),
    ...(snapshot.visibility === 'private' ? { keyId: snapshot.keyId! } : {}),
  }
}

interface ICapturedImage {
  readonly immutableReference: string
  readonly validated: ICheapLfsGhcrValidatedImage
}

async function capturePublicImage(
  sources: ReadonlyArray<{ readonly path: string; readonly bytes: Buffer }>
): Promise<ICapturedImage> {
  let captured!: ICapturedImage
  await withPreparedCheapLfsGhcrImage(
    {
      repositoryIdentity,
      sourceRepositoryUrl,
      visibility: 'public',
      desiredObjects: sources.map(source => ({
        sha256: sha256(source.bytes),
        sizeInBytes: source.bytes.length,
        sourcePath: source.path,
      })),
    },
    async image => {
      const immutableReference = `${registryRepository}@${image.manifestDescriptor.digest}`
      captured = {
        immutableReference,
        validated: {
          immutableReference,
          sourceRepositoryUrl,
          snapshot: image.snapshot,
          manifestDescriptor: image.manifestDescriptor,
          configDescriptor: image.configDescriptor,
          blobPaths: new Map(),
        },
      }
    }
  )
  return captured
}

function publishResult(
  request: ICheapLfsOciPublishRequest
): ICheapLfsGhcrPublishResult {
  const immutableReference = `${request.registryRepository}@${request.image.manifestDescriptor.digest}`
  return {
    provider: request.provider,
    immutableReference,
    taggedReference: `${request.registryRepository}:desktop-material-cheap-lfs-v1`,
    manifestDigest: request.image.manifestDescriptor.digest,
    pointers: request.image.snapshot.objects.map(object => ({
      objectSha256: object.sha256,
      sizeInBytes: object.sizeInBytes,
      text: serializeCheapLfsGhcrPointer(
        pointerFor(request.image.snapshot, immutableReference, object.sha256)
      ),
    })),
    keyCreated: request.keyCreated,
    keyRelativePath: request.keyRelativePath,
  }
}

class FakeRuntime implements ICheapLfsOciRuntime {
  public readonly pulled = new Map<string, ICheapLfsGhcrValidatedImage>()
  public readonly publishRequests: ICheapLfsOciPublishRequest[] = []
  public readonly pullRequests: ICheapLfsOciPullRequest[] = []

  public constructor(
    private readonly publishOperation: (
      request: ICheapLfsOciPublishRequest
    ) => Promise<ICheapLfsGhcrPublishResult> = async request =>
      publishResult(request)
  ) {}

  public async publish(
    request: ICheapLfsOciPublishRequest
  ): Promise<ICheapLfsGhcrPublishResult> {
    this.publishRequests.push(request)
    return await this.publishOperation(request)
  }

  public async withPulledImage<T>(
    request: ICheapLfsOciPullRequest,
    operation: (image: ICheapLfsGhcrValidatedImage) => Promise<T>
  ): Promise<T> {
    this.pullRequests.push(request)
    const image = this.pulled.get(request.pointer.image)
    assert.ok(image, `missing fake image ${request.pointer.image}`)
    assert.equal(request.expectedRepositoryIdentity, repositoryIdentity)
    return await operation(image)
  }
}

function inventoryFileSystem(
  candidates: ReadonlyArray<ICheapLfsPointerCandidate>
): ICheapLfsOciFileSystem {
  return {
    scanPointerCandidates: async () => candidates,
    readPointerText: path => readFile(path, 'utf8'),
    writePointer: async (path, text) => writeFile(path, text, 'utf8'),
    hashFile: async path => {
      const bytes = await readFile(path)
      return { sha256: sha256(bytes), sizeInBytes: bytes.length }
    },
    removeFile: path => rm(path),
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(path => rm(path, { recursive: true, force: true }))
  )
})

describe('Cheap LFS OCI orchestration', () => {
  it('rejects a non-GitHub or mismatched GHCR source URL before scanning', async () => {
    const root = await temporaryRepository()
    const runtime = new FakeRuntime()
    for (const invalid of [
      'https://example.com/desktop-material/project',
      'https://github.com/another-owner/project',
    ]) {
      await assert.rejects(
        pinCheapLfsFilesToOci(
          { ...publicContext(root), sourceRepositoryUrl: invalid },
          [{ relativePath: 'never-read.bin' }],
          { runtime }
        ),
        /source URL|must match/
      )
    }
    assert.equal(runtime.publishRequests.length, 0)
  })

  it('maps three active registry object lanes back to input-ordered files', async () => {
    const root = await temporaryRepository()
    const targets = await Promise.all(
      ['zeta.bin', 'alpha.bin', 'middle.bin'].map(
        async (relativePath, index) => {
          const bytes = Buffer.from(`active lane ${index}`)
          await writeFile(join(root, relativePath), bytes)
          return { relativePath, bytes }
        }
      )
    )
    const publishingProgress = new Array<{
      readonly currentPath: string | null
      readonly activeFiles?: ReadonlyArray<{
        readonly relativePath: string
        readonly processedBytes: number
      }>
    }>()
    const runtime = new FakeRuntime(async request => {
      const activeObjectSha256s = targets.map(target => sha256(target.bytes))
      request.onProgress?.({
        phase: 'uploading',
        stage: 'object-chunk',
        currentDigest: null,
        currentObjectSha256: activeObjectSha256s[0],
        activeObjectSha256s,
        activeObjects: activeObjectSha256s.map((objectSha256, index) => ({
          objectSha256,
          processedBytes: index + 1,
          totalBytes: targets[index].bytes.length,
        })),
        completedItems: 0,
        totalItems: 3,
        completedObjects: 0,
        totalObjects: 3,
        processedBytes: 0,
        totalBytes: targets.reduce(
          (sum, target) => sum + target.bytes.length,
          0
        ),
      })
      return publishResult(request)
    })

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      targets.map(target => ({ relativePath: target.relativePath })),
      { runtime, fileSystem: inventoryFileSystem([]) },
      undefined,
      progress => {
        if (progress.phase === 'publishing') {
          publishingProgress.push(progress)
        }
      }
    )

    assert.equal(result.published, true)
    assert.deepEqual(
      publishingProgress.at(-1)?.activeFiles?.map(file => file.relativePath),
      targets.map(target => target.relativePath)
    )
    assert.deepEqual(
      publishingProgress.at(-1)?.activeFiles?.map(file => file.processedBytes),
      [1, 2, 3]
    )
    assert.equal(publishingProgress.at(-1)?.currentPath, 'zeta.bin')
  })

  it('blocks both repository key paths case-insensitively as pin and remove targets', async () => {
    const root = await temporaryRepository()
    const runtime = new FakeRuntime()
    for (const path of [
      '.DESKTOP-MATERIAL/CHEAP-LFS-REGISTRY-KEY-V1',
      '.Desktop-Material\\Cheap-Lfs-Ghcr-Key-V1',
    ]) {
      const absolutePath = join(root, ...path.replace(/\\/g, '/').split('/'))
      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, 'x')
      const result = await pinCheapLfsFilesToOci(
        publicContext(root),
        [{ relativePath: path }],
        { runtime }
      )
      assert.equal(result.published, false)
      assert.equal(result.failures.length, 1)
      assert.match(result.failures[0].message, /registry key path/i)
      await assert.rejects(
        removeCheapLfsOciFile(publicContext(root), path, { runtime }),
        /registry key path/i
      )
    }
    assert.equal(runtime.publishRequests.length, 0)
  })

  it('lists Release, GHCR, and Docker Hub pointers through a bounded full read', async () => {
    const root = await temporaryRepository()
    const releaseText = serializeCheapLfsPointer({
      version: CHEAP_LFS_POINTER_VERSION,
      releaseTag: 'cheap-lfs-v1',
      assetName: 'one.bin',
      sizeInBytes: 3,
      sha256: '1'.repeat(64),
    })
    const ghcrText = serializeCheapLfsGhcrPointer({
      version: CHEAP_LFS_GHCR_POINTER_VERSION,
      image: `${registryRepository}@sha256:${'2'.repeat(64)}`,
      object: `sha256:${'3'.repeat(64)}`,
      sizeInBytes: 4,
      layers: [`sha256:${'4'.repeat(64)}`],
    })
    const dockerText = serializeCheapLfsGhcrPointer({
      version: CHEAP_LFS_GHCR_POINTER_VERSION,
      image: `docker.io/example/project@sha256:${'5'.repeat(64)}`,
      object: `sha256:${'6'.repeat(64)}`,
      sizeInBytes: 5,
      layers: [`sha256:${'7'.repeat(64)}`],
    })
    await writeFile(join(root, 'release.ptr'), releaseText)
    await writeFile(join(root, 'ghcr.ptr'), ghcrText)
    await writeFile(join(root, 'docker.ptr'), dockerText)
    await writeFile(
      join(root, 'malformed.ptr'),
      `version ${CHEAP_LFS_GHCR_POINTER_VERSION}\nnot canonical\n`
    )

    const entries = await listCheapLfsStoredPointers(root)

    assert.deepEqual(
      entries.map(entry => [entry.relativePath, entry.backend]),
      [
        ['docker.ptr', 'oci'],
        ['ghcr.ptr', 'oci'],
        ['release.ptr', 'release'],
      ]
    )
    assert.equal(
      entries[0].backend === 'oci' && entries[0].provider,
      'docker-hub'
    )
    assert.equal(entries[1].backend === 'oci' && entries[1].provider, 'ghcr')
  })

  it('publishes one full image, reuses old layers, then updates raw and existing files', async () => {
    const root = await temporaryRepository()
    const oldBytes = Buffer.from('existing object')
    const newBytes = Buffer.from('new object')
    const oldSource = join(root, 'old-source.bin')
    await writeFile(oldSource, oldBytes)
    const oldImage = await capturePublicImage([
      { path: oldSource, bytes: oldBytes },
    ])
    const oldPointerText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(oldBytes)
      )
    )
    const trackedOld = join(root, 'old.bin')
    const trackedNew = join(root, 'new.bin')
    await writeFile(trackedOld, oldPointerText)
    await writeFile(trackedNew, newBytes)
    const runtime = new FakeRuntime(async request => {
      assert.equal(await readFile(trackedOld, 'utf8'), oldPointerText)
      assert.deepEqual(await readFile(trackedNew), newBytes)
      assert.equal(request.image.snapshot.objects.length, 2)
      assert.equal(
        request.image.layers.some(
          layer => layer.object.sha256 === sha256(oldBytes) && layer.reused
        ),
        true
      )
      assert.equal(
        request.image.layers.some(
          layer => layer.object.sha256 === sha256(newBytes) && !layer.reused
        ),
        true
      )
      return publishResult(request)
    })
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'new.bin', expectedSizeInBytes: newBytes.length }],
      { runtime }
    )

    assert.equal(result.published, true)
    assert.equal(result.failures.length, 0)
    assert.deepEqual(result.commitPaths, ['old.bin', 'new.bin'])
    assert.equal(result.files.filter(file => file.changed).length, 2)
    const oldPointer = parseCheapLfsGhcrPointer(
      await readFile(trackedOld, 'utf8')
    )
    const newPointer = parseCheapLfsGhcrPointer(
      await readFile(trackedNew, 'utf8')
    )
    assert.equal(oldPointer?.image, result.immutableReference)
    assert.equal(newPointer?.image, result.immutableReference)
    assert.equal(newPointer?.object, `sha256:${sha256(newBytes)}`)
  })

  it('carries a materialized index pointer into an add without replacing its raw bytes', async () => {
    const root = await temporaryRepository()
    const retained = Buffer.from('materialized retained object')
    const added = Buffer.from('new object beside materialized')
    const source = join(root, 'retained-source.bin')
    await writeFile(source, retained)
    const oldImage = await capturePublicImage([
      { path: source, bytes: retained },
    ])
    const retainedText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(retained)
      )
    )
    const retainedPath = join(root, 'retained.bin')
    const addedPath = join(root, 'added.bin')
    await writeFile(retainedPath, retained)
    await writeFile(addedPath, added)
    const runtime = new FakeRuntime(async request => {
      assert.deepEqual(
        request.image.snapshot.objects.map(object => object.sha256).sort(),
        [sha256(added), sha256(retained)].sort()
      )
      return publishResult(request)
    })
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'added.bin' }],
      {
        runtime,
        fileSystem: inventoryFileSystem([
          {
            relativePath: 'retained.bin',
            text: retainedText,
            workingTreeState: 'materialized',
            metadataSource: 'index',
            workingTreeSha256: sha256(retained),
            workingTreeSizeInBytes: retained.length,
          },
        ]),
      }
    )

    assert.equal(result.failures.length, 0)
    assert.deepEqual(await readFile(retainedPath), retained)
    assert.deepEqual(result.commitPaths, ['added.bin'])
    assert.equal(
      result.files.find(file => file.relativePath === 'retained.bin')?.changed,
      false
    )
  })

  it('migrates one fresh full snapshot when every old provider pointer is materialized', async () => {
    const root = await temporaryRepository()
    const first = Buffer.from('verified first migration object')
    const second = Buffer.from('verified second migration object')
    const added = Buffer.from('new migration object')
    const firstSource = join(root, 'first-migration-source.bin')
    const secondSource = join(root, 'second-migration-source.bin')
    await writeFile(firstSource, first)
    await writeFile(secondSource, second)
    const oldImage = await capturePublicImage([
      { path: firstSource, bytes: first },
      { path: secondSource, bytes: second },
    ])
    const firstText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(first)
      )
    )
    const secondText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(second)
      )
    )
    const firstPath = join(root, 'first-migration.bin')
    const secondPath = join(root, 'second-migration.bin')
    const addedPath = join(root, 'added-migration.bin')
    await writeFile(firstPath, first)
    await writeFile(secondPath, second)
    await writeFile(addedPath, added)
    const runtime = new FakeRuntime(async request => {
      assert.equal(request.provider, 'docker-hub')
      assert.equal(
        request.registryRepository,
        'docker.io/shared-builders/project-cheap-lfs'
      )
      assert.deepEqual(
        request.image.snapshot.objects.map(object => object.sha256).sort(),
        [sha256(first), sha256(second), sha256(added)].sort()
      )
      assert.equal(
        request.image.layers.every(layer => !layer.reused),
        true
      )
      return publishResult(request)
    })
    const fileSystem = inventoryFileSystem([
      {
        relativePath: 'first-migration.bin',
        text: firstText,
        workingTreeState: 'materialized',
        metadataSource: 'index',
        workingTreeSha256: sha256(first),
        workingTreeSizeInBytes: first.length,
      },
      {
        relativePath: 'second-migration.bin',
        text: secondText,
        workingTreeState: 'materialized',
        metadataSource: 'index',
        workingTreeSha256: sha256(second),
        workingTreeSizeInBytes: second.length,
      },
    ])

    const result = await pinCheapLfsFilesToOci(
      dockerHubContext(root),
      [{ relativePath: 'added-migration.bin' }],
      { runtime, fileSystem }
    )

    assert.equal(result.published, true)
    assert.equal(result.failures.length, 0)
    assert.equal(runtime.publishRequests.length, 1)
    assert.deepEqual(result.commitPaths, [
      'first-migration.bin',
      'second-migration.bin',
      'added-migration.bin',
    ])
    for (const path of [firstPath, secondPath, addedPath]) {
      const pointer = parseCheapLfsGhcrPointer(await readFile(path, 'utf8'))
      assert.equal(
        pointer?.image.startsWith(
          'docker.io/shared-builders/project-cheap-lfs@sha256:'
        ),
        true
      )
    }
  })

  it('converges a partial GHCR-to-Docker migration retry without pulling GHCR', async () => {
    const root = await temporaryRepository()
    const first = Buffer.from('first partial provider migration object')
    const second = Buffer.from('second partial provider migration object')
    const added = Buffer.from('first migration trigger')
    const retryTrigger = Buffer.from('retry migration trigger')
    const firstSource = join(root, 'partial-first-source.bin')
    const secondSource = join(root, 'partial-second-source.bin')
    await writeFile(firstSource, first)
    await writeFile(secondSource, second)
    const oldImage = await capturePublicImage([
      { path: firstSource, bytes: first },
      { path: secondSource, bytes: second },
    ])
    const firstText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(first)
      )
    )
    const secondText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(second)
      )
    )
    const firstPath = join(root, 'partial-first.bin')
    const secondPath = join(root, 'partial-second.bin')
    const addedPath = join(root, 'partial-added.bin')
    const retryPath = join(root, 'partial-retry.bin')
    await writeFile(firstPath, first)
    await writeFile(secondPath, second)
    await writeFile(addedPath, added)

    const runtime = new FakeRuntime(async request => {
      assert.equal(request.provider, 'docker-hub')
      const result = publishResult(request)
      runtime.pulled.set(result.immutableReference, {
        immutableReference: result.immutableReference,
        sourceRepositoryUrl,
        snapshot: request.image.snapshot,
        manifestDescriptor: request.image.manifestDescriptor,
        configDescriptor: request.image.configDescriptor,
        blobPaths: new Map(),
      })
      return result
    })
    const firstInventory = inventoryFileSystem([
      {
        relativePath: 'partial-first.bin',
        text: firstText,
        workingTreeState: 'materialized',
        metadataSource: 'index',
        workingTreeSha256: sha256(first),
        workingTreeSizeInBytes: first.length,
      },
      {
        relativePath: 'partial-second.bin',
        text: secondText,
        workingTreeState: 'materialized',
        metadataSource: 'index',
        workingTreeSha256: sha256(second),
        workingTreeSizeInBytes: second.length,
      },
    ])
    const firstFileSystem: ICheapLfsOciFileSystem = {
      ...firstInventory,
      writePointer: (candidate, text) =>
        candidate === secondPath
          ? writeCheapLfsPointerAtomically(
              candidate,
              text,
              async temporaryFile => {
                await temporaryFile.writeFile(text.slice(0, 24), 'utf8')
                throw new Error('second migration pointer write failed')
              }
            )
          : firstInventory.writePointer(candidate, text),
    }

    const firstResult = await pinCheapLfsFilesToOci(
      dockerHubContext(root),
      [{ relativePath: 'partial-added.bin' }],
      { runtime, fileSystem: firstFileSystem }
    )

    assert.equal(firstResult.published, true)
    assert.deepEqual(firstResult.commitPaths, [
      'partial-first.bin',
      'partial-added.bin',
    ])
    assert.equal(firstResult.failures.length, 1)
    assert.match(firstResult.failures[0].message, /pointer write failed/)
    assert.equal(runtime.pullRequests.length, 0)
    assert.deepEqual(await readFile(secondPath), second)
    const firstDockerText = await readFile(firstPath, 'utf8')
    const addedDockerText = await readFile(addedPath, 'utf8')
    assert.match(
      parseCheapLfsGhcrPointer(firstDockerText)?.image ?? '',
      /^docker\.io\/shared-builders\/project-cheap-lfs@sha256:/
    )

    await writeFile(retryPath, retryTrigger)
    const retryFileSystem = inventoryFileSystem([
      {
        relativePath: 'partial-first.bin',
        text: firstDockerText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
      {
        relativePath: 'partial-second.bin',
        text: secondText,
        workingTreeState: 'materialized',
        metadataSource: 'index',
        workingTreeSha256: sha256(second),
        workingTreeSizeInBytes: second.length,
      },
      {
        relativePath: 'partial-added.bin',
        text: addedDockerText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
    ])
    const retried = await pinCheapLfsFilesToOci(
      dockerHubContext(root),
      [{ relativePath: 'partial-retry.bin' }],
      { runtime, fileSystem: retryFileSystem }
    )

    assert.equal(retried.published, true)
    assert.equal(retried.failures.length, 0)
    assert.deepEqual(retried.commitPaths, [
      'partial-first.bin',
      'partial-second.bin',
      'partial-added.bin',
      'partial-retry.bin',
    ])
    assert.equal(runtime.publishRequests.length, 2)
    assert.equal(runtime.pullRequests.length, 1)
    assert.equal(
      runtime.pullRequests.every(request =>
        request.pointer.image.startsWith(
          'docker.io/shared-builders/project-cheap-lfs@sha256:'
        )
      ),
      true
    )
    const finalPointers = await Promise.all(
      [firstPath, secondPath, addedPath, retryPath].map(path =>
        readFile(path, 'utf8').then(parseCheapLfsGhcrPointer)
      )
    )
    assert.equal(
      finalPointers.every(pointer => pointer !== null),
      true
    )
    assert.equal(new Set(finalPointers.map(pointer => pointer?.image)).size, 1)
    assert.match(
      finalPointers[0]?.image ?? '',
      /^docker\.io\/shared-builders\/project-cheap-lfs@sha256:/
    )
  })

  it('refuses provider migration while any old pointer is not an exact materialized raw', async () => {
    const root = await temporaryRepository()
    const materialized = Buffer.from('verified migration input')
    const edited = Buffer.from('edited migration input')
    const added = Buffer.from('must remain raw')
    const source = join(root, 'refusal-source.bin')
    await writeFile(source, materialized)
    const oldImage = await capturePublicImage([
      { path: source, bytes: materialized },
    ])
    const oldText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(materialized)
      )
    )
    const editedPath = join(root, 'edited-migration.bin')
    const addedPath = join(root, 'blocked-migration.bin')
    await writeFile(editedPath, edited)
    await writeFile(addedPath, added)
    const runtime = new FakeRuntime()

    const result = await pinCheapLfsFilesToOci(
      dockerHubContext(root),
      [{ relativePath: 'blocked-migration.bin' }],
      {
        runtime,
        fileSystem: inventoryFileSystem([
          {
            relativePath: 'edited-migration.bin',
            text: oldText,
            workingTreeState: 'modified',
            metadataSource: 'index',
            workingTreeSha256: sha256(edited),
            workingTreeSizeInBytes: edited.length,
          },
        ]),
      }
    )

    assert.equal(result.published, false)
    assert.equal(runtime.publishRequests.length, 0)
    assert.match(
      result.failures[0].message,
      /materialize every.*without edits/i
    )
    assert.deepEqual(await readFile(editedPath), edited)
    assert.deepEqual(await readFile(addedPath), added)
  })

  it('refuses provider migration while an old file is still a pointer', async () => {
    const root = await temporaryRepository()
    const oldBytes = Buffer.from('pointer-only migration input')
    const added = Buffer.from('blocked pointer-only migration')
    const source = join(root, 'pointer-refusal-source.bin')
    await writeFile(source, oldBytes)
    const oldImage = await capturePublicImage([
      { path: source, bytes: oldBytes },
    ])
    const oldText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(oldBytes)
      )
    )
    const pointerPath = join(root, 'pointer-only.bin')
    const addedPath = join(root, 'blocked-pointer-only.bin')
    await writeFile(pointerPath, oldText)
    await writeFile(addedPath, added)
    const runtime = new FakeRuntime()

    const result = await pinCheapLfsFilesToOci(
      dockerHubContext(root),
      [{ relativePath: 'blocked-pointer-only.bin' }],
      {
        runtime,
        fileSystem: inventoryFileSystem([
          {
            relativePath: 'pointer-only.bin',
            text: oldText,
            workingTreeState: 'pointer',
            metadataSource: 'working-tree',
          },
        ]),
      }
    )

    assert.equal(result.published, false)
    assert.equal(runtime.publishRequests.length, 0)
    assert.match(result.failures[0].message, /materialize every/i)
    assert.equal(await readFile(pointerPath, 'utf8'), oldText)
    assert.deepEqual(await readFile(addedPath), added)
  })

  it('explicitly re-pins an edited materialized path and replaces its prior object', async () => {
    const root = await temporaryRepository()
    const original = Buffer.from('original materialized object')
    const edited = Buffer.from('edited materialized object')
    const source = join(root, 'original-source.bin')
    await writeFile(source, original)
    const oldImage = await capturePublicImage([
      { path: source, bytes: original },
    ])
    const oldText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(original)
      )
    )
    const tracked = join(root, 'replace.bin')
    await writeFile(tracked, edited)
    const runtime = new FakeRuntime(async request => {
      assert.deepEqual(
        request.image.snapshot.objects.map(object => object.sha256),
        [sha256(edited)]
      )
      return publishResult(request)
    })
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'replace.bin', expectedSizeInBytes: edited.length }],
      {
        runtime,
        fileSystem: inventoryFileSystem([
          {
            relativePath: 'replace.bin',
            text: oldText,
            workingTreeState: 'modified',
            metadataSource: 'index',
            workingTreeSha256: sha256(edited),
            workingTreeSizeInBytes: edited.length,
          },
        ]),
      }
    )

    assert.equal(result.failures.length, 0)
    assert.deepEqual(result.commitPaths, ['replace.bin'])
    const replacement = parseCheapLfsGhcrPointer(
      await readFile(tracked, 'utf8')
    )
    assert.equal(replacement?.object, `sha256:${sha256(edited)}`)
  })

  it('removes a materialized raw path while preserving other materialized bytes', async () => {
    const root = await temporaryRepository()
    const removed = Buffer.from('materialized object to remove')
    const kept = Buffer.from('materialized object to retain')
    const removedSource = join(root, 'removed-source.bin')
    const keptSource = join(root, 'kept-source.bin')
    await writeFile(removedSource, removed)
    await writeFile(keptSource, kept)
    const oldImage = await capturePublicImage([
      { path: removedSource, bytes: removed },
      { path: keptSource, bytes: kept },
    ])
    const removedText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(removed)
      )
    )
    const keptText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(kept)
      )
    )
    const removedPath = join(root, 'removed.bin')
    const keptPath = join(root, 'kept.bin')
    await writeFile(removedPath, removed)
    await writeFile(keptPath, kept)
    const runtime = new FakeRuntime(async request => {
      assert.deepEqual(
        request.image.snapshot.objects.map(object => object.sha256),
        [sha256(kept)]
      )
      return publishResult(request)
    })
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)
    const fileSystem = inventoryFileSystem([
      {
        relativePath: 'removed.bin',
        text: removedText,
        workingTreeState: 'materialized',
        metadataSource: 'index',
        workingTreeSha256: sha256(removed),
        workingTreeSizeInBytes: removed.length,
      },
      {
        relativePath: 'kept.bin',
        text: keptText,
        workingTreeState: 'materialized',
        metadataSource: 'index',
        workingTreeSha256: sha256(kept),
        workingTreeSizeInBytes: kept.length,
      },
    ])

    const result = await removeCheapLfsOciFile(
      publicContext(root),
      'removed.bin',
      { runtime, fileSystem }
    )

    assert.equal(result.removed, true)
    await assert.rejects(
      stat(removedPath),
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
    )
    assert.deepEqual(await readFile(keptPath), kept)
    assert.deepEqual(result.commitPaths, ['removed.bin'])
  })

  it('recovers mixed immutable pointer generations into one image', async () => {
    const root = await temporaryRepository()
    const first = Buffer.from('first generation')
    const second = Buffer.from('second generation')
    const added = Buffer.from('added generation')
    const firstSource = join(root, 'first-source.bin')
    const secondSource = join(root, 'second-source.bin')
    await writeFile(firstSource, first)
    await writeFile(secondSource, second)
    const firstImage = await capturePublicImage([
      { path: firstSource, bytes: first },
    ])
    const secondImage = await capturePublicImage([
      { path: secondSource, bytes: second },
    ])
    await writeFile(
      join(root, 'first.bin'),
      serializeCheapLfsGhcrPointer(
        pointerFor(
          firstImage.validated.snapshot,
          firstImage.immutableReference,
          sha256(first)
        )
      )
    )
    await writeFile(
      join(root, 'second.bin'),
      serializeCheapLfsGhcrPointer(
        pointerFor(
          secondImage.validated.snapshot,
          secondImage.immutableReference,
          sha256(second)
        )
      )
    )
    await writeFile(join(root, 'added.bin'), added)
    const runtime = new FakeRuntime(async request => {
      assert.equal(request.image.snapshot.objects.length, 3)
      assert.equal(request.image.layers.filter(layer => layer.reused).length, 2)
      return publishResult(request)
    })
    runtime.pulled.set(firstImage.immutableReference, firstImage.validated)
    runtime.pulled.set(secondImage.immutableReference, secondImage.validated)

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'added.bin' }],
      { runtime }
    )

    assert.equal(result.failures.length, 0)
    assert.deepEqual(result.commitPaths, [
      'first.bin',
      'second.bin',
      'added.bin',
    ])
    assert.equal(new Set(result.files.map(file => file.pointerText)).size, 3)
    assert.equal(
      new Set(
        result.files.map(
          file => parseCheapLfsGhcrPointer(file.pointerText)?.image
        )
      ).size,
      1
    )
  })

  it('halves timed-out chunks, re-prepares, and makes retries sequential', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('adaptive upload')
    await writeFile(join(root, 'adaptive.bin'), bytes)
    const maximums: number[] = []
    const parallel: boolean[] = []
    const runtime = new FakeRuntime(async request => {
      maximums.push(request.image.maximumChunkBytes)
      parallel.push(request.parallelBlobUploads)
      if (maximums.length === 1) {
        throw new CheapLfsGhcrLayerUploadTimeoutError(
          sha256(bytes),
          request.image.layers[0].descriptor.digest,
          request.image.maximumChunkBytes,
          getNextCheapLfsGhcrChunkBytes(request.image.maximumChunkBytes)
        )
      }
      return publishResult(request)
    })

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'adaptive.bin' }],
      { runtime }
    )

    assert.deepEqual(maximums, [
      CheapLfsGhcrMaximumChunkBytes,
      Math.floor(CheapLfsGhcrMaximumChunkBytes / 2),
    ])
    assert.deepEqual(parallel, [true, false])
    assert.equal(result.attempts, 2)
    assert.equal(result.failures.length, 0)
  })

  it('reuses a fully uploaded private object after another object times out', async () => {
    const root = await temporaryRepository()
    const completedBytes = Buffer.from('completed encrypted object')
    const timedOutBytes = Buffer.from('timed out encrypted object')
    await Promise.all([
      writeFile(join(root, 'completed.bin'), completedBytes),
      writeFile(join(root, 'timeout.bin'), timedOutBytes),
    ])
    const completedSha256 = sha256(completedBytes)
    const timedOutSha256 = sha256(timedOutBytes)
    let completedChunks:
      | ICheapLfsGhcrSnapshot['objects'][number]['chunks']
      | undefined
    let timedOutChunks:
      | ICheapLfsGhcrSnapshot['objects'][number]['chunks']
      | undefined
    const runtime = new FakeRuntime(async request => {
      const completedObject = request.image.snapshot.objects.find(
        object => object.sha256 === completedSha256
      )!
      const timedOutObject = request.image.snapshot.objects.find(
        object => object.sha256 === timedOutSha256
      )!
      if (runtime.publishRequests.length === 1) {
        completedChunks = completedObject.chunks
        timedOutChunks = timedOutObject.chunks
        const timedOutLayer = request.image.layers.find(
          layer => layer.object.sha256 === timedOutSha256
        )!
        throw new CheapLfsGhcrLayerUploadTimeoutError(
          timedOutSha256,
          timedOutLayer.descriptor.digest,
          request.image.maximumChunkBytes,
          getNextCheapLfsGhcrChunkBytes(request.image.maximumChunkBytes),
          [completedSha256]
        )
      }
      assert.deepEqual(completedObject.chunks, completedChunks)
      assert.equal(
        request.image.layers
          .filter(layer => layer.object.sha256 === completedSha256)
          .every(layer => layer.reused && layer.localPath === null),
        true
      )
      assert.equal(
        request.image.layers
          .filter(layer => layer.object.sha256 === timedOutSha256)
          .every(layer => !layer.reused && layer.localPath !== null),
        true
      )
      assert.notDeepEqual(timedOutObject.chunks, timedOutChunks)
      assert.notEqual(
        timedOutObject.chunks[0].blob.digest,
        timedOutChunks?.[0].blob.digest
      )
      assert.notEqual(
        timedOutObject.chunks[0].encryption?.nonce,
        timedOutChunks?.[0].encryption?.nonce
      )
      assert.notEqual(
        timedOutObject.chunks[0].encryption?.salt,
        timedOutChunks?.[0].encryption?.salt
      )
      return publishResult(request)
    })

    const result = await pinCheapLfsFilesToOci(
      privateContext(root),
      [{ relativePath: 'completed.bin' }, { relativePath: 'timeout.bin' }],
      { runtime }
    )

    assert.equal(result.failures.length, 0)
    assert.equal(result.attempts, 2)
    assert.equal(runtime.publishRequests.length, 2)
  })

  it('stops at the core retry floor and never replaces a source on failure', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('always timeout')
    const path = join(root, 'timeout.bin')
    await writeFile(path, bytes)
    const runtime = new FakeRuntime(async request => {
      throw new CheapLfsGhcrLayerUploadTimeoutError(
        sha256(bytes),
        request.image.layers[0].descriptor.digest,
        request.image.maximumChunkBytes,
        getNextCheapLfsGhcrChunkBytes(request.image.maximumChunkBytes)
      )
    })

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'timeout.bin' }],
      { runtime }
    )

    assert.equal(
      runtime.publishRequests.length,
      CheapLfsGhcrMaximumAdaptivePrepareAttempts
    )
    assert.deepEqual(await readFile(path), bytes)
    assert.equal(result.published, false)
    assert.equal(result.failures.length, 1)
  })

  it('keeps all local inputs untouched when publish fails', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('publish failure')
    const path = join(root, 'failure.bin')
    await writeFile(path, bytes)
    const runtime = new FakeRuntime(async () => {
      throw new Error('registry unavailable')
    })

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'failure.bin' }],
      { runtime }
    )

    assert.deepEqual(await readFile(path), bytes)
    assert.equal(result.published, false)
    assert.equal(result.commitPaths.length, 0)
    assert.match(result.failures[0].message, /registry unavailable/)
  })

  it('rechecks raw bytes immediately before replacing them with an OCI pointer', async () => {
    const root = await temporaryRepository()
    const original = Buffer.from('uploaded generation')
    const lateEdit = Buffer.from('edited after the batch verification')
    const path = join(root, 'late-edit.bin')
    await writeFile(path, original)
    const baseFileSystem = inventoryFileSystem([])
    let targetHashReads = 0
    let pointerWrites = 0
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      hashFile: async (candidate, signal) => {
        const current = await baseFileSystem.hashFile(candidate, signal)
        if (candidate === path && ++targetHashReads === 2) {
          await writeFile(path, lateEdit)
        }
        return current
      },
      writePointer: async (candidate, text) => {
        pointerWrites++
        await baseFileSystem.writePointer(candidate, text)
      },
    }

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'late-edit.bin' }],
      { runtime: new FakeRuntime(), fileSystem }
    )

    assert.equal(result.published, true)
    assert.equal(pointerWrites, 0)
    assert.deepEqual(result.commitPaths, [])
    assert.deepEqual(await readFile(path), lateEdit)
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0].message, /source changed/)
  })

  it('commits only successful pointer writes and leaves a failed raw retryable', async () => {
    const root = await temporaryRepository()
    const completed = Buffer.from('completed local pointer mutation')
    const retry = Buffer.from('retry this raw after a partial temp write')
    const completedPath = join(root, 'completed-local.bin')
    const retryPath = join(root, 'retry-local.bin')
    await writeFile(completedPath, completed)
    await writeFile(retryPath, retry)
    const baseFileSystem = inventoryFileSystem([])
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      writePointer: (candidate, text) =>
        candidate === retryPath
          ? writeCheapLfsPointerAtomically(
              candidate,
              text,
              async temporaryFile => {
                await temporaryFile.writeFile(text.slice(0, 24), 'utf8')
                throw new Error('simulated partial pointer temp write')
              }
            )
          : baseFileSystem.writePointer(candidate, text),
    }

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [
        { relativePath: 'completed-local.bin' },
        { relativePath: 'retry-local.bin' },
      ],
      { runtime: new FakeRuntime(), fileSystem }
    )

    assert.equal(result.published, true)
    assert.deepEqual(result.commitPaths, ['completed-local.bin'])
    assert.deepEqual(
      result.files.map(file => file.relativePath),
      ['completed-local.bin']
    )
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0].message, /partial pointer temp write/)
    assert.ok(parseCheapLfsGhcrPointer(await readFile(completedPath, 'utf8')))
    assert.deepEqual(await readFile(retryPath), retry)

    const retried = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'retry-local.bin' }],
      {
        runtime: new FakeRuntime(),
        fileSystem: inventoryFileSystem([]),
      }
    )
    assert.equal(retried.published, true)
    assert.deepEqual(retried.commitPaths, ['retry-local.bin'])
    assert.ok(parseCheapLfsGhcrPointer(await readFile(retryPath, 'utf8')))
  })

  it('recognizes an exact pointer installed before the write reported failure', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('write completed before error')
    const path = join(root, 'completed-before-error.bin')
    await writeFile(path, bytes)
    const baseFileSystem = inventoryFileSystem([])
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      writePointer: async (candidate, text) => {
        await baseFileSystem.writePointer(candidate, text)
        throw new Error('late filesystem completion error')
      },
    }

    const result = await pinCheapLfsFilesToOci(
      publicContext(root),
      [{ relativePath: 'completed-before-error.bin' }],
      { runtime: new FakeRuntime(), fileSystem }
    )

    assert.equal(result.failures.length, 0)
    assert.deepEqual(result.commitPaths, ['completed-before-error.bin'])
    assert.equal(result.files[0].changed, true)
    assert.ok(parseCheapLfsGhcrPointer(await readFile(path, 'utf8')))
  })

  it('creates and reports the tracked private key only with a successful encrypted publish', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('private payload')
    await writeFile(join(root, 'private.bin'), bytes)
    const runtime = new FakeRuntime(async request => {
      assert.equal(request.visibility, 'private')
      assert.equal(request.keyCreated, true)
      assert.equal(request.keyRelativePath, CheapLfsRegistryRepositoryKeyPath)
      assert.equal(
        request.image.layers.every(layer => layer.chunk.encryption !== null),
        true
      )
      return publishResult(request)
    })

    const result = await pinCheapLfsFilesToOci(
      privateContext(root),
      [{ relativePath: 'private.bin' }],
      { runtime }
    )

    assert.equal(result.keyCreated, true, JSON.stringify(result.failures))
    assert.equal(result.keyCommitPath, CheapLfsRegistryRepositoryKeyPath)
    assert.deepEqual(result.commitPaths, [
      'private.bin',
      CheapLfsRegistryRepositoryKeyPath,
    ])
    assert.equal(
      (await stat(join(root, CheapLfsRegistryRepositoryKeyPath))).isFile(),
      true
    )
  })

  it('removes a newly created private key when the first publish fails', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('private failure')
    const path = join(root, 'private-failure.bin')
    await writeFile(path, bytes)
    const runtime = new FakeRuntime(async () => {
      throw new Error('denied')
    })

    const result = await pinCheapLfsFilesToOci(
      privateContext(root),
      [{ relativePath: 'private-failure.bin' }],
      { runtime }
    )

    await assert.rejects(
      stat(join(root, CheapLfsRegistryRepositoryKeyPath)),
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
    )
    assert.deepEqual(await readFile(path), bytes)
    assert.equal(result.published, false)
  })

  it('retains and reports a concurrently replaced key after first publish failure', async () => {
    const root = await temporaryRepository()
    await writeFile(join(root, 'private-race.bin'), 'private race')
    const replacement = Buffer.alloc(32, 0x5d)
    const replacementText = `desktop-material-cheap-lfs-registry-key-v1\n${replacement.toString(
      'base64url'
    )}\n`
    const keyPath = join(root, CheapLfsRegistryRepositoryKeyPath)
    const runtime = new FakeRuntime(async () => {
      await rm(keyPath)
      await writeFile(keyPath, replacementText)
      throw new Error('publish denied after replacement')
    })

    await assert.rejects(
      pinCheapLfsFilesToOci(
        privateContext(root),
        [{ relativePath: 'private-race.bin' }],
        { runtime }
      ),
      /replaced concurrently.*retained/i
    )
    assert.equal(await readFile(keyPath, 'utf8'), replacementText)
    replacement.fill(0)
  })

  it('retains an unreferenced new key when every post-publish pointer write fails', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('private raw remains retryable')
    const path = join(root, 'private-local-failure.bin')
    await writeFile(path, bytes)
    const baseFileSystem = inventoryFileSystem([])
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      writePointer: (candidate, text) =>
        writeCheapLfsPointerAtomically(candidate, text, async temporaryFile => {
          await temporaryFile.writeFile(text.slice(0, 16), 'utf8')
          throw new Error('private pointer write failed')
        }),
    }

    const result = await pinCheapLfsFilesToOci(
      privateContext(root),
      [{ relativePath: 'private-local-failure.bin' }],
      { runtime: new FakeRuntime(), fileSystem }
    )

    assert.equal(result.published, true)
    assert.equal(result.keyCreated, true)
    assert.equal(result.keyCommitPath, CheapLfsRegistryRepositoryKeyPath)
    assert.deepEqual(result.commitPaths, [])
    assert.deepEqual(await readFile(path), bytes)
    assert.equal(
      (await stat(join(root, CheapLfsRegistryRepositoryKeyPath))).isFile(),
      true
    )

    const retried = await pinCheapLfsFilesToOci(
      privateContext(root),
      [{ relativePath: 'private-local-failure.bin' }],
      {
        runtime: new FakeRuntime(),
        fileSystem: inventoryFileSystem([]),
      }
    )
    assert.equal(retried.keyCreated, false)
    assert.deepEqual(retried.commitPaths, [
      'private-local-failure.bin',
      CheapLfsRegistryRepositoryKeyPath,
    ])
  })

  it('never deletes a concurrent key replacement after a successful unreferenced publish', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('private replacement race raw')
    const path = join(root, 'private-local-key-race.bin')
    await writeFile(path, bytes)
    const replacement = Buffer.alloc(32, 0x3c)
    const replacementText = `desktop-material-cheap-lfs-registry-key-v1\n${replacement.toString(
      'base64url'
    )}\n`
    const keyPath = join(root, CheapLfsRegistryRepositoryKeyPath)
    const baseFileSystem = inventoryFileSystem([])
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      writePointer: async () => {
        await rm(keyPath)
        await writeFile(keyPath, replacementText)
        throw new Error('pointer write stopped after key replacement')
      },
    }

    const result = await pinCheapLfsFilesToOci(
      privateContext(root),
      [{ relativePath: 'private-local-key-race.bin' }],
      { runtime: new FakeRuntime(), fileSystem }
    )

    assert.equal(result.published, true)
    assert.deepEqual(result.commitPaths, [])
    assert.deepEqual(await readFile(path), bytes)
    assert.equal(await readFile(keyPath, 'utf8'), replacementText)
    replacement.fill(0)
  })

  it('pulls by immutable pointer, resolves its key id, and atomically materializes private bytes', async () => {
    const root = await temporaryRepository()
    const keyResult = await resolveCheapLfsGhcrRepositoryKey({
      repositoryPath: root,
      visibility: 'verified-private',
      createIfMissing: true,
    })
    const key = Buffer.from(keyResult.key!)
    keyResult.key!.fill(0)
    const bytes = Buffer.from('restore my encrypted bytes')
    const sourcePath = join(root, 'private-source.bin')
    const destinationPath = join(root, 'restored.bin')
    await writeFile(sourcePath, bytes)

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'private',
        desiredObjects: [
          {
            sha256: sha256(bytes),
            sizeInBytes: bytes.length,
            sourcePath,
          },
        ],
        encryptionKey: key,
      },
      async image => {
        const immutableReference = `${registryRepository}@${image.manifestDescriptor.digest}`
        const pointerText = serializeCheapLfsGhcrPointer(
          pointerFor(image.snapshot, immutableReference, sha256(bytes))
        )
        await writeFile(destinationPath, pointerText)
        const validated: ICheapLfsGhcrValidatedImage = {
          immutableReference,
          sourceRepositoryUrl,
          snapshot: image.snapshot,
          manifestDescriptor: image.manifestDescriptor,
          configDescriptor: image.configDescriptor,
          blobPaths: new Map(
            image.layers.map(layer => [
              layer.descriptor.digest,
              layer.localPath!,
            ])
          ),
        }
        const runtime = new FakeRuntime()
        runtime.pulled.set(immutableReference, validated)

        const result = await materializeCheapLfsOciFile(
          privateContext(root),
          'restored.bin',
          { runtime }
        )

        assert.equal(result.objectSha256, sha256(bytes))
        assert.deepEqual(await readFile(destinationPath), bytes)
      }
    )
    key.fill(0)
  })

  it('refuses an OCI restore redirected through an outside junction', async () => {
    const root = await temporaryRepository()
    const outside = await temporaryRepository()
    const outsidePath = join(outside, 'outside.pointer')
    const outsideText = 'outside data must not be replaced'
    await writeFile(outsidePath, outsideText, 'utf8')
    await symlink(
      outside,
      join(root, 'redirect'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )

    await assert.rejects(
      materializeCheapLfsOciFile(
        publicContext(root),
        'redirect/outside.pointer',
        { runtime: new FakeRuntime() }
      ),
      /symlink or junction/
    )
    assert.equal(await readFile(outsidePath, 'utf8'), outsideText)
  })

  it('refuses an OCI restore whose final pointer is a symlink', async t => {
    const root = await temporaryRepository()
    const outside = await temporaryRepository()
    const outsidePath = join(outside, 'outside.pointer')
    const outsideText = 'outside pointer must not be replaced'
    await writeFile(outsidePath, outsideText, 'utf8')
    try {
      await symlink(outsidePath, join(root, 'linked.pointer'), 'file')
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

    await assert.rejects(
      materializeCheapLfsOciFile(publicContext(root), 'linked.pointer', {
        runtime: new FakeRuntime(),
      }),
      /symlink, junction, or linked file/
    )
    assert.equal(await readFile(outsidePath, 'utf8'), outsideText)
  })

  it('publishes the remaining full snapshot before deleting and rewriting pointers', async () => {
    const root = await temporaryRepository()
    const first = Buffer.from('remove this')
    const second = Buffer.from('keep this')
    const firstSource = join(root, 'remove-source.bin')
    const secondSource = join(root, 'keep-source.bin')
    await writeFile(firstSource, first)
    await writeFile(secondSource, second)
    const oldImage = await capturePublicImage([
      { path: firstSource, bytes: first },
      { path: secondSource, bytes: second },
    ])
    const removePath = join(root, 'remove.bin')
    const keepPath = join(root, 'keep.bin')
    const removeText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(first)
      )
    )
    const keepText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(second)
      )
    )
    await writeFile(removePath, removeText)
    await writeFile(keepPath, keepText)
    const runtime = new FakeRuntime(async request => {
      assert.equal(request.image.snapshot.objects.length, 1)
      assert.equal(request.image.snapshot.objects[0].sha256, sha256(second))
      assert.equal(
        request.image.layers.every(layer => layer.reused),
        true
      )
      assert.equal(await readFile(removePath, 'utf8'), removeText)
      assert.equal(await readFile(keepPath, 'utf8'), keepText)
      return publishResult(request)
    })
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await removeCheapLfsOciFile(
      publicContext(root),
      'remove.bin',
      { runtime }
    )

    assert.equal(result.removed, true)
    await assert.rejects(
      stat(removePath),
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
    )
    assert.notEqual(await readFile(keepPath, 'utf8'), keepText)
    assert.deepEqual(result.commitPaths, ['remove.bin', 'keep.bin'])
  })

  it('does not delete or rewrite any pointer when removal publish fails', async () => {
    const root = await temporaryRepository()
    const first = Buffer.from('remove failure one')
    const second = Buffer.from('remove failure two')
    const firstSource = join(root, 'one-source.bin')
    const secondSource = join(root, 'two-source.bin')
    await writeFile(firstSource, first)
    await writeFile(secondSource, second)
    const oldImage = await capturePublicImage([
      { path: firstSource, bytes: first },
      { path: secondSource, bytes: second },
    ])
    const firstText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(first)
      )
    )
    const secondText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(second)
      )
    )
    await writeFile(join(root, 'one.bin'), firstText)
    await writeFile(join(root, 'two.bin'), secondText)
    const runtime = new FakeRuntime(async () => {
      throw new Error('publish failed before mutation')
    })
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await removeCheapLfsOciFile(publicContext(root), 'one.bin', {
      runtime,
    })

    assert.equal(result.removed, false)
    assert.equal(await readFile(join(root, 'one.bin'), 'utf8'), firstText)
    assert.equal(await readFile(join(root, 'two.bin'), 'utf8'), secondText)
    assert.equal(result.commitPaths.length, 0)
  })

  it('keeps a failed materialized removal raw and every survivor unchanged', async () => {
    const root = await temporaryRepository()
    const removed = Buffer.from('materialized removal must survive failure')
    const kept = Buffer.from('pointer survivor during failed removal')
    const removedSource = join(root, 'materialized-remove-source.bin')
    const keptSource = join(root, 'materialized-keep-source.bin')
    await writeFile(removedSource, removed)
    await writeFile(keptSource, kept)
    const oldImage = await capturePublicImage([
      { path: removedSource, bytes: removed },
      { path: keptSource, bytes: kept },
    ])
    const removedText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(removed)
      )
    )
    const keptText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(kept)
      )
    )
    const removedPath = join(root, 'materialized-remove.bin')
    const keptPath = join(root, 'materialized-keep.bin')
    await writeFile(removedPath, removed)
    await writeFile(keptPath, keptText)
    const baseFileSystem = inventoryFileSystem([
      {
        relativePath: 'materialized-remove.bin',
        text: removedText,
        workingTreeState: 'materialized',
        metadataSource: 'index',
        workingTreeSha256: sha256(removed),
        workingTreeSizeInBytes: removed.length,
      },
      {
        relativePath: 'materialized-keep.bin',
        text: keptText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
    ])
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      removeFile: async () => {
        throw new Error('local deletion denied')
      },
    }
    const runtime = new FakeRuntime()
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await removeCheapLfsOciFile(
      publicContext(root),
      'materialized-remove.bin',
      { runtime, fileSystem }
    )

    assert.equal(result.published, true)
    assert.equal(result.removed, false)
    assert.deepEqual(result.commitPaths, [])
    assert.deepEqual(await readFile(removedPath), removed)
    assert.equal(await readFile(keptPath, 'utf8'), keptText)
    assert.match(result.failures[0].message, /deletion denied/)
  })

  it('commits a completed deletion even when unlink reports a late error', async () => {
    const root = await temporaryRepository()
    const removed = Buffer.from('late unlink completion')
    const kept = Buffer.from('survivor after late unlink completion')
    const removedSource = join(root, 'late-unlink-source.bin')
    const keptSource = join(root, 'late-unlink-keep-source.bin')
    await writeFile(removedSource, removed)
    await writeFile(keptSource, kept)
    const oldImage = await capturePublicImage([
      { path: removedSource, bytes: removed },
      { path: keptSource, bytes: kept },
    ])
    const removedText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(removed)
      )
    )
    const keptText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(kept)
      )
    )
    const removedPath = join(root, 'late-unlink.bin')
    const keptPath = join(root, 'late-unlink-keep.bin')
    await writeFile(removedPath, removedText)
    await writeFile(keptPath, keptText)
    const baseFileSystem = inventoryFileSystem([
      {
        relativePath: 'late-unlink.bin',
        text: removedText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
      {
        relativePath: 'late-unlink-keep.bin',
        text: keptText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
    ])
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      removeFile: async candidate => {
        await baseFileSystem.removeFile(candidate)
        throw new Error('late unlink completion error')
      },
    }
    const runtime = new FakeRuntime()
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await removeCheapLfsOciFile(
      publicContext(root),
      'late-unlink.bin',
      { runtime, fileSystem }
    )

    assert.equal(result.removed, true)
    assert.equal(result.failures.length, 0)
    assert.deepEqual(result.commitPaths, [
      'late-unlink.bin',
      'late-unlink-keep.bin',
    ])
    await assert.rejects(
      stat(removedPath),
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
    )
    assert.notEqual(await readFile(keptPath, 'utf8'), keptText)
  })

  it('keeps a failed survivor on its old immutable generation after removal', async () => {
    const root = await temporaryRepository()
    const removed = Buffer.from('remove before survivor rewrite failure')
    const kept = Buffer.from('keep old immutable pointer on failure')
    const removedSource = join(root, 'partial-remove-source.bin')
    const keptSource = join(root, 'partial-remove-keep-source.bin')
    await writeFile(removedSource, removed)
    await writeFile(keptSource, kept)
    const oldImage = await capturePublicImage([
      { path: removedSource, bytes: removed },
      { path: keptSource, bytes: kept },
    ])
    const removedText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(removed)
      )
    )
    const keptText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(kept)
      )
    )
    const removedPath = join(root, 'partial-remove.bin')
    const keptPath = join(root, 'partial-remove-keep.bin')
    await writeFile(removedPath, removedText)
    await writeFile(keptPath, keptText)
    const baseFileSystem = inventoryFileSystem([
      {
        relativePath: 'partial-remove.bin',
        text: removedText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
      {
        relativePath: 'partial-remove-keep.bin',
        text: keptText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
    ])
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      writePointer: (candidate, text) =>
        writeCheapLfsPointerAtomically(candidate, text, async temporaryFile => {
          await temporaryFile.writeFile(text.slice(0, 20), 'utf8')
          throw new Error('survivor pointer temp write failed')
        }),
    }
    const runtime = new FakeRuntime()
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await removeCheapLfsOciFile(
      publicContext(root),
      'partial-remove.bin',
      { runtime, fileSystem }
    )

    assert.equal(result.removed, true)
    assert.deepEqual(result.commitPaths, ['partial-remove.bin'])
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0].message, /pointer temp write failed/)
    assert.equal(await readFile(keptPath, 'utf8'), keptText)
    assert.equal(
      parseCheapLfsGhcrPointer(keptText)?.image,
      oldImage.immutableReference
    )
    await assert.rejects(
      stat(removedPath),
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
    )
  })

  it('rechecks a pointer immediately before removing it', async () => {
    const root = await temporaryRepository()
    const removed = Buffer.from('remove race object')
    const kept = Buffer.from('remove race survivor')
    const removedSource = join(root, 'remove-race-source.bin')
    const keptSource = join(root, 'remove-race-survivor-source.bin')
    await writeFile(removedSource, removed)
    await writeFile(keptSource, kept)
    const oldImage = await capturePublicImage([
      { path: removedSource, bytes: removed },
      { path: keptSource, bytes: kept },
    ])
    const removedText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(removed)
      )
    )
    const keptText = serializeCheapLfsGhcrPointer(
      pointerFor(
        oldImage.validated.snapshot,
        oldImage.immutableReference,
        sha256(kept)
      )
    )
    const removedPath = join(root, 'remove-race.bin')
    const keptPath = join(root, 'remove-race-survivor.bin')
    const lateEdit = 'user replacement after the batch verification\n'
    await writeFile(removedPath, removedText)
    await writeFile(keptPath, keptText)
    const baseFileSystem = inventoryFileSystem([
      {
        relativePath: 'remove-race.bin',
        text: removedText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
      {
        relativePath: 'remove-race-survivor.bin',
        text: keptText,
        workingTreeState: 'pointer',
        metadataSource: 'working-tree',
      },
    ])
    let targetPointerReads = 0
    let removeCalls = 0
    const fileSystem: ICheapLfsOciFileSystem = {
      ...baseFileSystem,
      readPointerText: async candidate => {
        const text = await baseFileSystem.readPointerText(candidate)
        if (candidate === removedPath && ++targetPointerReads === 1) {
          await writeFile(removedPath, lateEdit)
        }
        return text
      },
      removeFile: async candidate => {
        removeCalls++
        await baseFileSystem.removeFile(candidate)
      },
    }
    const runtime = new FakeRuntime()
    runtime.pulled.set(oldImage.immutableReference, oldImage.validated)

    const result = await removeCheapLfsOciFile(
      publicContext(root),
      'remove-race.bin',
      { runtime, fileSystem }
    )

    assert.equal(result.published, true)
    assert.equal(result.removed, false)
    assert.equal(removeCalls, 0)
    assert.deepEqual(result.commitPaths, [])
    assert.equal(await readFile(removedPath, 'utf8'), lateEdit)
    assert.equal(await readFile(keptPath, 'utf8'), keptText)
    assert.match(result.failures[0].message, /pointer changed/)
  })

  it('honors cancellation before any scan, upload, or local mutation', async () => {
    const root = await temporaryRepository()
    const bytes = Buffer.from('cancel me')
    const path = join(root, 'cancel.bin')
    await writeFile(path, bytes)
    const controller = new AbortController()
    controller.abort()
    const runtime = new FakeRuntime()

    await assert.rejects(
      pinCheapLfsFilesToOci(
        publicContext(root),
        [{ relativePath: 'cancel.bin' }],
        { runtime },
        controller.signal
      ),
      (error: Error) => error.name === 'AbortError'
    )
    assert.equal(runtime.publishRequests.length, 0)
    assert.deepEqual(await readFile(path), bytes)
  })
})
