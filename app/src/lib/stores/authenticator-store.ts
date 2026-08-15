import { isAbsolute, join, relative, resolve, sep } from 'path'

import {
  addEntry,
  assignGroup,
  DefaultAuthenticatorDocument,
  IAuthenticatorDocument,
  IAuthenticatorEntry,
  isAuthenticatorDocument,
  moveEntry,
  normalizeAuthenticatorDocument,
  removeEntries,
  removeGroup,
  renameGroup,
  updateEntry,
} from '../authenticator/entries'
import {
  deleteAuthenticatorSecrets,
  IAuthenticatorVault,
  storeAuthenticatorSecret,
} from '../authenticator/secret-vault'
import { IProfileHistoryPage } from '../../models/profile'
import { IVersionedStoreHistorySource } from '../../ui/version-history'
import { TypedBaseStore } from './base-store'
import { DedicatedSettingStore } from './dedicated-setting-store'
import { TokenStore } from './token-store'

/** Directory (under the owner root) holding the authenticator's own history. */
export const AuthenticatorRepositoryDirectoryName = 'entries'

/** Default owner-root directory name under the app's userData folder. */
export const AuthenticatorDirectoryName = 'authenticator'

/** Guard against a hand-edited document growing without bound. */
export const MaxAuthenticatorFileBytes = 1024 * 1024

/**
 * The registered TOTP factors, in one dedicated Git-backed repository.
 *
 * Every mutation — registering a factor, renaming one, regrouping, reordering,
 * deleting — lands as its own append-only commit, so the list has the same
 * reviewable, restorable timeline every other dedicated setting in this app
 * has. Restores are new commits rather than rewrites, exactly as the shared
 * history contract requires.
 *
 * **Secrets never enter that repository.** They go to the operating-system
 * credential vault keyed by entry id, and this store's commit descriptions name
 * the issuer and account only. A restore that resurrects an entry whose vault
 * key is gone therefore produces a row with no secret — which the surface
 * reports plainly, because the alternative is a row that silently shows nothing
 * and looks broken.
 */
export class AuthenticatorStore extends TypedBaseStore<IAuthenticatorDocument> {
  private readonly store: DedicatedSettingStore<IAuthenticatorDocument>
  private readonly vault: IAuthenticatorVault

  public constructor(options: {
    /**
     * The trust-boundary directory this store owns. The repository is created
     * as `<root>/entries` and validated to stay inside the root.
     */
    readonly root: string
    /** Overridable so tests never touch the machine's real credential store. */
    readonly vault?: IAuthenticatorVault
  }) {
    super()
    const ownershipRootPath = resolve(options.root)
    this.vault = options.vault ?? TokenStore
    this.store = new DedicatedSettingStore<IAuthenticatorDocument>({
      repositoryPath: repositoryPathWithin(ownershipRootPath),
      ownershipRootPath,
      seed: DefaultAuthenticatorDocument,
      validate: isAuthenticatorDocument,
      normalize: normalizeAuthenticatorDocument,
      commitDelayMs: 0,
      maxFileBytes: MaxAuthenticatorFileBytes,
      initializationMessage: 'Initialize authenticator entries',
    })
    this.store.onDidUpdate(state => this.emitUpdate(state.setting))
    this.store.onDidError(error => this.emitError(error))
  }

  public initialize(): Promise<void> {
    return this.store.initialize()
  }

  public getState(): IAuthenticatorDocument {
    return this.store.getState().setting
  }

  public get(): Promise<IAuthenticatorDocument> {
    return this.store.get()
  }

  public getRepositoryPath(): string {
    return this.store.getRepositoryPath()
  }

  /**
   * Register a factor: the secret to the vault first, then the record.
   *
   * That order matters. A record written before its secret leaves a row that
   * cannot produce a code if the vault write then fails, and the user has no
   * way to tell that from a bug. A secret written before its record leaves an
   * orphan the next registration overwrites, which costs nothing.
   */
  public async register(
    entry: IAuthenticatorEntry,
    base32Secret: string
  ): Promise<void> {
    await storeAuthenticatorSecret(entry.id, base32Secret, this.vault)
    const current = await this.store.get()
    await this.store.set(
      addEntry(current, entry),
      `Register ${describe(entry)}`
    )
  }

