/**
 * The shared vocabulary for a settings navigation strip.
 *
 * Both settings dialogs navigate by a vertical strip of pages, and both had
 * outgrown the plain `TabBar` they were built on: Settings holds fourteen pages
 * in a fixed-height card that fits eight, so the rest sat below the fold behind
 * an overlay scrollbar that reserves no space and only appears once the list is
 * already moving. A strip that shows eight of fourteen and looks finished is
 * indistinguishable from a dialog that does not have the other six.
 *
 * The repository tab strip solved the same problem years earlier — overflow
 * surface, search, pinning — so the settings strips adopt its behaviour rather
 * than inventing a third answer. This module is the DOM-free half: the page
 * descriptor the strips exchange, and the pinning that persists across sessions.
 */

import * as LocalStorage from '../../lib/local-storage'

/** The four supported placements for a settings tab strip. */
export const SettingsTabDockPositions = [
  'left',
  'top',
  'bottom',
  'right',
] as const

export type SettingsTabDockPosition = typeof SettingsTabDockPositions[number]

/** Existing profiles have always rendered a left rail, so it remains the safe default. */
export const DefaultSettingsTabDockPosition: SettingsTabDockPosition = 'left'

const DockPositionKeyPrefix = 'settings-tab-dock-position'

function dockPositionKey(strip: SettingsTabStripId): string {
  return `${DockPositionKeyPrefix}.${strip}`
}

/** Treat persisted renderer storage as untrusted input. */
export function isSettingsTabDockPosition(
  value: unknown
): value is SettingsTabDockPosition {
  return (
    typeof value === 'string' &&
    (SettingsTabDockPositions as ReadonlyArray<string>).includes(value)
  )
}

export function normalizeSettingsTabDockPosition(
  value: unknown
): SettingsTabDockPosition {
  return isSettingsTabDockPosition(value)
    ? value
    : DefaultSettingsTabDockPosition
}

/** Read one surface's position, failing closed to the historical left rail. */
export function getSettingsTabDockPosition(
  strip: SettingsTabStripId
): SettingsTabDockPosition {
  try {
    return normalizeSettingsTabDockPosition(
      localStorage.getItem(dockPositionKey(strip))
    )
  } catch (e) {
    log.warn(
      'Could not read the settings tab dock position; continuing on the left.',
      e
    )
    return DefaultSettingsTabDockPosition
  }
}

/** Persist immediately: docking is a navigation preference, not a form value. */
export function setSettingsTabDockPosition(
  strip: SettingsTabStripId,
  position: SettingsTabDockPosition
): void {
  try {
    localStorage.setItem(
      dockPositionKey(strip),
      normalizeSettingsTabDockPosition(position)
    )
  } catch (e) {
    log.warn('Could not save the settings tab dock position.', e)
  }
}

/** One page in a settings navigation strip. */
export interface ISettingsTabItem {
  /**
   * Stable identity for this page, independent of its position.
   *
   * Position is not identity: a search filters the strip, so the third visible
   * row is not the third page. Every lookup here goes through this id.
   */
  readonly id: string

  /** What the row shows. May be a `<LocalizedText>`, not just a string. */
  readonly label: React.ReactNode

  /**
   * The words a search matches against.
   *
   * Separate from `label` because a label may be an element rather than text,
   * and a search has to match words the user can actually read.
   */
  readonly searchText: string

  /** Rendered before the label. Typed loosely so both dialogs' icon sets fit. */
  readonly icon?: React.ReactNode

  /** Rendered after the label — Settings uses it for search match counts. */
  readonly badge?: React.ReactNode

  /**
   * Full localized name used for compact-tab tooltips and action names.
   * `label` may be a live localized element, so callers provide the string
   * form that assistive technology and the browser tooltip can share.
   */
  readonly accessibleLabel?: string

  /**
   * Marks a Desktop Material feature page, emitted as `data-dm-feature`.
   *
   * The command palette's teleport highlight selects on that attribute, so it
   * has to survive the move off the old rail markup or "show me where this
   * lives" stops landing on anything.
   */
  readonly isFeature?: boolean

  /**
   * Dims the row while a search is running and this page owns no match,
   * emitted as `data-settings-no-match`.
   */
  readonly noSearchMatch?: boolean

  /** DOM id for the `aria-labelledby` contract the panes already rely on. */
  readonly domId?: string
}

