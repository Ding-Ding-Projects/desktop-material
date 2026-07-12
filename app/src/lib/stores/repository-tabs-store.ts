import { randomUUID } from 'crypto'
import { TypedBaseStore } from './base-store'
import { ProfileStore } from './profile-store'
import { Repository } from '../../models/repository'
import { matchExistingRepository } from '../repository-matching'
import {
  IProfileTabsState,
  IRepositoryTab,
  ITabTitleStyle,
  emptyProfileTabsState,
} from '../../models/repository-tab'

/**
 * Holds the browser-style repository tab strip for the active profile. Every
 * mutation is persisted through the profile store, which auto-commits it to the
 * profile's git repository.
 */
export class RepositoryTabsStore extends TypedBaseStore<IProfileTabsState> {
  private state: IProfileTabsState = emptyProfileTabsState

  public constructor(private readonly profileStore: ProfileStore) {
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
    const loaded = await this.profileStore.readTabs()
    if (loaded !== null) {
      this.state = loaded
      this.emitUpdate(this.state)
    }
  }

  /** Re-read tabs from disk (e.g. after a profile switch or history restore). */
  public async reloadFromDisk(): Promise<void> {
    const loaded = await this.profileStore.readTabs()
    this.state = loaded ?? emptyProfileTabsState
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
    await this.profileStore.writeTabs(next, description)
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
    if (!this.state.tabs.some(t => t.repositoryId === repositoryId)) {
      return
    }

    const tabs = this.state.tabs.filter(t => t.repositoryId !== repositoryId)
    let activeTabId = this.state.activeTabId
    if (activeTabId !== null && !tabs.some(t => t.id === activeTabId)) {
      activeTabId = tabs.at(-1)?.id ?? null
    }
    await this.persist(
      { tabs, activeTabId },
      'Close tabs for removed repository'
    )
  }

  public async moveTab(id: string, toIndex: number): Promise<void> {
    const from = this.state.tabs.findIndex(t => t.id === id)
    if (from === -1) {
      return
    }

    const tabs = [...this.state.tabs]
    const [moved] = tabs.splice(from, 1)
    const clamped = Math.max(0, Math.min(tabs.length, toIndex))
    tabs.splice(clamped, 0, moved)
    await this.persist({ ...this.state, tabs }, `Reorder tabs`)
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
      t.id === id ? { ...t, titleStyle: style } : t
    )
    await this.persist({ ...this.state, tabs }, 'Update tab appearance')
  }
}
