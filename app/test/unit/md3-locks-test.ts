import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'

import {
  addMd3Lock,
  clearAllMd3LockAttempts,
  createActiveUnlock,
  createMd3LockId,
  filterMd3Locks,
  hasMd3LockPassword,
  IMd3Lock,
  IMd3LockCredentialVault,
  isMd3TotpAvailable,
  isMd3UnlockActive,
  isTargetLocked,
  isValidMd3LockPassword,
  lockCredentialAccountKey,
  locksForTarget,
  md3LockAttemptDelayMs,
  Md3LockableAppearanceProperties,
  Md3LockableValueTypes,
  Md3LockExportFormats,
  Md3LockExportOmissionNotice,
  Md3LocksStorageKey,
  normalizeLock,
  normalizeUnlockDuration,
  readMd3Locks,
  removeMd3LockCredential,
  removeMd3Locks,
  serializeMd3LockExport,
  setMd3LockPassword,
  setMd3TotpVerifier,
  updateMd3Lock,
  verifyMd3Lock,
  verifyMd3LockPassword,
  writeMd3Locks,
} from '../../src/lib/md3-locks'
import { FunnyLevelTextBase } from '../../src/lib/funny-level-text'
import {
  cantoneseTranslations,
  englishTranslations,
  TranslationKey,
} from '../../src/lib/i18n-resources'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    raw: values,
  }
}

function createVault(): IMd3LockCredentialVault & {
  readonly entries: Map<string, string>
} {
  const entries = new Map<string, string>()
  return {
    entries,
    read: async account => entries.get(account) ?? null,
    write: async (account, value) => {
      entries.set(account, value)
    },
    remove: async account => entries.delete(account),
  }
}

function lockFixture(overrides: Partial<IMd3Lock> = {}): IMd3Lock {
  return {
    id: 'lock-1',
    target: { kind: 'tab', id: 'tab-1', label: 'Release notes' },
    factor: 'password',
    createdAt: '2026-08-01T09:00:00.000Z',
    unlockDuration: { kind: 'minutes', minutes: 10 },
    lockOnLaunch: true,
    otpAccountKey: null,
    ...overrides,
  }
}

describe('surface lock model', () => {
  it('mints a distinct id for every lock rather than deriving it from the target', () => {
    const first = createMd3LockId()
    const second = createMd3LockId()

    assert.equal(first.length, 24)
    assert.match(first, /^[0-9a-f]+$/)
    assert.notEqual(first, second)
  })

  it('drops a malformed persisted entry instead of repairing it into a lock', () => {
    assert.equal(normalizeLock(null), null)
    assert.equal(normalizeLock({ id: 'x' }), null)
    assert.equal(
      normalizeLock({
        id: 'x',
        target: { kind: 'nonsense', id: 'y', label: 'z' },
      }),
      null
    )
    assert.equal(
      normalizeLock({
        id: '   ',
        target: { kind: 'tab', id: 'y', label: 'z' },
      }),
      null
    )
  })

  it('fails closed on lockOnLaunch when the stored value is not an explicit false', () => {
    const recovered = normalizeLock({
      id: 'lock-1',
      target: { kind: 'tab', id: 'tab-1', label: 'Release notes' },
      factor: 'password',
      createdAt: '2026-08-01T09:00:00.000Z',
    })

    assert.ok(recovered !== null)
    assert.equal(recovered.lockOnLaunch, true)
    assert.equal(recovered.otpAccountKey, null)
  })

  it('clamps an unlock duration into the offered range', () => {
    assert.deepEqual(normalizeUnlockDuration({ kind: 'minutes', minutes: 0 }), {
      kind: 'minutes',
      minutes: 1,
    })
    assert.deepEqual(
      normalizeUnlockDuration({ kind: 'minutes', minutes: 99_999 }),
      { kind: 'minutes', minutes: 720 }
    )
    assert.equal(normalizeUnlockDuration({ kind: 'nope' }).kind, 'minutes')
  })

  it('expires a timed unlock and never expires a session one', () => {
    const timed = createActiveUnlock(
      'lock-1',
      { kind: 'minutes', minutes: 10 },
      1_000
    )
    assert.equal(timed.expiresAt, 1_000 + 600_000)
    assert.equal(isMd3UnlockActive(timed, 1_000 + 599_000), true)
    assert.equal(isMd3UnlockActive(timed, 1_000 + 600_001), false)

    const session = createActiveUnlock(
      'lock-1',
      { kind: 'session', minutes: 10 },
      1_000
    )
    assert.equal(session.expiresAt, null)
    assert.equal(isMd3UnlockActive(session, Number.MAX_SAFE_INTEGER), true)
    assert.equal(isMd3UnlockActive(undefined, 0), false)
  })

  it('leaves the first two wrong answers free and then backs off', () => {
    assert.equal(md3LockAttemptDelayMs(1), 0)
    assert.equal(md3LockAttemptDelayMs(2), 0)
    assert.equal(md3LockAttemptDelayMs(3), 5_000)
    assert.equal(md3LockAttemptDelayMs(4), 15_000)
    assert.equal(md3LockAttemptDelayMs(9), 30_000)
  })

  // The inverted half of the coverage rule. A test shaped "every catalogued
  // property is well-formed" passes on an empty catalogue; this one demands
  // that every value type the feature claims to cover actually has a property.
  it('covers every declared appearance value type with at least one property', () => {
    const covered = new Set(
      Md3LockableAppearanceProperties.map(entry => entry.valueType)
    )
    const missing = Md3LockableValueTypes.filter(type => !covered.has(type))

    assert.deepEqual(
      missing,
      [],
      `appearance value types with no lockable property: ${missing.join(', ')}`
    )
  })

  it('names every catalogued property with a real model identifier', () => {
    for (const entry of Md3LockableAppearanceProperties) {
      assert.ok(entry.id.length > 0, 'a catalogued property needs an id')
      assert.ok(entry.element.length > 0, `${entry.id} needs an owning element`)
    }
    const ids = Md3LockableAppearanceProperties.map(entry => entry.id)
    assert.equal(
      new Set(ids).size,
      ids.length,
      'a property identifier is listed twice'
    )
  })
})

