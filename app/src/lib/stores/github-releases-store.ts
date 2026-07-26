import { Account, getAccountKey } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import { Repository } from '../../models/repository'
import { API } from '../api'
import { supportsReleases } from '../endpoint-capabilities'
import { getAccountForRepository } from '../get-account-for-repository'
import {
  downloadGitHubReleaseAssetThroughMainProcess,
  uploadGitHubReleaseAssetThroughMainProcess,
} from '../github-release-transfer-client'
import {
  getGitHubReleaseAssetFingerprint,
  getGitHubReleaseFingerprint,
  GitHubReleaseMaximumPages,
  IGitHubRelease,
  IGitHubReleaseAsset,
  IGitHubReleaseAssetList,
  IGitHubReleaseDraft,
  IGitHubReleaseList,
  IGitHubReleaseUpdate,
} from '../github-releases'
import {
  GitHubReleaseTransferError,
  IGitHubReleaseAssetUploadRange,
  IGitHubReleaseTransferProgressEvent,
} from '../github-release-transfer'
import { APIError } from '../http'
import { getAutoSwitchAccountToRepositoryOwner } from '../auto-switch-account-preference'
import {
  getRepositoryAccountTargetFromGitHubRepository as releasesAccountTarget,
  relayRepositoryAccountFallbackAttempts,
  RepositoryAccountProbe,
} from '../repository-account-fallback'
import {
  probeRepositoryWithAccountAPI,
  runSurfaceWithRepositoryAccountFallback,
} from '../repository-account-fallback-service'
import { AccountsStore } from './accounts-store'

export type GitHubReleaseOperation =
  | 'list'
  | 'list-assets'
  | 'create'
  | 'update'
  | 'publish'
  | 'delete'
  | 'upload'
  | 'download'
  | 'delete-asset'
  | 'update-asset-label'

export type GitHubReleasesAvailability =
  | 'available'
  | 'signed-out'
  | 'unsupported'
  | 'not-github'

/**
 * Hard ceiling on the pages one Cheap LFS inventory review may walk. It matches
 * the shared release-pagination cap, so the walk stops at the same boundary the
 * API layer already refuses to read past instead of throwing there.
 */
export const CheapLfsReleaseInventoryMaximumPages = GitHubReleaseMaximumPages

/**
 * Why one bounded inventory walk stopped.
 *
 * Only `complete` means every remaining release was read. Each other outcome
 * names the exact reason the walk is partial so no caller — and no operator
 * reading the Releases view — can mistake a truncated list for the whole
 * repository.
 */
export type GitHubReleaseInventoryOutcome =
  | 'complete'
  | 'page-limit'
  | 'rate-limit'
  | 'canceled'
  | 'failed'

/** One page the walk finished reading, reported while it is still running. */
export interface IGitHubReleaseInventoryProgress {
  readonly page: number
  /** Releases accumulated by this walk so far, across every page it read. */
  readonly loaded: number
}

export interface IGitHubReleaseInventoryOptions {
  /** Resume from a page already known to exist; defaults to the first page. */
  readonly startPage?: number
  readonly onPage?: (progress: IGitHubReleaseInventoryProgress) => void
  /**
   * Report a cancellation, a rate limit, or a provider failure as an outcome
   * and keep the pages already read, instead of throwing them away with the
   * error. Interactive callers set this so a stop late in a long walk still
   * leaves the operator with everything that did load.
   */
  readonly keepPartial?: boolean
}

/** One bounded pass over the complete release inventory. */
export interface ICheapLfsReleaseInventory {
  readonly releases: ReadonlyArray<IGitHubRelease>
  /** `false` when anything stopped the walk before the last page. */
  readonly complete: boolean
  readonly outcome: GitHubReleaseInventoryOutcome
  /** The failure that stopped a `keepPartial` walk, else `null`. */
  readonly error: Error | null
}

export type GitHubReleasesErrorKind =
  | 'authentication'
  | 'permission'
  | 'not-found'
  | 'conflict'
  | 'rate-limit'
  | 'service'
  | 'unsupported'
  | 'invalid-response'

export class GitHubReleasesError extends Error {
  public constructor(
    public readonly kind: GitHubReleasesErrorKind,
    message: string,
    public readonly responseStatus: number | null = null
  ) {
    super(message)
    this.name = 'GitHubReleasesError'
  }
}

