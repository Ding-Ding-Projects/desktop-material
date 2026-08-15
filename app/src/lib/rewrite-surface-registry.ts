/**
 * Every user-facing surface the MD3 rewrite added, written out by hand.
 *
 * This list exists because of a specific failure mode. A guard that walks the
 * command palette catalog and checks that each registered row is well-formed
 * passes cleanly on an application that registers none of the new surfaces at
 * all — it only ever looked at what was there. The same is true of the
 * settings-search catalog: "every entry that names a teleport target names a
 * real one" is satisfied by a catalog whose entries name no targets.
 *
 * So the enumeration is written down rather than derived. Adding a destination,
 * a manager or a settings row to the rewrite means adding it here too, and
 * until its palette row, its teleport target and (where it is a setting) its
 * settings-search entry exist, the coverage test fails.
 *
 * Kept free of DOM and React imports so node-only tests can consume it.
 */

import type { TeleportTargetId } from './teleport-targets'

/**
 * What kind of thing the surface is, which decides what has to exist for it.
 *
 * - `destination` is one of the shell's eight drawer destinations. It is
 *   navigation, not configuration, so it carries no settings-search entry.
 * - `feature` is a surface the shell added that is reached from somewhere
 *   other than the drawer — the documentation browser, the authenticator, the
 *   locks manager, the support desk.
 * - `setting` is a row in Settings that the rewrite introduced.
 */
export type RewriteSurfaceKind = 'destination' | 'feature' | 'setting'

export interface IRewriteSurface {
  /** Stable identity for the coverage report, not shown to a user. */
  readonly id: string

  readonly kind: RewriteSurfaceKind

  /** The palette event whose row must exist and must teleport. */
  readonly paletteEvent: string

  /**
   * The element the palette row lands on. A row that opens the owning screen
   * and leaves the reader to find the control is the "general page" outcome a
   * teleport exists to avoid, so every surface names one — except the surfaces
   * that *are* a dialog, where opening the dialog is the arrival.
   */
  readonly teleportTargetId?: TeleportTargetId

  /**
   * The surface is its own dialog, so its palette row has no separate home:
   * opening it is the teleport. Exactly one of this and `teleportTargetId` is
   * set, which is what stops a surface from quietly having neither.
   */
  readonly dialogHosted?: true

  /**
   * The settings-search entry id, for a surface that lives in Settings.
   *
   * Two kinds of surface deliberately have none, and the reason is the same
   * for both: settings search indexes Settings, and its results navigate
   * within the Settings dialog. A drawer destination is not in Settings, and
   * neither is the documentation browser — a result that closed Settings to
   * open something else would be a search that loses the reader's place. Both
   * are reachable by name from the command palette instead, which is the
   * surface that *can* go anywhere.
   */
  readonly settingsSearchEntryId?: string
}

/**
 * The hand-written inventory. Order is the order a reader meets them: the
 * eight destinations, then the features, then the settings rows.
 */
export const RewriteSurfaces: ReadonlyArray<IRewriteSurface> = Object.freeze([
  {
    id: 'docs-browser',
    kind: 'feature',
    paletteEvent: 'show-docs-browser',
    dialogHosted: true,
  },
  {
    id: 'authenticator',
    kind: 'feature',
    paletteEvent: 'palette:authenticator',
    teleportTargetId: 'settingsAuthenticator',
    settingsSearchEntryId: 'advanced-authenticator',
  },
  {
    id: 'surface-locks',
    kind: 'feature',
    paletteEvent: 'palette:surface-locks',
    teleportTargetId: 'settingsSurfaceLocks',
    settingsSearchEntryId: 'appearance-surface-locks',
  },
  {
    id: 'support-tickets',
    kind: 'feature',
    paletteEvent: 'palette:support-tickets',
    teleportTargetId: 'settingsSupportTickets',
    settingsSearchEntryId: 'appearance-support-tickets',
  },
  {
    id: 'setting-dialog-emoji',
    kind: 'setting',
    paletteEvent: 'palette:set-dialog-emoji',
    teleportTargetId: 'settingsDialogEmoji',
    settingsSearchEntryId: 'appearance-dialog-emoji',
  },
])
