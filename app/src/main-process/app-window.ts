import {
  Menu,
  app,
  dialog,
  BrowserWindow,
  autoUpdater,
  nativeTheme,
} from 'electron'
import { shell } from '../lib/app-shell'
import { Emitter, Disposable } from 'event-kit'
import { encodePathAsUrl } from '../lib/path'
import {
  getWindowState,
  registerWindowStateChangedEvents,
} from '../lib/window-state'
import { MenuEvent } from './menu'
import { URLActionType } from '../lib/parse-app-url'
import { ILaunchStats } from '../lib/stats'
import { menuFromElectronMenu } from '../models/app-menu'
import { now } from './now'
import * as path from 'path'
import windowStateKeeper from 'electron-window-state'
import * as ipcMain from './ipc-main'
import * as ipcWebContents from './ipc-webcontents'
import { installNotificationCallback } from './notifications'
import { addTrustedIPCSender } from './trusted-ipc-sender'
import { getUpdaterGUID } from '../lib/get-updater-guid'
import { probeUpdateFeed } from '../lib/update-version-order'
import { CLIAction } from '../lib/cli-action'
import {
  IAgentCommandEnvelope,
  IAgentServerStatus,
} from '../lib/agent-commands'
import {
  AppWindowRendererFailure,
  isFatalRendererLoadFailure,
} from './renderer-failure'
import { AutoFitDebounceMs } from '../lib/zoom'
import {
  DocumentScopedNativeClosePreparationController,
  INativeClosePreparationResult,
} from './native-close-preparation'
import type { ApplicationClosePreparationClaim } from './application-quit-preparation'

const rendererUnresponsiveRecoveryDelay = 15_000

export interface IAppWindowUpdateDownloadState {
  isDownloadingUpdate: boolean
}

export class AppWindow {
  private window: Electron.BrowserWindow
  private emitter = new Emitter()
  private readonly cleanupTasks = new Array<() => void>()
  private readonly nativeClosePreparation: DocumentScopedNativeClosePreparationController

  private _loadTime: number | null = null
  private _rendererReadyTime: number | null = null
  private _selectedRepositoryPath: string | null = null
  private _openRepositoryPaths: ReadonlyArray<string> = []

  private minWidth = 960
  private minHeight = 660

  // See https://github.com/desktop/desktop/pull/11162
  private shouldMaximizeOnShow = false
  private quitting = false
  private quittingEvenIfUpdating = false
  private rendererFailureReported = false
  private closeWhenPrepared = false
  private applicationClosePreparationClaimed = false

  // Debounces the delivery of the BrowserWindow content size to the renderer.
  // See sendContentSize/scheduleSendContentSize.
  private contentSizeDebounceTimer: ReturnType<typeof setTimeout> | null = null

  public constructor(
    public readonly scope: string,
    private readonly updateDownloadState: IAppWindowUpdateDownloadState = {
      isDownloadingUpdate: false,
    }
  ) {
    const savedWindowState = windowStateKeeper({
      defaultWidth: this.minWidth,
      defaultHeight: this.minHeight,
      maximize: false,
      file:
        scope === 'primary'
          ? 'window-state.json'
          : `window-state-${scope}.json`,
    })

    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      x: savedWindowState.x,
      y: savedWindowState.y,
      width: savedWindowState.width,
      height: savedWindowState.height,
      minWidth: this.minWidth,
      minHeight: this.minHeight,
      show: false,
      // This fixes subpixel aliasing on Windows
      // See https://github.com/atom/atom/commit/683bef5b9d133cb194b476938c77cc07fd05b972
      backgroundColor: '#fff',
      webPreferences: {
        // Disable auxclick event
        // See https://developers.google.com/web/updates/2016/10/auxclick
        disableBlinkFeatures: 'Auxclick',
        nodeIntegration: true,
        spellcheck: true,
        contextIsolation: false,
      },
      acceptFirstMouse: true,
    }

    if (__DARWIN__) {
      windowOptions.titleBarStyle = 'hidden'
    } else if (__WIN32__) {
      windowOptions.frame = false
    } else if (__LINUX__) {
      windowOptions.icon = path.join(__dirname, 'static', 'icon-logo.png')
    }

