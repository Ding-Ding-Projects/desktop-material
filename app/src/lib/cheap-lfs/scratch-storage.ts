import { randomBytes } from 'crypto'
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { isAbsolute, join, resolve } from 'path'
import {
  CheapLfsOwnedArtifactExcludePatterns,
  isRegisteredCheapLfsOwnedArtifact,
  registerCheapLfsOwnedArtifact,
} from './owned-artifacts'

/**
 * Where Cheap LFS parks the bytes it is in the middle of moving.
 *
 * Materialize downloads, decompresses, and reassembles multi-gigabyte payloads
 * before it can atomically rename one over the tracked path. Historically every
 * one of those temps was written *beside the destination inside the working
 * tree*, which made the app's own scratch indistinguishable from a large new
 * user file: `git add -A` hashed it, the changes list offered it, and automatic
 * pinning uploaded it to the user's release mid-download (issue #65).
 *
 * The payload temps now live under `<git-dir>/desktop-material/cheap-lfs-scratch/`
 * instead. That directory is created and owned outright by this code, so:
 *
 *  - Git never sees it: everything under `.git` is outside the working tree, so
 *    no status, scan, stage, or commit can reach it.
 *  - The atomic rename still works: the staging root is only used after this
 *    module proves it shares a device with the repository root, so the
 *    `rename()` that publishes a verified payload stays atomic exactly as
 *    before. On a split device (a linked worktree whose git dir lives on another
 *    volume) the caller keeps the old in-tree sibling, which is now excluded
 *    from every scan instead.
 *  - Crash cleanup is provable rather than guessed: each run gets its own
 *    session directory, so a later run can delete every *other* session's tree
 *    without ever having to decide whether some path in the user's repository
 *    "looks like" app scratch.
 */

/** One run's private subdirectory; nothing else may delete this one. */
const sessionDirectoryName = `session-${process.pid}-${randomBytes(4).toString(
  'hex'
)}`

const ScratchRootSegments = ['desktop-material', 'cheap-lfs-scratch'] as const

const ManagedExcludeBegin =
  '# BEGIN desktop-material Cheap LFS scratch (managed)'
const ManagedExcludeEnd = '# END desktop-material Cheap LFS scratch (managed)'

/** Resolved Git metadata locations for a working tree. */
export interface ICheapLfsGitDirectories {
  /** This working tree's own git directory. */
  readonly gitDir: string
  /** The shared directory holding `info/exclude` (differs for worktrees). */
  readonly commonDir: string
}

/**
 * Resolve `.git` for a working tree without spawning Git: a plain directory for
 * an ordinary clone, or the `gitdir:` redirect a linked worktree or submodule
 * writes into a `.git` file. `null` when the path is not a working tree at all.
 */
export async function resolveCheapLfsGitDirectories(
  repositoryPath: string
): Promise<ICheapLfsGitDirectories | null> {
  if (typeof repositoryPath !== 'string' || repositoryPath.length === 0) {
    return null
  }
  const root = resolve(repositoryPath)
  const dotGit = join(root, '.git')
  let gitDir: string
  try {
    const entry = await lstat(dotGit)
    if (entry.isDirectory()) {
      gitDir = dotGit
    } else if (entry.isFile()) {
      const text = await readFile(dotGit, 'utf8')
      const match = /^gitdir:\s*(.+?)\s*$/m.exec(text)
      if (match === null) {
        return null
      }
      gitDir = isAbsolute(match[1])
        ? resolve(match[1])
        : resolve(root, match[1])
    } else {
      return null
    }
  } catch {
    return null
  }

  let commonDir = gitDir
  try {
    const text = await readFile(join(gitDir, 'commondir'), 'utf8')
    const relative = text.trim()
    if (relative.length > 0) {
      commonDir = isAbsolute(relative)
        ? resolve(relative)
        : resolve(gitDir, relative)
    }
  } catch {
    // No `commondir` file means this git directory is already the common one.
  }
  return { gitDir, commonDir }
}

interface IScratchSession {
  readonly root: string
  readonly session: string
}

const sessionByRepository = new Map<string, Promise<IScratchSession | null>>()

