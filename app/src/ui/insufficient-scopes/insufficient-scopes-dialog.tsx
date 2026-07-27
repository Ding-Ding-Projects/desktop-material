import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Account } from '../../models/account'
import { Ref } from '../lib/ref'

interface IInsufficientScopesDialogProps {
  readonly account: Account
  readonly missingScopes: ReadonlyArray<string>

  /** Starts the sign-in flow that re-grants the full scope set. */
  readonly onSignInAgain: (account: Account) => void

  /**
   * Called when the dialog is dismissed without choosing to sign in again
   * ("Not now", the close button, or Escape) so the answer can be persisted
   * and the prompt stops reappearing on every launch.
   */
  readonly onNotNow: (
    account: Account,
    missingScopes: ReadonlyArray<string>
  ) => void

  readonly onDismissed: () => void
}

/**
 * Shown when a signed-in GitHub account's token predates the scopes the
 * app's current features need (e.g. Releases requires the full `repo`
 * grant). Signing in again re-authorizes with the complete scope list.
 */
export class InsufficientScopesDialog extends React.Component<IInsufficientScopesDialogProps> {
  /**
   * Distinguishes the sign-in submit from every other dismissal path so
   * only a genuine "Not now" (or close/Escape) records a dismissal.
   */
  private signInRequested = false

  private onSubmit = () => {
    this.signInRequested = true
    this.props.onDismissed()
    this.props.onSignInAgain(this.props.account)
  }

  private onDialogDismissed = () => {
    if (!this.signInRequested) {
      this.props.onNotNow(this.props.account, this.props.missingScopes)
    }
    this.props.onDismissed()
  }

  public render() {
    const { account, missingScopes } = this.props

    return (
      <Dialog
        id="insufficient-oauth-scopes"
        title={
          __DARWIN__
            ? 'Grant Additional GitHub Permissions'
            : 'Grant additional GitHub permissions'
        }
        onSubmit={this.onSubmit}
        onDismissed={this.onDialogDismissed}
      >
        <DialogContent>
          <p>
            Some features — such as Releases, Actions administration, and
            notifications — need more powerful permissions than{' '}
            <Ref>@{account.login}</Ref>'s current sign-in granted.
          </p>
          <p className="insufficient-scopes-list">
            Missing permission {missingScopes.length === 1 ? 'scope' : 'scopes'}
            :{' '}
            {missingScopes.map(scope => (
              <Ref key={scope}>{scope}</Ref>
            ))}
          </p>
          <p>
            Signing in again re-authorizes Desktop Material with the complete
            permission set. Your repositories and settings are untouched.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Sign In Again' : 'Sign in again'}
            cancelButtonText="Not now"
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
