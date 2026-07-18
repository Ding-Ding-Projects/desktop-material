import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { setBoolean, getBoolean } from '../../src/lib/local-storage'

// Mirrors the persistence contract in app-store's
// `_setAutoSwitchAccountToRepositoryOwnerSetting` and its startup load: the
// setting is stored under this key and defaults to on. Kept in sync with the
// `autoSwitchAccountToRepositoryOwnerKey` / `...Default` constants there.
const autoSwitchAccountToRepositoryOwnerKey =
  'autoSwitchAccountToRepositoryOwner'

describe('autoSwitchAccountToRepositoryOwner preference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to on when the user has never set it', () => {
    assert.strictEqual(
      getBoolean(autoSwitchAccountToRepositoryOwnerKey, true),
      true
    )
  })

  it('round-trips an opt-out (false) value', () => {
    setBoolean(autoSwitchAccountToRepositoryOwnerKey, false)
    assert.strictEqual(
      getBoolean(autoSwitchAccountToRepositoryOwnerKey, true),
      false
    )
  })

  it('round-trips an opt-in (true) value', () => {
    setBoolean(autoSwitchAccountToRepositoryOwnerKey, true)
    assert.strictEqual(
      getBoolean(autoSwitchAccountToRepositoryOwnerKey, true),
      true
    )
  })
})
