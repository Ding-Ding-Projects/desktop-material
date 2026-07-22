import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'

import { fetch } from '../../../../src/lib/git/fetch'
import { pullToCommit } from '../../../../src/lib/git/pull'
import { IRemote } from '../../../../src/models/remote'
import { setupEmptyRepository } from '../../../helpers/repositories'
import {
  cloneRepository,
  makeCommit,
} from '../../../helpers/repository-scaffolding'

async function oid(repositoryPath: string, ref = 'HEAD'): Promise<string> {
  return (await exec(['rev-parse', ref], repositoryPath)).stdout.trim()
}

describe('git/pull pullToCommit', () => {
  it('integrates only the captured OID and preserves configured merge behavior', async t => {
    const remoteRepository = await setupEmptyRepository(t)
    await makeCommit(remoteRepository, {
      commitMessage: 'Base',
      entries: [{ path: 'base.txt', contents: 'base' }],
    })
    const repository = await cloneRepository(t, remoteRepository)
    const remote: IRemote = {
      name: 'origin',
      url: remoteRepository.path,
    }

    await makeCommit(remoteRepository, {
      commitMessage: 'Reviewed target',
      entries: [{ path: 'incoming.txt', contents: 'reviewed' }],
    })
    const reviewedOid = await oid(remoteRepository.path)
    await fetch(repository, remote)

    // Move the actual remote beyond the reviewed target after the fetch. A
    // normal pull would fetch and integrate this commit as well.
    await makeCommit(remoteRepository, {
      commitMessage: 'Not reviewed',
      entries: [{ path: 'not-reviewed.txt', contents: 'newer' }],
    })
    const unreviewedOid = await oid(remoteRepository.path)

    await makeCommit(repository, {
      commitMessage: 'Local change',
      entries: [{ path: 'local.txt', contents: 'local' }],
    })
    const localOid = await oid(repository.path)
    await exec(['config', 'pull.rebase', 'false'], repository.path)
    await exec(['config', 'pull.ff', 'false'], repository.path)

    await pullToCommit(repository, remote, reviewedOid)

    const headWithParents = (
      await exec(['rev-list', '--parents', '-n', '1', 'HEAD'], repository.path)
    ).stdout
      .trim()
      .split(' ')
    assert.equal(headWithParents.length, 3)
    assert.deepEqual(
      new Set(headWithParents.slice(1)),
      new Set([localOid, reviewedOid])
    )
    assert.equal(
      await oid(repository.path, 'refs/remotes/origin/master'),
      reviewedOid
    )

    const unreviewedObject = await exec(
      ['rev-parse', '--verify', `${unreviewedOid}^{commit}`],
      repository.path
    )
    assert.equal(unreviewedObject.exitCode, 128)
  })

  it('rejects a non-OID target before changing the repository', async t => {
    const repository = await setupEmptyRepository(t)
    await makeCommit(repository, {
      entries: [{ path: 'base.txt', contents: 'base' }],
    })
    const headBefore = await oid(repository.path)
    const remote: IRemote = { name: 'origin', url: repository.path }

    await assert.rejects(
      () => pullToCommit(repository, remote, 'refs/remotes/origin/master'),
      /invalid commit object ID/
    )
    assert.equal(await oid(repository.path), headBefore)
  })
})
