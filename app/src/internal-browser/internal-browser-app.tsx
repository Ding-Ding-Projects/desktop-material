/* eslint-disable react/jsx-no-bind -- tab and bookmark rows bind their exact in-memory browser item */
import * as React from 'react'
import * as ipcRenderer from '../lib/ipc-renderer'
import {
  getPersistedLanguageMode,
  translate,
  translateForAccessibleName,
  TranslationKey,
  TranslationVariables,
} from '../lib/i18n'
import { LanguageMode } from '../models/language-mode'
import { LanguageModeStorageKey } from '../lib/language-preference'
import {
  bookmarkSafeURL,
  IInternalBrowserBookmark,
  IInternalBrowserPendingAddress,
  IInternalBrowserState,
  IInternalBrowserTabState,
  InternalBrowserBookmarksStorageKey,
  InternalBrowserCommand,
  InternalBrowserFindMode,
  IInternalBrowserFindResult,
  IInternalBrowserFindTally,
  IInternalBrowserPageText,
  InternalBrowserTabError,
  emptyFindResult,
  findMatchContext,
  MaximumFindQueryLength,
  MaximumFindResults,
  readInternalBrowserBookmarks,
  resolveInternalBrowserAddressBar,
  sanitizeBrowserTitle,
  writeInternalBrowserBookmarks,
} from '../lib/internal-browser'
import { compileSafeRegex } from '../lib/safe-regex'
import { MaterialSymbol } from '../ui/lib/material-symbol'
import { escapeLiteral } from '../ui/lib/regex-builder/regex-block-model'
import { RegexBuilder } from '../ui/lib/regex-builder/regex-builder'
import { applyPersistedInternalBrowserAppearance } from './internal-browser-appearance'

interface IInternalBrowserAppState {
  readonly browser: IInternalBrowserState
  readonly address: string
  readonly addressDirty: boolean
  /** A submitted address still waiting for its tab's URL to move. */
  readonly pendingAddress: IInternalBrowserPendingAddress | null
  readonly bookmarks: ReadonlyArray<IInternalBrowserBookmark>
  readonly languageMode: LanguageMode
  readonly findOpen: boolean
  readonly findQuery: string
  readonly findMode: InternalBrowserFindMode
  readonly findCaseSensitive: boolean
  readonly findResult: IInternalBrowserFindResult
  readonly regexBuilderOpen: boolean
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
  private readonly findInput = React.createRef<HTMLInputElement>()
  private readonly contentViewport = React.createRef<HTMLDivElement>()
  private resizeObserver: ResizeObserver | null = null
  private boundsFrame: number | null = null
  private boundsFallback: number | null = null
  private lastActiveTabId: string | null = null
  private colorSchemeMedia: MediaQueryList | null = null
  private readonly tabButtons = new Map<string, HTMLButtonElement>()
  private findRequestId = 0

  public constructor(props: {}) {
    super(props)
    this.state = {
      browser: emptyBrowserState,
      address: '',
      addressDirty: false,
      pendingAddress: null,
      bookmarks: readInternalBrowserBookmarks(),
      languageMode: getPersistedLanguageMode(),
      findOpen: false,
      findQuery: '',
      findMode: 'plain',
      findCaseSensitive: false,
      findResult: emptyFindResult,
      regexBuilderOpen: false,
    }
  }

  public componentDidMount() {
    ipcRenderer.on('internal-browser-state', this.onBrowserState)
    ipcRenderer.on('internal-browser-find', this.onFindTally)
    ipcRenderer.on('internal-browser-page-text', this.onPageText)
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
    // Main may create and reveal the native content view as soon as readiness
    // arrives. Measure synchronously after persisted density reaches the DOM so
    // its first placement uses the real chrome height instead of the default
    // density safety floor. The queued path below still handles later layout.
    this.sendContentBounds()

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
      activeTab(prevState.browser)?.title !==
        activeTab(this.state.browser)?.title
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
      state.findOpen ? 'find-open' : 'find-closed',
    ].join('|')
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('internal-browser-state', this.onBrowserState)
    ipcRenderer.removeListener('internal-browser-find', this.onFindTally)
    ipcRenderer.removeListener('internal-browser-page-text', this.onPageText)
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

