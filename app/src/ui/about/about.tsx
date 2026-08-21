import * as React from 'react'

import { Row } from '../lib/row'
import { Button } from '../lib/button'
import {
  Dialog,
  DialogError,
  DialogContent,
  DefaultDialogFooter,
} from '../dialog'
import { LinkButton } from '../lib/link-button'
import { IUpdateState, UpdateStatus } from '../lib/update-store'
import { Loading } from '../lib/loading'
import { RelativeTime } from '../relative-time'
import { assertNever } from '../../lib/fatal-error'
import { ReleaseNotesUri } from '../lib/releases'
import { isOSNoLongerSupportedByElectron } from '../../lib/get-os'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { formatDate } from '../../lib/format-date'
import { DefaultAppDisplayName } from '../../models/app-identity'
import { MaterialSymbol } from '../lib/material-symbol'
import { t } from '../../lib/i18n'
import { deriveUpdateArrivalEstimate } from '../../lib/update-coming-soon-estimate'
import {
  UpdateComingSoonDetails,
  updateArrivalEstimateText,
} from '../updates/update-coming-soon-details'

interface IAboutProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissible prop.
   */
  readonly onDismissed: () => void

  /**
   * The name of the currently installed (and running) application
   */
  readonly applicationName: string

  /**
   * The currently installed (and running) version of the app.
   */
  readonly applicationVersion: string

  /**
   * The currently installed (and running) architecture of the app.
   */
  readonly applicationArchitecture: string

  /** A function to call to kick off a non-staggered update check. */
  readonly onCheckForNonStaggeredUpdates: () => void

  readonly onShowAcknowledgements: () => void

  /** A function to call when the user wants to see Terms and Conditions. */
  readonly onShowTermsAndConditions: () => void

  /** Opens the in-app changelog viewer over every recorded release. */
  readonly onShowChangelog: () => void
  /** Opens the local Support Tickets recovery desk from Help/About. */
  readonly onShowSupportTickets: () => void
  readonly onQuitAndInstall: () => void

  readonly updateState: IUpdateState

  /**
   * A flag to indicate whether the About dialog should ignore that
   * it's running in development mode. Used exclusively by the AboutTestDialog
   */
  readonly allowDevelopment?: boolean
}

interface IAboutState {
  /** Whether the coming-update details disclosure is open. */
  readonly isComingSoonExpanded: boolean
}

interface IUpdateInfoProps {
  readonly message: string
  readonly richMessage?: JSX.Element
  readonly loading?: boolean
}

/**
 * Development builds do not start automatic update checks, but an explicitly
 * requested check still travels through Electron's real updater event path.
 * Reveal only those genuine Squirrel states; keep the ordinary development
 * About surface and the separate coming-soon probe unchanged.
 */
export function isRealUpdaterState(status: UpdateStatus): boolean {
  switch (status) {
    case UpdateStatus.CheckingForUpdates:
    case UpdateStatus.UpdateAvailable:
    case UpdateStatus.UpdateNotAvailable:
    case UpdateStatus.UpdateReady:
      return true
    case UpdateStatus.UpdateNotChecked:
    case UpdateStatus.UpdateComingSoon:
      return false
    default:
      return assertNever(status, `Unknown update status ${status}`)
  }
}

class UpdateInfo extends React.Component<IUpdateInfoProps> {
  public render() {
    return (
      <div className="update-status">
        <AriaLiveContainer message={this.props.message} />

        {this.props.loading && <Loading />}
        {this.props.richMessage ?? this.props.message}
      </div>
    )
  }
}

/**
 * A dialog that presents information about the
 * running application such as name and version.
 */
export class About extends React.Component<IAboutProps, IAboutState> {
  public constructor(props: IAboutProps) {
    super(props)
    this.state = { isComingSoonExpanded: false }
  }

  private get canCheckForUpdates() {
    return (
      __RELEASE_CHANNEL__ !== 'development' ||
      this.props.allowDevelopment === true ||
      isRealUpdaterState(this.props.updateState.status)
    )
  }

  private renderUpdateButton() {
    if (!this.canCheckForUpdates) {
      return null
    }

    const updateStatus = this.props.updateState.status

    switch (updateStatus) {
      case UpdateStatus.UpdateReady:
        return (
          <Row>
            <Button onClick={this.props.onQuitAndInstall}>
              Quit and Install Update
            </Button>
          </Row>
        )
      case UpdateStatus.UpdateNotAvailable:
      case UpdateStatus.UpdateComingSoon:
      case UpdateStatus.CheckingForUpdates:
      case UpdateStatus.UpdateAvailable:
      case UpdateStatus.UpdateNotChecked:
        const disabled =
          ![
            UpdateStatus.UpdateNotChecked,
            UpdateStatus.UpdateNotAvailable,
            UpdateStatus.UpdateComingSoon,
          ].includes(updateStatus) || isOSNoLongerSupportedByElectron()

        const buttonTitle = 'Check for Updates'

        return (
          <Row>
            <Button
              disabled={disabled}
              onClick={this.props.onCheckForNonStaggeredUpdates}
            >
              {buttonTitle}
            </Button>
          </Row>
        )
      default:
        return assertNever(
          updateStatus,
          `Unknown update status ${updateStatus}`
        )
    }
  }

