import './profile-history-test-env'
import assert from 'node:assert'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it, TestContext } from 'node:test'

import { git } from '../../src/lib/git/core'
import {
  commitAllChanges,
  ensureProfileRepository,
  ProfileFoldRestoreTrailer,
  ProfileFoldTrailer,
  repairProfileHistoryLinearity,
  restoreProfileTo,
  restoreProfileToWithRaceObserverForTesting,
} from '../../src/lib/profiles/profile-git'
import { Repository } from '../../src/models/repository'
import { createTempDirectory } from '../helpers/temp'

const SettingFile = 'setting.json'
const StateFiles = [SettingFile]

async function run(
  repository: Repository,
  args: ReadonlyArray<string>
): Promise<string> {
  const result = await git([...args], repository.path, 'linearityTest')
  return result.stdout.trim()
}

async function writeSetting(
  repository: Repository,
  value: string
): Promise<void> {
  await writeFile(
    join(repository.path, SettingFile),
    `${JSON.stringify({ value })}\n`,
    'utf8'
  )
}

async function readSetting(repository: Repository): Promise<string> {
  const contents = await readFile(join(repository.path, SettingFile), 'utf8')
  return (JSON.parse(contents) as { value: string }).value
}

/** Every branch ref in the repository, so a second head is easy to assert on. */
async function branchRefs(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const output = await run(repository, [
    'for-each-ref',
    '--format=%(refname)',
    'refs/heads',
  ])
  return output.length === 0 ? [] : output.split('\n')
}

/** Assert the repository is one unbroken single-parent chain from one head. */
async function assertLinear(repository: Repository): Promise<void> {
  assert.deepStrictEqual(
    (await branchRefs(repository)).length,
    1,
    'expected exactly one branch ref'
  )
  assert.equal(
    await run(repository, ['rev-list', '--all', '--merges']),
    '',
    'expected no merge commits'
  )
  assert.equal(
    await run(repository, ['rev-list', '--all', '--count']),
    await run(repository, ['rev-list', '--count', 'HEAD']),
    'expected every commit to be reachable from HEAD'
  )
  assert.equal(
    await run(repository, ['symbolic-ref', '--quiet', 'HEAD']),
    (await branchRefs(repository))[0],
    'expected HEAD to be attached to the only branch'
  )
}

/** A repository whose timeline is `first` then `second`. */
async function createLinearRepository(t: TestContext): Promise<Repository> {
  const repository = await ensureProfileRepository(await createTempDirectory(t))
  await writeSetting(repository, 'first')
  await commitAllChanges(repository, 'Set first')
  await writeSetting(repository, 'second')
  await commitAllChanges(repository, 'Set second')
  return repository
}

