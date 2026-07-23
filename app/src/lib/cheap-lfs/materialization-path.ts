import { lstat, realpath } from 'fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'path'

export class CheapLfsMaterializationPathError extends Error {
  public override readonly name = 'CheapLfsMaterializationPathError'
}

function isOutside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate)
  return (
    isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)
  )
}

function isSamePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

/**
 * Resolve one existing tracked pointer beneath a canonical repository root.
 * Every requested parent component must be a real directory rather than a
 * symlink/junction, and the final entry must be one unlinked regular file.
 */
export async function requireSafeCheapLfsMaterializationPath(
  repositoryPath: string,
  relativePath: string
): Promise<string> {
  const requestedRoot = resolve(repositoryPath)
  const requestedDestination = resolve(requestedRoot, relativePath)
  if (
    requestedDestination === requestedRoot ||
    isOutside(requestedRoot, requestedDestination)
  ) {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS refused a materialization path outside the repository.'
    )
  }

  let canonicalRoot: string
  try {
    canonicalRoot = await realpath(requestedRoot)
    const rootMetadata = await lstat(canonicalRoot)
    if (!rootMetadata.isDirectory()) {
      throw new Error('not a directory')
    }
  } catch {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS could not verify the repository directory before materialization.'
    )
  }

  const requestedParent = dirname(requestedDestination)
  const relativeParent = relative(requestedRoot, requestedParent)
  if (isAbsolute(relativeParent) || isOutside(requestedRoot, requestedParent)) {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS refused a materialization directory outside the repository.'
    )
  }

  let currentParent = requestedRoot
  if (relativeParent.length > 0) {
    for (const component of relativeParent.split(sep)) {
      currentParent = join(currentParent, component)
      let metadata
      try {
        metadata = await lstat(currentParent)
      } catch {
        throw new CheapLfsMaterializationPathError(
          'Cheap LFS could not verify the materialization directory.'
        )
      }
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new CheapLfsMaterializationPathError(
          'Cheap LFS refused a symlink or junction in the materialization path.'
        )
      }
    }
  }

  let canonicalParent: string
  try {
    canonicalParent = await realpath(requestedParent)
  } catch {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS could not verify the materialization directory.'
    )
  }
  if (isOutside(canonicalRoot, canonicalParent)) {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS refused a materialization directory outside the repository.'
    )
  }
  const expectedCanonicalParent = resolve(canonicalRoot, relativeParent)
  if (!isSamePath(canonicalParent, expectedCanonicalParent)) {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS refused a redirected materialization directory.'
    )
  }

  let destinationMetadata
  try {
    destinationMetadata = await lstat(requestedDestination)
  } catch {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS requires an existing tracked pointer to materialize.'
    )
  }
  if (
    destinationMetadata.isSymbolicLink() ||
    !destinationMetadata.isFile() ||
    destinationMetadata.nlink !== 1
  ) {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS refused a symlink, junction, or linked file as a materialization target.'
    )
  }

  const expectedCanonicalDestination = join(
    canonicalParent,
    basename(requestedDestination)
  )
  let canonicalDestination: string
  try {
    canonicalDestination = await realpath(requestedDestination)
  } catch {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS could not verify the tracked materialization target.'
    )
  }
  if (
    isOutside(canonicalRoot, canonicalDestination) ||
    !isSamePath(canonicalDestination, expectedCanonicalDestination)
  ) {
    throw new CheapLfsMaterializationPathError(
      'Cheap LFS refused a redirected materialization target.'
    )
  }

  return canonicalDestination
}
