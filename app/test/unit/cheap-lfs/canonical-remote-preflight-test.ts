import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { AppStore } from '../../../src/lib/stores/app-store'
import { Repository } from '../../../src/models/repository'

const sha = (character: string) => character.repeat(40)

function makeStore(stubs: object): AppStore {
  const store = Object.create(AppStore.prototype) as AppStore
  Object.assign(store, stubs)
  return store
}

describe('cheap LFS canonical remote preflight', () => {
  it('resolves the canonical remote before the anchor reads publication state', async () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const resolved = new Repository(
      'C:/work/selected',
      1,
      null,
      false,
      'canonical model'
    )
    const events = new Array<string>()
    const store = makeStore({
      repositoryWithCanonicalRemoteForNetwork: async (
        target: Repository,
        isBackgroundTask: boolean,
        allowUnverifiedRemote?: boolean
      ) => {
        events.push('canonicalize')
        assert.equal(target, repository)
        assert.equal(isBackgroundTask, true)
        // Fail closed: the anchor is a mutating push, so an unverified
        // remote must never be allowed through.
        assert.equal(allowUnverifiedRemote, undefined)
        return resolved
      },
      readCheapLfsPublicationState: async (target: Repository) => {
        events.push('read')
        assert.equal(target, resolved)
        return {
          hasGitHubRepository: true,
          remoteName: 'origin',
          branchName: 'main',
          localTipSha: sha('a'),
          remoteBranchSha: sha('a'),
        }
      },
    })

    const outcome = await (store as any).ensureCheapLfsReleaseAnchor(repository)

    assert.deepEqual(outcome, { failure: null, anchored: false })
    assert.deepEqual(events, ['canonicalize', 'read'])
  })

  it('refuses the anchor when the canonical remote cannot be proven', async () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const events = new Array<string>()
    const store = makeStore({
      repositoryWithCanonicalRemoteForNetwork: async () => {
        throw new Error('the destination could not be proven')
      },
      readCheapLfsPublicationState: async () => {
        events.push('read')
        return {
          hasGitHubRepository: true,
          remoteName: 'origin',
          branchName: 'main',
          localTipSha: sha('a'),
          remoteBranchSha: null,
        }
      },
      gitStoreCache: {
        get: () => {
          events.push('git-store')
          return { remotes: [] }
        },
      },
    })

    const outcome = await (store as any).ensureCheapLfsReleaseAnchor(repository)

    assert.equal(outcome.anchored, false)
    assert.equal(
      outcome.failure?.reasonKey,
      'cheapLfs.firstPublish.publishFailed'
    )
    assert.match(outcome.failure?.detail ?? '', /could not be proven/)
    // No publication read and no remote lookup happened at the stale URL.
    assert.deepEqual(events, [])
  })

  it('threads the resolved repository into the anchor push remote lookup', async () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const resolved = new Repository(
      'C:/work/selected',
      1,
      null,
      false,
      'canonical model'
    )
    const events = new Array<string>()
    const store = makeStore({
      repositoryWithCanonicalRemoteForNetwork: async () => {
        events.push('canonicalize')
        return resolved
      },
      readCheapLfsPublicationState: async (target: Repository) => {
        events.push('read')
        assert.equal(target, resolved)
        return {
          hasGitHubRepository: true,
          remoteName: 'origin',
          branchName: 'main',
          localTipSha: sha('a'),
          remoteBranchSha: null,
        }
      },
      gitStoreCache: {
        get: (target: Repository) => {
          events.push('git-store')
          assert.equal(target, resolved)
          return { remotes: [] }
        },
      },
    })

    const outcome = await (store as any).ensureCheapLfsReleaseAnchor(repository)

    assert.equal(outcome.anchored, false)
    assert.equal(
      outcome.failure?.reasonKey,
      'cheapLfs.firstPublish.publishFailed'
    )
    assert.deepEqual(events, ['canonicalize', 'read', 'git-store'])
  })

  it('resolves the canonical remote before the workflow publish reads the remote', async () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const resolved = new Repository(
      'C:/work/selected',
      1,
      null,
      false,
      'canonical model'
    )
    const events = new Array<string>()
    const store = makeStore({
      repositoryWithCanonicalRemoteForNetwork: async (
        target: Repository,
        isBackgroundTask: boolean,
        allowUnverifiedRemote?: boolean
      ) => {
        events.push('canonicalize')
        assert.equal(target, repository)
        assert.equal(isBackgroundTask, true)
        assert.equal(allowUnverifiedRemote, undefined)
        return resolved
      },
      readCheapLfsWorkflowPublicationState: async (target: Repository) => {
        events.push('read')
        assert.equal(target, resolved)
        return {
          hasGitHubRepository: false,
          remoteName: null,
          branchName: null,
          defaultBranchName: null,
          remoteBranchRef: null,
          localTipShaBeforeCommit: null,
          remoteBranchSha: null,
        }
      },
      postCheapLfsWorkflowFailure: () => {
        events.push('failure')
      },
    })

    const publication = await (store as any).prepareCheapLfsWorkflowPublication(
      repository
    )

    assert.equal(publication, null)
    assert.deepEqual(events, ['canonicalize', 'read', 'failure'])
  })

  it('stops the workflow publish when the canonical remote cannot be proven', async () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const events = new Array<string>()
    const failures = new Array<string>()
    const store = makeStore({
      repositoryWithCanonicalRemoteForNetwork: async () => {
        throw new Error('the destination could not be proven')
      },
      readCheapLfsWorkflowPublicationState: async () => {
        events.push('read')
        return {
          hasGitHubRepository: true,
          remoteName: 'origin',
          branchName: 'main',
          defaultBranchName: 'main',
          remoteBranchRef: 'refs/heads/main',
          localTipShaBeforeCommit: sha('a'),
          remoteBranchSha: sha('a'),
        }
      },
      postCheapLfsWorkflowFailure: (_target: Repository, detail: string) => {
        failures.push(detail)
      },
    })

    const publication = await (store as any).prepareCheapLfsWorkflowPublication(
      repository
    )

    assert.equal(publication, null)
    assert.deepEqual(events, [])
    assert.deepEqual(failures, ['the destination could not be proven'])
  })

  it('pushes the workflow commit against the resolved repository', async () => {
    const repository = new Repository('C:/work/selected', 1, null, false)
    const resolved = new Repository(
      'C:/work/selected',
      1,
      null,
      false,
      'canonical model'
    )
    const events = new Array<string>()
    const store = makeStore({
      repositoryWithCanonicalRemoteForNetwork: async () => {
        events.push('canonicalize')
        return resolved
      },
      readCheapLfsWorkflowPublicationState: async (target: Repository) => {
        events.push('read')
        assert.equal(target, resolved)
        return {
          hasGitHubRepository: true,
          remoteName: 'origin',
          branchName: 'main',
          defaultBranchName: 'main',
          remoteBranchRef: 'refs/heads/main',
          localTipShaBeforeCommit: sha('a'),
          remoteBranchSha: sha('a'),
        }
      },
      commitCheapLfsWorkflowPath: async (target: Repository) => {
        events.push('commit')
        assert.equal(target, resolved)
        return sha('b')
      },
      _loadStatus: async (target: Repository) => {
        events.push('status')
        assert.equal(target, resolved)
      },
      gitStoreCache: {
        get: (target: Repository) => {
          assert.equal(target, resolved)
          return {
            loadBranches: async () => {
              events.push('branches')
            },
          }
        },
      },
      pushCheapLfsWorkflowCommit: async (
        target: Repository,
        _before: unknown,
        commitSha: string
      ) => {
        events.push('push')
        assert.equal(target, resolved)
        assert.equal(commitSha, sha('b'))
      },
    })

    const publication = await (store as any).prepareCheapLfsWorkflowPublication(
      repository
    )
    assert.ok(publication !== null)
    await (store as any).commitAndPublishCheapLfsWorkflow(
      publication.repository,
      publication.before,
      publication.decision
    )

    assert.deepEqual(events, [
      'canonicalize',
      'read',
      'commit',
      'status',
      'branches',
      'push',
    ])
  })

  it('pins the canonical preflight ahead of every remote read in the source', () => {
    const source = readFileSync(
      join(process.cwd(), 'app', 'src', 'lib', 'stores', 'app-store.ts'),
      'utf8'
    )
    const section = (start: string, end: string) => {
      const startIndex = source.indexOf(start)
      const endIndex = source.indexOf(end, startIndex + start.length)
      assert.notEqual(startIndex, -1, `missing ${start}`)
      assert.notEqual(endIndex, -1, `missing boundary ${end}`)
      return source.slice(startIndex, endIndex)
    }

    const anchor = section(
      'private async ensureCheapLfsReleaseAnchor(',
      'private async createCheapLfsBootstrapCommit('
    )
    assert.match(
      anchor,
      /repositoryWithCanonicalRemoteForNetwork\(\s*repository,\s*true\s*\)/
    )
    assert.ok(
      anchor.indexOf('repositoryWithCanonicalRemoteForNetwork') <
        anchor.indexOf('readCheapLfsPublicationState'),
      'the anchor must canonicalize before its first publication-state read'
    )

    const workflow = section(
      'private async prepareCheapLfsWorkflowPublication(',
      'private async reportCheapLfsEncryptedBuilderRoute('
    )
    assert.match(
      workflow,
      /repositoryWithCanonicalRemoteForNetwork\(\s*repository,\s*true\s*\)/
    )
    assert.ok(
      workflow.indexOf('repositoryWithCanonicalRemoteForNetwork') <
        workflow.indexOf('readCheapLfsWorkflowPublicationState'),
      'the workflow publish must canonicalize before its remote read'
    )
  })
})