describe('profile history linearity', () => {
  it('refuses to commit a restore onto a parent another writer replaced', async t => {
    const repository = await createLinearRepository(t)
    const target = await run(repository, ['rev-parse', 'HEAD~1'])

    await assert.rejects(
      restoreProfileToWithRaceObserverForTesting(
        repository,
        target,
        StateFiles,
        async () => {
          // A second window commits while this restore is mid-flight.
          await writeSetting(repository, 'concurrent')
          await commitAllChanges(repository, 'Concurrent update')
        }
      ),
      /moved while this change was being prepared/
    )

    // The competing commit must survive: the old rollback rewound the branch to
    // the parent this restore had sampled, which abandoned it entirely.
    assert.equal(
      await run(repository, ['log', '-1', '--format=%s', 'HEAD']),
      'Concurrent update'
    )
    assert.equal(await run(repository, ['rev-list', '--count', 'HEAD']), '3')
    await assertLinear(repository)
  })

  it('leaves a clean single-parent timeline after a successful restore', async t => {
    const repository = await createLinearRepository(t)
    const target = await run(repository, ['rev-parse', 'HEAD~1'])

    await restoreProfileTo(repository, target, StateFiles)

    assert.equal(await readSetting(repository), 'first')
    assert.match(
      await run(repository, ['log', '-1', '--format=%s', 'HEAD']),
      /^Restore profile to /
    )
    assert.equal(
      await run(repository, ['log', '-1', '--format=%P', 'HEAD']).then(
        parents => parents.split(' ').length
      ),
      1,
      'a restore must append exactly one single-parent commit'
    )
    await assertLinear(repository)
  })

  it('refuses to append while an interrupted merge is pending', async t => {
    const repository = await createLinearRepository(t)
    await writeFile(
      join(repository.path, '.git', 'MERGE_HEAD'),
      `${await run(repository, ['rev-parse', 'HEAD~1'])}\n`,
      'utf8'
    )
    await writeSetting(repository, 'third')

    await assert.rejects(
      commitAllChanges(repository, 'Set third'),
      /unfinished merge/
    )
    assert.equal(await run(repository, ['rev-list', '--count', 'HEAD']), '2')
  })

  it('folds a diverged head forward instead of discarding it', async t => {
    const repository = await createLinearRepository(t)
    const canonicalBranch = (await branchRefs(repository))[0]
    const forkPoint = await run(repository, ['rev-parse', 'HEAD~1'])
    const liveTip = await run(repository, ['rev-parse', 'HEAD'])

    // A second head, exactly what an interrupted mutation used to leave behind.
    await run(repository, ['checkout', '--quiet', '-b', 'stray', forkPoint])
    await writeSetting(repository, 'diverged')
    await commitAllChanges(repository, 'Set diverged')
    const strayTip = await run(repository, ['rev-parse', 'HEAD'])
    await run(repository, ['checkout', '--quiet', canonicalBranch])
    await run(repository, ['reset', '--hard', liveTip])

    const repair = await repairProfileHistoryLinearity(repository)

    assert.equal(repair.linear, false)
    assert.deepStrictEqual(repair.foldedTips, [strayTip])
    assert.deepStrictEqual(repair.removedRefs, ['refs/heads/stray'])
    await assertLinear(repository)

    // Nothing was thrown away: the diverged value is a commit on the one
    // timeline, and the live value is exactly what it was before the repair.
    assert.equal(await readSetting(repository), 'second')
    const subjects = await run(repository, ['log', '--format=%s', 'HEAD'])
    assert.match(subjects, /Fold diverged history/)
    assert.match(subjects, /Restore state after folding/)

    const foldCommit = await run(repository, [
      'rev-list',
      '--max-count=1',
      `--grep=${ProfileFoldTrailer}: ${strayTip}`,
      'HEAD',
    ])
    assert.notEqual(foldCommit, '')
    assert.equal(
      JSON.parse(
        await run(repository, ['show', `${foldCommit}:${SettingFile}`])
      ).value,
      'diverged'
    )
    assert.notEqual(
      await run(repository, [
        'rev-list',
        '--max-count=1',
        `--grep=${ProfileFoldRestoreTrailer}: ${strayTip}`,
        'HEAD',
      ]),
      ''
    )
  })

  it('reattaches a detached HEAD so later commits cannot orphan themselves', async t => {
    const repository = await createLinearRepository(t)
    const liveTip = await run(repository, ['rev-parse', 'HEAD'])
    await run(repository, ['checkout', '--quiet', '--detach', 'HEAD'])

    const repair = await repairProfileHistoryLinearity(repository)

    assert.equal(repair.reattachedHead, true)
    assert.equal(await run(repository, ['rev-parse', 'HEAD']), liveTip)
    await assertLinear(repository)
  })

  it('repairs a forked repository when a store opens it', async t => {
    const repository = await createLinearRepository(t)
    const canonicalBranch = (await branchRefs(repository))[0]
    const forkPoint = await run(repository, ['rev-parse', 'HEAD~1'])
    const liveTip = await run(repository, ['rev-parse', 'HEAD'])

    await run(repository, ['checkout', '--quiet', '-b', 'stray', forkPoint])
    await writeSetting(repository, 'diverged')
    await commitAllChanges(repository, 'Set diverged')
    await run(repository, ['checkout', '--quiet', canonicalBranch])
    await run(repository, ['reset', '--hard', liveTip])

    // Opening the store is the repair point; nothing else has to run first.
    await ensureProfileRepository(repository.path)

    await assertLinear(repository)
    assert.equal(await readSetting(repository), 'second')
  })

  it('drops a redundant ref without folding anything', async t => {
    const repository = await createLinearRepository(t)
    await run(repository, ['branch', 'redundant', 'HEAD~1'])
    const before = await run(repository, ['rev-list', '--count', 'HEAD'])

    const repair = await repairProfileHistoryLinearity(repository)

    assert.deepStrictEqual(repair.foldedTips, [])
    assert.deepStrictEqual(repair.removedRefs, ['refs/heads/redundant'])
    assert.equal(await run(repository, ['rev-list', '--count', 'HEAD']), before)
    await assertLinear(repository)
  })

  it('reports an already linear repository without touching it', async t => {
    const repository = await createLinearRepository(t)
    const tip = await run(repository, ['rev-parse', 'HEAD'])

    const repair = await repairProfileHistoryLinearity(repository)

    assert.deepStrictEqual(repair, {
      linear: true,
      foldedTips: [],
      removedRefs: [],
      reattachedHead: false,
      mergeCommits: [],
    })
    assert.equal(await run(repository, ['rev-parse', 'HEAD']), tip)
  })
})
