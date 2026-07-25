import { readFile } from 'fs/promises'
import { join } from 'path'
import { git } from './core'
import { Repository } from '../../models/repository'
import { largeRepositoryGitArgsForPath } from '../large-repository/large-repository-mode'

/**
 * Does a `.gitattributes` document declare an active `filter=lfs` rule? Pure so
 * the scan is unit-testable. Comment lines (`#`) are ignored and the token must
 * stand alone so `-filter` (unset) or an unrelated value does not match.
 */
export function gitAttributesTextDeclaresLfsFilter(text: string): boolean {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .some(line => /(?:^|\s)filter=lfs(?=\s|$)/.test(line))
}

/** Install the global LFS filters. */
export async function installGlobalLFSFilters(force: boolean): Promise<void> {
  const args = ['lfs', 'install', '--skip-repo']
  if (force) {
    args.push('--force')
  }

  await git(args, __dirname, 'installGlobalLFSFilter')
}

/** Install LFS hooks in the repository. */
export async function installLFSHooks(
  repository: Repository,
  force: boolean
): Promise<void> {
  const args = [
    ...largeRepositoryGitArgsForPath(repository.path),
    'lfs',
    'install',
  ]
  if (force) {
    args.push('--force')
  }

  await git(args, repository.path, 'installLFSHooks')
}

/**
 * Probe whether any tracked `.gitattributes` file declares an active
 * `filter=lfs` rule. Injectable so {@link isUsingLFS}'s cache can be exercised
 * without spawning Git.
 */
export type LFSFilterAttributeProbe = (
  repository: Repository
) => Promise<boolean>

/**
 * The real probe.
 *
 * `git lfs track --json` walks the ENTIRE working tree to re-derive the
 * attribute stack — 17-35s on a 211k-file repository. An `filter=lfs` rule can
 * only live in a `.gitattributes` file, so this answers the same yes/no
 * question in ~150ms via two bounded steps:
 *
 *  1. Read the working-tree root `.gitattributes` directly. `git lfs track`
 *     writes there before the file is ever staged, so a tracked-only grep would
 *     miss a freshly-configured repository.
 *  2. `git grep` the tracked `.gitattributes` files (root and nested) for
 *     committed or nested rules. The default (working-tree) grep deliberately
 *     avoids `--untracked`, which would force git to enumerate every file.
 */
async function probeLFSFilterAttribute(
  repository: Repository
): Promise<boolean> {
  try {
    const rootAttributes = await readFile(
      join(repository.path, '.gitattributes'),
      'utf8'
    )
    if (gitAttributesTextDeclaresLfsFilter(rootAttributes)) {
      return true
    }
  } catch {
    // No root .gitattributes (or unreadable): fall through to the tracked grep.
  }
  const result = await git(
    [
      ...largeRepositoryGitArgsForPath(repository.path),
      'grep',
      '-I',
      '-l',
      '-e',
      'filter=lfs',
      '--',
      '.gitattributes',
      '*/.gitattributes',
    ],
    repository.path,
    'isUsingLFS',
    // 0: a match exists, 1: no match, 128: no tracked files / unborn branch.
    { successExitCodes: new Set([0, 1, 128]) }
  )
  return result.exitCode === 0
}

/**
 * Per-repository memo of the cheap LFS-usage probe. `isUsingLFS` runs only at
 * repository-add time, so a plain path-keyed cache keeps a re-add (or a repeated
 * detection pass) from paying the probe again.
 */
const lfsUsageByRepositoryPath = new Map<string, boolean>()

/** Drop cached LFS-usage answers. Intended for tests and repository removal. */
export function clearIsUsingLFSCache(repositoryPath?: string): void {
  if (repositoryPath === undefined) {
    lfsUsageByRepositoryPath.clear()
  } else {
    lfsUsageByRepositoryPath.delete(repositoryPath)
  }
}

/** Is the repository configured to track any paths with LFS? */
export async function isUsingLFS(
  repository: Repository,
  probe: LFSFilterAttributeProbe = probeLFSFilterAttribute
): Promise<boolean> {
  const cached = lfsUsageByRepositoryPath.get(repository.path)
  if (cached !== undefined) {
    return cached
  }
  const usingLFS = await probe(repository)
  lfsUsageByRepositoryPath.set(repository.path, usingLFS)
  return usingLFS
}

/**
 * Check if a provided file path is being tracked by Git LFS
 *
 * This uses the Git plumbing to read the .gitattributes file
 * for any LFS-related rules that are set for the file
 *
 * @param repository repository with
 * @param path relative file path in the repository
 */
export async function isTrackedByLFS(
  repository: Repository,
  path: string
): Promise<boolean> {
  const { stdout } = await git(
    [
      ...largeRepositoryGitArgsForPath(repository.path),
      'check-attr',
      'filter',
      path,
    ],
    repository.path,
    'checkAttrForLFS'
  )

  // "git check-attr -a" will output every filter it can find in .gitattributes
  // and it looks like this:
  //
  // README.md: diff: lfs
  // README.md: merge: lfs
  // README.md: text: unset
  // README.md: filter: lfs
  //
  // To verify git-lfs this test will just focus on that last row, "filter",
  // and the value associated with it. If nothing is found in .gitattributes
  // the output will look like this
  //
  // README.md: filter: unspecified

  const lfsFilterRegex = /: filter: lfs/

  const match = lfsFilterRegex.exec(stdout)

  return match !== null
}

/**
 * Query a Git repository and filter the set of provided relative paths to see
 * which are not covered by the current Git LFS configuration.
 *
 * @param repository
 * @param filePaths List of relative paths in the repository
 */
export async function filesNotTrackedByLFS(
  repository: Repository,
  filePaths: ReadonlyArray<string>
): Promise<ReadonlyArray<string>> {
  const filesNotTrackedByGitLFS = new Array<string>()

  for (const file of filePaths) {
    const isTracked = await isTrackedByLFS(repository, file)

    if (!isTracked) {
      filesNotTrackedByGitLFS.push(file)
    }
  }

  return filesNotTrackedByGitLFS
}
