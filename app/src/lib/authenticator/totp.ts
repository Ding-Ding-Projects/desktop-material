import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * RFC 6238 TOTP over RFC 4226 HOTP.
 *
 * Written against the RFCs rather than pulled from a package: an authenticator
 * that is subtly wrong emits confidently formatted digits that every server
 * rejects, with no error anywhere to read. The published RFC 6238 test vectors
 * are the acceptance gate, and `app/test/unit/authenticator-totp-test.ts` runs
 * all eighteen of them plus the RFC 4226 HOTP set.
 *
 * Nothing here reads the clock on its own. Every function takes the instant it
 * should compute for, so a test can pin time and the UI can compute the next
 * period's code without waiting for it to arrive.
 */

/** The hash functions RFC 6238 names, spelled as `otpauth://` spells them. */
export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

/** Every algorithm, in the order a picker should offer them. */
export const TotpAlgorithms: ReadonlyArray<TotpAlgorithm> = [
  'SHA1',
  'SHA256',
  'SHA512',
]

/** What almost every issuer in the world actually uses. */
export const DefaultTotpAlgorithm: TotpAlgorithm = 'SHA1'

/** RFC 4226 allows 6–8; six is the universal default. */
export const DefaultTotpDigits = 6

/** RFC 6238's recommended time step, in seconds. */
export const DefaultTotpPeriod = 30

/** The shortest period the app will accept. */
export const MinimumTotpPeriod = 1

/**
 * The longest period the app will accept.
 *
 * A day is far beyond anything an issuer uses; the ceiling exists so a
 * malformed `otpauth://` URI cannot produce a countdown that never moves.
 */
export const MaximumTotpPeriod = 86_400

/** RFC 4226 §5.3 defines truncation for 6, 7 and 8 digits. */
export const MinimumTotpDigits = 6
export const MaximumTotpDigits = 8

/** The parameters that decide what digits a secret produces. */
export interface ITotpParameters {
  readonly algorithm: TotpAlgorithm
  readonly digits: number
  /** The time step in seconds. */
  readonly period: number
}

/** The shipped defaults, which are also what an `otpauth://` URI omits. */
export const DefaultTotpParameters: ITotpParameters = {
  algorithm: DefaultTotpAlgorithm,
  digits: DefaultTotpDigits,
  period: DefaultTotpPeriod,
}

/** Map an `otpauth://` algorithm name onto the Node digest name. */
function digestName(algorithm: TotpAlgorithm): string {
  switch (algorithm) {
    case 'SHA1':
      return 'sha1'
    case 'SHA256':
      return 'sha256'
    case 'SHA512':
      return 'sha512'
  }
}

/** Read an algorithm out of untrusted text, or `null` when it is not one. */
export function parseTotpAlgorithm(value: string): TotpAlgorithm | null {
  const normalized = value.trim().toUpperCase().replace(/[-_]/g, '')
  return TotpAlgorithms.find(candidate => candidate === normalized) ?? null
}

/** Clamp a digit count into RFC 4226's supported range. */
export function clampTotpDigits(value: number): number {
  if (!Number.isFinite(value)) {
    return DefaultTotpDigits
  }
  return Math.min(
    MaximumTotpDigits,
    Math.max(MinimumTotpDigits, Math.trunc(value))
  )
}

/** Clamp a period into the range the app is willing to count down. */
export function clampTotpPeriod(value: number): number {
  if (!Number.isFinite(value)) {
    return DefaultTotpPeriod
  }
  return Math.min(
    MaximumTotpPeriod,
    Math.max(MinimumTotpPeriod, Math.trunc(value))
  )
}

/**
 * RFC 4226 §5.1: the moving factor is an 8-byte big-endian counter.
 *
 * `BigInt` rather than a shifted number, because counters past 2^53 are
 * reachable with a one-second period and a far-future clock, and the shifted
 * form loses the low bits silently.
 */
