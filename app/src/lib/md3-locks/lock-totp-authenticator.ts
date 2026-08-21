import { decodeBase32 } from '../authenticator/base32'
import { entryParameters, IAuthenticatorEntry } from '../authenticator/entries'
import { readAuthenticatorSecret } from '../authenticator/secret-vault'
import { verifyTotp } from '../authenticator/totp'
import { IMd3TotpVerifier, setMd3TotpVerifier } from './lock-credentials'

/**
 * The OTP factor of a surface lock, answered by the app's own authenticator.
 *
 * There is exactly one RFC 6238 implementation in this app —
 * `lib/authenticator/totp.ts` — and this adapter consumes it rather than
 * shipping a second clock. A lock's `otpAccountKey` is an authenticator entry
 * id, which is also the credential-vault account key its secret is stored
 * under, so the whole adapter is: find the entry, read its secret from the
 * vault, and hand both to the shared verifier.
 *
 * The secret never crosses back out of this module, and nothing here reports
 * anything about it — not whether it looks right, not how long it is. The only
 * answer that leaves is whether the typed code matched.
 *
 * This module statically imports the credential vault, which loads a native
 * dependency, so it is deliberately kept out of the feature's barrel: every
 * other module in `md3-locks` can be exercised in a plain Node test with a fake
 * vault, and this one is installed by the running app.
 */

export interface IAuthenticatorLockVerifierOptions {
  /**
   * Resolve an authenticator entry by its id.
   *
   * The host owns the authenticator's document, so it supplies the lookup
   * rather than this module reaching for a store of its own — which would be a
   * second reader of the same list, free to disagree with the first.
   */
  readonly findEntry: (entryId: string) => IAuthenticatorEntry | null

  /** Injected by tests. Defaults to the system clock, in seconds. */
  readonly nowSeconds?: () => number

  /**
   * Receive public entry metadata when another authenticator store instance
   * changes it. Secrets are never part of this callback.
   */
  readonly onEntriesChanged?: (
    entries: ReadonlyArray<IAuthenticatorEntry>
  ) => void
}

let entriesChanged:
  | ((entries: ReadonlyArray<IAuthenticatorEntry>) => void)
  | null = null

/**
 * Publish the authenticator document's public metadata to the installed lock
 * adapter. The settings surface and startup each own a store instance, so the
 * explicit notification keeps their entry views joined without adding a
 * second secret store or reading the credential vault here.
 */
export function notifyAuthenticatorLockEntriesChanged(
  entries: ReadonlyArray<IAuthenticatorEntry>
): void {
  entriesChanged?.(
    entries.map(entry => ({
      id: entry.id,
      issuer: entry.issuer,
      account: entry.account,
      algorithm: entry.algorithm,
      digits: entry.digits,
      period: entry.period,
      group: entry.group,
      addedAt: entry.addedAt,
    }))
  )
}

/** Build the verifier. Registered with {@link installAuthenticatorLockFactor}. */
export function createAuthenticatorLockVerifier(
  options: IAuthenticatorLockVerifierOptions
): IMd3TotpVerifier {
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000))

  return {
    hasEntry: async entryId => {
      if (options.findEntry(entryId) === null) {
        return false
      }
      const secret = await readAuthenticatorSecret(entryId)
      return secret !== null && secret.length > 0
    },

    verify: async (entryId, code) => {
      const entry = options.findEntry(entryId)
      if (entry === null) {
        return false
      }
      const stored = await readAuthenticatorSecret(entryId)
      if (stored === null || stored.length === 0) {
        return false
      }
      let secret: Uint8Array
      try {
        secret = decodeBase32(stored)
      } catch {
        // A secret the vault holds but the app cannot decode is a broken entry,
        // not a wrong code. It fails closed and says nothing about the value.
        return false
      }
      return verifyTotp(secret, code, nowSeconds(), entryParameters(entry))
    },
  }
}

/** Install the authenticator as the OTP factor. Call once, at start-up. */
export function installAuthenticatorLockFactor(
  options: IAuthenticatorLockVerifierOptions
): void {
  entriesChanged = options.onEntriesChanged ?? null
  setMd3TotpVerifier(createAuthenticatorLockVerifier(options))
}
