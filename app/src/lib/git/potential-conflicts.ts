import { git } from './core'
import { Repository } from '../../models/repository'
import { Branch, IAheadBehind } from '../../models/branch'
import { getMergeBase } from './merge'
import { revRangeInclusive } from './rev-list'

/**
 * The result of a local potential-conflict scan between the current branch
 * and its upstream tracking branch.
 */
export interface IPotentialConflict {
  /** The files changed on both sides of the divergence. */
  readonly overlappingFiles: ReadonlyArray<string>
}

/**
 * List the files touched between `mergeBase` and `ref`, using
 * `git diff --name-only` so renames/copies don't matter for this purpose -
 * we only care about which paths were touched on each side.
 */
async function getFilesChangedSince(
  repository: Repository,
  mergeBase: string,
  ref: string
): Promise<ReadonlySet<string>> {
  const { stdout } = await git(
    ['diff', '--name-only', '-z', revRangeInclusive(mergeBase, ref)],
    repository.path,
    'getFilesChangedSince'
  )

  return new Set(stdout.split('\0').filter(s => s.length > 0))
}

/**
 * Look for a potential conflict between the local, unpushed commits on
 * `branch` and the commits that exist on its upstream tracking branch but
 * haven't been merged locally yet.
 *
 * This is a best-effort, purely local heuristic: it only considers commits
 * and files that are already known to the local repository (i.e., whatever
 * the most recent fetch of the upstream branch brought down), so it cannot
 * tell whether someone else's *uncommitted* work overlaps with ours. It's
 * meant to catch the common case where both sides have committed changes to
 * the same file(s) since they diverged, which is likely (but not certain) to
 * produce a merge conflict.
 *
 * Returns `null` when there's no upstream, the branches haven't diverged
 * (i.e. one of `ahead`/`behind` is zero), or no files overlap.
 */
export async function findPotentialConflict(
  repository: Repository,
  branch: Branch,
  aheadBehind: IAheadBehind | null
): Promise<IPotentialConflict | null> {
  const upstream = branch.upstream
  if (upstream === null) {
    return null
  }

  if (
    aheadBehind === null ||
    aheadBehind.ahead === 0 ||
    aheadBehind.behind === 0
  ) {
    // Nothing to push, nothing to worry about, or we're fully up to date.
    return null
  }

  const mergeBase = await getMergeBase(repository, branch.name, upstream)
  if (mergeBase === null) {
    return null
  }

  const [oursChanged, theirsChanged] = await Promise.all([
    getFilesChangedSince(repository, mergeBase, branch.name),
    getFilesChangedSince(repository, mergeBase, upstream),
  ])

  const overlappingFiles = [...oursChanged].filter(f => theirsChanged.has(f))

  if (overlappingFiles.length === 0) {
    return null
  }

  return { overlappingFiles }
}
