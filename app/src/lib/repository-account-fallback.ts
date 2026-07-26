import { Account, getAccountKey } from '../models/account'
import { getEndpointForRepository, getHTMLURL } from './api'
import { parseRemote } from './remote-parsing'

/**
 * GitHub deliberately answers a private repository the current identity cannot
 * see with `404 Not Found` rather than `403 Forbidden`. A "repository doesn't
 * exist" result is therefore an *identity ambiguity* as often as it is a real
 * missing repository: the very same request usually succeeds once it carries a
 * different signed-in account's token.
 *
 * This module is the one shared, pure decision layer behind that retry. Callers
 * supply the operation's target and a read-only probe; the resolver decides
 * which identities may be tried, in what order, and what the app should do with
 * the answer. It never performs a request itself and never handles a token, so
 * every surface — Git network operations, the API-backed views, Cheap LFS
 * registry calls, repository add and publish — can share one policy instead of
 * growing another private copy of it.
 *
 * Two invariants matter more than convenience and are enforced here rather than
 * left to each caller:
 *
 *  1. Host isolation. A candidate must live on the exact same API endpoint as
 *     the failing operation, so one account's token is never offered to another
 *     account's host. Enterprise tokens stay on their Enterprise host.
 *  2. Read-only, bounded probing. Candidates are tried one at a time, never
 *     concurrently, and never beyond {@link MaxRepositoryAccountProbes}, so a
 *     long account list cannot turn one 404 into an unbounded burst of traffic.
 */

/** The repository an operation was working with when it reported not-found. */
export interface IRepositoryAccountTarget {
  /** The API endpoint the failing operation used. */
  readonly endpoint: string
  readonly owner: string
  readonly name: string
}

/**
 * How many identities a single not-found result may probe.
 *
 * Probing is sequential, so this is also the worst-case added latency measured
 * in round trips. Users with a long list of Enterprise identities should not pay
 * an unbounded delay before seeing a plain error.
 */
export const MaxRepositoryAccountProbes = 8

/** Endpoints are compared case-insensitively and without trailing slashes. */
export function normalizeAccountEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '').toLowerCase()
}

/**
 * The stable cache key for a repository's resolved account association.
 *
 * Owner and name are case-insensitive on GitHub, and the endpoint keeps the
 * same `owner/name` on different installations apart.
 */
export function getRepositoryAccountTargetKey(
  target: IRepositoryAccountTarget
): string {
  return `${normalizeAccountEndpoint(
    target.endpoint
  )}#${target.owner.toLowerCase()}/${target.name.toLowerCase()}`
}

/** Whether two targets designate the same repository on the same host. */
export function repositoryAccountTargetEquals(
  x: IRepositoryAccountTarget,
  y: IRepositoryAccountTarget
): boolean {
  return getRepositoryAccountTargetKey(x) === getRepositoryAccountTargetKey(y)
}

/**
 * Derive a probe target from a remote URL.
 *
 * Returns null for a URL we cannot decompose into `owner/name`, which is the
 * honest answer: without a repository coordinate there is nothing to probe and
 * the caller must surface the original failure unchanged.
 */
export function getRepositoryAccountTargetFromURL(
  remoteUrl: string
): IRepositoryAccountTarget | null {
  const parsed = parseRemote(remoteUrl)
  if (
    parsed === null ||
    parsed.owner.length === 0 ||
    parsed.name.length === 0
  ) {
    return null
  }

  // `getEndpointForRepository` expects an absolute URL. SSH remotes parse fine
  // above but are not URLs, so rebuild an HTTPS form from the parsed hostname.
  const endpoint = getEndpointForRepository(`https://${parsed.hostname}/`)

  return { endpoint, owner: parsed.owner, name: parsed.name }
}

/**
 * Derive a probe target from a repository's own GitHub metadata.
 *
 * Structurally typed rather than importing `GitHubRepository`, so this module
 * stays free of model dependencies and remains trivially testable.
 */
export function getRepositoryAccountTargetFromGitHubRepository(gitHubRepository: {
  readonly name: string
  readonly owner: { readonly login: string; readonly endpoint: string }
}): IRepositoryAccountTarget {
  return {
    endpoint: gitHubRepository.owner.endpoint,
    owner: gitHubRepository.owner.login,
    name: gitHubRepository.name,
  }
}

export interface IRepositoryAccountProbeOptions {
  /**
   * Identities the failing operation already used. They are never probed
   * again — repeating the request that just produced the 404 wastes a round
   * trip and can look like a retry storm to the host.
   */
  readonly attemptedAccountKeys?: ReadonlyArray<string>
  /**
   * An identity to try first, typically a previously cached association for
   * this repository. Ignored when it is not otherwise eligible.
   */
  readonly preferredAccountKey?: string | null
  /** Override the default probe bound. Values below one disable probing. */
  readonly limit?: number
}

