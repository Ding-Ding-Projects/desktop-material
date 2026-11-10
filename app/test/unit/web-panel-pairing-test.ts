import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  EmptyPairingState,
  MaxPairingCodes,
  MaxPairingFailures,
  PairingCodeLifetimeMs,
  PairingFailureWindowMs,
  SessionLifetimeMs,
  cleanDeviceLabel,
  createPairingCode,
  findPairedDevice,
  formatPairingCode,
  issuePairingCode,
  normalizePairingCode,
  redeemPairingCode,
  revokePairedDevice,
  sameText,
} from '../../src/lib/web-panel/pairing'

/** Deterministic bytes: 0, 7, 14, … so tests can predict codes. */
const counter = () => {
  let next = 0
  return (count: number) => {
    const bytes = new Uint8Array(count)
    for (let i = 0; i < count; i++) {
      bytes[i] = next
      next = (next + 7) % 256
    }
    return bytes
  }
}

const device = (id: string) => ({
  id,
  label: `Phone ${id}`,
  tokenDigest: `digest-${id}`,
})

describe('web panel pairing', () => {
  it('makes eight-character codes from the unambiguous alphabet', () => {
    const code = createPairingCode(counter())
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
    assert.equal(formatPairingCode('ABCDEFGH'), 'ABCD-EFGH')
    assert.equal(normalizePairingCode(' abcd-efgh '), 'ABCDEFGH')
    // Bytes that would bias the choice are skipped, not folded in.
    const skipping = createPairingCode(count =>
      new Uint8Array(count).map((_, i) => (i % 2 === 0 ? 255 : 0))
    )
    assert.equal(skipping, 'AAAAAAAA')
  })

  it('lets a code in once, within ten minutes', () => {
    const issued = issuePairingCode(EmptyPairingState, 1000, counter())
    const first = redeemPairingCode(
      issued.state,
      formatPairingCode(issued.code).toLowerCase(),
      device('a'),
      2000
    )
    assert.equal(first.ok, true)
    assert.equal(first.state.codes.length, 0)
    assert.equal(first.state.devices[0].label, 'Phone a')
    assert.equal(first.state.devices[0].expiresAt, 2000 + SessionLifetimeMs)

    const again = redeemPairingCode(first.state, issued.code, device('b'), 3000)
    assert.equal(again.ok, false)

    const late = redeemPairingCode(
      issued.state,
      issued.code,
      device('c'),
      1000 + PairingCodeLifetimeMs
    )
    assert.equal(late.ok, false)
  })

  it('pauses pairing after too many wrong guesses, then recovers', () => {
    let state = issuePairingCode(EmptyPairingState, 0, counter()).state
    const code = state.codes[0].code
    for (let i = 0; i < MaxPairingFailures; i++) {
      const result = redeemPairingCode(state, 'WRONG123', device('x'), 10 + i)
      assert.equal(result.ok === false && result.reason, 'wrong-code')
      state = result.state
    }
    const paused = redeemPairingCode(state, code, device('x'), 100)
    assert.equal(paused.ok === false && paused.reason, 'paused')

    const fresh = issuePairingCode(
      state,
      PairingFailureWindowMs + 100,
      counter()
    )
    const recovered = redeemPairingCode(
      fresh.state,
      fresh.code,
      device('x'),
      PairingFailureWindowMs + 200
    )
    assert.equal(recovered.ok, true)
  })

  it('keeps only the newest few codes', () => {
    const random = counter()
    let state = EmptyPairingState
    for (let i = 0; i < MaxPairingCodes + 3; i++) {
      state = issuePairingCode(state, i, random).state
    }
    assert.equal(state.codes.length, MaxPairingCodes)
  })

  it('finds a device by digest until it expires or is revoked', () => {
    const issued = issuePairingCode(EmptyPairingState, 0, counter())
    const paired = redeemPairingCode(issued.state, issued.code, device('a'), 0)
    assert.equal(findPairedDevice(paired.state, 'digest-a', 5)?.id, 'a')
    assert.equal(findPairedDevice(paired.state, 'digest-b', 5), null)
    assert.equal(
      findPairedDevice(paired.state, 'digest-a', SessionLifetimeMs),
      null
    )
    assert.equal(
      findPairedDevice(revokePairedDevice(paired.state, 'a'), 'digest-a', 5),
      null
    )
    assert.equal(revokePairedDevice(paired.state, null).devices.length, 0)
  })

  it('compares in equal time and cleans device labels', () => {
    assert.equal(sameText('abc', 'abc'), true)
    assert.equal(sameText('abc', 'abd'), false)
    assert.equal(sameText('abc', 'abcd'), false)
    assert.equal(cleanDeviceLabel('  My\nphone\u0007 '), 'My phone')
    assert.equal(cleanDeviceLabel('\u0000'), 'Unnamed device')
    assert.equal(cleanDeviceLabel('x'.repeat(100)).length, 60)
  })
})
