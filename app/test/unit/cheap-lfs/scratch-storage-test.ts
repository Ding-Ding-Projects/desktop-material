import assert from 'node:assert'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'
import {
  allocateCheapLfsPayloadTemporaryPath,
  ensureCheapLfsScratchHygiene,
  resetCheapLfsScratchSessions,
  resolveCheapLfsGitDirectories,
} from '../../../src/lib/cheap-lfs/scratch-storage'
import { isCheapLfsOwnedArtifactName } from '../../../src/lib/cheap-lfs/owned-artifacts'

const ScratchRoot = join('desktop-material', 'cheap-lfs-scratch')

async function withRepository(
  run: (dir: string) => Promise<void>,
  createGitDirectory: boolean = true
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'cheeplfs-scratch-'))
  resetCheapLfsScratchSessions()
  try {
    if (createGitDirectory) {
      await mkdir(join(dir, '.git'))
    }
    await run(dir)
  } finally {
    resetCheapLfsScratchSessions()
    await rm(dir, { recursive: true, force: true })
  }
}

describe('Cheap LFS scratch storage', () => {
  it('resolves an ordinary .git directory', async () => {
    await withRepository(async dir => {
      const directories = await resolveCheapLfsGitDirectories(dir)
      assert.notEqual(directories, null)
      assert.equal(directories!.gitDir, join(dir, '.git'))
      assert.equal(directories!.commonDir, join(dir, '.git'))
    })
  })

  it('follows a worktree gitdir redirect to its common directory', async () => {
    await withRepository(async dir => {
      const common = join(dir, '.git')
      const linked = join(common, 'worktrees', 'feature')
      await mkdir(linked, { recursive: true })
      await writeFile(join(linked, 'commondir'), '../..\n', 'utf8')
      const tree = join(dir, 'tree')
      await mkdir(tree)
      await writeFile(join(tree, '.git'), `gitdir: ${linked}\n`, 'utf8')

      const directories = await resolveCheapLfsGitDirectories(tree)
      assert.notEqual(directories, null)
      assert.equal(directories!.gitDir, linked)
      assert.equal(directories!.commonDir, common)
    }, false)
  })

  it('allocates payload temps inside .git, never in the working tree', async () => {
    await withRepository(async dir => {
      const first = await allocateCheapLfsPayloadTemporaryPath(dir)
      const second = await allocateCheapLfsPayloadTemporaryPath(dir)
      assert.notEqual(first, null)
      assert.notEqual(second, null)
      assert.notEqual(first, second)
      for (const path of [first!, second!]) {
        const fromRoot = relative(join(dir, '.git', ScratchRoot), path)
        // <session>/<artifact>: inside this run's own scratch session only.
        const segments = fromRoot.split(sep)
        assert.equal(segments.length, 2, fromRoot)
        assert.match(segments[0], /^session-\d+-[0-9a-f]{8}$/)
        assert.equal(isCheapLfsOwnedArtifactName(segments[1]), true)
        assert.equal(relative(dir, path).startsWith('.git'), true)
      }
      assert.equal(dirname(first!), dirname(second!))
    })
  })

  it('declines a private area when the path is not a working tree', async () => {
    await withRepository(async dir => {
      assert.equal(await allocateCheapLfsPayloadTemporaryPath(dir), null)
    }, false)
  })

  it('excludes every owned artifact through the private info/exclude', async () => {
    await withRepository(async dir => {
      const excludePath = join(dir, '.git', 'info', 'exclude')
      await mkdir(dirname(excludePath), { recursive: true })
      await writeFile(excludePath, '# user rule\nsecret.env\n', 'utf8')

      const first = await ensureCheapLfsScratchHygiene(dir)
      assert.equal(first.excludeUpdated, true)
      const written = await readFile(excludePath, 'utf8')
      // The user's own rules survive untouched.
      assert.match(written, /# user rule\nsecret\.env\n/)
      assert.match(written, /^\.cheeplfs-\*\.tmp$/m)
      assert.match(written, /^\.verify-\*\.tmp$/m)
      assert.match(written, /^\.\*\.cheap-lfs-recovery-\*\/$/m)
      assert.match(written, /^\.cheap-lfs-hydrate-\*\/$/m)
      assert.match(written, /^\.cheap-lfs-ghcr-\*$/m)
      assert.match(written, /^\.cheap-lfs-materialized-\*$/m)
      assert.match(written, /^\.cheap-lfs-consumed-\*$/m)

      // Re-running is a no-op rather than an ever-growing pile of blocks.
      const second = await ensureCheapLfsScratchHygiene(dir)
      assert.equal(second.excludeUpdated, false)
      assert.equal(await readFile(excludePath, 'utf8'), written)
      assert.equal(
        written.split('# BEGIN desktop-material Cheap LFS scratch').length,
        2
      )
    })
  })

  it('creates info/exclude when the repository has none', async () => {
    await withRepository(async dir => {
      const result = await ensureCheapLfsScratchHygiene(dir)
      assert.equal(result.excludeUpdated, true)
      const written = await readFile(
        join(dir, '.git', 'info', 'exclude'),
        'utf8'
      )
      assert.match(written, /^\.cheeplfs-\*\.tmp$/m)
    })
  })

  it('sweeps scratch a crashed run left behind, keeping this run intact', async () => {
    await withRepository(async dir => {
      const live = await allocateCheapLfsPayloadTemporaryPath(dir)
      assert.notEqual(live, null)
      await writeFile(live!, 'in flight')

      const root = join(dir, '.git', ScratchRoot)
      const orphan = join(root, 'session-999999-deadbeef')
      await mkdir(orphan, { recursive: true })
      await writeFile(join(orphan, '.cheeplfs-61dca085c3b02d74.tmp'), 'orphan')

      const result = await ensureCheapLfsScratchHygiene(dir)
      assert.deepEqual(result.removedSessions, ['session-999999-deadbeef'])

      const remaining = await readdir(root)
      assert.equal(remaining.length, 1)
      assert.equal(remaining[0], relative(root, dirname(live!)))
      assert.equal(await readFile(live!, 'utf8'), 'in flight')
    })
  })

  it('never touches the working tree while sweeping', async () => {
    await withRepository(async dir => {
      // A user file that happens to carry an artifact-shaped name is data, not
      // scratch: hygiene may hide it from Git, but it must never delete it.
      const lookalike = join(dir, '.cheeplfs-61dca085c3b02d74.tmp')
      await writeFile(lookalike, 'user bytes')
      await ensureCheapLfsScratchHygiene(dir)
      assert.equal(await readFile(lookalike, 'utf8'), 'user bytes')
    })
  })

  it('never throws when the repository has no Git metadata at all', async () => {
    await withRepository(async dir => {
      const result = await ensureCheapLfsScratchHygiene(dir)
      assert.deepEqual(result.removedSessions, [])
      assert.equal(result.excludeUpdated, false)
    }, false)
  })
})
