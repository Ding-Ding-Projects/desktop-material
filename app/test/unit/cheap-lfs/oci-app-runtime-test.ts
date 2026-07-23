import assert from 'node:assert'
import { describe, it } from 'node:test'
import type { IAPIFullRepository } from '../../../src/lib/api'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import {
  ICheapLfsOciAppRuntimeDependencies,
  withCheapLfsOciRuntimeForRepository,
} from '../../../src/lib/cheap-lfs/oci-app-runtime'
import { CheapLfsGhcrTransportError } from '../../../src/lib/cheap-lfs/ghcr-oras-transport'
import {
  CHEAP_LFS_GHCR_POINTER_VERSION,
  ICheapLfsGhcrPointer,
  serializeCheapLfsGhcrPointer,
} from '../../../src/lib/cheap-lfs/ghcr-pointer'
import {
  ICheapLfsOciStoredPointer,
  ICheapLfsStoredPointer,
} from '../../../src/lib/cheap-lfs/oci-operations'
import { Account } from '../../../src/models/account'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'

function apiRepository(isPrivate: boolean): IAPIFullRepository {
  return {
    id: 42,
    clone_url: 'https://github.com/Octo/Project.git',
    ssh_url: 'git@github.com:Octo/Project.git',
    html_url: 'https://github.com/Octo/Project',
    name: 'Project',
    owner: {
      id: 7,
      login: 'Octo',
      avatar_url: 'https://avatars.example/octo',
      html_url: 'https://github.com/Octo',
      type: 'User',
    },
    private: isPrivate,
    fork: false,
    default_branch: 'main',
    pushed_at: '2026-07-22T00:00:00Z',
    has_issues: true,
    archived: false,
    parent: undefined,
    permissions: { admin: false, push: true, pull: true },
  }
}

function localRepository(isPrivate: boolean): Repository {
  return new Repository(
    'C:\\work\\Project',
    1,
    new GitHubRepository(
      'Project',
      new Owner('Octo', getDotComAPIEndpoint(), 7, 'User'),
      1,
      isPrivate,
      'https://github.com/Octo/Project',
      'https://github.com/Octo/Project.git',
      true,
      false,
      'write'
    ),
    false
  )
}

function account(): Account {
  return new Account(
    'Octo',
    getDotComAPIEndpoint(),
    'github-token',
    [],
    '',
    7,
    'Octo'
  )
}

function dependencies(
  isPrivate: boolean,
  token: Buffer,
  dockerCredentialsError: Error | null = null,
  options: {
    readonly dockerUsername?: string
    readonly storedPointers?: ReadonlyArray<ICheapLfsStoredPointer>
  } = {}
): ICheapLfsOciAppRuntimeDependencies {
  return {
    apiFor: () => ({
      fetchRepository: async () => apiRepository(isPrivate),
      fetchGitHubContainerPackageMetadata: async () => null,
    }),
    resolveOras: async () => ({
      available: true,
      path: 'C:\\trusted\\oras.exe',
      sha256: `sha256:${'a'.repeat(64)}`,
      source: 'packaged',
      architecture: 'x64',
    }),
    resolveGhcrCredentials: () => ({ username: 'Octo', token }),
    resolveDockerHubCredentials: async () => {
      if (dockerCredentialsError !== null) {
        throw dockerCredentialsError
      }
      return { username: options.dockerUsername ?? 'docker-octo', token }
    },
    listStoredPointers: async () => options.storedPointers ?? [],
    publish: async () => {
      throw new Error('not called')
    },
    pull: async () => {
      throw new Error('not called') as never
    },
  }
}

function dockerHubStoredPointer(
  registryRepository: string,
  relativePath: string = 'shared.bin'
): ICheapLfsOciStoredPointer {
  const pointer: ICheapLfsGhcrPointer = {
    version: CHEAP_LFS_GHCR_POINTER_VERSION,
    image: `${registryRepository}@sha256:${'a'.repeat(64)}`,
    object: `sha256:${'b'.repeat(64)}`,
    sizeInBytes: 42,
    layers: [`sha256:${'c'.repeat(64)}`],
  }
  return {
    backend: 'oci',
    provider: 'docker-hub',
    relativePath,
    text: serializeCheapLfsGhcrPointer(pointer),
    pointer,
    workingTreeState: 'pointer',
    metadataSource: 'head',
  }
}

function ghcrStoredPointer(
  registryRepository: string,
  relativePath: string = 'old-provider.bin'
): ICheapLfsOciStoredPointer {
  const docker = dockerHubStoredPointer(registryRepository, relativePath)
  return { ...docker, provider: 'ghcr' }
}

