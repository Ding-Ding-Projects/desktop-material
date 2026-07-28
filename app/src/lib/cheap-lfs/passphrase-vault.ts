/**
 * Optionally remembering a Cheap LFS encryption passphrase.
 *
 * ## There is exactly one legal destination
 *
 * The OS credential vault, through the existing {@link TokenStore} (keytar —
 * Windows Credential Manager on this platform), the same place GitHub tokens
 * already live. Nothing in this module writes anywhere else, and that is not a
 * stylistic preference.
 *
 * ## Why the settings path is forbidden, specifically
 *
 * Desktop Material's profile settings are committed into an **app-owned Git
 * repository with retained history and undo** (`app/src/lib/profiles/
 * profile-git.ts`, driven by the allowlist in `profileSettingsRegistry`). A
 * value written through that path is captured into a commit. Deleting the value
 * later writes *another* commit; the earlier one still contains it, and
 * `git log -p` still prints it. A passphrase stored there would therefore
 * **survive its own deletion**, for the life of the profile repository, and the
 * user who clicked "forget" would be told the truth about the current state and
 * a lie about the durable one.
 *
 * So this module never imports `profileSettingsRegistry`, `profile-git`, or
 * `profile-store`, never touches `localStorage`, and never writes a settings
 * file. The per-repository *flag* saying "this repository encrypts" is an
 * ordinary boolean and lives with the other repository preferences; the secret
 * itself only ever reaches the credential vault.
 *
 * ## Failing closed
 *
 * keytar is not always there. It throws on some Linux configurations, a locked
 * keychain refuses reads, and a vault can simply be missing. Every one of those
 * resolves to **"we do not have a saved passphrase, so ask the user"**. There
 * is deliberately no fallback store, no cache file, and no in-memory carry-over
 * across operations: the failure mode of a credential vault must never be a
 * plaintext copy of the thing it refused to protect.
 *
 * ## What saving costs the user
 *
 * A saved passphrase means anyone who can use this machine account can decrypt
 * these payloads. That is a legitimate trade — retyping a long passphrase per
 * file is how people end up choosing short ones — but it is a trade the user
 * has to be shown *before* they opt in, which is why the consent copy is a
 * required part of the surface that offers it.
 */
import { TokenStore } from '../stores/token-store'

/**
 * The credential-vault service name. Distinct from the account/token service so
 * a passphrase can never be read back by anything looking for a GitHub token.
 */
export const CheapLfsPassphraseVaultService =
  'desktop-material/cheap-lfs-encryption'

/** The seam these operations go through, so tests can supply a hostile vault. */
export interface ICheapLfsPassphraseVaultStore {
  setItem(key: string, login: string, value: string): Promise<void>
  getItem(key: string, login: string): Promise<string | null>
  deleteItem(key: string, login: string): Promise<boolean>
}

/**
 * Scope is per repository, never one global passphrase silently reused
 * everywhere. Removing and re-adding a repository produces a new id and
 * therefore no saved passphrase, which fails closed to prompting.
 */
export function cheapLfsPassphraseVaultAccount(repositoryId: number): string {
  return `repository-${repositoryId}`
}

export type CheapLfsPassphraseSaveOutcome =
  /** The credential vault accepted it. */
  | 'saved'
  /**
   * The vault was missing, locked, or refused. Nothing was written anywhere —
   * the caller keeps prompting for the passphrase each time.
   */
  | 'vault-unavailable'

/**
 * Persist a passphrase for one repository.
 *
 * Returns rather than throws, because a vault refusal is a downgrade in
 * convenience, not a failure of the encryption the user asked for. The
 * passphrase never appears in the return value, and no diagnostic here ever
 * receives it.
 */
export async function saveCheapLfsPassphrase(
  repositoryId: number,
  passphrase: string,
  store: ICheapLfsPassphraseVaultStore = TokenStore
): Promise<CheapLfsPassphraseSaveOutcome> {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    return 'vault-unavailable'
  }
  try {
    await store.setItem(
      CheapLfsPassphraseVaultService,
      cheapLfsPassphraseVaultAccount(repositoryId),
      passphrase
    )
    return 'saved'
  } catch {
    // Deliberately swallowed without inspection. The thrown value can carry the
    // arguments it was called with on some keytar builds, so it is neither
    // logged nor re-thrown, and there is no fallback destination.
    return 'vault-unavailable'
  }
}

/**
 * Read a saved passphrase, or `null` when there is none and when the vault
 * cannot be consulted. Both answers lead the caller to the same place: prompt.
 */
export async function loadCheapLfsPassphrase(
  repositoryId: number,
  store: ICheapLfsPassphraseVaultStore = TokenStore
): Promise<string | null> {
  try {
    const stored = await store.getItem(
      CheapLfsPassphraseVaultService,
      cheapLfsPassphraseVaultAccount(repositoryId)
    )
    return typeof stored === 'string' && stored.length > 0 ? stored : null
  } catch {
    return null
  }
}

/**
 * Delete the vault entry. `true` means the entry is gone; `false` means the
 * vault could not be reached, and the caller must say so rather than claim a
 * deletion it cannot prove.
 */
export async function forgetCheapLfsPassphrase(
  repositoryId: number,
  store: ICheapLfsPassphraseVaultStore = TokenStore
): Promise<boolean> {
  try {
    await store.deleteItem(
      CheapLfsPassphraseVaultService,
      cheapLfsPassphraseVaultAccount(repositoryId)
    )
    return true
  } catch {
    return false
  }
}

/**
 * Passphrases unlocked for this app session only.
 *
 * A commit-time pin runs unattended in the background, so it cannot open a
 * modal and wait. Either the passphrase is in the credential vault, or the user
 * unlocked the repository in this session, or the pin **refuses with a reason**
 * — it never falls back to uploading in the clear.
 *
 * This map is memory only: no file, no `localStorage`, no settings record, and
 * nothing that outlives the process. Quitting the app locks every repository
 * again, which is the intended behaviour for someone who deliberately did not
 * save their passphrase.
 */
const sessionPassphrases = new Map<number, string>()

/** Hold a passphrase for this app session only. */
export function unlockCheapLfsPassphraseForSession(
  repositoryId: number,
  passphrase: string
): void {
  if (typeof passphrase === 'string' && passphrase.length > 0) {
    sessionPassphrases.set(repositoryId, passphrase)
  }
}

/** Forget a session passphrase. Never touches the credential vault. */
export function lockCheapLfsPassphraseSession(repositoryId: number): void {
  sessionPassphrases.delete(repositoryId)
}

/** The session passphrase for this repository, if it was unlocked. */
export function cheapLfsSessionPassphrase(repositoryId: number): string | null {
  return sessionPassphrases.get(repositoryId) ?? null
}

/**
 * Resolve the passphrase for an operation.
 *
 * A saved entry is used when the repository opted into saving; otherwise, and
 * on any vault trouble at all, `prompt` runs. `prompt` returning `null` is the
 * user declining, which cancels the operation — it is never treated as an empty
 * passphrase.
 */
export async function resolveCheapLfsPassphrase(
  repositoryId: number,
  savingEnabled: boolean,
  prompt: () => Promise<string | null>,
  store: ICheapLfsPassphraseVaultStore = TokenStore
): Promise<string | null> {
  if (savingEnabled) {
    const saved = await loadCheapLfsPassphrase(repositoryId, store)
    if (saved !== null) {
      return saved
    }
  }
  const unlocked = cheapLfsSessionPassphrase(repositoryId)
  if (unlocked !== null) {
    return unlocked
  }
  return await prompt()
}
