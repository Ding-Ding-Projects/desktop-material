import { createHash } from 'crypto'
import * as Path from 'path'

import type { Repository } from '../../models/repository'
import type { CheapLfsPayloadPasswordPurpose } from '../../models/popup'
import { TokenStore } from '../stores/token-store'

const CheapLfsPayloadPasswordService = `${
  __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'
} - Cheap LFS payload password`

/**
 * The narrow credential-vault surface used here. Keeping this injectable makes
 * it possible to prove that password saving never reaches preferences, the
 * profile Git store, localStorage, or a repository file.
 */
export interface ICheapLfsCredentialVault {
  getItem(service: string, account: string): Promise<string | null>
  setItem(service: string, account: string, value: string): Promise<unknown>
  deleteItem(service: string, account: string): Promise<boolean>
}

export type CheapLfsSavedPasswordRead =
  | { readonly kind: 'saved'; readonly password: Buffer }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unavailable' }

export type CheapLfsSavedPasswordForget = 'deleted' | 'missing' | 'unavailable'

export interface ICheapLfsPasswordPromptResult {
  /** The caller owns this buffer and must overwrite it after the operation. */
  readonly password: Buffer
  readonly rememberPassword: boolean
}

export interface ICheapLfsOperationPassword {
  /** The caller owns this buffer and must overwrite it after the operation. */
  readonly password: Buffer
  /** A vault credential can be stale; a prompted credential is one-shot. */
  readonly source: 'vault' | 'prompt'
  /**
   * For decrypt prompts, persistence is deferred until authentication succeeds.
   * Vault credentials and one-shot prompt results keep this false.
   */
  readonly rememberPassword: boolean
}

export type CheapLfsPayloadPasswordPrompt = (
  purpose: Extract<CheapLfsPayloadPasswordPurpose, 'encrypt' | 'decrypt'>
) => Promise<ICheapLfsPasswordPromptResult | null>

/**
 * Resolve one operation's password.
 *
 * A password whose Save box was left off is returned only to this call. There
 * is deliberately no process/session cache: the caller zeroes the returned
 * buffer in `finally`, and the next operation prompts again. A deliberately
 * saved Windows-vault credential may be reused.
 */
export async function acquireCheapLfsOperationPassword(
  repository: Pick<Repository, 'path' | 'gitHubRepository'>,
  purpose: Extract<CheapLfsPayloadPasswordPurpose, 'encrypt' | 'decrypt'>,
  prompt: CheapLfsPayloadPasswordPrompt,
  onVaultSaveUnavailable: () => void = () => undefined,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<ICheapLfsOperationPassword | null> {
  const saved = await readSavedCheapLfsPayloadPassword(repository, vault)
  if (saved.kind === 'saved') {
    return {
      password: saved.password,
      source: 'vault',
      rememberPassword: false,
    }
  }

  const entered = await prompt(purpose)
  if (entered === null) {
    return null
  }

  if (
    purpose === 'encrypt' &&
    entered.rememberPassword &&
    !(await saveCheapLfsPayloadPassword(repository, entered.password, vault))
  ) {
    onVaultSaveUnavailable()
  }
  return {
    password: entered.password,
    source: 'prompt',
    rememberPassword: purpose === 'decrypt' && entered.rememberPassword,
  }
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
  try {
    return (await vault.deleteItem(CheapLfsPayloadPasswordService, account))
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
