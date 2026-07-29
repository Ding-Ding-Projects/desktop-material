import { Branch, BranchType } from '../../models/branch'
import { WorktreeEntry } from '../../models/worktree'

/**
 * Git reports worktree paths with platform-native separators, but persisted
 * repository paths can retain the spelling used when they were first added.
 * Desktop Material is Windows-only, so compare these paths case-insensitively
 * and ignore separator/trailing-slash differences.
 */
function normalizeWorktreePath(path: string): string {
  return path
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/**
 * Find the other worktree that currently owns a local branch.
 *
 * The exact full branch ref is intentional: matching only the short name could
 * confuse a remote-tracking ref with a local branch. The result is a UI hint;
 * the store still validates the target repository before switching.
 */
export function findLinkedWorktreeForBranch(
  repositoryPath: string,
  branch: Branch,
  worktrees: ReadonlyArray<WorktreeEntry>
): WorktreeEntry | undefined {
  if (branch.type !== BranchType.Local) {
    return undefined
  }

  const currentPath = normalizeWorktreePath(repositoryPath)

  return worktrees.find(
    worktree =>
      worktree.branch === branch.ref &&
      normalizeWorktreePath(worktree.path) !== currentPath
  )
}
