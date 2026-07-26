import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  filterGitHubPackagesByRepositoryId,
  getGitHubPackageOwnerPath,
  GitHubPackageJSONError,
  GitHubPackageJSONMaximumBytes,
  GitHubPackageMaximumPages,
  GitHubPackagePageSize,
  githubPackageResponseHasNextPage,
  parseGitHubPackagePage,
  parseGitHubPackageVersionPage,
  readBoundedGitHubPackageJSON,
} from '../../src/lib/github-packages'

const packageFixture = (id: number = 7) => ({
  id,
  name: `desktop-material-${id}`,
  package_type: 'container',
  visibility: 'private',
  version_count: 2,
  repository: {
    id: 42,
    name: 'desktop-material',
    full_name: 'Ding-Ding-Projects/desktop-material',
    private: false,
    html_url: 'https://github.com/Ding-Ding-Projects/desktop-material',
  },
  created_at: '2026-07-26T10:00:00Z',
  updated_at: '2026-07-26T10:01:00Z',
  url: `https://api.github.com/orgs/Ding-Ding-Projects/packages/container/desktop-material-${id}`,
  html_url: `https://github.com/orgs/Ding-Ding-Projects/packages/container/package/desktop-material-${id}`,
})

const versionFixture = (id: number = 11) => ({
  id,
  name: `sha256:${'a'.repeat(64)}`,
  created_at: '2026-07-26T10:00:00Z',
  updated_at: '2026-07-26T10:01:00Z',
  url: `https://api.github.com/orgs/Ding-Ding-Projects/packages/container/desktop-material/versions/${id}`,
  package_html_url:
    'https://github.com/orgs/Ding-Ding-Projects/packages/container/package/desktop-material',
  html_url: `https://github.com/orgs/Ding-Ding-Projects/packages/container/package/desktop-material?version=${id}`,
  description: 'Windows package',
  license: 'MIT',
  metadata: {
    package_type: 'container',
    container: { tags: ['latest', 'v1'] },
  },
})

describe('GitHub Packages model', () => {
  it('normalizes bounded package and version pages', () => {
    const packages = parseGitHubPackagePage(
      [packageFixture()],
      'container',
      3,
      true
    )
    const versions = parseGitHubPackageVersionPage(
      [versionFixture()],
      'container',
      1,
      false
    )

    assert.equal(packages.packages[0].repository?.id, 42)
    assert.equal(
      packages.packages[0].createdAt.toISOString(),
      '2026-07-26T10:00:00.000Z'
    )
    assert.equal(packages.nextPage, 4)
    assert.equal(versions.versions[0].htmlURL?.startsWith('https://'), true)
    assert.equal(
      versions.versions[0].packageHTMLURL?.includes('/package/'),
      true
    )
    assert.deepEqual(versions.versions[0].tags, ['latest', 'v1'])
    assert.equal(versions.nextPage, null)
  })

  it('filters package association by exact repository id only', () => {
    const packages = parseGitHubPackagePage(
      [
        packageFixture(1),
        {
          ...packageFixture(2),
          repository: {
            ...packageFixture(2).repository,
            id: 99,
            // Names deliberately collide to prove they are never used.
            full_name: 'Ding-Ding-Projects/desktop-material',
          },
        },
        { ...packageFixture(3), repository: null },
      ],
      'container'
    ).packages

    assert.deepEqual(
      filterGitHubPackagesByRepositoryId(packages, 42).map(pkg => pkg.id),
      [1]
    )
    assert.throws(() => filterGitHubPackagesByRepositoryId(packages, 0))
  })

  it('routes each owner kind through its exact endpoint prefix', () => {
    assert.equal(
      getGitHubPackageOwnerPath({ kind: 'authenticated-user' }),
      'user'
    )
    assert.equal(
      getGitHubPackageOwnerPath({
        kind: 'organization',
        login: 'Ding-Ding-Projects',
      }),
      'orgs/Ding-Ding-Projects'
    )
    assert.equal(
      getGitHubPackageOwnerPath({ kind: 'user', login: 'octocat' }),
      'users/octocat'
    )
    assert.throws(() =>
      getGitHubPackageOwnerPath({
        kind: 'organization',
        login: 'bad/login',
      })
    )
  })

  it('fails closed on cross-ecosystem, duplicate, oversized, and unsafe records', () => {
    assert.throws(() => parseGitHubPackagePage([packageFixture()], 'npm'))
    assert.throws(() =>
      parseGitHubPackagePage(
        [packageFixture(1), packageFixture(1)],
        'container'
      )
    )
    assert.throws(() =>
      parseGitHubPackagePage(
        Array.from({ length: GitHubPackagePageSize + 1 }, (_, index) =>
          packageFixture(index + 1)
        ),
        'container'
      )
    )
    assert.throws(() =>
      parseGitHubPackagePage(
        [{ ...packageFixture(), html_url: 'javascript:alert(1)' }],
        'container'
      )
    )
    assert.throws(() =>
      parseGitHubPackageVersionPage(
        [{ ...versionFixture(), metadata: { package_type: 'npm' } }],
        'container'
      )
    )
  })

  it('uses provider pagination and reports a local cap', () => {
    const response = new Response('[]', {
      headers: {
        Link: '<https://api.github.com/user/packages?page=2>; rel="next", <https://api.github.com/user/packages?page=9>; rel="last"',
      },
    })
    assert.equal(githubPackageResponseHasNextPage(response), true)
    assert.equal(
      githubPackageResponseHasNextPage(new Response('[]')),
      undefined
    )

    const capped = parseGitHubPackagePage(
      [],
      'container',
      GitHubPackageMaximumPages,
      true
    )
    assert.equal(capped.nextPage, null)
    assert.equal(capped.capped, true)
  })

  it('rejects package metadata above the response byte cap', async () => {
    const response = new Response('[]', {
      headers: {
        'Content-Length': String(GitHubPackageJSONMaximumBytes + 1),
      },
    })
    await assert.rejects(
      () => readBoundedGitHubPackageJSON(response),
      (error: unknown) =>
        error instanceof GitHubPackageJSONError && error.kind === 'too-large'
    )
  })
})
