/* eslint-disable react/jsx-no-bind -- tab and bookmark rows bind their exact in-memory browser item */
import * as React from 'react'
import * as ipcRenderer from '../lib/ipc-renderer'
import {
  getPersistedLanguageMode,
  translate,
  translateForAccessibleName,
  TranslationKey,
} from '../lib/i18n'
import { LanguageMode } from '../models/language-mode'
import { LanguageModeStorageKey } from '../lib/language-preference'
import {
  bookmarkSafeURL,
  IInternalBrowserBookmark,
  IInternalBrowserState,
  IInternalBrowserTabState,
  InternalBrowserBookmarksStorageKey,
  InternalBrowserCommand,
  InternalBrowserTabError,
  readInternalBrowserBookmarks,
  sanitizeBrowserTitle,
  writeInternalBrowserBookmarks,
} from '../lib/internal-browser'
import { MaterialSymbol } from '../ui/lib/material-symbol'
import { applyPersistedInternalBrowserAppearance } from './internal-browser-appearance'

interface IInternalBrowserAppState {
  readonly browser: IInternalBrowserState
  readonly address: string
  readonly addressDirty: boolean
  readonly bookmarks: ReadonlyArray<IInternalBrowserBookmark>
  readonly languageMode: LanguageMode
}

const emptyBrowserState: IInternalBrowserState = {
  tabs: [],
  activeTabId: null,
}

/**
 * How long to wait for an animation frame before measuring the content viewport
 * on a plain timer instead. Long enough that a visible window always reports
 * through the frame callback, short enough that a hidden one is not left
 * showing a blank page.
 */
const BoundsMeasurementFallbackDelay = 120

/** Id of the geometry element the tabs declare as their panel. */
const ContentViewportId = 'internal-browser-content-viewport'

function activeTab(
  state: IInternalBrowserState
): IInternalBrowserTabState | null {
  return (
    state.tabs.find(candidate => candidate.id === state.activeTabId) ?? null
  )
}

function errorTranslationKey(error: InternalBrowserTabError): TranslationKey {
  switch (error) {
    case 'invalid-address':
      return 'browser.error.invalidAddress'
    case 'load-failed':
      return 'browser.error.loadFailed'
    case 'certificate-error':
      return 'browser.error.certificate'
    case 'download-blocked':
      return 'browser.error.downloadBlocked'
    case 'renderer-gone':
      return 'browser.error.rendererGone'
    case 'too-many-tabs':
      return 'browser.error.tooManyTabs'
  }
}

/**
 * Trusted browser chrome. The page content itself lives in native,
 * sandboxed WebContentsViews owned by the main process.
 */
export class InternalBrowserApp extends React.Component<
  {},
  IInternalBrowserAppState
