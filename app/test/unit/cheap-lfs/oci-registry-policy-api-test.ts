import assert from 'node:assert'
import { describe, it } from 'node:test'
import type { IAPIFullRepository } from '../../../src/lib/api'
import {
  DockerHubCheapLfsRegistryRepositoryPolicyApi,
  GhcrCheapLfsRegistryRepositoryPolicyApi,
  GitHubCheapLfsSourceRepositoryPolicyApi,
  ICheapLfsGitHubPolicyApi,
  ICheapLfsRegistryPolicyFetch,
} from '../../../src/lib/cheap-lfs/oci-registry-policy-api'
import {
  CheapLfsGhcrPolicyPendingError,
  CheapLfsRegistryRuntimeError,
} from '../../../src/lib/cheap-lfs/oci-registry-runtime'
import { readBoundedRegistryPolicyJson } from '../../../src/lib/cheap-lfs/registry-policy-response'

function repository(
  values: Partial<IAPIFullRepository> = {}
): IAPIFullRepository {
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
    private: true,
    fork: false,
    default_branch: 'main',
    pushed_at: '2026-07-22T00:00:00Z',
    has_issues: true,
    archived: false,
    parent: undefined,
    permissions: { admin: false, push: true, pull: true },
    ...values,
  }
}

class FakeGitHubPolicyApi implements ICheapLfsGitHubPolicyApi {
  public readonly packageRequests: Array<{
    readonly owner: string
    readonly packageName: string
    readonly ownerKind: string
  }> = []
  public readonly packageSignals: Array<AbortSignal | undefined> = []

  public constructor(
    public source: IAPIFullRepository | null = repository(),
    public packageValue: unknown | null = {
      id: 9,
      name: 'project-cheap-lfs',
      package_type: 'container',
      visibility: 'private',
      repository: {
        id: 42,
        name: 'Project',
        full_name: 'Octo/Project',
        private: true,
      },
    }
  ) {}

  public async fetchRepository() {
    return this.source
  }

  public async fetchGitHubContainerPackageMetadata(
    owner: string,
    packageName: string,
    ownerKind: 'authenticated-user' | 'organization' | 'user',
    signal?: AbortSignal
  ) {
    this.packageRequests.push({ owner, packageName, ownerKind })
    this.packageSignals.push(signal)
    return this.packageValue
  }
}

