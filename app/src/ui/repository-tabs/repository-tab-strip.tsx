import * as React from 'react'
import { Disposable } from 'event-kit'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Dispatcher } from '../dispatcher'
import { RepositoryTabsStore } from '../../lib/stores'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import {
  IProfileTabsState,
  IRepositoryTab,
  ITabTitleStyle,
} from '../../models/repository-tab'
import { RepositoryTab } from './repository-tab'
import { TabStyleEditor } from './tab-style-editor'
import { CloseTabsContainingPopover } from './close-tabs-containing-popover'
import { showContextualMenu } from '../../lib/menu-item'
import { FoldoutType } from '../../lib/app-state'
import { NotificationBellButton } from '../notifications/notification-bell-button'

interface IRepositoryTabStripProps {
  readonly tabsStore: RepositoryTabsStore
  readonly repositories: ReadonlyArray<Repository | CloningRepository>
  readonly dispatcher: Dispatcher
  readonly unreadNotificationCount: number
  readonly isNotificationCentreOpen: boolean
}

interface IRepositoryTabStripState {
  readonly tabs: IProfileTabsState
  readonly styleEditorTabId: string | null
  readonly styleEditorAnchor: HTMLElement | null
  readonly closeMatchingAnchor: HTMLElement | null
}

/** The browser-style repository tab strip shown above the toolbar. */
export class RepositoryTabStrip extends React.Component<
  IRepositoryTabStripProps,
  IRepositoryTabStripState
