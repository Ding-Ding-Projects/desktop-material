import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  bookmarkSafeURL,
  BrowserOpenModeStorageKey,
  canCreateInternalBrowserTab,
  createAuthenticationPartition,
  createInternalBrowserOAuthCallbackId,
  getBrowserOpenModePreference,
  InternalBrowserBookmarksStorageKey,
  MaximumInternalBrowserBookmarksJSONLength,
  normalizeAddressInput,
  normalizeInternalBrowserCommand,
  normalizeInternalBrowserContentBounds,
  normalizeInternalBrowserOAuthCallbackReceipt,
  normalizeWebURL,
  MaximumInternalBrowserTabs,
  normalizeBrowserOpenMode,
  parseInternalBrowserBookmarks,
  redactBrowserURL,
  rotateAuthenticationPartition,
  sanitizeBrowserTitle,
  selectInternalBrowserAuthenticationFlowsForResolution,
  setBrowserOpenModePreference,
  shouldDispatchInternalBrowserAppAction,
  shouldRetireInternalBrowserAuthenticationSession,
  writeInternalBrowserBookmarks,
} from '../../src/lib/internal-browser'
import { parseAppURL } from '../../src/lib/parse-app-url'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  public getItem(key: string) {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('internal browser contracts', () => {
  it('accepts only credential-free HTTP(S) addresses', () => {
    assert.equal(
      normalizeWebURL('https://example.com/docs?q=one#two'),
      'https://example.com/docs?q=one#two'
    )
    assert.equal(
      normalizeAddressInput('example.com/docs'),
      'https://example.com/docs'
    )
    assert.equal(normalizeWebURL('javascript:alert(1)'), null)
    assert.equal(normalizeWebURL('https://user:secret@example.com/'), null)
    assert.equal(normalizeWebURL('file:///C:/secret.txt'), null)
  })

  it('redacts diagnostic and bookmark persistence URLs', () => {
    const url = 'https://example.com/download?token=secret#fragment'
    assert.equal(redactBrowserURL(url), 'https://example.com/download')
    assert.equal(bookmarkSafeURL(url), 'https://example.com/download')
  })

  it('strips invisible Unicode format controls from remote titles', () => {
    assert.equal(
      sanitizeBrowserTitle('Trusted\u202Efdp.exe\u2066\u200B docs'),
      'Trustedfdp.exe docs'
    )
  })

  it('defaults fresh and invalid preferences to the system browser', () => {
    assert.equal(normalizeBrowserOpenMode(undefined), 'external')
    assert.equal(normalizeBrowserOpenMode('unexpected'), 'external')

    const storage = new MemoryStorage()
    assert.equal(getBrowserOpenModePreference(storage), 'external')
  })

  it('persists an explicit internal or external choice without overwriting it', () => {
    const storage = new MemoryStorage()
    setBrowserOpenModePreference('internal', storage)
    assert.equal(storage.getItem(BrowserOpenModeStorageKey), 'internal')
    assert.equal(getBrowserOpenModePreference(storage), 'internal')

    setBrowserOpenModePreference('external', storage)
    assert.equal(storage.getItem(BrowserOpenModeStorageKey), 'external')
    assert.equal(getBrowserOpenModePreference(storage), 'external')
  })

  it('bounds and sanitizes bookmark persistence', () => {
    const storage = new MemoryStorage()
    const written = writeInternalBrowserBookmarks(
      [
        {
          id: 'docs',
          title: 'Docs\u0000 title',
          url: 'https://example.com/docs?temporary=secret',
          createdAt: 12.9,
        },
      ],
      storage
    )
    assert.deepEqual(written, [
      {
        id: 'docs',
        title: 'Docs title',
        url: 'https://example.com/docs',
        createdAt: 12,
      },
    ])
    assert.deepEqual(
      parseInternalBrowserBookmarks(
        '[{"id":"bad","title":"Bad","url":"javascript:alert(1)","createdAt":1}]'
      ),
      []
    )
  })

  it('keeps serialized bookmarks below the read cap and reloads identically', () => {
    const storage = new MemoryStorage()
    const bookmarks = Array.from({ length: 100 }, (_, index) => ({
      id: `bookmark-${index}`,
      title: `Bookmark ${index} ${'t'.repeat(150)}`,
      url: `https://example.com/${index}/${'u'.repeat(3_800)}?discard=yes`,
      createdAt: index,
    }))

    const written = writeInternalBrowserBookmarks(bookmarks, storage)
    const serialized = storage.getItem(InternalBrowserBookmarksStorageKey)

    assert.notEqual(serialized, null)
    assert.ok(
      (serialized?.length ?? Number.POSITIVE_INFINITY) <=
        MaximumInternalBrowserBookmarksJSONLength
    )
    assert.ok(written.length < bookmarks.length)
    assert.equal(written[written.length - 1].id, 'bookmark-99')
    assert.deepEqual(parseInternalBrowserBookmarks(serialized), written)
  })

  it('backfills older useful bookmarks when newer entries are duplicates', () => {
    const storage = new MemoryStorage()
    const written = writeInternalBrowserBookmarks(
      [
        {
          id: 'useful',
          title: 'Useful documentation',
          url: 'https://example.com/useful',
          createdAt: 1,
        },
        ...Array.from({ length: 100 }, (_, index) => ({
          id: 'duplicate',
          title: `Duplicate ${index}`,
          url: 'https://example.com/duplicate',
          createdAt: index + 2,
        })),
      ],
      storage
    )

    assert.deepEqual(
      written.map(bookmark => bookmark.id),
      ['useful', 'duplicate']
    )
    assert.deepEqual(
      parseInternalBrowserBookmarks(
        storage.getItem(InternalBrowserBookmarksStorageKey)
      ),
      written
    )
  })

  it('rejects malformed IPC commands without dereferencing them', () => {
    assert.equal(normalizeInternalBrowserCommand(null), null)
    assert.equal(normalizeInternalBrowserCommand({ type: 'reload' }), null)
    assert.equal(
      normalizeInternalBrowserCommand({
        type: 'navigate',
        tabId: 'browser-tab-7',
        url: 'https://example.com/\u0000',
      }),
      null
    )
    assert.deepEqual(
      normalizeInternalBrowserCommand({
        type: 'new-tab',
        intent: 'authentication',
        url: 'https://github.com/login/oauth',
      }),
      {
        type: 'new-tab',
        intent: 'authentication',
        url: 'https://github.com/login/oauth',
      }
    )
  })

  it('rejects malformed or non-finite native viewport bounds', () => {
    assert.equal(normalizeInternalBrowserContentBounds(undefined), null)
    assert.equal(
      normalizeInternalBrowserContentBounds({
        x: 0,
        y: 128,
        width: Number.POSITIVE_INFINITY,
        height: 600,
      }),
      null
    )
    assert.deepEqual(
      normalizeInternalBrowserContentBounds({
        x: 0,
        y: 128,
        width: 800,
        height: 600,
      }),
      { x: 0, y: 128, width: 800, height: 600 }
    )
  })

  it('gates app actions to matching auth callbacks and retains failures', () => {
    const oauth = parseAppURL(
      'x-github-client://oauth?code=fixture&state=expected'
    )
    const malformed = parseAppURL('x-github-client://oauth?code=fixture')
    const openRepository = parseAppURL(
      'x-github-client://openRepo/https%3A%2F%2Fexample.com%2Frepo'
    )

    assert.equal(
      shouldDispatchInternalBrowserAppAction(
        'authentication',
        oauth,
        'expected'
      ),
      true
    )
    assert.equal(
      shouldDispatchInternalBrowserAppAction('default', oauth, 'expected'),
      false
    )
    assert.equal(
      shouldDispatchInternalBrowserAppAction(
        'authentication',
        malformed,
        'expected'
      ),
      false
    )
    assert.equal(
      shouldDispatchInternalBrowserAppAction(
        'authentication',
        openRepository,
        'expected'
      ),
      false
    )
    assert.equal(
      shouldDispatchInternalBrowserAppAction(
        'authentication',
        oauth,
        'replacement'
      ),
      false
    )
    assert.equal(
      shouldRetireInternalBrowserAuthenticationSession(
        'authentication',
        'succeeded'
      ),
      true
    )
    assert.equal(
      shouldRetireInternalBrowserAuthenticationSession(
        'authentication',
        'failed'
      ),
      false
    )
    assert.equal(
      shouldRetireInternalBrowserAuthenticationSession(
        'authentication',
        'rejected'
      ),
      false
    )
    assert.equal(
      shouldRetireInternalBrowserAuthenticationSession('default', 'succeeded'),
      false
    )
  })

  it('retires only the successful owner and OAuth-state flow', () => {
    const flows = [
      { id: 'old', ownerWindowId: 7, oauthState: 'old-state' },
      { id: 'replacement', ownerWindowId: 7, oauthState: 'new-state' },
      { id: 'other-window', ownerWindowId: 8, oauthState: 'old-state' },
    ]

    assert.deepEqual(
      selectInternalBrowserAuthenticationFlowsForResolution(
        flows,
        7,
        'old-state',
        'succeeded'
      ),
      ['old']
    )
    assert.deepEqual(
      selectInternalBrowserAuthenticationFlowsForResolution(
        flows,
        7,
        'old-state',
        'failed'
      ),
      []
    )
  })

  it('rejects malformed or uncorrelated OAuth callback receipts', () => {
    const callbackId = createInternalBrowserOAuthCallbackId(
      '123e4567-e89b-42d3-a456-426614174000'
    )
    assert.deepEqual(
      normalizeInternalBrowserOAuthCallbackReceipt({
        callbackId,
        result: 'succeeded',
      }),
      { callbackId, result: 'succeeded' }
    )
    assert.equal(
      normalizeInternalBrowserOAuthCallbackReceipt({
        callbackId: null,
        result: 'failed',
      }),
      null
    )
    assert.equal(
      normalizeInternalBrowserOAuthCallbackReceipt({
        callbackId: 'wrong',
        result: 'succeeded',
      }),
      null
    )
    assert.equal(
      normalizeInternalBrowserOAuthCallbackReceipt({
        callbackId,
        result: 'unknown',
      }),
      null
    )
    assert.equal(
      normalizeInternalBrowserOAuthCallbackReceipt({
        callbackId,
        result: 'succeeded',
        extra: true,
      }),
      null
    )
  })

  it('rotates auth partitions before a retired session can finish clearing', () => {
    const first = createAuthenticationPartition('first', 0)
    const second = rotateAuthenticationPartition(first, 'second')
    const simultaneousOtherFlow = createAuthenticationPartition('third', 0)

    assert.equal(first.generation, 0)
    assert.equal(second.generation, 1)
    assert.notEqual(second.partition, first.partition)
    assert.notEqual(simultaneousOtherFlow.partition, first.partition)
    assert.match(second.partition, /-1-second$/)
  })

  it('caps untrusted popup and tab creation', () => {
    assert.equal(
      canCreateInternalBrowserTab(MaximumInternalBrowserTabs - 1),
      true
    )
    assert.equal(canCreateInternalBrowserTab(MaximumInternalBrowserTabs), false)
    assert.equal(canCreateInternalBrowserTab(Number.NaN), false)
  })
})
