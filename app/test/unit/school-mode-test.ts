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
})
