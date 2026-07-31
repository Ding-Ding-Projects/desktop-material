import { shell as electronShell } from 'electron'
import * as Path from 'path'

import { Repository } from '../models/repository'
import {
  showItemInFolder,
  showFolderContents,
  openExternal,
  moveItemToTrash,
  forceDeleteDirectory,
} from '../ui/main-process-proxy'
import { externalOpenGuard, externalOpenTarget } from './external-open-guard'
import {
  BrowserOpenIntent,
  BrowserOpenMode,
  getBrowserOpenModePreference,
} from './internal-browser'

export interface IAppShellOpenExternalOptions {
  /** Override the global setting for this launch only. */
  readonly mode?: BrowserOpenMode
  /** Explicitly marks a launch as an authentication flow. */
  readonly intent?: BrowserOpenIntent
  /**
   * Set false only when the caller already turns a false result into its own
   * factual user-facing error. This prevents two notices for one failed launch.
   */
  readonly reportFailure?: boolean
}

export interface IAppShell {
  readonly moveItemToTrash: (path: string) => Promise<void>
  /**
   * Permanently and recursively delete a directory. Last-resort fallback used
   * when {@link moveItemToTrash} fails; the main process validates and contains
   * the path (refusing empty/root paths and symlink/junction escapes) before
   * deleting.
   */
  readonly forceDeleteDirectory: (path: string) => Promise<void>
  readonly beep: () => void
  readonly openExternal: (
    path: string,
    options?: IAppShellOpenExternalOptions
  ) => Promise<boolean>
  /**
   * Reveals the specified file using the operating
   * system default application.
   * Do not use this method with non-validated paths.
   *
   * @param path - The path of the file to open
   */

  readonly openPath: (path: string) => Promise<string>
  /**
   * Reveals the specified file on the operating system
   * default file explorer. If a folder is passed, it will
   * open its parent folder and preselect the passed folder.
   *
   * @param path - The path of the file to show
   */
  readonly showItemInFolder: (path: string) => void
  /**
   * Reveals the specified folder on the operating
   * system default file explorer.
   * Do not use this method with non-validated paths.
   *
   * @param path - The path of the folder to open
   */
  readonly showFolderContents: (path: string) => void
}

export const shell: IAppShell = {
  // Since Electron 13, shell.trashItem doesn't work from the renderer process
  // on Windows. Therefore, we must invoke it from the main process. See
  // https://github.com/electron/electron/issues/29598
  moveItemToTrash,
  forceDeleteDirectory,
  beep: electronShell.beep,
  openExternal: async (path, options = {}) => {
    const mode = options.mode ?? getBrowserOpenModePreference()
    return openExternal(path, {
      mode,
      intent: options.intent ?? 'default',
      reportFailure: options.reportFailure !== false,
    })
  },
  showItemInFolder,
  showFolderContents,
  openPath: electronShell.openPath,
}

/**
 * Reveals a file from a repository in the native file manager.
 *
 * Guarded per path so a repeated context-menu invocation cannot stack two
 * Explorer/Finder windows on the same file; the claim is released as soon as
 * the reveal settles.
 *
 * @param repository The currently active repository instance
 * @param path The path of the file relative to the root of the repository
 */
export function revealInFileManager(repository: Repository, path: string) {
  const fullyQualifiedFilePath = Path.join(repository.path, path)
  return revealPathInFileManager(fullyQualifiedFilePath)
}

/**
 * Reveals an absolute path in the native file manager, guarded against the
 * duplicate window a stuttered click would otherwise open.
 */
export function revealPathInFileManager(fullPath: string) {
  return externalOpenGuard.run(
    externalOpenTarget('file-manager', fullPath),
    () => shell.showItemInFolder(fullPath)
  )
}

/**
 * Opens a folder's contents in the native file manager, guarded per path so a
 * stuttered click opens exactly one window.
 */
export function openFolderInFileManager(fullPath: string) {
  return externalOpenGuard.run(
    externalOpenTarget('file-manager', fullPath),
    () => shell.showFolderContents(fullPath)
  )
}
