import assert from 'node:assert'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, TestContext } from 'node:test'
import { exec } from 'dugite'

import { git } from '../../../src/lib/git/core'
import { captureTemporaryWorktreeIndexTree } from '../../../src/lib/git/temporary-worktree-index'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'

const names = {
  locateObjects: 'testTemporaryWorktreeObjects',
  readBase: 'testTemporaryWorktreeBase',
  listPaths: 'testTemporaryWorktreePaths',
  refreshPaths: 'testTemporaryWorktreeRefresh',
  stageEverything: 'testTemporaryWorktreeStage',
  writeTree: 'testTemporaryWorktreeTree',
} as const

async function runGit(repository: Repository, args: ReadonlyArray<string>) {
  const result = await exec([...args], repository.path)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout.trim()
}

async function looseObjectIds(repository: Repository): Promise<Set<string>> {
  const objects = join(repository.path, '.git', 'objects')
  const ids = new Set<string>()
  for (const entry of await readdir(objects, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[0-9a-f]{2}$/.test(entry.name)) {
      continue
    }
    for (const file of await readdir(join(objects, entry.name))) {
      ids.add(`${entry.name}${file}`)
    }
  }
  return ids
}

/** Hash a working-tree file exactly as staging would, without storing it. */
async function hashWithoutStoring(
  repository: Repository,
  relativePath: string
): Promise<string> {
  return runGit(repository, ['hash-object', '--', relativePath])
}

async function objectExists(
  repository: Repository,
  objectId: string
): Promise<boolean> {
  const result = await exec(
    ['cat-file', '-e', `${objectId}^{object}`],
    repository.path
  )
  return result.exitCode === 0
}

/** The exact tree the previous `git add -A` refresh produced. */
async function referenceWorktreeTree(
  repository: Repository,
  t: TestContext,
  baseSha: string | null
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-material-reference-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const env = { GIT_INDEX_FILE: join(directory, 'index') }
  await git(
    baseSha === null ? ['read-tree', '--empty'] : ['read-tree', baseSha],
    repository.path,
    'testReferenceReadTree',
    { env, maxBuffer: 64 * 1024 }
  )
  await git(['add', '-A', '--', '.'], repository.path, 'testReferenceStage', {
    env,
    maxBuffer: 64 * 1024 * 1024,
  })
  const tree = await git(
    ['write-tree'],
    repository.path,
    'testReferenceWriteTree',
    { env, maxBuffer: 64 * 1024 }
  )
  return tree.stdout.trim()
}

async function captureTree(
  repository: Repository,
  t: TestContext,
  baseSha: string | null
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-material-scratch-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return captureTemporaryWorktreeIndexTree({
    run: (args, name, options) => git(args, repository.path, name, options),
    repositoryPath: repository.path,
    temporaryDirectory: directory,
    baseSha,
    names,
    maximumInventoryBytes: 64 * 1024 * 1024,
    maximumSmallOutputBytes: 64 * 1024,
  })
}

async function setupWorktreeRepository(t: TestContext): Promise<Repository> {
  const repository = await setupEmptyRepository(t)
  await mkdir(join(repository.path, 'dir'))
  await writeFile(join(repository.path, 'keep.txt'), 'keep\n')
  await writeFile(join(repository.path, 'dir', 'nested.txt'), 'nested\n')
  await writeFile(join(repository.path, 'pointer.bin'), 'cheap-lfs pointer\n')
  await writeFile(join(repository.path, '.gitignore'), 'ignored.log\n')
  await runGit(repository, ['add', '--all'])
  await runGit(repository, ['commit', '-m', 'base'])
  return repository
}

