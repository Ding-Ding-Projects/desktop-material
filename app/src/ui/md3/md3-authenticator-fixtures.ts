import { decodeBase32 } from '../../lib/authenticator/base32'
import { IMd3AuthenticatorFactor } from './md3-authenticator-view'

/**
 * Fixture factors for the Authenticator destination.
 *
 * The secrets below are the RFC 4226 and RFC 6238 test keys, published in the
 * RFCs themselves and known to every implementation on earth. They are used
 * here precisely because they are not secret: a fixture carrying a plausible
 * random-looking key invites somebody to assume the file is sensitive, and
 * invites somebody else to paste a real one in beside it.
 *
 * `factor-missing-secret` deliberately has no entry in
 * {@link md3AuthenticatorFixtureSecrets}. That is what a restored record whose
 * credential-vault key is gone actually looks like, and the row that renders it
 * is the one nobody remembers to check.
 */

/** ASCII `12345678901234567890`, the RFC 4226 §D test key, in base32. */
const Sha1TestKey = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

/** ASCII `12345678901234567890123456789012`, the RFC 6238 SHA-256 test key. */
const Sha256TestKey =
  'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

export const md3AuthenticatorFixtureFactors: ReadonlyArray<IMd3AuthenticatorFactor> =
  [
    {
      id: 'factor-forge',
      issuer: 'Example Forge',
      account: 'lily@example.com',
      group: 'Work',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      addedAt: '2026-02-11T09:14:00.000Z',
    },
    {
      id: 'factor-registry',
      issuer: 'Example Registry',
      account: 'publisher',
      group: 'Work',
      algorithm: 'SHA256',
      digits: 8,
      period: 30,
      addedAt: '2026-03-02T17:41:00.000Z',
    },
    {
      id: 'factor-mail',
      issuer: 'Example Mail',
      account: 'lily@example.net',
      group: '',
      algorithm: 'SHA1',
      digits: 6,
      period: 60,
      addedAt: '2026-04-19T08:02:00.000Z',
    },
    {
      id: 'factor-missing-secret',
      issuer: 'Example Bank',
      account: 'account-4417',
      group: 'Money',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      addedAt: '2026-05-06T12:30:00.000Z',
    },
  ]

/** Group names in the order the fixture surface renders their chips. */
export const md3AuthenticatorFixtureGroups: ReadonlyArray<string> = [
  'Work',
  'Money',
]

/** The decoded secrets a host would have read out of the credential vault. */
export const md3AuthenticatorFixtureSecrets: ReadonlyMap<string, Uint8Array> =
  new Map<string, Uint8Array>([
    ['factor-forge', decodeBase32(Sha1TestKey)],
    ['factor-registry', decodeBase32(Sha256TestKey)],
    ['factor-mail', decodeBase32(Sha1TestKey)],
  ])
