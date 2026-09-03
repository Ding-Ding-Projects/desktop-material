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
  pinnedIds: ReadonlyArray<string>,
  orderIds?: ReadonlyArray<string>
): { readonly ordered: ReadonlyArray<T>; readonly pinnedCount: number } {
  const byId = new Map(items.map(item => [item.id, item]))
  const orderedItems: Array<T> = []
  const seen = new Set<string>()
  for (const id of orderIds ?? []) {
    const item = byId.get(id)
    if (item !== undefined && !seen.has(id)) {
      orderedItems.push(item)
      seen.add(id)
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) {
      orderedItems.push(item)
      seen.add(item.id)
    }
  }
  if (pinnedIds.length === 0) {
    return { ordered: orderedItems, pinnedCount: 0 }
  }

  const pinned: Array<T> = []
  for (const id of pinnedIds) {
    const item = byId.get(id)
    if (item !== undefined) {
      pinned.push(item)
    }
  }

  const pinnedSet = new Set(pinned.map(item => item.id))
  const rest = orderedItems.filter(item => !pinnedSet.has(item.id))

  return { ordered: [...pinned, ...rest], pinnedCount: pinned.length }
}

/**
 * Versioned browser-tab layout persisted by the Settings surfaces.
 *
 * The original implementation kept only an open list and a pin list.  Those
 * keys remain supported for downgrade and migration compatibility, while this
 * record is the single source of truth for user ordering and named groups.
 * Unknown fields are retained on read/write so a newer build can round-trip a
 * profile through an older one without losing data it does not understand.
 */
export const SettingsTabPersistenceVersion = 2

/** Hand-written contract inventory for the Settings tab surface. */
export const SettingsTabCompletenessInventory = [
  'versioned-persistence',
  'tab-order',
  'pinned-order',
  'named-groups',
  'group-membership',
  'group-order',
  'group-collapse-state',
  'group-create-rename-remove',
  'pointer-reorder',
  'keyboard-reorder',
  'current-strip-search',
  'group-search',
  'master-tab-search',
  'isolated-regex-builder',
  'pinned-overflow',
  'accessible-orientation',
  'search-result-reveal',
  'dock-picker-search',
  'settings-search-teleport',
  'command-palette-teleport',
] as const

export const SETTINGS_TAB_COMPLETENESS_INVENTORY =
  SettingsTabCompletenessInventory

/** Exact implementation boundaries exercised by the red-then-green guard. */
export const SettingsTabNegativeRegressionInventory = [
  'settings-tab-model.ts:SettingsTabPersistenceVersion',
  'settings-tab-model.ts:getSettingsTabLayout',
  'settings-tab-model.ts:malformed-layout-legacy-fallback',
  'settings-tab-model.ts:forward-compatible-fields',
  'settings-tab-model.ts:orphan-membership-rejection',
  'settings-tab-model.ts:setSettingsTabLayout',
  'settings-tab-model.ts:orderSettingsTabs',
  'settings-tab-model.ts:createSettingsTabGroup',
  'settings-tab-model.ts:renameSettingsTabGroup',
  'settings-tab-model.ts:removeSettingsTabGroup',
  'settings-tab-model.ts:setSettingsTabGroupCollapsed',
  'settings-tab-model.ts:setSettingsTabGroupMembership',
  'settings-tab-strip.tsx:SettingsTabStrip',
  'settings-tab-strip.tsx:current-strip-search',
  'settings-tab-strip.tsx:master-tab-search',
  'settings-tab-strip.tsx:group-search',
  'settings-tab-strip.tsx:pointer-reorder',
  'settings-tab-strip.tsx:keyboard-reorder',
  'settings-tab-strip.tsx:remount-pinned-order',
  'settings-tab-strip.tsx:group-pinned-partition',
  'settings-tab-strip.tsx:collapsed-selected-reveal',
  'settings-tab-strip.tsx:empty-group-management',
  'settings-tab-strip.tsx:move-out-of-group',
  'settings-tab-strip.tsx:disabled-group-interaction',
  'settings-tab-strip.tsx:invalid-regex-announcement',
  'settings-tab-strip.tsx:four-dock-orientations',
  'settings-tab-dock-control.tsx:SearchableSelect',
  'settings-tab-picker-popover.tsx:FilterModeControl',
] as const

export const SETTINGS_TAB_NEGATIVE_REGRESSION_INVENTORY =
  SettingsTabNegativeRegressionInventory

export const SettingsTabGroupColors = [
  'blue',
  'green',
  'yellow',
  'red',
  'purple',
  'grey',
] as const

export interface ISettingsTabGroup {
  readonly id: string
  readonly name: string
  readonly color?: string
  readonly isCollapsed?: boolean
  readonly [key: string]: unknown
}