describe('temporary worktree index', () => {
  it('fingerprints a materialized Cheap LFS payload without storing it', async t => {
    const repository = await setupWorktreeRepository(t)
    const baseSha = await runGit(repository, ['rev-parse', 'HEAD'])

    // A materialized payload replaces its committed pointer text in place, so
    // a whole-tree refresh sees it as one very large modified file.
    await writeFile(
      join(repository.path, 'pointer.bin'),
      randomBytes(4 * 1024 * 1024)
    )
    // Cheap LFS assembles and recovers payloads through scratch artifacts that
    // also live inside the working tree.
    await writeFile(
      join(repository.path, '.cheeplfs-0123456789abcdef.tmp'),
      randomBytes(1024 * 1024)
    )
    await mkdir(join(repository.path, '.pointer.bin.cheap-lfs-recovery-1'))
    await writeFile(
      join(repository.path, '.pointer.bin.cheap-lfs-recovery-1', 'part0'),
      randomBytes(1024 * 1024)
    )
    const payloadBlob = await hashWithoutStoring(repository, 'pointer.bin')
    const scratchBlob = await hashWithoutStoring(
      repository,
      '.cheeplfs-0123456789abcdef.tmp'
    )
    const recoveryBlob = await hashWithoutStoring(
      repository,
      '.pointer.bin.cheap-lfs-recovery-1/part0'
    )
    const before = await looseObjectIds(repository)

    const tree = await captureTree(repository, t, baseSha)

    assert.deepEqual(
      [...(await looseObjectIds(repository))].sort(),
      [...before].sort(),
      'the fingerprint must not add a single object to the repository'
    )
    assert.equal(await objectExists(repository, payloadBlob), false)
    assert.equal(await objectExists(repository, scratchBlob), false)
    assert.equal(await objectExists(repository, recoveryBlob), false)

    // The identical tree, proven against the staging pass it replaced. That
    // reference run is what used to store the payload, so it also proves the
    // assertions above are not vacuous.
    assert.equal(tree, await referenceWorktreeTree(repository, t, baseSha))
    assert.equal(await objectExists(repository, payloadBlob), true)
  })

  it('matches a whole-tree stage for every kind of working-tree drift', async t => {
    const repository = await setupWorktreeRepository(t)
    const baseSha = await runGit(repository, ['rev-parse', 'HEAD'])
    const pristine = await captureTree(repository, t, baseSha)
    assert.equal(pristine, await referenceWorktreeTree(repository, t, baseSha))
    assert.equal(
      pristine,
      await runGit(repository, ['rev-parse', 'HEAD^{tree}'])
    )

    const drifts: ReadonlyArray<{
      readonly what: string
      readonly apply: () => Promise<void>
      readonly revert: () => Promise<void>
    }> = [
      {
        what: 'a modified tracked file',
        apply: () => writeFile(join(repository.path, 'keep.txt'), 'changed\n'),
        revert: () => writeFile(join(repository.path, 'keep.txt'), 'keep\n'),
      },
      {
        what: 'a new untracked file in a nested directory',
        apply: () =>
          writeFile(join(repository.path, 'dir', 'added.txt'), 'a\n'),
        revert: () => rm(join(repository.path, 'dir', 'added.txt')),
      },
      {
        what: 'a deleted tracked file',
        apply: () => rm(join(repository.path, 'dir', 'nested.txt')),
        revert: () =>
          writeFile(join(repository.path, 'dir', 'nested.txt'), 'nested\n'),
      },
      {
        what: 'a materialized payload changed again',
        apply: () =>
          writeFile(join(repository.path, 'pointer.bin'), randomBytes(1024)),
        revert: () =>
          writeFile(
            join(repository.path, 'pointer.bin'),
            'cheap-lfs pointer\n'
          ),
      },
      {
        what: 'a non-ASCII path',
        apply: () =>
          writeFile(join(repository.path, 'pointër-путь.txt'), 'unicode\n'),
        revert: () => rm(join(repository.path, 'pointër-путь.txt')),
      },
    ]

    for (const drift of drifts) {
      await drift.apply()
      const captured = await captureTree(repository, t, baseSha)
      assert.equal(
        captured,
        await referenceWorktreeTree(repository, t, baseSha),
        `the fingerprint must match a whole-tree stage for ${drift.what}`
      )
      assert.notEqual(
        captured,
        pristine,
        `the fingerprint must still detect ${drift.what}`
      )
      await drift.revert()
      assert.equal(
        await captureTree(repository, t, baseSha),
        pristine,
        `reverting ${drift.what} must restore the exact fingerprint`
      )
    }
  })

  it('ignores an ignored file exactly as a whole-tree stage does', async t => {
    const repository = await setupWorktreeRepository(t)
    const baseSha = await runGit(repository, ['rev-parse', 'HEAD'])
    const pristine = await captureTree(repository, t, baseSha)

    await writeFile(join(repository.path, 'ignored.log'), 'ignored\n')

    assert.equal(await captureTree(repository, t, baseSha), pristine)
    assert.equal(
      await referenceWorktreeTree(repository, t, baseSha),
      pristine,
      'the staging pass this replaced also skipped ignored files'
    )
  })

  it('still fingerprints a tracked file replaced by a directory', async t => {
    const repository = await setupWorktreeRepository(t)
    const baseSha = await runGit(repository, ['rev-parse', 'HEAD'])

    // `git update-index` cannot express this directory/file collision, so the
    // refresh falls back to the traversal that can.
    await rm(join(repository.path, 'keep.txt'))
    await mkdir(join(repository.path, 'keep.txt'))
    await writeFile(join(repository.path, 'keep.txt', 'inner.txt'), 'inner\n')

    assert.equal(
      await captureTree(repository, t, baseSha),
      await referenceWorktreeTree(repository, t, baseSha)
    )
  })

  it('fingerprints an unborn base from the working tree alone', async t => {
    const repository = await setupEmptyRepository(t)
    await writeFile(join(repository.path, 'root.txt'), 'root\n')

    const captured = await captureTree(repository, t, null)

    assert.equal(captured, await referenceWorktreeTree(repository, t, null))
  })
})
