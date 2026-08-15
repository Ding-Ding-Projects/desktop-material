import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  Base32Error,
  decodeBase32,
  encodeBase32,
  groupBase32,
  isBase32,
} from '../../src/lib/authenticator/base32'
import {
  assessTotpClock,
  clampTotpDigits,
  clampTotpPeriod,
  DefaultTotpParameters,
  driftBetweenSamples,
  generateTotpSecret,
  hotp,
  parseTotpAlgorithm,
  TotpAlgorithm,
  totp,
  totpCounter,
  totpSkewToleranceSeconds,
  totpWindow,
  verifyTotp,
} from '../../src/lib/authenticator/totp'
import {
  buildOtpauthUri,
  describeGeneratedSecret,
  parseOtpauthUri,
  parametersOf,
  secretBytesOf,
} from '../../src/lib/authenticator/otpauth-uri'

/**
 * The acceptance gate for the authenticator.
 *
 * A TOTP implementation that is subtly wrong produces confidently formatted
 * digits that every server on earth refuses, with no error anywhere to read —
 * so the published RFC vectors are asserted here rather than a hand-rolled
 * "looks like six digits" check. All eighteen RFC 6238 vectors run, for SHA-1,
 * SHA-256 and SHA-512 at eight digits, plus the six-digit truncation of each
 * and the full RFC 4226 HOTP set.
 */

/** ASCII `12345678901234567890` — the RFC 4226 §D / RFC 6238 SHA-1 key. */
const Sha1Key = Buffer.from('12345678901234567890', 'ascii')

/** The RFC 6238 SHA-256 key: the same pattern, 32 bytes. */
const Sha256Key = Buffer.from('12345678901234567890123456789012', 'ascii')

/** The RFC 6238 SHA-512 key: the same pattern, 64 bytes. */
const Sha512Key = Buffer.from(
  '1234567890123456789012345678901234567890123456789012345678901234',
  'ascii'
)

function keyFor(algorithm: TotpAlgorithm): Buffer {
  switch (algorithm) {
    case 'SHA1':
      return Sha1Key
    case 'SHA256':
      return Sha256Key
    case 'SHA512':
      return Sha512Key
  }
}

/** RFC 4226 Appendix D, counters 0–9 at six digits. */
const Rfc4226Vectors: ReadonlyArray<string> = [
  '755224',
  '287082',
  '359152',
  '969429',
  '338314',
  '254676',
  '287922',
  '162583',
  '399871',
  '520489',
]

/** RFC 6238 Appendix B, in full. */
const Rfc6238Vectors: ReadonlyArray<
  readonly [seconds: number, algorithm: TotpAlgorithm, code: string]
> = [
  [59, 'SHA1', '94287082'],
  [59, 'SHA256', '46119246'],
  [59, 'SHA512', '90693936'],
  [1111111109, 'SHA1', '07081804'],
  [1111111109, 'SHA256', '68084774'],
  [1111111109, 'SHA512', '25091201'],
  [1111111111, 'SHA1', '14050471'],
  [1111111111, 'SHA256', '67062674'],
  [1111111111, 'SHA512', '99943326'],
  [1234567890, 'SHA1', '89005924'],
  [1234567890, 'SHA256', '91819424'],
  [1234567890, 'SHA512', '93441116'],
  [2000000000, 'SHA1', '69279037'],
  [2000000000, 'SHA256', '90698825'],
  [2000000000, 'SHA512', '38618901'],
  [20000000000, 'SHA1', '65353130'],
  [20000000000, 'SHA256', '77737706'],
  [20000000000, 'SHA512', '47863826'],
]

describe('RFC 4226 HOTP', () => {
  it('matches every published counter vector', () => {
    Rfc4226Vectors.forEach((expected, counter) => {
      assert.equal(
        hotp(Sha1Key, BigInt(counter), 'SHA1', 6),
        expected,
        `HOTP counter ${counter}`
      )
    })
  })

  it('reads the counter as an unsigned 64-bit big-endian value', () => {
    // Past 2^53 a shifted-number implementation silently loses the low bits.
    // Two counters that differ only below that boundary must not collide.
    const low = hotp(Sha1Key, 9007199254740993n, 'SHA1', 8)
    const high = hotp(Sha1Key, 9007199254740992n, 'SHA1', 8)
    assert.notEqual(low, high)
  })
})

