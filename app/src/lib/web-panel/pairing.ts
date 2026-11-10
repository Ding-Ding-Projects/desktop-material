/**
 * Pairing for the web panel.
 *
 * A device is let in with a one-time code that the owner reads from the app
 * (or, if they asked for it, from their Discord channel). A code works once
 * and for ten minutes. A paired device then holds a long random session
 * token; only its SHA-256 digest is kept, so the stored list cannot be used to
 * sign in.
 *
 * Pure rules: the caller supplies the clock, the random bytes and the digest.
 */

export const PairingCodeLength = 8
export const PairingCodeLifetimeMs = 10 * 60 * 1000
export const MaxPairingCodes = 5
export const MaxPairedDevices = 20
/** Wrong guesses allowed in one window before pairing pauses for everyone. */
export const MaxPairingFailures = 8
export const PairingFailureWindowMs = 10 * 60 * 1000
export const SessionLifetimeMs = 30 * 24 * 60 * 60 * 1000

/** No 0, O, 1, I or L: the code is read aloud and typed on phones. */
const Alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export interface IPairingCode {
  readonly code: string
  readonly expiresAt: number
}

export interface IPairedDevice {
  readonly id: string
  /** What the device called itself when pairing; shown to the owner. */
  readonly label: string
  /** Hex SHA-256 of the session token. The token itself is never kept. */
  readonly tokenDigest: string
  readonly pairedAt: number
  readonly expiresAt: number
}

export interface IPairingState {
  readonly codes: ReadonlyArray<IPairingCode>
  readonly devices: ReadonlyArray<IPairedDevice>
  /** Times of recent wrong guesses. */
  readonly failures: ReadonlyArray<number>
}

export const EmptyPairingState: IPairingState = {
  codes: [],
  devices: [],
  failures: [],
}

export type RandomBytes = (count: number) => Uint8Array

/** A new code from random bytes, without modulo bias. */
export function createPairingCode(random: RandomBytes): string {
  let code = ''
  const limit = 256 - (256 % Alphabet.length)
  for (let round = 0; code.length < PairingCodeLength; round++) {
    if (round === 64) {
      throw new Error('The random source did not produce usable bytes.')
    }
    for (const byte of random(PairingCodeLength * 2)) {
      if (byte < limit && code.length < PairingCodeLength) {
        code += Alphabet[byte % Alphabet.length]
      }
    }
  }
  return code
}

/** How the code is shown: two groups of four. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** What a person typed, reduced to the bare code. */
export function normalizePairingCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const live = (state: IPairingState, now: number): IPairingState => ({
  codes: state.codes.filter(c => c.expiresAt > now),
  devices: state.devices.filter(d => d.expiresAt > now),
  failures: state.failures.filter(t => t > now - PairingFailureWindowMs),
})

/** Add a fresh code, dropping expired ones and the oldest beyond the cap. */
export function issuePairingCode(
  state: IPairingState,
  now: number,
  random: RandomBytes
): { readonly state: IPairingState; readonly code: string } {
  const current = live(state, now)
  const code = createPairingCode(random)
  return {
    code,
    state: {
      ...current,
      codes: [
        ...current.codes,
        { code, expiresAt: now + PairingCodeLifetimeMs },
      ].slice(-MaxPairingCodes),
    },
  }
}

/** Equal-time comparison of two short strings. */
export function sameText(a: string, b: string): boolean {
  let difference = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return difference === 0
}

export type PairingResult =
  | { readonly ok: true; readonly state: IPairingState }
  | {
      readonly ok: false
      readonly state: IPairingState
      readonly reason: 'wrong-code' | 'paused' | 'full'
    }

/**
 * Use a code. A right code is consumed and the device is recorded; a wrong
 * one is counted, and too many pause pairing until the window passes.
 */
export function redeemPairingCode(
  state: IPairingState,
  typed: string,
  device: {
    readonly id: string
    readonly label: string
    readonly tokenDigest: string
  },
  now: number
): PairingResult {
  const current = live(state, now)
  if (current.failures.length >= MaxPairingFailures) {
    return { ok: false, state: current, reason: 'paused' }
  }
  const code = normalizePairingCode(typed)
  let matched: IPairingCode | null = null
  for (const candidate of current.codes) {
    if (sameText(candidate.code, code)) {
      matched = candidate
    }
  }
  if (matched === null) {
    return {
      ok: false,
      reason: 'wrong-code',
      state: { ...current, failures: [...current.failures, now] },
    }
  }
  if (current.devices.length >= MaxPairedDevices) {
    return { ok: false, state: current, reason: 'full' }
  }
  return {
    ok: true,
    state: {
      ...current,
      codes: current.codes.filter(c => c !== matched),
      devices: [
        ...current.devices,
        {
          id: device.id,
          label: cleanDeviceLabel(device.label),
          tokenDigest: device.tokenDigest,
          pairedAt: now,
          expiresAt: now + SessionLifetimeMs,
        },
      ],
    },
  }
}

/** A short printable label; never trusted for anything but display. */
export function cleanDeviceLabel(label: string): string {
  const cleaned = label
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return cleaned.length === 0 ? 'Unnamed device' : cleaned
}

/** The paired device that holds this token digest, if it is still valid. */
export function findPairedDevice(
  state: IPairingState,
  tokenDigest: string,
  now: number
): IPairedDevice | null {
  let found: IPairedDevice | null = null
  for (const device of state.devices) {
    if (device.expiresAt > now && sameText(device.tokenDigest, tokenDigest)) {
      found = device
    }
  }
  return found
}

/** Remove one device, or every device when no id is given. */
export function revokePairedDevice(
  state: IPairingState,
  id: string | null
): IPairingState {
  return {
    ...state,
    devices: id === null ? [] : state.devices.filter(d => d.id !== id),
  }
}
