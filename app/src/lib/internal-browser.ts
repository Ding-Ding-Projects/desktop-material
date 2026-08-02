/**
 * Shared, serializable contracts for Desktop Material's app-hosted browser.
 *
 * Remote pages never receive these objects. They cross only the trusted
 * renderer/main IPC boundary and deliberately contain no cookies, request
 * headers, response bodies, or credentials.
 */

import { IOAuthAction, URLActionType } from './parse-app-url'

export const BrowserOpenModeStorageKey = 'browser-open-mode-v1'
export const InternalBrowserBookmarksStorageKey =
  'internal-browser-bookmarks-v1'
export const BrowserPreferencesChangedEvent =
  'desktop-material-browser-preferences-changed'

export function announceBrowserPreferencesChanged() {
  if (typeof document === 'undefined') {
    return
  }
  const EventConstructor = document.defaultView?.Event
  if (EventConstructor !== undefined) {
    document.dispatchEvent(new EventConstructor(BrowserPreferencesChangedEvent))
  }
}

export const BrowserOpenModes = ['internal', 'external'] as const
export type BrowserOpenMode = typeof BrowserOpenModes[number]

export const BrowserOpenIntents = ['default', 'authentication'] as const
export type BrowserOpenIntent = typeof BrowserOpenIntents[number]
export const MaximumInternalBrowserTabs = 20
export const MaximumInternalBrowserBookmarksJSONLength = 128 * 1_024

export const InternalBrowserOAuthCallbackResults = [
  'succeeded',
  'rejected',
  'failed',
] as const
export type InternalBrowserOAuthCallbackResult =
  typeof InternalBrowserOAuthCallbackResults[number]

export interface IInternalBrowserOAuthCallbackReceipt {
  /** Main-process nonce correlating this result to one delivered OAuth action. */
  readonly callbackId: string
  readonly result: InternalBrowserOAuthCallbackResult
}

export interface IInternalBrowserAuthenticationPartition {
  readonly partition: string
  readonly generation: number
}

export interface IInternalBrowserAuthenticationFlowIdentity {
  readonly id: string
  readonly ownerWindowId: number | null
  readonly oauthState: string | null
}

export function createAuthenticationPartition(
  nonce: string,
  generation = 0
): IInternalBrowserAuthenticationPartition {
  const safeNonce = nonce.replace(/[^a-z0-9-]/gi, '').slice(0, 80) || 'session'
  return {
    partition: `desktop-material-internal-browser-auth-${generation}-${safeNonce}`,
    generation,
  }
}

/**
 * Rotate before asynchronously clearing a retired auth session. A new tab can
 * then never attach to the partition whose storage is still being erased.
 */
export function rotateAuthenticationPartition(
  current: IInternalBrowserAuthenticationPartition,
  nonce: string
): IInternalBrowserAuthenticationPartition {
  return createAuthenticationPartition(nonce, current.generation + 1)
}

export const InternalBrowserTabErrors = [
  'invalid-address',
  'load-failed',
  'certificate-error',
  'download-blocked',
  'renderer-gone',
  'too-many-tabs',
] as const
export type InternalBrowserTabError = typeof InternalBrowserTabErrors[number]

export interface IOpenExternalOptions {
  /** The persisted global choice, or an explicit one-shot override. */
  readonly mode: BrowserOpenMode
  /** Authentication is explicit; URL heuristics are never its source of truth. */
  readonly intent: BrowserOpenIntent
  /**
   * False only when the renderer caller already turns a failed launch into its
   * own factual error. Native and ordinary link launches report by default.
   */
  readonly reportFailure?: boolean
}

export interface IInternalBrowserTabState {
  readonly id: string
  readonly title: string
  /** In-memory only. Tabs and their current URLs are never persisted. */
  readonly url: string | null
  readonly intent: BrowserOpenIntent
  readonly isLoading: boolean
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly canBookmark: boolean
  readonly error: InternalBrowserTabError | null
}

