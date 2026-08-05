import * as React from 'react'
import classNames from 'classnames'
import {
  Account,
  getAccountKey,
  isBitbucketAccount,
  isDotComAccount,
  isEnterpriseAccount,
  isGitLabAccount,
} from '../../models/account'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IAvatarUser } from '../../models/avatar'
import { lookupPreferredEmail } from '../../lib/email'
import { assertNever } from '../../lib/fatal-error'
import { getProviderAuthErrorMessage } from '../../lib/provider-auth-error'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { DialogContent, DialogPreferredFocusClassName } from '../dialog'
import { Avatar } from '../lib/avatar'
import { CallToAction } from '../lib/call-to-action'
import { TextBox } from '../lib/text-box'
import { PasswordTextBox } from '../lib/password-text-box'
import {
  deleteJiraCredential,
  deleteTrelloCredential,
  setJiraCredential,
  setTrelloCredential,
} from '../../lib/issue-trackers/issue-tracker-credentials'
import {
  fetchJiraMyself,
  IJiraUser,
  JiraAuthMode,
} from '../../lib/issue-trackers/jira-client'
import {
  fetchTrelloMember,
  ITrelloMember,
} from '../../lib/issue-trackers/trello-client'
import { getIssueTrackerAuthErrorMessage } from '../../lib/issue-trackers/issue-tracker-auth-error'
import { IssueTrackerReference } from './issue-tracker-reference'

interface IAccountsProps {
  readonly accounts: ReadonlyArray<Account>

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onProviderSignIn: (
    provider: 'gitlab' | 'bitbucket',
    endpoint: string,
    token: string
  ) => Promise<Account>
  readonly onLogout: (account: Account) => void

  /** Called when the user makes the given signed-in account active. */
  readonly onMakeActive: (account: Account) => void

  /** Opens a validated issue-tracker item without exposing credentials. */
  readonly onOpenInBrowser: (url: string) => Promise<boolean>
}

interface IAccountsState {
  readonly gitLabEndpoint: string
  readonly gitLabToken: string
  readonly bitbucketUsername: string
  readonly bitbucketAppPassword: string
  readonly authenticatingProvider: 'gitlab' | 'bitbucket' | null
  readonly providerError: string | null
  readonly providerErrorFor: 'gitlab' | 'bitbucket' | null

  readonly jiraMode: JiraAuthMode
  readonly jiraEndpoint: string
  readonly jiraEmail: string
  readonly jiraToken: string
  readonly jiraConnecting: boolean
  readonly jiraConnectedUser: IJiraUser | null
  readonly jiraError: string | null

  readonly trelloEndpoint: string
  readonly trelloKey: string
  readonly trelloToken: string
  readonly trelloConnecting: boolean
  readonly trelloConnectedMember: ITrelloMember | null
  readonly trelloError: string | null
}

enum SignInType {
  DotCom,
  Enterprise,
}

export class Accounts extends React.Component<IAccountsProps, IAccountsState> {
  public state: IAccountsState = {
    gitLabEndpoint: 'https://gitlab.com',
    gitLabToken: '',
    bitbucketUsername: '',
    bitbucketAppPassword: '',
    authenticatingProvider: null,
    providerError: null,
    providerErrorFor: null,

    jiraMode: 'basic-email-token',
    jiraEndpoint: 'https://team.atlassian.net',
    jiraEmail: '',
    jiraToken: '',
    jiraConnecting: false,
    jiraConnectedUser: null,
    jiraError: null,

    trelloEndpoint: 'https://api.trello.com',
    trelloKey: '',
    trelloToken: '',
    trelloConnecting: false,
    trelloConnectedMember: null,
    trelloError: null,
  }

  public render() {
    return (
      <DialogContent className="accounts-tab">
        <section className="account-section" aria-labelledby="dotcom-accounts">
          <div className="account-section-header">
            <div>
              <h2 id="dotcom-accounts">GitHub.com accounts</h2>
              <p>Switch identities without signing out of your other work.</p>
            </div>
          </div>
          {this.renderMultipleDotComAccounts()}
        </section>

        <section
          className="account-section"
          aria-labelledby="enterprise-accounts"
        >
          <div className="account-section-header">
            <div>
              <h2 id="enterprise-accounts">GitHub Enterprise accounts</h2>
              <p>Connect every organization and Enterprise host you use.</p>
            </div>
          </div>
          {this.renderMultipleEnterpriseAccounts()}
        </section>

        {this.renderGitLabAccounts()}
        {this.renderBitbucketAccounts()}
        {this.renderJiraAccounts()}
        {this.renderTrelloAccounts()}
      </DialogContent>
    )
  }

