import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const commitMessageSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'changes', 'commit-message.tsx'),
  'utf8'
)
const preferencesSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'ui', 'preferences', 'preferences.tsx'),
  'utf8'
)
const appStoreSource = readFileSync(
  join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
  'utf8'
)

describe('commit author origin lifecycle source contract', () => {
  it('does no hidden work and makes a live preference transition render first', () => {
    const handlerStart = commitMessageSource.indexOf(
      'private onShowCommitAuthorInfoChanged'
    )
    const loaderStart = commitMessageSource.indexOf(
      'private loadCommitAuthorOrigins',
      handlerStart
    )
    const loaderEnd = commitMessageSource.indexOf(
      'private async updateRepoRuleFailures',
      loaderStart
    )
    assert.ok(handlerStart >= 0 && loaderStart > handlerStart)
    assert.ok(loaderEnd > loaderStart)

    const handler = commitMessageSource.slice(handlerStart, loaderStart)
    const loader = commitMessageSource.slice(loaderStart, loaderEnd)
    assert.match(
      handler,
      /setState\(\{ showCommitAuthorInfo: true \}, \(\) => \{[\s\S]*?loadCommitAuthorOrigins/
    )
    assert.match(
      loader,
      /!this\.isMounted[\s\S]*?!this\.state\.showCommitAuthorInfo[\s\S]*?this\.props\.commitAuthor === null/
    )
    assert.ok(
      loader.indexOf('loadCachedCommitAuthorOrigins(repository)') >
        loader.indexOf('!this.state.showCommitAuthorInfo')
    )
  })

  it('fences relocation, unmount, and superseded-request results', () => {
    const updateStart = commitMessageSource.indexOf(
      'public async componentDidUpdate'
    )
    const handlerStart = commitMessageSource.indexOf(
      'private onShowCommitAuthorInfoChanged',
      updateStart
    )
    const update = commitMessageSource.slice(updateStart, handlerStart)
    assert.match(
      update,
      /repository\.id !== prevProps\.repository\.id[\s\S]*?repository\.path !== prevProps\.repository\.path/
    )
    assert.match(
      update,
      /authorRefreshed[\s\S]*?invalidateCommitAuthorOrigins\(this\.props\.repository\)/
    )

    const loaderStart = commitMessageSource.indexOf(
      'private loadCommitAuthorOrigins',
      handlerStart
    )
    const loaderEnd = commitMessageSource.indexOf(
      'private async updateRepoRuleFailures',
      loaderStart
    )
    const loader = commitMessageSource.slice(loaderStart, loaderEnd)
    assert.equal(
      loader.match(/repository\.path !== this\.props\.repository\.path/g)
        ?.length,
      2
    )
    assert.equal(loader.match(/!this\.isMounted/g)?.length, 3)
    assert.equal(
      loader.match(/sequence !== this\.commitAuthorOriginLoadSequence/g)
        ?.length,
      2
    )

    const unmountStart = commitMessageSource.indexOf(
      'public componentWillUnmount'
    )
    const mountStart = commitMessageSource.indexOf(
      'public async componentDidMount',
      unmountStart
    )
    const unmount = commitMessageSource.slice(unmountStart, mountStart)
    assert.match(
      unmount,
      /this\.isMounted = false[\s\S]*?this\.commitAuthorOriginLoadSequence \+= 1/
    )
  })

  it('saves the display preference once instead of broadcasting duplicate work', () => {
    assert.equal(
      preferencesSource.match(
        /setShowCommitAuthorInfo\(this\.state\.showCommitAuthorInfo\)/g
      )?.length,
      1
    )
  })

  it('invalidates shared origins even while the Changes view is unmounted', () => {
    const refreshStart = appStoreSource.indexOf(
      'public async _refreshAuthor(repository: Repository)'
    )
    const nextMethod = appStoreSource.indexOf(
      'private async _refreshWorktrees',
      refreshStart
    )
    assert.ok(refreshStart >= 0 && nextMethod > refreshStart)

    const refresh = appStoreSource.slice(refreshStart, nextMethod)
    assert.ok(
      refresh.indexOf('invalidateCommitAuthorOrigins()') <
        refresh.indexOf('getAuthorIdentity(repository)')
    )
    assert.match(
      commitMessageSource,
      /loadCachedCommitAuthorOrigins\(repository\)/
    )
    assert.doesNotMatch(commitMessageSource, /new CommitAuthorOriginsCache\(/)
  })
})
