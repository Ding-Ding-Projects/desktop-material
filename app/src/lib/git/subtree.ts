import { ChildProcess } from 'child_process'
import { git, IGitStringExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { getCommits } from './log'
import { envForRemoteOperation } from './environment'
import { AuthenticationErrors } from './authentication'
import {
  executionOptionsWithProgress,
  FetchProgressParser,
  PushProgressParser,
} from '../progress'

/**
 * A subtree discovered from the `git-subtree-dir` trailers that
 * `git subtree add`/`pull` record in the repository history.
 */
export interface IManagedSubtree {
  /** The prefix (path within the working tree) the subtree lives at. */
  readonly prefix: string
  /**
   * The upstream commit that was last merged into the subtree, from the
   * `git-subtree-split` trailer, or null when the recording commit lacks one.
   */
  readonly lastMergedSplitSha: string | null
  /**
   * The most recent local commit recording subtree metadata for this prefix,
   * or null when no such commit was found.
   */
  readonly lastMergeSha: string | null
}

/** Options shared by the network-backed subtree operations. */
export interface ISubtreeRemoteOptions {
  /** Stable signed-in account identity for the credential trampoline. */
  readonly accountKey?: string
  /** Bounded progress text and fractional operation progress. */
  readonly progressCallback?: (line: string, percent: number) => void
}

/** Options for `subtree add` and `subtree pull`. */
export interface ISubtreeMergeOptions extends ISubtreeRemoteOptions {
  /** Import the upstream history as a single squashed commit. */
  readonly squash?: boolean
}

/** Options for `subtree split`. */
export interface ISubtreeSplitOptions {
  /** When provided the split result is recorded as this new branch (`-b`). */
  readonly branch?: string
  /**
   * Bounded progress text plus fractional progress, mirroring the pull/push
   * options. `git subtree split` walks the whole prefix history and reports
   * its own `processed/total (created)` counter on stderr.
   */
  readonly progressCallback?: (line: string, percent: number) => void
}

/** One reading parsed out of `git subtree split`'s own stderr counter. */
export interface ISubtreeSplitProgress {
  /** Revisions walked so far. */
  readonly processed: number
  /** Total revisions the walk will visit. */
  readonly total: number
  /** Synthetic commits created so far. */
  readonly created: number
}

/**
 * Parse one line of `git subtree split` progress.
 *
 * git-subtree writes `<processed>/<total> (<created>)` records separated by
 * carriage returns, optionally followed by an elapsed-time suffix. Anything
 * else — including a zero or missing total, which would make a percentage
 * meaningless — returns null.
 */
export function parseSubtreeSplitProgress(
  line: string
): ISubtreeSplitProgress | null {
  const match = /(\d+)\/(\d+)\s*\((\d+)\)/.exec(line)
  if (match === null) {
    return null
  }

  const processed = Number(match[1])
  const total = Number(match[2])
  const created = Number(match[3])
  if (!Number.isSafeInteger(total) || total <= 0) {
    return null
  }
  if (!Number.isSafeInteger(processed) || !Number.isSafeInteger(created)) {
    return null
  }

  return { processed: Math.min(processed, total), total, created }
}

/**
 * Validate a subtree prefix, returning a user-facing error message or null.
 *
 * The prefix must be a non-empty forward-slash relative path with no leading
 * or trailing slash and no `.`/`..` segments so that it can be passed to
 * `git subtree --prefix` without escaping the working tree.
 */
export function getSubtreePrefixError(prefix: string): string | null {
  if (prefix.trim().length === 0) {
    return 'The subtree prefix may not be empty.'
  }

  if (prefix.includes('\\')) {
    return 'The subtree prefix must use forward slashes as path separators.'
  }

  if (/^[a-zA-Z]:/.test(prefix)) {
    return 'The subtree prefix must be a relative path inside the repository.'
  }

  if (prefix.startsWith('/') || prefix.endsWith('/')) {
    return 'The subtree prefix must be a relative path without leading or trailing slashes.'
  }

  const segments = prefix.split('/')
  if (segments.some(s => s.length === 0 || s === '.' || s === '..')) {
    return 'The subtree prefix may not contain empty, "." or ".." path segments.'
  }

  return null
}

function validateSubtreePrefix(prefix: string): void {
  const error = getSubtreePrefixError(prefix)
  if (error !== null) {
    throw new Error(error)
  }
}

/**
 * Extract the subtrees recorded in the given commits from their
 * `git-subtree-dir` (and `git-subtree-split`) trailers.
 *
 * Commits are expected in newest-first order, as returned by `getCommits`;
 * duplicate prefixes are deduplicated keeping the newest commit's data.
 * Results are sorted by prefix for a stable UI ordering.
 */
export function parseSubtreePrefixes(
  commits: ReadonlyArray<Commit>
): ReadonlyArray<IManagedSubtree> {
  const byPrefix = new Map<string, IManagedSubtree>()

  for (const commit of commits) {
    let prefix: string | null = null
    let splitSha: string | null = null

    for (const trailer of commit.trailers) {
      const token = trailer.token.toLowerCase()
      if (token === 'git-subtree-dir') {
        prefix = trailer.value.replace(/\/+$/, '')
      } else if (token === 'git-subtree-split') {
        splitSha = trailer.value
      }
    }

    if (prefix === null || prefix.length === 0 || byPrefix.has(prefix)) {
      continue
    }

    byPrefix.set(prefix, {
      prefix,
      lastMergedSplitSha: splitSha,
      lastMergeSha: commit.sha,
    })
  }

  return [...byPrefix.values()].sort((a, b) => a.prefix.localeCompare(b.prefix))
}

/**
 * Discover the subtrees recorded in the repository history by searching the
 * most recent commits for `git-subtree-dir` trailers.
 *
 * @param limit - The maximum number of matching commits to inspect.
 */
export async function discoverSubtrees(
  repository: Repository,
  limit = 400,
  signal?: AbortSignal
): Promise<ReadonlyArray<IManagedSubtree>> {
  const commits = await getCommits(
    repository,
    undefined,
    limit,
    undefined,
    ['--grep=git-subtree-dir:'],
    signal
  )

  return parseSubtreePrefixes(commits)
}

type SubtreeRemoteCommand = 'add' | 'pull' | 'push'

const subtreeCompletionMessages: Record<SubtreeRemoteCommand, string> = {
  add: 'Subtree added.',
  pull: 'Subtree updated.',
  push: 'Subtree pushed.',
}

async function execSubtreeRemoteCommand(
  command: SubtreeRemoteCommand,
  repository: Repository,
  prefix: string,
  source: string,
  ref: string,
  squash: boolean,
  options: ISubtreeRemoteOptions | undefined,
  name: string
): Promise<void> {
  validateSubtreePrefix(prefix)

  const args = ['subtree', command, '--prefix', prefix, source, ref]

  if (squash) {
    args.push('--squash')
  }

  let opts: IGitStringExecutionOptions = {
    env: await envForRemoteOperation(source),
    credentialAccountKey: options?.accountKey,
    expectedErrors: AuthenticationErrors,
  }

  if (options?.progressCallback !== undefined) {
    const progressCallback = options.progressCallback
    // git-subtree doesn't accept --progress so we can't force the inner
    // fetch/push to emit throughput updates; the parser still surfaces
    // subtree's own status output and the remote's stderr as context lines.
    const parser =
      command === 'push' ? new PushProgressParser() : new FetchProgressParser()

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      parser,
      progress => {
        const text =
          progress.kind === 'progress' ? progress.details.text : progress.text
        progressCallback(text, progress.percent)
      }
    )
    progressCallback(`Running git subtree ${command}…`, 0)
  }

  await git(args, repository.path, name, opts)
  options?.progressCallback?.(subtreeCompletionMessages[command], 1)
}

