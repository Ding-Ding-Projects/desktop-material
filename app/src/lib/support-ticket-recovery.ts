/**
 * The support desk's resolution: open the application-data folder.
 *
 * This module opens a folder and stops there. It never deletes a file, never
 * empties a directory, and exposes no path that would. Deleting the profile is
 * the user's own act in their own file manager — which is the whole reason the
 * joke desk is allowed to hand it over in one click. If a product ever offers
 * to delete it in-app, that is a destructive action and belongs behind the
 * two-key super-confirmation gate, never behind a button on a support ticket.
 *
 * Nothing here touches the network. The folder is resolved from the running
 * application and opened through the platform's own shell.
 */

/**
 * Opens a path in the platform's file manager.
 *
 * The contract is Electron's `shell.openPath`: an empty string means the path
 * was opened, and any other string is the platform's own failure message. That
 * distinction is why this is used rather than the fire-and-forget reveal
 * helpers — a resolution step that cannot report its own failure would leave
 * the user staring at a window that never appeared.
 */
export type SupportTicketFolderOpener = (path: string) => Promise<string>

/** Resolves the application-data folder for the running profile. */
export type SupportTicketFolderResolver = () => Promise<string>

/** What happened when the desk tried to open the folder. */
export type SupportTicketRecoveryOutcome =
  | {
      readonly kind: 'opened'
      /** The exact folder that was opened — the one the surface displayed. */
      readonly path: string
    }
  | {
      readonly kind: 'failed'
      /** The exact folder the open was attempted on. */
      readonly path: string
      /** The platform's own message, reported verbatim. */
      readonly error: string
    }
  | {
      readonly kind: 'unavailable'
      /** Why no folder could be resolved at all. */
      readonly error: string
    }

/** The message used when a rejection carries nothing readable. */
const UnknownFailure = 'The file manager reported no reason.'

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }
  return UnknownFailure
}

/**
 * Resolve the folder the desk will offer to open.
 *
 * Returns `null` rather than throwing when the host cannot answer, so the
 * surface can say "the folder could not be resolved" instead of rendering a
 * button that is guaranteed to fail.
 */
export async function resolveApplicationDataFolder(
  resolve: SupportTicketFolderResolver
): Promise<string | null> {
  try {
    const path = await resolve()
    return typeof path === 'string' && path.trim().length > 0 ? path : null
  } catch {
    return null
  }
}

/**
 * Open the resolved folder, reporting honestly what happened.
 *
 * `path` is the exact string the surface displayed, and it is the exact string
 * handed to the opener and echoed back in the outcome. The displayed path and
 * the opened folder are therefore one value rather than two that could drift.
 */
export async function openApplicationDataFolder(
  path: string | null,
  open: SupportTicketFolderOpener
): Promise<SupportTicketRecoveryOutcome> {
  if (path === null || path.trim().length === 0) {
    return {
      kind: 'unavailable',
      error: 'The application data folder could not be resolved.',
    }
  }

  try {
    const failure = await open(path)
    if (typeof failure === 'string' && failure.trim().length > 0) {
      return { kind: 'failed', path, error: failure }
    }
    return { kind: 'opened', path }
  } catch (error) {
    return { kind: 'failed', path, error: messageFrom(error) }
  }
}
