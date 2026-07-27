import { resolve } from 'path'

/**
 * The single place that recognises a file or directory Cheap LFS itself put on
 * disk — its atomic-rename staging temps, its private recovery directories, and
 * the manual-upload verification downloads.
 *
 * These artifacts are Cheap LFS's own scratch, never user content. Every scan
 * that could pin, upload, commit, or otherwise act on a working-tree path has to
 * exclude them: a materialize in flight parks multi-gigabyte payload bytes in
 * one of these names, and treating that as "a new large file the user wants
 * pinned" uploads the app's own scratch to the user's release (issue #65).
 *
 * ## Which way this fails
 *
 * Recognition is deliberately **shape-based and fail-closed for actions**: any
 * path whose shape matches is never pinned, uploaded, or committed, whether or
 * not this process created it. Skipping such a path never destroys anything —
 * the bytes stay exactly where they are, untouched — while acting on one
 * uploads private scratch to a public release and replaces it with a pointer.
 *
 * Recognition is deliberately **provenance-based for deletion**: nothing is
 * removed because it merely looks like an artifact. Payload scratch now lives in
 * a directory Cheap LFS creates and owns outright (see `scratch-storage.ts`), so
 * a crash sweep can clear that tree without ever guessing about a user's file,
 * and the small in-tree temps are removed only through the registry below or the
 * failure paths that created them.
 *
 * A user file that genuinely carries one of these names is therefore never
 * deleted and never silently loses data: if it is tracked by Git it keeps its
 * full status, diff, and commit behaviour (the exclusions below only ever apply
 * to untracked paths), and if it is untracked it stays on disk exactly as
 * written — it is only kept out of automatic pinning, which is a no-op on the
 * file itself.
 */

/** `.cheeplfs-<16 hex>.tmp`: an atomic-rename staging temp. */
const OwnedTemporaryFileName = /^\.cheeplfs-[0-9a-f]{16}\.tmp$/

/** `.verify-<16 hex>.tmp`: a manual-upload verification download. */
const OwnedVerificationFileName = /^\.verify-[0-9a-f]{16}\.tmp$/

/**
 * `.<basename>.cheap-lfs-recovery-<pid>-<uuid>`: the private staging and
 * rollback directory `CheapLfsTrackedPathStore.stageReplacement` creates beside
 * a destination it is about to replace.
 */
const OwnedRecoveryDirectoryName =
  /^\..+\.cheap-lfs-recovery-\d{1,10}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What a recognised artifact is, for callers that report or log the reason. */
export type CheapLfsOwnedArtifactKind =
  | 'temporary-file'
  | 'recovery-directory'
  | 'verification-file'

/** Classify one path segment (a bare file or directory name). */
export function cheapLfsOwnedArtifactKind(
  name: string
): CheapLfsOwnedArtifactKind | null {
  if (typeof name !== 'string' || name.length === 0) {
    return null
  }
  if (OwnedTemporaryFileName.test(name)) {
    return 'temporary-file'
  }
  if (OwnedVerificationFileName.test(name)) {
    return 'verification-file'
  }
  if (OwnedRecoveryDirectoryName.test(name)) {
    return 'recovery-directory'
  }
  return null
}

/** True when a bare file or directory name is a Cheap LFS owned artifact. */
export function isCheapLfsOwnedArtifactName(name: string): boolean {
  return cheapLfsOwnedArtifactKind(name) !== null
}

/**
 * True when any segment of `path` is a Cheap LFS owned artifact.
 *
 * Segment-wise matching is what keeps the *contents* of a recovery directory
 * (`.big.bin.cheap-lfs-recovery-1-<uuid>/original`, which holds the user's
 * quarantined original bytes) out of every scan, not just the directory entry.
 * Both separators are accepted so Git's forward-slash paths and Win32 absolute
 * paths classify identically.
 */
export function isCheapLfsOwnedArtifactPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) {
    return false
  }
  for (const segment of path.split(/[\\/]/)) {
    if (isCheapLfsOwnedArtifactName(segment)) {
      return true
    }
  }
  return false
}

/**
 * `.gitignore`-syntax patterns for the artifacts above, written into a
 * repository's private `.git/info/exclude` so a crash-orphaned artifact can
 * never be picked up by `git add -A`, by the app's own staging, or by the user's
 * tooling. `info/exclude` is local-only and never committed, and Git ignores
 * exclude rules for paths that are already tracked, so a user file that was
 * deliberately committed under one of these names keeps working unchanged.
 */
export const CheapLfsOwnedArtifactExcludePatterns: ReadonlyArray<string> = [
  '.cheeplfs-*.tmp',
  '.verify-*.tmp',
  '.*.cheap-lfs-recovery-*/',
]

/**
 * Absolute paths this process is currently using as scratch. Registration is
 * how "Cheap LFS created this" is *proven* rather than inferred from a name, so
 * a sweep can leave an in-flight download alone and a user path can never be
 * mistaken for one.
 */
const liveOwnedArtifacts = new Set<string>()

function artifactKey(absolutePath: string): string {
  return process.platform === 'win32'
    ? resolve(absolutePath).toLowerCase()
    : resolve(absolutePath)
}

/** Record that this process owns `absolutePath` as scratch. */
export function registerCheapLfsOwnedArtifact(absolutePath: string): string {
  if (typeof absolutePath === 'string' && absolutePath.length > 0) {
    liveOwnedArtifacts.add(artifactKey(absolutePath))
  }
  return absolutePath
}

/** Drop a scratch path this process no longer owns (removed or consumed). */
export function forgetCheapLfsOwnedArtifact(absolutePath: string): void {
  if (typeof absolutePath === 'string' && absolutePath.length > 0) {
    liveOwnedArtifacts.delete(artifactKey(absolutePath))
  }
}

/** True only for a scratch path this process registered and still owns. */
export function isRegisteredCheapLfsOwnedArtifact(
  absolutePath: string
): boolean {
  return (
    typeof absolutePath === 'string' &&
    absolutePath.length > 0 &&
    liveOwnedArtifacts.has(artifactKey(absolutePath))
  )
}
