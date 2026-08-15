import { TokenStore } from '../stores/token-store'

/**
 * Where a TOTP shared key actually lives: the operating-system credential
 * vault, under a stable service name and the entry's own id.
 *
 * Nothing else in this feature is allowed to hold one. The settings document
 * carries the issuer, the account and the parameters; exports carry the same
 * and say plainly that they omit the secret; the local Git history records
 * that a factor was added and never what was added. That leaves exactly one
 * copy, in the one store the platform encrypts on the app's behalf.
 *
 * There is no read-back-for-display path here and there never will be. The
 * secret is shown once, during registration, from the value the process just
 * generated — after that neither the app nor anyone working on it may display,
 * hint at, or characterise its value, length or composition.
 */

/** The credential-vault service name. Dev builds keep their own drawer. */
export const AuthenticatorVaultService = `${
  __DEV__ ? 'Desktop Material Dev' : 'Desktop Material'
} - Authenticator`

/** The subset of the token store this module needs, so tests can supply one. */
export interface IAuthenticatorVault {
  readonly getItem: (key: string, login: string) => Promise<string | null>
  readonly setItem: (key: string, login: string, value: string) => Promise<void>
  readonly deleteItem: (key: string, login: string) => Promise<boolean>
}

/** Store a base32 secret against an entry id. */
export function storeAuthenticatorSecret(
  entryId: string,
  base32Secret: string,
  vault: IAuthenticatorVault = TokenStore
): Promise<void> {
  return vault.setItem(AuthenticatorVaultService, entryId, base32Secret)
}

/**
 * Read a secret back for code generation.
 *
 * Callers hand the result straight to the TOTP function. It is never returned
 * to a renderer surface, written to a log, or included in a message.
 */
export function readAuthenticatorSecret(
  entryId: string,
  vault: IAuthenticatorVault = TokenStore
): Promise<string | null> {
  return vault.getItem(AuthenticatorVaultService, entryId)
}

/** Forget a secret. Called whenever its entry is deleted. */
export function deleteAuthenticatorSecret(
  entryId: string,
  vault: IAuthenticatorVault = TokenStore
): Promise<boolean> {
  return vault.deleteItem(AuthenticatorVaultService, entryId)
}

/** Whether the vault still holds a secret for this entry. */
export async function hasAuthenticatorSecret(
  entryId: string,
  vault: IAuthenticatorVault = TokenStore
): Promise<boolean> {
  const stored = await readAuthenticatorSecret(entryId, vault)
  return stored !== null && stored.length > 0
}

/**
 * Delete several secrets, reporting which ids the vault refused.
 *
 * A bulk delete that claims success while the vault kept two of the keys is
 * the worst possible outcome here — the rows are gone from the list and the
 * secrets are not gone from the machine — so the failures come back by name
 * rather than being folded into a boolean.
 */
export async function deleteAuthenticatorSecrets(
  entryIds: ReadonlyArray<string>,
  vault: IAuthenticatorVault = TokenStore
): Promise<ReadonlyArray<string>> {
  const failed: Array<string> = []
  for (const id of entryIds) {
    try {
      await deleteAuthenticatorSecret(id, vault)
    } catch {
      failed.push(id)
    }
  }
  return failed
}
