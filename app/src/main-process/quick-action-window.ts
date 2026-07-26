import { BrowserWindow } from 'electron'
import { Emitter } from 'event-kit'
import { encodePathAsUrl } from '../lib/path'
import { IQuickActionRequest } from '../lib/quick-action'
import { registerWindowStateChangedEvents } from '../lib/window-state'
import * as ipcWebContents from './ipc-webcontents'
import { addTrustedIPCSender } from './trusted-ipc-sender'

/**
 * A small, always-on-top window scoped to one folder, opened by the Explorer
 * context-menu verbs.
 *
 * It deliberately shares nothing with `AppWindow`: no workspace restore, no
 * repository list, no stores. A right-click is a momentary intent, so the
 * window's job is to appear fast, do one thing, and close. The renderer entry
 * (`src/quick-action`) is a separate webpack bundle for the same reason — the
 * main renderer bundle is far larger than this window needs.
 *
 * Cold-open time is the feature's whole value, so the window records the
 * timestamp it was constructed at and hands it to the renderer, which reports
 * the measured interval once it is interactive.
 */
export class QuickActionWindow {
  private readonly window: Electron.BrowserWindow
  private readonly emitter = new Emitter()
  private readonly request: IQuickActionRequest
  private readonly launchedAt: number

  private hasFinishedLoading = false
  private hasSentReadyEvent = false

  public constructor(request: IQuickActionRequest, launchedAt: number) {
    this.request = request
    this.launchedAt = launchedAt

    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: 460,
      height: 400,
      minWidth: 380,
      minHeight: 320,
      // Sized to its content rather than resizable-by-default: this is a
      // transient panel, not a workspace.
      show: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      maximizable: false,
      fullscreenable: false,
      // Matches the crash window: avoids subpixel-aliasing artefacts on Windows
      // before the renderer paints its own themed background.
      backgroundColor: '#fff',
      webPreferences: {
        disableBlinkFeatures: 'Auxclick',
        nodeIntegration: true,
        spellcheck: false,
        contextIsolation: false,
      },
    }

    if (__DARWIN__) {
      windowOptions.titleBarStyle = 'hidden'
    } else if (__WIN32__) {
      windowOptions.frame = false
    }

    this.window = new BrowserWindow(windowOptions)
    addTrustedIPCSender(this.window.webContents)
  }

  public load() {
    log.debug(`Starting quick action window (${this.request.verb})`)

    this.window.webContents.once('did-finish-load', () => {
      if (process.env.NODE_ENV === 'development') {
        this.window.webContents.openDevTools({ mode: 'detach' })
      }
      this.hasFinishedLoading = true
      this.maybeSendRequest()
    })

    this.window.webContents.on('did-fail-load', (_event, errorCode) => {
      log.error(`Quick action window failed to load (${errorCode})`)
      this.emitter.emit('did-fail-load', null)
    })

    registerWindowStateChangedEvents(this.window)

    this.window.once('closed', () => this.emitter.dispose())

    void this.window
      .loadURL(encodePathAsUrl(__dirname, 'quick-action.html'))
      .catch(error => {
        log.error('Quick action window load rejected', error)
        this.emitter.emit('did-fail-load', null)
      })
  }

  /** Called once the renderer signals it is listening. */
  public onRendererReady() {
    this.hasSentReadyEvent = true
    this.maybeSendRequest()
  }

  private maybeSendRequest() {
    if (!this.hasFinishedLoading || !this.hasSentReadyEvent) {
      return
    }
    ipcWebContents.send(
      this.window.webContents,
      'quick-action-request',
      this.request,
      this.launchedAt
    )
  }

  public show() {
    this.window.show()
    this.window.focus()
    // Stay above other windows only until the user engages with it: a panel
    // that is permanently on top becomes an obstruction rather than a
    // convenience.
    this.window.once('blur', () => {
      if (!this.window.isDestroyed()) {
        this.window.setAlwaysOnTop(false)
      }
    })
  }

  public close() {
    if (!this.window.isDestroyed()) {
      this.window.close()
    }
  }

  public onClose(fn: () => void) {
    this.window.on('closed', fn)
  }

  public onFailedToLoad(fn: () => void) {
    this.emitter.on('did-fail-load', fn)
  }

  public get webContents(): Electron.WebContents {
    return this.window.webContents
  }
}
