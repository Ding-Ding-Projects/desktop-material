/**
 * "Show the classic toolbar".
 *
 * The MD3 shell moves the repository, worktree, branch, sync and build-run
 * controls into the pane header and the pane menu. The classic toolbar band
 * that carried them is not deleted by that move: it stays, behind this
 * setting, and the setting ships enabled — a user who has learned where those
 * controls are does not have to relearn them because the chrome around them
 * changed.
 *
 * Turning it off loses nothing. Every action the band offered is reachable
 * from the pane header's fetch and push controls and from the pane menu, which
 * is the condition this setting is allowed to exist under: a toggle that hides
 * the only route to a capability would be a feature removal wearing a
 * checkbox.
 *
 * The preference round-trips through the same local-storage boolean store
 * every other UI preference uses (`getBoolean` / `setBoolean`). It is not a
 * second store.
 */

import { getBoolean, setBoolean } from './local-storage'

/** Local-storage key for the persisted toggle. */
export const ShowClassicToolbarKey = 'show-classic-toolbar'

/**
 * Shipped default.
 *
 * On, deliberately and by the user's own decision: the classic toolbar is kept
 * rather than retired, and a setting that shipped off would be a removal that
 * nobody had to write down.
 */
export const ShowClassicToolbarDefault = true

/** Fired on `window` whenever the preference changes, so the shell updates. */
export const ShowClassicToolbarChangedEvent =
  'desktop-material-classic-toolbar-changed'

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/** Read the persisted preference, falling back to the shipped default. */
export function getShowClassicToolbar(): boolean {
  if (!hasStorage()) {
    return ShowClassicToolbarDefault
  }
  return getBoolean(ShowClassicToolbarKey, ShowClassicToolbarDefault)
}

/**
 * Persist the preference and tell every mounted surface.
 *
 * Returns the value actually stored so a caller never has to guess.
 */
export function setShowClassicToolbar(value: boolean): boolean {
  const normalized = value === true
  if (hasStorage()) {
    setBoolean(ShowClassicToolbarKey, normalized)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(ShowClassicToolbarChangedEvent))
  }
  return normalized
}

/**
 * Where the current value came from.
 *
 * `'default'` means nobody has ever chosen: the app is falling back to its own
 * compiled-in value. `'stored'` means a real recorded choice. The settings
 * surface states this rather than the opaque word "default", so a user can
 * tell a deliberate `false` from a value that has simply never been set.
 */
export type ClassicToolbarProvenance = 'default' | 'stored'

/** Report whether the live value is a recorded choice or the shipped fallback. */
export function getShowClassicToolbarProvenance(): ClassicToolbarProvenance {
  if (!hasStorage()) {
    return 'default'
  }
  return getBoolean(ShowClassicToolbarKey) === undefined ? 'default' : 'stored'
}
