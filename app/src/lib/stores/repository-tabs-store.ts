import { randomUUID } from 'crypto'
import { TypedBaseStore } from './base-store'
import { ProfileStore } from './profile-store'
import { Repository } from '../../models/repository'
import { matchExistingRepository } from '../repository-matching'
import { FilterMode, matchWithMode } from '../fuzzy-find'
import {
  IProfileTabsState,
  IRepositoryTab,
  ITabTitleStyle,
  emptyProfileTabsState,
} from '../../models/repository-tab'
import { PrimaryWindowScope } from '../window-scope'

/** Additional repository names/aliases that may be searched for a tab. */
export type RepositoryTabMatchKeyResolver = (
  tab: IRepositoryTab
) => ReadonlyArray<string>

/** Resolve the visible label used by one-shot alphabetical arrangement. */
export type RepositoryTabLabelResolver = (tab: IRepositoryTab) => string

/** Resolve a stable repository-status rank (lower means more attention). */
export type RepositoryTabStatusRankResolver = (tab: IRepositoryTab) => number

export type RepositoryTabLabelOrder = 'ascending' | 'descending'
export type RepositoryTabOpenedOrder = 'newest' | 'oldest'
export type RepositoryTabStatusOrder = 'needs-attention-first' | 'clean-first'

export interface ICloseTabsExceptPreview {
  /** Tabs containing the literal query in at least one searchable key. */
  readonly matchingTabs: ReadonlyArray<IRepositoryTab>
  /** Tabs that survive because they match or are protected by pinning. */
  readonly keptTabs: ReadonlyArray<IRepositoryTab>
  /** Unpinned tabs that will be closed by confirmation. */
  readonly closedTabs: ReadonlyArray<IRepositoryTab>
  /** False for empty/zero-match/zero-close previews. */
  readonly canClose: boolean
}

/** The final path segment of a repository path (its folder name). */
function tabBaseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const match = /[^\\/]+$/.exec(trimmed)
  return match !== null ? match[0] : trimmed
}

/**
 * The searchable keys for a tab: its custom label (when set) plus the
 * repository folder name, matching what the tab strip renders as the label.
 */
function tabMatchKeys(tab: IRepositoryTab): ReadonlyArray<string> {
  const name = tabBaseName(tab.repositoryPath)
  return tab.customLabel !== null
    ? [tab.customLabel, name, tab.repositoryPath]
    : [name, tab.repositoryPath]
}

/** Keep the pinned group before the unpinned group without disturbing ties. */
function groupPinnedTabs(
  tabs: ReadonlyArray<IRepositoryTab>
): ReadonlyArray<IRepositoryTab> {
  return [
    ...tabs.filter(tab => tab.isPinned === true),
    ...tabs.filter(tab => tab.isPinned !== true),
  ]
}

/** Sort each pin group independently so sorting never crosses its boundary. */
function stableSortPinGroups(
  tabs: ReadonlyArray<IRepositoryTab>,
  compare: (left: IRepositoryTab, right: IRepositoryTab) => number
): ReadonlyArray<IRepositoryTab> {
  const stableSort = (group: ReadonlyArray<IRepositoryTab>) =>
    group
      .map((tab, index) => ({ tab, index }))
      .sort(
        (left, right) =>
          compare(left.tab, right.tab) || left.index - right.index
      )
      .map(item => item.tab)

  return [
    ...stableSort(tabs.filter(tab => tab.isPinned === true)),
    ...stableSort(tabs.filter(tab => tab.isPinned !== true)),
  ]
}

/**
 * Holds the browser-style repository tab strip for the active profile. Every
 * mutation is persisted through the profile store, which auto-commits it to the
 * profile's git repository.
 */
export class RepositoryTabsStore extends TypedBaseStore<IProfileTabsState> {
  private state: IProfileTabsState = emptyProfileTabsState

  public constructor(
    private readonly profileStore: ProfileStore,
    private readonly windowScope: string = PrimaryWindowScope,
    private readonly now: () => number = Date.now
  ) {
    super()
  }

  public getState(): IProfileTabsState {
    return this.state
  }

