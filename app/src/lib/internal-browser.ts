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
  return value === 'external' ? 'external' : 'internal'
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

export function canCreateInternalBrowserTab(currentCount: number): boolean {
  return (
    Number.isInteger(currentCount) &&
    currentCount >= 0 &&
    currentCount < MaximumInternalBrowserTabs
  )
}
