import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  LaunchpadPreferencesDocumentVersion,
  LaunchpadPreferencesMaximumPins,
  LaunchpadPreferencesMaximumSerializedCharacters,
  LaunchpadPreferencesMaximumSnoozes,
  LaunchpadPreferencesStore,
  ILaunchpadPreferencesStorage,
  createLaunchpadPreferencesStorageKey,
} from '../../src/lib/launchpad/launchpad-preferences'
import {
  LaunchpadItemKind,
  LaunchpadProviderItemKey,
  createLaunchpadProviderItemKey,
} from '../../src/lib/launchpad/launchpad-model'

class MemoryStorage implements ILaunchpadPreferencesStorage {
  public readonly values = new Map<string, string>()
  public failReads = false
  public failWrites = false

  public getItem(key: string): string | null {
    if (this.failReads) {
      throw new Error('fixture read failure')
    }
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('fixture write failure')
    }
    this.values.set(key, value)
  }
}

function itemKey(
  itemId: string,
  kind: LaunchpadItemKind = 'issue',
  repositoryId = 'desktop-material'
): LaunchpadProviderItemKey {
  return createLaunchpadProviderItemKey({
    endpointId: 'github.com',
    accountId: 'account-7',
    repositoryId,
    kind,
    itemId,
  })
}

const emptySerializedPreferences = JSON.stringify({
  version: LaunchpadPreferencesDocumentVersion,
  pinned: [],
  snoozed: [],
})

