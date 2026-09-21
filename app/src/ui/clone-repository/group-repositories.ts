import { IAPIRepository } from '../../lib/api'

/** The clone-list visibility scopes a repository list can be narrowed to. */
export type RepositoryVisibilityFilter = 'all' | 'public' | 'private' | 'forked'

/** Narrow a repository list to one visibility scope. */
export function filterRepositoriesByVisibility(
  repositories: ReadonlyArray<IAPIRepository>,
  filter: RepositoryVisibilityFilter
): ReadonlyArray<IAPIRepository> {
  switch (filter) {
    case 'all':
      return repositories
    case 'public':
      return repositories.filter(r => !r.private)
    case 'private':
      return repositories.filter(r => r.private)
    case 'forked':
      return repositories.filter(r => r.fork)
  }
}

/**
 * Narrow a repository list to the selected set of languages. An empty selection
 * means "no language filter" and returns the list unchanged. Matching is
 * case-insensitive; repositories without a detected language are excluded when
 * any language filter is active.
 */
export function filterRepositoriesByLanguage(
  repositories: ReadonlyArray<IAPIRepository>,
  languages: ReadonlySet<string>
): ReadonlyArray<IAPIRepository> {
  if (languages.size === 0) {
    return repositories
  }

  const selected = new Set<string>()
  for (const language of languages) {
    selected.add(language.toLowerCase())
  }

  return repositories.filter(
    r =>
      r.language !== null &&
      r.language !== undefined &&
      selected.has(r.language.toLowerCase())
  )
}
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import entries from 'lodash/entries'
import groupBy from 'lodash/groupBy'
import {
  caseInsensitiveCompare,
  caseInsensitiveEquals,
  compare,
} from '../../lib/compare'

/** The identifier for the "Your Repositories" grouping. */
export const YourRepositoriesIdentifier = 'your-repositories'

/** The ways a clone-dialog repository group can be ordered. */
export enum CloneRepositorySortOrder {
  AlphabeticalAscending = 'alphabetical-ascending',
  AlphabeticalDescending = 'alphabetical-descending',
  ModifiedNewest = 'modified-newest',
  ModifiedOldest = 'modified-oldest',
  CreatedNewest = 'created-newest',
  CreatedOldest = 'created-oldest',
  ModifiedDay = 'modified-day',
}

/** The historic clone-dialog ordering: repository name A to Z. */
export const DefaultCloneRepositorySortOrder =
  CloneRepositorySortOrder.AlphabeticalAscending

export interface ICloneableRepositoryListItem extends IFilterListItem {
  /** The identifier for the item. */
  readonly id: string

  /** The search text. */
  readonly text: ReadonlyArray<string>

  /** The name of the repository. */
  readonly name: string

  /** The icon for the repo. */
  readonly icon: OcticonSymbol

  /** The clone URL. */
  readonly url: string

  /** Whether or not the repository is archived */
  readonly archived?: boolean

  /** Whether the repository is private (drives the visibility pill). */
  readonly isPrivate: boolean

  /** Short repository description, or null/undefined when unavailable. */
  readonly description?: string | null

  /** Primary language, or null/undefined when undetermined. */
  readonly language?: string | null

  /** Star count, or undefined when the API omitted it. */
  readonly stargazers?: number

  /** Fork count, or undefined when the API omitted it. */
  readonly forks?: number

  /** On-disk size in kilobytes, or undefined when the API omitted it. */
  readonly sizeInKilobytes?: number

  /** Default branch name, or undefined when unavailable. */
  readonly defaultBranch?: string

  /** ISO-8601 last-updated timestamp, or undefined when unavailable. */
  readonly updatedAt?: string

  /** ISO-8601 creation timestamp, or undefined when unavailable. */
  readonly createdAt?: string
}

function parsedTimestamp(value: string | undefined | null): number | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function compareNames(
  left: ICloneableRepositoryListItem,
  right: ICloneableRepositoryListItem,
  descending: boolean = false
): number {
  const nameComparison = caseInsensitiveCompare(left.name, right.name)
  if (nameComparison !== 0) {
    return descending ? -nameComparison : nameComparison
  }

  // API names are case-insensitive, so use the clone URL to make ties total
  // and prevent rows from moving between renders.
  const urlComparison = compare(left.url, right.url)
  return descending ? -urlComparison : urlComparison
}

