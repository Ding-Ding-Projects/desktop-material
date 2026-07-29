import { createHash } from 'crypto'
import * as Path from 'path'

import type { Repository } from '../../models/repository'
import type { CheapLfsPayloadPasswordPurpose } from '../../models/popup'
import { invoke } from '../ipc-renderer'
import { TokenStore } from '../stores/token-store'
import {
  CheapLfsPayloadCredentialCleanupChannel,
  CheapLfsPayloadCredentialCleanupResult,
  CheapLfsPayloadPasswordService,
  ICheapLfsPayloadCredentialCleanupRequest,
  LegacyCheapLfsPayloadPasswordService,
} from './payload-encryption-credential-cleanup'

export {
  CheapLfsPayloadPasswordService,
  LegacyCheapLfsPayloadPasswordService,
} from './payload-encryption-credential-cleanup'

type CheapLfsCredentialRepository = Pick<
  Repository,
  'id' | 'path' | 'gitHubRepository'
>

export function legacyCheapLfsPayloadPasswordAccount(
  repository: Pick<Repository, 'id'>
): string {
  return `repository-${repository.id}`
}

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
  | {
      readonly kind: 'saved'
      readonly password: Buffer
      /** A usable canonical value exists; stale aliases will retry at startup. */
      readonly cleanupPending: boolean
    }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unavailable' }

export type CheapLfsSavedPasswordForget = 'deleted' | 'missing' | 'unavailable'

export type CheapLfsLegacyPasswordCleanup =
  CheapLfsPayloadCredentialCleanupResult

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
  repository: CheapLfsCredentialRepository,
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
 * Return an opaque, path-stable vault account. A repository database id, remote
 * association, or remote rename can change without stranding the credential.
 * The raw path never becomes a Credential Manager label.
 */
export function cheapLfsPayloadPasswordAccount(
  repository: Pick<Repository, 'path'>
): string {
  const canonicalPath = Path.win32
    .normalize(Path.resolve(repository.path))
    .toLocaleLowerCase('en-US')
  return createHash('sha256')
    .update('desktop-material/cheap-lfs/password/v2\0', 'utf8')
    .update(canonicalPath, 'utf8')
    .digest('hex')
}