> {
  private disposable: Disposable | null = null

  public constructor(props: IRepositoryTabStripProps) {
    super(props)
    this.state = {
      tabs: props.tabsStore.getState(),
      styleEditorTabId: null,
      styleEditorAnchor: null,
      closeMatchingAnchor: null,
    }
  }

  public componentDidMount() {
    this.disposable = this.props.tabsStore.onDidUpdate(tabs =>
      this.setState({ tabs })
    )
  }

  public componentWillUnmount() {
    this.disposable?.dispose()
    this.disposable = null
  }

  private repositoryForTab(
    tab: IRepositoryTab
  ): Repository | CloningRepository | null {
    return this.props.repositories.find(r => r.id === tab.repositoryId) ?? null
  }

  private onSelect = (tab: IRepositoryTab) => {
    const repository = this.repositoryForTab(tab)
    if (repository !== null) {
      this.props.dispatcher.selectRepository(repository)
    }
    this.props.tabsStore.activateTab(tab.id)
  }

  /** Re-select the repository for the tab that became active after a close. */
  private selectActiveRepository = (activeId: string | null) => {
    if (activeId === null) {
      return
    }
    const activeTab = this.props.tabsStore
      .getState()
      .tabs.find(t => t.id === activeId)
    const repository =
      activeTab !== undefined ? this.repositoryForTab(activeTab) : null
    if (repository !== null) {
      this.props.dispatcher.selectRepository(repository)
    }
  }

  private onClose = (tab: IRepositoryTab) => {
    this.props.tabsStore
      .closeTab(tab.id)
      .then(this.selectActiveRepository)
      .catch(err => log.error('Failed to close repository tab', err))
  }

  private onCloseTabsToLeft = (tab: IRepositoryTab) => {
    this.props.tabsStore
      .closeTabsToLeft(tab.id)
      .then(this.selectActiveRepository)
      .catch(err => log.error('Failed to close tabs to the left', err))
  }

  private onCloseTabsToRight = (tab: IRepositoryTab) => {
    this.props.tabsStore
      .closeTabsToRight(tab.id)
      .then(this.selectActiveRepository)
      .catch(err => log.error('Failed to close tabs to the right', err))
  }

  private onCloseOtherTabs = (tab: IRepositoryTab) => {
    this.props.tabsStore
      .closeOtherTabs(tab.id)
      .then(this.selectActiveRepository)
      .catch(err => log.error('Failed to close other tabs', err))
  }

  private onRename = (tab: IRepositoryTab, label: string | null) => {
    this.props.tabsStore.renameTab(tab.id, label)
  }

  private onNewTab = () => {
    this.props.dispatcher.showFoldout({ type: FoldoutType.Repository })
  }

  private onToggleNotifications = () => {
    this.props.dispatcher.setNotificationCentreOpen(
      !this.props.isNotificationCentreOpen
    )
  }

  private onStyleChange = (style: ITabTitleStyle) => {
    const { styleEditorTabId } = this.state
    if (styleEditorTabId !== null) {
      this.props.tabsStore.setTabStyle(styleEditorTabId, style)
    }
  }

  private onStyleReset = () => {
    const { styleEditorTabId } = this.state
    if (styleEditorTabId !== null) {
      this.props.tabsStore.setTabStyle(styleEditorTabId, null)
    }
  }

  private onStyleEditorClose = () => {
    this.setState({ styleEditorTabId: null, styleEditorAnchor: null })
  }

  private openStyleEditor = (tab: IRepositoryTab, anchor: HTMLElement) => {
    this.setState({ styleEditorTabId: tab.id, styleEditorAnchor: anchor })
  }

  private onContextMenu = (
    tab: IRepositoryTab,
    event: React.MouseEvent<HTMLElement>
  ) => {
    event.preventDefault()
    const anchor = event.currentTarget as HTMLElement
    const { tabs } = this.state.tabs
    const index = tabs.findIndex(t => t.id === tab.id)

    showContextualMenu([
      {
        label: 'Customize Appearance…',
        action: () => this.openStyleEditor(tab, anchor),
      },
      { type: 'separator' },
      {
        label: 'Close Tab',
        action: () => this.onClose(tab),
      },
      {
        label: 'Close Tabs to the Left',
        action: () => this.onCloseTabsToLeft(tab),
        enabled: index > 0,
      },
      {
        label: 'Close Tabs to the Right',
        action: () => this.onCloseTabsToRight(tab),
        enabled: index !== -1 && index < tabs.length - 1,
      },
      {
        label: 'Close Other Tabs',
        action: () => this.onCloseOtherTabs(tab),
        enabled: tabs.length > 1,
      },
      { type: 'separator' },
      {
        label: 'Close Tabs Containing…',
        action: () => this.openCloseMatching(anchor),
        enabled: tabs.length > 0,
      },
    ])
  }

  private openCloseMatching = (anchor: HTMLElement) => {
    this.setState({ closeMatchingAnchor: anchor })
  }

  private onCloseMatchingDismiss = () => {
    this.setState({ closeMatchingAnchor: null })
  }

  private renderStyleEditor() {
    const { styleEditorTabId, styleEditorAnchor } = this.state
    if (styleEditorTabId === null) {
      return null
    }

    const tab = this.state.tabs.tabs.find(t => t.id === styleEditorTabId)
    if (tab === undefined) {
      return null
    }

    return (
      <TabStyleEditor
        tab={tab}
        anchor={styleEditorAnchor}
        onStyleChange={this.onStyleChange}
        onReset={this.onStyleReset}
        onClose={this.onStyleEditorClose}
      />
    )
  }

  private renderCloseMatchingPopover() {
    const { closeMatchingAnchor } = this.state
    if (closeMatchingAnchor === null) {
      return null
    }

    return (
      <CloseTabsContainingPopover
        tabsStore={this.props.tabsStore}
        anchor={closeMatchingAnchor}
        onClosed={this.selectActiveRepository}
        onClose={this.onCloseMatchingDismiss}
      />
    )
  }

  public render() {
    const { tabs, activeTabId } = this.state.tabs

    return (
      <div className="repository-tab-strip" role="tablist">
        <div className="repository-tab-list">
          {tabs.map(tab => (
            <RepositoryTab
              key={tab.id}
              tab={tab}
              repository={this.repositoryForTab(tab)}
              isActive={tab.id === activeTabId}
              onSelect={this.onSelect}
              onClose={this.onClose}
              onRename={this.onRename}
              onContextMenu={this.onContextMenu}
              onOpenStyleEditor={this.openStyleEditor}
            />
          ))}
        </div>
        <button
          className="repository-tab-new"
          aria-label="Open a repository in a new tab"
          onClick={this.onNewTab}
        >
          <Octicon symbol={octicons.plus} />
        </button>
        <div className="repository-tab-strip-trailing">
          <NotificationBellButton
            unreadCount={this.props.unreadNotificationCount}
            isOpen={this.props.isNotificationCentreOpen}
            onClick={this.onToggleNotifications}
          />
        </div>
        {this.renderStyleEditor()}
        {this.renderCloseMatchingPopover()}
      </div>
    )
  }
}