> {
  private readonly addressInput = React.createRef<HTMLInputElement>()
  private readonly contentViewport = React.createRef<HTMLDivElement>()
  private resizeObserver: ResizeObserver | null = null
  private boundsFrame: number | null = null
  private boundsFallback: number | null = null
  private lastActiveTabId: string | null = null
  private colorSchemeMedia: MediaQueryList | null = null
  private readonly tabButtons = new Map<string, HTMLButtonElement>()

  public constructor(props: {}) {
    super(props)
    this.state = {
      browser: emptyBrowserState,
      address: '',
      addressDirty: false,
      bookmarks: readInternalBrowserBookmarks(),
      languageMode: getPersistedLanguageMode(),
    }
  }

  public componentDidMount() {
    ipcRenderer.on('internal-browser-state', this.onBrowserState)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.queueBoundsUpdate)
    window.addEventListener('storage', this.onStorage)
    if (typeof window.matchMedia === 'function') {
      this.colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)')
      this.colorSchemeMedia.addEventListener(
        'change',
        this.onSystemColorSchemeChanged
      )
    }
    this.applyAppearance()

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.queueBoundsUpdate)
      if (this.contentViewport.current !== null) {
        this.resizeObserver.observe(this.contentViewport.current)
      }
    }

    this.updateDocumentTitle()
    ipcRenderer.send('internal-browser-ready')
    this.queueBoundsUpdate()
  }

  public componentDidUpdate(
    prevProps: {},
    prevState: IInternalBrowserAppState
  ) {
    void prevProps
    if (
      prevState.languageMode !== this.state.languageMode ||
      activeTab(prevState.browser)?.title !== activeTab(this.state.browser)?.title
    ) {
      this.updateDocumentTitle()
    }
    // Only when the chrome's own height can actually have changed. Measuring on
    // every update meant every keystroke in the address bar cancelled a frame,
    // rescheduled a timer and sent the native view a fresh set of identical
    // bounds — an IPC message per character, for a rectangle that had not
    // moved.
    if (this.chromeLayoutKey(prevState) !== this.chromeLayoutKey(this.state)) {
      this.queueBoundsUpdate()
    }
  }

  /**
   * Everything that changes the height of the chrome above the page.
   *
   * The native content view is positioned from a measurement of the viewport
   * element, so it only needs re-measuring when one of these changes: the tab
   * strip's contents, whether the bookmarks bar is present, and which notice
   * (if any) is showing.
   */
  private chromeLayoutKey(state: IInternalBrowserAppState): string {
    const tab = activeTab(state.browser)
    return [
      state.browser.tabs.length,
      state.bookmarks.length === 0 ? 'no-bookmarks' : 'bookmarks',
      tab?.intent ?? 'none',
      tab?.error ?? 'none',
      state.languageMode,
    ].join('|')
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('internal-browser-state', this.onBrowserState)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('resize', this.queueBoundsUpdate)
    window.removeEventListener('storage', this.onStorage)
    this.colorSchemeMedia?.removeEventListener(
      'change',
      this.onSystemColorSchemeChanged
    )
    this.resizeObserver?.disconnect()
    if (this.boundsFrame !== null) {
      cancelAnimationFrame(this.boundsFrame)
    }
    if (this.boundsFallback !== null) {
      clearTimeout(this.boundsFallback)
    }
  }

  private t = (key: TranslationKey) => translate(key, this.state.languageMode)

  /**
   * Name the window after the page it is showing, the way a browser does.
   *
   * It previously only ever said "Browser": a user with several browser
   * windows open had nothing in the taskbar or the window switcher to tell
   * them apart.
   */
  private updateDocumentTitle() {
    const base = translate('browser.title', this.state.languageMode)
    const title = sanitizeBrowserTitle(activeTab(this.state.browser)?.title)
    document.title = title.length === 0 ? base : `${title} — ${base}`
  }

  private applyAppearance = () => {
    applyPersistedInternalBrowserAppearance(
      this.colorSchemeMedia?.matches ?? false
    )
  }

  private onSystemColorSchemeChanged = () => this.applyAppearance()

  private onStorage = (event: StorageEvent) => {
    this.applyAppearance()
    if (event.key === LanguageModeStorageKey) {
      this.setState({ languageMode: getPersistedLanguageMode() })
    } else if (event.key === InternalBrowserBookmarksStorageKey) {
      this.setState({ bookmarks: readInternalBrowserBookmarks() })
    }
  }

  private onBrowserState = (
    _event: unknown,
    browser: IInternalBrowserState
  ) => {
    const current = activeTab(browser)
    const activeChanged = browser.activeTabId !== this.lastActiveTabId
    this.lastActiveTabId = browser.activeTabId
    this.setState(previous => ({
      browser,
      address:
        activeChanged || !previous.addressDirty
          ? current?.url ?? ''
          : previous.address,
      addressDirty: activeChanged ? false : previous.addressDirty,
    }))
  }

  private sendCommand(command: InternalBrowserCommand) {
    ipcRenderer.send('internal-browser-command', command)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) {
      return
    }
    switch (event.key.toLowerCase()) {
      case 'l':
        event.preventDefault()
        this.addressInput.current?.focus()
        this.addressInput.current?.select()
        return
      case 't':
        event.preventDefault()
        this.sendCommand({ type: 'new-tab' })
        return
      case 'r': {
        const tab = activeTab(this.state.browser)
        if (tab !== null) {
          event.preventDefault()
          this.sendCommand({ type: 'reload', tabId: tab.id })
        }
        return
      }
      case 'w': {
        const tab = activeTab(this.state.browser)
        if (tab !== null) {
          event.preventDefault()
          this.sendCommand({ type: 'close-tab', tabId: tab.id })
        }
        return
      }
    }
  }

  private sendContentBounds = () => {
    const viewport = this.contentViewport.current
    if (viewport === null) {
      return
    }
    const bounds = viewport.getBoundingClientRect()
    ipcRenderer.send('internal-browser-content-bounds', {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    })
  }

  private queueBoundsUpdate = () => {
    if (this.boundsFrame !== null) {
      cancelAnimationFrame(this.boundsFrame)
    }
    if (this.boundsFallback !== null) {
      clearTimeout(this.boundsFallback)
    }
    this.boundsFrame = requestAnimationFrame(() => {
      this.boundsFrame = null
      if (this.boundsFallback !== null) {
        clearTimeout(this.boundsFallback)
        this.boundsFallback = null
      }
      this.sendContentBounds()
    })
    // A BrowserWindow that has not been shown yet suspends animation frames, so
    // the callback above can simply never run and the native view would stay at
    // its unmeasured zero size — a browser window with nothing in it. The timer
    // keeps running while the window is hidden, so it reports the measurement
    // regardless; whichever fires first cancels the other.
    this.boundsFallback = window.setTimeout(() => {
      this.boundsFallback = null
      if (this.boundsFrame !== null) {
        cancelAnimationFrame(this.boundsFrame)
        this.boundsFrame = null
      }
      this.sendContentBounds()
    }, BoundsMeasurementFallbackDelay)
  }

  private onAddressChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      address: event.currentTarget.value,
      addressDirty: true,
    })
  }

  private onNavigate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const tab = activeTab(this.state.browser)
    if (tab === null) {
      this.sendCommand({ type: 'new-tab', url: this.state.address })
    } else {
      this.sendCommand({
        type: 'navigate',
        tabId: tab.id,
        url: this.state.address,
      })
    }
    this.setState({ addressDirty: false })
  }

  private onNewTab = () => this.sendCommand({ type: 'new-tab' })

  private onTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tabIndex: number
  ) => {
    const tabs = this.state.browser.tabs
    if (tabs.length === 0) {
      return
    }
    let targetIndex: number
    switch (event.key) {
      case 'ArrowLeft':
        targetIndex = (tabIndex - 1 + tabs.length) % tabs.length
        break
      case 'ArrowRight':
        targetIndex = (tabIndex + 1) % tabs.length
        break
      case 'Home':
        targetIndex = 0
        break
      case 'End':
        targetIndex = tabs.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const target = tabs[targetIndex]
    this.sendCommand({ type: 'activate-tab', tabId: target.id })
    this.tabButtons.get(target.id)?.focus()
  }

  private onBookmarkToggle = () => {
    const tab = activeTab(this.state.browser)
    if (tab === null || !tab.canBookmark || tab.url === null) {
      return
    }
    const safeURL = bookmarkSafeURL(tab.url)
    if (safeURL === null) {
      return
    }
    const existing = this.state.bookmarks.find(
      bookmark => bookmark.url === safeURL
    )
    const bookmarks =
      existing === undefined
        ? [
            ...this.state.bookmarks,
            {
              id: `bookmark-${window.crypto.randomUUID()}`,
              title: tab.title || new URL(safeURL).hostname,
              url: safeURL,
              createdAt: Date.now(),
            },
          ]
        : this.state.bookmarks.filter(bookmark => bookmark.id !== existing.id)
    this.setState({
      bookmarks: writeInternalBrowserBookmarks(bookmarks),
    })
  }

  private openBookmark = (bookmark: IInternalBrowserBookmark) => {
    this.sendCommand({
      type: 'new-tab',
      url: bookmark.url,
      intent: 'default',
    })
  }

  private closeTabAccessibleName(tab: IInternalBrowserTabState) {
    const title =
      sanitizeBrowserTitle(tab.title) ||
      translateForAccessibleName('browser.newTab', {}, this.state.languageMode)
    return translateForAccessibleName(
      tab.intent === 'authentication'
        ? 'browser.closeAuthenticationTab'
        : 'browser.closeNamedTab',
      { title },
      this.state.languageMode
    )
  }

  private renderTabs() {
    const { browser } = this.state
    return (
      <div
        className="internal-browser-tabs"
        role="tablist"
        aria-label={this.t('browser.tabs')}
      >
        {browser.tabs.map((tab, tabIndex) => {
          const active = tab.id === browser.activeTabId
          return (
            <div
              // A tablist owns its tabs directly; a plain grouping element in
              // between breaks that relationship, so the wrapper is marked as
              // presentational and the button keeps the tab role.
              role="presentation"
              className={`internal-browser-tab${active ? ' active' : ''}`}
              key={tab.id}
            >
              <button
                type="button"
                role="tab"
                id={`internal-browser-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={ContentViewportId}
                tabIndex={active ? 0 : -1}
                className="internal-browser-tab-select"
                ref={element => {
                  if (element === null) {
                    this.tabButtons.delete(tab.id)
                  } else {
                    this.tabButtons.set(tab.id, element)
                  }
                }}
                onKeyDown={event => this.onTabKeyDown(event, tabIndex)}
                onClick={() =>
                  this.sendCommand({ type: 'activate-tab', tabId: tab.id })
                }
              >
                {tab.isLoading && (
                  <span className="internal-browser-tab-spinner" />
                )}
                <span className="internal-browser-tab-title">
                  {tab.title || this.t('browser.newTab')}
                </span>
                {tab.intent === 'authentication' && (
                  <span className="internal-browser-auth-chip">
                    {this.t('browser.authChip')}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="internal-browser-tab-close"
                aria-label={this.closeTabAccessibleName(tab)}
                onClick={() =>
                  this.sendCommand({ type: 'close-tab', tabId: tab.id })
                }
              >
                <MaterialSymbol name="close" size={20} />
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  /**
   * The new-tab control sits beside the tab strip, not inside it.
   *
   * A `tablist` may only own tabs; a button that is not a tab inside one makes
   * assistive technology announce a tab count that does not match what it can
   * reach.
   */
  private renderNewTabButton() {
    return (
      <button
        type="button"
        className="internal-browser-icon-button internal-browser-new-tab"
        onClick={this.onNewTab}
        aria-label={this.t('browser.newTab')}
      >
        <MaterialSymbol name="add" size={22} />
      </button>
    )
  }

  private renderToolbar(tab: IInternalBrowserTabState | null) {
    // `tab?.url` is undefined when there is no tab at all, which the previous
    // `=== null` check missed, so it fell through to validating an empty
    // string on every render with no tab open.
    const safeURL =
      tab === null || tab.url === null ? null : bookmarkSafeURL(tab.url)
    const bookmarked =
      safeURL !== null &&
      this.state.bookmarks.some(bookmark => bookmark.url === safeURL)
    return (
      <form className="internal-browser-toolbar" onSubmit={this.onNavigate}>
        <div className="internal-browser-navigation">
          <button
            type="button"
            className="internal-browser-icon-button"
            aria-label={this.t('browser.back')}
            disabled={tab === null || !tab.canGoBack}
            onClick={() =>
              tab !== null &&
              this.sendCommand({ type: 'go-back', tabId: tab.id })
            }
          >
            <MaterialSymbol name="undo" size={21} />
          </button>
          <button
            type="button"
            className="internal-browser-icon-button"
            aria-label={this.t('browser.forward')}
            disabled={tab === null || !tab.canGoForward}
            onClick={() =>
              tab !== null &&
              this.sendCommand({ type: 'go-forward', tabId: tab.id })
            }
          >
            <MaterialSymbol name="redo" size={21} />
          </button>
          <button
            type="button"
            className="internal-browser-icon-button"
            aria-label={
              tab?.isLoading
                ? this.t('browser.stop')
                : this.t('browser.refresh')
            }
            disabled={tab === null}
            onClick={() =>
              tab !== null &&
              this.sendCommand({
                type: tab.isLoading ? 'stop' : 'reload',
                tabId: tab.id,
              })
            }
          >
            <MaterialSymbol
              name={tab?.isLoading ? 'close' : 'replay'}
              size={21}
            />
          </button>
        </div>
        <label className="internal-browser-address">
          <span className="sr-only">{this.t('browser.addressLabel')}</span>
          <input
            ref={this.addressInput}
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={this.state.address}
            onChange={this.onAddressChanged}
            placeholder={this.t('browser.addressPlaceholder')}
          />
        </label>
        <button
          type="submit"
          className="internal-browser-go-button"
          disabled={this.state.address.trim().length === 0}
        >
          {this.t('browser.go')}
        </button>
        <button
          type="button"
          className={`internal-browser-icon-button${
            bookmarked ? ' selected' : ''
          }`}
          disabled={tab === null || !tab.canBookmark}
          onClick={this.onBookmarkToggle}
          aria-label={
            bookmarked
              ? this.t('browser.removeBookmark')
              : this.t('browser.addBookmark')
          }
        >
          <MaterialSymbol name="star" size={21} fill={bookmarked ? 1 : 0} />
        </button>
        <button
          type="button"
          className="internal-browser-external-button"
          disabled={tab?.url === null || tab === null}
          onClick={() =>
            tab !== null &&
            this.sendCommand({ type: 'open-external', tabId: tab.id })
          }
        >
          <MaterialSymbol name="open_in_new" size={19} />
          <span>{this.t('browser.openExternal')}</span>
        </button>
      </form>
    )
  }

  private renderBookmarks() {
    if (this.state.bookmarks.length === 0) {
      return null
    }
    return (
      <nav
        className="internal-browser-bookmarks"
        aria-label={this.t('browser.bookmarks')}
      >
        <span className="internal-browser-bookmarks-label">
          {this.t('browser.bookmarks')}
        </span>
        {this.state.bookmarks.map(bookmark => (
          <button
            type="button"
            key={bookmark.id}
            onClick={() => this.openBookmark(bookmark)}
          >
            {bookmark.title}
          </button>
        ))}
      </nav>
    )
  }

  private renderNotice(tab: IInternalBrowserTabState | null) {
    if (tab?.intent === 'authentication') {
      return (
        <aside className="internal-browser-auth-notice" role="status">
          <span>
            <strong>{this.t('browser.authNoticeTitle')}</strong>{' '}
            {this.t('browser.authNoticeBody')}
          </span>
          <button
            type="button"
            onClick={() =>
              this.sendCommand({ type: 'open-external', tabId: tab.id })
            }
          >
            <MaterialSymbol name="open_in_new" size={19} />
            <span>{this.t('browser.openAuthExternal')}</span>
          </button>
        </aside>
      )
    }
    if (tab?.error !== null && tab?.error !== undefined) {
      return (
        <aside
          className="internal-browser-error-notice"
          role="alert"
          aria-live="assertive"
        >
          {this.t(errorTranslationKey(tab.error))}
        </aside>
      )
    }
    return null
  }

  public render() {
    const tab = activeTab(this.state.browser)
    return (
      <main className="internal-browser-window">
        <header className="internal-browser-chrome">
          <div className="internal-browser-tab-strip">
            {this.renderTabs()}
            {this.renderNewTabButton()}
          </div>
          {this.renderToolbar(tab)}
          {this.renderBookmarks()}
          {this.renderNotice(tab)}
        </header>
        <div
          ref={this.contentViewport}
          id={ContentViewportId}
          className="internal-browser-content-viewport"
          // The tabs declare this as their panel, so it has to exist in the
          // accessibility tree rather than being hidden from it. The page
          // itself is rendered by a separate native view with its own
          // accessibility tree, which is why this element is empty — the note
          // below says so rather than leaving a reader at an unexplained blank
          // panel.
          role="tabpanel"
          aria-labelledby={
            tab === null ? undefined : `internal-browser-tab-${tab.id}`
          }
        >
          <p className="sr-only">{this.t('browser.contentRegionNote')}</p>
        </div>
      </main>
    )
  }
}
