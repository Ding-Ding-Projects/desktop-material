import type { TranslationKey } from '../i18n-resources'

/**
 * Pure planning rules for the "ignored files to a local Cheap LFS submodule"
 * workflow.
 *
 * Nothing in this module touches the filesystem or spawns Git. It owns the
 * decisions that can be made from path text alone — Git control paths, paths
 * that escape the repository, duplicate selections, and the Windows
 * case-insensitive destination collisions — so those rules can be exercised
 * without a repository and reused by both the validator and the UI.
 *
 * This module is deliberately part of the **local** phase only. It knows
 * nothing about Cheap LFS storage providers, uploads, pointers, remotes, or
 * pushes; see `IgnoredSubmoduleDeferredPhase` for the boundary.
 */

/** The maximum number of ignored working files one operation will consider. */
export const MaximumIgnoredCandidates = 20_000

/** The maximum number of files one operation will stage into the submodule. */
export const MaximumIgnoredSelection = 5_000

/**
 * Everything this phase deliberately does not do. Creating the local
 * repository and adding the submodule never uploads a Cheap LFS object, never
 * creates a provider repository, never adds a remote, never converts a working
 * file into a pointer, and never pushes. Each of those is a separate,
 * explicitly opted-into phase which does not exist yet.
 */
export const IgnoredSubmoduleDeferredPhase = Object.freeze([
  'release-or-oci-storage-selection',
  'cheap-lfs-object-upload',
  'pointer-conversion',
  'provider-repository-creation',
  'remote-creation',
  'push',
] as const)

/** A single deferred capability name; see `IgnoredSubmoduleDeferredPhase`. */
export type IgnoredSubmoduleDeferredCapability =
  typeof IgnoredSubmoduleDeferredPhase[number]

/**
 * Why a selected working file cannot be staged into the local submodule.
 *
 * Every reason is fail-closed: the file is refused and the reason is shown.
 * There is no "probably fine" outcome.
 *
 * - `not-proven-ignored` — Git does not currently prove this exact path is
 *   ignored. Tracked files land here too, because `git check-ignore` is run
 *   without `--no-index` on purpose.
 * - `symbolic-link` — the final path component is a symbolic link, a Windows
 *   directory junction, or another link Node reports as a symbolic link.
 * - `reparse-point` — the path reaches its content through a reparse point,
 *   junction, or mount point in one of its parent directories, so the bytes do
 *   not physically live where the path says they do.
 * - `not-regular-file` — a directory, device, socket, or FIFO.
 * - `git-control-path` — the path is inside a `.git` control directory.
 * - `nested-repository` — the path is inside another Git repository checked out
 *   below the parent repository.
 * - `path-escape` — the path leaves the parent repository root.
 * - `duplicate-selection` — the same path was selected more than once.
 * - `destination-case-collision` — two selected paths would occupy the same
 *   destination on a case-insensitive filesystem, or one would have to be both
 *   a file and a directory.
 * - `inside-destination` — the file lives inside the folder the new submodule
 *   would be created at, so staging it would overlap the submodule itself.
 * - `stale-inventory` — the reviewed inventory no longer describes the file on
 *   disk (it moved, changed size, changed modification time, or vanished).
 */
export type IgnoredSubmoduleRejectionReason =
  | 'not-proven-ignored'
  | 'symbolic-link'
  | 'reparse-point'
  | 'not-regular-file'
  | 'git-control-path'
  | 'nested-repository'
  | 'path-escape'
  | 'duplicate-selection'
  | 'destination-case-collision'
  | 'inside-destination'
  | 'stale-inventory'

/** A refused file together with the exact rule that refused it. */
export interface IIgnoredSubmoduleRejection {
  /** The repository-relative path exactly as it was selected. */
  readonly path: string
  /** The rule which refused it. */
  readonly reason: IgnoredSubmoduleRejectionReason
  /** Free-form evidence — the colliding path, the stale size, and so on. */
  readonly detail: string
}

/** The localized one-line explanation for each rejection reason. */
export const IgnoredSubmoduleRejectionKey: Readonly<
  Record<IgnoredSubmoduleRejectionReason, TranslationKey>
