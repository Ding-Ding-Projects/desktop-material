import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { exec } from 'dugite'

import { readAgentSessionGitStatus } from '../../src/lib/agent-sessions/agent-session-git-status'
import { makeCommit } from '../helpers/repository-scaffolding'
import {
  setupEmptyDirectory,
  setupEmptyRepository,
} from '../helpers/repositories'

describe('agent session Git status', () => {
  it('reports a clean worktree', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'tracked.txt', contents: 'clean\n' }],
    })

    assert.deepStrictEqual(await readAgentSessionGitStatus(repository.path), {
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0,
    })
  })

  it('combines staged and unstaged text with binary and untracked paths', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [
        { path: 'unstaged.txt', contents: 'one\ntwo\nthree\n' },
        { path: 'staged.txt', contents: 'keep\nremove\n' },
        { path: 'tracked-binary.dat', contents: Buffer.from([0, 1, 2, 3]) },
      ],
    })

    await writeFile(
      join(repository.path, 'unstaged.txt'),
      'one\nchanged\nthree\nadded\n'
    )
    await writeFile(
      join(repository.path, 'staged.txt'),
      'keep\ninserted\nremove\n'
    )
    await exec(['add', '--', 'staged.txt'], repository.path)
    await writeFile(
      join(repository.path, 'tracked-binary.dat'),
      Buffer.from([0, 9, 8, 7])
    )

    // Spaces, brackets, and non-ASCII text exercise the Windows-valid unusual
    // path case. This untracked binary is still one file, and has no Git
    // baseline from which to invent an added-line count.
    await writeFile(
      join(repository.path, 'untracked odd [名].dat'),
      Buffer.from([0, 4, 5, 6])
    )

    assert.deepStrictEqual(await readAgentSessionGitStatus(repository.path), {
      filesChanged: 4,
      linesAdded: 3,
      linesDeleted: 1,
    })
  })

  it('counts a rename with unusual names once', async t => {
    const repository = await setupEmptyRepository(t)
    const oldName = '7 9 [old] 名.txt'
    const newName = '8 10 [new] 名.txt'
    const original = Array.from({ length: 10 }, (_, i) => `line ${i}`).join(
      '\n'
    )

    await makeCommit(repository, {
      entries: [{ path: oldName, contents: `${original}\n` }],
    })
    await exec(['mv', '--', oldName, newName], repository.path)
    await writeFile(join(repository.path, newName), `${original}\nadded\n`)

    assert.deepStrictEqual(await readAgentSessionGitStatus(repository.path), {
      filesChanged: 1,
      linesAdded: 1,
      linesDeleted: 0,
    })
  })

  it('rejects when Git cannot read a repository', async t => {
    const directory = await setupEmptyDirectory(t)

    await assert.rejects(
      readAgentSessionGitStatus(directory.path),
      error => error instanceof Error
    )
  })
})
