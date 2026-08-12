/**
 * "Use the classic experience".
 *
 * The MD3 shell replaced the whole application chrome: a header, a navigation
 * drawer and eight destinations in place of the toolbar, the sidebar and the
 * repository workspace. This setting puts the pre-rewrite interface back —
 * not a skin over the new shell, but the layout `App.renderApp()` rendered
 * before the rewrite, built from the same components that still ship.
 *
 * It exists because a rewrite of an entire interface is a change nobody asked
 * the person using it about. Muscle memory is a real feature, and "you will
 * get used to it" is not an answer a user can act on today.
 *
 * The two settings are independent and compose the way a reader would expect.
 * {@link ./classic-toolbar} decides whether the classic *toolbar band* appears
 * above the MD3 pane; this decides whether the classic *shell* is used at all.
 * With the classic experience on, the toolbar is part of that layout and the
 * band setting no longer applies — the settings surface says so rather than
 * leaving two switches that appear to contradict each other.
 *
 * Neither layout can reach anything the other cannot. Every destination the
 * MD3 shell added is a dialog or a surface the classic layout can also open,
 * and every action the classic chrome offered is carried into the shell by its
 * menus and its carry-over extensions. That is the condition this setting is
 * allowed to exist under: a toggle that stranded a capability on one side
 * would be two half-products rather than one product with a preference.
 *
 * The preference round-trips through the same local-storage boolean store
 * every other UI preference uses. It is not a second store.
 */

import { getBoolean, setBoolean } from './local-storage'

/** Local-storage key for the persisted toggle. */
export const UseClassicExperienceKey = 'use-classic-experience'

/**
 * Shipped default.
 *
 * Off: the MD3 shell is what the application is now, and a fork that shipped
 * its own rewrite disabled by default would be shipping it to nobody. The
 * classic experience is a choice a user makes, not the state they start in.
 */
export const UseClassicExperienceDefault = false

/** Fired on `window` whenever the preference changes, so the app re-renders. */
export const UseClassicExperienceChangedEvent =
  'desktop-material-classic-experience-changed'

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/** Read the persisted preference, falling back to the shipped default. */
export function getUseClassicExperience(): boolean {
  if (!hasStorage()) {
    return UseClassicExperienceDefault
  }
  return getBoolean(UseClassicExperienceKey, UseClassicExperienceDefault)
}

/**
 * Persist the preference and tell every mounted surface.
 *
 * Returns the value actually stored so a caller never has to guess.
 */
export function setUseClassicExperience(value: boolean): boolean {
  const normalized = value === true
  if (hasStorage()) {
    setBoolean(UseClassicExperienceKey, normalized)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(UseClassicExperienceChangedEvent))
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
export type ClassicExperienceProvenance = 'default' | 'stored'

/** Report whether the live value is a recorded choice or the shipped fallback. */
export function getUseClassicExperienceProvenance(): ClassicExperienceProvenance {
  if (!hasStorage()) {
    return 'default'
  }
  return getBoolean(UseClassicExperienceKey) === undefined
    ? 'default'
    : 'stored'
}
