import { IAgentSessionDiffStat } from '../../models/agent-session'
import { git } from '../git/core'

/**
 * A fleet poll is a best-effort background read, but its answer must never be
 * unbounded. Exceeding this ceiling rejects the poll through the Git wrapper
 * instead of retaining an arbitrarily large status listing in the renderer.
 */
const MaximumAgentSessionStatusOutputBytes = 4 * 1024 * 1024

function incrementSafely(current: number, next: number): number {
  const total = current + next
  if (!Number.isSafeInteger(total)) {
    throw new Error('The agent session Git diff stat exceeds a safe integer.')
  }
  return total
}

/** Count the path records emitted by `git status --porcelain=v1 -z`. */
function countStatusPaths(stdout: string): number {
  if (stdout.length === 0) {
    return 0
  }
  if (!stdout.endsWith('\0')) {
    throw new Error('Git returned an incomplete agent session status listing.')
  }

  const records = stdout.split('\0')
  let filesChanged = 0

  for (let index = 0; index < records.length - 1; index++) {
    const record = records[index]
    if (record.length < 4 || record[2] !== ' ') {
      throw new Error('Git returned a malformed agent session status record.')
    }

    const indexStatus = record[0]
    const worktreeStatus = record[1]
    filesChanged = incrementSafely(filesChanged, 1)

    // In -z mode a rename or copy is `<XY> <new> NUL <old> NUL`. Consume the
    // origin record explicitly: an unusual old name may itself begin with text
    // that looks exactly like another porcelain record.
    if (
      indexStatus === 'R' ||
      indexStatus === 'C' ||
      worktreeStatus === 'R' ||
      worktreeStatus === 'C'
    ) {
      index++
      if (index >= records.length - 1 || records[index].length === 0) {
        throw new Error(
          'Git returned an incomplete agent session rename record.'
        )
      }
    }
  }

  return filesChanged
}

function parseCount(token: string): number {
  if (!/^\d+$/.test(token)) {
    throw new Error('Git returned a malformed agent session numstat count.')
  }
  const count = Number.parseInt(token, 10)
  if (!Number.isSafeInteger(count)) {
    throw new Error('The agent session Git numstat exceeds a safe integer.')
  }
  return count
}

/** Sum the line columns emitted by `git diff --numstat -z`. */
function sumNumstat(
  stdout: string
): Pick<IAgentSessionDiffStat, 'linesAdded' | 'linesDeleted'> {
  if (stdout.length === 0) {
    return { linesAdded: 0, linesDeleted: 0 }
  }
  if (!stdout.endsWith('\0')) {
    throw new Error('Git returned an incomplete agent session numstat listing.')
  }

  const records = stdout.split('\0')
  let linesAdded = 0
  let linesDeleted = 0

  for (let index = 0; index < records.length - 1; index++) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(records[index])
    if (match === null || (match[1] === '-') !== (match[2] === '-')) {
      throw new Error('Git returned a malformed agent session numstat record.')
    }

    // Git represents binary files as `-\t-`; the status listing still counts
    // the path, while a binary body truthfully contributes no line total.
    if (match[1] !== '-') {
      linesAdded = incrementSafely(linesAdded, parseCount(match[1]))
      linesDeleted = incrementSafely(linesDeleted, parseCount(match[2]))
    }

    if (match[3].length === 0) {
      // With -z, rename/copy paths follow the numeric record as two separate
      // NUL-delimited fields. Skip both so a path beginning `12<TAB>3<TAB>`
      // can never be parsed as a second numstat entry.
      if (
        index + 2 >= records.length - 1 ||
        records[index + 1].length === 0 ||
        records[index + 2].length === 0
      ) {
        throw new Error(
          'Git returned an incomplete agent session numstat rename record.'
        )
      }
      index += 2
    }
  }

  return { linesAdded, linesDeleted }
}

/**
 * Read the current worktree change summary used by an Agents fleet card.
 *
 * The status pass is the source of the unique file count, including untracked
 * files. The HEAD diff is the source of line totals across staged and unstaged
 * tracked content. Untracked files have no Git baseline, so they contribute to
 * `filesChanged` but do not fabricate an added-line count by reading arbitrary
 * working-tree bodies outside Git.
 *
 * Both commands disable optional locks and run as background tasks so polling
 * cannot prompt for credentials or contend with a foreground mutation. Any
 * Git, output-limit, or parser failure rejects the read; callers retain their
 * last known measurement rather than receiving a made-up clean state.
 */
export async function readAgentSessionGitStatus(
  worktreePath: string
): Promise<IAgentSessionDiffStat> {
  const options = {
    isBackgroundTask: true,
    maxBuffer: MaximumAgentSessionStatusOutputBytes,
  } as const

  const [status, diff] = await Promise.all([
    git(
      [
        '--no-optional-locks',
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--renames',
        '--ignore-submodules=none',
      ],
      worktreePath,
      'readAgentSessionGitStatusPaths',
      options
    ),
    git(
      [
        '--no-optional-locks',
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--numstat',
        '-z',
        '--find-renames',
        '--ignore-submodules=none',
        'HEAD',
        '--',
      ],
      worktreePath,
      'readAgentSessionGitStatusDiff',
      options
    ),
  ])

  return {
    filesChanged: countStatusPaths(status.stdout),
    ...sumNumstat(diff.stdout),
  }
}
