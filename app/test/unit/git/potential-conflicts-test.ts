import assert from 'node:assert'
import { describe, it, mock, TestContext } from 'node:test'
import { exec } from 'dugite'
import { writeFile } from 'fs/promises'
import { join } from 'path'

import { Branch, BranchType } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'
import { createTempDirectory } from '../../helpers/temp'

// Exercise real Git without loading Electron's credential/trampoline services.
mock.module('../../../src/lib/git/core', {
  namedExports: {
    git: async (
      args: string[],
      path: string,
      _name: string,
      options?: { successExitCodes?: Set<number> }
    ) => {
      const result = await exec(args, path)
      assert.ok(
        (options?.successExitCodes ?? new Set([0])).has(result.exitCode),
        result.stderr
      )
      return result
    },
  },
})

async function runGit(repository: Repository, args: string[]) {
  const result = await exec(args, repository.path)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout.trim()
}

async function commitFile(
  repository: Repository,
  path: string,
  content: string
) {
  await writeFile(join(repository.path, path), content)
  await runGit(repository, ['add', '--', path])
  await runGit(repository, ['commit', '-m', path])
}

async function diverge(t: TestContext, rootBase: boolean, overlap: boolean) {
  const { findPotentialConflict } =
    await import('../../../src/lib/git/potential-conflicts')
  const repository = new Repository(
    await createTempDirectory(t),
    -1,
    null,
    false
  )
  await runGit(repository, ['init', '-b', 'main'])
  await runGit(repository, ['config', 'user.name', 'Test'])
  await runGit(repository, ['config', 'user.email', 'test@example.com'])
  if (!rootBase) {
    await commitFile(repository, 'initial.txt', 'initial\n')
  }
  await commitFile(repository, 'shared.txt', 'base\n')
  await runGit(repository, ['branch', 'upstream'])
  await commitFile(repository, overlap ? 'shared.txt' : 'ours.txt', 'ours\n')
  const sha = await runGit(repository, ['rev-parse', 'HEAD'])
  await runGit(repository, ['checkout', 'upstream'])
  await commitFile(
    repository,
    overlap ? 'shared.txt' : 'theirs.txt',
    'theirs\n'
  )
  await runGit(repository, ['checkout', 'main'])
  const branch = new Branch(
    'main',
    'upstream',
    { sha },
    BranchType.Local,
    'refs/heads/main'
  )
  return findPotentialConflict(repository, branch, { ahead: 1, behind: 1 })
}

describe('git/potential-conflicts', () => {
  it('does not count changes already shared at a non-root merge base', async t => {
    assert.equal(await diverge(t, false, false), null)
  })

  it('supports disjoint branches diverging from the root commit', async t => {
    assert.equal(await diverge(t, true, false), null)
  })

  it('reports overlapping changes after a non-root merge base', async t => {
    assert.deepEqual(await diverge(t, false, true), {
      overlappingFiles: ['shared.txt'],
    })
  })

  it('reports overlapping changes after a root merge base', async t => {
    assert.deepEqual(await diverge(t, true, true), {
      overlappingFiles: ['shared.txt'],
    })
  })

  for (const scenario of [
    'delete-source',
    'modify-source',
    'add-destination',
    'modify-unrelated',
    'modify-source-cleanly',
  ] as const) {
    it(`checks both rename endpoints for ${scenario}`, async t => {
      const { findPotentialConflict } =
        await import('../../../src/lib/git/potential-conflicts')
      const repository = new Repository(
        await createTempDirectory(t),
        -1,
        null,
        false
      )
      await runGit(repository, ['init', '-b', 'main'])
      await runGit(repository, ['config', 'user.name', 'Test'])
      await runGit(repository, ['config', 'user.email', 'test@example.com'])
      // Force rename detection on, regardless of the machine's Git defaults.
      await runGit(repository, ['config', 'diff.renames', 'true'])
      const content = Array.from({ length: 30 }, (_, i) => `line ${i}\n`).join(
        ''
      )
      await commitFile(repository, 'source.txt', content)
      await runGit(repository, ['branch', 'upstream'])
      await runGit(repository, ['mv', 'source.txt', 'destination.txt'])
      await commitFile(
        repository,
        'destination.txt',
        scenario === 'modify-source'
          ? content.replace('line 0', 'our conflicting edit')
          : content
      )
      const sha = await runGit(repository, ['rev-parse', 'HEAD'])
      await runGit(repository, ['checkout', 'upstream'])
      if (scenario === 'delete-source') {
        await runGit(repository, ['rm', 'source.txt'])
        await runGit(repository, ['commit', '-m', 'delete source'])
      } else {
        const path =
          scenario === 'add-destination'
            ? 'destination.txt'
            : scenario === 'modify-unrelated'
              ? 'unrelated.txt'
              : 'source.txt'
        await commitFile(
          repository,
          path,
          content.replace('line 0', 'their conflicting edit')
        )
      }
      await runGit(repository, ['checkout', 'main'])
      const branch = new Branch(
        'main',
        'upstream',
        { sha },
        BranchType.Local,
        'refs/heads/main'
      )
      const forecast = await findPotentialConflict(repository, branch, {
        ahead: 1,
        behind: 1,
      })
      // Compare the heuristic against a genuine merge in this disposable repo.
      // A clean rename/modify still overlaps: this is a potential-conflict
      // warning, not a claim to predict Git's line-level merge result.
      const merge = await exec(
        ['merge', '--no-edit', 'upstream'],
        repository.path
      )
      const clean =
        scenario === 'modify-unrelated' || scenario === 'modify-source-cleanly'
      assert.equal(merge.exitCode, clean ? 0 : 1, merge.stdout + merge.stderr)
      const unmerged = await runGit(repository, ['ls-files', '--unmerged'])
      assert.equal(unmerged.length > 0, !clean)
      assert.deepEqual(
        forecast,
        scenario === 'modify-unrelated'
          ? null
          : {
              overlappingFiles: [
                scenario === 'add-destination'
                  ? 'destination.txt'
                  : 'source.txt',
              ],
            }
      )
    })
  }
})