  private renderUpdateDetails() {
    if (__LINUX__) {
      return null
    }

    if (!this.canCheckForUpdates) {
      return (
        <p>
          The application is currently running in development and will not
          receive any updates.
        </p>
      )
    }

    const { status, lastSuccessfulCheck } = this.props.updateState

    switch (status) {
      case UpdateStatus.CheckingForUpdates:
        return <UpdateInfo message="Checking for updates…" loading={true} />
      case UpdateStatus.UpdateAvailable:
        return <UpdateInfo message="Downloading update…" loading={true} />
      case UpdateStatus.UpdateComingSoon:
        return this.renderUpdateComingSoon()
      case UpdateStatus.UpdateNotAvailable:
        if (!lastSuccessfulCheck) {
          return null
        }

        const richMessage = (
          <p>
            You have the latest version (last checked{' '}
            <RelativeTime date={lastSuccessfulCheck} />)
          </p>
        )

        const absoluteDate = formatDate(lastSuccessfulCheck, {
          dateStyle: 'full',
          timeStyle: 'short',
        })

        return (
          <UpdateInfo
            message={`You have the latest version (last checked ${absoluteDate})`}
            richMessage={richMessage}
          />
        )
      case UpdateStatus.UpdateReady:
        return (
          <UpdateInfo message="An update has been downloaded and is ready to be installed." />
        )
      case UpdateStatus.UpdateNotChecked:
        return null
      default:
        return assertNever(status, `Unknown update status ${status}`)
    }
  }

  /**
   * The same coming-update announcement the banner shows, in the one dialog a
   * user opens specifically to ask about updates. When the probe produced no
   * detail (an older check, or an unreadable response) this degrades to the
   * plain headline rather than inventing a schedule for it.
   */
  private renderUpdateComingSoon() {
    const { comingSoonSignal } = this.props.updateState
    const message = t('update.comingSoon')
    if (comingSoonSignal === null) {
      return <UpdateInfo message={message} />
    }

    const estimate = deriveUpdateArrivalEstimate(comingSoonSignal, Date.now())
    const richMessage = (
      <div className="update-coming-soon-body">
        <span className="update-coming-soon-summary">
          <span className="update-coming-soon-headline">{message}</span>
          <span className="update-coming-soon-estimate">
            {updateArrivalEstimateText(estimate)}
          </span>
        </span>
        <UpdateComingSoonDetails
          signal={comingSoonSignal}
          estimate={estimate}
          isExpanded={this.state.isComingSoonExpanded}
          onToggleExpanded={this.onToggleComingSoonExpanded}
          detailsId="about-update-coming-soon-details"
        />
      </div>
    )

    return (
      <UpdateInfo
        message={`${message}. ${updateArrivalEstimateText(estimate)}`}
        richMessage={richMessage}
      />
    )
  }

  private onToggleComingSoonExpanded = () => {
    this.setState({ isComingSoonExpanded: !this.state.isComingSoonExpanded })
  }

  private renderUpdateErrors() {
    if (__LINUX__) {
      return null
    }

    if (!this.canCheckForUpdates) {
      return null
    }

    if (isOSNoLongerSupportedByElectron()) {
      return (
        <DialogError>
          This operating system is no longer supported. Software updates have
          been disabled.{' '}
          <LinkButton uri="https://ding-ding-projects.github.io/desktop-material/">
            Supported operating systems
          </LinkButton>
        </DialogError>
      )
    }

    if (!this.props.updateState.lastSuccessfulCheck) {
      return (
        <DialogError>
          Couldn't determine the last time an update check was performed. You
          may be running an old version. Please try manually checking for
          updates and contact GitHub Support if the problem persists
        </DialogError>
      )
    }

    return null
  }

  private renderBetaLink() {
    if (__RELEASE_CHANNEL__ === 'beta') {
      return
    }

    return (
      <div>
        <p className="no-padding">Looking for the latest features?</p>
        <p className="no-padding">
          Check out the{' '}
          <LinkButton uri="https://ding-ding-projects.github.io/desktop-material/">
            Beta Channel
          </LinkButton>
        </p>
      </div>
    )
  }

  public render() {
    const name = this.props.applicationName
    const version = this.props.applicationVersion
    const releaseNotesLink = (
      <LinkButton uri={ReleaseNotesUri}>release notes</LinkButton>
    )
    // The in-app viewer covers every recorded release offline; the link above
    // stays because the website carries the rendered notes for the newest one.
    const changelogLink = (
      <LinkButton onClick={this.props.onShowChangelog}>
        release history
      </LinkButton>
    )

    const versionText = __DEV__ ? `Build ${version}` : `Version ${version}`
    const titleId = 'Dialog_about'

    return (
      <Dialog
        id="about"
        titleId={titleId}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        {this.renderUpdateErrors()}
        <DialogContent>
          <Row className="logo">
            <span className="about-app-logo" role="img" aria-label={name}>
              <MaterialSymbol name="deployed_code" size={40} />
            </span>
          </Row>
          <h1 id={titleId}>About {name}</h1>
          <p className="no-padding">
            <span className="selectable-text">
              {versionText} ({this.props.applicationArchitecture})
            </span>{' '}
            ({releaseNotesLink}, {changelogLink})
          </p>
          {this.renderUpdateDetails()}
          {this.renderUpdateButton()}
          {this.renderBetaLink()}
          <div className="terms-and-license-container">
            <p className="no-padding terms-and-license">
              <LinkButton onClick={this.props.onShowSupportTickets}>
                {t('about.supportTickets')}
              </LinkButton>
            </p>
            <p className="no-padding terms-and-license">
              <LinkButton onClick={this.props.onShowTermsAndConditions}>
                Terms and Conditions
              </LinkButton>
            </p>
            <p className="no-padding terms-and-license">
              <LinkButton onClick={this.props.onShowAcknowledgements}>
                License and Open Source Notices
              </LinkButton>
            </p>
            <p className="terms-and-license">
              <LinkButton uri="https://gh.io/copilot-for-desktop-transparency">
                Responsible use of Copilot in {DefaultAppDisplayName}
              </LinkButton>
            </p>
          </div>
        </DialogContent>
        <DefaultDialogFooter />
      </Dialog>
    )
  }
}
