import { BrowserWindow, shell, WebContents, WebContentsView } from 'electron'
import { randomUUID } from 'crypto'
import { encodePathAsUrl } from '../lib/path'
import { DefaultAppDisplayName } from '../models/app-identity'
import { IOAuthAction, parseAppURL } from '../lib/parse-app-url'
import {
  BrowserOpenIntent,
  canCreateInternalBrowserTab,
  createAuthenticationPartition,
  IInternalBrowserContentBounds,
  IInternalBrowserState,
  IInternalBrowserTabState,
  InternalBrowserOAuthCallbackResult,
  InternalBrowserCommand,
  InternalBrowserTabError,
  normalizeAddressInput,
  normalizeWebURL,
  redactBrowserURL,
  resolveInternalBrowserContentBounds,
  MaximumPageTextLength,
  PageTextExtractionScript,
  sanitizeBrowserTitle,
  selectInternalBrowserAuthenticationFlowsForResolution,
  shouldDispatchInternalBrowserAppAction,
  shouldRetireInternalBrowserAuthenticationSession,
} from '../lib/internal-browser'
import * as ipcWebContents from './ipc-webcontents'
import { addTrustedIPCSender } from './trusted-ipc-sender'
import { openInternalBrowserURLExternally } from './internal-browser-external-open'

interface IInternalBrowserTab {
  readonly id: string
  readonly view: WebContentsView
  readonly intent: BrowserOpenIntent
  readonly authenticationFlowId: string | null
  title: string
  url: string | null
  error: InternalBrowserTabError | null
  authenticationCallbackPending: boolean
}

interface IInternalBrowserAuthenticationFlow {
  readonly id: string
  readonly ownerWindowId: number | null
  readonly oauthState: string | null
  readonly partition: string
  session: Electron.Session | null
}

export interface IInternalBrowserWindowOptions {
  readonly handleAuthenticationCallback: (
    action: IOAuthAction,
    ownerWindowId: number | null
  ) => Promise<InternalBrowserOAuthCallbackResult>
  readonly isAppURL: (url: string) => boolean
  readonly onExternalOpenFailed: (ownerWindowId: number | null) => void
  readonly onClosed: () => void
}

const internalRemoteWebContents = new Set<number>()
const configuredSessions = new WeakSet<Electron.Session>()
const downloadBlockedHandlers = new Map<number, () => void>()
const safeOperatingSystemSchemes = new Set(['mailto:', 'tel:', 'ms-settings:'])
const minimumContentTop = 128
/**
 * Isolated world the page-text read runs in.
 *
 * Any id other than 0 (the page's own main world) keeps the script's globals
 * separate from the page's, so the page can neither observe the read nor
 * replace what it calls.
 */
const PageTextReadWorldId = 1010
let nextTabId = 1

/**
 * True only for sandboxed remote pages owned by the internal browser.
 *
 * The main process' global navigation guard consults this registry at event
 * time. Registration happens immediately after WebContentsView construction,
 * before a remote URL is loaded.
 */
export function isInternalBrowserRemoteWebContents(
  webContents: WebContents
): boolean {
  return internalRemoteWebContents.has(webContents.id)
}

/**
 * App-hosted browser chrome plus sandboxed remote WebContentsView tabs.
 *
 * The chrome renderer is a trusted local bundle. Remote pages are never
 * registered as trusted IPC senders, never receive a preload, and live in
 * dedicated sessions with every Electron permission denied. Authentication
 * tabs additionally use an in-memory partition and cannot be bookmarked.
 */
export class InternalBrowserWindow {
  private readonly window: BrowserWindow
  private readonly tabs = new Map<string, IInternalBrowserTab>()
  private readonly authenticationFlows = new Map<
    string,
    IInternalBrowserAuthenticationFlow
  >()
  private readonly options: IInternalBrowserWindowOptions
  private activeTabId: string | null = null
  private contentBounds: Electron.Rectangle = {
    x: 0,
    y: minimumContentTop,
    width: 0,
    height: 0,
  }
  private rendererReady = false
  private finishedLoading = false