describe('surface lock search', () => {
  const locks = [
    lockFixture({ id: 'a', target: { kind: 'tab', id: 't1', label: 'Alpha' } }),
    lockFixture({
      id: 'b',
      factor: 'otp',
      otpAccountKey: 'entry-1',
      target: { kind: 'tabGroup', id: 'g1', label: 'Beta group' },
    }),
  ]

  it('matches a plain query case-insensitively across every searchable field', () => {
    assert.deepEqual(
      filterMd3Locks(locks, 'beta', {
        regexEnabled: false,
        caseSensitive: false,
      }).locks.map(lock => lock.id),
      ['b']
    )
    assert.deepEqual(
      filterMd3Locks(locks, 'otp', {
        regexEnabled: false,
        caseSensitive: false,
      }).locks.map(lock => lock.id),
      ['b']
    )
  })

  it('reports an invalid pattern and shows the unfiltered list rather than none', () => {
    const result = filterMd3Locks(locks, '(', {
      regexEnabled: true,
      caseSensitive: false,
    })

    assert.notEqual(result.regexError, null)
    assert.equal(result.locks.length, locks.length)
  })

  it('filters through the safe regex engine when regex mode is on', () => {
    const result = filterMd3Locks(locks, '^Al', {
      regexEnabled: true,
      caseSensitive: true,
    })

    assert.deepEqual(
      result.locks.map(lock => lock.id),
      ['a']
    )
    assert.equal(result.regexError, null)
  })
})