function inventory(
  releases: ReadonlyArray<IGitHubRelease>,
  outcome: GitHubReleaseInventoryOutcome,
  error: Error | null = null
): ICheapLfsReleaseInventory {
  return { releases, complete: outcome === 'complete', outcome, error }
}

/** Classify the stop a `keepPartial` walk reports instead of throwing. */
function inventoryStopOutcome(
  error: unknown
): Exclude<GitHubReleaseInventoryOutcome, 'complete' | 'page-limit'> {
  if ((error as Error)?.name === 'AbortError') {
    return 'canceled'
  }
  return error instanceof GitHubReleasesError && error.kind === 'rate-limit'
    ? 'rate-limit'
    : 'failed'
}

const operationLabels: Readonly<Record<GitHubReleaseOperation, string>> = {
  list: 'load releases',
  'list-assets': 'load release assets',
  create: 'create the release',
  update: 'update the release',
  publish: 'publish the release',
  delete: 'delete the release',
  upload: 'upload the release asset',
  download: 'download the release asset',
  'delete-asset': 'delete the release asset',
  'update-asset-label': 'update the release asset label',
}

function abortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

/** Convert provider failures into bounded, actionable, non-provider text. */
export function githubReleasesError(
  error: unknown,
  operation: GitHubReleaseOperation
): Error {
  if ((error as Error)?.name === 'AbortError') {
    return error as Error
  }
  if (error instanceof GitHubReleasesError) {
    return error
  }
  const status =
    error instanceof APIError || error instanceof GitHubReleaseTransferError
      ? error.responseStatus
      : null
  const rateLimitReset = error instanceof APIError ? error.rateLimitReset : null
  const action = operationLabels[operation]
  // Preserve the real cause in the Log History viewer before it is replaced by
  // the bounded, provider-safe message below; without this the operator cannot
  // tell an auth/scope failure from a validation failure or a network error.
  // Provider text is already length-bounded and APIError never retains the
  // response, so only the status, error name, and a clamped message are logged
  // (never headers or tokens).
  const errorName = error instanceof Error ? error.name : typeof error
  const errorMessage = (
    error instanceof Error ? error.message : String(error)
  ).slice(0, 256)
  log.error(
    `GitHub Releases could not ${action} (status: ${
      status ?? 'none'
    }, error: ${errorName}): ${errorMessage}`
  )
  if (error instanceof GitHubReleaseTransferError && status === null) {
    const kind: GitHubReleasesErrorKind =
      error.reason === 'incomplete-asset'
        ? 'conflict'
        : error.reason === 'network' ||
          error.reason === 'stalled' ||
          error.reason === 'cli-unavailable' ||
          error.reason === 'cli-failed'
        ? 'service'
        : 'invalid-response'
    // Transfer messages are app-authored, bounded, and localized. Preserve
    // their actionable reason instead of flattening every status-less failure
    // into the generic "could not upload safely" toast.
    return new GitHubReleasesError(kind, error.message)
  }
  if (status === 401) {
    return new GitHubReleasesError(
      'authentication',
      `GitHub could not ${action}. Sign in again and retry.`,
      status
    )
  }
  if (status === 403) {
    if (rateLimitReset !== null) {
      return new GitHubReleasesError(
        'rate-limit',
        `GitHub cannot ${action} until the API rate limit resets at ${rateLimitReset.toLocaleTimeString()}.`,
        status
      )
    }
    return new GitHubReleasesError(
      'permission',
      `GitHub denied permission to ${action}. Check the selected account’s repository access.`,
      status
    )
  }
  if (status === 404) {
    return new GitHubReleasesError(
      'not-found',
      `GitHub could not ${action}. The release or asset may no longer exist, or the selected account may not have access.`,
      status
    )
  }
  if (status === 409 || status === 422) {
    return new GitHubReleasesError(
      'conflict',
      `GitHub could not ${action} in its current state. Refresh Releases and review the requested values.`,
      status
    )
  }
  if (status !== null && status >= 500) {
    return new GitHubReleasesError(
      'service',
      `GitHub could not ${action} because the service returned an error (${status}). Retry in a moment.`,
      status
    )
  }
  return new GitHubReleasesError(
    'invalid-response',
    `GitHub could not ${action} safely. Refresh Releases and retry.`,
    status
  )
}

