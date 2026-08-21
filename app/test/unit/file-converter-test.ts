import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FileConverterAdapterRegistry,
  FileConverterCategories,
  FileConverterQueueStorageKey,
  createEmptyFileConverterQueueState,
  readFileConverterQueueState,
  writeFileConverterQueueState,
} from '../../src/lib/file-converter'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly values = new Map<string, string>()

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  public setRaw(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('local file converter foundation', () => {
  it('lists every required category and never enables an unbundled adapter', () => {
    assert.deepEqual(
      [...new Set(FileConverterAdapterRegistry.map(adapter => adapter.category))],
      FileConverterCategories
    )
    for (const adapter of FileConverterAdapterRegistry) {
      assert.equal(adapter.networkAccess, 'never')
      if (!adapter.bundled) {
        assert.equal(adapter.availability, 'unavailable')
        assert.match(adapter.unavailableReason ?? '', /Unavailable:/)
      }
    }
  })

  it('rejects corrupt queue metadata instead of partially applying it', () => {
    const storage = new MemoryStorage()
    storage.setRaw(FileConverterQueueStorageKey, '{not-json')
    assert.deepEqual(readFileConverterQueueState(storage), createEmptyFileConverterQueueState())
  })

  it('persists only queue metadata and its bounded scheduler configuration', () => {
    const storage = new MemoryStorage()
    const state = { ...createEmptyFileConverterQueueState(), concurrency: 99 }
    assert.equal(writeFileConverterQueueState(state, storage), true)
    assert.equal(readFileConverterQueueState(storage).concurrency, 4)
  })
})