  private renderJiraAccounts() {
    const loading = this.state.jiraConnecting
    const isCloud = this.state.jiraMode === 'basic-email-token'
    return (
      <section className="account-section" aria-labelledby="jira-accounts">
        <div className="account-section-header">
          <div>
            <h2 id="jira-accounts">Jira</h2>
            <p>
              Connect Jira Cloud with an account email and API token, or Jira
              Data Center / the Git Integration for Jira app with a personal
              access token.
            </p>
          </div>
        </div>
        {this.state.jiraConnectedUser !== null && (
          <div className="account-card-list">
            <Row className="account-info account-card">
              <div className="user-info-container">
                <div className="user-info">
                  <div className="name">
                    {this.state.jiraConnectedUser.displayName || 'Jira user'}
                  </div>
                  <div className="login">{this.state.jiraEndpoint}</div>
                </div>
                <span className="account-active-chip">
                  <Octicon
                    className="account-active-check"
                    symbol={octicons.check}
                  />
                  Connected
                </span>
              </div>
              <Button onClick={this.disconnectJira}>Disconnect</Button>
            </Row>
          </div>
        )}
        <IssueTrackerReference
          provider={
            this.state.jiraMode === 'basic-email-token'
              ? 'jira-cloud'
              : 'jira-data-center'
          }
          endpoint={this.state.jiraEndpoint.trim()}
          accountId={this.state.jiraConnectedUser?.accountId ?? null}
          connected={this.state.jiraConnectedUser !== null}
          onOpenInBrowser={this.props.onOpenInBrowser}
        />
        <div className="provider-sign-in-card">
          <Row>
            <label htmlFor="jira-mode-select">Jira deployment</label>
            <select
              id="jira-mode-select"
              value={this.state.jiraMode}
              disabled={loading}
              onChange={this.onJiraModeChanged}
            >
              <option value="basic-email-token">
                Jira Cloud (email + API token)
              </option>
              <option value="bearer-token">
                Jira Data Center / Git Integration for Jira (personal access
                token)
              </option>
            </select>
          </Row>
          <TextBox
            label="Jira server"
            placeholder="https://team.atlassian.net"
            value={this.state.jiraEndpoint}
            disabled={loading}
            onValueChanged={this.onJiraEndpointChanged}
          />
          {isCloud && (
            <TextBox
              label="Account email"
              placeholder="you@example.com"
              value={this.state.jiraEmail}
              disabled={loading}
              onValueChanged={this.onJiraEmailChanged}
            />
          )}
          <PasswordTextBox
            label={isCloud ? 'API token' : 'Personal access token'}
            placeholder={isCloud ? 'Jira API token' : 'Jira PAT'}
            value={this.state.jiraToken}
            disabled={loading}
            onValueChanged={this.onJiraTokenChanged}
          />
          <Button
            onClick={this.connectJira}
            disabled={
              loading ||
              this.state.jiraEndpoint.trim().length === 0 ||
              this.state.jiraToken.length === 0 ||
              (isCloud && this.state.jiraEmail.trim().length === 0)
            }
          >
            {loading ? 'Connecting…' : 'Connect Jira'}
          </Button>
        </div>
        {this.state.jiraError !== null && !loading && (
          <p className="provider-sign-in-error" role="alert">
            {this.state.jiraError}
          </p>
        )}
      </section>
    )
  }