export interface ISettingsTabLayoutState {
  readonly version: number
  readonly order: ReadonlyArray<string>
  readonly pinnedIds: ReadonlyArray<string>
  readonly groups: ReadonlyArray<ISettingsTabGroup>
  readonly groupOrder: ReadonlyArray<string>
  readonly membership: Readonly<Record<string, string | null>>
  readonly [key: string]: unknown
}

export interface ISettingsTabLayoutOptions
  extends ISettingsTabPersistenceOptions {
  /** Optional list of currently declared pages for read-time reconciliation. */
  readonly allowedGroupIds?: ReadonlyArray<string>
}

const LayoutKeyPrefix = 'settings-tab-layout'
const MaximumLayoutItems = 256
const MaximumGroups = 64
const MaximumGroupIdLength = 128
const MaximumGroupNameLength = 64
const SettingsGroupColors = new Set(SettingsTabGroupColors)

function layoutKey(strip: SettingsTabStripId, scope?: string): string {
  return scope === undefined || scope.length === 0
    ? `${LayoutKeyPrefix}.${strip}`
    : `${LayoutKeyPrefix}.${strip}.${encodeURIComponent(scope)}`
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeLayoutIds(
  value: unknown,
  allowedIds?: ReadonlySet<string>,
  legacyIdMap?: Readonly<Record<string, string>>
): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    return []
  }
  const output: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 128) {
      continue
    }
    const id = legacyIdMap?.[raw] ?? raw
    if (allowedIds !== undefined && !allowedIds.has(id)) {
      continue
    }
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    output.push(id)
    if (output.length >= MaximumLayoutItems) {
      break
    }
  }
  return output
}

function normalizeGroupId(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MaximumGroupIdLength
    ? value
    : null
}

/** Normalize a user-entered group label without requiring an id. */
export function normalizeSettingsTabGroupName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const name = value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MaximumGroupNameLength)
  return name.length === 0 ? null : name
}

function normalizeGroup(value: unknown): ISettingsTabGroup | null {
  if (!isRecordValue(value)) {
    return null
  }
  const id = normalizeGroupId(value.id)
  const name = normalizeSettingsTabGroupName(value.name) ?? ''
  if (id === null || name.length === 0) {
    return null
  }
  const group: Record<string, unknown> = { ...value, id, name }
  if (
    typeof value.color !== 'string' ||
    !SettingsGroupColors.has(value.color)
  ) {
    delete group.color
  }
  if (typeof value.isCollapsed !== 'boolean') {
    delete group.isCollapsed
  }
  return group as ISettingsTabGroup
}

function normalizeGroups(
  value: unknown,
  allowedGroupIds?: ReadonlySet<string>
): ReadonlyArray<ISettingsTabGroup> {
  if (!Array.isArray(value)) {
    return []
  }
  const output: ISettingsTabGroup[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    const group = normalizeGroup(raw)
    if (
      group === null ||
      seen.has(group.id) ||
      (allowedGroupIds !== undefined && !allowedGroupIds.has(group.id))
    ) {
      continue
    }
    seen.add(group.id)
    output.push(group)
    if (output.length >= MaximumGroups) {
      break
    }
  }
  return output
}

function normalizeLayout(
  value: unknown,
  options?: ISettingsTabLayoutOptions
): ISettingsTabLayoutState | null {
  if (!isRecordValue(value)) {
    return null
  }
  if (
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    value.version > SettingsTabPersistenceVersion
  ) {
    return null
  }
  const allowedIds =
    options?.allowedIds === undefined ? undefined : new Set(options.allowedIds)
  const allowedGroupIds =
    options?.allowedGroupIds === undefined
      ? undefined
      : new Set(options.allowedGroupIds)
  const groups = normalizeGroups(value.groups, allowedGroupIds)
  const groupIds = new Set(groups.map(group => group.id))
  const groupOrder = normalizeLayoutIds(value.groupOrder, groupIds)
  const orderedGroupIds = [
    ...groupOrder,
    ...groups.map(group => group.id).filter(id => !groupOrder.includes(id)),
  ]
  const membership: Record<string, string | null> = {}
  if (isRecordValue(value.membership)) {
    for (const [tabId, rawGroupId] of Object.entries(value.membership)) {
      if (
        tabId.length <= 128 &&
        (allowedIds === undefined || allowedIds.has(tabId)) &&
        (rawGroupId === null ||
          (typeof rawGroupId === 'string' && groupIds.has(rawGroupId)))
      ) {
        membership[tabId] = rawGroupId
      }
    }
  }
  const normalized: Record<string, unknown> = { ...value }
  normalized.version = SettingsTabPersistenceVersion
  normalized.order = normalizeLayoutIds(
    value.order,
    allowedIds,
    options?.legacyIdMap
  )
  normalized.pinnedIds = normalizeLayoutIds(
    value.pinnedIds,
    allowedIds,
    options?.legacyIdMap
  )
  normalized.groups = groups
  normalized.groupOrder = orderedGroupIds
  normalized.membership = membership
  return normalized as ISettingsTabLayoutState
}