function counterBuffer(counter: bigint): Buffer {
  const bytes = Buffer.alloc(8)
  let remaining = counter < 0n ? 0n : counter
  for (let index = 7; index >= 0; index--) {
    bytes[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return bytes
}

/**
 * RFC 4226 HOTP.
 *
 * @param secret the shared key, already decoded from base32.
 * @param counter the moving factor.
 */
export function hotp(
  secret: Uint8Array,
  counter: bigint,
  algorithm: TotpAlgorithm = DefaultTotpAlgorithm,
  digits: number = DefaultTotpDigits
): string {
  const mac = createHmac(digestName(algorithm), Buffer.from(secret))
    .update(counterBuffer(counter))
    .digest()

  // RFC 4226 §5.3 dynamic truncation: the low nibble of the last byte selects
  // a four-byte window, whose top bit is cleared so the value is positive in
  // every language's signed 32-bit integer.
  const offset = mac[mac.length - 1] & 0x0f
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff)

  const width = clampTotpDigits(digits)
  return String(binary % 10 ** width).padStart(width, '0')
}

/** The time step a given instant falls in. */
export function totpCounter(
  unixSeconds: number,
  period: number = DefaultTotpPeriod
): bigint {
  const step = clampTotpPeriod(period)
  return BigInt(Math.floor(unixSeconds / step))
}

/** RFC 6238 TOTP for a specific instant, expressed in Unix seconds. */
export function totp(
  secret: Uint8Array,
  unixSeconds: number,
  parameters: Partial<ITotpParameters> = {}
): string {
  const algorithm = parameters.algorithm ?? DefaultTotpAlgorithm
  const digits = clampTotpDigits(parameters.digits ?? DefaultTotpDigits)
  const period = clampTotpPeriod(parameters.period ?? DefaultTotpPeriod)
  return hotp(secret, totpCounter(unixSeconds, period), algorithm, digits)
}

/** The current code, the one after it, and how long the current one lasts. */
export interface ITotpWindow {
  /** The code for the step containing `unixSeconds`. */
  readonly code: string
  /** The code for the following step, so the display can peek ahead. */
  readonly nextCode: string
  /** Whole seconds until the current code stops being valid. Never zero. */
  readonly secondsRemaining: number
  /** The step length these figures were computed for. */
  readonly period: number
  /** The Unix second at which `nextCode` becomes `code`. */
  readonly expiresAtUnixSeconds: number
}

/**
 * Everything the code display needs, computed once per render.
 *
 * `secondsRemaining` counts down from `period` to 1 rather than to 0: a
 * countdown that reads "0 seconds" for a whole second while a perfectly valid
 * code is still on screen tells the user the wrong thing.
 */
export function totpWindow(
  secret: Uint8Array,
  unixSeconds: number,
  parameters: Partial<ITotpParameters> = {}
): ITotpWindow {
  const period = clampTotpPeriod(parameters.period ?? DefaultTotpPeriod)
  const counter = totpCounter(unixSeconds, period)
  const algorithm = parameters.algorithm ?? DefaultTotpAlgorithm
  const digits = clampTotpDigits(parameters.digits ?? DefaultTotpDigits)
  const expiresAtUnixSeconds = Number(counter + 1n) * period

  return {
    code: hotp(secret, counter, algorithm, digits),
    nextCode: hotp(secret, counter + 1n, algorithm, digits),
    secondsRemaining: Math.max(
      1,
      Math.ceil(expiresAtUnixSeconds - unixSeconds)
    ),
    period,
    expiresAtUnixSeconds,
  }
}

/**
 * Whether a candidate code matches the secret, within a symmetric window of
 * time steps either side of `unixSeconds`.
 *
 * The comparison is constant-time across the candidate window so the number of
 * matching leading digits cannot be read off the response time. `window` is 1
 * by default, which is the tolerance RFC 6238 §5.2 suggests for clock drift
 * during pairing.
 */
export function verifyTotp(
  secret: Uint8Array,
  candidate: string,
  unixSeconds: number,
  parameters: Partial<ITotpParameters> = {},
  window = 1
): boolean {
  const digits = clampTotpDigits(parameters.digits ?? DefaultTotpDigits)
  const trimmed = candidate.replace(/\s/g, '')
  if (trimmed.length !== digits || !/^[0-9]+$/.test(trimmed)) {
    return false
  }

  const period = clampTotpPeriod(parameters.period ?? DefaultTotpPeriod)
  const algorithm = parameters.algorithm ?? DefaultTotpAlgorithm
  const centre = totpCounter(unixSeconds, period)
  const offered = Buffer.from(trimmed, 'utf8')

  let matched = false
  for (let step = -Math.abs(window); step <= Math.abs(window); step++) {
    const expected = Buffer.from(
      hotp(secret, centre + BigInt(step), algorithm, digits),
      'utf8'
    )
    // Both buffers are the same length by construction, so `timingSafeEqual`
    // never throws here; the OR keeps the loop running over every candidate so
    // an early match cannot be timed.
    matched = timingSafeEqual(expected, offered) || matched
  }

  return matched
}

/**
 * The recommended secret length in bytes.
 *
 * RFC 4226 §4 requires at least 128 bits and recommends 160, which is also the
 * output width of SHA-1 — so a 20-byte secret is exactly one HMAC block's
 * worth of entropy and is what every issuer generates.
 */
export const TotpSecretBytes = 20

/** Generate a fresh secret locally. Never leaves the process unencrypted. */
export function generateTotpSecret(
  bytes: number = TotpSecretBytes
): Uint8Array {
  return new Uint8Array(randomBytes(Math.max(10, Math.trunc(bytes))))
}

/**
 * How far the system clock would have to be wrong before codes start being
 * refused: half a time step, because a server checking ±1 step tolerates
 * roughly that much before the windows stop overlapping.
 */
export function totpSkewToleranceSeconds(
  period: number = DefaultTotpPeriod
): number {
  return Math.max(1, Math.floor(clampTotpPeriod(period) / 2))
}

/** The verdict on whether this machine's clock can still produce good codes. */
export interface ITotpClockAssessment {
  /** Seconds this machine is ahead of the reference. Negative means behind. */
  readonly offsetSeconds: number
  /** True when the offset is large enough that codes will be refused. */
  readonly skewed: boolean
  /** The tolerance the verdict was taken against. */
  readonly toleranceSeconds: number
}

/**
 * Compare the system clock against a reference instant the caller trusts.
 *
 * There is deliberately no network time lookup: this app makes no runtime
 * network requests, and a silent one to a time server would be exactly that.
 * The reference comes from something the machine already knows — a recent
 * response's `Date` header, or a monotonic drift measurement — and when there
 * is nothing to compare against the surface says the clock is unverified
 * rather than pretending it checked.
 */
export function assessTotpClock(
  systemUnixSeconds: number,
  referenceUnixSeconds: number,
  period: number = DefaultTotpPeriod
): ITotpClockAssessment {
  const toleranceSeconds = totpSkewToleranceSeconds(period)
  const offsetSeconds = Math.round(systemUnixSeconds - referenceUnixSeconds)
  return {
    offsetSeconds,
    skewed: Math.abs(offsetSeconds) > toleranceSeconds,
    toleranceSeconds,
  }
}

/**
 * Detect a clock that has been stepped while the app was running.
 *
 * `performance.now()` and friends advance monotonically; the wall clock does
 * not. Sampling both and comparing how much each moved catches the case this
 * surface actually has to report — a user fixing their timezone, or a laptop
 * waking with a stale RTC — without asking anything outside the process.
 */
export function driftBetweenSamples(
  firstWallMilliseconds: number,
  firstMonotonicMilliseconds: number,
  secondWallMilliseconds: number,
  secondMonotonicMilliseconds: number
): number {
  const wall = secondWallMilliseconds - firstWallMilliseconds
  const monotonic = secondMonotonicMilliseconds - firstMonotonicMilliseconds
  return Math.round((wall - monotonic) / 1000)
}