  public constructor(options: IInternalBrowserWindowOptions) {
    this.options = options
    this.window = new BrowserWindow({
      width: 1160,
      height: 780,
      minWidth: 720,
      minHeight: 520,
      show: false,
      title: DefaultAppDisplayName,
      backgroundColor: '#f7f7ff',
      webPreferences: {
        disableBlinkFeatures: 'Auxclick',
        nodeIntegration: true,
        contextIsolation: false,
        spellcheck: false,
      },
    })
    addTrustedIPCSender(this.window.webContents)

    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.window.webContents.once('did-finish-load', () => {
      this.finishedLoading = true
      this.window.show()
      this.window.focus()
      this.sendState()
    })
    this.window.webContents.on(
      'did-fail-load',
      (_event, errorCode, _description, validatedURL) => {
        log.error(
          `Internal browser chrome failed to load (${errorCode}) at ${redactBrowserURL(
            validatedURL
          )}`
        )
      }
    )
    this.window.on('resize', () => this.applyContentBounds())
    this.window.once('closed', () => {
      const authenticationFlowIds = [...this.authenticationFlows.keys()]
      for (const tab of this.tabs.values()) {
        internalRemoteWebContents.delete(tab.view.webContents.id)
        downloadBlockedHandlers.delete(tab.view.webContents.id)
      }
      this.tabs.clear()
      for (const authenticationFlowId of authenticationFlowIds) {
        void this.clearAuthenticationStorage(authenticationFlowId)
      }
      this.options.onClosed()
    })

    void this.window
      .loadURL(encodePathAsUrl(__dirname, 'internal-browser.html'))
      .catch(error => log.error('Internal browser chrome load rejected', error))
  }

  public get webContents(): WebContents {
    return this.window.webContents
  }

  public get isDestroyed(): boolean {
    return this.window.isDestroyed()
  }

  public ownsRemoteWebContents(webContents: WebContents): boolean {
    return isInternalBrowserRemoteWebContents(webContents)
  }

  public open(
    url: string,
    intent: BrowserOpenIntent,
    authenticationOwnerWindowId: number | null = null
  ): boolean {
    const normalized = normalizeWebURL(url)
    if (normalized === null) {
      return false
    }

    const authenticationFlowId =
      intent === 'authentication'
        ? this.createAuthenticationFlow(normalized, authenticationOwnerWindowId)
        : null
    const opened = this.createTab(
      normalized,
      intent,
      null,
      authenticationFlowId
    )
    if (!opened && authenticationFlowId !== null) {
      void this.clearAuthenticationStorage(authenticationFlowId)
    }
    if (this.finishedLoading) {
      this.window.show()
      this.window.focus()
    }
    return opened
  }

  public onRendererReady() {
    this.rendererReady = true
    this.sendState()
  }

  public setContentBounds(bounds: IInternalBrowserContentBounds) {
    if (
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height)
    ) {
      return
    }

