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
export type SettingsTabStripId = 'preferences' | 'repository-settings'

const PinKeyPrefix = 'settings-tab-pins'

/**
 * A generous ceiling. Pins are a convenience, not a data store, and a strip has
 * tens of pages — anything beyond this is corruption or someone else's writes.
 */
const MaximumPins = 64

const pinKey = (strip: SettingsTabStripId) => `${PinKeyPrefix}.${strip}`

/**
 * Drop anything that is not a plausible page id, then bound the list.
 *
 * Local storage is shared, writable by any other code in the renderer, and
 * survives downgrades — so it is read as untrusted input rather than as
 * something this module wrote.
 */
function normalizePins(ids: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>()
  const out: Array<string> = []
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
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
  strip: SettingsTabStripId
): ReadonlyArray<string> {
  try {
    return normalizePins(LocalStorage.getStringArray(pinKey(strip)))
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
function writePins(strip: SettingsTabStripId, ids: ReadonlyArray<string>) {
  try {
    LocalStorage.setStringArray(pinKey(strip), normalizePins(ids))
  } catch (e) {
    log.warn('Could not save the pinned settings tabs.', e)
  }
}

/** Pin a page, or do nothing when it is already pinned. */
export function pinSettingsTab(strip: SettingsTabStripId, id: string): void {
  const pinned = getPinnedSettingsTabs(strip)
  if (pinned.includes(id)) {
    return
  }
  writePins(strip, [...pinned, id])
}

/** Unpin a page, or do nothing when it was not pinned. */
export function unpinSettingsTab(strip: SettingsTabStripId, id: string): void {
  writePins(
    strip,
    getPinnedSettingsTabs(strip).filter(pinned => pinned !== id)
  )
}

/** Flip a page's pinned state and report what it became. */
export function toggleSettingsTabPin(
  strip: SettingsTabStripId,
  id: string
): boolean {
  const willPin = !getPinnedSettingsTabs(strip).includes(id)
  if (willPin) {
    pinSettingsTab(strip, id)
  } else {
    unpinSettingsTab(strip, id)
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
