import {
  ILocalRepositoryState,
  RepositoryUpstreamState,
} from '../../../models/repository'

/**
 * A restart-surviving cache of the repository list's sidebar indicators.
 *
 * Switching repositories or reopening the app used to leave every row blank
 * until a fresh `git status` had walked each repository — on a large working
 * tree that is seconds of a list that looks like it has lost its data, for
 * information the app knew perfectly well a moment earlier.
 *
 * Only the indicator summary is cached: the changed-file *count*, the branch
 * name, and the ahead/behind pair. The changed files themselves are never
 * stored, so nothing here can reach a commit. That boundary is the whole
 * safety argument — a stale count in a list is a cosmetic error that the
 * refresh landing a moment later corrects, whereas a stale file list is a
 * wrong commit. Treat this as a hint that makes the first paint useful, never
 * as an authority.
 */

const CacheKey = 'repository-indicator-cache-v1'

/**
 * Bound what a corrupt or hand-edited cache can do. A file this small has no
 * business being large, and a runaway entry count would only slow the startup
 * it exists to speed up.
 */
const MaximumEntries = 500

function isUpstreamState(value: unknown): value is RepositoryUpstreamState {
  return (
    value === 'unknown' ||
    value === 'tracking' ||
    value === 'no-upstream' ||
    value === 'detached' ||
    value === 'unborn'
  )
}

/**
 * Validate one entry read back from storage.
 *
 * Storage is not a trusted source: it survives upgrades, it can be edited by
 * hand, and a half-written value can outlive a crash. An entry that does not
 * match the shape is dropped rather than coerced, so a malformed cache costs a
 * refresh instead of putting an impossible row in the list.
 */
function parseEntry(value: unknown): ILocalRepositoryState | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const entry = value as Record<string, unknown>

  if (
    typeof entry.changedFilesCount !== 'number' ||
    !Number.isInteger(entry.changedFilesCount) ||
    entry.changedFilesCount < 0 ||
    !isUpstreamState(entry.upstreamState)
  ) {
    return null
  }

  const branchName = entry.branchName
  const defaultBranchName = entry.defaultBranchName
  if (
    (typeof branchName !== 'string' && branchName !== null) ||
    (typeof defaultBranchName !== 'string' && defaultBranchName !== null)
  ) {
    return null
  }

  let aheadBehind: ILocalRepositoryState['aheadBehind'] = null
  if (entry.aheadBehind !== null && entry.aheadBehind !== undefined) {
    const pair = entry.aheadBehind as Record<string, unknown>
    if (
      typeof pair.ahead !== 'number' ||
      typeof pair.behind !== 'number' ||
      !Number.isInteger(pair.ahead) ||
      !Number.isInteger(pair.behind) ||
      pair.ahead < 0 ||
      pair.behind < 0
    ) {
      return null
    }
    aheadBehind = { ahead: pair.ahead, behind: pair.behind }
  }

  return {
    aheadBehind,
    upstreamState: entry.upstreamState,
    changedFilesCount: entry.changedFilesCount,
    branchName,
    defaultBranchName,
  }
}

/** Decode a stored payload into indicators, dropping anything malformed. */
export function parseIndicatorCache(
  serialized: string | null
): Map<number, ILocalRepositoryState> {
  const cache = new Map<number, ILocalRepositoryState>()

  if (serialized === null || serialized.length === 0) {
    return cache
  }

  let payload: unknown
  try {
    payload = JSON.parse(serialized)
  } catch {
    // A corrupt cache is not an error worth surfacing: the app simply
    // refreshes as it always did.
    return cache
  }

  if (typeof payload !== 'object' || payload === null) {
    return cache
  }

  for (const [key, value] of Object.entries(payload)) {
    if (cache.size >= MaximumEntries) {
      break
    }
    const id = Number(key)
    if (!Number.isInteger(id) || id <= 0) {
      continue
    }
    const entry = parseEntry(value)
    if (entry !== null) {
      cache.set(id, entry)
    }
  }

  return cache
}

/** Encode indicators for storage, bounded to {@link MaximumEntries}. */
export function serializeIndicatorCache(
  cache: ReadonlyMap<number, ILocalRepositoryState>
): string {
  const payload: Record<string, ILocalRepositoryState> = {}
  let written = 0

  for (const [id, entry] of cache) {
    if (written >= MaximumEntries) {
      break
    }
    payload[String(id)] = entry
    written++
  }

  return JSON.stringify(payload)
}

/**
 * Read the persisted indicators. Never throws: storage can be unavailable
 * (a locked profile, a private window), and a cache that cannot be read is
 * exactly as harmless as one that was empty.
 */
export function loadIndicatorCache(): Map<number, ILocalRepositoryState> {
  try {
    return parseIndicatorCache(localStorage.getItem(CacheKey))
  } catch {
    return new Map()
  }
}

/** Persist the indicators. Never throws, for the same reason. */
export function saveIndicatorCache(
  cache: ReadonlyMap<number, ILocalRepositoryState>
): void {
  try {
    localStorage.setItem(CacheKey, serializeIndicatorCache(cache))
  } catch {
    // Storage full or unavailable. The next launch just refreshes.
  }
}
