import assert from 'node:assert'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

import { BatchCloneStore } from '../../../src/lib/stores/batch-clone-store'
import type { IBatchCloneJournal } from '../../../src/lib/stores/batch-clone-journal'
import { CloningRepositoriesStore } from '../../../src/lib/stores/cloning-repositories-store'
import {
  assertSafeBatchCloneItems,
  BatchCloneMode,
  buildBatchCloneItems,
  IBatchCloneItem,
} from '../../../src/models/batch-clone'
import { ICheapLfsCloneSelection } from '../../../src/models/cheap-lfs-clone-selection'
import { CloneOptions } from '../../../src/models/clone-options'

const url = 'https://github.com/example/game.git'
const accountKey = 'https://api.github.com#7'
const selection: ICheapLfsCloneSelection = {
  accountKey,
  repositoryCloneUrl: url,
  defaultBranch: 'main',
  manifestBlobSha: 'a'.repeat(40),
  pointerSetSha256: 'b'.repeat(64),
  paths: ['assets/hero.psd'],
}

const createEmptyJournal = (): IBatchCloneJournal => ({
  load: async () => null,
  save: async () => undefined,
  clear: async () => undefined,
})

describe('batch clone Cheap LFS selection', () => {
  it('builds and safely recovers the exact persisted manifest-bound selection', () => {
    const [item] = buildBatchCloneItems(
      [
        {
          url,
          name: 'game',
          defaultBranch: 'main',
          accountKey,
          cheapLfsSelection: selection,
        },
      ],
      resolve('batch-clone-cheap-lfs-fixture')
    )
    const recovered = JSON.parse(JSON.stringify([item])) as IBatchCloneItem[]

    assert.doesNotThrow(() => assertSafeBatchCloneItems(recovered))
    assert.deepEqual(recovered[0].cheapLfsSelection, selection)
    assert.notEqual(recovered[0].cheapLfsSelection, selection)
  })

  it('rejects a persisted selection bound to another account, URL, or branch', () => {
    const base = {
      url,
      name: 'game',
      defaultBranch: 'main',
      accountKey,
    }
    for (const changedSelection of [
      { ...selection, accountKey: 'https://api.github.com#8' },
      {
        ...selection,
        repositoryCloneUrl: 'https://github.com/example/other.git',
      },
      { ...selection, defaultBranch: 'trunk' },
    ]) {
      assert.throws(
        () =>
          buildBatchCloneItems(
            [{ ...base, cheapLfsSelection: changedSelection }],
            resolve('batch-clone-cheap-lfs-fixture')
          ),
        /selection is unsafe or stale/i
      )
    }
  })

  it('forwards the persisted selection unchanged to each clone operation', async () => {
    const item: IBatchCloneItem = {
      url,
      name: 'game',
      path: resolve('batch-clone-cheap-lfs-fixture', 'game'),
      defaultBranch: 'main',
      accountKey,
      cheapLfsSelection: selection,
    }
    let receivedOptions: CloneOptions | undefined
    const cloningStore = {
      clone: async (
        _url: string,
        _path: string,
        options: CloneOptions,
        callbacks?: {
          readonly onSuccess?: (successfulAccountKey: string | null) => void
        }
      ) => {
        receivedOptions = options
        callbacks?.onSuccess?.(accountKey)
        return true
      },
    } as unknown as CloningRepositoriesStore

    const store = new BatchCloneStore(cloningStore, createEmptyJournal())
    await store.startBatch([item], BatchCloneMode.Sequential)

    assert.deepEqual(receivedOptions?.cheapLfsSelection, selection)
    assert.equal(receivedOptions?.cheapLfsSelection, selection)
  })
})