    this.window = new BrowserWindow(windowOptions)
    addTrustedIPCSender(this.window.webContents)
    this.nativeClosePreparation =
      new DocumentScopedNativeClosePreparationController({
        sendPrepare: requestId =>
          ipcWebContents.send(
            this.window.webContents,
            'prepare-window-close',
            requestId
          ),
      })

    const onDidStartNavigation = (
      details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>
    ) => {
      if (details.isMainFrame && !details.isSameDocument) {
        this.nativeClosePreparation.documentWillChange()
      }
    }
    const onWillNavigate = (
      details: Electron.Event<Electron.WebContentsWillNavigateEventParams>
    ) => {
      if (!details.isMainFrame || details.isSameDocument) {
        return
      }

      const documentGeneration =
        this.nativeClosePreparation.currentDocumentGeneration
      // did-start-navigation precedes the cancellable will-navigate event.
      // Observe defaultPrevented after every listener has run so the still-live
      // current document does not remain invalidated when navigation is denied.
      queueMicrotask(() => {
        if (details.defaultPrevented) {
          this.nativeClosePreparation.documentDidBecomeReady(documentGeneration)
        }
      })
    }
    const onDocumentReady = () => {
      if (!this.window.webContents.isLoadingMainFrame()) {
        this.nativeClosePreparation.documentDidBecomeReady()
      }
    }
    const onDocumentLoadFailed = (
      _event: Electron.Event,
      _errorCode: number,
      _errorDescription: string,
      _validatedURL: string,
      isMainFrame: boolean
    ) => {
      if (isMainFrame) {
        onDocumentReady()
      }
    }
    this.window.webContents.on('did-start-navigation', onDidStartNavigation)
    this.window.webContents.on('will-navigate', onWillNavigate)
    this.window.webContents.on('did-finish-load', onDocumentReady)
    this.window.webContents.on('did-fail-load', onDocumentLoadFailed)
    this.addCleanupTask(() => {
      this.window.webContents.removeListener(
        'did-start-navigation',
        onDidStartNavigation
      )
      this.window.webContents.removeListener('will-navigate', onWillNavigate)
      this.window.webContents.removeListener('did-finish-load', onDocumentReady)
      this.window.webContents.removeListener(
        'did-fail-load',
        onDocumentLoadFailed
      )
    })

    const onRenderProcessGone = (
      _event: Electron.Event,
      details: Electron.RenderProcessGoneDetails
    ) => {
      this.nativeClosePreparation.rendererDestroyed()
      if (
        this.quitting ||
        this.rendererFailureReported ||
        details.reason === 'clean-exit'
      ) {
        return
      }
      this.reportRendererFailure({
        kind: 'process-gone',
        reason: details.reason,
        exitCode: details.exitCode,
      })
    }
    this.window.webContents.on('render-process-gone', onRenderProcessGone)
    this.addCleanupTask(() =>
      this.window.webContents.removeListener(
        'render-process-gone',
        onRenderProcessGone
      )
    )
    this.window.webContents.once('destroyed', () => {
      this.nativeClosePreparation.rendererDestroyed()
    })

    let unresponsiveTimer: ReturnType<typeof setTimeout> | null = null
    const clearUnresponsiveTimer = () => {
      if (unresponsiveTimer !== null) {
        clearTimeout(unresponsiveTimer)
        unresponsiveTimer = null
      }
    }
    const onUnresponsive = () => {
      if (unresponsiveTimer !== null) {
        return
      }
      unresponsiveTimer = setTimeout(() => {
        unresponsiveTimer = null
        this.reportRendererFailure({
          kind: 'unresponsive',
          unresponsiveForMilliseconds: rendererUnresponsiveRecoveryDelay,
        })
      }, rendererUnresponsiveRecoveryDelay)
    }
    this.window.on('unresponsive', onUnresponsive)
    this.window.on('responsive', clearUnresponsiveTimer)
    this.addCleanupTask(() => {
      clearUnresponsiveTimer()
      this.window.removeListener('unresponsive', onUnresponsive)
      this.window.removeListener('responsive', clearUnresponsiveTimer)
    })

    this.addCleanupTask(installNotificationCallback(this.window))

    savedWindowState.manage(this.window)
    this.shouldMaximizeOnShow = savedWindowState.isMaximized

