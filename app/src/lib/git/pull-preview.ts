import { Repository } from '../../models/repository'
import { CommitOneLine } from '../../models/commit'
import {
  AppFileStatus,
  AppFileStatusKind,
  FileChange,
} from '../../models/status'
import { git, isMaxBufferExceededError } from './core'
import { createForEachRefParser, createLogParser } from './git-delimiter-parser'

export const DefaultPullPreviewCommitLimit = 25
export const MaximumPullPreviewCommitLimit = 100
export const DefaultPullPreviewChangedFileLimit = 100
export const MaximumPullPreviewChangedFileLimit = 1000

/**
 * Hard ceiling for the changed-file detail emitted by Git. The preview still
 * reports the exact total from a separate constant-size shortstat result.
 */
export const MaximumPullPreviewChangedFileOutputBytes = 4 * 1024 * 1024

const MinimumPullPreviewChangedFileOutputBytes = 64 * 1024
const PullPreviewChangedFileBytesPerEntry = 16 * 1024
const PullPreviewShortStatOutputBytes = 64 * 1024

export type PullPreviewUnavailableReason =
  | 'detached-head'
  | 'no-upstream'
  | 'invalid-state'

export interface IPullPreviewUnavailable {
  readonly kind: 'unavailable'
  readonly reason: PullPreviewUnavailableReason
}

export interface IPullPreview {
  readonly kind: 'ready'

  /** The full local branch ref captured for this preview. */
  readonly currentBranchRef: string

  /** The exact commit object at currentBranchRef when the preview was built. */
  readonly currentBranchOid: string

  /** The full configured upstream ref captured for this preview. */
  readonly upstreamRef: string

  /** The exact commit object at upstreamRef when the preview was built. */
  readonly upstreamOid: string

  /** The common ancestor used as the base for incoming changed files. */
  readonly mergeBaseOid: string

  /** Commits reachable only from the current branch. */
  readonly ahead: number

  /** Commits reachable only from the upstream branch. */
  readonly behind: number

  /** Newest-first upstream-only commits, limited by maxIncomingCommits. */
  readonly incomingCommits: ReadonlyArray<CommitOneLine>

  /** Whether additional upstream-only commits were omitted from the summary. */
  readonly incomingCommitsTruncated: boolean

  /**
   * Files changed by the incoming side, comparing mergeBaseOid to upstreamOid.
   * This deliberately excludes changes which exist only on the local branch.
   */
  readonly changedFiles: ReadonlyArray<FileChange>

  /** Total files changed by the incoming side before applying the list limit. */
  readonly changedFileCount: number

  /** Whether additional changed files were omitted from changedFiles. */
  readonly changedFilesTruncated: boolean
}

export type PullPreviewResult = IPullPreview | IPullPreviewUnavailable

export interface IPullPreviewOptions {
  /**
   * Maximum number of incoming commits to summarize. Values are constrained
   * to the inclusive range 0..MaximumPullPreviewCommitLimit.
   */
  readonly maxIncomingCommits?: number

  /**
   * Maximum number of changed files to return. Values are constrained to the
   * inclusive range 0..MaximumPullPreviewChangedFileLimit.
   */
  readonly maxChangedFiles?: number
}

export type PullPreviewIdentity = Pick<
  IPullPreview,
  'currentBranchRef' | 'currentBranchOid' | 'upstreamRef' | 'upstreamOid'
>

const unavailable = (
  reason: PullPreviewUnavailableReason
): IPullPreviewUnavailable => ({ kind: 'unavailable', reason })

const isFullRef = (value: string) => value.startsWith('refs/')
const isObjectId = (value: string) =>
  /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(value)

function normalizeLimit(
  value: number | undefined,
  defaultValue: number,
  maximumValue: number
): number {
  if (value === undefined || Number.isNaN(value)) {
    return defaultValue
  }

  if (value === Number.POSITIVE_INFINITY) {
    return maximumValue
  }

  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(maximumValue, Math.max(0, Math.floor(value)))
}

