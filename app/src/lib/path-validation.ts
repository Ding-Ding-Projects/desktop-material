import { readdir } from 'fs/promises'
import { homedir } from 'os'
import * as Path from 'path'

/** Clone destination already has contents but may be an addable repository. */
export class NonEmptyCloneFolderError extends Error {}

const sensitiveCloneLocations = (): ReadonlyArray<string> => {
  const home = Path.resolve(homedir())
  const locations = [
    Path.join(home, '.ssh'),
    Path.join(home, '.gnupg'),
    Path.join(home, '.config'),
    Path.join(home, '.gitconfig'),
    Path.join(home, '.aws'),
    Path.join(home, '.azure'),
    Path.join(home, '.docker'),
    Path.join(home, '.kube'),
    Path.join(home, '.npmrc'),
    Path.join(home, '.netrc'),
    Path.join(home, '.pypirc'),
    Path.join(home, '.git-credentials'),
    Path.join(home, 'AppData', 'Roaming'),
  ]

  const xdgConfigHome = process.env.XDG_CONFIG_HOME
  if (xdgConfigHome !== undefined && xdgConfigHome.length > 0) {
    locations.push(Path.resolve(xdgConfigHome))
  }

  const appData = process.env.APPDATA
  if (appData !== undefined && appData.length > 0) {
    locations.push(Path.resolve(appData))
  }

  const localAppData = process.env.LOCALAPPDATA
  if (localAppData !== undefined && localAppData.length > 0) {
    const local = Path.resolve(localAppData)
    locations.push(
      Path.join(local, 'Credentials'),
      Path.join(local, 'TokenCache'),
      Path.join(local, 'IdentityCache'),
      Path.join(local, 'Microsoft', 'Credentials'),
      Path.join(local, 'Microsoft', 'Vault'),
      Path.join(local, 'Microsoft', 'Protect')
    )
  }

  if (process.platform === 'win32') {
    for (const value of [
      process.env.SystemRoot,
      process.env.WINDIR,
      process.env.ProgramData,
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
    ]) {
      if (value !== undefined && value.length > 0) {
        locations.push(Path.resolve(value))
      }
    }
  }

  return locations
}

function isWithinOrEqual(parent: string, child: string): boolean {
  const relative = Path.relative(parent, child)
  return (
    relative.length === 0 ||
    (relative !== '..' &&
      !relative.startsWith(`..${Path.sep}`) &&
      !Path.isAbsolute(relative))
  )
}

/**
 * Reject clone destinations that would place repository data in a home or
 * credential-sensitive location. This is shared by direct and batch clone
 * callers, and remains a final backstop at the Git boundary.
 */
export function isClonePathSensitive(unresolvedClonePath: string): boolean {
  const normalize = (path: string): string => {
    const normalized = Path.normalize(path)
    return process.platform === 'win32'
      ? normalized.toLocaleLowerCase('en-US')
      : normalized
  }
  const clonePath = normalize(Path.resolve(unresolvedClonePath))
  const home = normalize(Path.resolve(homedir()))
  if (
    clonePath === home ||
    clonePath === normalize(Path.parse(clonePath).root)
  ) {
    return true
  }

  const localAppData = process.env.LOCALAPPDATA
  if (localAppData !== undefined && localAppData.length > 0) {
    const localRoot = normalize(Path.resolve(localAppData))
    const localTemp = normalize(Path.join(localRoot, 'Temp'))
    if (
      isWithinOrEqual(localRoot, clonePath) &&
      !isWithinOrEqual(localTemp, clonePath)
    ) {
      return true
    }
  }

  return sensitiveCloneLocations().some(location =>
    isWithinOrEqual(normalize(location), clonePath)
  )
}

/**
 * Validate that a path is a suitable clone destination: it must either not exist
 * yet or be an empty directory. Returns `null` when the path is usable, or an
 * `Error` describing why it isn't.
 *
 * Extracted from the clone dialog so both single and batch clone flows share one
 * implementation.
 */
export async function validateEmptyFolder(
  path: string | null
): Promise<Error | null> {
  if (path === null) {
    return new Error(
      'Unable to read path on disk. Please check the path and try again.'
    )
  }

  try {
    const directoryFiles = await readdir(path)

    if (directoryFiles.length === 0) {
      return null
    }

    return new NonEmptyCloneFolderError(
      'This folder contains files. Git can only clone to empty folders.'
    )
  } catch (error) {
    if (error.code === 'ENOTDIR') {
      // path refers to a file or other file system entry
      return new Error(
        'There is already a file with this name. Git can only clone to a folder.'
      )
    }

    if (error.code === 'ENOENT') {
      // Folder does not exist
      return null
    }

    log.error(
      'validateEmptyFolder: Path validation failed. Error: ' + error.message
    )
    return new Error(
      'Unable to read path on disk. Please check the path and try again.'
    )
  }
}
