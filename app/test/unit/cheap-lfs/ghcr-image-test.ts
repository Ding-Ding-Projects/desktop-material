import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  CheapLfsGhcrImageError,
  CheapLfsGhcrMaximumChunkBytes,
  CheapLfsGhcrMaximumLayerBytes,
  CheapLfsGhcrPublicObjectMediaType,
  CheapLfsGhcrSnapshotConfigField,
  CheapLfsOciSourceAnnotation,
  ICheapLfsGhcrPulledImage,
  ICheapLfsGhcrSnapshot,
  getNextCheapLfsGhcrChunkBytes,
  isCheapLfsGhcrLayerSizeAllowed,
  materializeCheapLfsGhcrObject,
  OciImageConfigMediaType,
  validateCheapLfsGhcrPulledImage,
  withPreparedCheapLfsGhcrImage,
} from '../../../src/lib/cheap-lfs/ghcr-image'
import {
  CHEAP_LFS_GHCR_POINTER_VERSION,
  materializeCheapLfsOciPointer,
  serializeCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'

const roots: string[] = []
const repositoryIdentity = 'github.com/repositories/123456'
const sourceRepositoryUrl = 'https://github.com/owner/package'

async function root() {
  const path = await mkdtemp(join(tmpdir(), 'cheap-lfs-oci-image-test-'))
  roots.push(path)
  return path
}

function sha256(value: Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function publicSnapshotWithLayers(layerCount: number): ICheapLfsGhcrSnapshot {
  const chunk = Buffer.alloc(1)
  const chunkSha256 = sha256(chunk)
  return {
    format: 'desktop-material-cheap-lfs-ghcr',
    version: 1,
    repositoryIdentity,
    visibility: 'public',
    keyId: null,
    objects: [
      {
        sha256: sha256(Buffer.alloc(layerCount)),
        sizeInBytes: layerCount,
        chunks: Array.from({ length: layerCount }, (_, ordinal) => ({
          ordinal,
          offset: ordinal,
          sizeInBytes: 1,
          plaintextSha256: chunkSha256,
          blob: {
            mediaType: CheapLfsGhcrPublicObjectMediaType,
            digest: `sha256:${chunkSha256}`,
            size: 1,
          },
          encryption: null,
        })),
      },
    ],
  }
}

async function withUnusableTemporaryDirectory<T>(
  directory: string,
  operation: () => Promise<T>
): Promise<T> {
  const unusable = join(directory, 'not-a-temporary-directory')
  await writeFile(unusable, 'ordinary file')
  const previousTemp = process.env.TEMP
  const previousTmp = process.env.TMP
  process.env.TEMP = unusable
  process.env.TMP = unusable
  try {
    return await operation()
  } finally {
    if (previousTemp === undefined) {
      delete process.env.TEMP
    } else {
      process.env.TEMP = previousTemp
    }
    if (previousTmp === undefined) {
      delete process.env.TMP
    } else {
      process.env.TMP = previousTmp
    }
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(path => rm(path, { recursive: true, force: true }))
  )
})

describe('Cheap LFS OCI repository image', () => {
  it('creates ordered bounded chunks, validates them, restores them, and cleans staging', async () => {
    const directory = await root()
    const bytes = Buffer.from('abcdefghij')
    const sourcePath = join(directory, 'source.bin')
    const destinationPath = join(directory, 'restored.bin')
    await writeFile(sourcePath, bytes)
    let stagingDirectory = ''

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
        maximumChunkBytes: 4,
      },
      async image => {
        stagingDirectory = image.directory
        const manifest = JSON.parse(await readFile(image.manifestPath, 'utf8'))
        const config = JSON.parse(await readFile(image.configPath, 'utf8'))
        assert.deepEqual(manifest.annotations, {
          [CheapLfsOciSourceAnnotation]: sourceRepositoryUrl,
        })
        assert.equal(manifest.config.mediaType, OciImageConfigMediaType)
        assert.deepEqual(Object.keys(config), [
          'architecture',
          'os',
          'config',
          'rootfs',
          CheapLfsGhcrSnapshotConfigField,
        ])
        assert.equal(
          config.config.Labels[CheapLfsOciSourceAnnotation],
          sourceRepositoryUrl
        )
        assert.deepEqual(
          config.rootfs.diff_ids,
          image.layers.map(layer => layer.descriptor.digest)
        )
        assert.deepEqual(
          config[CheapLfsGhcrSnapshotConfigField],
          image.snapshot
        )
        assert.equal(image.sourceRepositoryUrl, sourceRepositoryUrl)
        assert.deepEqual(
          image.snapshot.objects[0].chunks.map(chunk => [
            chunk.ordinal,
            chunk.offset,
            chunk.sizeInBytes,
          ]),
          [
            [0, 0, 4],
            [1, 4, 4],
            [2, 8, 2],
          ]
        )
        const pulled: ICheapLfsGhcrPulledImage = {
          immutableReference: `ghcr.io/owner/package@${image.manifestDescriptor.digest}`,
          manifestPath: image.manifestPath,
          configPath: image.configPath,
          blobPaths: new Map(
            image.layers.map(layer => [
              layer.descriptor.digest,
              layer.localPath!,
            ])
          ),
        }
        const validated = await validateCheapLfsGhcrPulledImage(pulled, {
          expectedRepositoryIdentity: repositoryIdentity,
          expectedVisibility: 'public',
        })
        assert.equal(validated.sourceRepositoryUrl, sourceRepositoryUrl)
        await materializeCheapLfsGhcrObject(validated, {
          objectSha256: sha256(bytes),
          destinationPath,
        })
      }
    )

    assert.deepEqual(await readFile(destinationPath), bytes)
    await assert.rejects(access(stagingDirectory))
  })

  it('rejects non-canonical or non-GitHub package source annotations', async () => {
    const directory = await root()
    const bytes = Buffer.from('invalid source URL')
    const sourcePath = join(directory, 'invalid-source.bin')
    await writeFile(sourcePath, bytes)

    for (const invalid of [
      'https://example.com/owner/package',
      'http://github.com/owner/package',
      'https://github.com/owner/package/',
      'https://github.com/owner/package.git',
    ]) {
      await assert.rejects(
        withPreparedCheapLfsGhcrImage(
          {
            repositoryIdentity,
            sourceRepositoryUrl: invalid,
            visibility: 'public',
            desiredObjects: [
              {
                sha256: sha256(bytes),
                sizeInBytes: bytes.length,
                sourcePath,
              },
            ],
          },
          async () => undefined
        ),
        (error: unknown) =>
          error instanceof CheapLfsGhcrImageError &&
          error.kind === 'invalid-input'
      )
    }
  })

  it('rejects unvalidated config fields and inconsistent source labels', async () => {
    const directory = await root()
    const bytes = Buffer.from('strict standard OCI config')
    const sourcePath = join(directory, 'strict-config.bin')
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
        const originalConfig = JSON.parse(
          await readFile(image.configPath, 'utf8')
        )
        const originalManifest = JSON.parse(
          await readFile(image.manifestPath, 'utf8')
        )

        const rejectsConfig = async (name: string, config: unknown) => {
          const configBytes = Buffer.from(JSON.stringify(config), 'utf8')
          const configPath = join(directory, `${name}-config.json`)
          await writeFile(configPath, configBytes)
          const manifestBytes = Buffer.from(
            JSON.stringify({
              ...originalManifest,
              config: {
                ...originalManifest.config,
                digest: `sha256:${sha256(configBytes)}`,
                size: configBytes.byteLength,
              },
            }),
            'utf8'
          )
          const manifestPath = join(directory, `${name}-manifest.json`)
          await writeFile(manifestPath, manifestBytes)

          await assert.rejects(
            validateCheapLfsGhcrPulledImage(
              {
                immutableReference: `ghcr.io/owner/package@sha256:${sha256(
                  manifestBytes
                )}`,
                manifestPath,
                configPath,
                blobPaths: new Map(
                  image.layers.map(layer => [
                    layer.descriptor.digest,
                    layer.localPath!,
                  ])
                ),
              },
              {
                expectedRepositoryIdentity: repositoryIdentity,
                expectedVisibility: 'public',
              }
            ),
            (error: unknown) =>
              error instanceof CheapLfsGhcrImageError &&
              error.kind === 'invalid-image'
          )
        }

        await rejectsConfig('extra-top-level', {
          ...originalConfig,
          unexpected: true,
        })
        await rejectsConfig('extra-snapshot', {
          ...originalConfig,
          [CheapLfsGhcrSnapshotConfigField]: {
            ...originalConfig[CheapLfsGhcrSnapshotConfigField],
            unexpected: true,
          },
        })
        await rejectsConfig('mismatched-source', {
          ...originalConfig,
          config: {
            Labels: {
              [CheapLfsOciSourceAnnotation]:
                'https://github.com/owner/different-package',
            },
          },
        })
      }
    )
  })

  it('encrypts every private chunk and fails closed with a wrong key', async () => {
    const directory = await root()
    const bytes = Buffer.from('private payload split across chunks')
    const sourcePath = join(directory, 'private.bin')
    await writeFile(sourcePath, bytes)
    const key = Buffer.alloc(32, 0x44)

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'private',
        encryptionKey: key,
        desiredObjects: [
          {
            sha256: sha256(bytes),
            sizeInBytes: bytes.length,
            sourcePath,
          },
        ],
        maximumChunkBytes: 7,
        entropy: (size, purpose, _objectSha256, chunkOrdinal) =>
          Buffer.alloc(size, chunkOrdinal + (purpose === 'salt' ? 1 : 101)),
      },
      async image => {
        for (const layer of image.layers) {
          const ciphertext = await readFile(layer.localPath!)
          assert.equal(bytes.includes(ciphertext), false)
          assert.notEqual(layer.chunk.encryption, null)
        }
        const pulled: ICheapLfsGhcrPulledImage = {
          immutableReference: `docker.io/owner/package@${image.manifestDescriptor.digest}`,
          manifestPath: image.manifestPath,
          configPath: image.configPath,
          blobPaths: new Map(
            image.layers.map(layer => [
              layer.descriptor.digest,
              layer.localPath!,
            ])
          ),
        }
        const validated = await validateCheapLfsGhcrPulledImage(pulled, {
          expectedRepositoryIdentity: repositoryIdentity,
          expectedVisibility: 'private',
        })
        const destinationPath = join(directory, 'private-restored.bin')
        await assert.rejects(
          materializeCheapLfsGhcrObject(validated, {
            objectSha256: sha256(bytes),
            destinationPath,
            encryptionKey: Buffer.alloc(32, 0x45),
          }),
          (error: unknown) =>
            error instanceof CheapLfsGhcrImageError &&
            error.kind === 'integrity'
        )
        await assert.rejects(access(destinationPath))
        await materializeCheapLfsGhcrObject(validated, {
          objectSha256: sha256(bytes),
          destinationPath,
          encryptionKey: key,
        })
        assert.deepEqual(await readFile(destinationPath), bytes)
      }
    )
    key.fill(0)
  })

  it('uses fresh production salt and nonces for independent private preparations', async () => {
    const directory = await root()
    const bytes = Buffer.from('fresh random encryption material')
    const sourcePath = join(directory, 'fresh-random.bin')
    await writeFile(sourcePath, bytes)
    const key = Buffer.alloc(32, 0x46)

    const prepare = () =>
      withPreparedCheapLfsGhcrImage(
        {
          repositoryIdentity,
          sourceRepositoryUrl,
          visibility: 'private',
          encryptionKey: key,
          desiredObjects: [
            {
              sha256: sha256(bytes),
              sizeInBytes: bytes.length,
              sourcePath,
            },
          ],
          maximumChunkBytes: 8,
        },
        async image =>
          image.layers.map(layer => ({
            digest: layer.descriptor.digest,
            salt: layer.chunk.encryption?.salt,
            nonce: layer.chunk.encryption?.nonce,
          }))
      )

    const first = await prepare()
    const second = await prepare()
    assert.notDeepEqual(second, first)
    assert.ok(
      second.every(
        (layer, index) =>
          layer.digest !== first[index].digest &&
          layer.salt !== first[index].salt &&
          layer.nonce !== first[index].nonce
      )
    )
    key.fill(0)
  })

  it('atomically replaces an unchanged tracked pointer only after verification', async () => {
    const directory = await root()
    const bytes = Buffer.from('materialized tracked object')
    const sourcePath = join(directory, 'source.bin')
    const trackedPath = join(directory, 'tracked.bin')
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
        maximumChunkBytes: 6,
      },
      async image => {
        const object = image.snapshot.objects[0]
        const pointerText = serializeCheapLfsGhcrPointer({
          version: CHEAP_LFS_GHCR_POINTER_VERSION,
          image: `ghcr.io/owner/package@${image.manifestDescriptor.digest}`,
          object: `sha256:${object.sha256}`,
          sizeInBytes: object.sizeInBytes,
          layers: object.chunks.map(chunk => chunk.blob.digest),
        })
        await writeFile(trackedPath, pointerText)
        const validated = await validateCheapLfsGhcrPulledImage(
          {
            immutableReference: `ghcr.io/owner/package@${image.manifestDescriptor.digest}`,
            manifestPath: image.manifestPath,
            configPath: image.configPath,
            blobPaths: new Map(
              image.layers.map(layer => [
                layer.descriptor.digest,
                layer.localPath!,
              ])
            ),
          },
          {
            expectedRepositoryIdentity: repositoryIdentity,
            expectedVisibility: 'public',
          }
        )

        await materializeCheapLfsOciPointer(validated, {
          pointerText,
          destinationPath: trackedPath,
        })
      }
    )

    assert.deepEqual(await readFile(trackedPath), bytes)
  })

  it('models add/remove/update as a full index and reuses only same-key unchanged objects', async () => {
    const directory = await root()
    const first = Buffer.from('first object')
    const second = Buffer.from('second object')
    const firstPath = join(directory, 'first.bin')
    const secondPath = join(directory, 'second.bin')
    await writeFile(firstPath, first)
    await writeFile(secondPath, second)
    let previous!: ICheapLfsGhcrSnapshot

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
        ],
      },
      async image => {
        previous = JSON.parse(JSON.stringify(image.snapshot))
      }
    )

    let added!: ICheapLfsGhcrSnapshot
    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        previousSnapshot: previous,
        desiredObjects: [
          { sha256: sha256(first), sizeInBytes: first.length },
          {
            sha256: sha256(second),
            sizeInBytes: second.length,
            sourcePath: secondPath,
          },
        ],
      },
      async image => {
        added = JSON.parse(JSON.stringify(image.snapshot))
        const firstLayers = image.layers.filter(
          layer => layer.object.sha256 === sha256(first)
        )
        const secondLayers = image.layers.filter(
          layer => layer.object.sha256 === sha256(second)
        )
        assert.ok(
          firstLayers.every(layer => layer.reused && layer.localPath === null)
        )
        assert.ok(
          secondLayers.every(layer => !layer.reused && layer.localPath !== null)
        )
      }
    )

    await withPreparedCheapLfsGhcrImage(
      {
        repositoryIdentity,
        sourceRepositoryUrl,
        visibility: 'public',
        previousSnapshot: added,
        desiredObjects: [
          { sha256: sha256(second), sizeInBytes: second.length },
        ],
      },
      async image => {
        assert.deepEqual(
          image.snapshot.objects.map(object => object.sha256),
          [sha256(second)]
        )
        assert.ok(image.layers.every(layer => layer.reused))
      }
    )
  })

  it('rejects a previous 8192-layer snapshot plus a missing new source before staging', async () => {
    const directory = await root()
    const previousSnapshot = publicSnapshotWithLayers(8192)
    const previousObject = previousSnapshot.objects[0]
    let progressEvents = 0
    let operationCalled = false

    await withUnusableTemporaryDirectory(directory, async () => {
      await assert.rejects(
        withPreparedCheapLfsGhcrImage(
          {
            repositoryIdentity,
            sourceRepositoryUrl,
            visibility: 'public',
            previousSnapshot,
            desiredObjects: [
              {
                sha256: previousObject.sha256,
                sizeInBytes: previousObject.sizeInBytes,
              },
              { sha256: 'f'.repeat(64), sizeInBytes: 1 },
            ],
            onProgress: () => progressEvents++,
          },
          async () => {
            operationCalled = true
          }
        ),
        (error: unknown) =>
          error instanceof CheapLfsGhcrImageError &&
          error.kind === 'invalid-input' &&
          /repository layer index/i.test(error.message)
      )
    })

    assert.equal(progressEvents, 0)
    assert.equal(operationCalled, false)
  })

  it('preflights adaptive small chunks across objects before staging or source reads', async () => {
    const directory = await root()
    let progressEvents = 0
    let operationCalled = false

    await withUnusableTemporaryDirectory(directory, async () => {
      await assert.rejects(
        withPreparedCheapLfsGhcrImage(
          {
            repositoryIdentity,
            sourceRepositoryUrl,
            visibility: 'public',
            desiredObjects: [
              { sha256: '1'.repeat(64), sizeInBytes: 4097 },
              { sha256: '2'.repeat(64), sizeInBytes: 4097 },
            ],
            maximumChunkBytes: 1,
            onProgress: () => progressEvents++,
          },
          async () => {
            operationCalled = true
          }
        ),
        (error: unknown) =>
          error instanceof CheapLfsGhcrImageError &&
          error.kind === 'invalid-input' &&
          /repository layer index/i.test(error.message)
      )
    })

    assert.equal(progressEvents, 0)
    assert.equal(operationCalled, false)
  })

  it('halves the production chunk bound deterministically down to its floor', () => {
    assert.equal(
      getNextCheapLfsGhcrChunkBytes(CheapLfsGhcrMaximumChunkBytes),
      768 * 1024 * 1024
    )
    let size = CheapLfsGhcrMaximumChunkBytes
    for (let attempt = 0; attempt < 20; attempt++) {
      const next = getNextCheapLfsGhcrChunkBytes(size)
      if (next === null) {
        break
      }
      assert.ok(next < size)
      size = next
    }
    assert.equal(size, 8 * 1024 * 1024)
    assert.equal(getNextCheapLfsGhcrChunkBytes(size), null)
  })

  it('enforces the strict decimal 10 GB defensive layer boundary', () => {
    assert.equal(CheapLfsGhcrMaximumLayerBytes, 10_000_000_000)
    assert.equal(
      isCheapLfsGhcrLayerSizeAllowed(CheapLfsGhcrMaximumLayerBytes - 1),
      true
    )
    assert.equal(
      isCheapLfsGhcrLayerSizeAllowed(CheapLfsGhcrMaximumLayerBytes),
      false
    )
    assert.equal(
      isCheapLfsGhcrLayerSizeAllowed(CheapLfsGhcrMaximumLayerBytes + 1),
      false
    )
  })
})
