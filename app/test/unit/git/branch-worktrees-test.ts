import assert from 'node:assert'
import * as Path from 'path'
import { mkdir, readFile, rm } from 'fs/promises'
import { describe, it } from 'node:test'
import { exec } from 'dugite'

import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { Branch, BranchType } from '../../../src/models/branch'
import { WorktreeEntry } from '../../../src/models/worktree'
import {
  BranchWorktreeContainerName,
  checkoutBranchesAsWorktrees,
  excludeBranchWorktreeContainer,
  getBranchWorktreePath,
  planBranchWorktrees,
  worktreeDirectoryNameForBranch,
} from '../../../src/lib/git/branch-worktrees'
import { listWorktrees } from '../../../src/lib/git'

function localBranch(name: string, sha = 'a'.repeat(40)): Branch {
  return new Branch(name, null, { sha }, BranchType.Local, `refs/heads/${name}`)
}

function remoteBranch(nameWithRemote: string, sha = 'b'.repeat(40)): Branch {
  return new Branch(
    nameWithRemote,
    null,
    { sha },
    BranchType.Remote,
    `refs/remotes/${nameWithRemote}`
  )
}

function worktree(path: string, branch: string | null): WorktreeEntry {
  return {
    path,
    head: 'c'.repeat(40),
    branch,
    isDetached: branch === null,
    type: 'linked',
    isLocked: false,
    isPrunable: false,
  }
}