export interface IInternalBrowserState {
  readonly tabs: ReadonlyArray<IInternalBrowserTabState>
  readonly activeTabId: string | null
}

export interface IInternalBrowserContentBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type InternalBrowserCommand =
  | {
      readonly type: 'new-tab'
      readonly url?: string
      readonly intent?: BrowserOpenIntent
    }
  | { readonly type: 'activate-tab'; readonly tabId: string }
  | { readonly type: 'close-tab'; readonly tabId: string }
  | { readonly type: 'navigate'; readonly tabId: string; readonly url: string }
  | { readonly type: 'go-back'; readonly tabId: string }
  | { readonly type: 'go-forward'; readonly tabId: string }
  | { readonly type: 'reload'; readonly tabId: string }
  | { readonly type: 'stop'; readonly tabId: string }
  | { readonly type: 'open-external'; readonly tabId: string }
  // Plain-text find, served by Chromium's own in-page search. It highlights
  // and scrolls to matches inside the page, which nothing in the trusted
  // renderer can do for it.
  | {
      readonly type: 'find-in-page'
      readonly tabId: string
      readonly query: string
      readonly matchCase: boolean
      readonly forward: boolean
      /** True to advance to the next match of a query already being searched. */
      readonly findNext: boolean
    }
  | { readonly type: 'stop-find-in-page'; readonly tabId: string }
  /**
   * Read the page's visible text so a regular expression can be evaluated
   * against it outside the page.
   *
   * Chromium's in-page search is plain-substring only, so regex search cannot
   * be served by it. The text is read by a script in an **isolated world**:
   * page scripts can neither see it nor tamper with it, it only reads
   * `innerText`, and it changes nothing. The pattern itself is never sent into
   * the page — it is evaluated in the trusted renderer under the RE2 bounds,
   * so a hostile page cannot see what is being searched for and a pathological
   * pattern cannot hang the page.
   */
  | { readonly type: 'read-page-text'; readonly tabId: string }

export interface IInternalBrowserBookmark {
  readonly id: string
  readonly title: string
  /**
   * Query strings and fragments are never persisted. That keeps OAuth codes,
   * signed download parameters, and other credential-shaped values off disk.
   */
  readonly url: string
  readonly createdAt: number
}

const MaximumBrowserURLLength = 4_096
const MaximumBrowserTitleLength = 160
const MaximumBookmarks = 100
const MaximumBrowserTabIDLength = 100
const controlCharacters = /[\u0000-\u001f\u007f]/g
const internalBrowserOAuthCallbackIdPattern =
  /^internal-browser-oauth-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeBrowserOpenMode(value: unknown): BrowserOpenMode {
  return value === 'internal' ? 'internal' : 'external'
}

export function getBrowserOpenModePreference(
  storage: Pick<Storage, 'getItem'> = localStorage
): BrowserOpenMode {
  return normalizeBrowserOpenMode(storage.getItem(BrowserOpenModeStorageKey))
}

export function setBrowserOpenModePreference(
  mode: BrowserOpenMode,
  storage: Pick<Storage, 'setItem'> = localStorage
): BrowserOpenMode {
  const normalized = normalizeBrowserOpenMode(mode)
  storage.setItem(BrowserOpenModeStorageKey, normalized)
  announceBrowserPreferencesChanged()
  return normalized
}

