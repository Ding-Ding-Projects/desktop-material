import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  normalizeGitHubReleaseAssetLabel,
} from '../../../src/lib/github-releases'
import {
  buildCheapLfsAssetAnnotationTargets,
  CheapLfsAssetLabelPendingCommit,
  CheapLfsMaximumAssetLabelLength,
  findCheapLfsAssetForContent,
  findCheapLfsAssetsForParts,
  formatCheapLfsAssetLabel,
  parseCheapLfsAssetLabel,
} from '../../../src/lib/cheap-lfs/asset-version'
import {
  annotateCheapLfsPinnedAssets,
  cheapLfsAnnotatablePins,
  ICheapLfsReleasesGateway,
  materializePointer,
  pinFileToRelease,
} from '../../../src/lib/cheap-lfs/operations'
import {
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
    getAccountKey(selected),
    undefined,
    null,
    'trunk'
  )
}

const sha256Of = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')

function assetFixture(
  overrides: Partial<IGitHubReleaseAsset> = {}
): IGitHubReleaseAsset {
  return {
    id: 1,
    name: 'fixture.bin',
    label: null,
    state: 'uploaded',
    contentType: 'application/octet-stream',
    sizeInBytes: 4,
    downloadCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    digest: `sha256:${'a'.repeat(64)}`,
    ...overrides,
  }
}

/**
 * A release bucket that behaves like the provider does for the properties this
 * feature depends on: an uploaded asset is immutable, its digest is computed
 * from the bytes actually sent, and a name may only be used once.
 */
