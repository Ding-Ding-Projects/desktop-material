import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Get the set of canonical branch refs (e.g. `refs/heads/feature`)
 * checked out in linked worktrees.
 *
 * Excludes the main worktree — that's already handled by the HEAD check.
 */
export async function getWorktreeCheckedOutBranches(
  repository: Repository
): Promise<ReadonlySet<string>> {
  const result = await git(
    ['worktree', 'list', '--porcelain'],
    repository.path,
    'getWorktreeCheckedOutBranches'
  )

  const branches = new Set<string>()

  // Porcelain output: blocks separated by blank lines.
  // First block is always the main worktree — skip it.
  const blocks = result.stdout.split('\n\n').slice(1)

  for (const block of blocks) {
    for (const line of block.split('\n')) {
      if (line.startsWith('branch ')) {
        branches.add(line.substring('branch '.length))
      }
    }
  }

  return branches
}