describe('surface lock registry', () => {
  it('round-trips locks through storage and survives a corrupt document', () => {
    const storage = createStorage()
    const created = addMd3Lock(
      {
        target: { kind: 'tab', id: 'tab-1', label: 'Release notes' },
        factor: 'password',
        unlockDuration: { kind: 'minutes', minutes: 10 },
        lockOnLaunch: true,
      },
      storage
    )

    assert.deepEqual(readMd3Locks(storage), [created])

    storage.setItem(Md3LocksStorageKey, 'not json at all')
    assert.deepEqual(readMd3Locks(storage), [])
  })

  it('gives two locks on the same target two independent identities', () => {
    const storage = createStorage()
    const target = { kind: 'tab', id: 'tab-1', label: 'Release notes' } as const
    const first = addMd3Lock(
      {
        target,
        factor: 'password',
        unlockDuration: { kind: 'session', minutes: 10 },
        lockOnLaunch: true,
      },
      storage
    )
    const second = addMd3Lock(
      {
        target,
        factor: 'password',
        unlockDuration: { kind: 'session', minutes: 10 },
        lockOnLaunch: true,
      },
      storage
    )

    assert.notEqual(first.id, second.id)
    assert.equal(
      locksForTarget(readMd3Locks(storage), 'tab', 'tab-1').length,
      2
    )
    assert.equal(isTargetLocked(readMd3Locks(storage), 'tab', 'tab-1'), true)
    assert.equal(isTargetLocked(readMd3Locks(storage), 'tab', 'tab-2'), false)
  })

  it('edits a lock without touching its factor', () => {
    const storage = createStorage()
    const created = addMd3Lock(
      {
        target: { kind: 'tab', id: 'tab-1', label: 'Release notes' },
        factor: 'password',
        unlockDuration: { kind: 'minutes', minutes: 10 },
        lockOnLaunch: true,
      },
      storage
    )

    const updated = updateMd3Lock(
      created.id,
      { lockOnLaunch: false, unlockDuration: { kind: 'session', minutes: 10 } },
      storage
    )

    assert.ok(updated !== null)
    assert.equal(updated.factor, 'password')
    assert.equal(updated.lockOnLaunch, false)
    assert.equal(updated.unlockDuration.kind, 'session')
    assert.equal(updateMd3Lock('no-such-lock', {}, storage), null)
  })

  it('reports only the ids it actually removed', () => {
    const storage = createStorage()
    const created = addMd3Lock(
      {
        target: { kind: 'tab', id: 'tab-1', label: 'Release notes' },
        factor: 'password',
        unlockDuration: { kind: 'minutes', minutes: 10 },
        lockOnLaunch: true,
      },
      storage
    )

    assert.deepEqual(removeMd3Locks(['nope'], storage), [])
    assert.deepEqual(removeMd3Locks([created.id, 'nope'], storage), [
      created.id,
    ])
    assert.deepEqual(readMd3Locks(storage), [])
  })

  it('persists nothing that could open a lock', () => {
    const storage = createStorage()
    writeMd3Locks([lockFixture()], storage)
    const raw = storage.getItem(Md3LocksStorageKey) ?? ''

    // `password` itself is expected here: it is the FACTOR's name, which is a
    // label rather than a value. What must never appear is anything a lock
    // could be opened with.
    assert.ok(raw.includes('"factor":"password"'))
    for (const forbidden of ['digest', 'salt', 'secret', 'credential']) {
      assert.equal(
        raw.includes(forbidden),
        false,
        `the persisted lock document mentions ${forbidden}`
      )
    }
  })
})