/** Return a strict HTTP(S) URL, without guessing what a non-URL path means. */
export function normalizeWebURL(value: string): string | null {
  const trimmed = value.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > MaximumBrowserURLLength ||
    controlCharacters.test(trimmed)
  ) {
    controlCharacters.lastIndex = 0
    return null
  }
  controlCharacters.lastIndex = 0

  try {
    const parsed = new URL(trimmed)
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.hostname.length === 0 ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Normalize text typed into the address bar. A bare host is treated as HTTPS;
 * arbitrary text is not silently sent to a search provider.
 */
export function normalizeAddressInput(value: string): string | null {
  const trimmed = value.trim()
  const direct = normalizeWebURL(trimmed)
  if (direct !== null) {
    return direct
  }
  if (/^[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(trimmed)) {
    return normalizeWebURL(`https://${trimmed}`)
  }
  return null
}

export function isWebURL(value: string): boolean {
  return normalizeWebURL(value) !== null
}

/** Bound and de-control remote document titles before rendering them. */
export function sanitizeBrowserTitle(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  const clean = value
    .replace(controlCharacters, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.slice(0, MaximumBrowserTitleLength)
}

/**
 * Produce a log-safe address. Query, fragment, and embedded credentials are
 * always removed before the value can reach diagnostics or an error string.
 */
export function redactBrowserURL(value: string): string {
  const normalized = normalizeWebURL(value)
  if (normalized === null) {
    return '[invalid web address]'
  }
  const parsed = new URL(normalized)
  return `${parsed.origin}${parsed.pathname}`
}

/**
 * Return the only form of a URL allowed in bookmark persistence.
 * Authentication tabs are rejected by the caller; this function additionally
 * strips every query and fragment so signed URLs cannot leak into storage.
 */
export function bookmarkSafeURL(value: string): string | null {
  const normalized = normalizeWebURL(value)
  if (normalized === null) {
    return null
  }
  const parsed = new URL(normalized)
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function normalizeBookmark(value: unknown): IInternalBrowserBookmark | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<IInternalBrowserBookmark>
  const url =
    typeof candidate.url === 'string' ? bookmarkSafeURL(candidate.url) : null
  const title = sanitizeBrowserTitle(candidate.title)
  if (
    url === null ||
    typeof candidate.id !== 'string' ||
    candidate.id.length < 1 ||
    candidate.id.length > 80 ||
    typeof candidate.createdAt !== 'number' ||
    !Number.isFinite(candidate.createdAt)
  ) {
    return null
  }
  return {
    id: candidate.id,
    title: title || new URL(url).hostname,
    url,
    createdAt: Math.max(0, Math.trunc(candidate.createdAt)),
  }
}

export function parseInternalBrowserBookmarks(
  serialized: string | null
): ReadonlyArray<IInternalBrowserBookmark> {
  if (
    serialized === null ||
    serialized.length === 0 ||
    serialized.length > MaximumInternalBrowserBookmarksJSONLength
  ) {
    return []
  }
  try {
    const parsed = JSON.parse(serialized)
    if (!Array.isArray(parsed)) {
      return []
    }
    const result: IInternalBrowserBookmark[] = []
    const ids = new Set<string>()
    for (const value of parsed.slice(0, MaximumBookmarks)) {
      const bookmark = normalizeBookmark(value)
      if (bookmark !== null && !ids.has(bookmark.id)) {
        ids.add(bookmark.id)
        result.push(bookmark)
      }
    }
    return result
  } catch {
    return []
  }
}

export function readInternalBrowserBookmarks(
  storage: Pick<Storage, 'getItem'> = localStorage
): ReadonlyArray<IInternalBrowserBookmark> {
  return parseInternalBrowserBookmarks(
    storage.getItem(InternalBrowserBookmarksStorageKey)
  )
}

export function writeInternalBrowserBookmarks(
  bookmarks: ReadonlyArray<IInternalBrowserBookmark>,
  storage: Pick<Storage, 'setItem'> = localStorage
): ReadonlyArray<IInternalBrowserBookmark> {
  const normalized = bookmarks
    .map(normalizeBookmark)
    .filter((value): value is IInternalBrowserBookmark => value !== null)

  // New bookmarks are appended by the UI, so fill the bounded payload from
  // newest to oldest. Keep the survivors in their original display order and
  // reject duplicate IDs/URLs so a write always round-trips through the reader.
  const retainedNewestFirst: IInternalBrowserBookmark[] = []
  const ids = new Set<string>()
  const urls = new Set<string>()
  let serializedLength = 2 // Opening and closing JSON array brackets.
  for (let index = normalized.length - 1; index >= 0; index--) {
    if (retainedNewestFirst.length >= MaximumBookmarks) {
      break
    }
    const bookmark = normalized[index]
    if (ids.has(bookmark.id) || urls.has(bookmark.url)) {
      continue
    }
    const itemLength = JSON.stringify(bookmark).length
    const nextLength =
      serializedLength + itemLength + (retainedNewestFirst.length === 0 ? 0 : 1)
    if (nextLength > MaximumInternalBrowserBookmarksJSONLength) {
      continue
    }
    ids.add(bookmark.id)
    urls.add(bookmark.url)
    retainedNewestFirst.push(bookmark)
    serializedLength = nextLength
  }

  const retained = retainedNewestFirst.reverse()
  const serialized = JSON.stringify(retained)
  storage.setItem(InternalBrowserBookmarksStorageKey, serialized)
  return retained
}

function isBrowserTabID(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MaximumBrowserTabIDLength &&
    /^browser-tab-[a-z0-9-]+$/i.test(value)
  )
}

/**
 * Validate the untyped runtime value at the IPC boundary. Types protect our
 * own callers; this protects the main process from a malformed renderer send.
 */
export function normalizeInternalBrowserCommand(
  value: unknown
): InternalBrowserCommand | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const candidate = value as Record<string, unknown>
  switch (candidate.type) {
    case 'new-tab': {
      const url = candidate.url
      const intent = candidate.intent
      if (
        (url !== undefined &&
          (typeof url !== 'string' ||
            url.length > MaximumBrowserURLLength ||
            controlCharacters.test(url))) ||
        (intent !== undefined &&
          intent !== 'default' &&
          intent !== 'authentication')
      ) {
        controlCharacters.lastIndex = 0
        return null
      }
      controlCharacters.lastIndex = 0
      return {
        type: 'new-tab',
        ...(url === undefined ? {} : { url }),
        ...(intent === undefined ? {} : { intent }),
      }
    }
    case 'activate-tab':
    case 'close-tab':
    case 'go-back':
    case 'go-forward':
    case 'reload':
    case 'stop':
    case 'open-external':
      return isBrowserTabID(candidate.tabId)
        ? { type: candidate.type, tabId: candidate.tabId }
        : null
    case 'navigate':
      if (
        !isBrowserTabID(candidate.tabId) ||
        typeof candidate.url !== 'string' ||
        candidate.url.length > MaximumBrowserURLLength
      ) {
        return null
      }
      const containsControlCharacters = controlCharacters.test(candidate.url)
      controlCharacters.lastIndex = 0
      return containsControlCharacters
        ? null
        : {
            type: 'navigate',
            tabId: candidate.tabId,
            url: candidate.url,
          }
    case 'find-in-page': {
      if (
        !isBrowserTabID(candidate.tabId) ||
        typeof candidate.query !== 'string' ||
        candidate.query.length > MaximumFindQueryLength ||
        typeof candidate.matchCase !== 'boolean' ||
        typeof candidate.forward !== 'boolean' ||
        typeof candidate.findNext !== 'boolean'
      ) {
        return null
      }
      // A control character cannot appear in rendered page text, so it can only
      // be an attempt to smuggle something past a log or a label.
      const queryHasControlCharacters = controlCharacters.test(candidate.query)
      controlCharacters.lastIndex = 0
      return queryHasControlCharacters
        ? null
        : {
            type: 'find-in-page',
            tabId: candidate.tabId,
            query: candidate.query,
            matchCase: candidate.matchCase,
            forward: candidate.forward,
            findNext: candidate.findNext,
          }
    }
    case 'stop-find-in-page':
    case 'read-page-text':
      return isBrowserTabID(candidate.tabId)
        ? { type: candidate.type, tabId: candidate.tabId }
        : null
    default:
      return null
  }
}

/** Validate finite native-view bounds before the main process dereferences. */
export function normalizeInternalBrowserContentBounds(
  value: unknown
): IInternalBrowserContentBounds | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.x !== 'number' ||
    typeof candidate.y !== 'number' ||
    typeof candidate.width !== 'number' ||
    typeof candidate.height !== 'number' ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height)
  ) {
    return null
  }
  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  }
}

