#!/usr/bin/env ts-node

import { spawnSync } from 'child_process'
import { writeFile } from 'fs/promises'

const ObjectIDPattern = /^[0-9a-f]{40}$/
const RepositoryPattern = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/
const VersionPattern = /^[0-9A-Za-z.+-]{1,128}$/
// Release list responses include every asset object. Cheap LFS buckets can
// legitimately contain 1,000 assets, so keep each page small while allowing a
// bounded response large enough for several full buckets.
const MaximumAPIBytes = 8 * 1024 * 1024
const MaximumGitBytes = 2 * 1024 * 1024
const NetworkTimeoutMilliseconds = 15_000
const GitTimeoutMilliseconds = 30_000
const MaximumCommitCount = 50
const MaximumSubjectCharacters = 180
const MaximumReleaseNotesCharacters = 24_000
const InstallerReleaseTagPattern = /^v[0-9A-Za-z.+-]{1,96}-b[0-9]{10}$/
const MaximumReleaseLookupPages = 20
const ReleaseLookupPageSize = 5

export interface IAutomatedReleaseCommit {
  readonly sha: string
  readonly subject: string
}

export interface IPreviousAutomatedRelease {
  readonly tagName: string
  readonly targetCommitish: string
}

export interface IAutomatedReleaseNotesInput {
  readonly repository: string
  readonly version: string
  readonly releaseSHA: string
  readonly previousRelease: IPreviousAutomatedRelease | null
  readonly previousReleaseSHA: string | null
  readonly commits: ReadonlyArray<IAutomatedReleaseCommit>
  readonly totalCommitCount: number
}

interface IArguments {
  readonly repository: string
  readonly version: string
  readonly releaseSHA: string
  readonly output: string
}

function objectID(value: string, label: string): string {
  const normalized = value.toLowerCase()
  if (!ObjectIDPattern.test(normalized)) {
    throw new Error(`${label} must be one exact 40-character Git object ID.`)
  }
  return normalized
}

function repositoryName(value: string): string {
  if (!RepositoryPattern.test(value)) {
    throw new Error('Repository must be one exact GitHub owner/name pair.')
  }
  return value
}

function releaseVersion(value: string): string {
  if (!VersionPattern.test(value)) {
    throw new Error('Release version contains unsupported characters.')
  }
  return value
}

function parseArguments(argv: ReadonlyArray<string>): IArguments {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (
      !['--repository', '--version', '--release-sha', '--output'].includes(
        flag
      ) ||
      value === undefined ||
      value.length === 0
    ) {
      throw new Error(
        'Usage: generate-automated-release-notes --repository owner/name --version version --release-sha sha --output path'
      )
    }
    if (values.has(flag)) {
      throw new Error(`Duplicate argument: ${flag}`)
    }
    values.set(flag, value)
  }
  if (values.size !== 4) {
    throw new Error('All release-note arguments are required.')
  }
  return {
    repository: repositoryName(values.get('--repository') ?? ''),
    version: releaseVersion(values.get('--version') ?? ''),
    releaseSHA: objectID(values.get('--release-sha') ?? '', 'Release SHA'),
    output: values.get('--output') ?? '',
  }
}