/** Resolve the repository-bound account with no endpoint-only fallback. */
export function getGitHubReleasesAccount(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): Account | null {
  const gitHubRepository = repository.gitHubRepository
  const account = getAccountForRepository(accounts, repository)
  return gitHubRepository !== null &&
    account?.provider === 'github' &&
    account.token.length > 0 &&
    account.endpoint === gitHubRepository.endpoint
    ? account
    : null
}

/**
 * Resolve credentials for a read-only Releases operation.
 *
 * Signed-out fallback is intentionally narrow: the repository metadata must
 * explicitly say public and the endpoint must be GitHub.com. Unknown/private
 * visibility and GitHub Enterprise endpoints continue to require the exact
 * repository-selected account.
 */
export function getGitHubReleasesReadAccount(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): Account | null {
  const authenticated = getGitHubReleasesAccount(repository, accounts)
  if (authenticated !== null) {
    return authenticated
  }

  const gitHubRepository = repository.gitHubRepository
  const anonymous = Account.anonymous()
  return gitHubRepository?.isPrivate === false &&
    gitHubRepository.endpoint === anonymous.endpoint
    ? anonymous
    : null
}

export function getGitHubReleasesAvailability(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): GitHubReleasesAvailability {
  const gitHubRepository = repository.gitHubRepository
  if (gitHubRepository === null) {
    return 'not-github'
  }
  const selectedAccount = getAccountForRepository(accounts, repository)
  if (selectedAccount !== null && selectedAccount.provider !== 'github') {
    return 'not-github'
  }
  if (!supportsReleases(gitHubRepository.endpoint)) {
    return 'unsupported'
  }
  return getGitHubReleasesAccount(repository, accounts) === null
    ? 'signed-out'
    : 'available'
}

export function accountSupportsGitHubReleases(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): boolean {
  return getGitHubReleasesAvailability(repository, accounts) === 'available'
}

export interface IGitHubReleasesAPI {
  fetchReleases(
    owner: string,
    name: string,
    page?: number,
    signal?: AbortSignal
  ): Promise<IGitHubReleaseList>
  fetchRelease(
    owner: string,
    name: string,
    releaseId: number,
    signal?: AbortSignal
  ): Promise<IGitHubRelease>
  fetchReleaseByTag(
    owner: string,
    name: string,
    tag: string,
    signal?: AbortSignal
  ): Promise<IGitHubRelease | null>
  fetchReleaseAssets(
    owner: string,
    name: string,
    releaseId: number,
    page?: number,
    signal?: AbortSignal
  ): Promise<IGitHubReleaseAssetList>
  fetchReleaseAsset(
    owner: string,
    name: string,
    assetId: number,
    signal?: AbortSignal
  ): Promise<IGitHubReleaseAsset>
  createReleaseDraft(
    owner: string,
    name: string,
    draft: IGitHubReleaseDraft,
    signal?: AbortSignal
  ): Promise<IGitHubRelease>
  createRelease(
    owner: string,
    name: string,
    draft: IGitHubReleaseDraft,
    publishImmediately: boolean,
    signal?: AbortSignal
  ): Promise<IGitHubRelease>
  updateRelease(
    owner: string,
    name: string,
    update: IGitHubReleaseUpdate,
    signal?: AbortSignal
  ): Promise<IGitHubRelease>
  publishRelease(
    owner: string,
    name: string,
    releaseId: number,
    signal?: AbortSignal
  ): Promise<IGitHubRelease>
  deleteRelease(
    owner: string,
    name: string,
    releaseId: number,
    signal?: AbortSignal
  ): Promise<void>
  deleteReleaseAsset(
    owner: string,
    name: string,
    assetId: number,
    signal?: AbortSignal
  ): Promise<void>
  /**
   * Rewrite one asset's label. Optional so an endpoint (or a test double) that
   * cannot relabel assets stays a valid Releases API; the only caller is the
   * best-effort Cheap LFS commit-provenance annotator, which skips instead.
   */
  updateReleaseAsset?(
    owner: string,
    name: string,
    assetId: number,
    label: string,
    signal?: AbortSignal
  ): Promise<IGitHubReleaseAsset>
}

