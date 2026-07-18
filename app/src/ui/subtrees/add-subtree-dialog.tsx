import * as React from 'react'

import { Account, getAccountKey } from '../../models/account'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { Repository } from '../../models/repository'
import { IAPIRepository } from '../../lib/api'
import { getPreferredGenericCloneAccountKey } from '../../lib/automation/clone-account-fallback'
import { findAccountForRemoteURL } from '../../lib/find-account'
import { getSubtreePrefixError } from '../../lib/git'
import { resolveSelectedAccount } from '../../lib/resolve-selected-account'
import { IAccountRepositories } from '../../lib/stores/api-repositories-store'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { AccountPicker } from '../account-picker'
import { CallToAction } from '../lib/call-to-action'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Loading } from '../lib/loading'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { TabBar } from '../tab-bar'
import { ClickSource } from '../lib/list'
import {
  accountMatchesCloneTab,
  CloneableRepositoryFilterList,
} from '../clone-repository'
import { PopupType } from '../../models/popup'
import { PreferencesTab } from '../../models/preferences'

type HostedTab =
  | CloneRepositoryTab.DotCom
  | CloneRepositoryTab.Enterprise
  | CloneRepositoryTab.Providers

interface IHostedTabState {
  readonly filterText: string
  readonly selectedAccount: Account | null
  readonly selectedItem: IAPIRepository | null
}

interface IAddSubtreeDialogState {
  readonly selectedTab: CloneRepositoryTab
  readonly dotCom: IHostedTabState
  readonly enterprise: IHostedTabState
  readonly providers: IHostedTabState
  readonly url: string
  readonly prefix: string
  readonly ref: string
  readonly squash: boolean
  readonly isAdding: boolean
  readonly progress: string | null
  readonly progressValue: number
  readonly error: string | null
}

export interface IAddSubtreeDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
  readonly apiRepositories: ReadonlyMap<Account, IAccountRepositories>
  readonly onRefreshRepositories: (account: Account) => void
  readonly onAdded: () => void | Promise<void>
  readonly onDismissed: () => void
}

const emptyHostedState = (): IHostedTabState => ({
  filterText: '',
  selectedAccount: null,
  selectedItem: null,
})

/**
 * Clone-style provider browser for importing one repository as a subtree.
 *
 * A lean sibling of the add-submodule dialog composed from the same exported
 * clone-repository pieces: the provider/URL {@link TabBar}, the
 * {@link AccountPicker}, and the {@link CloneableRepositoryFilterList}. The
 * lower review pane collects the subtree-specific prefix, ref, and squash
 * inputs and submits through `dispatcher.addSubtree`.
 */
export class AddSubtreeDialog extends React.Component<
  IAddSubtreeDialogProps,
  IAddSubtreeDialogState
