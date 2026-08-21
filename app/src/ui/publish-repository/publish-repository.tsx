import * as React from 'react'
import { Account } from '../../models/account'
import { API, IAPIOrganization } from '../../lib/api'
import { TextBox } from '../lib/text-box'
import { DialogContent } from '../dialog'
import { Row } from '../lib/row'
import { merge } from '../../lib/merge'
import { caseInsensitiveCompare } from '../../lib/compare'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { sanitizedRepositoryName } from '../add-repository/sanitized-repository-name'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RepositoryPublicationSettings } from '../../models/publish-settings'
import { AccountPicker } from '../account-picker'
import { PublishOrganizationPicker } from './publish-organization-picker'
import { Button } from '../lib/button'
import { translate, translateForAccessibleName } from '../../lib/i18n'

interface IPublishRepositoryProps {
  /** The user to use for publishing. */
  readonly account: Account

  /** The available accounts that the user is able to use when publishing */
  readonly accounts: ReadonlyArray<Account>

  readonly onSelectedAccountChanged: (account: Account) => void

  /** The settings to use when publishing the repository. */
  readonly settings: RepositoryPublicationSettings

  /** The function called when any of the publish settings are changed. */
  readonly onSettingsChanged: (settings: RepositoryPublicationSettings) => void
}

interface IPublishRepositoryState {
  readonly orgs: ReadonlyArray<IAPIOrganization>
  readonly orgsError: Error | null
  readonly languageMode: LanguageMode
}

/** The Publish Repository component. */
export class PublishRepository extends React.Component<
  IPublishRepositoryProps,
  IPublishRepositoryState
> {
  /** The repository name entered by the user. It has not yet been sanitized. */
  private name: string
  private isMounted = false
  private organizationRequestId = 0

  public constructor(props: IPublishRepositoryProps) {
    super(props)

    this.state = {
      orgs: [],
      orgsError: null,
      languageMode: getPersistedLanguageMode(),
    }
    this.name = props.settings.name
  }

  public componentDidMount() {
    this.isMounted = true
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
    this.fetchOrgs(this.props.account)
  }

  public componentWillUnmount() {
    this.isMounted = false
    this.organizationRequestId++
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillReceiveProps(nextProps: IPublishRepositoryProps) {
    if (this.props.account !== nextProps.account) {
      this.setState({ orgs: [], orgsError: null })

      this.fetchOrgs(nextProps.account)
    }
  }

  private async fetchOrgs(account: Account) {
    const requestId = ++this.organizationRequestId
    const api = API.fromAccount(account)
    try {
      const apiOrgs = await api.fetchOrgs(true)
      const orgs = [...apiOrgs]
      orgs.sort((a, b) => caseInsensitiveCompare(a.login, b.login))
      if (this.isMounted && requestId === this.organizationRequestId) {
        this.setState({ orgs, orgsError: null })
      }
    } catch (error) {
      if (this.isMounted && requestId === this.organizationRequestId) {
        this.setState({
          orgs: [],
          orgsError:
            error instanceof Error
              ? error
              : new Error(String(error)),
        })
      }
    }
  }

  private onRetryOrganizations = () => {
    this.setState({ orgsError: null })
    void this.fetchOrgs(this.props.account)
  }

  private onLanguageModeChanged = (event: Event) => {
    this.setState({
      languageMode: normalizeLanguageMode(
        (event as CustomEvent<unknown>).detail
      ),
    })
  }

  private updateSettings<K extends keyof RepositoryPublicationSettings>(
    subset: Pick<RepositoryPublicationSettings, K>
  ) {
    const existingSettings = this.props.settings
    const newSettings = merge(existingSettings, subset)
    this.props.onSettingsChanged(newSettings)
  }

  private onNameChange = (name: string) => {
    this.name = name

    name = sanitizedRepositoryName(name)
    this.updateSettings({ name })
  }

  private onDescriptionChange = (description: string) => {
    this.updateSettings({ description })
  }

  private onPrivateChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.updateSettings({ private: event.currentTarget.checked })
  }

  private onSelectedOrganizationChanged = (
    organization: IAPIOrganization | null
  ) => {
    this.updateSettings({ org: organization })
  }

  public render() {
    return (
      <DialogContent>
        {this.props.accounts.length > 1 && (
          <Row>
            <AccountPicker
              accounts={this.props.accounts}
              openButtonClassName="dialog-preferred-focus"
              selectedAccount={this.props.account}
              onSelectedAccountChanged={this.props.onSelectedAccountChanged}
            />
          </Row>
        )}

        <Row>
          <TextBox
            label="Name"
            value={this.name}
            onValueChanged={this.onNameChange}
          />
        </Row>

        {this.renderSanitizedName()}

        <Row>
          <TextBox
            label="Description"
            value={this.props.settings.description}
            onValueChanged={this.onDescriptionChange}
          />
        </Row>

        <Row>
          <label>
            <input
              type="checkbox"
              checked={this.props.settings.private}
              onChange={this.onPrivateChange}
            />
            Keep this code private
          </label>
        </Row>

        <PublishOrganizationPicker
          organizations={this.state.orgs}
          selectedOrganization={this.props.settings.org}
          languageMode={this.state.languageMode}
          onSelectedOrganizationChanged={this.onSelectedOrganizationChanged}
        />

        {this.state.orgsError !== null && (
          <div className="publish-organization-empty" role="status">
            <span>
              {translate(
                'publish.organization.loadError',
                this.state.languageMode
              )}
            </span>
            <Button
              onClick={this.onRetryOrganizations}
              ariaLabel={translateForAccessibleName(
                'publish.organization.retry',
                {},
                this.state.languageMode
              )}
              tooltip={translate(
                'publish.organization.retry',
                this.state.languageMode
              )}
            >
              {translate(
                'publish.organization.retry',
                this.state.languageMode
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    )
  }

  private renderSanitizedName() {
    const sanitizedName = this.props.settings.name
    if (this.name === sanitizedName) {
      return null
    }

    return (
      <Row className="warning-helper-text">
        <Octicon symbol={octicons.alert} />
        Will be created as {sanitizedName}
      </Row>
    )
  }
}
