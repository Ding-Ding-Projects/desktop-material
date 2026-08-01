import * as React from 'react'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { GitHubReleasesStore } from '../../lib/stores/github-releases-store'
import { TabBar } from '../tab-bar'
import { GitHubReleasesView } from '../github-releases'
import { GitHubPackagesView } from './github-packages-view'

type DistributionTab = 'releases' | 'packages'

interface IGitHubDistributionViewProps {
  readonly repository: Repository
  readonly accounts: ReadonlyArray<Account>
  readonly releasesStore: GitHubReleasesStore
  /** Re-runs sign-in when Packages is refused for a missing token scope. */
  readonly onReauthorize?: (account: Account) => void
}

interface IGitHubDistributionViewState {
  readonly activeTab: DistributionTab
}

/**
 * Keeps Releases and Packages together as repository distribution surfaces.
 * The main repository rail therefore remains stable while either surface is
 * still one keyboard action away.
 */
export class GitHubDistributionView extends React.Component<
  IGitHubDistributionViewProps,
  IGitHubDistributionViewState
> {
  public constructor(props: IGitHubDistributionViewProps) {
    super(props)
    this.state = { activeTab: 'releases' }
  }

  private onTabClicked = (index: number) => {
    this.setState({ activeTab: index === 1 ? 'packages' : 'releases' })
  }

  public render() {
    const packagesSelected = this.state.activeTab === 'packages'
    return (
      <div className="github-distribution-view">
        <header className="github-distribution-tabs">
          <span className="github-distribution-label">Distribution</span>
          <TabBar
            selectedIndex={packagesSelected ? 1 : 0}
            onTabClicked={this.onTabClicked}
          >
            <span>Releases</span>
            <span>Packages</span>
          </TabBar>
        </header>
        <section
          className="github-distribution-panel"
          role="tabpanel"
          aria-label={packagesSelected ? 'GitHub Packages' : 'GitHub Releases'}
        >
          {packagesSelected ? (
            <GitHubPackagesView
              repository={this.props.repository}
              accounts={this.props.accounts}
              onReauthorize={this.props.onReauthorize}
            />
          ) : (
            <GitHubReleasesView
              repository={this.props.repository}
              accounts={this.props.accounts}
              releasesStore={this.props.releasesStore}
            />
          )}
        </section>
      </div>
    )
  }
}
