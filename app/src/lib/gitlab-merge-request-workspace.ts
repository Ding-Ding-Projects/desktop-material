import { Account, AccountProvider, getAccountKey } from '../models/account'
import { Branch } from '../models/branch'
import { PullRequest } from '../models/pull-request'
import { IRemote } from '../models/remote'
import {
  getNonForkGitHubRepository,
  isRepositoryWithGitHubRepository,
  Repository,
} from '../models/repository'
import { getGitLabAPIEndpoint, getHTMLURL } from './api'
import { getAccountForRepository } from './get-account-for-repository'
import {
  getGitHubPullRequestBaseBranchName,
  getGitHubPullRequestContextVersion,
} from './github-pull-request'
import { validateGitLabMergeRequestBranch } from './gitlab-merge-request'
import { buildProviderTriageURL } from './provider-triage'

export interface IGitLabMergeRequestWorkspaceRoute {
  readonly repositoryId: string
  readonly accountKey: string
  readonly accountUserId: number
  readonly accountLogin: string
  readonly accountDisplayName: string
  readonly friendlyEndpoint: string
  readonly providerHTMLURL: string
  readonly projectPath: string
}

export interface IGitLabMergeRequestBranchContext {
  readonly sourceBranch: string | null
  readonly targetBranches: ReadonlyArray<string>
  readonly initialTargetBranch: string | null
}

function validGitLabBranch(value: string | null): string | null {
  if (value === null) {
    return null
  }
  try {
    return validateGitLabMergeRequestBranch(value, 'target branch')
  } catch {
    return null
  }
}

function accountEndpointMatches(account: Account, endpoint: string): boolean {
  if (account.provider !== 'gitlab') {
    return account.endpoint === endpoint
  }
  try {
    return (
      getGitLabAPIEndpoint(account.endpoint) === getGitLabAPIEndpoint(endpoint)
    )
  } catch {
    return false
  }
}

function accountForWorkspace(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): Account | null {
  if (repository.accountKey !== null) {
    return getAccountForRepository(accounts, repository)
  }
  const endpoint = repository.gitHubRepository?.endpoint
  if (endpoint === undefined) {
    return null
  }
  const matching = accounts.filter(account =>
    accountEndpointMatches(account, endpoint)
  )
  return matching.length === 1 ? matching[0] : null
}

/** Resolve the exact provider bound to a hosted repository. */
export function getPullRequestProviderForRepository(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): AccountProvider | null {
  const account = accountForWorkspace(repository, accounts)
  const hostedRepository = repository.gitHubRepository
  return account !== null &&
    hostedRepository !== null &&
    accountEndpointMatches(account, hostedRepository.endpoint)
    ? account.provider
    : null
}

/** Build a non-secret route for the repository-bound GitLab identity. */
export function getGitLabMergeRequestWorkspaceRoute(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): IGitLabMergeRequestWorkspaceRoute | null {
  const hostedRepository = repository.gitHubRepository
  const account = accountForWorkspace(repository, accounts)
  if (
    hostedRepository === null ||
    account === null ||
    account.provider !== 'gitlab' ||
    account.token.length === 0 ||
    !accountEndpointMatches(account, hostedRepository.endpoint)
  ) {
    return null
  }
  return {
    repositoryId: String(repository.id),
    accountKey: getAccountKey(account),
    accountUserId: account.id,
    accountLogin: account.login,
    accountDisplayName: account.friendlyName,
    friendlyEndpoint: account.friendlyEndpoint,
    providerHTMLURL: getHTMLURL(account.endpoint),
    projectPath: hostedRepository.fullName,
  }
}

/** Build an MR URL only from the exact account route and provider coordinate. */
export function getGitLabMergeRequestCanonicalURL(
  route: IGitLabMergeRequestWorkspaceRoute,
  mergeRequestIID: number
): string | null {
  const separator = route.projectPath.lastIndexOf('/')
  if (separator <= 0 || separator === route.projectPath.length - 1) {
    return null
  }
  try {
    return buildProviderTriageURL(
      'gitlab',
      route.providerHTMLURL,
      route.projectPath.slice(0, separator),
      route.projectPath.slice(separator + 1),
      'pull-request',
      mergeRequestIID
    )
  } catch {
    return null
  }
}