describe('RFC 6238 TOTP', () => {
  it('matches all eighteen published vectors at eight digits', () => {
    for (const [seconds, algorithm, expected] of Rfc6238Vectors) {
      assert.equal(
        totp(keyFor(algorithm), seconds, {
          algorithm,
          digits: 8,
          period: 30,
        }),
        expected,
        `TOTP ${algorithm} at ${seconds}`
      )
    }
  })

  it('truncates the same vectors correctly at six digits', () => {
    // Six-digit truncation is the eight-digit value modulo one million, which
    // is its last six digits — so the RFC's own table validates both widths.
    for (const [seconds, algorithm, expected] of Rfc6238Vectors) {
      assert.equal(
        totp(keyFor(algorithm), seconds, {
          algorithm,
          digits: 6,
          period: 30,
        }),
        expected.slice(-6),
        `TOTP ${algorithm} at ${seconds}, six digits`
      )
    }
  })

  it('steps the counter on the period boundary and nowhere else', () => {
    assert.equal(totpCounter(0, 30), 0n)
    assert.equal(totpCounter(29, 30), 0n)
    assert.equal(totpCounter(30, 30), 1n)
    assert.equal(totpCounter(59, 30), 1n)
    assert.equal(totpCounter(60, 30), 2n)
  })

  it('honours a non-default period', () => {
    // The same instant lands in a different step at 60 seconds, so the code
    // must differ from the 30-second one.
    assert.notEqual(
      totp(Sha1Key, 59, { algorithm: 'SHA1', digits: 8, period: 60 }),
      totp(Sha1Key, 59, { algorithm: 'SHA1', digits: 8, period: 30 })
    )
    assert.equal(
      totp(Sha1Key, 59, { algorithm: 'SHA1', digits: 8, period: 60 }),
      hotp(Sha1Key, 0n, 'SHA1', 8)
    )
  })
})

describe('the code window', () => {
  it('reports the current code, the next one, and the seconds left', () => {
    const window = totpWindow(Sha1Key, 59, {
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
    })
    assert.equal(window.code, '94287082')
    assert.equal(window.nextCode, hotp(Sha1Key, 2n, 'SHA1', 8))
    assert.equal(window.expiresAtUnixSeconds, 60)
    assert.equal(window.secondsRemaining, 1)
    assert.equal(window.period, 30)
  })

  it('never counts down to zero while a valid code is on screen', () => {
    // A countdown reading "0 seconds" beside a code that is still accepted
    // tells the user the wrong thing.
    for (let second = 30; second < 60; second++) {
      const window = totpWindow(Sha1Key, second, { period: 30 })
      assert.ok(
        window.secondsRemaining >= 1 && window.secondsRemaining <= 30,
        `second ${second} reported ${window.secondsRemaining}`
      )
    }
  })

  it('rolls the next code into the current one at the boundary', () => {
    const before = totpWindow(Sha1Key, 59.5, { period: 30 })
    const after = totpWindow(Sha1Key, 60, { period: 30 })
    assert.equal(before.nextCode, after.code)
  })
})

describe('verifying a pairing code', () => {
  const parameters = { algorithm: 'SHA1' as const, digits: 8, period: 30 }

  it('accepts the code for the current step', () => {
    assert.ok(verifyTotp(Sha1Key, '94287082', 59, parameters, 1))
  })

  it('accepts one step either side, for clock drift during pairing', () => {
    assert.ok(verifyTotp(Sha1Key, '94287082', 30, parameters, 1))
    assert.ok(verifyTotp(Sha1Key, '94287082', 89, parameters, 1))
  })

  it('refuses a code from outside the window', () => {
    assert.equal(verifyTotp(Sha1Key, '94287082', 200, parameters, 1), false)
  })

  it('refuses anything that is not the right shape', () => {
    assert.equal(verifyTotp(Sha1Key, '', 59, parameters, 1), false)
    assert.equal(verifyTotp(Sha1Key, '9428708', 59, parameters, 1), false)
    assert.equal(verifyTotp(Sha1Key, '9428708a', 59, parameters, 1), false)
  })

  it('ignores whitespace a user pasted around the digits', () => {
    assert.ok(verifyTotp(Sha1Key, ' 9428 7082 ', 59, parameters, 1))
  })
})