/** Only an explicit authentication tab may forward a parsed OAuth callback. */
export function shouldDispatchInternalBrowserAppAction(
  intent: BrowserOpenIntent,
  action: URLActionType,
  expectedOAuthState: string | null
): action is IOAuthAction {
  return (
    intent === 'authentication' &&
    action.name === 'oauth' &&
    expectedOAuthState !== null &&
    action.state === expectedOAuthState
  )
}

/** Failed, rejected, or merely externalized sign-in pages retain their state. */
export function shouldRetireInternalBrowserAuthenticationSession(
  intent: BrowserOpenIntent,
  result: InternalBrowserOAuthCallbackResult
): boolean {
  return intent === 'authentication' && result === 'succeeded'
}

/** Select only the exact owner/CSRF flow proven by a successful callback. */
export function selectInternalBrowserAuthenticationFlowsForResolution(
  flows: ReadonlyArray<IInternalBrowserAuthenticationFlowIdentity>,
  ownerWindowId: number,
  oauthState: string,
  result: InternalBrowserOAuthCallbackResult
): ReadonlyArray<string> {
  if (result !== 'succeeded') {
    return []
  }
  return flows
    .filter(
      flow =>
        flow.ownerWindowId === ownerWindowId && flow.oauthState === oauthState
    )
    .map(flow => flow.id)
}