  public getActiveTab(): IRepositoryTab | null {
    return this.state.tabs.find(t => t.id === this.state.activeTabId) ?? null
  }

  /** Load persisted tabs for the active profile. */
  public async initialize(): Promise<void> {
    const loaded = await this.profileStore.readTabs(this.windowScope)
    if (loaded !== null) {
      this.state = { ...loaded, tabs: groupPinnedTabs(loaded.tabs) }
      this.emitUpdate(this.state)
    }
  }

  /** Re-read tabs from disk (e.g. after a profile switch or history restore). */
  public async reloadFromDisk(): Promise<void> {
    const loaded = await this.profileStore.readTabs(this.windowScope)
    this.state =
      loaded === null
        ? emptyProfileTabsState
        : { ...loaded, tabs: groupPinnedTabs(loaded.tabs) }
    this.emitUpdate(this.state)
  }

  /**
   * Reconnect a restored active tab when repository database ids have changed.
   * This is intentionally in-memory: a later tab mutation will persist the
   * corrected id, while an Undo remains redoable immediately after reload.
   */
  public rebindActiveTabToRepository(repository: Repository): void {
    const activeTab = this.getActiveTab()
    if (
      activeTab === null ||
      activeTab.repositoryId === repository.id ||
      matchExistingRepository(
        [{ path: activeTab.repositoryPath }],
        repository.path
      ) === undefined
    ) {
      return
    }

    this.state = {
      ...this.state,
      tabs: this.state.tabs.map(tab =>
        tab.id === activeTab.id
          ? {
              ...tab,
              repositoryId: repository.id,
              repositoryPath: repository.path,
            }
          : tab
      ),
    }
    this.emitUpdate(this.state)
  }

  private async persist(
    next: IProfileTabsState,
    description: string
  ): Promise<void> {
    this.state = next
    this.emitUpdate(this.state)
    await this.profileStore.writeTabs(next, description, this.windowScope)
  }

  /**
   * Activate the tab for a repository, opening a new tab if none exists.
   * Idempotent: a no-op when the repository's tab is already active, so it is
   * safe to call from every repository-selection entry point.
   */
  public async ensureTabForRepository(repository: Repository): Promise<void> {
    const existing = this.state.tabs.find(t => t.repositoryId === repository.id)
    if (existing !== undefined) {
      if (this.state.activeTabId !== existing.id) {
        await this.persist(
          { ...this.state, activeTabId: existing.id },
          `Activate tab: ${existing.customLabel ?? repository.name}`
        )
      }
      return
    }

    const tab: IRepositoryTab = {
      id: randomUUID(),
      repositoryId: repository.id,
      repositoryPath: repository.path,
      customLabel: null,
      titleStyle: null,
      openedAt: this.now(),
    }
    await this.persist(
      { tabs: [...this.state.tabs, tab], activeTabId: tab.id },
      `Open tab: ${repository.name}`
    )
  }

  public async activateTab(id: string): Promise<void> {
    if (
      this.state.activeTabId === id ||
      !this.state.tabs.some(t => t.id === id)
    ) {
      return
    }
    await this.persist({ ...this.state, activeTabId: id }, 'Switch tab')
  }

  /** Close a tab; returns the id of the tab that should become active. */
  public async closeTab(id: string): Promise<string | null> {
    const index = this.state.tabs.findIndex(t => t.id === id)
    if (index === -1) {
      return this.state.activeTabId
    }

    const closed = this.state.tabs[index]
    const tabs = this.state.tabs.filter(t => t.id !== id)
    let activeTabId = this.state.activeTabId
    if (activeTabId === id) {
      const neighbor = tabs[index] ?? tabs[index - 1] ?? null
      activeTabId = neighbor?.id ?? null
    }

    await this.persist(
      { tabs, activeTabId },
      `Close tab: ${closed.customLabel ?? '#' + closed.repositoryId}`
    )
    return activeTabId
  }

  /** Close every tab bound to a repository (e.g. when it is removed). */
  public async closeTabsForRepository(repositoryId: number): Promise<void> {
    const ids = new Set(
      this.state.tabs
        .filter(t => t.repositoryId === repositoryId)
        .map(t => t.id)
    )
    if (ids.size === 0) {
      return
    }
    await this.closeTabsByIds(ids, 'Close tabs for removed repository', false)
  }

