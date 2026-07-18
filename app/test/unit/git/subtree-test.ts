import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { readFile } from 'fs/promises'

import { Repository } from '../../../src/models/repository'
import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { ITrailer } from '../../../src/lib/git/interpret-trailers'
import {
  parseSubtreePrefixes,
  getSubtreePrefixError,
  discoverSubtrees,
  addSubtree,
  pullSubtree,
  pushSubtree,
  splitSubtree,
  isSubtreeAvailable,
} from '../../../src/lib/git/subtree'
import { git, getBranches } from '../../../src/lib/git'
import {
  setupEmptyRepository,
  setupTwoCommitRepo,
} from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'

// The upstream content must differ from the superproject fixture: identical
// trees, messages, and env-pinned identities can yield identical commit SHAs
// in both repositories which confuses `git subtree split`.
async function setupUpstreamRepo(t: TestContext) {
  const repo = await setupEmptyRepository(t)
  await makeCommit(repo, {
    entries: [{ path: 'lib-file', contents: 'upstream v1' }],
    commitMessage: 'upstream first',
  })
  await makeCommit(repo, {
    entries: [{ path: 'lib-file', contents: 'upstream v2' }],
    commitMessage: 'upstream second',
  })
  return repo
}

const identity = new CommitIdentity(
  'Ada Lovelace',
  'ada@example.com',
  new Date(0)
)

function makeTrailerCommit(sha: string, trailers: ReadonlyArray<ITrailer>) {
  return new Commit(
    sha,
    sha.slice(0, 7),
    'summary',
    'body',
    identity,
    identity,
    [],
    trailers,
    []
  )
}