describe('surface lock credentials', () => {
  beforeEach(() => {
    clearAllMd3LockAttempts()
    setMd3TotpVerifier(null)
  })

  it('stores a salted digest and never the password itself', async () => {
    const vault = createVault()
    const password = 'correct horse battery staple'

    assert.equal(isValidMd3LockPassword(password), true)
    assert.equal(isValidMd3LockPassword('abc'), false)

    await setMd3LockPassword('lock-1', password, vault)
    const stored = vault.entries.get(lockCredentialAccountKey('lock-1'))

    assert.ok(stored !== undefined)
    assert.equal(stored.includes(password), false)
    assert.equal(await hasMd3LockPassword('lock-1', vault), true)
    assert.equal(await verifyMd3LockPassword('lock-1', password, vault), true)
    assert.equal(await verifyMd3LockPassword('lock-1', 'wrong', vault), false)
  })

  it('refuses to store a password outside the accepted length', async () => {
    const vault = createVault()
    await assert.rejects(() => setMd3LockPassword('lock-1', 'no', vault))
    assert.equal(vault.entries.size, 0)
  })

  it('never lets one lock be opened by another lock’s credential', async () => {
    const vault = createVault()
    await setMd3LockPassword('lock-1', 'first password', vault)
    await setMd3LockPassword('lock-2', 'second password', vault)

    assert.equal(
      await verifyMd3LockPassword('lock-1', 'second password', vault),
      false
    )
    assert.equal(
      await verifyMd3LockPassword('lock-2', 'first password', vault),
      false
    )
    assert.equal(
      await verifyMd3LockPassword('lock-1', 'first password', vault),
      true
    )
  })

  it('forgets a credential when its lock is removed', async () => {
    const vault = createVault()
    await setMd3LockPassword('lock-1', 'first password', vault)

    assert.equal(await removeMd3LockCredential('lock-1', vault), true)
    assert.equal(await hasMd3LockPassword('lock-1', vault), false)
    assert.equal(
      await verifyMd3LockPassword('lock-1', 'first password', vault),
      false
    )
  })

  it('throttles after three wrong answers and clears the ledger on a match', async () => {
    const vault = createVault()
    const lock = lockFixture()
    await setMd3LockPassword(lock.id, 'first password', vault)

    for (const expected of [1, 2]) {
      const attempt = await verifyMd3Lock(lock, 'nope', 1_000, vault)
      assert.equal(attempt.outcome, 'mismatched')
      assert.equal(attempt.consecutiveFailures, expected)
      // The first two wrong answers cost nothing: `retryAt` is not in the
      // future, so the very next attempt is allowed immediately.
      assert.ok(attempt.retryAt <= 1_000)
    }

    const third = await verifyMd3Lock(lock, 'nope', 1_000, vault)
    assert.equal(third.outcome, 'mismatched')
    assert.equal(third.retryAt, 1_000 + 5_000)

    const tooSoon = await verifyMd3Lock(lock, 'first password', 2_000, vault)
    assert.equal(tooSoon.outcome, 'throttled')

    const allowed = await verifyMd3Lock(lock, 'first password', 9_000, vault)
    assert.equal(allowed.outcome, 'matched')
    assert.equal(allowed.consecutiveFailures, 0)
  })

  it('reports an OTP lock as unavailable until an authenticator is registered', async () => {
    const vault = createVault()
    const lock = lockFixture({ factor: 'otp', otpAccountKey: 'entry-1' })

    assert.equal(isMd3TotpAvailable(), false)
    const before = await verifyMd3Lock(lock, '123456', 1_000, vault)
    assert.equal(before.outcome, 'unavailable')
    // Nothing was checked, so nothing is held against the user.
    assert.equal(before.consecutiveFailures, 0)

    setMd3TotpVerifier({
      hasEntry: async () => true,
      verify: async (accountKey, code) =>
        accountKey === 'entry-1' && code === '123456',
    })

    assert.equal(isMd3TotpAvailable(), true)
    assert.equal(
      (await verifyMd3Lock(lock, '123456', 1_000, vault)).outcome,
      'matched'
    )
    assert.equal(
      (await verifyMd3Lock(lock, '000000', 1_000, vault)).outcome,
      'mismatched'
    )
  })

  it('never answers an OTP lock with a password lock’s stored digest', async () => {
    const vault = createVault()
    const lock = lockFixture({ factor: 'otp', otpAccountKey: 'entry-1' })
    await setMd3LockPassword(lock.id, 'first password', vault)

    setMd3TotpVerifier({
      hasEntry: async () => true,
      verify: async () => false,
    })

    const attempt = await verifyMd3Lock(lock, 'first password', 1_000, vault)
    assert.equal(attempt.outcome, 'mismatched')
  })
})

