import * as React from 'react'
import { PopoverDropdown } from './lib/popover-dropdown'
import { Account, accountEquals, getAccountKey } from '../models/account'
import { t } from '../lib/i18n'
import { SectionFilterList } from './lib/section-filter-list'
import {
  IFilterListGroup,
  IFilterListItem,
  SelectionSource,
} from './lib/filter-list'
import { IMatches } from '../lib/fuzzy-find'
import { Avatar } from './lib/avatar'
import { lookupPreferredEmail } from '../lib/email'
import { IAvatarUser } from '../models/avatar'
import memoizeOne from 'memoize-one'
import {
  getAccountDetailsText,
  getAccountMetaText,
  getAccountSearchText,
} from '../lib/account-search'

interface IAccountPickerProps {
  readonly accounts: ReadonlyArray<Account>
  readonly selectedAccount: Account
  readonly onSelectedAccountChanged: (account: Account) => void
  readonly disabled?: boolean
  readonly buttonAriaLabel?: string

  /**
   * The class name to apply to the open button. This is useful for
   * applying the dialog-preferred-focus class to the button when it
   * should receive focus ahead of a dialog's default focus target
   */
  readonly openButtonClassName?: string
}

interface IAccountPickerState {
  readonly filterText: string
  readonly selectedItemId: string | undefined
}

interface IAccountListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly account: Account
}

const getItemId = (account: Account) => getAccountKey(account)

/**
 * A select-like element for filter and selecting an account.
 */
export class AccountPicker extends React.Component<
  IAccountPickerProps,
  IAccountPickerState
> {
  private getFilterListGroups = memoizeOne(
    (
      accounts: ReadonlyArray<Account>
    ): ReadonlyArray<IFilterListGroup<IAccountListItem>> => [
      {
        identifier: 'accounts',
        items: accounts.map(account => ({
          text: [
            account.friendlyName,
            getAccountSearchText(account).join(' · '),
          ],
          id: getItemId(account),
          account,
        })),
      },
    ]
  )

  private getSelectedItem = memoizeOne(
    (
      accounts: ReadonlyArray<Account>,
      selectedItemId: string | undefined,
      selectedAccount: Account
    ) =>
      this.getFilterListGroups(accounts)
        .flatMap(x => x.items)
        .find(x =>
          // Prioritize selectedItemId (i.e. our own internal state) which
          // gets reset when the selectedAccount props changes.
          selectedItemId
            ? x.id === selectedItemId
            : accountEquals(x.account, selectedAccount)
        ) ?? null
  )

  private popoverRef = React.createRef<PopoverDropdown>()

  public constructor(props: IAccountPickerProps) {
    super(props)

    this.state = {
      filterText: '',
      selectedItemId: undefined,
    }
  }

  public componentDidUpdate(prevProps: IAccountPickerProps) {
    if (prevProps.selectedAccount !== this.props.selectedAccount) {
      this.setState({ selectedItemId: undefined })
    }
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private getAvatarUser = (account: Account): IAvatarUser => {
    return {
      name: account.friendlyName,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }
  }

  private renderAccount = (item: IAccountListItem, matches: IMatches) => {
    const account = item.account

    return (
      <div className="account-list-item">
        <Avatar
          accounts={this.props.accounts}
          user={this.getAvatarUser(account)}
        />
        <div className="info">
          <div className="title">{item.account.friendlyName}</div>
          <div className="subtitle">{getAccountMetaText(item.account)}</div>
          <div className="tertiary">{getAccountDetailsText(item.account)}</div>
        </div>
      </div>
    )
  }

  private onItemClick = (item: IAccountListItem, source: SelectionSource) => {
    const account = item.account
    this.popoverRef.current?.closePopover()

    this.setState({ selectedItemId: item.id })
    this.props.onSelectedAccountChanged(account)
  }

  private onSelectionChanged = (selectedItem: IAccountListItem | null) =>
    this.setState({ selectedItemId: selectedItem?.id })

  private getItemAriaLabel = (item: IAccountListItem) =>
    getAccountSearchText(item.account).join(' · ')

  public render() {
    const account = this.props.selectedAccount

    return (
      <PopoverDropdown
        className="account-picker"
        disabled={this.props.disabled}
        contentTitle={t('accounts.picker.choose')}
        buttonContent={
          <div className="account">
            <span className="login">@{account.login}</span> -{' '}
            <span className="endpoint">
              {this.props.selectedAccount.friendlyEndpoint}
            </span>
          </div>
        }
        label={t('accounts.picker.label')}
        buttonAriaLabel={this.props.buttonAriaLabel}
        closeButtonAriaLabel={t('accounts.picker.close')}
        ref={this.popoverRef}
        openButtonClassName={this.props.openButtonClassName}
      >
        <SectionFilterList<IAccountListItem>
          className="account-list"
          rowHeight={60}
          filterListId="accounts"
          filterListLabel={t('accounts.picker.label')}
          filterAriaLabel={t('accounts.picker.searchLabel')}
          placeholderText={t('accounts.picker.searchPlaceholder')}
          filterInputType="search"
          groups={this.getFilterListGroups(this.props.accounts)}
          selectedItem={this.getSelectedItem(
            this.props.accounts,
            this.state.selectedItemId,
            this.props.selectedAccount
          )}
          renderItem={this.renderAccount}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          invalidationProps={this.props.accounts}
          onItemClick={this.onItemClick}
          onSelectionChanged={this.onSelectionChanged}
          getItemAriaLabel={this.getItemAriaLabel}
        />
      </PopoverDropdown>
    )
  }
}