> {
  private mounted = false

  public constructor(props: IAddSubtreeDialogProps) {
    super(props)
    this.state = {
      selectedTab: CloneRepositoryTab.DotCom,
      dotCom: emptyHostedState(),
      enterprise: emptyHostedState(),
      providers: emptyHostedState(),
      url: '',
      prefix: '',
      ref: '',
      squash: true,
      isAdding: false,
      progress: null,
      progressValue: 0,
      error: null,
    }
  }

  public componentDidMount() {
    this.mounted = true
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private getAccountsForTab(tab: HostedTab): ReadonlyArray<Account> {
    return this.props.accounts.filter(account =>
      accountMatchesCloneTab(tab, account)
    )
  }

  private getHostedState(tab: HostedTab): IHostedTabState {
    switch (tab) {
      case CloneRepositoryTab.DotCom:
        return this.state.dotCom
      case CloneRepositoryTab.Enterprise:
        return this.state.enterprise
      case CloneRepositoryTab.Providers:
        return this.state.providers
    }
  }

  private setHostedState(tab: HostedTab, update: Partial<IHostedTabState>) {
    switch (tab) {
      case CloneRepositoryTab.DotCom:
        this.setState(state => ({ dotCom: { ...state.dotCom, ...update } }))
        break
      case CloneRepositoryTab.Enterprise:
        this.setState(state => ({
          enterprise: { ...state.enterprise, ...update },
        }))
        break
      case CloneRepositoryTab.Providers:
        this.setState(state => ({
          providers: { ...state.providers, ...update },
        }))
        break
    }
  }

  private getSelectedAccount(tab: HostedTab): Account | null {
    return resolveSelectedAccount(
      this.getAccountsForTab(tab),
      this.getHostedState(tab).selectedAccount
    )
  }

  private getSelectedSource(): string {
    if (this.state.selectedTab === CloneRepositoryTab.Generic) {
      return this.state.url.trim()
    }
    return (
      this.getHostedState(this.state.selectedTab).selectedItem?.clone_url ?? ''
    )
  }

  private getSelectedAccountKey = async (
    source: string
  ): Promise<string | undefined> => {
    if (this.state.selectedTab !== CloneRepositoryTab.Generic) {
      const account = this.getSelectedAccount(this.state.selectedTab)
      return account !== null && account.token.length > 0
        ? getAccountKey(account)
        : undefined
    }

    const account = await findAccountForRemoteURL(source, this.props.accounts)
    return getPreferredGenericCloneAccountKey(
      source,
      this.props.accounts,
      account
    )
  }

  private getPrefixError(): string | null {
    const prefix = this.state.prefix.trim()
    return prefix.length === 0 ? null : getSubtreePrefixError(prefix)
  }

  private canSubmit() {
    const prefix = this.state.prefix.trim()
    return (
      !this.state.isAdding &&
      this.getSelectedSource().length > 0 &&
      prefix.length > 0 &&
      getSubtreePrefixError(prefix) === null &&
      this.state.ref.trim().length > 0
    )
  }

  private onTabClicked = (selectedTab: CloneRepositoryTab) => {
    this.setState({ selectedTab, error: null })
  }

  private getSelectedTabId() {
    switch (this.state.selectedTab) {
      case CloneRepositoryTab.DotCom:
        return 'add-subtree-dotcom-tab'
      case CloneRepositoryTab.Enterprise:
        return 'add-subtree-enterprise-tab'
      case CloneRepositoryTab.Generic:
        return 'add-subtree-url-tab'
      case CloneRepositoryTab.Providers:
        return 'add-subtree-providers-tab'
    }
  }

  private onSelectedAccountChanged = (account: Account) => {
    if (this.state.selectedTab === CloneRepositoryTab.Generic) {
      return
    }
    this.setHostedState(this.state.selectedTab, {
      selectedAccount: account,
      selectedItem: null,
    })
  }

  private onFilterTextChanged = (filterText: string) => {
    if (this.state.selectedTab !== CloneRepositoryTab.Generic) {
      this.setHostedState(this.state.selectedTab, { filterText })
    }
  }

  private onSelectionChanged = (selectedItem: IAPIRepository | null) => {
    if (this.state.selectedTab === CloneRepositoryTab.Generic) {
      return
    }
    this.setHostedState(this.state.selectedTab, { selectedItem })
    this.setState({ error: null })
  }

  private onItemClicked = (
    _repository: IAPIRepository,
    source: ClickSource
  ) => {
    if (
      source.kind === 'keyboard' &&
      source.event.key === 'Enter' &&
      this.canSubmit()
    ) {
      this.addSubtree()
    }
  }

  private onUrlChanged = (url: string) => {
    this.setState({ url, error: null })
  }

  private onPrefixChanged = (prefix: string) => {
    this.setState({ prefix, error: null })
  }

  private onRefChanged = (ref: string) => {
    this.setState({ ref, error: null })
  }

  private onSquashChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ squash: event.currentTarget.checked, error: null })
  }

  private onProgress = (progress: string, progressValue: number) => {
    if (this.mounted) {
      this.setState({
        progress: progress.trim() || 'Adding the subtree…',
        progressValue: Math.max(0, Math.min(progressValue, 1)),
      })
    }
  }

  private addSubtree = async () => {
    if (!this.canSubmit()) {
      return
    }

    const source = this.getSelectedSource()
    const prefix = this.state.prefix.trim()
    const ref = this.state.ref.trim()

    this.setState({
      isAdding: true,
      error: null,
      progress: 'Running git subtree add…',
      progressValue: 0,
    })

    try {
      const accountKey = await this.getSelectedAccountKey(source)
      await this.props.dispatcher.addSubtree(
        this.props.repository,
        prefix,
        source,
        ref,
        {
          squash: this.state.squash,
          accountKey,
          progressCallback: this.onProgress,
        }
      )
      await this.props.onAdded()
      this.props.onDismissed()
    } catch (error) {
      if (this.mounted) {
        this.setState({
          isAdding: false,
          progress: null,
          progressValue: 0,
          error:
            error instanceof Error
              ? error.message
              : 'Desktop could not add this subtree.',
        })
      }
    }
  }

  private signInDotCom = () => this.props.dispatcher.showDotComSignInDialog()
  private signInEnterprise = () =>
    this.props.dispatcher.showEnterpriseSignInDialog()
  private signInProvider = () =>
    this.props.dispatcher.showPopup({
      type: PopupType.Preferences,
      initialSelectedTab: PreferencesTab.Accounts,
    })

  private renderSignIn(tab: HostedTab) {
    switch (tab) {
      case CloneRepositoryTab.DotCom:
        return (
          <CallToAction actionTitle="Sign in" onAction={this.signInDotCom}>
            Sign in to GitHub.com to browse repositories for this subtree.
          </CallToAction>
        )
      case CloneRepositoryTab.Enterprise:
        return (
          <CallToAction actionTitle="Sign in" onAction={this.signInEnterprise}>
            Sign in to GitHub Enterprise to browse repositories for this
            subtree.
          </CallToAction>
        )
      case CloneRepositoryTab.Providers:
        return (
          <CallToAction
            actionTitle="Add provider account"
            onAction={this.signInProvider}
          >
            Add a GitLab or Bitbucket account in Settings to browse its
            repositories.
          </CallToAction>
        )
    }
  }

  private renderHostedTab(tab: HostedTab) {
    const state = this.getHostedState(tab)
    const accounts = this.getAccountsForTab(tab)
    const account = this.getSelectedAccount(tab)
    if (account === null) {
      return (
        <DialogContent className="add-subtree-sign-in">
          {this.renderSignIn(tab)}
        </DialogContent>
      )
    }

    const accountState = this.props.apiRepositories.get(account)

    return (
      <DialogContent className="add-subtree-hosted-content">
        <Row className="account-picker-row">
          <AccountPicker
            accounts={accounts}
            selectedAccount={account}
            onSelectedAccountChanged={this.onSelectedAccountChanged}
            openButtonClassName="dialog-preferred-focus"
          />
        </Row>
        <Row className="add-subtree-repository-list">
          <CloneableRepositoryFilterList
            account={account}
            selectedItem={state.selectedItem}
            onSelectionChanged={this.onSelectionChanged}
            loading={accountState?.loading === true}
            repositories={accountState?.repositories ?? null}
            filterText={state.filterText}
            onFilterTextChanged={this.onFilterTextChanged}
            onRefreshRepositories={this.props.onRefreshRepositories}
            onItemClicked={this.onItemClicked}
            filterListId="add-subtree-repositories"
            filterListLabel="Choose a repository for the subtree"
            placeholderText="Filter repositories for this subtree"
          />
        </Row>
      </DialogContent>
    )
  }

  private renderSource() {
    if (this.state.selectedTab === CloneRepositoryTab.Generic) {
      return (
        <DialogContent className="add-subtree-url-content">
          <Row>
            <TextBox
              label="Repository URL"
              placeholder="https://github.com/owner/repository.git"
              value={this.state.url}
              onValueChanged={this.onUrlChanged}
              spellcheck={false}
              autoFocus={true}
              ariaDescribedBy="add-subtree-url-help"
            />
          </Row>
          <p id="add-subtree-url-help" className="add-subtree-help">
            HTTPS, SSH, and local Git remote URLs are supported.
          </p>
        </DialogContent>
      )
    }
    return this.renderHostedTab(this.state.selectedTab)
  }

  private renderReview() {
    const prefixError = this.getPrefixError()
    const source = this.getSelectedSource()

    return (
      <DialogContent className="add-subtree-review">
        <div className="add-subtree-fields">
          <TextBox
            label="Prefix inside repository"
            placeholder="vendor/library"
            value={this.state.prefix}
            onValueChanged={this.onPrefixChanged}
            spellcheck={false}
            required={true}
            ariaDescribedBy="add-subtree-prefix-help"
          />
          <TextBox
            label="Ref"
            placeholder="main"
            value={this.state.ref}
            onValueChanged={this.onRefChanged}
            spellcheck={false}
            required={true}
            ariaDescribedBy="add-subtree-ref-help"
          />
        </div>
        <div className="add-subtree-field-help">
          <small id="add-subtree-prefix-help">
            {prefixError ??
              'A new relative path where the imported history is checked out.'}
          </small>
          <small id="add-subtree-ref-help">
            The upstream branch or tag to import, e.g. main.
          </small>
        </div>
        <div className="add-subtree-squash">
          <Checkbox
            label="Squash the imported history into one commit"
            value={this.state.squash ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onSquashChanged}
            ariaDescribedBy="add-subtree-squash-help"
          />
          <small id="add-subtree-squash-help">
            Recommended: keeps the upstream history out of this repository's log
            while still recording the imported snapshot.
          </small>
        </div>
        <section className="add-subtree-summary" aria-label="Subtree review">
          <h2>Review</h2>
          <dl>
            <div>
              <dt>Repository</dt>
              <dd>{source || 'Choose a source above'}</dd>
            </div>
            <div>
              <dt>Prefix</dt>
              <dd>{this.state.prefix.trim() || 'Not set'}</dd>
            </div>
            <div>
              <dt>Ref</dt>
              <dd>{this.state.ref.trim() || 'Not set'}</dd>
            </div>
            <div>
              <dt>History</dt>
              <dd>
                {this.state.squash ? 'Squashed' : 'Full upstream history'}
              </dd>
            </div>
          </dl>
        </section>
      </DialogContent>
    )
  }

  private renderProgress() {
    if (!this.state.isAdding) {
      return null
    }
    return (
      <div className="add-subtree-progress" role="status" aria-live="polite">
        <Loading />
        <div>
          <strong>Adding subtree</strong>
          <span>{this.state.progress}</span>
        </div>
        <progress
          aria-label="Add subtree progress"
          max={1}
          value={this.state.progressValue}
        />
      </div>
    )
  }

  public render() {
    const adding = this.state.isAdding

    return (
      <Dialog
        className="clone-repository add-subtree-dialog"
        title="Add a subtree"
        onSubmit={this.addSubtree}
        onDismissed={this.props.onDismissed}
        dismissDisabled={adding}
        loading={adding}
      >
        <TabBar
          onTabClicked={this.onTabClicked}
          selectedIndex={this.state.selectedTab}
        >
          <span id="add-subtree-dotcom-tab">GitHub.com</span>
          <span id="add-subtree-enterprise-tab">GitHub Enterprise</span>
          <span id="add-subtree-url-tab">URL</span>
          <span id="add-subtree-providers-tab">GitLab &amp; Bitbucket</span>
        </TabBar>
        {this.state.error !== null && (
          <DialogError>{this.state.error}</DialogError>
        )}
        <div
          className="add-subtree-scroll-region"
          role="tabpanel"
          aria-labelledby={this.getSelectedTabId()}
          aria-busy={adding}
        >
          <fieldset className="add-subtree-inputs" disabled={adding}>
            {this.renderSource()}
            {this.renderReview()}
          </fieldset>
        </div>
        {this.renderProgress()}
        <DialogFooter>
          <div className="button-group">
            <Button type="submit" disabled={!this.canSubmit()}>
              Add subtree
            </Button>
            <Button type="button" onClick={this.props.onDismissed}>
              Cancel
            </Button>
          </div>
        </DialogFooter>
      </Dialog>
    )
  }
}
