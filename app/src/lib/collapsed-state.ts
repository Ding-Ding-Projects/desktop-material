import { getBoolean, setBoolean } from './local-storage'

/**
 * Whether each collapsible surface is open, remembered per element *and* per
 * repository.
 *
 * Per element because collapsing the release metadata says nothing about
 * whether you also want the Actions filters closed — one global "collapsed"
 * flag would make every disclosure move together, which is the opposite of
 * what collapsing one of them means.
 *
 * Per repository because the answer genuinely differs between them. A
 * repository with two workflows does not need the Actions filter row taking up
 * a quarter of the pane; the one with sixty does. Sharing one setting across
 * repositories means whichever you opened last silently redecides it for all
 * the others.
 *
 * The state is a convenience, so every failure here is swallowed: a browser
 * with storage disabled gets the caller's default and a working app, not an
 * exception out of a render path.
 */

/** Prefix for every key this module owns, so they are greppable and scoped. */
const KeyPrefix = 'collapsed'

/**
 * Where a surface's state is stored.
 *
 * A repository with no stable identity yet — none selected, or one still being
 * cloned — falls back to a shared bucket rather than to no persistence at all,
 * so a surface outside any repository still remembers what you did to it.
 */
function storageKey(elementId: string, repositoryKey: string | undefined) {
  const scope =
    repositoryKey === undefined || repositoryKey.length === 0
      ? 'app'
      : repositoryKey
  return `${KeyPrefix}:${elementId}:${scope}`
}

/**
 * Reads whether a surface is expanded for this repository.
 *
 * Resolution order, and the reason for it:
 *
 *   1. what the user chose for *this* repository
 *   2. what they chose before this became per-repository (`legacyKey`)
 *   3. the caller's default
 *
 * Step 2 is what keeps an existing preference from being silently discarded
 * the first time a repository is opened after the upgrade. It is read, never
 * written back: the moment the user touches the control, their choice is
 * recorded per repository and the old key stops mattering.
 */
export function readCollapsibleState(
  elementId: string,
  repositoryKey: string | undefined,
  options: {
    readonly legacyKey?: string
    readonly defaultExpanded?: boolean
  } = {}
): boolean | undefined {
  const scoped = getBoolean(storageKey(elementId, repositoryKey))
  if (scoped !== undefined) {
    return scoped
  }
  if (options.legacyKey !== undefined) {
    const legacy = getBoolean(options.legacyKey)
    if (legacy !== undefined) {
      return legacy
    }
  }
  return options.defaultExpanded
}

/** Records whether a surface is expanded for this repository. */
export function writeCollapsibleState(
  elementId: string,
  repositoryKey: string | undefined,
  expanded: boolean
): void {
  setBoolean(storageKey(elementId, repositoryKey), expanded)
}

/**
 * The identity a repository's collapsed state is filed under.
 *
 * The path rather than the numeric id: the id is assigned by the local
 * database and changes if a repository is removed and re-added, which would
 * lose every disclosure state the user had set for it. The path is what the
 * user thinks of as "this repository".
 */
export function collapsibleRepositoryKey(
  repository: { readonly path?: string } | null | undefined
): string | undefined {
  const path = repository?.path
  return path === undefined || path.length === 0 ? undefined : path
}