    this.window.on('close', e => {
      const hideInsteadOfClose = this.shouldHideWindowInsteadOfClose()
      // On macOS, closing the window doesn't mean the app is quitting. If the
      // app is updating, we will prevent the window from closing only when the
      // app is also quitting.
      if (
        !hideInsteadOfClose &&
        !this.quittingEvenIfUpdating &&
        this.updateDownloadState.isDownloadingUpdate
      ) {
        e.preventDefault()
        this.showUpdateQuitPrevention()
        return
      }

      // on macOS, when the user closes the window we really just hide it. This
      // lets us activate quickly and keep all our interesting logic in the
      // renderer.
      if (hideInsteadOfClose) {
        e.preventDefault()
        // https://github.com/desktop/desktop/issues/12838
        if (this.window.isFullScreen()) {
          this.window.setFullScreen(false)
          this.window.once('leave-full-screen', () => this.window.hide())
        } else {
          this.window.hide()
        }
        return
      }

      if (
        !this.quitting &&
        !this.nativeClosePreparation.isReadyToClose &&
        !this.window.webContents.isDestroyed()
      ) {
        e.preventDefault()
        this.requestNativeWindowClose()
      }
    })

    this.window.on('closed', () => this.cleanup())
  }

  private shouldHideWindowInsteadOfClose(): boolean {
    return (
      __DARWIN__ && !this.quitting && BrowserWindow.getAllWindows().length === 1
    )
  }

  public load() {
    let startLoad = 0
    // We only listen for the first of the loading events to avoid a bug in
    // Electron/Chromium where they can sometimes fire more than once. See
    // See
    // https://github.com/desktop/desktop/pull/513#issuecomment-253028277. This
    // shouldn't really matter as in production builds loading _should_ only
    // happen once.
    this.window.webContents.once('did-start-loading', () => {
      this._rendererReadyTime = null
      this._loadTime = null

      startLoad = now()
    })

    this.window.webContents.once('did-finish-load', () => {
      if (process.env.NODE_ENV === 'development') {
        this.window.webContents.openDevTools()
      }

      this._loadTime = now() - startLoad

      this.maybeEmitDidLoad()
    })

    this.window.webContents.on('did-finish-load', () => {
      void this.window.webContents.setVisualZoomLevelLimits(1, 1).catch(() =>
        this.reportRendererFailure({
          kind: 'setup-failed',
          stage: 'zoom-limits',
        })
      )
    })

    const onDidFailLoad = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean
    ) => {
      if (
        this.quitting ||
        this.rendererFailureReported ||
        !isFatalRendererLoadFailure(errorCode, isMainFrame)
      ) {
        return
      }
      this.reportRendererFailure({
        kind: 'load-failed',
        errorCode,
        errorDescription,
        validatedURL,
      })
    }
    this.window.webContents.on('did-fail-load', onDidFailLoad)
    this.addCleanupTask(() =>
      this.window.webContents.removeListener('did-fail-load', onDidFailLoad)
    )

    const removeRendererReadyListener = ipcMain.on(
      'renderer-ready',
      (event, readyTime) => {
        if (event.sender !== this.window.webContents) {
          return
        }
        this._rendererReadyTime = readyTime
        this.maybeEmitDidLoad()
        // Give the renderer an authoritative, zoom-invariant window size right
        // away so the store's auto-fit can settle without waiting for a resize.
        this.sendContentSize()
        removeRendererReadyListener()
      }
    )
    this.addCleanupTask(removeRendererReadyListener)

    this.window.on('focus', () =>
      ipcWebContents.send(this.window.webContents, 'focus')
    )
    this.window.on('blur', () =>
      ipcWebContents.send(this.window.webContents, 'blur')
    )

    registerWindowStateChangedEvents(this.window)

    // Deliver the (zoom-invariant) content size to the renderer whenever the
    // native window is resized. The renderer's auto-fit reads THIS rather than
    // its own post-zoom `innerWidth`, which is what removes the
    // resize → apply-zoom → resize feedback loop that made the UI vibrate.
    const onWindowResize = () => this.scheduleSendContentSize()
    this.window.on('resize', onWindowResize)
    this.addCleanupTask(() =>
      this.window.removeListener('resize', onWindowResize)
    )
    this.addCleanupTask(() => {
      if (this.contentSizeDebounceTimer !== null) {
        clearTimeout(this.contentSizeDebounceTimer)
        this.contentSizeDebounceTimer = null
      }
    })

    // We want to have the locale country code available in the renderer on load
    // so that it can be used to try to deduce some sane date/time/number
    // formatting defaults. This is a bit of a hack but it avoids the need to
    // have an IPC round trip to get that information from the main process.
    const localeCountryCode = app.getLocaleCountryCode() ?? ''
    void this.window
      .loadURL(
        encodePathAsUrl(__dirname, 'index.html') +
          `#lc=${encodeURIComponent(localeCountryCode)}` +
          `&ws=${encodeURIComponent(this.scope)}`
      )
      .catch(() =>
        this.reportRendererFailure({
          kind: 'setup-failed',
          stage: 'load-url',
        })
      )

    const onNativeThemeUpdated = () => {
      ipcWebContents.send(this.window.webContents, 'native-theme-updated')
    }
    nativeTheme.addListener('updated', onNativeThemeUpdated)
    this.addCleanupTask(() =>
      nativeTheme.removeListener('updated', onNativeThemeUpdated)
    )

    this.setupAutoUpdater()
  }

  /**
   * Emit the `onDidLoad` event if the page has loaded and the renderer has
   * signalled that it's ready.
   */
  private maybeEmitDidLoad() {
    if (!this.rendererLoaded) {
      return
    }

    this.emitter.emit('did-load', null)
  }

  private reportRendererFailure(failure: AppWindowRendererFailure) {
    if (this.quitting || this.rendererFailureReported) {
      return
    }

    this.rendererFailureReported = true
    this.emitter.emit('renderer-failure', failure)
  }

  /** Is the page loaded and has the renderer signalled it's ready? */
  private get rendererLoaded(): boolean {
    return !!this.loadTime && !!this.rendererReadyTime
  }

  public get isLoaded(): boolean {
    return this.rendererLoaded
  }

  public onClosed(fn: () => void) {
    this.window.on('closed', fn)
  }

  /** Report one non-clean renderer/load failure to the main recovery owner. */
  public onRendererFailure(
    fn: (failure: AppWindowRendererFailure) => void
  ): Disposable {
    return this.emitter.on('renderer-failure', fn)
  }

  /**
   * Register a function to call when the window is done loading. At that point
   * the page has loaded and the renderer has signalled that it is ready.
   */
  public onDidLoad(fn: () => void): Disposable {
    return this.emitter.on('did-load', fn)
  }

  public isMinimized() {
    return this.window.isMinimized()
  }

  /** Is the window currently visible? */
  public isVisible() {
    return this.window.isVisible()
  }

  public restore() {
    this.window.restore()
  }

  public isFocused() {
    return this.window.isFocused()
  }

  public get id(): number {
    return this.window.id
  }

  public focus() {
    this.window.focus()
  }

  public revealAndFocus() {
    if (this.window.isMinimized()) {
      this.window.restore()
    }
    if (!this.window.isVisible()) {
      this.show()
    }
    this.window.focus()
  }

  public setTitle(title: string) {
    this.window.setTitle(title)
  }

  public setBackgroundColor(color: string) {
    this.window.setBackgroundColor(color)
  }

  public get selectedRepositoryPath(): string | null {
    return this._selectedRepositoryPath
  }

  public get openRepositoryPaths(): ReadonlyArray<string> {
    return this._openRepositoryPaths
  }

  public setRepositoryState(
    selectedRepositoryPath: string | null,
    openRepositoryPaths: ReadonlyArray<string>
  ) {
    this._selectedRepositoryPath = selectedRepositoryPath
    this._openRepositoryPaths = [...new Set(openRepositoryPaths)]
  }

  /** Selects all the windows web contents */
  public selectAllWindowContents() {
    this.window.webContents.selectAll()
  }

  /** Show the window. */
  public show() {
    this.window.show()
    if (this.shouldMaximizeOnShow) {
      // Only maximize the window the first time it's shown, not every time.
      // Otherwise, it causes the problem described in desktop/desktop#11590
      this.shouldMaximizeOnShow = false
      this.window.maximize()
    }
  }

  /** Send the menu event to the renderer. */
  public sendMenuEvent(name: MenuEvent) {
    this.show()

    ipcWebContents.send(this.window.webContents, 'menu-event', name)
  }

  /** Send a URL action, optionally correlated to an internal OAuth callback. */
  public sendURLAction(
    action: URLActionType,
    oauthCallbackId?: string,
    revealWindow = true
  ) {
    // Operating-system callbacks reveal the app as before. An internal-browser
    // callback keeps browser chrome in front until the store acknowledges the
    // exact flow and the private authentication session can be retired.
    if (revealWindow) {
      this.show()
    }

    ipcWebContents.send(
      this.window.webContents,
      'url-action',
      action,
      oauthCallbackId
    )
  }

  /** Send the URL action to the renderer. */
  public sendCLIAction(action: CLIAction) {
    this.show()

    ipcWebContents.send(this.window.webContents, 'cli-action', action)
  }

  /** Send an authenticated local-agent command to the trusted renderer. */
  public sendAgentCommand(command: IAgentCommandEnvelope) {
    ipcWebContents.send(this.window.webContents, 'agent-command', command)
  }

  /** Reflect agent server lifecycle changes in the Preferences pane. */
  public sendAgentServerStatus(status: IAgentServerStatus) {
    ipcWebContents.send(this.window.webContents, 'agent-server-status', status)
  }

  public sendAccountsChanged() {
    ipcWebContents.send(this.window.webContents, 'accounts-changed')
  }

  /**
   * Tell the renderer that a background failure was contained in the main
   * process, so it can show a non-blocking notice. Never shows the window:
   * containment must not steal focus from whatever the user is doing.
   */
  public sendContainedBackgroundFailure() {
    ipcWebContents.send(this.window.webContents, 'contained-background-failure')
  }

  /** Send the app launch timing stats to the renderer. */
  public sendLaunchTimingStats(stats: ILaunchStats) {
    ipcWebContents.send(this.window.webContents, 'launch-timing-stats', stats)
  }

  /** Send the app menu to the renderer. */
  public sendAppMenu() {
    const appMenu = Menu.getApplicationMenu()
    if (appMenu) {
      const menu = menuFromElectronMenu(appMenu)
      ipcWebContents.send(this.window.webContents, 'app-menu', menu)
    }
  }

  /** Handle when a modal dialog is opened. */
  public dialogDidOpen() {
    if (this.window.isFocused()) {
      // No additional notifications are needed.
      return
    }
    // Care is taken to mimic OS dialog behaviors.
    if (__DARWIN__) {
      // macOS beeps when a modal dialog is opened.
      shell.beep()
      // See https://developer.apple.com/documentation/appkit/nsapplication/1428358-requestuserattention
      // "If the inactive app presents a modal panel, this method will be invoked with NSCriticalRequest
      // automatically. The modal panel is not brought to the front for an inactive app."
      // NOTE: flashFrame() uses the 'informational' level, so we need to explicitly bounce the dock
      // with the 'critical' level in order to that described behavior.
      app.dock?.bounce('critical')
    } else {
      // See https://learn.microsoft.com/en-us/windows/win32/uxguide/winenv-taskbar#taskbar-button-flashing
      // "If an inactive program requires immediate attention,
      // flash its taskbar button to draw attention and leave it highlighted."
      // It advises not to beep.
      this.window.once('focus', () => this.window.flashFrame(false))
      this.window.flashFrame(true)
    }
  }

  /** Send a certificate error to the renderer. */
  public sendCertificateError(
    certificate: Electron.Certificate,
    error: string,
    url: string
  ) {
    ipcWebContents.send(
      this.window.webContents,
      'certificate-error',
      certificate,
      error,
      url
    )
  }

  public showCertificateTrustDialog(
    certificate: Electron.Certificate,
    message: string
  ) {
    // The Electron type definitions don't include `showCertificateTrustDialog`
    // yet.
    const d = dialog as any
    d.showCertificateTrustDialog(
      this.window,
      { certificate, message },
      () => {}
    )
  }

  /**
   * Get the time (in milliseconds) spent loading the page.
   *
   * This will be `null` until `onDidLoad` is called.
   */
  public get loadTime(): number | null {
    return this._loadTime
  }

  /**
   * Get the time (in milliseconds) elapsed from the renderer being loaded to it
   * signaling it was ready.
   *
   * This will be `null` until `onDidLoad` is called.
   */
  public get rendererReadyTime(): number | null {
    return this._rendererReadyTime
  }

  public destroy() {
    this.window.destroy()
  }

  public setupAutoUpdater() {
    const onError = (error: Error) => {
      this.updateDownloadState.isDownloadingUpdate = false
      ipcWebContents.send(this.window.webContents, 'auto-updater-error', error)
    }
    autoUpdater.on('error', onError)
    this.addCleanupTask(() => autoUpdater.removeListener('error', onError))

    const onCheckingForUpdate = () => {
      this.updateDownloadState.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-checking-for-update'
      )
    }
    autoUpdater.on('checking-for-update', onCheckingForUpdate)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('checking-for-update', onCheckingForUpdate)
    )

    const onUpdateAvailable = () => {
      this.updateDownloadState.isDownloadingUpdate = true
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-available'
      )
    }
    autoUpdater.on('update-available', onUpdateAvailable)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('update-available', onUpdateAvailable)
    )

    const onUpdateNotAvailable = () => {
      this.updateDownloadState.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-not-available'
      )
    }
    autoUpdater.on('update-not-available', onUpdateNotAvailable)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('update-not-available', onUpdateNotAvailable)
    )

    const onUpdateDownloaded = () => {
      this.updateDownloadState.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-downloaded'
      )
    }
    autoUpdater.on('update-downloaded', onUpdateDownloaded)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('update-downloaded', onUpdateDownloaded)
    )
  }

  public async checkForUpdates(url: string) {
    try {
      const feedURL = await trySetUpdaterGuid(url)

      // Squirrel installs the highest version the feed advertises without ever
      // comparing it to the version already running, so a feed that regresses
      // reads to it as an ordinary update and moves the install backwards. Look
      // first, and refuse to hand over a feed whose best offer is older than
      // this build. The probe fails open, so an unreachable or unfamiliar feed
      // still goes to Squirrel exactly as before.
      const verdict = await probeUpdateFeed({
        feedURL,
        currentVersion: app.getVersion(),
      })

      if (verdict.kind === 'downgrade') {
        log.warn(
          `Refusing update feed offering ${
            verdict.version
          }, which is older than the running ${app.getVersion()}.`
        )
        this.updateDownloadState.isDownloadingUpdate = false
        ipcWebContents.send(
          this.window.webContents,
          'auto-updater-update-not-available'
        )
        return undefined
      }

      autoUpdater.setFeedURL({ url: feedURL })
      autoUpdater.checkForUpdates()
    } catch (e) {
      return e
    }
    return undefined
  }

  public minimizeWindow() {
    this.window.minimize()
  }

  public maximizeWindow() {
    this.window.maximize()
  }

  public unmaximizeWindow() {
    this.window.unmaximize()
  }

  public closeWindow() {
    this.window.close()
  }

  /** Promise-only renderer drain shared by native, app-wide, and update quits. */
  public prepareForClose(
    claim: ApplicationClosePreparationClaim
  ): Promise<INativeClosePreparationResult> {
    if (claim === 'application') {
      this.applicationClosePreparationClaimed = true
    }
    const preparation = this.nativeClosePreparation.requestPreparation()
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) {
      this.nativeClosePreparation.rendererDestroyed()
    }
    return preparation
  }

  /** Confirm that the current request arrived before its delivery deadline. */
  public startClosePreparation(requestId: string): boolean {
    return this.nativeClosePreparation.started(requestId)
  }

  /** Complete only the matching, started renderer drain. */
  public completeClosePreparation(requestId: string): boolean {
    return this.nativeClosePreparation.prepared(requestId)
  }

  public isMaximized() {
    return this.window.isMaximized()
  }

  public getCurrentWindowState() {
    return getWindowState(this.window)
  }

  public getCurrentWindowZoomFactor() {
    return this.window.webContents.zoomFactor
  }

  public setWindowZoomFactor(zoomFactor: number) {
    this.window.webContents.zoomFactor = zoomFactor
  }

  /**
   * Send the current window content size (in device-independent pixels) to the
   * renderer. `getContentSize` is invariant to the webContents zoom factor and
   * unaffected by the page's own scrollbars, so it's the stable, feedback-free
   * input the renderer's auto-fit needs (see AppStore.onWindowContentSizeChanged).
   */
  private sendContentSize() {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) {
      return
    }
    const [width, height] = this.window.getContentSize()
    ipcWebContents.send(
      this.window.webContents,
      'window-content-size-changed',
      width,
      height
    )
  }

  /** Debounce content-size delivery so dragging a window edge stays cheap. */
  private scheduleSendContentSize = () => {
    if (this.contentSizeDebounceTimer !== null) {
      clearTimeout(this.contentSizeDebounceTimer)
    }
    this.contentSizeDebounceTimer = setTimeout(() => {
      this.contentSizeDebounceTimer = null
      this.sendContentSize()
    }, AutoFitDebounceMs)
  }

  /**
   * Method to show the save dialog and return the first file path it returns.
   */
  public async showSaveDialog(options: Electron.SaveDialogOptions) {
    const { canceled, filePath } = await dialog.showSaveDialog(
      this.window,
      options
    )
    return !canceled && filePath !== undefined ? filePath : null
  }

  /**
   * Method to show the open dialog and return the first file path it returns.
   */
  public async showOpenDialog(options: Electron.OpenDialogOptions) {
    const { filePaths } = await dialog.showOpenDialog(this.window, options)
    return filePaths.length > 0 ? filePaths[0] : null
  }

  /** Show an open dialog and return every path selected by the user. */
  public async showOpenDialogMultiple(options: Electron.OpenDialogOptions) {
    const { filePaths } = await dialog.showOpenDialog(this.window, {
      ...options,
      properties: Array.from(
        new Set([...(options.properties ?? []), 'multiSelections' as const])
      ),
    })
    return filePaths
  }

  public markWillQuit(evenIfUpdating = false) {
    this.quitting = true
    if (evenIfUpdating) {
      this.quittingEvenIfUpdating = true
    }
  }

  /**
   * Preserve the existing update-download guard before an app-wide drain. The
   * caller stops at the first blocking window so only one dialog is revealed.
   */
  public preventApplicationQuitForUpdate(evenIfUpdating: boolean): boolean {
    if (
      evenIfUpdating ||
      !this.updateDownloadState.isDownloadingUpdate ||
      this.window.isDestroyed() ||
      this.window.webContents.isDestroyed()
    ) {
      return false
    }
    this.showUpdateQuitPrevention()
    return true
  }

  public cancelQuitting() {
    this.quitting = false
    this.quittingEvenIfUpdating = false
    this.closeWhenPrepared = false
    this.applicationClosePreparationClaimed = false
    this.nativeClosePreparation.reset()
    if (!this.window.webContents.isDestroyed()) {
      ipcWebContents.send(
        this.window.webContents,
        'cancel-window-close-preparation'
      )
    }
  }

  private requestNativeWindowClose() {
    if (this.closeWhenPrepared) {
      return
    }
    this.closeWhenPrepared = true
    void this.prepareForClose('native-window').then(result => {
      if (
        !this.closeWhenPrepared ||
        this.applicationClosePreparationClaimed ||
        result.reason === 'reset'
      ) {
        return
      }
      if (
        result.reason !== 'prepared' &&
        result.reason !== 'renderer-destroyed'
      ) {
        log.warn(
          `Renderer native-close preparation ended with ${result.reason}; continuing bounded window close`
        )
      }
      if (!this.window.isDestroyed()) {
        this.window.close()
      }
    })
  }

  private showUpdateQuitPrevention() {
    if (this.window.webContents.isDestroyed()) {
      return
    }
    ipcWebContents.send(this.window.webContents, 'show-installing-update')
    // The user needs to see why quit was stopped even if the window was hidden.
    this.show()
  }

  private addCleanupTask(task: () => void) {
    this.cleanupTasks.push(task)
  }

  private cleanup() {
    this.nativeClosePreparation.rendererDestroyed()
    for (const task of this.cleanupTasks.splice(0).reverse()) {
      try {
        task()
      } catch (error) {
        try {
          log.error(
            'Unable to clean up an application window listener',
            error instanceof Error ? error : new Error(String(error))
          )
        } catch {
          // Continue releasing sibling listeners even when diagnostics fail.
        }
      }
    }
    try {
      this.emitter.dispose()
    } catch (error) {
      try {
        log.error(
          'Unable to dispose application window events',
          error instanceof Error ? error : new Error(String(error))
        )
      } catch {
        // Window teardown is terminal and must remain failure-contained.
      }
    }
  }
}

const trySetUpdaterGuid = async (url: string) => {
  try {
    const id = await getUpdaterGUID()
    if (!id) {
      return url
    }

    const parsed = new URL(url)
    parsed.searchParams.set('guid', id)
    return parsed.toString()
  } catch (e) {
    return url
  }
}
