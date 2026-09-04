import * as React from 'react'
import classNames from 'classnames'
import {
  Account,
  accountEquals,
  getAccountKey,
  isBitbucketAccount,
  isDotComAccount,
  isEnterpriseAccount,
  isGitLabAccount,
} from '../../models/account'
import { IAvatarUser } from '../../models/avatar'
import { lookupPreferredEmail } from '../../lib/email'
import { assertNever } from '../../lib/fatal-error'
import { getProviderAuthErrorMessage } from '../../lib/provider-auth-error'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { DialogContent, DialogPreferredFocusClassName } from '../dialog'
import { Avatar } from '../lib/avatar'
import { CallToAction } from '../lib/call-to-action'
import { Select } from '../lib/select'
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
import { MaterialSymbol } from '../lib/material-symbol'

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
  private localize(english: string, cantonese: string): string {
    switch (getPersistedLanguageMode()) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  private enteredState(value: string): {
    readonly english: string
    readonly cantonese: string
  } {
    return value.length === 0
      ? { english: 'empty', cantonese: '空白' }
      : { english: 'entered for this sign-in', cantonese: '今次登入已輸入' }
  }

  private renderTransientExplanation(
    value: ITransientAccountSettingExplanation
  ): JSX.Element {
    return (
      <SettingExplanation
        settingId={value.id}
        summary={this.localize('What this setting changes', '呢個設定會改咩')}
        explanation={this.localize(
          value.explanationEnglish,
          value.explanationCantonese
        )}
        source="runtime-only"
        provenance={this.localize(
          `This value is temporary for the current sign-in form. Current value: ${value.currentEnglish}. Shipped value: ${value.shippedEnglish}.`,
          `呢個值只喺目前登入表格暫時使用。目前值：${value.currentCantonese}。出廠值：${value.shippedCantonese}。`
        )}
      />
    )
  }

  public state: IAccountsState = {
    // The design's static mock defaults this field to the example placeholder
    // domain ('https://gitlab.example.com'), but here the value is a real,
    // submitted endpoint rather than decorative example text: most GitLab
    // users are signing in to gitlab.com itself, so pre-filling the actual
    // host lets them paste a token and go, instead of hitting a bogus
    // example.com host on the very first try.
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
                  <MaterialSymbol
                    name="check"
                    className="account-active-check"
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
          <Select
            label={this.localize('Jira deployment', 'Jira 部署')}
            value={this.state.jiraMode}
            disabled={loading}
            onChange={this.onJiraModeChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-jira-deployment')
                .ariaDescribedBy
            }
          >
            <option value="basic-email-token">
              Jira Cloud (email + API token)
            </option>
            <option value="bearer-token">
              Jira Data Center / Git Integration for Jira (personal access
              token)
            </option>
          </Select>
          {this.renderTransientExplanation({
            id: 'accounts-jira-deployment',
            explanationEnglish:
              'Chooses the Jira authentication flow: Cloud uses an account email and API token; Data Center and Git Integration for Jira use bearer authorization.',
            explanationCantonese:
              '揀 Jira 驗證流程：Cloud 用帳戶電郵同 API token；Data Center 同 Git Integration for Jira 用 bearer 授權。',
            currentEnglish:
              this.state.jiraMode === 'basic-email-token'
                ? 'Jira Cloud'
                : 'Jira Data Center / Git Integration for Jira',
            currentCantonese:
              this.state.jiraMode === 'basic-email-token'
                ? 'Jira Cloud'
                : 'Jira Data Center／Git Integration for Jira',
            shippedEnglish: 'Jira Cloud',
            shippedCantonese: 'Jira Cloud',
          })}
          <TextBox
            label={this.localize('Jira server', 'Jira 伺服器')}
            placeholder="https://team.atlassian.net"
            value={this.state.jiraEndpoint}
            disabled={loading}
            onValueChanged={this.onJiraEndpointChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-jira-server')
                .ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-jira-server',
            explanationEnglish:
              'Selects the HTTPS Jira host used for the connection and issue links.',
            explanationCantonese: '揀連線同 issue 連結使用嘅 HTTPS Jira host。',
            currentEnglish: this.state.jiraEndpoint,
            currentCantonese: this.state.jiraEndpoint,
            shippedEnglish: 'https://team.atlassian.net',
            shippedCantonese: 'https://team.atlassian.net',
          })}
          {isCloud && (
            <>
              <TextBox
                label={this.localize('Account email', '帳戶電郵')}
                placeholder="you@example.com"
                value={this.state.jiraEmail}
                disabled={loading}
                onValueChanged={this.onJiraEmailChanged}
                ariaDescribedBy={
                  settingExplanationDescriptionIds('accounts-jira-email')
                    .ariaDescribedBy
                }
              />
              {this.renderTransientExplanation({
                id: 'accounts-jira-email',
                explanationEnglish:
                  'Provides the Jira Cloud account identity paired with the write-only API token for this sign-in attempt.',
                explanationCantonese:
                  '提供今次登入嘗試入面，同只寫不讀 API token 配對嘅 Jira Cloud 帳戶身分。',
                currentEnglish: this.enteredState(this.state.jiraEmail.trim())
                  .english,
                currentCantonese: this.enteredState(this.state.jiraEmail.trim())
                  .cantonese,
                shippedEnglish: 'empty',
                shippedCantonese: '空白',
              })}
            </>
          )}
          <PasswordTextBox
            label={this.localize(
              isCloud ? 'API token' : 'Personal access token',
              isCloud ? 'API token' : 'Personal access token'
            )}
            placeholder={isCloud ? 'Jira API token' : 'Jira PAT'}
            value={this.state.jiraToken}
            disabled={loading}
            onValueChanged={this.onJiraTokenChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-jira-authorization')
                .ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-jira-authorization',
            explanationEnglish:
              'Supplies the write-only Jira authorization for this sign-in attempt. The explanation reports only whether a value was entered and never characterizes it.',
            explanationCantonese:
              '提供今次登入嘗試嘅只寫不讀 Jira 授權資料。說明只會報告有冇輸入，永遠唔會描述個值。',
            currentEnglish: this.enteredState(this.state.jiraToken).english,
            currentCantonese: this.enteredState(this.state.jiraToken).cantonese,
            shippedEnglish: 'empty',
            shippedCantonese: '空白',
          })}
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
                  <MaterialSymbol
                    name="check"
                    className="account-active-check"
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
            label={this.localize('Trello API server', 'Trello API 伺服器')}
            placeholder="https://api.trello.com"
            value={this.state.trelloEndpoint}
            disabled={loading}
            onValueChanged={this.onTrelloEndpointChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-trello-server')
                .ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-trello-server',
            explanationEnglish:
              'Selects the HTTPS Trello API host used for account verification and card links.',
            explanationCantonese:
              '揀帳戶驗證同卡片連結使用嘅 HTTPS Trello API host。',
            currentEnglish: this.state.trelloEndpoint,
            currentCantonese: this.state.trelloEndpoint,
            shippedEnglish: 'https://api.trello.com',
            shippedCantonese: 'https://api.trello.com',
          })}
          <TextBox
            label={this.localize('API key', 'API key')}
            placeholder="Trello application key"
            value={this.state.trelloKey}
            disabled={loading}
            onValueChanged={this.onTrelloKeyChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-trello-api-key')
                .ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-trello-api-key',
            explanationEnglish:
              'Provides the Trello application key paired with the write-only member token for this connection attempt.',
            explanationCantonese:
              '提供今次連線嘗試入面，同只寫不讀 member token 配對嘅 Trello application key。',
            currentEnglish: this.enteredState(this.state.trelloKey.trim())
              .english,
            currentCantonese: this.enteredState(this.state.trelloKey.trim())
              .cantonese,
            shippedEnglish: 'empty',
            shippedCantonese: '空白',
          })}
          <PasswordTextBox
            label={this.localize('Token', 'Token')}
            placeholder="Trello member token"
            value={this.state.trelloToken}
            disabled={loading}
            onValueChanged={this.onTrelloTokenChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-trello-authorization')
                .ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-trello-authorization',
            explanationEnglish:
              'Supplies the write-only Trello member authorization for this connection attempt. The explanation reports only whether a value was entered.',
            explanationCantonese:
              '提供今次連線嘗試嘅只寫不讀 Trello member 授權資料。說明只會報告有冇輸入。',
            currentEnglish: this.enteredState(this.state.trelloToken).english,
            currentCantonese: this.enteredState(this.state.trelloToken)
              .cantonese,
            shippedEnglish: 'empty',
            shippedCantonese: '空白',
          })}
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
              Sign in to gitlab.com or any self-hosted GitLab server with a
              personal access token.
            </p>
          </div>
        </div>
        <div className="account-card-list">
          {accounts.map(account =>
            this.renderAccount(account, {
              active: this.isActiveAccount(account),
              canMakeActive: this.props.accounts.length > 1,
            })
          )}
        </div>
        <div className="provider-sign-in-card gitlab-sign-in-card">
          <TextBox
            className="gitlab-mono-field"
            label={this.localize('GitLab server URL', 'GitLab 伺服器 URL')}
            placeholder="https://gitlab.example.com"
            value={this.state.gitLabEndpoint}
            disabled={loading}
            onValueChanged={this.onGitLabEndpointChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-gitlab-server')
                .ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-gitlab-server',
            explanationEnglish:
              'Selects gitlab.com or a self-hosted GitLab HTTPS endpoint for this sign-in attempt.',
            explanationCantonese:
              '為今次登入嘗試揀 gitlab.com 或者自寄 GitLab HTTPS endpoint。',
            currentEnglish: this.state.gitLabEndpoint,
            currentCantonese: this.state.gitLabEndpoint,
            shippedEnglish: 'https://gitlab.com',
            shippedCantonese: 'https://gitlab.com',
          })}
          <PasswordTextBox
            className="gitlab-mono-field"
            label={this.localize(
              'Personal access token',
              'Personal access token'
            )}
            // Mirrors the design's masked token placeholder: a "glpat-"
            // prefix followed by 16 bullet characters (U+2022).
            placeholder={`glpat-${'•'.repeat(16)}`}
            value={this.state.gitLabToken}
            disabled={loading}
            onValueChanged={this.onGitLabTokenChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-gitlab-authorization')
                .ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-gitlab-authorization',
            explanationEnglish:
              'Supplies write-only GitLab authorization for this sign-in attempt. The explanation reports only whether a value was entered.',
            explanationCantonese:
              '提供今次登入嘗試嘅只寫不讀 GitLab 授權資料。說明只會報告有冇輸入。',
            currentEnglish: this.enteredState(this.state.gitLabToken).english,
            currentCantonese: this.enteredState(this.state.gitLabToken)
              .cantonese,
            shippedEnglish: 'empty',
            shippedCantonese: '空白',
          })}
          <Button
            onClick={this.signInToGitLab}
            disabled={
              loading ||
              this.state.gitLabEndpoint.trim().length === 0 ||
              this.state.gitLabToken.length === 0
            }
          >
            {loading ? 'Connecting…' : 'Sign in to GitLab'}
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
          {accounts.map(account =>
            this.renderAccount(account, {
              active: this.isActiveAccount(account),
              canMakeActive: this.props.accounts.length > 1,
            })
          )}
        </div>
        <div className="provider-sign-in-card">
          <TextBox
            label={this.localize('Username', '用戶名')}
            placeholder="Bitbucket username"
            value={this.state.bitbucketUsername}
            disabled={loading}
            onValueChanged={this.onBitbucketUsernameChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds('accounts-bitbucket-username')
                .ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-bitbucket-username',
            explanationEnglish:
              'Provides the Bitbucket Cloud username paired with the write-only app password for this sign-in attempt.',
            explanationCantonese:
              '提供今次登入嘗試入面，同只寫不讀 app password 配對嘅 Bitbucket Cloud 用戶名。',
            currentEnglish: this.enteredState(
              this.state.bitbucketUsername.trim()
            ).english,
            currentCantonese: this.enteredState(
              this.state.bitbucketUsername.trim()
            ).cantonese,
            shippedEnglish: 'empty',
            shippedCantonese: '空白',
          })}
          <PasswordTextBox
            label={this.localize('App password', 'App password')}
            placeholder="Bitbucket app password"
            value={this.state.bitbucketAppPassword}
            disabled={loading}
            onValueChanged={this.onBitbucketAppPasswordChanged}
            ariaDescribedBy={
              settingExplanationDescriptionIds(
                'accounts-bitbucket-authorization'
              ).ariaDescribedBy
            }
          />
          {this.renderTransientExplanation({
            id: 'accounts-bitbucket-authorization',
            explanationEnglish:
              'Supplies the write-only Bitbucket app password for this sign-in attempt. The explanation reports only whether a value was entered.',
            explanationCantonese:
              '提供今次登入嘗試嘅只寫不讀 Bitbucket app password。說明只會報告有冇輸入。',
            currentEnglish: this.enteredState(this.state.bitbucketAppPassword)
              .english,
            currentCantonese: this.enteredState(this.state.bitbucketAppPassword)
              .cantonese,
            shippedEnglish: 'empty',
            shippedCantonese: '空白',
          })}
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

  private onJiraModeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
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

  private isActiveAccount(account: Account) {
    const activeAccount = this.props.accounts[0]
    return activeAccount !== undefined && accountEquals(account, activeAccount)
  }

  private renderMultipleDotComAccounts() {
    const dotComAccounts = this.props.accounts.filter(isDotComAccount)

    return (
      <>
        <div className="account-card-list">
          {dotComAccounts.map((account, index) =>
            this.renderAccount(account, {
              active: this.isActiveAccount(account),
              canMakeActive: this.props.accounts.length > 1,
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
              active: this.isActiveAccount(account),
              canMakeActive: this.props.accounts.length > 1,
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
              <MaterialSymbol name="check" className="account-active-check" />
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
