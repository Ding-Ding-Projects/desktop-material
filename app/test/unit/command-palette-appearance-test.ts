import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'

/** A minimal in-memory localStorage so this stays a node-only test. */
class MemoryStorage {
  private readonly values = new Map<string, string>()
  public shouldThrow = false

  public getItem(key: string): string | null {
    if (this.shouldThrow) {
      throw new Error('storage unavailable')
    }
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    if (this.shouldThrow) {
      throw new Error('storage unavailable')
    }
    this.values.set(key, value)
  }

  public clear(): void {
    this.values.clear()
  }
}

const storage = new MemoryStorage()
// The test environment already defines a read-only `localStorage`, so replace
// it through the property descriptor rather than by assignment.
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
  writable: true,
})

// Imported after localStorage exists because the module reads it on demand.
const {
  DefaultCommandPaletteAppearance,
  persistCommandPaletteAppearance,
  readCommandPaletteAppearance,
  resolveCommandSymbol,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../../src/ui/command-palette/command-palette-appearance')

describe('command palette appearance', () => {
  beforeEach(() => {
    storage.shouldThrow = false
    storage.clear()
  })

  it('returns the default when nothing is stored', () => {
    assert.deepEqual(
      readCommandPaletteAppearance(),
      DefaultCommandPaletteAppearance
    )
  })

  it('round-trips a persisted appearance', () => {
    const appearance = {
      density: 'compact' as const,
      showIcons: false,
      showGroups: true,
      showKeywords: false,
    }
    persistCommandPaletteAppearance(appearance)
    assert.deepEqual(readCommandPaletteAppearance(), appearance)
  })

  it('repairs a partial or invalid stored value field by field', () => {
    storage.setItem(
      'command-palette-appearance-v1',
      JSON.stringify({
        density: 'enormous',
        showIcons: 'yes',
        showGroups: false,
      })
    )
    assert.deepEqual(readCommandPaletteAppearance(), {
      density: DefaultCommandPaletteAppearance.density,
      showIcons: DefaultCommandPaletteAppearance.showIcons,
      showGroups: false,
      showKeywords: DefaultCommandPaletteAppearance.showKeywords,
    })
  })

  it('falls back to the default when storage is unreadable', () => {
    storage.shouldThrow = true
    assert.deepEqual(
      readCommandPaletteAppearance(),
      DefaultCommandPaletteAppearance
    )
    // Persisting must not throw either; appearance is never load-bearing.
    assert.doesNotThrow(() =>
      persistCommandPaletteAppearance(DefaultCommandPaletteAppearance)
    )
  })

  it('prefers an explicit symbol, then the group, then a fallback', () => {
    assert.equal(resolveCommandSymbol('Repository', 'sync'), 'sync')
    assert.equal(resolveCommandSymbol('Repository'), 'database')
    assert.equal(resolveCommandSymbol('Navigate'), 'account_tree')
    assert.equal(resolveCommandSymbol('Not a real group'), 'category')
  })
})