describe('Cheap LFS registry policy APIs', () => {
  it('requires the authoritative source id, visibility, and write access', async () => {
    const api = new FakeGitHubPolicyApi()
    const source = new GitHubCheapLfsSourceRepositoryPolicyApi(api)
    assert.deepStrictEqual(
      await source.inspectSourceRepository({
        repositoryId: 42,
        owner: 'Octo',
        name: 'Project',
      }),
      {
        repositoryIdentity: 'github.com/repositories/42',
        repositoryUrl: 'https://github.com/octo/project',
        owner: 'Octo',
        name: 'Project',
        visibility: 'private',
        access: 'write',
      }
    )

    api.source = repository({ id: 43 })
    await assert.rejects(
      source.inspectSourceRepository({
        repositoryId: 42,
        owner: 'Octo',
        name: 'Project',
      }),
      /could not verify source repository access/
    )
  })

  it('requires an exact GHCR source link and matching package visibility', async () => {
    const api = new FakeGitHubPolicyApi()
    const policy = new GhcrCheapLfsRegistryRepositoryPolicyApi(
      api,
      { repositoryId: 42, owner: 'Octo', name: 'Project' },
      'Octo'
    )
    const controller = new AbortController()
    assert.deepStrictEqual(
      await policy.inspectRegistryRepository(
        {
          provider: 'ghcr',
          registryRepository: 'ghcr.io/octo/project-cheap-lfs',
        },
        controller.signal
      ),
      {
        visibility: 'private',
        hasPushAccess: true,
        linkedRepositoryIdentity: 'github.com/repositories/42',
        linkedRepositoryUrl: 'https://github.com/octo/project',
      }
    )
    assert.deepStrictEqual(api.packageRequests, [
      {
        owner: 'Octo',
        packageName: 'project-cheap-lfs',
        ownerKind: 'authenticated-user',
      },
    ])
    assert.deepStrictEqual(api.packageSignals, [controller.signal])

    api.packageValue = {
      id: 9,
      name: 'project-cheap-lfs',
      package_type: 'container',
      visibility: 'private',
      repository: null,
    }
    await assert.rejects(
      policy.inspectRegistryRepository({
        provider: 'ghcr',
        registryRepository: 'ghcr.io/octo/project-cheap-lfs',
      }),
      CheapLfsGhcrPolicyPendingError
    )
  })

  it('classifies only missing or unlinked post-publish GHCR metadata as pending', async () => {
    const api = new FakeGitHubPolicyApi(repository(), null)
    const policy = new GhcrCheapLfsRegistryRepositoryPolicyApi(
      api,
      { repositoryId: 42, owner: 'Octo', name: 'Project' },
      'Octo'
    )
    const target = {
      provider: 'ghcr' as const,
      registryRepository: 'ghcr.io/octo/project-cheap-lfs',
    }

    await assert.rejects(
      policy.inspectRegistryRepository(target),
      CheapLfsGhcrPolicyPendingError
    )

    api.packageValue = {
      id: 9,
      name: 'project-cheap-lfs',
      package_type: 'container',
      visibility: 'private',
      repository: {
        id: 99,
        name: 'Other',
        full_name: 'Octo/Other',
        private: true,
      },
    }
    await assert.rejects(
      policy.inspectRegistryRepository(target),
      (error: unknown) =>
        error instanceof CheapLfsRegistryRuntimeError &&
        !(error instanceof CheapLfsGhcrPolicyPendingError) &&
        error.kind === 'policy'
    )

    api.packageValue = {
      id: 9,
      name: 'project-cheap-lfs',
      package_type: 'container',
      visibility: 'public',
      repository: {
        id: 42,
        name: 'Project',
        full_name: 'Octo/Project',
        private: false,
      },
    }
    const stableVisibilityMismatch = await policy.inspectRegistryRepository(
      target
    )
    assert.equal(stableVisibilityMismatch.visibility, 'public')
  })

  it('fails before a first public GHCR upload but permits a first private package', async () => {
    const publicApi = new FakeGitHubPolicyApi(
      repository({ private: false }),
      null
    )
    const publicPolicy = new GhcrCheapLfsRegistryRepositoryPolicyApi(
      publicApi,
      { repositoryId: 42, owner: 'Octo', name: 'Project' },
      'Octo'
    )
    await assert.rejects(
      publicPolicy.preflightRegistryRepository(
        {
          provider: 'ghcr',
          registryRepository: 'ghcr.io/octo/project-cheap-lfs',
        },
        'public'
      ),
      /GitHub creates a first GHCR package as private/
    )

    const privatePolicy = new GhcrCheapLfsRegistryRepositoryPolicyApi(
      new FakeGitHubPolicyApi(repository({ private: true }), null),
      { repositoryId: 42, owner: 'Octo', name: 'Project' },
      'Octo'
    )
    await privatePolicy.preflightRegistryRepository(
      {
        provider: 'ghcr',
        registryRepository: 'ghcr.io/octo/project-cheap-lfs',
      },
      'private'
    )
  })

  it('creates one Docker Hub repository with matching private visibility', async () => {
    const calls: Array<{
      readonly url: string
      readonly method: string
      readonly authorization: string | null
      readonly body: string
    }> = []
    let repositoryExists = false
    const fetcher: ICheapLfsRegistryPolicyFetch = async (url, init) => {
      const headers = new Headers(init.headers)
      const body =
        init.body === undefined || init.body === null
          ? ''
          : Buffer.from(init.body as Uint8Array).toString('utf8')
      calls.push({
        url,
        method: init.method ?? 'GET',
        authorization: headers.get('Authorization'),
        body,
      })
      if (url.endsWith('/v2/auth/token')) {
        return Response.json({ access_token: 'short-lived-bearer' })
      }
      if (init.method === 'POST') {
        repositoryExists = true
        return Response.json({ ok: true }, { status: 201 })
      }
      if (!repositoryExists) {
        return new Response(null, { status: 404 })
      }
      return Response.json({
        name: 'project-cheap-lfs',
        namespace: 'octo',
        is_private: true,
        permissions: { read: true, write: true, admin: false },
      })
    }
    const credentials = {
      username: 'octo',
      token: Buffer.from('docker-secret'),
    }
    const policy = new DockerHubCheapLfsRegistryRepositoryPolicyApi(
      credentials,
      fetcher,
      5_000
    )
    assert.deepStrictEqual(
      await policy.ensureRegistryRepository(
        'docker.io/octo/project-cheap-lfs',
        'private'
      ),
      {
        visibility: 'private',
        hasPushAccess: true,
        linkedRepositoryIdentity: null,
        linkedRepositoryUrl: null,
      }
    )
    assert.equal(
      calls.some(call => call.url.includes('docker-secret')),
      false
    )
    assert.match(calls[0].body, /docker-secret/)
    assert.equal(calls[1].authorization, 'Bearer short-lived-bearer')
    assert.match(calls[2].body, /"is_private":true/)
  })

  it('rejects a Docker Hub visibility mismatch', async () => {
    const fetcher: ICheapLfsRegistryPolicyFetch = async (url, init) =>
      url.endsWith('/v2/auth/token')
        ? Response.json({ access_token: 'bearer' })
        : Response.json({
            name: 'project-cheap-lfs',
            namespace: 'octo',
            is_private: false,
            permissions: { read: true, write: true, admin: false },
          })
    const policy = new DockerHubCheapLfsRegistryRepositoryPolicyApi(
      { username: 'octo', token: Buffer.from('secret') },
      fetcher,
      5_000
    )
    await assert.rejects(
      policy.ensureRegistryRepository(
        'docker.io/octo/project-cheap-lfs',
        'private'
      ),
      /could not verify source repository access/
    )
  })

  it('keeps the Docker policy timeout active while the response body stalls', async () => {
    const encoder = new TextEncoder()
    const fetcher: ICheapLfsRegistryPolicyFetch = async url =>
      url.endsWith('/v2/auth/token')
        ? Response.json({ access_token: 'bearer' })
        : new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(encoder.encode('{"name":'))
              },
            })
          )
    const policy = new DockerHubCheapLfsRegistryRepositoryPolicyApi(
      { username: 'octo', token: Buffer.from('secret') },
      fetcher,
      1_000
    )
    const started = Date.now()
    await assert.rejects(
      policy.inspectRegistryRepository({
        provider: 'docker-hub',
        registryRepository: 'docker.io/octo/project-cheap-lfs',
      }),
      /could not verify source repository access/
    )
    assert(Date.now() - started < 2_500)
  })

  it('aborts bounded policy JSON before buffering an oversized response', async () => {
    await assert.rejects(
      readBoundedRegistryPolicyJson(
        new Response('x'.repeat(65), {
          headers: { 'Content-Length': '65' },
        }),
        undefined,
        64
      ),
      /exceeded its size limit/
    )
  })
})
