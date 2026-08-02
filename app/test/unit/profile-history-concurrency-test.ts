import './profile-history-test-env'
import assert from 'node:assert'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it, TestContext } from 'node:test'

import { git } from '../../src/lib/git/core'
import {
  commitAllChanges,
  ensureProfileRepository,
  getProfileHistoryWithBatchObserverForTesting,
  ProfileUndoTrailer,
} from '../../src/lib/profiles/profile-git'
import { Repository } from '../../src/models/repository'
import { createTempDirectory } from '../helpers/temp'

const TabId = 'batched-tab-id'
const InitialCommitCount = 101

function fastImportHistory(commitCount: number): string {
  const commands = new Array<string>()
  let previousCommitMark: number | null = null

  for (let index = 0; index < commitCount; index++) {
    const blobMark = index * 2 + 1
    const commitMark = blobMark + 1
    const contents = `${JSON.stringify({
      version: 1,
      tabs: [{ id: TabId, titleStyle: { revision: index } }],
      activeTabId: null,
    })}\n`
    const message = `Tab revision ${index}`
    const timestamp = 1_700_000_000 + index

    commands.push(
      'blob',
      `mark :${blobMark}`,
      `data ${Buffer.byteLength(contents)}`,
      contents,
      'commit refs/heads/main',
      `mark :${commitMark}`,
      `author Desktop Material <desktop-material@localhost> ${timestamp} +0000`,
      `committer Desktop Material <desktop-material@localhost> ${timestamp} +0000`,
      `data ${Buffer.byteLength(message)}`,
      message
    )
    if (previousCommitMark !== null) {
      commands.push(`from :${previousCommitMark}`)
    }
    commands.push(`M 100644 :${blobMark} tabs.json`, '')
    previousCommitMark = commitMark
  }

  commands.push('done', '')
  return commands.join('\n')
}

async function createLongProfileHistory(
  t: TestContext,
  ensureProfileRepository: (path: string) => Promise<Repository>
): Promise<Repository> {
  const repository = await ensureProfileRepository(await createTempDirectory(t))
  await git(
    ['symbolic-ref', 'HEAD', 'refs/heads/main'],
    repository.path,
    'profileHistoryTestBranch'
  )
  await git(
    ['fast-import', '--quiet'],
    repository.path,
    'profileHistoryImport',
    {
      stdin: fastImportHistory(InitialCommitCount),
    }
  )
  await git(['reset', '--hard', 'HEAD'], repository.path, 'profileHistoryReset')
  return repository
}

async function appendHistoryCommit(
  repository: Repository,
  tree: string,
  parent: string,
  message: string
): Promise<string> {
  return (
    await git(
      ['commit-tree', tree, '-p', parent, '-m', message],
      repository.path,
      'profileHistorySyntheticCommit'
    )
  ).stdout.trim()
}

async function appendUndoTimeline(
  repository: Repository,
  changeCount: number
): Promise<{ readonly head: string; readonly totalAdded: number }> {
  const tree = (
    await git(
      ['rev-parse', 'HEAD^{tree}'],
      repository.path,
      'profileHistorySyntheticTree'
    )
  ).stdout.trim()
  let head = (
    await git(
      ['rev-parse', 'HEAD'],
      repository.path,
      'profileHistorySyntheticHead'
    )
  ).stdout.trim()
  const changes = new Array<string>()

  for (let index = 0; index < changeCount; index++) {
    head = await appendHistoryCommit(
      repository,
      tree,
      head,
      `Synthetic profile change ${index}`
    )
    changes.push(head)
  }
  for (let index = changes.length - 1; index >= 0; index--) {
    head = await appendHistoryCommit(
      repository,
      tree,
      head,
      `Undo synthetic profile change ${index}\n\n${ProfileUndoTrailer}: ${changes[index]}`
    )
  }

  await git(
    ['update-ref', 'refs/heads/main', head],
    repository.path,
    'profileHistorySyntheticUpdateRef'
  )
  return { head, totalAdded: changeCount * 2 }
}

describe('profile tab history concurrency', () => {
  it('keeps every batch pinned when another window commits mid-traversal', async t => {
    const repository = await createLongProfileHistory(
      t,
      ensureProfileRepository
    )
    let concurrentCommits = 0
    const history = await getProfileHistoryWithBatchObserverForTesting(
      repository,
      0,
      50,
      {
        tabId: TabId,
      },
      async batchIndex => {
        if (batchIndex !== 0) {
          return
        }
        concurrentCommits++
        await writeFile(
          join(repository.path, 'tabs.json'),
          `${JSON.stringify({
            version: 1,
            tabs: [{ id: TabId, titleStyle: { revision: 'concurrent' } }],
            activeTabId: null,
          })}\n`,
          'utf8'
        )
        await commitAllChanges(repository, 'Concurrent tab update')
      }
    )

    assert.equal(concurrentCommits, 1)
    assert.equal(history.total, InitialCommitCount)
    assert.equal(history.entries[0].summary, 'Tab revision 100')
    assert.equal(history.hasMore, true)
    assert.equal(
      (
        await git(
          ['log', '-1', '--format=%s', 'HEAD'],
          repository.path,
          'profileHistoryCurrentSummary'
        )
      ).stdout.trim(),
      'Concurrent tab update'
    )
  })

  it('pins unfiltered pages, counts, and undo availability while HEAD advances between batches', async t => {
    const repository = await createLongProfileHistory(
      t,
      ensureProfileRepository
    )
    const timeline = await appendUndoTimeline(repository, 65)
    let concurrentCommits = 0

    const history = await getProfileHistoryWithBatchObserverForTesting(
      repository,
      0,
      25,
      undefined,
      async batchIndex => {
        if (batchIndex !== 0) {
          return
        }
        concurrentCommits++
        const tree = (
          await git(
            ['rev-parse', `${timeline.head}^{tree}`],
            repository.path,
            'profileHistoryConcurrentTree'
          )
        ).stdout.trim()
        const concurrentHead = await appendHistoryCommit(
          repository,
          tree,
          timeline.head,
          'Concurrent unfiltered update'
        )
        await git(
          ['update-ref', 'refs/heads/main', concurrentHead, timeline.head],
          repository.path,
          'profileHistoryConcurrentUpdateRef'
        )
      }
    )

    assert.equal(concurrentCommits, 1)
    assert.equal(history.total, InitialCommitCount + timeline.totalAdded)
    assert.equal(history.entries.length, 25)
    assert.equal(history.entries[0].summary, 'Undo synthetic profile change 0')
    assert.equal(history.canUndo, true)
    assert.equal(history.canRedo, true)
    assert.equal(
      (
        await git(
          ['log', '-1', '--format=%s', 'HEAD'],
          repository.path,
          'profileHistoryCurrentUnfilteredSummary'
        )
      ).stdout.trim(),
      'Concurrent unfiltered update'
    )
  })
})
