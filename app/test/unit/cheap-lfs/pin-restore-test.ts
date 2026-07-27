import assert from 'node:assert'
import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'
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
  cheapLfsRetainedPins,
  discardCheapLfsRetainedPins,
  ICheapLfsManagedPointerEntry,
  ICheapLfsRetainedPin,
  isCheapLfsPayloadProvenStored,
  listAllCheapLfsPointers,
  pinFileToRelease,
  restoreCheapLfsPinnedPayloads,
} from '../../../src/lib/cheap-lfs/operations'
import {
  CHEAP_LFS_POINTER_VERSION,
  parseCheapLfsPointer,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'
import { CheapLfsReleaseBodySentinel } from '../../../src/lib/cheap-lfs/asset-version'
import { defaultCheapLfsTrackedPathStore } from '../../../src/lib/cheap-lfs/tracked-path-store'

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

const asset: IGitHubReleaseAsset = {
  id: 19,
  name: 'payload.bin',
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
  tagName: 'assets',
  targetCommitish: 'main',
  name: 'Assets',
  body: CheapLfsReleaseBodySentinel,
  draft: false,
  prerelease: true,
  createdAt: new Date(0),
  publishedAt: null,
  authorLogin: 'fixture-bot',
  assets: [],
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

/**
 * A releases gateway that records every upload and download it is asked for,
 * so a test can assert that a restore replaced a download rather than adding
 * one.
 */
function recordingStore(uploads: string[], downloads: string[]) {
  let created: IGitHubRelease = release
  const api: IGitHubReleasesAPI = {
    fetchReleases: async () => ({
      releases: [created],
      page: 1,
      nextPage: null,
      capped: false,
    }),
    fetchRelease: async () => created,
    fetchReleaseByTag: async () => null,
    fetchReleaseAssets: async () => ({
      assets: created.assets,
      page: 1,
      nextPage: null,
      capped: false,
    }),
    fetchReleaseAsset: async () => asset,
    createReleaseDraft: async (_owner, _name, draft) => ({
      ...created,
      tagName: draft.tagName,
    }),
    createRelease: async (_owner, _name, draft, publishImmediately) => {
      created = {
        ...created,
        tagName: draft.tagName,
        draft: !publishImmediately,
      }
      return created
    },
    updateRelease: async () => created,
    publishRelease: async () => ({ ...created, draft: false }),
    deleteRelease: async () => undefined,
    deleteReleaseAsset: async () => undefined,
  }
  const deps: IGitHubReleasesStoreDependencies = {
    apiFor: () => api,
    downloadAsset: async (
      _account,
      _repository,
      _releaseId,
      downloaded,
      destination
    ) => {
      downloads.push(downloaded.name)
      return {
        ok: true,
        path: destination,
        bytes: 0,
        localDigest: 'sha256:unused',
        matchesGitHubDigest: null,
      }
    },
    uploadAsset: async (
      _account,
      _repository,
      _releaseId,
      sourcePath,
      name
    ) => {
      uploads.push(sourcePath)
      const bytes = await readFile(sourcePath)
      return {
        ok: true,
        asset: { ...asset, name, sizeInBytes: bytes.length },
        bytes: bytes.length,
        localDigest: `sha256:${createHash('sha256')
          .update(bytes)
          .digest('hex')}`,
      }
    },
  }
  return new GitHubReleasesStore(
    new FakeAccountsStore([selected]) as unknown as AccountsStore,
    deps
  )
}

async function gitRepository(): Promise<{
  readonly dir: string
  readonly repository: Repository
  readonly dispose: () => Promise<void>
}> {
  const dir = await mkdtemp(join(tmpdir(), 'cheap-lfs-pin-restore-'))
  await execFile('git', ['init', '--quiet'], { cwd: dir })
  return {
    dir,
    repository: repositoryAt(dir),
    dispose: () => rm(dir, { recursive: true, force: true }),
  }
}

async function commitAll(dir: string, message: string): Promise<void> {
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
      message,
    ],
    { cwd: dir }
  )
}

/** Exactly what `maybeAutoMaterializeCheapLfs` selects for download. */
function downloadCandidates(
  entries: ReadonlyArray<ICheapLfsManagedPointerEntry>
): ReadonlyArray<string> {
  return entries
    .filter(entry => entry.workingTreeState === 'pointer')
    .map(entry => entry.relativePath)
}