  private renderTrelloAccounts() {
    const loading = this.state.trelloConnecting
    return (
      <section className="account-section" aria-labelledby="trello-accounts">
        <div className="account-section-header">
          <div>
            <h2 id="trello-accounts">Trello</h2>
            <p>Connect Trello with an application key and a member token.</p>
          </div>
        </div>
        {this.state.trelloConnectedMember !== null && (
          <div className="account-card-list">
            <Row className="account-info account-card">
              <div className="user-info-container">
                <div className="user-info">
                  <div className="name">
                    {this.state.trelloConnectedMember.fullName ||
                      `@${this.state.trelloConnectedMember.username}`}
                  </div>
                  <div className="login">
                    @{this.state.trelloConnectedMember.username}
                  </div>
                </div>
                <span className="account-active-chip">
                  <Octicon
                    className="account-active-check"
                    symbol={octicons.check}
                  />
                  Connected
                </span>
              </div>
              <Button onClick={this.disconnectTrello}>Disconnect</Button>
            </Row>
          </div>
        )}
        <IssueTrackerReference
          provider="trello"
          endpoint={this.state.trelloEndpoint.trim()}
          accountId={this.state.trelloConnectedMember?.id ?? null}
          connected={this.state.trelloConnectedMember !== null}
          onOpenInBrowser={this.props.onOpenInBrowser}
        />
        <div className="provider-sign-in-card">
          <TextBox
            label="Trello API server"
            placeholder="https://api.trello.com"
            value={this.state.trelloEndpoint}
            disabled={loading}
            onValueChanged={this.onTrelloEndpointChanged}
          />
          <TextBox
            label="API key"
            placeholder="Trello application key"
            value={this.state.trelloKey}
            disabled={loading}
            onValueChanged={this.onTrelloKeyChanged}
          />
          <PasswordTextBox
            label="Token"
            placeholder="Trello member token"
            value={this.state.trelloToken}
            disabled={loading}
            onValueChanged={this.onTrelloTokenChanged}
          />
          <Button
            onClick={this.connectTrello}
            disabled={
              loading ||
              this.state.trelloEndpoint.trim().length === 0 ||
              this.state.trelloKey.trim().length === 0 ||
              this.state.trelloToken.length === 0
            }
          >
            {loading ? 'Connecting…' : 'Connect Trello'}
          </Button>
        </div>
        {this.state.trelloError !== null && !loading && (
          <p className="provider-sign-in-error" role="alert">
            {this.state.trelloError}
          </p>
        )}
      </section>
    )
  }

  private renderGitLabAccounts() {
    const accounts = this.props.accounts.filter(isGitLabAccount)
    const loading = this.state.authenticatingProvider === 'gitlab'
    return (
      <section className="account-section" aria-labelledby="gitlab-accounts">
        <div className="account-section-header">
          <div>
            <h2 id="gitlab-accounts">GitLab accounts</h2>
            <p>
              Connect GitLab.com or any self-hosted GitLab instance with a
              personal access token.
            </p>
          </div>
        </div>
        <div className="account-card-list">
          {accounts.map(account => this.renderAccount(account))}
        </div>
        <div className="provider-sign-in-card">
          <TextBox
            label="GitLab server"
            placeholder="https://gitlab.example.com"
            value={this.state.gitLabEndpoint}
            disabled={loading}
            onValueChanged={this.onGitLabEndpointChanged}
          />
          <PasswordTextBox
            label="Personal access token"
            placeholder="Token with api scope"
            value={this.state.gitLabToken}
            disabled={loading}
            onValueChanged={this.onGitLabTokenChanged}
          />
          <Button
            onClick={this.signInToGitLab}
            disabled={
              loading ||
              this.state.gitLabEndpoint.trim().length === 0 ||
              this.state.gitLabToken.length === 0
            }
          >
            {loading ? 'Connecting…' : 'Add GitLab account'}
          </Button>
        </div>
        {this.renderProviderError('gitlab')}
      </section>
    )
  }

  private renderBitbucketAccounts() {
    const accounts = this.props.accounts.filter(isBitbucketAccount)
    const loading = this.state.authenticatingProvider === 'bitbucket'
    return (
      <section className="account-section" aria-labelledby="bitbucket-accounts">
        <div className="account-section-header">
          <div>
            <h2 id="bitbucket-accounts">Bitbucket Cloud accounts</h2>
            <p>Connect with your Bitbucket username and an app password.</p>
          </div>
        </div>
        <div className="account-card-list">
          {accounts.map(account => this.renderAccount(account))}
        </div>
        <div className="provider-sign-in-card">
          <TextBox
            label="Username"
            placeholder="Bitbucket username"
            value={this.state.bitbucketUsername}
            disabled={loading}
            onValueChanged={this.onBitbucketUsernameChanged}
          />
          <PasswordTextBox
            label="App password"
            placeholder="Bitbucket app password"
            value={this.state.bitbucketAppPassword}
            disabled={loading}
            onValueChanged={this.onBitbucketAppPasswordChanged}
          />
          <Button
            onClick={this.signInToBitbucket}
            disabled={
              loading ||
              this.state.bitbucketUsername.trim().length === 0 ||
              this.state.bitbucketAppPassword.length === 0
            }
          >
            {loading ? 'Connecting…' : 'Add Bitbucket account'}
          </Button>
        </div>
        {this.renderProviderError('bitbucket')}
      </section>
    )
  }

  private renderProviderError(provider: 'gitlab' | 'bitbucket') {
    return this.state.providerErrorFor === provider &&
      this.state.providerError !== null &&
      this.state.authenticatingProvider === null ? (
      <p className="provider-sign-in-error" role="alert">
        {this.state.providerError}
      </p>
    ) : null
  }