  /** Rename or re-parameterize an entry. Its secret and id are untouched. */
  public async edit(
    id: string,
    changes: Partial<Omit<IAuthenticatorEntry, 'id' | 'addedAt'>>
  ): Promise<void> {
    const current = await this.store.get()
    const existing = current.entries.find(entry => entry.id === id)
    if (existing === undefined) {
      return
    }
    await this.store.set(
      updateEntry(current, id, changes),
      `Edit ${describe(existing)}`
    )
  }

  /**
   * Delete entries and forget their secrets.
   *
   * Returns the ids whose vault key could not be removed. The record goes
   * either way — a row nobody can delete because the keychain is locked is
   * worse than an orphaned key — but the caller is told, so the surface can
   * say so instead of reporting a clean sweep.
   */
  public async delete(
    ids: ReadonlyArray<string>
  ): Promise<ReadonlyArray<string>> {
    const current = await this.store.get()
    const removed = current.entries.filter(entry => ids.includes(entry.id))
    if (removed.length === 0) {
      return []
    }
    const failed = await deleteAuthenticatorSecrets(ids, this.vault)
    await this.store.set(
      removeEntries(current, ids),
      removed.length === 1
        ? `Delete ${describe(removed[0])}`
        : `Delete ${removed.length} authenticator entries`
    )
    return failed
  }

  /** Move an entry to a new position in the list. */
  public async reorder(id: string, toIndex: number): Promise<void> {
    const current = await this.store.get()
    const entry = current.entries.find(candidate => candidate.id === id)
    if (entry === undefined) {
      return
    }
    await this.store.set(
      moveEntry(current, id, toIndex),
      `Reorder ${describe(entry)}`
    )
  }

  /** File entries under a group, creating it when it is new. */
  public async group(ids: ReadonlyArray<string>, group: string): Promise<void> {
    const current = await this.store.get()
    await this.store.set(
      assignGroup(current, ids, group),
      group.trim().length === 0
        ? `Ungroup ${ids.length} authenticator entries`
        : `Move ${ids.length} authenticator entries into ${group.trim()}`
    )
  }

  public async renameGroup(from: string, to: string): Promise<void> {
    const current = await this.store.get()
    await this.store.set(
      renameGroup(current, from, to),
      `Rename authenticator group ${from} to ${to.trim()}`
    )
  }

  public async removeGroup(group: string): Promise<void> {
    const current = await this.store.get()
    await this.store.set(
      removeGroup(current, group),
      `Remove authenticator group ${group}`
    )
  }

  public flush(): Promise<void> {
    return this.store.flush()
  }

  public getHistory(
    skip?: number,
    limit?: number
  ): Promise<IProfileHistoryPage> {
    return this.store.getHistory(skip, limit)
  }

  public getHistorySource(): IVersionedStoreHistorySource {
    return {
      getHistory: (skip, limit) => this.store.getHistory(skip, limit),
      getFiles: sha => this.store.getFiles(sha),
      getDiff: (sha, file) => this.store.getDiff(sha, file),
      undoLastChange: () => this.store.undoLastChange(),
      redoLastChange: () => this.store.redoLastChange(),
      restoreTo: sha => this.store.restoreTo(sha),
    }
  }
}

/**
 * How a mutation is named in the history.
 *
 * Issuer and account only. They are already in the settings file this history
 * versions, so naming them adds nothing an attacker did not have; the secret,
 * the digits produced, and any code entered during pairing are never here.
 */
function describe(entry: IAuthenticatorEntry): string {
  return entry.issuer.length === 0
    ? entry.account
    : `${entry.issuer} (${entry.account})`
}

function repositoryPathWithin(root: string): string {
  const candidate = resolve(join(root, AuthenticatorRepositoryDirectoryName))
  const child = relative(root, candidate)
  if (
    child === '' ||
    child === '..' ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  ) {
    throw new Error('Authenticator repository path escaped its owner root')
  }
  return candidate
}
