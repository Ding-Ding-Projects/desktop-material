import assert from 'node:assert'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  AppStore,
  cheapLfsOciCommitProgress,
  projectCheapLfsMaterializedStatus,
  probeCheapLfsDockerHubCapability,
} from '../../../src/lib/stores/app-store'
import {
  CHEAP_LFS_POINTER_VERSION,
  serializeCheapLfsPointer,
} from '../../../src/lib/cheap-lfs/pointer'
import {
  CHEAP_LFS_OCI_POINTER_VERSION,
  ICheapLfsGhcrPointer,
  serializeCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'
import { Repository } from '../../../src/models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import type { IStatusResult } from '../../../src/lib/git/status'
import { defaultBuildRunPreferences } from '../../../src/models/build-run-preferences'
import type { ICheapLfsManagedPointerEntry } from '../../../src/lib/cheap-lfs/operations'
import { createTempDirectory } from '../../helpers/temp'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'

describe('AppStore Cheap LFS OCI routing', () => {
  it('preserves all active OCI upload lanes for commit progress', () => {
    const activeFiles = [
      {
        relativePath: 'zeta.bin',
        objectSha256: 'a'.repeat(64),
        totalBytes: 30,
      },
      {
        relativePath: 'alpha.bin',
        objectSha256: 'b'.repeat(64),
        totalBytes: 20,
      },
      {
        relativePath: 'middle.bin',
        objectSha256: 'c'.repeat(64),
        totalBytes: 10,
      },
    ].map(file => ({ ...file, processedBytes: 0 }))
    const progress = cheapLfsOciCommitProgress(
      {
        phase: 'publishing',
        currentPath: null,
        activeFiles,
        completedFiles: 0,
        totalFiles: 3,
        attempt: 1,
        maximumChunkBytes: 1024,
      },
      new Map(activeFiles.map(file => [file.relativePath, file.totalBytes]))
    )

    assert.equal(progress.currentPath, 'zeta.bin')
    assert.deepEqual(
      progress.activeFiles?.map(file => ({
        relativePath: file.relativePath,
        phase: file.phase,
        processedBytes: file.processedBytes,
        totalBytes: file.totalBytes,
      })),
      [
        {
          relativePath: 'zeta.bin',
          phase: 'uploading',
          processedBytes: 0,
          totalBytes: 30,
        },
        {
          relativePath: 'alpha.bin',
          phase: 'uploading',
          processedBytes: 0,
          totalBytes: 20,
        },
        {
          relativePath: 'middle.bin',
          phase: 'uploading',
          processedBytes: 0,
          totalBytes: 10,
        },
      ]
    )
  })

  it('suppresses only cryptographically verified materialized status entries', () => {
    const selection = DiffSelection.fromInitialSelection(DiffSelectionType.All)
    const status = {
      workingDirectory: WorkingDirectoryStatus.fromFiles([
        new WorkingDirectoryFileChange(
          'verified.bin',
          { kind: AppFileStatusKind.Modified },
          selection
        ),
        new WorkingDirectoryFileChange(
          'edited.bin',
          { kind: AppFileStatusKind.Modified },
          selection
        ),
      ]),
    } as IStatusResult
    const basePointer: ICheapLfsGhcrPointer = {
      version: CHEAP_LFS_OCI_POINTER_VERSION,
      image: `ghcr.io/owner/repo@sha256:${'1'.repeat(64)}`,
      object: `sha256:${'2'.repeat(64)}`,
      sizeInBytes: 12,
      layers: [`sha256:${'3'.repeat(64)}`],
    }
    const entries: ReadonlyArray<ICheapLfsManagedPointerEntry> = [
      {
        kind: 'oci',
        provider: 'ghcr',
        relativePath: 'verified.bin',
        pointer: basePointer,
        workingTreeState: 'materialized',
      },
      {
        kind: 'oci',
        provider: 'ghcr',
        relativePath: 'edited.bin',
        pointer: basePointer,
        workingTreeState: 'modified',
      },
    ]

    const projected = projectCheapLfsMaterializedStatus(status, entries)
    assert.deepEqual(
      projected.workingDirectory.files.map(file => file.path),
      ['edited.bin']
    )
  })

  it('probes Docker Hub capability without retaining its credential', async () => {
    const token = Buffer.from('temporary-docker-token')
    let cleared = false
    assert.equal(
      await probeCheapLfsDockerHubCapability(
        async () => ({ username: 'docker_user', token }),
        credentials => {
          credentials.token.fill(0)
          cleared = true
        }
      ),
      true
    )
    assert.equal(cleared, true)
    assert.equal(
      token.every(value => value === 0),
      true
    )
    assert.equal(
      await probeCheapLfsDockerHubCapability(async () => {
        throw new Error('not configured')
      }),
      false
    )
  })

  it('builds an anonymous restore session from the committed pointer provider', async () => {
    const repository = new Repository('C:/public-oci', 89, null, false)
    const entry: ICheapLfsManagedPointerEntry = {
      kind: 'oci',
      provider: 'docker-hub',
      relativePath: 'public.bin',
      workingTreeState: 'pointer',
      pointer: {
        version: CHEAP_LFS_OCI_POINTER_VERSION,
        image: `docker.io/owner/repo-cheap-lfs@sha256:${'2'.repeat(64)}`,
        object: `sha256:${'3'.repeat(64)}`,
        sizeInBytes: 19,
        layers: [`sha256:${'4'.repeat(64)}`],
      },
    }
    let account: unknown = 'not-called'
    let provider: unknown = null
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      accounts: [],
      cheapLfsOciSessionRunner: async (options: {
        readonly account: unknown
        readonly provider: unknown
      }) => {
        account = options.account
        provider = options.provider
        return {
          provider: 'docker-hub',
          relativePath: entry.relativePath,
          objectSha256: '3'.repeat(64),
          sizeInBytes: entry.pointer.sizeInBytes,
        }
      },
    })
    const testStore = store as unknown as {
      materializeCheapLfsEntry(
        repository: Repository,
        entry: ICheapLfsManagedPointerEntry
      ): Promise<{ readonly path: string; readonly bytes: number }>
    }

    const result = await testStore.materializeCheapLfsEntry(repository, entry)

    assert.equal(account, null)
    assert.equal(provider, 'docker-hub')
    assert.equal(result.bytes, 19)
  })

  it('does not download an already verified materialized entry again', async () => {
    const repository = new Repository('C:/materialized-oci', 93, null, false)
    const entry: ICheapLfsManagedPointerEntry = {
      kind: 'oci',
      provider: 'ghcr',
      relativePath: 'already-local.bin',
      workingTreeState: 'materialized',
      pointer: {
        version: CHEAP_LFS_OCI_POINTER_VERSION,
        image: `ghcr.io/owner/repo-cheap-lfs@sha256:${'5'.repeat(64)}`,
        object: `sha256:${'6'.repeat(64)}`,
        sizeInBytes: 23,
        layers: [`sha256:${'7'.repeat(64)}`],
      },
    }
    let sessions = 0
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      cheapLfsOciSessionRunner: async () => {
        sessions++
        throw new Error('must not download')
      },
    })
    const testStore = store as unknown as {
      materializeCheapLfsEntry(
        repository: Repository,
        entry: ICheapLfsManagedPointerEntry
      ): Promise<{ readonly path: string; readonly bytes: number }>
    }

    const result = await testStore.materializeCheapLfsEntry(repository, entry)

    assert.equal(sessions, 0)
    assert.equal(result.bytes, 23)
    assert.equal(result.path, join(repository.path, 'already-local.bin'))
  })

  it('includes Release and OCI pointers for signed-out public clone repair', async t => {
    const root = await createTempDirectory(t)
    await writeFile(
      join(root, 'release.ptr'),
      serializeCheapLfsPointer({
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'assets',
        assetName: 'release.bin',
        sizeInBytes: 11,
        sha256: 'a'.repeat(64),
      })
    )
    await writeFile(
      join(root, 'registry.ptr'),
      serializeCheapLfsGhcrPointer({
        version: CHEAP_LFS_OCI_POINTER_VERSION,
        image: `ghcr.io/owner/repo-cheap-lfs@sha256:${'e'.repeat(64)}`,
        object: `sha256:${'f'.repeat(64)}`,
        sizeInBytes: 17,
        layers: [`sha256:${'1'.repeat(64)}`],
      })
    )
    const repository = new Repository(
      root,
      90,
      new GitHubRepository(
        'material',
        new Owner('desktop', 'https://api.github.com', 1),
        90,
        false
      ),
      false
    )
    let routed: ReadonlyArray<ICheapLfsManagedPointerEntry> = []
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      accounts: [],
      cheapLfsMaterializeControllers: new Map<number, AbortController>(),
      runCheapLfsMaterialize: async (
        _repository: Repository,
        entries: ReadonlyArray<ICheapLfsManagedPointerEntry>
      ) => {
        routed = entries
      },
    })

    await store.maybeAutoMaterializeCheapLfs(repository)

    assert.deepEqual(
      routed.map(entry => [entry.relativePath, entry.kind]),
      [
        ['registry.ptr', 'oci'],
        ['release.ptr', 'release'],
      ]
    )
  })

  it('keeps signed-out private and unknown Release pointers gated', async t => {
    for (const [index, isPrivate] of [true, null].entries()) {
      const root = await createTempDirectory(t)
      await writeFile(
        join(root, `release-${index}.ptr`),
        serializeCheapLfsPointer({
          version: CHEAP_LFS_POINTER_VERSION,
          releaseTag: 'assets',
          assetName: 'release.bin',
          sizeInBytes: 11,
          sha256: 'a'.repeat(64),
        })
      )
      const repository = new Repository(
        root,
        190 + index,
        new GitHubRepository(
          'material',
          new Owner('desktop', 'https://api.github.com', 1),
          190 + index,
          isPrivate
        ),
        false
      )
      let materializeRuns = 0
      const store = Object.create(AppStore.prototype) as AppStore
      Object.assign(store, {
        accounts: [],
        cheapLfsMaterializeControllers: new Map<number, AbortController>(),
        runCheapLfsMaterialize: async () => {
          materializeRuns++
        },
      })

      await store.maybeAutoMaterializeCheapLfs(repository)

      assert.equal(materializeRuns, 0)
    }
  })

  it('materializes mixed Release and OCI pointers through their discovered entries', async t => {
    const root = await createTempDirectory(t)
    await writeFile(
      join(root, 'release.ptr'),
      serializeCheapLfsPointer({
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: 'assets',
        assetName: 'release.bin',
        sizeInBytes: 11,
        sha256: 'a'.repeat(64),
      })
    )
    await writeFile(
      join(root, 'registry.ptr'),
      serializeCheapLfsGhcrPointer({
        version: CHEAP_LFS_OCI_POINTER_VERSION,
        image: `ghcr.io/owner/repo-cheap-lfs@sha256:${'b'.repeat(64)}`,
        object: `sha256:${'c'.repeat(64)}`,
        sizeInBytes: 13,
        layers: [`sha256:${'d'.repeat(64)}`],
      })
    )
    const repository = new Repository(root, 91, null, false)
    const routed = new Array<{
      readonly path: string
      readonly kind: ICheapLfsManagedPointerEntry['kind']
    }>()
    let refreshes = 0
    let notified = false
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      cheapLfsMaterializeControllers: new Map<number, AbortController>(),
      isTemporaryRepositoryActive: () => true,
      withTemporaryRepositoryMutationGuard: async (
        _repository: Repository,
        operation: () => Promise<unknown>
      ) => await operation(),
      materializeCheapLfsEntry: async (
        _repository: Repository,
        entry: ICheapLfsManagedPointerEntry
      ) => {
        routed.push({ path: entry.relativePath, kind: entry.kind })
        return {
          path: join(root, entry.relativePath),
          bytes: entry.pointer.sizeInBytes,
        }
      },
      _refreshRepository: async () => {
        refreshes++
      },
      postCheapLfsMaterializeNotification: () => {
        notified = true
      },
    })

    await store._materializeAllCheapLfsPointers(repository)

    assert.deepEqual(routed, [
      { path: 'registry.ptr', kind: 'oci' },
      { path: 'release.ptr', kind: 'release' },
    ])
    assert.equal(refreshes, 1)
    assert.equal(notified, true)
  })

  it('fails closed when an OCI manual pin does not name its selected working-tree file', async t => {
    const root = await createTempDirectory(t)
    const repository = new Repository(
      root,
      92,
      null,
      false,
      null,
      {},
      false,
      undefined,
      null,
      {
        ...defaultBuildRunPreferences,
        cheapLfsStorageProvider: 'ghcr',
      }
    )
    let sessionStarted = false
    let refreshes = 0
    const store = Object.create(AppStore.prototype) as AppStore
    Object.assign(store, {
      cheapLfsOciSessionRunner: async () => {
        sessionStarted = true
      },
      _refreshRepository: async () => {
        refreshes++
      },
    })

    await assert.rejects(
      store._pinFileToRelease(repository, {
        absoluteFilePath: join(root, 'chosen.bin'),
        trackedRelativePath: 'different.bin',
        releaseTag: '',
      }),
      /existing file at its tracked repository path/
    )
    assert.equal(sessionStarted, false)
    assert.equal(refreshes, 1)
  })
})
