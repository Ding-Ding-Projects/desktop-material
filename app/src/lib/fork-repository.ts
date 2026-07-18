import { Account } from '../models/account'
import {
  Repository,
  RepositoryWithGitHubRepository,
  isRepositoryWithForkedGitHubRepository,
  isRepositoryWithGitHubRepository,
} from '../models/repository'
import { getAccountForRepository } from './get-account-for-repository'

export type ForkRepositoryUnavailableReason =
  | 'missing'
  | 'not-github'
  | 'already-forked'
  | 'no-account'
  | 'unsupported-provider'
  | 'already-owned'

export type ForkRepositoryEligibility =
  | {
      readonly canFork: true
      readonly repository: RepositoryWithGitHubRepository
      readonly account: Account
    }
  | {
      readonly canFork: false
      readonly reason: ForkRepositoryUnavailableReason
    }

/**
 * Determine whether Desktop Material can safely offer its in-app fork flow.
 *
 * GitHub's create-fork endpoint creates a fork in the authenticated user's
 * namespace. Existing forks and repositories already owned by that user need
 * different workflows, so don't offer an action that can only fail or mutate
 * the wrong remote. The same predicate gates every visible entry point and is
 * checked again by the store before a dialog is opened.
 */
export function getForkRepositoryEligibility(
  accounts: ReadonlyArray<Account>,
  repository: Repository | null | undefined
): ForkRepositoryEligibility {
  if (repository === null || repository === undefined || repository.missing) {
    return { canFork: false, reason: 'missing' }
  }

  if (!isRepositoryWithGitHubRepository(repository)) {
    return { canFork: false, reason: 'not-github' }
  }

  if (isRepositoryWithForkedGitHubRepository(repository)) {
    return { canFork: false, reason: 'already-forked' }
  }

  const account = getAccountForRepository(accounts, repository)
  if (account === null || account.token.length === 0) {
    return { canFork: false, reason: 'no-account' }
  }

  if (account.provider !== 'github') {
    return { canFork: false, reason: 'unsupported-provider' }
  }

  if (
    account.login.localeCompare(
      repository.gitHubRepository.owner.login,
      undefined,
      {
        sensitivity: 'accent',
      }
    ) === 0
  ) {
    return { canFork: false, reason: 'already-owned' }
  }

  return { canFork: true, repository, account }
}

export function canForkRepository(
  accounts: ReadonlyArray<Account>,
  repository: Repository | null | undefined
): boolean {
  return getForkRepositoryEligibility(accounts, repository).canFork
}
