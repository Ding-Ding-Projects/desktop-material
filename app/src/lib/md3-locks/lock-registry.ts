import {
  IMd3Lock,
  IMd3LockTarget,
  IMd3UnlockDuration,
  Md3LockFactor,
  createMd3LockId,
  normalizeLock,
} from './lock-model'

/**
 * The persisted, enumerable list of surface locks.
 *
 * "Every lock carries its own credential" is only checkable if the locks
 * themselves are a real list, so this is one — readable, searchable, editable
 * and removable one at a time or in bulk, rather than a scattering of booleans
 * hidden inside whatever each surface happens to persist.
 *
 * What is stored here contains no secret: a lock's password digest and an OTP
 * secret live in the operating-system credential vault (see
 * `lock-credentials.ts`), and this record holds only the vault account key,
 * which is a name. That separation is what makes it safe for this list to be
 * exportable.
 *
 * Storage is injected so the store can be exercised without a browser, and
 * defaults to `localStorage` — the app's own local application-data area, which
 * is exactly the folder the recovery route tells a locked-out user to delete.
 */

export const Md3LocksStorageKey = 'desktop-material-surface-locks-v1'

/** Broadcast on every mutation so open surfaces re-read without a restart. */
export const Md3LocksChangedEvent = 'desktop-material-surface-locks-changed'

/** The subset of `Storage` this module needs. */
export type Md3LockStorage = Pick<Storage, 'getItem' | 'setItem'>

interface IPersistedDocument {
  readonly version: 1
  readonly locks: ReadonlyArray<unknown>
}

function defaultStorage(): Md3LockStorage {
  if (typeof localStorage === 'undefined') {
    throw new Error('No storage is available for surface locks')
  }
  return localStorage
}

function announce(): void {
  if (typeof window !== 'undefined' && typeof window.Event === 'function') {
    window.dispatchEvent(new window.Event(Md3LocksChangedEvent))
  }
}

/**
 * Read every lock.
 *
 * An unreadable or malformed document yields an empty list rather than a throw:
 * a corrupt file must not make the whole app unusable, and an empty list is the
 * honest reading of "no locks could be recovered". Individual malformed entries
 * are dropped by {@link normalizeLock}, so one bad record cannot take its
 * siblings with it.
 */
export function readMd3Locks(
  storage: Md3LockStorage = defaultStorage()
): ReadonlyArray<IMd3Lock> {
  let raw: string | null
  try {
    raw = storage.getItem(Md3LocksStorageKey)
  } catch {
    return []
  }
  if (raw === null) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return []
    }
    const document = parsed as Partial<IPersistedDocument>
    if (!Array.isArray(document.locks)) {
      return []
    }
    const locks: Array<IMd3Lock> = []
    for (const entry of document.locks) {
      const lock = normalizeLock(entry)
      if (lock !== null) {
        locks.push(lock)
      }
    }
    return locks
  } catch {
    return []
  }
}

/** Replace the whole list. Every mutation below funnels through here. */
export function writeMd3Locks(
  locks: ReadonlyArray<IMd3Lock>,
  storage: Md3LockStorage = defaultStorage()
): ReadonlyArray<IMd3Lock> {
  const document: IPersistedDocument = { version: 1, locks }
  storage.setItem(Md3LocksStorageKey, JSON.stringify(document))
  announce()
  return locks
}

/** What a lock is made of when it is created. */
export interface IMd3LockDraft {
  readonly target: IMd3LockTarget
  readonly factor: Md3LockFactor
  readonly unlockDuration: IMd3UnlockDuration
  readonly lockOnLaunch: boolean
  /** Required for an `otp` factor, ignored otherwise. */
  readonly otpAccountKey?: string | null
}

/**
 * Add a lock and return it.
 *
 * The id is minted here rather than derived from the target, so locking the
 * same tab twice produces two independent locks with two independent
 * credentials rather than silently overwriting the first — which is what
 * "each and every lock carries its own credential" requires.
 */
export function addMd3Lock(
  draft: IMd3LockDraft,
  storage: Md3LockStorage = defaultStorage(),
  now: Date = new Date()
): IMd3Lock {
  const lock: IMd3Lock = {
    id: createMd3LockId(),
    target: draft.target,
    factor: draft.factor,
    createdAt: now.toISOString(),
    unlockDuration: draft.unlockDuration,
    lockOnLaunch: draft.lockOnLaunch,
    otpAccountKey: draft.factor === 'otp' ? draft.otpAccountKey ?? null : null,
  }
  writeMd3Locks([...readMd3Locks(storage), lock], storage)
  return lock
}

/** Fields of a lock that can be edited without re-creating it. */
export interface IMd3LockUpdate {
  readonly unlockDuration?: IMd3UnlockDuration
  readonly lockOnLaunch?: boolean
  readonly target?: IMd3LockTarget
  readonly otpAccountKey?: string | null
}

/**
 * Edit one lock in place. Returns the updated lock, or `null` when the id is
 * unknown.
 *
 * The factor is deliberately not editable here: changing a password lock into
 * an OTP lock replaces the credential, which is a create-and-remove pair the
 * caller must perform explicitly so the old credential is genuinely forgotten.
 */
export function updateMd3Lock(
  lockId: string,
  update: IMd3LockUpdate,
  storage: Md3LockStorage = defaultStorage()
): IMd3Lock | null {
  const locks = readMd3Locks(storage)
  const existing = locks.find(lock => lock.id === lockId)
  if (existing === undefined) {
    return null
  }
  const next: IMd3Lock = {
    ...existing,
    target: update.target ?? existing.target,
    unlockDuration: update.unlockDuration ?? existing.unlockDuration,
    lockOnLaunch: update.lockOnLaunch ?? existing.lockOnLaunch,
    otpAccountKey:
      existing.factor === 'otp'
        ? update.otpAccountKey ?? existing.otpAccountKey
        : null,
  }
  writeMd3Locks(
    locks.map(lock => (lock.id === lockId ? next : lock)),
    storage
  )
  return next
}

/**
 * Remove locks by id and report which ids were actually removed.
 *
 * The caller uses the returned ids to forget each lock's credential, so a
 * removal that took nothing away cannot be reported as if it had.
 */
export function removeMd3Locks(
  lockIds: ReadonlyArray<string>,
  storage: Md3LockStorage = defaultStorage()
): ReadonlyArray<string> {
  const doomed = new Set(lockIds)
  const locks = readMd3Locks(storage)
  const removed = locks.filter(lock => doomed.has(lock.id)).map(lock => lock.id)
  if (removed.length === 0) {
    return removed
  }
  writeMd3Locks(
    locks.filter(lock => !doomed.has(lock.id)),
    storage
  )
  return removed
}

/**
 * Every lock covering one target.
 *
 * More than one is legitimate — a tab and a property inside it are two separate
 * locks — so this answers with a list rather than pretending there is at most
 * one.
 */
export function locksForTarget(
  locks: ReadonlyArray<IMd3Lock>,
  kind: IMd3LockTarget['kind'],
  targetId: string
): ReadonlyArray<IMd3Lock> {
  return locks.filter(
    lock => lock.target.kind === kind && lock.target.id === targetId
  )
}

/** Whether a target has at least one lock. */
export function isTargetLocked(
  locks: ReadonlyArray<IMd3Lock>,
  kind: IMd3LockTarget['kind'],
  targetId: string
): boolean {
  return locksForTarget(locks, kind, targetId).length > 0
}