/**
 * Which strip a preference belongs to.
 *
 * Pinning is per-strip: pinning Sound in Settings must not pin anything in
 * Repository Settings, and the two have no ids in common to confuse anyway.
 */
export type SettingsTabStripId =
  | 'preferences'
  | 'repository-settings'
  | 'stash-manager'

const PinKeyPrefix = 'settings-tab-pins'
const OpenKeyPrefix = 'settings-tab-open'

export interface ISettingsTabPersistenceOptions {
  /** Optional stable owner scope, such as one repository's absolute path. */
  readonly scope?: string
  /** Map ids written by an older build onto the current stable ids. */
  readonly legacyIdMap?: Readonly<Record<string, string>>
  /** Known ids used to discard storage garbage before the pin limit applies. */
  readonly allowedIds?: ReadonlyArray<string>
}

/**
 * A generous ceiling. Pins are a convenience, not a data store, and a strip has
 * tens of pages — anything beyond this is corruption or someone else's writes.
 */
const MaximumPins = 64

const pinKey = (strip: SettingsTabStripId, scope?: string) => {
  if (scope === undefined || scope.length === 0) {
    return `${PinKeyPrefix}.${strip}`
  }

  return `${PinKeyPrefix}.${strip}.${encodeURIComponent(scope)}`
}
const openKey = (strip: SettingsTabStripId, scope?: string) => {
  if (scope === undefined || scope.length === 0) {
    return `${OpenKeyPrefix}.${strip}`
  }

  return `${OpenKeyPrefix}.${strip}.${encodeURIComponent(scope)}`
}

/**
 * Drop anything that is not a plausible page id, then bound the list.
 *
 * Local storage is shared, writable by any other code in the renderer, and
 * survives downgrades — so it is read as untrusted input rather than as
 * something this module wrote.
 */
function normalizePins(
  ids: ReadonlyArray<string>,
  allowedIds?: ReadonlySet<string>
): ReadonlyArray<string> {
  const seen = new Set<string>()
  const out: Array<string> = []
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
      continue
    }
    if (allowedIds !== undefined && !allowedIds.has(id)) {
      continue
    }
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    out.push(id)
    if (out.length === MaximumPins) {
      break
    }
  }
  return out
}

function migrateIds(
  ids: ReadonlyArray<string>,
  legacyIdMap: Readonly<Record<string, string>> | undefined
): ReadonlyArray<string> {
  if (legacyIdMap === undefined) {
    return ids
  }

  return ids.map(id => legacyIdMap[id] ?? id)
}

function haveSameIds(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>
): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  )
}

/**
 * Read the pages currently open in a browser-style settings strip.
 *
 * `null` is deliberately different from an empty list: a missing key means a
 * first visit, where every declared page should be open, while an empty list
 * is a user who closed every page the surface allowed them to close. The
 * caller still keeps one page available so a settings surface never becomes a
 * blank dead end.
 */
export function getOpenSettingsTabs(
  strip: SettingsTabStripId,
  allowedIds?: ReadonlyArray<string>,
  options?: ISettingsTabPersistenceOptions
): ReadonlyArray<string> | null {
  try {
    const scopedKey = openKey(strip, options?.scope)
    let key = scopedKey
    let raw = localStorage.getItem(scopedKey)

    // Before browser tabs became repository-scoped, Repository Settings wrote
    // every repository into one key. Read that value once as a migration
    // source, but never write a repository-filtered list back into it.
    if (raw === null && options?.scope !== undefined) {
      key = openKey(strip)
      raw = localStorage.getItem(key)
    }

    const allowed = allowedIds === undefined ? undefined : new Set(allowedIds)
    return raw === null
      ? null
      : normalizePins(
          migrateIds(LocalStorage.getStringArray(key), options?.legacyIdMap),
          allowed
        )
  } catch (e) {
    log.warn('Could not read the open settings tabs; opening all pages.', e)
    return null
  }
}

/** Persist the browser-style settings pages that remain open. */
export function setOpenSettingsTabs(
  strip: SettingsTabStripId,
  ids: ReadonlyArray<string>,
  options?: ISettingsTabPersistenceOptions
): void {
  try {
    LocalStorage.setStringArray(
      openKey(strip, options?.scope),
      normalizePins(ids)
    )
  } catch (e) {
    log.warn('Could not save the open settings tabs.', e)
  }
}

