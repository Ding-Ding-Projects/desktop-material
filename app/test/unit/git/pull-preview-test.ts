import { describe, it } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'

import { AppFileStatusKind } from '../../../src/models/status'
import {
  getPullPreview,
  IPullPreview,
  isPullPreviewIdentityCurrent,
} from '../../../src/lib/git/pull-preview'
import {
  setupEmptyDirectory,
  setupEmptyRepository,
} from '../../helpers/repositories'
import { makeCommit, switchTo } from '../../helpers/repository-scaffolding'

async function oid(repositoryPath: string, ref = 'HEAD'): Promise<string> {
  return (await exec(['rev-parse', ref], repositoryPath)).stdout.trim()
}

async function configureMasterUpstream(
  repositoryPath: string,
  upstreamOid: string
): Promise<void> {
  await exec(['remote', 'add', 'origin', '.'], repositoryPath)
  await exec(
    ['update-ref', 'refs/remotes/origin/master', upstreamOid],
    repositoryPath
  )
  await exec(['config', 'branch.master.remote', 'origin'], repositoryPath)
  await exec(
    ['config', 'branch.master.merge', 'refs/heads/master'],
    repositoryPath
  )
}

describe('git/pull-preview', () => {
  it('previews the captured upstream without changing HEAD, the index, or worktree', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      commitMessage: 'Base',
      entries: [
        { path: 'delete-me.txt', contents: 'delete me' },
        { path: 'rename-source.txt', contents: 'rename me' },
        { path: 'shared.txt', contents: 'base' },
      ],
    })
    const baseOid = await oid(repository.path)

    await switchTo(repository, 'upstream-work')
    await makeCommit(repository, {
      commitMessage: 'Incoming one',
      entries: [
        { path: 'added.txt', contents: 'added upstream' },
        { path: 'shared.txt', contents: 'changed upstream' },
      ],
    })
    await makeCommit(repository, {
      commitMessage: 'Incoming two',
      entries: [
        { path: 'delete-me.txt', contents: null },
        { path: 'rename-source.txt', contents: null },
        { path: 'renamed.txt', contents: 'rename me' },
      ],
    })
    const upstreamOid = await oid(repository.path)

    await switchTo(repository, 'master')
    await configureMasterUpstream(repository.path, upstreamOid)
    await makeCommit(repository, {
      commitMessage: 'Local only',
      entries: [{ path: 'local-only.txt', contents: 'local' }],
    })
    const localOid = await oid(repository.path)

    await writeFile(join(repository.path, 'shared.txt'), 'dirty worktree')
    await writeFile(join(repository.path, 'untracked.txt'), 'untracked')

    const statusBefore = (
      await exec(['status', '--porcelain=v1', '-z'], repository.path)
    ).stdout
    const preview = await getPullPreview(repository, {
      maxIncomingCommits: 1,
    })
    const statusAfter = (
      await exec(['status', '--porcelain=v1', '-z'], repository.path)
    ).stdout

    assert.equal(preview.kind, 'ready')
    assert.equal(await oid(repository.path), localOid)
    assert.equal(statusAfter, statusBefore)

    const ready = preview as IPullPreview
    assert.equal(ready.currentBranchRef, 'refs/heads/master')
    assert.equal(ready.currentBranchOid, localOid)
    assert.equal(ready.upstreamRef, 'refs/remotes/origin/master')
    assert.equal(ready.upstreamOid, upstreamOid)
    assert.equal(ready.mergeBaseOid, baseOid)
    assert.equal(ready.ahead, 1)
    assert.equal(ready.behind, 2)
    assert.deepEqual(ready.incomingCommits, [
      { sha: upstreamOid, summary: 'Incoming two' },
    ])
    assert.equal(ready.incomingCommitsTruncated, true)
    assert.equal(ready.changedFileCount, 4)
    assert.equal(ready.changedFilesTruncated, false)

    const changedFiles = new Map(
      ready.changedFiles.map(file => [file.path, file.status])
    )
    assert.equal(changedFiles.has('local-only.txt'), false)
    assert.equal(changedFiles.get('added.txt')?.kind, AppFileStatusKind.New)
    assert.equal(
      changedFiles.get('delete-me.txt')?.kind,
      AppFileStatusKind.Deleted
    )
    assert.equal(
      changedFiles.get('shared.txt')?.kind,
      AppFileStatusKind.Modified
    )
    assert.deepEqual(changedFiles.get('renamed.txt'), {
      kind: AppFileStatusKind.Renamed,
      oldPath: 'rename-source.txt',
      renameIncludesModifications: false,
    })

    assert.equal(await isPullPreviewIdentityCurrent(repository, ready), true)

    const boundedPreview = await getPullPreview(repository, {
      maxIncomingCommits: 0,
      maxChangedFiles: 2,
    })
    assert.equal(boundedPreview.kind, 'ready')
    const bounded = boundedPreview as IPullPreview
    assert.equal(bounded.incomingCommits.length, 0)
    assert.equal(bounded.incomingCommitsTruncated, true)
    assert.equal(bounded.changedFiles.length, 2)
    assert.equal(bounded.changedFileCount, 4)
    assert.equal(bounded.changedFilesTruncated, true)

    await exec(
      ['update-ref', 'refs/remotes/origin/master', baseOid],
      repository.path
    )
    assert.equal(await isPullPreviewIdentityCurrent(repository, ready), false)
  })

  it('reports a branch with no configured upstream', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'base.txt', contents: 'base' }],
    })

    assert.deepEqual(await getPullPreview(repository), {
      kind: 'unavailable',
      reason: 'no-upstream',
    })
  })

  it('reports an exact total while bounding changed-file details', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      commitMessage: 'Base',
      entries: [{ path: 'base.txt', contents: 'base' }],
    })

    await switchTo(repository, 'upstream-work')
    await makeCommit(repository, {
      commitMessage: 'Many incoming paths',
      entries: Array.from({ length: 40 }, (_, index) => ({
        path: `incoming-${String(index).padStart(2, '0')}.txt`,
        contents: `incoming ${index}`,
      })),
    })
    const upstreamOid = await oid(repository.path)

    await switchTo(repository, 'master')
    await configureMasterUpstream(repository.path, upstreamOid)

    const preview = await getPullPreview(repository, {
      maxChangedFiles: 3,
    })
    assert.equal(preview.kind, 'ready')
    const ready = preview as IPullPreview
    assert.equal(ready.changedFileCount, 40)
    assert.equal(ready.changedFiles.length, 3)
    assert.equal(ready.changedFilesTruncated, true)

    const countOnly = await getPullPreview(repository, {
      maxChangedFiles: 0,
    })
    assert.equal(countOnly.kind, 'ready')
    const countOnlyReady = countOnly as IPullPreview
    assert.equal(countOnlyReady.changedFileCount, 40)
    assert.deepEqual(countOnlyReady.changedFiles, [])
    assert.equal(countOnlyReady.changedFilesTruncated, true)
  })

  it('reports a detached HEAD', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'base.txt', contents: 'base' }],
    })
    await exec(['checkout', '--detach'], repository.path)

    assert.deepEqual(await getPullPreview(repository), {
      kind: 'unavailable',
      reason: 'detached-head',
    })
  })

  it('reports an unborn branch as invalid state', async t => {
    const repository = await setupEmptyRepository(t)

    assert.deepEqual(await getPullPreview(repository), {
      kind: 'unavailable',
      reason: 'invalid-state',
    })
  })

  it('reports a missing upstream tracking ref as invalid state', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'base.txt', contents: 'base' }],
    })
    await exec(['remote', 'add', 'origin', '.'], repository.path)
    await exec(['config', 'branch.master.remote', 'origin'], repository.path)
    await exec(
      ['config', 'branch.master.merge', 'refs/heads/master'],
      repository.path
    )

    assert.deepEqual(await getPullPreview(repository), {
      kind: 'unavailable',
      reason: 'invalid-state',
    })
  })

  it('reports a non-repository as invalid state', async t => {
    const repository = await setupEmptyDirectory(t)

    assert.deepEqual(await getPullPreview(repository), {
      kind: 'unavailable',
      reason: 'invalid-state',
    })
  })
})
