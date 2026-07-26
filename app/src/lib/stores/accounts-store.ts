import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount, getKeyForEndpoint } from '../auth'
import {
  Account,
  AccountProvider,
  getAccountKey,
  isDotComAccount,
} from '../../models/account'
import { fetchUser, EmailVisibility, getEnterpriseAPIURL } from '../api'
import { fatalError } from '../fatal-error'
import { DefaultAppDisplayName } from '../../models/app-identity'
import { TypedBaseStore } from './base-store'
import { isGHE } from '../endpoint-capabilities'
import { compare, compareDescending } from '../compare'
import { t } from '../i18n'

// Ensure that GitHub.com accounts appear first followed by Enterprise
// accounts, sorted by the order in which they were added.
const sortAccounts = (accounts: ReadonlyArray<Account>) =>
  accounts
    .map((account, ix) => [account, ix] as const)
    .sort(
      ([xAccount, xIx], [yAccount, yIx]) =>
        compareDescending(
          isDotComAccount(xAccount),
          isDotComAccount(yAccount)
        ) || compare(xIx, yIx)
    )
    .map(([account]) => account)

/** The data-only interface for storage. */
interface IEmail {
  readonly email: string
  /**
   * Represents whether GitHub has confirmed the user has access to this
   * email address. New users require a verified email address before
   * they can sign into GitHub Desktop.
   */
  readonly verified: boolean
  /**
   * Flag for the user's preferred email address. Other email addresses
   * are provided for associating commit authors with the one GitHub account.
   */
  readonly primary: boolean

  /** The way in which the email is visible. */
  readonly visibility: EmailVisibility
}

function isKeyChainError(e: any) {
  const error = e as Error
  return (
    error.message &&
    error.message.startsWith(
      'The user name or passphrase you entered is not correct'
    )
  )
}

/** The data-only interface for storage. */
interface IAccount {
  readonly token: string
  readonly login: string
  readonly endpoint: string
  readonly emails: ReadonlyArray<IEmail>
  readonly avatarURL: string
  readonly id: number
  readonly name: string
  readonly plan?: string
  readonly provider?: AccountProvider
}

const maximumPersistedAccountCount = 100
const maximumPersistedEmailCount = 100
const maximumPersistedAccountsLength = 1_000_000
const supportedAccountProviders = new Set<AccountProvider>([
  'github',
  'gitlab',
  'bitbucket',
])

interface IPersistedAccountsParseResult {
  readonly accounts: ReadonlyArray<IAccount>
  readonly repaired: boolean
}

/**
 * A persisted account paired with the endpoint its token was stored under
 * before the GHE endpoint migration rewrote it. The secret store is keyed by
 * endpoint, so migrating metadata alone would leave the token unreachable.
 */
interface IRehydratedAccount {
  readonly account: IAccount
  readonly previousEndpoint: string | null
}

/**
 * The stable identity of a persisted account row, matching `getAccountKey` for
 * the `Account` instances the store keeps in memory.
 */