/**
 * Pin `payload` into `relativePath`, retaining the verified copy, and return
 * the retained pin the commit flow would carry.
 */
async function pinRetaining(
  dir: string,
  repository: Repository,
  relativePath: string,
  payload: Buffer,
  uploads: string[] = [],
  downloads: string[] = []
): Promise<ICheapLfsRetainedPin> {
  const result = await pinFileToRelease(
    recordingStore(uploads, downloads),
    repository,
    selected,
    {
      absoluteFilePath: join(dir, relativePath),
      trackedRelativePath: relativePath,
      releaseTag: 'assets',
      retainSourceForRestore: true,
    }
  )
  assert.notEqual(result.retainedSource, undefined)
  const pins = cheapLfsRetainedPins([
    { relativePath, sizeInBytes: payload.length, result },
  ])
  assert.equal(pins.length, 1)
  return pins[0]
}

describe('cheap LFS post-commit payload restore', () => {
  it('deletes the verified upload copy when no restore was requested', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from('a payload nobody asked to keep\n')
      await writeFile(join(dir, 'payload.bin'), payload)
      const uploads: string[] = []
      const result = await pinFileToRelease(
        recordingStore(uploads, []),
        repository,
        selected,
        {
          absoluteFilePath: join(dir, 'payload.bin'),
          trackedRelativePath: 'payload.bin',
          releaseTag: 'assets',
        }
      )

      assert.equal(result.retainedSource, undefined)
      assert.equal(uploads.length, 1)
      await assert.rejects(stat(uploads[0]), { code: 'ENOENT' })
    } finally {
      await dispose()
    }
  })

  it('keeps the verified upload copy when a restore was requested', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from('a payload the commit will put back\n')
      await writeFile(join(dir, 'payload.bin'), payload)
      const uploads: string[] = []
      const pin = await pinRetaining(
        dir,
        repository,
        'payload.bin',
        payload,
        uploads
      )

      assert.equal(uploads.length, 1)
      assert.equal(pin.owned.path, uploads[0])
      assert.deepEqual(await readFile(pin.owned.path), payload)
      assert.equal(
        pin.sha256,
        createHash('sha256').update(payload).digest('hex')
      )
      assert.equal(pin.sizeInBytes, payload.length)
      assert.equal(
        pin.pointerText,
        await readFile(join(dir, 'payload.bin'), 'utf8')
      )

      await discardCheapLfsRetainedPins([pin])
      await assert.rejects(stat(pin.owned.path), { code: 'ENOENT' })
    } finally {
      await dispose()
    }
  })

  it('restores the payload after its commit so nothing is selected for download', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from('the bytes this machine just uploaded\n')
      await writeFile(join(dir, 'payload.bin'), payload)
      await writeFile(join(dir, 'notes.txt'), 'an unrelated file\n')
      const downloads: string[] = []
      const pin = await pinRetaining(
        dir,
        repository,
        'payload.bin',
        payload,
        [],
        downloads
      )
      await commitAll(dir, 'pin the payload')

      // Without the restore this is exactly the bug: a payload uploaded
      // seconds ago is queued for download by the very next detect point.
      const beforeRestore = await listAllCheapLfsPointers(repository)
      assert.deepEqual(downloadCandidates(beforeRestore), ['payload.bin'])

      const outcome = await restoreCheapLfsPinnedPayloads(repository, [pin])
      assert.deepEqual(outcome.restored, ['payload.bin'])
      assert.deepEqual(outcome.skipped, [])
      assert.deepEqual(outcome.failures, [])

      assert.deepEqual(await readFile(join(dir, 'payload.bin')), payload)
      const entries = await listAllCheapLfsPointers(repository)
      const entry = entries.find(item => item.relativePath === 'payload.bin')
      assert.equal(entry?.workingTreeState, 'materialized')

      // Every detect point (fetch, pull, open, add) funnels through this same
      // selection, so an empty candidate list is zero downloads for all four.
      assert.deepEqual(downloadCandidates(entries), [])
      assert.deepEqual(downloads, [])

      // The retained temp is consumed by the restore; discarding it afterwards
      // removes the now-empty private directory and leaves nothing behind.
      assert.deepEqual(await discardCheapLfsRetainedPins([pin]), [])
      await assert.rejects(stat(pin.owned.path), { code: 'ENOENT' })
    } finally {
      await dispose()
    }
  })

  it('leaves the committed pointer intact when the retained copy fails its proof', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from('bytes whose retained copy went bad\n')
      await writeFile(join(dir, 'payload.bin'), payload)
      const pin = await pinRetaining(dir, repository, 'payload.bin', payload)
      await commitAll(dir, 'pin the payload')
      const pointerText = await readFile(join(dir, 'payload.bin'), 'utf8')

      // A retained copy that no longer hashes to what the pointer promises is
      // exactly what a corrupted download is, and must be refused the same way.
      const outcome = await restoreCheapLfsPinnedPayloads(repository, [
        { ...pin, sha256: 'c'.repeat(64) },
      ])
      assert.deepEqual(outcome.restored, [])
      assert.deepEqual(outcome.skipped, [])
      assert.equal(outcome.failures.length, 1)
      assert.equal(outcome.failures[0].relativePath, 'payload.bin')

      assert.equal(
        await readFile(join(dir, 'payload.bin'), 'utf8'),
        pointerText
      )
      const entries = await listAllCheapLfsPointers(repository)
      // Worst case is today's behavior: still a pointer, downloaded later.
      assert.deepEqual(downloadCandidates(entries), ['payload.bin'])

      assert.deepEqual(await discardCheapLfsRetainedPins([pin]), [])
    } finally {
      await dispose()
    }
  })

  it('skips a path that no longer holds exactly the committed pointer', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from('bytes overtaken by a later edit\n')
      await writeFile(join(dir, 'payload.bin'), payload)
      const pin = await pinRetaining(dir, repository, 'payload.bin', payload)
      await commitAll(dir, 'pin the payload')

      const concurrent = 'someone else wrote this after the commit\n'
      await writeFile(join(dir, 'payload.bin'), concurrent, 'utf8')

      const outcome = await restoreCheapLfsPinnedPayloads(repository, [pin])
      assert.deepEqual(outcome.restored, [])
      assert.deepEqual(outcome.skipped, ['payload.bin'])
      assert.deepEqual(outcome.failures, [])
      assert.equal(await readFile(join(dir, 'payload.bin'), 'utf8'), concurrent)

      assert.deepEqual(await discardCheapLfsRetainedPins([pin]), [])
      await assert.rejects(stat(pin.owned.path), { code: 'ENOENT' })
    } finally {
      await dispose()
    }
  })

  it('reports rather than deletes when a retained temp was replaced', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from('bytes whose temp got swapped\n')
      await writeFile(join(dir, 'payload.bin'), payload)
      const pin = await pinRetaining(dir, repository, 'payload.bin', payload)

      await writeFile(pin.owned.path, 'a stranger replaced this file\n', 'utf8')
      const failures = await discardCheapLfsRetainedPins([pin])
      assert.equal(failures.length, 1)
      assert.equal(failures[0].relativePath, 'payload.bin')
      assert.match(failures[0].message, /replaced and was preserved/)
      // Preserved, not deleted: the identity check refuses to remove it.
      assert.equal(
        await readFile(pin.owned.path, 'utf8'),
        'a stranger replaced this file\n'
      )
      await rm(pin.owned.path, { force: true })
    } finally {
      await dispose()
    }
  })
})