describe('the clock assessment', () => {
  it('accepts an offset inside half a period', () => {
    const verdict = assessTotpClock(1000, 1005, 30)
    assert.equal(verdict.offsetSeconds, -5)
    assert.equal(verdict.skewed, false)
    assert.equal(verdict.toleranceSeconds, 15)
  })

  it('reports a skew large enough for codes to be refused', () => {
    assert.equal(assessTotpClock(1100, 1000, 30).skewed, true)
    assert.equal(assessTotpClock(900, 1000, 30).skewed, true)
  })

  it('scales the tolerance with the period', () => {
    assert.equal(totpSkewToleranceSeconds(30), 15)
    assert.equal(totpSkewToleranceSeconds(60), 30)
    assert.equal(totpSkewToleranceSeconds(1), 1)
  })

  it('measures a stepped wall clock against a monotonic one', () => {
    // The wall clock jumped a minute while only a second of real time passed.
    assert.equal(driftBetweenSamples(0, 0, 61_000, 1_000), 60)
    assert.equal(driftBetweenSamples(0, 0, 1_000, 1_000), 0)
  })
})

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    for (let length = 1; length <= 40; length++) {
      const bytes = Uint8Array.from(
        { length },
        (_, index) => (index * 37) % 256
      )
      assert.deepEqual(decodeBase32(encodeBase32(bytes)), bytes)
    }
  })

  it('matches the RFC 4648 encoding of the RFC test key', () => {
    assert.equal(encodeBase32(Sha1Key), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })

  it('accepts the shapes people actually paste', () => {
    const canonical = decodeBase32('JBSWY3DPEHPK3PXP')
    assert.deepEqual(decodeBase32('jbswy3dpehpk3pxp'), canonical)
    assert.deepEqual(decodeBase32('JBSW Y3DP EHPK 3PXP'), canonical)
    assert.deepEqual(decodeBase32('JBSW-Y3DP-EHPK-3PXP'), canonical)
  })

  it('refuses a character outside the alphabet', () => {
    assert.throws(() => decodeBase32('JBSW1'), Base32Error)
    assert.equal(isBase32('JBSW1'), false)
    assert.equal(isBase32('JBSWY3DPEHPK3PXP'), true)
  })

  it('refuses a string that ends mid-byte', () => {
    // Leftover bits are legitimate padding only while they are zero. A
    // non-zero remainder means characters went missing, and a silently
    // truncated secret produces codes nobody accepts.
    // `B` is 00001, so the bit left over past the third whole byte is set.
    assert.throws(() => decodeBase32('JBSWB'), Base32Error)
    // `Y` is 11000, so its leftover bit is zero — that is ordinary padding.
    assert.doesNotThrow(() => decodeBase32('JBSWY==='))
  })

  it('groups for display without changing what it decodes to', () => {
    const grouped = groupBase32('JBSWY3DPEHPK3PXP')
    assert.equal(grouped, 'JBSW Y3DP EHPK 3PXP')
    assert.deepEqual(decodeBase32(grouped), decodeBase32('JBSWY3DPEHPK3PXP'))
  })
})

