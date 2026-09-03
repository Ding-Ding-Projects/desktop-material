import { MaterialSymbol } from '../ui/lib/material-symbol'
import * as React from 'react'
import { ErrorType, ICrashDetails } from './shared'
import { TitleBar } from '../ui/window/title-bar'
import { WindowState } from '../lib/window-state'
import { Button } from '../ui/lib/button'
import { LinkButton } from '../ui/lib/link-button'
import { getVersion } from '../ui/lib/app-proxy'
import { getOS } from '../lib/get-os'
import * as ipcRenderer from '../lib/ipc-renderer'
import { getCurrentWindowState } from '../ui/main-process-proxy'
import {
  DefaultAppDisplayName,
  DefaultAppIdentityCustomization,
} from '../models/app-identity'

// This is a weird one, let's leave it as a placeholder
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ICrashAppProps {}

interface ICrashAppState {
  /**
   * Whether this error was thrown before we were able to launch
   * the main renderer process or not. See the documentation for
   * the ErrorType type for more details.
   */
  readonly type?: ErrorType

  /**
   * The error that caused us to spawn the crash process.
   */
  readonly error?: Error

  /**
   * The current state of the Window, ie maximized, minimized full-screen etc.
   */
  readonly windowState: WindowState | null
}

const issuesUri =
  'https://github.com/Ding-Ding-Projects/desktop-material/issues'

/**
 * Formats an error by attempting to strip out user-identifiable information
 * from paths and appends system metadata such and the running version and
 * current operating system.
 */
function prepareErrorMessage(error: Error) {
  let message

  if (error.stack) {
    message = error.stack
      .split('\n')
      .map(line => {
        // The stack trace lines come in two forms:
        //
        // `at Function.module.exports.Emitter.simpleDispatch (SOME_USER_SPECIFIC_PATH/app/node_modules/event-kit/lib/emitter.js:25:14)`
        // `at file:///SOME_USER_SPECIFIC_PATH/app/renderer.js:6:4250`
        //
        // We want to try to strip the user-specific path part out.
        const match = line.match(/(\s*)(.*)(\(|file:\/\/\/).*(app.*)/)

        return !match || match.length < 5
          ? line
          : match[1] + match[2] + match[3] + match[4]
      })
      .join('\n')
  } else {
    message = `${error.name}: ${error.message}`
  }

  return `${message}\n\nVersion: ${getVersion()}\nOS: ${getOS()}\n`
}

/**
 * The root component for our crash process.
 *
 * The crash process is responsible for presenting the user with an
 * error after the main process or any renderer process has crashed due
 * to an uncaught exception or when the main renderer has failed to load.
 *
 * Exercise caution when working with the crash process. If the crash
 * process itself crashes we've failed.
 */
export class CrashApp extends React.Component<ICrashAppProps, ICrashAppState> {
  public constructor(props: ICrashAppProps) {
    super(props)

    this.state = {
      windowState: null,
    }

    this.initializeWindowState()
  }

  public componentDidMount() {
    ipcRenderer.on('window-state-changed', this.onWindowStateChanged)
    ipcRenderer.on('error', this.onError)

    ipcRenderer.send('crash-ready')
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener(
      'window-state-changed',
      this.onWindowStateChanged
    )
    ipcRenderer.removeListener('error', this.onError)
  }

  private initializeWindowState = async () => {
    const windowState = await getCurrentWindowState()
    if (windowState === undefined) {
      return
    }

    this.setState({ windowState })
  }

  private onWindowStateChanged = (
    _: Electron.IpcRendererEvent,
    windowState: WindowState
  ) => {
    this.setState({ windowState })
  }

  private onError = (
    _: Electron.IpcRendererEvent,
    crashDetails: ICrashDetails
  ) => {
    this.setState({ type: crashDetails.type, error: crashDetails.error })
  }

  private onQuitButtonClicked = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    ipcRenderer.send('crash-quit')
  }

  private renderTitle() {
    const message =
      this.state.type === 'launch'
        ? `${DefaultAppDisplayName} failed to launch`
        : `${DefaultAppDisplayName} encountered an error`

    return (
      <header className="crash-heading">
        <MaterialSymbol className="error-icon" name="stop" />
        <div>
          <span className="crash-heading-kicker">Application recovery</span>
          <h1 id="crash-title">{message}</h1>
        </div>
      </header>
    )
  }

  private renderDescription() {
    if (this.state.type === 'launch') {
      return (
        <p>
          {DefaultAppDisplayName} encountered a catastrophic error that prevents
          it from launching. This has been reported to the team, but if you
          encounter this repeatedly please report this issue to the{' '}
          {DefaultAppDisplayName}{' '}
          <LinkButton uri={issuesUri}>issue tracker</LinkButton>.
        </p>
      )
    } else {
      return (
        <p>
          {DefaultAppDisplayName} has encountered an unrecoverable error and
          will need to restart. This has been reported to the team, but if you
          encounter this repeatedly please report this issue to the{' '}
          {DefaultAppDisplayName}{' '}
          <LinkButton uri={issuesUri}>issue tracker</LinkButton>.
        </p>
      )
    }
  }

  private renderErrorDetails() {
    const error = this.state.error

    if (!error) {
      return
    }

    return <pre className="error">{prepareErrorMessage(error)}</pre>
  }

  private renderFooter() {
    return <div className="footer">{this.renderQuitButton()}</div>
  }

  private renderQuitButton() {
    let quitText
    // We don't support restarting in dev mode since we can't
    // control the life time of the dev server.
    if (__DEV__) {
      quitText = __DARWIN__ ? 'Quit' : 'Exit'
    } else {
      quitText = __DARWIN__ ? 'Quit and Restart' : 'Exit and restart'
    }

    return (
      <Button type="submit" onClick={this.onQuitButtonClicked}>
        {quitText}
      </Button>
    )
  }

  public render() {
    return (
      <div id="crash-app">
        <TitleBar
          appIdentity={DefaultAppIdentityCustomization}
          showAppIcon={false}
          titleBarStyle="light"
          windowState={this.state.windowState}
        />
        <main>
          <section className="crash-card" aria-labelledby="crash-title">
            {this.renderTitle()}
            <div className="crash-copy">{this.renderDescription()}</div>
            {this.renderErrorDetails()}
            {this.renderFooter()}
          </section>
        </main>
      </div>
    )
  }
}
