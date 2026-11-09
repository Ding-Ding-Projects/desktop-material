import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mkdir } from 'fs/promises'
import { join } from 'path'

import { Dispatcher } from '../../src/ui/dispatcher'
import { Repository } from '../../src/models/repository'
import { PopupType } from '../../src/models/popup'
import { FoldoutType } from '../../src/lib/app-state'
import { setupEmptyRepository } from '../helpers/repositories'
import { createTempDirectory } from '../helpers/temp'

/**
 * A dispatcher whose store and side effects are recorded rather than run, so
 * the open-repository CLI action can be followed step by step against real
 * folders on disk.
 */
function createRecordingDispatcher(
  repositories: ReadonlyArray<Repository> = [],
  addResult?: (path: string) => ReadonlyArray<Repository>
) {
  const calls = new Array<string>()
  const added = new Array<ReadonlyArray<string>>()
  const selected = new Array<{ path: string; persist: boolean }>()
  const popups = new Array<unknown>()

  const dispatcher = Object.create(Dispatcher.prototype) as Dispatcher
  Object.assign(dispatcher, {
    appStore: { getState: () => ({ repositories }) },
    addRepositories: async (paths: ReadonlyArray<string>) => {
      calls.push('add')
      added.push(paths)
      return addResult !== undefined
        ? addResult(paths[0])
        : [new Repository(paths[0], 41, null, false)]
    },
    closeFoldout: async (foldout: FoldoutType) => {
      calls.push(`close-foldout:${foldout}`)
    },
    selectRepository: async (repository: Repository, persist = true) => {
      calls.push('select')
      selected.push({ path: repository.path, persist })
      return repository
    },
    recordAddExistingRepository: () => {
      calls.push('record-add')
    },
    showPopup: async (popup: unknown) => {
      calls.push('popup')
      popups.push(popup)
    },
  })

  return { dispatcher, calls, added, selected, popups }
}

describe('Opening a folder in the app from outside it', () => {
  it('adds and selects a repository that is not in the list, without the add dialog', async t => {
    const repository = await setupEmptyRepository(t)
    const { dispatcher, calls, added, selected, popups } =
      createRecordingDispatcher()

    await dispatcher.dispatchCLIAction({
      kind: 'open-repository',
      path: repository.path,
    })

    assert.deepEqual(added, [[repository.path]])
    assert.deepEqual(selected, [{ path: repository.path, persist: true }])
    assert.deepEqual(popups, [])
    assert.deepEqual(calls, [
      'add',
      `close-foldout:${FoldoutType.Repository}`,
      'select',
      'record-add',
    ])
  })

  it('adds the repository root when a folder inside it is opened', async t => {
    const repository = await setupEmptyRepository(t)
    const inner = join(repository.path, 'src', 'deep')
    await mkdir(inner, { recursive: true })
    const { dispatcher, added, popups } = createRecordingDispatcher()

    await dispatcher.dispatchCLIAction({ kind: 'open-repository', path: inner })

    assert.deepEqual(added, [[repository.path]])
    assert.deepEqual(popups, [])
  })

  it('keeps the selection unsaved when the action asks for that', async t => {
    const repository = await setupEmptyRepository(t)
    const { dispatcher, selected } = createRecordingDispatcher()

    await dispatcher.dispatchCLIAction({
      kind: 'open-repository',
      path: repository.path,
      persistSelection: false,
    })

    assert.deepEqual(selected, [{ path: repository.path, persist: false }])
  })

  it('selects a repository that is already in the list without adding it again', async t => {
    const repository = await setupEmptyRepository(t)
    const known = new Repository(repository.path, 7, null, false)
    const { dispatcher, calls, selected } = createRecordingDispatcher([known])

    await dispatcher.dispatchCLIAction({
      kind: 'open-repository',
      path: repository.path,
    })

    assert.deepEqual(calls, ['select'])
    assert.deepEqual(selected, [{ path: repository.path, persist: true }])
  })

  it('still opens the add dialog for a folder that is not a repository', async t => {
    const folder = await createTempDirectory(t)
    const { dispatcher, calls, popups } = createRecordingDispatcher()

    await dispatcher.dispatchCLIAction({
      kind: 'open-repository',
      path: folder,
    })

    assert.deepEqual(calls, ['popup'])
    assert.deepEqual(popups, [{ type: PopupType.AddRepository, path: folder }])
  })

  it('selects nothing and opens no dialog when adding fails, because the store already reported why', async t => {
    const repository = await setupEmptyRepository(t)
    const { dispatcher, calls } = createRecordingDispatcher([], () => [])

    await dispatcher.dispatchCLIAction({
      kind: 'open-repository',
      path: repository.path,
    })

    assert.deepEqual(calls, ['add'])
  })
})
