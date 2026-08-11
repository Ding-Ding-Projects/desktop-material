import * as React from 'react'

import { MaterialSymbol } from '../lib/material-symbol'

export type RepositorySidebarView = 'list' | 'agents'

export interface IRepositorySidebarTabsProps {
  readonly activeView: RepositorySidebarView
  readonly tabListLabel: string
  readonly listLabel: string
  readonly agentsLabel: string
  readonly agentsDisabled: boolean
  readonly onViewChanged: (view: RepositorySidebarView) => void
  readonly listContent: React.ReactNode
  readonly agentsContent: React.ReactNode
}

interface IRepositorySidebarTabsState {
  readonly drawerExpanded: boolean
}

const DrawerExpandedStorageKey =
  'desktop-material.repository-sidebar.drawer-expanded-v1'

function readDrawerExpanded(): boolean {
  try {
    return window.localStorage.getItem(DrawerExpandedStorageKey) !== 'false'
  } catch {
    return true
  }
}

function writeDrawerExpanded(expanded: boolean): void {
  try {
    window.localStorage.setItem(DrawerExpandedStorageKey, String(expanded))
  } catch {
    // Storage can be unavailable in a locked-down renderer. The drawer still
    // works for the current window; only persistence is lost.
  }
}

/**
 * The repository dropdown's two top-level views.
 *
 * Both panels remain mounted so a partially entered agent-session form and the
 * repository filter survive a round trip between tabs. The native `hidden`
 * attribute keeps the inactive panel out of the accessibility tree and tab
 * order.
 */
export class RepositorySidebarTabs extends React.Component<
  IRepositorySidebarTabsProps,
  IRepositorySidebarTabsState
> {
  private readonly listTab = React.createRef<HTMLButtonElement>()
  private readonly agentsTab = React.createRef<HTMLButtonElement>()

  public constructor(props: IRepositorySidebarTabsProps) {
    super(props)
    this.state = { drawerExpanded: readDrawerExpanded() }
  }

  private select = (view: RepositorySidebarView) => {
    if (view === 'agents' && this.props.agentsDisabled) {
      return
    }
    this.props.onViewChanged(view)
  }

  private onListClick = () => this.select('list')
  private onAgentsClick = () => this.select('agents')

  private onToggleDrawer = () => {
    this.setState(state => {
      const drawerExpanded = !state.drawerExpanded
      writeDrawerExpanded(drawerExpanded)
      return { drawerExpanded }
    })
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const previousKey = this.state.drawerExpanded ? 'ArrowLeft' : 'ArrowUp'
    const nextKey = this.state.drawerExpanded ? 'ArrowRight' : 'ArrowDown'
    if (event.key !== previousKey && event.key !== nextKey) {
      return
    }

    const next: RepositorySidebarView =
      this.props.activeView === 'list' ? 'agents' : 'list'
    if (next === 'agents' && this.props.agentsDisabled) {
      return
    }

    event.preventDefault()
    this.select(next)
    const target =
      next === 'list' ? this.listTab.current : this.agentsTab.current
    target?.focus()
  }

  public render() {
    const { activeView } = this.props
    const { drawerExpanded } = this.state
    const toggleLabel = drawerExpanded
      ? 'Collapse repository drawer'
      : 'Expand repository drawer'

    return (
      <div
        className={`repository-sidebar-switcher ${
          drawerExpanded ? 'expanded' : 'collapsed'
        }`}
      >
        <button
          className="repository-sidebar-drawer-toggle"
          type="button"
          aria-label={toggleLabel}
          aria-expanded={drawerExpanded}
          aria-controls="repository-sidebar-drawer-content"
          onClick={this.onToggleDrawer}
        >
          <MaterialSymbol name="unfold_more" size={20} />
        </button>
        <div
          id="repository-sidebar-drawer-content"
          className="repository-sidebar-tabs"
          role="tablist"
          aria-label={this.props.tabListLabel}
          aria-orientation={drawerExpanded ? 'horizontal' : 'vertical'}
          tabIndex={-1}
          onKeyDown={this.onKeyDown}
        >
          <button
            ref={this.listTab}
            id="repository-sidebar-list-tab"
            className="repository-sidebar-tab"
            type="button"
            role="tab"
            aria-controls="repository-sidebar-list-panel"
            aria-selected={activeView === 'list'}
            aria-label={this.props.listLabel}
            tabIndex={activeView === 'list' ? 0 : -1}
            onClick={this.onListClick}
          >
            <MaterialSymbol name="book_2" size={20} />
            <span className="repository-sidebar-tab-label">
              {this.props.listLabel}
            </span>
          </button>
          <button
            ref={this.agentsTab}
            id="repository-sidebar-agents-tab"
            className="repository-sidebar-tab"
            type="button"
            role="tab"
            aria-controls="repository-sidebar-agents-panel"
            aria-selected={activeView === 'agents'}
            aria-disabled={this.props.agentsDisabled}
            aria-label={this.props.agentsLabel}
            disabled={this.props.agentsDisabled}
            tabIndex={activeView === 'agents' ? 0 : -1}
            onClick={this.onAgentsClick}
          >
            <MaterialSymbol name="terminal" size={20} />
            <span className="repository-sidebar-tab-label">
              {this.props.agentsLabel}
            </span>
          </button>
        </div>
        <div
          id="repository-sidebar-list-panel"
          className="repository-sidebar-panel"
          role="tabpanel"
          aria-labelledby="repository-sidebar-list-tab"
          hidden={!drawerExpanded || activeView !== 'list'}
        >
          {this.props.listContent}
        </div>
        <div
          id="repository-sidebar-agents-panel"
          className="repository-sidebar-panel"
          role="tabpanel"
          aria-labelledby="repository-sidebar-agents-tab"
          hidden={!drawerExpanded || activeView !== 'agents'}
        >
          {this.props.agentsContent}
        </div>
      </div>
    )
  }
}