describe('Cheap LFS app OCI runtime', () => {
  it('derives exact private GHCR context and clears credentials on failure', async () => {
    const token = Buffer.from('secret-token')
    const expected = new Error('operation failed')
    await assert.rejects(
      withCheapLfsOciRuntimeForRepository(
        {
          repository: localRepository(true),
          account: account(),
          provider: 'ghcr',
          parallelBlobTransfers: true,
        },
        async session => {
          assert.deepStrictEqual(session.context, {
            repositoryPath: 'C:\\work\\Project',
            repositoryIdentity: 'github.com/repositories/42',
            sourceRepositoryUrl: 'https://github.com/octo/project',
            visibility: 'verified-private',
            provider: 'ghcr',
            registryRepository: 'ghcr.io/octo/project-cheap-lfs',
            parallelBlobTransfers: true,
          })
          assert.equal(
            token.some(byte => byte !== 0),
            true
          )
          throw expected
        },
        dependencies(true, token)
      ),
      error => error === expected
    )
    assert.equal(
      token.every(byte => byte === 0),
      true
    )
  })

  it('turns a redacted GHCR command rejection into actionable package-auth guidance', async () => {
    const token = Buffer.from('package-token')
    const deps: ICheapLfsOciAppRuntimeDependencies = {
      ...dependencies(true, token),
      publish: async () => {
        throw new CheapLfsGhcrTransportError(
          'process-failed',
          'The packaged ORAS process failed.'
        )
      },
    }

    await assert.rejects(
      withCheapLfsOciRuntimeForRepository(
        {
          repository: localRepository(true),
          account: account(),
          provider: 'ghcr',
          parallelBlobTransfers: true,
        },
        async session =>
          await session.runtime.publish({
            image: {} as never,
            provider: 'ghcr',
            registryRepository: session.context.registryRepository,
            repositoryIdentity: session.context.repositoryIdentity,
            visibility: 'private',
            parallelBlobUploads: true,
            keyCreated: false,
            keyRelativePath: null,
            attempt: 1,
          }),
        deps
      ),
      error =>
        error instanceof Error &&
        /Reauthorize the selected GitHub\.com account for package access/.test(
          error.message
        ) &&
        /published Release or Docker Hub/.test(error.message) &&
        !error.message.includes('package-token')
    )
    assert.equal(
      token.every(byte => byte === 0),
      true
    )
  })

  it('opens a public GHCR restore session without account credentials', async () => {
    const token = Buffer.from('unused')
    const result = await withCheapLfsOciRuntimeForRepository(
      {
        repository: localRepository(false),
        account: null,
        provider: 'ghcr',
        parallelBlobTransfers: false,
      },
      async session => session.context.visibility,
      dependencies(false, token)
    )
    assert.equal(result, 'verified-public')
    assert.equal(token.toString('utf8'), 'unused')
  })

  it('keeps public Docker Hub clone repair available without Docker Desktop', async () => {
    const token = Buffer.from('unused')
    const target = await withCheapLfsOciRuntimeForRepository(
      {
        repository: localRepository(false),
        account: null,
        provider: 'docker-hub',
        parallelBlobTransfers: true,
      },
      async session => session.context.registryRepository,
      dependencies(false, token, new Error('Docker Desktop is unavailable'))
    )
    assert.equal(target, 'docker.io/octo/project-cheap-lfs')
  })

  it('defaults the first Docker Hub upload target to the credential namespace', async () => {
    const token = Buffer.from('first-upload-secret')
    const target = await withCheapLfsOciRuntimeForRepository(
      {
        repository: localRepository(false),
        account: account(),
        provider: 'docker-hub',
        parallelBlobTransfers: true,
      },
      async session => session.context.registryRepository,
      dependencies(false, token, null, {
        dockerUsername: 'first-uploader',
      })
    )

    assert.equal(target, 'docker.io/first-uploader/project-cheap-lfs')
  })

  it('reuses one Docker Hub organization target for different collaborators', async () => {
    const registryRepository = 'docker.io/shared-builders/project-cheap-lfs'
    const storedPointers = [dockerHubStoredPointer(registryRepository)]
    for (const dockerUsername of ['alice-builder', 'bob-builder']) {
      const token = Buffer.from(`${dockerUsername}-secret`)
      const target = await withCheapLfsOciRuntimeForRepository(
        {
          repository: localRepository(false),
          account: account(),
          provider: 'docker-hub',
          parallelBlobTransfers: true,
        },
        async session => session.context.registryRepository,
        dependencies(false, token, null, {
          dockerUsername,
          storedPointers,
        })
      )

      assert.equal(target, registryRepository)
      assert.equal(
        token.every(byte => byte === 0),
        true
      )
    }
  })

  it('reuses the requested provider target during partial migration recovery', async () => {
    const dockerRepository = 'docker.io/shared-builders/project-cheap-lfs'
    const storedPointers = [
      ghcrStoredPointer(
        'ghcr.io/octo/project-cheap-lfs',
        'still-materialized.bin'
      ),
      dockerHubStoredPointer(dockerRepository, 'already-migrated.bin'),
    ]
    const token = Buffer.from('migration-retry-secret')

    const target = await withCheapLfsOciRuntimeForRepository(
      {
        repository: localRepository(false),
        account: account(),
        provider: 'docker-hub',
        parallelBlobTransfers: true,
      },
      async session => session.context.registryRepository,
      dependencies(false, token, null, {
        dockerUsername: 'different-collaborator',
        storedPointers,
      })
    )

    assert.equal(target, dockerRepository)
  })

  it('still rejects conflicting repositories within one provider', async () => {
    const token = Buffer.from('conflicting-target-secret')
    await assert.rejects(
      withCheapLfsOciRuntimeForRepository(
        {
          repository: localRepository(false),
          account: account(),
          provider: 'docker-hub',
          parallelBlobTransfers: true,
        },
        async session => session.context.registryRepository,
        dependencies(false, token, null, {
          storedPointers: [
            dockerHubStoredPointer(
              'docker.io/first/project-cheap-lfs',
              'first.bin'
            ),
            dockerHubStoredPointer(
              'docker.io/second/project-cheap-lfs',
              'second.bin'
            ),
          ],
        })
      ),
      /one registry repository per provider/i
    )
  })
})
