import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (path: string) =>
  readFile(join(process.cwd(), 'app', 'src', ...path.split('/')), 'utf8')

describe('GitHub Packages repository UI wiring', () => {
  it('keeps Packages beside Releases without adding another repository rail section', async () => {
    const [repository, distribution] = await Promise.all([
      read('ui/repository.tsx'),
      read('ui/github-packages/github-distribution-view.tsx'),
    ])

    assert.match(repository, /<module\.GitHubDistributionView/)
    assert.match(distribution, /<GitHubReleasesView/)
    assert.match(distribution, /<GitHubPackagesView/)
    assert.match(distribution, /<TabBar/)
  })

  it('provides repository-filtered package and version search plus real GHCR transfers', async () => {
    const source = await read('ui/github-packages/github-packages-view.tsx')

    assert.match(source, /filterGitHubPackagesByRepositoryId/)
    assert.match(
      source,
      /id: 'github-packages-search'|PackagesSearchFilterId = 'github-packages-search'/
    )
    assert.match(
      source,
      /PackageVersionsSearchFilterId = 'github-package-versions-search'/
    )
    assert.match(source, /<FilterModeControl/g)
    assert.match(source, /uploadGitHubContainerFile/)
    assert.match(source, /downloadGitHubContainerFile/)
    assert.match(source, /versionDigest: version\.name/)
    assert.match(source, /chooseDestination/)
  })
})
