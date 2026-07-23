import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  CheapLfsGhcrMaximumChunkBytes,
  withPreparedCheapLfsGhcrImage,
} from '../../../src/lib/cheap-lfs/ghcr-image'
import {
  CheapLfsGhcrLayerUploadTimeoutError,
  CheapLfsGhcrTransportError,
  ICheapLfsGhcrOrasRequest,
  ICheapLfsGhcrOrasRunner,
  getCheapLfsGhcrRetentionTag,
  getCheapLfsOciRegistryCapabilities,
  publishCheapLfsGhcrImage,
  withPulledCheapLfsGhcrObject,
} from '../../../src/lib/cheap-lfs/ghcr-oras-transport'
import {
  CHEAP_LFS_GHCR_POINTER_VERSION,
  parseCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'

const roots: string[] = []
const repositoryIdentity = 'github.com/repositories/987654'
const sourceRepositoryUrl = 'https://github.com/owner/package'
const token = Buffer.from('registry-token-fixture')

async function root() {
  const path = await mkdtemp(join(tmpdir(), 'cheap-lfs-oras-test-'))
  roots.push(path)
  return path
}

function sha256(value: Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

async function orasFixture(directory: string) {
  const path = join(directory, 'oras.exe')
  const bytes = Buffer.from('pinned ORAS fixture executable')
  await writeFile(path, bytes)
  return {
    path,
    digest: `sha256:${sha256(bytes)}`,
  }
}

class FakeRunner implements ICheapLfsGhcrOrasRunner {
  public readonly requests: Array<{
    readonly args: ReadonlyArray<string>
    readonly stdin: Buffer
  }> = []

  public constructor(
    private readonly operation: (
      request: ICheapLfsGhcrOrasRequest
    ) => Promise<void>
  ) {}

  public async run(request: ICheapLfsGhcrOrasRequest): Promise<void> {
    this.requests.push({
      args: [...request.args],
      stdin: Buffer.from(request.stdin),
    })
    await this.operation(request)
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(path => rm(path, { recursive: true, force: true }))
  )
})

describe('Cheap LFS ORAS registry transport', () => {
  it('publishes at most three files concurrently, retains the digest, then moves the stable tag', async () => {
    const directory = await root()
    const oras = await orasFixture(directory)
    const sources = await Promise.all(
      ['ab', 'cd', 'ef', 'gh'].map(async (text, index) => {
        const bytes = Buffer.from(text)
        const sourcePath = join(directory, `source-${index}.bin`)
        await writeFile(sourcePath, bytes)
        return { bytes, sourcePath }
      })
    )

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        desiredObjects: sources.map(source => ({
          sha256: sha256(source.bytes),
          sizeInBytes: source.bytes.length,
          sourcePath: source.sourcePath,
        })),
        maximumChunkBytes: 1,
      },
      async image => {
        const controller = new AbortController()
        const order: string[] = []
        let active = 0
        let maximumActive = 0
        const activeObjects = new Set<string>()
        const activeLaneSnapshots: ReadonlyArray<string>[] = []
        const activeByteSnapshots = new Array<
          ReadonlyArray<{
            readonly processedBytes: number
            readonly totalBytes: number
          }>
        >()
        const completedObjectSnapshots: number[] = []
        const chunkOrder = new Map<string, number[]>()
        const runner = new FakeRunner(async request => {
          const [group, command] = request.args
          const isObjectPush =
            group === 'blob' &&
            command === 'push' &&
            request.args[request.args.length - 1].includes('object-')
          if (isObjectPush) {
            const path = request.args[request.args.length - 1]
            const match = /object-(\d+)-chunk-(\d+)/.exec(path)
            assert.ok(match)
            const object = match[1]
            const chunk = Number(match[2])
            assert.equal(activeObjects.has(object), false)
            activeObjects.add(object)
            active++
            maximumActive = Math.max(maximumActive, active)
            await new Promise(resolve => setTimeout(resolve, 15))
            chunkOrder.set(object, [...(chunkOrder.get(object) ?? []), chunk])
            active--
            activeObjects.delete(object)
          }
          if (group === 'manifest' && command === 'fetch') {
            const output = request.args[request.args.indexOf('--output') + 1]
            await copyFile(image.manifestPath, output)
          }
          if (group === 'tag') {
            order.push(request.args[request.args.length - 1])
          }
        })

        const result = await publishCheapLfsGhcrImage({
          image,
          registryRepository: 'docker.io/owner/package',
          orasExecutablePath: oras.path,
          orasExecutableSha256: oras.digest,
          credentials: { username: 'test_user', token },
          parallelBlobUploads: true,
          keyCreated: false,
          keyRelativePath: null,
          signal: controller.signal,
          runner,
          packagePolicyVerifier: {
            async verify(request) {
              assert.equal(request.signal, controller.signal)
              order.push('policy')
              return {
                provider: request.provider,
                repositoryIdentity: request.repositoryIdentity,
                sourceRepositoryUrl: request.sourceRepositoryUrl,
                registryRepository: request.registryRepository,
                visibility: request.visibility,
                sourceRepositoryAccessVerified: true,
                registryVisibilityVerified: true,
              }
            },
          },
          onProgress: progress => {
            activeLaneSnapshots.push(progress.activeObjectSha256s ?? [])
            activeByteSnapshots.push(progress.activeObjects ?? [])
            completedObjectSnapshots.push(progress.completedObjects)
            assert.equal(
              progress.completedObjects <= progress.totalObjects,
              true
            )
          },
        })

        assert.equal(result.provider, 'docker-hub')
        assert.equal(maximumActive, 3)
        assert.equal(
          activeLaneSnapshots.some(snapshot => snapshot.length === 3),
          true
        )
        assert.equal(
          activeLaneSnapshots.every(snapshot => snapshot.length <= 3),
          true
        )
        assert.equal(
          activeByteSnapshots.some(snapshot =>
            snapshot.some(
              progress =>
                progress.processedBytes === 1 && progress.totalBytes === 2
            )
          ),
          true
        )
        assert.equal(Math.max(...completedObjectSnapshots), 4)
        assert.equal(chunkOrder.size, 4)
        for (const chunks of chunkOrder.values()) {
          assert.deepEqual(chunks, [0, 1])
        }
        const retentionTag = getCheapLfsGhcrRetentionTag(
          image.manifestDescriptor.digest
        )
        assert.deepEqual(order, [
          retentionTag,
          'policy',
          'desktop-material-cheap-lfs-v1',
        ])
        assert.equal(retentionTag.length <= 128, true)
        assert.equal(result.pointers.length, 4)
        assert.equal(
          parseCheapLfsGhcrPointer(result.pointers[0].text)?.image,
          result.immutableReference
        )
        assert.equal(
          result.taggedReference,
          'docker.io/owner/package:desktop-material-cheap-lfs-v1'
        )
        for (const request of runner.requests) {
          assert.equal(request.args.join(' ').includes(token.toString()), false)
          assert.deepEqual(request.stdin, Buffer.from(`${token.toString()}\n`))
          assert.ok(request.args.includes('--password-stdin'))
          assert.equal(request.args.includes('--insecure'), false)
          assert.equal(request.args.includes('--plain-http'), false)
        }
      }
    )
  })

  it('reports repeated deduplicated chunks as their full logical file size', async () => {
    const directory = await root()
    const oras = await orasFixture(directory)
    const bytes = Buffer.from('ABAB')
    const sourcePath = join(directory, 'repeated.bin')
    await writeFile(sourcePath, bytes)

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        desiredObjects: [
          {
            sha256: sha256(bytes),
            sizeInBytes: bytes.length,
            sourcePath,
          },
        ],
        maximumChunkBytes: 2,
      },
      async image => {
        const objectPushes: string[] = []
        const snapshots = new Array<
          ReadonlyArray<{
            readonly objectSha256: string
            readonly processedBytes: number
            readonly totalBytes: number
          }>
        >()
        const runner = new FakeRunner(async request => {
          const [group, command] = request.args
          const path = request.args[request.args.length - 1]
          if (
            group === 'blob' &&
            command === 'push' &&
            path.includes('object-')
          ) {
            objectPushes.push(path)
          }
          if (group === 'manifest' && command === 'fetch') {
            const output = request.args[request.args.indexOf('--output') + 1]
            await copyFile(image.manifestPath, output)
          }
        })

        await publishCheapLfsGhcrImage({
          image,
          registryRepository: 'docker.io/owner/package',
          orasExecutablePath: oras.path,
          orasExecutableSha256: oras.digest,
          credentials: { username: 'test_user', token },
          parallelBlobUploads: true,
          keyCreated: false,
          keyRelativePath: null,
          runner,
          packagePolicyVerifier: {
            async verify(request) {
              return {
                provider: request.provider,
                repositoryIdentity: request.repositoryIdentity,
                sourceRepositoryUrl: request.sourceRepositoryUrl,
                registryRepository: request.registryRepository,
                visibility: request.visibility,
                sourceRepositoryAccessVerified: true,
                registryVisibilityVerified: true,
              }
            },
          },
          onProgress: progress => snapshots.push(progress.activeObjects ?? []),
        })

        assert.equal(objectPushes.length, 1)
        assert.equal(
          snapshots.some(snapshot =>
            snapshot.some(
              progress =>
                progress.objectSha256 === sha256(bytes) &&
                progress.processedBytes === bytes.length &&
                progress.totalBytes === bytes.length
            )
          ),
          true
        )
      }
    )
  })

  it('refuses to move the stable tag when the retention tag is ambiguous', async () => {
    const directory = await root()
    const oras = await orasFixture(directory)
    const bytes = Buffer.from('retention verification')
    const sourcePath = join(directory, 'retention.bin')
    await writeFile(sourcePath, bytes)

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        desiredObjects: [
          {
            sha256: sha256(bytes),
            sizeInBytes: bytes.length,
            sourcePath,
          },
        ],
      },
      async image => {
        const retentionTag = getCheapLfsGhcrRetentionTag(
          image.manifestDescriptor.digest
        )
        const movedTags: string[] = []
        const runner = new FakeRunner(async request => {
          if (request.args[0] === 'tag') {
            movedTags.push(request.args[request.args.length - 1])
          }
          if (request.args[0] === 'manifest' && request.args[1] === 'fetch') {
            const output = request.args[request.args.indexOf('--output') + 1]
            const reference = request.args[request.args.length - 1]
            if (reference.endsWith(`:${retentionTag}`)) {
              await writeFile(output, Buffer.from('wrong manifest'))
            } else {
              await copyFile(image.manifestPath, output)
            }
          }
        })

        await assert.rejects(
          publishCheapLfsGhcrImage({
            image,
            registryRepository: 'ghcr.io/owner/package',
            orasExecutablePath: oras.path,
            orasExecutableSha256: oras.digest,
            credentials: { username: 'test-user', token },
            parallelBlobUploads: false,
            keyCreated: false,
            keyRelativePath: null,
            runner,
            packagePolicyVerifier: {
              async verify() {
                assert.fail(
                  'policy must not run before the retention tag is verified'
                )
              },
            },
          }),
          (error: unknown) =>
            error instanceof CheapLfsGhcrTransportError &&
            error.kind === 'integrity'
        )
        assert.deepEqual(movedTags, [retentionTag])
      }
    )
  })

  it('derives one canonical and unique retention tag per manifest digest', () => {
    const first = getCheapLfsGhcrRetentionTag(`sha256:${'a'.repeat(64)}`)
    const second = getCheapLfsGhcrRetentionTag(`sha256:${'b'.repeat(64)}`)
    assert.notEqual(first, second)
    assert.match(first, /^[a-z0-9-]+$/)
    assert.equal(first.length <= 128, true)
    assert.throws(
      () => getCheapLfsGhcrRetentionTag(`sha256:${'A'.repeat(64)}`),
      CheapLfsGhcrTransportError
    )
  })

  it('turns a layer timeout into a deterministic half-size retry without tagging', async () => {
    const directory = await root()
    const oras = await orasFixture(directory)
    const bytes = Buffer.from('timeout object')
    const sourcePath = join(directory, 'source.bin')
    await writeFile(sourcePath, bytes)

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        desiredObjects: [
          {
            sha256: sha256(bytes),
            sizeInBytes: bytes.length,
            sourcePath,
          },
        ],
      },
      async image => {
        const commands: string[] = []
        const runner = new FakeRunner(async request => {
          commands.push(request.args.slice(0, 2).join(' '))
          if (
            request.args[0] === 'blob' &&
            request.args[1] === 'push' &&
            request.args[request.args.length - 1].includes('object-')
          ) {
            throw new CheapLfsGhcrTransportError(
              'process-timeout',
              'fixture timeout'
            )
          }
        })

        await assert.rejects(
          publishCheapLfsGhcrImage({
            image,
            registryRepository: 'ghcr.io/owner/package',
            orasExecutablePath: oras.path,
            orasExecutableSha256: oras.digest,
            credentials: { username: 'test-user', token },
            parallelBlobUploads: false,
            keyCreated: false,
            keyRelativePath: null,
            runner,
            packagePolicyVerifier: {
              async verify() {
                assert.fail('policy must not run after a layer timeout')
              },
            },
          }),
          (error: unknown) => {
            assert.ok(error instanceof CheapLfsGhcrLayerUploadTimeoutError)
            assert.equal(error.objectSha256, sha256(bytes))
            assert.equal(
              error.currentMaximumChunkBytes,
              CheapLfsGhcrMaximumChunkBytes
            )
            assert.equal(error.recommendedMaximumChunkBytes, 768 * 1024 * 1024)
            assert.deepEqual(error.completedObjectSha256s, [])
            return true
          }
        )
        assert.equal(
          commands.some(command => command.startsWith('tag')),
          false
        )
        assert.equal(commands.includes('manifest push'), false)
      }
    )
  })

  it('checkpoints whole files completed beside a timed-out file', async () => {
    const directory = await root()
    const oras = await orasFixture(directory)
    const completed = Buffer.from('completed')
    const timedOut = Buffer.from('timeout')
    const completedPath = join(directory, 'completed.bin')
    const timedOutPath = join(directory, 'timeout.bin')
    await Promise.all([
      writeFile(completedPath, completed),
      writeFile(timedOutPath, timedOut),
    ])

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        desiredObjects: [
          {
            sha256: sha256(completed),
            sizeInBytes: completed.length,
            sourcePath: completedPath,
          },
          {
            sha256: sha256(timedOut),
            sizeInBytes: timedOut.length,
            sourcePath: timedOutPath,
          },
        ],
      },
      async image => {
        const runner = new FakeRunner(async request => {
          const path = request.args[request.args.length - 1]
          if (path.includes('object-00000000-')) {
            await new Promise(resolve => setTimeout(resolve, 5))
          } else if (path.includes('object-00000001-')) {
            await new Promise(resolve => setTimeout(resolve, 20))
            throw new CheapLfsGhcrTransportError(
              'process-timeout',
              'fixture timeout'
            )
          }
        })

        await assert.rejects(
          publishCheapLfsGhcrImage({
            image,
            registryRepository: 'ghcr.io/owner/package',
            orasExecutablePath: oras.path,
            orasExecutableSha256: oras.digest,
            credentials: { username: 'test-user', token },
            parallelBlobUploads: true,
            keyCreated: false,
            keyRelativePath: null,
            runner,
            packagePolicyVerifier: {
              async verify() {
                assert.fail('policy must not run after a layer timeout')
              },
            },
          }),
          (error: unknown) => {
            assert.ok(error instanceof CheapLfsGhcrLayerUploadTimeoutError)
            assert.deepEqual(error.completedObjectSha256s, [sha256(completed)])
            return true
          }
        )
      }
    )
  })

  it('does not checkpoint a file whose deduplicated shared chunk never uploaded', async () => {
    const directory = await root()
    const oras = await orasFixture(directory)
    const failed = Buffer.from('FAILSHAR')
    const dependent = Buffer.from('SHARBBBB')
    const failedPath = join(directory, 'failed.bin')
    const dependentPath = join(directory, 'dependent.bin')
    await Promise.all([
      writeFile(failedPath, failed),
      writeFile(dependentPath, dependent),
    ])

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        desiredObjects: [
          {
            sha256: sha256(failed),
            sizeInBytes: failed.length,
            sourcePath: failedPath,
          },
          {
            sha256: sha256(dependent),
            sizeInBytes: dependent.length,
            sourcePath: dependentPath,
          },
        ],
        maximumChunkBytes: 4,
      },
      async image => {
        const failedDigest = `sha256:${sha256(Buffer.from('FAIL'))}`
        const sharedDigest = `sha256:${sha256(Buffer.from('SHAR'))}`
        const dependentDigest = `sha256:${sha256(Buffer.from('BBBB'))}`
        const uploaded = new Set<string>()
        const runner = new FakeRunner(async request => {
          const path = request.args[request.args.length - 1]
          if (
            request.args[0] !== 'blob' ||
            request.args[1] !== 'push' ||
            !path.includes('object-')
          ) {
            return
          }
          const reference = request.args.find(argument =>
            argument.includes('@sha256:')
          )
          assert.ok(reference)
          const digest = reference.slice(reference.indexOf('@') + 1)
          if (digest === failedDigest) {
            await new Promise(resolve => setTimeout(resolve, 20))
            throw new CheapLfsGhcrTransportError(
              'process-timeout',
              'fixture timeout'
            )
          }
          await new Promise(resolve => setTimeout(resolve, 5))
          uploaded.add(digest)
        })

        await assert.rejects(
          publishCheapLfsGhcrImage({
            image,
            registryRepository: 'ghcr.io/owner/package',
            orasExecutablePath: oras.path,
            orasExecutableSha256: oras.digest,
            credentials: { username: 'test-user', token },
            parallelBlobUploads: true,
            keyCreated: false,
            keyRelativePath: null,
            runner,
            packagePolicyVerifier: {
              async verify() {
                assert.fail('policy must not run after a layer timeout')
              },
            },
          }),
          (error: unknown) => {
            assert.ok(error instanceof CheapLfsGhcrLayerUploadTimeoutError)
            assert.deepEqual(error.completedObjectSha256s, [])
            return true
          }
        )
        assert.equal(uploaded.has(dependentDigest), true)
        assert.equal(uploaded.has(sharedDigest), false)
      }
    )
  })

  it('pulls only one pointer-confirmed object from an immutable GHCR image', async () => {
    const directory = await root()
    const oras = await orasFixture(directory)
    const first = Buffer.from('first target')
    const second = Buffer.from('unrelated second target')
    const firstPath = join(directory, 'first.bin')
    const secondPath = join(directory, 'second.bin')
    await writeFile(firstPath, first)
    await writeFile(secondPath, second)

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        desiredObjects: [
          {
            sha256: sha256(first),
            sizeInBytes: first.length,
            sourcePath: firstPath,
          },
          {
            sha256: sha256(second),
            sizeInBytes: second.length,
            sourcePath: secondPath,
          },
        ],
        maximumChunkBytes: 5,
      },
      async image => {
        const firstObject = image.snapshot.objects.find(
          object => object.sha256 === sha256(first)
        )!
        const pointer = {
          version: CHEAP_LFS_GHCR_POINTER_VERSION,
          image: `ghcr.io/owner/package@${image.manifestDescriptor.digest}`,
          object: `sha256:${firstObject.sha256}`,
          sizeInBytes: firstObject.sizeInBytes,
          layers: firstObject.chunks.map(chunk => chunk.blob.digest),
        } as const
        const localByDigest = new Map(
          image.layers.map(layer => [layer.descriptor.digest, layer.localPath!])
        )
        const fetchedBlobs: string[] = []
        const runner = new FakeRunner(async request => {
          const outputIndex = request.args.indexOf('--output')
          const output = request.args[outputIndex + 1]
          const reference = request.args[request.args.length - 1]
          if (request.args[0] === 'manifest') {
            await copyFile(image.manifestPath, output)
          } else if (reference.endsWith(image.configDescriptor.digest)) {
            await copyFile(image.configPath, output)
          } else {
            const digest = reference.slice(reference.lastIndexOf('@') + 1)
            fetchedBlobs.push(digest)
            await copyFile(localByDigest.get(digest)!, output)
          }
        })

        await withPulledCheapLfsGhcrObject(
          {
            pointer,
            expectedRepositoryIdentity: repositoryIdentity,
            expectedVisibility: 'public',
            orasExecutablePath: oras.path,
            orasExecutableSha256: oras.digest,
            parallelBlobDownloads: true,
            runner,
          },
          async validated => {
            assert.equal(validated.snapshot.objects.length, 2)
            assert.deepEqual(
              [...validated.blobPaths.keys()].sort(),
              [...new Set(pointer.layers)].sort()
            )
          }
        )

        assert.deepEqual(
          fetchedBlobs.sort(),
          [...new Set(pointer.layers)].sort()
        )
        assert.ok(
          runner.requests.every(
            request =>
              request.stdin.byteLength === 0 &&
              !request.args.includes('--password-stdin')
          )
        )
        const unrelated = image.snapshot.objects
          .find(object => object.sha256 === sha256(second))!
          .chunks.map(chunk => chunk.blob.digest)
        assert.equal(
          unrelated.some(digest => fetchedBlobs.includes(digest)),
          false
        )
      }
    )
  })

  it('reports provider limits without inventing Docker Hub caps', () => {
    assert.equal(
      getCheapLfsOciRegistryCapabilities('ghcr').documentedMaximumLayerBytes,
      10_000_000_000
    )
    assert.equal(
      getCheapLfsOciRegistryCapabilities('ghcr').documentedUploadTimeoutMs,
      10 * 60 * 1000
    )
    assert.equal(
      getCheapLfsOciRegistryCapabilities('docker-hub')
        .documentedMaximumLayerBytes,
      null
    )
    assert.equal(
      getCheapLfsOciRegistryCapabilities('docker-hub')
        .documentedMaximumImageBytes,
      null
    )
  })
})
