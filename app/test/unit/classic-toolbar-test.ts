import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  ShowClassicToolbarChangedEvent,
  ShowClassicToolbarDefault,
  ShowClassicToolbarKey,
  getShowClassicToolbar,
  getShowClassicToolbarProvenance,
  setShowClassicToolbar,
} from '../../src/lib/classic-toolbar'
import '../helpers/ui/setup'

/**
 * The "show the classic toolbar" preference.
 *
 * This is the setting the user's decision about legacy chrome rests on, so the
 * assertions that matter are the two that are easiest to regress silently: that
 * the shipped default is ON, and that the value round-trips through the same
 * local-storage boolean store every other preference uses rather than through a
 * second store nobody else reads.
 *
 * It runs against jsdom's real `localStorage`, not a stub. A stubbed store
 * would prove the module's own arithmetic and nothing about whether the key it
 * writes is the key it reads.
 */

beforeEach(() => localStorage.removeItem(ShowClassicToolbarKey))
afterEach(() => localStorage.removeItem(ShowClassicToolbarKey))

describe('classic toolbar preference', () => {
  it('ships enabled', () => {
    assert.equal(
      ShowClassicToolbarDefault,
      true,
      'the classic toolbar is kept, not retired; a default of false would be ' +
        'a removal nobody had to write down'
    )
    assert.equal(getShowClassicToolbar(), true)
  })

  it('round-trips a deliberate off and back on again', () => {
    assert.equal(setShowClassicToolbar(false), false)
    assert.equal(getShowClassicToolbar(), false)

    assert.equal(setShowClassicToolbar(true), true)
    assert.equal(getShowClassicToolbar(), true)
  })

  it('writes through the shared boolean store, not a private one', () => {
    setShowClassicToolbar(false)
    assert.equal(
      localStorage.getItem(ShowClassicToolbarKey),
      '0',
      'the value must be readable by the same getBoolean/setBoolean pair the ' +
        'rest of the preferences use'
    )

    // And a value written directly in that store's own encoding is read back,
    // which is what proves the two halves agree.
    localStorage.setItem(ShowClassicToolbarKey, '1')
    assert.equal(getShowClassicToolbar(), true)
  })

  it('distinguishes a recorded choice from the shipped fallback', () => {
    assert.equal(getShowClassicToolbarProvenance(), 'default')

    // Storing the same value the default already has must still count as a
    // recorded choice — "it happens to match" is not "nobody has ever chosen".
    setShowClassicToolbar(ShowClassicToolbarDefault)
    assert.equal(getShowClassicToolbarProvenance(), 'stored')

    setShowClassicToolbar(false)
    assert.equal(getShowClassicToolbarProvenance(), 'stored')

    localStorage.removeItem(ShowClassicToolbarKey)
    assert.equal(getShowClassicToolbarProvenance(), 'default')
  })

  it('tells every mounted surface the moment it changes', () => {
    const seen: Array<boolean> = []
    const listener = () => seen.push(getShowClassicToolbar())
    window.addEventListener(ShowClassicToolbarChangedEvent, listener)

    try {
      setShowClassicToolbar(false)
      setShowClassicToolbar(true)
    } finally {
      window.removeEventListener(ShowClassicToolbarChangedEvent, listener)
    }

    assert.deepStrictEqual(
      seen,
      [false, true],
      'a surface that only reads the preference at startup would sit in the ' +
        'wrong state beside one that switched correctly'
    )
  })
})
