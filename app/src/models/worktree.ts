import { shortenSHA } from './commit'
import * as Path from 'path'

export type WorktreeType = 'main' | 'linked'

export type WorktreeMaintenanceOperation = 'prune' | 'repair'

export interface IWorktreeMaintenancePreview {
  readonly operation: WorktreeMaintenanceOperation
  readonly affectedCount: number
}

export type WorktreeEntry = {
  readonly path: string
  readonly head: string
  /** Full ref name (e.g. `refs/heads/main`), or `null` when HEAD is detached */
  readonly branch: string | null
  readonly isDetached: boolean
  readonly type: WorktreeType
  readonly isLocked: boolean
  readonly isPrunable: boolean
  /** Filesystem creation time for the worktree, when the platform reports it. */
  readonly createdAt?: number
  /** Number of uncommitted entries, or null when the worktree cannot be read. */
  readonly dirtyFileCount?: number | null
}

/** Compare absolute worktree paths across separator and case differences. */
export function worktreePathsEqual(first: string, second: string): boolean {
  const normalize = (path: string) =>
    Path.resolve(path.replace(/\\/g, '/')).replace(/\/+$/, '')
  const a = normalize(first)
  const b = normalize(second)
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b
}

/** Return a worktree's final path segment without assuming one separator. */
export function getWorktreeDisplayName(worktree: WorktreeEntry): string {
  const trimmed = worktree.path.replace(/[\\/]+$/, '')
  if (trimmed.length === 0) {
    return worktree.path
  }

  const separator = Math.max(
    trimmed.lastIndexOf('/'),
    trimmed.lastIndexOf('\\')
  )
  return separator >= 0 ? trimmed.substring(separator + 1) : trimmed
}

/** Return the branch name or a shortened detached HEAD identifier. */
export function getWorktreeDescription(worktree: WorktreeEntry): string {
  return worktree.branch
    ? worktree.branch.replace(/^refs\/heads\//, '')
    : shortenSHA(worktree.head)
}

/** Include observed status in the accessible worktree label when available. */
export function getWorktreeAriaLabel(worktree: WorktreeEntry): string {
  const states = [
    worktree.dirtyFileCount === null ? 'status unavailable' : null,
    worktree.dirtyFileCount !== undefined &&
    worktree.dirtyFileCount !== null &&
    worktree.dirtyFileCount > 0
      ? `${worktree.dirtyFileCount} uncommitted`
      : null,
    worktree.isLocked ? 'locked' : null,
    worktree.isPrunable ? 'missing' : null,
  ].filter((state): state is string => state !== null)

  return [
    getWorktreeDisplayName(worktree),
    getWorktreeDescription(worktree),
    ...states,
  ].join(', ')
}
