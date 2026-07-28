import { createHash } from 'crypto'
import * as Path from 'path'

import type { Repository } from '../../models/repository'
import { TokenStore } from '../stores/token-store'

const CheapLfsPayloadPasswordService = `${
  __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'
} - Cheap LFS payload password`

/**
 * Passwords the user deliberately chose not to persist. They live only for
 * this app process, are copied on read, and are zeroed when replaced/forgotten.
 */
const sessionPasswords = new Map<string, Buffer>()

/**
 * The narrow credential-vault surface used here. Keeping this injectable makes
 * it possible to prove that password saving never reaches preferences, the
 * profile Git store, localStorage, or a repository file.
 */
export interface ICheapLfsCredentialVault {
  getItem(service: string, account: string): Promise<string | null>
  setItem(
    service: string,
    account: string,
    value: string
  ): Promise<unknown>
  deleteItem(service: string, account: string): Promise<boolean>
}

export type CheapLfsSavedPasswordRead =
  | { readonly kind: 'saved'; readonly password: Buffer }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unavailable' }

export type CheapLfsSavedPasswordForget =
  | 'deleted'
  | 'missing'
  | 'unavailable'

/** Keep a one-session password without writing it to disk or the OS vault. */
export function setSessionCheapLfsPayloadPassword(
  repository: Pick<Repository, 'path' | 'gitHubRepository'>,
  password: Uint8Array
): void {
  const account = cheapLfsPayloadPasswordAccount(repository)
  sessionPasswords.get(account)?.fill(0)
  sessionPasswords.set(account, Buffer.from(password))
}

/** Read the session password first, then fall back to the OS vault. */
export async function readAvailableCheapLfsPayloadPassword(
  repository: Pick<Repository, 'path' | 'gitHubRepository'>,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<CheapLfsSavedPasswordRead> {
  const session = sessionPasswords.get(
    cheapLfsPayloadPasswordAccount(repository)
  )
  return session === undefined
    ? await readSavedCheapLfsPayloadPassword(repository, vault)
    : { kind: 'saved', password: Buffer.from(session) }
}

/**
 * Return an opaque, per-repository vault account. The raw path and remote name
 * never become Credential Manager labels, while a checkout moved or rebound to
 * another remote safely prompts instead of silently reusing the old password.
 */
export function cheapLfsPayloadPasswordAccount(
  repository: Pick<Repository, 'path' | 'gitHubRepository'>
): string {
  const canonicalPath = Path.win32
    .normalize(Path.resolve(repository.path))
    .toLocaleLowerCase('en-US')
  const remoteIdentity =
    repository.gitHubRepository?.fullName.toLocaleLowerCase('en-US') ?? 'local'
  return createHash('sha256')
    .update('desktop-material/cheap-lfs/password/v1\0', 'utf8')
    .update(canonicalPath, 'utf8')
    .update('\0', 'utf8')
    .update(remoteIdentity, 'utf8')
    .digest('hex')
}

/** Read a saved password without turning a locked/broken vault into plaintext. */
export async function readSavedCheapLfsPayloadPassword(
  repository: Pick<Repository, 'path' | 'gitHubRepository'>,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<CheapLfsSavedPasswordRead> {
  try {
    const value = await vault.getItem(
      CheapLfsPayloadPasswordService,
      cheapLfsPayloadPasswordAccount(repository)
    )
    return value === null
      ? { kind: 'missing' }
      : { kind: 'saved', password: Buffer.from(value, 'utf8') }
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * Save to the operating-system vault only. False means the vault refused; the
 * caller may continue with the in-memory password for this operation, but must
 * never fall back to a file or settings store.
 */
export async function saveCheapLfsPayloadPassword(
  repository: Pick<Repository, 'path' | 'gitHubRepository'>,
  password: Uint8Array,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<boolean> {
  try {
    await vault.setItem(
      CheapLfsPayloadPasswordService,
      cheapLfsPayloadPasswordAccount(repository),
      Buffer.from(password).toString('utf8')
    )
    return true
  } catch {
    return false
  }
}

/** Remove the exact repository-scoped vault entry, or report vault failure. */
export async function forgetSavedCheapLfsPayloadPassword(
  repository: Pick<Repository, 'path' | 'gitHubRepository'>,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<CheapLfsSavedPasswordForget> {
  const account = cheapLfsPayloadPasswordAccount(repository)
  sessionPasswords.get(account)?.fill(0)
  sessionPasswords.delete(account)
  try {
    return (await vault.deleteItem(
      CheapLfsPayloadPasswordService,
      account
    ))
      ? 'deleted'
      : 'missing'
  } catch {
    return 'unavailable'
  }
}

/** Check for the settings surface without retaining the credential bytes. */
export async function hasSavedCheapLfsPayloadPassword(
  repository: Pick<Repository, 'path' | 'gitHubRepository'>,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<'saved' | 'missing' | 'unavailable'> {
  const result = await readSavedCheapLfsPayloadPassword(repository, vault)
  if (result.kind === 'saved') {
    result.password.fill(0)
    return 'saved'
  }
  return result.kind
}