describe('surface lock export', () => {
  const locks = [
    lockFixture(),
    lockFixture({
      id: 'lock-2',
      factor: 'otp',
      otpAccountKey: 'entry-1',
      target: {
        kind: 'appearanceProperty',
        id: 'accentPalette',
        label: 'Seed colour',
      },
    }),
  ]

  it('offers every format that can carry the record', () => {
    assert.deepEqual(
      Md3LockExportFormats.map(entry => entry.format),
      ['json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'markdown', 'html']
    )
  })

  it('writes every field in every format and says credentials were omitted', () => {
    for (const descriptor of Md3LockExportFormats) {
      const result = serializeMd3LockExport(locks, descriptor.format, {
        scope: '2 selected locks',
      })

      assert.equal(result.count, 2)
      assert.equal(result.filename, `surface-locks.${descriptor.extension}`)
      assert.ok(
        result.content.includes('Credentials are not included'),
        `${descriptor.format} dropped the omission notice`
      )
      assert.ok(
        result.content.includes('Release notes'),
        `${descriptor.format} dropped the target label`
      )
      assert.ok(
        result.content.includes('entry-1'),
        `${descriptor.format} dropped the authenticator account key`
      )
    }
  })

  it('never writes anything that could open a lock', () => {
    for (const descriptor of Md3LockExportFormats) {
      const result = serializeMd3LockExport(locks, descriptor.format, {
        scope: '2 selected locks',
      })
      const body = result.content.replace(Md3LockExportOmissionNotice, '')

      for (const forbidden of ['digest', 'salt', 'passwordHash']) {
        assert.equal(
          body.includes(forbidden),
          false,
          `${descriptor.format} leaked a ${forbidden} field`
        )
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Copy contracts
// ---------------------------------------------------------------------------

const LockFunnyBases: ReadonlyArray<FunnyLevelTextBase> = [
  'md3.locks.setupLead',
  'md3.locks.unlockLead',
  'md3.locks.wrongAttempt',
  'md3.locks.managerLead',
]

/**
 * The surfaces that must state, every time they are shown, that this is not
 * security.
 *
 * This list is hand-written rather than derived. A rule shaped "every honesty
 * line present is well-formed" passes cleanly on a surface that has none,
 * because it never looked for the missing one.
 */
const HonestySurfaces: ReadonlyArray<readonly [string, string]> = [
  ['app/src/ui/md3/md3-lock-unlock-prompt.tsx', 'md3.locks.unlock.forFun'],
  ['app/src/ui/md3/md3-lock-setup-dialog.tsx', 'md3.locks.setup.forFun'],
]

/** The surfaces that must name the recovery folder where the user will look. */
const RecoverySurfaces: ReadonlyArray<readonly [string, string]> = [
  ['app/src/ui/md3/md3-lock-unlock-prompt.tsx', 'md3.locks.unlock.recovery'],
  ['app/src/ui/md3/md3-lock-setup-dialog.tsx', 'md3.locks.setup.recovery'],
]

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('surface lock copy', () => {
  it('ships every band of every banded family in both catalogues', () => {
    for (const base of LockFunnyBases) {
      for (const band of ['plain', 'light', 'playful', 'maximum']) {
        const key = `${base}.${band}` as TranslationKey
        assert.ok(
          englishTranslations[key] !== undefined,
          `English is missing ${key}`
        )
        assert.ok(
          cantoneseTranslations[key] !== undefined,
          `Cantonese is missing ${key}`
        )
        assert.notEqual(
          cantoneseTranslations[key],
          englishTranslations[key],
          `${key} has English text sitting in the Cantonese slot`
        )
      }
    }
  })

  it('keeps the wrong-answer count in every band, because it is a fact', () => {
    for (const band of ['plain', 'light', 'playful', 'maximum']) {
      const key = `md3.locks.wrongAttempt.${band}` as TranslationKey
      assert.ok(
        englishTranslations[key].includes('{failures}'),
        `${key} lost the wrong-answer count`
      )
      assert.ok(
        (cantoneseTranslations[key] ?? '').includes('{failures}'),
        `${key} lost the wrong-answer count in Cantonese`
      )
    }
  })

  it('never claims a lock secures, protects or encrypts anything', () => {
    const forbidden =
      /\b(secures?|secured|protects?|protected|encrypts?|encrypted|encryption)\b/i
    const allowed = new Set<string>([
      // These two are the honesty lines, which say the opposite by naming what
      // a lock is NOT. They are exempted by key rather than by pattern so a new
      // claim cannot hide behind a phrase that happens to contain "not".
      'md3.locks.setup.forFun',
      'md3.locks.unlock.forFun',
    ])

    for (const [key, value] of Object.entries(englishTranslations)) {
      if (!key.startsWith('md3.locks.') || allowed.has(key)) {
        continue
      }
      assert.equal(
        forbidden.test(value),
        false,
        `${key} describes a for-fun lock as security: "${value}"`
      )
    }
  })

  it('states in the honesty line itself that this is not security', () => {
    for (const key of [
      'md3.locks.setup.forFun',
      'md3.locks.unlock.forFun',
    ] as ReadonlyArray<TranslationKey>) {
      assert.match(englishTranslations[key], /just for fun/i)
      assert.match(englishTranslations[key], /not security/i)
      assert.match(englishTranslations[key], /nothing is encrypted/i)
    }
  })

  it('renders the honesty line on every surface that creates or answers a lock', () => {
    for (const [path, key] of HonestySurfaces) {
      assert.ok(
        source(path).includes(`t('${key}')`),
        `${path} does not render ${key}`
      )
    }
  })

  it('names the recovery folder on every surface that creates or answers a lock', () => {
    for (const [path, key] of RecoverySurfaces) {
      const text = source(path)
      assert.ok(text.includes(`t('${key}'`), `${path} does not render ${key}`)
      assert.ok(
        text.includes(`t('${key}Unknown')`),
        `${path} has no honest fallback for an unresolved folder path`
      )
    }
    assert.ok(
      englishTranslations['md3.locks.unlock.recovery'].includes('{folder}'),
      'the recovery sentence does not name the folder'
    )
    assert.ok(
      englishTranslations['md3.locks.setup.recovery'].includes('{folder}'),
      'the recovery sentence does not name the folder'
    )
  })
})
