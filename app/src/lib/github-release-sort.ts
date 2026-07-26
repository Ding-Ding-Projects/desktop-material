import { IGitHubRelease } from './github-releases'
import { getEnum } from './local-storage'

/**
 * Ordering for the loaded release catalog.
 *
 * The sort is a pure function over the already-filtered list rather than a
 * second query, so it composes with the search bar instead of competing with
 * it: the filter decides *which* releases are shown and the sort decides only
 * the order they are shown in. Applying it after the filter also means it
 * covers everything an exhaustive "Load all releases" walk added, not just the
 * first page.
 */
export enum ReleaseSortOrder {
  /** Most recently published (or created) first — the historical default. */
  Newest = 'newest',
  Oldest = 'oldest',
}

const ReleaseSortStoragePrefix = 'release-sort/'

/**
 * The moment a release is ordered by.
 *
 * A draft has never been published, so it is ordered by when it was created.
 * Without this fallback every draft would sort as if it had no date at all and
 * drift to one end of the list regardless of the chosen order.
 */
export function releaseSortTime(release: IGitHubRelease): number {
  return (release.publishedAt ?? release.createdAt).getTime()
}

/**
 * Order a release list without mutating the caller's array.
 *
 * Ties break on the release id so the order is total and stable: two releases
 * published in the same second must not swap places between renders.
 */
export function sortReleases(
  releases: ReadonlyArray<IGitHubRelease>,
  order: ReleaseSortOrder
): ReadonlyArray<IGitHubRelease> {
  const direction = order === ReleaseSortOrder.Oldest ? 1 : -1
  return [...releases].sort((left, right) => {
    const difference = releaseSortTime(left) - releaseSortTime(right)
    return difference !== 0
      ? difference * direction
      : (left.id - right.id) * direction
  })
}

/** Read a list's persisted order, defaulting to the historical newest-first. */
export function readPersistedReleaseSortOrder(
  listId?: string
): ReleaseSortOrder {
  if (listId === undefined || typeof localStorage === 'undefined') {
    return ReleaseSortOrder.Newest
  }
  return (
    getEnum(`${ReleaseSortStoragePrefix}${listId}`, ReleaseSortOrder) ??
    ReleaseSortOrder.Newest
  )
}

/** Persist a list's order (no-op when persistence is opted out). */
export function persistReleaseSortOrder(
  listId: string | undefined,
  order: ReleaseSortOrder
) {
  if (listId === undefined || typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(`${ReleaseSortStoragePrefix}${listId}`, order)
}