/** Read a complete settings-tab layout, migrating the legacy split keys. */
export function getSettingsTabLayout(
  strip: SettingsTabStripId,
  options?: ISettingsTabLayoutOptions
): ISettingsTabLayoutState {
  try {
    const key = layoutKey(strip, options?.scope)
    const raw = localStorage.getItem(key)
    let parsed: unknown = null
    if (raw !== null) {
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        // A malformed current record must fall back to the valid split keys.
        parsed = null
      }
    }
    const normalized = normalizeLayout(parsed, options)
    if (normalized !== null) {
      return normalized
    }

    const allowed = options?.allowedIds
    const legacyOrder = getOpenSettingsTabs(strip, allowed, options)
    const order = normalizeLayoutIds(
      legacyOrder ?? allowed ?? [],
      allowed === undefined ? undefined : new Set(allowed),
      options?.legacyIdMap
    )
    const migrated: ISettingsTabLayoutState = {
      version: SettingsTabPersistenceVersion,
      order,
      pinnedIds: getPinnedSettingsTabs(strip, options),
      groups: [],
      groupOrder: [],
      membership: {},
    }
    if (raw === null) {
      setSettingsTabLayout(strip, migrated, options)
    }
    return migrated
  } catch (e) {
    log.warn('Could not read the settings tab layout; using declared order.', e)
    return {
      version: SettingsTabPersistenceVersion,
      order: options?.allowedIds ?? [],
      pinnedIds: [],
      groups: [],
      groupOrder: [],
      membership: {},
    }
  }
}

/** Persist the complete settings-tab layout as one versioned record. */
export function setSettingsTabLayout(
  strip: SettingsTabStripId,
  layout: ISettingsTabLayoutState,
  options?: ISettingsTabLayoutOptions
): void {
  try {
    const normalized = normalizeLayout(layout, options)
    if (normalized !== null) {
      localStorage.setItem(
        layoutKey(strip, options?.scope),
        JSON.stringify(normalized)
      )
    }
  } catch (e) {
    log.warn('Could not save the settings tab layout.', e)
  }
}

export function getSettingsTabOrder(
  strip: SettingsTabStripId,
  options?: ISettingsTabLayoutOptions
): ReadonlyArray<string> {
  return getSettingsTabLayout(strip, options).order
}

export function setSettingsTabOrder(
  strip: SettingsTabStripId,
  order: ReadonlyArray<string>,
  options?: ISettingsTabLayoutOptions
): void {
  const layout = getSettingsTabLayout(strip, options)
  setSettingsTabLayout(strip, { ...layout, order }, options)
}

/** Order items by the persisted order, then apply the protected pin region. */
export function orderSettingsTabsByLayout<T extends ISettingsTabItem>(
  items: ReadonlyArray<T>,
  pinnedIds: ReadonlyArray<string>,
  orderIds: ReadonlyArray<string>
): { readonly ordered: ReadonlyArray<T>; readonly pinnedCount: number } {
  return orderSettingsTabs(items, pinnedIds, orderIds)
}

/** Move one id within its current ordering, preserving the pinned boundary. */
export function reorderSettingsTab(
  strip: SettingsTabStripId,
  id: string,
  targetIndex: number,
  options?: ISettingsTabLayoutOptions
): ReadonlyArray<string> {
  const layout = getSettingsTabLayout(strip, options)
  if (layout.pinnedIds.includes(id)) {
    const pinnedIds = layout.pinnedIds.filter(candidate => candidate !== id)
    const bounded = Math.max(0, Math.min(targetIndex, pinnedIds.length))
    pinnedIds.splice(bounded, 0, id)
    setSettingsTabLayout(strip, { ...layout, pinnedIds }, options)
    return layout.order
  }
  const order = layout.order.filter(candidate => candidate !== id)
  const bounded = Math.max(0, Math.min(targetIndex, order.length))
  order.splice(bounded, 0, id)
  setSettingsTabOrder(strip, order, options)
  return order
}

/** Reorder only the protected pinned region, preserving ordinary tab order. */
export function reorderSettingsTabPinnedOrder(
  strip: SettingsTabStripId,
  id: string,
  targetIndex: number,
  options?: ISettingsTabLayoutOptions
): ReadonlyArray<string> {
  const layout = getSettingsTabLayout(strip, options)
  if (!layout.pinnedIds.includes(id)) {
    return layout.pinnedIds
  }
  const pinnedIds = layout.pinnedIds.filter(candidate => candidate !== id)
  pinnedIds.splice(Math.max(0, Math.min(targetIndex, pinnedIds.length)), 0, id)
  setSettingsTabLayout(strip, { ...layout, pinnedIds }, options)
  return pinnedIds
}