function compareTimestamp(
  left: ICloneableRepositoryListItem,
  right: ICloneableRepositoryListItem,
  field: 'updatedAt' | 'createdAt',
  newestFirst: boolean
): number {
  const leftTimestamp = parsedTimestamp(left[field])
  const rightTimestamp = parsedTimestamp(right[field])

  // An omitted or invalid timestamp is never more recent or older than a real
  // one. Keep sparse provider responses at the bottom for every date order.
  if (leftTimestamp === null || rightTimestamp === null) {
    if (leftTimestamp === rightTimestamp) {
      return compareNames(left, right)
    }
    return leftTimestamp === null ? 1 : -1
  }

  const difference = leftTimestamp - rightTimestamp
  if (difference !== 0) {
    return newestFirst ? -difference : difference
  }
  return compareNames(left, right)
}

function updatedCalendarDay(item: ICloneableRepositoryListItem): string | null {
  const timestamp = parsedTimestamp(item.updatedAt)
  if (timestamp === null) {
    return null
  }

  // Use a canonical UTC day even if a provider supplies a valid offset or a
  // non-ISO date string. This makes the ordering independent of local time.
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * Sort repositories without mutating the API list. Groups remain intact; only
 * each group's rows are ordered, so organization headings and selection keys
 * continue to work exactly as before.
 */
export function sortCloneableRepositories(
  repositories: ReadonlyArray<ICloneableRepositoryListItem>,
  order: CloneRepositorySortOrder = DefaultCloneRepositorySortOrder
): ReadonlyArray<ICloneableRepositoryListItem> {
  return [...repositories].sort((left, right) => {
    switch (order) {
      case CloneRepositorySortOrder.AlphabeticalAscending:
        return compareNames(left, right)
      case CloneRepositorySortOrder.AlphabeticalDescending:
        return compareNames(left, right, true)
      case CloneRepositorySortOrder.ModifiedNewest:
        return compareTimestamp(left, right, 'updatedAt', true)
      case CloneRepositorySortOrder.ModifiedOldest:
        return compareTimestamp(left, right, 'updatedAt', false)
      case CloneRepositorySortOrder.CreatedNewest:
        return compareTimestamp(left, right, 'createdAt', true)
      case CloneRepositorySortOrder.CreatedOldest:
        return compareTimestamp(left, right, 'createdAt', false)
      case CloneRepositorySortOrder.ModifiedDay: {
        const leftDay = updatedCalendarDay(left)
        const rightDay = updatedCalendarDay(right)
        if (leftDay === null || rightDay === null) {
          if (leftDay === rightDay) {
            return compareNames(left, right)
          }
          return leftDay === null ? 1 : -1
        }
        const dayComparison = compare(rightDay, leftDay)
        return dayComparison !== 0 ? dayComparison : compareNames(left, right)
      }
    }
  })
}

function getIcon(gitHubRepo: IAPIRepository): OcticonSymbol {
  if (gitHubRepo.private) {
    return octicons.lock
  }
  if (gitHubRepo.fork) {
    return octicons.repoForked
  }

  return octicons.repo
}

const toListItems = (
  repositories: ReadonlyArray<IAPIRepository>,
  sortOrder: CloneRepositorySortOrder
) =>
  sortCloneableRepositories(
    repositories
    .map<ICloneableRepositoryListItem>(repo => ({
      id: repo.html_url,
      text: [`${repo.owner.login}/${repo.name}`],
      url: repo.clone_url,
      name: repo.name,
      icon: getIcon(repo),
      archived: repo.archived,
      isPrivate: repo.private,
      description: repo.description,
      language: repo.language,
      stargazers: repo.stargazers_count,
      forks: repo.forks_count,
      sizeInKilobytes: repo.size,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at,
      createdAt: repo.created_at,
    })),
    sortOrder
  )

export function groupRepositories(
  repositories: ReadonlyArray<IAPIRepository>,
  login: string,
  sortOrder: CloneRepositorySortOrder = DefaultCloneRepositorySortOrder
): ReadonlyArray<IFilterListGroup<ICloneableRepositoryListItem>> {
  const groups = groupBy(repositories, x =>
    caseInsensitiveEquals(x.owner.login, login)
      ? YourRepositoriesIdentifier
      : x.owner.login
  )

  return entries(groups)
    .map(([identifier, repos]) => ({
      identifier,
      items: toListItems(repos, sortOrder),
    }))
    .sort((x, y) => {
      if (x.identifier === YourRepositoriesIdentifier) {
        return -1
      } else if (y.identifier === YourRepositoriesIdentifier) {
        return 1
      } else {
        return compare(x.identifier, y.identifier)
      }
    })
}