export function createInternalBrowserOAuthCallbackId(nonce: string): string {
  const callbackId = `internal-browser-oauth-${nonce}`
  if (!internalBrowserOAuthCallbackIdPattern.test(callbackId)) {
    throw new Error('Internal browser OAuth callback nonce is invalid.')
  }
  return callbackId
}

/** Validate the trusted-renderer acknowledgment again at the IPC boundary. */
export function normalizeInternalBrowserOAuthCallbackReceipt(
  value: unknown
): IInternalBrowserOAuthCallbackReceipt | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2
  ) {
    return null
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.callbackId !== 'string' ||
    !internalBrowserOAuthCallbackIdPattern.test(candidate.callbackId)
  ) {
    return null
  }
  if (
    candidate.result !== 'succeeded' &&
    candidate.result !== 'rejected' &&
    candidate.result !== 'failed'
  ) {
    return null
  }
  return {
    callbackId: candidate.callbackId,
    result: candidate.result,
  }
}

/**
 * The area a tab's native view should occupy, given the chrome renderer's
 * latest measurement and the window's current content size.
 *
 * The measurement starts at zero and is only filled in once the renderer
 * measures its viewport and reports it over IPC — a report driven by
 * `requestAnimationFrame`, which a hidden BrowserWindow suspends. A zero width
 * or height therefore means "not measured yet", not "genuinely zero wide", and
 * must fall back to the whole content area below the chrome; otherwise a tab
 * created before its window is shown renders as a blank browser window.
 */
export function resolveInternalBrowserContentBounds(
  measured: IInternalBrowserContentBounds,
  contentWidth: number,
  contentHeight: number,
  minimumTop: number
): IInternalBrowserContentBounds {
  const width = Math.max(0, contentWidth)
  const height = Math.max(0, contentHeight)

  if (measured.width <= 0 || measured.height <= 0) {
    return {
      x: 0,
      y: minimumTop,
      width,
      height: Math.max(0, height - minimumTop),
    }
  }

  const x = Math.max(0, Math.min(measured.x, width))
  return {
    x,
    y: Math.max(minimumTop, Math.min(measured.y, height)),
    width: Math.max(0, Math.min(measured.width, width - x)),
    height: Math.max(0, Math.min(measured.height, height - measured.y)),
  }
}

export function canCreateInternalBrowserTab(currentCount: number): boolean {
  return (
    Number.isInteger(currentCount) &&
    currentCount >= 0 &&
    currentCount < MaximumInternalBrowserTabs
  )
}

