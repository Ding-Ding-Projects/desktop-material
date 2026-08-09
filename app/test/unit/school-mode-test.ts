import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hasSchoolModeCredential,
  isValidSchoolModeCredential,
  readSchoolMode,
  setSchoolModeCredential,
  verifySchoolModeCredential,
  writeSchoolMode,
  SchoolModeCredentialStorageKey,
  SchoolModeStorageKey,
} from '../../src/lib/school-mode'
import {
  CommandPaletteCatalog,
  filterPaletteCommands,
} from '../../src/lib/command-palette-catalog'
import { filterSettingsEntries } from '../../src/lib/settings-search/settings-search-catalog'
import { FilterMode } from '../../src/lib/fuzzy-find'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('School mode', () => {
  it('normalizes and persists its presentation state', () => {
    const storage = createStorage()
    const written = writeSchoolMode(
      { enabled: true, name: '  Classroom  ' },
      storage
    )

    assert.deepEqual(written, { enabled: true, name: 'Classroom' })
    assert.deepEqual(readSchoolMode(storage), written)
    assert.equal(
      storage.getItem(SchoolModeStorageKey)?.includes('Classroom'),
      true
    )
  })

  it('verifies a salted local credential without storing the plain value', async () => {
    const storage = createStorage()
    const credential = 'correct horse battery staple'

    assert.equal(isValidSchoolModeCredential(credential), true)
    assert.equal(isValidSchoolModeCredential('abc'), false)
    await setSchoolModeCredential(credential, storage)

    const stored = storage.getItem(SchoolModeCredentialStorageKey)
    assert.ok(stored)
    assert.equal(stored.includes(credential), false)
    assert.equal(hasSchoolModeCredential(storage), true)
    assert.equal(await verifySchoolModeCredential(credential, storage), true)
    assert.equal(
      await verifySchoolModeCredential('wrong credential', storage),
      false
    )
  })

  it('omits language and playfulness controls while enabled', () => {
    const paletteEvents = new Set(
      filterPaletteCommands(
        CommandPaletteCatalog,
        '',
        'win32',
        undefined,
        true
      ).map(command => command.event)
    )
    assert.equal(paletteEvents.has('palette:set-language-mode'), false)
    assert.equal(paletteEvents.has('palette:set-funny-english'), false)
    assert.equal(paletteEvents.has('palette:set-funny-cantonese'), false)
    assert.equal(paletteEvents.has('palette:school-mode'), true)

    const settings = filterSettingsEntries(
      'funny level',
      { mode: FilterMode.Substring, caseSensitive: false },
      undefined,
      true
    )
    assert.equal(
      settings.results.some(
        result => result.item.id === 'appearance-playfulness'
      ),
      false
    )
  })
})