const getPersistedAccountKey = (account: IAccount) =>
  `${account.endpoint}#${account.id}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isValidHTTPSEndpoint = (value: string) => {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

const isEmailVisibility = (value: unknown): value is EmailVisibility =>
  value === 'public' || value === 'private' || value === null

const parsePersistedEmail = (value: unknown): IEmail | null => {
  if (
    !isRecord(value) ||
    typeof value.email !== 'string' ||
    value.email.length > 1_024 ||
    typeof value.verified !== 'boolean' ||
    typeof value.primary !== 'boolean' ||
    !isEmailVisibility(value.visibility)
  ) {
    return null
  }

  return {
    email: value.email,
    verified: value.verified,
    primary: value.primary,
    visibility: value.visibility,
  }
}

const parsePersistedAccount = (value: unknown): IAccount | null => {
  if (!isRecord(value)) {
    return null
  }

  const provider = value.provider ?? 'github'
  if (
    typeof provider !== 'string' ||
    !supportedAccountProviders.has(provider as AccountProvider) ||
    typeof value.login !== 'string' ||
    value.login.length === 0 ||
    value.login.length > 1_024 ||
    typeof value.endpoint !== 'string' ||
    value.endpoint.length > 8_192 ||
    !isValidHTTPSEndpoint(value.endpoint) ||
    !Array.isArray(value.emails) ||
    value.emails.length > maximumPersistedEmailCount ||
    typeof value.avatarURL !== 'string' ||
    value.avatarURL.length > 8_192 ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    typeof value.name !== 'string' ||
    value.name.length > 4_096 ||
    (value.plan !== undefined &&
      (typeof value.plan !== 'string' || value.plan.length > 4_096))
  ) {
    return null
  }

  const emails = value.emails.map(parsePersistedEmail)
  if (emails.some(email => email === null)) {
    return null
  }

  return {
    // Tokens belong exclusively in the secure store. Accept the legacy field,
    // but never preserve its value when repairing persisted metadata.
    token: '',
    login: value.login,
    endpoint: value.endpoint,
    emails: emails as ReadonlyArray<IEmail>,
    avatarURL: value.avatarURL,
    id: value.id,
    name: value.name,
    plan: value.plan as string | undefined,
    provider: provider as AccountProvider,
  }
}

const parsePersistedAccounts = (raw: string): IPersistedAccountsParseResult => {
  if (raw.length > maximumPersistedAccountsLength) {
    return { accounts: [], repaired: true }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { accounts: [], repaired: true }
  }

  if (!Array.isArray(parsed)) {
    return { accounts: [], repaired: true }
  }

  const candidates = parsed.slice(0, maximumPersistedAccountCount)
  const accounts = candidates
    .map(parsePersistedAccount)
    .filter((account): account is IAccount => account !== null)
  const containsPersistedSecret = candidates.some(
    candidate =>
      isRecord(candidate) &&
      typeof candidate.token === 'string' &&
      candidate.token.length > 0
  )

  return {
    accounts,
    repaired:
      parsed.length !== candidates.length ||
      accounts.length !== candidates.length ||
      containsPersistedSecret,
  }
}

/** The store for logged in accounts. */
export class AccountsStore extends TypedBaseStore<ReadonlyArray<Account>> {
  private dataStore: IDataStore
  private secureStore: ISecureStore

  private accounts: ReadonlyArray<Account> = []

  /**
   * Persisted identities this store has deliberately retired — signed out, or
   * rewritten to a new endpoint by the GHE migration.
   *
   * `users` is shared by every app window, so saving merges rather than
   * overwrites (see `save`). Without this set a merge would resurrect the very
   * account the user just signed out of, or keep a duplicate row under the
   * pre-migration endpoint.
   */
  private readonly retiredAccountKeys = new Set<string>()

  /** A promise that will resolve when the accounts have been loaded. */
  private loadingPromise: Promise<void>

  public constructor(dataStore: IDataStore, secureStore: ISecureStore) {
    super()

    this.dataStore = dataStore
    this.secureStore = secureStore
    this.loadingPromise = this.loadFromStore()
  }

  /**
   * Get the list of accounts in the cache.
   */
  public async getAll(): Promise<ReadonlyArray<Account>> {
    await this.loadingPromise

    return this.accounts.slice()
  }

  /** Re-read shared account metadata after another app window changes it. */
  public reloadFromStore(): Promise<void> {
    this.loadingPromise = this.loadingPromise.then(() => this.loadFromStore())
    return this.loadingPromise
  }

  /**
   * Add the account to the store.
   */
  public async addAccount(account: Account): Promise<Account | null> {
    await this.loadingPromise

    try {
      const key = getKeyForAccount(account)
      await this.secureStore.setItem(key, account.login, account.token)
    } catch (e) {
      log.error(`Error adding account '${account.login}'`, e)

      if (__DARWIN__ && isKeyChainError(e)) {
        this.emitError(
          new Error(
            t('accounts.keychainLocked', {
              app: DefaultAppDisplayName,
              login: account.login,
            })
          )
        )
      } else {
        this.emitError(
          new Error(
            t('accounts.tokenWriteFailed', {
              login: account.login,
              error: `${e}`,
            })
          )
        )
      }
      return null
    }

    const key = getAccountKey(account)

    // A re-authorization can come back under a renamed login. The secret is
    // keyed by endpoint + login while the identity is endpoint + id, so the
    // superseded entry has to be cleared explicitly or a live token is left
    // behind in the OS credential store forever.
    const superseded = this.accounts.find(
      x => getAccountKey(x) === key && x.login !== account.login
    )
    if (superseded !== undefined) {
      await this.forgetSecret(superseded)
    }

    this.retiredAccountKeys.delete(key)

    const accountsByIdentity = this.accounts.reduce(
      (map, x) => map.set(getAccountKey(x), x),
      new Map<string, Account>()
    )
    accountsByIdentity.set(key, account)

    this.accounts = sortAccounts([...accountsByIdentity.values()])

    this.save()
    return account
  }

  /**
   * Drop an account's entry from the secret store.
   *
   * Cleanup failures are logged rather than surfaced: the caller has already
   * written the credential that matters, and failing a completed sign-in
   * because a superseded entry lingered would be worse than the leftover.
   */
  private async forgetSecret(account: Account): Promise<void> {
    try {
      await this.secureStore.deleteItem(
        getKeyForAccount(account),
        account.login
      )
    } catch (e) {
      log.warn(
        `Could not remove the superseded token for '${account.login}'`,
        e
      )
    }
  }

  /**
   * Move the given account ahead of its peers so every surface that
   * resolves a single account (clone tabs, blankslate, API operations)
   * treats it as the active identity. GitHub.com accounts stay ahead of
   * Enterprise accounts; within each class the promoted account leads.
   */
  public async promoteAccount(account: Account): Promise<void> {
    await this.loadingPromise

    const key = getAccountKey(account)
    const index = this.accounts.findIndex(
      candidate => getAccountKey(candidate) === key
    )
    if (index === -1) {
      return
    }

    const promoted = this.accounts[index]
    const remaining = this.accounts.filter(
      candidate => getAccountKey(candidate) !== key
    )
    this.accounts = sortAccounts([promoted, ...remaining])

    this.save()
  }

  /**
   * Refresh all accounts by fetching their latest info from the API.
   *
   * Every account costs a network round trip, so the account list is re-read
   * after the API calls come back instead of being captured before them.
   * Blindly assigning the captured snapshot made the refresh a
   * read-modify-write race over shared state: an account signed in while the
   * refresh ran was erased from memory *and* from the saved list (so the app
   * asked the user to sign in again on the next launch), and a token
   * re-authorized for wider scopes mid-refresh was replaced by the narrow one
   * the refresh had started with (so the re-authorization prompt came back).
   */
  public async refresh(): Promise<void> {
    await this.loadingPromise

    const updates = new Map(
      await Promise.all(
        this.accounts.map(
          async account =>
            [
              getAccountKey(account),
              {
                // The token the refresh was issued with. `fetchUser` echoes it
                // back, so it doubles as the staleness check below.
                token: account.token,
                account: await this.tryUpdateAccount(account),
              },
            ] as const
        )
      )
    )

    this.accounts = this.accounts.map(current => {
      const update = updates.get(getAccountKey(current))

      // Only adopt the refreshed copy when the credential it was fetched with
      // is still this account's credential. A re-authorization or a
      // sign-out/sign-in that landed while the refresh was in flight owns the
      // newer token and must not be rolled back. Accounts added during the
      // refresh simply have no update and are left untouched.
      return update === undefined || update.token !== current.token
        ? current
        : update.account
    })

    this.save()
  }

  /**
   * Attempts to update the Account with new information from
   * the API.
   *
   * If the update fails for whatever reason this function
   * will return the old Account instance. Usually updates fails
   * due to connectivity issues but in the future we should
   * investigate whether we're able to detect here that the
   * token is definitely not valid anymore and let the
   * user know that they've been signed out.
   */
  private async tryUpdateAccount(account: Account): Promise<Account> {
    try {
      return await updatedAccount(account)
    } catch (e) {
      log.warn(`Error refreshing account '${account.login}'`, e)
      return account
    }
  }

  /**
   * Remove the account from the store.
   */
  public async removeAccount(account: Account): Promise<void> {
    await this.loadingPromise

    try {
      await this.secureStore.deleteItem(
        getKeyForAccount(account),
        account.login
      )
    } catch (e) {
      log.error(`Error removing account '${account.login}'`, e)
      this.emitError(e)
      return
    }

    this.retiredAccountKeys.add(getAccountKey(account))
    this.accounts = this.accounts.filter(
      a => !(a.endpoint === account.endpoint && a.id === account.id)
    )

    this.save()
  }

  private getMigratedGHEAccounts(
    accounts: ReadonlyArray<IAccount>
  ): ReadonlyArray<IRehydratedAccount> | null {
    let migrated = false
    const migratedAccounts = accounts.map<IRehydratedAccount>(account => {
      const endpointURL = new URL(account.endpoint)
      // Migrate endpoints of subdomains of `.ghe.com` that use the `/api/v3`
      // path to the correct URL using the `api.` subdomain.
      if (
        (account.provider ?? 'github') === 'github' &&
        isGHE(account.endpoint) &&
        !endpointURL.hostname.startsWith('api.')
      ) {
        migrated = true
        return {
          account: {
            ...account,
            endpoint: getEnterpriseAPIURL(account.endpoint),
          },
          previousEndpoint: account.endpoint,
        }
      }

      return { account, previousEndpoint: null }
    })

    return migrated ? migratedAccounts : null
  }

  /**
   * Carry a token across a migrated endpoint.
   *
   * The secret store is keyed by endpoint, so rewriting the endpoint in the
   * saved metadata alone leaves the token stranded under the old key and the
   * account looks signed out on the next launch.
   */
  private async migrateSecret(
    previousEndpoint: string,
    key: string,
    login: string
  ): Promise<string | null> {
    const previousKey = getKeyForEndpoint(previousEndpoint)
    const token = await this.secureStore.getItem(previousKey, login)

    if (token === null || token.length === 0) {
      return null
    }

    await this.secureStore.setItem(key, login, token)
    try {
      await this.secureStore.deleteItem(previousKey, login)
    } catch (e) {
      log.warn(`Could not remove the pre-migration token for '${login}'`, e)
    }

    return token
  }

  /**
   * Load the users into memory from storage.
   */
  private async loadFromStore(): Promise<void> {
    let raw: string | null
    try {
      raw = this.dataStore.getItem('users')
    } catch (error) {
      log.error('Failed to read saved account metadata', error)
      this.accounts = []
      this.emitUpdate(this.accounts)
      queueMicrotask(() =>
        this.emitError(new Error(t('accounts.metadataReadFailed')))
      )
      return
    }
    if (!raw || !raw.length) {
      this.accounts = []
      this.emitUpdate(this.accounts)
      return
    }

    const { accounts: parsedAccounts, repaired } = parsePersistedAccounts(raw)
    const migratedAccounts = this.getMigratedGHEAccounts(parsedAccounts)
    const rawAccounts =
      migratedAccounts ??
      parsedAccounts.map<IRehydratedAccount>(account => ({
        account,
        previousEndpoint: null,
      }))

    const accountsWithTokens = []
    // Accounts whose credential could not be produced. They are reported
    // together so the user learns which sign-ins need repeating instead of
    // watching the app silently ask for one again.
    const credentialFailures: Array<string> = []

    for (const { account, previousEndpoint } of rawAccounts) {
      if (previousEndpoint !== null) {
        // The saved row still names the pre-migration endpoint, which is a
        // different identity key from the migrated account. Retire it so the
        // save merge rewrites the row instead of keeping both.
        this.retiredAccountKeys.add(
          getPersistedAccountKey({ ...account, endpoint: previousEndpoint })
        )
      }

      const accountWithoutToken = new Account(
        account.login,
        account.endpoint,
        '',
        account.emails,
        account.avatarURL,
        account.id,
        account.name,
        account.plan,
        undefined,
        undefined,
        undefined,
        undefined,
        account.provider ?? 'github'
      )

      const key = getKeyForAccount(accountWithoutToken)
      let token: string | null
      try {
        token = await this.secureStore.getItem(key, account.login)

        if (
          (token === null || token.length === 0) &&
          previousEndpoint !== null
        ) {
          token = await this.migrateSecret(previousEndpoint, key, account.login)
        }
      } catch (e) {
        log.error(`Error getting token for '${key}'. Skipping.`, e)
        credentialFailures.push(account.login)
        continue
      }

      if (token === null || token.length === 0) {
        // An account without a credential is signed out, not signed in.
        // Loading it with an empty token used to leave the app looking
        // authenticated while every API call failed, which is exactly the
        // state that makes it re-prompt endlessly with no explanation.
        log.error(`No token found for '${key}'. Treating it as signed out.`)
        credentialFailures.push(account.login)
        continue
      }

      accountsWithTokens.push(accountWithoutToken.withToken(token))
    }

    this.accounts = sortAccounts(accountsWithTokens)

    if (credentialFailures.length > 0) {
      queueMicrotask(() =>
        this.emitError(
          new Error(
            t('accounts.credentialUnavailable', {
              logins: credentialFailures.join(', '),
            })
          )
        )
      )
    }

    // If any account was migrated, make sure to persist the new value
    if (migratedAccounts !== null || repaired) {
      this.save() // Save already emits an update
      if (repaired) {
        log.warn('Repaired invalid saved account metadata')
        queueMicrotask(() =>
          this.emitError(new Error(t('accounts.metadataRepaired')))
        )
      }
    } else {
      this.emitUpdate(this.accounts)
    }
  }

  /**
   * Persist account metadata. Tokens never leave the secret store.
   *
   * `users` is one shared key that every app window writes, so this merges
   * rather than overwrites. A window can easily hold a stale snapshot — it
   * missed the `accounts-changed` broadcast because it was still loading, or
   * it saved before its own rehydrate finished — and a blind whole-array write
   * from that snapshot silently signs out an account added somewhere else.
   * Rows this store neither knows about nor deliberately signed out are
   * carried through untouched; they rehydrate normally on the next load.
   */
  private save() {
    const knownKeys = new Set(this.accounts.map(getAccountKey))
    const usersWithoutTokens = [
      ...this.accounts.map(account => account.withToken('')),
      ...this.getAccountsToPreserve(knownKeys),
    ]

    try {
      this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
    } catch (error) {
      log.error('Failed to save account metadata', error)
      queueMicrotask(() =>
        this.emitError(new Error(t('accounts.metadataWriteFailed')))
      )
    }

    this.emitUpdate(this.accounts)
  }

  /**
   * Saved accounts that belong to another window's session and must survive
   * this store's save. Reading fails soft: losing the merge is better than
   * losing the write.
   */
  private getAccountsToPreserve(
    knownKeys: ReadonlySet<string>
  ): ReadonlyArray<IAccount> {
    let raw: string | null
    try {
      raw = this.dataStore.getItem('users')
    } catch (error) {
      log.warn('Could not read saved account metadata before saving', error)
      return []
    }

    if (!raw || !raw.length) {
      return []
    }

    const preserved = new Map<string, IAccount>()
    for (const account of parsePersistedAccounts(raw).accounts) {
      const key = getPersistedAccountKey(account)
      if (!knownKeys.has(key) && !this.retiredAccountKeys.has(key)) {
        preserved.set(key, account)
      }
    }

    return [...preserved.values()]
  }
}

async function updatedAccount(account: Account): Promise<Account> {
  if (!account.token) {
    return fatalError(
      `Cannot update an account which doesn't have a token: ${account.login}`
    )
  }

  return fetchUser(account.endpoint, account.token, account.provider)
}
