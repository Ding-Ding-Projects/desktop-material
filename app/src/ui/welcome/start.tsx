import * as React from 'react'
import { WelcomeStep } from './welcome'
import { LinkButton } from '../lib/link-button'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { CopyButton } from '../copy-button'
import { BrowserRedirectMessage } from '../lib/authentication-form'
import { ENABLE_TELEMETRY } from '../../lib/telemetry-flag'
import { SamplesURL } from '../../lib/stats'

/**
 * The URL to the sign-up page on GitHub.com. Used in conjunction
 * with account actions in the app where the user might want to
 * consider signing up.
 */
export const CreateAccountURL = 'https://github.com/join?source=github-desktop'

/** Material-style open-in-new affordance for the primary sign-in route. */
function OpenInNewIcon() {
  return (
    <svg
      className="welcome-material-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7ZM14 3v2h3.59L7.76 14.83l1.41 1.41L19 6.41V10h2V3h-7Z" />
    </svg>
  )
}

interface IStartProps {
  readonly advance: (step: WelcomeStep) => void
  readonly dispatcher: Dispatcher
  readonly loadingBrowserAuth: boolean

  /**
   * The sign in address handed to the system browser. When present it is shown
   * with a copy button so the person can paste it into a browser themselves if
   * the system browser did not open.
   */
  readonly browserSignInUrl?: string

  /** The reason the browser launch failed, if it did. */
  readonly browserSignInError?: Error | null
}

/** The first step of the Welcome flow. */
export class Start extends React.Component<IStartProps, {}> {
  public render() {
    return (
      <section
        id="start"
        aria-label="Welcome to Desktop Material"
        aria-describedby="start-description"
      >
        <div className="start-content">
          <p className="welcome-overline">First-run setup</p>
          <h1 className="welcome-title">
            Start with <span>Desktop Material</span>
          </h1>
          {!this.props.loadingBrowserAuth ? (
            <>
              <p id="start-description" className="welcome-text">
                Bring GitHub and GitHub Enterprise repositories into a focused
                Material 3 workspace. Sign in to connect your account, or
                continue locally without one.
              </p>
            </>
          ) : (
            <p>{BrowserRedirectMessage}</p>
          )}

          {this.renderBrowserFallback()}

          <div className="welcome-main-buttons">
            <Button
              type="submit"
              className="button-with-icon"
              disabled={this.props.loadingBrowserAuth}
              onClick={this.signInWithBrowser}
              autoFocus={true}
              role="link"
            >
              {this.props.loadingBrowserAuth && (
                <span className="welcome-progress" aria-hidden="true" />
              )}
              Sign in with GitHub.com
              <OpenInNewIcon />
            </Button>
            {this.props.loadingBrowserAuth ? (
              <Button onClick={this.cancelBrowserAuth}>Cancel</Button>
            ) : (
              <Button onClick={this.signInToEnterprise}>
                GitHub Enterprise
              </Button>
            )}
          </div>
          <div className="skip-action-container">
            <p className="welcome-text">
              New to GitHub?{' '}
              <LinkButton
                uri={CreateAccountURL}
                className="create-account-link"
              >
                Create your free account.
              </LinkButton>
            </p>
            <LinkButton className="skip-button" onClick={this.skip}>
              Continue without signing in
            </LinkButton>
          </div>
        </div>

        <div className="start-footer">
          <p>
            By creating an account, you agree to the{' '}
            <LinkButton uri={'https://github.com/site/terms'}>
              Terms of Service
            </LinkButton>
            . For more information about GitHub's privacy practices, see the{' '}
            <LinkButton uri={'https://github.com/site/privacy'}>
              GitHub Privacy Statement.
            </LinkButton>
          </p>
          {ENABLE_TELEMETRY && (
            <p>
              GitHub Desktop sends usage metrics to improve the product and
              inform feature decisions.{' '}
              <LinkButton uri={SamplesURL}>
                Learn more about user metrics.
              </LinkButton>
            </p>
          )}
        </div>
      </section>
    )
  }

  /**
   * Offers the sign in address as text with a copy button. Shown while the
   * browser sign in is waiting and after a failed launch, so a browser that
   * never opens does not leave the person stuck on this screen.
   */
  private renderBrowserFallback() {
    const { browserSignInUrl, browserSignInError, loadingBrowserAuth } =
      this.props

    if (browserSignInUrl === undefined) {
      return null
    }

    if (!loadingBrowserAuth && !browserSignInError) {
      return null
    }

    return (
      <div className="welcome-browser-fallback">
        <p
          id="welcome-browser-fallback-description"
          className="welcome-text"
          role={browserSignInError ? 'alert' : undefined}
        >
          {browserSignInError
            ? 'Your browser did not open. Copy this link and paste it into a browser to sign in.'
            : "Browser didn't open? Copy this link and paste it into a browser to sign in."}
        </p>
        <div className="welcome-browser-fallback-row">
          <input
            type="text"
            readOnly={true}
            className="welcome-browser-fallback-link"
            aria-label="Sign in link"
            aria-describedby="welcome-browser-fallback-description"
            value={browserSignInUrl}
            onFocus={this.selectFallbackLink}
          />
          <CopyButton
            copyContent={browserSignInUrl}
            ariaLabel="Copy sign in link"
          />
        </div>
      </div>
    )
  }

  private selectFallbackLink = (event: React.FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select()
  }

  private signInWithBrowser = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.preventDefault()
    }

    this.props.advance(WelcomeStep.SignInToDotComWithBrowser)
    return this.props.dispatcher.requestBrowserAuthenticationToDotcom()
  }

  private cancelBrowserAuth = () => {
    this.props.advance(WelcomeStep.Start)
  }

  private signInToEnterprise = () => {
    this.props.advance(WelcomeStep.SignInToEnterprise)
  }

  private skip = () => {
    this.props.advance(WelcomeStep.ConfigureGit)
  }
}