describe('cheap LFS proven-stored payload classification', () => {
  it('proves a restored payload stored and refuses every unproven signal', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from(
        'a payload restored right after its own commit\n'
      )
      await writeFile(join(dir, 'payload.bin'), payload)
      const pin = await pinRetaining(dir, repository, 'payload.bin', payload)
      await commitAll(dir, 'pin the payload')
      await restoreCheapLfsPinnedPayloads(repository, [pin])
      await discardCheapLfsRetainedPins([pin])

      const entries = await listAllCheapLfsPointers(repository)
      const entry = entries.find(item => item.relativePath === 'payload.bin')
      assert.notEqual(entry, undefined)
      assert.equal(entry!.workingTreeState, 'materialized')
      assert.equal(isCheapLfsPayloadProvenStored(entry!), true)

      // The enum alone must never be enough: strip the proof and the answer
      // has to flip, because an identity-only scan legitimately omits it.
      assert.equal(
        isCheapLfsPayloadProvenStored({
          ...entry!,
          workingTreeSha256: undefined,
        }),
        false
      )
      assert.equal(
        isCheapLfsPayloadProvenStored({
          ...entry!,
          workingTreeSizeInBytes: undefined,
        }),
        false
      )
      assert.equal(
        isCheapLfsPayloadProvenStored({
          ...entry!,
          workingTreeSha256: 'd'.repeat(64),
        }),
        false
      )
      assert.equal(
        isCheapLfsPayloadProvenStored({
          ...entry!,
          workingTreeState: 'modified',
        }),
        false
      )
    } finally {
      await dispose()
    }
  })

  it('never proves an edited large file stored, even without a working-tree hash', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from('the original large payload\n'.repeat(64))
      await writeFile(join(dir, 'payload.bin'), payload)
      const pin = await pinRetaining(dir, repository, 'payload.bin', payload)
      await commitAll(dir, 'pin the payload')
      await restoreCheapLfsPinnedPayloads(repository, [pin])
      await discardCheapLfsRetainedPins([pin])

      // A real edit: different bytes and a different size, which is what the
      // size-mismatch shortcut classifies without ever hashing the file.
      await writeFile(
        join(dir, 'payload.bin'),
        Buffer.concat([payload, Buffer.from('and an edit appended\n')])
      )
      const entries = await listAllCheapLfsPointers(repository)
      const entry = entries.find(item => item.relativePath === 'payload.bin')
      assert.equal(entry?.workingTreeState, 'modified')
      assert.equal(isCheapLfsPayloadProvenStored(entry!), false)
    } finally {
      await dispose()
    }
  })

  it('refuses an OCI entry whose object digest cannot be compared', () => {
    const ociEntry = (object: string): ICheapLfsManagedPointerEntry =>
      ({
        kind: 'oci',
        relativePath: 'registry.bin',
        provider: 'ghcr',
        workingTreeState: 'materialized',
        workingTreeSizeInBytes: 12,
        workingTreeSha256: 'e'.repeat(64),
        pointer: {
          version: 'cheap-lfs-ghcr/v1',
          image: `ghcr.io/desktop/material@sha256:${'a'.repeat(64)}`,
          object,
          sizeInBytes: 12,
          layers: [`sha256:${'b'.repeat(64)}`],
        },
      } as unknown as ICheapLfsManagedPointerEntry)

    assert.equal(
      isCheapLfsPayloadProvenStored(ociEntry(`sha256:${'e'.repeat(64)}`)),
      true
    )
    // An un-prefixed or foreign-algorithm digest is not comparable to the
    // SHA-256 the scan proved, so it can never justify a drop.
    assert.equal(isCheapLfsPayloadProvenStored(ociEntry('e'.repeat(64))), false)
    assert.equal(
      isCheapLfsPayloadProvenStored(ociEntry(`sha512:${'e'.repeat(64)}`)),
      false
    )
  })
})

