import { decodeBase32, encodeBase32, isBase32 } from './base32'
import {
  clampTotpDigits,
  clampTotpPeriod,
  DefaultTotpAlgorithm,
  DefaultTotpDigits,
  DefaultTotpPeriod,
  ITotpParameters,
  parseTotpAlgorithm,
  TotpAlgorithm,
} from './totp'

/**
 * The `otpauth://totp/` URI scheme — the one thing every authenticator on
 * every platform agrees on.
 *
 * Both directions live here. Building is what the registration QR encodes;
 * parsing is what accepts a pasted URI, a QR read from an image, and a frame
 * off the camera. They are written as a pair on purpose: a round trip through
 * both is asserted in the tests, so a change to one that the other does not
 * follow fails rather than shipping a QR that this app itself cannot read.
 *
 * Nothing here logs. A URI carries the secret in the clear, so it is treated
 * as secret material from the moment it is built to the moment the vault takes
 * it.
 */

/** Everything an `otpauth://totp/` URI can carry that this app understands. */
export interface IOtpauthDescriptor {
  /** The account the code is for — an email address, a username, a handle. */
  readonly account: string
  /**
   * Who issued it. Empty when the URI carried no issuer at all; the surface
   * then shows the account alone rather than inventing a name.
   */
  readonly issuer: string
  /** The shared key, base32 as the scheme carries it. */
  readonly secret: string
  readonly algorithm: TotpAlgorithm
  readonly digits: number
  readonly period: number
}

/** Why a string could not be read as an `otpauth://totp/` URI. */
export type OtpauthParseFailure =
  | 'not-a-uri'
  | 'wrong-scheme'
  | 'wrong-type'
  | 'missing-secret'
  | 'bad-secret'
  | 'missing-account'

/** The result of parsing: either a descriptor or a named reason it failed. */
export type OtpauthParseResult =
  | { readonly ok: true; readonly descriptor: IOtpauthDescriptor }
  | { readonly ok: false; readonly reason: OtpauthParseFailure }

/** The URI scheme, including the colon, as `URL` reports it. */
const Scheme = 'otpauth:'

/**
 * The longest URI this will look at.
 *
 * A pasted string and a decoded QR both arrive from outside; a bound keeps a
 * pathological input from turning parsing into work.
 */
export const MaximumOtpauthUriLength = 4096

/**
 * Percent-encode a label or parameter the way the scheme wants.
 *
 * `encodeURIComponent` leaves `!'()*` alone, which some readers mishandle
 * inside a label, so they are escaped explicitly.
 */
function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

/**
 * Build the `otpauth://totp/` URI for a descriptor.
 *
 * The label is written as `Issuer:Account` and the issuer is repeated as a
 * query parameter, which is what the scheme's own documentation asks for: some
 * readers take the label's prefix and some take the parameter, and disagreeing
 * with either produces an entry filed under the wrong name.
 *
 * Every parameter is written out even when it equals the default. An omitted
 * `algorithm` is read as SHA-1 by convention rather than by specification, and
 * a reader that guesses differently produces codes nobody accepts.
 */
export function buildOtpauthUri(descriptor: IOtpauthDescriptor): string {
  const account = descriptor.account.trim()
  const issuer = descriptor.issuer.trim()
  const label =
    issuer.length === 0
      ? encodeComponent(account)
      : `${encodeComponent(issuer)}:${encodeComponent(account)}`

  const parameters = [
    `secret=${encodeComponent(
      descriptor.secret.replace(/[\s-]/g, '').toUpperCase()
    )}`,
    `algorithm=${descriptor.algorithm}`,
    `digits=${String(clampTotpDigits(descriptor.digits))}`,
    `period=${String(clampTotpPeriod(descriptor.period))}`,
  ]
  if (issuer.length > 0) {
    parameters.splice(1, 0, `issuer=${encodeComponent(issuer)}`)
  }

  return `otpauth://totp/${label}?${parameters.join('&')}`
}

/**
 * `new URL('otpauth://totp/Foo:bar')` does not populate `pathname` the way an
 * http URL does on every runtime, so the label is taken from the raw text
 * between the host and the query instead. The host itself is the OTP type.
 */