  /**
   * Pick the tab that should become active after `removedActiveId` is closed:
   * the nearest survivor to its right, else to its left, using the pre-close
   * ordering. Returns null when nothing survives.
   */
  private pickNeighbor(
    oldTabs: ReadonlyArray<IRepositoryTab>,
    survivors: ReadonlySet<string>,
    removedActiveId: string
  ): string | null {
    if (survivors.size === 0) {
      return null
    }
    const from = oldTabs.findIndex(t => t.id === removedActiveId)
    for (let i = from + 1; i < oldTabs.length; i++) {
      if (survivors.has(oldTabs[i].id)) {
        return oldTabs[i].id
      }
    }
    for (let i = from - 1; i >= 0; i--) {
      if (survivors.has(oldTabs[i].id)) {
        return oldTabs[i].id
      }
    }
    return null
  }

  /**
   * Close every tab whose id is in `ids`, reactivating a sensible neighbor when
   * the active tab is among them. Returns the id of the tab that should become
   * active (or null when the strip is now empty).
   */
  private async closeTabsByIds(
    ids: ReadonlySet<string>,
    description: string,
    protectPinned = true
  ): Promise<string | null> {
    if (ids.size === 0) {
      return this.state.activeTabId
    }

    const oldTabs = this.state.tabs
    // Pinned tabs are protected from every user bulk-close path. Repository
    // removal passes protectPinned=false so it cannot leave an orphan binding;
    // closeTab(id) remains the user's explicit single-tab override.
    const closableIds = new Set(
      oldTabs
        .filter(
          tab => ids.has(tab.id) && (!protectPinned || tab.isPinned !== true)
        )
        .map(tab => tab.id)
    )
    if (closableIds.size === 0) {
      return this.state.activeTabId
    }
    const tabs = oldTabs.filter(t => !closableIds.has(t.id))
    if (tabs.length === oldTabs.length) {
      return this.state.activeTabId
    }

    let activeTabId = this.state.activeTabId
    if (activeTabId !== null && closableIds.has(activeTabId)) {
      const survivors = new Set(tabs.map(t => t.id))
      activeTabId = this.pickNeighbor(oldTabs, survivors, activeTabId)
    }

    await this.persist({ tabs, activeTabId }, description)
    return activeTabId
  }

  /** Close every tab positioned before `id`. Returns the new active tab id. */
  public async closeTabsToLeft(id: string): Promise<string | null> {
    const index = this.state.tabs.findIndex(t => t.id === id)
    if (index <= 0) {
      return this.state.activeTabId
    }
    const ids = new Set(this.state.tabs.slice(0, index).map(t => t.id))
    return this.closeTabsByIds(ids, 'Close tabs to the left')
  }

  /** Close every tab positioned after `id`. Returns the new active tab id. */
  public async closeTabsToRight(id: string): Promise<string | null> {
    const index = this.state.tabs.findIndex(t => t.id === id)
    if (index === -1 || index >= this.state.tabs.length - 1) {
      return this.state.activeTabId
    }
    const ids = new Set(this.state.tabs.slice(index + 1).map(t => t.id))
    return this.closeTabsByIds(ids, 'Close tabs to the right')
  }

  /** Close every tab except `id`. Returns the new active tab id. */
  public async closeOtherTabs(id: string): Promise<string | null> {
    if (!this.state.tabs.some(t => t.id === id)) {
      return this.state.activeTabId
    }
    const ids = new Set(this.state.tabs.filter(t => t.id !== id).map(t => t.id))
    return this.closeTabsByIds(ids, 'Close other tabs')
  }

  /**
   * Preview which tabs a "close tabs containing" query would close, reusing
   * {@link matchWithMode}. An invalid (or over-long) regex matches nothing: the
   * `regexError` is surfaced for the UI while the returned list stays empty so a
   * confirm is a safe no-op.
   */
  public findMatchingTabs(
    query: string,
    mode: FilterMode,
    caseSensitive = false
  ): {
    readonly tabs: ReadonlyArray<IRepositoryTab>
    readonly regexError: string | null
  } {
    if (query.length === 0) {
      return { tabs: [], regexError: null }
    }

    const result = matchWithMode(query, this.state.tabs, tabMatchKeys, {
      mode,
      caseSensitive,
    })

    if (result.regexError !== null) {
      return { tabs: [], regexError: result.regexError }
    }

    return { tabs: result.results.map(r => r.item), regexError: null }
  }

