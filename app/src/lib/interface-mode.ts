/**
 * Which interface mode the app is in.
 *
 * The app ships two whole interfaces rather than one interface with a legacy
 * corner, so "modes" is what they are: **Material mode**, the MD3 shell with
 * its navigation drawer and eight destinations, and **Classic mode**, the
 * layout the app had before the rewrite — repository tab strip, classic
 * toolbar, sidebar, repository workspace.
 *
 * This replaces the earlier boolean "use the classic experience". A boolean
 * makes one of the two the absence of the other, which is the wrong shape for
 * a pair of first-class interfaces and reads badly the moment a third is
 * imagined. A recorded `'classic'` also survives a change of default, where a
 * recorded `false` would silently become whatever the new default means.
 *
 * The two modes are meant to be equals, and are not yet. Every action the
 * classic chrome offered is carried into the shell by its menus and carry-over
 * extensions, and every shared layer renders in both — `interface-mode-test.ts`
 * holds them to that. But Classic mode's repository workspace has a tab bar
 * reaching eleven sections, and the shell has no equivalent: six of them —
 * Releases, Issues, Triage, Cheap LFS, Launchpad and the history graph — have
 * no route in Material mode at all.
 *
 * That is recorded, not hidden. `interface-mode-parity-test.ts` names the six
 * and fails if a seventh joins them, so the gap cannot quietly widen while it
 * waits for a route. Nothing is lost outright, because Classic mode reaches
 * all of them; what is wrong is that choosing the newer interface currently
 * costs a user six surfaces, which is not the deal a mode switch offers.
 *
 * The preference round-trips through the same local-storage store every other
 * UI preference uses. It is not a second store.
 */

import { getBoolean } from './local-storage'

/** The two interfaces the app ships. */
export type InterfaceMode = 'material' | 'classic'

/** Every mode, in the order the settings surface offers them. */
export const InterfaceModes: ReadonlyArray<InterfaceMode> = [
  'material',
  'classic',
]

/** Local-storage key for the persisted mode. */
export const InterfaceModeKey = 'interface-mode'

/**
 * The key the earlier boolean used.
 *
 * Read on migration and never written. A user who chose the classic interface
 * before it was called a mode keeps that choice: dropping it would reset
 * everyone who had already decided, which is the one thing a rename must not
 * do.
 */
export const LegacyUseClassicExperienceKey = 'use-classic-experience'

/**
 * Shipped default.
 *
 * Classic, since 2026-08-14, at the user's explicit request: the new interface
 * was "causing more issues than good" and the UI was to render as it did
 * before the MD3 rewrite. This is that, exactly — the pre-rewrite tip
 * `f443f3cd10` rendered `Md3Shell` with `md3NoViews` and the drawer, every
 * destination falling through to the classic repository workspace, which is
 * precisely what `renderClassicApp` does.
 *
 * It was Material before, on the reasoning that a fork shipping its own
 * rewrite switched off by default would be shipping it to nobody. That
 * reasoning was sound and lost to evidence: the rewrite is switched off by
 * default now because it was not serving the person using it.
 *
 * Nothing was deleted to achieve this and nothing needs re-adding. Every MD3
 * destination, controller, adapter, palette entry and localized string is
 * still in the tree, and Material mode is still one setting away for anyone
 * who wants it — including whoever eventually makes the shell good enough to
 * default to again.
 */
export const InterfaceModeDefault: InterfaceMode = 'classic'

/** Fired on `window` whenever the mode changes, so the app re-renders. */
export const InterfaceModeChangedEvent =
  'desktop-material-interface-mode-changed'

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function isInterfaceMode(value: unknown): value is InterfaceMode {
  return value === 'material' || value === 'classic'
}

/**
 * Read the mode, honouring a choice recorded before the rename.
 *
 * An unreadable or unrecognised stored value falls back to the default rather
 * than throwing: the interface a user sees must never depend on a settings
 * file parsing cleanly.
 */
export function getInterfaceMode(): InterfaceMode {
  if (!hasStorage()) {
    return InterfaceModeDefault
  }

  const stored = localStorage.getItem(InterfaceModeKey)
  if (isInterfaceMode(stored)) {
    return stored
  }

  // Nothing recorded under the new key. A `true` under the old one is a real
  // decision for the classic interface and is honoured; an old `false` is a
  // real decision for the new one, and both mean the same thing they did.
  const legacy = getBoolean(LegacyUseClassicExperienceKey)
  if (legacy !== undefined) {
    return legacy ? 'classic' : 'material'
  }

  return InterfaceModeDefault
}

/**
 * Persist the mode and tell every mounted surface.
 *
 * Returns the mode actually stored so a caller never has to guess.
 */
export function setInterfaceMode(mode: InterfaceMode): InterfaceMode {
  const normalized = isInterfaceMode(mode) ? mode : InterfaceModeDefault
  if (hasStorage()) {
    localStorage.setItem(InterfaceModeKey, normalized)
    // The old key is removed once a choice exists under the new one, so the
    // migration above cannot later resurrect a stale answer.
    localStorage.removeItem(LegacyUseClassicExperienceKey)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event(InterfaceModeChangedEvent))
  }
  return normalized
}

/** Whether the classic interface is the one in use. */
export function isClassicMode(): boolean {
  return getInterfaceMode() === 'classic'
}

/**
 * Where the current mode came from.
 *
 * `'default'` means nobody has ever chosen: the app is falling back to its own
 * compiled-in value. `'stored'` means a real recorded choice, including one
 * recorded under the old boolean key before the rename. The settings surface
 * states this rather than the opaque word "default", so a user can tell a
 * deliberate choice from a value that has simply never been set.
 */
export type InterfaceModeProvenance = 'default' | 'stored'

/** Report whether the live mode is a recorded choice or the shipped fallback. */
export function getInterfaceModeProvenance(): InterfaceModeProvenance {
  if (!hasStorage()) {
    return 'default'
  }
  if (isInterfaceMode(localStorage.getItem(InterfaceModeKey))) {
    return 'stored'
  }
  return getBoolean(LegacyUseClassicExperienceKey) === undefined
    ? 'default'
    : 'stored'
}