function splitUri(value: string): {
  readonly type: string
  readonly label: string
  readonly query: string
} | null {
  const withoutScheme = value.slice(Scheme.length).replace(/^\/+/, '')
  if (withoutScheme.length === 0) {
    return null
  }

  const queryStart = withoutScheme.indexOf('?')
  const beforeQuery =
    queryStart === -1 ? withoutScheme : withoutScheme.slice(0, queryStart)
  const query = queryStart === -1 ? '' : withoutScheme.slice(queryStart + 1)

  const slash = beforeQuery.indexOf('/')
  const type = slash === -1 ? beforeQuery : beforeQuery.slice(0, slash)
  const label = slash === -1 ? '' : beforeQuery.slice(slash + 1)

  return { type: type.toLowerCase(), label, query }
}

function decodeLabelPart(value: string): string {
  try {
    // `+` is a form-encoding convention rather than a URI one, so it is left
    // alone in a label: an account genuinely called `a+b` must survive.
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Read an `otpauth://totp/` URI.
 *
 * Only `totp` is accepted. HOTP is a real part of the scheme, but a counter-
 * based factor has no countdown and no live code, so silently filing one in a
 * list that shows both would leave a row that never changes and never says
 * why.
 */
export function parseOtpauthUri(value: string): OtpauthParseResult {
  const trimmed = value.trim()

  if (trimmed.length === 0 || trimmed.length > MaximumOtpauthUriLength) {
    return { ok: false, reason: 'not-a-uri' }
  }
  if (!trimmed.toLowerCase().startsWith(Scheme)) {
    return { ok: false, reason: 'wrong-scheme' }
  }

  const parts = splitUri(trimmed)
  if (parts === null) {
    return { ok: false, reason: 'not-a-uri' }
  }
  if (parts.type !== 'totp') {
    return { ok: false, reason: 'wrong-type' }
  }

  const query = new URLSearchParams(parts.query)

  const rawSecret = query.get('secret')
  if (rawSecret === null || rawSecret.trim().length === 0) {
    return { ok: false, reason: 'missing-secret' }
  }
  const secret = rawSecret.replace(/[\s-]/g, '').toUpperCase()
  if (!isBase32(secret)) {
    return { ok: false, reason: 'bad-secret' }
  }

  const label = decodeLabelPart(parts.label)
  const separator = label.indexOf(':')
  const labelIssuer = separator === -1 ? '' : label.slice(0, separator).trim()
  const labelAccount =
    separator === -1 ? label.trim() : label.slice(separator + 1).trim()

  // The query parameter wins over the label prefix. Both are supposed to say
  // the same thing; when they disagree the parameter is the one the scheme
  // calls authoritative.
  const issuer = (query.get('issuer') ?? labelIssuer).trim()

  if (labelAccount.length === 0) {
    return { ok: false, reason: 'missing-account' }
  }

  const algorithm =
    parseTotpAlgorithm(query.get('algorithm') ?? '') ?? DefaultTotpAlgorithm
  const digits = clampTotpDigits(
    Number.parseInt(query.get('digits') ?? '', 10) || DefaultTotpDigits
  )
  const period = clampTotpPeriod(
    Number.parseInt(query.get('period') ?? '', 10) || DefaultTotpPeriod
  )

  return {
    ok: true,
    descriptor: {
      account: labelAccount,
      issuer,
      secret,
      algorithm,
      digits,
      period,
    },
  }
}

/** The parameter triple of a descriptor, for the TOTP functions to read. */
export function parametersOf(descriptor: IOtpauthDescriptor): ITotpParameters {
  return {
    algorithm: descriptor.algorithm,
    digits: descriptor.digits,
    period: descriptor.period,
  }
}

/** Decode a descriptor's secret into the bytes HMAC needs. */
export function secretBytesOf(descriptor: IOtpauthDescriptor): Uint8Array {
  return decodeBase32(descriptor.secret)
}

/** Build a descriptor around freshly generated secret bytes. */
export function describeGeneratedSecret(
  account: string,
  issuer: string,
  secret: Uint8Array,
  parameters: Partial<ITotpParameters> = {}
): IOtpauthDescriptor {
  return {
    account: account.trim(),
    issuer: issuer.trim(),
    secret: encodeBase32(secret),
    algorithm: parameters.algorithm ?? DefaultTotpAlgorithm,
    digits: clampTotpDigits(parameters.digits ?? DefaultTotpDigits),
    period: clampTotpPeriod(parameters.period ?? DefaultTotpPeriod),
  }
}