  /**
   * Close every tab whose label or repository name matches `query` under the
   * given {@link FilterMode}. An invalid regex is a no-op. Returns the new
   * active tab id.
   */
  public async closeTabsMatching(
    query: string,
    mode: FilterMode,
    caseSensitive = false
  ): Promise<string | null> {
    const { tabs } = this.findMatchingTabs(query, mode, caseSensitive)
    if (tabs.length === 0) {
      return this.state.activeTabId
    }
    const ids = new Set(tabs.map(t => t.id))
    return this.closeTabsByIds(ids, `Close tabs matching “${query}”`)
  }

  /**
   * Preview the inverse bulk-close action using a case-insensitive literal
   * substring. Default keys cover the visible fallback label and local path;
   * callers may safely add repository aliases/names without enabling regex or
   * interpreting any user-controlled syntax.
   */
  public previewCloseTabsExceptContaining(
    query: string,
    resolveAdditionalKeys?: RepositoryTabMatchKeyResolver
  ): ICloseTabsExceptPreview {
    const literal = query.trim().toLowerCase()
    if (literal.length === 0) {
      return {
        matchingTabs: [],
        keptTabs: [...this.state.tabs],
        closedTabs: [],
        canClose: false,
      }
    }

    const matchingTabs = this.state.tabs.filter(tab => {
      const additionalKeys = resolveAdditionalKeys?.(tab) ?? []
      return [...tabMatchKeys(tab), ...additionalKeys].some(
        key => typeof key === 'string' && key.toLowerCase().includes(literal)
      )
    })

    // Never turn an invalid/zero-match query into a close-all operation.
    if (matchingTabs.length === 0) {
      return {
        matchingTabs: [],
        keptTabs: [...this.state.tabs],
        closedTabs: [],
        canClose: false,
      }
    }

    const matchingIds = new Set(matchingTabs.map(tab => tab.id))
    const closedTabs = this.state.tabs.filter(
      tab => !matchingIds.has(tab.id) && tab.isPinned !== true
    )
    const closedIds = new Set(closedTabs.map(tab => tab.id))
    const keptTabs = this.state.tabs.filter(tab => !closedIds.has(tab.id))
    return {
      matchingTabs,
      keptTabs,
      closedTabs,
      canClose: closedTabs.length > 0,
    }
  }

  /** Close every unpinned tab except those containing the literal query. */
  public async closeTabsExceptContaining(
    query: string,
    resolveAdditionalKeys?: RepositoryTabMatchKeyResolver
  ): Promise<string | null> {
    const preview = this.previewCloseTabsExceptContaining(
      query,
      resolveAdditionalKeys
    )
    if (!preview.canClose) {
      return this.state.activeTabId
    }
    return this.closeTabsByIds(
      new Set(preview.closedTabs.map(tab => tab.id)),
      `Close tabs except those containing “${query.trim()}”`
    )
  }

  public async moveTab(id: string, toIndex: number): Promise<void> {
    const from = this.state.tabs.findIndex(t => t.id === id)
    if (from === -1) {
      return
    }

    const tabs = [...this.state.tabs]
    const [moved] = tabs.splice(from, 1)
    const pinnedCount = tabs.filter(tab => tab.isPinned === true).length
    const minimum = moved.isPinned === true ? 0 : pinnedCount
    const maximum = moved.isPinned === true ? pinnedCount : tabs.length
    const clamped = Math.max(minimum, Math.min(maximum, toIndex))
    if (clamped === from) {
      return
    }
    tabs.splice(clamped, 0, moved)
    await this.persist({ ...this.state, tabs }, `Reorder tabs`)
  }