export function getSettingsTabGroups(
  strip: SettingsTabStripId,
  options?: ISettingsTabLayoutOptions
): ReadonlyArray<ISettingsTabGroup> {
  return getSettingsTabLayout(strip, options).groups
}

export function setSettingsTabGroups(
  strip: SettingsTabStripId,
  groups: ReadonlyArray<ISettingsTabGroup>,
  options?: ISettingsTabLayoutOptions
): void {
  const layout = getSettingsTabLayout(strip, options)
  setSettingsTabLayout(strip, { ...layout, groups }, options)
}

export function createSettingsTabGroup(
  strip: SettingsTabStripId,
  group: ISettingsTabGroup,
  options?: ISettingsTabLayoutOptions
): ISettingsTabGroup | null {
  const normalized = normalizeGroup(group)
  if (normalized === null) {
    return null
  }
  const layout = getSettingsTabLayout(strip, options)
  if (layout.groups.some(candidate => candidate.id === normalized.id)) {
    return null
  }
  setSettingsTabLayout(
    strip,
    {
      ...layout,
      groups: [...layout.groups, normalized],
      groupOrder: [...layout.groupOrder, normalized.id],
    },
    options
  )
  return normalized
}

export function renameSettingsTabGroup(
  strip: SettingsTabStripId,
  id: string,
  name: string,
  options?: ISettingsTabLayoutOptions
): boolean {
  const normalizedName = normalizeSettingsTabGroupName(name)
  const layout = getSettingsTabLayout(strip, options)
  const nextName = normalizedName
  if (nextName === null) {
    return false
  }
  const groups = layout.groups.map(group =>
    group.id === id ? { ...group, name: nextName } : group
  )
  if (!layout.groups.some(group => group.id === id)) {
    return false
  }
  setSettingsTabLayout(strip, { ...layout, groups }, options)
  return true
}

export function removeSettingsTabGroup(
  strip: SettingsTabStripId,
  id: string,
  options?: ISettingsTabLayoutOptions
): boolean {
  const layout = getSettingsTabLayout(strip, options)
  if (!layout.groups.some(group => group.id === id)) {
    return false
  }
  setSettingsTabLayout(
    strip,
    {
      ...layout,
      groups: layout.groups.filter(group => group.id !== id),
      groupOrder: layout.groupOrder.filter(groupId => groupId !== id),
    },
    options
  )
  return true
}

export function setSettingsTabGroupCollapsed(
  strip: SettingsTabStripId,
  id: string,
  isCollapsed: boolean,
  options?: ISettingsTabLayoutOptions
): boolean {
  const layout = getSettingsTabLayout(strip, options)
  if (!layout.groups.some(group => group.id === id)) {
    return false
  }
  setSettingsTabLayout(
    strip,
    {
      ...layout,
      groups: layout.groups.map(group =>
        group.id === id ? { ...group, isCollapsed } : group
      ),
    },
    options
  )
  return true
}

/** Assign a page to a group, or null to leave all groups. */
export function setSettingsTabGroupMembership(
  strip: SettingsTabStripId,
  tabId: string,
  groupId: string | null,
  options?: ISettingsTabLayoutOptions
): ReadonlyArray<string> {
  const layout = getSettingsTabLayout(strip, options)
  if (typeof tabId !== 'string' || tabId.length === 0 || tabId.length > 128) {
    return layout.order
  }
  const membership: Record<string, string | null> = {
    ...layout.membership,
  }
  const validGroup =
    groupId === null || layout.groups.some(group => group.id === groupId)
  membership[tabId] = validGroup ? groupId : null
  setSettingsTabLayout(strip, { ...layout, membership }, options)
  return layout.order
}

export function getSettingsTabGroupMembership(
  strip: SettingsTabStripId,
  options?: ISettingsTabLayoutOptions
): Readonly<Record<string, string | null>> {
  return getSettingsTabLayout(strip, options).membership
}

export function reorderSettingsTabGroup(
  strip: SettingsTabStripId,
  groupId: string,
  targetIndex: number,
  options?: ISettingsTabLayoutOptions
): ReadonlyArray<string> {
  const layout = getSettingsTabLayout(strip, options)
  const order = layout.groupOrder.filter(id => id !== groupId)
  const bounded = Math.max(0, Math.min(targetIndex, order.length))
  order.splice(bounded, 0, groupId)
  setSettingsTabLayout(strip, { ...layout, groupOrder: order }, options)
  return order
}