/**
 * The find bar's two search modes.
 *
 * They are served by completely different machinery, which is why the mode is
 * part of the model rather than a flag on one search: `plain` is Chromium's
 * own in-page search, and `regex` is an RE2 evaluation in the trusted renderer
 * over text read out of the page.
 */
export type InternalBrowserFindMode = 'plain' | 'regex'

/**
 * Largest amount of page text read for a regular-expression search.
 *
 * A page can be arbitrarily large and the text crosses an IPC boundary, so the
 * read is bounded rather than trusting the page to be reasonable. When a page
 * exceeds this, the search reports that it was truncated instead of quietly
 * searching a prefix and calling it a whole-page result.
 */
export const MaximumPageTextLength = 2_000_000

/**
 * Longest find query accepted over IPC.
 *
 * Generous for anything a person types into a find bar, and small enough that a
 * malformed send cannot hand Chromium's in-page search — or the RE2 compiler —
 * a megabyte to chew on.
 */
export const MaximumFindQueryLength = 1_024

/** Longest single match preview retained for the results list. */
export const MaximumFindPreviewLength = 160

/** How many regular-expression matches the find bar lists. */
export const MaximumFindResults = 200

/**
 * The script run in an isolated world to read a page's visible text.
 *
 * Deliberately the smallest thing that can work: it reads `innerText`, which
 * is already the *rendered* text and therefore excludes scripts, styles and
 * hidden elements, truncates it, and returns it. It defines nothing, stores
 * nothing, and mutates nothing, so it cannot be observed by the page or leave
 * anything behind in it.
 */
export const PageTextExtractionScript = `(() => {
  try {
    const text = document.body ? document.body.innerText : ''
    return typeof text === 'string' ? text.slice(0, ${MaximumPageTextLength}) : ''
  } catch {
    return ''
  }
})()`

/** One regular-expression match, with enough context to be recognisable. */
export interface IInternalBrowserFindMatch {
  /** UTF-16 offset of the match within the extracted page text. */
  readonly index: number
  /** The matched text, bounded. */
  readonly text: string
  /** Surrounding text, so a bare match like `\d+` is still identifiable. */
  readonly context: string
}

/** What the find bar knows after a search. */
export interface IInternalBrowserFindResult {
  readonly mode: InternalBrowserFindMode
  /** Total matches, or null when the pattern could not be compiled. */
  readonly total: number | null
  /** 1-based position of the highlighted match, or null when there is none. */
  readonly active: number | null
  /** Compilation failure text for an invalid pattern, else null. */
  readonly error: string | null
  /** True when the page was longer than the bounded read. */
  readonly truncated: boolean
  /** Regex mode only; plain mode highlights inside the page instead. */
  readonly matches: ReadonlyArray<IInternalBrowserFindMatch>
}

/**
 * Main -> chrome: Chromium's own in-page match tally for a plain-text search.
 *
 * Carries the tab id because the tally arrives asynchronously and the user may
 * have switched tabs by the time it does; the find bar drops a tally that is
 * not for the tab it is searching rather than showing another tab's count.
 */
export interface IInternalBrowserFindTally {
  readonly tabId: string
  readonly total: number
  readonly active: number
}

/** Main -> chrome: the bounded page text a regular-expression search reads. */
export interface IInternalBrowserPageText {
  readonly tabId: string
  readonly text: string
  /** True when the page was longer than {@link MaximumPageTextLength}. */
  readonly truncated: boolean
}

/** A find result with nothing searched yet. */
export const emptyFindResult: IInternalBrowserFindResult = {
  mode: 'plain',
  total: null,
  active: null,
  error: null,
  truncated: false,
  matches: [],
}

/**
 * Build the context window around a match.
 *
 * Pure so the slicing is testable without a page: a match at the very start or
 * end of the text must not produce a negative slice or run past the end.
 */
export function findMatchContext(
  text: string,
  index: number,
  length: number,
  window: number = 40
): string {
  const start = Math.max(0, index - window)
  const end = Math.min(text.length, index + length + window)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim()}${suffix}`
}