  /** Pin/unpin a tab and move it to the nearest edge of its new group. */
  public async setTabPinned(id: string, isPinned: boolean): Promise<void> {
    const index = this.state.tabs.findIndex(tab => tab.id === id)
    const current = this.state.tabs[index]
    if (current === undefined || (current.isPinned === true) === isPinned) {
      return
    }

    const tabs = [...this.state.tabs]
    tabs.splice(index, 1)
    const moved = { ...current, isPinned }
    const pinnedCount = tabs.filter(tab => tab.isPinned === true).length
    tabs.splice(pinnedCount, 0, moved)
    await this.persist(
      { ...this.state, tabs },
      isPinned ? 'Pin tab' : 'Unpin tab'
    )
  }

  public async toggleTabPinned(id: string): Promise<void> {
    const tab = this.state.tabs.find(candidate => candidate.id === id)
    if (tab !== undefined) {
      await this.setTabPinned(id, tab.isPinned !== true)
    }
  }

  /** One-shot stable A→Z or Z→A arrangement inside each pin group. */
  public async arrangeTabsByLabel(
    order: RepositoryTabLabelOrder,
    resolveLabel: RepositoryTabLabelResolver = tab =>
      tab.customLabel ?? tabBaseName(tab.repositoryPath)
  ): Promise<void> {
    // A fixed locale makes the locale-aware comparison deterministic across
    // machines while numeric collation keeps labels such as Repo 2 / Repo 10
    // in the order users expect.
    const collator = new Intl.Collator('en', {
      sensitivity: 'base',
      numeric: true,
    })
    const direction = order === 'ascending' ? 1 : -1
    const tabs = stableSortPinGroups(
      this.state.tabs,
      (left, right) =>
        direction * collator.compare(resolveLabel(left), resolveLabel(right))
    )
    await this.persist({ ...this.state, tabs }, 'Arrange tabs by label')
  }

  /** One-shot stable newest/oldest arrangement inside each pin group. */
  public async arrangeTabsByOpenedAt(
    order: RepositoryTabOpenedOrder
  ): Promise<void> {
    const direction = order === 'oldest' ? 1 : -1
    const openedAt = (tab: IRepositoryTab) =>
      tab.openedAt !== undefined && Number.isFinite(tab.openedAt)
        ? tab.openedAt
        : Number.NEGATIVE_INFINITY
    const tabs = stableSortPinGroups(
      this.state.tabs,
      (left, right) => direction * (openedAt(left) - openedAt(right))
    )
    await this.persist({ ...this.state, tabs }, `Arrange tabs by ${order}`)
  }

  /**
   * One-shot stable status arrangement. The caller supplies the documented
   * provider-neutral rank (conflict/error/unavailable, changed, remote
   * divergence, clean); lower ranks mean more attention is required.
   */
  public async arrangeTabsByRepositoryStatus(
    order: RepositoryTabStatusOrder,
    resolveRank: RepositoryTabStatusRankResolver
  ): Promise<void> {
    const direction = order === 'needs-attention-first' ? 1 : -1
    const safeRank = (tab: IRepositoryTab) => {
      const rank = resolveRank(tab)
      return Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER
    }
    const tabs = stableSortPinGroups(
      this.state.tabs,
      (left, right) => direction * (safeRank(left) - safeRank(right))
    )
    await this.persist({ ...this.state, tabs }, 'Arrange tabs by status')
  }

  public async renameTab(id: string, label: string | null): Promise<void> {
    const trimmed =
      label !== null && label.trim().length > 0 ? label.trim() : null
    const tabs = this.state.tabs.map(t =>
      t.id === id ? { ...t, customLabel: trimmed } : t
    )
    await this.persist(
      { ...this.state, tabs },
      trimmed !== null ? `Rename tab to ${trimmed}` : 'Clear tab label'
    )
  }

  public async setTabStyle(
    id: string,
    style: ITabTitleStyle | null
  ): Promise<void> {
    const tabs = this.state.tabs.map(t =>
      t.id === id
        ? {
            ...t,
            titleStyle:
              style === null ? null : { ...(t.titleStyle ?? {}), ...style },
          }
        : t
    )
    await this.persist({ ...this.state, tabs }, 'Update tab appearance')
  }
}
