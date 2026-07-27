import './profile-history-test-env'
import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

import {
  commitAllChanges,
  ensureProfileRepository,
  getProfileCommitDiff,
  getProfileCommitFiles,
  ProfileCommitQueue,
} from '../../src/lib/profiles/profile-git'
import { LocalProfileKey } from '../../src/models/profile'
import { Repository } from '../../src/models/repository'
import {
  CollapsedRepositoryGroupsKey,
  getCollapsedRepositoryGroups,
  setRepositoryGroupCollapsed,
} from '../../src/lib/stores/repository-group-collapse'
import { AsyncInMemoryStore, InMemoryStore } from '../helpers/stores'
import { createTempDirectory } from '../helpers/temp'

interface IProfileStoreInternals {
  enabled: boolean
  lastSnapshotsByKey: Map<string, Record<string, string>>
  repositoriesByKey: Map<string, Repository>
  queuesByKey: Map<string, ProfileCommitQueue>
}

async function readSettings(repository: Repository) {
  return JSON.parse(
    await readFile(join(repository.path, 'settings.json'), 'utf8')
  ) as { readonly settings: Record<string, string> }
}

/**
 * A profile store wired to a throwaway repository, with the live settings
 * snapshot deliberately empty so the only thing that can change is the
 * collapsed-group set.
 */
async function createStore(t: TestContext) {
  const [{ ProfileStore }, { AccountsStore }] = await Promise.all([
    import('../../src/lib/stores/profile-store'),
    import('../../src/lib/stores/accounts-store'),
  ])

  const repository = await ensureProfileRepository(await createTempDirectory(t))
  await writeFile(
    join(repository.path, 'settings.json'),
    JSON.stringify({ version: 1, settings: {} }, null, 2)
  )
  await commitAllChanges(repository, 'Initialize profile')

  localStorage.clear()
  t.after(() => localStorage.clear())

  const store = new ProfileStore(
    new AccountsStore(new InMemoryStore(), new AsyncInMemoryStore())
  )
  const internals = store as unknown as IProfileStoreInternals
  internals.enabled = true
  internals.lastSnapshotsByKey.set(LocalProfileKey, {})
  internals.repositoriesByKey.set(LocalProfileKey, repository)
  internals.queuesByKey.set(LocalProfileKey, new ProfileCommitQueue(repository))

  return { store, repository }
}

/** What the repository list does for one header press. */
function toggleGroup(store: { onAppStateChanged(): void }, key: string) {
  const collapsed = getCollapsedRepositoryGroups().includes(key)
  setRepositoryGroupCollapsed(key, !collapsed)
  store.onAppStateChanged()
}

describe('collapsed repository groups in settings history', () => {
  it('coalesces a burst of folds into one readable, undoable entry', async t => {
    const { store, repository } = await createStore(t)

    // Five headers pressed in quick succession, exactly as a user fiddling
    // with the list would produce them.
    for (const key of [
      '5:other',
      '1:recent',
      '2:custom:clients',
      '3:dotcom:octocat',
      '4:enterprise:ghe.example.com',
    ]) {
      toggleGroup(store, key)
    }

    const afterBurst = await store.getSettingsHistory()

    // One commit for the whole burst, not one per press. Without the shared
    // debounce this would be six entries and the history would be unusable.
    assert.equal(afterBurst.total, 2)
    assert.equal(
      afterBurst.entries[0].summary,
      'Set collapsed repository groups'
    )

    // The change is a real, readable diff of a real settings file.
    assert.deepEqual(
      await getProfileCommitFiles(repository, afterBurst.entries[0].sha),
      ['settings.json']
    )
    const diff = await getProfileCommitDiff(
      repository,
      afterBurst.entries[0].sha
    )
    assert.match(diff, /repository-list-collapsed-groups/)
    assert.match(diff, /5:other/)

    const stored = await readSettings(repository)
    assert.equal(
      stored.settings[CollapsedRepositoryGroupsKey],
      JSON.stringify(getCollapsedRepositoryGroups())
    )
    assert.equal(getCollapsedRepositoryGroups().length, 5)
  })

  it('records a later burst as its own entry and undoes back to the previous fold set', async t => {
    const { store } = await createStore(t)

    toggleGroup(store, '5:other')
    toggleGroup(store, '1:recent')
    const first = await store.getSettingsHistory()
    assert.equal(first.total, 2)
    const foldedAfterFirstBurst = getCollapsedRepositoryGroups()
    assert.deepEqual(foldedAfterFirstBurst, ['1:recent', '5:other'])

    // A separate burst later on is a separate change, so history stays useful.
    toggleGroup(store, '5:other')
    toggleGroup(store, '2:custom:clients')
    const second = await store.getSettingsHistory()
    assert.equal(second.total, 3)
    assert.equal(
      second.entries[0].summary,
      'Change collapsed repository groups'
    )
    assert.deepEqual(getCollapsedRepositoryGroups(), [
      '1:recent',
      '2:custom:clients',
    ])
    assert.equal(second.canUndo, true)

    await store.undoLastSettingsChange()

    // Undo restores the exact previous fold set into live storage, so the list
    // reopens precisely the groups the user had reopened.
    assert.deepEqual(getCollapsedRepositoryGroups(), foldedAfterFirstBurst)

    const undone = await store.getSettingsHistory()
    assert.equal(undone.total, 4)
    assert.notEqual(undone.entries[0].undoOf, null)
  })

  it('clears the fold set entirely when the first fold is undone', async t => {
    const { store } = await createStore(t)

    toggleGroup(store, '5:other')
    await store.getSettingsHistory()
    assert.deepEqual(getCollapsedRepositoryGroups(), ['5:other'])

    await store.undoLastSettingsChange()

    assert.deepEqual(getCollapsedRepositoryGroups(), [])
    assert.equal(localStorage.getItem(CollapsedRepositoryGroupsKey), null)
  })
})