describe('git/subtree', () => {
  describe('parseSubtreePrefixes', () => {
    it('extracts a single prefix with its split metadata', () => {
      const commits = [
        makeTrailerCommit('a'.repeat(40), [
          { token: 'git-subtree-dir', value: 'vendor/lib' },
          { token: 'git-subtree-split', value: 'b'.repeat(40) },
        ]),
      ]

      assert.deepEqual(parseSubtreePrefixes(commits), [
        {
          prefix: 'vendor/lib',
          lastMergedSplitSha: 'b'.repeat(40),
          lastMergeSha: 'a'.repeat(40),
        },
      ])
    })

    it('dedupes repeated prefixes keeping the newest commit data', () => {
      const commits = [
        makeTrailerCommit('1'.repeat(40), [
          { token: 'git-subtree-dir', value: 'vendor/lib' },
          { token: 'git-subtree-split', value: '2'.repeat(40) },
        ]),
        makeTrailerCommit('3'.repeat(40), [
          { token: 'git-subtree-dir', value: 'vendor/lib' },
          { token: 'git-subtree-split', value: '4'.repeat(40) },
        ]),
      ]

      const result = parseSubtreePrefixes(commits)

      assert.equal(result.length, 1)
      assert.equal(result[0].lastMergeSha, '1'.repeat(40))
      assert.equal(result[0].lastMergedSplitSha, '2'.repeat(40))
    })

    it('ignores commits without subtree trailers and sorts by prefix', () => {
      const commits = [
        makeTrailerCommit('1'.repeat(40), [
          { token: 'Co-Authored-By', value: 'Ada <ada@example.com>' },
        ]),
        makeTrailerCommit('2'.repeat(40), []),
        makeTrailerCommit('3'.repeat(40), [
          { token: 'git-subtree-dir', value: 'vendor/zlib/' },
        ]),
        makeTrailerCommit('4'.repeat(40), [
          { token: 'git-subtree-dir', value: 'lib/alpha' },
          { token: 'git-subtree-split', value: '5'.repeat(40) },
        ]),
      ]

      assert.deepEqual(parseSubtreePrefixes(commits), [
        {
          prefix: 'lib/alpha',
          lastMergedSplitSha: '5'.repeat(40),
          lastMergeSha: '4'.repeat(40),
        },
        {
          prefix: 'vendor/zlib',
          lastMergedSplitSha: null,
          lastMergeSha: '3'.repeat(40),
        },
      ])
    })
  })

  describe('prefix validation', () => {
    // The repository path doesn't exist: reaching a spawned Git process would
    // fail with a different error than the validation messages asserted here.
    const repository = new Repository(
      'C:/missing/subtree-superproject',
      -1,
      null,
      false
    )

    it('rejects a traversal prefix before spawning Git', async () => {
      await assert.rejects(
        addSubtree(
          repository,
          'vendor/../lib',
          'https://example.invalid/lib.git',
          'main'
        ),
        (error: Error) => /path segments/.test(error.message)
      )
    })

    it('rejects a leading-slash prefix before spawning Git', async () => {
      await assert.rejects(
        pullSubtree(
          repository,
          '/vendor/lib',
          'https://example.invalid/lib.git',
          'main'
        ),
        (error: Error) => /leading or trailing slashes/.test(error.message)
      )
    })

    it('rejects a backslash prefix before spawning Git', async () => {
      await assert.rejects(
        pushSubtree(
          repository,
          'vendor\\lib',
          'https://example.invalid/lib.git',
          'main'
        ),
        (error: Error) => /forward slashes/.test(error.message)
      )
    })

    it('rejects empty and trailing-slash prefixes before spawning Git', async () => {
      await assert.rejects(splitSubtree(repository, '   '), (error: Error) =>
        /may not be empty/.test(error.message)
      )
      await assert.rejects(
        splitSubtree(repository, 'vendor/lib/'),
        (error: Error) => /leading or trailing slashes/.test(error.message)
      )
    })

    it('accepts a plain relative forward-slash prefix', () => {
      assert.equal(getSubtreePrefixError('vendor/lib'), null)
      assert.match(getSubtreePrefixError('C:/vendor') ?? '', /relative path/)
    })
  })

  describe('isSubtreeAvailable', () => {
    it('memoizes the capability probe', () => {
      assert.equal(isSubtreeAvailable(), isSubtreeAvailable())
    })
  })

  describe('addSubtree', () => {
    it('adds a squashed subtree that discoverSubtrees round trips', async t => {
      if (!(await isSubtreeAvailable())) {
        return t.skip('git subtree is not available in the bundled Git')
      }

      const source = await setupUpstreamRepo(t)
      const superproject = await setupTwoCommitRepo(t)

      await addSubtree(superproject, 'vendor/lib', source.path, 'master', {
        squash: true,
      })

      const contents = await readFile(
        path.join(superproject.path, 'vendor', 'lib', 'lib-file'),
        'utf8'
      )
      assert.equal(contents, 'upstream v2')

      const sourceTip = await git(
        ['rev-parse', 'master'],
        source.path,
        'rev-parse'
      ).then(r => r.stdout.trim())

      const subtrees = await discoverSubtrees(superproject)

      assert.equal(subtrees.length, 1)
      assert.equal(subtrees[0].prefix, 'vendor/lib')
      assert.equal(subtrees[0].lastMergedSplitSha, sourceTip)
      assert.notEqual(subtrees[0].lastMergeSha, null)
    })
  })

  describe('splitSubtree', () => {
    it('splits an added subtree into a new branch', async t => {
      if (!(await isSubtreeAvailable())) {
        return t.skip('git subtree is not available in the bundled Git')
      }

      const source = await setupUpstreamRepo(t)
      const superproject = await setupTwoCommitRepo(t)

      await addSubtree(superproject, 'vendor/lib', source.path, 'master')

      const sha = await splitSubtree(superproject, 'vendor/lib', {
        branch: 'split-out',
      })

      assert.match(sha, /^[0-9a-f]{40}$/)

      const branches = await getBranches(superproject, 'refs/heads/split-out')
      assert.equal(branches.length, 1)
      assert.equal(branches[0].tip.sha, sha)
    })
  })
})
