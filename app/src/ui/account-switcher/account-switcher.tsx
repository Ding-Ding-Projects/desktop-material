import * as React from 'react'
import classNames from 'classnames'
import { Account, accountEquals, getAccountKey } from '../../models/account'
import { t } from '../../lib/i18n'
import { FilterMode, matchWithMode } from '../../lib/fuzzy-find'
import {
  getAccountDetailsText,
  getAccountMetaText,
  getAccountSearchText,
} from '../../lib/account-search'
import {
  persistFilterMode,
  readPersistedFilterMode,
} from '../lib/filter-list-mode'
import { FilterModeControl } from '../lib/filter-mode-control'
import { TextBox } from '../lib/text-box'
import { Avatar } from '../lib/avatar'
import { lookupPreferredEmail } from '../../lib/email'
import { IAvatarUser } from '../../models/avatar'
import * as octicons from '../octicons/octicons.generated'
import { MaterialSymbol } from '../lib/material-symbol'

const AccountSwitcherSearchSurfaceId = 'account-switcher-accounts'
const AccountSwitcherResultsId = 'account-switcher-results'
const AccountSwitcherRegexErrorId = 'account-switcher-regex-error'

interface IAccountSwitcherState {
  readonly query: string
  readonly filterMode: FilterMode
  readonly caseSensitive: boolean
  readonly highlightedIndex: number
}

interface IAccountSwitcherProps {
  /** All signed-in accounts, primary account first. */
  readonly accounts: ReadonlyArray<Account>

  /** The account currently acting as the primary account, if any. */
  readonly selectedAccount: Account | null

  /**
   * The element that opened the switcher (the rail avatar button).
   * Mousedowns inside it are ignored by the outside-dismissal logic so
   * that the trigger keeps working as a toggle instead of dismissing and
   * instantly reopening the menu.
   */
  readonly anchorRef?: React.RefObject<HTMLElement>

  /** Called when the switcher wants to close (Escape, outside click, pick). */
  readonly onClose: () => void

  /** Called when the user picks an account other than the active one. */
  readonly onSelectAccount: (account: Account) => void

  /** Called when the user chooses to add another account. */
  readonly onAddAccount: () => void
}

/**
 * Floating account-switcher menu (v2 prototype "Account switcher" surface).
 *
 * A fixed bottom-left surface-container-low card that lists every signed-in
 * account (38px avatar, name, searchable metadata, and a trailing check on the
 * active one) above an 'Add another account' action. It's opened from the
 * navigation rail's avatar button; Escape or clicking outside dismisses it
 * and focus lands on the first account row when it opens.
 */
export class AccountSwitcher extends React.Component<
  IAccountSwitcherProps,
  IAccountSwitcherState
