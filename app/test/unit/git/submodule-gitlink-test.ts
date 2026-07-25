import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'

import { Repository } from '../../../src/models/repository'
import { createCommit, getWorkingDirectoryDiff } from '../../../src/lib/git'
import { unstageAll } from '../../../src/lib/git/reset'
import { DiffType, ISubmoduleDiff } from '../../../src/models/diff'
import { setupTwoCommitRepo } from '../../helpers/repositories'
import { getStatusOrThrow } from '../../helpers/status'

/**
 * Add a submodule to `repo` and leave its gitlink out of the index, which is
 * the state the app is in whenever it has run `unstageAll` (`git reset -- .`)
 * since the submodule was added - most notably at the start of every commit.
 */
async function setupRepoWithUnstagedSubmodule(
  t: TestContext,
  submodulePath = 'vendor/sub'
): Promise<Repository> {
  const repo = await setupTwoCommitRepo(t)
  const submoduleSource = await setupTwoCommitRepo(t)

  await exec(
    [
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      submoduleSource.path,
      submodulePath,
    ],
    repo.path
  )

  // `git submodule add` stages the gitlink; the app drops it again on its way
  // into a commit. Everything below is about surviving that round trip.
  await unstageAll(repo)

  return repo
}

const lsTree = async (repo: Repository, ref = 'HEAD') =>
  (await exec(['ls-tree', '-r', ref], repo.path)).stdout

describe('git/submodule gitlink round trip', () => {
  describe('getStatus', () => {
    it('classifies an unstaged submodule as a submodule rather than a plain file', async t => {
      const repo = await setupRepoWithUnstagedSubmodule(t)

      const status = await getStatusOrThrow(repo)
      const file = status.workingDirectory.files.find(f =>
        f.path.startsWith('vendor/sub')
      )

      assert(file, 'expected the submodule to appear in the working directory')
      // Git reports the path as `vendor/sub/`; the trailing slash must not
      // survive, because `git update-index` silently skips such a path.
      assert.equal(file.path, 'vendor/sub')
      assert.notEqual(
        file.status.submoduleStatus,
        undefined,
        'expected the entry to carry a submodule status'
      )
      assert.equal(file.status.submoduleStatus?.commitChanged, true)
    })

    it('leaves an ordinary untracked directory alone', async t => {
      const repo = await setupTwoCommitRepo(t)
      await mkdir(join(repo.path, 'plaindir'))
      await writeFile(join(repo.path, 'plaindir', 'f.txt'), 'hi\n')

      const status = await getStatusOrThrow(repo)
      const file = status.workingDirectory.files.find(f =>
        f.path.startsWith('plaindir')
      )

      assert(file)
      // `--untracked-files=all` recurses into ordinary directories, so this is
      // a file path and must not be mistaken for a submodule.
      assert.equal(file.path, 'plaindir/f.txt')
      assert.equal(file.status.submoduleStatus, undefined)
    })

    it('classifies an embedded repository that has no .gitmodules entry', async t => {
      const repo = await setupTwoCommitRepo(t)
      const embedded = join(repo.path, 'embedded')
      await mkdir(embedded)
      await exec(['init'], embedded)
      await writeFile(join(embedded, 'e.txt'), 'e\n')
      await exec(['add', 'e.txt'], embedded)
      await exec(['commit', '-m', 'embedded'], embedded)

      const status = await getStatusOrThrow(repo)
      const file = status.workingDirectory.files.find(f =>
        f.path.startsWith('embedded')
      )

      assert(file)
      assert.equal(file.path, 'embedded')
      assert.notEqual(file.status.submoduleStatus, undefined)
    })
  })

  describe('getWorkingDirectoryDiff', () => {
    it('renders a submodule diff naming the target commit', async t => {
      const repo = await setupRepoWithUnstagedSubmodule(t)

      const status = await getStatusOrThrow(repo)
      const file = status.workingDirectory.files.find(
        f => f.path === 'vendor/sub'
      )
      assert(file)

      const diff = await getWorkingDirectoryDiff(repo, file)
      assert.equal(
        diff.kind,
        DiffType.Submodule,
        'expected a submodule diff rather than an empty text diff'
      )

      const submoduleDiff = diff as ISubmoduleDiff
      assert.equal(submoduleDiff.path, 'vendor/sub')

      // The gitlink is in neither HEAD nor the index, so `git diff` cannot
      // report a "Subproject commit" line; the SHA has to come from the nested
      // repository itself.
      const expectedSHA = (
        await exec(['rev-parse', 'HEAD'], join(repo.path, 'vendor', 'sub'))
      ).stdout.trim()

      assert.equal(submoduleDiff.newSHA, expectedSHA)
      assert.equal(submoduleDiff.oldSHA, null)
    })
  })

  describe('createCommit', () => {
    it('records mode 160000 for an unstaged submodule', async t => {
      const repo = await setupRepoWithUnstagedSubmodule(t)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files
      assert.equal(
        files.length,
        2,
        'expected .gitmodules and the submodule itself'
      )

      const expectedSHA = (
        await exec(['rev-parse', 'HEAD'], join(repo.path, 'vendor', 'sub'))
      ).stdout.trim()

      await createCommit(repo, 'Add submodule', files)

      const tree = await lsTree(repo)

      // The regression this pins: the gitlink used to be dropped entirely,
      // leaving a .gitmodules entry pointing at an untracked path (which reads
      // as "Missing Git link" after a fresh clone).
      assert.match(
        tree,
        new RegExp(`^160000 commit ${expectedSHA}\\tvendor/sub$`, 'm'),
        `expected a mode-160000 gitlink for vendor/sub, got:\n${tree}`
      )
      assert.match(tree, /^100644 blob [0-9a-f]+\t\.gitmodules$/m)

      // Nothing should have been committed as an empty regular file.
      assert.doesNotMatch(tree, /^100644 blob [0-9a-f]+\tvendor\/sub$/m)

      const remainingStatus = await getStatusOrThrow(repo)
      assert.equal(
        remainingStatus.workingDirectory.files.length,
        0,
        'expected a clean working directory after the commit'
      )
    })

    it('records mode 160000 when the submodule is committed on its own', async t => {
      const repo = await setupRepoWithUnstagedSubmodule(t)

      const status = await getStatusOrThrow(repo)
      const submodule = status.workingDirectory.files.find(
        f => f.path === 'vendor/sub'
      )
      assert(submodule)

      await createCommit(repo, 'Add submodule only', [submodule])

      assert.match(
        await lsTree(repo),
        /^160000 commit [0-9a-f]+\tvendor\/sub$/m
      )
    })
  })
})
