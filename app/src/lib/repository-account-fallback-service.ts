import { Account, getAccountKey } from '../models/account'
import { API } from './api'
import {
  clearRepositoryAccountFallbackOffer,
  getApprovedRepositoryAccountKey,
  setRepositoryAccountFallbackOffer,
} from './repository-account-fallback-ask'
import {
  getRepositoryAccountAdoption,
  getRepositoryAccountTargetFromURL,
  IRepositoryAccountTarget,
  RepositoryAccountAdoption,
  RepositoryAccountAssociationCache,
  RepositoryAccountProbe,
  RepositoryAccountFallbackOutcome,
  resolveRepositoryAccountFallback,
  setRepositoryAccountFallbackAttempts,
} from './repository-account-fallback'

/**
 * The runtime half of the shared account fallback.
 *
 * {@link ./repository-account-fallback} decides *which* identities may be tried
 * and what to do with the answer; this module performs the actual read-only
 * probe, remembers the result, and applies the user's
 * `autoSwitchAccountToRepositoryOwner` preference. Keeping the impure part
 * behind one small service means every surface — the API-backed views, Cheap
 * LFS registry calls, Git credential selection, repository add and publish —
 * shares one probe implementation and one association cache rather than each
 * growing its own.
 */

/**
 * The default read-only probe: ask one identity whether it can see the
 * repository.
 *
 * `API.fromAccount` binds the request to that account's own endpoint, so an
 * Enterprise token is only ever sent to its Enterprise host.
 * {@link API.fetchRepository} is a single `GET repos/{owner}/{name}` which
 * already maps 404 and transport failures to `null`, so an ordinary "cannot see
 * it" answer resolves `false` instead of throwing.
 */
export async function probeRepositoryWithAccountAPI(
  account: Account,
  target: IRepositoryAccountTarget
): Promise<boolean> {
  const repository = await API.fromAccount(account).fetchRepository(
    target.owner,
    target.name
  )

  return repository !== null
}

export interface IRepositoryAccountFallbackResolution {
  readonly outcome: RepositoryAccountFallbackOutcome
  /** What the app should do, given the user's auto-switch preference. */
  readonly adoption: RepositoryAccountAdoption
  /** Every identity probed, so a failure can name them honestly. */
  readonly triedAccounts: ReadonlyArray<Account>
}

export interface IRepositoryAccountFallbackRequest {
  /** Identities the failing operation already used. */
  readonly attemptedAccountKeys?: ReadonlyArray<string>
  readonly signal?: AbortSignal
  /** Skip the association cache, e.g. after an explicit sign-in change. */
  readonly ignoreCache?: boolean
}

/**
 * Resolves "repository doesn't exist" results to the identity that can actually
 * see the repository.
 *
 * The service is deliberately passive: it never switches accounts and never
 * retries the caller's operation. It answers *which* identity to use and
 * whether the user must be asked first, and the calling surface decides how to
 * act on that within its own error handling.
 */
export class RepositoryAccountFallbackService {
  private readonly cache: RepositoryAccountAssociationCache

  public constructor(
    private readonly getAccounts: () => ReadonlyArray<Account>,
    private readonly isAutoSwitchEnabled: () => boolean,
    private readonly probe: RepositoryAccountProbe = probeRepositoryWithAccountAPI,
    cache: RepositoryAccountAssociationCache = new RepositoryAccountAssociationCache()
  ) {
    this.cache = cache
  }

  /** The identity previously confirmed for a repository, if any. */
  public getCachedAccountKey(
    target: IRepositoryAccountTarget
  ): string | undefined {
    return this.cache.get(target)
  }

  /**
   * Find the identity that can see a repository after a not-found result.
   *
   * A cached association is only used to reorder the probe list, never to skip
   * the probe: an association can go stale when access is revoked, and acting
   * on a stale entry would replace one wrong-account failure with another.
   */
  public async resolve(
    target: IRepositoryAccountTarget,
    request: IRepositoryAccountFallbackRequest = {}
  ): Promise<IRepositoryAccountFallbackResolution> {
    const preferredAccountKey =
      request.ignoreCache === true ? null : this.cache.get(target) ?? null

    const outcome = await resolveRepositoryAccountFallback(
      target,
      this.getAccounts(),
      this.probe,
      {
        attemptedAccountKeys: request.attemptedAccountKeys,
        preferredAccountKey,
        signal: request.signal,
      }
    )

    if (outcome.kind === 'resolved') {
      this.cache.set(target, getAccountKey(outcome.account))
    } else {
      // The remembered identity can no longer see it either; do not keep
      // sending later operations down a route which has stopped working.
      this.cache.forget(target)
    }

    return {
      outcome,
      adoption: getRepositoryAccountAdoption(
        outcome,
        this.isAutoSwitchEnabled()
      ),
      triedAccounts: outcome.triedAccounts,
    }
  }

  /** Resolve from a remote URL. Returns null when it has no owner/name. */
  public async resolveForRemoteURL(
    remoteUrl: string,
    request: IRepositoryAccountFallbackRequest = {}
  ): Promise<IRepositoryAccountFallbackResolution | null> {
    const target = getRepositoryAccountTargetFromURL(remoteUrl)
    return target === null ? null : this.resolve(target, request)
  }

  /** Forget every association naming an identity which just signed out. */
  public forgetAccount(accountKey: string): void {
    this.cache.forgetAccount(accountKey)
  }

  public forget(target: IRepositoryAccountTarget): void {
    this.cache.forget(target)
  }
}