function statusForNameStatus(
  rawStatus: string,
  oldPath?: string
): AppFileStatus {
  const code = rawStatus[0]

  switch (code) {
    case 'A':
      return { kind: AppFileStatusKind.New }
    case 'D':
      return { kind: AppFileStatusKind.Deleted }
    case 'M':
    case 'T':
      return { kind: AppFileStatusKind.Modified }
    case 'R':
      if (oldPath === undefined) {
        throw new Error(
          'A renamed pull-preview path did not include its source'
        )
      }
      return {
        kind: AppFileStatusKind.Renamed,
        oldPath,
        renameIncludesModifications: rawStatus !== 'R100',
      }
    case 'C':
      if (oldPath === undefined) {
        throw new Error('A copied pull-preview path did not include its source')
      }
      return {
        kind: AppFileStatusKind.Copied,
        oldPath,
        renameIncludesModifications: false,
      }
    default:
      throw new Error(`Unsupported pull-preview path status: ${rawStatus}`)
  }
}

function parseChangedFiles(
  stdout: Buffer,
  limit: number,
  allowIncompleteRecord = false
): ReadonlyArray<FileChange> {
  const fields = stdout.toString('utf8').split('\0')
  const completeFieldCount = fields.length - 1
  const files = new Array<FileChange>()

  // A complete -z name-status stream ends in a NUL. A maxBuffer cutoff can
  // leave one partial record at the end, which is deliberately ignored.
  for (let i = 0; i < completeFieldCount && files.length < limit; ) {
    const rawStatus = fields[i++]
    const code = rawStatus[0]

    if (code === 'R' || code === 'C') {
      if (i + 1 >= completeFieldCount) {
        if (allowIncompleteRecord) {
          break
        }
        throw new Error('Incomplete renamed or copied pull-preview path')
      }
      const oldPath = fields[i++]
      const path = fields[i++]

      files.push(new FileChange(path, statusForNameStatus(rawStatus, oldPath)))
    } else {
      if (i >= completeFieldCount) {
        if (allowIncompleteRecord) {
          break
        }
        throw new Error('Incomplete pull-preview path')
      }
      const path = fields[i++]

      files.push(new FileChange(path, statusForNameStatus(rawStatus)))
    }
  }

  return files
}

function parseChangedFileCount(stdout: string): number {
  if (stdout.trim().length === 0) {
    return 0
  }

  const match = /^\s*(\d+) files? changed(?:,|\s*$)/.exec(stdout)
  if (match === null) {
    throw new Error('Unable to parse pull-preview changed-file count')
  }

  const count = Number.parseInt(match[1], 10)
  if (!Number.isSafeInteger(count)) {
    throw new Error('Pull-preview changed-file count is not safe')
  }

  return count
}

function changedFileOutputLimit(entryLimit: number): number {
  return Math.min(
    MaximumPullPreviewChangedFileOutputBytes,
    Math.max(
      MinimumPullPreviewChangedFileOutputBytes,
      entryLimit * PullPreviewChangedFileBytesPerEntry
    )
  )
}

const changedFileDiffArgs = (
  mergeBaseOid: string,
  upstreamOid: string
): ReadonlyArray<string> => [
  '-C',
  '-M',
  '--no-ext-diff',
  '--no-textconv',
  mergeBaseOid,
  upstreamOid,
  '--',
]

async function getChangedFileCount(
  repository: Repository,
  mergeBaseOid: string,
  upstreamOid: string
): Promise<number> {
  const result = await git(
    ['diff', '--shortstat', ...changedFileDiffArgs(mergeBaseOid, upstreamOid)],
    repository.path,
    'getPullPreviewChangedFileCount',
    {
      env: { LC_ALL: 'C', LANG: 'C' },
      maxBuffer: PullPreviewShortStatOutputBytes,
    }
  )

  return parseChangedFileCount(result.stdout)
}