/** Account written by the interim path-plus-remote durable-key build. */
export function priorRemoteScopedCheapLfsPayloadPasswordAccount(
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

function priorStableAccounts(
  repository: CheapLfsCredentialRepository
): ReadonlyArray<string> {
  const aliases = new Set([
    priorRemoteScopedCheapLfsPayloadPasswordAccount(repository),
    priorRemoteScopedCheapLfsPayloadPasswordAccount({
      path: repository.path,
      gitHubRepository: null,
    }),
  ])
  aliases.delete(cheapLfsPayloadPasswordAccount(repository))
  return [...aliases]
}

function obsoleteCredentialEntries(
  repository: CheapLfsCredentialRepository
): ReadonlyArray<readonly [string, string]> {
  return [
    ...priorStableAccounts(repository).map(
      account => [CheapLfsPayloadPasswordService, account] as const
    ),
    [
      LegacyCheapLfsPayloadPasswordService,
      legacyCheapLfsPayloadPasswordAccount(repository),
    ],
  ]
}

export type CheapLfsPayloadCredentialCleanupClient = (
  request: ICheapLfsPayloadCredentialCleanupRequest
) => Promise<CheapLfsPayloadCredentialCleanupResult>

const cleanupCredentialsInMainProcess: CheapLfsPayloadCredentialCleanupClient =
  request => invoke(CheapLfsPayloadCredentialCleanupChannel, request)

/**
 * Ask the main process to migrate current aliases and delete orphaned entries
 * from both app-owned services. Only account labels cross IPC in the request;
 * the response contains counts, never credential values.
 */
export async function cleanupLegacyCheapLfsPayloadPasswords(
  repositories: ReadonlyArray<CheapLfsCredentialRepository>,
  cleanup: CheapLfsPayloadCredentialCleanupClient = cleanupCredentialsInMainProcess
): Promise<CheapLfsLegacyPasswordCleanup> {
  return cleanup({
    currentRepositories: repositories.map(repository => ({
      canonicalAccount: cheapLfsPayloadPasswordAccount(repository),
      legacyNumericAccount: legacyCheapLfsPayloadPasswordAccount(repository),
      priorStableAliases: priorStableAccounts(repository),
    })),
  })
}

/** Read a saved password without turning a locked/broken vault into plaintext. */
export async function readSavedCheapLfsPayloadPassword(
  repository: CheapLfsCredentialRepository,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<CheapLfsSavedPasswordRead> {
  try {
    const stableAccount = cheapLfsPayloadPasswordAccount(repository)
    const value = await vault.getItem(
      CheapLfsPayloadPasswordService,
      stableAccount
    )
    if (value !== null && value.length > 0) {
      let cleanupPending = false
      for (const [service, account] of obsoleteCredentialEntries(repository)) {
        try {
          await vault.deleteItem(service, account)
        } catch {
          cleanupPending = true
        }
      }
      return {
        kind: 'saved',
        password: Buffer.from(value, 'utf8'),
        cleanupPending,
      }
    }

    for (const [service, account] of obsoleteCredentialEntries(repository)) {
      const legacy = await vault.getItem(service, account)
      if (legacy === null || legacy.length === 0) {
        continue
      }

      // A successful canonical write makes the password usable immediately.
      // Alias deletion is best-effort and retried by the main-process startup
      // sweep, so a cleanup-only failure is never misreported as save failure.
      await vault.setItem(CheapLfsPayloadPasswordService, stableAccount, legacy)
      let cleanupPending = false
      for (const [
        obsoleteService,
        obsoleteAccount,
      ] of obsoleteCredentialEntries(repository)) {
        try {
          await vault.deleteItem(obsoleteService, obsoleteAccount)
        } catch {
          cleanupPending = true
        }
      }
      return {
        kind: 'saved',
        password: Buffer.from(legacy, 'utf8'),
        cleanupPending,
      }
    }

    return { kind: 'missing' }
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
  repository: CheapLfsCredentialRepository,
  password: Uint8Array,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<boolean> {
  try {
    await vault.setItem(
      CheapLfsPayloadPasswordService,
      cheapLfsPayloadPasswordAccount(repository),
      Buffer.from(password).toString('utf8')
    )
  } catch {
    return false
  }
  for (const [service, account] of obsoleteCredentialEntries(repository)) {
    try {
      await vault.deleteItem(service, account)
    } catch {
      // The canonical save succeeded. Startup cleanup retries stale aliases.
    }
  }
  return true
}

/** Remove the exact repository-scoped vault entry, or report vault failure. */
export async function forgetSavedCheapLfsPayloadPassword(
  repository: CheapLfsCredentialRepository,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<CheapLfsSavedPasswordForget> {
  const entries: ReadonlyArray<readonly [string, string]> = [
    [
      CheapLfsPayloadPasswordService,
      cheapLfsPayloadPasswordAccount(repository),
    ],
    ...obsoleteCredentialEntries(repository),
  ]
  let deleted = false
  let unavailable = false
  for (const [service, account] of entries) {
    try {
      deleted = (await vault.deleteItem(service, account)) || deleted
    } catch {
      unavailable = true
    }
  }
  return unavailable ? 'unavailable' : deleted ? 'deleted' : 'missing'
}

/** Check for the settings surface without retaining the credential bytes. */
export async function hasSavedCheapLfsPayloadPassword(
  repository: CheapLfsCredentialRepository,
  vault: ICheapLfsCredentialVault = TokenStore
): Promise<'saved' | 'missing' | 'unavailable'> {
  const result = await readSavedCheapLfsPayloadPassword(repository, vault)
  if (result.kind === 'saved') {
    result.password.fill(0)
    return 'saved'
  }
  return result.kind
}
