/** Keep each interactive cache page compact while remaining API-efficient. */
export const ActionsCachePageSize = 30

/** Reject accidental or hostile page values before constructing a request. */
export const ActionsCacheMaximumPage = 1_000_000

/** A safe upper bound for cache key values from the provider. */
const maximumCacheKeyLength = 512

/** A safe upper bound for branch ref values from the provider. */
const maximumRefLength = 1024

export interface IActionsCache {
  readonly id: number
  readonly key: string
  readonly ref: string | null
  readonly sizeInBytes: number
  readonly lastAccessedAt: Date
  readonly createdAt: Date
  readonly version: string | null
}

export interface IActionsCacheList {
  readonly totalCount: number
  readonly caches: ReadonlyArray<IActionsCache>
  readonly page: number
  readonly nextPage: number | null
  readonly truncated: boolean
}

export interface IActionsCacheUsage {
  readonly activeCachesSizeInBytes: number
  readonly activeCachesCount: number
}

const controlCharacters = /[\u0000-\u001f\u007f]/

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return value as Record<string, unknown>
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number = 0
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return value
}

function boundedText(
  value: unknown,
  label: string,
  maximumLength: number,
  nullable: true
): string | null
function boundedText(
  value: unknown,
  label: string,
  maximumLength: number,
  nullable?: false
): string
function boundedText(
  value: unknown,
  label: string,
  maximumLength: number,
  nullable: boolean = false
): string | null {
  if (nullable && (value === null || value === undefined)) {
    return null
  }
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    controlCharacters.test(value)
  ) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return value
}

function date(value: unknown, label: string, nullable: true): Date | null
function date(value: unknown, label: string, nullable?: false): Date
function date(
  value: unknown,
  label: string,
  nullable: boolean = false
): Date | null {
  if (nullable && (value === null || value === undefined)) {
    return null
  }
  if (typeof value !== 'string' || value.length > 64) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.valueOf())) {
    throw new Error(`GitHub returned an invalid ${label}.`)
  }
  return parsed
}

function validateActionsCachePage(page: number): void {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > ActionsCacheMaximumPage
  ) {
    throw new Error('Actions cache page request is invalid.')
  }
}

/**
 * Validate and normalize GitHub's cache list before any response reaches UI
 * state. The parser accepts only one bounded page requested by the app.
 */
export function parseActionsCacheList(
  value: unknown,
  page: number = 1
): IActionsCacheList {
  validateActionsCachePage(page)
  const input = record(value, 'cache list')
  const totalCount = safeInteger(input.total_count, 'cache count')
  if (!Array.isArray(input.actions_caches)) {
    throw new Error('GitHub returned an invalid cache list.')
  }
  if (input.actions_caches.length > ActionsCachePageSize) {
    throw new Error('GitHub returned more caches than the app requested.')
  }

  const ids = new Set<number>()
  const caches = input.actions_caches.map((value, index): IActionsCache => {
    const item = record(value, `cache at position ${index + 1}`)
    const id = safeInteger(item.id, 'cache id', 1)
    if (ids.has(id)) {
      throw new Error('GitHub returned duplicate cache ids.')
    }
    ids.add(id)

    return {
      id,
      key: boundedText(item.key, 'cache key', maximumCacheKeyLength),
      ref: boundedText(item.ref, 'cache ref', maximumRefLength, true),
      sizeInBytes: safeInteger(item.size_in_bytes, 'cache size'),
      lastAccessedAt: date(item.last_accessed_at, 'cache last access'),
      createdAt: date(item.created_at, 'cache creation date'),
      version: boundedText(
        item.version,
        'cache version',
        maximumCacheKeyLength,
        true
      ),
    }
  })

  if (totalCount < caches.length) {
    throw new Error('GitHub returned an inconsistent cache count.')
  }

  const expectedPageItems = Math.min(
    ActionsCachePageSize,
    Math.max(totalCount - (page - 1) * ActionsCachePageSize, 0)
  )
  const hasLaterPage =
    page * ActionsCachePageSize < totalCount ||
    (caches.length > 0 && caches.length < expectedPageItems)

  return {
    totalCount,
    caches,
    page,
    nextPage:
      caches.length > 0 && page < ActionsCacheMaximumPage && hasLaterPage
        ? page + 1
        : null,
    truncated: totalCount > caches.length,
  }
}

/**
 * Append a later provider page, updating duplicates that shifted between
 * requests without rendering the same cache twice.
 */
export function mergeActionsCachePage(
  existing: IActionsCacheList,
  next: IActionsCacheList
): IActionsCacheList {
  const ids = new Set(existing.caches.map(cache => cache.id))
  const merged = [...existing.caches]
  for (const cache of next.caches) {
    if (ids.has(cache.id)) {
      continue
    }
    ids.add(cache.id)
    merged.push(cache)
  }
  const totalCount = Math.max(
    existing.totalCount,
    next.totalCount,
    merged.length
  )
  return {
    totalCount,
    caches: merged,
    page: next.page,
    nextPage:
      merged.length < totalCount &&
      next.page * ActionsCachePageSize < totalCount &&
      next.page < ActionsCacheMaximumPage &&
      next.caches.length > 0
        ? next.page + 1
        : null,
    truncated: totalCount > merged.length,
  }
}

/**
 * Validate and normalize the bounded cache-usage receipt returned by the API.
 */
export function parseActionsCacheUsage(value: unknown): IActionsCacheUsage {
  const input = record(value, 'cache usage')
  return {
    activeCachesSizeInBytes: safeInteger(
      input.active_caches_size_in_bytes,
      'active cache bytes'
    ),
    activeCachesCount: safeInteger(
      input.active_caches_count,
      'active cache count'
    ),
  }
}