export interface IRepositoryAccountFallbackSurfaceResult<T> {
  readonly result: T
  /** The identity the operation ended up using. */
  readonly account: Account
  /** True when the first identity failed and another one succeeded. */
  readonly usedFallback: boolean
}

/**
 * The complete surface-level policy for one API-backed operation.
 *
 * Wraps {@link runWithRepositoryAccountFallback} with the two pieces every
 * surface needs and none of them should re-implement:
 *
 *  - a per-repository approval the user granted earlier in the session is
 *    honoured even while auto-switching is off, because they already answered
 *    this exact question for this exact repository;
 *  - when the fallback finds an identity it may not use, a standing one-click
 *    offer is recorded and the original error is re-thrown unchanged, so the
 *    surface keeps its own error copy and the notice appears alongside it.
 */
export async function runSurfaceWithRepositoryAccountFallback<T>(
  options: IRepositoryAccountFallbackRunOptions<T>
): Promise<IRepositoryAccountFallbackSurfaceResult<T>> {
  const approvedAccountKey = getApprovedRepositoryAccountKey(options.target)
  const run = await runWithRepositoryAccountFallback({
    ...options,
    autoSwitchEnabled:
      options.autoSwitchEnabled || approvedAccountKey !== undefined,
    preferredAccountKey: approvedAccountKey ?? options.preferredAccountKey,
  })

  if (run.kind === 'succeeded') {
    clearRepositoryAccountFallbackOffer(options.target)
    return {
      result: run.result,
      account: run.account,
      usedFallback: run.usedFallback,
    }
  }

  setRepositoryAccountFallbackOffer({
    target: options.target,
    account: run.account,
  })
  throw run.error
}

export interface IRepositoryAccountFallbackRunOptions<T> {
  readonly target: IRepositoryAccountTarget
  readonly accounts: ReadonlyArray<Account>
  /** The identity the surface would use on its own. */
  readonly initialAccount: Account
  /** Whether an error means "not found", i.e. possibly the wrong identity. */
  readonly isNotFound: (error: unknown) => boolean
  /** The operation, bound to one identity. Must be safe to repeat. */
  readonly work: (account: Account) => Promise<T>
  /**
   * The user's `autoSwitchAccountToRepositoryOwner` preference. When it is off
   * the run stops at `needs-confirmation` instead of quietly using another
   * identity.
   */
  readonly autoSwitchEnabled: boolean
  readonly probe?: RepositoryAccountProbe
  readonly signal?: AbortSignal
  /** An identity to probe first, typically a cached association. */
  readonly preferredAccountKey?: string | null
}

export type RepositoryAccountFallbackRun<T> =
  /** The operation succeeded, possibly under a different identity. */
  | {
      readonly kind: 'succeeded'
      readonly result: T
      readonly account: Account
      readonly usedFallback: boolean
    }
  /**
   * Another identity can see the repository, but auto-switching is off so the
   * user must approve using it. The surface posts a non-blocking notice with a
   * one-click action and re-runs bound to `account` if the user accepts.
   */
  | {
      readonly kind: 'needs-confirmation'
      readonly account: Account
      readonly error: unknown
    }

/**
 * Run an API-backed operation and, if it reports "repository not found", retry
 * it under whichever other signed-in identity can actually see the repository.
 *
 * This is the API-side counterpart of `pullWithAccountFallback`, which does the
 * same job for Git network operations. The shape is deliberately the same: the
 * ordinary first attempt is preserved exactly, only a not-found result unlocks
 * the fallback, and identities are exhausted in a stable order.
 *
 * When every identity fails, the original error is re-thrown unchanged so each
 * surface keeps its own tested error type and copy — the identities tried are
 * attached out of band via
 * {@link setRepositoryAccountFallbackAttempts} so the message can list them.
 */
export async function runWithRepositoryAccountFallback<T>(
  options: IRepositoryAccountFallbackRunOptions<T>
): Promise<RepositoryAccountFallbackRun<T>> {
  const {
    target,
    accounts,
    initialAccount,
    isNotFound,
    work,
    autoSwitchEnabled,
    probe = probeRepositoryWithAccountAPI,
    signal,
    preferredAccountKey = null,
  } = options

  try {
    return {
      kind: 'succeeded',
      result: await work(initialAccount),
      account: initialAccount,
      usedFallback: false,
    }
  } catch (error) {
    if (!isNotFound(error)) {
      throw error
    }

    const outcome = await resolveRepositoryAccountFallback(
      target,
      accounts,
      probe,
      {
        attemptedAccountKeys: [getAccountKey(initialAccount)],
        preferredAccountKey,
        signal,
      }
    )

    if (outcome.kind !== 'resolved') {
      setRepositoryAccountFallbackAttempts(error, [
        initialAccount,
        ...outcome.triedAccounts,
      ])
      throw error
    }

    if (!autoSwitchEnabled) {
      return { kind: 'needs-confirmation', account: outcome.account, error }
    }

    // The probe already proved this identity can see the repository, so a
    // second not-found here is a genuine failure rather than another identity
    // ambiguity. Let it propagate with the accounts we tried attached.
    try {
      return {
        kind: 'succeeded',
        result: await work(outcome.account),
        account: outcome.account,
        usedFallback: true,
      }
    } catch (retryError) {
      setRepositoryAccountFallbackAttempts(retryError, [
        initialAccount,
        ...outcome.triedAccounts,
      ])
      throw retryError
    }
  }
}