describe('git/branch-worktrees', () => {
  describe('worktreeDirectoryNameForBranch', () => {
    it('keeps the shape of a namespaced branch', () => {
      assert.strictEqual(
        worktreeDirectoryNameForBranch('feature/thing'),
        Path.join('feature', 'thing')
      )
    })

    it('replaces characters a file system cannot represent', () => {
      assert.strictEqual(
        worktreeDirectoryNameForBranch('fix:the?thing'),
        'fix-the-thing'
      )
    })

    it('drops a trailing dot that Windows would refuse', () => {
      assert.strictEqual(worktreeDirectoryNameForBranch('release.'), 'release')
    })

    it('escapes a reserved device name', () => {
      assert.strictEqual(worktreeDirectoryNameForBranch('con'), 'con-')
      assert.strictEqual(worktreeDirectoryNameForBranch('com1'), 'com1-')
      assert.strictEqual(worktreeDirectoryNameForBranch('lpt9'), 'lpt9-')
      assert.strictEqual(worktreeDirectoryNameForBranch('com0'), 'com0')
      assert.strictEqual(worktreeDirectoryNameForBranch('lpt0'), 'lpt0')
    })

    it('never produces an empty directory name', () => {
      assert.strictEqual(worktreeDirectoryNameForBranch('///'), 'branch')
    })
  })

  describe('planBranchWorktrees', () => {
    const repositoryPath = Path.join('/repos', 'example')

    it('includes every branch that is not checked out', () => {
      const plan = planBranchWorktrees(
        repositoryPath,
        [localBranch('main'), localBranch('feature/thing')],
        []
      )

      assert.deepStrictEqual(
        plan.candidates.map(c => c.branchName),
        ['main', 'feature/thing']
      )
      assert.strictEqual(
        plan.candidates[1].path,
        getBranchWorktreePath(repositoryPath, 'feature/thing')
      )
    })

    it('skips a branch that is already checked out somewhere', () => {
      const plan = planBranchWorktrees(
        repositoryPath,
        [localBranch('main'), localBranch('feature')],
        [worktree(repositoryPath, 'refs/heads/main')]
      )

      assert.deepStrictEqual(
        plan.candidates.map(c => c.branchName),
        ['feature']
      )
      assert.deepStrictEqual(plan.skipped, [
        {
          branchName: 'main',
          reason: 'already-checked-out',
          existingPath: repositoryPath,
        },
      ])
    })

    it('still offers a branch whose only worktree record is prunable', () => {
      const missing = {
        ...worktree('/gone', 'refs/heads/feature'),
        isPrunable: true,
      }

      const plan = planBranchWorktrees(
        repositoryPath,
        [localBranch('feature')],
        [missing]
      )

      assert.deepStrictEqual(
        plan.candidates.map(c => c.branchName),
        ['feature']
      )
    })

    it('creates a local branch for a remote-only branch', () => {
      const plan = planBranchWorktrees(
        repositoryPath,
        [remoteBranch('origin/feature')],
        []
      )

      assert.strictEqual(plan.candidates.length, 1)
      assert.strictEqual(plan.candidates[0].branchName, 'feature')
      assert.strictEqual(plan.candidates[0].createBranch, 'feature')
      assert.strictEqual(
        plan.candidates[0].commitish,
        'refs/remotes/origin/feature'
      )
      assert.strictEqual(plan.candidates[0].remoteName, 'origin')
    })

    it('prefers the local branch over its remote counterpart', () => {
      const plan = planBranchWorktrees(
        repositoryPath,
        [localBranch('feature'), remoteBranch('origin/feature')],
        []
      )

      assert.deepStrictEqual(
        plan.candidates.map(c => c.branchName),
        ['feature']
      )
      assert.strictEqual(plan.candidates[0].createBranch, undefined)
      assert.deepStrictEqual(plan.skipped, [
        { branchName: 'feature', reason: 'shadowed-by-local' },
      ])
    })

    it('lists a branch once when several remotes carry it', () => {
      const plan = planBranchWorktrees(
        repositoryPath,
        [remoteBranch('origin/feature'), remoteBranch('upstream/feature')],
        []
      )

      assert.strictEqual(plan.candidates.length, 1)
      assert.strictEqual(plan.candidates[0].remoteName, 'origin')
      assert.deepStrictEqual(plan.skipped, [
        { branchName: 'feature', reason: 'duplicate-remote' },
      ])
    })

    it('skips a later branch whose directory equals or nests with an earlier one', () => {
      const nested = planBranchWorktrees(
        repositoryPath,
        [localBranch('feature'), localBranch('feature/thing')],
        []
      )
      const sanitized = planBranchWorktrees(
        repositoryPath,
        [localBranch('fix|thing'), localBranch('fix<thing')],
        []
      )

      assert.deepStrictEqual(
        nested.candidates.map(candidate => candidate.branchName),
        ['feature']
      )
      assert.deepStrictEqual(nested.skipped, [
        {
          branchName: 'feature/thing',
          reason: 'directory-conflict',
          existingPath: getBranchWorktreePath(repositoryPath, 'feature'),
          conflictingBranchName: 'feature',
        },
      ])
      assert.deepStrictEqual(
        sanitized.candidates.map(candidate => candidate.branchName),
        ['fix|thing']
      )
      assert.strictEqual(sanitized.skipped[0].reason, 'directory-conflict')
      assert.strictEqual(
        sanitized.skipped[0].conflictingBranchName,
        'fix|thing'
      )
    })
  })

  describe('excludeBranchWorktreeContainer', () => {
    it('excludes the container exactly once', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })

      await excludeBranchWorktreeContainer(repo)
      await excludeBranchWorktreeContainer(repo)

      const exclude = await readFile(
        Path.join(repo.path, '.git', 'info', 'exclude'),
        'utf8'
      )
      const entries = exclude
        .split(/\r?\n/)
        .filter(line => line.trim() === `/${BranchWorktreeContainerName}/`)

      assert.strictEqual(entries.length, 1)
    })
  })

  describe('checkoutBranchesAsWorktrees', () => {
    it('checks every selected branch out under the container', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-a'], repo.path)
      await exec(['branch', 'feature/b'], repo.path)

      const plan = planBranchWorktrees(
        repo.path,
        [
          localBranch('main'),
          localBranch('feature-a'),
          localBranch('feature/b'),
        ],
        await listWorktrees(repo)
      )

      const progress = new Array<string>()
      const results = await checkoutBranchesAsWorktrees(
        repo,
        plan.candidates,
        p => progress.push(`${p.branchName} ${p.value}/${p.total}`)
      )

      assert.deepStrictEqual(
        results.map(r => r.error),
        [undefined, undefined]
      )
      assert.deepStrictEqual(progress, ['feature-a 1/2', 'feature/b 2/2'])

      const worktrees = await listWorktrees(repo)
      const paths = worktrees.map(w => w.path)
      assert(paths.includes(getBranchWorktreePath(repo.path, 'feature-a')))
      assert(paths.includes(getBranchWorktreePath(repo.path, 'feature/b')))

      // The container lives inside the repository, so it must not show up as
      // an untracked change.
      const status = await exec(['status', '--porcelain'], repo.path)
      assert.strictEqual(status.stdout.trim(), '')
    })

    it('reports a failing branch without stopping the rest', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-a'], repo.path)

      const results = await checkoutBranchesAsWorktrees(repo, [
        {
          branchName: 'does-not-exist',
          path: getBranchWorktreePath(repo.path, 'does-not-exist'),
          commitish: 'does-not-exist',
          sha: 'd'.repeat(40),
        },
        {
          branchName: 'feature-a',
          path: getBranchWorktreePath(repo.path, 'feature-a'),
          commitish: 'feature-a',
          sha: 'e'.repeat(40),
        },
      ])

      assert.strictEqual(results.length, 2)
      assert(results[0].error instanceof Error)
      assert.strictEqual(results[1].error, undefined)

      const paths = (await listWorktrees(repo)).map(w => w.path)
      assert(paths.includes(getBranchWorktreePath(repo.path, 'feature-a')))
    })

    it('continues when the local exclude file cannot be updated', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-a'], repo.path)

      const excludePath = Path.join(repo.path, '.git', 'info', 'exclude')
      await rm(excludePath, { force: true })
      await mkdir(excludePath)

      const results = await checkoutBranchesAsWorktrees(repo, [
        {
          branchName: 'feature-a',
          path: getBranchWorktreePath(repo.path, 'feature-a'),
          commitish: 'feature-a',
          sha: 'e'.repeat(40),
        },
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].error, undefined)
      assert(
        (await listWorktrees(repo))
          .map(worktree => worktree.path)
          .includes(getBranchWorktreePath(repo.path, 'feature-a'))
      )
    })
  })
})