async function getChangedFiles(
  repository: Repository,
  mergeBaseOid: string,
  upstreamOid: string,
  limit: number
): Promise<ReadonlyArray<FileChange>> {
  if (limit === 0) {
    return []
  }

  let stdout: Buffer
  let incomplete = false
  try {
    const result = await git(
      [
        'diff',
        '--name-status',
        '-z',
        ...changedFileDiffArgs(mergeBaseOid, upstreamOid),
      ],
      repository.path,
      'getPullPreviewChangedFiles',
      {
        encoding: 'buffer',
        maxBuffer: changedFileOutputLimit(limit),
      }
    )
    stdout = result.stdout
  } catch (error) {
    if (!isMaxBufferExceededError(error)) {
      throw error
    }

    stdout = Buffer.isBuffer(error.stdout)
      ? error.stdout
      : Buffer.from(error.stdout)
    incomplete = true
  }

  return parseChangedFiles(stdout, limit, incomplete)
}

async function getIncomingCommits(
  repository: Repository,
  currentBranchOid: string,
  upstreamOid: string,
  limit: number
): Promise<ReadonlyArray<CommitOneLine>> {
  const { formatArgs, parse } = createLogParser({
    sha: '%H',
    summary: '%s',
  })
  const { stdout } = await git(
    [
      'log',
      `${currentBranchOid}..${upstreamOid}`,
      `--max-count=${limit}`,
      ...formatArgs,
      '--no-show-signature',
      '--no-color',
      '--',
    ],
    repository.path,
    'getPullPreviewIncomingCommits'
  )

  return parse(stdout).map(commit => ({
    sha: commit.sha,
    summary: commit.summary,
  }))
}

type PullPreviewIdentityResult =
  | ({ readonly kind: 'ready' } & PullPreviewIdentity)
  | IPullPreviewUnavailable

async function getCurrentPullPreviewIdentity(
  repository: Repository
): Promise<PullPreviewIdentityResult> {
  const headResult = await git(
    ['symbolic-ref', '--quiet', 'HEAD'],
    repository.path,
    'getPullPreviewCurrentBranch',
    { successExitCodes: new Set([0, 1, 128]) }
  )

  if (headResult.exitCode === 1) {
    return unavailable('detached-head')
  }

  const currentBranchRef = headResult.stdout.trim()
  if (
    headResult.exitCode !== 0 ||
    !currentBranchRef.startsWith('refs/heads/')
  ) {
    return unavailable('invalid-state')
  }

  const { formatArgs, parse } = createForEachRefParser({
    ref: '%(refname)',
    oid: '%(objectname)',
    objectType: '%(objecttype)',
    upstreamRef: '%(upstream)',
  })
  const branchResult = await git(
    ['for-each-ref', ...formatArgs, currentBranchRef],
    repository.path,
    'getPullPreviewBranch',
    { successExitCodes: new Set([0, 128]) }
  )
  const branches = branchResult.exitCode === 0 ? parse(branchResult.stdout) : []

  if (
    branches.length !== 1 ||
    branches[0].ref !== currentBranchRef ||
    branches[0].objectType !== 'commit' ||
    !isObjectId(branches[0].oid)
  ) {
    return unavailable('invalid-state')
  }

  const currentBranchOid = branches[0].oid
  const upstreamRef = branches[0].upstreamRef
  if (upstreamRef.length === 0) {
    return unavailable('no-upstream')
  }
  if (!isFullRef(upstreamRef)) {
    return unavailable('invalid-state')
  }

  // Re-read both refs in one ref-filter invocation. Besides resolving the
  // upstream OID, this rejects a branch/upstream change between discovery and
  // capture instead of returning a mixed identity.
  const identityResult = await git(
    ['for-each-ref', ...formatArgs, currentBranchRef, upstreamRef],
    repository.path,
    'getPullPreviewIdentity',
    { successExitCodes: new Set([0, 128]) }
  )
  const refs = identityResult.exitCode === 0 ? parse(identityResult.stdout) : []
  const currentBranch = refs.find(ref => ref.ref === currentBranchRef)
  const upstream = refs.find(ref => ref.ref === upstreamRef)

  if (
    currentBranch === undefined ||
    upstream === undefined ||
    currentBranch.oid !== currentBranchOid ||
    currentBranch.upstreamRef !== upstreamRef ||
    currentBranch.objectType !== 'commit' ||
    upstream.objectType !== 'commit' ||
    !isObjectId(upstream.oid)
  ) {
    return unavailable('invalid-state')
  }

  return {
    kind: 'ready',
    currentBranchRef,
    currentBranchOid,
    upstreamRef,
    upstreamOid: upstream.oid,
  }
}