/**
 * Return the identities eligible to probe for a not-found repository, in the
 * order they should be tried.
 *
 * Eligibility is deliberately strict:
 *
 *  - the account must carry a token, because an anonymous probe can only ever
 *    confirm what the failing request already established;
 *  - the account's endpoint must match the target's endpoint exactly, which is
 *    what keeps an Enterprise token on its own host;
 *  - identities already attempted are excluded, and duplicates collapse on
 *    their stable account key.
 *
 * Account-store order is otherwise preserved so the result is deterministic and
 * matches the order the rest of the app presents identities in.
 */
export function getRepositoryAccountProbeOrder(
  target: IRepositoryAccountTarget,
  accounts: ReadonlyArray<Account>,
  options: IRepositoryAccountProbeOptions = {}
): ReadonlyArray<Account> {
  const limit = options.limit ?? MaxRepositoryAccountProbes
  if (limit < 1) {
    return []
  }

  const targetEndpoint = normalizeAccountEndpoint(target.endpoint)
  if (targetEndpoint.length === 0) {
    return []
  }

  const attempted = new Set(options.attemptedAccountKeys ?? [])
  const seen = new Set<string>()

  const eligible = accounts.filter(account => {
    if (account.token.length === 0) {
      return false
    }

    if (normalizeAccountEndpoint(account.endpoint) !== targetEndpoint) {
      return false
    }

    const key = getAccountKey(account)
    if (attempted.has(key) || seen.has(key)) {
      return false
    }
    seen.add(key)

    return true
  })

  const preferredAccountKey = options.preferredAccountKey ?? null
  const ordered =
    preferredAccountKey === null
      ? eligible
      : [
          ...eligible.filter(a => getAccountKey(a) === preferredAccountKey),
          ...eligible.filter(a => getAccountKey(a) !== preferredAccountKey),
        ]

  return ordered.slice(0, limit)
}

/**
 * A read-only check of whether one identity can see the target repository.
 *
 * Implementations must not mutate anything and must resolve `false` rather than
 * throw for an ordinary "cannot see it" answer.
 */
export type RepositoryAccountProbe = (
  account: Account,
  target: IRepositoryAccountTarget
) => Promise<boolean>

export type RepositoryAccountFallbackOutcome =
  /** An identity can see the repository. */
  | {
      readonly kind: 'resolved'
      readonly account: Account
      readonly triedAccounts: ReadonlyArray<Account>
    }
  /** Every eligible identity was probed and none could see the repository. */
  | {
      readonly kind: 'exhausted'
      readonly triedAccounts: ReadonlyArray<Account>
    }

export interface IRepositoryAccountFallbackOptions
  extends IRepositoryAccountProbeOptions {
  readonly signal?: AbortSignal
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Account lookup cancelled.')
    error.name = 'AbortError'
    throw error
  }
}

/**
 * Probe the eligible identities in order and return the first that can see the
 * repository.
 *
 * Probes run strictly one after another. A probe that throws is treated as
 * "cannot see it" and the search continues: a single unreachable Enterprise
 * host must not mask a later identity that would have succeeded. Cancellation
 * is the one exception and propagates immediately.
 */
export async function resolveRepositoryAccountFallback(
  target: IRepositoryAccountTarget,
  accounts: ReadonlyArray<Account>,
  probe: RepositoryAccountProbe,
  options: IRepositoryAccountFallbackOptions = {}
): Promise<RepositoryAccountFallbackOutcome> {
  const { signal } = options
  throwIfAborted(signal)

  const candidates = getRepositoryAccountProbeOrder(target, accounts, options)
  const triedAccounts: Array<Account> = []

  for (const account of candidates) {
    throwIfAborted(signal)
    triedAccounts.push(account)

    let canSee = false
    try {
      canSee = await probe(account, target)
    } catch (error) {
      if (
        signal?.aborted ||
        (error as Error | undefined)?.name === 'AbortError'
      ) {
        throwIfAborted(signal)
        throw error
      }
      canSee = false
    }

    if (canSee) {
      return { kind: 'resolved', account, triedAccounts }
    }
  }

  throwIfAborted(signal)
  return { kind: 'exhausted', triedAccounts }
}

/**
 * What the app should do once a fallback identity has been found.
 *
 * `autoSwitchAccountToRepositoryOwner` is the user's existing statement about
 * whether Desktop Material may follow a repository's owning account on its own.
 * We reuse it verbatim rather than inventing a second, competing preference: on
 * we adopt the resolved identity, off we ask first through a non-blocking
 * notice so nothing switches behind the user's back.
 */
export type RepositoryAccountAdoption =
  | { readonly kind: 'adopt'; readonly account: Account }
  | { readonly kind: 'ask'; readonly account: Account }
  | { readonly kind: 'none' }