/**
 * The pinned page ids for a strip, in the order they were pinned.
 *
 * Never throws. `LocalStorage.getStringArray` reads `localStorage.getItem`
 * outside its own try/catch, and touching `localStorage` is not always allowed
 * — a sandboxed origin or blocked site data raises `SecurityError` on the
 * property access itself. This is read from the strip's constructor, and a
 * throw in a React constructor does not degrade the component: it unmounts the
 * subtree, so the settings dialog would come up with no navigation at all.
 * That failure mode has already been paid for once in this codebase, in
 * SectionList's resize-observer guard.
 */
export function getPinnedSettingsTabs(
  strip: SettingsTabStripId,
  options?: ISettingsTabPersistenceOptions
): ReadonlyArray<string> {
  try {
    const key = pinKey(strip, options?.scope)
    const rawIds = LocalStorage.getStringArray(key)
    const normalized = normalizePins(
      migrateIds(rawIds, options?.legacyIdMap),
      options?.allowedIds === undefined
        ? undefined
        : new Set(options.allowedIds)
    )

    // Pin ids written by the old positional tab implementation need the same
    // one-time migration as open-page ids. A scoped repository key is never
    // populated from the old unscoped key: that key mixed repositories, so
    // copying it into one repository would leak another repository's choices.
    if (!haveSameIds(rawIds, normalized)) {
      try {
        LocalStorage.setStringArray(key, normalized)
      } catch (e) {
        log.warn('Could not migrate the pinned settings tabs.', e)
      }
    }

    return normalized
  } catch (e) {
    log.warn('Could not read the pinned settings tabs; continuing unpinned.', e)
    return []
  }
}

/**
 * Write pins, treating storage as something that may simply refuse.
 *
 * A pin is a convenience. Losing one is not worth an error dialog, and it is
 * certainly not worth taking the dialog down mid-click.
 */
function writePins(
  strip: SettingsTabStripId,
  ids: ReadonlyArray<string>,
  options?: ISettingsTabPersistenceOptions
) {
  try {
    LocalStorage.setStringArray(
      pinKey(strip, options?.scope),
      normalizePins(ids)
    )
  } catch (e) {
    log.warn('Could not save the pinned settings tabs.', e)
  }
}

/** Pin a page, or do nothing when it is already pinned. */
export function pinSettingsTab(
  strip: SettingsTabStripId,
  id: string,
  options?: ISettingsTabPersistenceOptions
): void {
  const pinned = getPinnedSettingsTabs(strip, options)
  if (pinned.includes(id)) {
    return
  }
  writePins(strip, [...pinned, id], options)
}

/** Unpin a page, or do nothing when it was not pinned. */
export function unpinSettingsTab(
  strip: SettingsTabStripId,
  id: string,
  options?: ISettingsTabPersistenceOptions
): void {
  writePins(
    strip,
    getPinnedSettingsTabs(strip, options).filter(pinned => pinned !== id),
    options
  )
}

/** Flip a page's pinned state and report what it became. */
export function toggleSettingsTabPin(
  strip: SettingsTabStripId,
  id: string,
  options?: ISettingsTabPersistenceOptions
): boolean {
  const willPin = !getPinnedSettingsTabs(strip, options).includes(id)
  if (willPin) {
    pinSettingsTab(strip, id, options)
  } else {
    unpinSettingsTab(strip, id, options)
  }
  return willPin
}

/**
 * Order the strip: pinned pages first, everything else in its declared order.
 *
 * Both runs keep their own relative order — pinned by when they were pinned,
 * the rest by how the dialog declared them — so the strip never reshuffles
 * under the user beyond the move they asked for. Pins naming a page that no
 * longer exists are ignored here rather than pruned, because a page can be
 * conditionally absent (the fork tab) and would lose its pin on every visit to
 * a non-fork repository.
 */
export function orderSettingsTabs<T extends ISettingsTabItem>(
  items: ReadonlyArray<T>,
  pinnedIds: ReadonlyArray<string>
): { readonly ordered: ReadonlyArray<T>; readonly pinnedCount: number } {
  if (pinnedIds.length === 0) {
    return { ordered: items, pinnedCount: 0 }
  }

  const byId = new Map(items.map(item => [item.id, item]))
  const pinned: Array<T> = []
  for (const id of pinnedIds) {
    const item = byId.get(id)
    if (item !== undefined) {
      pinned.push(item)
    }
  }

  const pinnedSet = new Set(pinned.map(item => item.id))
  const rest = items.filter(item => !pinnedSet.has(item.id))

  return { ordered: [...pinned, ...rest], pinnedCount: pinned.length }
}