> = {
  'not-proven-ignored': 'ignoredSubmodule.reason.notProvenIgnored',
  'symbolic-link': 'ignoredSubmodule.reason.symbolicLink',
  'reparse-point': 'ignoredSubmodule.reason.reparsePoint',
  'not-regular-file': 'ignoredSubmodule.reason.notRegularFile',
  'git-control-path': 'ignoredSubmodule.reason.gitControlPath',
  'nested-repository': 'ignoredSubmodule.reason.nestedRepository',
  'path-escape': 'ignoredSubmodule.reason.pathEscape',
  'duplicate-selection': 'ignoredSubmodule.reason.duplicateSelection',
  'destination-case-collision': 'ignoredSubmodule.reason.destinationCollision',
  'inside-destination': 'ignoredSubmodule.reason.insideDestination',
  'stale-inventory': 'ignoredSubmodule.reason.staleInventory',
}

/** Normalize a repository-relative path to Git's portable slash form. */
export function normalizeIgnoredPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
}

/**
 * Case-fold a path for Windows destination comparison.
 *
 * `toLowerCase` is used rather than `toLocaleLowerCase` so a Turkish locale
 * cannot fold `I` to a character NTFS would not consider equal.
 */
export function foldIgnoredPath(value: string): string {
  return normalizeIgnoredPath(value).toLowerCase()
}

/** Every ancestor directory of a path, outermost first, excluding the path. */
export function ignoredPathAncestors(value: string): ReadonlyArray<string> {
  const segments = normalizeIgnoredPath(value).split('/')
  const ancestors = new Array<string>()

  for (let index = 1; index < segments.length; index++) {
    ancestors.push(segments.slice(0, index).join('/'))
  }

  return ancestors
}

/** Whether `candidate` is `root` itself or lives below it, case-insensitively. */
export function isIgnoredPathWithin(root: string, candidate: string): boolean {
  const foldedRoot = foldIgnoredPath(root)
  const foldedCandidate = foldIgnoredPath(candidate)

  if (foldedRoot.length === 0) {
    return true
  }

  return (
    foldedCandidate === foldedRoot ||
    foldedCandidate.startsWith(`${foldedRoot}/`)
  )
}

/**
 * The structural rejection a path text carries on its own, or `null` when the
 * text is at least shaped like a usable repository-relative file path.
 *
 * This runs before any filesystem call so a hostile path can never be handed
 * to `lstat`, `git check-ignore`, or a copy.
 */
export function getIgnoredPathStructuralRejection(
  value: string
): IIgnoredSubmoduleRejection | null {
  const path = normalizeIgnoredPath(value)

  if (path.length === 0) {
    return {
      path: value,
      reason: 'path-escape',
      detail: 'The path is empty.',
    }
  }

  if (/[\0\r\n]/.test(path)) {
    return {
      path,
      reason: 'path-escape',
      detail: 'The path contains control characters.',
    }
  }

  // `C:/x`, `//server/share/x`, and `/x` all leave the repository root.
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    return {
      path,
      reason: 'path-escape',
      detail: 'The path is absolute rather than repository-relative.',
    }
  }

  const segments = path.split('/')

  if (segments.some(segment => segment === '..')) {
    return {
      path,
      reason: 'path-escape',
      detail: 'The path contains a parent-directory segment.',
    }
  }

  if (segments.some(segment => segment.length === 0 || segment === '.')) {
    return {
      path,
      reason: 'path-escape',
      detail: 'The path contains an empty or current-directory segment.',
    }
  }

  if (segments.some(segment => segment.toLowerCase() === '.git')) {
    return {
      path,
      reason: 'git-control-path',
      detail: 'The path is inside a Git control directory.',
    }
  }

  return null
}

/** A selection split into the paths which can coexist and those which cannot. */
export interface IDestinationSelection {
  /** The paths which keep their destination, in the order they were given. */
  readonly survivors: ReadonlyArray<string>
  /** One rejection per losing path. */
  readonly rejections: ReadonlyArray<IIgnoredSubmoduleRejection>
}

/**
 * Split a selection into the paths which can all coexist at their destinations
 * and the ones which cannot.
 *
 * Files keep their exact repository-relative path inside the new submodule, so
 * two selections collide when they fold to the same name on a case-insensitive
 * filesystem, or when one would have to exist as a directory for the other to
 * exist as a file.
 *
 * The first path in the supplied order is always the survivor, so the result is
 * deterministic and a losing duplicate never takes the winner down with it.
 */
