import * as Path from 'path'
import * as Fs from 'fs/promises'

import type { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import type { WorktreeEntry } from '../../models/worktree'
import { git } from './core'
import { addWorktree, listWorktrees } from './worktree'

/**
 * The directory, relative to the repository, that holds one linked worktree
 * per branch.
 *
 * Checking every branch out as a sibling of the repository would fill the
 * user's `GitHub` folder with one top level directory per branch, so the whole
 * set lives in a single container inside the repository instead.
 */
export const BranchWorktreeContainerName = '.worktrees'

/** Characters Git allows in a ref but Windows does not allow in a path. */
const InvalidPathCharacters = /[<>:"\\|?*\u0000-\u001f]/g

/** Device names Windows refuses to use as a path component. */
const ReservedWindowsNames =
  /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i

/** The absolute path of the container holding a repository's branch worktrees. */
export function getBranchWorktreeContainerPath(repositoryPath: string): string {
  return Path.join(repositoryPath, BranchWorktreeContainerName)
}

/**
 * The directory name a branch is checked out into, relative to the container.
 *
 * A branch name is a path already (`feature/thing`), so it keeps its shape on
 * disk; only the characters a file system cannot represent are replaced. Git
 * forbids a branch named both `feature` and `feature/thing` in one repository,
 * so nesting cannot collide with a branch of its own.
 */
export function worktreeDirectoryNameForBranch(branchName: string): string {
  const segments = branchName
    .split(/[/\\]/)
    .map(segment => sanitizePathSegment(segment))
    .filter(segment => segment.length > 0)

  return segments.length === 0 ? 'branch' : segments.join(Path.sep)
}

function sanitizePathSegment(segment: string): string {
  const sanitized = segment
    .replace(InvalidPathCharacters, '-')
    // A trailing dot or space is legal in a ref but unusable on Windows.
    .replace(/[. ]+$/, '')

  return ReservedWindowsNames.test(sanitized) ? `${sanitized}-` : sanitized
}

/** The absolute path the given branch would be checked out into. */
export function getBranchWorktreePath(
  repositoryPath: string,
  branchName: string
): string {
  return Path.join(
    getBranchWorktreeContainerPath(repositoryPath),
    worktreeDirectoryNameForBranch(branchName)
  )
}

/** Why a branch cannot be given a worktree of its own. */
export type BranchWorktreeSkipReason =
  /** The branch is already checked out somewhere (including the main worktree) */
  | 'already-checked-out'
  /** A remote branch whose local branch is covered by another candidate */
  | 'shadowed-by-local'

/** One branch that can be checked out into a worktree of its own. */
export interface IBranchWorktreeCandidate {
  /** The local branch name the worktree will have checked out. */
  readonly branchName: string

  /** The absolute path of the worktree. */
  readonly path: string

  /** The ref the worktree is created from (a remote ref when tracking). */
  readonly commitish?: string

  /** Set when the local branch does not exist yet and must be created. */
  readonly createBranch?: string

  /** The upstream this candidate came from, for display. */
  readonly remoteName?: string

  /** The tip of the branch, for display. */
  readonly sha: string
}

/** A branch that is deliberately left out of the checkout. */
export interface ISkippedBranchWorktree {
  readonly branchName: string
  readonly reason: BranchWorktreeSkipReason
  /** Where the branch is already checked out, when that is the reason. */
  readonly existingPath?: string
}

/** The branches that can, and cannot, be checked out as worktrees. */
export interface IBranchWorktreePlan {
  readonly candidates: ReadonlyArray<IBranchWorktreeCandidate>
  readonly skipped: ReadonlyArray<ISkippedBranchWorktree>
}

function shortBranchName(ref: string): string {
  return ref.replace(/^refs\/heads\//, '')
}

/**
 * Work out which of the repository's branches can be checked out into a
 * worktree of their own, and which are already checked out elsewhere.
 *
 * Remote branches are included so that a fresh clone - which has exactly one
 * local branch - still produces a worktree per branch, but a remote branch
 * whose local counterpart exists is dropped in favour of the local one so the
 * same branch is never listed twice.
 */
export function planBranchWorktrees(
  repositoryPath: string,
  branches: ReadonlyArray<Branch>,
  existingWorktrees: ReadonlyArray<WorktreeEntry>
): IBranchWorktreePlan {
  const checkedOutPaths = new Map<string, string>()
  for (const worktree of existingWorktrees) {
    if (worktree.branch !== null && !worktree.isPrunable) {
      checkedOutPaths.set(shortBranchName(worktree.branch), worktree.path)
    }
  }

  const localNames = new Set(
    branches.filter(b => b.type === BranchType.Local).map(b => b.name)
  )

  const candidates = new Array<IBranchWorktreeCandidate>()
  const skipped = new Array<ISkippedBranchWorktree>()
  const seen = new Set<string>()

  for (const branch of branches) {
    const isRemote = branch.type === BranchType.Remote
    const branchName = isRemote ? branch.nameWithoutRemote : branch.name

    if (branchName.length === 0) {
      continue
    }

    if (isRemote && localNames.has(branchName)) {
      skipped.push({ branchName, reason: 'shadowed-by-local' })
      continue
    }

    if (seen.has(branchName)) {
      continue
    }
    seen.add(branchName)

    const existingPath = checkedOutPaths.get(branchName)
    if (existingPath !== undefined) {
      skipped.push({
        branchName,
        reason: 'already-checked-out',
        existingPath,
      })
      continue
    }

    candidates.push({
      branchName,
      path: getBranchWorktreePath(repositoryPath, branchName),
      sha: branch.tip.sha,
      ...(isRemote
        ? {
            createBranch: branchName,
            commitish: branch.ref,
            remoteName: branch.remoteName ?? undefined,
          }
        : { commitish: branch.name }),
    })
  }

  return { candidates, skipped }
}

/** The outcome of checking one branch out into a worktree. */
export interface IBranchWorktreeResult {
  readonly branchName: string
  readonly path: string
  readonly error?: Error
}

/** Progress reported while the worktrees are being created, one branch at a time. */
export interface IBranchWorktreeProgress {
  readonly branchName: string
  /** The number of branches processed so far, including this one. */
  readonly value: number
  readonly total: number
}

/**
 * Keep the worktree container out of the repository's own status.
 *
 * The container sits inside the working tree, so without this every checked
 * out branch would show up as an untracked directory in Changes. `info/exclude`
 * is used rather than `.gitignore` because it is local to the clone and never
 * shows up as a change of its own.
 */
export async function excludeBranchWorktreeContainer(
  repository: Repository
): Promise<void> {
  const result = await git(
    ['rev-parse', '--git-common-dir'],
    repository.path,
    'getGitCommonDir'
  )

  const gitDir = result.stdout.trim()
  if (gitDir.length === 0) {
    return
  }

  const excludePath = Path.join(
    Path.isAbsolute(gitDir) ? gitDir : Path.join(repository.path, gitDir),
    'info',
    'exclude'
  )
  const entry = `/${BranchWorktreeContainerName}/`

  let existing = ''
  try {
    existing = await Fs.readFile(excludePath, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e
    }
  }

  if (existing.split(/\r?\n/).some(line => line.trim() === entry)) {
    return
  }

  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  await Fs.mkdir(Path.dirname(excludePath), { recursive: true })
  await Fs.appendFile(
    excludePath,
    `${separator}# Desktop: branch worktrees\n${entry}\n`,
    'utf8'
  )
}

/**
 * Check every given branch out into its own linked worktree under the
 * repository's worktree container.
 *
 * One failing branch never stops the rest; each outcome is reported so the
 * caller can tell the user exactly which branches did not make it.
 */
export async function checkoutBranchesAsWorktrees(
  repository: Repository,
  candidates: ReadonlyArray<IBranchWorktreeCandidate>,
  onProgress?: (progress: IBranchWorktreeProgress) => void
): Promise<ReadonlyArray<IBranchWorktreeResult>> {
  if (candidates.length === 0) {
    return []
  }

  await excludeBranchWorktreeContainer(repository)

  const results = new Array<IBranchWorktreeResult>()
  let value = 0

  for (const candidate of candidates) {
    value++
    onProgress?.({
      branchName: candidate.branchName,
      value,
      total: candidates.length,
    })

    try {
      await addWorktree(repository, candidate.path, {
        ...(candidate.createBranch === undefined
          ? {}
          : { createBranch: candidate.createBranch }),
        ...(candidate.commitish === undefined
          ? {}
          : { commitish: candidate.commitish }),
      })
      results.push({ branchName: candidate.branchName, path: candidate.path })
    } catch (e) {
      results.push({
        branchName: candidate.branchName,
        path: candidate.path,
        error: e instanceof Error ? e : new Error(String(e)),
      })
    }
  }

  return results
}

/** List the worktrees of a repository, tolerating a repository Git cannot read. */
export async function safelyListWorktrees(
  repository: Repository
): Promise<ReadonlyArray<WorktreeEntry>> {
  try {
    return await listWorktrees(repository)
  } catch {
    return []
  }
}
