import { IMenu } from '../models/app-menu'

/**
 * The keyboard shortcuts the application menu actually registers, keyed by
 * menu item id.
 *
 * A context menu item that mirrors an application menu command has the same
 * keyboard shortcut, and the context menu is where users go to find out what
 * an object can do — so a shortcut hidden there is a shortcut nobody learns.
 *
 * The obvious way to show them is to write the accelerator string beside each
 * context menu item, and it is the wrong way: there would then be two records
 * of the same binding, and the copy that is only ever *displayed* is the copy
 * nobody notices going stale. A shortcut that no longer works trains a user to
 * press a key that does nothing, which is worse than showing none at all.
 *
 * So the menu the main process actually built is the single record, and this
 * is a read-through of it. The map is refreshed every time the menu arrives,
 * which is also how a shortcut that is only registered in some states stays
 * correct: the lookup returns whatever the current menu says, or nothing.
 */
let acceleratorsById = new Map<string, string>()

function collect(menu: IMenu, into: Map<string, string>): void {
  for (const item of menu.items) {
    if (item.type === 'submenuItem') {
      collect(item.menu, into)
      continue
    }
    // The model already carries the accelerator Electron resolved, including
    // the one a role implies, so nothing is re-derived here.
    if (item.type === 'separator' || item.id === undefined) {
      continue
    }
    const accelerator = item.accelerator
    if (accelerator !== null && accelerator.length > 0) {
      into.set(item.id, accelerator)
    }
  }
}

/**
 * Records the accelerators of the application menu the main process just sent.
 *
 * Called wherever the renderer takes delivery of that menu, so the two cannot
 * drift: a shortcut that changes in the menu definition changes here on the
 * very next delivery, with nothing to keep in step by hand.
 */
export function setMenuAccelerators(menu: IMenu): void {
  const next = new Map<string, string>()
  collect(menu, next)
  acceleratorsById = next
}

/**
 * The shortcut for an application menu command, or undefined when it has none.
 *
 * Undefined is the honest answer in three different situations, and the caller
 * wants the same behaviour in all of them: the command genuinely has no
 * shortcut, the menu has not been delivered yet, or the id does not exist. In
 * each case the context menu item simply shows no shortcut, which is correct —
 * padding the column with a placeholder would be worse than an empty space.
 */
export function menuAccelerator(id: string): string | undefined {
  return acceleratorsById.get(id)
}

/** Test seam: the number of commands currently known to have a shortcut. */
export function knownAcceleratorCount(): number {
  return acceleratorsById.size
}

/**
 * The shortcuts Electron's standard editing roles carry.
 *
 * These are not in the map above because the application menu declares them as
 * roles rather than as identified commands - Electron supplies the binding, so
 * there is no accelerator string in the menu definition to read. They are
 * fixed platform conventions rather than app choices, so writing them down
 * once here is the closest thing to a single record available.
 */
const RoleAccelerators: ReadonlyMap<string, string> = new Map([
  ['undo', 'CmdOrCtrl+Z'],
  ['redo', __DARWIN__ ? 'Cmd+Shift+Z' : 'Ctrl+Y'],
  ['cut', 'CmdOrCtrl+X'],
  ['copy', 'CmdOrCtrl+C'],
  ['paste', 'CmdOrCtrl+V'],
  ['selectAll', 'CmdOrCtrl+A'],
])

/** The shortcut for a standard editing role, or undefined for anything else. */
export function roleAccelerator(role: string | undefined): string | undefined {
  return role === undefined ? undefined : RoleAccelerators.get(role)
}
