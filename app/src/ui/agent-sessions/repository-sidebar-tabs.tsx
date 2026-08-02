import * as React from 'react'

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

/**
 * The repository dropdown's two top-level views.
 *
 * Both panels remain mounted so a partially entered agent-session form and the
 * repository filter survive a round trip between tabs. The native `hidden`
 * attribute keeps the inactive panel out of the accessibility tree and tab
 * order.
 */
export class RepositorySidebarTabs extends React.Component<IRepositorySidebarTabsProps> {
  private readonly listTab = React.createRef<HTMLButtonElement>()
  private readonly agentsTab = React.createRef<HTMLButtonElement>()

  private select = (view: RepositorySidebarView) => {
    if (view === 'agents' && this.props.agentsDisabled) {
      return
    }
    this.props.onViewChanged(view)
  }

  private onListClick = () => this.select('list')
  private onAgentsClick = () => this.select('agents')

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
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

    return (
      <div className="repository-sidebar-switcher">
        <div
          className="repository-sidebar-tabs"
          role="tablist"
          aria-label={this.props.tabListLabel}
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
            tabIndex={activeView === 'list' ? 0 : -1}
            onClick={this.onListClick}
          >
            {this.props.listLabel}
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
            disabled={this.props.agentsDisabled}
            tabIndex={activeView === 'agents' ? 0 : -1}
            onClick={this.onAgentsClick}
          >
            {this.props.agentsLabel}
          </button>
        </div>
        <div
          id="repository-sidebar-list-panel"
          className="repository-sidebar-panel"
          role="tabpanel"
          aria-labelledby="repository-sidebar-list-tab"
          hidden={activeView !== 'list'}
        >
          {this.props.listContent}
        </div>
        <div
          id="repository-sidebar-agents-panel"
          className="repository-sidebar-panel"
          role="tabpanel"
          aria-labelledby="repository-sidebar-agents-tab"
          hidden={activeView !== 'agents'}
        >
          {this.props.agentsContent}
        </div>
      </div>
    )
  }
}