describe('LaunchpadPreferencesStore', () => {
  it('round-trips only canonical provider identities and expiry times', () => {
    const storage = new MemoryStorage()
    const pinned = itemKey('issue-1')
    const snoozed = itemKey('run-2', 'ci-run')
    const store = new LaunchpadPreferencesStore(
      'profile-primary',
      storage,
      () => 1_000
    )

    assert.equal(store.pin(pinned), true)
    assert.equal(store.snooze(snoozed, 2_000), true)

    const serialized = storage.values.get(store.storageKey)
    assert.notEqual(serialized, undefined)
    assert.deepEqual(JSON.parse(serialized!), {
      version: LaunchpadPreferencesDocumentVersion,
      pinned: [pinned],
      snoozed: [{ itemKey: snoozed, expiresAt: 2_000 }],
    })
    assert.doesNotMatch(
      serialized!,
      /SUPER_SECRET_TOKEN|Issue title|Body payload/
    )

    const reloaded = new LaunchpadPreferencesStore(
      'profile-primary',
      storage,
      () => 1_000
    )
    assert.deepEqual(reloaded.getSnapshot(), {
      pinnedItemKeys: [pinned],
      snoozedItems: [{ itemKey: snoozed, expiresAt: 2_000 }],
    })
  })

  it('rejects arbitrary strings and content-shaped objects before persistence', () => {
    const storage = new MemoryStorage()
    const store = new LaunchpadPreferencesStore('identity-only', storage)
    const secret = 'ghp_SUPER_SECRET_TOKEN' as LaunchpadProviderItemKey
    const content = {
      title: 'Issue title',
      body: 'Body payload',
      token: 'SUPER_SECRET_TOKEN',
    } as unknown as LaunchpadProviderItemKey

    assert.equal(store.pin(secret), false)
    assert.equal(store.snooze(secret, 2_000), false)
    assert.equal(store.pin(content), false)
    assert.equal(store.snooze(content, 2_000), false)
    assert.equal(storage.values.get(store.storageKey), undefined)
  })

  it('keeps pin order stable across idempotent pins and explicit re-pins', () => {
    const storage = new MemoryStorage()
    const first = itemKey('first')
    const second = itemKey('second')
    const store = new LaunchpadPreferencesStore('stable-pins', storage)

    assert.equal(store.pin(first), true)
    assert.equal(store.pin(second), true)
    assert.equal(store.pin(first), false)
    assert.deepEqual(store.getPinnedItemKeys(), [first, second])

    assert.equal(store.unpin(first), true)
    assert.equal(store.pin(first), true)
    assert.deepEqual(store.getPinnedItemKeys(), [second, first])
  })

  it('uses the exact snooze deadline and persists expiry pruning', () => {
    const storage = new MemoryStorage()
    const first = itemKey('first')
    const second = itemKey('second')
    let now = 999
    const store = new LaunchpadPreferencesStore(
      'expiry-boundary',
      storage,
      () => now
    )

    assert.equal(store.snooze(first, 1_000), true)
    assert.equal(store.snooze(second, 2_000), true)
    assert.equal(store.isSnoozed(first), true)
    now = 1_000
    assert.equal(store.isSnoozed(first), false)
    assert.equal(store.getSnoozedUntil(first), null)
    assert.deepEqual(store.getSnoozedItems(), [
      { itemKey: second, expiresAt: 2_000 },
    ])
    assert.deepEqual(JSON.parse(storage.values.get(store.storageKey)!), {
      version: LaunchpadPreferencesDocumentVersion,
      pinned: [],
      snoozed: [{ itemKey: second, expiresAt: 2_000 }],
    })

    assert.equal(store.snooze(second, now), true)
    assert.deepEqual(store.getSnoozedItems(), [])
  })

  it('keeps snooze order stable when an existing deadline is updated', () => {
    const first = itemKey('first')
    const second = itemKey('second')
    const store = new LaunchpadPreferencesStore(
      'stable-snoozes',
      new MemoryStorage(),
      () => 100
    )

    assert.equal(store.snooze(first, 200), true)
    assert.equal(store.snooze(second, 300), true)
    assert.equal(store.snooze(first, 400), true)
    assert.equal(store.snooze(first, 400), false)
    assert.deepEqual(store.getSnoozedItems(), [
      { itemKey: first, expiresAt: 400 },
      { itemKey: second, expiresAt: 300 },
    ])
  })

  it('deduplicates valid identities deterministically while loading', () => {
    const storage = new MemoryStorage()
    const storageKey = createLaunchpadPreferencesStorageKey('duplicates')
    const first = itemKey('first')
    const second = itemKey('second')
    storage.values.set(
      storageKey,
      JSON.stringify({
        version: LaunchpadPreferencesDocumentVersion,
        pinned: [first, second, first],
        snoozed: [
          { itemKey: first, expiresAt: 200 },
          { itemKey: second, expiresAt: 300 },
          { itemKey: first, expiresAt: 400 },
        ],
      })
    )

    const store = new LaunchpadPreferencesStore(
      'duplicates',
      storage,
      () => 100
    )
    assert.deepEqual(store.getSnapshot(), {
      pinnedItemKeys: [first, second],
      snoozedItems: [
        { itemKey: first, expiresAt: 400 },
        { itemKey: second, expiresAt: 300 },
      ],
    })
    assert.deepEqual(JSON.parse(storage.values.get(storageKey)!), {
      version: LaunchpadPreferencesDocumentVersion,
      pinned: [first, second],
      snoozed: [
        { itemKey: first, expiresAt: 400 },
        { itemKey: second, expiresAt: 300 },
      ],
    })
  })

  it('rejects corrupt, hostile, and non-exact schemas without retaining them', () => {
    const validKey = itemKey('valid')
    const hostileDocuments = [
      '{not-json',
      '[]',
      JSON.stringify({ version: '1', pinned: [], snoozed: [] }),
      JSON.stringify({
        version: LaunchpadPreferencesDocumentVersion,
        pinned: ['not-a-provider-key'],
        snoozed: [],
      }),
      JSON.stringify({
        version: LaunchpadPreferencesDocumentVersion,
        pinned: [],
        snoozed: [{ itemKey: validKey, expiresAt: 1.5 }],
      }),
      JSON.stringify({
        version: LaunchpadPreferencesDocumentVersion,
        pinned: [],
        snoozed: [{ itemKey: validKey, expiresAt: 2_000, title: 'content' }],
      }),
      JSON.stringify({
        version: LaunchpadPreferencesDocumentVersion,
        pinned: [],
        snoozed: [],
        token: 'SUPER_SECRET_TOKEN',
      }),
      '{"version":1,"pinned":[],"snoozed":[],"__proto__":{"polluted":true}}',
    ]

    hostileDocuments.forEach((serialized, index) => {
      const storage = new MemoryStorage()
      const namespace = `hostile-${index}`
      const storageKey = createLaunchpadPreferencesStorageKey(namespace)
      storage.values.set(storageKey, serialized)

      const store = new LaunchpadPreferencesStore(namespace, storage, () => 0)
      assert.deepEqual(store.getSnapshot(), {
        pinnedItemKeys: [],
        snoozedItems: [],
      })
      assert.equal(storage.values.get(storageKey), emptySerializedPreferences)
    })
    assert.equal(
      ({} as Record<string, unknown>).polluted,
      undefined,
      'prototype-shaped input must never escape its parsed document'
    )
  })

  it('rejects oversized raw documents and arrays before accepting entries', () => {
    const key = itemKey('bounded')
    const oversizedRawStorage = new MemoryStorage()
    const rawNamespace = 'oversized-raw'
    const rawStorageKey = createLaunchpadPreferencesStorageKey(rawNamespace)
    oversizedRawStorage.values.set(
      rawStorageKey,
      ' '.repeat(LaunchpadPreferencesMaximumSerializedCharacters + 1)
    )
    const rawStore = new LaunchpadPreferencesStore(
      rawNamespace,
      oversizedRawStorage
    )
    assert.deepEqual(rawStore.getPinnedItemKeys(), [])
    assert.equal(
      oversizedRawStorage.values.get(rawStorageKey),
      emptySerializedPreferences
    )

    const oversizedPinsStorage = new MemoryStorage()
    const pinsNamespace = 'oversized-pins'
    const pinsStorageKey = createLaunchpadPreferencesStorageKey(pinsNamespace)
    oversizedPinsStorage.values.set(
      pinsStorageKey,
      JSON.stringify({
        version: LaunchpadPreferencesDocumentVersion,
        pinned: Array(LaunchpadPreferencesMaximumPins + 1).fill(key),
        snoozed: [],
      })
    )
    const pinsStore = new LaunchpadPreferencesStore(
      pinsNamespace,
      oversizedPinsStorage
    )
    assert.deepEqual(pinsStore.getPinnedItemKeys(), [])
    assert.equal(
      oversizedPinsStorage.values.get(pinsStorageKey),
      emptySerializedPreferences
    )

    const oversizedSnoozesStorage = new MemoryStorage()
    const snoozesNamespace = 'oversized-snoozes'
    const snoozesStorageKey =
      createLaunchpadPreferencesStorageKey(snoozesNamespace)
    oversizedSnoozesStorage.values.set(
      snoozesStorageKey,
      JSON.stringify({
        version: LaunchpadPreferencesDocumentVersion,
        pinned: [],
        snoozed: Array(LaunchpadPreferencesMaximumSnoozes + 1).fill({
          itemKey: key,
          expiresAt: 2_000,
        }),
      })
    )
    const snoozesStore = new LaunchpadPreferencesStore(
      snoozesNamespace,
      oversizedSnoozesStorage,
      () => 1_000
    )
    assert.deepEqual(snoozesStore.getSnoozedItems(), [])
    assert.equal(
      oversizedSnoozesStorage.values.get(snoozesStorageKey),
      emptySerializedPreferences
    )
  })

  it('enforces explicit runtime pin and snooze caps', () => {
    const pinStore = new LaunchpadPreferencesStore(
      'pin-cap',
      new MemoryStorage()
    )
    for (let index = 0; index < LaunchpadPreferencesMaximumPins; index++) {
      assert.equal(pinStore.pin(itemKey(`pin-${index}`)), true)
    }
    assert.equal(pinStore.pin(itemKey('pin-over-cap')), false)
    assert.equal(
      pinStore.getPinnedItemKeys().length,
      LaunchpadPreferencesMaximumPins
    )

    let now = 1_000
    const snoozeStore = new LaunchpadPreferencesStore(
      'snooze-cap',
      new MemoryStorage(),
      () => now
    )
    for (let index = 0; index < LaunchpadPreferencesMaximumSnoozes; index++) {
      assert.equal(snoozeStore.snooze(itemKey(`snooze-${index}`), 2_000), true)
    }
    assert.equal(snoozeStore.snooze(itemKey('snooze-over-cap'), 2_000), false)
    assert.equal(
      snoozeStore.getSnoozedItems().length,
      LaunchpadPreferencesMaximumSnoozes
    )

    now = 2_000
    assert.equal(snoozeStore.snooze(itemKey('reused-capacity'), 3_000), true)
    assert.deepEqual(snoozeStore.getSnoozedItems(), [
      { itemKey: itemKey('reused-capacity'), expiresAt: 3_000 },
    ])
  })

  it('isolates namespaces with collision-safe storage keys', () => {
    const storage = new MemoryStorage()
    const firstNamespace = 'profile/a'
    const secondNamespace = 'profile%2Fa'
    const firstKey = itemKey('first')
    const secondKey = itemKey('second')
    const first = new LaunchpadPreferencesStore(firstNamespace, storage)
    const second = new LaunchpadPreferencesStore(secondNamespace, storage)

    assert.notEqual(first.storageKey, second.storageKey)
    assert.equal(first.pin(firstKey), true)
    assert.equal(second.pin(secondKey), true)
    assert.deepEqual(
      new LaunchpadPreferencesStore(
        firstNamespace,
        storage
      ).getPinnedItemKeys(),
      [firstKey]
    )
    assert.deepEqual(
      new LaunchpadPreferencesStore(
        secondNamespace,
        storage
      ).getPinnedItemKeys(),
      [secondKey]
    )
    assert.throws(() => new LaunchpadPreferencesStore('', storage), /invalid/i)
    assert.throws(
      () => new LaunchpadPreferencesStore('bad\u0000scope', storage),
      /invalid/i
    )
  })

  it('contains storage and clock exceptions while preserving live state', () => {
    const throwingRead = new MemoryStorage()
    throwingRead.failReads = true
    assert.doesNotThrow(
      () => new LaunchpadPreferencesStore('read-failure', throwingRead)
    )
    assert.deepEqual(
      new LaunchpadPreferencesStore(
        'read-failure',
        throwingRead
      ).getPinnedItemKeys(),
      []
    )

    const throwingWrite = new MemoryStorage()
    throwingWrite.failWrites = true
    const store = new LaunchpadPreferencesStore(
      'write-failure',
      throwingWrite,
      () => {
        throw new Error('fixture clock failure')
      }
    )
    const key = itemKey('live-only')
    assert.doesNotThrow(() => store.pin(key))
    assert.equal(store.isPinned(key), true)
    assert.doesNotThrow(() => store.snooze(key, 2_000))
    assert.equal(store.getSnoozedUntil(key), 2_000)
  })
})
