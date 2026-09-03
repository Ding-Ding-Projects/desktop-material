import assert from 'node:assert'
import * as Path from 'path'
import { realpath, rm, symlink, writeFile } from 'fs/promises'
import { describe, it } from 'node:test'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import {
  parseWorktreePorcelainOutput,
  listWorktrees,
  listWorktreesFromGitDir,
  resolveMainWorktreePath,
  lockWorktree,
  pruneWorktrees,
  repairWorktrees,
  unlockWorktree,
  validateWorktreeRepairPaths,
} from '../../../src/lib/git'
import { Repository } from '../../../src/models/repository'

describe('git/worktree', () => {
  describe('parseWorktreePorcelainOutput', () => {
    it('returns empty array for empty output', () => {
      assert.deepStrictEqual(parseWorktreePorcelainOutput(''), [])
      assert.deepStrictEqual(parseWorktreePorcelainOutput('  \n  '), [])
    })

    it('parses a single main worktree', () => {
      const output =
        [
          'worktree /path/to/repo',
          'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
          'branch refs/heads/main',
        ].join('\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries.length, 1)
      assert.deepStrictEqual(entries[0], {
        path: Path.normalize('/path/to/repo'),
        head: 'abc1234abc1234abc1234abc1234abc1234abc123',
        branch: 'refs/heads/main',
        isDetached: false,
        type: 'main',
        isLocked: false,
        isPrunable: false,
      })
    })

    it('parses multiple worktrees', () => {
      const output =
        [
          [
            'worktree /path/to/repo',
            'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
            'branch refs/heads/main',
          ].join('\0'),
          [
            'worktree /path/to/linked',
            'HEAD def5678def5678def5678def5678def5678def567',
            'branch refs/heads/feature',
          ].join('\0'),
        ].join('\0\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries.length, 2)

      assert.strictEqual(entries[0].type, 'main')
      assert.strictEqual(entries[0].path, Path.normalize('/path/to/repo'))

      assert.strictEqual(entries[1].type, 'linked')
      assert.strictEqual(entries[1].path, Path.normalize('/path/to/linked'))
      assert.strictEqual(entries[1].branch, 'refs/heads/feature')
    })

    it('parses detached HEAD worktree', () => {
      const output =
        [
          [
            'worktree /path/to/repo',
            'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
            'branch refs/heads/main',
          ].join('\0'),
          [
            'worktree /path/to/detached',
            'HEAD def5678def5678def5678def5678def5678def567',
            'detached',
          ].join('\0'),
        ].join('\0\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries.length, 2)

      assert.strictEqual(entries[1].isDetached, true)
      assert.strictEqual(entries[1].branch, null)
    })

    it('parses locked worktree', () => {
      const output =
        [
          [
            'worktree /path/to/repo',
            'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
            'branch refs/heads/main',
          ].join('\0'),
          [
            'worktree /path/to/locked-wt',
            'HEAD def5678def5678def5678def5678def5678def567',
            'branch refs/heads/locked-branch',
            'locked',
          ].join('\0'),
        ].join('\0\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[1].isLocked, true)
    })

    it('parses locked worktree with reason', () => {
      const output =
        [
          [
            'worktree /path/to/repo',
            'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
            'branch refs/heads/main',
          ].join('\0'),
          [
            'worktree /path/to/locked-wt',
            'HEAD def5678def5678def5678def5678def5678def567',
            'branch refs/heads/locked-branch',
            'locked reason why it is locked',
          ].join('\0'),
        ].join('\0\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[1].isLocked, true)
    })

    it('parses prunable worktree', () => {
      const output =
        [
          [
            'worktree /path/to/repo',
            'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
            'branch refs/heads/main',
          ].join('\0'),
          [
            'worktree /path/to/prunable-wt',
            'HEAD def5678def5678def5678def5678def5678def567',
            'branch refs/heads/stale',
            'prunable gitdir file points to non-existent location',
          ].join('\0'),
        ].join('\0\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[1].isPrunable, true)
    })

    it('parses paths with spaces', () => {
      const output =
        [
          [
            'worktree /path/to/my repo',
            'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
            'branch refs/heads/main',
          ].join('\0'),
          [
            'worktree /path/to/my other worktree',
            'HEAD def5678def5678def5678def5678def5678def567',
            'branch refs/heads/feature',
          ].join('\0'),
        ].join('\0\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[0].path, Path.normalize('/path/to/my repo'))
      assert.strictEqual(
        entries[1].path,
        Path.normalize('/path/to/my other worktree')
      )
    })

    it('parses worktree with locked and prunable flags combined', () => {
      const output =
        [
          [
            'worktree /path/to/repo',
            'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
            'branch refs/heads/main',
          ].join('\0'),
          [
            'worktree /path/to/bad-wt',
            'HEAD def5678def5678def5678def5678def5678def567',
            'detached',
            'locked',
            'prunable',
          ].join('\0'),
        ].join('\0\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[1].isDetached, true)
      assert.strictEqual(entries[1].isLocked, true)
      assert.strictEqual(entries[1].isPrunable, true)
      assert.strictEqual(entries[1].branch, null)
    })

    it('parses paths with newlines', () => {
      const output =
        [
          [
            'worktree /path/to/my\nrepo',
            'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
            'branch refs/heads/main',
          ].join('\0'),
          [
            'worktree /path/to/my\nother\nworktree',
            'HEAD def5678def5678def5678def5678def5678def567',
            'branch refs/heads/feature',
          ].join('\0'),
        ].join('\0\0') + '\0'

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[0].path, Path.normalize('/path/to/my\nrepo'))
      assert.strictEqual(
        entries[1].path,
        Path.normalize('/path/to/my\nother\nworktree')
      )
    })
  })

  describe('listWorktrees', () => {
    /** Helper to extract checked-out branch refs from worktree entries */
    function checkedOutBranches(
      worktrees: ReadonlyArray<{ readonly branch: string | null }>
    ): ReadonlySet<string> {
      return new Set(worktrees.map(wt => wt.branch).filter(b => b !== null))
    }

    it('returns only main worktree branch when there are no linked worktrees', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })

      const branches = checkedOutBranches(await listWorktrees(repo))
      assert.strictEqual(branches.size, 1)
      assert(branches.has('refs/heads/main'))
    })

    it('returns branches checked out in linked worktrees', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-a'], repo.path)
      await exec(
        ['worktree', 'add', repo.path + '-wt-a', 'feature-a'],
        repo.path
      )

      const branches = checkedOutBranches(await listWorktrees(repo))
      assert(branches.has('refs/heads/feature-a'))
      assert(branches.has('refs/heads/main'))
      assert.strictEqual(branches.size, 2)
    })

    it('handles multiple linked worktrees', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-a'], repo.path)
      await exec(['branch', 'feature-b'], repo.path)
      await exec(
        ['worktree', 'add', repo.path + '-wt-a', 'feature-a'],
        repo.path
      )
      await exec(
        ['worktree', 'add', repo.path + '-wt-b', 'feature-b'],
        repo.path
      )

      const branches = checkedOutBranches(await listWorktrees(repo))
      assert(branches.has('refs/heads/feature-a'))
      assert(branches.has('refs/heads/feature-b'))
      assert(branches.has('refs/heads/main'))
      assert.strictEqual(branches.size, 3)
    })

    it('handles detached HEAD worktrees', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })

      const { stdout } = await exec(['rev-parse', 'HEAD'], repo.path)
      const sha = stdout.trim()
      await exec(
        ['worktree', 'add', '--detach', repo.path + '-wt-detached', sha],
        repo.path
      )

      const branches = checkedOutBranches(await listWorktrees(repo))
      assert.strictEqual(branches.size, 1)
      assert(branches.has('refs/heads/main'))
    })

    it('lists worktrees from a git dir after a linked worktree directory is removed', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-a'], repo.path)

      const worktreePath = repo.path + '-wt-a'
      await exec(['worktree', 'add', worktreePath, 'feature-a'], repo.path)

      const { stdout } = await exec(['rev-parse', '--git-dir'], worktreePath)
      const gitDir = Path.resolve(worktreePath, stdout.trim())

      await rm(worktreePath, { recursive: true, force: true })

      const worktrees = await listWorktreesFromGitDir(gitDir)
      const mainWorktree = worktrees.find(wt => wt.type === 'main')
      const repoPath = await realpath(repo.path)
      const resolvedWorktreePath = repoPath + '-wt-a'

      assert.strictEqual(mainWorktree?.path, repoPath)
      assert(
        worktrees.some(wt => wt.path === resolvedWorktreePath && wt.isPrunable)
      )
    })
  })

  describe('resolveMainWorktreePath', () => {
    async function linkedRepository(
      t: Parameters<typeof setupEmptyRepository>[0]
    ) {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-main-path'], repo.path)
      const linkedPath = repo.path + '-main-path'
      await exec(
        ['worktree', 'add', linkedPath, 'feature-main-path'],
        repo.path
      )
      const { stdout } = await exec(['rev-parse', '--git-dir'], linkedPath)
      return {
        repo,
        mainPath: await realpath(repo.path),
        linkedPath: await realpath(linkedPath),
        gitDir: Path.resolve(linkedPath, stdout.trim()),
      }
    }

    function asRepository(
      linkedPath: string,
      gitDir: string | undefined,
      mainWorktreePath?: string
    ): Repository {
      return new Repository(
        linkedPath,
        -1,
        null,
        true,
        null,
        {},
        false,
        gitDir,
        null,
        undefined,
        null,
        null,
        null,
        mainWorktreePath
      )
    }

    it('returns a readable recorded main path', async t => {
      const { mainPath, linkedPath, gitDir } = await linkedRepository(t)
      assert.strictEqual(
        await resolveMainWorktreePath(
          asRepository(linkedPath, gitDir, mainPath)
        ),
        mainPath
      )
    })

    it('recovers from a valid hint after linked worktree metadata is removed', async t => {
      const { repo, mainPath, linkedPath, gitDir } = await linkedRepository(t)
      const selected = asRepository(linkedPath, gitDir, mainPath)
      await exec(['worktree', 'remove', '--force', linkedPath], repo.path)

      assert.strictEqual(await resolveMainWorktreePath(selected), mainPath)
    })

    it('rejects an existing file as a recorded main path', async t => {
      const { repo, mainPath, linkedPath, gitDir } = await linkedRepository(t)
      const filePath = Path.join(repo.path, 'not-a-worktree')
      await writeFile(filePath, 'not a directory')

      assert.strictEqual(
        await resolveMainWorktreePath(
          asRepository(linkedPath, gitDir, filePath)
        ),
        mainPath
      )
    })

    it('rejects an unrelated repository as a recorded main path', async t => {
      const { mainPath, linkedPath, gitDir } = await linkedRepository(t)
      const unrelated = await setupEmptyRepository(t, 'main')
      await makeCommit(unrelated, {
        entries: [{ path: 'README', contents: 'unrelated' }],
      })

      assert.strictEqual(
        await resolveMainWorktreePath(
          asRepository(linkedPath, gitDir, unrelated.path)
        ),
        mainPath
      )
    })

    it('rejects a symlink or reparse path and uses git metadata', async t => {
      const { repo, mainPath, linkedPath, gitDir } = await linkedRepository(t)
      const symlinkPath = Path.join(repo.path, 'main-link')
      await symlink(mainPath, symlinkPath, 'junction')

      assert.strictEqual(
        await resolveMainWorktreePath(
          asRepository(linkedPath, gitDir, symlinkPath)
        ),
        mainPath
      )
    })

    it('falls back to git metadata when the recorded path is stale or inaccessible', async t => {
      const { mainPath, linkedPath, gitDir } = await linkedRepository(t)
      const stalePath = Path.join(mainPath, 'missing-main-worktree')
      assert.strictEqual(
        await resolveMainWorktreePath(
          asRepository(linkedPath, gitDir, stalePath)
        ),
        mainPath
      )
    })

    it('falls back through a primary .git directory', async t => {
      const { repo, mainPath, linkedPath } = await linkedRepository(t)
      assert.strictEqual(
        await resolveMainWorktreePath(
          asRepository(linkedPath, Path.join(repo.path, '.git'))
        ),
        mainPath
      )
    })

    it('does not guess when neither the recorded path nor metadata is usable', async t => {
      const { linkedPath } = await linkedRepository(t)
      assert.strictEqual(
        await resolveMainWorktreePath(
          asRepository(
            linkedPath,
            undefined,
            Path.join(linkedPath, 'missing-main')
          )
        ),
        null
      )
    })

    it('resolves one main path when several linked worktrees exist', async t => {
      const { repo, mainPath, linkedPath, gitDir } = await linkedRepository(t)
      await exec(['branch', 'feature-main-path-two'], repo.path)
      await exec(
        [
          'worktree',
          'add',
          repo.path + '-main-path-two',
          'feature-main-path-two',
        ],
        repo.path
      )
      assert.strictEqual(
        await resolveMainWorktreePath(asRepository(linkedPath, gitDir)),
        mainPath
      )
    })
  })

  describe('administration', () => {
    it('locks, unlocks, and repairs an exact registered worktree', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-lock'], repo.path)
      const logicalWorktreePath = repo.path + '-wt-lock'
      await exec(
        ['worktree', 'add', logicalWorktreePath, 'feature-lock'],
        repo.path
      )
      const repositoryPath = await realpath(repo.path)
      const worktreePath = await realpath(logicalWorktreePath)

      await lockWorktree(repo, worktreePath)
      assert.equal(
        (await listWorktrees(repo)).find(w => w.path === worktreePath)
          ?.isLocked,
        true
      )
      await unlockWorktree(repo, worktreePath)
      assert.equal(
        (await listWorktrees(repo)).find(w => w.path === worktreePath)
          ?.isLocked,
        false
      )

      await repairWorktrees(repo, [repositoryPath, worktreePath])
      assert.equal((await listWorktrees(repo)).length, 2)
    })

    it('previews and prunes only missing worktree records', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-prune'], repo.path)
      const worktreePath = repo.path + '-wt-prune'
      await exec(['worktree', 'add', worktreePath, 'feature-prune'], repo.path)
      await rm(worktreePath, { recursive: true, force: true })

      assert.equal(await pruneWorktrees(repo, true), 1)
      assert.equal((await listWorktrees(repo)).length, 2)
      assert.equal(await pruneWorktrees(repo, false), 1)
      assert.equal((await listWorktrees(repo)).length, 1)
    })

    it('rejects unbounded, relative, and duplicate repair path sets', () => {
      assert.throws(() => validateWorktreeRepairPaths([]), /bounded set/)
      assert.throws(
        () => validateWorktreeRepairPaths(['relative-worktree']),
        /absolute path/
      )
      assert.throws(
        () => validateWorktreeRepairPaths([repoPath('one'), repoPath('one')]),
        /invalid/
      )
      assert.throws(
        () =>
          validateWorktreeRepairPaths(
            Array.from({ length: 1_001 }, (_, index) =>
              repoPath(`worktree-${index}`)
            )
          ),
        /bounded set/
      )
    })
  })
})

function repoPath(name: string): string {
  return Path.resolve(Path.parse(process.cwd()).root, 'worktrees', name)
}