  private onGitLabEndpointChanged = (gitLabEndpoint: string) => {
    this.setState({ gitLabEndpoint })
  }

  private onGitLabTokenChanged = (gitLabToken: string) => {
    this.setState({ gitLabToken })
  }

  private onBitbucketUsernameChanged = (bitbucketUsername: string) => {
    this.setState({ bitbucketUsername })
  }

  private onBitbucketAppPasswordChanged = (bitbucketAppPassword: string) => {
    this.setState({ bitbucketAppPassword })
  }

  private signInToGitLab = async () => {
    this.setState({
      authenticatingProvider: 'gitlab',
      providerError: null,
      providerErrorFor: null,
    })
    try {
      await this.props.onProviderSignIn(
        'gitlab',
        this.state.gitLabEndpoint.trim(),
        this.state.gitLabToken
      )
      this.setState({
        gitLabToken: '',
        authenticatingProvider: null,
        providerErrorFor: null,
      })
    } catch (error) {
      this.setState({
        authenticatingProvider: null,
        providerErrorFor: 'gitlab',
        providerError: getProviderAuthErrorMessage('gitlab', error),
      })
    }
  }

  private signInToBitbucket = async () => {
    this.setState({
      authenticatingProvider: 'bitbucket',
      providerError: null,
      providerErrorFor: null,
    })
    try {
      const username = this.state.bitbucketUsername.trim()
      await this.props.onProviderSignIn(
        'bitbucket',
        'https://api.bitbucket.org/2.0',
        `${username}:${this.state.bitbucketAppPassword}`
      )
      this.setState({
        bitbucketAppPassword: '',
        authenticatingProvider: null,
        providerErrorFor: null,
      })
    } catch (error) {
      this.setState({
        authenticatingProvider: null,
        providerErrorFor: 'bitbucket',
        providerError: getProviderAuthErrorMessage('bitbucket', error),
      })
    }
  }

  private onJiraModeChanged = (event: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({
      jiraMode: event.currentTarget.value as JiraAuthMode,
      jiraConnectedUser: null,
    })
  }

  private onJiraEndpointChanged = (jiraEndpoint: string) => {
    this.setState({ jiraEndpoint, jiraConnectedUser: null })
  }

  private onJiraEmailChanged = (jiraEmail: string) => {
    this.setState({ jiraEmail })
  }

  private onJiraTokenChanged = (jiraToken: string) => {
    this.setState({ jiraToken })
  }

  private connectJira = async () => {
    this.setState({ jiraConnecting: true, jiraError: null })
    const endpoint = this.state.jiraEndpoint.trim()
    const email = this.state.jiraEmail.trim()
    const { jiraMode, jiraToken } = this.state
    try {
      const user = await fetchJiraMyself(endpoint, jiraMode, email, jiraToken)
      // Only persist the credential once the connection has been verified,
      // so a token is never stored without evidence that it is valid.
      await setJiraCredential(endpoint, email, jiraToken)
      this.setState({
        jiraConnecting: false,
        jiraConnectedUser: user,
        jiraToken: '',
        jiraError: null,
      })
    } catch (error) {
      this.setState({
        jiraConnecting: false,
        jiraConnectedUser: null,
        jiraError: getIssueTrackerAuthErrorMessage('jira', error),
      })
    }
  }

  private disconnectJira = async () => {
    await deleteJiraCredential(this.state.jiraEndpoint.trim())
    this.setState({ jiraConnectedUser: null })
  }

  private onTrelloEndpointChanged = (trelloEndpoint: string) => {
    this.setState({ trelloEndpoint, trelloConnectedMember: null })
  }

  private onTrelloKeyChanged = (trelloKey: string) => {
    this.setState({ trelloKey })
  }

  private onTrelloTokenChanged = (trelloToken: string) => {
    this.setState({ trelloToken })
  }

  private connectTrello = async () => {
    this.setState({ trelloConnecting: true, trelloError: null })
    const endpoint = this.state.trelloEndpoint.trim()
    const key = this.state.trelloKey.trim()
    const { trelloToken } = this.state
    try {
      const member = await fetchTrelloMember(endpoint, key, trelloToken)
      await setTrelloCredential(endpoint, key, trelloToken)
      this.setState({
        trelloConnecting: false,
        trelloConnectedMember: member,
        trelloToken: '',
        trelloError: null,
      })
    } catch (error) {
      this.setState({
        trelloConnecting: false,
        trelloConnectedMember: null,
        trelloError: getIssueTrackerAuthErrorMessage('trello', error),
      })
    }
  }

