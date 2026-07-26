import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import {
  Account,
  getAccountKey,
  isEnterpriseAccount,
} from '../../models/account'
import { getHTMLURL } from '../../lib/api'
import {
  getPersistedLanguageMode,
  LanguageModeChangedEvent,
  translate,
  TranslationKey,
  TranslationVariables,
} from '../../lib/i18n'
import { LanguageMode, normalizeLanguageMode } from '../../models/language-mode'
import { LocalizedText } from '../lib/localized-text'

interface IInvalidatedTokenProps {
  readonly dispatcher: Dispatcher

  /** The account whose token was invalidated and which is now signed out. */
  readonly account: Account

  /**
   * Every account still signed in. Used only to tell the user whether their
   * other accounts on the same host survived the sign-out — several accounts
   * can share a host and only the one holding the dead credential is removed.
   */
  readonly accounts: ReadonlyArray<Account>

  readonly onDismissed: () => void
}

interface IInvalidatedTokenState {
  readonly languageMode: LanguageMode
}

/**
 * Dialog that alerts user that their GitHub (Enterprise) account token is not
 * valid and they need to sign in again.
 *
 * The copy names the affected login: a host can have more than one account
 * signed in, so "your account on github.com" does not tell the user which
 * sign-in they just lost or which one to repeat.
 */
export class InvalidatedToken extends React.Component<
  IInvalidatedTokenProps,
  IInvalidatedTokenState
> {
  public constructor(props: IInvalidatedTokenProps) {
    super(props)

    this.state = { languageMode: getPersistedLanguageMode() }
  }

  public componentDidMount() {
    document.addEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  public componentWillUnmount() {
    document.removeEventListener(
      LanguageModeChangedEvent,
      this.onLanguageModeChanged
    )
  }

  private onLanguageModeChanged = (event: Event) => {
    const languageMode = normalizeLanguageMode(
      (event as CustomEvent<unknown>).detail
    )
    if (languageMode !== this.state.languageMode) {
      this.setState({ languageMode })
    }
  }

  private text(
    key: TranslationKey,
    variables: TranslationVariables = {}
  ): string {
    return translate(key, this.state.languageMode, variables)
  }

  /** Accounts other than the signed-out one that share its host. */
  private get otherAccountsOnEndpoint(): number {
    const { account, accounts } = this.props
    const key = getAccountKey(account)

    return accounts.filter(
      candidate =>
        candidate.endpoint === account.endpoint &&
        getAccountKey(candidate) !== key
    ).length
  }

  public render() {
    const { account } = this.props
    const variables = {
      login: account.login,
      endpoint: account.friendlyEndpoint,
    }

    return (
      <Dialog
        id="invalidated-token"
        type="warning"
        title={
          <LocalizedText
            translationKey={
              __DARWIN__
                ? 'accounts.invalidatedTokenTitleDarwin'
                : 'accounts.invalidatedTokenTitle'
            }
            languageMode={this.state.languageMode}
          />
        }
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>
            <LocalizedText
              translationKey="accounts.invalidatedTokenBody"
              variables={variables}
              languageMode={this.state.languageMode}
            />
          </p>
          {this.otherAccountsOnEndpoint > 0 && (
            <p>
              <LocalizedText
                translationKey="accounts.invalidatedTokenOthersKept"
                variables={{ endpoint: account.friendlyEndpoint }}
                languageMode={this.state.languageMode}
              />
            </p>
          )}
          <p>
            <LocalizedText
              translationKey="accounts.invalidatedTokenPrompt"
              variables={variables}
              languageMode={this.state.languageMode}
            />
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={this.text('accounts.invalidatedTokenSignIn')}
            cancelButtonText={this.text('accounts.invalidatedTokenLater')}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = () => {
    const { dispatcher, onDismissed, account } = this.props

    onDismissed()

    if (isEnterpriseAccount(account)) {
      dispatcher.showEnterpriseSignInDialog(
        getHTMLURL(this.props.account.endpoint)
      )
    } else {
      dispatcher.showDotComSignInDialog()
    }
  }
}