> {
  private containerRef = React.createRef<HTMLDivElement>()
  private firstItemRef = React.createRef<HTMLButtonElement>()

  public constructor(props: IAccountSwitcherProps) {
    super(props)
    this.state = {
      query: '',
      filterMode: readPersistedFilterMode(AccountSwitcherSearchSurfaceId),
      caseSensitive: false,
      highlightedIndex: 0,
    }
  }

  public componentDidMount() {
    document.addEventListener('keydown', this.onDocumentKeyDown)
    document.addEventListener('mousedown', this.onDocumentMouseDown)
    this.firstItemRef.current?.focus()
  }

  public componentWillUnmount() {
    document.removeEventListener('keydown', this.onDocumentKeyDown)
    document.removeEventListener('mousedown', this.onDocumentMouseDown)
  }

  private onDocumentKeyDown = (event: KeyboardEvent) => {
    if (!event.defaultPrevented && event.key === 'Escape') {
      event.preventDefault()
      this.props.onClose()
    }
  }

  private onDocumentMouseDown = (event: MouseEvent) => {
    const { target } = event
    const container = this.containerRef.current
    const anchor = this.props.anchorRef?.current

    if (!(target instanceof Node)) {
      return
    }

    // The regex builder is portalled outside the card but remains part of this
    // picker. Do not dismiss the picker while the user is editing a pattern.
    if (
      target instanceof Element &&
      target.closest('.regex-builder-overlay') !== null
    ) {
      return
    }

    if (container !== null && container.contains(target)) {
      return
    }

    if (anchor !== null && anchor !== undefined && anchor.contains(target)) {
      return
    }

    this.props.onClose()
  }

  private onContainerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.target instanceof HTMLInputElement) {
      return
    }

    const { key } = event

    if (
      key !== 'ArrowDown' &&
      key !== 'ArrowUp' &&
      key !== 'Home' &&
      key !== 'End'
    ) {
      return
    }

    const container = this.containerRef.current

    if (container === null) {
      return
    }

    const items = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '.account-switcher-row, .account-switcher-add'
      )
    )

    if (items.length === 0) {
      return
    }

    const currentIndex = items.findIndex(
      item => item === document.activeElement
    )
    const lastIndex = items.length - 1

    const nextIndex =
      key === 'Home'
        ? 0
        : key === 'End'
        ? lastIndex
        : key === 'ArrowDown'
        ? currentIndex >= lastIndex
          ? 0
          : currentIndex + 1
        : currentIndex <= 0
        ? lastIndex
        : currentIndex - 1

    const visibleAccountCount = this.getVisibleAccounts().accounts.length
    if (nextIndex < visibleAccountCount) {
      this.setState({ highlightedIndex: nextIndex })
    }
    items[nextIndex].focus()
    event.preventDefault()
  }

  private getVisibleAccounts(): {
    readonly accounts: ReadonlyArray<Account>
    readonly regexError: string | null
  } {
    const { query, filterMode, caseSensitive } = this.state
    if (query.length === 0) {
      return { accounts: this.props.accounts, regexError: null }
    }

    const { results, regexError } = matchWithMode(
      query,
      this.props.accounts,
      getAccountSearchText,
      { mode: filterMode, caseSensitive }
    )

    return {
      accounts: results.map(result => result.item),
      regexError,
    }
  }

  private getSampleItems = (): ReadonlyArray<string> =>
    this.props.accounts
      .slice(0, 50)
      .flatMap(account => getAccountSearchText(account))

  private onSearchValueChanged = (query: string) => {
    this.setState({ query, highlightedIndex: 0 })
  }

  private onFilterModeChange = (filterMode: FilterMode) => {
    persistFilterMode(AccountSwitcherSearchSurfaceId, filterMode)
    this.setState({ filterMode, highlightedIndex: 0 })
  }

  private onCaseSensitiveChange = (caseSensitive: boolean) => {
    this.setState({ caseSensitive, highlightedIndex: 0 })
  }

  private onRegexPatternApply = (pattern: string, caseSensitive: boolean) => {
    persistFilterMode(AccountSwitcherSearchSurfaceId, FilterMode.Regex)
    this.setState({
      query: pattern,
      filterMode: FilterMode.Regex,
      caseSensitive,
      highlightedIndex: 0,
    })
  }

  private onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const { key } = event

    if (key === 'Escape') {
      if (this.state.query.length > 0) {
        this.onSearchValueChanged('')
        event.preventDefault()
      } else {
        this.props.onClose()
        event.preventDefault()
      }
      return
    }

    const { accounts: visibleAccounts, regexError } = this.getVisibleAccounts()
    if (visibleAccounts.length === 0) {
      return
    }

    const currentIndex = Math.min(
      this.state.highlightedIndex,
      visibleAccounts.length - 1
    )

    if (key === 'Enter') {
      if (regexError !== null) {
        event.preventDefault()
        return
      }

      this.selectAccount(visibleAccounts[currentIndex])
      event.preventDefault()
      return
    }

    if (
      key !== 'ArrowDown' &&
      key !== 'ArrowUp' &&
      key !== 'Home' &&
      key !== 'End'
    ) {
      return
    }

    const lastIndex = visibleAccounts.length - 1
    const nextIndex =
      key === 'Home'
        ? 0
        : key === 'End'
        ? lastIndex
        : key === 'ArrowDown'
        ? currentIndex >= lastIndex
          ? 0
          : currentIndex + 1
        : currentIndex <= 0
        ? lastIndex
        : currentIndex - 1

    this.setState({ highlightedIndex: nextIndex })
    event.preventDefault()
  }

  private onRowClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const key = event.currentTarget.dataset.accountKey
    const account = this.props.accounts.find(a => getAccountKey(a) === key)

    if (account === undefined) {
      return
    }

    this.selectAccount(account)
  }

  private selectAccount = (account: Account) => {
    this.props.onClose()

    // Picking the account that's already active only dismisses the menu.
    if (!this.isActiveAccount(account)) {
      this.props.onSelectAccount(account)
    }
  }

  private onAddAccountClick = () => {
    this.props.onClose()
    this.props.onAddAccount()
  }

  private isActiveAccount(account: Account) {
    const { selectedAccount } = this.props
    return selectedAccount !== null && accountEquals(account, selectedAccount)
  }

  private getAvatarUser = (account: Account): IAvatarUser => ({
    name: account.friendlyName,
    email: lookupPreferredEmail(account),
    avatarURL: account.avatarURL,
    endpoint: account.endpoint,
  })

  private renderRow = (account: Account, index: number) => {
    const { highlightedIndex } = this.state
    const active = this.isActiveAccount(account)
    const accountKey = getAccountKey(account)
    const highlighted = index === highlightedIndex
    const rowId = `account-switcher-option-${index}`

    return (
      <button
        id={rowId}
        key={accountKey}
        type="button"
        role="option"
        className={classNames('account-switcher-row', {
          active,
          highlighted,
        })}
        data-account-key={accountKey}
        onClick={this.onRowClick}
        aria-current={active ? 'true' : undefined}
        aria-label={getAccountSearchText(account).join(' · ')}
        aria-selected={highlighted}
        ref={index === 0 ? this.firstItemRef : undefined}
      >
        <span
          className={classNames('account-switcher-avatar', {
            primary: index === 0,
          })}
          aria-hidden="true"
        >
          <Avatar
            accounts={this.props.accounts}
            user={this.getAvatarUser(account)}
            size={38}
            tooltip={false}
            aria-hidden={true}
          />
        </span>
        <span className="account-switcher-info">
          <span className="account-switcher-name">{account.friendlyName}</span>
          <span className="account-switcher-meta">
            {getAccountMetaText(account)}
          </span>
          <span className="account-switcher-details">
            {getAccountDetailsText(account)}
          </span>
        </span>
        {active && (
          <span className="account-switcher-check">
            <MaterialSymbol name="check_circle" />
          </span>
        )}
      </button>
    )
  }

  public render() {
    const { accounts, selectedAccount } = this.props
    const { query, highlightedIndex } = this.state
    const { accounts: visibleAccounts, regexError } = this.getVisibleAccounts()
    const host =
      (selectedAccount ?? accounts[0])?.friendlyEndpoint ?? 'GitHub.com'

    return (
      // The dialog handles arrow-key navigation between its menu buttons.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
      <div
        className="account-switcher"
        role="dialog"
        aria-labelledby="account-switcher-header"
        ref={this.containerRef}
        onKeyDown={this.onContainerKeyDown}
      >
        <div className="account-switcher-header" id="account-switcher-header">
          {t('accounts.picker.title', { host })}
        </div>
        <div className="account-switcher-search-row" role="search">
          <TextBox
            className="account-switcher-search-field"
            searchSurfaceId={AccountSwitcherSearchSurfaceId}
            type="search"
            tabIndex={0}
            placeholder={t('accounts.picker.searchPlaceholder')}
            ariaLabel={t('accounts.picker.searchLabel')}
            ariaControls={AccountSwitcherResultsId}
            ariaActiveDescendant={
              visibleAccounts.length > 0
                ? `account-switcher-option-${Math.min(
                    highlightedIndex,
                    visibleAccounts.length - 1
                  )}`
                : undefined
            }
            ariaInvalid={regexError !== null}
            ariaDescribedBy={
              regexError === null ? undefined : AccountSwitcherRegexErrorId
            }
            displayClearButton={true}
            prefixedIcon={octicons.search}
            value={query}
            onValueChanged={this.onSearchValueChanged}
            onKeyDown={this.onSearchKeyDown}
          />
          <FilterModeControl
            searchSurfaceId={AccountSwitcherSearchSurfaceId}
            mode={this.state.filterMode}
            caseSensitive={this.state.caseSensitive}
            onModeChange={this.onFilterModeChange}
            onCaseSensitiveChange={this.onCaseSensitiveChange}
            regexBuilderTarget={t('accounts.picker.label')}
            getSampleItems={this.getSampleItems}
            filterText={query}
            onRegexPatternApply={this.onRegexPatternApply}
          />
        </div>
        {regexError !== null && (
          <p
            id={AccountSwitcherRegexErrorId}
            className="account-switcher-regex-error"
            role="alert"
          >
            {regexError}
          </p>
        )}
        <div
          className="account-switcher-result-count"
          role="status"
          aria-live="polite"
        >
          {query.length === 0
            ? t(
                visibleAccounts.length === 1
                  ? 'accounts.picker.countOne'
                  : 'accounts.picker.countMany',
                { count: String(visibleAccounts.length) }
              )
            : t('accounts.picker.matchCount', {
                matched: String(visibleAccounts.length),
                total: String(accounts.length),
              })}
        </div>
        <div
          id={AccountSwitcherResultsId}
          className="account-switcher-results"
          role="listbox"
          aria-label={t('accounts.picker.label')}
        >
          {visibleAccounts.map(this.renderRow)}
          {visibleAccounts.length === 0 && (
            <div className="account-switcher-empty" role="status">
              {query.length === 0
                ? t('accounts.picker.noAccounts')
                : t('accounts.picker.noMatch', { query })}
            </div>
          )}
        </div>
        <div className="account-switcher-divider" aria-hidden="true" />
        <button
          type="button"
          className="account-switcher-add"
          onClick={this.onAddAccountClick}
          ref={visibleAccounts.length === 0 ? this.firstItemRef : undefined}
        >
          <MaterialSymbol name="person_add" />
          {t('accounts.picker.add')}
        </button>
      </div>
    )
  }
}