export interface IGitHubReleasesStoreDependencies {
  readonly apiFor: (account: Account) => IGitHubReleasesAPI
  readonly downloadAsset: typeof downloadGitHubReleaseAssetThroughMainProcess
  readonly uploadAsset: typeof uploadGitHubReleaseAssetThroughMainProcess
  /**
   * Read-only check of whether one identity can see a repository. Overridable
   * so tests can exercise the account fallback without network access.
   */
  readonly probeRepositoryAccount?: RepositoryAccountProbe
  /** The user's `autoSwitchAccountToRepositoryOwner` preference. */
  readonly isAutoSwitchAccountEnabled?: () => boolean
}

const defaultDependencies: IGitHubReleasesStoreDependencies = {
  apiFor: account => API.fromAccount(account),
  downloadAsset: downloadGitHubReleaseAssetThroughMainProcess,
  uploadAsset: uploadGitHubReleaseAssetThroughMainProcess,
  probeRepositoryAccount: probeRepositoryWithAccountAPI,
  isAutoSwitchAccountEnabled: getAutoSwitchAccountToRepositoryOwner,
}

interface IRequestContext {
  readonly account: Account
  readonly repository: GitHubRepository
  readonly api: IGitHubReleasesAPI
  readonly generation: number
  readonly repositoryFingerprint: string
  readonly anonymous: boolean
}

export interface IGitHubReleaseMutationReview {
  readonly repositoryFingerprint: string
  readonly accountKey: string
  readonly accountGeneration: number
  readonly releaseId: number
  readonly releaseFingerprint: string
  readonly assetId: number | null
  readonly assetFingerprint: string | null
}

function repositoryFingerprint(repository: Repository): string {
  const remote = repository.gitHubRepository
  return JSON.stringify(
    remote === null
      ? [repository.id, repository.accountKey, null]
      : [
          repository.id,
          repository.accountKey,
          remote.dbID,
          remote.endpoint,
          remote.owner.login,
          remote.name,
          remote.isPrivate,
        ]
  )
}

function staleReviewError(): GitHubReleasesError {
  return new GitHubReleasesError(
    'conflict',
    'The reviewed release, asset, repository, or account changed. Refresh Releases and review the operation again.'
  )
}

function accountsEqual(
  left: ReadonlyArray<Account>,
  right: ReadonlyArray<Account>
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (account, index) =>
        getAccountKey(account) === getAccountKey(right[index]) &&
        account.provider === right[index].provider &&
        account.token === right[index].token
    )
  )
}

/** Account-bound Releases coordinator with cancellation and stale-response gates. */
export class GitHubReleasesStore {
  private accounts = new Array<Account>()
  private generation = 0
  private lastUsedAccount: Account | null = null
  private readonly activeControllers = new Set<AbortController>()

  public constructor(
    accountsStore: AccountsStore,
    private readonly dependencies: IGitHubReleasesStoreDependencies = defaultDependencies
  ) {
    accountsStore.getAll().then(this.onAccountsUpdated)
    accountsStore.onDidUpdate(this.onAccountsUpdated)
  }

  private readonly onAccountsUpdated = (accounts: ReadonlyArray<Account>) => {
    if (accountsEqual(this.accounts, accounts)) {
      return
    }
    this.accounts = [...accounts]
    this.generation++
    for (const controller of this.activeControllers) {
      controller.abort()
    }
    this.activeControllers.clear()
  }

  public availability(repository: Repository): GitHubReleasesAvailability {
    return getGitHubReleasesAvailability(repository, this.accounts)
  }

  private context(repository: Repository): IRequestContext {
    const gitHubRepository = repository.gitHubRepository
    if (gitHubRepository === null) {
      throw new GitHubReleasesError(
        'unsupported',
        'Releases are available only for repositories hosted on GitHub.'
      )
    }
    const selectedAccount = getAccountForRepository(this.accounts, repository)
    if (selectedAccount !== null && selectedAccount.provider !== 'github') {
      throw new GitHubReleasesError(
        'unsupported',
        'Releases are available only for repositories hosted on GitHub.'
      )
    }
    if (!supportsReleases(gitHubRepository.endpoint)) {
      throw new GitHubReleasesError(
        'unsupported',
        'Releases are not available on this GitHub Enterprise Server version.'
      )
    }
    const account = getGitHubReleasesAccount(repository, this.accounts)
    if (account === null) {
      throw new GitHubReleasesError(
        'authentication',
        repository.accountKey === null
          ? `Sign in to ${gitHubRepository.endpoint} to manage Releases.`
          : 'Sign in with the account selected for this repository to manage Releases.'
      )
    }
    return {
      account,
      repository: gitHubRepository,
      api: this.dependencies.apiFor(account),
      generation: this.generation,
      repositoryFingerprint: repositoryFingerprint(repository),
      anonymous: false,
    }
  }