    const [windowWidth, windowHeight] = this.window.getContentSize()
    const x = Math.max(0, Math.min(Math.trunc(bounds.x), windowWidth))
    const y = Math.max(
      minimumContentTop,
      Math.min(Math.trunc(bounds.y), windowHeight)
    )
    this.contentBounds = {
      x,
      y,
      width: Math.max(0, Math.min(Math.trunc(bounds.width), windowWidth - x)),
      height: Math.max(
        0,
        Math.min(Math.trunc(bounds.height), windowHeight - y)
      ),
    }
    this.applyContentBounds()
  }

  public handleCommand(command: InternalBrowserCommand) {
    switch (command.type) {
      case 'new-tab': {
        const intent = command.intent ?? 'default'
        if (command.url === undefined) {
          this.createTab(null, intent)
        } else {
          const normalized = normalizeAddressInput(command.url)
          if (normalized === null) {
            this.createTab(null, intent, 'invalid-address')
          } else {
            this.createTab(normalized, intent)
          }
        }
        return
      }
      case 'activate-tab':
        this.activateTab(command.tabId)
        return
      case 'close-tab':
        this.closeTab(command.tabId)
        return
      case 'navigate': {
        const tab = this.tabs.get(command.tabId)
        if (tab === undefined) {
          return
        }
        const normalized = normalizeAddressInput(command.url)
        if (normalized === null) {
          tab.error = 'invalid-address'
          this.sendState()
          return
        }
        tab.error = null
        void tab.view.webContents
          .loadURL(normalized)
          .catch(() => this.setTabError(tab, 'load-failed'))
        return
      }
      case 'go-back': {
        const contents = this.tabs.get(command.tabId)?.view.webContents
        if (contents?.navigationHistory.canGoBack()) {
          contents.navigationHistory.goBack()
        }
        return
      }
      case 'go-forward': {
        const contents = this.tabs.get(command.tabId)?.view.webContents
        if (contents?.navigationHistory.canGoForward()) {
          contents.navigationHistory.goForward()
        }
        return
      }
      case 'reload': {
        const contents = this.tabs.get(command.tabId)?.view.webContents
        if (contents !== undefined) {
          contents.reload()
        }
        return
      }
      case 'stop': {
        const contents = this.tabs.get(command.tabId)?.view.webContents
        if (contents !== undefined) {
          contents.stop()
        }
        return
      }
      case 'find-in-page': {
        const contents = this.tabs.get(command.tabId)?.view.webContents
        if (contents === undefined) {
          return
        }
        // An empty query is a stop, not a search for nothing: Chromium treats
        // an empty string as an error and would leave the previous highlight
        // on the page after the user has cleared the box.
        if (command.query.length === 0) {
          contents.stopFindInPage('clearSelection')
          this.sendFindResult(command.tabId, { total: 0, active: 0 })
          return
        }
        contents.findInPage(command.query, {
          matchCase: command.matchCase,
          forward: command.forward,
          findNext: command.findNext,
        })
        return
      }
      case 'stop-find-in-page': {
        const contents = this.tabs.get(command.tabId)?.view.webContents
        if (contents !== undefined) {
          contents.stopFindInPage('clearSelection')
        }
        return
      }
      case 'read-page-text': {
        const contents = this.tabs.get(command.tabId)?.view.webContents
        if (contents === undefined) {
          return
        }
        // An isolated world, so the page cannot observe the read, cannot
        // replace the globals it uses, and is left with nothing behind. The
        // pattern being searched for never enters the page at all — only the
        // text comes out.
        contents
          .executeJavaScriptInIsolatedWorld(PageTextReadWorldId, [
            { code: PageTextExtractionScript },
          ])
          .then(
            (text: unknown) =>
              this.sendPageText(
                command.tabId,
                typeof text === 'string'
                  ? text.slice(0, MaximumPageTextLength)
                  : ''
              ),
            (error: Error) => {
              // A page that refuses to be read is a failed search, not a
              // failed browser.
              log.debug(`Internal browser page read failed: ${error.message}`)
              this.sendPageText(command.tabId, '')
            }
          )
        return
      }
      case 'open-external': {
        const tab = this.tabs.get(command.tabId)
        if (tab?.url !== null && tab?.url !== undefined) {
          // Merely handing the address to the system browser is not proof that
          // OAuth succeeded. Retain the private tab/session until the trusted
          // renderer acknowledges the matching callback.
          const ownerWindowId =
            tab.authenticationFlowId === null
              ? null
              : this.authenticationFlows.get(tab.authenticationFlowId)
                  ?.ownerWindowId ?? null
          void openInternalBrowserURLExternally(
            tab.url,
            ownerWindowId,
            target => shell.openExternal(target),
            this.options.onExternalOpenFailed,
            error => log.error('Internal browser external escape failed', error)
          )
        }
        return
      }
    }
  }

  public handleCertificateError(webContents: WebContents) {
    const tab = this.findTabByWebContents(webContents)
    if (tab !== null) {
      this.setTabError(tab, 'certificate-error')
    }
  }

  public handleAuthenticationResolution(
    ownerWindowId: number,
    oauthState: string,
    result: InternalBrowserOAuthCallbackResult
  ) {
    const flowsToRetire = selectInternalBrowserAuthenticationFlowsForResolution(
      [...this.authenticationFlows.values()],
      ownerWindowId,
      oauthState,
      result
    )
    for (const authenticationFlowId of flowsToRetire) {
      this.retireAuthenticationFlow(authenticationFlowId)
    }
  }

  private createTab(
    url: string | null,
    intent: BrowserOpenIntent,
    error: InternalBrowserTabError | null = null,
    existingAuthenticationFlowId: string | null = null
  ): boolean {
    if (!canCreateInternalBrowserTab(this.tabs.size)) {
      const active =
        this.activeTabId === null ? undefined : this.tabs.get(this.activeTabId)
      if (active !== undefined) {
        this.setTabError(active, 'too-many-tabs')
      }
      return false
    }
    const id = `browser-tab-${nextTabId++}`
    const authenticationFlowId =
      intent === 'authentication'
        ? existingAuthenticationFlowId ??
          this.createAuthenticationFlow(url, null)
        : null
    const authenticationFlow =
      authenticationFlowId === null
        ? null
        : this.authenticationFlows.get(authenticationFlowId) ?? null
    if (intent === 'authentication' && authenticationFlow === null) {
      return false
    }
    const partition =
      authenticationFlow?.partition ??
      'persist:desktop-material-internal-browser'
    const view = new WebContentsView({
      webPreferences: {
        partition,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
        disableBlinkFeatures: 'Auxclick',
        safeDialogs: true,
      },
    })
    const tab: IInternalBrowserTab = {
      id,
      view,
      intent,
      authenticationFlowId,
      title: url === null ? '' : new URL(url).hostname,
      url,
      error,
      authenticationCallbackPending: false,
    }
    this.tabs.set(id, tab)
    internalRemoteWebContents.add(view.webContents.id)
    downloadBlockedHandlers.set(view.webContents.id, () =>
      this.setTabError(tab, 'download-blocked')
    )
    if (authenticationFlow !== null && authenticationFlow.session === null) {
      authenticationFlow.session = view.webContents.session
    }
    this.configureRemoteSession(tab)
    this.configureRemoteWebContents(tab)
    this.window.contentView.addChildView(view)
    view.setBounds(this.resolveContentBounds())
    view.setVisible(false)
    this.activateTab(id)

    if (url !== null) {
      void view.webContents
        .loadURL(url)
        .catch(() => this.setTabError(tab, 'load-failed'))
    }
    return true
  }

  private configureRemoteSession(tab: IInternalBrowserTab) {
    const remoteSession = tab.view.webContents.session
    if (configuredSessions.has(remoteSession)) {
      return
    }
    configuredSessions.add(remoteSession)
    remoteSession.setPermissionCheckHandler(() => false)
    remoteSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false)
    )
    remoteSession.on('will-download', (event, _item, webContents) => {
      const markBlocked = downloadBlockedHandlers.get(webContents.id)
      if (markBlocked === undefined) {
        return
      }
      event.preventDefault()
      markBlocked()
    })
  }

  private configureRemoteWebContents(tab: IInternalBrowserTab) {
    const contents = tab.view.webContents

    contents.setWindowOpenHandler(({ url }) => {
      this.routeRemoteTarget(url, tab)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (normalizeWebURL(url) !== null) {
        return
      }
      event.preventDefault()
      this.routeRemoteTarget(url, tab)
    })
    contents.on('will-redirect', (event, url, _inPlace, isMainFrame) => {
      if (!isMainFrame || normalizeWebURL(url) !== null) {
        return
      }
      event.preventDefault()
      this.routeRemoteTarget(url, tab)
    })
    contents.on('did-start-loading', () => {
      tab.error = null
      this.sendState()
    })
    contents.on('did-stop-loading', () => this.refreshTab(tab))
    contents.on('did-navigate', (_event, url) => {
      tab.url = normalizeWebURL(url)
      this.refreshTab(tab)
    })
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) {
        tab.url = normalizeWebURL(url)
        this.refreshTab(tab)
      }
    })
    // Chromium reports its own in-page match tally asynchronously; the find bar
    // has no other way to learn how many matches a plain search found.
    contents.on('found-in-page', (_event, result) => {
      this.sendFindResult(tab.id, {
        total: result.matches,
        active: result.activeMatchOrdinal,
      })
    })
    contents.on('page-title-updated', (event, title) => {
      event.preventDefault()
      tab.title =
        sanitizeBrowserTitle(title) ||
        (tab.url === null ? '' : new URL(tab.url).hostname)
      this.sendState()
    })
    contents.on(
      'did-fail-load',
      (_event, errorCode, _description, validatedURL, isMainFrame) => {
        // Chromium reports cancellation as -3 during ordinary navigation.
        if (!isMainFrame || errorCode === -3) {
          return
        }
        log.error(
          `Internal browser page failed to load (${errorCode}) at ${redactBrowserURL(
            validatedURL
          )}`
        )
        this.setTabError(tab, 'load-failed')
      }
    )
    contents.on('render-process-gone', () =>
      this.setTabError(tab, 'renderer-gone')
    )
    contents.once('destroyed', () => {
      internalRemoteWebContents.delete(contents.id)
      downloadBlockedHandlers.delete(contents.id)
    })
  }

  private routeRemoteTarget(url: string, sourceTab: IInternalBrowserTab) {
    if (this.options.isAppURL(url)) {
      const action = parseAppURL(url)
      const authenticationFlow =
        sourceTab.authenticationFlowId === null
          ? null
          : this.authenticationFlows.get(sourceTab.authenticationFlowId) ?? null
      if (
        !shouldDispatchInternalBrowserAppAction(
          sourceTab.intent,
          action,
          authenticationFlow?.oauthState ?? null
        ) ||
        authenticationFlow === null ||
        sourceTab.authenticationCallbackPending
      ) {
        log.warn(
          'Internal browser rejected an untrusted or duplicate app callback'
        )
        return
      }
      sourceTab.authenticationCallbackPending = true
      void this.options
        .handleAuthenticationCallback(action, authenticationFlow.ownerWindowId)
        .then(result => {
          if (this.tabs.get(sourceTab.id) !== sourceTab) {
            return
          }
          sourceTab.authenticationCallbackPending = false
          if (
            shouldRetireInternalBrowserAuthenticationSession(
              sourceTab.intent,
              result
            )
          ) {
            this.retireAuthenticationFlow(authenticationFlow.id)
          }
        })
        .catch(error => {
          if (this.tabs.get(sourceTab.id) === sourceTab) {
            sourceTab.authenticationCallbackPending = false
          }
          log.error('Internal browser OAuth callback handshake failed', error)
        })
      return
    }

    const normalized = normalizeWebURL(url)
    if (normalized !== null) {
      this.createTab(
        normalized,
        sourceTab.intent,
        null,
        sourceTab.authenticationFlowId
      )
      return
    }

    try {
      const parsed = new URL(url)
      if (safeOperatingSystemSchemes.has(parsed.protocol)) {
        void shell.openExternal(url).catch(error => {
          log.error(
            'Internal browser could not open an operating-system link',
            error
          )
        })
      }
    } catch {
      log.warn('Internal browser ignored a malformed navigation target')
    }
  }

  private refreshTab(tab: IInternalBrowserTab) {
    const contents = tab.view.webContents
    if (contents.isDestroyed()) {
      return
    }
    tab.url = normalizeWebURL(contents.getURL())
    tab.title =
      sanitizeBrowserTitle(contents.getTitle()) ||
      (tab.url === null ? '' : new URL(tab.url).hostname)
    this.sendState()
  }

  private setTabError(
    tab: IInternalBrowserTab,
    error: InternalBrowserTabError
  ) {
    if (!tab.view.webContents.isDestroyed()) {
      tab.error = error
      this.sendState()
    }
  }

  private activateTab(tabId: string) {
    if (!this.tabs.has(tabId)) {
      return
    }
    this.activeTabId = tabId
    for (const tab of this.tabs.values()) {
      tab.view.setVisible(tab.id === tabId)
      if (tab.id === tabId) {
        tab.view.setBounds(this.resolveContentBounds())
        tab.view.webContents.focus()
      }
    }
    this.sendState()
  }

  private closeTab(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (tab === undefined) {
      return
    }
    const orderedIds = [...this.tabs.keys()]
    const closedIndex = orderedIds.indexOf(tabId)
    this.window.contentView.removeChildView(tab.view)
    this.tabs.delete(tabId)
    internalRemoteWebContents.delete(tab.view.webContents.id)
    downloadBlockedHandlers.delete(tab.view.webContents.id)
    if (!tab.view.webContents.isDestroyed()) {
      tab.view.webContents.close()
    }
    if (
      tab.authenticationFlowId !== null &&
      ![...this.tabs.values()].some(
        candidate => candidate.authenticationFlowId === tab.authenticationFlowId
      )
    ) {
      void this.clearAuthenticationStorage(tab.authenticationFlowId)
    }

    if (this.tabs.size === 0) {
      this.window.close()
      return
    }
    if (this.activeTabId === tabId) {
      const nextId =
        orderedIds[closedIndex + 1] ??
        orderedIds[closedIndex - 1] ??
        this.tabs.keys().next().value
      if (typeof nextId === 'string') {
        this.activateTab(nextId)
      }
    } else {
      this.sendState()
    }
  }

  private findTabByWebContents(
    webContents: WebContents
  ): IInternalBrowserTab | null {
    for (const tab of this.tabs.values()) {
      if (tab.view.webContents.id === webContents.id) {
        return tab
      }
    }
    return null
  }

  private createAuthenticationFlow(
    url: string | null,
    ownerWindowId: number | null
  ): string {
    const id = `authentication-flow-${randomUUID()}`
    const partition = createAuthenticationPartition(randomUUID()).partition
    const oauthState =
      url === null ? null : new URL(url).searchParams.get('state')
    this.authenticationFlows.set(id, {
      id,
      ownerWindowId,
      oauthState,
      partition,
      session: null,
    })
    return id
  }

  private retireAuthenticationFlow(authenticationFlowId: string) {
    const tabsToRetire = [...this.tabs.values()]
      .filter(tab => tab.authenticationFlowId === authenticationFlowId)
      .map(tab => tab.id)
    for (const tabId of tabsToRetire) {
      this.closeTab(tabId)
    }
    if (tabsToRetire.length === 0) {
      void this.clearAuthenticationStorage(authenticationFlowId)
    }
  }

  private async clearAuthenticationStorage(authenticationFlowId: string) {
    const authenticationFlow =
      this.authenticationFlows.get(authenticationFlowId)
    if (authenticationFlow === undefined) {
      return
    }
    // Remove the unique flow before awaiting any storage work. A replacement
    // sign-in always receives a new partition and can never attach to the
    // session currently being erased.
    this.authenticationFlows.delete(authenticationFlowId)
    const authenticationSession = authenticationFlow.session
    if (authenticationSession === null) {
      return
    }
    try {
      await authenticationSession.clearStorageData()
      await authenticationSession.clearCache()
    } catch (error) {
      log.error('Unable to clear internal authentication browser data', error)
    }
  }

  /**
   * The area a tab's native view should occupy.
   *
   * `contentBounds` starts at zero and is only filled in once the chrome
   * renderer measures its viewport and reports it over IPC. That report is
   * driven by `requestAnimationFrame`, which a hidden BrowserWindow suspends —
   * so a tab created before the window is shown could sit at 0x0 forever and
   * render as a blank window. A zero-sized measurement therefore means "not
   * measured yet", not "genuinely zero wide": fall back to the whole content
   * area below the chrome so the page is always visible, and let the renderer's
   * real measurement refine it the moment it arrives.
   */
  private resolveContentBounds(): Electron.Rectangle {
    const [width, height] = this.window.getContentSize()
    return resolveInternalBrowserContentBounds(
      this.contentBounds,
      width,
      height,
      minimumContentTop
    )
  }

  private applyContentBounds() {
    if (this.window.isDestroyed()) {
      return
    }
    const bounds = this.resolveContentBounds()
    const active = this.activeTabId
    for (const tab of this.tabs.values()) {
      if (tab.id === active) {
        tab.view.setBounds(bounds)
      }
    }
  }

  private serializeTab(tab: IInternalBrowserTab): IInternalBrowserTabState {
    const contents = tab.view.webContents
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      intent: tab.intent,
      isLoading: !contents.isDestroyed() && contents.isLoading(),
      canGoBack:
        !contents.isDestroyed() && contents.navigationHistory.canGoBack(),
      canGoForward:
        !contents.isDestroyed() && contents.navigationHistory.canGoForward(),
      canBookmark: tab.intent !== 'authentication' && tab.url !== null,
      error: tab.error,
    }
  }

  private sendState() {
    if (
      !this.rendererReady ||
      this.window.isDestroyed() ||
      this.window.webContents.isDestroyed()
    ) {
      return
    }
    const state: IInternalBrowserState = {
      tabs: [...this.tabs.values()].map(tab => this.serializeTab(tab)),
      activeTabId: this.activeTabId,
    }
    ipcWebContents.send(
      this.window.webContents,
      'internal-browser-state',
      state
    )
  }

  /** Report Chromium's own in-page match tally to the find bar. */
  private sendFindResult(
    tabId: string,
    result: { readonly total: number; readonly active: number }
  ) {
    if (
      this.window.isDestroyed() ||
      this.window.webContents.isDestroyed()
    ) {
      return
    }
    ipcWebContents.send(this.window.webContents, 'internal-browser-find', {
      tabId,
      total: result.total,
      active: result.active,
    })
  }

  /** Hand the bounded page text to the trusted renderer for RE2 evaluation. */
  private sendPageText(tabId: string, text: string) {
    if (
      this.window.isDestroyed() ||
      this.window.webContents.isDestroyed()
    ) {
      return
    }
    ipcWebContents.send(this.window.webContents, 'internal-browser-page-text', {
      tabId,
      text,
      truncated: text.length >= MaximumPageTextLength,
    })
  }
}
