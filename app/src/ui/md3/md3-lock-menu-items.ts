import { t } from '../../lib/i18n'
import {
  IMd3ActiveUnlock,
  IMd3Lock,
  IMd3LockTarget,
  isMd3UnlockActive,
  locksForTarget,
} from '../../lib/md3-locks'
import { IMd3MenuItem } from './md3-menu-specs'

/**
 * The lock commands a tab's or a group's own context menu carries, beside
 * **Edit tab appearance…**.
 *
 * The contract puts the lock where the user already right-clicks, so these are
 * built as ordinary {@link IMd3MenuItem}s and spliced into the menu the surface
 * already has, rather than living in a menu of their own. Every item shows the
 * keyboard shortcut that actually works in that context, because a context menu
 * whose shortcuts are hidden is a context menu that teaches nobody the faster
 * route — and a shortcut shown that does not fire is worse than none.
 *
 * More than one lock can cover one target: a tab and a value inside it are two
 * locks with two answers. The builder therefore emits one Edit and one Remove
 * per lock rather than assuming there is at most one, and names each by what it
 * covers so two entries are never indistinguishable.
 */

// Key notation rather than prose: `⇧⌘L` reads the same in every language, and
// translating it would name a key that does not exist.
export const ShortcutLockSurface = '⇧⌘L'
export const ShortcutManageLocks = '⇧⌘K'

export interface IMd3LockMenuContext {
  /** What this menu belongs to. */
  readonly target: IMd3LockTarget

  /** Every lock in the app; the builder narrows to this target itself. */
  readonly locks: ReadonlyArray<IMd3Lock>

  /** The unlocks currently in force. */
  readonly activeUnlocks: ReadonlyArray<IMd3ActiveUnlock>

  /** Epoch milliseconds, so an expired unlock is not offered a Lock again. */
  readonly now: number
}

export interface IMd3LockMenuHandlers {
  /** Open the setup dialog for a new lock on this target. */
  readonly onLockTarget: (target: IMd3LockTarget) => void

  /** Open the setup dialog for an existing lock. */
  readonly onEditLock: (lock: IMd3Lock) => void

  /** Remove one lock and forget its credential. */
  readonly onRemoveLock: (lock: IMd3Lock) => void

  /** Retire a live unlock so the surface is locked again immediately. */
  readonly onLockAgain: (lock: IMd3Lock) => void

  /** Open the lock manager. */
  readonly onManageLocks: () => void
}

/**
 * Build the lock section of a tab or group context menu.
 *
 * The caller splices the result in beside its own **Edit tab appearance…**
 * entry. Order is deliberate: create first when there is no lock, then one
 * pair of edit/remove entries per existing lock, then the manager.
 */
export function buildMd3LockMenuItems(
  context: IMd3LockMenuContext,
  handlers: IMd3LockMenuHandlers
): ReadonlyArray<IMd3MenuItem> {
  const { target, locks, activeUnlocks, now } = context
  const owned = locksForTarget(locks, target.kind, target.id)
  const items: Array<IMd3MenuItem> = []

  items.push({
    id: 'md3-lock-create',
    label:
      target.kind === 'tabGroup'
        ? t('md3.locks.menu.lockGroup')
        : t('md3.locks.menu.lockTab'),
    icon: 'lock',
    hint: ShortcutLockSurface,
    onClick: () => handlers.onLockTarget(target),
  })

  for (const lock of owned) {
    items.push({
      id: `md3-lock-edit-${lock.id}`,
      label: t('md3.locks.menu.editLock'),
      icon: 'edit',
      hint: '',
      onClick: () => handlers.onEditLock(lock),
    })

    const unlock = activeUnlocks.find(entry => entry.lockId === lock.id)
    if (isMd3UnlockActive(unlock, now)) {
      items.push({
        id: `md3-lock-relock-${lock.id}`,
        label: t('md3.locks.menu.lockAgain'),
        icon: 'lock',
        hint: '',
        onClick: () => handlers.onLockAgain(lock),
      })
    }

    items.push({
      id: `md3-lock-remove-${lock.id}`,
      label: t('md3.locks.menu.removeLock'),
      icon: 'delete',
      hint: '',
      onClick: () => handlers.onRemoveLock(lock),
    })
  }

  items.push({
    id: 'md3-lock-manage',
    label: t('md3.locks.menu.manage'),
    icon: 'key',
    hint: ShortcutManageLocks,
    onClick: handlers.onManageLocks,
  })

  return items
}

/**
 * A locked surface's label as it appears in a search result or the palette.
 *
 * A locked tab stays honest in search: it is still listed, and it is labelled
 * as locked rather than silently omitted. Selecting it prompts to unlock, which
 * is the caller's job — this only supplies the words.
 */
export function md3LockedResultLabel(label: string, locked: boolean): string {
  return locked ? t('md3.locks.searchResult.locked', { label }) : label
}

/** The outcome of applying the bulk-close exclusion. */
export interface IMd3LockedBulkCloseResult<T> {
  /** The entries the bulk close will act on. */
  readonly closing: ReadonlyArray<T>

  /** The entries held back because they are locked. */
  readonly excluded: ReadonlyArray<T>

  /** A sentence for the preview, or `null` when nothing was held back. */
  readonly notice: string | null
}

/**
 * Hold locked tabs back from a bulk close, exactly as pinned tabs are.
 *
 * `includeLocked` is the explicit opt-in the contract requires: with it the
 * locked tabs close too, and the preview still states how many of them there
 * were, so an inclusive close is never silently identical to an exclusive one.
 */
export function excludeLockedFromBulkClose<T>(
  entries: ReadonlyArray<T>,
  isLocked: (entry: T) => boolean,
  includeLocked: boolean
): IMd3LockedBulkCloseResult<T> {
  const locked = entries.filter(isLocked)

  if (includeLocked) {
    return {
      closing: entries,
      excluded: [],
      notice:
        locked.length === 0
          ? null
          : t('md3.locks.bulkClose.excluded', { count: String(locked.length) }),
    }
  }

  return {
    closing: entries.filter(entry => !isLocked(entry)),
    excluded: locked,
    notice:
      locked.length === 0
        ? null
        : t('md3.locks.bulkClose.excluded', { count: String(locked.length) }),
  }
}