/**
 * Add a subtree at the given prefix from the given source repository and ref
 * via `git subtree add`.
 */
export async function addSubtree(
  repository: Repository,
  prefix: string,
  source: string,
  ref: string,
  options?: ISubtreeMergeOptions
): Promise<void> {
  await execSubtreeRemoteCommand(
    'add',
    repository,
    prefix,
    source,
    ref,
    options?.squash === true,
    options,
    'addSubtree'
  )
}

/**
 * Merge the latest upstream changes for the subtree at the given prefix via
 * `git subtree pull`.
 */
export async function pullSubtree(
  repository: Repository,
  prefix: string,
  source: string,
  ref: string,
  options?: ISubtreeMergeOptions
): Promise<void> {
  await execSubtreeRemoteCommand(
    'pull',
    repository,
    prefix,
    source,
    ref,
    options?.squash === true,
    options,
    'pullSubtree'
  )
}

/**
 * Split out the subtree at the given prefix and push it to the given source
 * repository and ref via `git subtree push`.
 */
export async function pushSubtree(
  repository: Repository,
  prefix: string,
  source: string,
  ref: string,
  options?: ISubtreeRemoteOptions
): Promise<void> {
  await execSubtreeRemoteCommand(
    'push',
    repository,
    prefix,
    source,
    ref,
    false,
    options,
    'pushSubtree'
  )
}

