import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const read = (...segments: ReadonlyArray<string>) =>
  readFileSync(join(process.cwd(), ...segments), 'utf8')

/** Extract one complete method so assertions cannot match a different caller. */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, `could not find '${signature}' in source`)

  let depth = 0
  let seenBrace = false
  for (let index = start; index < source.length; index++) {
    const character = source[index]
    if (character === '{') {
      depth++
      seenBrace = true
    } else if (character === '}') {
      depth--
      if (seenBrace && depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }

  assert.fail(`could not find the end of '${signature}'`)
}

const appSource = read('app', 'src', 'ui', 'app.tsx')
const appStoreSource = read('app', 'src', 'lib', 'stores', 'app-store.ts')
const repositorySource = read('app', 'src', 'ui', 'repository.tsx')
const dispatcherSource = read('app', 'src', 'ui', 'dispatcher', 'dispatcher.ts')
const gitLogSource = read('app', 'src', 'lib', 'git', 'log.ts')
const subtreeSource = read('app', 'src', 'lib', 'git', 'subtree.ts')
const lazyViewSource = read('app', 'src', 'ui', 'lib', 'lazy-view.tsx')
const repositoryToolsSource = read(
  'app',
  'src',
  'ui',
  'repository-tools',
  'repository-tools.tsx'
)
const repositoryToolsStyleSource = read(
  'app',
  'styles',
  'ui',
  '_repository-tools.scss'
)

const heavyModules = [
  {
    barrel: './actions',
    direct: './actions/actions-view',
    loader: 'loadActionsModule',
  },
  {
    barrel: './github-packages',
    direct: './github-packages/github-distribution-view',
    loader: 'loadGitHubDistributionModule',
  },
  {
    barrel: './github-issues',
    direct: './github-issues/github-issues-view',
    loader: 'loadGitHubIssuesModule',
  },
  {
    barrel: './github-api-explorer',
    direct: './github-api-explorer/github-api-explorer',
    loader: 'loadGitHubAPIModule',
  },
  {
    barrel: './repository-tools',
    direct: './repository-tools/repository-tools',
    loader: 'loadRepositoryToolsModule',
  },
  {
    barrel: './repository-tools',
    direct: './repository-tools/cheap-lfs',
    loader: 'loadCheapLfsModule',
  },
  {
    barrel: './repository-tools/provider-triage',
    direct: './repository-tools/provider-triage',
    loader: 'loadRepositoryProviderTriageModule',
  },
] as const

describe('progressive startup source contract', () => {
  it('reveals the committed shell without a fake delay', () => {
    assert.doesNotMatch(
      appSource,
      /if \(this\.loading\)\s*\{\s*return null\s*\}/
    )
    assert.match(appSource, /className="startup-progress"/)
    assert.match(
      appSource,
      /componentDidMount\(\)[\s\S]*?this\.readySent = true[\s\S]*?sendReady\(/
    )
    assert.doesNotMatch(appSource, /ReadyDelay|setTimeout\([^)]*sendReady/)
    assert.match(
      appSource,
      /componentWillUnmount\(\)[\s\S]*?cancelIdleCallback\(/
    )
  })

  it('uses persisted editor data while isolated startup work continues', () => {
    const initialState = methodBody(
      appStoreSource,
      'public async loadInitialState()'
    )
    assert.match(
      initialState,
      /this\.selectedExternalEditor\s*=\s*[\s\S]*?localStorage\.getItem\(externalEditorKey\) \|\| null/
    )
    assert.doesNotMatch(
      initialState,
      /this\.updateSelectedExternalEditor\(\s*await this\.lookupSelectedExternalEditor\(\)\s*\)/
    )
    assert.match(
      initialState,
      /void this\.loadDeferredInitialState\(\s*deferredStartupGeneration\s*\)\.catch/
    )
    assert.match(
      appStoreSource,
      /runDeferredStartupStep[\s\S]*?try \{[\s\S]*?await action\(\)[\s\S]*?catch \(error\)[\s\S]*?reportDeferredStartupFailure/
    )
    assert.match(appStoreSource, /sendNonFatalException\(\s*'deferredStartup'/)

    const start = appStoreSource.indexOf('public async loadInitialState')
    const end = appStoreSource.indexOf(
      'private async auditAccountOAuthScopes',
      start
    )
    assert.doesNotMatch(appStoreSource.slice(start, end), /setTimeout|sleep\(/)
  })

  it('fences editor discovery when the user changes selection', () => {
    const deferredStartup = methodBody(
      appStoreSource,
      'private async loadDeferredInitialState('
    )
    assert.match(
      deferredStartup,
      /const selectionGeneration = this\.externalEditorSelectionGeneration[\s\S]*?await this\.externalEditorDiscoveryLoad\.run\([\s\S]*?selectionGeneration !== this\.externalEditorSelectionGeneration[\s\S]*?return/
    )

    const updateSelection = methodBody(
      appStoreSource,
      'private updateSelectedExternalEditor('
    )
    assert.match(
      updateSelection,
      /this\.externalEditorSelectionGeneration \+= 1/
    )
  })
})

describe('lazy repository module source contract', () => {
  it('uses direct asynchronous chunks for all seven inactive sections', () => {
    assert.doesNotMatch(repositorySource, /webpackMode:\s*["']eager["']/)

    for (const { barrel, direct, loader } of heavyModules) {
      const escapedBarrel = barrel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedDirect = direct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      assert.doesNotMatch(
        repositorySource,
        new RegExp(`import\\s+\\{[^}]+\\}\\s+from\\s+'${escapedBarrel}'`)
      )
      assert.doesNotMatch(
        repositorySource,
        new RegExp(`from\\s+'${escapedDirect}'`)
      )
      const loaderStart = repositorySource.indexOf(`const ${loader}`)
      assert.notEqual(loaderStart, -1, `Expected runtime loader ${loader}`)
      const nextLoader = repositorySource.indexOf('\nconst ', loaderStart + 1)
      const loaderSource = repositorySource.slice(
        loaderStart,
        nextLoader === -1 ? undefined : nextLoader
      )
      assert.match(loaderSource, /import\(/)
      assert.match(loaderSource, /webpackChunkName:/)
      assert.match(loaderSource, new RegExp(`'${escapedDirect}'`))
    }

    assert.equal(repositorySource.match(/<LazyView</g)?.length, 7)
    for (const key of ['actions', 'releases', 'issues', 'triage', 'tools']) {
      assert.match(
        repositorySource,
        new RegExp(`name=\\{t\\('repositorySection\\.${key}'\\)\\}`)
      )
    }
  })

  it('keeps loading, recovery, caching, and focus behavior local', () => {
    assert.match(
      lazyViewSource,
      /role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-busy=\{true\}/
    )
    assert.match(lazyViewSource, /role="alert"/)
    assert.match(lazyViewSource, /onClick=\{this\.retry\}/)
    assert.match(lazyViewSource, /resolvedLoads = new WeakMap/)
    assert.match(lazyViewSource, /inFlightLoads = new WeakMap/)
    assert.match(lazyViewSource, /forgetCachedLoad\(this\.props\.load\)/)
    assert.doesNotMatch(lazyViewSource, /\.focus\(|autoFocus/)
  })

  it('fences and aborts repository inventories across navigation', () => {
    assert.match(
      repositorySource,
      /submoduleCountLoad = new ProgressiveLoad<number>\(\)/
    )
    assert.match(
      repositorySource,
      /subtreeCountLoad = new ProgressiveLoad<number>\(\)/
    )
    assert.match(
      repositorySource,
      /getSubmodules\(\s*repository,\s*abortController\.signal\s*\)/
    )
    assert.match(
      repositorySource,
      /getSubtrees\(\s*repository,\s*abortController\.signal\s*\)/
    )
    assert.match(
      repositorySource,
      /cancelRepositoryInventoryLoads[\s\S]*?submoduleCountLoad\.reset\([\s\S]*?subtreeCountLoad\.reset\(/
    )
    assert.match(
      dispatcherSource,
      /getSubmodules\([\s\S]{0,100}?signal\?: AbortSignal[\s\S]{0,180}?_getSubmodules\(repository, signal\)/
    )
    assert.match(
      dispatcherSource,
      /getSubtrees\([\s\S]{0,100}?signal\?: AbortSignal[\s\S]{0,180}?_getSubtrees\(repository, signal\)/
    )
    assert.match(
      appStoreSource,
      /_getSubmodules\([\s\S]{0,100}?signal\?: AbortSignal[\s\S]{0,180}?getSubmodules\(repository, signal\)/
    )
    assert.match(
      appStoreSource,
      /_getSubtrees\([\s\S]{0,100}?signal\?: AbortSignal[\s\S]{0,180}?discoverSubtrees\(repository, 400, signal\)/
    )
    assert.match(
      subtreeSource,
      /discoverSubtrees\([\s\S]{0,140}?signal\?: AbortSignal[\s\S]{0,260}?getCommits\([\s\S]{0,260}?signal/
    )
    assert.match(
      gitLogSource,
      /getCommits\([\s\S]{0,180}?signal\?: AbortSignal[\s\S]{0,1800}?createGitProcessAbortHandler\(signal\)[\s\S]{0,420}?processCallback/
    )
  })

  it('starts inventories only for Tools and keeps failures usable there', () => {
    const didMount = repositorySource.slice(
      repositorySource.indexOf('public componentDidMount()'),
      repositorySource.indexOf('public componentWillUnmount()')
    )
    assert.match(
      didMount,
      /getSelectedSection\(\) === RepositorySectionTab\.RepositoryTools/
    )
    assert.match(
      repositorySource,
      /!wasRepositoryToolsActive && repositoryToolsActive[\s\S]*?loadSubmoduleCount\(\)[\s\S]*?loadSubtreeCount\(\)/
    )
    assert.match(
      repositorySource,
      /wasRepositoryToolsActive && !repositoryToolsActive[\s\S]*?cancelRepositoryInventoryLoads\(true\)/
    )
    assert.match(
      repositoryToolsSource,
      /submoduleInventoryState\?: ProgressiveLoadState<number>/
    )
    assert.match(repositoryToolsSource, /role="alert"/)
    assert.match(repositoryToolsSource, /onClick=\{retry\}/)
    assert.match(
      repositoryToolsStyleSource,
      /\.repository-tools-inventory-statuses[\s\S]*?max-height: 128px;[\s\S]*?overflow-y: auto;/
    )

    const toolsDidMount = repositoryToolsSource.slice(
      repositoryToolsSource.indexOf('public componentDidMount()'),
      repositoryToolsSource.indexOf('public componentDidUpdate(')
    )
    assert.doesNotMatch(toolsDidMount, /\.focus\(|autoFocus/)
  })
})
