import assert from 'node:assert'
import { describe, it } from 'node:test'

import { RepositoriesStore } from '../../src/lib/stores/repositories-store'

function createStore(options: { failAt: 'delete' | 'bulkAdd' }) {
  let records = [{ repoId: 7, name: 'main' }]
  const table = {
    where: () => ({
      equals: () => ({
        delete: async () => {
          if (options.failAt === 'delete') {
            throw new Error('delete failed')
          }
          records = []
        },
      }),
    }),
    bulkAdd: async (next: Array<{ repoId: number; name: string }>) => {
      if (options.failAt === 'bulkAdd') {
        throw new Error('bulkAdd failed')
      }
      records = [...next]
    },
  }
  const db = {
    protectedBranches: table,
    transaction: async (_mode: string, _table: unknown, operation: () => Promise<void>) => {
      const before = [...records]
      try {
        await operation()
      } catch (error) {
        records = before
        throw error
      }
    },
  }
  const store = new RepositoriesStore(db as any) as any
  store.protectionEnabledForBranchCache = new Map([['7-main', true]])
  store.branchProtectionSettingsFoundCache = new Map([[7, true]])
  return { store, db, getRecords: () => records }
}

describe('RepositoriesStore protected branch writes', () => {
  for (const failAt of ['delete', 'bulkAdd'] as const) {
    it(`preserves the cache and database when ${failAt} rejects`, async () => {
      const { store, getRecords } = createStore({ failAt })

      await assert.rejects(
        store.updateBranchProtections(
          { dbID: 7 } as any,
          [{ name: 'release' }] as any
        ),
        new RegExp(`${failAt} failed`)
      )

      assert.deepEqual(getRecords(), [{ repoId: 7, name: 'main' }])
      assert.deepEqual(
        [...store.protectionEnabledForBranchCache.entries()],
        [['7-main', true]]
      )
      assert.deepEqual(
        [...store.branchProtectionSettingsFoundCache.entries()],
        [[7, true]]
      )
    })
  }
})