/** Compare the immutable ref/OID context of two pull previews. */
export function pullPreviewIdentityEquals(
  left: PullPreviewIdentity,
  right: PullPreviewIdentity
): boolean {
  return (
    left.currentBranchRef === right.currentBranchRef &&
    left.currentBranchOid === right.currentBranchOid &&
    left.upstreamRef === right.upstreamRef &&
    left.upstreamOid === right.upstreamOid
  )
}

/**
 * Re-read only the current branch/upstream identity and reject a stale preview.
 * This intentionally avoids rebuilding commit and changed-file summaries.
 */
export async function isPullPreviewIdentityCurrent(
  repository: Repository,
  expected: PullPreviewIdentity
): Promise<boolean> {
  try {
    const actual = await getCurrentPullPreviewIdentity(repository)
    return (
      actual.kind === 'ready' && pullPreviewIdentityEquals(actual, expected)
    )
  } catch {
    return false
  }
}

/**
 * Build a read-only preview of pulling the current branch's configured
 * upstream. Callers should fetch first so the upstream tracking ref reflects
 * the remote state they intend to review.
 *
 * All history inspection after ref discovery uses captured object IDs. The
 * command sequence never updates refs, the index, or the working tree.
 */
export async function getPullPreview(
  repository: Repository,
  options: IPullPreviewOptions = {}
): Promise<PullPreviewResult> {
  try {
    const identity = await getCurrentPullPreviewIdentity(repository)
    if (identity.kind === 'unavailable') {
      return identity
    }
    const { currentBranchRef, currentBranchOid, upstreamRef, upstreamOid } =
      identity

    const mergeBaseResult = await git(
      ['merge-base', currentBranchOid, upstreamOid],
      repository.path,
      'getPullPreviewMergeBase',
      { successExitCodes: new Set([0, 1, 128]) }
    )
    const mergeBaseOid = mergeBaseResult.stdout.trim()
    if (mergeBaseResult.exitCode !== 0 || !isObjectId(mergeBaseOid)) {
      return unavailable('invalid-state')
    }

    const aheadBehindResult = await git(
      [
        'rev-list',
        '--left-right',
        '--count',
        `${currentBranchOid}...${upstreamOid}`,
        '--',
      ],
      repository.path,
      'getPullPreviewAheadBehind'
    )
    const match = /^(\d+)\s+(\d+)\s*$/.exec(aheadBehindResult.stdout)
    if (match === null) {
      return unavailable('invalid-state')
    }

    const ahead = Number.parseInt(match[1], 10)
    const behind = Number.parseInt(match[2], 10)
    if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
      return unavailable('invalid-state')
    }

    const commitLimit = normalizeLimit(
      options.maxIncomingCommits,
      DefaultPullPreviewCommitLimit,
      MaximumPullPreviewCommitLimit
    )
    const changedFileLimit = normalizeLimit(
      options.maxChangedFiles,
      DefaultPullPreviewChangedFileLimit,
      MaximumPullPreviewChangedFileLimit
    )
    const [incomingCommits, changedFileCount, changedFiles] = await Promise.all(
      [
        getIncomingCommits(
          repository,
          currentBranchOid,
          upstreamOid,
          commitLimit
        ),
        getChangedFileCount(repository, mergeBaseOid, upstreamOid),
        getChangedFiles(
          repository,
          mergeBaseOid,
          upstreamOid,
          changedFileLimit
        ),
      ]
    )

    return {
      kind: 'ready',
      currentBranchRef,
      currentBranchOid,
      upstreamRef,
      upstreamOid,
      mergeBaseOid,
      ahead,
      behind,
      incomingCommits,
      incomingCommitsTruncated: incomingCommits.length < behind,
      changedFiles,
      changedFileCount,
      changedFilesTruncated: changedFileCount > changedFiles.length,
    }
  } catch (error) {
    log.error('Unable to build a pull preview', error)
    return unavailable('invalid-state')
  }
}