export function resolveDestinationSelection(
  paths: ReadonlyArray<string>
): IDestinationSelection {
  const survivors = new Array<string>()
  const rejections = new Array<IIgnoredSubmoduleRejection>()
  const seenExact = new Map<string, string>()
  const seenFolded = new Map<string, string>()
  const foldedDirectories = new Map<string, string>()

  for (const raw of paths) {
    const path = normalizeIgnoredPath(raw)
    const folded = foldIgnoredPath(path)

    const exactOwner = seenExact.get(path)
    if (exactOwner !== undefined) {
      rejections.push({
        path,
        reason: 'duplicate-selection',
        detail: `'${exactOwner}' is already selected.`,
      })
      continue
    }

    const foldedOwner = seenFolded.get(folded)
    if (foldedOwner !== undefined) {
      rejections.push({
        path,
        reason: 'destination-case-collision',
        detail: `'${foldedOwner}' occupies the same destination on a case-insensitive filesystem.`,
      })
      continue
    }

    const directoryOwner = foldedDirectories.get(folded)
    if (directoryOwner !== undefined) {
      rejections.push({
        path,
        reason: 'destination-case-collision',
        detail: `'${directoryOwner}' needs '${path}' to be a directory.`,
      })
      continue
    }

    const ancestorOwner = ignoredPathAncestors(path)
      .map(ancestor => seenFolded.get(foldIgnoredPath(ancestor)))
      .find(owner => owner !== undefined)
    if (ancestorOwner !== undefined) {
      rejections.push({
        path,
        reason: 'destination-case-collision',
        detail: `'${ancestorOwner}' is a file on the way to '${path}'.`,
      })
      continue
    }

    seenExact.set(path, path)
    seenFolded.set(folded, path)
    for (const ancestor of ignoredPathAncestors(path)) {
      const foldedAncestor = foldIgnoredPath(ancestor)
      if (!foldedDirectories.has(foldedAncestor)) {
        foldedDirectories.set(foldedAncestor, path)
      }
    }
    survivors.push(path)
  }

  return { survivors, rejections }
}

/** The rejections of `resolveDestinationSelection`, without the survivors. */
export function getDestinationCollisions(
  paths: ReadonlyArray<string>
): ReadonlyArray<IIgnoredSubmoduleRejection> {
  return resolveDestinationSelection(paths).rejections
}

/**
 * Why the folder the new submodule would occupy cannot be used.
 *
 * The first six are decided from the path text alone. `unsafe-link`,
 * `occupied`, and `ignored` need the filesystem or Git and are only ever
 * produced by the Git-backed validator.
 */
export type IgnoredSubmoduleDestinationError =
  | 'empty'
  | 'absolute'
  | 'segments'
  | 'git-control-path'
  | 'existing-submodule'
  | 'repository-root'
  | 'unsafe-link'
  | 'occupied'
  | 'ignored'

/** The localized explanation for each destination error. */
export const IgnoredSubmoduleDestinationKey: Readonly<
  Record<IgnoredSubmoduleDestinationError, TranslationKey>
> = {
  empty: 'ignoredSubmodule.destination.empty',
  absolute: 'ignoredSubmodule.destination.absolute',
  segments: 'ignoredSubmodule.destination.segments',
  'git-control-path': 'ignoredSubmodule.destination.gitControlPath',
  'existing-submodule': 'ignoredSubmodule.destination.existingSubmodule',
  'repository-root': 'ignoredSubmodule.destination.repositoryRoot',
  'unsafe-link': 'ignoredSubmodule.destination.unsafeLink',
  occupied: 'ignoredSubmodule.destination.occupied',
  ignored: 'ignoredSubmodule.destination.ignored',
}

/**
 * Validate the repository-relative folder the new local submodule will occupy,
 * against the paths existing submodules already own.
 *
 * A destination is refused when it is not a relative path inside the
 * repository, when it touches Git's control directories, when it is the
 * repository root itself, or when it overlaps an existing submodule in either
 * direction — a new submodule may neither sit inside an existing one nor
 * swallow one.
 */
export function getIgnoredSubmoduleDestinationError(
  value: string,
  existingSubmodulePaths: ReadonlyArray<string> = []
): IgnoredSubmoduleDestinationError | null {
  const path = normalizeIgnoredPath(value)

  if (path.length === 0) {
    return 'empty'
  }

  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    return 'absolute'
  }

  if (/[\0\r\n]/.test(path)) {
    return 'segments'
  }

  if (path === '.') {
    return 'repository-root'
  }

  const segments = path.split('/')
  if (
    segments.some(
      segment => segment.length === 0 || segment === '.' || segment === '..'
    )
  ) {
    return 'segments'
  }

  if (segments.some(segment => segment.toLowerCase() === '.git')) {
    return 'git-control-path'
  }

  for (const existing of existingSubmodulePaths) {
    if (
      isIgnoredPathWithin(existing, path) ||
      isIgnoredPathWithin(path, existing)
    ) {
      return 'existing-submodule'
    }
  }

  return null
}