describe('otpauth:// URIs', () => {
  it('round-trips a descriptor through build and parse', () => {
    const built = buildOtpauthUri({
      account: 'lily@example.com',
      issuer: 'Example Forge',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
    })
    const parsed = parseOtpauthUri(built)
    assert.ok(parsed.ok)
    assert.deepEqual(parsed.descriptor, {
      account: 'lily@example.com',
      issuer: 'Example Forge',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
    })
  })

  it('writes the issuer into both the label and the query', () => {
    const built = buildOtpauthUri({
      account: 'a@b.c',
      issuer: 'Example Forge',
      secret: 'JBSWY3DPEHPK3PXP',
      ...DefaultTotpParameters,
    })
    assert.ok(built.startsWith('otpauth://totp/Example%20Forge:a%40b.c?'))
    assert.ok(built.includes('issuer=Example%20Forge'))
  })

  it('states every parameter rather than relying on a reader guessing', () => {
    const built = buildOtpauthUri({
      account: 'a@b.c',
      issuer: '',
      secret: 'JBSWY3DPEHPK3PXP',
      ...DefaultTotpParameters,
    })
    assert.ok(built.includes('algorithm=SHA1'))
    assert.ok(built.includes('digits=6'))
    assert.ok(built.includes('period=30'))
  })

  it('lets the query issuer win over a disagreeing label prefix', () => {
    const parsed = parseOtpauthUri(
      'otpauth://totp/Stale:a@b.c?secret=JBSWY3DPEHPK3PXP&issuer=Current'
    )
    assert.ok(parsed.ok)
    assert.equal(parsed.descriptor.issuer, 'Current')
    assert.equal(parsed.descriptor.account, 'a@b.c')
  })

  it('falls back to the shipped defaults when a link omits them', () => {
    const parsed = parseOtpauthUri(
      'otpauth://totp/a@b.c?secret=JBSWY3DPEHPK3PXP'
    )
    assert.ok(parsed.ok)
    assert.equal(parsed.descriptor.algorithm, 'SHA1')
    assert.equal(parsed.descriptor.digits, 6)
    assert.equal(parsed.descriptor.period, 30)
    assert.equal(parsed.descriptor.issuer, '')
  })

  it('names why a link cannot be read', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['', 'not-a-uri'],
      ['https://example.com', 'wrong-scheme'],
      ['otpauth://hotp/a?secret=JBSWY3DPEHPK3PXP&counter=1', 'wrong-type'],
      ['otpauth://totp/a', 'missing-secret'],
      ['otpauth://totp/a?secret=1111', 'bad-secret'],
      ['otpauth://totp/?secret=JBSWY3DPEHPK3PXP', 'missing-account'],
    ]
    for (const [uri, reason] of cases) {
      const parsed = parseOtpauthUri(uri)
      assert.equal(parsed.ok, false, `${uri} should not parse`)
      assert.equal(parsed.ok ? '' : parsed.reason, reason, uri)
    }
  })

  it('refuses a URI past the length bound', () => {
    const long = `otpauth://totp/a?secret=JBSWY3DPEHPK3PXP&x=${'y'.repeat(
      5000
    )}`
    assert.equal(parseOtpauthUri(long).ok, false)
  })

  it('produces a descriptor whose secret drives the same code', () => {
    const descriptor = describeGeneratedSecret('a@b.c', 'Example', Sha1Key, {
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
    })
    assert.equal(
      totp(secretBytesOf(descriptor), 59, parametersOf(descriptor)),
      '94287082'
    )
  })
})

describe('parameter clamping', () => {
  it('keeps digits inside RFC 4226 range', () => {
    assert.equal(clampTotpDigits(4), 6)
    assert.equal(clampTotpDigits(7), 7)
    assert.equal(clampTotpDigits(12), 8)
    assert.equal(clampTotpDigits(Number.NaN), 6)
  })

  it('keeps the period inside a range the countdown can render', () => {
    assert.equal(clampTotpPeriod(0), 1)
    assert.equal(clampTotpPeriod(30), 30)
    assert.equal(clampTotpPeriod(999_999), 86_400)
    assert.equal(clampTotpPeriod(Number.NaN), 30)
  })

  it('reads an algorithm name the way issuers actually spell it', () => {
    assert.equal(parseTotpAlgorithm('sha1'), 'SHA1')
    assert.equal(parseTotpAlgorithm('SHA-256'), 'SHA256')
    assert.equal(parseTotpAlgorithm('SHA_512'), 'SHA512')
    assert.equal(parseTotpAlgorithm('md5'), null)
  })
})

describe('secret generation', () => {
  it('produces at least the RFC-recommended 160 bits', () => {
    assert.equal(generateTotpSecret().length, 20)
    assert.ok(generateTotpSecret(10).length >= 10)
  })

  it('does not repeat itself', () => {
    const first = encodeBase32(generateTotpSecret())
    const second = encodeBase32(generateTotpSecret())
    assert.notEqual(first, second)
  })
})