/**
 * Derive provider branch names only from refs associated with the exact remote.
 * The source is the published current branch; the target list is bounded later
 * by the renderer model.
 */
export function buildGitLabMergeRequestBranchContext(
  currentBranch: Branch,
  allBranches: ReadonlyArray<Branch>,
  defaultBranch: Branch | null,
  remoteName: string | null,
  initialBaseBranch?: Branch
): IGitLabMergeRequestBranchContext {
  if (remoteName === null) {
    return {
      sourceBranch: null,
      targetBranches: [],
      initialTargetBranch: null,
    }
  }

  const sourceBranch = validGitLabBranch(
    getGitHubPullRequestBaseBranchName(currentBranch, remoteName)
  )
  const targets = new Set<string>()
  for (const branch of allBranches) {
    const name = validGitLabBranch(
      getGitHubPullRequestBaseBranchName(branch, remoteName)
    )
    if (name !== null) {
      if (name !== sourceBranch) {
        targets.add(name)
      }
    }
  }

  const requested = validGitLabBranch(
    initialBaseBranch === undefined
      ? null
      : getGitHubPullRequestBaseBranchName(initialBaseBranch, remoteName)
  )
  const fallback = validGitLabBranch(
    defaultBranch === null
      ? null
      : getGitHubPullRequestBaseBranchName(defaultBranch, remoteName)
  )
  const initialTargetBranch =
    requested !== null && targets.has(requested)
      ? requested
      : fallback !== null && targets.has(fallback)
      ? fallback
      : [...targets].find(name => name !== sourceBranch) ?? null

  if (initialTargetBranch !== null) {
    targets.delete(initialTargetBranch)
  }
  return {
    sourceBranch,
    targetBranches:
      initialTargetBranch === null
        ? [...targets]
        : [initialTargetBranch, ...targets],
    initialTargetBranch,
  }
}

/** Capture every create-route input which can change during publish/push. */
export function getGitLabMergeRequestWorkspaceVersion(
  repository: Repository,
  branch: Branch,
  remote: IRemote | null,
  route: IGitLabMergeRequestWorkspaceRoute
): string {
  return JSON.stringify([
    getGitHubPullRequestContextVersion(repository, branch, remote),
    route.accountKey,
    route.projectPath,
  ])
}

/** Capture the stable repository/account route for an existing MR workspace. */
export function getGitLabMergeRequestManageVersion(
  repository: Repository,
  route: IGitLabMergeRequestWorkspaceRoute,
  mergeRequestIID: number
): string {
  return JSON.stringify([
    repository.id,
    repository.path,
    repository.hash,
    route.accountKey,
    route.projectPath,
    mergeRequestIID,
  ])
}

/** Construct the provider-correct browser URL from exact account routing. */
export function getPullRequestBrowserURL(
  repository: Repository,
  accounts: ReadonlyArray<Account>,
  pullRequest: PullRequest
): string | null {
  const account = accountForWorkspace(repository, accounts)
  const target = pullRequest.base.gitHubRepository
  if (account === null || !isRepositoryWithGitHubRepository(repository)) {
    return null
  }
  const expectedTarget = getNonForkGitHubRepository(repository)
  if (
    target.fullName !== expectedTarget.fullName ||
    !accountEndpointMatches(account, target.endpoint) ||
    !accountEndpointMatches(
      account,
      repository.gitHubRepository?.endpoint ?? ''
    )
  ) {
    return null
  }
  try {
    return buildProviderTriageURL(
      account.provider,
      getHTMLURL(account.endpoint),
      target.owner.login,
      target.name,
      'pull-request',
      pullRequest.pullRequestNumber
    )
  } catch {
    return null
  }
}
