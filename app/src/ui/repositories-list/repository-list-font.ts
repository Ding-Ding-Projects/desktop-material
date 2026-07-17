import {
  getRepositoryAppearanceOverrides,
  IRepositoryLogoChangedDetail,
  RepositoryLogoChangedEvent,
} from '../../lib/appearance-customization'
import { RepositoryListFontPreference } from '../../models/appearance-customization'
import { Repository } from '../../models/repository'

const MaximumEntries = 128

/**
 * A bounded LRU of in-flight and resolved per-repository list-font reads,
 * mirroring the repository-logo loader: rows repeated across the Pinned and
 * Recent groups share one Git-config read per repository.
 *
 * Both the font and the logo live in the same `desktop-material.appearance`
 * config value, and every save of that value announces
 * {@link RepositoryLogoChangedEvent}, so listening to that one event keeps
 * this cache exactly as fresh as the logo cache.
 */
const entries = new Map<
  string,
  Promise<RepositoryListFontPreference | undefined>
>()

function invalidate(repositoryPath: string | null) {
  if (repositoryPath === null) {
    entries.clear()
  } else {
    entries.delete(repositoryPath)
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener(RepositoryLogoChangedEvent, event => {
    const detail = (event as CustomEvent<IRepositoryLogoChangedDetail>).detail
    invalidate(detail?.repositoryPath ?? null)
  })
}

/**
 * The repository's list-row font preference, or `undefined` to inherit the
 * interface font. Failed reads are evicted so a later request can recover.
 */
export function resolveRepositoryListFont(
  repository: Repository
): Promise<RepositoryListFontPreference | undefined> {
  const key = repository.path
  const cached = entries.get(key)
  if (cached !== undefined) {
    // Map insertion order gives us a compact LRU without a second index.
    entries.delete(key)
    entries.set(key, cached)
    return cached
  }

  const request = getRepositoryAppearanceOverrides(repository).then(
    overrides => overrides.repositoryListFont,
    error => {
      if (entries.get(key) === request) {
        entries.delete(key)
      }
      throw error
    }
  )

  entries.set(key, request)
  while (entries.size > MaximumEntries) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) {
      break
    }
    entries.delete(oldest)
  }

  return request
}