export function getRepositoryAccountAdoption(
  outcome: RepositoryAccountFallbackOutcome,
  autoSwitchEnabled: boolean
): RepositoryAccountAdoption {
  if (outcome.kind !== 'resolved') {
    return { kind: 'none' }
  }

  return autoSwitchEnabled
    ? { kind: 'adopt', account: outcome.account }
    : { kind: 'ask', account: outcome.account }
}

/**
 * Remember which identity could see a repository.
 *
 * The association is a latency optimisation, never an authorisation decision:
 * a cached identity is only ever *tried first*, and a stale entry costs one
 * extra probe rather than granting any access. Entries are bounded and evicted
 * oldest-first so a long session cannot grow the map without limit.
 */
export class RepositoryAccountAssociationCache {
  private readonly associations = new Map<string, string>()

  public constructor(private readonly capacity: number = 256) {}

  public get(target: IRepositoryAccountTarget): string | undefined {
    return this.associations.get(getRepositoryAccountTargetKey(target))
  }

  public set(target: IRepositoryAccountTarget, accountKey: string): void {
    const key = getRepositoryAccountTargetKey(target)
    // Re-insert so the most recently confirmed association is evicted last.
    this.associations.delete(key)
    this.associations.set(key, accountKey)

    while (this.associations.size > this.capacity) {
      const oldest = this.associations.keys().next()
      if (oldest.done === true) {
        break
      }
      this.associations.delete(oldest.value)
    }
  }

  public forget(target: IRepositoryAccountTarget): void {
    this.associations.delete(getRepositoryAccountTargetKey(target))
  }

  /** Drop every association naming an identity, e.g. when it signs out. */
  public forgetAccount(accountKey: string): void {
    for (const [key, value] of [...this.associations]) {
      if (value === accountKey) {
        this.associations.delete(key)
      }
    }
  }

  public clear(): void {
    this.associations.clear()
  }

  public get size(): number {
    return this.associations.size
  }
}

/**
 * Out-of-band record of which identities a failing operation already probed.
 *
 * The error object itself is left untouched: each surface throws its own error
 * type (`GitHubReleasesError`, `GitHubIssuesError`, `ActionsError`, `GitError`
 * …) and every one of those already has a fixed, tested shape. A `WeakMap` lets
 * the shared fallback attach provenance to any of them without widening those
 * types or changing what existing tests assert, and the entry disappears with
 * the error. This mirrors `git/authentication-failure-origin.ts`, which attaches
 * Git credential provenance the same way.
 */
const probedAccountsByError = new WeakMap<object, ReadonlyArray<Account>>()

/** Record the identities tried before an operation gave up. */
export function setRepositoryAccountFallbackAttempts(
  error: unknown,
  accounts: ReadonlyArray<Account>
): void {
  if (typeof error === 'object' && error !== null && accounts.length > 0) {
    probedAccountsByError.set(error, accounts)
  }
}

/** The identities tried before this error, when the fallback ran. */
export function getRepositoryAccountFallbackAttempts(
  error: unknown
): ReadonlyArray<Account> | undefined {
  return typeof error === 'object' && error !== null
    ? probedAccountsByError.get(error)
    : undefined
}

/**
 * Carry attempt provenance across an error conversion.
 *
 * Surfaces translate a transport error into their own error type before it
 * reaches the UI. Without this the identities tried would be attached to the
 * error that was discarded, and the message could not honestly list them.
 */
export function relayRepositoryAccountFallbackAttempts(
  from: unknown,
  to: unknown
): void {
  const attempts = getRepositoryAccountFallbackAttempts(from)
  if (attempts !== undefined && from !== to) {
    setRepositoryAccountFallbackAttempts(to, attempts)
  }
}

/**
 * A human-readable, identity-only description of one probed account.
 *
 * Used to tell the user which identities were tried after every one of them
 * failed. Tokens never appear; only the login and the friendly host do.
 */
export function describeProbedAccount(account: Account): string {
  return `${account.login} (${account.friendlyEndpoint})`
}

/** The identities tried, formatted for a plain error message. */
export function describeProbedAccounts(
  accounts: ReadonlyArray<Account>
): string {
  return accounts.map(describeProbedAccount).join(', ')
}

/** The `owner/name` coordinate of a target, for user-facing copy. */
export function describeRepositoryAccountTarget(
  target: IRepositoryAccountTarget
): string {
  return `${target.owner}/${target.name}`
}

/**
 * Whether a remote URL and an account share an exact HTML origin.
 *
 * A defence-in-depth companion to the endpoint check in
 * {@link getRepositoryAccountProbeOrder} for callers that only hold a URL.
 */
export function accountMatchesRemoteOrigin(
  account: Account,
  remoteUrl: string
): boolean {
  try {
    return (
      new URL(getHTMLURL(account.endpoint)).origin.toLowerCase() ===
      new URL(remoteUrl).origin.toLowerCase()
    )
  } catch {
    return false
  }
}