  private disconnectTrello = async () => {
    await deleteTrelloCredential(this.state.trelloEndpoint.trim())
    this.setState({ trelloConnectedMember: null })
  }

  private renderMultipleDotComAccounts() {
    const dotComAccounts = this.props.accounts.filter(isDotComAccount)

    return (
      <>
        <div className="account-card-list">
          {dotComAccounts.map((account, index) =>
            this.renderAccount(account, {
              active: index === 0,
              canMakeActive: dotComAccounts.length > 1,
              preferredFocus: index === 0,
            })
          )}
        </div>
        {dotComAccounts.length === 0 ? (
          this.renderSignIn(SignInType.DotCom)
        ) : (
          <Button onClick={this.props.onDotComSignIn}>
            Add GitHub.com account
          </Button>
        )}
      </>
    )
  }

  private renderMultipleEnterpriseAccounts() {
    const enterpriseAccounts = this.props.accounts.filter(isEnterpriseAccount)

    return (
      <>
        <div className="account-card-list">
          {enterpriseAccounts.map((account, index) =>
            this.renderAccount(account, {
              active: index === 0,
              canMakeActive: enterpriseAccounts.length > 1,
            })
          )}
        </div>
        {enterpriseAccounts.length === 0 ? (
          this.renderSignIn(SignInType.Enterprise)
        ) : (
          <Button onClick={this.props.onEnterpriseSignIn}>
            Add GitHub Enterprise account
          </Button>
        )}
      </>
    )
  }

  private makeActive = (account: Account) => {
    return () => this.props.onMakeActive(account)
  }

  private renderAccount(
    account: Account,
    options: {
      readonly active?: boolean
      readonly canMakeActive?: boolean
      readonly preferredFocus?: boolean
    } = {}
  ) {
    const {
      active = false,
      canMakeActive = false,
      preferredFocus = false,
    } = options
    const avatarUser: IAvatarUser = {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }

    // The DotCom account is shown first, so its sign in/out button should be
    // focused initially when the dialog is opened.
    const className = classNames('sign-out-button', {
      [DialogPreferredFocusClassName]: preferredFocus,
    })

    return (
      <Row key={getAccountKey(account)} className="account-info account-card">
        <div className="user-info-container">
          <Avatar accounts={this.props.accounts} user={avatarUser} />
          <div className="user-info">
            {!isDotComAccount(account) ? (
              <>
                <div className="account-title">
                  {account.name === account.login
                    ? `@${account.login}`
                    : `@${account.login} (${account.name})`}
                </div>
                <div className="endpoint">{account.friendlyEndpoint}</div>
              </>
            ) : (
              <>
                <div className="name">{account.name}</div>
                <div className="login">@{account.login}</div>
              </>
            )}
          </div>
          {active && (
            <span className="account-active-chip">
              <Octicon
                className="account-active-check"
                symbol={octicons.check}
              />
              Active
            </span>
          )}
        </div>
        {!active && canMakeActive && (
          <Button
            onClick={this.makeActive(account)}
            className="make-active-button"
            tooltip="Use this account for repository operations"
          >
            {__DARWIN__ ? 'Make Active' : 'Make active'}
          </Button>
        )}
        <Button onClick={this.logout(account)} className={className}>
          {__DARWIN__ ? 'Sign Out' : 'Sign out'}
        </Button>
      </Row>
    )
  }

  private onDotComSignIn = () => {
    this.props.onDotComSignIn()
  }

  private onEnterpriseSignIn = () => {
    this.props.onEnterpriseSignIn()
  }

  private renderSignIn(type: SignInType) {
    const signInTitle = __DARWIN__ ? 'Sign Into' : 'Sign into'
    switch (type) {
      case SignInType.DotCom: {
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub.com'}
            onAction={this.onDotComSignIn}
            // The DotCom account is shown first, so its sign in/out button should be
            // focused initially when the dialog is opened.
            buttonClassName={DialogPreferredFocusClassName}
          >
            <div>
              Sign in to your GitHub.com account to access your repositories.
            </div>
          </CallToAction>
        )
      }
      case SignInType.Enterprise:
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub Enterprise'}
            onAction={this.onEnterpriseSignIn}
          >
            <div>
              If you are using GitHub Enterprise at work, sign in to it to get
              access to your repositories.
            </div>
          </CallToAction>
        )
      default:
        return assertNever(type, `Unknown sign in type: ${type}`)
    }
  }

  private logout = (account: Account) => {
    return () => {
      this.props.onLogout(account)
    }
  }
}