function releaseBucket(tag: string) {
  let nextId = 500
  const stored = new Map<string, Buffer>()
  let current: IGitHubRelease = {
    id: 42,
    tagName: tag,
    targetCommitish: 'trunk',
    name: tag,
    body: '',
    draft: false,
    prerelease: true,
    createdAt: new Date(0),
    publishedAt: new Date(0),
    authorLogin: 'fixture-bot',
    assets: [],
  }
  const uploads = new Array<{
    readonly name: string
    readonly label: string | null
  }>()
  const labelUpdates = new Array<{
    readonly name: string
    readonly label: string
  }>()
  let rejectLabeledUploads = false
  let failLabelUpdates = false

  const gateway: ICheapLfsReleasesGateway = {
    getReleaseByTag: async (_repository, requestedTag) =>
      requestedTag === current.tagName ? current : null,
    create: async () => current,
    listAssets: async () => ({
      assets: current.assets,
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
    publish: async () => current,
    uploadAsset: async (
      _repository,
      _review,
      sourcePath,
      name,
      label,
      _signal,
      _onProgress,
      range
    ) => {
      if (rejectLabeledUploads && label !== null) {
        throw new Error('This provider rejected the release asset label.')
      }
      if (current.assets.some(existing => existing.name === name)) {
        throw new Error(`The release already has an asset named “${name}”.`)
      }
      const whole = await readFile(sourcePath)
      const bytes =
        range === undefined
          ? whole
          : whole.subarray(range.offset, range.offset + range.length)
      const uploaded = assetFixture({
        id: nextId++,
        name,
        label,
        sizeInBytes: bytes.length,
        digest: `sha256:${sha256Of(bytes)}`,
      })
      stored.set(name, bytes)
      uploads.push({ name, label })
      current = { ...current, assets: [...current.assets, uploaded] }
      return {
        asset: uploaded,
        bytes: bytes.length,
        localDigest: uploaded.digest!,
      }
    },
    updateAssetLabel: async (_repository, review, label) => {
      if (failLabelUpdates) {
        throw new Error('The provider refused to update this asset label.')
      }
      const target = current.assets.find(
        candidate => candidate.id === review.assetId
      )
      if (target === undefined) {
        throw new Error('No such asset.')
      }
      const updated = { ...target, label }
      labelUpdates.push({ name: target.name, label })
      current = {
        ...current,
        assets: current.assets.map(candidate =>
          candidate.id === updated.id ? updated : candidate
        ),
      }
      return updated
    },
    deleteAsset: async () => {
      throw new Error('An immutable Cheap LFS asset must never be deleted.')
    },
    downloadAsset: async (
      _repository,
      _releaseId,
      downloadedAsset,
      destination
    ) => {
      const bytes = stored.get(downloadedAsset.name)
      assert.ok(bytes !== undefined, 'download of an asset never uploaded')
      await writeFile(destination, bytes)
      return { path: destination, bytes: bytes.length }
    },
  }

  return {
    gateway,
    uploads,
    labelUpdates,
    assets: () => current.assets,
    bytesOf: (name: string) => stored.get(name),
    rejectLabeledUploads: (value: boolean) => (rejectLabeledUploads = value),
    failLabelUpdates: (value: boolean) => (failLabelUpdates = value),
  }
}

async function withTempRepository(
  run: (dir: string, repository: Repository) => Promise<void>
) {
  const dir = await mkdtemp(join(tmpdir(), 'cheaplfs-version-'))
  try {
    await run(dir, repositoryAt(dir))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('cheap LFS asset versioning', () => {
  it('formats a provenance label GitHub can store verbatim', () => {
    const sha256 = sha256Of(Buffer.from('content'))
    const label = formatCheapLfsAssetLabel({
      relativePath: 'assets/video.mp4',
      sha256,
    })
    assert.equal(
      label,
      `cheap-lfs/v1 sha256=${sha256} commit=${CheapLfsAssetLabelPendingCommit} path=assets/video.mp4`
    )
    assert.ok(label!.length <= CheapLfsMaximumAssetLabelLength)
    // The transfer layer verifies the echoed label against the normalized value
    // it sent, so a label that normalization would alter could fail an upload.
    assert.equal(normalizeGitHubReleaseAssetLabel(label!), label)
  })

  it('records the introducing commit once it is known', () => {
    const sha256 = sha256Of(Buffer.from('content'))
    const label = formatCheapLfsAssetLabel({
      relativePath: 'assets/video.mp4',
      sha256,
      commitSha: 'ABCDEF1234567890abcdef1234567890abcdef12',
    })
    const parsed = parseCheapLfsAssetLabel(label)
    assert.deepEqual(parsed, {
      relativePath: 'assets/video.mp4',
      sha256,
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
      pathTruncated: false,
    })
  })

  it('keeps an over-long path inside the label ceiling without losing the name', () => {
    const sha256 = sha256Of(Buffer.from('content'))
    const relativePath = `${'nested/'.repeat(40)}very-large-video.mp4`
    const label = formatCheapLfsAssetLabel({ relativePath, sha256 })
    assert.ok(label !== null)
    assert.ok(label.length <= CheapLfsMaximumAssetLabelLength)
    assert.equal(normalizeGitHubReleaseAssetLabel(label), label)
    const parsed = parseCheapLfsAssetLabel(label)
    assert.equal(parsed?.pathTruncated, true)
    assert.ok(parsed!.relativePath.endsWith('very-large-video.mp4'))
    assert.ok(relativePath.endsWith(parsed!.relativePath))
  })

  it('refuses to build a label from an unusable digest, commit, or path', () => {
    const sha256 = sha256Of(Buffer.from('content'))
    assert.equal(
      formatCheapLfsAssetLabel({ relativePath: 'a.bin', sha256: 'nope' }),
      null
    )
    assert.equal(formatCheapLfsAssetLabel({ relativePath: '  ', sha256 }), null)
    assert.equal(
      formatCheapLfsAssetLabel({
        relativePath: 'a.bin',
        sha256,
        commitSha: 'zz12345',
      }),
      null
    )
  })

  it('never mistakes a foreign label for Cheap LFS provenance', () => {
    assert.equal(parseCheapLfsAssetLabel(null), null)
    assert.equal(parseCheapLfsAssetLabel('Windows installer'), null)
    assert.equal(
      parseCheapLfsAssetLabel(
        `cheap-lfs/v1 sha256=${'a'.repeat(63)} commit=- path=a.bin`
      ),
      null
    )
    assert.equal(
      parseCheapLfsAssetLabel(
        `cheap-lfs/v2 sha256=${'a'.repeat(64)} commit=- path=a.bin`
      ),
      null
    )
  })

  it('reuses an asset only when the provider proves the same bytes', () => {
    const digest = 'b'.repeat(64)
    const match = assetFixture({
      id: 9,
      name: 'match.bin',
      sizeInBytes: 12,
      digest: `sha256:${digest}`,
    })
    const assets = [
      assetFixture({ id: 3, name: 'wrong-size.bin', sizeInBytes: 11 }),
      assetFixture({
        id: 4,
        name: 'no-digest.bin',
        sizeInBytes: 12,
        digest: null,
      }),
      assetFixture({
        id: 5,
        name: 'incomplete.bin',
        sizeInBytes: 12,
        state: 'starter',
        digest: `sha256:${digest}`,
      }),
      match,
    ]
    assert.equal(findCheapLfsAssetForContent(assets, 12, digest), match)
    assert.equal(findCheapLfsAssetForContent(assets, 12, 'c'.repeat(64)), null)
    assert.equal(findCheapLfsAssetForContent(assets, 13, digest), null)
    assert.equal(findCheapLfsAssetForContent(assets, 12, 'not-a-digest'), null)
  })

  it('prefers the lowest asset id so reuse is deterministic', () => {
    const digest = 'd'.repeat(64)
    const assets = [
      assetFixture({
        id: 90,
        name: 'late.bin',
        sizeInBytes: 5,
        digest: `sha256:${digest}`,
      }),
      assetFixture({
        id: 12,
        name: 'early.bin',
        sizeInBytes: 5,
        digest: `sha256:${digest}`,
      }),
    ]
    assert.equal(
      findCheapLfsAssetForContent(assets, 5, digest)?.name,
      'early.bin'
    )
  })

  it('reuses a split file only when every part is already present', () => {
    const first = 'e'.repeat(64)
    const second = 'f'.repeat(64)
    const assets = [
      assetFixture({
        id: 1,
        name: 'a.part001',
        sizeInBytes: 10,
        digest: `sha256:${first}`,
      }),
      assetFixture({
        id: 2,
        name: 'a.part002',
        sizeInBytes: 10,
        digest: `sha256:${second}`,
      }),
    ]
    const parts = [
      { length: 10, sha256: first },
      { length: 10, sha256: second },
    ]
    assert.deepEqual(
      findCheapLfsAssetsForParts(assets, parts)?.map(part => part.name),
      ['a.part001', 'a.part002']
    )
    assert.equal(findCheapLfsAssetsForParts(assets.slice(0, 1), parts), null)
    // Two parts holding identical bytes legitimately resolve to one asset.
    assert.deepEqual(
      findCheapLfsAssetsForParts(assets, [
        { length: 10, sha256: first },
        { length: 10, sha256: first },
      ])?.map(part => part.name),
      ['a.part001', 'a.part001']
    )
  })

  it('expands pins into one annotation per distinct asset', () => {
    const sha256 = 'a'.repeat(64)
    const targets = buildCheapLfsAssetAnnotationTargets(
      [
        {
          relativePath: 'big.bin',
          releaseTag: 'assets',
          assetName: 'big.bin',
          sha256,
          partNames: ['big.bin.part001', 'big.bin.part002'],
        },
        // A deduped second pin naming the same asset must not be annotated
        // twice, and its own label still describes its own path.
        {
          relativePath: 'copy.bin',
          releaseTag: 'assets',
          assetName: 'big.bin.part001',
          sha256,
        },
      ],
      'abcdef1234567890abcdef1234567890abcdef12'
    )
    assert.deepEqual(
      targets.map(target => target.assetName),
      ['big.bin.part001', 'big.bin.part002']
    )
    assert.ok(targets[0].label.includes('path=big.bin'))
    assert.deepEqual(buildCheapLfsAssetAnnotationTargets([], 'abcdef1'), [])
    assert.deepEqual(
      buildCheapLfsAssetAnnotationTargets(
        [
          {
            relativePath: 'big.bin',
            releaseTag: 'assets',
            assetName: 'big.bin',
            sha256,
          },
        ],
        'not-a-commit'
      ),
      []
    )
  })

  it('uploads a modified pinned file as a new asset and leaves the old one intact', async () => {
    await withTempRepository(async (dir, repository) => {
      const bucket = releaseBucket('assets')
      const filePath = join(dir, 'video.mp4')
      const original = Buffer.from('the original take of the video')
      const edited = Buffer.from('a completely different second take!!')
      await writeFile(filePath, original)

      const first = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: filePath,
          trackedRelativePath: 'video.mp4',
          releaseTag: 'assets',
        }
      )
      assert.equal(first.pointer.assetName, 'video.mp4')
      assert.equal(first.pointer.sha256, sha256Of(original))
      const firstPointerText = await readFile(filePath, 'utf8')
      assert.equal(firstPointerText, serializeCheapLfsPointer(first.pointer))

      // The user materializes, edits, and commits again.
      await writeFile(filePath, edited)
      const second = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: filePath,
          trackedRelativePath: 'video.mp4',
          releaseTag: 'assets',
        }
      )

      assert.equal(second.pointer.sha256, sha256Of(edited))
      assert.notEqual(second.pointer.assetName, first.pointer.assetName)
      assert.ok(
        second.pointer.assetName.includes(sha256Of(edited).slice(0, 7)),
        'the new asset name is derived from the new content hash'
      )
      // Both assets exist; nothing was deleted or rewritten.
      assert.deepEqual(
        bucket
          .assets()
          .map(entry => entry.name)
          .sort(),
        [first.pointer.assetName, second.pointer.assetName].sort()
      )
      assert.deepEqual(bucket.bytesOf(first.pointer.assetName), original)
      assert.deepEqual(bucket.bytesOf(second.pointer.assetName), edited)
      assert.equal(bucket.uploads.length, 2)

      // Checking out the earlier commit restores exactly the earlier bytes.
      await writeFile(filePath, firstPointerText)
      await materializePointer(
        bucket.gateway,
        repository,
        selected,
        'video.mp4'
      )
      assert.deepEqual(await readFile(filePath), original)

      // And the later commit still restores the later bytes.
      await writeFile(filePath, serializeCheapLfsPointer(second.pointer))
      await materializePointer(
        bucket.gateway,
        repository,
        selected,
        'video.mp4'
      )
      assert.deepEqual(await readFile(filePath), edited)
    })
  })

  it('reuses an existing asset when identical bytes are pinned somewhere else', async () => {
    await withTempRepository(async (dir, repository) => {
      const bucket = releaseBucket('assets')
      const content = Buffer.from('exactly the same bytes in two places')
      await writeFile(join(dir, 'first.bin'), content)
      await mkdir(join(dir, 'nested'))
      await writeFile(join(dir, 'nested', 'second.bin'), content)

      const first = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'first.bin'),
          trackedRelativePath: 'first.bin',
          releaseTag: 'assets',
        }
      )
      const second = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'nested', 'second.bin'),
          trackedRelativePath: 'nested/second.bin',
          releaseTag: 'assets',
        }
      )

      assert.equal(bucket.uploads.length, 1)
      assert.equal(bucket.assets().length, 1)
      assert.equal(second.pointer.assetName, first.pointer.assetName)
      assert.equal(second.pointer.sha256, first.pointer.sha256)

      // The deduped pointer still restores the real bytes.
      await materializePointer(
        bucket.gateway,
        repository,
        selected,
        'nested/second.bin'
      )
      assert.deepEqual(
        await readFile(join(dir, 'nested', 'second.bin')),
        content
      )
    })
  })

  it('labels each upload with its path, digest, and a pending commit', async () => {
    await withTempRepository(async (dir, repository) => {
      const bucket = releaseBucket('assets')
      const content = Buffer.from('label me')
      await writeFile(join(dir, 'labeled.bin'), content)
      await pinFileToRelease(bucket.gateway, repository, selected, {
        absoluteFilePath: join(dir, 'labeled.bin'),
        trackedRelativePath: 'labeled.bin',
        releaseTag: 'assets',
      })
      const annotation = parseCheapLfsAssetLabel(bucket.uploads[0].label)
      assert.deepEqual(annotation, {
        relativePath: 'labeled.bin',
        sha256: sha256Of(content),
        commitSha: null,
        pathTruncated: false,
      })
    })
  })

  it('still stores the file when the provider rejects the provenance label', async () => {
    await withTempRepository(async (dir, repository) => {
      const bucket = releaseBucket('assets')
      bucket.rejectLabeledUploads(true)
      const content = Buffer.from('the bytes matter more than the label')
      await writeFile(join(dir, 'stubborn.bin'), content)

      const result = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'stubborn.bin'),
          trackedRelativePath: 'stubborn.bin',
          releaseTag: 'assets',
        }
      )

      assert.equal(bucket.assets().length, 1)
      assert.equal(bucket.assets()[0].label, null)
      assert.deepEqual(bucket.bytesOf(result.pointer.assetName), content)
      assert.equal(
        await readFile(join(dir, 'stubborn.bin'), 'utf8'),
        serializeCheapLfsPointer(result.pointer)
      )
      assert.deepEqual(
        parseCheapLfsPointer(await readFile(join(dir, 'stubborn.bin'), 'utf8')),
        result.pointer
      )
    })
  })

  it('writes the introducing commit onto every asset after the commit exists', async () => {
    await withTempRepository(async (dir, repository) => {
      const bucket = releaseBucket('assets')
      const content = Buffer.from('traceable content')
      await writeFile(join(dir, 'traceable.bin'), content)
      const result = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'traceable.bin'),
          trackedRelativePath: 'traceable.bin',
          releaseTag: 'assets',
        }
      )
      const commitSha = 'abcdef1234567890abcdef1234567890abcdef12'
      const outcome = await annotateCheapLfsPinnedAssets(
        bucket.gateway,
        repository,
        cheapLfsAnnotatablePins([
          {
            relativePath: 'traceable.bin',
            sizeInBytes: content.length,
            result,
          },
        ]),
        commitSha
      )

      assert.deepEqual(outcome, { annotated: 1, skipped: 0 })
      assert.equal(bucket.labelUpdates.length, 1)
      const annotation = parseCheapLfsAssetLabel(bucket.assets()[0].label)
      assert.equal(annotation?.commitSha, commitSha)
      assert.equal(annotation?.relativePath, 'traceable.bin')
      assert.equal(annotation?.sha256, sha256Of(content))
      // Annotating never touches the asset name the pointer resolves through.
      assert.equal(bucket.assets()[0].name, result.pointer.assetName)
    })
  })

  it('never fails, throws, or loses an upload when annotation cannot be written', async () => {
    await withTempRepository(async (dir, repository) => {
      const bucket = releaseBucket('assets')
      const content = Buffer.from('annotation is best effort')
      await writeFile(join(dir, 'best-effort.bin'), content)
      const result = await pinFileToRelease(
        bucket.gateway,
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'best-effort.bin'),
          trackedRelativePath: 'best-effort.bin',
          releaseTag: 'assets',
        }
      )
      bucket.failLabelUpdates(true)

      const pins = cheapLfsAnnotatablePins([
        {
          relativePath: 'best-effort.bin',
          sizeInBytes: content.length,
          result,
        },
      ])
      assert.deepEqual(
        await annotateCheapLfsPinnedAssets(
          bucket.gateway,
          repository,
          pins,
          'abcdef1234567890abcdef1234567890abcdef12'
        ),
        { annotated: 0, skipped: 1 }
      )

      // A gateway that cannot relabel at all is skipped, not an error.
      const { updateAssetLabel, ...withoutLabels } = bucket.gateway
      assert.ok(updateAssetLabel !== undefined)
      assert.deepEqual(
        await annotateCheapLfsPinnedAssets(
          withoutLabels,
          repository,
          pins,
          'abcdef1234567890abcdef1234567890abcdef12'
        ),
        { annotated: 0, skipped: 1 }
      )

      // The stored bytes and the committed pointer are unaffected either way.
      assert.deepEqual(bucket.bytesOf(result.pointer.assetName), content)
      await materializePointer(
        bucket.gateway,
        repository,
        selected,
        'best-effort.bin'
      )
      assert.deepEqual(await readFile(join(dir, 'best-effort.bin')), content)
    })
  })
})
