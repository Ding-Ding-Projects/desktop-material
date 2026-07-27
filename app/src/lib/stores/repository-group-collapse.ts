import * as LocalStorage from '../local-storage'

/**
 * Which repository-list groups the user has folded away.
 *
 * The value is deliberately a *registered profile setting* (see
 * `profile-settings-registry.ts`): writing it puts the collapsed set into the
 * profile's `settings.json`, which the Git-backed profile store snapshots,
 * commits, and exposes in Settings history. Collapsing a group is therefore an
 * ordinary, diffable, undoable settings change rather than an invisible
 * localStorage-only preference.
 *
 * Nothing here ever touches a user's own repository. The stored identity is the
 * repository *group* key produced by `getGroupKey`, not a path.
 */
export const CollapsedRepositoryGroupsKey = 'repository-list-collapsed-groups'

/**
 * Upper bound on the persisted set. Group keys are derived from owners, hosts,
 * and user-chosen group names, so the set is naturally small; the cap exists so
 * a corrupted or tampered value cannot grow the settings snapshot without limit.
 */
export const MaximumCollapsedRepositoryGroups = 500

/** Longest accepted single group key; `getGroupKey` output is far shorter. */
const MaximumGroupKeyLength = 512

/**
 * Repair anything the stored value might have become: non-strings, blanks,
 * duplicates, absurd lengths, and unbounded growth. Sorted so the settings diff
 * a user reads in Settings history reflects *what* changed rather than the
 * order in which groups happened to be toggled.
 */
function normalizeGroupKeys(
  keys: ReadonlyArray<unknown>
): ReadonlyArray<string> {
  const normalized = new Set<string>()

  for (const key of keys) {
    if (typeof key !== 'string') {
      continue
    }
    const trimmed = key.trim()
    if (trimmed.length === 0 || trimmed.length > MaximumGroupKeyLength) {
      continue
    }
    normalized.add(trimmed)
    if (normalized.size >= MaximumCollapsedRepositoryGroups) {
      break
    }
  }

  return [...normalized].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
}

/** Group keys currently persisted as collapsed, repaired and sorted. */
export function getCollapsedRepositoryGroups(): ReadonlyArray<string> {
  return normalizeGroupKeys(
    LocalStorage.getStringArray(CollapsedRepositoryGroupsKey)
  )
}

/**
 * Persist the collapsed set and return exactly what was stored.
 *
 * The write is synchronous and idempotent; committing it to profile history is
 * the caller's job (see `Dispatcher.recordRepositoryGroupCollapseChange`), which
 * is what lets a burst of toggles coalesce into one history entry.
 */
export function setCollapsedRepositoryGroups(
  keys: ReadonlyArray<string>
): ReadonlyArray<string> {
  const normalized = normalizeGroupKeys(keys)
  LocalStorage.setStringArray(CollapsedRepositoryGroupsKey, normalized)
  return normalized
}

/** Add or remove one group key, returning the new persisted set. */
export function setRepositoryGroupCollapsed(
  groupKey: string,
  collapsed: boolean
): ReadonlyArray<string> {
  const current = getCollapsedRepositoryGroups()
  const next = collapsed
    ? [...current, groupKey]
    : current.filter(key => key !== groupKey)
  return setCollapsedRepositoryGroups(next)
}

/**
 * Whether a group renders folded right now.
 *
 * `filterActive` is the safety valve behind the rule that a search hit is never
 * silently swallowed: while the list is being filtered every group renders
 * expanded, so a match can never end up hidden inside a fold. The persisted
 * set is untouched, so clearing the filter restores exactly what the user
 * folded.
 */
export function isRepositoryGroupCollapsed(
  collapsedKeys: ReadonlyArray<string>,
  groupKey: string,
  filterActive: boolean
): boolean {
  return !filterActive && collapsedKeys.includes(groupKey)
}

/**
 * How many of the currently rendered groups were force-expanded by an active
 * filter. Zero when nothing is filtered or nothing was folded; used to tell the
 * user, in words, why their folds opened.
 */
export function countAutoExpandedRepositoryGroups(
  renderedGroupKeys: ReadonlyArray<string>,
  collapsedKeys: ReadonlyArray<string>,
  filterActive: boolean
): number {
  if (!filterActive) {
    return 0
  }

  const collapsed = new Set(collapsedKeys)
  return renderedGroupKeys.filter(key => collapsed.has(key)).length
}

/** Whether filter text narrows the list at all (whitespace is not a filter). */
export function isRepositoryFilterActive(filterText: string): boolean {
  return filterText.trim().length > 0
}