describe('cheap LFS commit restore wiring', () => {
  const source = readFileSync(
    join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
    'utf8'
  )

  function methodBody(start: string, end: string): string {
    const startIndex = source.indexOf(start)
    const endIndex = source.indexOf(end, startIndex + start.length)
    assert.notEqual(startIndex, -1, `missing ${start}`)
    assert.notEqual(endIndex, -1, `missing boundary ${end}`)
    return source.slice(startIndex, endIndex)
  }

  it('restores retained payloads after the commit and before the refresh', () => {
    const body = methodBody(
      'public async _commitIncludedChanges(',
      'private async discardRetainedCheapLfsPins('
    )
    const commit = body.indexOf('executeCommitPushBatches(')
    const restore = body.indexOf('this.restorePinnedCheapLfsPayloads(')
    const refresh = body.indexOf('this.refreshChangesSection(', restore)
    assert.ok(commit >= 0)
    assert.ok(restore > commit, 'restore must follow the commit batches')
    assert.ok(refresh > restore, 'restore must precede the changes refresh')
    assert.match(
      body,
      /retainedCheapLfsPins = pinResult\.retainedPins \?\? \[\]/
    )
    assert.match(
      body,
      /finally \{[\s\S]*this\.discardRetainedCheapLfsPins\(\s*retainedCheapLfsPins\s*\)/
    )
  })

  it('requires an explicit hash proof before dropping a path from the commit', () => {
    const body = methodBody(
      'private async autoPinLargeFilesBeforeCommit(',
      'private async discardRetainedCheapLfsPins('
    )
    assert.match(body, /\.filter\(isCheapLfsPayloadProvenStored\)/)
    assert.match(
      body,
      /const managedRawEntries = managedEntries\.filter\(\s*entry => !alreadyStoredPaths\.has\(entry\.relativePath\)\s*\)/
    )
    assert.match(
      body,
      /const pinSelectedPaths = selectedPaths\.filter\(\s*path => !alreadyStoredPaths\.has\(path\)\s*\)/
    )
    assert.match(body, /retainSourceForRestore: true/)

    const commitBody = methodBody(
      'public async _commitIncludedChanges(',
      'private async discardRetainedCheapLfsPins('
    )
    assert.match(
      commitBody,
      /for \(const path of alreadyStoredCheapLfsPaths\) \{\s*failedPaths\.add\(path\)/
    )
  })

  it('discards every retained copy the pin run did not hand back', () => {
    const body = methodBody(
      'private async autoPinLargeFilesBeforeCommit(',
      'private async discardRetainedCheapLfsPins('
    )
    assert.match(
      body,
      /finally \{[\s\S]*this\.discardRetainedCheapLfsPins\(\s*retainedUploadCopies\.filter\(pin => !handedOff\.has\(pin\.owned\)\)\s*\)/
    )
  })
})

describe('cheap LFS retained pin projection', () => {
  it('carries the exact committed pointer text for each retained payload', () => {
    const pointer = {
      version: CHEAP_LFS_POINTER_VERSION,
      releaseTag: 'assets',
      assetName: 'payload.bin',
      sizeInBytes: 12,
      sha256: 'f'.repeat(64),
    }
    const owned = {
      path: 'C:\\Temp\\payload',
      sizeInBytes: 12,
      sha256: 'f'.repeat(64),
    }
    const pins = cheapLfsRetainedPins([
      {
        relativePath: 'payload.bin',
        sizeInBytes: 12,
        result: {
          pointer,
          asset,
          releaseId: 7,
          retainedSource: { owned, sha256: 'f'.repeat(64), sizeInBytes: 12 },
        },
      },
      {
        relativePath: 'unretained.bin',
        sizeInBytes: 12,
        result: { pointer, asset, releaseId: 7 },
      },
    ] as never)

    assert.deepEqual(
      pins.map(pin => pin.relativePath),
      ['payload.bin']
    )
    assert.equal(pins[0].pointerText, serializeCheapLfsPointer(pointer))
    assert.deepEqual(parseCheapLfsPointer(pins[0].pointerText), pointer)
  })

  it('proves a restore through the very store the download path uses', async () => {
    const { dir, repository, dispose } = await gitRepository()
    try {
      const payload = Buffer.from('bytes proven by the shared store\n')
      await writeFile(join(dir, 'payload.bin'), payload)
      const pin = await pinRetaining(dir, repository, 'payload.bin', payload)
      await commitAll(dir, 'pin the payload')

      const proof = await defaultCheapLfsTrackedPathStore.proveDestination(
        dir,
        'payload.bin'
      )
      // A size that disagrees with the retained copy is refused exactly as a
      // truncated download is, and the pointer survives untouched.
      await assert.rejects(
        defaultCheapLfsTrackedPathStore.replaceFromPath(
          proof,
          pin.owned.path,
          pin.sha256,
          pin.sizeInBytes + 1
        ),
        /integrity proof/
      )
      assert.equal(
        await readFile(join(dir, 'payload.bin'), 'utf8'),
        pin.pointerText
      )

      assert.deepEqual(await discardCheapLfsRetainedPins([pin]), [])
    } finally {
      await dispose()
    }
  })
})
