import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const repositorySource = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'repository.tsx'),
  'utf8'
)
const appStoreSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
  'utf8'
)
const cheapLfsStyles = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_cheap-lfs.scss'),
  'utf8'
)
const materialCardStyles = readFileSync(
  join(process.cwd(), 'app', 'styles', 'ui', '_material-cards.scss'),
  'utf8'
)

describe('repository section navigation source contract', () => {
  it('uses one complete visible-section mapping for clicks and keyboard navigation', () => {
    assert.equal(
      repositorySource.match(/getRepositorySections\(/g)?.length,
      1,
      'repository navigation must not rebuild a partial section list'
    )
    assert.match(
      repositorySource,
      /private getVisibleRepositorySections\(\)[\s\S]*?this\.supportsGitHubActions\(\)[\s\S]*?this\.showsGitHubReleases\(\)[\s\S]*?this\.showsGitHubIssues\(\)[\s\S]*?this\.showsGitHubAPI\(\)/
    )
    assert.match(
      repositorySource,
      /const shortcut = this\.getVisibleRepositorySections\(\)\[requestedIndex\]/
    )
    assert.match(
      repositorySource,
      /const sections = this\.getVisibleRepositorySections\(\)/
    )
    assert.match(
      repositorySource,
      /const section = this\.getVisibleRepositorySections\(\)\[visualIndex\]/
    )
  })

  it('opens the Cheap LFS manager directly without routing through Releases', () => {
    assert.match(
      repositorySource,
      /id="cheap-lfs-tab"[\s\S]*?RepositorySectionTab\.CheapLfs/
    )
    // The manager module is evaluated on first activation, so the section
    // renders it through its deferred module rather than a static element.
    assert.match(
      repositorySource,
      /selectedSection === RepositorySectionTab\.CheapLfs[\s\S]*?<LazyView<CheapLfsModule>[\s\S]*?render=\{this\.renderCheapLfsModule\}/
    )
    assert.match(
      repositorySource,
      /renderCheapLfsModule[\s\S]*?<module\.CheapLfs/
    )
    assert.match(repositorySource, /className="cheap-lfs-manager-view"/)
    assert.match(
      cheapLfsStyles,
      /#repository > \.cheap-lfs-manager-view[\s\S]*?overflow-y: auto/
    )
    assert.match(
      materialCardStyles,
      /#repository > \*:not\(\.repository-rail\)[^{]*:not\(\.cheap-lfs-manager-view\)\s*\{\s*overflow: hidden;/,
      'the higher-specificity card rule must exempt the Cheap LFS scroll owner'
    )
  })

  it('lets the selected section paint before its freshness-preserving Git refresh', () => {
    const start = appStoreSource.indexOf(
      'public async _changeRepositorySection('
    )
    const end = appStoreSource.indexOf(
      'Changes the selection in the changes view',
      start
    )
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const method = appStoreSource.slice(start, end)
    const emit = method.indexOf('this.emitUpdate()')
    const paint = method.indexOf('await afterRendererPaint()')
    const historyRefresh = method.indexOf(
      'await this.refreshHistorySection(repository)'
    )
    const changesRefresh = method.indexOf(
      'await this.refreshChangesSection(repository'
    )

    assert.ok(emit >= 0)
    assert.ok(paint > emit)
    assert.ok(historyRefresh > paint)
    assert.ok(changesRefresh > paint)
    assert.match(method, /if \(this\.windowState !== 'hidden'\)/)
    assert.match(method, /!this\.isTemporaryRepositoryActive\(repository\)/)
    assert.match(
      method,
      /selectedRepository\.id === repository\.id[\s\S]*?selectedRepository\.path === repository\.path[\s\S]*?selectedSection/
    )
    assert.match(
      method,
      /const changeSequence = \+\+this\.repositorySectionChangeSequence[\s\S]*?changeSequence === this\.repositorySectionChangeSequence/
    )
    assert.match(method, /forceButtonFocus && targetIsStillCurrent\(\)/)
  })
})