  private readContext(repository: Repository): IRequestContext {
    const authenticated = getGitHubReleasesAccount(repository, this.accounts)
    if (authenticated !== null) {
      return this.context(repository)
    }

    const gitHubRepository = repository.gitHubRepository
    const account = getGitHubReleasesReadAccount(repository, this.accounts)
    if (gitHubRepository === null || account === null) {
      // Preserve the existing endpoint/provider/authentication error details.
      return this.context(repository)
    }
    if (!supportsReleases(gitHubRepository.endpoint)) {
      return this.context(repository)
    }
    return {
      account,
      repository: gitHubRepository,
      api: this.dependencies.apiFor(account),
      generation: this.generation,
      repositoryFingerprint: repositoryFingerprint(repository),
      anonymous: true,
    }
  }

  private async run<T>(
    repository: Repository,
    operation: GitHubReleaseOperation,
    signal: AbortSignal | undefined,
    work: (context: IRequestContext, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    return await this.runWithContext(
      repository,
      operation,
      signal,
      this.context(repository),
      work
    )
  }

  private async runRead<T>(
    repository: Repository,
    operation: GitHubReleaseOperation,
    signal: AbortSignal | undefined,
    work: (context: IRequestContext, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const context = this.readContext(repository)
    return await this.runWithContext(
      repository,
      operation,
      signal,
      context,
      work
    )
  }

  private async runWithContext<T>(
    repository: Repository,
    operation: GitHubReleaseOperation,
    signal: AbortSignal | undefined,
    context: IRequestContext,
    work: (context: IRequestContext, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    this.activeControllers.add(controller)
    try {
      if (signal?.aborted) {
        controller.abort()
      }

      // GitHub answers a private repository the selected identity cannot see
      // with 404, so a Releases "not found" is as likely to be the wrong
      // account as a deleted release. Let the shared fallback try the other
      // identities signed into this same endpoint before giving up.
      const run = await runSurfaceWithRepositoryAccountFallback({
        target: releasesAccountTarget(context.repository),
        accounts: this.accounts,
        initialAccount: context.account,
        isNotFound: error => {
          const converted = githubReleasesError(error, operation)
          return (
            converted instanceof GitHubReleasesError &&
            converted.kind === 'not-found'
          )
        },
        autoSwitchEnabled:
          this.dependencies.isAutoSwitchAccountEnabled?.() ?? true,
        probe: this.dependencies.probeRepositoryAccount,
        signal: controller.signal,
        work: async account => {
          const bound = this.contextForAccount(context, account)
          const value = await work(bound, controller.signal)
          this.assertContextCurrent(repository, bound, controller.signal)
          return value
        },
      })

      this.lastUsedAccount = run.account
      return run.result
    } catch (error) {
      const converted = githubReleasesError(error, operation)
      relayRepositoryAccountFallbackAttempts(error, converted)
      throw converted
    } finally {
      signal?.removeEventListener('abort', cancel)
      this.activeControllers.delete(controller)
    }
  }

  /** Rebind a request context to another identity on the same endpoint. */
  private contextForAccount(
    context: IRequestContext,
    account: Account
  ): IRequestContext {
    if (getAccountKey(account) === getAccountKey(context.account)) {
      return context
    }

    return {
      ...context,
      account,
      api: this.dependencies.apiFor(account),
      anonymous: account.token.length === 0,
    }
  }

  /**
   * The identity the most recent Releases request actually used.
   *
   * The view shows account context already; after a fallback the account shown
   * must be the one that answered, not the one that was asked first.
   */
  public getLastUsedAccount(): Account | null {
    return this.lastUsedAccount
  }

  private assertContextCurrent(
    repository: Repository,
    context: IRequestContext,
    signal: AbortSignal
  ) {
    const account = getGitHubReleasesAccount(repository, this.accounts)
    const anonymousStillAllowed =
      context.anonymous &&
      account === null &&
      getGitHubReleasesReadAccount(repository, this.accounts)?.token === ''
    const authenticatedStillCurrent =
      !context.anonymous &&
      account !== null &&
      getAccountKey(account) === getAccountKey(context.account) &&
      account.token === context.account.token
    if (
      signal.aborted ||
      context.generation !== this.generation ||
      repositoryFingerprint(repository) !== context.repositoryFingerprint ||
      (!anonymousStillAllowed && !authenticatedStillCurrent)
    ) {
      throw abortError('The selected GitHub account or repository changed.')
    }
  }

  public createMutationReview(
    repository: Repository,
    release: IGitHubRelease,
    asset: IGitHubReleaseAsset | null = null
  ): IGitHubReleaseMutationReview {
    const context = this.context(repository)
    return Object.freeze({
      repositoryFingerprint: repositoryFingerprint(repository),
      accountKey: getAccountKey(context.account),
      accountGeneration: context.generation,
      releaseId: release.id,
      releaseFingerprint: getGitHubReleaseFingerprint(release),
      assetId: asset?.id ?? null,
      assetFingerprint:
        asset === null ? null : getGitHubReleaseAssetFingerprint(asset),
    })
  }

  private validateReviewContext(
    repository: Repository,
    context: IRequestContext,
    review: IGitHubReleaseMutationReview,
    expectsAsset: boolean
  ) {
    if (
      review.repositoryFingerprint !== repositoryFingerprint(repository) ||
      review.accountKey !== getAccountKey(context.account) ||
      review.accountGeneration !== context.generation ||
      (review.assetId !== null) !== expectsAsset ||
      (review.assetFingerprint !== null) !== expectsAsset
    ) {
      throw staleReviewError()
    }
  }

  private async revalidateReviewedRelease(
    repository: Repository,
    context: IRequestContext,
    signal: AbortSignal,
    review: IGitHubReleaseMutationReview,
    expectsAsset: boolean = false
  ): Promise<IGitHubRelease> {
    this.validateReviewContext(repository, context, review, expectsAsset)
    const release = await context.api.fetchRelease(
      context.repository.owner.login,
      context.repository.name,
      review.releaseId,
      signal
    )
    this.assertContextCurrent(repository, context, signal)
    if (getGitHubReleaseFingerprint(release) !== review.releaseFingerprint) {
      throw staleReviewError()
    }
    return release
  }

  private async revalidateReviewedAsset(
    repository: Repository,
    context: IRequestContext,
    signal: AbortSignal,
    review: IGitHubReleaseMutationReview
  ): Promise<IGitHubReleaseAsset> {
    await this.revalidateReviewedRelease(
      repository,
      context,
      signal,
      review,
      true
    )
    if (review.assetId === null || review.assetFingerprint === null) {
      throw staleReviewError()
    }
    const asset = await context.api.fetchReleaseAsset(
      context.repository.owner.login,
      context.repository.name,
      review.assetId,
      signal
    )
    this.assertContextCurrent(repository, context, signal)
    if (getGitHubReleaseAssetFingerprint(asset) !== review.assetFingerprint) {
      throw staleReviewError()
    }
    return asset
  }

  public list(
    repository: Repository,
    page: number = 1,
    signal?: AbortSignal
  ): Promise<IGitHubReleaseList> {
    return this.runRead(repository, 'list', signal, (context, requestSignal) =>
      context.api.fetchReleases(
        context.repository.owner.login,
        context.repository.name,
        page,
        requestSignal
      )
    )
  }

  /**
   * Read the complete release inventory in one bounded pass.
   *
   * The Cheap LFS batch review needs every release, not one interactive page:
   * a bucket it cannot see is a bucket it would create a second time. The
   * Releases view's "Load all releases" walks the same path so its search
   * filter runs over the whole repository rather than the first page.
   *
   * The walk never reads past `CheapLfsReleaseInventoryMaximumPages`, which is
   * the same ceiling the API layer refuses to parse beyond, and a page the
   * parser already reported as capped ends the walk as *incomplete* — a
   * truncated view is never passed off as proof that the unseen releases are
   * absent. `startPage` resumes from a page the caller already holds so an
   * interactive walk does not re-read what is on screen; the ceiling stays
   * absolute, so resuming can never push the walk past it.
   */
  public async listAll(
    repository: Repository,
    signal?: AbortSignal,
    options: IGitHubReleaseInventoryOptions = {}
  ): Promise<ICheapLfsReleaseInventory> {
    const releases = new Array<IGitHubRelease>()
    let page = Math.max(1, options.startPage ?? 1)
    while (page <= CheapLfsReleaseInventoryMaximumPages) {
      let listed
      try {
        listed = await this.list(repository, page, signal)
      } catch (error) {
        if (options.keepPartial !== true) {
          throw error
        }
        return inventory(
          releases,
          inventoryStopOutcome(error),
          error instanceof Error ? error : new Error(String(error))
        )
      }
      releases.push(...listed.releases)
      options.onPage?.({ page: listed.page, loaded: releases.length })
      if (listed.capped) {
        return inventory(releases, 'page-limit')
      }
      if (listed.nextPage === null) {
        return inventory(releases, 'complete')
      }
      page = listed.nextPage
    }
    return inventory(releases, 'page-limit')
  }

  /** Resolve one release by tag through the repository-selected account. */
  public getReleaseByTag(
    repository: Repository,
    tag: string,
    signal?: AbortSignal
  ): Promise<IGitHubRelease | null> {
    return this.runRead(
      repository,
      'list',
      signal,
      async (context, requestSignal) => {
        const exact = await context.api.fetchReleaseByTag(
          context.repository.owner.login,
          context.repository.name,
          tag,
          requestSignal
        )
        if (exact !== null) {
          return exact
        }

        // GitHub's exact tag route returns 404 for unpublished drafts, even to
        // an authenticated repository owner. The regular releases inventory
        // includes those drafts, so scan its already-bounded pagination before
        // concluding that the tag is absent. New Cheap LFS buckets are
        // published prereleases, but older app versions created drafts. Keep
        // this fallback so those legacy buckets can be promoted, reused, and
        // materialized through the UI.
        let page = 1
        while (true) {
          const inventory = await context.api.fetchReleases(
            context.repository.owner.login,
            context.repository.name,
            page,
            requestSignal
          )
          const draft = inventory.releases.find(
            candidate => candidate.tagName === tag
          )
          if (draft !== undefined) {
            return draft
          }
          if (inventory.nextPage === null) {
            return null
          }
          page = inventory.nextPage
        }
      }
    )
  }

  public listAssets(
    repository: Repository,
    releaseId: number,
    page: number = 1,
    signal?: AbortSignal
  ): Promise<IGitHubReleaseAssetList> {
    return this.runRead(
      repository,
      'list-assets',
      signal,
      (context, requestSignal) =>
        context.api.fetchReleaseAssets(
          context.repository.owner.login,
          context.repository.name,
          releaseId,
          page,
          requestSignal
        )
    )
  }

  public createDraft(
    repository: Repository,
    draft: IGitHubReleaseDraft,
    signal?: AbortSignal
  ): Promise<IGitHubRelease> {
    return this.run(repository, 'create', signal, (context, requestSignal) =>
      context.api.createReleaseDraft(
        context.repository.owner.login,
        context.repository.name,
        draft,
        requestSignal
      )
    )
  }

  public create(
    repository: Repository,
    draft: IGitHubReleaseDraft,
    publishImmediately: boolean,
    signal?: AbortSignal
  ): Promise<IGitHubRelease> {
    return this.run(repository, 'create', signal, (context, requestSignal) =>
      context.api.createRelease(
        context.repository.owner.login,
        context.repository.name,
        draft,
        publishImmediately,
        requestSignal
      )
    )
  }

  public update(
    repository: Repository,
    review: IGitHubReleaseMutationReview,
    update: IGitHubReleaseUpdate,
    signal?: AbortSignal
  ): Promise<IGitHubRelease> {
    return this.run(
      repository,
      'update',
      signal,
      async (context, requestSignal) => {
        if (update.releaseId !== review.releaseId) {
          throw staleReviewError()
        }
        await this.revalidateReviewedRelease(
          repository,
          context,
          requestSignal,
          review
        )
        this.assertContextCurrent(repository, context, requestSignal)
        return await context.api.updateRelease(
          context.repository.owner.login,
          context.repository.name,
          update,
          requestSignal
        )
      }
    )
  }

  public publish(
    repository: Repository,
    review: IGitHubReleaseMutationReview,
    signal?: AbortSignal
  ): Promise<IGitHubRelease> {
    return this.run(
      repository,
      'publish',
      signal,
      async (context, requestSignal) => {
        await this.revalidateReviewedRelease(
          repository,
          context,
          requestSignal,
          review
        )
        this.assertContextCurrent(repository, context, requestSignal)
        return await context.api.publishRelease(
          context.repository.owner.login,
          context.repository.name,
          review.releaseId,
          requestSignal
        )
      }
    )
  }

  public delete(
    repository: Repository,
    review: IGitHubReleaseMutationReview,
    signal?: AbortSignal
  ): Promise<void> {
    return this.run(
      repository,
      'delete',
      signal,
      async (context, requestSignal) => {
        await this.revalidateReviewedRelease(
          repository,
          context,
          requestSignal,
          review
        )
        this.assertContextCurrent(repository, context, requestSignal)
        await context.api.deleteRelease(
          context.repository.owner.login,
          context.repository.name,
          review.releaseId,
          requestSignal
        )
      }
    )
  }

  public deleteAsset(
    repository: Repository,
    review: IGitHubReleaseMutationReview,
    signal?: AbortSignal
  ): Promise<void> {
    return this.run(
      repository,
      'delete-asset',
      signal,
      async (context, requestSignal) => {
        const asset = await this.revalidateReviewedAsset(
          repository,
          context,
          requestSignal,
          review
        )
        this.assertContextCurrent(repository, context, requestSignal)
        await context.api.deleteReleaseAsset(
          context.repository.owner.login,
          context.repository.name,
          asset.id,
          requestSignal
        )
      }
    )
  }

  /**
   * Rewrite one reviewed asset's label without touching its name or bytes.
   * The asset is revalidated against the review first, exactly like deletion,
   * so a relabel can never land on an object that changed after it was seen.
   */
  public updateAssetLabel(
    repository: Repository,
    review: IGitHubReleaseMutationReview,
    label: string,
    signal?: AbortSignal
  ): Promise<IGitHubReleaseAsset> {
    return this.run(
      repository,
      'update-asset-label',
      signal,
      async (context, requestSignal) => {
        const asset = await this.revalidateReviewedAsset(
          repository,
          context,
          requestSignal,
          review
        )
        this.assertContextCurrent(repository, context, requestSignal)
        if (context.api.updateReleaseAsset === undefined) {
          throw new Error(
            'This GitHub endpoint does not support updating a release asset label.'
          )
        }
        return await context.api.updateReleaseAsset(
          context.repository.owner.login,
          context.repository.name,
          asset.id,
          label,
          requestSignal
        )
      }
    )
  }

  public downloadAsset(
    repository: Repository,
    releaseId: number,
    asset: IGitHubReleaseAsset,
    destination: string,
    signal: AbortSignal,
    onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void
  ) {
    return this.runRead(
      repository,
      'download',
      signal,
      (context, requestSignal) =>
        this.dependencies.downloadAsset(
          context.account,
          context.repository,
          releaseId,
          asset,
          destination,
          requestSignal,
          onProgress
        )
    )
  }

  public uploadAsset(
    repository: Repository,
    review: IGitHubReleaseMutationReview,
    sourcePath: string,
    name: string,
    label: string | null,
    signal: AbortSignal,
    onProgress?: (progress: IGitHubReleaseTransferProgressEvent) => void,
    range?: IGitHubReleaseAssetUploadRange,
    expectedDigest?: string
  ) {
    return this.run(
      repository,
      'upload',
      signal,
      async (context, requestSignal) => {
        await this.revalidateReviewedRelease(
          repository,
          context,
          requestSignal,
          review
        )
        this.assertContextCurrent(repository, context, requestSignal)
        return await this.dependencies.uploadAsset(
          context.account,
          context.repository,
          review.releaseId,
          sourcePath,
          name,
          label,
          requestSignal,
          onProgress,
          range,
          expectedDigest
        )
      }
    )
  }
}
