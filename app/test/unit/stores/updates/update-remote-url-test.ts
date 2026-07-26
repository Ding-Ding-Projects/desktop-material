import { afterEach, describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { join } from 'path'
import { GitStore, RepositoriesStore } from '../../../../src/lib/stores'
import { TestRepositoriesDatabase } from '../../../helpers/databases'
import {
  IAPIFullRepository,
  getDotComAPIEndpoint,
} from '../../../../src/lib/api'
import { updateRemoteUrl } from '../../../../src/lib/stores/updates/update-remote-url'
import { shell } from '../../../helpers/test-app-shell'
import { setupFixtureRepository } from '../../../helpers/repositories'
import { addRemote, getRemotes } from '../../../../src/lib/git'
import { TestStatsStore } from '../../../helpers/test-stats-store'
import { getConfigValue, setConfigValue } from '../../../../src/lib/git/config'

describe('Update remote url', () => {
  const apiRepository: IAPIFullRepository = {
    clone_url: 'https://github.com/my-user/my-repo',
    ssh_url: 'git@github.com:my-user/my-repo.git',
    html_url: 'https://github.com/my-user/my-repo',
    name: 'my-repo',
    owner: {
      id: 42,
      html_url: 'https://github.com/my-user',
      login: 'my-user',
      avatar_url: 'https://github.com/my-user.png',
      type: 'User',
    },
    private: true,
    fork: false,
    default_branch: 'master',
    pushed_at: '1995-12-17T03:24:00',
    has_issues: true,
    archived: false,
    parent: undefined,
  }
  const endpoint = getDotComAPIEndpoint()

  let gitStore: GitStore
  let db: TestRepositoriesDatabase

  const createRepository = async (
    t: TestContext,
    apiRepo: IAPIFullRepository,
    remoteUrl: string | null = null,
    remoteName = 'origin'
  ) => {
    db = new TestRepositoriesDatabase()
    await db.reset()
    const repositoriesStore = new RepositoriesStore(db)

    const repoPath = await setupFixtureRepository(t, 'test-repo')
    const repository = await repositoriesStore.setGitHubRepository(
      await repositoriesStore.addRepository(repoPath, join(repoPath, '.git')),
      await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
    )
    await addRemote(repository, remoteName, remoteUrl || apiRepo.clone_url)
    gitStore = new GitStore(repository, shell, new TestStatsStore())
    await gitStore.loadRemotes()
    return { gitStore, repository }
  }

  afterEach(() => {
    db.close()
  })

  it("updates the repository's remote url when the github url changes", async t => {
    const { gitStore } = await createRepository(t, apiRepository)
    assert(gitStore.currentRemote !== null)

    const originalUrl = gitStore.currentRemote.url
    const updatedUrl = 'https://github.com/my-user/my-updated-repo'
    const updatedApiRepository = { ...apiRepository, clone_url: updatedUrl }
    await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      updatedApiRepository
    )
    assert.notEqual(originalUrl, updatedUrl)
    assert.equal(gitStore.currentRemote.url, updatedUrl)
  })

  it("doesn't update the repository's remote url when the github url is the same", async t => {
    const { gitStore } = await createRepository(t, apiRepository)
    assert(gitStore.currentRemote !== null)
    const originalUrl = gitStore.currentRemote.url
    assert.notEqual(originalUrl.length, 0, 'Expected originalUrl to be empty')
    await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      apiRepository
    )
    assert(gitStore.currentRemote !== null)
    assert.equal(gitStore.currentRemote.url, originalUrl)
  })

  it("updates a transferred repository's SSH remote without switching transport", async t => {
    const originalUrl = 'git@github.com:desktop/desktop.git'
    const sshApiRepository = { ...apiRepository }
    const { gitStore } = await createRepository(
      t,
      sshApiRepository,
      originalUrl
    )
    const updatedUrl = 'git@github.com:my-user/my-updated-repo.git'
    const updatedApiRepository = { ...apiRepository, ssh_url: updatedUrl }

    await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      updatedApiRepository
    )
    assert(gitStore.currentRemote !== null)
    assert.equal(gitStore.currentRemote.url, updatedUrl)
  })

  it('refuses a stale provider-lookup snapshot', async t => {
    const originalUrl = 'https://github.com/my-user/something-different'
    const { gitStore } = await createRepository(t, apiRepository, originalUrl)

    const updatedUrl = 'https://github.com/my-user/my-updated-repo'
    const updatedApiRepository = { ...apiRepository, clone_url: updatedUrl }

    await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: apiRepository.clone_url },
      updatedApiRepository
    )
    assert(gitStore.currentRemote !== null)
    assert.equal(gitStore.currentRemote.url, originalUrl)
  })

  it('preserves an exact external fetch URL edit made after the provider snapshot', async t => {
    const originalUrl = apiRepository.clone_url
    const externalUrl = 'https://github.com/external-owner/external-repo'
    const { gitStore, repository } = await createRepository(
      t,
      apiRepository,
      originalUrl
    )

    // Deliberately leave GitStore cached at originalUrl while changing disk.
    await setConfigValue(repository, 'remote.origin.url', externalUrl)
    const result = await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      {
        ...apiRepository,
        clone_url: 'https://github.com/new-owner/my-repo',
      }
    )

    assert.equal(result, 'stale')
    assert.equal(
      await getConfigValue(repository, 'remote.origin.url'),
      externalUrl
    )
  })

  it('refuses a canonical URL on another authority', async t => {
    const { gitStore } = await createRepository(t, apiRepository)
    const originalUrl = apiRepository.clone_url
    const result = await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      {
        ...apiRepository,
        clone_url: 'https://example.test/my-user/my-repo',
      }
    )

    assert.equal(result, 'refused')
    assert.equal(gitStore.currentRemote?.url, originalUrl)
  })

  it('refuses an HTTP-to-HTTPS scheme change', async t => {
    const originalUrl = 'http://github.com/my-user/my-repo'
    const { gitStore } = await createRepository(t, apiRepository, originalUrl)
    const result = await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      apiRepository
    )

    assert.equal(result, 'refused')
    assert.equal(gitStore.currentRemote?.url, originalUrl)
  })

  it('fails closed for an empty SSH candidate', async t => {
    const originalUrl = 'git@github.com:my-user/my-repo.git'
    const { gitStore } = await createRepository(t, apiRepository, originalUrl)
    const result = await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      { ...apiRepository, ssh_url: '' }
    )

    assert.equal(result, 'refused')
    assert.equal(gitStore.currentRemote?.url, originalUrl)
  })

  it('updates the exact non-origin default and preserves other remotes and pushurl', async t => {
    const originalUrl = apiRepository.clone_url
    const updatedUrl = 'https://github.com/new-owner/my-repo'
    const { gitStore, repository } = await createRepository(
      t,
      apiRepository,
      originalUrl,
      'source'
    )
    await addRemote(repository, 'upstream', 'https://github.com/other/project')
    await setConfigValue(
      repository,
      'remote.source.pushurl',
      'https://github.com/write-only/my-repo'
    )
    await gitStore.loadRemotes()

    const result = await updateRemoteUrl(
      gitStore,
      { name: 'source', url: originalUrl },
      { ...apiRepository, clone_url: updatedUrl }
    )
    const remotes = await getRemotes(repository)

    assert.equal(result, 'updated')
    assert.equal(
      remotes.find(remote => remote.name === 'source')?.url,
      updatedUrl
    )
    assert.equal(
      remotes.find(remote => remote.name === 'upstream')?.url,
      'https://github.com/other/project'
    )
    assert.equal(
      await getConfigValue(repository, 'remote.source.pushurl'),
      'https://github.com/write-only/my-repo'
    )
  })

  it('migrates an explicit pushurl only when it exactly followed the old fetch URL', async t => {
    const originalUrl = apiRepository.clone_url
    const updatedUrl = 'https://github.com/new-owner/my-repo'
    const { gitStore, repository } = await createRepository(
      t,
      apiRepository,
      originalUrl
    )
    await setConfigValue(repository, 'remote.origin.pushurl', originalUrl)
    await gitStore.loadRemotes()

    const result = await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      { ...apiRepository, clone_url: updatedUrl }
    )

    assert.equal(result, 'updated')
    assert.equal(gitStore.currentRemote?.url, updatedUrl)
    assert.equal(
      await getConfigValue(repository, 'remote.origin.pushurl'),
      updatedUrl
    )
  })

  it('rolls the fetch URL back and emits no global error when pushurl migration fails', async t => {
    const originalUrl = apiRepository.clone_url
    const updatedUrl = 'https://github.com/new-owner/my-repo'
    const { gitStore, repository } = await createRepository(
      t,
      apiRepository,
      originalUrl
    )
    await setConfigValue(repository, 'remote.origin.pushurl', originalUrl)
    await gitStore.loadRemotes()

    const emittedErrors: Error[] = []
    Reflect.set(gitStore, 'emitError', (error: Error) =>
      emittedErrors.push(error)
    )
    Reflect.set(gitStore, 'compareAndSetRemotePushURL', async () =>
      Promise.reject(new Error('synthetic pushurl failure'))
    )

    const result = await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      { ...apiRepository, clone_url: updatedUrl }
    )

    assert.equal(result, 'failed')
    assert.equal(emittedErrors.length, 0)
    assert.equal(
      await getConfigValue(repository, 'remote.origin.url'),
      originalUrl
    )
    assert.equal(
      await getConfigValue(repository, 'remote.origin.pushurl'),
      originalUrl
    )
  })

  it('reports an unproven split state when pushurl migration and fetch rollback both fail', async t => {
    const originalUrl = apiRepository.clone_url
    const updatedUrl = 'https://github.com/new-owner/my-repo'
    const { gitStore, repository } = await createRepository(
      t,
      apiRepository,
      originalUrl
    )
    await setConfigValue(repository, 'remote.origin.pushurl', originalUrl)
    await gitStore.loadRemotes()

    const compareFetch = gitStore.compareAndSetRemoteURL.bind(gitStore)
    let fetchMutationCount = 0
    Reflect.set(
      gitStore,
      'compareAndSetRemoteURL',
      async (name: string, expectedURL: string, url: string) => {
        fetchMutationCount++
        if (fetchMutationCount === 2) {
          throw new Error('synthetic rollback failure')
        }
        return compareFetch(name, expectedURL, url)
      }
    )
    Reflect.set(gitStore, 'compareAndSetRemotePushURL', async () =>
      Promise.reject(new Error('synthetic pushurl failure'))
    )

    const result = await updateRemoteUrl(
      gitStore,
      { name: 'origin', url: originalUrl },
      { ...apiRepository, clone_url: updatedUrl }
    )

    assert.equal(result, 'unproven')
    assert.equal(
      await getConfigValue(repository, 'remote.origin.url'),
      updatedUrl
    )
    assert.equal(
      await getConfigValue(repository, 'remote.origin.pushurl'),
      originalUrl
    )
  })
})