  private t = (key: TranslationKey, variables: TranslationVariables = {}) =>
    translate(key, this.state.languageMode, variables)

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
    const activeChanged = browser.activeTabId !== this.lastActiveTabId
    this.lastActiveTabId = browser.activeTabId
    this.setState(
      previous => ({
        browser,
        ...resolveInternalBrowserAddressBar(previous, browser, activeChanged),
      }),
      () => {
        if (activeChanged && this.state.findOpen) {
          this.runFind()
        }
      }
    )
  }

  private onFindTally = (_event: unknown, tally: IInternalBrowserFindTally) => {
    const tab = activeTab(this.state.browser)
    if (
      this.state.findMode !== 'plain' ||
      tab?.id !== tally.tabId ||
      tally.requestId !== this.findRequestId
    ) {
      return
    }
    this.setState(previous => ({
      findResult: {
        ...previous.findResult,
        mode: 'plain',
        total: tally.total,
        active: tally.total === 0 ? 0 : tally.active,
        error: null,
        matches: [],
      },
    }))
  }

  private onPageText = (
    _event: unknown,
    pageText: IInternalBrowserPageText
  ) => {
    const tab = activeTab(this.state.browser)
    if (
      this.state.findMode !== 'regex' ||
      tab?.id !== pageText.tabId ||
      pageText.requestId !== this.findRequestId
    ) {
      return
    }

    const query = this.state.findQuery
    if (query.length === 0) {
      return
    }
    const compilation = compileSafeRegex(query, this.state.findCaseSensitive)
    if (compilation.regex === null) {
      this.setState({
        findResult: {
          mode: 'regex',
          total: null,
          active: null,
          error: compilation.error,
          truncated: pageText.truncated,
          matches: [],
        },
      })
      return
    }

    const evaluated = compilation.regex.findAll(
      pageText.text,
      MaximumFindResults
    )
    const matches = evaluated.matches.map(match => ({
      index: match.index,
      text: match.text,
      context: findMatchContext(pageText.text, match.index, match.text.length),
    }))
    this.setState({
      findResult: {
        mode: 'regex',
        total: matches.length,
        active: matches.length === 0 ? 0 : 1,
        error: null,
        truncated: pageText.truncated || evaluated.truncated,
        matches,
      },
    })
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
      case 'f':
        event.preventDefault()
        this.onOpenFind()
        return
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

  private nextFindRequestId() {
    this.findRequestId =
      this.findRequestId >= Number.MAX_SAFE_INTEGER ? 0 : this.findRequestId + 1
    return this.findRequestId
  }

  /** Start the current search against the active native page. */
  private runFind = () => {
    const mode = this.state.findMode
    const query = this.state.findQuery
    const tab = activeTab(this.state.browser)
    const requestId = this.nextFindRequestId()

    this.setState({
      findResult: {
        ...emptyFindResult,
        mode,
      },
    })

    if (tab === null || query.length === 0) {
      if (tab !== null) {
        this.sendCommand({
          type: 'find-in-page',
          tabId: tab.id,
          query: '',
          matchCase: this.state.findCaseSensitive,
          forward: true,
          findNext: false,
          requestId,
        })
      }
      return
    }

    if (mode === 'plain') {
      this.sendCommand({
        type: 'find-in-page',
        tabId: tab.id,
        query,
        matchCase: this.state.findCaseSensitive,
        forward: true,
        findNext: false,
        requestId,
      })
      return
    }

    this.sendCommand({
      type: 'read-page-text',
      tabId: tab.id,
      requestId,
    })
  }

  private onOpenFind = () => {
    this.setState({ findOpen: true }, () => {
      this.findInput.current?.focus()
      this.findInput.current?.select()
      this.runFind()
    })
  }

  private onCloseFind = () => {
    const tab = activeTab(this.state.browser)
    if (tab !== null) {
      this.sendCommand({ type: 'stop-find-in-page', tabId: tab.id })
    }
    this.nextFindRequestId()
    this.setState({
      findOpen: false,
      regexBuilderOpen: false,
      findResult: { ...emptyFindResult, mode: this.state.findMode },
    })
  }

  private onFindQueryChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const query = event.currentTarget.value.slice(0, MaximumFindQueryLength)
    this.setState({ findQuery: query }, this.runFind)
  }

  private onFindSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    this.onFindNavigate(true)
  }

  private onFindKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.onCloseFind()
    }
  }

  private onFindModeToggle = () => {
    const mode: InternalBrowserFindMode =
      this.state.findMode === 'plain' ? 'regex' : 'plain'
    const tab = activeTab(this.state.browser)
    if (tab !== null) {
      this.sendCommand({ type: 'stop-find-in-page', tabId: tab.id })
    }
    this.setState(
      {
        findMode: mode,
        regexBuilderOpen: false,
        findResult: { ...emptyFindResult, mode },
      },
      this.runFind
    )
  }

  private onFindCaseToggle = () => {
    this.setState(
      state => ({ findCaseSensitive: !state.findCaseSensitive }),
      this.runFind
    )
  }

  private onFindNavigate = (forward: boolean) => {
    const tab = activeTab(this.state.browser)
    if (tab === null || this.state.findQuery.length === 0) {
      return
    }
    if (this.state.findMode === 'regex') {
      const total = this.state.findResult.matches.length
      if (total === 0) {
        return
      }
      this.setState(state => {
        const current = state.findResult.active ?? (forward ? 0 : total + 1)
        const next = forward
          ? (current % total) + 1
          : ((current - 2 + total) % total) + 1
        return { findResult: { ...state.findResult, active: next } }
      })
      return
    }
    const requestId = this.nextFindRequestId()
    this.sendCommand({
      type: 'find-in-page',
      tabId: tab.id,
      query: this.state.findQuery,
      matchCase: this.state.findCaseSensitive,
      forward,
      findNext: true,
      requestId,
    })
  }

  private onOpenRegexBuilder = () => {
    this.setState({ regexBuilderOpen: true })
  }

  private onCloseRegexBuilder = () => {
    this.setState({ regexBuilderOpen: false })
  }

  private onApplyRegexPattern = (pattern: string, caseSensitive: boolean) => {
    this.setState(
      {
        findMode: 'regex',
        findQuery: pattern.slice(0, MaximumFindQueryLength),
        findCaseSensitive: caseSensitive,
        regexBuilderOpen: false,
      },
      this.runFind
    )
  }

  private renderFindBuilder() {
    if (!this.state.regexBuilderOpen) {
      return null
    }
    return (
      <RegexBuilder
        searchSurfaceId="internal-browser-find"
        targetLabel={this.t('browser.findTarget')}
        initialPattern={
          this.state.findMode === 'plain'
            ? escapeLiteral(this.state.findQuery)
            : this.state.findQuery
        }
        caseSensitive={this.state.findCaseSensitive}
        sampleItems={this.state.findResult.matches.map(match => match.context)}
        onApply={this.onApplyRegexPattern}
        onDismissed={this.onCloseRegexBuilder}
      />
    )
  }

  private renderFindBar() {
    if (!this.state.findOpen) {
      return null
    }
    const result = this.state.findResult
    const count =
      this.state.findQuery.length === 0
        ? ''
        : result.error !== null
        ? result.error
        : result.total === null
        ? this.t('browser.findSearching')
        : result.total === 0
        ? this.t('browser.findNoMatches')
        : this.t('browser.findCount', {
            active: String(result.active ?? 0),
            total: String(result.total),
          })
    return (
      <form
        className="internal-browser-find-bar"
        role="search"
        aria-label={this.t('browser.findLabel')}
        onSubmit={this.onFindSubmit}
      >
        <label className="internal-browser-find-input">
          <span className="sr-only">{this.t('browser.findQueryLabel')}</span>
          <input
            ref={this.findInput}
            type="search"
            value={this.state.findQuery}
            maxLength={MaximumFindQueryLength}
            onChange={this.onFindQueryChanged}
            onKeyDown={this.onFindKeyDown}
            placeholder={this.t('browser.findPlaceholder')}
            aria-describedby="internal-browser-find-status"
          />
        </label>
        <button
          type="button"
          className={`internal-browser-find-mode${
            this.state.findMode === 'regex' ? ' selected' : ''
          }`}
          aria-label={this.t('browser.findMode')}
          aria-pressed={this.state.findMode === 'regex'}
          onClick={this.onFindModeToggle}
        >
          {this.state.findMode === 'regex' ? '.*' : 'Aa'}
        </button>
        <button
          type="button"
          className="internal-browser-find-builder"
          onClick={this.onOpenRegexBuilder}
          aria-label={this.t('browser.findBuilder')}
        >
          .* {this.t('browser.findBuilder')}
        </button>
        <button
          type="button"
          className={`internal-browser-find-case${
            this.state.findCaseSensitive ? ' selected' : ''
          }`}
          aria-label={this.t('browser.findCaseSensitive')}
          aria-pressed={this.state.findCaseSensitive}
          onClick={this.onFindCaseToggle}
        >
          Aa
        </button>
        <button
          type="button"
          className="internal-browser-find-nav"
          aria-label={this.t('browser.findPrevious')}
          disabled={result.total === 0}
          onClick={() => this.onFindNavigate(false)}
        >
          <MaterialSymbol name="arrow_upward" size={18} />
        </button>
        <button
          type="button"
          className="internal-browser-find-nav"
          aria-label={this.t('browser.findNext')}
          disabled={result.total === 0}
          onClick={() => this.onFindNavigate(true)}
        >
          <MaterialSymbol name="keyboard_arrow_down" size={18} />
        </button>
        <output
          id="internal-browser-find-status"
          className={`internal-browser-find-status${
            result.error !== null ? ' error' : ''
          }`}
          aria-live="polite"
        >
          {count}
          {result.truncated && ` · ${this.t('browser.findTruncated')}`}
        </output>
        <button
          type="button"
          className="internal-browser-find-close"
          aria-label={this.t('browser.findClose')}
          onClick={this.onCloseFind}
        >
          <MaterialSymbol name="close" size={19} />
        </button>
        {result.mode === 'regex' && result.matches.length > 0 && (
          <ol
            className="internal-browser-find-results"
            aria-label={this.t('browser.findResults')}
          >
            {result.matches.map((match, index) => (
              <li key={`${match.index}-${index}`}>
                <button
                  type="button"
                  aria-current={result.active === index + 1}
                  aria-label={this.t('browser.findMatch', {
                    number: String(index + 1),
                  })}
                  onClick={() =>
                    this.setState(state => ({
                      findResult: { ...state.findResult, active: index + 1 },
                    }))
                  }
                >
                  {match.context}
                </button>
              </li>
            ))}
          </ol>
        )}
        {this.renderFindBuilder()}
      </form>
    )
  }

  private onAddressChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      address: event.currentTarget.value,
      addressDirty: true,
      // Typing composes a new address, which supersedes whatever earlier
      // submission was still waiting to land.
      pendingAddress: null,
    })
  }

  private onNavigate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const tab = activeTab(this.state.browser)
    if (tab === null) {
      this.sendCommand({ type: 'new-tab', url: this.state.address })
      this.setState({ addressDirty: false, pendingAddress: null })
      return
    }
    this.sendCommand({
      type: 'navigate',
      tabId: tab.id,
      url: this.state.address,
    })
    // The submitted address holds the field until this tab's own URL moves.
    // Main pushes state the moment the load starts, while the tab still reports
    // the address being navigated away from, so releasing the field here showed
    // the previous page's URL mid-load — and permanently when the load failed,
    // since a failed load never commits a URL for the bar to catch up to.
    this.setState({
      pendingAddress: { tabId: tab.id, submittedFromURL: tab.url },
    })
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
        <button
          type="button"
          className="internal-browser-icon-button internal-browser-find-open"
          aria-label={this.t('browser.findOpen')}
          onClick={this.onOpenFind}
        >
          <MaterialSymbol name="search" size={21} />
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

  /**
   * The standing sign-in banner and the tab's current error are independent.
   *
   * Returning one *instead of* the other left an authentication tab unable to
   * report anything at all: a certificate failure, a dead renderer or a blocked
   * download during sign-in showed only the reassuring private-session banner —
   * and sign-in is exactly where a silent certificate failure matters most.
   */
  private renderNotices(tab: IInternalBrowserTabState | null) {
    if (tab === null) {
      return null
    }
    return (
      <>
        {tab.intent === 'authentication' && (
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
        )}
        {tab.error !== null && (
          <aside
            className="internal-browser-error-notice"
            role="alert"
            aria-live="assertive"
          >
            {this.t(errorTranslationKey(tab.error))}
          </aside>
        )}
      </>
    )
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
          {this.renderFindBar()}
          {this.renderBookmarks()}
          {this.renderNotices(tab)}
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
