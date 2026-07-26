import { getBoolean } from './local-storage'

/**
 * The single source of truth for the `autoSwitchAccountToRepositoryOwner`
 * preference.
 *
 * The preference began life as "follow the selected repository's owning
 * account", and the shared account fallback reuses it verbatim rather than
 * introducing a second, competing switch: both answer the same user question —
 * *may Desktop Material change which identity it acts as without asking me?*
 * With it on, a repository that a different signed-in account can see is simply
 * retried under that account. With it off, nothing switches silently; the user
 * is offered a one-click action instead.
 *
 * The key and default previously lived as private constants inside `app-store`
 * and were re-declared as literals by tests and by any other reader. Exporting
 * them here keeps every consumer on one spelling.
 */
export const autoSwitchAccountToRepositoryOwnerKey =
  'autoSwitchAccountToRepositoryOwner'

/** Following the repository's owning account is on unless the user opts out. */
export const autoSwitchAccountToRepositoryOwnerDefault = true

/**
 * Read the preference directly from persisted settings.
 *
 * Intended for collaborators that have no app-store handle, such as the
 * account-bound API stores. `app-store` keeps its own cached copy for render
 * state; both read the same key, so they cannot disagree.
 */
export function getAutoSwitchAccountToRepositoryOwner(): boolean {
  return getBoolean(
    autoSwitchAccountToRepositoryOwnerKey,
    autoSwitchAccountToRepositoryOwnerDefault
  )
}