function repositoryKey(repositoryPath: string): string {
  const resolved = resolve(repositoryPath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * Create (once per repository) this run's private scratch directory, but only
 * when it shares a device with the repository root — a cross-device staging
 * area would silently turn the publishing `rename()` into a non-atomic copy,
 * and no cleanup convenience is worth weakening that.
 */
async function openScratchSession(
  repositoryPath: string
): Promise<IScratchSession | null> {
  const directories = await resolveCheapLfsGitDirectories(repositoryPath)
  if (directories === null) {
    return null
  }
  const root = join(directories.gitDir, ...ScratchRootSegments)
  try {
    await mkdir(root, { recursive: true, mode: 0o700 })
    const [repositoryEntry, rootEntry] = await Promise.all([
      lstat(resolve(repositoryPath)),
      lstat(root),
    ])
    if (!rootEntry.isDirectory() || repositoryEntry.dev !== rootEntry.dev) {
      return null
    }
    const session = join(root, sessionDirectoryName)
    await mkdir(session, { recursive: true, mode: 0o700 })
    return { root, session }
  } catch {
    return null
  }
}

function scratchSession(
  repositoryPath: string
): Promise<IScratchSession | null> {
  const key = repositoryKey(repositoryPath)
  let pending = sessionByRepository.get(key)
  if (pending === undefined) {
    pending = openScratchSession(repositoryPath)
    sessionByRepository.set(key, pending)
  }
  return pending
}

/** Forget every cached session. Only meaningful between tests. */
export function resetCheapLfsScratchSessions(): void {
  sessionByRepository.clear()
}

/**
 * Allocate a private path for a payload-sized temp, or `null` when this
 * repository has no usable same-device private area. A `null` tells the caller
 * to keep its in-tree sibling: atomicity is never traded away for tidiness.
 */
export async function allocateCheapLfsPayloadTemporaryPath(
  repositoryPath: string
): Promise<string | null> {
  const session = await scratchSession(repositoryPath)
  if (session === null) {
    return null
  }
  return registerCheapLfsOwnedArtifact(
    join(session.session, `.cheeplfs-${randomBytes(8).toString('hex')}.tmp`)
  )
}

/** What one hygiene pass actually did, for logging and for tests. */
export interface ICheapLfsScratchHygieneResult {
  /** Session directories left behind by earlier runs that were deleted. */
  readonly removedSessions: ReadonlyArray<string>
  /** True when the managed `info/exclude` block was written or refreshed. */
  readonly excludeUpdated: boolean
}

function withoutManagedBlock(text: string): string {
  const start = text.indexOf(ManagedExcludeBegin)
  if (start < 0) {
    return text
  }
  const end = text.indexOf(ManagedExcludeEnd, start)
  if (end < 0) {
    return text.slice(0, start)
  }
  return text.slice(0, start) + text.slice(end + ManagedExcludeEnd.length + 1)
}

function managedBlock(): string {
  return [
    ManagedExcludeBegin,
    '# Private Cheap LFS scratch. Local-only; never committed. Already-tracked',
    '# paths are unaffected, and `git add -f` still works.',
    ...CheapLfsOwnedArtifactExcludePatterns,
    ManagedExcludeEnd,
    '',
  ].join('\n')
}

async function refreshManagedExclude(commonDir: string): Promise<boolean> {
  const excludePath = join(commonDir, 'info', 'exclude')
  let existing = ''
  try {
    existing = await readFile(excludePath, 'utf8')
  } catch {
    existing = ''
  }
  const preserved = withoutManagedBlock(existing)
  const separator =
    preserved.length === 0 || preserved.endsWith('\n') ? '' : '\n'
  const next = `${preserved}${separator}${managedBlock()}`
  if (next === existing) {
    return false
  }
  await mkdir(join(commonDir, 'info'), { recursive: true })
  await writeFile(excludePath, next, 'utf8')
  return true
}

/**
 * Run once per repository open/registration/clone: refresh the managed
 * `info/exclude` block so no orphaned artifact can ever be staged, and delete
 * every scratch session other runs left behind.
 *
 * Only directories inside the scratch root this code created are removed. A
 * path in the user's own tree is never deleted here, however much its name
 * resembles an artifact — the safe failure direction is to leave bytes alone.
 *
 * Never throws: hygiene is best-effort maintenance, not a gate on opening a
 * repository.
 */
export async function ensureCheapLfsScratchHygiene(
  repositoryPath: string
): Promise<ICheapLfsScratchHygieneResult> {
  const removedSessions = new Array<string>()
  let excludeUpdated = false
  const directories = await resolveCheapLfsGitDirectories(repositoryPath)
  if (directories === null) {
    return { removedSessions, excludeUpdated }
  }
  try {
    excludeUpdated = await refreshManagedExclude(directories.commonDir)
  } catch {
    // A read-only or unwritable git directory just means the exclusions stay
    // as they are; every in-process scan still refuses these artifacts.
  }

  const root = join(directories.gitDir, ...ScratchRootSegments)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return { removedSessions, excludeUpdated }
  }
  for (const entry of entries) {
    if (
      entry.name === sessionDirectoryName ||
      // Nothing this run still owns is ever swept, whatever it is called.
      isRegisteredCheapLfsOwnedArtifact(join(root, entry.name))
    ) {
      continue
    }
    try {
      await rm(join(root, entry.name), { recursive: true, force: true })
      removedSessions.push(entry.name)
    } catch {
      // A leftover that cannot be removed (locked by a still-running instance)
      // is harmless: it is inside `.git`, so nothing can commit or pin it.
    }
  }
  return { removedSessions, excludeUpdated }
}