async function readBoundedJSON(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length')
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MaximumAPIBytes)
  ) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('GitHub returned oversized release metadata.')
  }
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new Error('GitHub returned empty release metadata.')
  }
  const chunks = new Array<Uint8Array>()
  let received = 0
  while (true) {
    const next = await reader.read()
    if (next.done) {
      break
    }
    received += next.value.byteLength
    if (received > MaximumAPIBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error('GitHub returned oversized release metadata.')
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('GitHub returned invalid release metadata.')
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null
}

export async function getLatestPublishedRelease(
  repository: string,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<IPreviousAutomatedRelease | null> {
  repositoryName(repository)
  if (token.length === 0) {
    throw new Error('GITHUB_TOKEN is required to inspect the previous release.')
  }
  for (let page = 1; page <= MaximumReleaseLookupPages; page++) {
    const response = await fetcher(
      `https://api.github.com/repos/${repository}/releases?per_page=${ReleaseLookupPageSize}&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'desktop-material-release-workflow',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(NetworkTimeoutMilliseconds),
      }
    )
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`GitHub release lookup failed with ${response.status}.`)
    }
    const input = await readBoundedJSON(response)
    if (!Array.isArray(input) || input.length > ReleaseLookupPageSize) {
      throw new Error('GitHub returned invalid previous-release metadata.')
    }
    for (const candidate of input) {
      const release = record(candidate)
      if (
        release === null ||
        release.draft === true ||
        release.prerelease === true ||
        typeof release.tag_name !== 'string' ||
        !InstallerReleaseTagPattern.test(release.tag_name) ||
        typeof release.target_commitish !== 'string' ||
        release.target_commitish.length < 1 ||
        release.target_commitish.length > 256 ||
        !Array.isArray(release.assets)
      ) {
        continue
      }
      const assetNames = new Set(
        release.assets
          .map(asset => record(asset)?.name)
          .filter((name): name is string => typeof name === 'string')
      )
      if (
        !assetNames.has('RELEASES') ||
        ![...assetNames].some(name => name.endsWith('-full.nupkg'))
      ) {
        continue
      }
      return {
        tagName: release.tag_name,
        targetCommitish: release.target_commitish,
      }
    }
    if (input.length < ReleaseLookupPageSize) {
      return null
    }
  }
  throw new Error(
    'GitHub returned too many releases to locate the previous installer safely.'
  )
}

function git(args: ReadonlyArray<string>, maximumBytes = MaximumGitBytes) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: maximumBytes,
    timeout: GitTimeoutMilliseconds,
    windowsHide: true,
  })
  if (result.error !== undefined) {
    throw result.error
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim().slice(0, 512)
    throw new Error(
      `git ${args[0]} failed${detail.length > 0 ? `: ${detail}` : '.'}`
    )
  }
  return result.stdout
}

function exactCommit(revision: string, label: string): string {
  const resolved = git(['rev-parse', '--verify', `${revision}^{commit}`], 1024)
    .trim()
    .toLowerCase()
  return objectID(resolved, label)
}

export function resolvePreviousReleaseSHA(
  release: IPreviousAutomatedRelease | null
): string | null {
  if (release === null) {
    return null
  }
  git(['check-ref-format', `refs/tags/${release.tagName}`], 1024)
  const resolved = exactCommit(
    `refs/tags/${release.tagName}`,
    'Previous release SHA'
  )
  if (
    ObjectIDPattern.test(release.targetCommitish.toLowerCase()) &&
    release.targetCommitish.toLowerCase() !== resolved
  ) {
    throw new Error(
      'The previous release tag does not match its exact target commit.'
    )
  }
  return resolved
}

function commitRange(previousSHA: string | null, releaseSHA: string): string {
  return previousSHA === null ? releaseSHA : `${previousSHA}..${releaseSHA}`
}

export function collectReleaseCommits(
  previousSHA: string | null,
  releaseSHA: string
): {
  readonly commits: ReadonlyArray<IAutomatedReleaseCommit>
  readonly totalCommitCount: number
} {
  const exactReleaseSHA = objectID(releaseSHA, 'Release SHA')
  const head = exactCommit('HEAD', 'Checked-out SHA')
  if (head !== exactReleaseSHA) {
    throw new Error(
      `Checked-out commit ${head} does not match release target ${exactReleaseSHA}.`
    )
  }
  if (previousSHA !== null) {
    const exactPreviousSHA = objectID(previousSHA, 'Previous release SHA')
    const ancestry = spawnSync(
      'git',
      ['merge-base', '--is-ancestor', exactPreviousSHA, exactReleaseSHA],
      {
        cwd: process.cwd(),
        timeout: GitTimeoutMilliseconds,
        windowsHide: true,
      }
    )
    if (ancestry.error !== undefined) {
      throw ancestry.error
    }
    if (ancestry.status !== 0) {
      throw new Error(
        'The previous release is not an ancestor of the exact release target.'
      )
    }
  }
  const range = commitRange(previousSHA, exactReleaseSHA)
  const countText = git(['rev-list', '--count', range], 1024).trim()
  if (!/^\d+$/.test(countText) || !Number.isSafeInteger(Number(countText))) {
    throw new Error('git returned an invalid release commit count.')
  }
  const output = git([
    'log',
    `--max-count=${MaximumCommitCount}`,
    '--format=%H%x00%s',
    range,
  ])
  const commits = output
    .split(/\r?\n/)
    .filter(line => line.length > 0)
    .map(line => {
      const separator = line.indexOf('\0')
      if (separator < 0) {
        throw new Error('git returned an invalid release commit record.')
      }
      return {
        sha: objectID(line.slice(0, separator), 'Commit SHA'),
        subject: line.slice(separator + 1),
      }
    })
  return { commits, totalCommitCount: Number(countText) }
}

function truncateCharacters(value: string, maximum: number): string {
  const characters = Array.from(value)
  return characters.length <= maximum
    ? value
    : `${characters.slice(0, maximum - 1).join('')}…`
}

/** Convert an untrusted Git subject into one bounded plain Markdown line. */
export function sanitizeCommitSubject(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const bounded = truncateCharacters(
    normalized.length > 0 ? normalized : '(no subject)',
    MaximumSubjectCharacters
  )
  return bounded
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@/g, '@\u200b')
    .replace(/([\\`*_{}\[\]()#+.!|\-])/g, '\\$1')
}

function releaseTag(value: string): string {
  return sanitizeCommitSubject(value)
}

export function buildAutomatedReleaseNotes(
  input: IAutomatedReleaseNotesInput
): string {
  const repository = repositoryName(input.repository)
  const releaseSHA = objectID(input.releaseSHA, 'Release SHA')
  const version = releaseVersion(input.version)
  const previousSHA =
    input.previousReleaseSHA === null
      ? null
      : objectID(input.previousReleaseSHA, 'Previous release SHA')
  if ((input.previousRelease === null) !== (previousSHA === null)) {
    throw new Error(
      'Previous release metadata and SHA must be provided together.'
    )
  }
  if (
    !Number.isSafeInteger(input.totalCommitCount) ||
    input.totalCommitCount < input.commits.length
  ) {
    throw new Error('Release commit count is invalid.')
  }

  const shortReleaseSHA = releaseSHA.slice(0, 12)
  const previousLabel =
    input.previousRelease === null
      ? 'the start of repository history'
      : `release ${releaseTag(input.previousRelease.tagName)}`
  const rangeLabel =
    previousSHA === null ? releaseSHA : `${previousSHA}..${releaseSHA}`
  const prefix = [
    `Automated Desktop Material Windows build from exact commit [\`${shortReleaseSHA}\`](https://github.com/${repository}/commit/${releaseSHA}).`,
    '',
    `Version \`${version}\`. Unsigned installer built by \`.github/workflows/build-installers.yml\`.`,
    '',
    '## Commits in this release',
    '',
    `Changes after ${previousLabel}, bounded to the exact range \`${rangeLabel}\`:`,
    '',
  ]
  const suffix = [
    '',
    'This release doubles as the auto-update feed. Its `RELEASES` manifest and `*-full.nupkg` are consumed from `releases/latest/download/`.',
  ]
  const commitLines = input.commits.map(commit => {
    const sha = objectID(commit.sha, 'Commit SHA')
    return `- [\`${sha.slice(
      0,
      12
    )}\`](https://github.com/${repository}/commit/${sha}) ${sanitizeCommitSubject(
      commit.subject
    )}`
  })
  if (commitLines.length === 0) {
    commitLines.push('- No commits were added after the previous release.')
  }

  let includedCount = input.commits.length
  const lines = [...prefix, ...commitLines]
  const withOmission = () => {
    const omitted = input.totalCommitCount - includedCount
    return omitted > 0
      ? [
          ...lines,
          `- ${omitted} older commit${
            omitted === 1 ? '' : 's'
          } omitted by the release-note safety limits.`,
        ]
      : lines
  }
  let body = [...withOmission(), ...suffix].join('\n')
  while (
    body.length + 1 > MaximumReleaseNotesCharacters &&
    includedCount > 0 &&
    lines.length > prefix.length
  ) {
    lines.pop()
    includedCount--
    body = [...withOmission(), ...suffix].join('\n')
  }
  if (body.length + 1 > MaximumReleaseNotesCharacters) {
    throw new Error('Generated release notes exceed the safety limit.')
  }
  return `${body}\n`
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArguments(argv)
  const checkedOutSHA = exactCommit('HEAD', 'Checked-out SHA')
  if (checkedOutSHA !== args.releaseSHA) {
    throw new Error(
      `Checked-out commit ${checkedOutSHA} does not match release target ${args.releaseSHA}.`
    )
  }
  const previousRelease = await getLatestPublishedRelease(
    args.repository,
    process.env.GITHUB_TOKEN ?? ''
  )
  const previousReleaseSHA = resolvePreviousReleaseSHA(previousRelease)
  const { commits, totalCommitCount } = collectReleaseCommits(
    previousReleaseSHA,
    args.releaseSHA
  )
  const notes = buildAutomatedReleaseNotes({
    repository: args.repository,
    version: args.version,
    releaseSHA: args.releaseSHA,
    previousRelease,
    previousReleaseSHA,
    commits,
    totalCommitCount,
  })
  await writeFile(args.output, notes, { encoding: 'utf8', flag: 'wx' })
  process.stdout.write(
    `Generated ${commits.length} bounded commit entries for ${args.releaseSHA}.\n`
  )
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${(error as Error).message}\n`)
    process.exitCode = 1
  })
}