/**
 * Split the history of the subtree at the given prefix into synthetic
 * standalone commits via `git subtree split`.
 *
 * @returns The SHA of the split head.
 */
export async function splitSubtree(
  repository: Repository,
  prefix: string,
  options?: ISubtreeSplitOptions
): Promise<string> {
  validateSubtreePrefix(prefix)

  const args = ['subtree', 'split', '--prefix', prefix]

  if (options?.branch !== undefined) {
    args.push('-b', options.branch)
  }

  let opts: IGitStringExecutionOptions = {}
  const progressCallback = options?.progressCallback
  if (progressCallback !== undefined) {
    // git-subtree has no --progress switch; it always writes its own
    // `processed/total (created)` counter to stderr, separated by carriage
    // returns rather than newlines.
    opts = {
      processCallback: (process: ChildProcess) => {
        const stderr = process.stderr
        if (stderr === null) {
          return
        }
        let pending = ''
        stderr.setEncoding('utf8')
        stderr.on('data', (chunk: string) => {
          const parts = `${pending}${chunk}`.split(/\r\n|\r|\n/)
          pending = parts.pop() ?? ''
          if (pending.length > 4096) {
            pending = ''
          }
          for (const part of parts) {
            const reading = parseSubtreeSplitProgress(part)
            if (reading !== null) {
              progressCallback(part.trim(), reading.processed / reading.total)
            }
          }
        })
      },
    }
    progressCallback('Running git subtree split…', 0)
  }

  const { stdout } = await git(args, repository.path, 'splitSubtree', opts)
  progressCallback?.('Subtree split.', 1)
  return stdout.trim()
}

let subtreeAvailability: Promise<boolean> | null = null

/**
 * Whether the bundled Git supports the contrib `git subtree` command. The
 * probe result is memoized for the lifetime of the process.
 */
export function isSubtreeAvailable(): Promise<boolean> {
  if (subtreeAvailability === null) {
    subtreeAvailability = probeSubtreeAvailability()
  }
  return subtreeAvailability
}

async function probeSubtreeAvailability(): Promise<boolean> {
  try {
    // `git subtree -h` prints usage and exits 129 when available and fails
    // with "'subtree' is not a git command" and exit code 1 when it isn't.
    // The probe works outside of a repository so any cwd will do.
    const result = await git(
      ['subtree', '-h'],
      process.cwd(),
      'isSubtreeAvailable',
      { successExitCodes: new Set([0, 1, 129]) }
    )

    return /^usage: git subtree/m.test(result.stdout + result.stderr)
  } catch (error) {
    log.warn('Failed probing for git subtree support', error)
    return false
  }
}
