import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  API,
  GitHubDotComRESTAPIVersion,
  GitHubRESTAPIVersionHeader,
} from '../../src/lib/api'
import {
  GitHubPackageOwner,
  GitHubPackagePageSize,
  GitHubPackageTypes,
} from '../../src/lib/github-packages'

const packageFixture = (packageType: string) => ({
  id: 7,
  name: 'desktop-material',
  package_type: packageType,
  visibility: 'public',
  version_count: 1,
  repository: null,
  created_at: '2026-07-26T10:00:00Z',
  updated_at: '2026-07-26T10:01:00Z',
  url: `https://api.github.com/user/packages/${packageType}/desktop-material`,
  html_url: `https://github.com/users/octocat/packages/${packageType}/desktop-material`,
})

const versionFixture = (packageType: string) => ({
  id: 11,
  name: '1.0.0',
  created_at: '2026-07-26T10:00:00Z',
  updated_at: '2026-07-26T10:01:00Z',
  url: `https://api.github.com/user/packages/${packageType}/desktop-material/versions/11`,
  package_html_url: `https://github.com/users/octocat/packages/${packageType}/desktop-material`,
  html_url: `https://github.com/users/octocat/packages/${packageType}/desktop-material?version=11`,
  metadata: { package_type: packageType },
})

describe('GitHub Packages API', () => {
  it('lists all six ecosystems with bounded page inputs', async () => {
    const api = new API('https://api.github.com', 'secret-token')
    const controller = new AbortController()
    const requests = new Array<{
      method: string
      path: string
      signal?: AbortSignal
      accept: string | null
    }>()
    Reflect.set(
      api,
      'ghRequest',
      async (
        method: string,
        path: string,
        options?: { signal?: AbortSignal; customHeaders?: HeadersInit }
      ) => {
        requests.push({
          method,
          path,
          signal: options?.signal,
          accept: new Headers(options?.customHeaders).get('accept'),
        })
        const packageType = new URL(
          `https://api.example.test/${path}`
        ).searchParams.get('package_type')!
        return new Response(JSON.stringify([packageFixture(packageType)]))
      }
    )

    for (const packageType of GitHubPackageTypes) {
      const result = await api.fetchGitHubPackages(
        { kind: 'authenticated-user' },
        packageType,
        2,
        controller.signal
      )
      assert.equal(result.packages[0].packageType, packageType)
    }

    assert.equal(requests.length, 6)
    for (const [index, request] of requests.entries()) {
      assert.deepEqual(request, {
        method: 'GET',
        path: `user/packages?package_type=${GitHubPackageTypes[index]}&per_page=${GitHubPackagePageSize}&page=2`,
        signal: controller.signal,
        accept: 'application/vnd.github+json',
      })
    }
    await assert.rejects(() =>
      api.fetchGitHubPackages({ kind: 'authenticated-user' }, 'npm', 0)
    )
  })

  it('routes organization/user owners and safely encodes exact version names', async () => {
    const api = new API('https://api.github.com', 'secret-token')
    const paths = new Array<string>()
    Reflect.set(api, 'ghRequest', async (_method: string, path: string) => {
      paths.push(path)
      const packageType = path.split('/packages/')[1].split('/')[0]
      return new Response(JSON.stringify([versionFixture(packageType)]), {
        headers: {
          Link: '<https://api.github.com/next>; rel="next"',
        },
      })
    })
    const owners: ReadonlyArray<GitHubPackageOwner> = [
      { kind: 'organization', login: 'Ding-Ding-Projects' },
      { kind: 'user', login: 'octocat' },
    ]

    const organization = await api.fetchGitHubPackageVersions(
      owners[0],
      'container',
      'desktop/material',
      3
    )
    await api.fetchGitHubPackageVersions(owners[1], 'npm', '@scope/name')

    assert.equal(organization.nextPage, 4)
    assert.deepEqual(paths, [
      `orgs/Ding-Ding-Projects/packages/container/desktop%2Fmaterial/versions?per_page=${GitHubPackagePageSize}&page=3`,
      `users/octocat/packages/npm/%40scope%2Fname/versions?per_page=${GitHubPackagePageSize}&page=1`,
    ])
  })

  it('uses the shared current REST version for Cheap LFS package metadata', async () => {
    const api = new API('https://api.github.com', 'secret-token')
    let headers = new Headers()
    Reflect.set(
      api,
      'request',
      async (
        _endpoint: string,
        _method: string,
        _path: string,
        options?: { customHeaders?: HeadersInit }
      ) => {
        headers = new Headers(options?.customHeaders)
        return new Response('{}')
      }
    )

    await api.fetchGitHubContainerPackageMetadata(
      'Ding-Ding-Projects',
      'desktop-material',
      'organization'
    )

    assert.equal(
      headers.get(GitHubRESTAPIVersionHeader),
      GitHubDotComRESTAPIVersion
    )
  })
})
